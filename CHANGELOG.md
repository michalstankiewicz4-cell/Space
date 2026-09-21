# Changelog

All notable changes to the game, version by version. The version number is
shown next to the title on the start screen and in the browser tab title
(see [`js/version.js`](js/version.js)).

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
- Programmable drone (`js/drone/*.js`), Colobot-inspired: a second, distinct
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
