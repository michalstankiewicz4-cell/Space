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

-- No general "update" policy on purpose: the only column that ever needs to
-- change post-insert is `health`, and that must go through the atomic,
-- clamped `bite_body` RPC below (SECURITY DEFINER) — never a direct client
-- UPDATE. A permissive `for update using (true)` policy here would let any
-- anon-authenticated client set any body's health straight to 0 via
-- `supabase.from('bodies').update(...)`, then claim the kill (and its full
-- point value) with a single trivial hit through bite_body — a free-points
-- exploit that bypasses the whole point of making bite_body atomic.
drop policy if exists "bodies updatable by authed" on bodies;

drop policy if exists "bodies deletable by authed" on bodies;
create policy "bodies deletable by authed" on bodies for delete to authenticated using (true);

drop policy if exists "world_meta readable by anyone" on world_meta;
create policy "world_meta readable by anyone" on world_meta for select using (true);

-- No update policy here either — `claim_world_init` below is SECURITY
-- DEFINER, so it doesn't need one, and a permissive policy would let any
-- client flip `initialized` back to false directly.
drop policy if exists "world_meta writable by authed" on world_meta;

-- Sensible bounds on `bodies` row values. RLS guards WHO can write (anyone
-- with an anonymous session), but not WHAT they write — without these CHECK
-- constraints, anyone who knows the anon key (public by design) could insert
-- e.g. radius=1e9 or a negative health and break rendering for every player.
-- Ranges chosen with headroom above what the game itself generates (js/world/*).
--
-- radius is checked PER KIND (not one shared 0-6 range) because a single
-- wide bound let someone insert a "meteoroid" (legitimately 0.32-0.68) with
-- radius up near 6 — the game itself never generates that combination, but
-- nothing stopped a direct insert from claiming it, and radius feeds
-- straight into the points formula (radius*14 + ...), so an oversized fake
-- "meteoroid" was worth ~15x a real one for one bite. Ranges below have
-- generous headroom above js/bodies/*.js's actual radiusMin/radiusMax per
-- kind — if those ranges change meaningfully, revisit this too.
alter table bodies drop constraint if exists bodies_radius_check;
alter table bodies add constraint bodies_radius_check check (
  radius > 0 and (
    (kind = 'meteoroid' and radius <= 1.2) or
    (kind = 'comet' and radius <= 1.2) or
    (kind = 'planet' and radius <= 4.5) or
    (kind = 'sun' and radius <= 6) or
    (kind = 'blackhole' and radius <= 3)
  )
);

alter table bodies drop constraint if exists bodies_temp_check;
alter table bodies add constraint bodies_temp_check check (temp >= -1 and temp <= 1);

alter table bodies drop constraint if exists bodies_health_check;
alter table bodies add constraint bodies_health_check check (health is null or (health >= 0 and health <= 200));

alter table bodies drop constraint if exists bodies_max_health_check;
alter table bodies add constraint bodies_max_health_check check (max_health is null or (max_health > 0 and max_health <= 200));

-- Same per-kind reasoning as radius above: only suns (40) and comets (25)
-- legitimately carry a value_bonus at all (see js/bodies/*.js) — a shared
-- 0-100 range let a disguised "meteoroid"/"planet" insert claim a large
-- bonus on top of an already-inflated radius.
alter table bodies drop constraint if exists bodies_value_bonus_check;
alter table bodies add constraint bodies_value_bonus_check check (
  value_bonus >= 0 and (
    (kind = 'sun' and value_bonus <= 60) or
    (kind = 'comet' and value_bonus <= 40) or
    (kind in ('planet', 'meteoroid', 'blackhole') and value_bonus <= 10)
  )
);

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

-- Per-actor call counter for bite_body, in a fixed 1-second window. Not
-- readable/writable by clients at all (RLS enabled, zero policies) — only
-- touched from inside the SECURITY DEFINER function below, which bypasses
-- RLS as the function owner. A real player's client only ever sends one
-- bite_body call per damaged body per ~150ms (NET_DAMAGE_FLUSH_MS), so even
-- a maxed-out swarm biting several bodies at once stays well under the
-- limit below — this exists to stop a script calling the RPC directly in a
-- tight loop, which could otherwise one-shot every body the instant it
-- spawns, far faster than any real client, and starve the shared world.
create table if not exists bite_rate_limit (
  actor uuid primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
alter table bite_rate_limit enable row level security;

-- Passive network-behavior audit trail — observation only, nothing here
-- ever blocks or bans a player. Same "RLS enabled, zero policies" pattern
-- as bite_rate_limit above: unreachable directly by any client, only
-- written from inside SECURITY DEFINER functions/triggers, so it can't be
-- read, spoofed or cleared by a modified client either. There's no UI for
-- it in the game — review it via the Supabase SQL Editor or the
-- Management API (see the gitignored `pass` file / CLAUDE.md), e.g.:
--   select actor, event_type, count(*), max(created_at)
--   from activity_log group by actor, event_type order by 3 desc;
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  actor uuid not null,
  event_type text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table activity_log enable row level security;

-- Bounded-size sliding-window counter, one row per (actor, action) —
-- reused by both burst-detection triggers below instead of duplicating
-- the same upsert-with-window-reset logic bite_rate_limit already has
-- inline. Stays small regardless of how much activity happens: rows are
-- overwritten in place, not appended.
create table if not exists activity_rate (
  actor uuid not null,
  action text not null,
  window_start timestamptz not null default now(),
  count int not null default 0,
  primary key (actor, action)
);
alter table activity_rate enable row level security;

create or replace function bump_activity_rate(p_actor uuid, p_action text, p_window interval)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into activity_rate (actor, action, window_start, count)
  values (p_actor, p_action, now(), 1)
  on conflict (actor, action) do update
    set count = case when activity_rate.window_start <= now() - p_window
                      then 1 else activity_rate.count + 1 end,
        window_start = case when activity_rate.window_start <= now() - p_window
                             then now() else activity_rate.window_start end
    returning count into v_count;
  return v_count;
end;
$$;

-- Direct INSERT/DELETE on `bodies` stay permissive by design (see the
-- Security model notes in CLAUDE.md) — these triggers don't change that,
-- they only *notice* when one actor does it far more than legitimate play
-- ever would and write a record, nothing more. Threshold picked with
-- headroom above the one legitimate burst that exists: the steward's
-- one-time initial world seed (up to MAX_PLANETS=14 inserts in quick
-- succession) — 15 is deliberately still very tight above that, since
-- catching a scripted flood matters more here than avoiding an occasional
-- log entry from a legitimate steward (this is passive observation, not
-- an enforcement action, so a false positive costs nothing).
create or replace function log_body_insert_if_bursty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null then
    return new;
  end if;
  v_count := bump_activity_rate(v_actor, 'body_insert', interval '10 seconds');
  if v_count > 15 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'body_insert_burst', jsonb_build_object(
      'count_in_window', v_count, 'kind', new.kind, 'radius', new.radius, 'value_bonus', new.value_bonus
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_body_insert on bodies;
create trigger trg_log_body_insert after insert on bodies
  for each row execute function log_body_insert_if_bursty();

-- Same idea for DELETE. Legitimate deletes are rarer still than inserts
-- (only a body actually dying, or a comet self-despawning locally), so
-- this threshold has even more headroom above normal play in practice.
create or replace function log_body_delete_if_bursty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null then
    return old;
  end if;
  v_count := bump_activity_rate(v_actor, 'body_delete', interval '10 seconds');
  if v_count > 15 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'body_delete_burst', jsonb_build_object('count_in_window', v_count, 'kind', old.kind, 'id', old.id));
  end if;
  return old;
end;
$$;

drop trigger if exists trg_log_body_delete on bodies;
create trigger trg_log_body_delete after delete on bodies
  for each row execute function log_body_delete_if_bursty();

-- Atomic "bite" of a body. Returns its health after the hit and whether
-- this caller landed the final blow (killed = true => only they get points).
-- When health drops to zero, the row is deleted immediately (DELETE), which
-- triggers the shared explosion animation for every client via Realtime.
-- `p_amount` is clamped to a sensible max per call — a client sends one
-- roughly every ~150ms (see NET_DAMAGE_FLUSH_MS), so even a heavily upgraded
-- player (max upgrades + a full swarm) stays nowhere near this limit, but
-- someone calling the RPC directly with a huge value can't one-shot anything.
-- SECURITY DEFINER + a locked search_path: this is the ONLY way `health`
-- ever changes (there's no client-writable update policy on `bodies` at
-- all, see above), so it runs with the owner's privileges rather than the
-- caller's, and pins search_path so a caller can't hijack name resolution
-- by creating same-named objects in a schema earlier on their own path.
create or replace function bite_body(p_body_id uuid, p_amount float)
returns table(id uuid, health float, killed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health float;
  v_amount float := least(greatest(p_amount, 0), 300);
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null then
    return;
  end if;

  insert into bite_rate_limit (actor, window_start, count)
  values (v_actor, now(), 1)
  on conflict (actor) do update
    set count = case when bite_rate_limit.window_start <= now() - interval '1 second'
                      then 1 else bite_rate_limit.count + 1 end,
        window_start = case when bite_rate_limit.window_start <= now() - interval '1 second'
                             then now() else bite_rate_limit.window_start end
    returning count into v_count;

  if v_count is not null and v_count > 20 then
    -- A real client physically cannot get here (see NET_DAMAGE_FLUSH_MS),
    -- so this is already an unambiguous signal on its own — logged for
    -- later review, see activity_log below.
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'bite_rate_exceeded', jsonb_build_object('count_in_window', v_count, 'body_id', p_body_id));
    return; -- rate limited: silently drop this bite, no error, no effect
  end if;

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
-- SECURITY DEFINER for the same reason as bite_body: there's no
-- client-writable update policy on `world_meta`, so this is the only path
-- that can ever flip `initialized`.
create or replace function claim_world_init()
returns boolean
language sql
security definer
set search_path = public
as $$
  update world_meta set initialized = true where id = 1 and initialized = false
  returning true;
$$;

-- Read access to activity_log for admin.html (see that file) — the table
-- itself stays completely unreachable directly (RLS, zero policies, same
-- as everywhere else in this file); this is the one deliberate, narrow
-- door into it, gated by a secret whose SHA-256 hash (not the plaintext)
-- is the only copy of it that exists in this schema/repo. The secret
-- itself is never committed anywhere — it's generated once, told to
-- whoever needs it out of band, and only entered at runtime into
-- admin.html's own input field (which doesn't persist it anywhere but
-- that browser's localStorage). Rotating it just means re-running this
-- CREATE OR REPLACE with a new hash.
-- Brute-force throttle reuses the same sliding-window counter as
-- everything else here (bump_activity_rate) — 5 guesses per 60s per
-- (anonymous) caller; a caller has to have a valid anon session to call
-- this at all, so guesses are always attributable to *some* actor id.
create or replace function admin_activity_log(p_secret text, p_limit int default 200)
returns table(id bigint, actor uuid, event_type text, detail jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_attempts int;
begin
  if v_actor is null then
    return;
  end if;

  v_attempts := bump_activity_rate(v_actor, 'admin_secret_attempt', interval '60 seconds');
  if v_attempts > 5 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'admin_secret_bruteforce', jsonb_build_object('attempts_in_window', v_attempts));
    return;
  end if;

  -- pgcrypto's digest() lives in the `extensions` schema on Supabase (not
  -- `public`), unlike every other function here — fully-qualified since
  -- this function's search_path is pinned to `public` only.
  if encode(extensions.digest(p_secret, 'sha256'), 'hex') <> '5463cb80c213e5cb45a233c4e429e503abd7d0d48c18a29afb56145c4c72e1ee' then
    return;
  end if;

  return query
    select l.id, l.actor, l.event_type, l.detail, l.created_at
    from activity_log l
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;
