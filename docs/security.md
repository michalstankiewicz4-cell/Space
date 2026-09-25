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

## No client-writable UPDATE policy

- **Rule: no client-writable UPDATE policy on `bodies`, `solar_bodies`, or
  `world_meta`.** The only column that ever needs to change after insert
  is `bodies.health` (via `bite_body`, comets), `solar_bodies.health` (via
  `bite_solar_body`, the 9 fixed bodies + Sun — see
  [`docs/architecture.md`](architecture.md)'s "Solar system" bullet) and
  `world_meta.initialized` (via `claim_world_init` — dead code now,
  nothing calls it since the 9-orbit rewrite removed the "first client
  seeds an empty world" scenario it existed for; left in place rather
  than dropped, since an unused function/table costs nothing and dropping
  it is a needless irreversible step) — all these RPCs are `security
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
  `BEFORE DELETE` triggers in the `activity_log` bullet below, which now
  actually reject a burst past 15-in-10s, not just log it. Below that
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
  - `bite_body`'s existing rate limiter logs when it trips (that alone is
    an unambiguous signal — a real client physically cannot exceed it)
    *and* has always silently dropped the call, no error, no effect.
  - `BEFORE INSERT`/`BEFORE DELETE` triggers on `bodies`
    (`log_body_insert_if_bursty()`/`log_body_delete_if_bursty()`) log
    *and* `RAISE EXCEPTION` — actually rejecting the row, not just
    observing it — once a single actor's rate, tracked via a small
    reusable sliding-window counter (`bump_activity_rate()`/
    `activity_rate`), crosses 15 in a 10-second window. Originally
    `AFTER` triggers that only logged; moved to `BEFORE` specifically so
    they could cancel the row instead of just noticing it after the fact
    (verified live: the 16th body insert within the window fails with
    "Too many body inserts too fast", the first 15 all still succeed).
  - `set_my_nick()` (see the nick bullet below) silently drops over 5
    calls per 30s per actor, same "no error" shape as `bite_body`.

  15-in-10s deliberately sits well above any legitimate comet-only
  traffic pattern now (at most 1 insert per `COMET_RESPAWN_DELAY_MS`
  cycle — see [`docs/architecture.md`](architecture.md)'s "Comets"
  bullet); it originally sat just above the old scattered-pool world's
  one legitimate burst, the steward's one-time ~14-body world-seed
  insert, a scenario that no longer exists at all post-9-orbit-rewrite
  (fixed bodies are seeded once by the migration, not by any client) —
  the threshold itself was never revisited since it's still comfortably
  conservative either way. A false positive there costs a retried top-up
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
    `create or replace function admin_activity_log(...)` with the new
    hash — there's no other copy to update.
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

- **`bite_body` is rate-limited per actor (20 calls/second)**, via the
  `bite_rate_limit` table (RLS enabled, zero policies — reachable only
  from inside the `SECURITY DEFINER` function, never directly by a
  client). A real client only sends one call per damaged body per ~150ms
  (`NET_DAMAGE_FLUSH_MS`), so legitimate play never gets close; this
  exists because a script hitting the RPC directly in a tight loop could
  one-shot every body the instant it spawned — verified live, 40
  concurrent calls against one body applied exactly 20 and dropped 20.
  Tripping it now also writes to `activity_log` (see below) — still just
  dropped silently as far as the caller can tell, nothing changed there.

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
