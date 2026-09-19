-- ROJ // SWARM PROTOCOL — multiplayer schema (paste into the Supabase SQL Editor)
-- See README.md, section "Multiplayer / Supabase setup", for the full instructions.

create extension if not exists pgcrypto;

create table if not exists bodies (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('planet','sun','comet','meteoroid','blackhole')),
  radius float not null,
  temp float not null default 0,
  health float,
  max_health float,
  value_bonus float not null default 0,
  pos_x float not null, pos_y float not null, pos_z float not null,
  vel_x float, vel_y float, vel_z float,
  spawned_at timestamptz not null default now(),
  max_life float,
  updated_at timestamptz not null default now()
);
alter table bodies replica identity full;

create table if not exists world_meta (
  id int primary key default 1,
  initialized boolean not null default false,
  check (id = 1)
);
insert into world_meta (id, initialized) values (1, false)
  on conflict (id) do nothing;

alter table bodies enable row level security;
alter table world_meta enable row level security;

drop policy if exists "bodies readable by anyone" on bodies;
create policy "bodies readable by anyone" on bodies for select using (true);

drop policy if exists "bodies writable by authed" on bodies;
create policy "bodies writable by authed" on bodies for insert to authenticated with check (true);

drop policy if exists "bodies updatable by authed" on bodies;
create policy "bodies updatable by authed" on bodies for update to authenticated using (true) with check (true);

drop policy if exists "bodies deletable by authed" on bodies;
create policy "bodies deletable by authed" on bodies for delete to authenticated using (true);

drop policy if exists "world_meta readable by anyone" on world_meta;
create policy "world_meta readable by anyone" on world_meta for select using (true);

drop policy if exists "world_meta writable by authed" on world_meta;
create policy "world_meta writable by authed" on world_meta for update to authenticated using (true);

-- Sensible bounds on `bodies` row values. RLS guards WHO can write (anyone
-- with an anonymous session), but not WHAT they write — without these CHECK
-- constraints, anyone who knows the anon key (public by design) could insert
-- e.g. radius=1e9 or a negative health and break rendering for every player.
-- Ranges chosen with headroom above what the game itself generates (js/world/*).
alter table bodies drop constraint if exists bodies_radius_check;
alter table bodies add constraint bodies_radius_check check (radius > 0 and radius <= 6);

alter table bodies drop constraint if exists bodies_temp_check;
alter table bodies add constraint bodies_temp_check check (temp >= -1 and temp <= 1);

alter table bodies drop constraint if exists bodies_health_check;
alter table bodies add constraint bodies_health_check check (health is null or (health >= 0 and health <= 200));

alter table bodies drop constraint if exists bodies_max_health_check;
alter table bodies add constraint bodies_max_health_check check (max_health is null or (max_health > 0 and max_health <= 200));

alter table bodies drop constraint if exists bodies_value_bonus_check;
alter table bodies add constraint bodies_value_bonus_check check (value_bonus >= 0 and value_bonus <= 100);

alter table bodies drop constraint if exists bodies_pos_check;
alter table bodies add constraint bodies_pos_check check (
  abs(pos_x) <= 100 and abs(pos_y) <= 100 and abs(pos_z) <= 100
);

alter table bodies drop constraint if exists bodies_vel_check;
alter table bodies add constraint bodies_vel_check check (
  (vel_x is null or abs(vel_x) <= 20) and
  (vel_y is null or abs(vel_y) <= 20) and
  (vel_z is null or abs(vel_z) <= 20)
);

alter table bodies drop constraint if exists bodies_max_life_check;
alter table bodies add constraint bodies_max_life_check check (max_life is null or (max_life > 0 and max_life <= 120));

-- Hard cap on the number of bodies at once — without this, anyone could keep
-- inserting (even valid, within the CHECK constraints above) rows forever
-- and flood the shared world with thousands of objects, freezing rendering
-- for everyone.
create or replace function enforce_bodies_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from bodies) >= 40 then
    raise exception 'World body limit reached (40)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bodies_cap on bodies;
create trigger trg_bodies_cap before insert on bodies
  for each row execute function enforce_bodies_cap();

-- Realtime: clients need to receive insert/update/delete for `bodies` live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bodies'
  ) then
    alter publication supabase_realtime add table bodies;
  end if;
end $$;

-- Atomic "bite" of a body. Returns its health after the hit and whether
-- this caller landed the final blow (killed = true => only they get points).
-- When health drops to zero, the row is deleted immediately (DELETE), which
-- triggers the shared explosion animation for every client via Realtime.
-- `p_amount` is clamped to a sensible max per call — a client sends one
-- roughly every ~150ms (see NET_DAMAGE_FLUSH_MS), so even a heavily upgraded
-- player (max upgrades + a full swarm) stays nowhere near this limit, but
-- someone calling the RPC directly with a huge value can't one-shot anything.
create or replace function bite_body(p_body_id uuid, p_amount float)
returns table(id uuid, health float, killed boolean)
language plpgsql
security invoker
as $$
declare
  v_health float;
  v_amount float := least(greatest(p_amount, 0), 300);
begin
  update bodies set health = greatest(0, bodies.health - v_amount), updated_at = now()
    where bodies.id = p_body_id and bodies.health is not null
    returning bodies.health into v_health;

  if v_health is null then
    return;
  end if;

  if v_health <= 0 then
    delete from bodies where bodies.id = p_body_id;
    return query select p_body_id, 0::float, true;
  else
    return query select p_body_id, v_health, false;
  end if;
end;
$$;

-- One-shot flag: the first client to call this after the world starts empty
-- gets `true` back, and that's the one that seeds the initial set of bodies.
create or replace function claim_world_init()
returns boolean
language sql
security invoker
as $$
  update world_meta set initialized = true where id = 1 and initialized = false
  returning true;
$$;
