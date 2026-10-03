# Architecture notes: world, network, programs

Referenced from [`CLAUDE.md`](../CLAUDE.md)'s condensed architecture map —
this file holds the full history/verification behind each design decision
(why it was chosen, live bugs found and fixed, exact function names). Read
the relevant section here before touching that subsystem; CLAUDE.md's own
map is enough for orientation but not enough to safely modify this code.

The game's notes are in three files: [`architecture.md`](architecture.md)
(world, network, programs, units), [`ui.md`](ui.md) (screens, HUD,
windows, load order) and [`rendering.md`](rendering.md) (models,
image quality, post-processing, sky).

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
- [Scale](#scale)
- [Comets](#comets)
- [Realtime channel health](#realtime-channel-health)
- [Comet DELETE handling](#comet-delete-handling)
- [Settings, identity and i18n](#settings-identity-and-i18n)
- [Nickname moderation](#nickname-moderation)
- [Programmable drone](#programmable-drone)
- [Programmable ships, unit view and trajectories](#programmable-ships-unit-view-and-trajectories)
- [Space station](#space-station)
- [Fleet memory and RETURN TO BASE](#fleet-memory-and-return-to-base)
- [Kills, damage flushing, UI text (v2.28.3 review)](#kills-damage-flushing-ui-text-v2283-review)

## Body types

- **Body types are data-driven**: each of the 7 celestial body kinds (sun,
  ice/neutral/volcanic planet, comet, meteoroid, black hole) is a plain
  object in its own file under `js/bodies/`, aggregated by `js/content.js`.
  A "planet" DB row only stores `kind`+`temp`, not which of the 3 planet
  variants generated it — `variantForTemp()` re-derives it deterministically.

## Module split: bodies.js and controls.js

- **Split by concern, not by feature.** `world/bodies.js` = body
  lifecycle (materialize / spawn / despawn / update / destroy);
  `world/bodyParams.js` = the pure kind + temp math (`variantForTemp`,
  `bodyParams`, `bodyVariantKey`, `bodyValueEstimate`, `tempColor`,
  `randomPlanetSpawnData`); `world/bodyVisual.js` = the look (BodyKit);
  `world/rewards.js` = a kill's payout. On the scene side
  `scene/camera.js` = the camera (split out in v2.28.4),
  `scene/controls.js` = mouse input, selection and orders,
  `scene/picking.js` = the raycasts (`pickXAt()`, one shared
  `THREE.Raycaster`), `scene/tooltip.js` = the hover tooltip,
  `scene/selectionBrackets.js` = the selection frames. Each split was a
  pure move, verified by a full eat-a-body cycle against the live server.

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
  RETURN TO BASE is the other order ("Fleet memory and RETURN TO BASE").
- **What it does there: orbit, attack or land** (v2.33.0,
  `ships/orders.js`, `sh.order`). A click is a course into **orbit** — it
  never starts an attack by itself (the user's call); the order menu at the
  pointer (`ui/hud/orderMenu.js`) picks ORBIT / ATTACK / LAND. A repeated
  click on the same body keeps the ships' order.
  - Orbit: a circle in the plane of arrival, `EAT_ORBIT_GAP·2` above the
    surface, no beam.
  - Attack: the old feeding orbit and the beam (`ships/swarm.js`).
  - Land: only BodyKit's planet kind (`canLand`). The descent and the spot
    are in the body's `surfaceRoot` (the base's lat/lon frame), so a landed
    ship turns with the planet; next to your surface base if there is one
    (a ring, one place per ship), else under where it arrived. Height:
    the mountains' average lift, not the real terrain (the surface view
    will sample it).
  - Fleet memory saves the order kind (`roj-fleet-pos`, 6th field; older
    saves restore as attacks).
  - **Another player's station** (v2.35.0): a click on it with ships
    selected is a course there and the same menu (`clickRemoteStation`;
    its handle `rp.stationRef` got `mesh` so it works as a target).
    ORBIT circles it just outside its protective field
    (`STATION_FIELD_RADIUS` + 2.5); LAND goes into the field and holds in
    its inner layer (0.55 of the field's radius), a place per ship, still
    relative to the station (`orders.js#updateDock`; status "In the
    field"); ATTACK is greyed out ("coming soon"). The order ends when the
    owner leaves (`targetAlive`); it isn't kept across a reload. Nothing
    new goes over the network: the owner sees the ships through the usual
    ship broadcast.
- **An ordered ship ignores gravity** (`solarGravity.js` skips it while
  `sh.commandedTarget` or `sh.returning`). Steering against real gravity
  was tried twice and measured: a ship sent 345 units never arrived in
  1000 simulated seconds — the full story in "Solar system and gravity"
  and "Programmable ships". Idle ships outside the station field and the
  drone do feel gravity.

## Camera modes

- **"focus" mode (v2.14.0)**: `scene/camera.js#focusCameraOn(body)`
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
- **Other players' stations are selectable (v2.15.0)**: `makeGhostStation`
  (net/shipsBroadcast.js) adds a pick sphere and a handle,
  `rp.stationRef` ({ group, pickMesh, frameRadius, focusDistance,
  selected, alive() }), used by `picking.js#pickRemoteStationAt`,
  `controls.js#clickRemoteStation`, the selection frames, the minimap (a
  diamond in the owner's color on the station ring) and `focusCameraOn`
  (which honours a target's own `alive()` / `focusDistance`). Read-only
  info panel: `ui/hud/remoteStationPanel.js` (nick, fleet size, points,
  bodies devoured from their broadcast); it closes when the owner leaves.
- **Small bodies are easier to click (v2.15.0)**: when the ray misses,
  `scene/picking.js#pickPlanetAt` falls back to the nearest body within
  14 px of the cursor on screen (`pickSmallBodyAt`) — comets are small and
  fast, and anything far away is only a few pixels.

- **Two player-driven modes, toggled top-center over the 3D view** (`scene/
  camera.js#setCameraMode()`, v2.0.6): "system" orbits the Sun at the
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
  `>0` bug existed client-side too and got the same fix. **Superseded in
  v2.28.3**: that threshold almost never let a real kill count; the rule
  now is "spent" (`world/bodies.js#isSpent`, `docs/security.md`,
  "Solar-body kill rule").
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
    cruising, even after both fixes above** (since v2.19.0 skipped
    outright, see "Programmable ships") — tried
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

## Scale

The full picture (numbers, what depends on what, problems found, a
checklist for the next change) is in [`docs/scale.md`](scale.md); the two
steps in brief:

- **Step 1 (v2.16.0)**: toward a more realistic (not literal) scale,
  units shrank to half — ship `SHIP_MODEL_LENGTH` 0.9 → 0.45, drone 1.4 →
  0.7, station 10 → 5 (its ring now smaller than a planet) — with
  everything sized around them: ship ring/pick sphere, LOD cone, owner
  markers, bite beams, the drone's ring/pick/spawn offset, station pick
  radius / label / focus distance, ship spawn spiral (3 + 0.55·√i) and
  `STATION_FIELD_RADIUS` (8), the ship cam's canopy offset, the unit
  miniature distance, and the base camera (radius 11, zoom 3–150).
  Planets, orbits, gravity and the database are untouched.
- **Step 2 (v2.17.0)**: bodies are drawn bigger than their gameplay size —
  `world/solarSystem.js#BODY_VISUAL_SCALE` (Sun ×3, planets ×2.5,
  meteoroid ×1.5, black hole ×1). Each solar body keeps its original
  radius as `size`, from which gravity (`gm`, SOI), its point value
  (`bodyValueEstimate`), its offline max health and the Sun's PointLight
  range are computed, so the balance and the database don't change;
  `radius` (drawn, picked, camera focus, gravity's near-clamp) is the
  scaled one. `p.size` rides along on every body (a comet's = its
  radius). What used to be fixed distances became "above the surface": the
  eating orbit is `radius + EAT_ORBIT_GAP` (1.6), the drone's dock range
  `radius + DRONE_DOCK_GAP` (4). Scorch blots shrink by size/radius so
  they keep their world size. The minimap still draws gameplay sizes.

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
    solar-wind/radiation-pressure direction — since v2.11 BodyKit's comet
    takes it from its own world position every frame, as the direction
    changes continuously while the comet curves), not
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
  (this happened once, in the old planet top-up loop).
  The reconnect-status badge in the HUD is deliberately driven by the
  channel's own reported status, not a "haven't heard anything in a while"
  timer — a healthy-but-quiet room (nobody else currently playing) would
  otherwise be indistinguishable from a dead connection and trigger
  constant false alarms.
- **Steward-gated spawns need `isConnected() && (isSteward || stale)`** —
  `net/stewardFallback.js#createStalenessGate(baseMs, jitterMs)` returns
  `{bump(), shouldSpawn()}`. Presence re-elects a steward only on a real
  socket drop, so a steward whose tab is merely backgrounded can stay
  steward forever while doing nothing; the staleness fallback lets anyone
  step in once nothing has appeared for far longer than the normal
  cadence. Found live twice (the old black-hole spawner and planet
  top-up, both gone with the 9-orbit rewrite); its one caller today is
  `net/bodiesSync.js#maintainComet`.
- **A replaced channel's callbacks are ignored** (v2.26.1): removing the
  old channel fires its own subscribe callback with "CLOSED", which used
  to schedule another reconnect that tore down the healthy new channel —
  a reconnect every ~2 s for the life of the tab (`docs/security.md`,
  "Audit 2026-09-30").

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
  modules, deliberately not merged — `js/settings.js` (local prefs:
  mouse, image quality, lines on/off), `js/net/identity.js` (nickname/color, shared
  with other players), `js/i18n.js` (language; the dictionaries in
  `js/i18n/en.js` and `pl.js`). Staying separate
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
  `program/unitPrint.js#unitPrint` (`drone.js#triggerPrintFx` before
  v2.19.0) logs *why* nothing showed up (this one
  has a player right there to explain it to, unlike a nickname box), and
  `net/shipsBroadcast.js`'s `handleRemoteDronePrint()` re-checks on
  arrival and just silently drops it if flagged — same reasoning, same
  split.
  - Nicknames are further restricted to `/^[\p{L}\p{N} ]+$/u` (letters of
    any script, digits, spaces — note `\p{L}` isn't just `a-zA-Z`) and
    `NET_MAX_NICK_LENGTH` (20) in `confirmNick()` — one shared constant
    for both the own-nick length cap and the remote-payload safety clamp
    in `shipsBroadcast.js`, not two numbers that can drift apart.

## Programmable drone

- **Programmable drone** (`js/drone/*.js`): a single
  extra ship per player that only moves by running a player-written
  script — never auto-targets anything like the swarm's ships do.
  - `dsl.js` (hand-rolled lexer + recursive-descent parser, not eval/
    Function — the DSL is intentionally not JavaScript) produces an AST;
    `interpreter.js` walks it as a **generator**, where every builtin call
    is a `yield` and `driveGenerator()` (in `drone.js` until v2.19.0, now
    `program/runner.js`, shared with the ships; the builtins themselves
    are `drone.js#DRONE_API`) decides whether to
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
    regen) — see `DRONE_DOCK_GAP` (radius + gap since v2.17.0)/`DRONE_REFUEL_RATE` in config.js.
  - **The script text itself is persisted** (`localStorage["roj-drone-script"]`,
    `drone.js#setDroneScript()`/`spawnDrone()` back then; since v2.19.0
    `program/unitPrograms.js#getUnitScript/setUnitScript`, same key) —
    everything else about the
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
    until fixed). A remote drone rendered as a ghost octahedron
    (`makeGhostDroneMesh`) tinted by owner color — **superseded**: since
    v2.8.0 it's ShipKit's DR-01 model, never tinted, with the owner's
    diamond marker (v2.13.1; see `rendering.md`, "Rendering and ShipKit models") — tracked as
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
  - **The drone spawns above the station** (`station.pos + (0, 3.5, 0)`),
    clear of the ships' spiral: clicks pick the drone *before* ships and
    planets (`scene/controls.js`), so when it overlapped the swarm an
    ordinary click meant to order ships reselected the drone instead —
    investigated for several rounds as "the close button doesn't work".
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
    (`drone.lastPrintAt`, checked in `triggerPrintFx()` — since v2.19.0
    `program/unitPrint.js#unitPrint`, per unit) — the only lever
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
  - **The old drone side panel (gone since the v2.2.0 HUD) taught two
    lessons that still apply**: a control inside a `pointer-events:none`
    container needs its own `pointer-events:auto`, and a close button
    reacts on `pointerdown` (a `click` is lost when the hand drifts a few
    px between press and release). And the one real bug behind every
    "won't close" report: `#dronePanel.hidden` had no `display:none` rule,
    while the tests checked `classList.contains("hidden")`. **Test
    "hidden" with `getComputedStyle(el).display` or a screenshot, never a
    class name.** Fixed structurally in 1.10.15: one generic
    `.hidden{ display:none !important; }` in `css/style.css`
    (`!important` because several base rules set `display` at higher
    specificity).

- **Block editor** (v2.4.0; `js/blocks/*` = model + compiler, no DOM;
  `ui/windows/blockEditor.js` + `blockPalette.js`/`blockRender.js`/
  `blockDrag.js` = the window). **Blocks compile to the text DSL**
  (`blockCompile.js#compileProject`) and run through the same
  `runUnitProgram(unit, src)` (`program/runner.js`; `runDroneScript` before v2.19.0) — never add a second interpreter.
  - **Two programs, one switch** (since v2.19.0 per unit, in
    `program/unitPrograms.js`; this was `drone/droneMode.js`, now gone)
    ("script" | "blocks", localStorage `roj-drone-mode`) picks which one START runs
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

## Programmable ships, unit view and trajectories

Added in v2.19.0 (the user's request: every ship programmable like the
drone, a camera on a ship "like on a planet", the cockpit view under it,
and the prototype's two trajectory lines from `test.html`, shown only in
that ship view — "the drone too").

- **One runner, per-unit builtins** (`js/program/`): `runner.js` runs a
  program on any unit (`runUnitProgram` / `stopUnitProgram` /
  `stepUnitProgram`, the runaway-step guard); what the builtins do comes
  from `unit.api` = `{ start, advance, prepare? }` — `drone.js#DRONE_API`,
  `ships/shipProgram.js#SHIP_API`. Shared pieces: `unitMotion.js`
  (move/turn/wait math, nearest body, "near" = radius + `DRONE_DOCK_GAP`),
  `unitBite.js` (attack(): one bite + the kill rules, moved out of
  drone.js), `unitPrint.js` (print(): log, cooldown, profanity check, the
  gas+laser effect, broadcast). The language and interpreter stay
  `drone/dsl.js` + `drone/interpreter.js` — still one interpreter.
- **Ships vs the drone**: ships have no fuel (fuel()/maxFuel() report
  100, so drone scripts run unchanged), move at their cruise speed (Speed
  upgrade), and attack() bites like eating does (Bite upgrade × thermal
  efficiency, `swarm.js#eatEfficiency`, in `DRONE_ATTACK_COOLDOWN_S`
  slices) — a program can't dodge the heat-resistance upgrades. START
  = all stop (`SHIP_API.prepare`: no order, velocity 0, heading from the
  mesh). While `sh.running`, `updateShips` hands the ship to
  `updateProgrammedShip` (mesh turned by `heading`, +Z forward); a click
  order stops the program (`controls.js#commandTo`).
- **Gravity on a flown unit is a drift, not a velocity** (drone and
  programmed ships, `solarGravity.js#applyGravityToOne(…, false)`). Measured: a
  programmed ship accumulating gravity in its velocity fell sunward at
  dozens of units/s within 30 s of leaving the station field.
- **Ordered ships are now truly gravity- and pull-immune** (skipped in
  `solarGravity.js` while `sh.commandedTarget`).
  Before, both were added to the velocity and only partly steered away by
  the 8%/frame lerp: measured 0.4–0.6 instead of the 0.97 cruise speed
  beyond the station, varying with the frame rate — so the flight could
  be neither predicted nor trusted (the user: "should be like the drone").
  This is the "commanded ships stay gravity-immune" rule finally done as
  written.
- **The station's field shields, it doesn't pull** (the user's call, same
  version): `station/stationField.js`, which dragged idle ships back from
  beyond `STATION_FIELD_RADIUS` at `STATION_FIELD_STRENGTH` (4/s²) — a
  gravity of the station's own — is gone. Inside the field: no gravity.
  Outside: real gravity, accumulated in an idle ship's velocity, so a
  ship left idle far from home (e.g. after eating a body) falls toward
  the Sun or a planet unless the player orders it somewhere — chosen over
  "holds position" and "drifts like the drone".
- **Programs per unit** (`program/unitPrograms.js`): script, mode and
  block project under the drone's original keys (`roj-drone-script /
  -mode / -blocks`, so existing programs survive) and `roj-ship-script-N /
  -mode-N / -blocks-N` for "Ship N" (its place in the fleet).
  `blocks/blockProject.js` keeps one project per key: `useProject(key)`
  makes one active for the editor, `withProject(key, fn)` compiles
  another (the compiler resolves definitions through the active one).
  `drone/droneMode.js` is gone (mode is per unit now).
  `ui/windows/droneScript.js`: the panel's START/STOP/SCRIPT act on the
  unit the panel shows (`unitPanel.js#getProgramUnit`), the editor
  windows on the unit they were opened for (titles "Ship N script",
  "PROGRAMMING: SHIP N").
- **Unit panel** (`ui/hud/unitPanel.js`): a single ship or the drone
  shows COCKPIT (camera icon) top right and a bottom row VIEW (eye) /
  START / STOP / SCRIPT — **icons only, the name is the tooltip** (the
  user's call; labels stay as visually-hidden spans). A ship's four
  "soon" quick orders now only show for a group. VIEW =
  `camera.js#focusCameraOnUnit` — the "focus" camera with one stable
  target object per unit (`{ unit, mesh, radius, focusDistance,
  zoomRange, alive() }`).
- **VIEW is the same everywhere** (the user's "jednolicie"): the info
  panel's wide gold button C (`infoPanel.js#setInfoButtons`) is VIEW on
  the planet panel (replacing the placeholder COLONIZE), the black hole
  and a remote station (`focusCameraOn`) and the own station (base
  view).
  `unitInView()` answers "which unit is the camera on". COCKPIT =
  `scene/shipcam.js`, now for the drone too (its own offset); the unit's
  selection ring is hidden for that render pass (it cut across the view).
  PIP label "COCKPIT".
- **Trajectories** (`program/simulate.js`, drawn by
  `scene/trajectories.js`) — **one rule (the user's): the object the
  camera is on (the "focus" target: a unit via VIEW, a body via the
  minimap) plus every selected object** — ships only when exactly one is
  selected (a group's lines were clutter, the user's call). A fixed body (planet, meteoroid, black hole) gets its
  way along the orbit over the same 120 s (closed-form `bodyPosAt`); the
  Sun and the station don't move; a comet already draws its full path.
  Lines come from a reused pool, shared materials (one per kind —
  `colorManagement.js` converts each once). A body's arc lies exactly on
  its orbit line, so depth-tested the two z-fought (the arc looked broken
  and faint, the user spotted it): it's drawn without a depth test, and
  all trajectory lines sit on layer 2, which only the main camera renders
  (the miniatures and the cockpit view see layer 0 — otherwise the arc
  cut across the planet's miniature). For a unit: cyan = as things
  stand (`predictCurrentPath`: idle drift + station pull, or an order's
  flight), violet = if its program started now (`predictProgramPath`:
  the real interpreter on a copy of the unit, `unitMotion` for motion,
  `solarGravity.js#gravityAccelAt(pos, t)` — the same capped patched-
  conics pull, with bodies at their future positions; attack() only waits
  its cooldown, print() does nothing). While a program runs, violet is
  the route planned at START (`planUnitRoute`; a running generator can't
  be copied to re-predict mid-run) and cyan is hidden. 0.2 s steps, 120 s
  ahead, refreshed every 0.4 s; lines `toneMapped: false` (the filmic
  tone mapping dimmed them). Measured accuracy: 0.2–0.5 units off after
  40 s of a programmed flight out of the field; an ordered flight matches
  to 0.1.
- **Found on the way**: the drone's print() read its color from
  `drone.mesh.material`, but since the ShipKit model (v2.8.0) `mesh` is a
  Group without a material — print() threw and ended the script. It now
  uses the player's color, the same one other players see.

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
  - **A free spot on the ring (v2.29.1)**: the hashed angle can land on
    another station (birthday problem: ~50 % for overlapping fields at
    ~13 players online). `station.js#initStationSlot` — once per browser,
    4–12 s after connecting (presence plus the first broadcasts) — checks
    the online players' stations; if ours is within `2 × field + 4` of
    one, `moveStation` takes it (and the ships and drone parked in its
    field) to the nearest free angle in 1° steps, glides the base camera
    after it and toasts. The angle is kept in `roj-station-angle` and used
    from then on, so only a newcomer ever yields. Players offline at that
    moment can't be checked — a server-side reservation would need a table
    of its own. Tested with two tabs forced onto the same angle.
  - **The look is ShipKit's ST-04 HAVEN (v2.13.0)** —
    `js/shipkit/shipkit.js`, built in the ship lab like the ships, placed
    by `station/stationVisual.js#makeStationVisual()`, which both the local
    station (`station.js#spawnStation()`) and every remote player's ghost
    (`net/shipsBroadcast.js#makeGhostStation()`) use, so they can't
    diverge. A spinning habitat ring on spokes, the central spine with the
    greenhouse dome, a solar truss along X, radiators, a comms dish, the
    docking port; merged static meshes (≈30 draw calls), effects in the
    scene, `STATION_MODEL_LENGTH` (5 since v2.16.0, was 10) world units along the truss via
    `makeGameHolder`. It replaced the old primitive-built
    `station/stationModel.js` (deleted).
  - **The ruin is the damage (a story choice by the user)**: the model's own
    `setDamage` stages (dark ring windows from 0.1, a broken hanging solar
    panel from 0.2, a torn ring segment with drifting debris from 0.3) on
    top of the shared smoke/sparks. The game starts every station at
    `STATION_START_DAMAGE` (0.35, config.js) — a ruin, as the story says —
    and repairs are meant to lower it later; `visual.setDamage(d)` keeps
    the value across rebuilds.
  - **Pick sphere and selection ring**: `STATION_PICK_RADIUS` (1.7 world
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
    (8 since v2.16.0, `config.js`). `index` is just `ctx.ships.length` at spawn time —
    no upfront fleet-size knowledge needed, so `reconcileFleetSize()`
    (buying a Fleet upgrade) adding one ship at a time still gives each
    new ship its own non-overlapping slot, same as the initial fleet
    spawning all at once. `main.js` now spawns the station *before* the
    initial fleet specifically so `ctx.station.pos` already exists for
    this (previously the fleet spawned first).
  - **Inside `STATION_FIELD_RADIUS` there is no gravity**
    (`world/solarGravity.js#updateSolarGravity()` skips ships and the drone
    there): the station has no SOI of its own (orbit 4 is "the station
    ring, not a body"), so the Sun's real pull at ~290 units was the
    dominant force on a parked fleet. Verified live: three freshly spawned
    ships bit-for-bit still after 8 idle seconds. Ships since v2.0.6, the
    drone since v2.0.8 (the user: "it's kind of a ship too"). Until
    v2.19.0 a `station/stationField.js` also pulled idle ships back from
    beyond the field; it's gone — **the field shields, it doesn't pull**
    (the user's call, see "Programmable ships").

## Fleet memory and RETURN TO BASE

v2.27.0, the user's request. `ships/fleetMemory.js` saves every ship's
position (+ a course order to a fixed solar body, as its `orbitSlot`, or the
`returning` flag) and the drone's to localStorage `roj-fleet-pos` every 2 s
and on pagehide / tab hidden; `restoreFleet()` runs once in `main.js` right
after `spawnDrone()`. Online the solar bodies arrive from the server a moment
later, so restored orders wait in `pending` (up to 30 s; the save is held
back meanwhile, or the first save would drop them). Comet orders and running
programs aren't kept. RETURN TO BASE (`ui/hud/returnBase.js`, the viewport's
top-left, shown while own ships are selected): `swarm.js#returnToBase` sets
`sh.returning`; `flyHome` flies each ship to its own spawn slot
(`shipSpawnPosition(index)`), easing in, and stops it there. Gravity skips a
returning ship like an ordered one; a course order clears the flag.

## Kills, damage flushing, UI text (v2.28.3 review)

- **Kills**: `world/rewards.js#awardKill(body, {breakup, remove})` is the
  only place a kill pays out (points, eaten, toast, research refresh,
  save) — the swarm, a program's attack() and the server's confirmation
  all call it. A fixed body can't be killed again while
  `world/bodies.js#isSpent` (checkpoint 0 and ≤ 10 % grown back); at a kill
  every ship on that body is released (`ships/swarm.js`).
- **Damage to the server**: `net/biteBudget.js#createBiteFlusher(rpc,
  argsFor, onRow)` — shared budget (15/s), rotation, backoff;
  `bodiesSync.js#flushDamage` (comets) and `solarBodiesSync.js#
  flushSolarDamage` are one line each.
- **Static UI text**: `index.html` elements carry their i18n key
  (`data-i18n`, `data-i18n-title`, `data-i18n-html` — app HTML only —,
  `data-i18n-placeholder`); `ui/i18nApply.js` fills them in one loop and
  handles only text that depends on something.
