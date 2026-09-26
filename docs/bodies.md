# Body lab (`bodies.html`) and BodyKit

A standalone preview page for procedurally generated celestial bodies,
the companion of [`ship.html`](ship.md) and built on the same scheme.
The bodies themselves live in **`js/bodykit/bodykit.js` (BodyKit)**, one
file shared by the lab and the game (since v2.10.0), exactly like
ShipKit: a body tuned in the lab is the body the game shows. There is no
copy to keep in sync.

Open `bodies.html` straight from disk (double-click). No server, no build
step and no network are needed: the fonts come from the repo's own
`css/fonts.css` / `fonts/` (they load from disk too, checked in Chromium). The page
itself (the viewer) is a dev tool and needs no version bump, but
**`js/bodykit/bodykit.js` is part of the game**: changing it needs the
bump (`js/version.js`, `CHANGELOG.md`, the `?v=` params).

## File layout

| Part | What it is | Needed by the game? |
|---|---|---|
| 1. `<script>` in `bodies.html` (Three.js r128, minified, MIT) | Vendor library, inlined for offline use; same version as the game | No (the game has its own copy) |
| 2. `<script>` in `bodies.html` (OrbitControls, r128 `examples/js`, MIT) | Mouse camera control for the preview | No |
| 3. `js/bodykit/bodykit.js` (`<script id="bodykit" src=…>`) | **The bodies**: groups, parameter schemas, GLSL shaders, public API. A classic script exposing `window.BodyKit`; its header repeats the API. | **Yes**, `index.html` loads it (`defer`, after Three.js and ShipKit) |
| 4. `<script id="viewer">` in `bodies.html` | Preview page: sky, camera, HUD, sliders generated from the schemas, statistics, counters | No |

## Groups

Bodies are organized in groups, and **each group has its own parameter
schema**. A comet needs no oceans, so the viewer builds a group's sliders
from its schema.

