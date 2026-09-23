-- Swarm Protocol — multiplayer schema (paste into the Supabase SQL Editor)
-- See README.md, section "Multiplayer / Supabase setup", for the full instructions.

create extension if not exists pgcrypto;

-- As of the fixed 9-orbit solar system (see js/world/solarSystem.js),
-- `bodies` holds ONLY comets — the sun + 8 planet-ish orbit slots + the
-- black hole are each one permanent, hand-designed body now, tracked
-- instead in `solar_bodies` below (never inserted/deleted after a one-time
-- seed, only ever UPDATEd). Comets keep the exact same shape/lifecycle
-- they always had: randomly rolled, spawned/despawned from a small pool.
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
  updated_at timestamptz not null default now()
);
alter table bodies replica identity full;
-- Retrofits an existing live table (a fresh project's create-table above
-- already omits the column) — max_life was the black hole's old expiry
-- timer; the black hole is now permanent, and comets never used this
-- column at all (they self-despawn via a field-radius exit check, not a
-- timer — see js/world/bodies.js#updateBodies).
alter table bodies drop column if exists max_life;

-- The fixed 9-orbit solar system: the sun (slot 0) + 8 planet-ish orbit
-- slots (1,2,3,5,6,7,8 — slot 4 is the player-station ring, not a body at
-- all) + the black hole (slot 9). Shape (kind/radius/temp/color) lives in
-- js/world/solarSystem.js, never in this table — only the truly mutable
-- server state (health) does. Seeded exactly once (see the INSERT below);
-- after that, only ever UPDATEd via bite_solar_body(), never
-- inserted/deleted again.
create table if not exists solar_bodies (
  orbit_slot int primary key,
  kind text not null check (kind in ('sun','planet','meteoroid','blackhole')),
  health float,
  max_health float,
  updated_at timestamptz not null default now()
);
alter table solar_bodies replica identity full;

-- Seeded exactly once, directly here (not via a runtime claim RPC the way
-- the old scattered pool used to be — there's no race to arbitrate, the
-- slots and their shape are fixed at deploy time). health/max_health =
-- radius*kind's healthMult from js/world/solarSystem.js/js/bodies/*.js —
-- see that file for where each number comes from. `on conflict do nothing`
-- keeps this idempotent/safe to re-run, same as every other seed in this
-- file, but on a LIVE project with the old scattered-pool `bodies` rows
-- still in it, running this alone does not remove them — see
-- supabase/migrate_to_solar_system.sql for that one-time, non-idempotent
-- cutover step.
insert into solar_bodies (orbit_slot, kind, health, max_health) values
  (0, 'sun',       126,  126),  -- radius 4.2 * healthMult 30 (sun.js)
  (1, 'planet',    35.2, 35.2), -- radius 1.6 * healthMult 22 (volcanicPlanet.js)
  (2, 'planet',    50.6, 50.6), -- radius 2.3 * 22
  (3, 'planet',    41.8, 41.8), -- radius 1.9 * 22 (neutralPlanet.js)
  (5, 'planet',    57.2, 57.2), -- radius 2.6 * 22
  (6, 'planet',    37.4, 37.4), -- radius 1.7 * 22 (icePlanet.js)
  (7, 'planet',    52.8, 52.8), -- radius 2.4 * 22
  (8, 'meteoroid', 16.5, 16.5), -- radius 1.1 * healthMult 15 (meteoroid.js)
  (9, 'blackhole', null, null)  -- kill-on-contact, not bitten — see solar_bodies_health_check
on conflict (orbit_slot) do nothing;

create table if not exists world_meta (
  id int primary key default 1,
  initialized boolean not null default false,
  check (id = 1)
);
insert into world_meta (id, initialized) values (1, false)
  on conflict (id) do nothing;

alter table bodies enable row level security;
alter table world_meta enable row level security;
alter table solar_bodies enable row level security;

drop policy if exists "solar_bodies readable by anyone" on solar_bodies;
create policy "solar_bodies readable by anyone" on solar_bodies for select using (true);
-- Deliberately NO insert/update/delete policy at all — Postgres RLS
-- default-denies any command with no matching policy. The set of rows
-- never changes after the one-time seed below, and the only legitimate
-- mutation (health) only ever happens through bite_solar_body()
-- (SECURITY DEFINER), so unlike `bodies` there's no legitimate direct-
-- client write case left to reason about at all.

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
-- `bodies` is comet-only now (see the table's own header comment) — one
-- more, additional constraint restricting `kind` itself, layered on top of
-- the original inline check above rather than replacing it (that one has
-- no separate name to ALTER/DROP by, but a *more* restrictive constraint
-- can just coexist with a looser one — the row has to satisfy both).
alter table bodies drop constraint if exists bodies_kind_comet_check;
alter table bodies add constraint bodies_kind_comet_check check (kind = 'comet');

-- Ranges below match CONTENT.comet (js/bodies/comet.js) with headroom —
-- no more per-kind branching needed now that every row is a comet.
alter table bodies drop constraint if exists bodies_radius_check;
alter table bodies add constraint bodies_radius_check check (radius > 0 and radius <= 1.2);

alter table bodies drop constraint if exists bodies_temp_check;
alter table bodies add constraint bodies_temp_check check (temp >= -1 and temp <= 1);

alter table bodies drop constraint if exists bodies_health_check;
alter table bodies add constraint bodies_health_check check (
  health is not null and health >= 0 and health <= 20
);

alter table bodies drop constraint if exists bodies_max_health_check;
alter table bodies add constraint bodies_max_health_check check (
  max_health is not null and max_health > 0 and max_health <= 20
);

alter table bodies drop constraint if exists bodies_value_bonus_check;
alter table bodies add constraint bodies_value_bonus_check check (
  value_bonus >= 0 and value_bonus <= 40
);

-- Fixed solar bodies (sun + 8 orbit slots + black hole) — per-kind
-- existence, same shape as `bodies`' own old health check used to be:
-- the black hole isn't bitten (it kills on contact instead, see
-- js/world/blackholes.js), so it legitimately has no health at all; every
-- other kind must have one, clamped to max_health.
alter table solar_bodies drop constraint if exists solar_bodies_health_check;
alter table solar_bodies add constraint solar_bodies_health_check check (
  case when kind = 'blackhole' then health is null
       else health is not null and health >= 0 and health <= max_health
  end
);

alter table solar_bodies drop constraint if exists solar_bodies_max_health_check;
alter table solar_bodies add constraint solar_bodies_max_health_check check (
  case when kind = 'blackhole' then max_health is null
       else max_health is not null and max_health > 0 and max_health <= 200
  end
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

-- max_life (the black hole's old expiry timer) no longer exists on this
-- table at all — see the column drop up near the table definition. The
-- black hole is now one of the permanent solar_bodies rows instead and
-- never expires.

-- Hard cap on the number of comets at once — without this, anyone could
-- keep inserting (even valid, within the CHECK constraints above) rows
-- forever and flood the shared world with objects. Lowered from the old
-- pool's 40 now that `bodies` only ever holds a handful of comets
-- (MAX_COMETS, js/config.js) — generous headroom above that, same spirit
-- as before, just against a much smaller legitimate ceiling.
create or replace function enforce_bodies_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from bodies) >= 10 then
    raise exception 'Comet limit reached (10)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bodies_cap on bodies;
create trigger trg_bodies_cap before insert on bodies
  for each row execute function enforce_bodies_cap();

-- Realtime for solar_bodies: only ever UPDATEd after the one-time seed
-- (see net/solarBodiesSync.js), but still needs its own publication entry
-- the same way `bodies` does below.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solar_bodies'
  ) then
    alter publication supabase_realtime add table solar_bodies;
  end if;
end $$;

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

-- Best-effort, SELF-REPORTED display name for admin.html to show next to
-- activity_log's actor UUIDs — nicknames otherwise never touch the
-- database at all (they only ever travel over ephemeral Realtime
-- Broadcast/Presence, see net/identity.js). This is NOT a verified
-- identity, unlike `actor` itself: a modified client could claim any
-- nick, including someone else's — treat it as a hint for the common/
-- honest case, never as proof of who did something. `actor` defaults to
-- auth.uid() so the client never has to know/send its own Supabase user
-- id.
-- RLS enabled, zero policies — same "unreachable directly" shape as
-- bite_rate_limit/activity_log/activity_rate. A real client calls
-- set_my_nick() (below) exactly once per connection; direct table access
-- would have let a script hammer .upsert() as fast as the network
-- allows with no throttle at all, which the RPC's own rate limit closes.
create table if not exists actor_nicks (
  actor uuid primary key default auth.uid(),
  nick text not null,
  updated_at timestamptz not null default now()
);
alter table actor_nicks enable row level security;

drop policy if exists "actor_nicks readable by anyone" on actor_nicks;
drop policy if exists "actor_nicks writable for own row" on actor_nicks;
drop policy if exists "actor_nicks updatable for own row" on actor_nicks;

-- Rate-limited the same way as everything else here (bump_activity_rate)
-- — a real client calls this once per connection, so even a generous
-- 5-per-30s cap has huge headroom while stopping a script that tries to
-- hammer it in a tight loop. Length-capped to match NET_MAX_NICK_LENGTH
-- (js/config.js) purely so this self-reported field can't be used to
-- stash an arbitrarily large string — deliberately NOT re-validating
-- character set/profanity here the way confirmNick() does client-side:
-- this field is already documented as unverified, and an admin reviewing
-- it is better served seeing exactly what was sent, not a filtered
-- version of it.
create or replace function set_my_nick(p_nick text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null then
    return;
  end if;

  v_count := bump_activity_rate(v_actor, 'set_nick', interval '30 seconds');
  if v_count > 5 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'set_nick_spam', jsonb_build_object('count_in_window', v_count) || request_meta());
    return;
  end if;

  insert into actor_nicks (actor, nick, updated_at)
  values (v_actor, left(coalesce(p_nick, ''), 20), now())
  on conflict (actor) do update set nick = excluded.nick, updated_at = excluded.updated_at;
end;
$$;

-- Best-effort request metadata (IP, browser, country) for whoever's
-- calling right now — pulled from the HTTP request PostgREST exposes to
-- every function/trigger invocation as a session GUC, nothing the client
-- sends explicitly and nothing it can suppress either (unlike the nick
-- above, this can't be spoofed from inside the request body/params —
-- only by actually originating the request from a different IP/UA,
-- which is a real if imperfect barrier, e.g. VPNs). Only meaningful when
-- called through the ordinary REST/RPC gateway by a real client — has
-- nothing to read (and fails closed to nulls) when this schema itself is
-- applied via the Management API's own SQL execution, which has no HTTP
-- request to expose.
create or replace function request_meta()
returns jsonb
language plpgsql
as $$
declare
  v_headers jsonb;
begin
  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_headers is null then
    return jsonb_build_object('ip', null, 'user_agent', null, 'country', null);
  end if;
  return jsonb_build_object(
    'ip', coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for'),
    'user_agent', v_headers->>'user-agent',
    'country', v_headers->>'cf-ipcountry'
  );
end;
$$;

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
-- Security model notes in CLAUDE.md) — legitimate play never comes close
-- to this threshold, so these BEFORE triggers reject (not just log) once
-- one actor's rate clearly leaves legitimate play behind, same spirit as
-- bite_body's own rate limit just below. `bodies` is comet-only now (see
-- its own header comment) — legitimate comet insert/delete traffic is a
-- low single-digit trickle (MAX_COMETS, js/config.js), nothing like the
-- old scattered-planet pool's occasional ~14-row bulk seed this threshold
-- used to sit above — tightened from 15 to 5 accordingly. BEFORE (not
-- AFTER) specifically so it can actually cancel the row via RAISE
-- EXCEPTION, not just observe it after the fact.
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
  if v_count > 5 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'body_insert_burst', jsonb_build_object(
      'count_in_window', v_count, 'kind', new.kind, 'radius', new.radius, 'value_bonus', new.value_bonus
    ) || request_meta());
    raise exception 'Too many body inserts too fast';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_body_insert on bodies;
