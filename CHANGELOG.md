# Changelog

All notable changes to the game, version by version. The version number is
shown next to the title on the start screen and in the browser tab title
(see [`js/version.js`](js/version.js)).

## [2.0.10]

### Fixed
- A second gravity bug uncovered immediately by v2.0.9's fix: raw `GM/r²`
  acceleration was never capped, so a close pass near a body's own `minR`
  clamp could spike to thousands of units/s² in a single frame — a ship
  that reliably reached a target in ~250 simulated seconds with gravity
  off never arrived at all across 1000 seconds with gravity on, peaking
  at ~424 units/s (cruise speed is ~1). Capped the raw acceleration
  itself well above any legitimate ambient pull, so a genuine close pass
  still visibly matters without being able to blow up.

### Investigated (no change)
- Tried making ambient gravity genuinely felt during a ship's commanded
  flight (not just while idle) — reverted after live testing showed it
  isn't reliably compatible with "click a target, arrive there" even
  with the cap above: a ship could still get knocked off course near an
  unrelated body and never make it. Commanded ships stay gravity-immune
  while cruising, confirmed necessary rather than just a cautious
  default.

## [2.0.9]

### Fixed
- **Ambient gravity toward the Sun was ~900x weaker than intended, for
  ships and the drone both, ever since the fixed solar system shipped
  (v2.0.0).** The Sun was never excluded from `world/solarGravity.js`'s
  own "which body is currently the dominant pull source" competition the
  way the black hole already was — since the Sun's own sphere-of-influence
  is unbounded (`Infinity`, by design, as the ultimate fallback), it
  always won that competition trivially for anything not actually inside
  a real planet's much smaller SOI, using its own generic per-body mass
  figure (~66.7) instead of the real constant meant to represent its
  actual pull (60000). Reported live as "I flew the drone far from the
  station and the Sun isn't pulling it" — confirmed directly (a drone
  300 units out moved 0.0007 units in a full simulated second of
  gravity, instead of the ~0.667 the real numbers predict) and fixed by
  also excluding the Sun from that competition loop, the same way the
  black hole already was. Re-verified: a drone flown 50 units past the
  station now visibly drifts toward the Sun over time, at a sane, gradual
  rate — not explosive, not imperceptible.

## [2.0.8]

### Changed
- The drone now also spawns next to the station (offset above it, clear
  of the ships' own formation) and is exempt from ambient gravity there
  too — same treatment as the swarm's ships, extended per the user's own
  "it's kind of a ship too" framing. Unlike ships, it's deliberately
  *not* pulled back by the station's containment field if it wanders or
  docks far away — that field would otherwise visibly drag it off
  whatever distant body it's deliberately parked at mid-script.

## [2.0.7]

### Added
- The station now has a subtle gravity-free containment field around it —
  ambient solar gravity no longer pulls on ships parked there, instead of
  fighting a permanent tug-of-war against the existing pull-back field.

### Changed
- Ships now spawn arranged around the player's own station instead of
  scattered in a small cube near the Sun (a leftover from before the
  fixed solar system, when that spot used to be empty space) — both the
  initial fleet and any new ship added by a Fleet upgrade.

## [2.0.6]

### Added
- A camera mode toggle, top-center in the HUD: **Base** (new, and now the
  default on load) orbits the player's own station instead of the Sun,
  framed by default so the Sun sits behind and a little above the
  station — **System** is the previous whole-system view, unchanged.
  Both stay fully player-controlled (drag to rotate, scroll to zoom,
  same as before) — switching modes just resets to that mode's own
  default framing, it isn't a fixed cinematic shot.

## [2.0.5]

### Fixed
- Removed a stray dashed trail of separate white dots visible behind a
  comet from certain viewing angles — not the tail, an unrelated sparkle
  particle effect (`spawnTailParticle`, inherited from ship engine
  trails) spawning one particle every fixed 0.03s at the comet's current
  position. That looked like a continuous streak at the old, much slower
  comet speed, but at real comet speeds (up to ~44 units/s near
  perihelion) each spawn point ends up too far from the last to read as
  anything but a row of distinct dots. Removed entirely rather than
  re-tuned — redundant now with both the comet's own geometric tail and
  the new trajectory line (v2.0.4).

## [2.0.4]

### Changed
- A comet's own flight path is now traced as a faint line the moment it
  spawns (same visual style as the 9 fixed orbits), showing its whole
  sun-grazing swing-by from entry to exit — not just the moving comet
  itself. The line disappears together with the comet, whether it's
  eaten or flies back out of the system.

## [2.0.3]

### Fixed
- Comets could never actually spawn once live: `bodies_pos_check`/
  `bodies_vel_check` in `supabase/schema.sql` were still bounding comet
  position/velocity to the old small-scale world (±100/±20), left over
  from before the distance rescale (v2.0.1) — a real comet now enters at
  ~1023 units, so every INSERT was silently rejected with a generic
  Postgres 400. Widened both to ±1200/±15 (comet pos_x/y/z/vel_x/y/z are
  only ever written once, at spawn, so these just need to cover the entry
  state, not the much higher mid-flight speed near perihelion).

## [2.0.2]

### Changed
- Comets are now a real, gravity-curved sun-grazing flyby instead of a
  straight-line drift: one spawns at a time (never more than one in the
  system at once), entering from just outside the outermost orbit,
  swinging past the Sun at roughly 2/3 of the first orbit's distance
  (solved analytically via vis-viva + angular momentum, not just aimed at
  a point — see `js/world/cometPhysics.js`), and exiting back out the far
  side. After one despawns (eaten, or flown back out of the system), the
  next one waits a fixed 1-minute cooldown before spawning, replacing the
  old population-topped-up pool of up to 3 at once.
- The comet's tail now always points directly away from the Sun (real
  solar-wind/radiation-pressure direction), re-oriented every frame as the
  comet's own position changes along its curving path — previously a
  fixed direction (opposite travel) computed once at spawn, which only
  ever looked right for the old straight-line drift.

