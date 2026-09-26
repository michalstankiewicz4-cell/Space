# Architecture notes (full detail)

Referenced from [`CLAUDE.md`](../CLAUDE.md)'s condensed architecture map —
this file holds the full history/verification behind each design decision
(why it was chosen, live bugs found and fixed, exact function names). Read
the relevant section here before touching that subsystem; CLAUDE.md's own
map is enough for orientation but not enough to safely modify this code.

## Contents

Section names only (no line numbers — they'd go stale). To jump to one
without reading the whole file: grep `^## ` for its current line number,
then read just that range.

- [Body types](#body-types)
- [Module split: bodies.js and controls.js](#module-split-bodiesjs-and-controlsjs)
- [Ship movement: explicit orders only](#ship-movement-explicit-orders-only)
- [Camera modes](#camera-modes)
- [Multiplayer and the steward](#multiplayer-and-the-steward)
- [Solar system and gravity](#solar-system-and-gravity)
- [Comets](#comets)
- [Realtime channel health](#realtime-channel-health)
- [Comet DELETE handling](#comet-delete-handling)
- [Settings, identity and i18n](#settings-identity-and-i18n)
- [Nickname moderation](#nickname-moderation)
- [Ship cam](#ship-cam)
- [Sky backdrop (nebulae, stars, pulsars)](#sky-backdrop-nebulae-stars-pulsars)
- [Programmable drone](#programmable-drone)
- [Space station](#space-station)
- [UI kit (start screen and setup modal)](#ui-kit-start-screen-and-setup-modal)
- [In-game HUD](#in-game-hud)
- [Load order and first paint](#load-order-and-first-paint)
- [Rendering and ShipKit models](#rendering-and-shipkit-models)

## Body types

- **Body types are data-driven**: each of the 7 celestial body kinds (sun,
  ice/neutral/volcanic planet, comet, meteoroid, black hole) is a plain
  object in its own file under `js/bodies/`, aggregated by `js/content.js`.
  A "planet" DB row only stores `kind`+`temp`, not which of the 3 planet
  variants generated it — `variantForTemp()` re-derives it deterministically.

## Module split: bodies.js and controls.js

- **`world/bodies.js` and `scene/controls.js` are split by concern, not by
  feature** — both grew large enough (500+/350+ lines) across several
  sessions' worth of additions that a codebase-structure review flagged
  them. `world/bodies.js` kept only body *lifecycle* (materialize/spawn/
  despawn/update/destroy); the pure kind+temp math (originally including
  `pickBodyType`, since removed — see the "Solar system"/"Comets" bullets
  below for why only comets are still randomly rolled at all —
  `variantForTemp`, `bodyParams`, `bodyVariantKey`, `bodyValueEstimate`,
  `tempColor`, `randomPlanetSpawnData`) moved to `world/bodyParams.js`, and
  the optional-decoration mesh builders (`buildSunRays`, `buildCometTail`,
  the selection-bracket sprite, `setPlanetSelected`) moved to
  `world/bodyMeshParts.js` — the same "model-building lives in its own
  file" split `station/stationModel.js` already used, just applied
  retroactively to the file that had accumulated the most. `scene/controls.js`
  similarly kept only camera state + the actual selection/event-wiring
  logic; the five `pickXAt()` raycast functions (+ the shared
  `THREE.Raycaster` instance) moved to `scene/picking.js`, and the hover
  tooltip (`showTooltip`/`showBlackHoleTooltip`/`hideTooltip`, previously
  reaching into module-local DOM refs) moved to `scene/tooltip.js` behind
  its own `initTooltip()`. **This was a pure reorganization — every
  function kept its exact same behavior, just a new import path** — verified
  live afterward by watching real `bite_body` RPC traffic (30 calls, all
  200s, health decreasing correctly) during a full eat-a-planet cycle, not
  just a lint/load check, specifically because the Supabase-facing code
  (`net/bodiesSync.js`, `requestSpawnPlanet` — since renamed
  `requestSpawnComet`, see below) was among the files whose imports had to
  be repointed at the new module boundaries.

## Ship movement: explicit orders only

- **Ships only ever move on an explicit order.** `ships/swarm.js`'s
  `updateShips()` sets a ship's `target` straight from `commandedTarget`
  (set by `commandTo()` in `scene/controls.js`, when ships are selected
  and a planet is clicked) — there is no automatic nearest-planet
  fallback. There used to be one (`nearestPlanet()`, removed): it made
  idle ships drift toward whatever was closest with zero player input,
  and clicking a planet with nothing selected silently sent the *entire*
  swarm. Clicking a planet with no selection now just shows a "select
  ships first" toast (`toast.noSelection`) instead of doing anything.

## Camera modes

- **"focus" mode (v2.14.0)**: `scene/controls.js#focusCameraOn(body)`
  orbits one body from `ctx.planets` (planet, Sun, meteoroid, comet) and
  follows it along its orbit — pivot = the body's live position,
  default framing from its sunlit side a little above the orbit plane,
  radius 6 × body radius, zoom range scaled to the body
  (`focusZoomRange()`). A minimap click on a body does exactly what
  clicking it in the world does (select / order the selected ships) and
  then calls it. Neither toggle button is lit in this mode; either one
  leaves it. If the body disappears (a comet flies off or is eaten) the
  camera falls back to "system". **Every mode change glides** over
  `CAM_TRANSITION_S` (1 s): pivot, azimuth (the short way round), polar
  angle and radius (in log space, so 950 → 12 looks even) are eased from
  the previous framing — except the very first `setCameraMode("base",
  { instant: true })` at startup. The minimap's green camera frame
  follows the focused body.
- **The black hole is selectable (v2.15.0)** — in the world
  (`pickBlackHoleAt`) and on the minimap, `scene/controls.js#
  clickBlackHole(bh)`: a selection bracket like a planet's and its own
  read-only info panel (`ui/hud/blackHolePanel.js`: radius, pull range,
  point of no return). Never part of the planet multi-select and **never a
  course target** — clicking it with ships selected just selects it (an
  order would feed the ships to it). A minimap click also focuses the
  camera on it (`focusCameraOn` takes any body with a `mesh` or a
  `group`, `bodyPosition()`). Its hover tooltip showed "time left" from
  the long-gone expiring black hole (NaN) — it shows the pull range now.
- **Every minimap object is clickable (v2.15.0)**: planets, the meteoroid,
  comets, the Sun (it used to be drawn without a pick) and the black hole
  select + focus the camera; the station selects + switches to "base".
- **Small bodies are easier to click (v2.15.0)**: when the ray misses,
  `scene/picking.js#pickPlanetAt` falls back to the nearest body within
  14 px of the cursor on screen (`pickSmallBodyAt`) — comets are small and
  fast, and anything far away is only a few pixels.

- **Camera has two modes, toggled top-center in the HUD** (`scene/
  controls.js#setCameraMode()`, v2.0.6): "system" orbits the Sun at the
  origin (the original, only view before this); "base" orbits the
  player's own station instead, and is the default on load. Both modes
  share the exact same spherical-orbit math (`camState.az/pol/radius`,
  drag to rotate, scroll to zoom) — only the pivot point differs
  (`updateCamera()` picks `ctx.station.pos` vs. the origin based on
  `camState.mode`), so switching modes never turns off player control.
  **The base camera's default framing is derived from the station's own
  position, not hardcoded** — since the station sits at `stationPos` with
  the Sun at the origin, `normalize(stationPos)` is exactly the direction
  from the Sun to the station; reusing that same direction as the
  camera's own default orbit angle around the station places the default
  camera further out along that same ray, on the station's far side from
  the Sun, so looking back at the station puts the Sun directly behind it
  (verified via NDC screen-space projection: Sun and station land within
  ~0.09 of each other horizontally). The camera's `pol` (elevation) is
  then lifted by `BASE_CAM_ELEVATION_LIFT` (0.35 rad) above that exact
  angle, per the user's own explicit "słońce widoczne trochę jakby nad
  bazą" (Sun visible a bit like above the base) spec — breaking the
  dead-center alignment just enough that the Sun reads as peeking out
  above the station instead of being invisibly hidden squarely behind its
  silhouette (verified the same way: Sun's NDC Y ≈0.70 vs. the station's
  own ≈0, i.e. clearly above center while the station sits dead center).
  Zoom range is mode-aware too (`BASE_ZOOM_RANGE`/`SYSTEM_ZOOM_RANGE`) —
  "base" orbits something station-sized (silhouette radius ~4.5), so it
  needs a much tighter range than "system" orbiting the whole ~890-unit
  solar system; using one shared range for both would make one of the two
  either impossible to zoom in properly on or trivially easy to zoom
  through entirely. `setCameraMode()` runs once at startup right after
  `spawnStation()` in `main.js` (not inside `initControls()`, which runs
  before any station exists yet) so the "base" default has a real
  `ctx.station.pos` to derive from immediately, not a fallback.
  (`planetEditor.html` used to reuse this module for its own preview
  camera, relying on `updateCamera()`'s `ctx.station` guard to fall back
  to the origin pivot; the editor was removed in v2.2.1, the guard stays.)

## Multiplayer and the steward

- **Multiplayer** (Supabase, anonymous auth, no login UI) splits into two
  completely different sync models depending on whether a body is
  permanent — see the "Solar system" and "Comets" bullets right below for
  the mechanics of each. Other players' ship/drone/station positions stay
  ephemeral Realtime Broadcast, never written to the DB, same as always. A
  **steward** — the Presence member with the smallest `(joined_at,
  client_id)` — is still the only client responsible for topping up the
  shared world, but that responsibility narrowed to just comets once the
  9-orbit rewrite shipped (the 9 fixed bodies + Sun are seeded once by the
  DB migration, never spawned/topped-up by any client); re-elected
  automatically if the steward disconnects. Presence re-election only
  fires on an explicit disconnect, so a steward whose tab is backgrounded/
  frozen (but whose socket hasn't actually dropped) can stay "steward"
  forever while doing nothing — `net/bodiesSync.js#maintainComet()`'s
  staleness gate (`net/stewardFallback.js#createStalenessGate`) lets any
  other connected client step in once it's been suspiciously longer than a
  comet's own full lifecycle (transit + cooldown) since one last appeared.

## Solar system and gravity

- **The world is a fixed 9-orbit solar system, not the old randomly-
  scattered, endlessly-respawning pool of up to ~40 bodies** (v2.0.0,
  `world/solarSystem.js`'s `SOLAR_BODIES` table: Sun at the center, orbits
  1-2 volcanic, 3 & 5 neutral, 6-7 ice, 8 a single meteoroid, 9 a
  *permanent* black hole, orbit 4 reserved as the ring every player's
  station spawns on (`STATION_RING`) rather than holding a body at all).
  Each body is a hand-picked, permanent fixture — DB-seeded once by the
  migration, never spawned/despawned by any client. Position is a pure
  closed-form function of wall-clock time (`bodyPosAt(slot,
  nowSimTime())`, a direct port of `test.html`'s own elliptical-orbit
  formula: semi-major/minor axis, inclination, ascending node, phase +
  angular speed) — no epoch to sync, every client independently computes
  the same position from `Date.now()`. Health is "eaten but never
  destroyed": it regenerates over time from a `(healthBase,
  healthUpdatedAtMs)` checkpoint (`SOLAR_REGEN_RATE` health/s), recomputed
  fresh on every read rather than ticked in place — the same "pure
  function of last-known-state + elapsed time" shape comets already used
  for position. The matching server-side RPC, `bite_solar_body`
  (`supabase/schema.sql`, replacing `bite_body` for these 9+1 slots), had
  a real live exploit during development: its first version used a bare
  `health_now > 0` edge-trigger for `killed`, but continuous regen ticks
  health up from 0 by a tiny sliver almost immediately, so a second
  rapid-fire bite could show `killed:true` again within milliseconds —
  fixed to a `health_now > max_health*0.1` threshold, verified live (5
  rapid bites → only the 1st shows `killed:true`). The exact same bare
  `>0` bug existed client-side too, in both `js/ships/swarm.js`'s and
  `js/drone/drone.js`'s offline-mode kill resolution, and got the same fix.
  - **Ambient patched-conics gravity** (`world/solarGravity.js#
    updateSolarGravity()`, called from `main.js#tick()` before
    `updateShips()`/`updateDrone()` so this frame's pull is integrated the
    same frame) pulls ships/the drone toward whichever fixed body's
    sphere of influence (`soiRadius`, derived from that body's own mass
    vs. the Sun's) they're currently inside, falling back to the Sun
    otherwise — the same model `test.html`'s own prototype used, and the
    same one `world/cometPhysics.js` reuses for comets (see below), just
    simplified to "always the Sun" there since a comet's fast transit
    never lingers inside a planet's much smaller SOI. Black holes are
    excluded from this loop on purpose (`if(b.kind==="blackhole")
    continue`) and stay a separate, permanent case in
    `world/blackholes.js` (gravity + kill radius unchanged from before
    the rewrite, just no more spawn/expiry timer now that there's exactly
    one, permanent black hole at slot 9).
    **The Sun itself had to be excluded from that same loop too (v2.0.9)
    — a real, ~900x-undershoot live bug, not just a design nuance.**
    `SOLAR_BODIES[0]` (the Sun) has `soiRadius = Infinity` (its own `a=0`
    means no SOI competition is needed against other bodies), so without
    excluding it explicitly, it always "won" the primary-body competition
    trivially for anything not actually inside a real planet's SOI — at
    its own generic per-body `gm` (`radius³*0.9` ≈ 66.7 for the Sun's
    radius 4.2), not the real `GM_SUN` constant (60000) that's supposed
    to represent the Sun's actual pull. This silently weakened *all*
    fallback-to-the-Sun gravity (ships and the drone both) to about
    1/900th of its intended strength, for anything not currently inside
    some planet's own (much smaller) SOI — which in practice is most of
    the empty space in the system, including the station's own ~290-unit
    orbit. Been live since this file was first written (v2.0.0), not
    something the v2.0.6-2.0.8 station-field/camera/comet work
    introduced. Found investigating a live report — "I flew the drone far
    from the station and the Sun isn't pulling it" — and confirmed
    directly: calling `updateSolarGravity(1)` (a full second of simulated
    gravity in one call) against a drone placed 300 units from the Sun
    moved it 0.0007 units instead of the real `GM_SUN/r²` prediction of
    ~0.667 — a ~900x mismatch that lines up almost exactly with
    `60000/66.7`. Fixed by also excluding `b.kind === "sun"` from the
    primary-competition loop, same as the black hole already was;
    `GM_SUN`/`bodyPosScratches[0]` (the Sun's actual position) remain
    exactly as they were as the loop's own *fallback* source when no real
    planet's SOI applies — only the accidental *competition* entry was
    the bug. Re-verified after the fix: the same direct call now moves
    that drone by 0.6667 units, matching the real prediction to 6
    decimal places; ships/the drone still sit perfectly motionless within
    `STATION_FIELD_RADIUS` (unaffected, confirmed separately); a drone
    flown 50 units past the station now visibly drifts ~4.3 units toward
    the Sun over 10 seconds — sane and gradual, not explosive.
  - **A second, separate bug surfaced immediately after that fix: the raw
    `GM/r²` acceleration was never capped, so a close pass near a body's
    own `minR` clamp could produce an enormous single-frame velocity
    kick** (v2.0.9) — at `minR` (a real body's own `radius*0.6`, or a
    flat 3 units for the Sun-as-fallback case), `GM_SUN/3² ≈ 6666.7/s²`,
    a ~333 unit/s kick in a single 0.05s frame alone. Found immediately
    while testing the fix above: a ship that reliably reached a real
    planet target in ~250 simulated seconds with gravity disabled never
    arrived at all across 1000 simulated seconds with gravity re-enabled,
    peaking at ~424 units/s (cruise speed is ~1). This is a numerical-
    integration problem — a comparatively large, fixed timestep sampling
    a `1/r²` force too coarsely right at its own singularity — not a
    tuning problem, so `applyGravityToOne()` now clamps the raw `GM/r²`
    figure itself to `MAX_GRAVITY_ACCEL` (20/s², well above any
    legitimate ambient pull — compare ~0.7/s² at the station's own
    ~290-unit distance — so a genuine close pass still visibly matters,
    just can't blow up) before multiplying by `dt`. This alone brought
    the same test's peak speed down to ~11 units/s, but — see the next
    bullet — didn't make gravity-during-commanded-flight actually viable
    on its own.
  - **Commanded ships stay deliberately immune to this gravity while
    cruising, even after both fixes above** (`ships/swarm.js#
    updateShips()`'s own header comment has the full story) — tried
    letting gravity's own contribution persist instead of being
    overridden every frame by the existing course-correction lerp
    (`sh.vel.lerp(toTarget*cruiseSpeed, 0.08)`), first via a bounded
    "seek"-steering replacement (reverted: even a 20x-strengthened
    "engine" couldn't reliably reach a target past a close SOI
    encounter), then by keeping the lerp but simply re-enabling now-
    capped gravity underneath it (reverted too: peak speed dropped from
    ~424 to ~11, but the ship *still* never arrived across the same
    1000-second window — bounded-but-still-real gravity is strong enough
    over a multi-hundred-unit commanded flight that an 8%/frame
    correction alone can't guarantee net progress). Reliable point-to-
    point travel ("select ships, click a target, they get there") is a
    real, load-bearing property of this game, confirmed necessary by
    testing, not just a cautious default — gravity still visibly affects
    anything genuinely idle and the drone (both call
    `world/solarGravity.js` directly, unguarded by any course-correction
    logic), just not a ship actively following an order.
  - **Orbit lines are static, precomputed once** (`scene/orbitLines.js#
    addOrbitLines()`, called from `scene/setup.js#initScene()`) — each of
    the 9 orbits (+ the station ring) is a closed ellipse sampled at 128
    points, since the ellipse's *shape* never changes, only where a body
    sits on it does. All 9+1 lines share one `THREE.LineBasicMaterial`
    instance (dim blue-gray, `fog:false` so they don't wash out at range)
    — reused again for each comet's own one-shot trajectory line, see the
    "Comets" bullet below.
  - **Distances/speeds match `test.html`'s real scale (v2.0.1), not a
    compressed analog** — orbits span roughly 90-890 units from the Sun.
    This had two cascading bugs on first deploy, both found live: (1)
    every orbit's old angular `speed` was carried over unchanged from the
    previous, much smaller distances, which at the new scale made every
    body's actual *linear* speed far higher than a ship's own top speed —
    ships could never catch and dock onto a moving target at all (caught
    via a Playwright test where a ship's target health went *up*, meaning
    it was never actually in eating range). Fixed by retuning every
    orbit's `speed` so linear velocity stays comfortably under ship
    cruise speed — full laps now realistically take tens of minutes
    (innermost) to several hours (outermost), a deliberate tradeoff, not
    an oversight. (2) The skybox (radius 3200 originally) became
    proportionally too close to the new camera zoom range, making its
    32-segment low-poly geometry visibly facet in screenshots — fixed by
    scaling `SKY_RADIUS` up to 9000 (segments 32,20→48,32) and the
    camera's far-clip out to 12000 alongside it. **Lesson for any future
    distance rescale: camera far-clip, fog density, skybox radius, and
    every orbit's angular speed all implicitly assume the *current* scale
    and don't self-correct — budget time to re-check all of them, not
    just the orbit radii themselves.** (A third instance of this exact
    lesson, missed the first time around, is documented in
    [`docs/security.md`](security.md): `bodies_pos_check`/`bodies_vel_check`.)

## Comets

- **Comets are the one body whose position is genuinely SIMULATED, not a
  closed-form function of time** (`world/cometPhysics.js`) — everything
  in the "Solar system" bullet above computes "where am I right now"
  directly from elapsed wall-clock time; a comet's path curves under real
  gravity (`stepComet()`, Euler integration, same `GM/r²` pull toward the
  Sun `world/solarGravity.js` uses for ships), so a client materializing a
  comet it didn't see spawn has to *replay* the simulation from the DB
  row's spawn state up to now (`advanceComet()`, fixed 0.05s sub-steps —
  cheap even for a several-minutes-old comet, since comets are short-lived).
  - **Exactly one comet exists in the system at a time — never a
    population pool.** `net/bodiesSync.js#maintainComet()` is edge-
    triggered: the instant the system is noticed empty, it starts a
    `COMET_RESPAWN_DELAY_MS` (60s) countdown before attempting the next
    spawn, not a fixed-rate timer. This replaced an earlier `MAX_COMETS`-
    capped pool topped up on a fixed interval, per an explicit user
    correction mid-implementation ("not 1 per minute, a 1-minute *gap
    after despawn*") — the population-cap model and the cooldown model
    read almost identically at a glance but produce very different
    pacing, worth keeping distinct in mind if this is touched again.
  - **Entry velocity is solved analytically (vis-viva + angular
    momentum), not just aimed at a target point.** A first version picked
    a random entry point on a sphere well outside the whole system
    (`COMET_ENTRY_RADIUS`, ~1.15x orbit 9's distance) and pointed the
    entry velocity straight at a random point `COMET_PERIHELION` (2/3 of
    orbit 1's distance, the user's explicit spec) from the Sun — this
    ignores how much gravity bends the path over the long inbound leg
    (`COMET_ENTRY_RADIUS` is ~17x `COMET_PERIHELION`), so real
    perihelions landed around 1.5-5 units (nearly grazing the Sun)
    instead of the intended 60, confirmed live by simulating the full
    trajectory and measuring the actual closest approach. Fixed with the
    real two-body closed-form solution: vis-viva (`v_p² = v0² +
    2*GM*(1/r_p - 1/R)`) gives the speed needed at the target periapsis,
    and conservation of angular momentum (`sin(alpha) = r_p*v_p /
    (R*v0)`) gives the entry angle (from purely-radial-inward) that
    achieves it, applied within a randomly oriented orbital plane (any
    direction perpendicular to the entry position works, which is what
    gives comets their varied, non-coplanar swing-bys). Re-verified: real
    perihelions now land within ~0.02% of the target.
  - **The tail always points directly away from the Sun** (real
    solar-wind/radiation-pressure direction — `bodyMeshParts.js#
    updateCometTailDirection()`, called every frame from `updateBodies()`
    since the direction changes continuously as the comet curves), not
    "opposite direction of travel" (the old, astronomically-incorrect
    model that only ever looked right for a straight, unaccelerated
    line). Comets get `spin:0` specifically so the tail group's *local*
    orientation always equals its *world* orientation — a spinning parent
    mesh would otherwise continuously rotate a correctly-world-aimed tail
    back out of alignment.
  - **A comet's own flight path is drawn as a trajectory line** (v2.0.4,
    reusing `scene/orbitLines.js`'s shared line material/style, see the
    "Solar system" bullet above), precomputed *once* at spawn
    (`cometPhysics.js#computeCometTrajectory()`, from the comet's
    *original* entry pos/vel, not the `advanceComet()`-fast-forwarded
    current state — so a late-joining client's line still traces the
    whole path, not just what's left of it) and added as a separate,
    top-level scene object (not a mesh child, since it shows the *whole*
    static path while the comet itself moves along it). Removed
    explicitly alongside the comet's own mesh in both despawn paths
    (`despawnLocalOnly()` for flying out of the field, `destroyPlanet()`
    for being eaten) — a trajectory line has no lifecycle of its own
    beyond its owning comet's.
  - **A stray dotted particle trail, found live, was NOT the comet's
    tail** (v2.0.5) — `spawnTailParticle()` (inherited from ship engine
    trails, since removed) spawned one sparkle particle every fixed 0.03s
    at the comet's current position; at the old, much slower comet speed
    consecutive spawn points overlapped into what looked like a
    continuous streak, but at real comet speeds (up to ~44 units/s near
    perihelion) they end up spaced too far apart, reading as a visibly
    dashed line of separate white dots trailing the comet from certain
    camera angles. Removed entirely (not re-tuned) rather than kept —
    redundant with both the geometric tail and the trajectory line above.
    **Lesson: any fixed-time-interval spawn effect implicitly assumes the
    emitting object's speed stays within some range — revisit it whenever
    that speed scale changes meaningfully**, the same distance-rescale
    lesson the "Solar system" bullet above already flags for orbital
    speed and DB constraints specifically.

## Realtime channel health

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
  constant false alarms. **`js/world/blackholes.js#updateBlackHoles()` had
  this exact gap unfixed for a long time** — no `isConnected()` guard on
  its own steward-gated spawn, *and* no staleness fallback at all (unlike
  `maintainPlanetCount`'s), so a steward whose tab was merely backgrounded
  (not disconnected — Presence re-election needs an actual socket drop,
  not just a throttled `requestAnimationFrame`) meant black holes could
  stop appearing for the whole session with nothing to self-correct it.
  Reported live as "black holes stopped appearing" and fixed the same way
  `maintainPlanetCount` was: `isConnected()` before spawning, plus a
  `lastBlackHoleActivityAt`/`BLACKHOLE_STALE_MS` (90-120s, jittered)
  fallback letting any other connected client step in once it's been far
  longer than the normal 34-58s cadence since one last appeared. Verified
  live with two clients: the non-steward correctly didn't spawn while not
  stale, then correctly did once `Date.now()` was patched far enough
  ahead to cross the threshold — and the result synced to both clients via
  Realtime, same as a steward-spawned one would. **This
  `isConnected() && (isSteward || stale)` shape is now a shared helper**,
  `net/stewardFallback.js#createStalenessGate(baseMs, jitterMs)` — both
  `maintainPlanetCount` and `updateBlackHoles` had independently grown the
  identical pattern by 1.10.15, so it was consolidated into one factory
  returning `{bump(), shouldSpawn()}` rather than staying duplicated a
  third time the next this shape is needed for some other steward-gated
  top-up loop. **Both call sites have since changed** (v2.0.0+): the black
  hole is now one permanent `solar_bodies` row with no spawn/staleness
  logic left in `updateBlackHoles()` at all, and `maintainPlanetCount` was
  renamed `maintainComet` and rebuilt around a single-comet cooldown
  instead of a population cap (see the "Comets" architecture bullet
  above) — but `createStalenessGate` itself is still exactly this shape,
  now with just the one caller.

## Comet DELETE handling

- **A DELETE on `bodies` (comet-only now, see the "Comets" architecture
  bullet above) can mean either "eaten" or "flew back out of the system
  on its own"** — `onBodyDeleted()` in `js/net/bodiesSync.js` distinguishes
  the two with `obj.health <= 0` on the already-known **local** object,
  not a fresh field on the DELETE payload itself: Realtime's DELETE event
  can carry only the primary key (`id`) without `REPLICA IDENTITY FULL`,
  so `oldRow`'s other columns are simply absent, not `null`. Don't
  "upgrade" this to trust a health field straight off the delete
  payload — that depends on a separate, earlier UPDATE event having
  already arrived in order, which isn't guaranteed under network jitter
  (this was a real bug back when `bodies` held every kind: an eaten
  planet could silently vanish with no explosion for other players if
  that UPDATE lagged behind the DELETE). This concern is entirely
  contained to comets now that fixed solar bodies never leave `bodies`
  (or `solar_bodies`) at all — they're eaten in place and regenerate,
  never deleted.

## Settings, identity and i18n

- **Settings vs. identity vs. i18n**: three separate small persisted
  modules, deliberately not merged — `js/settings.js` (local input/UX
  prefs: mouse invert/swap), `js/net/identity.js` (nickname/color, shared
  with other players), `js/i18n.js` (language toggle). Staying separate
  modules doesn't mean duplicating the storage boilerplate, though: as of
  1.10.15 the try/catch-guarded `localStorage.getItem`/`setItem` pair
  (needed since a private/storage-disabled tab throws) had been
  independently reimplemented in six modules (these three, plus
  `drone/drone.js`, `admin/main.js`, `core/gameState.js`) — now they all
  call `core/utils.js#readStorage(key)`/`writeStorage(key, value)` instead.
  Each module still owns its own key name, JSON parsing and defaults; only
  the two calls that can actually throw got deduped. New persisted state
  should use these too, not a fresh inline try/catch.

## Nickname moderation

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

## Ship cam

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

## Sky backdrop (nebulae, stars, pulsars)

- **Since v2.12.0 the sky is BodyKit's** (`js/bodykit/bodykit.js`, the SKY
  group, kind `"sky"`; `js/scene/skybox.js` builds and updates it; the
  body lab's SKY tab edits it and the lab shows it behind every body). It
  replaces the old canvas nebula sphere, the `THREE.Points` starfield in
  `scene/setup.js` and the sprite pulsars (`scene/pulsars.js`, deleted).
- **Baked, not drawn live**: black space, a Milky Way band (clumps, dust
  lanes) and the nebulae (regions of domain-warped noise: glowing gas,
  wisps, hot cores, two colors, dark dust dimming only the gas) are a
  heavy full-screen shader, so BodyKit renders it once into a cube map
  (`CubeCamera`, 1024² per face at detail 1) and draws a sphere that just
  samples it (`textureCube` by direction — verified pixel-identical to the
  live shader, no face flips). It re-bakes only after a change (a slider,
  `setOctaves`), ~40–100 ms; the first bake + compile ~1.2 s is lost in
  the start-of-game shader compile (measured: the game's first-frame stall
  is the same ~1.15 s with or without the sky).
- **Stars and pulsars are points** (one `THREE.Points`, 14 000 max stars,
  `stars` picks how many via the draw range): colors from their
  temperature (`blackbody`), mostly faint, 40% crowding toward the Milky
  Way's plane, ~12% twinkling (`twinkle`); the first 6 vertices are
  pulsars (`pulsars` shows 0–6) with a period each, a bright core and
  cross-shaped beams drawn in the point sprite. Positions come from a
  seeded RNG (`seededRandom`), so a sky is the same for everyone.
- **Infinitely far**: `updateSkybox(dt)` (main loop) passes the camera
  position (`opts.center`) — the sky group follows the camera — and the
  renderer (`opts.renderer`, for the bake and the pixel ratio). Radius
  9000, inside the camera's far plane (12000). The display sphere draws
  first (`renderOrder -1000`, no depth write), the points are additive.
  BodyKit shaders don't use fog, so the old `fog:false` trap doesn't
  apply. The reflections (`scene.environment`) still come from ShipKit's
  lab sky (brighter than this black sky, which keeps the metal ships
  readable).

## Programmable drone

- **Programmable drone** (`js/drone/*.js`): a single
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
    panel's open/closed state (`ui/dronePanel.js` back then; since v2.2.0
    the HUD's SELECTED UNIT panel, `ui/hud/unitPanel.js#openDronePanel`/
    `closeDronePanel`) — it never touches
    `camState`/`ctx.camera`. Keep it that way; RTS-style "select a unit,
    camera stays put" was an explicit requirement.
  - Fuel only refills by proximity-docking near a planet/sun (no passive
    regen) — see `DRONE_DOCK_RANGE_MULT`/`DRONE_REFUEL_RATE` in config.js.
  - **The script text itself is persisted** (`localStorage["roj-drone-script"]`,
    `drone.js#setDroneScript()`/`spawnDrone()`) — everything else about the
    drone (fuel, position, running state) resets fresh every session like
    the rest of `ctx`, but losing a written script on every browser close
    would be a real loss of player work, unlike those. A separate key, not
    folded into `gameState.js`'s save — same "small persisted modules, not
    merged" reasoning as settings/identity/i18n above, since this is a
    single string with nothing else in common with swarm progress.
  - The drone isn't in `ctx.ships`, so it's handled as its own case
    everywhere ship-like logic exists: `world/blackholes.js` has a
    separate gravity/kill-radius block for it (with a `defense`-based
    survival roll instead of `ships`' unconditional consumption), its
    picking/selection lives in `scene/picking.js` alongside — but
    separate from — `pickShipAt()` (both `pickDroneAt`/`pickStationAt` are,
    as of 1.10.15, one-line callers of a shared `pickSingletonAt(e, obj)`
    helper in the same file, since "zero-or-one pickable object" is the
    same shape for both and only the object differs), and
    `net/shipsBroadcast.js` sends its `[x,y,z,heading]` as its own `drone`
    field on the broadcast payload, separate from the `ships` array (this
    was missed when the drone shipped — other players simply never saw it
    until fixed). A remote drone renders as a ghost octahedron
    (`makeGhostDroneMesh`) tinted by owner color, tracked as
    `remotePlayers[id].droneMesh` — a single mesh, not an array like
    `.meshes` — since there's only ever one drone per player; disposed on
    both `payload.drone === null` and the same
    `NET_REMOTE_PLAYER_TIMEOUT_MS` staleness cleanup as ghost ships. As of
    1.10.15, `makeGhostShipMesh`/`makeGhostDroneMesh` both call a shared
    `makeGhostMesh(geo, colorHex)` (only the geometry differs — the
    flat-recolor material was byte-identical between them), and the
    "target vector + snap-on-first-sighting, then lerp toward it" bookkeeping
    that used to be copy-pasted for ships/drone/station separately in both
    `handleRemoteShips()` and `updateRemoteShips()` is now
    `setGhostTarget(mesh, x, y, z)`/`lerpGhost(mesh, dt)`, called once per
    ghost kind.
  - **`spawnDrone()` deliberately spawns it ~6 units out from the origin,
    away from the swarm's own spawn area** (its pick sphere is also
    smaller than a ship's: 0.5 vs 0.55). This was a real, reported bug,
    not a style choice: the drone is picked *before* ships/planets on
    every click (`scene/controls.js`), so when it overlapped the swarm's
    old spawn cube (both spawned near the origin, pre-v2.0.6), an
    ordinary click meant to command ships onto a planet could silently
    reselect the drone instead — which, since selecting it reopens its
    side panel, was reported and investigated for several rounds as "the
    close button doesn't work" (it did; a subsequent normal gameplay
    click was just reselecting the drone and reopening the panel a moment
    later). **The swarm's own spawn point moved away from the origin
    entirely in v2.0.6** (`ships/swarm.js#shipSpawnPosition()`, now a
    golden-angle spiral around `ctx.station.pos` — see the new "Ships
    spawn at the station" bullet below), so this exact overlap can't
    recur the way it originally did; the drone's own spawn point wasn't
    touched by that change and still sits near the origin (i.e. now near
    the Sun specifically, not just "empty space" the way it was
    pre-9-orbit-rewrite) — if the drone ever needs revisiting, that's a
    separate, not-yet-reported concern, not the click-priority bug this
    bullet documents.
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
  - **`print()` has a `DRONE_PRINT_COOLDOWN_S` (1.5s) client-side cooldown
    (`drone.lastPrintAt`, checked in `triggerPrintFx()`) — the only lever
    against print-spam that exists, and a limited one.** Broadcast
    messages never touch the database at all, so there's nothing there to
    rate-limit against the way `bite_body`/`bodies` inserts are (1.9.2) —
    this cooldown lives in plain JS the DSL interpreter can't reach
    around, so it does stop a `while(true){ print(...) }` script with no
    `wait()` (which would otherwise fire as fast as the interpreter's own
    runaway-script step limit allows, up to ~2000 broadcasts in one
    frame) — but a fully custom/modified client bypassing this file
    entirely could still flood the channel directly. Same residual risk
    broadcast traffic already has everywhere else in this project (see
    "Realtime channel health has no free lunch" above) — accepted, not a
    gap introduced by this feature specifically.
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
    panel/overlay (`#shipCam.hidden`, `.modal.hidden`, `#legend.hidden` —
    the old body legend, removed in v2.3.0 —
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
    for it doesn't exist. **Fixed structurally in 1.10.15**, not just
    patched for this one panel: `css/style.css` now has a single generic
    `.hidden{ display:none !important; }` rule (near `.panel`'s own
    definition) instead of the ~15 separate `#id.hidden{...}` rules this
    file used to need one of per panel/overlay — a future hideable element
    needs zero new CSS to support `.hidden`, closing this exact class of
    gap for good rather than just for `#dronePanel`. The `!important` is
    deliberate: several base rules (`#legend`, `#banner`, `#outdatedOverlay`,
    `.modal`) set their own `display` directly, at higher specificity than
    a plain `.hidden` class alone could beat, so `!important` sidesteps
    that comparison instead of requiring every new element to write its
    own `#itsId.hidden{...}` override just to out-specificity its own base
    rule.

- **Block editor** (v2.4.0; `js/blocks/*` = model + compiler, no DOM;
  `ui/windows/blockEditor.js` + `blockPalette.js`/`blockRender.js`/
  `blockDrag.js` = the window). **Blocks compile to the text DSL**
  (`blockCompile.js#compileProject`) and run through the same
  `runDroneScript(drone, src)` — never add a second interpreter.
  - **Two programs, one switch**: `drone/droneMode.js` ("script" |
    "blocks", localStorage `roj-drone-mode`) picks which one START runs
    and which window SCRIPT opens; `drone.script` (text, `roj-drone-script`)
    and the block project (`roj-drone-blocks`) are both always kept. The
    user explicitly asked that switching must never delete either.
    `ui/windows/droneScript.js#runActive` is the one place that decides.
  - DSL additions for it: `repeat (n)`, `def name(params) { }` (hoisted
    from the top level only), `return [expr]` (outside a function it ends
    the script). Function params are locals, everything else is global
    (`env.locals` vs `env.vars` in interpreter.js); `MAX_CALL_DEPTH` (100)
    turns endless recursion into an error. `repeat` and every user call
    yield a `__tick__` like `while` does — keep that, same runaway-script
    reason as the `while` checkpoint above.
  - **Project model** (`blockProject.js`): virtual files (`main` = the ★
    one whose "when started" stacks run; any file may hold definitions,
    callable from everywhere), global vars, defs. Ids (`b12`, `v3`,
    `f7`, `p9`) are the identifiers in the compiled script, so player-typed
    names (Polish letters, spaces) never reach the lexer. Deleting a
    definition (hat dragged to the palette, or its file deleted) purges
    every call to it (`purgeDef`) — a call to nothing can't compile.
  - Rendering is plain DOM (not SVG/canvas) and fully re-rendered on
    every structural change; typing into a field edits the model in place
    without re-rendering, so the field keeps focus. `blockRender.js`
    records every block's position in `ctx.map` (list+index, or owner
    block+slot) — that map is what drag & drop uses to detach/insert.
    Drag measures with `getBoundingClientRect` and divides by the window's
    scale (`ratio()`), since the window is scaled by `--uiScale`.

## Space station

- **Space station** (`js/station/*.js`): one static per-player landmark,
  same "singleton on `ctx`, not an array" shape as the drone (`ctx.station`,
  not `ctx.ships`) — but unlike the drone it never moves once spawned (no
  fuel/commands). `spawnStation()` places it on a deterministic point on
  the station ring (`world/solarSystem.js#STATION_RING`, orbit slot 4's
  own ellipse) derived from a simple hash of this client's own stable
  `clientId` (`angleFromClientId()`) — not a random angle rolled fresh
  each spawn, so a player's station never relocates just because the page
  reloaded or another player joined/left; heading is `angle + PI`, facing
  back toward the Sun. Selecting it (same
  drone-style pick-priority-before-ships/planets treatment in
  `scene/controls.js`, checked right after the drone) opens a docking panel
  (originally its own `#stationPanel`; since v2.2.0 it fills the HUD's
  PLANET INFO slot, `ui/hud/stationPanel.js`) that's read-only for now — fleet
  count, evolution points, a compact icon+level upgrade summary reusing
  `TREE`'s own icons — plus shortcuts into the *existing* Tech/Fleet
  modals. No new resource economy was introduced; "manage resources" here
  just means a window onto `state.points`/`state.levels`, not a second
  currency.
  - **The look is ShipKit's ST-04 HAVEN (v2.13.0)** —
    `js/shipkit/shipkit.js`, built in the ship lab like the ships, placed
    by `station/stationVisual.js#makeStationVisual()`, which both the local
    station (`station.js#spawnStation()`) and every remote player's ghost
    (`net/shipsBroadcast.js#makeGhostStation()`) use, so they can't
    diverge. A spinning habitat ring on spokes, the central spine with the
    greenhouse dome, a solar truss along X, radiators, a comms dish, the
    docking port; merged static meshes (≈30 draw calls), effects in the
    scene, `STATION_MODEL_LENGTH` (10) world units along the truss via
    `makeGameHolder`. It replaced the old primitive-built
    `station/stationModel.js` (deleted).
  - **The ruin is the damage (a story choice by the user)**: the model's own
    `setDamage` stages (dark ring windows from 0.1, a broken hanging solar
    panel from 0.2, a torn ring segment with drifting debris from 0.3) on
    top of the shared smoke/sparks. The game starts every station at
    `STATION_START_DAMAGE` (0.35, config.js) — a ruin, as the story says —
    and repairs are meant to lower it later; `visual.setDamage(d)` keeps
    the value across rebuilds.
  - **Pick sphere and selection ring**: `STATION_PICK_RADIUS` (3.4 world
    units, config.js) around the habitat ring, not the truss tips — the
    station is picked before ships, so a sphere as wide as the truss would
    steal clicks meant for ships parked nearby. The station's own group is
    never scaled (the holder inside the visual is), so these are plain
    world units.
  - **Multiplayer sync rides the same periodic `"ships"` broadcast payload
    as the drone** (a `station: [x,y,z,heading]` field,
    `net/shipsBroadcast.js`) — only that 4-number array crosses the
    network; every client builds the same model locally. **Other players'
    stations are not tinted** (the user's call, like ships and drones): a
    name label with a bar in the owner's color floats above
    (`makeNameLabel` — the only unit that shows the owner's name; ships and
    drones get the diamond marker). Remote stations build at half the
    detail and without particles, and start at the same damage.
  - **Ships spawn arranged around the station, inside a gravity-free
    containment field, instead of scattered near the origin** (v2.0.6) —
    a real problem once ships spawn far from the Sun: with the old
    `+-2` spawn cube (a leftover from before the 9-orbit rewrite, when
    the origin was just empty space), ships would now spawn almost
    inside the Sun's own radius (4.2). `ships/swarm.js#
    shipSpawnPosition(index)` instead places each new ship on a
    golden-angle spiral (the same even, non-overlapping distribution
    phyllotaxis/sunflower-seed-head patterns use — `index * 2.3999...`
    radians per step, radius growing with `sqrt(index)`) centered on
    `ctx.station.pos`, sized so even a full ~23-ship fleet
    (`TREE.fleet`'s max level) stays well inside `STATION_FIELD_RADIUS`
    (11, `config.js`). `index` is just `ctx.ships.length` at spawn time —
    no upfront fleet-size knowledge needed, so `reconcileFleetSize()`
    (buying a Fleet upgrade) adding one ship at a time still gives each
    new ship its own non-overlapping slot, same as the initial fleet
    spawning all at once. `main.js` now spawns the station *before* the
    initial fleet specifically so `ctx.station.pos` already exists for
    this (previously the fleet spawned first).
  - **`world/solarGravity.js#updateSolarGravity()` skips ambient gravity
    entirely for any ship within `STATION_FIELD_RADIUS` of the
    station** (same radius `station/stationField.js`'s own containment
    pull-back already used — one coherent field, not two independently-
    tuned radii: inside it, gravity simply doesn't apply; at/beyond the
    boundary, `stationField.js`'s existing pull-back takes over for
    anything that traveled away and went idle far from home). Before
    this, the existing pull-back alone wasn't enough to keep a freshly-
    spawned fleet parked: it only reacts once a ship has *already*
    drifted past the boundary, so gravity would still tug on ships sitting
    at the station the whole time, in a permanent tug-of-war rather than
    genuinely being exempt. The station itself has no `soiRadius` of its
    own in the patched-conics model (`world/solarSystem.js`'s own header
    comment: orbit slot 4 is "the player-station ring, not a body"), so
    without this exemption, real solar gravity at the station's own
    ~290-unit distance (strong enough to matter, not negligible) was the
    dominant, unopposed pull on anything parked there. Verified live
    (offline mode): three freshly-spawned ships' positions were bit-for-
    bit identical after 8 idle seconds, vs. drifting under the old
    scattered near-origin spawn. Ships only as of v2.0.6 — the drone
    joined this same gravity exemption in v2.0.8, see the dedicated
    bullet right below.
  - **The drone joined the same spawn-near-station + gravity-exemption
    treatment in v2.0.8** (`drone/drone.js#spawnDrone()`,
    `world/solarGravity.js#updateSolarGravity()`) — the user's own
    framing, "it's kind of a ship too." Spawns at a fixed `station.pos +
    (0, 6, 0)` offset rather than joining the ships' own golden-angle
    spiral there: the old reasoning for spawning it away from the swarm
    in the first place (picking the drone is checked *before* ships/
    planets on every click, see `scene/controls.js` — overlapping the
    busy fleet-commanding area meant an ordinary click near the swarm
    could silently reselect the drone instead, previously investigated
    for several rounds as a "close button doesn't work" bug that was
    really a click-priority conflict) still applies just as much now that
    both spawn near the station instead of near the origin — a fixed
    vertical offset keeps it clearly clear of the ships' own small
    `+-1.5` vertical spread at any fleet size, without needing its own
    slot in that spiral. **Deliberately does NOT get
    `stationField.js`'s pull-back-if-wandered treatment, unlike ships** —
    a ship that's wandered off is always either idle (safe to nudge home)
    or actively eating something, in which case `updateShips()` overwrites
    its position outright every frame (the lerp-to-orbit-around-target
    branch), so that pull never actually fights a ship mid-task. The
    drone has no equivalent override: docking/refueling
    (`isDocked()`) is a pure proximity check with nothing pinning its
    actual position, so pulling it back toward the station at
    `STATION_FIELD_STRENGTH` the same way would visibly drag it off
    whatever distant body it's deliberately docked at mid-script —
    breaking the drone's actual point (autonomously roaming/docking
    anywhere in the system), not just nudging an idle unit home the way
    it does for ships. Verified live: `applyStationField()` called
    directly against a drone placed far from the station left its
    position completely untouched (confirmed structurally too — the
    function's loop only ever iterates `ctx.ships`).

## UI kit (start screen and setup modal)

- **New UI kit (start screen + setup modal, v2.1.0)**: ported from the
  standalone single-file mockup (`UI-start.html`, deleted once fully
  ported — the game itself is now the reference). File layout: `css/ui/kit.css` holds
  the shared primitives (`.uiStage`, `.mat` + color variants, `.uiPanel`,
  `.hdLine`, `.oBtn`), one CSS file per screen next to it
  (`startScreen.css`, `setupModal.css`), all linked from index.html's
  `<head>` without a `?v=` of their own, so `css/style.css`'s stays the
  only CSS cache-busting literal (they're in `versionCheck.js#
  MODULE_FILES` instead). They used to be `@import`s inside style.css,
  switched to parallel `<link>`s in v2.2.1 (see "Load order"). The `.mat` grain is a static
  `css/ui/grain.png` (regenerate with `tools/grainTexture.html`), not
  generated at runtime anymore (v2.1.3). JS side: `ui/banner.js` (start
  screen only),
  `ui/setupModal.js`, and `ui/escapeKey.js` (the global Escape priority
  chain, a table of `[isOpen, close]` pairs — add new overlays there).
  Language-dependent text refreshes via `i18n.js#onLangChange()`
  subscribers, not a hardcoded callback list in whoever calls `setLang()`.
  `.uiStage` is a fixed 1536x1024 design (everything absolutely positioned
  in design pixels), scaled by the `--uiScale` CSS var, which is set by an
  inline `<head>` script in `index.html` — deliberately not a module: as
  one it only ran once main.js and all its imports had loaded, and the
  start screen flashed at full size until then (v2.1.1). Anchored to the
  top edge so the top bar stays on top on portrait screens. The top bar
  itself is *not* in `.uiStage` but in a `.uiBar` (v2.1.4): a
  full-window-width strip in the same scaled design-pixel space, whose
  width in design px is `100% / --uiScale` — left-group elements use
  `left`, right-group ones `right`, and the two rails use both, so they
  stretch with the window. Gotchas: the
  kit's button reset is wrapped in `:where(.uiStage)` on purpose — at
  normal `.uiStage button` specificity its `background:none` beats `.mat`
  and every material button renders transparent. The old HUD's `.panel`
  class (removed in v2.2.0) was unrelated — the kit uses `.uiPanel` to avoid colliding
  with it. The start screen is translucent over the live scene, so the
  HUD is hidden while it's open via `body:has(#banner:not(.hidden))` in
  CSS, no JS. `.setupCheckRow` is shared with the dev tools menu, so the
  kit's toggle-switch styling is scoped to `#setupModal`. The in-game HUD
  was ported onto the same kit in v2.2.0 — see the next section.

- **Start screen extras (v2.2.0)**: live player counters centered on
  the top bar's rails (`ui/playerCounts.js` — online = this client +
  `ctx.remotePlayers`, same as the HUD's slot; registered = the public
  `player_count()` RPC, see docs/security.md; both only refreshed while
  the start screen is open, "—" until known, hidden in offline mode), a
  [?] button opening the About window (`ui/about.js`, a `.uiWindow`),
  and a Graphics tab in Setup holding the ship lab's two sliders, inert
  for now (setup tabs and panels are matched by `data-tab`, so a new tab
  is markup + one i18n key, no JS change).
- **Story intro (v2.6.1)**: the description is the story opening
  (`banner.boot` — a terminal-style line in `#bannerBoot` — plus
  `banner.desc`, two paragraphs split by a `
` that `#bannerDesc`'s
  `white-space:pre-line` keeps). The panel grew 40px for it; `#box` and
  everything below the description are positioned in fixed design px,
  so a longer text means shifting those tops too. In i18n.js the break
  must be the two characters `
` inside the string — a real line break
  there is a syntax error that silently leaves a non-English start panel
  blank (it happened once).

## In-game HUD

- **Ported from the `UI-standalone.html` mockup (v2.2.0; the mockup was
  deleted afterwards, the game is now the reference)** — its layout 1:1
  (top bar, left nav, fleet list, selected unit, 3D viewport frame,
  command bar, planet info, event log, minimap), wired to every feature
  the old HUD had. `#hud` is a **`.uiScreen`** (css/ui/kit.css): like
  `.uiBar` but in both axes — the whole window in design pixels (never
  less than 1536x1024), so each element anchors to the edge it sits
  against (css/ui/hud/): left column left, right column right, bottom
  row bottom, and the viewport, fleet list and event log stretch.
  Shared top-bar pieces (logo, title, end cap) are classes in
  css/ui/topBar.css used by both the start screen and the HUD; SVG
  gradients live in one always-rendered `#uiDefs` block in index.html
  (a `url(#id)` paint server inside a `display:none` subtree stops
  rendering). Windows opened from the HUD (Research, Fleet,
  Diplomacy, Wiki, drone script, drone blocks) share `.uiWindow`
  (css/ui/windows/).
- **File layout mirrors the UI**: `js/ui/hud/` has one module per HUD
  panel (topBar, nav, fleetList, unitPanel, infoPanel + planetPanel/
  stationPanel, eventLog, connectionStatus, minimap, commandBar,
  devTools) plus `hud.js`, the HUD's only entry points for main.js —
  `initHudShell()` (before the scene), `initHudWorld()` (after it) and
  `updateHud(dt)` (every frame; runs the ~0.1s/0.4s refresh timers).
  `js/ui/windows/` is the same for the windows (`windows.js#
  initWindows/refreshWindows` + research, fleet, players, droneScript,
  wiki + wikiEntries/wikiArt, blockEditor + blockPalette/blockRender/
  blockDrag).
  CSS mirrors it one file per component in `css/ui/hud/` and
  `css/ui/windows/`, each its own `<link>` in index.html's `<head>`, in
  cascade order (style.css last). `showToast()` lives in `ui/hud/eventLog.js` (it only feeds the
  event log now); a new panel goes in as its own module + CSS file,
  wired through hud.js.
- **The 3D view renders into the viewport rect only**
  (`scene/viewRect.js`): the canvas still covers the whole window, but
  `renderMainView()` clears it black and draws the scene with
  viewport/scissor set to `#viewport`'s box (the whole window while the
  start screen is open, so the scene still shows behind it), keeping
  `camera.aspect` in sync. Picking (`scene/picking.js`) and
  `controls.js#screenPos` use the same rect; presses/scrolls/hover
  outside it are ignored (the gaps between panels are still canvas).
  Miniatures (`scene/unitThumb.js`, `scene/infoThumb.js`) and the ship
  cam render into their own elements' boxes via `renderIntoElement()`.
  **HUD panels have no fill** (`#hud .uiPanel::before{background:none}`)
  because those miniatures are drawn on the canvas *underneath* the
  panels — a 90% fill made them look nearly black (found by testing,
  not an obvious one). Miniatures also get a "studio" PointLight at the
  camera, permanently in the scene with only its intensity toggled per
  pass (adding/removing a light would recompile every shader), and a
  raised near plane so station struts between camera and ship get
  clipped.
- **Where every old HUD feature went** (so nothing got lost): telemetry
  -> the top bar's four slots; players list -> DIPLOMACY window; body
  legend -> the Wiki's Planets tab (PLANETS nav); Tech -> RESEARCH window (also the station's Tech
  button); Fleet window -> FLEET nav + station's Fleet button (plus the
  always-visible FLEET LIST panel, same click behavior); Setup ->
  SETTINGS; camera Base/System toggle -> top-center of the viewport; Dev
  Tools -> wrench in the viewport's bottom-right; ship cam -> the
  viewport's top-right, toggled by the fleet-list card or the CAM button
  in SELECTED UNIT; drone panel -> SELECTED UNIT in drone mode
  (Start/Stop/Script buttons, `ui/windows/droneScript.js` keeps its old open/close
  API on top of `ui/hud/unitPanel.js`); station and planet panels -> the
  shared PLANET INFO slot (`ui/hud/infoPanel.js`, owner-tracked so a late
  "close planet" can't blank the station); toasts -> EVENT LOG
  (`showToast(msg, kind)` still the one entry point). BUILD nav, the command bar's orders, the planet's Waypoint/Scan/Colonize and
  the ship quick buttons are deliberately inert ("Coming soon"), as are
  the top bar's time controls (multiplayer can't pause).
- **Wiki** (`ui/windows/wiki.js`, v2.3.0; WIKI nav, and PLANETS opens it
  on the Planets tab) is read-only: tabs -> entry list -> picture +
  description. Entries live in `wikiEntries.js` (`{id, unlock, meta?,
  art}`, id = `"tab-kind:key"`), pictures are inline SVG drawn by
  `wikiArt.js` (each gradient gets a unique id, since the same art shows
  as both thumbnail and big picture), texts in i18n
  `wiki.entries.<key>` — **the key after the colon must be unique across
  all tabs** (`body:ice` and a `mineral:ice` once silently shared one
  text; the mineral is now `waterice`). `unlock` is `start` (always
  known), `inspect` (bodies: `planetPanel.js` / `tooltip.js` call
  `discover()`), `research` (`research.js` on purchase), `script`
  (`droneScript.js` on run), `use` (programming entries:
  `drone/scriptFeatures.js` reads which commands a program contains off
  its parsed AST, and `droneScript.js#runActive` discovers them once the
  program actually starts), `blocks` (a block-mode run), `files` (a
  second block-editor file), `progress` (Story tab: `core/storyLog.js`
  — `storyEvent()` from banner.js on entering orbit / stationPanel.js on
  opening the station, plus a 1s check of `state.eaten`, bought upgrades
  and other discoveries — paced: only the reboot log is instant, the
  rest come one at a time, in LOG order, at most one per 3 minutes of
  play (the timer starts at page load, so a veteran player's backlog
  trickles in instead of arriving as six toasts at once),
  `story` (Story fragments tied to features not built yet; the story
  itself is drafted in a local, untracked `FABULA.md`), `life`/`relic` (like `future`, with their
  own story hint — life forms and artifacts) or `future` (placeholder for features not
  built yet — elements/minerals/ores/refined resources/materials/most
  buildings and ships). Programming entries' pictures are the real
  blocks, drawn in SVG from the block editor's own category colors and
  i18n labels (`wikiArt.js#code`).
  Discovery state is `core/discovery.js` (a Set persisted under
  localStorage `roj-discovered`, `onDiscover` listeners -> event-log
  toast). Elements/minerals/ores carry real data in `meta` (Z, symbol,
  standard atomic weight; chemical formulas) — keep them factual.
- **Minimap** (`ui/hud/minimap.js`) is schematic, not to scale: 9 evenly
  spaced rings, each body on its own ring at its real angle; the comet
  and ships are mapped piecewise-linearly between rings, with only a
  small margin past the outer ring — an arriving/leaving comet (out to
  ~1.3x the outer orbit) was once drawn past the map's left edge. The
  +/- zoom lives in the panel header since v2.6.0: sitting on the map it
  covered the outer orbits' lower right, hiding bodies there. A click goes
  through `scene/controls.js#clickPlanet`/`clickStation` — the exact
  code path of a click in the 3D view (course order if ships are
  selected, otherwise select; shift toggles multi-select).
- **SELECTED UNIT** (`ui/hud/unitPanel.js`) watches selection instead of
  being told about it: `updateUnitPanel()` runs every frame but only
  touches the DOM when *which* unit is shown changes (drone > single
  ship > group > empty), plus a forced stats refresh every ~0.4s.

## Load order and first paint

- **Load order / first paint (v2.1.3)**: `initScene()` (WebGL context +
  first shader compiles) blocks the main thread long enough to notice,
  and the browser can't paint or restyle during it. Three consequences,
  each handled explicitly: (1) `main.js` runs all start-screen UI init
  (texts, banner, setup modal, Escape) *first*, then awaits one painted
  frame (top-level `await` on rAF + setTimeout) before building the scene
  — don't move UI init back below `initScene()`. (2) Fonts are
  self-hosted (`fonts/`, `css/fonts.css`, latin + latin-ext subsets) and
  the start-screen ones plus `grain.png` are `<link rel=preload>`ed in
  `index.html` — a font is otherwise only requested once the browser
  restyles text using it, i.e. after the scene init, so the page painted
  with fallback fonts and swapped ~1.5s later. (3) A non-English saved
  language sets `data-lang-pending` on `<html>` from the `<head>` script
  (also preloading the latin-ext subsets), hiding `#box` until
  `i18nApply.js#applyStaticText()` clears it — the HTML ships English, so
  a Polish player otherwise saw it flash. Measured locally (Chrome with
  GPU, returning Polish player): translated text 1457ms -> 318ms, fonts
  1535ms -> ~80ms, first frame already final.
- **Parallel downloads (v2.2.1)**, measured on the live site: (1) the 22
  UI kit stylesheets are plain `<link>`s in `<head>` rather than
  `@import`s inside style.css — an `@import` is only discovered after its
  parent file has arrived, which cost a whole extra round trip before
  first paint; order is the cascade order, style.css's own rules last.
  (2) three.js and supabase-js are `defer`: as plain classic scripts they
  blocked the HTML parser, and since a module script's dependency graph
  only starts downloading once the parser reaches it, `main.js`'s ~100
  imports waited for the slower CDN script to arrive. Deferred classic
  scripts and module scripts still execute in document order, so `THREE`
  and `supabase` exist before `main.js`/`supabaseClient.js` evaluate.
  (3) The inline pre-paint `<head>` script sits *above* the stylesheets —
  an inline script after a stylesheet waits for that stylesheet (and
  stalls the parser meanwhile).

## Rendering and ShipKit models

- **The game renders like the ship/body labs (v2.8.0)**: sRGB output,
  ACES filmic tone mapping (exposure 1.1) and
  `scene.environment = ShipKit.makeEnvironment(renderer)` — a PMREM of
  the labs' own generated space sky (`ShipKit.makeSpaceSky()`), so metal
  reflects and ShipKit models look as they do in `ship.html`. Planets and
  the station pick up the reflections too. The skybox and the scene
  lights weren't retuned for it yet (the user's plan: later).
- **Color management (`scene/colorManagement.js`)**: with sRGB output a
  material color is linear light, while every game color was picked for
  the old plain output — left alone, everything washed out (the teal
  ships came out nearly white). `manageSceneColors(scene)` runs every
  frame and converts each *new* material's `color`/`emissive`, each
  light's color and the fog color sRGB -> linear once (a WeakSet
  remembers what's done), so later spawns are covered too. It skips
  anything under `userData.shipkit` (ShipKit models and their effects are
  authored for this pipeline, like in the labs). Vertex colors are
  converted where written (particles
  copy already-converted material colors). Every game-made canvas texture
  goes through `core/utils.js#sRGBTexture()` (all are color textures).
  Custom `ShaderMaterial`s write their color untouched and need nothing.
  **A new material color set at runtime** (not at creation) would bypass
  the one-time conversion — convert it yourself.
- **ShipKit is shared, not copied**: `js/shipkit/shipkit.js` is a classic
  script (`window.ShipKit`, like the `THREE` global), loaded by
  `index.html` (`defer`, after Three.js) and by `ship.html` — one source
  of truth. See `docs/ship.md` for its API.
- **The drone** (`drone/drone.js#buildDroneModel`) is ShipKit's DR-01
  SCRIBE: built with `merge: true` (static meshes merged per material,
  see `docs/ship.md`), effects in the scene (`fxRoot`), wrapped by
  `makeGameHolder` to +Z forward and `DRONE_MODEL_LENGTH` (1.4) units,
  inside the old holder group with the game's pick sphere (0.6) and
  selection ring. No PointLight of its own any more (glow sprites
  instead). `updateDrone()` feeds it: engine power eased toward 1 during
  `move()` (0.15 idle), `offline` when out of fuel, `act("fire",
  { target })` from `applyAttack()` at the bitten surface point. Swallowed
  by a black hole it plays `act("destroy")` and the wreck is disposed
  after 7 s (`updateDroneWreckage`). The game keeps its own print()
  effect (`dronePrintFx.js`) rather than the model's.
- **Graphics settings** (`scene/graphics.js`, Setup -> Graphics): render
  quality 0..4 = pixel ratio 0.5 / 0.75 / 1 / device (1..2, default) /
  1.5x device (max 3), particles off at LOW; geometry detail 0.2..2
  rebuilds the drone model when the slider is released
  (`onGraphicsChange`); "Ship glow lights" (off by default) shows/hides
  every ship's own PointLight (`userData.unitLight`, applied by
  `scene/lightsToggle.js`, which also keeps the Dev Tools "all lights"
  toggle from switching them back on). The lights stay in the ships —
  hidden lights cost nothing, since three.js only counts visible ones.
  All persisted in `settings.js` (`gfxQuality`, `gfxDetail`,
  `gfxUnitLights`).
- **Other players' drones** (`net/shipsBroadcast.js`): the same model at
  detail 0.4, no particles, **not tinted** (the user's call: owners are
  told apart by markers, not by recoloring ships) — the same diamond
  marker in the owner's color as their ships
  (`ships/shipVisual.js#makeOwnerMarker`); since v2.13.1 only the station
  carries the owner's name (it had a name label before). The `ships`
  broadcast's `drone` array grew from `[x, y, z, heading]` to `[..., power,
  offline, shots, tx, ty, tz]` — still one message per 120 ms, a few more
  numbers. All untrusted: power clamped to 0..1, shots only acted on when
  they increase, at most 2 per update, coordinates through `safeCoord`.
- **Swarm ships** (v2.9.0, `ships/shipVisual.js`): ShipKit's SW-01
  SWARMER up close, the old light cone beyond `SHIP_LOD_DISTANCE` (45)
  from the camera; the model is built lazily (merged, effects in the
  scene, detail = graphics detail x 0.5, remote x 0.3) and always shown
  for a selected ship or the ship cam's (`forceDetail`). Engine power:
  cruising 1, eating 0.35, idle 0.1. `swarm.js#destroyShip` (black
  holes) plays the model's destroy and `updateShipVisuals` disposes the
  wreck after 7 s. Remote ships use the same visual, untinted, with an
  owner-colored diamond marker (`sizeAttenuation:false`) and face their
  direction of travel (derived from the interpolated movement — no new
  network data). Known: at base-view distance the models read paler
  than the old emissive cones (the ship glow lights are off by default);
  to address in the lighting pass. (Remote stations stopped being tinted
  in v2.13.0, see "Space station".)
- **BodyKit planets** (v2.10.0, `world/bodyVisual.js`): the six planet
  slots are the body lab's bodies — `js/bodykit/bodykit.js`, a classic
  script (`window.BodyKit`) shared with `bodies.html` like ShipKit is with
  `ship.html`. `BodyKit.GAME_BODIES` maps orbit slot -> lab body (from the
  bodies' `slot` field). `materializePlanet()` keeps `p.mesh` as an
  invisible sphere (`MeshBasicMaterial({ visible:false })` — raycasts
  still hit it, it carries the color for particles/debris) with the
  BodyKit group as a child; no crack overlay (the shader's `setDamage`,
  fed by `applyHealthVisual()`), scorch overlay attached to the body's
  `surfaceRoot` so it turns with the ground, no random ring, `p.spin` 0
  (the body spins at its lab rate). `updateBodyLooks(dt)` in the main loop
  drives time/spin/sun direction; a detail change rebuilds, a quality
  change sets the octaves (`BodyKit.QUALITY_OCTAVES`). The old CPU-made
  neutral-planet surface texture (`makePlanetSurfaceTexture`) was removed
  with it. Details and rules: `docs/bodies.md`.
- **Every body is BodyKit's (v2.11.0)**: the Sun (SOL: granulation,
  sunspots, corona billboard; keeps the game's PointLight for standard
  materials), the meteoroid (FERRUM, a GPU-displaced rock), every comet
  (COMET via `BodyKit.GAME_KINDS`: rock nucleus, coma, ion + dust tails
  pointing away from the Sun by themselves; `look.opts.velocity` bends
  the dust tail, `look.opts.activity = cometActivity(distance)` grows them
  near the Sun) and the black hole (ABYSS: horizon, Doppler-beamed disk,
  photon ring; `materializeBlackHole` adds an invisible 2.5 × radius pick
  sphere, `bh.pickMesh`, used by `scene/picking.js`). `bodyLookRef(slot,
  kind)` picks the lab body. Removed with it: the crack overlay, sun halo
  sprite and 3D rays, crossed-plane comet tail, sprite/ring black hole and
  their canvas textures (`world/textures.js` keeps only
  `makeRockGeometry` for debris and `generateDustTexture`),
  `bodyMeshParts.js` keeps only the selection bracket.
- **Ship glow lights reach the bodies (v2.11.1)**: BodyKit shaders ignore
  THREE lights, so the setting looked like it did nothing (the light also
  sat inside the hull). Now it's behind the engines (`SHIP_LIGHT_*` in
  config.js, intensity × eased engine power), and `world/bodyVisual.js`
  passes the nearest visible ship lights to each body (`opts.lights`,
  max 4, BodyKit's `pointLightAt()`). Toggling it still recompiles the
  game's standard-material shaders once (a light count change).
- **Dev Tools -> Performance stats** (`ui/hud/perfStats.js`): FPS, frame
  time, worst frame, CPU time (update + render), draw calls and
  triangles summed over all of a frame's render passes (main view, ship
  cam, miniatures — `renderer.info.autoReset` is off and it's reset once
  per frame in `perfFrameStart()`), GPU memory (geometries / textures /
  shader programs), render resolution, scene object count, bodies /
  ships / players, JS heap (Chrome), plus a frame-time graph. `main.js`
  brackets each frame with `perfFrameStart()` / `perfRenderStart()` /
  `perfFrameEnd()`; the toggle is remembered (`roj-devPerf`).

