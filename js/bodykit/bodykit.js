/* =======================================================================
   BODYKIT — procedural celestial bodies for Swarm Protocol
   =======================================================================
   One file, shared by the body lab (bodies.html) and the game
   (index.html), the same way js/shipkit/shipkit.js is: a classic script
   (not a module) exposing window.BodyKit, so the lab still opens
   straight from disk. Tune a body in the lab and the game shows exactly
   that body — there is no copy to keep in sync.

   Dependencies: the global THREE (r128). No textures: every surface is
   computed per pixel on the GPU (3D simplex noise in the shaders), so
   every parameter is a shader uniform and a slider change is instant,
   with no regeneration.

   -----------------------------------------------------------------------
   Groups and parameters
   -----------------------------------------------------------------------
   GROUPS = [{ id, name, params, bodies, build }]
     params  the group's own parameter schema, one entry per slider:
             { key, label, min, max, step, value, unit?, fmt? }
             Each group has different parameters (a comet has no
             oceans), so the lab builds its sliders from this list.
     bodies  the group's bodies: { id, name, values: {key: v} }
     build(values, detail) -> body handle (see buildBody)
   Groups: planets, suns, comets, rocks, black holes — every body in the
   game (a body's `slot` or `kind` says where) — and SKY, the game's
   backdrop (kind "sky"; opts.center/opts.renderer, see buildSky).
   COMMON_PARAMS (spin, tilt, damage) belong to every body.

   -----------------------------------------------------------------------
   API (window.BodyKit)
   -----------------------------------------------------------------------
   buildBody(groupId, bodyId, { detail = 1, values })  -> body
       detail  0.2 .. 2, scales the sphere segment counts
               (planet: 0.2 ≈ 2.3k tris, 1 ≈ 62k, 2 ≈ 248k)
       values  overrides of the body's default parameter values
       body = {
         id, groupId, detail,
         group,               THREE.Group, origin at the body's center,
                              spin axis +Y (tilted by values.tilt about Z)
         pickMesh,            the surface mesh — raycast against this; the
                              cloud/atmosphere shells ignore raycasts
         surfaceRoot,         group that turns with the surface, in units of
                              the radius: attach anything that has to stay
                              on the ground here (the game's scorch marks)
         radius,              current radius in world units
         update(t, dt, opts)  call every frame (t = seconds, dt = delta):
                              lighting direction from opts.sunDir (world
                              direction toward the light) or from
                              opts.sunPosition (world position of the
                              light, default (0,0,0)) and the body's own
                              world position; also spins the body
                              (values.spin × 0.6 rad/s)
         setRadius(units)     radius in world units (overrides values.size)
         setValues(values)    change any parameters live (uniforms only)
         setDamage(0..1)      glowing cracks spreading over the surface
                              (the game: 1 - health / maxHealth); the
                              same as setValues({ damage }), but cheap
                              enough to call every frame
         setOctaves(n)        noise detail per pixel (2..8), a quality knob
                              (update's opts.lights: up to 4 nearby point
                              lights, e.g. ships' glow, light planets and
                              rocks too)
         setLayers({ clouds, atmosphere })  show/hide layers
         measure(renderer)    surface coverage, computed on the GPU with the
                              same shader functions as the surface
                              (tools only, reads pixels back):
                              { water, lava, land, ice, clouds } in 0..1
       }
   disposeBody(body)          removes the group and frees its geometries,
                              materials and the probe render target
   modelStats(group)          mesh/triangle/vertex/shader counts
   QUALITY_OCTAVES            noise octaves per render-quality preset
                              (LOW .. MAX), shared by the lab and the game
   GAME_DETAIL_SCALE          the game builds bodies at detail × this
   GAME_BODIES                which body each of the game's fixed orbit
                              slots shows: { slot: { groupId, bodyId } },
                              from the bodies' `slot` field
   GROUPS, COMMON_PARAMS, defaultValues(group, body)
   GLSL_NOISE, GLSL_PLANET    the shader code, reusable for other bodies

   Lighting is done inside the shaders (THREE lights don't affect these
   bodies), fully in world space: no camera needs to be passed in. The
   shaders write their final color directly (no THREE tone-mapping or
   sRGB chunks), so they look the same in the lab and the game. They
   don't use THREE's fog either; the game's fog is very thin
   (scene/setup.js), so that's hardly visible.

   -----------------------------------------------------------------------
   In the game (see docs/bodies.md, "BodyKit in the game")
   -----------------------------------------------------------------------
   world/bodyVisual.js builds the planet for each fixed orbit slot listed
   in GAME_BODIES (sized to the slot's radius, spun by the game, detail
   and octaves from Setup -> Graphics) and drives setDamage() from the
   body's health. Adding a body here for a slot, or retuning one in the
   lab, changes the game with no game code involved. Repo conventions
   (CLAUDE.md): English comments; a change here is a game change, so
   bump js/version.js + CHANGELOG.md + the ?v= params.
   ======================================================================= */
