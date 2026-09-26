# Body lab (`bodies.html`) and BodyKit

A standalone preview page for procedurally generated celestial bodies,
the companion of [`ship.html`](ship.md) and built on the same scheme.
The bodies themselves live in **`js/bodykit/bodykit.js` (BodyKit)**, one
file shared by the lab and the game (since v2.10.0), exactly like
ShipKit: a body tuned in the lab is the body the game shows. There is no
copy to keep in sync.

Open `bodies.html` straight from disk (double-click). No server, no build
step and no network are needed. The only external request is Google
Fonts, and without it the panels fall back to system fonts. The page
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

| Group | Parameters | Bodies |
|---|---|---|
| PLANETS | 13 planet parameters (below) | the game's six planets (below) |
| COMETS | none yet | none yet |
| SUNS | none yet | none yet |
| OTHER | none yet | none yet |

Every body also has the **common** parameters: rotation speed
(`spin`, 1 = 0.6 rad/s), axial tilt (`tilt`, degrees) and `damage`
(0–1, a preview of the game's health: `1 − health / maxHealth`).

### The game's planets

Every body with a `slot` is the planet on that fixed orbit of the game's
solar system (`world/solarSystem.js`). The HUD title shows it
("TERRA-1 · ORBIT 3").

| Body | Slot | Game kind | Character |
|---|---|---|---|
| `cinder` CINDER | 1 | volcanic | small, basalt continents, molten lowlands (≈36% lava), ash clouds |
| `magma` MAGMA | 2 | volcanic | mostly molten (≈59% lava), rough |
| `terra` TERRA-1 | 3 | neutral | the Earth-like default (43% land) |
| `pelagia` PELAGIA | 5 | neutral | ocean world (≈83% water), cloudy |
| `rime` RIME | 6 | ice | frozen seas, tundra continents (≈78% ice & snow) |
| `glacies` GLACIES | 7 | ice | almost fully frozen (≈95%) |

`size` only matters in the lab (it's set to the relative game radius);
the game sizes each body to its slot's radius. The Sun, the meteoroid,
comets and the black hole are not BodyKit bodies yet.

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
| `GAME_BODIES` | `{ slot: { groupId, bodyId } }`, built from the bodies' `slot` field |
| `GROUPS`, `COMMON_PARAMS`, `defaultValues(group, body)` | Registry and schemas |
| `GLSL_NOISE`, `GLSL_PLANET` | Shader code, reusable for new bodies |

Body handle:

| Field | Description |
|---|---|
| `id`, `groupId`, `detail` | What was built |
| `group` | `THREE.Group`, origin at the center; spins about +Y and is tilted by `values.tilt` about Z |
| `pickMesh` | The surface mesh to raycast. The cloud and atmosphere shells ignore raycasts. |
| `surfaceRoot` | The group that turns with the surface, in units of the radius. Attach anything that must stay on the ground here (the game's scorch marks). |
| `radius` | Current radius in world units |
| `update(t, dt, opts)` | Per frame. The light direction comes from `opts.sunDir` (world direction toward the light) or `opts.sunPosition` (world position, default (0,0,0)) together with the body's own world position. Also applies spin and tilt. |
| `setRadius(units)` | Radius in world units; overrides `values.size` |
| `setValues(values)` | Changes parameters live (uniforms only) |
| `setDamage(x)` | Damage 0–1, a single uniform write (use it per frame instead of `setValues`) |
| `setOctaves(n)` | Noise octaves per pixel (2–8), a quality/cost knob |
| `setLayers({ clouds, atmosphere })` | Shows or hides the layers |
| `measure(renderer)` | `{ water, lava, land, ice, clouds }` coverage in 0–1, measured on the GPU (tools only: it reads pixels back and stalls the GPU briefly) |

## Building blocks and rules (DRY)

BodyKit follows the same rules as ShipKit ([`docs/ship.md`](ship.md),
"Building blocks"): **one file, nothing written twice**. What exists to
be reused:

| Block | What it gives you |
|---|---|
| `GLSL_NOISE` | `snoise` (3D simplex) and `fbm(p, octaves, persistence)` with a runtime octave count |
| `GLSL_PLANET` | The planet's shared uniforms and functions: `heightOct` / `heightAt`, `moistureAt`, `iceAt`, `cloudAt`, `lavaFlowAt`, `iceSheetAt`, `crackAt`. Used by the surface, the clouds **and** the coverage probe. |
| `COMMON_PARAMS` | Spin, tilt and damage for every body in every group |
| `QUALITY_OCTAVES` | Octaves per quality preset, for the lab and the game |
| The body handle contract | `update`, `setRadius`, `setValues`, `setDamage`, `setOctaves`, `setLayers`, `measure`, `pickMesh`, `surfaceRoot`: every group's `build()` returns it, so the lab and the game need no per-group code |

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
- **A new kind** (comet, sun, …): give the group its own `params`
  schema, a `build(values, detail)` function that returns the full body
  handle (see the rules), and at least one body. The viewer generates
  the sliders from `params`, so no viewer code is needed. To use it in
  the game, `world/bodies.js#materializePlanet` currently only asks
  `world/bodyVisual.js` for the fixed orbit slots; a new game kind
  (comet, Sun) needs that hook extended.

## BodyKit in the game

Since v2.10.0 the game's six planets are BodyKit bodies
(`world/bodyVisual.js`; full story in `docs/architecture.md`'s
"Rendering and ShipKit models"):

1. **Loading**: `index.html` loads `js/bodykit/bodykit.js` as a `defer`
   classic script after Three.js and ShipKit.
2. **Build**: `materializePlanet()` calls `makeBodyLook(slot, radius)` for
   every slot in `BodyKit.GAME_BODIES`. The body is sized to the slot's
   radius (`setRadius`) at `detail = gfxDetail × 0.5` (≈15k triangles at
   the default), with `QUALITY_OCTAVES[gfxQuality]` octaves.
3. **The game's `p.mesh`** stays, as an **invisible sphere**
   (`MeshBasicMaterial({ visible: false })`): it's what picking raycasts
   (an invisible material still hits), what moves along the orbit and
   what carries the body's color for bite particles and debris. The
   BodyKit group is its child.
4. **Light**: the Sun is at (0,0,0), BodyKit's default light position,
   so `updateBodyLooks(dt)` (main loop) just calls `body.update(t, dt)`.
5. **Spin**: the body spins itself at its lab rate (`values.spin`), the
   same for every player; the game's random `p.spin` is 0 for it. The
   old random orbital ring is not added to BodyKit planets.
6. **Damage**: `applyHealthVisual()` calls `look.setDamage(1 − health /
   maxHealth)` — glowing cracks in the shader instead of the old crack
   overlay. Scorch marks keep their canvas overlay, attached to
   `surfaceRoot` (`look.attach()`) so they turn with the ground;
   `paintScorch()` maps the hit point in the scorch mesh's own frame.
7. **Graphics settings**: a geometry detail change rebuilds the bodies
   (attached scorch marks move to the new body); a quality change only
   sets the octaves.
8. **Fog**: the shaders don't use THREE's fog; the game's `FogExp2`
   (0.0007) is thin enough that this barely shows.
9. **Cost**: at the default settings, all six planets add ≈90k
   triangles; the pixel cost only matters when a planet fills the
   screen (the ship cam, the PLANET INFO miniature).
10. **Multiplayer**: nothing is sent — the look is fixed per slot and the
    health that drives damage is already synced.

## Viewer (preview page)

- **Left panel**: group tabs (PLANETS / COMETS / SUNS / OTHER), body
  navigation, PHYSICAL statistics and MODEL statistics, and toggles for
  auto-rotate, clouds, atmosphere and wireframe. The clouds and
  atmosphere toggles are hidden for empty groups.
  - PHYSICAL: radius in km (size × 6371), surface area and the measured
    land, water, lava (when there is any), ice and cloud coverage,
    re-measured after each change and every 2 s while clouds drift.
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
  as in `ship.html`.

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
- **Decals on a spinning body**: the body spins its inner group, not
  its `group`. Anything parented to `group` (or the game's `p.mesh`)
  stays put while the ground turns under it — attach to `surfaceRoot`.
- **Headless testing**: WebGL runs through SwiftShader
  (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`)
  at 1–4 FPS, and the probe logs a harmless "GPU stall due to
  ReadPixels" warning. With `--use-angle=d3d11 --enable-gpu
  --ignore-gpu-blocklist` Playwright uses the real GPU.
