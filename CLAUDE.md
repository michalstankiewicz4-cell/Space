# Project brief: Space Swarm — ROJ

Condensed context for picking this project back up. See [`README.md`](README.md)
for structure/setup and [`CHANGELOG.md`](CHANGELOG.md) for version history.

## What this is

A 3D space game built with Three.js (r128, classic UMD `THREE` global).
Static site, no build step, no npm — native ES modules loaded via
`<script type="module" src="js/main.js">`. Deployed on GitHub Pages by
pushing to `main` (repo: `michalstankiewicz4-cell/Space`).

Gameplay: the player's swarm of ships eats planets/suns/comets/meteoroids
for points, spent on upgrades (speed, bite power, thermal resistance,
swarm size); black holes are a hazard to avoid. World and other players'
ships are shared live via Supabase; a player's own points/upgrades stay
local (`localStorage`).

## Working conventions

- **Language**: the user writes in Polish; reply to them in Polish. All UI
  text in the game itself, all project docs (README, CHANGELOG, this file,
  commit messages), and **all inline code comments** (JS and the SQL
  schema) are in **English** — the `pl` dictionary in `js/i18n.js` is the
  one deliberate exception, since that's translation data, not a comment.
- **Versioning**: bump `js/version.js` and add a `CHANGELOG.md` entry for
  every meaningful change (feature, balance change, notable fix) — this
  is how two GitHub Pages deploys are told apart after a push. Also bump
  the `?v=` cache-busting query param on `css/style.css` and `js/main.js`
  in `index.html` to the same value (see the cache-busting gotcha below)
  — it's a hardcoded literal, not read from `js/version.js`, so it's easy
  to forget.
- **Testing before commit**: there's no test suite. Verify changes with a
  local static server (`python -m http.server 8877` from the repo root)
  and a throwaway Playwright script in the scratchpad dir (headless
  Chromium, screenshot-based checks, console/pageerror listeners). This
  hits the **live** Supabase backend (see gotcha below), so keep test
  traffic light. When testing whether a panel/overlay is actually
  *hidden*, assert on `getComputedStyle(el).display` (or a screenshot),
  never just `classList.contains("hidden")` — a class can be applied
  perfectly correctly by JS and still visually do nothing if no CSS rule
  maps it to `display:none` (this exact gap let the drone panel's close
  button go "fixed" several times over while never actually working —
  see the drone bullets in Architecture notes).
- **Git**: create new commits (don't amend, except right after a hook
  failure on a commit that never happened, or before anything's been
  pushed). Every commit/PR ends with the `Co-Authored-By: Claude Sonnet 5
  <noreply@anthropic.com>` trailer. Push to `main` after visual
  verification.

## Architecture notes

- **Body types are data-driven**: each of the 7 celestial body kinds (sun,
  ice/neutral/volcanic planet, comet, meteoroid, black hole) is a plain
  object in its own file under `js/bodies/`, aggregated by `js/content.js`.
  A "planet" DB row only stores `kind`+`temp`, not which of the 3 planet
  variants generated it — `variantForTemp()` re-derives it deterministically.
- **Ships only ever move on an explicit order.** `ships/swarm.js`'s
  `updateShips()` sets a ship's `target` straight from `commandedTarget`
  (set by `commandTo()` in `scene/controls.js`, when ships are selected
  and a planet is clicked) — there is no automatic nearest-planet
  fallback. There used to be one (`nearestPlanet()`, removed): it made
  idle ships drift toward whatever was closest with zero player input,
  and clicking a planet with nothing selected silently sent the *entire*
  swarm. Clicking a planet with no selection now just shows a "select
  ships first" toast (`toast.noSelection`) instead of doing anything.
- **Object editor** (`editor.html`, not linked from the game) reuses the
  game's own `materializePlanet`/`materializeBlackHole` functions for its
  live preview, so it can never visually drift from actual gameplay. It
  has no backend, so "Download" just produces copy-pasteable
  `export const ... = {...}` blocks for `js/bodies/*.js`.