window.BodyKit = (function () {
"use strict";

// =====================================================================
// GLSL: 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT license)
// + fBm helpers shared by every body shader.
// =====================================================================
const GLSL_NOISE = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
// fBm with a runtime octave count (loop bound must be constant in GLSL ES)
float fbm(vec3 p, int octaves, float persistence){
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    sum += snoise(p) * amp; norm += amp;
    amp *= persistence; p *= 2.03;
  }
  return sum / norm;   // ~ -1..1
}
`;

// =====================================================================
// SHARED BY EVERY BODY — building blocks (see docs/bodies.md, "Building
// blocks and rules"): reuse these, never copy them into a body.
// =====================================================================
// GLSL every body shader includes right after GLSL_NOISE: the uniforms
// every body has, the damage cracks and a per-cell hash.
const GLSL_BODY = `
uniform vec3 uSeed;
uniform float uTime, uDamage;
uniform int uOctaves;
// damage (the game: 1 - health / maxHealth): a network of glowing cracks
// that reaches over more of the surface as damage grows, 0..1
float crackAt(vec3 p){
  if (uDamage <= 0.001) return 0.0;
  float reach = smoothstep(0.0, 0.12, uDamage * 1.15 - (snoise(p * 1.6 + uSeed.yzx) * 0.5 + 0.5));
  float w = 0.025 + 0.05 * uDamage;
  float c1 = smoothstep(1.0 - w, 1.0, 1.0 - abs(snoise(p * 4.5 + uSeed)));
  float c2 = smoothstep(1.0 - w * 0.7, 1.0, 1.0 - abs(snoise(p * 10.0 + uSeed.zxy)));
  return clamp(c1 + c2 * 0.7, 0.0, 1.0) * reach;
}
// Nearby point lights (the game: ships' glow lights; the lab: SHIP LIGHT),
// in world space: color already × intensity, linear falloff to 0 at the
// range, squared. Up to MAX_POINT_LIGHTS, uPointCount of them in use.
#define MAX_POINT_LIGHTS 4
uniform vec3 uPointPos[MAX_POINT_LIGHTS];
uniform vec3 uPointColor[MAX_POINT_LIGHTS];
uniform float uPointRange[MAX_POINT_LIGHTS];
uniform int uPointCount;
vec3 pointLightAt(vec3 worldPos, vec3 N){
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_POINT_LIGHTS; i++){
    if (i >= uPointCount) break;
    vec3 d = uPointPos[i] - worldPos;
    float dist = length(d);
    float att = clamp(1.0 - dist / uPointRange[i], 0.0, 1.0);
    sum += uPointColor[i] * max(dot(N, d / max(dist, 1e-4)), 0.0) * att * att;
  }
  return sum;
}
// three pseudo-random numbers 0..1 for a cell (integer coordinates)
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// craters: at most one per cell (a \`share\` of cells has one), each a bowl
// below 0 with a raised rim. Every crater in the 27 neighbouring cells is
// added up, so the field is continuous (taking only the nearest cell left
// straight seams where it switched cells). Rocks and airless planets.
float craterField(vec3 p, float freq, float share){
  vec3 q = p * freq + uSeed;
  vec3 i = floor(q), f = fract(q);
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + o);
    float w = clamp((share - h.y) / 0.06, 0.0, 1.0);   // fades in: \`share\` varies over a surface
    if (w <= 0.0) continue;
    float k = length(o + h - f) / (0.25 + 0.3 * h.z);   // distance in crater radii
    sum += w * ((k < 1.0 ? k * k - 1.0 : 0.0) + exp(-pow((k - 1.0) * 3.5, 2.0)) * 0.3);
  }
  return sum;
}
`;

// A quad around the body's center that always faces the camera, sized in
// body radii (the vertex shader turns it, so no camera is passed in): the
// Sun's corona, a comet's coma, a black hole's lensing ring. Its fragment
// shader gets vQ, the position on the quad in body radii, and uHalfSize.
const GLSL_BILLBOARD_VERTEX = `
uniform float uHalfSize;
varying vec2 vQ;
void main(){
  vQ = position.xy * uHalfSize;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += vQ * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * c;
}`;
function makeBillboard(U, halfSize, fragmentShader) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uHalfSize: { value: halfSize } },
    vertexShader: GLSL_BILLBOARD_VERTEX,
    fragmentShader: GLSL_NOISE + GLSL_BODY + "uniform float uHalfSize;\nvarying vec2 vQ;\n" + fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;       // the shader draws it elsewhere than the geometry says
  mesh.raycast = () => {};          // decoration: never intercepts picking
  return mesh;
}

const hueColor = (hue) => new THREE.Color().setHSL(hue / 360, 0.75, 0.62);
const SPIN_RAD_PER_UNIT = 0.6;              // values.spin 1 = 0.6 rad/s
const ORIGIN = new THREE.Vector3();         // default light source: a sun at (0,0,0)
const NO_LIGHTS = [];
const seedVec = (s, out) => out.set(s * 17.13 % 97, s * 7.71 % 89, s * 3.37 % 83);

// Star color of a black body at `kelvin` (Tanner Helland's fit), 0..1.
function blackbody(kelvin, out) {
  const t = kelvin / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x) => Math.min(255, Math.max(0, x)) / 255;
  return out.setRGB(c(r), c(g), c(b));
}

// The uniforms every body has (GLSL_BODY + the light direction).
const MAX_POINT_LIGHTS = 4;
function bodyUniforms(v) {
  const vecs = () => Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3());
  return {
    uSeed: { value: seedVec(v.seed, new THREE.Vector3()) }, uTime: { value: 0 },
    uDamage: { value: v.damage }, uOctaves: { value: 6 }, uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uPointPos: { value: vecs() }, uPointColor: { value: vecs() },
    uPointRange: { value: new Array(MAX_POINT_LIGHTS).fill(1) }, uPointCount: { value: 0 },
  };
}

// The body handle every group's build() returns (API in the header). A
// body is `group` (scaled to the radius, tilted) > `spin` (turns with the
// surface). A build passes only what's its own:
//   apply()                    copy its values into its uniforms
//   layers { name: { objects, when? } }   what setLayers() shows/hides
//   onUpdate(t, dt, opts)      extra per-frame work
//   describe(renderer)         [[label, text]] rows for the lab
//   measure(renderer), dispose()
function makeBodyHandle({ v, U, group, spin, pickMesh, apply, layers = {}, onUpdate, describe, measure, dispose }) {
  const tmp = new THREE.Vector3();
  let radiusOverride = null;
  const shown = {};
  for (const k in layers) shown[k] = true;
  const body = {
    group, pickMesh, surfaceRoot: spin, values: v,
    get radius() { return radiusOverride != null ? radiusOverride : v.size; },
    // opts.sunDir: world direction toward the light, or
    // opts.sunPosition: world position of the light (default (0,0,0));
    // the direction is then taken from the body's own world position.
    // opts.lights: nearby point lights, [{ position (world), color,
    // intensity, distance }], the first MAX_POINT_LIGHTS used; left out =
    // none.
    update(t, dt, opts = {}) {
      U.uTime.value = t;
      const lights = opts.lights || NO_LIGHTS, n = Math.min(lights.length, MAX_POINT_LIGHTS);
      for (let i = 0; i < n; i++) {
        const l = lights[i];
        U.uPointPos.value[i].copy(l.position);
        U.uPointColor.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity);
        U.uPointRange.value[i] = l.distance;
      }
      U.uPointCount.value = n;
      spin.rotation.y += dt * v.spin * SPIN_RAD_PER_UNIT;
      group.rotation.z = THREE.MathUtils.degToRad(v.tilt);
      if (opts.sunDir) U.uSunDir.value.copy(opts.sunDir).normalize();
      else U.uSunDir.value.copy(opts.sunPosition || ORIGIN).sub(group.getWorldPosition(tmp)).normalize();
      if (onUpdate) onUpdate(t, dt, opts);
    },
    // Radius in world units, overriding values.size (use the game's radius).
    setRadius(units) { radiusOverride = units; group.scale.setScalar(body.radius); },
    setValues(nv) {
      Object.assign(v, nv);
      group.scale.setScalar(body.radius);
      seedVec(v.seed, U.uSeed.value);
      U.uDamage.value = v.damage;
      if (apply) apply();
      for (const k in layers) {
        const on = shown[k] && (!layers[k].when || layers[k].when());
        layers[k].objects.forEach((o) => { o.visible = on; });
      }
    },
    setDamage(x) { v.damage = x; U.uDamage.value = x; },
    setOctaves(n) { U.uOctaves.value = n; },
    setLayers(on) { Object.assign(shown, on); body.setValues({}); },
    describe: describe || (() => []),
    measure: measure || null,
    _dispose: dispose || null,
  };
  body.setValues({});
  return body;
}

// A lit, spinning sphere: the vertex shader most surfaces share (a unit
// direction vDir for the noise, world position and normal for lighting).
const GLSL_SPHERE_VERTEX = `
varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
void main(){
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// =====================================================================
// GROUPS — each with its own parameter schema.
//   kmPerSize  real radius (km) of values.size 1, for the lab's statistics
//   view       the lab camera's distance (radii) when the group is opened
//   layers     the lab's two layer toggles: { clouds?, atmosphere? } labels
// A body's `slot` is the game's fixed solar orbit it is
// (world/solarSystem.js), `kind` a game kind it is for every body of
// that kind (comets). `size` only matters here — the game sizes a body
// to its own radius.
// =====================================================================
const pct = (x) => Math.round(x * 100) + "%";
const f2 = (x) => x.toFixed(2);
const ROCK_PARAMS = [
  { key: "size",       label: "Size (×5 km)",           min: 0.2, max: 3,   step: 0.05, value: 1,    fmt: f2 },
  { key: "lumpiness",  label: "Lumpiness",              min: 0,   max: 1,   step: 0.01, value: 0.55, fmt: pct },
  { key: "elongation", label: "Elongation",             min: 1,   max: 2.5, step: 0.05, value: 1.4,  fmt: (x) => x.toFixed(2) + "×" },
  { key: "craters",    label: "Craters",                min: 0,   max: 1,   step: 0.01, value: 0.5,  fmt: pct },
  { key: "albedo",     label: "Albedo (brightness)",    min: 0.03, max: 0.5, step: 0.01, value: 0.12, fmt: pct },
  { key: "rust",       label: "Color (grey → rusty)",   min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: pct },
  { key: "ice",        label: "Ice & frost",            min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
  { key: "metal",      label: "Metal veins",            min: 0,   max: 1,   step: 0.01, value: 0.15, fmt: pct },
];
// Every planet parameter buildPlanet reads, with its slider. The planet
// groups (lava, Earth-like, ice, airless) share one shader and show only
// the sliders that matter for them; the rest come from these defaults, the
// group's `fixed` values and the body's own values.
const PLANET_PARAMS = [
      { key: "size",       label: "Size (Earth radii)",     min: 0.3, max: 2.5, step: 0.05, value: 1,    fmt: f2 },
      { key: "sea",        label: "Water level",            min: -0.6, max: 0.6, step: 0.01, value: 0.04, fmt: f2 },
      { key: "continents", label: "Continent scale",        min: 0.5, max: 3.5, step: 0.05, value: 1.4,  fmt: f2 },
      { key: "mountains",  label: "Mountain height",        min: 0,   max: 0.15, step: 0.005, value: 0.045, fmt: pct },
      { key: "roughness",  label: "Terrain roughness",      min: 0.35, max: 0.7, step: 0.01, value: 0.52, fmt: f2 },
      { key: "climate",    label: "Climate (lush → arid)",  min: 0,   max: 1,   step: 0.01, value: 0.35, fmt: pct },
      { key: "ice",        label: "Ice caps (reach)",       min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: f2 },
      { key: "clouds",     label: "Cloud cover",            min: 0,   max: 1,   step: 0.01, value: 0.35, fmt: pct },
      { key: "cloudDrift", label: "Cloud drift",            min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: pct },
      { key: "atmosphere", label: "Atmosphere",             min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "atmoHue",    label: "Atmosphere hue",         min: 0,   max: 360, step: 1,    value: 205,  fmt: (x) => Math.round(x) + "°" },
      { key: "lava",       label: "Molten lowlands",        min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "frozen",     label: "Frozen seas",            min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "airless",    label: "Airless, cratered",      min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "rays",       label: "Ray craters",            min: 0,   max: 1.5, step: 0.01, value: 0,    fmt: pct },
      { key: "maria",      label: "Maria (dark basalt plains)", min: 0, max: 1, step: 0.01, value: 0,  fmt: pct },
      { key: "rust",       label: "Rust (oxidised dust)",   min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "craters",    label: "Craters",                min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "overcast",   label: "Cloud deck (closed)",    min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "bands",      label: "Band contrast",          min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "haze",       label: "Haze colour (white → ochre)", min: 0, max: 1, step: 0.01, value: 0.5, fmt: pct },
];
const PLANET_DEFAULTS = Object.fromEntries(PLANET_PARAMS.map((p) => [p.key, p.value]));
// A group's sliders: keys, or [key, overrides] (another label or default).
function planetParams(list) {
  return list.map((it) => {
    const [key, over] = Array.isArray(it) ? it : [it, {}];
    const base = PLANET_PARAMS.find((p) => p.key === key);
    if (!base) throw new Error("BodyKit: unknown planet parameter " + key);
    return { ...base, ...over };
  });
}
// Each group's `build` names its kind; the kind files (js/bodykit/kinds/*.js,
// loaded after this one) register the builders here.
const KINDS = {};
// scale: a lab size of 1 in km for these kinds (the groups' kmPerSize)
const ROCK_KM = 5;                  // lab size 1 = 5 km radius
const HOLE_KM = 30;                 // lab size 1 = a 30 km event horizon

const GROUPS = [
  {
    id: "lava", name: "LAVA WORLDS", kmPerSize: 6371, view: 4.4, layers: { clouds: "ASH CLOUDS", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", ["sea", { label: "Lava level" }], "continents", "mountains", "roughness", ["lava", { value: 1 }],
      ["clouds", { label: "Ash clouds" }], "cloudDrift", "atmosphere", "atmoHue"]),
    fixed: { ice: 0 },
    bodies: [
      { id: "cinder",  name: "CINDER",  slot: 1, values: { seed: 11, size: 0.85, tilt: 6, sea: -0.05, mountains: 0.06,
        climate: 0.9, clouds: 0.08, cloudDrift: 0.5, atmosphere: 0.35, atmoHue: 18 } },
      { id: "magma",   name: "MAGMA",   slot: 2, values: { seed: 23, size: 1.2, tilt: 30, sea: 0.06, roughness: 0.6,
        climate: 1, clouds: 0.15, atmosphere: 0.5, atmoHue: 12 } },
    ],
    build: "planet",
  },
  {
    id: "earthlike", name: "EARTH-LIKE", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUDS", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", "sea", "continents", "mountains", "roughness", "climate", "ice", "clouds", "cloudDrift", "atmosphere", "atmoHue"]),
    bodies: [
      { id: "terra",   name: "TERRA-1", slot: 3, values: { seed: 1 } },
      { id: "pelagia", name: "PELAGIA", slot: 5, values: { seed: 5, size: 1.35, tilt: 12, sea: 0.22, continents: 2.2,
        climate: 0.2, ice: 0.25, clouds: 0.55, atmoHue: 195 } },
    ],
    build: "planet",
  },
  {
    id: "icy", name: "ICE WORLDS", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUDS", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", ["sea", { label: "Frozen-sea level" }], "continents", "mountains", "roughness", "ice", ["frozen", { value: 1 }],
      "clouds", "cloudDrift", "atmosphere", "atmoHue"]),
    bodies: [
      { id: "rime",    name: "RIME",    slot: 6, values: { seed: 31, size: 0.9, tilt: 20, sea: 0.05, ice: 0.75,
        climate: 0.1, clouds: 0.3, atmosphere: 0.45, atmoHue: 190 } },
      { id: "glacies", name: "GLACIES", slot: 7, values: { seed: 47, size: 1.25, tilt: 40, sea: 0.25, ice: 1,
        mountains: 0.03, clouds: 0.4, atmosphere: 0.35, atmoHue: 215 } },
    ],
    build: "planet",
  },
  {
    id: "desert", name: "DESERT WORLDS", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUDS", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", ["continents", { label: "Terrain scale" }], "mountains", "roughness", ["rust", { value: 1 }],
      ["craters", { value: 0.5 }], ["ice", { label: "Polar caps", value: 0.15 }], ["clouds", { label: "Thin clouds", value: 0.05 }],
      "cloudDrift", ["atmosphere", { value: 0.25 }], ["atmoHue", { value: 22 }]]),
    fixed: { sea: -0.6, climate: 1 },
    bodies: [
      { id: "mars", name: "MARS", values: { seed: 17, size: 0.53, tilt: 25, continents: 1.1, mountains: 0.03, roughness: 0.56,
        craters: 0.45, ice: 0.12, clouds: 0, atmosphere: 0.12, atmoHue: 24 } },
    ],
    build: "planet",
  },
  {
    id: "clouded", name: "CLOUD WORLDS", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUD DECK", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", ["overcast", { value: 1 }], "bands", "haze", ["cloudDrift", { label: "Wind speed", value: 0.6 }],
      "atmosphere", ["atmoHue", { value: 42 }]]),
    // flat: mountains would poke through the deck. Under it (seen only from the
    // ground, planetTerrain): no seas, scorched rusty rock
    fixed: { clouds: 1, sea: -0.6, ice: 0, mountains: 0, climate: 0, rust: 0.8 },
    bodies: [
      { id: "venus", name: "VENUS", values: { seed: 9, size: 0.95, tilt: 3, spin: 0.05, haze: 0.45, atmosphere: 0.25, atmoHue: 48 } },
    ],
    build: "planet",
  },
  {
    id: "moons", name: "MOONS", kmPerSize: 6371, view: 4.4, layers: {},
    params: planetParams(["size", ["continents", { label: "Terrain scale" }], ["mountains", { label: "Relief height", value: 0.006 }], "roughness",
      ["airless", { label: "Craters", value: 1 }], ["maria", { value: 0.6 }], ["rays", { value: 0.5 }]]),
    fixed: { sea: -0.6, ice: 0, clouds: 0, atmosphere: 0, climate: 0.5 },
    bodies: [
      { id: "luna", name: "LUNA", view: 1.6, values: { seed: 13, size: 0.27, tilt: 7, spin: 0.1, continents: 1.3, roughness: 0.55 } },
    ],
    build: "planet",
  },
  {
    id: "airless", name: "AIRLESS", kmPerSize: 6371, view: 4.4, layers: {},
    params: planetParams(["size", ["continents", { label: "Terrain scale" }], ["mountains", { label: "Relief height", value: 0.006 }], "roughness",
      ["airless", { label: "Craters", value: 1 }], ["rays", { value: 0.9 }]]),
    fixed: { sea: -0.6, ice: 0, clouds: 0, atmosphere: 0, climate: 0.5 },
    bodies: [
      { id: "mercury", name: "MERCURY", values: { seed: 3, size: 0.38, tilt: 0, spin: 0.25, continents: 1.6, roughness: 0.55 } },
    ],
    build: "planet",
  },
  {
    id: "giants", name: "GAS GIANTS", kmPerSize: 69911, view: 4.4, layers: { clouds: "RINGS", atmosphere: "ATMOSPHERE" },
    params: [
      { key: "size",       label: "Size (Jupiter radii)",   min: 0.3, max: 2,   step: 0.05, value: 1,    fmt: f2 },
      { key: "bandCount",  label: "Bands",                  min: 6,   max: 30,  step: 1,    value: 13,   fmt: (x) => Math.round(x) },
      { key: "turbulence", label: "Turbulence",             min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "contrast",   label: "Band contrast",          min: 0,   max: 1,   step: 0.01, value: 0.5,  fmt: pct },
      { key: "warm",       label: "Colour (grey → rusty)",  min: 0,   max: 1,   step: 0.01, value: 0.7,  fmt: pct },
      { key: "storm",      label: "Great storm",            min: 0,   max: 1.5, step: 0.01, value: 1,    fmt: pct },
      { key: "stormLat",   label: "Storm latitude",         min: -60, max: 60,  step: 1,    value: -22,  fmt: (x) => Math.round(x) + "°" },
      { key: "ovals",      label: "White ovals",            min: 0,   max: 1,   step: 0.01, value: 0.5,  fmt: pct },
      { key: "polar",      label: "Polar haze",             min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "wind",       label: "Wind speed",             min: 0,   max: 1,   step: 0.01, value: 0.5,  fmt: pct },
      { key: "sheen",      label: "Polish (sheen)",         min: 0,   max: 1,   step: 0.01, value: 0.25, fmt: pct },
      { key: "rings",      label: "Rings",                  min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "oblate",     label: "Flattening",             min: 0,   max: 0.15, step: 0.005, value: 0,  fmt: pct },
      { key: "hexagon",    label: "Polar hexagon",          min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "polarBlue",  label: "Polar haze (grey → blue)", min: 0, max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "gold",       label: "Golden tint",            min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "iceTint",    label: "Ice giant (methane blue)", min: 0, max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "iceHue",     label: "Ice giant hue",          min: 160, max: 250, step: 1,    value: 200,  fmt: (x) => Math.round(x) + "°" },
      { key: "ringStyle",  label: "Ring style (broad / narrow)", min: 0, max: 1, step: 1,   value: 0,    fmt: (x) => (x > 0.5 ? "narrow" : "broad") },
      { key: "atmosphere", label: "Atmosphere",             min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: pct },
      { key: "atmoHue",    label: "Atmosphere hue",         min: 0,   max: 360, step: 1,    value: 35,   fmt: (x) => Math.round(x) + "°" },
    ],
    bodies: [
      { id: "jupiter", name: "JUPITER", values: { seed: 5, tilt: 3, spin: 1 } },
      { id: "saturn",  name: "SATURN",  view: 8.5, values: { seed: 11, size: 0.84, tilt: 27, spin: 1, bandCount: 24, turbulence: 0.12, contrast: 0.2,
        warm: 0.6, gold: 0.65, storm: 0, ovals: 0, polar: 0.55, polarBlue: 0.7, wind: 0.35, sheen: 0.15, rings: 1, oblate: 0.1, hexagon: 1,
        atmosphere: 0.22, atmoHue: 40 } },
      { id: "uranus",  name: "URANUS",  view: 3.2, values: { seed: 21, size: 0.37, tilt: 98, spin: 0.7, bandCount: 10, turbulence: 0.05,
        contrast: 0.06, warm: 0, storm: 0, ovals: 0, polar: 0.6, wind: 0.2, sheen: 0.1, rings: 0.8, ringStyle: 1, oblate: 0.023,
        iceTint: 1, iceHue: 184, atmosphere: 0.4, atmoHue: 185 } },
      { id: "neptune", name: "NEPTUNE", view: 2.6, values: { seed: 29, size: 0.35, tilt: 28, spin: 0.75, bandCount: 12, turbulence: 0.25,
        contrast: 0.35, warm: 0, storm: 0.6, stormLat: -20, ovals: 0.35, polar: 0.3, wind: 0.8, sheen: 0.1, rings: 0.3, ringStyle: 1,
        oblate: 0.017, iceTint: 1, iceHue: 222, atmosphere: 0.45, atmoHue: 220 } },
    ],
    build: "giant",
  },
  {
    id: "rings", name: "RINGS", kmPerSize: 60268, view: 7, layers: {},
    params: [
      { key: "size",      label: "Size (planet radii)",    min: 0.3, max: 2,   step: 0.05, value: 1,  fmt: f2 },
      { key: "rings",     label: "Density",                min: 0,   max: 1,   step: 0.01, value: 1,  fmt: pct },
      { key: "ringStyle", label: "Style",                  min: 0,   max: 3,   step: 1,    value: 0,
        fmt: (x) => ["broad", "narrow", "dust", "debris"][Math.round(x)] },
    ],
    bodies: [
      { id: "halo",      name: "HALO",      values: { seed: 3, tilt: 25, spin: 0.15, ringStyle: 0 } },
      { id: "filament",  name: "FILAMENT",  values: { seed: 7, tilt: 25, spin: 0.15, ringStyle: 1 } },
      { id: "gossamer",  name: "GOSSAMER",  values: { seed: 9, tilt: 25, spin: 0.15, ringStyle: 2 } },
      { id: "shards",    name: "SHARD BELT", values: { seed: 15, tilt: 25, spin: 0.15, ringStyle: 3 } },
    ],
    build: "rings",
  },
  {
    id: "pulsars", name: "PULSARS", kmPerSize: 12, view: 22, layers: { atmosphere: "GLOW & FIELD" },
    params: [
      { key: "size",        label: "Size (neutron star radii)", min: 0.5, max: 2, step: 0.05, value: 1,   fmt: f2 },
      { key: "rate",        label: "Sweep (turns/s, slowed)", min: 0.05, max: 3, step: 0.01, value: 0.6,  fmt: (x) => x.toFixed(2) },
      { key: "magTilt",     label: "Magnetic tilt",          min: 0,   max: 90,  step: 1,    value: 40,   fmt: (x) => Math.round(x) + "°" },
      { key: "beamLength",  label: "Beam length",            min: 2,   max: 16,  step: 0.5,  value: 10,   fmt: f2 },
      { key: "beamWidth",   label: "Beam width",             min: 0.03, max: 0.4, step: 0.01, value: 0.12, fmt: f2 },
      { key: "beamHue",     label: "Beam hue",               min: 180, max: 320, step: 1,    value: 225,  fmt: (x) => Math.round(x) + "°" },
      { key: "temperature", label: "Surface temperature",    min: 100000, max: 3000000, step: 10000, value: 1000000, fmt: (x) => (x / 1e6).toFixed(2) + " MK" },
      { key: "glow",        label: "Glow",                   min: 0,   max: 1,   step: 0.01, value: 0.7,  fmt: pct },
      { key: "field",       label: "Field lines",            min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "periodMs",    label: "Real spin period (ms)",  min: 1.4, max: 4000, step: 0.1, value: 89,   fmt: (x) => x + " ms" },
    ],
    bodies: [
      // invented: a lone, old pulsar ticking with a clock's regularity
      { id: "metronome", name: "METRONOME · PSR J0731+1337", values: { seed: 31, tilt: 12, spin: 0, rate: 0.6, magTilt: 42, beamHue: 228,
        temperature: 900000, periodMs: 89.3 } },
    ],
    build: "pulsar",
  },
  {
    id: "suns", name: "SUNS", kmPerSize: 696000, view: 7, layers: { atmosphere: "CORONA" },
    params: [
      { key: "size",        label: "Size (Sun radii)",       min: 0.1, max: 3,     step: 0.05, value: 1,    fmt: f2 },
      { key: "temperature", label: "Temperature",            min: 2400, max: 30000, step: 50, value: 5778, fmt: (x) => Math.round(x) + " K" },
      { key: "granulation", label: "Granulation",            min: 0,   max: 1,     step: 0.01, value: 0.55, fmt: pct },
      { key: "spots",       label: "Sunspots",               min: 0,   max: 1,     step: 0.01, value: 0.35, fmt: pct },
      { key: "activity",    label: "Activity (flares, boiling)", min: 0, max: 1,   step: 0.01, value: 0.45, fmt: pct },
      { key: "corona",      label: "Corona",                 min: 0,   max: 1,     step: 0.01, value: 0.5,  fmt: pct },
      { key: "brightness",  label: "Brightness",             min: 0.5, max: 1.6,   step: 0.01, value: 1,    fmt: f2 },
    ],
    bodies: [
      { id: "sol", name: "SOL", slot: 0, values: { seed: 3, spin: 0.08, tilt: 7 } },
    ],
    build: "sun",
  },
  {
    id: "comets", name: "COMETS", kmPerSize: ROCK_KM, view: 20, layers: { atmosphere: "COMA & TAILS" },
    params: [
      ...ROCK_PARAMS,
      { key: "coma",     label: "Coma",                  min: 0,   max: 1,   step: 0.01, value: 0.6, fmt: pct },
      { key: "tail",     label: "Tail length (radii)",   min: 5,   max: 80,  step: 1,    value: 30,  fmt: (x) => Math.round(x) + "" },
      { key: "dustTail", label: "Dust tail",             min: 0,   max: 1.5, step: 0.01, value: 0.6, fmt: pct },
      { key: "ionHue",   label: "Ion tail hue",          min: 160, max: 280, step: 1,    value: 205, fmt: (x) => Math.round(x) + "°" },
    ],
    bodies: [
      { id: "comet", name: "COMET", kind: "comet", values: { seed: 9, spin: 0.4, ice: 0.55, albedo: 0.08, rust: 0.2,
        metal: 0, elongation: 1.6, lumpiness: 0.6 } },
    ],
    build: "comet",
  },
  {
    id: "rocks", name: "ROCKS", kmPerSize: ROCK_KM, view: 5,
    params: ROCK_PARAMS,
    bodies: [
      { id: "ferrum", name: "FERRUM", slot: 8, values: { seed: 17, spin: 0.35, tilt: 35, metal: 0.55, rust: 0.45,
        albedo: 0.14, craters: 0.6 } },
    ],
    build: "rock",
  },
  {
    id: "blackholes", name: "BLACK HOLES", kmPerSize: HOLE_KM, view: 14, layers: { atmosphere: "DISK & LENSING" },
    params: [
      { key: "size",       label: "Size (×30 km horizon)",  min: 0.2, max: 3,   step: 0.05, value: 1,    fmt: f2 },
      { key: "disk",       label: "Disk reach (radii)",     min: 2.5, max: 9,   step: 0.1,  value: 5,    fmt: f2 },
      { key: "diskTemp",   label: "Disk temperature",       min: 2400, max: 20000, step: 50, value: 4200, fmt: (x) => Math.round(x) + " K" },
      { key: "turbulence", label: "Turbulence",             min: 0,   max: 1,   step: 0.01, value: 0.7,  fmt: pct },
      { key: "diskSpeed",  label: "Disk speed",             min: 0,   max: 2,   step: 0.01, value: 0.6,  fmt: f2 },
      { key: "doppler",    label: "Doppler beaming",        min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "lensing",    label: "Lensing glow",           min: 0,   max: 1,   step: 0.01, value: 0.7,  fmt: pct },
      { key: "brightness", label: "Brightness",             min: 0.3, max: 2,   step: 0.01, value: 1,    fmt: f2 },
    ],
    bodies: [
      { id: "abyss", name: "ABYSS", slot: 9, values: { seed: 13, spin: 0, tilt: 16 } },
    ],
    build: "hole",
  },
  {
    // the backdrop, not a body: no radius statistics, no common sliders
    id: "skies", name: "SKY", kmPerSize: null, common: false, view: 4.4, layers: { clouds: "STARS", atmosphere: "NEBULAE" },
    params: [
      { key: "nebula",       label: "Nebula coverage",     min: 0,   max: 1,   step: 0.01, value: 0.4, fmt: pct },
      { key: "nebulaBright", label: "Nebula brightness",   min: 0,   max: 2.5, step: 0.01, value: 0.9,  fmt: f2 },
      { key: "nebulaScale",  label: "Nebula scale",        min: 0.6, max: 3,   step: 0.05, value: 1.4,  fmt: f2 },
      { key: "hueA",         label: "Nebula color 1",      min: 0,   max: 360, step: 1,    value: 330,  fmt: (x) => Math.round(x) + "°" },
      { key: "hueB",         label: "Nebula color 2",      min: 0,   max: 360, step: 1,    value: 185,  fmt: (x) => Math.round(x) + "°" },
      { key: "dust",         label: "Dark dust",           min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "band",         label: "Milky Way",           min: 0,   max: 2,   step: 0.01, value: 0.8,  fmt: f2 },
      { key: "stars",        label: "Stars",               min: 0,   max: 1,   step: 0.01, value: 0.55, fmt: pct },
      { key: "starBright",   label: "Star brightness",     min: 0.3, max: 2,   step: 0.01, value: 1,    fmt: f2 },
      { key: "twinkle",      label: "Twinkle",             min: 0,   max: 1,   step: 0.01, value: 0.4,  fmt: pct },
      { key: "pulsars",      label: "Pulsars",             min: 0,   max: 6,   step: 1,    value: 3,    fmt: (x) => String(Math.round(x)) },
    ],
    bodies: [
      { id: "deep", name: "DEEP FIELD", kind: "sky", values: { seed: 7, spin: 0, tilt: 0 } },
    ],
    build: "sky",
  },
];
// Parameters every body has, whatever its group (the "classic" controls).
const COMMON_PARAMS = [
  { key: "spin", label: "Rotation speed", min: 0, max: 2,  step: 0.01, value: 0.25, fmt: (x) => x.toFixed(2) + "×" },
  { key: "tilt", label: "Axial tilt",     min: 0, max: 180, step: 1,   value: 23,   fmt: (x) => Math.round(x) + "°" },
  // a preview of the game's health: 1 - health / maxHealth (setDamage)
  { key: "damage", label: "Damage (game health)", min: 0, max: 1, step: 0.01, value: 0, fmt: pct },
];

