# Rendering notes: models, image quality, sky

Split out of [`architecture.md`](architecture.md) (2026-10-02). The why and
the history behind how the game draws: colour management, the ShipKit /
BodyKit models in the game, Setup → Graphics and PostKit, the sky, the
ship cam. The kits' own APIs are in [`ship.md`](ship.md) and
[`bodies.md`](bodies.md).

The game's notes are in three files: [`architecture.md`](architecture.md)
(world, network, programs, units), [`ui.md`](ui.md) (screens, HUD,
windows, load order) and [`rendering.md`](rendering.md) (models,
image quality, post-processing, sky).

## Contents

Section names only (no line numbers — they'd go stale). To jump to one
without reading the whole file: grep `^## ` for its current line number,
then read just that range.

- [Rendering and ShipKit models](#rendering-and-shipkit-models)
- [Image quality (Setup → Graphics)](#image-quality-setup--graphics)
- [Sky backdrop (nebulae, stars, pulsars)](#sky-backdrop-nebulae-stars-pulsars)
- [Ship cam](#ship-cam)

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
  `makeGameHolder` to +Z forward and `DRONE_MODEL_LENGTH` (0.7 since v2.16.0) units,
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
  SWARMER up close, a stand-in further from the camera (the old light
  cone beyond `SHIP_LOD_DISTANCE` 30 then; since v2.21.0 a glow dot by
  default, at `gfxLodDistance` — "Image quality"); the model is built lazily (merged, effects in the
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
  `bodyMeshParts.js` kept only the selection bracket (and was removed in
  v2.15, see "Selection frames" below).
- **Selection frames (v2.15.0, `scene/selectionBrackets.js`)**: the corner
  marks around a selected body (planets, Sun, meteoroid, comets, the
  black hole) are an HTML overlay on the 3D view, not a sprite in the
  scene: 1 px lines, arms ≤ 12 px, 8 px outside the body's edge on
  screen, the same at any zoom (the frame follows the body's projected
  size). `updateSelectionBrackets()` runs after the renders in main.js;
  the layer (`#selectionBrackets`, fixed, clipped to the view rect) is
  pointer-events:none. They no longer show in the ship cam or the
  PLANET INFO miniature. `setPlanetSelected()` lives there now (only the
  flag).
- **Ship glow lights reach the bodies (v2.11.1)**: BodyKit shaders ignore
  THREE lights, so the setting looked like it did nothing (the light also
  sat inside the hull). Now it's behind the engines (`SHIP_LIGHT_*` in
  config.js, intensity × eased engine power), and `world/bodyVisual.js`
  passes the nearest visible ship lights to each body (`opts.lights`,
  max 4, BodyKit's `pointLightAt()`). Toggling it still recompiles the
  game's standard-material shaders once (a light count change). **Since
  v2.17.1 the two parts differ**: the scene PointLight is short and weak
  (`SHIP_LIGHT_INTENSITY` 0.8, `SHIP_LIGHT_RANGE` 2.2 — after the units
  shrank, the old 1.5 / 7 bathed the whole smaller station in teal), the
  body light keeps `SHIP_BODY_LIGHT_INTENSITY` 1.5 / `SHIP_BODY_LIGHT_RANGE`
  7 (scaled by the same eased engine power).
- **Dev Tools -> Performance stats** (`ui/hud/perfStats.js`): FPS, frame
  time, worst frame, CPU time (update + render), draw calls and
  triangles summed over all of a frame's render passes (main view, ship
  cam, miniatures — `renderer.info.autoReset` is off and it's reset once
  per frame in `perfFrameStart()`), GPU memory (geometries / textures /
  shader programs), render resolution, scene object count, bodies /
  ships / players, JS heap (Chrome), plus a frame-time graph. `main.js`
  brackets each frame with `perfFrameStart()` / `perfRenderStart()` /
  `perfFrameEnd()`; the toggle is remembered (`roj-devPerf`).

## Labs and the game: the same picture (audit 2026-10-03, v2.34.1)

What a lab shows must be what the game shows at the same settings. Checked
setting by setting; where they differed, the lab or the game was changed.

| Setting | Game | Labs | State |
|---|---|---|---|
| Output, tone mapping | sRGB, ACES | the same | same |
| Exposure | 1.1 | 1.1 (the ship lab had 1.15) | fixed |
| Environment map | `ShipKit.makeEnvironment` (sky 1024×512) | the ship lab made its own at 2048 | fixed: the same call |
| Render quality → pixel ratio | `pixelRatioFor` 0.5 / 0.75 / 1 / device / 1.5× | the same table | same |
| Particles | off at LOW | off at LOW | same |
| Ship detail | Setup × `ShipKit.GAME_DETAIL[id]` (swarmer 0.5, haven 0.7, scribe 1) | GAME BUILD used 1× | fixed: GAME BUILD uses the table |
| Body detail | × `BodyKit.GAME_DETAIL_SCALE` | GAME BUILD the same | same |
| Noise octaves | `BodyKit.QUALITY_OCTAVES[quality]` | the same | same; the game's sky stayed at 6 — fixed |
| Anisotropy | Setup: MIN 1×, NORMAL 4×, MAX 16× | the ship lab 1/2/4/8/16 by quality | fixed: 1/1/4/4/16 (the presets' qualities match) |
| Image effects | PostKit, Setup's presets | PostKit, the same presets | same; sharpening per preset (0.5 / 0.3 / 0.2) fixed in the labs |
| Lighting | ambient + two scene lights, no shadows | the ship lab: a studio key with shadows, rim, hemisphere | **by design**; the ship lab's GAME LIGHTING shows the game's |
| The ground (game) | was fixed detail 1, particles on, octaves 6, no post | — | fixed: Setup's detail, particles, octaves (`G.setGraphics`) and the same post-processing (`post.js#renderPostScene`) |

Rules:
- A game-side detail factor lives in the kit (`ShipKit.GAME_DETAIL`,
  `BodyKit.GAME_DETAIL_SCALE`), never as a bare number in game code, so the
  lab's GAME BUILD can use it.
- A new renderer setting in the game (exposure, environment, tone mapping)
  goes into every lab the same day.
- Anything the game renders outside the main view (the ground, a future
  view) goes through `post.js` and follows Setup.

## Image quality (Setup → Graphics)

v2.21.0, the user's request ("everything, each with on/off / adjust /
manual / auto"). All settings in `settings.js` (`gfxResMode`,
`gfxTargetFps`, `gfxMaxRes`, `gfxSmoothLines`, `gfxLineWidth`,
`gfxFarShips`, `gfxLodDistance`, `gfxFxaa`), read through
`scene/graphics.js` getters, changed with `setGfx(patch)` (listeners get
the values from before). The Setup tab is a scrolling list; controls with
`data-key` are bound generically in `ui/setupModal.js#initImageQuality`.

- **Resolution** (`scene/resolution.js`, called every frame before the main
  render): manual = `pixelRatioFor(gfxQuality)`; auto = starts at the
  screen density, every 1.5 s +0.1 while fps > 1.2 × target, −0.15 when
  below 0.92 × target (not in the first 6 s: shader compiles), between 0.6
  and density × `gfxMaxRes` (above 1 = supersampling). The pixel ratio
  only changes in steps (it reallocates the drawing buffer).
  `scene/setup.js` no longer sets it after startup.
- **Smooth lines** (`scene/lines.js`): `makeLineMaterial(spec)` /
  `makeLine(points, mat)` give Line2 + LineMaterial (vendor add-ons) or a
  plain `THREE.Line`; `setLineResolution()` runs before every render pass
  (`viewRect.js`); `onLinesChange(fn)` rebuilds a caller's lines when the
  mode changes (width changes apply live). Used by `orbitLines.js`
  (orbits, comet paths — a live comet keeps its old line until the next)
  and `trajectories.js` (lines recreated each refresh).
- **Far ships** (`ships/shipVisual.js#makeFar`): "dot" — an additive glow
  sprite, constant screen size; "cone" — the old stand-in; "model" — no
  stand-in, always the model. The distance is `gfxLodDistance` (was the
  constant `SHIP_LOD_DISTANCE`, removed).
- **FXAA**: the main view renders into an offscreen target the size of
  the view rect (multisampled on WebGL2), whose texture is sRGB — so the
  scene writes its final tone-mapped colours into it — then a quad with
  `THREE.FXAAShader`. Verified: colours identical with it on and off. The
  miniatures and the cockpit view don't go through it. Since v2.23.0 part
  of the post-processing chain below (it was `viewRect.js#renderWithFxaa`).
- **Post-processing** (v2.23.0, `scene/post.js`; the user asked for all
  of it, each switchable; since v2.25.1 the steps live in PostKit,
  `js/postkit/postkit.js`, shared with the labs — `post.js` only maps
  settings and game objects to its options): `viewRect.js#renderMainView`
  hands over to `renderPost` whenever `postActive()`. Order: scene → offscreen target
  (MSAA = its sample count: `gfxMsaa` 0/2/4/8; the canvas's own ≈×4 is
  fixed at context creation) → **lensing** (only with the black hole in
  view: the scene is drawn with the hole hidden, warped around it with a
  point-lens mapping r → r·(1 − E²/r²), then the hole is drawn over the
  warp — warping BodyKit's disk too made a bullseye) → **bloom**
  (`UnrealBloomPass.render(renderer, null, src)` adds into `src`; its
  high-pass gets `smoothWidth` 0.06; the threshold works on the
  tone-mapped LDR image, so a sunlit ice planet near 0.95 glows too —
  default threshold 0.93 is the compromise) → **FXAA** → **depth of
  field** (focus camera only, eased in; a quarter-size blurred copy) →
  the final shader: DOF mix by *screen* distance from the centre (no
  depth readable from a multisampled target in WebGL here; the focused
  object is always centred), the Sun's **flare** (visibility read from 7
  samples of the Sun's disc in the image itself, so a planet in front
  dims it with no extra pass), and the **filter** (aberration, vignette,
  grain). Cost measured headless: bloom ≈ −25 % fps, the rest small.
- **Engine trails** (v2.24.0, `fx/trails.js`): own ships + the drone; a
  camera-facing strip of recent tail positions (3 vertices across: dark
  edges, bright middle — a soft ribbon), additive, narrowing and dimming
  with age; the newest point rides with the engine so the trail never
  lags. Direction from the last frame's position (the drone has no `vel`).
- **Eclipses** (v2.24.0, `scene/eclipse.js`): no shadow maps — every lit
  built-in material (ShipKit's too) gets an `onBeforeCompile` (and a
  `customProgramCacheKey` that keeps its own hook's key) adding a
  world-position varying and an analytic sphere-occlusion test against
  the Sun's disc (umbra + penumbra), reading shared uniforms set each
  frame from `ctx.planets`. It scales direct light and — because ShipKit
  models get most of their light from the environment map — the indirect
  light down to 30 %. Needs one recompile per material, so `main.js` runs
  it before the start-up `renderer.compile`. The patching rides on
  `colorManagement.js`'s per-frame walk (`manageSceneColors(scene,
  patchEclipseMaterial)`, v2.28.2) — one walk of the scene, not two. BodyKit bodies don't take
  part.
- **Bite effects** (v2.24.0): `fx/particles.js#spawnSparks` (hot
  particles coloured by a cooling ramp), `fx/impact.js` (a flickering
  glow sprite at the beam's contact point, hidden with the beam). The
  particle pool now draws round dots (a canvas texture).
- **Presets** (v2.25.0, `graphics.js#applyPreset`, `TIERS` + `RES`):
  `gfxPreset` "auto" | "min" | "normal" | "max" | "custom". Every
  `setGfx` without its `fromPreset` flag (so every change by hand,
  including the old quality/detail sliders and ship lights, now routed
  through it) sets "custom". AUTO = NORMAL's effects + auto resolution
  (max ×1.5); `resolution.js#autoTier` steps `gfxAutoTier` down after 6 s
  at the lowest resolution below 0.9 × target fps, up after 20 s at the
  highest above 1.3 × — only the effects change, the resolution stays
  automatic, and each step restarts the warm-up. A tier switch leaves
  `gfxDetail` / `gfxSmoothLines` alone (v2.28.2): they rebuild models and
  lines — a hitch mid-game. Presets never set
  `gfxUnitLights` (v2.25.3): a light-count change recompiles every lit
  material — a mid-game hitch if AUTO did it. NORMAL has depth of field
  and the filter off (v2.25.4, user's call; also PostKit's lab NORMAL).
  On load `syncPreset()` re-applies the current preset's values, so a
  preset changed in an update reaches its players; "custom" is untouched.
- **Layout** (v2.25.2): the tab is grouped (`.gfxHd` headers: picture &
  sharpness, models, light, effects, camera — the preset on top); every
  option has a `.gfxCost` [?] badge, `data-cost` low/mid/high (colour)
  and `data-tip` → tooltip `setup.gfx.cost.*` + `setup.gfx.tip.*`
  (`i18nApply.js`). A new option gets a badge too.
- **Description pane** (v2.26.0, the user's reference: a big game's
  settings screen): with the Graphics tab active `#setupModalBox` gets
  `.wide` (1000×824 design px, the list 704 px tall) and `#gfxHelp` on
  the right shows `setup.gfx.help.<key>` — `d` (what it does), `v`
  (value → meaning pairs), `def` (the default, as text) — plus the cost
  line. The key comes from the hovered section's last `.gfxCost`
  (`data-tip`) or `[data-help]` above the pointer (`setupModal.js#initGfxHelp`).
  A new option needs a `help` entry in both languages.
- **Anisotropic filtering** (v2.26.0, `scene/anisotropy.js`): sets
  `ShipKit.allTextures` to `gfxAniso` (capped by the GPU), re-checked
  every 2 s for textures of newly built ships; no recompile.
- **Sharpening and light rays** (v2.26.0): both in PostKit's final pass —
  sharpening is CAS-like (pixel vs its 4 neighbours, scaled down where
  local contrast is high); rays sum 24 samples of the picture's bright
  parts along the line to the sun (so an occluding planet cuts shafts).
  Flare and rays fade out when the sun's disc is large on screen.
- **Frame limiter** (v2.26.0, `main.js#tick`): frames arriving early are
  skipped whole; `lastFrameAt` advances by a steady interval (resetting
  only when far behind) — a plain `lastFrameAt = now` with 144 Hz
  requestAnimationFrame gave 27 for a cap of 30, carrying the remainder
  over gave ~40. `resolution.js` takes the cap as its target and counts
  hitting it as headroom. Presets never touch it.

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
