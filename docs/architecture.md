# Architecture notes (full detail)

Referenced from [`CLAUDE.md`](../CLAUDE.md)'s condensed architecture map —
this file holds the full history/verification behind each design decision
(why it was chosen, live bugs found and fixed, exact function names). Read
the relevant bullet here before touching that subsystem; CLAUDE.md's own
map is enough for orientation but not enough to safely modify this code.

- **Body types are data-driven**: each of the 7 celestial body kinds (sun,
  ice/neutral/volcanic planet, comet, meteoroid, black hole) is a plain
  object in its own file under `js/bodies/`, aggregated by `js/content.js`.
  A "planet" DB row only stores `kind`+`temp`, not which of the 3 planet
  variants generated it — `variantForTemp()` re-derives it deterministically.
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
- **Ships only ever move on an explicit order.** `ships/swarm.js`'s
  `updateShips()` sets a ship's `target` straight from `commandedTarget`
  (set by `commandTo()` in `scene/controls.js`, when ships are selected
  and a planet is clicked) — there is no automatic nearest-planet
  fallback. There used to be one (`nearestPlanet()`, removed): it made
  idle ships drift toward whatever was closest with zero player input,
  and clicking a planet with nothing selected silently sent the *entire*
  swarm. Clicking a planet with no selection now just shows a "select
  ships first" toast (`toast.noSelection`) instead of doing anything.
- **Object editor** (`planetEditor.html`, not linked from the game) reuses the
  game's own `materializePlanet`/`materializeBlackHole` functions for its
  live preview, so it can never visually drift from actual gameplay. It
  has no backend, so "Download" just produces copy-pasteable
  `export const ... = {...}` blocks for `js/bodies/*.js`.
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
- **Nebula skybox** (`js/scene/skybox.js#addSkybox()`): a huge (radius 900)
  inverted sphere with a canvas-generated equirectangular texture (a dark
  gradient + additive-blended soft color-cloud blobs in the game's own
  accent palette, same "no external image assets" approach as every
  celestial-body texture in `world/textures.js`) — added once in
  `scene/setup.js#initScene()`, right before the existing `THREE.Points`
  starfield. **Both the skybox material and the starfield's own
  `PointsMaterial` need `fog: false`** — easy to miss since neither one
  errors or looks obviously *wrong* without it, just washed-out: the
  scene's `FogExp2` (density 0.0065) blends anything this far from camera
  almost entirely into the fog color, verified by the difference a single
  screenshot before/after adding `fog:false` to the starfield made (stars
  went from a faint handful of pixels to an actually-populated sky) — the
  math backs it up too (`1 - exp(-(density*distance)^2)` is already
  ~94% at the starfield's own *nearest* radius, 260). A fixed backdrop
  shouldn't dim with camera-relative fog the way foreground objects
  legitimately should. The starfield's per-star tints (`STAR_TINTS` in
  `scene/setup.js`) are deliberately pushed well past a "barely-off-white"
  range — a first pass in the 0.85-1.00 channel range was indistinguishable
  star-to-star at the 1.15px point size actually rendered; only once pushed
  toward real stellar-classification colors (blue-white/white/yellow-white/
  orange/red) did individual colored stars actually read as colored,
  confirmed via a cropped, upscaled screenshot, not just eyeballing the
  full-scene view where single pixels are too small to judge.