- **Multiplayer** (Supabase, anonymous auth, no login UI): bodies are
  kinematic (position/velocity computed from `spawned_at` client-side), so
  only two things need real-time sync: body health (via the `bite_body`
  Postgres RPC, atomic so simultaneous biters can't double-count a kill)
  and other players' ship positions (ephemeral Realtime Broadcast, never
  written to the DB). A **steward** — the Presence member with the
  smallest `(joined_at, client_id)` — is the only client responsible for
  spawning/topping-up bodies and black holes; re-elected automatically if
  it disconnects. `pendingSpawnCount` in `js/world/bodies.js` tracks
  in-flight inserts so top-up logic doesn't over-spawn while an insert is
  still in transit. Presence re-election only fires on an explicit
  disconnect, so a steward whose tab is backgrounded/frozen (but whose
  socket hasn't actually dropped) can stay "steward" forever while doing
  nothing — `maintainPlanetCount()` in `js/net/bodiesSync.js` has a
  jittered staleness fallback (any client tops up if nothing has spawned
  in 8-12s despite being under `MAX_PLANETS`) so the world doesn't stay
  starved waiting for a steward that may never come back.
- **Realtime channel health has no free lunch.** `net/connect.js` handles
  `subscribe()`'s `"CHANNEL_ERROR"`/`"TIMED_OUT"`/`"CLOSED"` statuses with
  an exponential-backoff reconnect, and exposes `isConnected()`. Don't
  assume a dead channel is rare/theoretical: local gameplay (ship
  movement, `bite_body`, insert/delete) is plain REST and keeps working
  fine even while the socket is dead, so a desynced client looks
  completely normal to the player and, worse, can flood the world via the
  steward top-up fallback if code doesn't check `isConnected()` first
  (this happened once — see `js/net/bodiesSync.js#maintainPlanetCount`).
  The reconnect-status badge in the HUD is deliberately driven by the
  channel's own reported status, not a "haven't heard anything in a while"
  timer — a healthy-but-quiet room (nobody else currently playing) would
  otherwise be indistinguishable from a dead connection and trigger
  constant false alarms.
- **DELETE on `bodies` always means "eaten" except for comets.** A
  planet/sun/meteoroid has no other legitimate way to leave the database;
  only comets can also self-despawn locally for flying out of the field.
  `onBodyDeleted()` in `js/net/bodiesSync.js` uses this to decide whether
  to play the breakup effect — don't reintroduce a health-based guess for
  non-comet kinds, since that depends on a separate, earlier UPDATE event
  having already arrived in order, which isn't guaranteed under network
  jitter (this was a real bug: an eaten planet could silently vanish with
  no explosion for other players if that UPDATE lagged behind the DELETE).
- **Settings vs. identity vs. i18n**: three separate small persisted
  modules, deliberately not merged — `js/settings.js` (local input/UX
  prefs: mouse invert/swap), `js/net/identity.js` (nickname/color, shared
  with other players), `js/i18n.js` (language toggle).
- **Nickname moderation is defense-in-depth, not just input validation.**
  `js/moderation.js`'s `containsProfanity()` is checked both when a player
  confirms their own nick (`net/identity.js`, a courtesy — just blocks the
  UI path) and again on every remote nick before display
  (`net/shipsBroadcast.js`, swapped for the generic fallback name if
  flagged) — the second check is the real defense, since a modified client
  can broadcast anything straight over the WebSocket regardless of what
  its own UI would allow. `print()`'s gas+laser effect (see the drone
  bullets below) follows the same two-check shape: the courtesy check in
  `drone.js`'s `triggerPrintFx()` logs *why* nothing showed up (this one
  has a player right there to explain it to, unlike a nickname box), and
  `net/shipsBroadcast.js`'s `handleRemoteDronePrint()` re-checks on
  arrival and just silently drops it if flagged — same reasoning, same
  split.
  - Nicknames are further restricted to `/^[\p{L}\p{N} ]+$/u` (letters of
    any script, digits, spaces — note `\p{L}` isn't just `a-zA-Z`) and
    `NET_MAX_NICK_LENGTH` (20) in `confirmNick()` — one shared constant
    for both the own-nick length cap and the remote-payload safety clamp
    in `shipsBroadcast.js`, not two numbers that can drift apart.
- **Ship cam** (`js/scene/shipcam.js`): a picture-in-picture "cockpit" view
  rendered as a *second* render pass into a small corner rectangle of the
  same canvas/renderer (`setViewport`/`setScissor`, right after the main
  full-screen render in `main.js`'s `tick()`) — not a second
  `WebGLRenderer`. The viewport/scissor must be reset to full-canvas
  before next frame's main render or it stays clipped to the small rect.
  A ship's mesh group faces its travel direction along local **+Z**, not
  the `-Z` that `Object3D.lookAt()`'s usual convention would suggest
  (verified empirically, not yet root-caused) — the ship cam camera
  corrects for this with a 180°-about-Y flip before copying the mesh's
  quaternion, since a camera always looks down its own -Z.
- **Programmable drone** (`js/drone/*.js`, Colobot-inspired): a single
  extra ship per player that only moves by running a player-written
  script — never auto-targets anything like the swarm's ships do.
  - `dsl.js` (hand-rolled lexer + recursive-descent parser, not eval/
    Function — the DSL is intentionally not JavaScript) produces an AST;
    `interpreter.js` walks it as a **generator**, where every builtin call
    is a `yield` and `drone.js`'s `driveGenerator()` decides whether to
    resolve it instantly (`fuel()`, `attack()`, ...) or spread it over
    several frames by holding off on the next `.next()` call (`move()`/
    `turn()`/`wait()`, tracked in `drone.pending`).
  - **The DSL is otherwise entirely numeric — string literals
    (`"like this"`) exist solely so `print()` can take a message.** Added
    for `print()`'s gas+laser effect (see the bullet below); everything
    else (comparisons, arithmetic, `if`/`while` conditions) still only
    ever deals in numbers, so a string has nowhere else useful to go —
    don't expect string concatenation/comparison to work.
  - **A `while` loop yields an unconditional checkpoint every iteration**
    (see the `"__tick__"` builtin), even though nothing in the language
    needs its value. This was a real bug, not defensive paranoia: a loop
    body with no function calls at all (`while(true){ x = 1 }`) never hit
    a single `yield`, so `.next()` spun forever inside one native JS call
    and froze the tab outright — `driveGenerator()`'s per-frame step
    counter can only catch a runaway script if the generator actually
    yields control back to it. Don't remove this checkpoint when touching
    the interpreter, and re-verify with a no-op `while(true)` script
    (ideally in isolated Node against `dsl.js`/`interpreter.js` directly,
    not a live browser tab, if you don't fully trust a change here).
  - Selection is purely visual (a ring, like ships) and drives the side
    panel's open/closed state (`ui/dronePanel.js`) — it never touches
    `camState`/`ctx.camera`. Keep it that way; RTS-style "select a unit,
    camera stays put" was an explicit requirement.
  - Fuel only refills by proximity-docking near a planet/sun (no passive
    regen) — see `DRONE_DOCK_RANGE_MULT`/`DRONE_REFUEL_RATE` in config.js.
  - The drone isn't in `ctx.ships`, so it's handled as its own case
    everywhere ship-like logic exists: `world/blackholes.js` has a
    separate gravity/kill-radius block for it (with a `defense`-based
    survival roll instead of `ships`' unconditional consumption), its
    picking/selection lives in `scene/controls.js` alongside — but
    separate from — `pickShipAt()`, and `net/shipsBroadcast.js` sends its
    `[x,y,z,heading]` as its own `drone` field on the broadcast payload,
    separate from the `ships` array (this was missed when the drone
    shipped — other players simply never saw it until fixed). A remote
    drone renders as a ghost octahedron (`makeGhostDroneMesh`) tinted by
    owner color, tracked as `remotePlayers[id].droneMesh` — a single
    mesh, not an array like `.meshes` — since there's only ever one drone
    per player; disposed on both `payload.drone === null` and the same
    `NET_REMOTE_PLAYER_TIMEOUT_MS` staleness cleanup as ghost ships.
  - **`spawnDrone()` deliberately spawns it ~6 units out from the origin,
    not inside the ships' own +-2 spawn cube** (`ships/swarm.js`'s
    `spawnShip()`), and its pick sphere is smaller than a ship's (0.5 vs
    0.55). This was a real, reported bug, not a style choice: the drone
    is picked *before* ships/planets on every click (`scene/controls.js`),
    so when it overlapped the swarm's spawn area, an ordinary click meant
    to command ships onto a planet could silently reselect the drone
    instead — which, since selecting it reopens its side panel, was
    reported and investigated for several rounds as "the close button
    doesn't work" (it did; a subsequent normal gameplay click was just
    reselecting the drone and reopening the panel a moment later). If the
    drone ever needs to move/spawn near the swarm again, revisit the
    click-priority order or give ships priority over the drone instead.
  - **`print(x)`'s in-world effect** (`js/drone/dronePrintFx.js`) is a gas
    puff + a laser that projects the text onto it, both spawned as plain
    scene objects (`THREE.Sprite`s for the gas/text via `CanvasTexture`,
    a thin `CylinderGeometry` for the beam) tracked in a module-level
    `activeEffects` list and advanced/disposed by `updateDronePrintFx(dt)`
    (called from `main.js`'s `tick()`, same pattern as `updateDrone(dt)`).
    It's a fire-and-forget snapshot of `drone.pos`/`drone.heading` at the
    moment `print()` ran, not a live reference to the drone — the gas/
    laser/text don't follow it around afterward. Each gas puff sprite
    lerps from a tight jitter around the drone's nose to a spread sized
    to the text sprite's own `scale.x`/`scale.y` (a `THREE.Sprite`'s scale
    *is* its world size, no separate size bookkeeping needed) over
    `GAS_GROW_END` seconds, eased with `easeOutCubic` — don't snap it
    straight to full size, that was the first version and looked wrong.
    The laser is a **unit-length cylinder re-aimed every frame**
    (`aimBeam()`: reposition + rescale + re-quaternion, not rebuilt) so
    its tip can sweep left-to-right across the text on a fast repeating
    `SWEEP_PERIOD`-second sawtooth — the sweep axis is read from
    `ctx.camera.matrixWorld`'s column 0 (world-space "right"), not a
    fixed world axis, because the text is a billboarded `Sprite` whose
    apparent left/right edges rotate with the camera as it orbits; a
    fixed axis would drift out of alignment with the text as the camera
    moves. Triggered from both
    `drone.js`'s `print` builtin case (locally) and
    `net/shipsBroadcast.js`'s `handleRemoteDronePrint` (for other
    players' effects) — it's a **one-shot broadcast event**
    (`"dronePrint"`), not part of the periodic `"ships"` snapshot, since
    there's nothing ongoing to sync; sent once, immediately, when
    `print()` runs (`broadcastDronePrint()`), the same
    untrusted-payload-clamping treatment as ship positions (`safeCoord()`,
    plus `containsProfanity()` on the text — same defense-in-depth
    pattern as remote nicknames).
  - **The side panel's `#droneCloseBtn`/`#droneScriptBtn`/`#droneRunBtn`/
    `#droneStopBtn` all need an explicit `pointer-events:auto` override**
    in `style.css` — `#dronePanel` itself is `pointer-events:none` (same
    trick as `#shipCam`: the panel body shouldn't catch stray clicks, only
    its actual controls should), so a new interactive element added
    inside it and left off that override list is invisible to clicks even
    though it renders and looks completely normal (confirmed via
    `document.elementFromPoint()` — clicks were landing on the canvas
    behind it). This bit twice: once for the close button itself, then
    again for the Run/Stop shortcuts added right after.
  - **The close button listens for `pointerdown`, not `click`** — measured
    directly, not assumed: a plain `click` requires mousedown and mouseup
    to land on "compatible" targets, and an ordinary hand's few-px drift
    between press and release is enough to silently drop it, even with
    `#shipCam`'s exact pointer-events recipe copied verbatim (reproduced
    the same failure on a faithful copy of it — `#shipCamCloseBtn` almost
    certainly has this same latent bug, just not yet hit/reported there).
    `pointerdown` reacts at press time, immune to where the release lands.
  - **The single actual bug behind every "won't close" report, after all
    of the above were real-but-insufficient fixes: `#dronePanel.hidden`
    had no matching `display:none` rule in `style.css`.** Every other
    panel/overlay (`#shipCam.hidden`, `.modal.hidden`, `#legend.hidden`,
    ...) has one; this one didn't, so the JS-toggled `hidden` class did
    nothing visually — the panel rendered at `display:block` 100% of the
    time regardless of selection state. This slipped through several
    rounds of testing because those tests checked
    `classList.contains("hidden")` as a proxy for "is it closed" instead
    of the actual rendered state — the class *was* being toggled
    correctly the whole time. **Lesson: when testing whether something is
    visually hidden, assert on `getComputedStyle(el).display` (or a
    screenshot), never just the presence of a CSS class name** — a class
    can be applied perfectly correctly and still do nothing if the rule
    for it doesn't exist.