## [2.0.1]

### Changed
- Orbits are now visible — a faint line traces each of the 9 orbits (plus
  the player-station ring), same as test.html's own reference view.
- Rescaled the whole solar system out to test.html's actual distances
  (previously a much more compact analog) — orbits now span roughly
  90-890 units from the Sun instead of 7.5-44. Camera zoom range, fog
  falloff, the skybox/starfield backdrop, and gravity's own `GM_SUN`
  constant were all rescaled together to match (found live: leaving fog
  density and the skybox's own size at their old values made almost
  everything past the first orbit fade into fog, and put the camera close
  enough to the skybox's low-poly geometry for its facets to show).

### Fixed
- Each orbit's angular speed was carried over unchanged from the old,
  much smaller distances — at the new scale that made every planet's
  actual (linear) speed far higher than a ship's own top speed, so ships
  could never catch up to and dock onto a moving target at all. Orbital
  speeds are now tuned so every orbit moves slower than a ship can fly,
  which does mean a full lap now realistically takes anywhere from tens of
  minutes (innermost) to several hours (outermost) — matching how real
  outer planets take a very long time to complete an orbit too, not an
  oversight.

## [2.0.0]

### Changed
- **The world is now a real, fixed solar system instead of a randomly
  scattered, endlessly-respawning pool.** One Sun at the center, 9
  concentric orbits (2 volcanic planets, 2 neutral, 2 ice, 1 meteoroid, 1
  black hole, and orbit 4 reserved as the ring every player's station spawns
  on), each real body a hand-picked, permanent fixture — no more random kind/
  position rolls, no more despawn-on-death for planets/suns/meteoroids/the
  black hole. Orbits are real closed-form ellipses (semi-major/minor axis,
  inclination, ascending-node rotation), not straight lines or static points.
- **Real gravity.** Every ship (and the drone) is pulled by exactly one
  dominant body at a time — whichever one's sphere of influence it's
  currently inside, otherwise the Sun — the same patched-conics
  simplification real orbital-mechanics games commonly use. An idle ship
  with no orders now visibly drifts under
  gravity instead of sitting perfectly still forever.
- **Eaten bodies regenerate instead of dying.** Biting the Sun or a planet
  down to zero health no longer destroys it — health regrows over time (a
  live pace, not "reload to reset"), and the body stays biteable throughout.
  The black hole keeps its old kill-on-contact hazard behavior unchanged,
  just as a permanent fixture on the outermost orbit now instead of a
  temporary, randomly-spawning one.
- **Player stations now sit on their own dedicated orbit (4)**, at a fixed
  angle derived from each player's own identity — a station never
  relocates just because some other player joined or left. It also has a
  containment field now: a player's own ships drifting too far from home
  under ambient gravity get gently pulled back.
- Comets are unaffected by any of the above — still their own independent,
  short-lived flyby mechanic, spawned/despawned from a small pool exactly
  as before.
- Supabase schema: the fixed solar bodies live in a new `solar_bodies`
  table (seeded once, only ever updated — never inserted/deleted again),
  with a new `bite_solar_body` RPC replacing `bite_body` for them (health
  regen computed server-side the same way client-side, never a cron job).
  `bodies` itself now holds only comets. See `supabase/schema.sql` and
  `supabase/migrate_to_solar_system.sql` for the live migration this
  version shipped with.

## [1.10.15]

### Fixed
- A ship whose target planet died mid-bite (networked mode) could keep
  damaging/spawning particles on the already-gone body for the whole
  server round-trip, because only `target` was cleared, not
  `commandedTarget` — the very next frame re-assigned `target` right back
  from it.
- A save written by an older build (before some upgrade-tree node existed)
  could leave that node `undefined` after loading, turning a stat formula
  into `NaN` and silently making the affected planet type unkillable for
  the rest of the session. `load()` now merges known keys onto the
  current defaults instead of replacing the whole object.
- A ship lost to a black hole was instantly, silently respawned the same
  frame by an unrelated fleet-size reconciliation call — losing a ship to
  a hazard now actually lasts for the rest of the session, as intended.
- Several Supabase RPC/Realtime calls (`requestSpawnPlanet`,
  `requestSpawnBlackHole`, Presence `track()`) had no `.catch()` on
  rejection (as opposed to a resolved `{ error }`), which could leave
  internal bookkeeping (`pendingSpawnCount`, steward election) silently
  stuck after a network failure.
- Pressing Escape didn't close the station or planet side panels, only
  the drone panel and ship cam.
- The planet info panel's title was set once, only when the panel opened,
  so it never picked up a language switch made while the panel was still
  open — every other label in the panel already refreshed live.
- Closed a live exploit: `bodies.health`/`max_health`/`max_life` had no
  NOT NULL constraint, so a crafted insert with `health: null` bypassed
  `bite_body`'s damage math entirely and could report a body as
  unkillable/undying. Per-kind CHECK constraints now require the right
  set of these columns to be present (and in range) for that kind.

### Changed
- Internal cleanup, no player-visible behavior change: consolidated
  several duplicated patterns found in a full-project review — black hole
  disposal, generic mesh disposal (ships/drone/station all shared the same
  scene.remove+traverse-dispose shape), ghost-unit materials and
  target/lerp bookkeeping in `net/shipsBroadcast.js`, the drone/station
  singleton raycast pick helpers, drone/station selection in
  `scene/controls.js`, the try/catch-guarded `localStorage` read/write
  reimplemented in six separate modules, ~15 separate
  `#id.hidden{ display:none; }` CSS rules collapsed into one generic
  `.hidden` rule, and the steward-gated staleness-fallback logic shared by
  planet and black-hole top-up. Also reduced a few frequently-allocated
  `THREE.Vector3`s in `ships/swarm.js`'s per-frame ship loop and
  `world/blackholes.js`'s gravity loops to reused scratch vectors, and
  cached a comet's drift-tail direction once at spawn instead of
  recomputing it every ~0.03s (it never changes after spawn).

## [1.10.14]

### Changed
- Internal reorganization, no player-visible behavior change: split the
  two largest files (`world/bodies.js`, `scene/controls.js`) by concern.
  Pure body-type math moved to `world/bodyParams.js`, optional-decoration
  mesh builders to `world/bodyMeshParts.js`, raycast picking to
  `scene/picking.js`, and the hover tooltip to `scene/tooltip.js`. Also
  fixed `js/versionCheck.js`'s `MODULE_FILES` list, which had fallen out
  of sync with several files added over recent versions.

## [1.10.13]

### Changed
- Dev Tools' "Show light sources" now marks *every* light in the scene
  (the two fixed lights, plus every currently-live sun/ship/drone glow),
  not just the fixed lights and suns — a generic scene traversal instead
  of a fixed list, so anything added later is covered for free. Markers
  are now small icon sprites, always drawn on top (never hidden inside
  whatever they're illuminating), tinted to each light's own color, and
  kept at a constant apparent size on screen at any zoom — the same
  editor-gizmo convention Unity/Unreal use for light icons.

## [1.10.12]

### Added
- Dev Tools: a "Turn off lights" checkbox that hides every light in the
  scene (ambient + both fixed lights + every dynamically spawned sun/ship/
  drone glow), leaving only emissive materials visible — a quick way to
  see which surfaces are self-lit vs. lit-by-scene-light.

## [1.10.11]

### Added
- Clicking a planet (with no ships selected) now selects it: a corner-
  bracket "targeting" frame appears around it, and a side panel opens on
  the right with a live 3D thumbnail plus health/radius/spin/value stats —
  mirroring the drone's own selection+panel pattern. Shift+click toggles a
  planet in/out of a multi-select (order-preserving) without ever
  commanding the fleet; a plain click still sends selected ships there as
  before, unchanged. Selecting the drone/station always closes an open
  planet selection and vice versa, since they share the same right-side
  HUD slot.
- A small Dev Tools button (bottom-right, above the ship-cam PIP's own
  corner) opens a menu with two debug toggles: light-source markers
  (small wireframe spheres at every `PointLight`'s position — the two
  fixed scene lights plus each live sun's own glow) and a line connecting
  the currently multi-selected planets, with a distance label on each
  segment.

## [1.10.10]

### Fixed
- `flushDamage()` retried a failed `bite_body` call (server error, timeout,
  dead socket) unconditionally on the very next 150ms tick, with nothing
  to ever break the cycle — a prolonged server-side hiccup (reported live
  as a Cloudflare 522 while attacking a planet) kept the client hammering
  the same RPC every 150ms indefinitely. Now backs off exponentially
  (capped at 10s) after consecutive failures, same shape as the existing
  Realtime reconnect backoff, resetting instantly on the next success.

## [1.10.9]

### Added
- A grayed-out Google sign-in button next to the nickname field, mirroring
  the random-nickname button on the field's other side — not wired up yet
  (disabled), just staking out the spot for when Google login lands.

## [1.10.8]

### Fixed
- Black holes could stop appearing entirely for the whole session if the
  steward's tab was backgrounded (throttled, not disconnected, so nothing
  re-elects a new steward) — there was no fallback letting another client
  spawn one instead, unlike the equivalent mechanism for planets. Any
  connected client can now step in once it's been far longer than the
  normal cadence since a black hole last appeared. Also adds the same
  dead-socket guard planet top-up already had, so a steward with a silently
  dropped Realtime connection can't insert duplicate black holes it can no
  longer see are already there.

## [1.10.7]

### Added
- Multi-level column sorting in the admin panel's "Recent entries" table —
  click When/IP/Actor to add it as a sort key (ascending → descending →
  off), without discarding whichever other columns are already active.
  Click order sets priority (first-clicked is primary, later clicks are
  tiebreakers), shown as a small ▲/▼ + number on each active header. IP
  sorts numerically (dotted-quad order), not as plain text.

## [1.10.6]

### Fixed
- Every page load/refresh was creating a brand new anonymous Supabase
  user, even in the exact same browser — confirmed live: 2 reloads of
  one tab produced 2 separate accounts. `initNet()` now checks for an
  already-stored session first and only signs in fresh when there
  isn't one, so a returning tab keeps its identity instead of counting
  as a new user every time. No effect on gameplay, nickname/color
  persistence, or reconnecting after an IP change — all already worked
  the way they should independent of this.

## [1.10.5]

### Changed
- Starfield colors are more distinguishable — the first pass (subtle
  blue-white/warm-white/teal tints) was too close to plain white to
  tell apart at the size stars actually render at. Now leans on real
  stellar-classification colors (blue-white, white, yellow-white,
  orange, red) plus a rare teal.

### Added
- A handful of background pulsars — small stars that sharply
  brighten/dim on their own irregular rhythm, scattered among the
  starfield.

## [1.10.4]

### Changed
- The nebula skybox's color clouds are more visible — fewer, bigger
  blobs with roughly double the opacity, so distinct colors are
  actually distinguishable at a glance instead of reading as one faint
  haze.

## [1.10.3]

### Added
- A procedural nebula skybox — a huge sphere with a canvas-generated
  gradient and soft color-cloud blobs in the game's own accent palette,
  no external image assets (same approach as every planet texture).

### Fixed
- The starfield was almost invisible at its own distance — the scene's
  distance fog was blending it nearly entirely into the background color
  well before it could fade from distance alone. Both the new skybox and
  the starfield now opt out of fog, and the starfield also got a touch of
  per-star color variation (cool blue-white, warm white, faint teal)
  instead of one flat color.

## [1.10.2]

### Fixed
- Clicking a ship in the Fleet list now selects it too, not just its
  camera preview — matches clicking it directly in the world (and
  matches how the drone's own entry in that same list already selects
  it). Also now clears any previous selection first, so it exclusively
  selects that one ship rather than adding to whatever was already
  selected.

## [1.10.1]

### Fixed
- The drone's script now survives closing the browser — previously only
  the in-memory copy was kept, so it reset to blank on every reload.
  Persisted to `localStorage` separately from swarm progress (fuel,
  position and running state still reset fresh each session, same as
  before).

## [1.10.0]

### Added
- A space station for every player: a procedurally built ring-and-hub
  structure (no model files — pure Three.js primitives),
  spawned once near the swarm's starting area and never moving. Select it
  to open a docking panel showing fleet size, evolution points and a
  compact upgrade-level summary, with shortcuts into the existing Tech and
  Fleet modals — no new resource economy, just an overview of the one
  that already exists.
- The station is synced to other players the same way the drone is (a
  tiny `[x,y,z,heading]` broadcast, not the 3D model itself) — other
  players see a "ghost" version of it tinted in your player color.

## [1.9.7]

### Added
- A "copy row" button (⧉) at the end of every row in both the admin
  panel's "By actor" and "Recent entries" tables — copies that row's
  full values, semicolon-separated, to the clipboard (matches the usual
  Polish/European CSV delimiter, so it pastes straight into a
  spreadsheet). Flashes a ✓ briefly for feedback.

## [1.9.6]

### Fixed
- The admin panel (`admin.html`) content was silently clipped whenever it
  grew taller than the window — it inherits the game's shared
  `css/style.css`, whose `html,body{overflow:hidden}` (needed so the game
  canvas itself never scrolls) also suppressed the admin panel's page
  scroll, with no substitute scroll container to compensate. Fixed by
  giving `admin.html` its own `overflow-y:auto` in `css/admin.css`.

### Changed
- Restyled the scrollbar (both `::-webkit-scrollbar` for Chromium/Safari
  and `scrollbar-color`/`scrollbar-width` for Firefox) to a thin teal
  thumb on a dark track matching the game's palette, applied globally so
  every scrollable element (Setup/Tech/Fleet modals, the drone script
  editor/log, the admin panel) looks consistent instead of using the
  browser's default scrollbar.

## [1.9.5]

### Added
- A gently swaying "DEV Blog.PL" badge in the top-right corner of the
  start screen, linking out to the new devlog
  ([swarmprotocol.blogspot.com](https://swarmprotocol.blogspot.com/)).

## [1.9.4]

### Added
- A game-mode row under the title on the start screen: Singleplayer,
  Multiplayer, With friends. Only Multiplayer is real right now (that's
  what the game already always does) — all three are non-interactive
  placeholders (`disabled`), Singleplayer/With friends visibly grayed
  out with a "Coming soon" tooltip, Multiplayer shown highlighted/active
  to reflect what's actually happening. No mode-switching logic exists
  yet; this is purely a preview of what's planned.

## [1.9.3]

### Changed
- Renamed the game from "ROJ // Swarm Protocol" to just **Swarm
  Protocol** everywhere it's displayed: the browser tab title, the start
  screen, the telemetry HUD panel, `admin.html`, `editor.html`,
  `README.md`/`CLAUDE.md`, and the `schema.sql` header comment. The
  internal `window.ROJ_ENV` override variable (`js/env.js`) and the
  `roj-*` `localStorage` key names are unaffected on purpose — renaming
  those wouldn't be visible to a player, and would silently drop a
  returning player's saved nick/color/settings for no benefit.
- Also fixed a stale `maxlength="24"` on the nickname input — nicknames
  have been capped at 20 (`NET_MAX_NICK_LENGTH`) since 1.8.3; the HTML
  attribute just never caught up.

### Added
- The admin panel now surfaces a "N anomalies logged, across M distinct
  actors" summary line, and correctly color-codes `set_nick_spam` (it
  fell through with no color before — the row-coloring function only
  matched two hardcoded event names, not the newer nick-spam one).
  Switched to matching on event-name convention (`*_burst`,
  `*_bruteforce`, `*_spam`/`*_exceeded`) instead of an exact-match list,
  so a future rate-limited RPC's event type gets categorized
  automatically instead of silently falling through uncolored again.

## [1.9.2]

### Added
- Actual anti-spam blocking (not just logging) for three script-friendly
  targets, extending the pattern `bite_body`'s existing rate limit
  already set:
  - **Nick changes**: `actor_nicks` writes now go through a new
    `set_my_nick()` RPC (the table itself has no client-writable policy
    at all anymore) — rate-limited to 5 per 30s per actor, matching how
    a real client only ever calls this once per connection. Over the
    limit, the write is silently dropped (same "no error, no effect" as
    `bite_body`) and logged as `set_nick_spam`.
  - **`bodies` insert/delete bursts**: upgraded from logging-only to
    actually rejecting once an actor's rate crosses the existing
    15-in-10s threshold — the triggers moved from `AFTER` to `BEFORE` so
    they can `RAISE EXCEPTION` and cancel the row, not just observe it
    after the fact.
  - **`print()` spam**: a 1.5s client-side cooldown
    (`DRONE_PRINT_COOLDOWN_S`) between calls, enforced in plain JS the
    drone DSL can't reach around — a `while(true){ print(...) }` script
    with no `wait()` would otherwise flood the broadcast channel as fast
    as the interpreter's runaway-script step limit allows. This one has
    no server-side backstop: broadcast messages never touch the database
    at all, so there's nothing there to rate-limit against — a fully
    custom/modified client bypassing this file entirely could still
    flood it directly, the same residual risk broadcast traffic already
    has everywhere else in this project.

  Verified live: 20 rapid-fire body inserts succeeded exactly 15 times
  then failed with "Too many body inserts too fast" on the rest; 8 rapid
  `set_my_nick()` calls left the *5th* value actually stored (not the
  8th), with the remaining 3 logged as `set_nick_spam`.

## [1.9.1]

### Added
- `activity_log` entries now include IP, browser and country automatically
  — pulled from the HTTP request PostgREST already exposes to every
  function/trigger call (`request_meta()`, `supabase/schema.sql`), no
  client change needed for this part, can't be suppressed by a client.
- A best-effort, **self-reported** nickname next to each `activity_log`
  actor: a new `actor_nicks` table the client upserts into once per
  connection (`net/connect.js`). Explicitly not a verified identity —
  a modified client could claim any nick, including someone else's —
  it's a hint for the common/honest case, never proof.
- `admin.html` now shows nick/IP/browser columns.

### Fixed
- Found and closed a stored-XSS hole in `admin.html` before it shipped:
  nick/IP/browser all ultimately come from something a client controls
  (nick has no format check at the DB level; IP/UA are ordinary HTTP
  headers a script can set to anything), and the page was building table
  rows with `innerHTML` string concatenation — an attacker-chosen nick
  like `<img src=x onerror="...">` would have run as script in the same
  origin that stores the admin secret in `localStorage`, handing it
  straight to whoever planted it. Rewrote rendering to build cells with
  `textContent`, never `innerHTML`. Verified live: planted that exact
  payload as a nick via a raw REST call (bypassing the game's own nick
  validation, like a malicious client would), confirmed it renders as
  inert visible text in the table with no `alert()` firing.

## [1.9.0]

### Added
- `admin.html`: a read-only viewer for `activity_log` (1.8.5's
  network-behavior audit trail) — a per-actor/event-type summary plus the
  raw recent entries, not linked from the game (same treatment as
  `editor.html`). Gated by a secret checked **server-side** against a
  SHA-256 hash in a new `admin_activity_log()` RPC — the plaintext secret
  is never committed anywhere, only entered into the page itself (kept in
  that browser's `localStorage` after the first time). Rate-limits wrong
  guesses (5/60s per anon session) and logs to `activity_log` itself if
  that's exceeded.

  Confirmed by testing, not assumed, that this couldn't just call the
  Management API directly from the page: a preflight `OPTIONS` request
  came back with no `Access-Control-Allow-Origin` header, and an actual
  browser `fetch()` failed with a CORS error. Embedding that token (full
  arbitrary-SQL access) in a file on public GitHub Pages would have
  handed it to anyone who viewed source, anyway. Uses the game's own
  public anon key and the ordinary project REST API instead, same as the
  game itself already does.

## [1.8.5]

### Added
- Passive network-behavior audit trail (`supabase/schema.sql`): a new
  `activity_log` table, unreachable by any client (RLS enabled, zero
  policies, same pattern as `bite_rate_limit`) and only ever written by
  `SECURITY DEFINER` functions/triggers — observation only, nothing here
  blocks or bans a player. Logs `bite_body` rate-limit trips (already an
  unambiguous signal — a real client physically can't hit it) and bursts
  of `bodies` inserts/deletes far above what legitimate play ever
  produces (>15 in 10s per actor, with headroom above the steward's
  one-time ~14-body world-seed burst). No UI in the game for this;
  review it via the Supabase SQL Editor or the Management API. Verified
  live: an 18-insert burst logged exactly 3 entries (the ones past the
  threshold), and the matching 18-delete cleanup logged 3 more.

## [1.8.4]

### Fixed
- "Refresh now" on the outdated-version overlay could still leave stale
  code running even after 1.5.1's cache-busted-URL fix: that only forces
  a fresh `index.html` (plus `js/main.js`/`css/style.css`, since they
  carry the `?v=` param) — every file `main.js` `import`s transitively
  has no cache-busting of its own, so a still-fresh (< 10 min old)
  browser HTTP cache entry for any of them gets served as-is to the
  native ES module loader regardless. The button now force-refreshes the
  browser's cache entry for every module file first (`fetch(path,
  {cache:"reload"})`, capped at 3s so a slow/flaky connection can't leave
  the player stuck), then navigates as before.
- Added an "or Ctrl+Shift+R" hint under the button either way, since the
  above can only narrow the gap, not close it completely without a build
  step to fingerprint every file automatically.

## [1.8.3]

### Added
- Nicknames are now restricted to letters, digits and spaces, max 20
  characters (was: any characters, max 24) — rejected with the existing
  "choose a different nick" message, same as profanity.
- `print()` now runs its message through the same profanity filter as
  nicknames before releasing the gas+laser effect (or broadcasting it to
  other players) — blocked content still gets logged below the Run/Stop
  buttons as usual, immediately followed by a message explaining why the
  in-world effect didn't show up, instead of silently doing nothing.
  Also lowered the effect's own max length from 40 to 32 characters.

## [1.8.2]

### Added
- The Fleet list now includes the drone alongside the ships — clicking
  it selects the drone and opens its side panel (it has no ship-cam view
  of its own, so it doesn't try to open one, unlike clicking a ship).

## [1.8.1]

### Changed
- `print()`'s gas cloud now visibly sprays outward from the drone's nose
  to the text's own size over ~1.5s (eased, not a snap into place)
  instead of puffing up in place near the nose. The laser's tip now
  sweeps rapidly left-to-right across the text, CRT-scanline style,
  snapping back to the left edge each pass, for as long as the beam is
  visible — instead of pointing at one fixed spot.

## [1.8.0]

### Added
- `print("text")` now does more than log a line: the drone releases a gas
  puff from its nose and a laser projects the text onto it — legible only
  while the gas is there (a real laser needs smoke/fog to show up at
  all), then the gas disperses and a bare laser beam lingers a moment
  before fading. Visible to other players too, relayed over Realtime
  broadcast as a one-shot event (not part of the periodic position
  snapshot). The log entry below the Run/Stop buttons still happens as
  before, unchanged.
- String literals (`"like this"`) in the drone DSL — added specifically
  so `print()` could take a message. The language is still otherwise
  entirely numeric (no string operators/comparisons); this makes a
  string a valid argument value, nothing more.

## [1.7.2]

### Fixed
- Other players' drones were never visible — `net/shipsBroadcast.js`'s
  broadcast payload only ever included `ctx.ships`, since the drone was
  added later and isn't part of that array (see the "drone isn't in
  ctx.ships" note in CLAUDE.md). Added the drone's position/heading to
  the broadcast and a ghost octahedron (tinted by owner color, like
  ghost ships) on the receiving end. Verified live with two clients: a
  second client's ghost drone position matches the first client's real
  one within one broadcast interval.

## [1.7.1]

### Fixed
- The drone script editor only saved to the drone on **Run** — closing
  the editor after typing (or using the side panel's Run/Stop shortcuts
  added in 1.7.0) without ever pressing Run lost whatever was typed.
  Now saves on every keystroke (`droneScriptInput`'s `input` event).

## [1.7.0]

### Added
- Run/Stop shortcut buttons directly in the drone's side panel, next to
  the Script button — re-runs or stops the last saved script without
  opening the script editor. Shares styling with the editor's own Run/
  Stop via a common `.droneRunBtn`/`.droneStopBtn` class instead of
  duplicating it.

Caught during testing: the new buttons were unclickable at first (clicks
fell through to the 3D canvas underneath) — `#dronePanel`'s `pointer-
events:none` (from 1.6.4) only had `#droneCloseBtn`/`#droneScriptBtn`
punched back to `auto`, and the new buttons were never added to that
list. Fixed before shipping.

## [1.6.6]

### Fixed
- The actual root cause of every "drone panel won't close" report since
  1.6.1: `ui/dronePanel.js` always correctly toggled a `hidden` class on
  `#dronePanel`, but — unlike every other panel/overlay in the game
  (`#shipCam.hidden`, `.modal.hidden`, `#legend.hidden`, ...) — no CSS
  rule ever mapped `#dronePanel.hidden` to `display:none`. The panel was
  rendered at 100% opacity and `display:block` at all times regardless
  of selection state; only its selection *ring* ever visually reacted.
  Every fix from 1.6.1 through 1.6.5 (selection reliability, the close
  button's event binding, spawn separation from the swarm) was a real,
  verified improvement, but none of them could have closed this gap,
  since hiding the panel was never wired up to begin with. Confirmed via
  `getComputedStyle` before and after (`display: block` -> `display:
  none`) rather than just checking for the class name, which is what let
  this slip through every earlier round of testing.

## [1.6.5]

### Fixed
- Found the actual cause of "the drone panel won't close", after 1.6.1-
  1.6.4 fixed real but secondary issues: the drone spawned inside the
  exact same cube as the player's own ships (identical spawn code), with
  an even bigger pick radius (0.75 vs a ship's 0.55), and it's checked
  for a hit *before* ships/planets on every click. An ordinary click near
  the swarm to command ships onto a planet could silently hit the drone
  instead, reselecting it and reopening its panel — which looked exactly
  like the close button failing, since it *was* closing, just getting
  reopened by the very next normal gameplay click. Moved the drone's
  spawn out to a ring 6 units from the origin (clear of the ships' +-2
  spawn cube) and shrank its pick sphere to 0.5. Verified: 15 random
  clicks inside the old shared spawn area now select the drone 0 times
  (previously reliably triggered it), and the panel stays closed through
  20 simulated normal-gameplay clicks after being closed once.

## [1.6.4]

### Fixed
- The drone panel's close button still didn't reliably close on a real
  click, even after 1.6.3's bigger hit box. Root cause, confirmed by
  direct testing: it listened for a plain "click" event, which only
  fires if mousedown and mouseup land on compatible targets — a normal
  hand's mousedown-then-drift-then-mouseup (a few px, entirely typical)
  landing just outside the button between press and release silently
  drops the event. Reproduced this exact failure on a faithful copy of
  shipCam's own close-button recipe too (pointer-events:none container +
  plain click), so shipCam most likely has the same latent bug, just
  not yet hit there. Switched to a "pointerdown" listener instead, which
  reacts at press time — verified this survives the same drift that
  broke "click" — and kept the pointer-events:none container structure.

## [1.6.3]

### Fixed
- The drone panel's close button (`#droneCloseBtn`) had a hard 26×26px hit
  box with zero tolerance — measured directly: a click landing even 1px
  outside its CSS box did nothing, no forgiveness margin at all. Enlarged
  it to 34×34px. This was reported as "the panel won't close" even after
  the drag-select fix in 1.6.1, which only addressed *selecting* the
  drone, not this separate, precise close button.

## [1.6.2]

### Changed
- Ships no longer auto-target the nearest planet when idle — they only
  ever move on an explicit order (select ships, then click a planet).
  Clicking a planet with nothing selected now does nothing (a toast says
  to select ships first) instead of silently sending the whole swarm.

### Fixed
- The drone's live 3D thumbnail looked permanently hazy/blurred. Cause:
  `.panel`'s `backdrop-filter: blur(6px)` (a shared frosted-glass HUD
  style) was also blurring the thumbnail, since it's not a separate
  image but the same WebGL canvas rendered a second time into a small
  viewport behind `#droneThumbWrap`. Confirmed by ruling out lighting/fog
  first (changing either had zero visual effect) before finding the CSS
  filter was the actual cause. Disabled `backdrop-filter` specifically on
  `#dronePanel`; its background is already opaque enough (82%) to stay
  readable without it.

## [1.6.1]

### Fixed
- The drone couldn't be reliably selected (and its side panel felt like it
  wouldn't close): ships have two selection paths — a direct click, and a
  drag/box-select rectangle that also catches a plain click if the mouse
  jitters past the 6px drag threshold between mousedown and mouseup, which
  real clicks routinely do. The drone only had the first path, so a
  perfectly normal, slightly-jittery click on it would silently select
  nothing — making both "select the drone" and "close its panel" feel
  broken, since the panel's open state just tracks selection. Added the
  drone to the drag-select rectangle check in `scene/controls.js`,
  mirroring the existing ship logic. Verified with a Playwright test that
  simulates real mouse jitter (mousedown → small move → mouseup, not a
  pixel-perfect click) rather than the idealized clicks used in earlier
  testing, which had missed this gap.

## [1.6.0]

### Added
- Programmable drone (`js/drone/*.js`): a second, distinct
  ship (gold octahedron) that never flies on its own — it only moves by
  running a script the player writes and selects/deselects like any other
  unit (selection ring, RTS-style — the camera never reacts to it).
  - Own small scripting language with `if`/`else`, `while`, variables and
    the usual operators, executed by a generator-based interpreter so
    `move()`/`turn()`/`wait()` can pause the script for real time without
    blocking the game loop.
  - Builtins: `move(n)`, `turn(deg)`, `wait(s)`, `attack()`, `fuel()`,
    `maxFuel()`, `nearPlanet()`, `print(x)`.
  - Attack power bites planets like the swarm's ships; a Defense stat
    gives it a chance to survive a black hole's kill radius (knocked back
    out) instead of being destroyed outright.
  - Fuel drains with `move()` and only refills by flying close to a
    planet/sun (no passive regeneration) — scripts have to actually
    navigate, not just sit and wait.
  - Side panel (live 3D thumbnail, status, fuel/attack/defense) opens on
    selection; its Script button opens an editor with Run/Stop, an error/
    log readout, and a `[?]` reference button listing every function with
    a description and a runnable example.
  - Safety guard: a script step limit stops a runaway loop (e.g. missing
    a `wait()`) after 2000 resumptions instead of hanging the tab — this
    was a real bug found while testing (a loop with no function calls at
    all didn't yield even once, freezing the browser outright) and fixed
    by making every `while` iteration yield a checkpoint unconditionally.

## [1.5.2]

### Fixed
- Caught a live, actively-running exploit: a script was inserting
  fabricated "sun" bodies directly via REST (radius ~6, `value_bonus=90`,
  `health≈0.37`) — a shared `radius`/`value_bonus` range across all body
  kinds let a body disguised as a cheap-looking kind claim wildly inflated
  size/value, worth ~4x a real sun for one trivial hit. Found and removed
  21 fabricated copies live in the shared world.
- `bodies_radius_check` and `bodies_value_bonus_check` are now checked
  **per kind**, with generous headroom above each kind's actual
  `radiusMin`/`radiusMax`/`valueBonus` in `js/bodies/*.js`, instead of one
  shared range for every kind.
- Added per-actor rate limiting to `bite_body` (max 20 calls/second) — a
  script hitting the RPC directly in a tight loop could one-shot every
  body the instant it spawned, far faster than any real client (which
  only sends one call per damaged body per ~150ms), starving the shared
  world faster than it could ever be replenished.

Verified live: the exact fabricated-sun payload and a giant fake
meteoroid are both now rejected; a legitimate-looking insert of each kind
still succeeds; 40 concurrent `bite_body` calls against one body correctly
applied 20 and dropped 20; normal gameplay (spawn/eat/points) unaffected.

## [1.5.1]

### Fixed
- The "Refresh now" button on the outdated-version overlay used a plain
  `location.reload()` — effectively F5, which can still serve
  `js/main.js`/`css/style.css` straight from cache if they're within
  GitHub Pages' 10-minute freshness window, since a normal reload only
  revalidates resources the browser already considers stale. There's no
  standard cross-browser JS API for a true hard reload (Ctrl+Shift+R).
  Now navigates to a cache-busted URL instead (`?_=<timestamp>`), which
  guarantees a real fetch since it's a URL the browser has never seen.

## [1.5.0]

### Fixed
- Diagnosed and fixed a class of silent multiplayer desync: the Realtime
  channel's `subscribe()` callback only ever handled the `"SUBSCRIBED"`
  status — a dropped socket (sleep/wake, network change, a token expiring
  during a long background period) that didn't fully self-heal left a
  client permanently deaf to other players' actions, while its own local
  gameplay (ship movement, biting, spawning — all plain REST calls,
  independent of the socket) kept working normally with zero visible sign
  anything was wrong.
- That silent desync also had a dangerous side effect on the steward
  top-up logic added in 1.2.1: a disconnected client's view of the world
  looks perpetually under-populated (it stops receiving others' spawns),
  so it could end up flooding the shared world with duplicate bodies via
  plain REST inserts, unaware anything was wrong.

### Added
- `net/connect.js` now handles `"CHANNEL_ERROR"`/`"TIMED_OUT"`/`"CLOSED"`
  with an exponential-backoff reconnect (capped at 30s), and exposes
  `isConnected()` so `maintainPlanetCount()` refuses to spawn anything
  while disconnected, closing the flooding risk above.
- A small non-blocking "⚠ Reconnecting to server…" badge appears while
  disconnected — deliberately based on the channel's own reported status,
  not a "gone quiet" timer, since a quiet-but-healthy connection (nobody
  else playing right now) would otherwise look identical to a dead one.
- `bootstrapWorld()` now reconciles local state against a fresh fetch on
  every (re)connect, silently removing anything tracked locally that no
  longer exists server-side — catching up on deletes a reconnecting client
  missed while offline, since Realtime never replays missed events.

Verified live: forcibly closing the channel correctly shows the badge and
freezes local body count with no spawn attempts; the automatic reconnect
recovers cleanly with no errors or duplicate state.

## [1.4.1]

### Fixed
- A destroyed planet/sun/meteoroid could occasionally vanish silently
  (no breakup effect) for other players instead of exploding. The
  DELETE handler decided "was this eaten?" from a locally-tracked
  `health` value that depends on an earlier, separate UPDATE event
  having already arrived — if that update was ever delayed or dropped
  (e.g. a brief network hiccup, plausibly right as someone's connection
  is dropping), the guess came out wrong. Since a planet/sun/meteoroid
  can never leave the database for any reason other than being eaten
  (only comets ever legitimately despawn by flying out of the field),
  it's now always treated as eaten regardless of local health state;
  comets keep the health-based check since they're the one case that
  genuinely has two outcomes.

## [1.4.0]

### Added
- Version check (`js/versionCheck.js`): a page that's already open never
  re-fetches its own JS, so a long-lived tab keeps running whatever code
  was live when it loaded regardless of later deploys. The game now
  periodically re-fetches `js/version.js` itself (bypassing HTTP cache)
  and, if what's actually deployed is newer than what this tab is
  running, shows a blocking "please refresh" overlay — not dismissible
  except by reloading — so a stale client can't keep playing against
  game/network logic that may have moved on.

## [1.3.0]

### Added
- Nickname profanity filter (`js/moderation.js`): rejects offensive
  nicknames (English/Polish, with basic leetspeak-evasion handling) when a
  player tries to confirm their own nick, with an on-screen message. Since
  a modified client could still broadcast a raw nick straight over the
  WebSocket regardless, every remote player's nick is also re-checked
  before display and swapped for the generic fallback name if it's flagged
  — the real defense, matching this project's existing "never trust
  broadcast data" approach to multiplayer.

## [1.2.2]

### Fixed
- Added cache-busting (`?v=1.2.2`) to `css/style.css` and `js/main.js` in
  `index.html`, so a fresh page load shortly after a deploy is less likely
  to pick up a stale cached file (GitHub Pages serves everything with only
  a 10-minute `Cache-Control`). Doesn't help an already-open tab, which
  never re-fetches anything until reloaded regardless.

## [1.2.1]

### Fixed
- Diagnosed a live incident where a player left their tab open but
  inactive (frozen/backgrounded) after building up a large fleet and
  eating much of the shared world — since Presence-based steward election
  only reacts to an explicit disconnect, that stalled client stayed
  "steward" forever, so nobody topped up the world (confirmed live: body
  count dropped 8→6→4→4 over 45s with zero replenishment). Added a
  staleness fallback: if nothing has spawned in 8-12s (jittered per
  client) despite being under the target count, any client tops up
  instead of waiting forever for a steward that may never reconnect.
  Verified live: growth resumed within the expected window once the
  fallback engaged.

## [1.2.0]

### Added
- **Tech** button next to Wiki: the upgrade tree moves off the always-on
  bottom dock into an on-demand centered modal (a responsive grid, so it
  fits the screen regardless of size instead of a single row that could
  overflow).
- **Fleet** button: lists every ship in the swarm; clicking one opens a
  small picture-in-picture **ship cam** — a second camera rendered into a
  corner window, sitting at that ship and facing the way it's facing, like
  a cockpit view. Closable from its own button or Escape.

## [1.1.1]

### Fixed
- Closed a live exploit in the Supabase backend: `bodies` and `world_meta`
  had a permissive `UPDATE` RLS policy that let any anon-authenticated
  client bypass the atomic `bite_body` RPC entirely — set a body's health
  straight to 0 with a direct `update`, then land one trivial hit to
  instantly "kill" it and collect its full point value for free. Removed
  the permissive policies and made `bite_body`/`claim_world_init`
  `SECURITY DEFINER` (with a locked `search_path`) so they no longer need
  one. Verified against the live project: the exploit is closed and normal
  gameplay damage still works.

## [1.1.0]

### Added
- Centered **Setup** modal window (replacing the panel built into the
  banner), with **Language**, **Mouse** and **Help** tabs.
- Mouse settings: invert X/Y camera rotation (right-drag) and swap
  left/right mouse button — persisted locally (`js/settings.js`).
- **Help** tab in Setup with the controls explanation (previously a
  permanent hint box on the HUD).
- **Wiki** button that shows/hides the celestial body legend (previously
  always visible in the bottom-left corner).
- Vertical collapse toggle on the telemetry and players HUD panels.
- Hover tooltip on any celestial body: type, health and estimated point
  value (planets/suns/comets/meteoroids), or remaining lifetime and a
  hazard warning (black holes).

### Changed
- Players panel moved to the top-right (the spot freed up by removing the
  permanent controls hint).
- On-screen messages (planet devoured, orders, selection) are now
  centered on screen instead of pinned to the top-left.
- Panel collapse buttons enlarged (previously barely clickable).

## [1.0.0]

First versioned snapshot of the game — covers all work up to this point:

### Added
- Multiplayer via Supabase (anonymous session, no login): a shared, live
  world (planets, suns, comets, meteoroids, black holes) and other
  players' swarms visible in real time; a "steward" election handles
  world upkeep without a dedicated backend.
- Nickname required before entering the game, plus a players-online panel.
- Multiplayer hardening (RLS policies, protection against a malicious client).
- Animated, volumetric-looking sun corona and gradient rays (real 3D
  geometry, not a flat sprite).
- Fixed black hole disk rotation (texture no longer slides sideways).
- Comets reworked to look like rocky meteoroids with a fading tail.
- Neutral planets with a realistic surface (oceans, continents, polar
  caps, equatorial deserts) generated with simplex noise.
- Standalone parameter editor (`editor.html`) for all 7 body types, with
  a live 3D preview and file-download export.
- Body types split into 7 separate files/objects (`js/bodies/*.js`).
- Full English UI by default, with a Polish toggle.
- Small quality-of-life additions: a dice button to randomize the
  nickname, Escape reopens the start screen, inverted horizontal
  right-drag camera rotation.
- Introduced the version number shown in the game's title.