- **Pulsars** (`js/scene/pulsars.js`): a handful (`PULSAR_COUNT`, currently
  6) of small `THREE.Sprite`s scattered among the starfield's own radius
  range, each independently brightening/dimming on its own randomized
  period+phase (`updatePulsars(dt)`, called from `main.js`'s `tick()` like
  every other per-frame update) — `Math.pow(sin(t), 4)` sharpens the wave
  into a quick flash-and-fade rather than a smooth breathing glow, closer
  to how a real pulsar reads. Deliberately driven by accumulated `dt`, not
  `performance.now()`, to stay tied to the same clamped delta as everything
  else rather than wall-clock time. Tagged `sprite.userData.pulsar = true`
  purely so other code (or a test) can tell them apart from the sun-halo/
  drone-print sprites already sharing the scene, since none of those set
  that flag.
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
    panel's open/closed state (`ui/dronePanel.js`) — it never touches
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
- **Space station** (`js/station/*.js`): one static per-player landmark,
  same "singleton on `ctx`, not an array" shape as the drone (`ctx.station`,
  not `ctx.ships`) — but unlike the drone it never moves once spawned (no
  fuel/commands, `spawnStation()` picks one random point on a
  `STATION_SPAWN_RADIUS` circle and that's it forever). Selecting it (same
  drone-style pick-priority-before-ships/planets treatment in
  `scene/controls.js`, checked right after the drone) opens a docking panel
  (`ui/stationPanel.js`, `#stationPanel`) that's read-only for now — fleet
  count, evolution points, a compact icon+level upgrade summary reusing
  `TREE`'s own icons — plus shortcuts into the *existing* Tech/Fleet
  modals. No new resource economy was introduced; "manage resources" here
  just means a window onto `state.points`/`state.levels`, not a second
  currency.
  - **The procedural mesh (`js/station/stationModel.js#buildStationMesh()`)
    lives in its own file, separate from the game entity (`station.js`),
    because it genuinely has two callers**: the local player's own station
    (`station.js#spawnStation()`) and every remote player's ghost station
    (`net/shipsBroadcast.js#makeGhostStationMesh()`) — same function,
    different `opts` (see below), so a ghost can never visually diverge
    from what a real station looks like. (An earlier standalone preview,
    `station.html`, used this same function too — built first to settle
    the design before it shipped in-game, then deleted once it did, since
    the actual game became the fastest way to look at it.) The model's
    native proportions (ring radius 23, etc.) are its own arbitrary scale —
    the game shrinks the whole group down via `STATION_MODEL_SCALE`
    (config.js) rather than the model file's own numbers changing.
  - **The pick sphere and selection ring are sized from the model's own
    exported `STATION_SILHOUETTE_RADIUS` constant, not a separate
    `config.js` number** — they're added as children of the (later-scaled)
    mesh group *before* `STATION_MODEL_SCALE` is applied, so the scale
    shrinks hull + hitbox + ring together automatically. Sizing them
    independently in already-scaled world units would have silently
    double-applied the scale to just the hitbox/ring, a real trap given how
    this file was written (scale-the-group-at-the-end came after the
    hitbox already existed once, during development).
  - **Multiplayer sync rides the same periodic `"ships"` broadcast payload
    as the drone** (a `station: [x,y,z,heading]` field,
    `net/shipsBroadcast.js`) — cheap even though the model is visually
    complex, since only that 4-number array ever crosses the network; every
    client builds the identical mesh locally from `buildStationMesh()`,
    confirmed live via two concurrent sessions (one client's real station
    position matched the other client's ghost `stationMesh` position
    exactly). **Ghost stations are recolored differently from ghost
    ships/the ghost drone**: those flatten their entire simple shape (cone/
    octahedron) to one solid owner color, which reads fine on something
    that small, but doing the same to this model's ~150+ greebled
    sub-meshes would just read as a flat blob and lose the whole point of
    the detail. Instead `buildStationMesh({ windowColor, opacity })` only
    retints the window glow + accent stripe to the owner's color and keeps
    every hull material as-is, so a remote station still reads as *a
    station*, just tinted. **As of 1.10.15, `disposeStationMesh(scene, group)`
    is a thin wrapper around the shared `core/utils.js#disposeMesh(scene,
    mesh)`** — `disposeShip()` (`ships/swarm.js`), the drone-consumed-by-
    black-hole cleanup (`world/blackholes.js`), and every ghost unit's
    teardown (`net/shipsBroadcast.js`'s `removeGhostDrone`/the ships-array
    shrink path) had all independently reimplemented the same
    `scene.remove(mesh)` + traverse-and-dispose-geometry/material shape;
    `disposeMesh()` always dedupes materials via a `Set` before disposing
    (needed for the station's ~150+ shared sub-mesh materials, harmless
    no-op overhead for a single-material ship/drone mesh), so there's now
    exactly one dispose implementation instead of four near-identical ones.