create trigger trg_log_body_insert before insert on bodies
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
  if v_count > 5 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'body_delete_burst', jsonb_build_object('count_in_window', v_count, 'kind', old.kind, 'id', old.id) || request_meta());
    raise exception 'Too many body deletes too fast';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_log_body_delete on bodies;
create trigger trg_log_body_delete before delete on bodies
  for each row execute function log_body_delete_if_bursty();

-- Atomic "bite" of a body — comet-only now (see `bodies`' own header
-- comment; the 9 fixed solar bodies + sun go through bite_solar_body
-- below instead). Returns its health after the hit and whether this
-- caller landed the final blow (killed = true => only they get points).
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
    values (v_actor, 'bite_rate_exceeded', jsonb_build_object('count_in_window', v_count, 'body_id', p_body_id) || request_meta());
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

-- Same atomic-bite shape as bite_body above, for the 9 fixed solar bodies
-- (+ sun) instead of comets — the one real difference: health regenerates
-- over time instead of the row being deleted on death. Regen is DERIVED,
-- not ticked by a cron job: v_health_now recomputes what the health would
-- be right now from the last-committed (health, updated_at) checkpoint +
-- elapsed time, the exact same "pure function of last known state +
-- elapsed time" shape js/world/bodies.js's client-side health checkpoint
-- uses — v_regen_rate below must match js/config.js#SOLAR_REGEN_RATE, or
-- the client's own local recompute (used for the health bar between syncs)
-- would visibly disagree with what the server eventually confirms.
--
-- `killed` is edge-triggered — but against a 10%-of-max_health THRESHOLD,
-- not a bare `> 0` check. Found live, the hard way: a bare `v_health_now >
-- 0` re-triggered `killed:true` on a second bite sent mere milliseconds
-- after the first, because continuous regen makes health tick up from
-- 0 by a tiny (but strictly positive) sliver almost immediately — a
-- scripted client hammering this RPC could re-collect the full kill
-- reward on nearly every call. Requiring a REAL, meaningful recovery
-- (10% of that body's own max_health, which takes real seconds — for the
-- smallest body, ~6s at v_regen_rate=0.6) before another kill can register
-- closes that: a fresh kill afterward still means the body genuinely
-- regenerated a noticeable amount, not that regen ticked a few
-- milliseconds' worth of a health point. This is the single most
-- load-bearing correctness property in this function — verified live
-- against the actual bug, not just reasoned about.
create or replace function bite_solar_body(p_orbit_slot int, p_amount float)
returns table(orbit_slot int, health float, killed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regen_rate constant float := 0.6; -- must match js/config.js#SOLAR_REGEN_RATE
  v_health_before float;
  v_max_health float;
  v_updated_at timestamptz;
  v_health_now float;
  v_new_health float;
  v_actor uuid := auth.uid();
  v_amount float := least(greatest(p_amount, 0), 300); -- same clamp as bite_body
  v_count int;
begin
  if v_actor is null then
    return;
  end if;

  -- Shares bite_rate_limit/the same 20-calls/1s window with bite_body — a
  -- client's total legitimate bite rate is bounded regardless of how many
  -- different targets (comets vs. solar bodies) it's biting at once, so
  -- one combined budget is more correct than two independent ones that
  -- would together allow double the rate.
  insert into bite_rate_limit (actor, window_start, count)
  values (v_actor, now(), 1)
  on conflict (actor) do update
    set count = case when bite_rate_limit.window_start <= now() - interval '1 second'
                      then 1 else bite_rate_limit.count + 1 end,
        window_start = case when bite_rate_limit.window_start <= now() - interval '1 second'
                             then now() else bite_rate_limit.window_start end
    returning count into v_count;

  if v_count is not null and v_count > 20 then
    insert into activity_log (actor, event_type, detail)
    values (v_actor, 'bite_rate_exceeded', jsonb_build_object('count_in_window', v_count, 'orbit_slot', p_orbit_slot) || request_meta());
    return; -- rate limited: silently drop this bite, no error, no effect
  end if;

  -- Column refs qualified with the table name throughout this function -
  -- `returns table(orbit_slot, health, killed)` implicitly declares those
  -- same names as OUT variables in scope here, so a bare `health` is
  -- ambiguous between the table column and the OUT parameter (confirmed
  -- live: an unqualified version of this SELECT failed with exactly that
  -- ambiguity error).
  select solar_bodies.health, solar_bodies.max_health, solar_bodies.updated_at
    into v_health_before, v_max_health, v_updated_at
    from solar_bodies where solar_bodies.orbit_slot = p_orbit_slot for update;

  if v_health_before is null then
    -- either the slot doesn't exist, or it's the black hole (health is
    -- always null for it, see solar_bodies_health_check) — not biteable.
    return;
  end if;

  v_health_now := least(v_max_health, v_health_before + v_regen_rate*extract(epoch from now()-v_updated_at));
  v_new_health := greatest(0, v_health_now - v_amount);

  update solar_bodies set health = v_new_health, updated_at = now()
    where solar_bodies.orbit_slot = p_orbit_slot;

  return query select p_orbit_slot, v_new_health, (v_health_now > v_max_health * 0.1 and v_new_health <= 0);
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
-- Left-joins actor_nicks so admin.html can show a display name next to
-- each actor UUID — self-reported, see that table's own comment.
-- CREATE OR REPLACE can't change a `returns table(...)` function's
-- column list, hence the DROP before it (adding the `nick` column).
drop function if exists admin_activity_log(text, int);
create or replace function admin_activity_log(p_secret text, p_limit int default 200)
returns table(id bigint, actor uuid, nick text, event_type text, detail jsonb, created_at timestamptz)
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
    values (v_actor, 'admin_secret_bruteforce', jsonb_build_object('attempts_in_window', v_attempts) || request_meta());
    return;
  end if;

  -- pgcrypto's digest() lives in the `extensions` schema on Supabase (not
  -- `public`), unlike every other function here — fully-qualified since
  -- this function's search_path is pinned to `public` only.
  if encode(extensions.digest(p_secret, 'sha256'), 'hex') <> '5463cb80c213e5cb45a233c4e429e503abd7d0d48c18a29afb56145c4c72e1ee' then
    return;
  end if;

  return query
    select l.id, l.actor, n.nick, l.event_type, l.detail, l.created_at
    from activity_log l
    left join actor_nicks n on n.actor = l.actor
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;
