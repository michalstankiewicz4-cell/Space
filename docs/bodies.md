# Body lab (`bodies.html`)

A standalone, single-file preview page for procedurally generated
celestial bodies. It is the companion of [`ship.html`](ship.md), built on
the same scheme. It isn't linked from the game and isn't loaded by it,
so a change to it needs no version bump. Its body code is written so a
body can later be moved into the game with little work: see
[Moving a body into the game](#moving-a-body-into-the-game).

Open `bodies.html` straight from disk (double-click). No server, no build
step and no network are needed. The only external request is Google
Fonts, and without it the panels fall back to system fonts.

## File layout

| Block | What it is | Needed by the game? |
|---|---|---|
| 1. `<script>` (Three.js r128, minified, MIT) | Vendor library, inlined for offline use; same version as the game | No |
| 2. `<script>` (OrbitControls, r128 `examples/js`, MIT) | Mouse camera control for the preview | No |
| 3. `<script id="bodykit">` | **The bodies**: groups, parameter schemas, GLSL shaders, public API. Its header comment repeats the API and the extraction guide. | **Yes, this is the only part to port** |
| 4. `<script id="viewer">` | Preview page: sky, camera, HUD, sliders generated from the schemas, statistics, counters | No |

## Groups

Bodies are organized in groups, and **each group has its own parameter
schema**. A comet needs no oceans, so the viewer builds a group's sliders
from its schema.

| Group | Parameters | Bodies |
|---|---|---|
| PLANETS | 11 planet parameters (below) | TERRA-1 (`terra`) |
| COMETS | none yet | none yet |
| SUNS | none yet | none yet |
| OTHER | none yet | none yet |

Every body also has the **common** parameters: rotation speed
(`spin`, 1 = 0.6 rad/s) and axial tilt (`tilt`, degrees).

### Planet parameters

| Key | Slider | Range | Default |
|---|---|---|---|
| `size` | Size (Earth radii) | 0.3–2.5 | 1 |
| `sea` | Water level | −0.6–0.6 | 0.04 |
| `continents` | Continent scale (noise frequency) | 0.5–3.5 | 1.4 |
| `mountains` | Mountain height (vertex displacement, fraction of radius) | 0–0.15 | 0.045 |
| `roughness` | Terrain roughness (fBm persistence) | 0.35–0.7 | 0.52 |
| `climate` | Climate, lush → arid | 0–1 | 0.35 |
| `ice` | Ice caps (reach toward the equator and snow line) | 0–1 | 0.3 |
| `clouds` | Cloud cover (≈ the measured coverage) | 0–1 | 0.35 |
| `cloudDrift` | Cloud drift over the surface | 0–1 | 0.3 |
| `atmosphere` | Atmosphere strength | 0–1 | 0.6 |
| `atmoHue` | Atmosphere hue (degrees) | 0–360 | 205 |
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
- **Relief lighting**: the height is sampled at two nearby points on the
  sphere (object space, one octave less, land only).
- **Lighting**: done inside the shaders, fully in world space, from a
  sun direction. THREE lights don't affect the bodies, and no camera
  has to be passed in.
- **Clouds**: a separate shell (radius 1.018) whose fBm threshold is the
  inverse of the noise's roughly normal distribution. That makes
  `clouds = 0.25 / 0.5 / 0.75` measure as ≈ 27% / 52% / 76% coverage.
- **Atmosphere**: an additive back-face shell (radius 1.12) with a
  day-side-only rim glow, plus a matching haze on the surface limb.
- **Coverage statistics** (land, water, ice & snow, clouds): a probe
  shader renders the classification into a 256×128 equirect render
  target, using **the same GLSL functions** as the surface. The pixels
  are read back and weighted by cos(latitude), so the numbers are
  exactly what is drawn.
- **Output**: the shaders write their final color directly (no THREE
  tone-mapping or sRGB chunks), so a body looks the same in a renderer
  without them, such as the game's.

### TERRA-1, measured

| | |
|---|---|
| Coverage (defaults) | 43% land, 57% water, 17.8% ice & snow, ≈36% clouds |
| Meshes | 3 (surface, clouds, atmosphere) plus 1 probe quad (tools only) |
| Triangles by `detail` | 0.2 ≈ 2.3k · 0.3 ≈ 5.4k · 1 ≈ 62k · 2 ≈ 248k |
| Custom shaders | 3 (+1 probe) |
| Textures | 0 |

## BodyKit API (`window.BodyKit`)

```js
const body = BodyKit.buildBody("planets", "terra", { detail: 0.4, values: { seed: 7 } });
scene.add(body.group);
body.setRadius(1.9);                  // world units
// every frame:
body.update(t, dt);                   // lit from a sun at (0,0,0) by default
// later:
BodyKit.disposeBody(body);
```

| Member | Description |
|---|---|
| `buildBody(groupId, bodyId, { detail, values })` | Builds a body. `detail` is 0.2–2 and scales the sphere segments; `values` overrides the defaults. Returns a body handle. |
| `disposeBody(body)` | Removes the group and frees its geometries, materials and the probe render target |
| `modelStats(group)` | Mesh, triangle, vertex and shader counts |
| `GROUPS`, `COMMON_PARAMS`, `defaultValues(group, body)` | Registry and schemas |
| `GLSL_NOISE`, `GLSL_PLANET` | Shader code, reusable for new bodies |

Body handle:

| Field | Description |
|---|---|
| `id`, `groupId`, `detail` | What was built |
| `group` | `THREE.Group`, origin at the center; spins about +Y and is tilted by `values.tilt` about Z |
| `pickMesh` | The surface mesh to raycast. The cloud and atmosphere shells ignore raycasts. |
| `radius` | Current radius in world units |
| `update(t, dt, opts)` | Per frame. The light direction comes from `opts.sunDir` (world direction toward the light) or `opts.sunPosition` (world position, default (0,0,0)) together with the body's own world position. Also applies spin and tilt. |
| `setRadius(units)` | Radius in world units; overrides `values.size` |
| `setValues(values)` | Changes parameters live (uniforms only) |
| `setOctaves(n)` | Noise octaves per pixel (2–8), a quality/cost knob |
| `setLayers({ clouds, atmosphere })` | Shows or hides the layers |
| `measure(renderer)` | `{ water, land, ice, clouds }` coverage in 0–1, measured on the GPU (tools only: it reads pixels back and stalls the GPU briefly) |

## Adding a body or a group

- **Another planet**: add an entry to the planets group's `bodies`, e.g.
  `{ id: "ocean", name: "…", values: { sea: 0.35, clouds: 0.6 } }`. The
  body-navigation arrows pick it up.
- **A new kind** (comet, sun, …): give the group its own `params`
  schema, a `build(values, detail)` function that returns a handle with
  the same methods (`update`, `setValues`, `setOctaves`, `setLayers`,
  `measure`, and so on), and at least one body. Shader materials take a
  per-body uniform object, so bodies animate independently. The viewer
  generates the sliders from `params`, so no viewer code is needed.

## Viewer (preview page)

- **Left panel**: group tabs (PLANETS / COMETS / SUNS / OTHER), body
  navigation, PHYSICAL statistics and MODEL statistics, and toggles for
  auto-rotate, clouds, atmosphere and wireframe. The clouds and
  atmosphere toggles are hidden for empty groups.
  - PHYSICAL: radius in km (size × 6371), surface area and the measured
    land, water, ice and cloud coverage, re-measured after each change
    and every 2 s while clouds drift.
  - MODEL: meshes, triangles, vertices, shaders, octaves and textures.
- **Right panel**: COMMON and group parameters, generated from the
  schemas, plus NEW SEED and RESET.
- **OPTIMIZATION**:
  - **Render quality**, 5 presets:

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

## Moving a body into the game

The same guide is in the header comment of the `bodykit` block.

1. **Module**: copy the `bodykit` block into e.g.
   `js/world/proceduralBodies.js`, replace the
   `window.BodyKit = (function () { … })();` wrapper with top-level code
   and an `export { … }`, and add the file to
   `js/versionCheck.js#MODULE_FILES`.
2. **Where it fits**: `js/world/bodies.js#materializePlanet` builds every
   body mesh. Neutral planets currently get a generated surface map on a
   `SphereGeometry(radius, 22, 16)`. A BodyKit planet can replace that
   mesh for the neutral kind, or become a new kind. The per-kind data
   files in `js/bodies/` (e.g. `neutralPlanet.js`) are the natural home
   for a body's parameter values, and `planetEditor.html` is the existing
   tuning tool for them.
3. **Size**: game radii are 1.6–2.6 units (`world/solarSystem.js`,
   `SOLAR_BODIES[].radius`), so call `body.setRadius(solar.radius)`. At
   game distances, detail 0.3–0.5 is plenty.
4. **Light**: the game's Sun is slot 0 at the center (0,0,0), which is
   BodyKit's default light position, so `body.update(t, dt)` is enough.
   The scene lights in `scene/setup.js` (ambient plus a point light at
   40,60,30) don't affect BodyKit bodies.
5. **Spin**: the game spins bodies itself (`p.mesh.rotation.y +=
   p.spin*dt` in `updateBodies`). Either set `values.spin = p.spin / 0.6`
   and let `update()` spin the body, or set `values.spin = 0` and keep
   the game's code.
6. **Picking**: raycast `body.pickMesh` (or the group, since the shells
   ignore rays). Mountains are displaced on the GPU only, so the CPU
   raycast sees the plain sphere, off by at most `values.mountains` of
   the radius.
7. **Damage visuals**: `applyHealthVisual()` and `paintScorch()` in
   `world/bodies.js` change standard materials and don't apply to these
   shaders. A damage uniform would have to be added.
8. **Fog**: the game scene uses `THREE.FogExp2` (`scene/setup.js`). These
   shaders don't include THREE's fog chunks, so a body won't fade into
   the fog like the other bodies. The effect is mild at game distances.
9. **Cost**: on land, every surface pixel evaluates the height (warp
   plus octaves) three times for the relief, plus moisture, ice and the
   cloud layer. Use `setOctaves()` with 3–5 and a low detail in the
   game, and skip `measure()`.
10. **Repo conventions**: a game change needs `js/version.js`,
    `CHANGELOG.md` and the `?v=` params bumped; English comments (see
    `CLAUDE.md`).

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
- **Headless testing**: WebGL runs through SwiftShader
  (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`)
  at 1–4 FPS, and the probe logs a harmless "GPU stall due to
  ReadPixels" warning. On a real GPU the page runs normally.