// Noise octaves per pixel for the render-quality presets LOW .. MAX —
// the lab's quality buttons and the game's Setup -> Graphics use the same.
const QUALITY_OCTAVES = [3, 4, 5, 6, 8];
// The game builds bodies at this fraction of its geometry-detail setting
// (world/bodyVisual.js) — the lab's GAME BUILD toggle uses the same.
const GAME_DETAIL_SCALE = 0.5;

// What the game shows: { slot: ref } for its fixed orbits, { kind: ref }
// for kinds that come and go (comets); ref = { groupId, bodyId }.
const GAME_BODIES = {}, GAME_KINDS = {};
for (const g of GROUPS) for (const b of g.bodies) {
  if (b.slot != null) GAME_BODIES[b.slot] = { groupId: g.id, bodyId: b.id };
  if (b.kind) GAME_KINDS[b.kind] = { groupId: g.id, bodyId: b.id };
}

function defaultValues(group, body) {
  const v = { seed: 1 };
  for (const p of [...COMMON_PARAMS, ...group.params]) v[p.key] = p.value;
  return Object.assign(v, group.fixed, body.values);   // fixed: values a group sets but shows no slider for
}

function buildBody(groupId, bodyId, { detail = 1, values = {} } = {}) {
  const group = GROUPS.find((g) => g.id === groupId);
  const def = group && group.bodies.find((b) => b.id === bodyId);
  if (!def) throw new Error(`BodyKit: unknown body ${groupId}/${bodyId}`);
  const body = KINDS[group.build]({ ...defaultValues(group, def), ...values }, detail);
  return Object.assign(body, { id: bodyId, groupId, detail });
}