| Group | Parameters | Bodies | Lab statistics |
|---|---|---|---|
| PLANETS | 13 planet parameters (below) | the game's six planets | measured land / water / lava / ice / clouds |
| SUNS | size, temperature, granulation, sunspots, activity, corona, brightness | SOL (slot 0) | temperature, spectral class, luminosity |
| COMETS | the rock parameters + coma, tail length, dust tail, ion tail hue | COMET (kind `comet`: every comet) | shape in km |
| ROCKS | the rock parameters: size, lumpiness, elongation, craters, albedo, color, ice, metal veins | FERRUM (slot 8, the meteoroid) | shape in km, albedo |
| BLACK HOLES | size, disk reach, disk temperature, turbulence, disk speed, Doppler beaming, lensing glow, brightness | ABYSS (slot 9) | mass, horizon radius, disk size |
| SKY | nebula coverage, brightness, scale, two nebula colors, dark dust, Milky Way, stars, star brightness, twinkle, pulsars | DEEP FIELD (kind `sky`: the game's backdrop) | stars, pulsars, bake size |

Each group also sets `kmPerSize` (the real radius of `size` 1, for the
statistics), `view` (the lab camera's distance when the group is
opened: a comet's tail is long) and `layers` (the names of the two layer
toggles: CLOUDS / ATMOSPHERE, CORONA, COMA & TAILS, DISK & LENSING,
STARS / NEBULAE). The SKY group has no `kmPerSize` (no radius statistics)
and `common: false` (no spin / tilt / damage sliders).

Every body also has the **common** parameters: rotation speed
(`spin`, 1 = 0.6 rad/s), axial tilt (`tilt`, degrees) and `damage`
(0–1, a preview of the game's health: `1 − health / maxHealth`).

### The game's bodies

Every body with a `slot` is the body on that fixed orbit of the game's
solar system (`world/solarSystem.js`); the HUD title shows it
("TERRA-1 · ORBIT 3"). A body with `kind` is the look of every game
body of that kind that comes and goes (comets). Since v2.11.0 every
body in the game is a BodyKit body: SOL (0), the six planets below,
FERRUM (8), ABYSS (9) and COMET.

| Body | Slot | Game kind | Character |
|---|---|---|---|
| `cinder` CINDER | 1 | volcanic | small, basalt continents, molten lowlands (≈36% lava), ash clouds |
| `magma` MAGMA | 2 | volcanic | mostly molten (≈59% lava), rough |
| `terra` TERRA-1 | 3 | neutral | the Earth-like default (43% land) |
| `pelagia` PELAGIA | 5 | neutral | ocean world (≈83% water), cloudy |
| `rime` RIME | 6 | ice | frozen seas, tundra continents (≈78% ice & snow) |
| `glacies` GLACIES | 7 | ice | almost fully frozen (≈95%) |

`size` only matters in the lab (it's set to the relative game radius);
the game sizes each body to its own radius.

### Planet parameters

| Key | Slider | Range | Default |
|---|---|---|---|
| `size` | Size (Earth radii) | 0.3–2.5 | 1 |
| `sea` | Water level (also the lava / frozen-sea level) | −0.6–0.6 | 0.04 |
| `continents` | Continent scale (noise frequency) | 0.5–3.5 | 1.4 |
| `mountains` | Mountain height (vertex displacement, fraction of radius) | 0–0.15 | 0.045 |
| `roughness` | Terrain roughness (fBm persistence) | 0.35–0.7 | 0.52 |
| `climate` | Climate, lush → arid | 0–1 | 0.35 |
| `ice` | Ice caps (reach toward the equator and snow line) | 0–1 | 0.3 |
| `clouds` | Cloud cover (≈ the measured coverage) | 0–1 | 0.35 |
| `cloudDrift` | Cloud drift over the surface | 0–1 | 0.3 |
| `atmosphere` | Atmosphere strength | 0–1 | 0.6 |
| `atmoHue` | Atmosphere hue (degrees) | 0–360 | 205 |
| `lava` | Molten lowlands: the seas become lava, land becomes basalt, clouds turn to ash | 0–1 | 0 |
| `frozen` | Frozen seas: cracked ice sheets, frosted tundra land | 0–1 | 0 |
| `seed` | Seed ("NEW SEED" button) | any | 1 |

## How the planet is made

- **No textures at all.** Every pixel is computed on the GPU from 3D
  simplex noise (Ashima Arts / Stefan Gustavson, MIT), so every
  parameter is a shader uniform and a slider change is instant.
- **Terrain**: domain-warped fBm with a runtime octave count. Oceans
  stay at sea level, and land is displaced in the vertex shader by
  `mountains`.
- **Colors**: ocean depth gradient, beaches, lush-to-arid vegetation
  driven by a moisture noise and `climate`, rock at altitude, polar ice
  with a noisy edge, and snow above a snow line.
- **Lava** (`lava`, `lavaFlowAt`): below sea level, bright rivers of
  molten rock (ridged noise, slowly moving) through a dark crust; the
  land is basalt and its shores glow. Lava is matte (no sun glint) and
  **self-lit**: it glows on the night side too.
- **Frozen seas** (`frozen`, `iceSheetAt`): the sea surface is an ice
  sheet with darker pressure cracks and a duller glint; land turns to
  grey tundra rock with frost.
- **Damage** (`damage` / `setDamage`, `crackAt`): a network of glowing
  cracks (two ridged-noise scales) whose reach spreads over the surface
  as damage grows, darkening the ground; self-lit like lava.
- **Relief lighting**: the height is sampled at two nearby points on the
  sphere (object space, one octave less, land only).
- **Lighting**: done inside the shaders, fully in world space, from a
  sun direction. THREE lights don't affect the bodies, and no camera
  has to be passed in.
- **Clouds**: a separate shell (radius 1.018) whose fBm threshold is the
  inverse of the noise's roughly normal distribution. That makes
  `clouds = 0.25 / 0.5 / 0.75` measure as ≈ 27% / 52% / 76% coverage.
  Over a lava world they are grey ash.
- **Atmosphere**: an additive back-face shell (radius 1.12) with a
  day-side-only rim glow, plus a matching haze on the surface limb.
- **Coverage statistics** (land, water, lava, ice & snow, clouds): a
  probe shader renders the classification into a 256×128 equirect render
  target, using **the same GLSL functions** as the surface. The pixels
  are read back and weighted by cos(latitude), so the numbers are
  exactly what is drawn. The probe's "sea" counts as lava when
  `lava ≥ 0.5`, and as ice when `frozen ≥ 0.5`.
- **Output**: the shaders write their final color directly (no THREE
  tone-mapping or sRGB chunks). The lab and the game render with the
  same pipeline (sRGB output, ACES), so a body looks the same in both.

## How the other bodies are made

- **Sun** (`buildSun`, `GLSL_SUN`): the color is a black body at the
  temperature (`blackbody()`, 5778 K ≈ white). The surface is bright
  enough that the center goes white; convection cells (ridged noise,
  slowly boiling — `activity` sets the speed) and supergranulation on
  top; sunspots (umbra + penumbra) only in two activity belts, with
  bright faculae around them near the limb; strong limb darkening toward
  orange. The **corona** is a billboard (`makeBillboard`): a bright rim,
  streamers drifting outward (noise along the angle), a wide soft glow
  and prominences standing on the limb; its size follows `corona`.
  Self-lit.
- **Rocks** (`rockParts`, `GLSL_ROCK`): a sphere displaced **on the GPU**
  into a lumpy, elongated shape (fBm + two crater fields), normals from
  two nearby displaced points in the vertex shader. `craterField()` is a
  cell noise with a crater (bowl + raised rim) in a `craters` share of the
  cells. Fine craters and grit are relief in the fragment shader; colors
  from grey to rusty, darker crater floors, frost patches (`ice`) and
  glinting metal veins (`metal`), lit by the sun direction.
- **Comet** (`buildComet`): a rock nucleus (icy, dark) with a **coma**
  (billboard glow) and two **tails** (`makeTail`, `GLSL_TAIL_VERTEX`):
  ribbons built in the vertex shader from the body's world position,
  pointing away from the light and always turned toward the camera. The
  ion tail is straight, narrow and blue (`ionHue`); the dust tail is
  wider, warm and bent back along `-opts.velocity`. `opts.activity`
  scales the coma and the tail length.
- **Black hole** (`buildBlackHole`, `GLSL_HOLE`): a black horizon sphere,
  an **accretion disk** (a ring whose radius is remapped in the vertex
  shader to `disk`, turbulent noise turning with the disk, hotter and
  whiter inside, and relativistic beaming: the side moving toward the
  camera is brighter and bluer) and a billboard for the thin photon ring
  and the lensed glow around the shadow. Self-lit.

- **Sky** (`buildSky`, `GLSL_SKY`): not a body but the backdrop, built
  with the same blocks. `skyColor(dir)` is black space, a Milky Way band
  (clumps, dust lanes) and nebulae (regions of domain-warped noise:
  glowing gas, wisps, hot cores, two colors, dark dust dimming only the
  gas). That's heavy, so it's **baked into a cube map** (`CubeCamera`,
  1024² per face at detail 1, 2048² at 2) and a sphere just samples it;
  it re-bakes only after a change (`apply()` / `setOctaves` mark it
  dirty; `update` bakes when `opts.renderer` is given). Stars and 0–6
  pulsars are one `THREE.Points` (`fillStars`, seeded, colors from
  `blackbody`, 40% near the band, some twinkling, pulsars with beams).
  `opts.center` keeps it on the camera.

### TERRA-1, measured

| | |
|---|---|
| Coverage (defaults) | 43% land, 57% water, 17.8% ice & snow, ≈36% clouds |
| Meshes | 3 (surface, clouds, atmosphere) plus 1 probe quad (tools only) |
| Triangles by `detail` | 0.2 ≈ 2.3k · 0.3 ≈ 5.4k · 0.5 ≈ 15k · 1 ≈ 62k · 2 ≈ 248k |
| Custom shaders | 3 (+1 probe) |
| Textures | 0 |

## BodyKit API (`window.BodyKit`)

```js
const body = BodyKit.buildBody("planets", "terra", { detail: 0.4, values: { seed: 7 } });
scene.add(body.group);
body.setRadius(1.9);                  // world units
// every frame:
body.update(t, dt);                   // lit from a sun at (0,0,0) by default
body.setDamage(0.3);                  // cheap, fine every frame
// later:
BodyKit.disposeBody(body);
```

| Member | Description |
|---|---|
| `buildBody(groupId, bodyId, { detail, values })` | Builds a body. `detail` is 0.2–2 and scales the sphere segments; `values` overrides the defaults. Returns a body handle. |
| `disposeBody(body)` | Removes the group and frees its geometries, materials and the probe render target |
| `modelStats(group)` | Mesh, triangle, vertex and shader counts |
| `QUALITY_OCTAVES` | Noise octaves for the render-quality presets LOW..MAX (`[3, 4, 5, 6, 8]`), used by the lab and the game |
| `GAME_BODIES`, `GAME_KINDS` | `{ slot: { groupId, bodyId } }` and `{ kind: { groupId, bodyId } }`, built from the bodies' `slot` and `kind` fields |
| `SPIN_RAD_PER_UNIT` | 0.6: `values.spin` 1 in rad/s |
| `GROUPS`, `COMMON_PARAMS`, `defaultValues(group, body)` | Registry and schemas |
| `GLSL_NOISE`, `GLSL_BODY`, `GLSL_PLANET`, `GLSL_SUN`, `GLSL_ROCK`, `GLSL_HOLE` | Shader code, reusable for new bodies |

Body handle:

| Field | Description |
|---|---|
| `id`, `groupId`, `detail` | What was built |
| `group` | `THREE.Group`, origin at the center; spins about +Y and is tilted by `values.tilt` about Z |
| `pickMesh` | The surface mesh to raycast. The cloud and atmosphere shells ignore raycasts. |
| `surfaceRoot` | The group that turns with the surface, in units of the radius. Attach anything that must stay on the ground here (the game's scorch marks). |
| `radius` | Current radius in world units |
| `update(t, dt, opts)` | Per frame. The light direction comes from `opts.sunDir` (world direction toward the light) or `opts.sunPosition` (world position, default (0,0,0)) together with the body's own world position. Also applies spin and tilt. A comet also reads `opts.velocity` (dust tail bend) and `opts.activity` (default 1). |
| `setRadius(units)` | Radius in world units; overrides `values.size` |
| `setValues(values)` | Changes parameters live (uniforms only) |
| `setDamage(x)` | Damage 0–1, a single uniform write (use it per frame instead of `setValues`) |
| (`update` `opts.lights`) | Up to `MAX_POINT_LIGHTS` (4) nearby point lights `{ position (world), color, intensity, distance }`; planets and rocks (incl. a comet's nucleus) add them to their lighting (`pointLightAt()` in `GLSL_BODY`), self-lit bodies ignore them |
| `setOctaves(n)` | Noise octaves per pixel (2–8), a quality/cost knob |
| `setLayers({ clouds, atmosphere })` | Shows or hides the layers |
| `describe(renderer)` | The group's own statistics for the lab: `[[label, text], …]` |
| `measure(renderer)` | Planets only (else `null`): `{ water, lava, land, ice, clouds }` coverage in 0–1, measured on the GPU (tools only: it reads pixels back and stalls the GPU briefly) |

## Building blocks and rules (DRY)

BodyKit follows the same rules as ShipKit ([`docs/ship.md`](ship.md),
"Building blocks"): **one file, nothing written twice**. What exists to
be reused:

| Block | What it gives you |
|---|---|
| `GLSL_NOISE` | `snoise` (3D simplex) and `fbm(p, octaves, persistence)` with a runtime octave count |
| `GLSL_BODY` | What every body shader includes next: the common uniforms (`uSeed`, `uTime`, `uDamage`, `uOctaves`, the point lights), `crackAt()` (the damage cracks), `pointLightAt()` (nearby point lights) and `hash33()` |
| `bodyUniforms(v)` | Those uniforms + `uSunDir`, for a new build to extend |
| `makeBodyHandle({ v, U, group, spin, pickMesh, apply, layers, onUpdate, describe, measure, dispose })` | **The whole body handle** (sun direction, spin, tilt, radius, seed, damage, octaves, layer toggles); a build only passes what's its own |
| `GLSL_SPHERE_VERTEX` | The plain lit-sphere vertex shader (`vDir`, `vWorldPos`, `vNormalW`): clouds, atmosphere, sun surface |
| `makeBillboard(U, halfSize, fragment)` | A camera-facing quad in body radii (`vQ`, `uHalfSize`): sun corona, comet coma, black hole lensing |
| `blackbody(kelvin, color)` | Star / hot gas color from a temperature: the Sun, the black hole's disk |
| `rockParts(v, detail)` | A rock's uniforms, mesh and `apply()`: ROCKS uses it as is, COMETS adds a coma and tails |
| `GLSL_PLANET` | The planet's shared uniforms and functions: `heightOct` / `heightAt`, `moistureAt`, `iceAt`, `cloudAt`, `lavaFlowAt`, `iceSheetAt`. Used by the surface, the clouds **and** the coverage probe. |
| `GLSL_ROCK` | `craterField()`, `rockHeight()`, `rockPoint()`, `rockDetail()`: the rock's shape and relief |
| `ROCK_PARAMS` | The rock sliders, shared by ROCKS and COMETS |
| `GLSL_SKY`, `seededRandom(seed)` | The sky's color function; a deterministic RNG (same sky for everyone) |
| `COMMON_PARAMS` | Spin, tilt and damage for every body in every group |
| `QUALITY_OCTAVES` | Octaves per quality preset, for the lab and the game |
| The body handle contract | `update`, `setRadius`, `setValues`, `setDamage`, `setOctaves`, `setLayers`, `describe`, `measure`, `pickMesh`, `surfaceRoot`: every group's `build()` returns it (through `makeBodyHandle`), so the lab and the game need no per-group code |

Rules, for every new body and every change:

1. **A new body of an existing kind is data, not code.** Another planet
   is a `bodies` entry with `values` (and a `slot` if the game shows it).
   If the look you want isn't reachable, add a **parameter** to the
   group (like `lava` and `frozen`), not a second copy of the shader.
2. **Classification lives in `GLSL_PLANET`, once.** Anything the
   statistics should count (water, lava, ice, clouds) is a function
   there, called by both the surface and the probe — so the numbers are
   always what's drawn. Never re-derive it in one shader only.
3. **The second use moves it into the shared code.** When a new group
   (suns, comets…) needs something a planet already has (noise, the
   atmosphere shell, crack damage, the sun-direction update), move it out
   of the planet into a shared function or GLSL string and switch the
   planet to it. Check the planet looks the same afterwards (same
   camera, before/after screenshot; the lab's statistics unchanged).
4. **Every group returns the full handle contract** (table above), even
   when a method does nothing for it — the game and the lab call them
   blindly. `setDamage` in particular: every body the game can bite
   needs to show damage.
5. **Per-frame calls allocate nothing** (`update`, `setDamage`): scratch
   vectors outside, uniform writes only.
6. **Per-body state stays per body**: every body has its own uniform
   object `U`, so bodies animate and take damage independently.
7. **Game-facing numbers live in BodyKit, game logic in the game**: which
   body sits on which orbit (`slot`) and how it looks are BodyKit's;
   radius, orbit, health and spin-independent game state stay in
   `world/solarSystem.js` / `world/bodies.js`.

## Adding a body or a group

- **Another planet**: add an entry to the planets group's `bodies`, e.g.
  `{ id: "ocean", name: "…", values: { sea: 0.35, clouds: 0.6 } }`. The
  body-navigation arrows pick it up. Give it `slot: n` to put it on that
  orbit in the game (one body per slot).
- **A new kind** (a gas giant, a nebula, …): give the group its own
  `params` schema, `kmPerSize` / `view` / `layers`, a
  `build(values, detail)` that composes the building blocks and returns
  `makeBodyHandle({...})`, and at least one body. The viewer generates
  the sliders and statistics from these, so no viewer code is needed.
  Give the body a `slot` or a `kind` and the game draws it
  (`world/bodyVisual.js#bodyLookRef`).

## BodyKit in the game

Since v2.10.0 the game's planets, since v2.11.0 **every** body (the
Sun, the meteoroid, comets, the black hole) and since v2.12.0 the sky
(`scene/skybox.js`) are BodyKit's
(`world/bodyVisual.js`; full story in `docs/architecture.md`'s
"Rendering and ShipKit models"):

1. **Loading**: `index.html` loads `js/bodykit/bodykit.js` as a `defer`
   classic script after Three.js and ShipKit.
2. **Build**: `materializePlanet()` calls
   `makeBodyLook(bodyLookRef(slot, kind), radius)` — the slot's body
   (`GAME_BODIES`) or else the kind's (`GAME_KINDS`, comets). The body is
   sized to the game radius (`setRadius`) at `detail = gfxDetail × 0.5`
   (≈15k triangles for a planet at the default), with
   `QUALITY_OCTAVES[gfxQuality]` octaves. The black hole
   (`world/blackholes.js#materializeBlackHole`, not in `ctx.planets`)
   uses the same `makeBodyLook`, with its own invisible pick sphere
   (2.5 × radius, so the disk is clickable).
3. **The game's `p.mesh`** stays, as an **invisible sphere**
   (`MeshBasicMaterial({ visible: false })`): it's what picking raycasts
   (an invisible material still hits), what moves along the orbit and
   what carries the body's color for bite particles and debris. The
   BodyKit group is its child.
4. **Light**: the Sun is at (0,0,0), BodyKit's default light position,
   so `updateBodyLooks(dt)` (main loop) just calls `body.update(t, dt)`.
5. **Spin**: the body spins itself at its lab rate (`values.spin`), the
   same for every player; `p.spin` only reports it (rad/s) to the info
   panel. The old random orbital ring is gone.
   **Comets**: `look.opts.velocity` is the comet's live velocity (the
   dust tail bends back along it) and `updateBodies()` sets
   `look.opts.activity = cometActivity(distance from the Sun)`
   (`COMET_ACTIVITY_DISTANCE` / distance, 0.3–1.5): the coma and tails
   grow near the Sun. **The Sun** keeps the game's PointLight (for
   standard-material objects: ships, the station).
6. **Damage**: `applyHealthVisual()` calls `look.setDamage(1 − health /
   maxHealth)` — glowing cracks in the shader (the old crack overlay,
   halo sprite, sun rays, flat comet tail and their canvas textures are
   removed). Scorch marks keep their canvas overlay, attached to
   `surfaceRoot` (`look.attach()`) so they turn with the ground;
   `paintScorch()` maps the hit point in the scorch mesh's own frame.
7. **Graphics settings**: a geometry detail change rebuilds the bodies
   (attached scorch marks move to the new body); a quality change only
   sets the octaves.
8. **Fog**: the shaders don't use THREE's fog; the game's `FogExp2`
   (0.0007) is thin enough that this barely shows.
9. **Cost**: at the default settings, the six planets add ≈90k
   triangles, the other bodies little; the pixel cost only matters when
   a body fills the screen (the ship cam, the PLANET INFO miniature, the
   Sun's corona up close). Dev Tools → Performance stats shows FPS,
   frame time, draw calls and triangles live.
10. **Ship glow lights** (v2.11.1, Setup → Graphics, off by default):
    `updateBodyLooks()` gathers the visible ship lights (`ships/swarm.js`:
    behind the engines, intensity following the engine power,
    `SHIP_LIGHT_INTENSITY` / `SHIP_LIGHT_RANGE`) once per frame and gives
    every body the nearest ones that reach it (at most 4) as
    `opts.lights`. The lab's **SHIP LIGHT** toggle circles the same kind
    of light around the body.
11. **Multiplayer**: nothing is sent — the look is fixed per slot and the
    health that drives damage is already synced.

## Viewer (preview page)

- **Backdrop**: the game's own sky (BodyKit's kind `sky`), so a body looks
  here exactly as in the game; hidden while the SKY tab shows a sky of its
  own.
- **Left panel**: group tabs (PLANETS / SUNS / COMETS / ROCKS / BLACK HOLES / SKY), body
  navigation, PHYSICAL statistics and MODEL statistics, and toggles for
  auto-rotate, the two layers (named by the group), wireframe, GAME BUILD
  (the body at the detail the game builds it: × `BodyKit.GAME_DETAIL_SCALE`,
  0.5; the sky as is) and SHIP LIGHT (a teal light circling the body, as a
  ship's glow light does in the game). The clouds and
  atmosphere toggles are hidden for empty groups.
  - PHYSICAL: radius in km (size × the group's `kmPerSize`), surface
    area, then the body's own `describe()` rows (a planet: the measured
    land, water, lava, ice and cloud coverage, re-measured after each
    change and every 2 s while clouds drift).
  - MODEL: meshes, triangles, vertices, shaders, octaves and textures.
- **Right panel**: COMMON and group parameters, generated from the
  schemas, plus NEW SEED, RESET and **COPY VALUES**.
- **COPY VALUES**: the sliders only change the preview (a reload goes
  back to the file); the game shows what's in `js/bodykit/bodykit.js`.
  This button copies the current body as a ready `bodies` entry (id,
  name, slot, and only the values that differ from the group defaults,
  plus the seed; `damage` left out) — paste it over the body's line in
  `bodykit.js` to make the change permanent (then the usual version
  bump). Also printed to the console, in case the clipboard is blocked.
- **OPTIMIZATION**:
  - **Render quality**, 5 presets (octaves from `BodyKit.QUALITY_OCTAVES`):

    | Preset | Pixel ratio | Noise octaves |
    |---|---|---|
    | LOW | 0.5 | 3 |
    | MEDIUM | 0.75 | 4 |
    | HIGH | 1 | 5 |
    | ULTRA (default) | device pixel ratio, clamped to 1–2 | 6 |
    | MAX | 1.5 × device pixel ratio, up to 3 | 8 |

  - **Geometry detail** (20–200%) rebuilds the body live and keeps the
    current values.
- **PERFORMANCE**: FPS, frame time, CPU time per frame, triangles and
  draw calls per frame, render resolution, and an FPS graph.
- **Scaling**: all panels share one CSS scale factor (`--ui`), exactly
  as in `ship.html`: it follows the window only, and a panel taller than
  the window scrolls, so switching tabs never changes the UI size.

## Gotchas

- **Staircase coastlines from `dFdx` bump**: an earlier version derived
  the relief normal from screen-space derivatives of the height. Those
  are evaluated per 2×2 pixel quad, so the height's kink at the coast
  produced visible 2-pixel steps along every shoreline. Sampling the
  height at nearby points in object space fixed it.
- **GLSL name clashes**: every planet shader concatenates `GLSL_NOISE` and
  `GLSL_PLANET`, so a local variable in a shared function (e.g. `q` in
  `cloudAt`) must not clash with another local in the same function.
  This happened once and failed the shader compile.
- **Uniforms in the fragment stage**: `modelMatrix` is declared by THREE
  only in the vertex prefix. The surface fragment shader declares
  `uniform mat4 modelMatrix;` itself, and THREE uploads it by name.
- **Cloud coverage vs slider**: a linear threshold made 50% on the
  slider look like ≈7% coverage. The threshold is now the inverse of
  the noise distribution (logistic approximation, sd ≈ 0.11).
- **Billboards and tails aren't where their geometry is**: the vertex
  shader places them (`makeBillboard`, `makeTail`), so their meshes have
  `frustumCulled = false` (three.js would otherwise cull them by the
  small quad) and `raycast` disabled. Same for the rock (displaced beyond
  the unit sphere) and the black hole's disk (radius remapped).
- **A billboard's fragment shader needs `uHalfSize` and `vQ` declared**:
  `makeBillboard` prepends them; a shader string must not declare them
  again.
- **The sky's cube map lookup**: sampling the baked
  `WebGLCubeRenderTarget` with `textureCube(uCube, dir)` (no x flip — that
  flip is only for loaded `CubeTexture`s) matches the live shader; this
  was checked by rendering both from the same camera (mean difference
  ≈0.2/255).
- **Decals on a spinning body**: the body spins its inner group, not
  its `group`. Anything parented to `group` (or the game's `p.mesh`)
  stays put while the ground turns under it — attach to `surfaceRoot`.
- **Headless testing**: WebGL runs through SwiftShader
  (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`)
  at 1–4 FPS, and the probe logs a harmless "GPU stall due to
  ReadPixels" warning. With `--use-angle=d3d11 --enable-gpu
  --ignore-gpu-blocklist` Playwright uses the real GPU.
