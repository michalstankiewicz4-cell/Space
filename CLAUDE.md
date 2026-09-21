# Project brief: Swarm Protocol

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
  every meaningful change (feature, balance change, notable fix) **to the
  game itself or `supabase/schema.sql`** — this is how two GitHub Pages
  deploys of the actual game are told apart after a push. Also bump the
  `?v=` cache-busting query param on `css/style.css` and `js/main.js` in
  `index.html` to the same value (see the cache-busting gotcha below) —
  it's a hardcoded literal, not read from `js/version.js`, so it's easy to
  forget. **Explicitly excluded** (all explicit user calls, not
  oversights — the common thread is "doesn't change what a player's
  browser actually loads/runs"):
  - `admin.html`/`editor.html` and their own `js/admin/`, `js/editor/`,
    `css/admin.css`, `css/editor.css` — standalone dev tools with no
    version-check mechanism of their own (`js/versionCheck.js` only ever
    watches the *game's* `js/version.js`), so a version bump for them
    wouldn't actually tell two deploys apart the way it does for the
    game — just noise in `js/version.js`'s history.
  - The devlog (`blog/` folder, and publishing a post via the Blogger
    API — see "Devlog (Blogger)" below) — a completely separate site on
    a separate host (Blogger), not part of what GitHub Pages serves for
    the game at all.
  - **Pure documentation edits** — a change touching only `.md` files
    (`README.md`, this file, `IDEAS.md`, or a `CHANGELOG.md` edit *not*
    accompanying an actual game/schema change) — nothing about the
    deployed game bundle changed, so there's nothing for a version bump
    to distinguish.

  `CHANGELOG.md` follows the same split, since its own header frames it
  as "changes to the game, version by version" — none of the above have
  a version number to file themselves under, so they're just a plain git
  commit, not a changelog entry.
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
    for it doesn't exist.
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
    station*, just tinted — `disposeStationMesh()` (also in
    `stationModel.js`) exists because disposing a many-material group needs
    to walk it and dedupe shared materials, unlike the single
    geometry+material `.dispose()` calls `removeGhostDrone()` gets away
    with.

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
- **INSERT/DELETE on `bodies` stay permissive on purpose — up to a rate
  (1.9.2).** Any anon-authenticated client can still insert or delete
  rows directly (steward election is a client-side courtesy for
  spawning, not a security boundary; DELETE is idempotent so it's safe
  for any client to call) as long as they're not doing it faster than
  any legitimate play ever would — see the `BEFORE INSERT`/
  `BEFORE DELETE` triggers in the `activity_log` bullet below, which now
  actually reject a burst past 15-in-10s, not just log it. Below that
  rate, what keeps it safe is entirely the CHECK constraints — and a shared
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
  bodies, as long as they pace it under the burst-rejection threshold —
  both stay low-severity and self-healing, and both are now at least
  *noticed* even when paced that carefully (see the activity_log bullet
  below).
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

  15-in-10s deliberately sits just above the one legitimate burst that
  exists (the steward's one-time ~14-body world-seed insert) — a false
  positive there costs a retried top-up at worst (another client's
  staleness fallback or its own next cycle covers it), which is cheap
  enough that the threshold didn't need tuning to avoid every possible
  false positive. Applying every insert/delete unconditionally (no
  threshold at all) was considered and rejected for the *logging* half
  specifically: at any real play volume it would have outgrown the
  free-tier 500MB database limit in days — `activity_rate` stays small
  regardless (one row per active actor per action, upserted in place),
  but an unconditional `activity_log` would grow without bound. No UI
  for this **in the game** — `admin.html` (separate entry
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
    `actor_nicks` (`actor uuid primary key default auth.uid()`) exists so
    the client can self-report it once per connection (`net/connect.js`,
    right after the existing `roomChannel.track()` call, via
    `set_my_nick(p_nick)`) — **explicitly not verified identity, unlike
    everything else on this page**: a modified client could claim any
    nick at all, including someone else's, since nothing checks it
    against what that actor actually broadcasts elsewhere. Treat it as a
    hint for the honest-majority case, never as proof. `actor_nicks` has
    RLS enabled with **zero policies**, same as everywhere else in this
    file — it used to have direct insert/update-your-own-row policies,
    which meant a script could hammer `.upsert()` with no throttle at
    all; `set_my_nick()` is now the only door in, rate-limited to 5
    calls/30s the same `bump_activity_rate` way as everything else
    (verified live: the *5th* of 8 rapid calls is what ends up stored,
    not the 8th — the rest silently drop and log as `set_nick_spam`),
    and clamps the nick to 20 chars server-side (`NET_MAX_NICK_LENGTH`)
    so this self-reported field can't be used to stash an arbitrarily
    long string.
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
  "Devlog (Blogger)" below) — unrelated service, same "don't commit this"
  treatment.

## Devlog (Blogger)

There's a companion devlog at
[swarmprotocol.blogspot.com](https://swarmprotocol.blogspot.com/) (Polish;
blog ID `4054180551202581680`), set up 2026-09-21 — separate from the
game itself, published via the Blogger API rather than its web UI.
Credentials (`BLOGGER_OAUTH_CLIENT_ID`/`_SECRET`/`_BLOG_ID`/
`_REFRESH_TOKEN`) live in the gitignored `pass` file, same as the
Supabase Management API token.

- **Post images are hosted in this repo's `blog/` folder (served via
  GitHub Pages), not uploaded through Blogger** — the Blogger API has no
  endpoint for uploading post images directly, only for posting HTML
  content that can *reference* an image by URL. Every post's `<img>` tag
  points at a `blog/<file>` GitHub Pages URL.
- **Every AI-generated image needs a small caption disclosing it's
  AI-generated and isn't (and won't become) an actual in-game asset** —
  an explicit, standing instruction from the user after the first post's
  hero image went up without one initially.
- **The OAuth client's only registered redirect URI is
  `https://developers.google.com/oauthplayground`** — because the
  refresh token was minted by walking through Google's own OAuth
  Playground UI (gear icon → "Use your own OAuth credentials" → paste
  client ID/secret → add scope `https://www.googleapis.com/auth/blogger`
  → Authorize → Exchange authorization code for tokens), after a
  `localhost:PORT`-based manual flow failed with `redirect_uri_mismatch`
  (that redirect URI was never added to the client's authorized list).
  If the refresh token ever needs regenerating, redo it via OAuth
  Playground rather than fighting a fresh `localhost` flow again.
- **`posts.publish`/`posts.revert` (and any other empty-body POST to the
  Blogger API) need an explicit `Content-Length: 0` header** — without
  it, Google's edge returns a bare `411 Length Required` HTML page
  instead of JSON, which `curl -X POST` (with no `-d`) doesn't send
  automatically.
- **A `posts.patch` call landing around the same time as the user
  manually clicking "Publish" in the Blogger UI looks identical to the
  patch itself having silently published the post** — this happened once:
  a content update was immediately followed by the post showing
  `status: LIVE` instead of the expected `DRAFT`, which looked exactly
  like the PATCH call had an undocumented side effect of publishing —
  leading to an unnecessary `posts.revert` that undid the user's own
  intentional manual publish. **Confirm with the user before assuming a
  status change was caused by an API call and reverting it** — it may
  just be their own concurrent action in the Blogger UI.

## Known gotchas

- **A burst of several pushes in quick succession can leave GitHub Pages
  stuck "errored" for several minutes — not a Jekyll/content problem,
  despite first appearances.** Hit this directly: `gh api
  repos/.../pages/builds/latest` reported `status: "errored"` /
  `"Page build failed."` (no further detail) for two commits in a row
  right after adding `IDEAS.md`, which looked exactly like that new file
  had broken something. The real story, found via `gh run list` (the
  underlying `pages-build-deployment` Action, which has actual job logs,
  unlike the legacy Pages Builds API): those two runs were **cancelled**,
  not failed — each push had triggered a new deployment run before the
  previous one finished, and GitHub's concurrency group for this workflow
  cancels an in-flight run when a newer one starts. The legacy API just
  reports a cancelled run as a generic "errored," indistinguishable from
  an actual build failure without checking `gh run list` too. Once pushes
  stopped for a few minutes, the next run completed on its own (took
  3m44s that time, vs. the usual well under a minute — some queue
  backlog from the cancelled runs, presumably) and everything deployed
  fine. **If a deploy ever looks stuck/errored, check `gh run list
  --repo michalstankiewicz4-cell/Space` for the real job status before
  assuming content broke the build** — and if several runs show
  `cancelled`, the fix is just to stop pushing for a bit, not to go
  hunting for what's "wrong" with the latest file.
- Repo root also has an empty `.nojekyll` file (added while chasing the
  above, before the real cause was found) — turned out not to be what
  fixed it, but harmless to keep either way, since this project was never
  meant to go through Jekyll processing in the first place (no
  `_config.yml`, explicit "no build step" design).
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