function disposeBody(body) {
  if (body.group.parent) body.group.parent.remove(body.group);
  body.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  if (body._dispose) body._dispose();
}

function modelStats(root) {
  const st = { objects: 0, meshes: 0, triangles: 0, vertices: 0, shaders: new Set() };
  root.traverse((o) => {
    if (!o.isMesh) return;
    st.objects++; st.meshes++;
    const g = o.geometry;
    st.vertices += g.attributes.position.count;
    st.triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    if (o.material.isShaderMaterial) st.shaders.add(o.material);
  });
  st.shaderCount = st.shaders.size;
  return st;
}

// GLSL_PLANET, GLSL_PLANET_SURFACE, planetTerrain, GLSL_SUN, GLSL_ROCK,
// GLSL_HOLE and GLSL_SKY are added by their kind files (js/bodykit/kinds/).
return { GROUPS, COMMON_PARAMS, PLANET_PARAMS, PLANET_DEFAULTS, QUALITY_OCTAVES, GAME_DETAIL_SCALE, MAX_POINT_LIGHTS, GAME_BODIES, GAME_KINDS, SPIN_RAD_PER_UNIT,
         buildBody, disposeBody, modelStats, defaultValues,
         GLSL_NOISE, GLSL_BODY, blackbody,
         // the internals the kind files build with — not a public API
         _: { KINDS, PLANET_DEFAULTS, defaultValues, GLSL_BODY, GLSL_NOISE, GLSL_SPHERE_VERTEX, GROUPS, HOLE_KM, ROCK_KM, blackbody, bodyUniforms, hueColor, makeBillboard, makeBodyHandle, seedVec } };
})();
