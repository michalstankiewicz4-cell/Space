# Security model (Supabase) — full detail

Referenced from [`CLAUDE.md`](../CLAUDE.md)'s condensed security rules —
this file holds the exploit post-mortems and live-verification detail
behind each rule. Read the relevant section here before touching RLS
policies, CHECK constraints, or any `SECURITY DEFINER` RPC in
`supabase/schema.sql`.

## Contents

Section names only (no line numbers — they'd go stale). To jump to one
without reading the whole file: grep `^## ` for its current line number,
then read just that range.

- [No client-writable UPDATE policy](#no-client-writable-update-policy)
- [Rate-limited INSERT and DELETE on bodies](#rate-limited-insert-and-delete-on-bodies)
- [bodies narrowed to comets](#bodies-narrowed-to-comets)
- [activity_log audit trail](#activitylog-audit-trail)
- [bite_body rate limit](#bitebody-rate-limit)
- [Anonymous-auth spam](#anonymous-auth-spam)
- [Public player counter](#public-player-counter)
- [Privacy (GDPR)](#privacy-gdpr)
- [Function EXECUTE grants](#function-execute-grants)
- [Audit 2026-09-30 (v2.26.1): usage leaks and log growth](#audit-2026-09-30-v2261-usage-leaks-and-log-growth)
- [Aggregate statistics (v2.27.0)](#aggregate-statistics-v2270)
- [Solar-body kill rule (v2.28.3)](#solar-body-kill-rule-v2283)
- [Helpers (v2.28.6)](#helpers-v2286)
- [Broadcast from other players (v2.30.2)](#broadcast-from-other-players-v2302)

## No client-writable UPDATE policy

- **Rule: no client-writable UPDATE policy on `bodies`, `solar_bodies`, or
  `world_meta`.** The only column that ever needs to change after insert
  is `bodies.health` (via `bite_body`, comets), `solar_bodies.health` (via
  `bite_solar_body`, the 9 fixed bodies + Sun — see
  [`docs/architecture.md`](architecture.md)'s "Solar system" bullet) and
  `world_meta.initialized` (via `claim_world_init` — dead code since the
  9-orbit rewrite, left in place but revoked from clients in v2.26.1) —
  all these RPCs are `security
  definer` with a locked `search_path`, so they run with the function
  owner's privileges and don't need a permissive RLS policy to do their
  job. If a permissive `for update using (true)` policy ever gets
  re-added to either bodies table, it reopens a real exploit: any
  anon-authenticated client could set a body's `health` straight to 0 via
  a direct `.update(...)`, then land one trivial hit through the matching
  RPC to instantly "kill" it and collect its full point value. This was
  found and fixed once already on `bodies` (see `supabase/schema.sql` and
  `CHANGELOG.md`) — `solar_bodies` was designed with **zero**
  insert/update/delete policies from the start precisely to make the
  same class of bug structurally impossible there, not just
  policy-avoided. Don't reintroduce a permissive UPDATE policy on either
  table when adding new mutable columns.

## Rate-limited INSERT and DELETE on bodies

- **INSERT/DELETE on `bodies` stay permissive on purpose — up to a rate
  (1.9.2).** Any anon-authenticated client can still insert or delete
  rows directly (steward election is a client-side courtesy for
  spawning, not a security boundary; DELETE is idempotent so it's safe
  for any client to call) as long as they're not doing it faster than
  any legitimate play ever would — see the `BEFORE INSERT`/
  `BEFORE DELETE` triggers in the `activity_log` bullet below, which skip
  every row past 5 in 10 s, not just log it. Below that
  rate, what keeps it safe is entirely the CHECK constraints. A shared
  radius/value_bonus range across every kind used to NOT actually be
  "plausible-looking" per kind, it just looked that way: a script was
  caught live (before the 9-orbit rewrite, when `bodies` held every kind)
  inserting a fake "sun" (radius ~6, value_bonus=90, health≈0.37 — worth
  ~4x a real sun for one trivial bite) that the old shared 0-6/0-100 range
  happily allowed — fixed at the time with **per-kind** `bodies_radius_check`/
  `bodies_value_bonus_check` ranges. Once `bodies` narrowed to comet-only
  (see below), those per-kind branches collapsed back into one flat range
  again — this time correctly "plausible-looking," since there's only one
  kind left to satisfy, not a reintroduction of the original gap.

## bodies narrowed to comets

- **`bodies` narrowed to comet-only** once the 9-orbit rewrite shipped
  (v2.0.0) — `bodies_kind_comet_check` (`check (kind = 'comet')`) layers
  on top of the original inline kind check, and the cap trigger
  (`enforce_bodies_cap`) dropped from 40 rows to 10, since comets are
  capped at exactly 1 in the system at a time now (see
  [`docs/architecture.md`](architecture.md)'s "Comets" bullet — the
  10-row DB cap is just headroom against a burst of concurrent inserts
  racing each other, not the real population control). `max_life` (the
  black hole's old expiry timer column) was dropped from the table
  entirely; `world_meta`/`claim_world_init` are dead code now too (see
  the bullet above) but left in place rather than dropped.
  - **`bodies_pos_check`/`bodies_vel_check` are a live example of a
    distance-rescale constraint getting missed, not just a hypothetical
    risk** (see the "Solar system" architecture bullet's own "budget time
    to re-check all of them" lesson) — both were left at the old
    small-scale world's bounds (`±100`/`±20`) straight through the
    v2.0.0/v2.0.1 distance rescale, since a comet's `pos_x/y/z`/
    `vel_x/y/z` columns aren't part of the per-kind ranges that
    rescale's own review pass double-checked. Real comets enter at
    `COMET_ENTRY_RADIUS` (~1023 units), so from the moment the new comet
    physics shipped, *every* real spawn attempt was silently rejected
    with a generic Postgres 400 — reported live by the user as "the
    comet just doesn't appear," several commits after the physics
    itself had already shipped and been tested offline (offline-mode
    testing doesn't touch these constraints at all, which is exactly why
    this wasn't caught before it reached a live player). Fixed by
    widening to `±1200`/`±15` (headroom over the real entry-scale values;
    a comet's pos/vel columns are only ever written once, at spawn, never
    updated afterward, so these don't need to cover the much higher
    mid-flight speed near perihelion) and applied directly to the live
    DB via the Management API, verified with a real REST insert at
    entry-scale values (201, then cleaned up) before the matching
    `schema.sql` commit was even pushed. Residual risk from the original
    bullet above is otherwise unchanged: someone could still grief the
    world by inserting plausible-looking junk up to the 10-row cap, or
    mass-deleting real comets, as long as they pace it under the
    burst-rejection threshold — both stay low-severity and self-healing,
    and both are at least *noticed* even when paced that carefully (see
    the `activity_log` bullet below).

## activity_log audit trail

- **`activity_log` itself is a passive audit trail — nothing reads it and
  auto-bans anyone.** Same "RLS enabled, zero policies" shape as
  `bite_rate_limit`: no client, modified or not, can read, write, or
  clear it — only `SECURITY DEFINER` functions/triggers touch it. But
  several of the write-path guards that feed it have since grown real
  enforcement alongside the logging (1.9.2) — don't assume "it's in
  activity_log" means "and otherwise nothing happened":
  - The bite rate limit (`bite_body` + `bite_solar_body`, see below) logs
    when it trips *and* silently drops the call, no error, no effect. The
    client stays under it (`net/biteBudget.js`), so a trip means a script.
  - `BEFORE INSERT`/`BEFORE DELETE` triggers on `bodies`
    (`log_body_insert_if_bursty()`/`log_body_delete_if_bursty()`) skip
    the row (`return null`) once a single actor's rate, tracked via a
    small reusable window counter (`bump_activity_rate()`/
    `activity_rate`), crosses 5 in a 10-second window, and log the first
    one past it. `BEFORE` triggers so they can cancel the row; skipping
    rather than `RAISE EXCEPTION`, because a raise rolled the log row back
    too (fixed in v2.26.1, see the audit below).
  - `set_my_nick()` (see the nick bullet below) silently drops over 5
    calls per 30s per actor, same "no error" shape as `bite_body`.

  5-in-10s still sits well above legitimate comet traffic (at most 1
  insert per `COMET_RESPAWN_DELAY_MS` cycle — see
  [`docs/architecture.md`](architecture.md)'s "Comets" section); it was 15
  while the steward still seeded ~14 bodies at once, a scenario gone
  since the 9-orbit rewrite. A false positive there costs a retried top-up
  at worst (another client's staleness fallback or its own next cycle
  covers it), which is cheap enough that the threshold didn't need
  tuning to avoid every possible false positive. Applying every
  insert/delete unconditionally (no threshold at all) was considered and
  rejected for the *logging* half specifically: at any real play volume
  it would have outgrown the free-tier 500MB database limit in days —
  `activity_rate` stays small regardless (one row per active actor per
  action, upserted in place), but an unconditional `activity_log` would
  grow without bound. No UI for this **in the game** — `admin.html`
  (separate entry point, not linked from the game) is a read-only viewer for it, or query by hand
  (Supabase SQL Editor, or the Management API via the `pass` file) when
  something looks worth investigating, e.g.:
  `select actor, event_type, count(*), max(created_at) from activity_log
  group by actor, event_type order by 3 desc;`
  - **`admin.html` can't call the Management API directly — confirmed by
    testing, not assumed.** A preflight `OPTIONS` to
    `api.supabase.com` came back with no `Access-Control-Allow-Origin`
    header at all, and an actual browser `fetch()` to it failed with
    `"Failed to fetch"` (the generic error a browser gives for a
    CORS-blocked request) — that API isn't meant for direct browser use,
    and even if it were, embedding that token (full arbitrary-SQL access)
    in a file deployed to public GitHub Pages would hand it to anyone who
    views source. `admin.html` instead calls the ordinary **project**
    REST API (same public anon key already in `env.js`, same one the game
    itself uses, which does support browser CORS) via a new RPC,
    `admin_activity_log(p_secret text, p_limit int)` — the actual
    security boundary. It checks `p_secret` server-side against a SHA-256
    hash (`extensions.digest(p_secret, 'sha256')` — pgcrypto installs
    into the `extensions` schema on Supabase, *not* `public`, unlike
    every other function in this file; this broke on first deploy with
    "function digest(text, unknown) does not exist" until qualified) and
    returns nothing at all if it doesn't match — the plaintext secret
    itself is never committed anywhere, only its hash lives in
    `schema.sql`. Also rate-limits guesses (`bump_activity_rate`, 5 per
    60s per anon actor — a caller needs *some* anon session to call any
    RPC at all, so guesses are always attributable), and logs to
    `activity_log` itself if that's exceeded. Rotating the secret means
    regenerating it, hashing it, and re-running
    `create or replace function admin_secret_ok(...)` with the new hash
    (since v2.28.6 the one place both admin RPCs check it) — there's no
    other copy to update.
  - **IP/browser/country are captured automatically, no client change
    needed, and can't be suppressed by a client** — `request_meta()`
    reads `current_setting('request.headers', true)::jsonb`, a session
    GUC PostgREST populates from the actual incoming HTTP request on
    every function/trigger call (confirmed live: a throwaway debug
    function that just returned this setting showed the real caller IP
    under both `cf-connecting-ip` and `x-forwarded-for`, the full
    `user-agent`, and `cf-ipcountry` — Supabase's edge sits behind
    Cloudflare). Merged into each logging call's `detail` via
    `jsonb_build_object(...) || request_meta()`. Only has anything to
    read when called through the real REST/RPC gateway — applying
    `schema.sql` itself via the Management API's own SQL execution has
    no HTTP request to expose, so don't expect this to populate from
    that path.
  - **Nickname is a different story: NOT capturable this way, since it
    never reaches Postgres at all** — nicknames only ever travel over
    ephemeral Realtime Broadcast/Presence (see the "Settings vs.
    identity vs. i18n" bullet in `docs/architecture.md`), invisible to
    any HTTP-header trick. `actor_nicks` (`actor uuid primary key
    default auth.uid()`) exists so the client can self-report it once
    per connection (`net/connect.js`, right after the existing
    `roomChannel.track()` call, via `set_my_nick(p_nick)`) —
    **explicitly not verified identity, unlike everything else on this
    page**: a modified client could claim any nick at all, including
    someone else's, since nothing checks it against what that actor
    actually broadcasts elsewhere. Treat it as a hint for the
    honest-majority case, never as proof. `actor_nicks` has RLS enabled
    with **zero policies**, same as everywhere else in this file — it
    used to have direct insert/update-your-own-row policies, which meant
    a script could hammer `.upsert()` with no throttle at all;
    `set_my_nick()` is now the only door in, rate-limited to 5 calls/30s
    the same `bump_activity_rate` way as everything else (verified live:
    the *5th* of 8 rapid calls is what ends up stored, not the 8th — the
    rest silently drop and log as `set_nick_spam`), and clamps the nick
    to 20 chars server-side (`NET_MAX_NICK_LENGTH`) so this self-reported
    field can't be used to stash an arbitrarily long string.
  - **Found (and fixed before ever shipping) a stored-XSS hole from
    exactly that self-reported nick, plus the also-client-controlled
    IP/user-agent**: `admin.html`'s first draft built table rows via
    `innerHTML` string concatenation, so a nick like
    `<img src=x onerror="...">` — trivial to plant, since `actor_nicks`
    has no format check at the DB level, only the *game's own*
    `confirmNick()` restricts what a normal player can pick — would have
    executed as script in `admin.html`'s own origin, which is exactly
    where the admin secret lives (`localStorage`). Rewrote every cell to
    build with `textContent`, never `innerHTML` — verified by planting
    that exact payload via a raw REST call (bypassing `confirmNick()`
    entirely, like a real attacker would) and confirming it renders as
    plain visible text with no `alert()` firing.
  - **`js/admin/main.js`'s `eventRowClass()` colors table rows by matching
    on event-name convention** (`*_burst` → ember, `*_bruteforce`/
    `*_spam`/`*_exceeded` → danger), **not an exact-match list** — it
    started as one, and `set_nick_spam` (added in the same 1.9.2 batch as
    the function that logs it) silently fell through with no color at
    all until fixed in 1.9.3, because nobody had added its exact name to
    the list. If a future rate-limited RPC's event type doesn't fit
    `_burst`/`_bruteforce`/`_spam`/`_exceeded`, it'll have the same silent
    gap — rename to fit the convention rather than special-casing another
    exact string.

## bite_body rate limit

- **Bites are rate-limited per actor: 20 calls/second, one budget shared
  by `bite_body` (comets) and `bite_solar_body`** (`bump_bite_rate`, the
  `bite_rate_limit` table — RLS enabled, zero policies, reachable only
  from inside the `SECURITY DEFINER` functions). It exists because a
  script hitting the RPC in a tight loop could one-shot every body —
  verified live, 40 concurrent calls against one body applied exactly 20
  and dropped 20. The client flushes damage per body every ~150 ms
  (`NET_DAMAGE_FLUSH_MS`) through a 15/s budget (`net/biteBudget.js`):
  without it, 15 ships on 5 bodies overran the limit (the v2.26.1 audit
  below). Over the limit: dropped silently, the first call past it logged
  to `activity_log`.

## Anonymous-auth spam

- **Anonymous-auth spam**: the live project has
  `rate_limit_anonymous_users = 30` (Supabase's own per-IP throttle — this
  is what produces the 429s during heavy testing, see gotcha below) and
  `security_captcha_enabled = False`. A single IP is already capped, but a
  distributed attacker could still script sign-ups from many IPs to run up
  anonymous-user counts (cost/MAU exposure, not a data exploit). Turning on
  Supabase's hCaptcha/Turnstile bot protection for sign-ins would close
  this, at the cost of extra setup (an hCaptcha account) — not done, since
  it hasn't been asked for and trades against the "no login screen"
  friction-free design.
  - **This didn't even need an attacker — confirmed live, not assumed, and
    since fixed.** `net/connect.js#initNet()` used to call
    `supabase.auth.signInAnonymously()` unconditionally on every page load,
    with no check for an already-valid stored session first. Verified by
    reloading the exact same browser tab (same `localStorage`, same
    computer, same IP) twice and diffing `auth.users`: the row count went
    up by exactly one **per reload**, with a completely different
    `user.id` stored each time — so the anonymous-user count was
    effectively **page loads**, not unique browsers/devices/IPs; one
    player refreshing 10 times in a session accounted for 10 separate
    "MAU," no malicious intent required. **Fixed**: `initNet()` now calls
    `supabase.auth.getSession()` first and only falls through to
    `signInAnonymously()` when that comes back with no session — the same
    pattern Supabase's own docs use. Re-verified the same way: 3 loads of
    the same tab now produce exactly 1 new `auth.users` row (not 3), a
    genuinely new browser context still gets its own distinct identity as
    expected, and the game's own multiplayer connection (`isConnected()`)
    still comes up fine either way — this only changes which identity
    `connectRoom()` runs under, nothing about the connection itself.
    Doesn't (and can't) change anything about IP — the token this checks
    has nothing to do with network origin, so a player's IP changing
    mid-session was never actually relevant here. Also doesn't touch
    nickname/color/`clientId` persistence at all — those already live in
    their own separate `localStorage` keys (`net/identity.js`), unrelated
    to the Supabase auth session. The only way to still get a fresh anon
    identity going forward: clearing this browser's site data, a different
    browser/profile, incognito, or a different device — a different stored
    `localStorage` is the actual boundary, not IP or "the same person."
- The Management API token in the gitignored `pass` file can run arbitrary
  SQL against the live project (`POST /v1/projects/{ref}/database/query`)
  — useful for inspecting live state (row counts, auth user counts, current
  RLS policies) or applying `schema.sql` changes directly, without needing
  the user to paste anything into the Supabase SQL Editor by hand. That
  same `pass` file also holds the Blogger API OAuth credentials (see
  [`docs/blogger.md`](blogger.md)) — unrelated service, same "don't commit
  this" treatment.

## Public player counter

**Not deployed to the live database yet — the user's call.** The function
is in `supabase/schema.sql`, but deploys touch only specific functions
(never the whole file), and this one waits for the user's go-ahead. Until
then the start screen shows "—" for registered players and the browser
console logs a 404 for `rpc/player_count` — expected, not a failure.

- **`player_count()` is the one read path into `actor_nicks`, and it
  returns only a number** (v2.2.0, for the start screen's "registered
  players" counter). `actor_nicks` itself keeps RLS enabled with zero
  client policies — nicks are self-reported and paired with actor ids
  in the admin view, so they're never exposed row by row; the
  `security definer` function is what lets this single aggregate reach
  the table. It's read-only and a plain `count(*)` over a small table,
  so unlike every write path here it has no rate limit. "Registered"
  means every anonymous account that ever connected (one row per
  actor, upserted by `set_my_nick()`), test sessions included — an
  approximate public number, not an audited one.

## Privacy (GDPR)

Added in v2.18.0 (2026-09-27, the user's request). The public policy is
`privacy.html` (Polish `#pl`, English `#en`); **keep it in sync with what
the game and this schema actually store** — it's a legal statement, not
marketing.

- **What's personal data here**: the anonymous account id (Supabase
  Auth), the nickname (`actor_nicks`), and in `activity_log` the IP,
  browser and country (`request_meta()`), recorded only when an abuse
  trigger fires. Game state (positions, colour, points) only travels over
  Realtime broadcast/presence, never stored. Progress/settings stay in the
  player's `localStorage`.
- **Accepting the policy is required before playing (the user's call)**,
  although legally no consent is needed (no analytics, ads or tracking;
  `localStorage` is strictly necessary; the security log rests on
  legitimate interest, Art. 6(1)(f)). The first-visit bar
  (`ui/privacy.js#initPrivacyNotice`, key `roj-privacy-ok`, button
  "Accept") keeps "ENTER ORBIT" locked (`ui/banner.js`) and — the part
  that matters — **nothing connects to Supabase before it's accepted**:
  `initNet()` and the player counter wait for `whenPrivacyAccepted()`
  (main.js). Verified: 0 requests to supabase.co before the click. "Delete
  my data" clears the key too, so acceptance starts over. Fonts and libraries
  are self-hosted (v2.12.1), so no third-party requests (the Google Fonts
  ruling doesn't apply).
- **Data minimisation**: `shorten_ip()` — IPv4 a.b.c.0, IPv6 cut to its
  first three groups (a:b:c::), first entry of an `x-forwarded-for`
  list; `request_meta()` stores only that. Existing log rows were
  shortened once at deploy.
- **Storage limitation**: `purge_old_data()` deletes `activity_log` rows
  older than 30 days, `actor_nicks` rows not refreshed for 180 days and
  stale rate-limit windows. No pg_cron: `set_my_nick()` calls it, i.e.
  on every player connection — cheap on these small tables. (Side effect:
  the start-screen "registered players" number, if `player_count()` is
  ever deployed, counts players seen in the last 180 days.)
- **Right to erasure**: `delete_my_data()` (Setup → Privacy → "Delete my
  data", two clicks) deletes the caller's `actor_nicks`, `activity_rate`
  and `bite_rate_limit` rows and their `auth.users` row, then the client
  signs out, removes every `roj-` / `sb-` localStorage key and reloads.
  **Safe by construction**: security definer, but it only ever acts on
  `auth.uid()` — a client can't name another player; rate-limited (3 per
  60 s). The caller's `activity_log` rows are deliberately kept until they
  expire (30 days, Art. 17(3) GDPR), so deleting an account can't wipe
  evidence of abuse. A fresh anonymous account on the next visit is
  nothing new — clearing the browser already gave that.
- **Where**: the Supabase project is in **eu-west-1 (Ireland)**; GitHub
  Pages hosts the site. Both named in the policy as processors.
- **Controller / contact**: Michał Stankiewicz,
  michalstankiewicz@onet.eu (also in the About window).
- **History**: on 2026-09-27, at the user's request, all player data was
  wiped once (303 anonymous accounts, 268 nicks, 2962 log rows, rate-limit
  rows; the world tables untouched) — most of it test traffic.
- **License**: the code is MIT (`LICENSE`, with the third-party
  components listed there).

## Function EXECUTE grants

Found in the v2.18.1 audit (2026-09-27). **Supabase grants EXECUTE on
every new `public` function to `anon` and `authenticated` by default**,
and PostgREST exposes each one as `/rest/v1/rpc/<name>`. So internal
helpers were a client API too. The real hole: `bump_activity_rate(p_actor,
p_action, p_window)` is `security definer` and takes the actor as a
parameter, so a browser could call it **with someone else's actor id**.
That would inflate their rate counters (e.g. push them over the
`set_nick` limit so their nickname stops saving) or flood `activity_rate`
with random ids. Pre-existing since the rate limits were added; no sign
of use.

**Fix**: the end of `supabase/schema.sql` revokes EXECUTE from `public`,
`anon` and `authenticated` on every internal function:
`bump_activity_rate`, `purge_old_data`, `request_meta`, `shorten_ip`,
the trigger functions `log_body_insert_if_bursty`,
`log_body_delete_if_bursty` and `enforce_bodies_cap`, and since then
`bump_stats`, `bump_bite_rate`, `admin_secret_ok` and the dead
`claim_world_init`. Security-definer
callers (`set_my_nick`, `bite_body`, …) still reach them, because inside a
definer function the check runs as the owner. Verified live: a direct
`rpc("bump_activity_rate")` / `rpc("purge_old_data")` now returns 42501,
and `set_my_nick`, `bite_solar_body`, comet insert/delete and
`delete_my_data` still work.

**Rule for new functions**: a helper that isn't meant to be called from
the browser gets its own `revoke execute ... from public, anon,
authenticated` line in that block. A client-callable one takes its actor
from `auth.uid()`, never from a parameter. Check with
`has_function_privilege('anon', oid, 'EXECUTE')` over `pg_proc` in the
`public` schema.

## Audit 2026-09-30 (v2.26.1): usage leaks and log growth

The user asked for a hacking/bugs/usage review. Read-only checks through the
Management API (policies, grants, `has_function_privilege`, the security
advisor, usage counts) plus live browser tests. **No exploitable hole found**
— RLS, the definer RPCs' `auth.uid()` actors and the rate limits held. What
was found were usage leaks and a logging flaw:

- **Reconnect loop (client, the worst one).** `net/connect.js#scheduleReconnect`
  removed the old channel, whose own subscribe callback then got "CLOSED" and
  scheduled another reconnect — which later tore down the healthy new
  channel, and so on: one real disconnect became a reconnect every ~2 s for
  the life of the tab, each re-running `set_my_nick`, the `bodies` and
  `solar_bodies` fetches and a presence join. Seen in `activity_log` as a real
  player's `set_nick_spam` every 2 s; reproduced by forcing
  `supabase.realtime.disconnect()` (16 `set_my_nick` calls in 30 s, then 1
  after the fix). Fix: callbacks from a replaced channel are ignored.
- **Ship broadcasts to an empty room.** ~8 Realtime messages/s per player
  (`NET_SHIP_BROADCAST_MS` 120) even alone — ~30 000/hour against a monthly
  quota of about 2 M on the free tier. Now only while `presence.js#othersOnline()`
  > 0 (verified: 0 messages with an empty room).
- **Honest players tripping the bite limit.** Damage is flushed per body every
  150 ms, so 15 ships on 5 bodies sent ~26 bite RPCs/s against the 20/s
  limit: 30 % dropped, and **every** dropped call wrote an `activity_log` row
  (110 rows in 25 s ≈ 16 000/hour from one player — an unbounded-growth path
  toward the 500 MB database limit, and a script could do it on purpose).
  Client: `net/biteBudget.js` (15/s shared, rotating, pending damage kept);
  measured afterwards: ≤ 14.5/s, 0 dropped. Server: every rate-limit branch
  now logs only the call that crosses the threshold (`v_count = limit + 1`).
- **Burst triggers never logged.** `log_body_insert_if_bursty` /
  `log_body_delete_if_bursty` inserted into `activity_log` and then
  `RAISE EXCEPTION` — which rolls the log row back with the statement. They
  now `return null` (the row is skipped, the log kept). The game's comet
  insert treats a skipped row like any failed spawn.
- **Advisor warnings**: three helpers without a pinned `search_path` (fixed);
  the "security definer executable by anon" warnings are the game's
  intentional RPCs (all take the actor from `auth.uid()`); `claim_world_init`
  (dead) revoked; anonymous sign-ins and no captcha are known (see
  "Anonymous-auth spam").
- **Table privileges**: anon/authenticated had TRUNCATE/TRIGGER/REFERENCES
  (Supabase default). Not reachable through PostgREST; revoked anyway.
- **Test traffic is usage too**: every Playwright run with a fresh browser
  context signs in a new anonymous user (52 of the day's 95 new accounts
  that day; 39 "Tester" nicks) and appears to real players as "Tester".
  Keep test runs few, or reuse one stored session (`storageState`).
- Observed usage then: DB 13 MB, 95 anonymous users, ~12 000 REST requests
  a day on test days (mostly bite RPCs; REST requests aren't a free-tier
  limit), realtime connections a few hundred a day.
- **Follow-up, same day (v2.27.0)**: the 51 test accounts ("Tester") were
  deleted with their nicks, rate counters and log rows, at the user's
  request. `admin.html` signed in anonymously on every visit — now it
  reuses the stored session like the game.

## Aggregate statistics (v2.27.0)

`stats_hourly` (hour → connects, kills, peak_online): counts only — no actor
ids, IPs or nicks, so nothing personal and no privacy-policy change. RLS with
zero policies; written by internal `bump_stats` (revoked) from `set_my_nick`
(a connection), `bite_body` / `bite_solar_body` (a kill) and `report_online`
(client-callable, rate-limited to 1/60 s per caller, clamped to 0..200;
only the steward calls it, every 5 min — `net/stewardStats.js`). Read by
`admin_stats(p_secret)`: the same secret hash and the shared
`admin_secret_attempt` throttle as `admin_activity_log` — one admin page load
spends two of its five attempts a minute. `peak_online` is self-reported: a
modified client can inflate it (up to 200), so it's a hint for the charts,
never a measurement. Purged after 90 days (`purge_old_data`).

**The plan's usage** (v2.32.11). `admin_stats` also returns:
- `db_bytes`: `pg_database_size`;
- `mau`: accounts signed in, or seen in the game (nick refreshed), in the
  last 30 days. This is close to how the plan counts monthly active users.

The admin page shows both as % of the Free plan's limits (500 MB, 50,000
MAU, in `js/admin/stats.js#LIMITS`), with bars: green, amber from 60 %,
red from 85 %.

Egress and Realtime usage aren't readable from SQL. Only the Management
API knows them, and it can't be called from the browser (see above). They
would need an Edge Function holding the token, or a local tool.

## Solar-body kill rule (v2.28.3)

`bite_solar_body` counted a kill only when `v_health_now > 10 % max` just
before the bite that reached zero. Bites arrive every 150 ms in small
amounts, so that bite never started above 10 %: kills almost never counted
(0 in `stats_hourly` over the first day; found in the 2026-10 code review).
Now: `killed = new health <= 0 and not (stored health <= 0 and regenerated
<= 10 %)` — a body is "spent" after a kill until it grows back past 10 %,
which still stops a client camping a body for repeated rewards. The game's
`world/bodies.js#isSpent` is the same rule. Deployed: `bite_solar_body` only.

## Helpers (v2.28.6)

`bump_bite_rate(actor)` — the 20/s bite window shared by `bite_body` and
`bite_solar_body`; `admin_secret_ok(actor, secret)` — the admin secret's
throttle (5/min, the 6th logged once) and hash check, for
`admin_activity_log` and `admin_stats`. Both internal: revoked from
anon/authenticated at the end of `schema.sql` (verified with
`has_function_privilege`). Rotating the admin secret means changing the hash
in `admin_secret_ok` only.

## Broadcast from other players (v2.30.2)

Ship positions, drones, stations, print() — everything players see of each
other — travels as Realtime broadcast, which the server doesn't validate:
any client can send any payload with any `id`. Nothing of it is stored, so
the risk is what it does to other players' screens. The receiving side
(`net/shipsBroadcast.js`) checks, in this order:

- **The sender's id must be in the room's presence** (`presence.js#isInRoom`,
  rebuilt on every presence sync). One channel join is one presence, so
  inventing players takes one connection each instead of one string each.
  Before this, one client could fill all 60 player slots.
- **A token bucket per sender and message kind** (`NET_SHIPS_MSG_RATE` /
  `_BURST` 12/s, 24; print 1/s, 3). A real client sends ships every
  120 ms and print() at most every 1.5 s.
- **Caps on what a payload can make**: `NET_MAX_REMOTE_SHIPS` = the Fleet
  tree's last level + 2 (25), `NET_MAX_REMOTE_PLAYERS` 60, one drone and
  one station per player, coordinates clamped to ±1000, the nick cut and
  checked (`isAcceptableNick`, profanity), colours validated, a drone's
  shots at most 2 per update.

Tested with two tabs: a payload with an id not in presence never appeared,
100 ships showed as 25, and a flood of 80 messages was cut after the
burst (24). What's still self-reported and unverifiable: points and bodies
eaten shown in the players list — display only.
