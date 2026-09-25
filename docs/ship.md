# Ship lab (`ship.html`)

A standalone, single-file preview page for procedurally built 3D
spaceships. It isn't linked from the game and isn't loaded by it (so,
like the other dev tools, a change to it needs no version bump). Its ship
code is written so a ship can later be moved into the game with little
work: see [Moving a ship into the game](#moving-a-ship-into-the-game).

Open `ship.html` straight from disk (double-click). No server, no build
step and no network are needed. The only external request is Google
Fonts, and without it the panels fall back to system fonts.

## File layout

One HTML file with four `<script>` blocks, in this order:

| Block | What it is | Needed by the game? |
|---|---|---|
| 1. `<script>` (Three.js r128, minified, MIT) | Vendor library, inlined so the page works offline. Same version as the game. | No (the game loads its own copy) |
| 2. `<script>` (OrbitControls, r128 `examples/js`, MIT) | Mouse camera control for the preview | No |
| 3. `<script id="shipkit">` | **The ship models**: texture generators, materials, shaders, ship definitions, public API. Its header comment repeats the API and the extraction guide. | **Yes, this is the only part to port** |
| 4. `<script id="viewer">` | Preview page: sky, lights, renderer, camera, HUD, sliders, counters. Uses only ShipKit's public API. | No |

The HUD's HTML and CSS sit above the scripts. Search for `id="shipkit"`
or `id="viewer"` to jump to a block. Three.js takes ~600 KB of the
~700 KB file, all on one minified line.

## ShipKit (`window.ShipKit`)

Self-contained: it needs only the global `THREE` (r128) and a DOM
(`<canvas>` for texture generation). No renderer, scene, camera or HUD.

### API

```js
const model = ShipKit.buildShipModel("codewing", { detail: 1 });
scene.add(model.group);
// every frame:
model.update(t, dt, { power: 1, particles: true });
// later:
ShipKit.disposeShipModel(model);
```

| Member | Description |
|---|---|
| `buildShipModel(id, { detail })` | Builds one ship and returns a model handle (below). `detail` is 0.2–2 and scales every segment count. |
| `disposeShipModel(model)` | Removes the group from its parent and frees its geometries and per-model materials. The cached shared materials and all textures are kept for reuse. |
| `modelStats(group)` | Returns object, figure, triangle, vertex, material, shader and texture counts, plus a texture GPU-memory estimate (`texMB`). |
| `SHIP_DEFS` | Registry of ship types (see [Adding a ship](#adding-a-ship)). |
| `allTextures` | `Set` of every generated texture, e.g. to change anisotropy. |
| `isSharedMaterial(m)` | `true` for cached materials that `disposeShipModel` keeps. |
| `makePlating`, `makeBrushed`, `makeGlow` | Texture generators, reusable for other game objects. |
| `util.{rng, valueNoise, fbm, canvas, paintPixels, clamp}` | Seeded RNG, tileable noise and canvas helpers. |

Model handle:

| Field | Description |
|---|---|
| `id`, `detail` | What was built |
| `group` | `THREE.Group`. Origin at the ship's center, nose along **+X**, up **+Y**. |
| `update(t, dt, opts)` | Call every frame. `t` is seconds since start and `dt` the frame delta in seconds. `opts.power` (0–1) is the engine throttle; smooth it on the caller's side. `opts.particles: false` skips the exhaust particles. |
| `setLights(on)` | Turns the running/navigation lights and the ring chase lights on or off |
| `actions` | The action buttons: `[{ id, label, kind: "trigger" \| "toggle", enabled }]`. Always the standard set in this order (`fire`, `scan`, `print`, `offline`), with `enabled: false` where the ship has no animation for it, then any ship-specific extras. See [Actions, offline and damage](#actions-offline-and-damage). |
| `act(id, on)` | Runs a trigger action, or sets a toggle (`on` true/false). Disabled actions are ignored. |
| `offline` | `true` while the OFFLINE toggle is on |
| `setDamage(d)` | Procedural damage, 0 (pristine) to 1 (wrecked) |
| `damage`, `damageEnabled` | Current damage level; `false` if the ship opted out of damage |
| `destroyed` | `true` once `act("destroy")` blew the ship apart; build a new model to get it back |
| `size` | `THREE.Vector3` of the **solid hull only**. Engine plumes, glow sprites and particles are excluded, since they would inflate the box. |
| `radius` | Half of `size`'s diagonal |

Every model gets its **own** shader uniforms (`uTime`, `uPower`), so many
instances can animate and throttle independently. Materials and
textures are cached per ship type and shared by all instances.

### "codewing" (SP-01 CODEWING), measured

| | |
|---|---|
| Size (length × height × span) | 12.06 × 5.78 × 9.76 units |
| Triangles by `detail` | 0.2 ≈ 4.7k · 0.5 ≈ 18k · 1 ≈ 70k · 2 ≈ 276k |
| Objects at `detail` 1 | 76: 64 meshes, 2 instanced groups (110 greebles + 48 ring lights), 8 glow sprites, 1 edge cage, 1 particle system (420 points) |
| Figure types | 13: lathe, box, sphere/segment, torus, extruded shape, tube along curve, cylinder, cone, circle, icosahedron, octahedron (edges), dodecahedron, torus knot |
| Materials / custom shaders | 27 / 5 (engine plumes ×3, logic core, exhaust particles) |
| Textures | 11 canvas-generated textures, ≈39 MB GPU (1024² hull and wing sets: color, roughness, bump, emissive; brushed metal; 3 glow sprites) |
| Build time | ≈1.1 s the first time (texture generation), then a few ms |

### "scribe" (DR-01 SCRIBE, the drone), measured

The first ship meant for the game: a replacement for the drone's plain
gold octahedron (`js/drone/drone.js#makeDroneMesh`), keeping its identity
as a gold, faceted octahedral hull. It has not been moved into the game yet.

| | |
|---|---|
| Size (length × height × span) | 3.98 × 3.44 × 4.47 units |
| Triangles by `detail` | 0.2 ≈ 2.6k · 0.5 ≈ 6.4k · 1 ≈ 23k · 2 ≈ 86k |
| Objects at `detail` 1 | 67: 53 meshes, 2 instanced groups (8 edge struts + 40 belt bolts), 10 glow sprites, 1 dashed line, 1 particle system (240 points) |
| Figure types | 13: octahedron, cylinder, sphere, extruded shape (with a hole), tube along curve, torus, cone, lathe, circle, icosahedron, plane, box, line |
| Materials / custom shaders | 25 / 4 (pod plumes, eye, print laser, exhaust particles) |
| Textures | 9 canvas-generated, ≈19 MB GPU (gold hull plating set, brushed metal, solar cells, a code band, shared glows) |

What's on it, front to back:

- **Hull**: `OctahedronGeometry` scaled to half extents 1.5 × 1.35 × 1.15
  (nose along +X), flat-shaded, gold `makePlating` texture with two blue
  bands. Its section at height `y` is a rhombus (1.5, 1.15)·(1 − |y|/1.35),
  which the code uses to place parts on the surface.
- **Edge struts**: one `InstancedMesh` of cylinders, each matrix composed
  from an edge's midpoint, the rotation from +Y onto the edge, and its
  length.
- **Belt**: an `ExtrudeGeometry` of a rhombus with a rhombus `hole`
  (`Shape.holes`), bevelled, around the waist, with 40 instanced hex bolts
  on top.
- **Four thruster pods** on arms bent along `CatmullRomCurve3` tubes, with
  a gold sleeve aligned to the curve's tangent. Each pod sits in a gimbal
  that swivels with the throttle (thrust vectoring); the lathed bells,
  plume shader and glow sprite are codewing's.
- **The eye** at the nose: a `ShaderMaterial` working in polar
  coordinates around the eye's +X axis (iris rings and spokes, a dark
  pupil with a hot rim, a Fresnel sheen). It glances to a new pseudo-random
  target every ~1.3 s, eased. It sits well in front of the hull's tip
  (center at x = 1.62): the belt's pointed front reaches x = 1.74 and,
  with the eye further back, poked through the iris.
- **Crown** on the top vertex: an open cylinder with an additive,
  horizontally scrolling band of the drone's own script language
  (`makeCodeBand`), between two gold rims, around a spinning emissive
  crystal. Its texture offset is shared by every instance of the type, so it's
  set from the clock (`-t * 0.06`), never incremented per frame — with
  several drones on screen (every player's), `+= dt` would scroll it
  that many times faster.
- **Solar wing** on a mast: a hinge bar with two `PlaneGeometry` panels
  using a canvas solar-cell texture (`makeSolarCells`), slowly tracking.
- **Fuel tanks**: lathed capsules under the waist with an emissive gauge
  that drains while the engines run and refills when they're off.
- **Print laser** (the in-game `print()` writes text into gas with a
  laser): a belly turret whose beam is an open cylinder with an additive
  dash shader. It fires in bursts, sweeps side to side and has a glowing
  hit point at its end.
- **Sensor sweep**: a `LineDashedMaterial` ring around the drone
  (`computeLineDistances()`), tilted and rotating; it's hidden together
  with the running lights.
- Hover bob and a slight wobble of the whole body, navigation lights and
  strobes, and exhaust particles from the four pods.

### Techniques used

- **Hull plating** (`makePlating`): recursive panel split; seams,
  rivets, grime streaks, painted stripes, markings and lit windows. A
  single layout produces matching color, roughness, bump and emissive
  maps, so a dark seam is also grooved and rougher.
- **Brushed metal** (`makeBrushed`): stretched value noise plus
  machined ring grooves.
- **Engine plumes**: `ShaderMaterial` with noise flicker, moving shock
  diamonds and a view-angle falloff, drawn with additive blending.
- **Logic core**: Fresnel shader with scrolling scan lines, inside a
  rotating octahedron edge cage.
- **Greebles**: one `InstancedMesh` of boxes placed on the lathe surface
  and aligned to its normal.
- **Ring chase lights**: an `InstancedMesh` whose per-instance colors are
  rewritten every frame.
- **Exhaust particles**: recycled `Points` with a size and fade shader.

## Actions, offline and damage

Shared by every ship (`buildShipModel` wraps each definition's `build()`
result), so a new ship gets them with no work:

- **Standard action set** (`STANDARD_ACTIONS`): `fire`, `scan`, `print`
  (triggers) and `offline` (a toggle). A ship **enables** one by listing
  it in its build result's `actions` — it can relabel it, e.g.
  `{ id: "fire", label: "FIRE CANNONS" }` — and handles it in
  `act(id, on)`. Anything it doesn't list stays visible but disabled, so
  a ship without an animation for something simply leaves it out
  (codewing has no `print`). Extra ship-specific actions (any other id)
  are appended after the standard four.
- **OFFLINE**: implemented once for all ships — engines forced to power 0
  and the running lights switched off. The ship's `act("offline", on)`
  gets the state too, to dim its own parts: codewing's logic core,
  lit windows (a per-model copy of the hull material), gyro and reactor
  wind down; the drone sinks and lists, and its eye, code ring
  ("switched-off lettering"), crystal and fuel gauges go dark.
  Offline, the ship's own actions are ignored.
- **Damage** (`setDamage(0..1)`, `createDamageFx`): 8 damage sites are
  sampled once, with a fixed seed, on the ship's big solid meshes (a
  random triangle, a random point on it, its outward normal). Each carries
  a scorch decal (a ragged dark circle with polygon offset) and an ember
  glow, parented to that mesh so they follow its animation. With damage
  rising: more sites show, the decals grow, smoke puffs rise from them
  (a `Points` system with a soft noise texture and normal blending),
  spark bursts fly out (additive points with drag), the lights flicker,
  and from 70% up small parts break off and drift away spinning. They're
  put back where they were when damage goes down again.
- **DESTROY** (the fifth standard action, shared): the final destruction.
  A flash, staggered fireballs, an orange shockwave and a spark burst
  from every damage site (damage jumps to 100% and the ship powers
  down). 0.12 s later the ship comes apart: its top-level parts
  (engines, eye, crown, wings, rings… — for the drone the children of
  its bobbing `body` group, found automatically as "the group holding
  most of the meshes") fly off whole, spinning, with slight drag; its
  big solid meshes (hull, wings) are first **fractured** by
  `fractureMesh()` — triangles grouped around 6–9 random seed triangles,
  each group its own mesh centered on itself. Burning damage sites move
  onto the nearest chunk, so the wreckage trails smoke. After that the
  model ignores every action; `model.destroyed` is true, and the viewer's
  button turns into REBUILD, which simply builds a new model.
- A definition can opt out of the shared features:
  `features: { offline: false, damage: false, destroy: false }` (the
  button / slider then show as disabled). DESTROY needs damage, since it
  reuses its smoke and sparks.

Helpers for writing actions (exported too):

| Helper | What it does |
|---|---|
| `makeBoltPool(parent, color, opts)` | Laser bolts: `fire(origin, dir)` launches a glowing rod with a muzzle flash, `update(dt)` moves them. |
| `makeScanWave(parent, color)` | An expanding shell with a Fresnel rim and scan lines: `start(pos, radius)`, `update(dt)`. |
| `textTexture(text, color)` | A glowing word on a transparent canvas (cached), e.g. for a sprite. |
| `fxTextures()` | The shared smoke puff and scorch textures. |

What each ship does:

| Action | codewing | scribe (drone) |
|---|---|---|
| fire | 4 alternating bolts from the wingtip cannons | 3 bolts from the eye along its gaze, the eye flares |
| scan | a sensor ping from the dish | a teal wave from the crown, the eye turns teal, the sweep ring speeds up |
| print | — (disabled) | the belly laser writes "HELLO" into a gas cloud at the beam's end, then it fades |

In the lab, bolts and waves live in the ship's own space. In the game
they'd need to be world-space objects (so a turning ship doesn't drag its
shots along).

## Viewer (preview page)

- **Left panel**: ship name and prev/next navigation over `SHIP_DEFS`,
  the MODEL statistics, a per-type FIGURES list, toggles for
  auto-rotate, engines (the throttle eases in and out), running lights
  and wireframe, then ACTIONS — one button per `model.actions` entry
  (disabled ones greyed out, triggers flash, toggles stay lit, OFFLINE in
  red) — and a Damage slider. Toggles and damage survive a detail
  rebuild; switching ships resets the toggles.
- **Right panel, OPTIMIZATION**:
  - **Render quality**, 5 presets:

    | Preset | Pixel ratio | Shadow map | Anisotropy | Particles |
    |---|---|---|---|---|
    | LOW | 0.5 | off | 1 | off |
    | MEDIUM | 0.75 | 1024 | 2 | on |
    | HIGH | 1 | 2048 | 4 | on |
    | ULTRA (default) | device pixel ratio, clamped to 1–2 | 2048 | 8 | on |
    | MAX | 1.5 × device pixel ratio, up to 3 | 4096 | 16 | on |

    Toggling shadows sets `material.needsUpdate` on every material so
    the shaders recompile.
  - **Geometry detail** (20–200%) rebuilds the model live through
    `buildShipModel(id, { detail })`, at most once per animation frame
    while the slider is dragged.
  - **PERFORMANCE**: FPS, frame time, CPU time per frame (JS update plus
    draw submission), triangles and draw calls per frame
    (`renderer.info`), render resolution, and a color-coded FPS graph.
- **Scaling**: both panels share one CSS scale factor (`--ui`, 0.45–1.35),
  set by `fitHud()`. It follows the window size, keeps both panels
  inside the window height and stops them overlapping. It re-runs on
  resize, after web fonts load and after each rebuild.
- **Scene**: a generated equirectangular nebula sky is used both as the
  sky dome and, through `PMREMGenerator`, as `scene.environment`
  (reflections on the metal). A warm key light casts shadows, with a
  cool rim light and a hemisphere fill. Output is sRGB with ACES
  filmic tone mapping.

## Adding a ship

Push one more entry into `SHIP_DEFS` inside the `shipkit` block, in the
same shape as `codewing`:

```js
SHIP_DEFS.push({
  id: "myship",               // key for buildShipModel(id)
  name: "SP-02 …",            // HUD title
  camera: [x, y, z],          // viewer's starting camera position
  _assets: null,
  assets() { /* create + cache textures/materials once; add them to
               sharedMaterials and trackTextures(...) */ },
  // features: { offline: false, damage: false },  // opt out of shared ones
  build(detail) {
    const seg = (n, min = 3) => Math.max(min, Math.round(n * detail));
    // build with seg(...) segment counts, nose along +X
    const actions = [{ id: "fire", label: "FIRE" }];       // enable what you animate
    function act(id, on) { /* "fire", "scan", "print", "offline" (on = state), extras */ }
    return { group, update(t, dt, opts) {}, setLights(on) {}, actions, act };
  },
});
```

The prev/next arrows, statistics, detail slider, wireframe and light
toggles work for it with no extra code. Create any per-model
`ShaderMaterial` with its own uniform object (see `U` in `codewing`),
not a shared one.

## Moving a ship into the game

The same guide is in the header comment of the `shipkit` block.

1. **Module**: copy the `shipkit` block into e.g.
   `js/ships/shipModels.js`, following the
   `js/station/stationModel.js` pattern (`buildStationMesh(opts)` /
   `disposeStationMesh(scene, group)`). Replace the
   `window.ShipKit = (function () { … return {…}; })();` wrapper with
   top-level code and an `export { … }`. Add the new file to
   `js/versionCheck.js#MODULE_FILES`.
2. **Orientation**: game ships (`js/ships/swarm.js`) steer with
   `mesh.lookAt(target)`, so their forward is **+Z**. Wrap the model:
   `model.group.rotation.y = -Math.PI / 2` inside a holder group.
3. **Scale**: the current game ship (the cone in `makeShipMesh()`) is
   0.9 units long. `holder.scale.setScalar(0.9 / model.size.x)` is
   ≈0.075 for codewing; the final size is a design decision.
4. **Renderer differences (important)**: `js/scene/setup.js` sets no
   `scene.environment`, no sRGB output, no tone mapping and no shadows.
   Without an environment map the metal parts (metalness 0.7–1) render
   almost black, so either add one in the game or lower metalness when
   porting. Colors also shift without sRGB output and tone mapping.
   `shadowed()` only sets the cast/receive flags, which are harmless
   with shadows off.
5. **Performance**: build once during loading, e.g. behind the start
   screen, because the first build generates the textures (≈1.1 s CPU).
   For a swarm, use `detail` 0.2–0.4 and `update(…, { particles: false })`,
   and consider skipping `update()` for distant ships.
6. **Picking and selection**: keep the game's invisible pick sphere and
   selection ring in the wrapper group; `model.radius` helps size them.
7. **Repo conventions**: a game change needs `js/version.js`,
   `CHANGELOG.md` and the `?v=` params in `index.html` bumped; English
   comments; no trademarked franchise names (see `CLAUDE.md`).

## Gotchas

- **Hull text orientation**: the lathe's UV `u` runs around the hull, so
  a marking painted with the same rotation reads correctly on one flank
  and upside down on the other. Markings on the +Z flank (u ≈ 0/1) use
  `rot: -π/2`, those on the −Z flank (u ≈ 0.5) use `rot: +π/2`, and no
  mirroring is needed. Verify both flanks after changing a marking.
- **Additive plume brightness**: Three's `AdditiveBlending` uses
  `SRC_ALPHA, ONE`, so the fragment shader outputs `alpha = 1` and
  carries the intensity in RGB. Outputting the intensity as alpha as
  well squares it, and the plume becomes almost invisible (a real bug
  here, fixed).
- **Bounding box**: `Box3.setFromObject` on the whole group includes
  the ~5-unit engine plumes (16.4 instead of 12.06 units long).
  `buildShipModel` measures only non-additive meshes.
- **Three.js r128 `BufferAttribute` has no `getComponent()`** (added in a
  later release): `fractureMesh()` reads `attribute.array` directly
  (`array[i * itemSize + k]`). The first version called
  `getComponent()` and threw the moment DESTROY was pressed.
- **Headless testing**: Playwright's Chromium renders WebGL through
  SwiftShader (`--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`). It works, but at 1–8 FPS. Those FPS
  numbers are meaningless; on a real GPU the page runs normally.
- **Rebuilding the single file**: Three.js and OrbitControls are pasted
  in as-is from the `three@0.128.0` npm package (`build/three.min.js`,
  `examples/js/controls/OrbitControls.js`). Edit the `shipkit` and
  `viewer` blocks directly; to update a library, replace its whole
  `<script>` block.
