-- ROJ // SWARM PROTOCOL — schemat multiplayer (wklej w Supabase SQL Editor)
-- Zobacz README.md, sekcja "Multiplayer / Supabase setup", po pełną instrukcję.

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

-- Realtime: klienci muszą dostawać insert/update/delete dla `bodies` na żywo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bodies'
  ) then
    alter publication supabase_realtime add table bodies;
  end if;
end $$;

-- Atomowe "ugryzienie" ciała. Zwraca zdrowie po ataku i czy ten wywołujący
-- zadał ostateczny cios (killed = true => tylko on liczy sobie punkty).
-- Gdy zdrowie spada do zera, wiersz jest od razu usuwany (DELETE), co
-- wszystkim klientom uruchamia wspólną animację wybuchu przez Realtime.
create or replace function bite_body(p_body_id uuid, p_amount float)
returns table(id uuid, health float, killed boolean)
language plpgsql
security invoker
as $$
declare
  v_health float;
begin
  update bodies set health = greatest(0, bodies.health - p_amount), updated_at = now()
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

-- Jednorazowa flaga: pierwszy klient, który to wywoła po starcie pustego
-- świata, dostaje `true` i to on zasiewa startowy komplet ciał.
create or replace function claim_world_init()
returns boolean
language sql
security invoker
as $$
  update world_meta set initialized = true where id = 1 and initialized = false
  returning true;
$$;