## Security model (Supabase)

- **Rule: no client-writable UPDATE policy on `bodies` or `world_meta`.**
  The only column that ever needs to change after insert is `bodies.health`
  (via `bite_body`) and `world_meta.initialized` (via `claim_world_init`) —
  both RPCs are `security definer` with a locked `search_path`, so they run
  with the function owner's privileges and don't need a permissive RLS
  policy to do their job. If a permissive `for update using (true)` policy
  ever gets re-added, it reopens a real exploit: any anon-authenticated
  client could set a body's `health` straight to 0 via a direct
  `supabase.from('bodies').update(...)`, then land one trivial hit through
  `bite_body` to instantly "kill" it and collect its full point value. This
  was found and fixed once already (see `supabase/schema.sql` and
  `CHANGELOG.md`) — don't reintroduce it when adding new mutable columns.
- **INSERT/DELETE on `bodies` stay permissive on purpose.** Any
  anon-authenticated client can insert or delete rows directly (steward
  election is a client-side courtesy for spawning, not a security
  boundary; DELETE is idempotent so it's safe for any client to call).
  What keeps this safe is entirely the CHECK constraints — and a shared
  radius/value_bonus range across every kind was NOT actually
  "plausible-looking" per kind, it just looked that way: a script was
  caught live inserting a fake "sun" (radius ~6, value_bonus=90,
  health≈0.37 — worth ~4x a real sun for one trivial bite) that the old
  shared 0-6/0-100 range happily allowed. `bodies_radius_check` and
  `bodies_value_bonus_check` are now checked **per kind**, matching each
  kind's actual `js/bodies/*.js` ranges with headroom — if those ranges
  change meaningfully, revisit the constraints too, or this gap reopens.
  Residual risk: someone could still grief the world by inserting
  plausible-looking junk up to the 40-row cap, or mass-deleting real
  bodies — both stay low-severity and self-healing, and both are now
  at least *noticed* (see the activity_log bullet below).
- **`activity_log` is a passive audit trail, not an enforcement
  mechanism — nothing in it ever blocks, bans, or rejects anything.**
  Same "RLS enabled, zero policies" shape as `bite_rate_limit`: no client,
  modified or not, can read, write, or clear it — only `SECURITY DEFINER`
  functions/triggers touch it. Two sources feed it: `bite_body`'s existing
  rate limiter now also logs when it trips (that alone is an unambiguous
  signal — a real client physically cannot exceed it), and new
  `AFTER INSERT`/`AFTER DELETE` triggers on `bodies`
  (`log_body_insert_if_bursty()`/`log_body_delete_if_bursty()`) that only
  write a row once a single actor's rate — tracked via a small reusable
  sliding-window counter, `bump_activity_rate()`/`activity_rate` — crosses
  15 in a 10-second window. That threshold deliberately sits just above
  the one legitimate burst that exists (the steward's one-time ~14-body
  world-seed insert), not tuned to avoid *all* false positives — a stray
  log entry costs nothing since nothing acts on it automatically. Applying
  every insert/delete unconditionally (no threshold at all) was
  considered and rejected: at any real play volume it would have
  outgrown the free-tier 500MB database limit in days: `activity_rate`
  stays small regardless (one row per active actor per action, upserted
  in place), but an unconditional `activity_log` would grow without
  bound. No UI for this **in the game** — `admin.html` (separate entry
  point, not linked from the game, same treatment as `editor.html`) is a
  read-only viewer for it, or query by hand (Supabase SQL Editor, or the
  Management API via the `pass` file) when something looks worth
  investigating, e.g.:
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
    identity vs. i18n" bullet above), invisible to any HTTP-header trick.
    `actor_nicks` (`actor uuid primary key default auth.uid()`, RLS: read
    by anyone, write only your own row) exists so the client can
    self-report it once per connection (`net/connect.js`, right after the
    existing `roomChannel.track()` call) — **explicitly not verified
    identity, unlike everything else on this page**: a modified client
    could claim any nick at all, including someone else's, since nothing
    checks it against what that actor actually broadcasts elsewhere.
    Treat it as a hint for the honest-majority case, never as proof.
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
- The Management API token in the gitignored `pass` file can run arbitrary
  SQL against the live project (`POST /v1/projects/{ref}/database/query`)
  — useful for inspecting live state (row counts, auth user counts, current
  RLS policies) or applying `schema.sql` changes directly, without needing
  the user to paste anything into the Supabase SQL Editor by hand.

## Known gotchas

- `RingGeometry` has **planar** UV mapping (not polar around the ring).
  Animating `material.map.offset.x` on it slides the texture sideways
  instead of rotating it — rotate the **mesh** instead (see the black
  hole accretion disk in `js/world/blackholes.js`).
- Supabase anonymous sign-in rate-limits (HTTP 429) under repeated sign-ups
  from heavy same-session testing. Not a code bug — space out test runs.
- All local/Playwright testing hits the **same live Supabase project** as
  real players. Test bot nicknames are visible to real users in the
  players list while a test is running.
- The `pass` file (gitignored) holds the Supabase **Management API**
  token / DB password — never commit it. The Supabase **anon key** in
  `js/env.js`, by contrast, is meant to be public and safe to commit (RLS
  policies in `supabase/schema.sql` are what actually protect the data).
- CSS specificity: `#banner button` (id+type) beats a plain `#id` selector
  of equal id-specificity-count but lower total specificity — new
  ghost/secondary buttons inside `#banner` need `#banner button#id` or
  `!important` to not inherit the primary CTA style.
- GitHub Pages serves every file with `Cache-Control: max-age=600` (10
  min) and an `ETag`, no build step means no content-hashed filenames, and
  a page that's already open never re-fetches anything on its own (a
  deploy doesn't reach an already-loaded tab until it's reloaded). The
  `?v=` query param on `css/style.css`/`js/main.js` in `index.html` only
  narrows the "just deployed, browser still has the old file cached"
  window for *new* page loads — it can't do anything for a tab that's
  already open, and doesn't reach the files `js/main.js` `import`s (those
  still resolve to their own plain, unversioned URLs either way).
  `js/versionCheck.js` covers the "already open" case instead, by
  periodically re-fetching `js/version.js` itself and blocking play once
  it detects this tab is older than what's actually deployed. Its "Refresh
  now" button doesn't use `location.reload()` (that's just F5 — it can
  still serve `js/main.js`/`css/style.css` from cache if they're within
  the freshness window) but navigates to a `?_=<timestamp>` cache-busted
  URL instead, which forces a genuine fetch since the browser has never
  seen that exact URL. There's no standard cross-browser JS API for a true
  hard reload (Ctrl+Shift+R) — this is the practical workaround.
  **That cache-busted-URL trick alone still isn't airtight**: it only
  guarantees a fresh `index.html`, `js/main.js` and `css/style.css` (the
  three that actually carry the `?v=`/`?_=` params); every file
  `main.js` transitively `import`s has no cache-busting of its own, and
  a still-fresh browser HTTP cache entry for any of them gets served
  as-is to the native ES module loader — there's no way to pass fetch
  options to a static `import`. `initVersionCheck()`'s click handler now
  force-refreshes the browser's cache entry for every module file first
  (`fetch(path, {cache:"reload"})` — revalidates and overwrites the
  cached copy — capped at 3s so a slow connection can't leave the player
  stuck) via a hand-maintained `MODULE_FILES` list, *then* navigates. That
  list has to be updated by hand whenever a file is added to `js/`, same
  spirit as the `?v=` bump itself — there's no build step to derive it
  automatically, and forgetting silently makes the fix not cover that one
  new file. A plain "or Ctrl+Shift+R" hint sits under the button too,
  since even this can only narrow the gap, never fully close it.
