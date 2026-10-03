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
// PLANETS
// Shared GLSL: terrain height + surface classification, used by the
// surface shader AND the coverage probe, so the land/water/ice
// statistics are exactly what is drawn.
// =====================================================================
const GLSL_PLANET = `
uniform float uFreq, uSea, uRough, uIce, uClimate, uClouds, uCloudDrift;
uniform float uAirless, uRays, uCraters, uRust, uMaria;
// maria: dark, smooth basalt plains (an airless moon's "seas"), 0..1
float mariaAt(vec3 p){ return uMaria <= 0.001 ? 0.0 : uMaria * smoothstep(0.02, 0.12, fbm(p * 1.3 + uSeed.yzx, 4, 0.5)); }

// craters of three sizes, fewer on the low plains: airless worlds, or any
// planet with "craters" (a desert world's old highlands)
float craterAmount(){ return max(uAirless, uCraters); }
float craterRelief(vec3 p, float base){
  float amt = craterAmount();
  if (amt <= 0.001) return 0.0;
  float share = amt * mix(0.18, 0.7, smoothstep(-0.25, 0.25, base)) * (1.0 - 0.8 * mariaAt(p));   // lava filled the maria's craters
  return craterField(p, 5.0, share) * 0.10 + craterField(p, 11.0, share) * 0.05 + craterField(p, 24.0, share * 0.9) * 0.022;
}
// continents: domain-warped fBm, ~ -1..1
float baseOct(vec3 p, int octaves){
  vec3 q = p * uFreq + uSeed;
  vec3 warp = vec3(snoise(q * 0.7 + 11.3), snoise(q * 0.7 + 27.1), snoise(q * 0.7 + 3.7));
  return fbm(q + warp * 0.35, octaves, uRough);
}
// the height: continents + craters on an airless world
float heightOct(vec3 p, int octaves){
  float h = baseOct(p, octaves);
  return h + craterRelief(p, h);
}
// sea or not: none on an airless world, none with the water level at its
// minimum (a dry world) — crater floors may dip below uSea there
float seaAt(float h){ return uSea <= -0.599 ? 0.0 : step(h, uSea) * (1.0 - step(0.5, uAirless)); }
// young craters with bright ray systems: a few centres from the seed;
// noise of the direction around a centre gives streaks that only change
// with the angle, i.e. radial rays. 0..~1.5
float rayAt(vec3 p){
  if (uRays <= 0.001) return 0.0;
  float r = 0.0;
  for (int k = 0; k < 10; k++){
    vec3 hk = hash33(vec3(float(k) * 7.13, uSeed.x * 3.1, uSeed.y * 1.7));
    vec3 c = normalize(hk * 2.0 - 1.0);
    vec3 d = p - c;
    float dist = length(d);
    if (dist > 1.3) continue;
    vec3 dir = normalize(d - c * dot(d, c) + 1e-5);
    float streak = smoothstep(0.55, 0.9, snoise(dir * 14.0 + float(k) * 3.1) * 0.5 + 0.5)
                 + 0.6 * smoothstep(0.62, 0.92, snoise(dir * 37.0 + float(k) * 5.7) * 0.5 + 0.5);
    float reach = 0.14 + 0.4 * hk.z * hk.z;
    float strength = 0.45 + 0.55 * fract(hk.x * 13.7);
    r += (streak * exp(-dist / reach) * smoothstep(0.0, 0.04, dist) + exp(-dist * dist / 0.0012) * 1.4) * strength;
  }
  return r * uRays;
}
float heightAt(vec3 p){ return heightOct(p, uOctaves); }
float moistureAt(vec3 p){ return snoise(p * 2.3 + uSeed.zxy * 1.7) * 0.5 + 0.5; }
// polar ice: latitude threshold set by uIce, with a noisy edge
float iceAt(vec3 p, float h){
  float lat = abs(p.y);
  float edge = 1.0 - uIce * 0.62 + snoise(p * 6.0 + uSeed) * 0.05;
  float polar = smoothstep(edge, edge + 0.03, lat);
  float alt = (h - uSea) / max(1.0 - uSea, 0.05);
  float snowLine = 0.95 - uIce * 0.45;                  // mountain snow
  float peaks = step(uSea, h) * smoothstep(snowLine, snowLine + 0.05, alt) * (1.0 - uRust);   // no snowy peaks on a desert
  return uIce <= 0.001 ? 0.0 : max(polar, peaks);
}
uniform float uOvercast, uBands, uHaze;
float cloudAt(vec3 p){
  if (uOvercast >= 0.999) return 1.0;                   // a closed deck: no gaps to compute
  float a = uTime * uCloudDrift * 0.05;                  // clouds drift over the surface
  mat3 rot = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  vec3 q = rot * p * 3.2 + uSeed.yzx;
  float n = fbm(q + vec3(0.0, uTime * 0.01, 0.0), uOctaves, 0.55) * 0.5 + 0.5;
  // threshold = inverse of n's (≈ normal, sd ≈ 0.11) distribution at
  // 1 - uClouds (logistic approximation), so coverage ≈ the slider value
  float cq = clamp(1.0 - uClouds, 0.001, 0.999);
  float t = 0.5 + 0.11 * log(cq / (1.0 - cq)) / 1.702;
  return mix(smoothstep(t - 0.05, t + 0.05, n), 1.0, uOvercast);
}
// an overcast deck (a planet wrapped in cloud): bands stretched along the
// latitude lines plus warped swirls, drifting with the wind, 0..1
float hazeAt(vec3 p){
  float a = uTime * uCloudDrift * 0.08;
  mat3 rot = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  vec3 q = rot * p;
  float bands = fbm(vec3(q.x * 1.3, q.y * 7.0, q.z * 1.3) + uSeed, uOctaves, 0.55);
  float swirl = fbm(q * 2.6 + uSeed.yzx + vec3(bands * 0.9, 0.0, bands * 0.6), uOctaves, 0.5);
  float streak = fbm(vec3(q.x * 4.0, q.y * 22.0, q.z * 4.0) + uSeed.zxy, 3, 0.5);
  return clamp(0.5 + bands * 0.6 + swirl * 0.22 + streak * 0.1, 0.0, 1.0);
}

uniform float uLava, uFrozen;
// volcanic worlds: bright rivers of molten rock through a dark crust, 0..1
float lavaFlowAt(vec3 p){
  vec3 q = p * 6.0 + uSeed.zyx + vec3(0.0, uTime * 0.012, 0.0);
  float r1 = 1.0 - abs(snoise(q));
  float r2 = 1.0 - abs(snoise(q * 2.3 + 7.7));
  return clamp(smoothstep(0.72, 0.98, r1) + smoothstep(0.82, 0.99, r2) * 0.45, 0.0, 1.0);
}
// ice worlds: seas frozen into sheets, darker along pressure cracks, 0..1
float iceSheetAt(vec3 p){
  float tone = snoise(p * 3.0 + uSeed.yzx) * 0.5 + 0.5;
  float c = 1.0 - abs(snoise(p * 12.0 + uSeed));
  return tone * (1.0 - 0.6 * smoothstep(0.9, 0.97, c));
}
`;
// The planet's surface colour at p for height h: the land, the seas (or lava,
// or ice sheets), polar ice and snow, airless and rusty ground, self-lit lava
// and damage cracks (emit). Shared by the planet's surface shader and the
// terrain seen from the ground (planetTerrainMaterial), so a landing site
// looks like the same place seen from orbit.
const GLSL_PLANET_SURFACE = `
void planetSurface(vec3 p, float h, out vec3 col, out vec3 emit, out float water, out float ice){
  water = seaAt(h);
  ice = iceAt(p, h);
  float alt = clamp((h - uSea) / max(1.0 - uSea, 0.05), 0.0, 1.0);

  // ---- colors
  float depth = clamp((uSea - h) * 3.0, 0.0, 1.0);
  vec3 ocean = mix(vec3(0.10, 0.42, 0.55), vec3(0.015, 0.06, 0.20), smoothstep(0.0, 0.8, depth));
  float m = moistureAt(p);
  float arid = clamp(uClimate * 1.5 - m * 0.8 + (1.0 - abs(p.y)) * 0.25 - 0.1, 0.0, 1.0);
  vec3 lush = mix(vec3(0.10, 0.32, 0.09), vec3(0.22, 0.40, 0.12), m);
  vec3 desert = mix(vec3(0.72, 0.58, 0.36), vec3(0.58, 0.40, 0.24), m);
  vec3 land = mix(lush, desert, arid);
  land = mix(vec3(0.76, 0.70, 0.52), land, smoothstep(0.0, 0.04, alt));                 // beaches
  land = mix(land, vec3(0.38, 0.33, 0.29), smoothstep(0.45, 0.8, alt));                 // rock
  // airless world: grey regolith, darker bluish patches, brownish plains, bright ray craters
  if (uAirless > 0.001) {
    float dark = smoothstep(0.6, 0.85, snoise(p * 5.0 + uSeed.zxy) * 0.5 + 0.5);
    float tone = snoise(p * 9.0 + uSeed.yzx) * 0.5 + 0.5;
    vec3 regolith = mix(vec3(0.30, 0.30, 0.295), vec3(0.50, 0.495, 0.48), m * 0.6 + tone * 0.4);
    regolith = mix(regolith, vec3(0.25, 0.26, 0.28), dark * 0.35);                        // low-reflectance patches
    regolith = mix(regolith, vec3(0.40, 0.38, 0.35), (1.0 - smoothstep(-0.3, 0.1, h)) * 0.35);   // smooth plains
    // craters: darker floors, bright rims, the youngest small ones bright inside
    float c1 = craterField(p, 11.0, uAirless * 0.8), c2 = craterField(p, 24.0, uAirless * 0.75);
    regolith *= 1.0 + min(c1, 0.0) * 0.35 + max(c1, 0.0) * 0.6 + max(c2, 0.0) * 0.5;
    float mare = mariaAt(p);
    regolith = mix(regolith, mix(vec3(0.11, 0.11, 0.12), vec3(0.17, 0.165, 0.165), tone), mare * 0.92);   // the maria
    regolith = mix(regolith, vec3(0.86, 0.85, 0.83), clamp(rayAt(p) * 1.3, 0.0, 1.0));
    land = mix(land, regolith, uAirless);
  }
  // rust-red desert: oxidised dust, dark basalt regions, paler highlands
  if (uRust > 0.001) {
    float dark = smoothstep(0.5, 0.72, fbm(p * 1.7 + uSeed.zxy, 4, 0.55) * 0.5 + 0.5);
    vec3 dust = mix(vec3(0.66, 0.33, 0.17), vec3(0.80, 0.50, 0.29), m);
    vec3 mars = mix(dust, vec3(0.28, 0.16, 0.11), dark * 0.75);
    mars = mix(mars, vec3(0.74, 0.47, 0.30), smoothstep(0.45, 0.85, alt) * 0.5);
    mars *= 1.0 + min(craterField(p, 11.0, craterAmount() * 0.8), 0.0) * 0.25;   // darker crater floors
    land = mix(land, mars, uRust);
  }
  // volcanic world: basalt instead of soil, molten rock instead of water
  land = mix(land, mix(vec3(0.10, 0.085, 0.08), vec3(0.24, 0.17, 0.13), m), uLava);
  float flow = uLava > 0.001 ? lavaFlowAt(p) : 0.0;
  ocean = mix(ocean, mix(vec3(0.09, 0.05, 0.04), vec3(1.0, 0.36, 0.06), flow), uLava);
  // ice world: seas frozen over into cracked sheets, frost on the land
  float sheet = uFrozen > 0.001 ? iceSheetAt(p) : 0.0;
  ocean = mix(ocean, mix(vec3(0.55, 0.72, 0.84), vec3(0.86, 0.93, 0.98), sheet), uFrozen * (1.0 - uLava));
  land = mix(land, mix(vec3(0.36, 0.38, 0.42), vec3(0.50, 0.52, 0.55), m), uFrozen * 0.85);   // bare tundra rock
  land = mix(land, vec3(0.80, 0.86, 0.92), uFrozen * 0.5 * smoothstep(0.0, 0.1, alt));      // frost
  col = mix(land, ocean, water);
  col = mix(col, mix(vec3(0.82, 0.90, 0.97), vec3(0.95, 0.97, 1.0), alt), ice);         // ice / snow
  // self-lit, also on the night side: molten rock and its shores, damage cracks
  float shore = uLava * (1.0 - water) * (1.0 - smoothstep(0.0, 0.05, alt));
  emit = vec3(1.0, 0.36, 0.06) * (water * uLava * (0.12 + flow * 1.3) + shore * 0.5);
  float crack = crackAt(p);
  col *= 1.0 - crack * 0.75;
  emit += vec3(1.0, 0.45, 0.12) * crack * (0.7 + 0.9 * uDamage);
}
`;
const PLANET_GLSL = GLSL_NOISE + GLSL_BODY + GLSL_PLANET;

// Surface: vertex displacement for mountains + per-pixel colors, relief
// from the height sampled at nearby points, own sun lighting.
function planetSurfaceMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: PLANET_GLSL + `
      uniform float uMountain;
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vDir = normalize(position);
        float h = heightAt(vDir);
        float lift = max(h - uSea, 0.0) * uMountain;      // oceans stay at sea level
        vec3 displaced = position * (1.0 + lift);
        vec4 wp = modelMatrix * vec4(displaced, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal); // uniform scale only
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: PLANET_GLSL + GLSL_PLANET_SURFACE + `
      uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uAtmoColor; uniform float uMountain;
      uniform mat4 modelMatrix;    // set by three for every object (declared for this stage)
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float h = heightAt(p);
        vec3 col, emit; float water, ice;
        planetSurface(p, h, col, emit, water, ice);

        // ---- bump normal: height sampled at two nearby points on the
        // sphere (object space, one octave less), land only. Screen-space
        // derivatives (dFdx) would alias into 2×2-pixel steps at coasts.
        vec3 N = normalize(vNormalW);
        vec3 Nb = N;
        if (water < 0.5) {
          vec3 t1 = normalize(cross(abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), p));
          vec3 t2 = cross(p, t1);
          const float eps = 0.0025;
          int o = uOctaves > 2 ? uOctaves - 1 : uOctaves;
          vec3 px = normalize(p + t1 * eps), py = normalize(p + t2 * eps);
          float b0 = baseOct(p, o), bx = baseOct(px, o), by = baseOct(py, o);
          float c0 = craterRelief(p, b0), cx = craterRelief(px, bx), cy = craterRelief(py, by);
          // seas are flat (clamped to the sea level); a world without seas isn't
          // clamped, or crater floors below that level drew contour lines
          float seaLevel = (uSea <= -0.599 || uAirless >= 0.5) ? -10.0 : uSea;
          float h0 = max(b0 + c0, seaLevel), hx = max(bx + cx, seaLevel), hy = max(by + cy, seaLevel);
          float k = 0.012 + uMountain * 0.25;                    // relief strength
          float kc = craterAmount() * 0.3;                       // crater walls: much stronger than the terrain
          vec3 g = k * ((hx - h0) * t1 + (hy - h0) * t2) + kc * ((cx - c0) * t1 + (cy - c0) * t2);
          vec3 nObj = normalize(p - g / eps);
          Nb = normalize(mat3(modelMatrix) * nObj);
        }

        // ---- lighting
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float diff = max(dot(Nb, L), 0.0);
        float wrap = smoothstep(-0.15 + 0.12 * uAirless, 0.25 - 0.17 * uAirless, dot(N, L));   // soft terminator (sharp without air)
        vec3 H = normalize(L + V);
        float gloss = (1.0 - uLava) * (1.0 - 0.6 * uFrozen);           // lava is matte, ice duller than water
        float spec = water * (1.0 - ice) * gloss * pow(max(dot(N, H), 0.0), 70.0) * 0.9 * wrap;
        vec3 lit = col * (0.025 + diff * wrap * 1.15 + pointLightAt(vWorldPos, Nb)) + vec3(1.0, 0.95, 0.85) * spec;
        // atmospheric haze toward the limb, on the day side
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        lit += uAtmoColor * rim * uAtmo * 0.8 * smoothstep(-0.2, 0.4, dot(N, L));
        gl_FragColor = vec4(lit + emit, 1.0);
      }`,
  });
}

function planetCloudMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true, depthWrite: false,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: PLANET_GLSL + `
      uniform vec3 uSunDir;
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float c = cloudAt(p);
        vec3 N = normalize(vNormalW);
        float diff = smoothstep(-0.1, 0.35, dot(N, normalize(uSunDir)));
        vec3 tint = mix(vec3(0.97), vec3(0.34, 0.30, 0.28), uLava);    // ash clouds over a volcanic world
        float alpha = c * 0.92;
        if (uOvercast > 0.001) {
          // a closed deck: cream to ochre bands, brighter and darker streaks,
          // opaque, darkening toward the limb (seen through more haze)
          float h = hazeAt(p);
          vec3 deck = mix(vec3(0.96, 0.93, 0.87), vec3(0.82, 0.66, 0.45), uHaze * smoothstep(0.3, 0.8, h));
          deck *= 1.0 + uBands * (h - 0.5) * 0.4;   // gentle: the deck is soft
          float mu = max(dot(N, normalize(cameraPosition - vWorldPos)), 0.0);
          deck *= mix(1.0, 0.5 + 0.5 * pow(mu, 0.45), uOvercast);
          tint = mix(tint, deck, uOvercast);
          alpha = mix(alpha, 1.0, uOvercast);
          diff = mix(diff, smoothstep(-0.2, 0.5, dot(N, normalize(uSunDir))), uOvercast);   // light scatters past the terminator
        }
        gl_FragColor = vec4(tint * (0.04 + diff * 1.05), alpha);
      }`,
  });
}

function atmosphereMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: `
      uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uAtmoColor;
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorldPos);
        float edge = pow(clamp(1.0 + dot(N, V) * 1.15, 0.0, 1.0), 3.0);   // back faces: glow ring
        float day = smoothstep(-0.35, 0.5, dot(-N, normalize(uSunDir)));
        float a = edge * day * uAtmo * 1.6;
        gl_FragColor = vec4(uAtmoColor * a, 1.0);
      }`,
  });
}

// Coverage probe: renders the classification into a small equirect
// target (r = sea, g = ice, b = clouds) with the SAME GLSL functions.
function planetProbeMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: PLANET_GLSL + `
      varying vec2 vUv;
      void main(){
        float lon = (vUv.x - 0.5) * 6.28318530718, lat = (vUv.y - 0.5) * 3.14159265359;
        vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
        float h = heightAt(p);
        float frozenSea = seaAt(h) * uFrozen * (1.0 - uLava);
        gl_FragColor = vec4(seaAt(h), step(0.5, max(iceAt(p, h), frozenSea)), step(0.5, cloudAt(p)), 1.0);
      }`,
  });
}

// The planet's uniforms and how its values set them — shared by the planet
// itself (buildPlanet) and its terrain seen from the ground (planetTerrain).
function planetUniforms(v) {
  return Object.assign(bodyUniforms(v), {
    uFreq: { value: 0 }, uSea: { value: 0 }, uRough: { value: 0 }, uIce: { value: 0 }, uClimate: { value: 0 },
    uClouds: { value: 0 }, uCloudDrift: { value: 0 }, uMountain: { value: 0 }, uAtmo: { value: 0 },
    uAtmoColor: { value: new THREE.Color() }, uLava: { value: 0 }, uFrozen: { value: 0 },
    uAirless: { value: 0 }, uRays: { value: 0 }, uCraters: { value: 0 }, uRust: { value: 0 }, uMaria: { value: 0 }, uOvercast: { value: 0 }, uBands: { value: 0 }, uHaze: { value: 0 },
  });
}
function applyPlanet(U, v) {
  U.uFreq.value = v.continents; U.uSea.value = v.sea; U.uRough.value = v.roughness;
  U.uIce.value = v.ice; U.uClimate.value = v.climate; U.uClouds.value = v.clouds;
  U.uCloudDrift.value = v.cloudDrift; U.uMountain.value = v.mountains;
  U.uAtmo.value = v.atmosphere; U.uAtmoColor.value.copy(hueColor(v.atmoHue));
  U.uLava.value = v.lava; U.uFrozen.value = v.frozen;
  U.uAirless.value = v.airless; U.uRays.value = v.rays; U.uCraters.value = v.craters; U.uRust.value = v.rust; U.uMaria.value = v.maria;
  U.uOvercast.value = v.overcast; U.uBands.value = v.bands; U.uHaze.value = v.haze;
}

function buildPlanet(values, detail) {
  const v = { ...PLANET_DEFAULTS, ...values };   // a group shows only some sliders
  const U = planetUniforms(v);
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group();      // tilt goes here…
  const spin = new THREE.Group();       // …rotation about +Y here
  group.add(spin);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, seg(192, 16), seg(96, 8)), planetSurfaceMaterial(U));
  spin.add(surface);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.018, seg(128, 12), seg(64, 6)), planetCloudMaterial(U));
  spin.add(clouds);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, seg(96, 12), seg(48, 6)), atmosphereMaterial(U));
  group.add(atmo);                     // atmosphere doesn't need to spin
  // Only the surface is clickable: the larger cloud/atmosphere shells
  // would otherwise intercept raycasts meant for the planet.
  clouds.raycast = atmo.raycast = () => {};

  const probeScene = new THREE.Scene(), probeCam = new THREE.Camera();
  const probeMat = planetProbeMaterial(U);
  probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probeMat));
  const PW = 256, PH = 128;
  const probeRT = new THREE.WebGLRenderTarget(PW, PH, { depthBuffer: false });
  const probePx = new Uint8Array(PW * PH * 4);

  // Area-weighted coverage (cos(latitude)), read back from the GPU.
  function measure(renderer) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(probeRT);
    renderer.render(probeScene, probeCam);
    renderer.readRenderTargetPixels(probeRT, 0, 0, PW, PH, probePx);
    renderer.setRenderTarget(prev);
    let wSum = 0, water = 0, ice = 0, cloud = 0;
    for (let y = 0; y < PH; y++) {
      const w = Math.cos(((y + 0.5) / PH - 0.5) * Math.PI);
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        wSum += w;
        if (probePx[i] > 127) water += w;
        if (probePx[i + 1] > 127) ice += w;
        if (probePx[i + 2] > 127) cloud += w;
      }
    }
    // the probe's "sea" is molten on a volcanic world, ice on a frozen one
    const sea = water / wSum;
    const molten = v.lava >= 0.5, frozen = !molten && v.frozen >= 0.5;
    return { water: molten || frozen ? 0 : sea, lava: molten ? sea : 0, land: 1 - sea, ice: ice / wSum, clouds: cloud / wSum };
  }
  const pctRow = (label, x) => [label, (x * 100).toFixed(1) + "%"];

  return makeBodyHandle({
    v, U, group, spin, pickMesh: surface,
    apply() {
      applyPlanet(U, v);
    },
    layers: {
      clouds: { objects: [clouds], when: () => v.clouds > 0.001 },
      atmosphere: { objects: [atmo], when: () => v.atmosphere > 0.001 },
    },
    measure,
    describe(renderer) {
      const m = measure(renderer);
      const rows = [pctRow("Land", m.land), pctRow("Water", m.water)];
      if (m.lava > 0) rows.push(pctRow("Lava", m.lava));
      rows.push(pctRow("Ice & snow", m.ice), pctRow("Cloud cover", m.clouds));
      return rows;
    },
    dispose() { probeRT.dispose(); probeMat.dispose(); probeScene.children[0].geometry.dispose(); },
  });
}

// =====================================================================
// GAS GIANTS
// No surface: belts (dark) and zones (light) along the latitude lines,
// each band drifting at its own speed, a marbled flow (noise warped by
// noise) bending the band edges into curls, thin sub-bands and veins, a
// great storm (an oval vortex) with a turbulent wake behind it and a rusty
// streak ahead, white ovals, mottled polar haze, limb darkening and a soft
// sheen (polished stone, the user's look). Shares the atmosphere shell.
// =====================================================================
const GLSL_GIANT = `
uniform float uBandCount, uTurb, uContrast, uWarm, uStorm, uStormLat, uOvals, uPolar, uWind, uSheen;
uniform float uRings, uOblate, uHexagon, uPolarBlue, uGold, uIceTint, uIceHue, uRingStyle, uNoBody;
// a pure hue (0..1) as RGB, for the ice giants' palette
vec3 hueRGB(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 iceZone(){ return mix(vec3(0.84), hueRGB(uIceHue / 360.0), 0.42) * 0.95; }
vec3 iceBelt(){ return mix(vec3(0.55), hueRGB(uIceHue / 360.0), 0.62) * 0.78; }
uniform vec3 uSunObj;   // the light direction in the spinning body's own frame (rings, shadows)
// The rings, by radius in body radii (Saturn's): C 1.24-1.53 faint, B
// 1.53-1.95 the densest, the Cassini division, A 2.03-2.27 with the Encke
// gap, the thin F ring; fine ringlets everywhere. 0..1
float narrowRings(float r){
  // Uranus's rings in planet radii: 6, 5, 4, alpha, beta, eta, gamma, delta, epsilon (the widest)
  float n = 0.0;
  n += exp(-pow((r - 1.64) / 0.003, 2.0)) * 0.55 + exp(-pow((r - 1.66) / 0.003, 2.0)) * 0.5 + exp(-pow((r - 1.68) / 0.003, 2.0)) * 0.55;
  n += exp(-pow((r - 1.75) / 0.004, 2.0)) * 0.7 + exp(-pow((r - 1.79) / 0.004, 2.0)) * 0.7 + exp(-pow((r - 1.84) / 0.003, 2.0)) * 0.45;
  n += exp(-pow((r - 1.86) / 0.003, 2.0)) * 0.7 + exp(-pow((r - 1.91) / 0.004, 2.0)) * 0.75 + exp(-pow((r - 2.0) / 0.012, 2.0)) * 0.95;
  n += smoothstep(1.55, 1.6, r) * (1.0 - smoothstep(2.05, 2.1, r)) * 0.03;          // faint dust between
  return clamp(n, 0.0, 1.0);
}
float ringDensity(float r){
  if (uRingStyle > 2.5)                                                          // debris of a broken moon (clumps: ringClumps)
    return smoothstep(1.45, 1.6, r) * (1.0 - smoothstep(1.95, 2.15, r)) * (0.55 + 0.25 * snoise(vec3(r * 30.0, 3.5, 0.5)));
  if (uRingStyle > 1.5)                                                          // a faint, wide dust ring
    return smoothstep(1.22, 1.7, r) * (1.0 - smoothstep(1.9, 2.36, r)) * (0.38 + 0.1 * snoise(vec3(r * 25.0, 1.5, 0.5)));
  if (uRingStyle > 0.5) return narrowRings(r);
  if (r < 1.22 || r > 2.36) return 0.0;
  float c = smoothstep(1.22, 1.26, r) * (1.0 - smoothstep(1.51, 1.53, r)) * 0.3;
  float b = smoothstep(1.52, 1.56, r) * (1.0 - smoothstep(1.93, 1.95, r)) * (0.82 + 0.18 * smoothstep(1.6, 1.8, r));
  float cassini = smoothstep(1.95, 1.96, r) * (1.0 - smoothstep(2.02, 2.03, r)) * 0.06;
  float a = smoothstep(2.02, 2.04, r) * (1.0 - smoothstep(2.25, 2.27, r)) * 0.62 * (1.0 - exp(-pow((r - 2.214) / 0.004, 2.0)));
  float f = exp(-pow((r - 2.326) / 0.004, 2.0)) * 0.55;
  float ringlets = 0.72 + 0.28 * (snoise(vec3(r * 260.0, 0.5, 0.5)) * 0.5 + 0.5) + 0.12 * snoise(vec3(r * 900.0, 1.5, 0.5));
  return clamp((c + b + cassini + a) * ringlets + f, 0.0, 1.0);
}
vec3 ringColor(float r){
  if (uRingStyle > 2.5) return vec3(0.52, 0.49, 0.46);                                     // rock and ice rubble
  if (uRingStyle > 1.5) return vec3(0.78, 0.60, 0.46);                                     // reddish dust
  if (uRingStyle > 0.5) return vec3(0.24, 0.24, 0.26);                                     // dark, carbon-rich narrow rings
  vec3 col = mix(vec3(0.55, 0.50, 0.45), vec3(0.93, 0.87, 0.77), smoothstep(1.5, 1.6, r));   // C dusky, B creamy
  col = mix(col, vec3(0.80, 0.78, 0.74), smoothstep(2.0, 2.05, r));                           // A greyer
  return col * (0.92 + 0.16 * snoise(vec3(r * 140.0, 2.5, 0.5)));
}
// the rings' shadow on a point of the body (spin frame, flattened): 1 = lit
float ringShadow(vec3 pp){
  if (uRings <= 0.001 || pp.y * uSunObj.y >= 0.0 || abs(uSunObj.y) < 1e-4) return 1.0;
  vec3 hit = pp + uSunObj * (-pp.y / uSunObj.y);
  return 1.0 - ringDensity(length(hit.xz)) * uRings * 0.85;
}
// the body's shadow on a point of the rings: 0 = in shadow
float bodyShadow(vec3 pp){
  if (uNoBody > 0.5) return 1.0;                     // a ring system on its own
  float k = 1.0 - uOblate;
  vec3 o = vec3(pp.x, pp.y / k, pp.z), d = normalize(vec3(uSunObj.x, uSunObj.y / k, uSunObj.z));
  float b = dot(o, d), c = dot(o, o) - 1.0, disc = b * b - c;
  return disc > 0.0 && -b + sqrt(disc) > 0.0 ? 0.06 : 1.0;
}
#define PI 3.14159265
#define TAU 6.28318531
// every band turns at its own speed (differential rotation)
vec3 bandDrift(vec3 p, float lat){
  float a = uTime * uWind * 0.03 * (0.5 + 0.9 * sin(lat * uBandCount * 0.5 + 1.3));
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}
// an oval vortex at (lat0, lon0), half-sizes in radians; 0 outside,
// 1 in the core; swirl = its spiralling texture
float vortex(vec3 q, float lat, float lat0, float lon0, float hw, float hh, out float swirl, out float dist){
  float lon = atan(q.z, q.x);
  float dl = mod(lon - lon0 + PI, TAU) - PI;
  vec2 e = vec2(dl * cos(lat0) / hw, (lat - lat0) / hh);
  dist = length(e);
  float ang = atan(e.y, e.x) + (1.0 - min(dist, 1.0)) * 3.0 - uTime * 0.25;
  swirl = snoise(vec3(cos(ang) * dist * 1.6, sin(ang) * dist * 1.6, lat0 * 7.0) + uSeed) * 0.5 + 0.5;
  return 1.0 - smoothstep(0.9, 1.0, dist);
}
vec3 giantColor(vec3 p){
  float lat = asin(clamp(p.y, -1.0, 1.0));
  vec3 q = bandDrift(p, lat);
  // marbled flow: the noise is warped by noise (twice), so the bands bend
  // into smooth curls and filaments instead of torn edges
  vec3 a = vec3(q.x * 1.8, q.y * 5.0, q.z * 1.8) + uSeed;
  vec3 w1 = vec3(fbm(a, 4, 0.5), fbm(a + 5.2, 4, 0.5), fbm(a + 9.7, 4, 0.5));
  float flow = fbm(a * 1.6 + w1 * 2.2 + uSeed.yzx, uOctaves, 0.5);
  float y = lat + flow * 0.12 * uTurb;
  // uneven band widths, narrower toward the poles
  float yb = y + 0.07 * sin(y * 2.3 + uSeed.x) + 0.04 * sin(y * 5.7 + uSeed.y);
  float freq = uBandCount * (1.0 + 0.5 * abs(y));
  float band = sin(yb * freq);                                         // + zones, - belts
  yb += flow * 0.06 * uTurb * (1.0 - abs(band));                       // band edges: the most turbulence

  // the great storm and its wake: west of it a long chaotic region of
  // folded white curls, east of it a rusty streak along the band
  float lat0 = radians(uStormLat);
  vec3 qs = bandDrift(p, lat0);
  float lonS = mod(atan(qs.z, qs.x) - 1.57 + PI, TAU) - PI;            // longitude from the storm
  float inBand = exp(-pow((lat - lat0) / (0.09 * max(uStorm, 0.2)), 2.0));
  float wake = uStorm > 0.001 ? inBand * smoothstep(0.1, 0.3, lonS) * exp(-lonS * 0.6) : 0.0;
  float streak = uStorm > 0.001 ? exp(-pow((lat - lat0 - 0.01) / (0.045 * uStorm), 2.0)) * smoothstep(0.2, 0.45, -lonS) * exp(lonS * 0.7) : 0.0;
  vec3 c = vec3(qs.x * 3.2, qs.y * 6.0, qs.z * 3.2) + w1 * 1.5 + uSeed.zxy;   // big folds, stretched along the band
  float curls = fbm(c + vec3(fbm(c * 1.2, 3, 0.5) * 3.0), 4, 0.5);
  yb += (curls * 0.16 + flow * 0.08) * wake;
  band = sin(yb * freq);

  float fine = fbm(vec3(0.0, yb * 55.0, 0.0) + uSeed.zxy, 4, 0.6);     // thin sub-bands
  vec3 zone = mix(vec3(0.86, 0.85, 0.80), vec3(0.90, 0.80, 0.60), uGold);   // white or golden zones
  vec3 belt = mix(mix(vec3(0.62, 0.58, 0.53), vec3(0.78, 0.60, 0.45), uWarm), vec3(0.80, 0.66, 0.46), uGold * 0.6);
  zone = mix(zone, iceZone(), uIceTint);              // ice giants: cyan to deep blue (methane)
  belt = mix(belt, mix(iceZone(), iceBelt(), 0.15 + 0.85 * uContrast), uIceTint);   // a calm ice giant is nearly featureless
  float k = smoothstep(-0.7, 0.7, band * (0.3 + 0.7 * uContrast) + fine * 0.4);
  vec3 col = mix(belt, zone, k);
  col *= 1.0 + fine * 0.1;
  // some belts redder, some zones a little blue-white, the equator ochre
  float tint = snoise(vec3(0.0, floor(yb * freq / PI) * 1.7, 0.0) + uSeed) * 0.5 + 0.5;
  col = mix(col, col * vec3(1.05, 0.86, 0.72), smoothstep(0.45, 0.85, tint) * uWarm * (1.0 - k));
  col = mix(col, col * vec3(0.95, 0.98, 1.04), smoothstep(0.4, 0.9, 1.0 - tint) * k * 0.6);
  col = mix(col, col * vec3(1.03, 0.95, 0.84), (1.0 - smoothstep(0.0, 0.12, abs(lat))) * uWarm * 0.5);
  // marble veins: thin bright lines along the flow, like polished stone
  float vein = pow(1.0 - abs(sin(yb * freq * 3.0 + flow * 9.0)), 10.0);
  col += vein * 0.05 * uTurb;
  // the wake's curls are white folded cloud; the streak rusty
  // (fbm is centred on 0, about -0.6..0.6)
  col = mix(col, vec3(0.90, 0.89, 0.86), smoothstep(0.05, 0.3, curls) * wake * 0.9);
  col = mix(col, col * vec3(0.90, 0.76, 0.64), smoothstep(0.05, 0.3, -curls) * wake * 0.6);
  col = mix(col, vec3(0.74, 0.44, 0.32), streak * 0.6 * uWarm);
  // poles: muted grey-ochre (or blue), mottled
  float pol = smoothstep(0.62, 0.95, abs(p.y)) * uPolar;
  vec3 polCol = mix(mix(vec3(0.72, 0.68, 0.60), vec3(0.56, 0.66, 0.80), uPolarBlue), iceZone() * 1.12, uIceTint);   // an ice giant's pale polar cap
  col = mix(col, polCol * (0.85 + 0.3 * flow), pol);
  // the north polar hexagon: a six-sided jet stream around a blue vortex
  if (uHexagon > 0.001 && p.y > 0.7) {
    vec3 qh = bandDrift(p, 1.35);
    float phi = atan(qh.z, qh.x) + uSeed.x;
    float colat = acos(clamp(p.y, -1.0, 1.0));
    float segA = PI / 3.0;
    float rHex = 0.28 / cos(mod(phi, segA) - segA * 0.5);              // a hexagon in polar coordinates
    float inside = 1.0 - smoothstep(rHex - 0.025, rHex + 0.01, colat);
    float jet = exp(-pow((colat - rHex) / 0.014, 2.0));
    float swirlH = fbm(vec3(qh.x * 9.0, qh.y * 3.0, qh.z * 9.0) + uSeed + vec3(colat * 6.0), 4, 0.5);
    vec3 blue = mix(vec3(0.18, 0.30, 0.52), vec3(0.40, 0.54, 0.72), swirlH * 0.5 + 0.5 + 0.25 * sin(colat * 60.0));
    blue = mix(blue, vec3(0.75, 0.85, 0.95), exp(-pow(colat / 0.025, 2.0)) * 0.8);                // the eye
    col = mix(col, blue, inside * uHexagon);
    col = mix(col, vec3(0.86, 0.90, 0.94), jet * 0.55 * uHexagon);
    col = mix(col, col * vec3(0.85, 0.92, 1.05), exp(-pow((colat - rHex - 0.1) / 0.06, 2.0)) * 0.6 * uHexagon);   // a bluish collar
  }
  // the great storm: an orange core, a darker rim, a pale collar
  if (uStorm > 0.001) {
    float sw, d;
    float core = vortex(qs, lat, lat0, 1.57, 0.13 * uStorm, 0.08 * uStorm, sw, d);
    vec3 red = mix(vec3(0.86, 0.52, 0.24), vec3(0.70, 0.32, 0.15), (1.0 - smoothstep(0.0, 0.6, d)) * 0.7 + (sw - 0.5) * 0.4);   // darker centre, spiral
    red = mix(red, mix(vec3(0.10, 0.15, 0.36), vec3(0.06, 0.09, 0.24), 1.0 - d), uIceTint);   // an ice giant's storm is a dark spot
    red = mix(red, vec3(0.62, 0.28, 0.14), smoothstep(0.78, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d)) * 0.8);   // the rim
    float collar = smoothstep(0.97, 1.08, d) * (1.0 - smoothstep(1.08, 1.55, d));   // pale ring just outside
    col = mix(col, red, core);
    col = mix(col, vec3(0.94, 0.92, 0.87), collar * 0.45);
  }
  // white ovals, strung along the southern temperate belt
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= uOvals * 6.0) break;
    vec3 hk = hash33(vec3(fi * 5.3, uSeed.x, 3.7));
    float latO = radians(-33.0 - 6.0 * hk.y);
    float sw, d;
    float core = vortex(bandDrift(p, latO), lat, latO, hk.x * TAU, 0.05 + 0.03 * hk.z, 0.03 + 0.015 * hk.z, sw, d);
    col = mix(col, vec3(0.98, 0.97, 0.95) * (0.92 + 0.12 * sw), core * 0.9);
  }
  return col;
}
`;

function giantMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_GIANT + `
      uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uAtmoColor;
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        vec3 col = giantColor(p);
        col *= ringShadow(vec3(p.x, p.y * (1.0 - uOblate), p.z));
        float crack = crackAt(p);
        col *= 1.0 - crack * 0.6;
        vec3 N = normalize(vNormalW), L = normalize(uSunDir), V = normalize(cameraPosition - vWorldPos);
        float diff = smoothstep(-0.12, 0.6, dot(N, L));                 // deep atmosphere: soft terminator
        float mu = max(dot(N, V), 0.0);
        vec3 lit = col * (0.02 + diff * 1.1 + pointLightAt(vWorldPos, N)) * (0.6 + 0.4 * pow(mu, 0.35));   // limb darkening
        vec3 H = normalize(L + V);
        lit += vec3(1.0, 0.97, 0.92) * pow(max(dot(N, H), 0.0), 18.0) * uSheen * 0.35 * smoothstep(0.0, 0.3, dot(N, L));   // polish
        float rim = pow(1.0 - mu, 3.0);
        lit += uAtmoColor * rim * uAtmo * 0.6 * smoothstep(-0.2, 0.4, dot(N, L));
        gl_FragColor = vec4(lit + vec3(1.0, 0.45, 0.12) * crack * (0.7 + 0.9 * uDamage), 1.0);
      }`,
  });
}

// The rings: a flat annulus in the spin frame, its look from the radius
// (ringDensity / ringColor), lit by how high the light stands over the
// ring plane, dark where the body shadows it. Transparent, both sides.
function giantRingMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_GIANT + `
      varying vec3 vP;
      void main(){
        float r = length(vP.xz);
        float dens = ringDensity(r);
        vec3 tint = vec3(1.0);
        if (uRingStyle > 2.5) {
          // debris: clumps along the orbit, glinting chunks of ice
          float a = atan(vP.z, vP.x);
          float clump = fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, r * 5.0) + uSeed, 4, 0.5);
          dens *= smoothstep(-0.25, 0.25, clump) * 1.3;
          vec2 cell = floor(vec2(a * 140.0, r * 90.0));
          vec3 hc = hash33(vec3(cell, uSeed.x));
          float chunk = step(0.94, hc.x) * smoothstep(0.35, 0.0, length(fract(vec2(a * 140.0, r * 90.0)) - 0.5 - (hc.yz - 0.5) * 0.4));
          dens = max(dens, chunk * 0.9 * step(0.05, ringDensity(r)));   // chunks only inside the belt
          tint = mix(vec3(1.0), vec3(1.6, 1.65, 1.75), chunk * step(0.05, ringDensity(r)));
        }
        if (dens < 0.004) discard;
        float lit = 0.75 + 0.25 * smoothstep(0.0, 0.2, abs(uSunObj.y));     // ice scatters: bright even with the light low
        vec3 col = ringColor(r) * tint * lit * bodyShadow(vP) * 1.3;
        gl_FragColor = vec4(col, clamp(dens * uRings, 0.0, 1.0));
      }`,
  });
}

function buildGiant(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uBandCount: { value: 0 }, uTurb: { value: 0 }, uContrast: { value: 0 }, uWarm: { value: 0 }, uStorm: { value: 0 },
    uStormLat: { value: 0 }, uOvals: { value: 0 }, uPolar: { value: 0 }, uWind: { value: 0 }, uSheen: { value: 0 },
    uRings: { value: 0 }, uOblate: { value: 0 }, uHexagon: { value: 0 }, uPolarBlue: { value: 0 }, uGold: { value: 0 }, uIceTint: { value: 0 }, uIceHue: { value: 200 }, uRingStyle: { value: 0 }, uNoBody: { value: 0 }, uSunObj: { value: new THREE.Vector3(1, 0, 0) },
    uAtmo: { value: 0 }, uAtmoColor: { value: new THREE.Color() },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, seg(160, 16), seg(80, 8)), giantMaterial(U));
  spin.add(surface);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, seg(96, 12), seg(48, 6)), atmosphereMaterial(U));
  group.add(atmo);
  const ringGeo = new THREE.RingGeometry(1.2, 2.38, seg(512, 64), 1);   // fine: narrow rings are a few pixels wide
  ringGeo.rotateX(-Math.PI / 2);                     // into the equatorial (XZ) plane, baked
  const rings = new THREE.Mesh(ringGeo, giantRingMaterial(U));
  spin.add(rings);
  atmo.raycast = rings.raycast = () => {};
  const qInv = new THREE.Quaternion();
  return makeBodyHandle({
    v, U, group, spin, pickMesh: surface,
    apply() {
      U.uBandCount.value = v.bandCount; U.uTurb.value = v.turbulence; U.uContrast.value = v.contrast; U.uWarm.value = v.warm;
      U.uStorm.value = v.storm; U.uStormLat.value = v.stormLat; U.uOvals.value = v.ovals; U.uPolar.value = v.polar;
      U.uWind.value = v.wind; U.uSheen.value = v.sheen; U.uAtmo.value = v.atmosphere; U.uAtmoColor.value.copy(hueColor(v.atmoHue));
      U.uRings.value = v.rings; U.uOblate.value = v.oblate; U.uHexagon.value = v.hexagon; U.uPolarBlue.value = v.polarBlue; U.uGold.value = v.gold;
      U.uIceTint.value = v.iceTint; U.uIceHue.value = v.iceHue; U.uRingStyle.value = v.ringStyle;
      surface.scale.set(1, 1 - v.oblate, 1);         // flattened at the poles
    },
    // the light in the spin frame, for the rings and their shadows
    onUpdate() { U.uSunObj.value.copy(U.uSunDir.value).applyQuaternion(spin.getWorldQuaternion(qInv).invert()).normalize(); },
    layers: {
      atmosphere: { objects: [atmo], when: () => v.atmosphere > 0.001 },
      clouds: { objects: [rings], when: () => v.rings > 0.001 },       // the lab's second layer button: RINGS
    },
    describe() {
      const pairs = Math.round(v.bandCount / 2), km = (x) => Math.round(x * v.size * 69911).toLocaleString("en-US") + " km";
      const rows = [["Belts / zones", pairs + " / " + pairs], ["Great storm", v.storm > 0.001 ? Math.round(v.storm * 24000 * 1.4) + " km wide" : "none"]];
      if (v.rings > 0.001) rows.push(["Rings (outer edge)", km(2.33)]);
      if (v.oblate > 0.001) rows.push(["Flattening", Math.round(v.oblate * 1000) / 10 + "%"]);
      return rows;
    },
  });
}

// A ring system on its own (the RINGS group): the giants' ring material
// with no body in the middle, so no shadow from one.
function buildRingSystem(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uRings: { value: 0 }, uRingStyle: { value: 0 }, uNoBody: { value: 1 }, uOblate: { value: 0 },
    uSunObj: { value: new THREE.Vector3(1, 0, 0) },
  });
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const geo = new THREE.RingGeometry(1.2, 2.38, Math.max(64, Math.round(512 * detail)), 1);
  geo.rotateX(-Math.PI / 2);
  const rings = new THREE.Mesh(geo, giantRingMaterial(U));
  spin.add(rings);
  const qInv = new THREE.Quaternion();
  const STYLES = ["broad and icy", "narrow and dark", "faint dust", "debris of a broken moon"];
  return makeBodyHandle({
    v, U, group, spin, pickMesh: rings,
    apply() { U.uRings.value = v.rings; U.uRingStyle.value = v.ringStyle; },
    onUpdate() { U.uSunObj.value.copy(U.uSunDir.value).applyQuaternion(spin.getWorldQuaternion(qInv).invert()).normalize(); },
    describe() {
      const km = (x) => Math.round(x * v.size * 60268).toLocaleString("en-US") + " km";
      return [["Style", STYLES[Math.round(v.ringStyle)]], ["Inner edge", km(1.24)], ["Outer edge", km(2.33)]];
    },
  });
}

// =====================================================================
// PULSARS
// A neutron star: a tiny white-hot sphere with hot spots at its magnetic
// poles, two radiation beams along the magnetic axis — tilted from the
// spin axis, so they sweep around like a lighthouse — dipole field lines,
// a glow that flashes when a beam points at the camera. Self-lit.
// =====================================================================
const GLSL_PULSAR = `
uniform vec3 uStarColor, uBeamColor;
uniform float uFlash, uGlow, uBeamWidth, uField;
`;

function pulsarMaterials(U) {
  const star = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_PULSAR + `
      uniform vec3 uMagAxis;     // the magnetic axis in the star's own frame
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float pole = pow(abs(dot(p, uMagAxis)), 18.0);                         // hot spots at the magnetic poles
        float grain = snoise(p * 9.0 + uSeed + vec3(0.0, uTime * 0.6, 0.0)) * 0.5 + 0.5;
        vec3 col = uStarColor * (1.4 + 0.5 * grain) + vec3(0.9, 0.95, 1.0) * pole * 3.0;
        float mu = max(dot(normalize(vNormalW), normalize(cameraPosition - vWorldPos)), 0.0);
        col *= 0.75 + 0.25 * mu;
        col *= 1.0 + uFlash * 3.0;
        float crack = crackAt(p);
        gl_FragColor = vec4(col + vec3(1.0, 0.45, 0.12) * crack * (0.7 + 0.9 * uDamage), 1.0);
      }`,
  });
  // a beam: an open cone along +Y from the star; brightest along its axis
  // and near the star, flickering
  const beam = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uBeamLen;
      varying float vT; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vLocal;
      void main(){
        vT = position.y / uBeamLen; vLocal = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_PULSAR + `
      varying float vT; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vLocal;
      void main(){
        float facing = abs(dot(normalize(vNormalW), normalize(cameraPosition - vWorldPos)));
        float core = pow(facing, 2.5);                                       // seen through its middle
        float along = pow(1.0 - clamp(vT, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vT);
        float flick = 0.75 + 0.25 * snoise(vec3(vT * 9.0 - uTime * 6.0, atan(vLocal.z, vLocal.x) * 2.0, uSeed.x));
        float a = core * along * flick * (1.3 + uFlash * 1.5);
        gl_FragColor = vec4(uBeamColor * a, 1.0);
      }`,
  });
  // field lines: thin additive lines, shimmering
  const field = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aT;
      varying float vT;
      void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_PULSAR + `
      uniform float uTime;
      varying float vT;
      void main(){
        float run = 0.5 + 0.5 * sin(vT * 40.0 - uTime * 3.0);                  // charges running along the line
        gl_FragColor = vec4(uBeamColor * uField * (0.12 + 0.18 * run) * sin(vT * 3.14159), 1.0);
      }`,
  });
  return { star, beam, field };
}

// dipole field lines r = L sin^2(theta) around the magnetic axis (+Y)
function pulsarFieldGeometry() {
  const pos = [], ts = [];
  for (const L of [2.2, 3.4, 5.0]) for (let k = 0; k < 6; k++) {
    const phi = k / 6 * Math.PI * 2 + L;
    const th0 = Math.asin(Math.sqrt(1.05 / L));         // where the line leaves the star (r = 1.05)
    let prev = null;
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const th = th0 + (Math.PI - 2 * th0) * i / N, r = L * Math.sin(th) ** 2;
      const pt = [r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi)];
      if (prev) { pos.push(...prev[0], ...pt); ts.push(prev[1], i / N); }
      prev = [pt, i / N];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
  return g;
}

function buildPulsar(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uStarColor: { value: new THREE.Color() }, uBeamColor: { value: new THREE.Color() }, uFlash: { value: 0 }, uGlow: { value: 0 },
    uBeamWidth: { value: 0 }, uField: { value: 0 }, uBeamLen: { value: 1 }, uMagAxis: { value: new THREE.Vector3(0, 1, 0) },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const mats = pulsarMaterials(U);
  const group = new THREE.Group(), spin = new THREE.Group(), magnet = new THREE.Group();
  group.add(spin); spin.add(magnet);
  const star = new THREE.Mesh(new THREE.SphereGeometry(1, seg(64, 12), seg(32, 8)), mats.star);
  spin.add(star);
  let beams = [];
  function makeBeams() {
    beams.forEach((b) => { magnet.remove(b); b.geometry.dispose(); });
    beams = [1, -1].map((dir) => {
      const g = new THREE.CylinderGeometry(v.beamWidth * v.beamLength, 0.15, v.beamLength, seg(32, 12), 1, true);
      g.translate(0, v.beamLength / 2 + 0.9, 0);
      const m = new THREE.Mesh(g, mats.beam);
      if (dir < 0) m.rotation.x = Math.PI;
      m.raycast = () => {};
      magnet.add(m);
      return m;
    });
  }
  const field = new THREE.LineSegments(pulsarFieldGeometry(), mats.field);
  field.raycast = () => {};
  magnet.add(field);
  // the glow around the star: a billboard, flashing with the beams
  const glow = makeBillboard(U, 9, `
    uniform vec3 uBeamColor; uniform float uFlash, uGlow;
    void main(){
      float r = length(vQ);
      float g = exp(-r * 1.3) * 0.9 + exp(-r * 0.35) * 0.18;
      float rays = pow(max(0.0, 1.0 - abs(vQ.y) * 0.6), 6.0) * exp(-abs(vQ.x) * 0.25) + pow(max(0.0, 1.0 - abs(vQ.x) * 0.6), 6.0) * exp(-abs(vQ.y) * 0.25);
      gl_FragColor = vec4(uBeamColor * (g + rays * 0.15 * uFlash) * uGlow * (1.1 + uFlash * 2.5), 1.0);
    }`);
  group.add(glow);

  const tmp = new THREE.Vector3(), axis = new THREE.Vector3(), here = new THREE.Vector3();
  let turn = 0;
  return makeBodyHandle({
    v, U, group, spin, pickMesh: star,
    apply() {
      blackbody(v.temperature, U.uStarColor.value);
      U.uBeamColor.value.setHSL(v.beamHue / 360, 0.65, 0.66);
      U.uGlow.value = v.glow; U.uBeamWidth.value = v.beamWidth; U.uField.value = v.field; U.uBeamLen.value = v.beamLength;
      magnet.rotation.z = THREE.MathUtils.degToRad(v.magTilt);
      U.uMagAxis.value.set(-Math.sin(magnet.rotation.z), Math.cos(magnet.rotation.z), 0);
      makeBeams();
    },
    // the lighthouse: the magnet turns with the star at `rate`; the glow
    // flashes as a beam sweeps past the camera (opts.center = its position)
    onUpdate(t, dt, opts) {
      turn += dt * v.rate * Math.PI * 2;
      magnet.rotation.y = turn;
      if (opts.center) {
        axis.set(0, 1, 0).applyQuaternion(magnet.getWorldQuaternion(new THREE.Quaternion())).normalize();
        tmp.copy(opts.center).sub(group.getWorldPosition(here)).normalize();
        const align = Math.abs(axis.dot(tmp));
        U.uFlash.value = Math.pow(align, 60 / Math.max(0.05, v.beamWidth * 4));
      } else U.uFlash.value = 0;
    },
    layers: {
      atmosphere: { objects: [glow, field], when: () => true },          // the lab's layer button: GLOW & FIELD
    },
    dispose() { beams.forEach((b) => b.geometry.dispose()); },
    describe() {
      return [["Spin period (real)", v.periodMs + " ms"], ["Shown slowed to", v.rate.toFixed(2) + " turns/s"],
        ["Surface", Math.round(v.temperature / 1000) * 1000 + " K"], ["Magnetic tilt", Math.round(v.magTilt) + "°"]];
    },
  });
}

// =====================================================================
// PLANET TERRAIN — the ground under a landing site (the surface lab,
// SurfaceKit). The planet's own GLSL, sampled up close:
//   sample(renderer, face, uv0, step, n) renders an n×n grid of points on a
//   cube-sphere face (axis/u/v from SurfaceKit, equal-angle mapping) into a
//   small target and reads it back: the planet's height h (heightOct with
//   more octaves than the globe) + fine detail, and sea / ice flags — the
//   same functions the globe and the coverage probe use.
//   material(opts) colours the ground with planetSurface(), lit by uSunDir,
//   with distance haze in the atmosphere's colour.
// Gas giants, suns etc. have no ground: planetTerrain() is for the planet
// groups (buildPlanet) only.
// =====================================================================
const TERRAIN_OCTAVES = 11;
function planetTerrain(groupId, bodyId, values) {
  const group = GROUPS.find((g) => g.id === groupId);
  const def = group && group.bodies.find((b) => b.id === bodyId);
  if (!def || group.build !== buildPlanet) return null;
  const v = { ...PLANET_DEFAULTS, ...defaultValues(group, def), ...(values || {}) };
  const U = planetUniforms(v);
  applyPlanet(U, v);
  seedVec(v.seed, U.uSeed.value);
  U.uDamage.value = 0;
  U.uOctaves.value = TERRAIN_OCTAVES;
  Object.assign(U, {
    uFaceAxis: { value: new THREE.Vector3() }, uFaceU: { value: new THREE.Vector3() }, uFaceV: { value: new THREE.Vector3() },
    uUV0: { value: new THREE.Vector2() }, uUVStep: { value: 0 }, uDetailFreq: { value: 1 },
  });
  const sampleMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: PLANET_GLSL + `
      uniform vec3 uFaceAxis, uFaceU, uFaceV; uniform vec2 uUV0; uniform float uUVStep, uDetailFreq;
      void main(){
        vec2 uv = uUV0 + floor(gl_FragCoord.xy) * uUVStep;
        vec3 d = normalize(uFaceAxis + tan(uv.x * 0.78539816) * uFaceU + tan(uv.y * 0.78539816) * uFaceV);
        float h = heightAt(d);
        float det = fbm(d * uDetailFreq + uSeed.zxy, 5, 0.55);              // metre-scale roughness
        float hn = clamp((h + 2.0) / 4.0, 0.0, 1.0) * 65535.0;
        float hi = floor(hn / 256.0);
        gl_FragColor = vec4(hi / 255.0, (hn - hi * 256.0) / 255.0, clamp(det * 0.5 + 0.5, 0.0, 1.0),
                            (step(0.5, seaAt(h)) + 2.0 * step(0.5, iceAt(d, h))) / 255.0);
      }`,
  });
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sampleMat));
  let rt = null, px = null;
  return {
    values: v, U,
    // → { h: Float32Array (the planet's height), d: detail -1..1, sea: Uint8Array, ice: Uint8Array }
    sample(renderer, face, uv0x, uv0y, step, n, detailFreq) {
      if (!rt || rt.width !== n) {
        if (rt) rt.dispose();
        rt = new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        px = new Uint8Array(n * n * 4);
      }
      U.uFaceAxis.value.copy(face.axis); U.uFaceU.value.copy(face.u); U.uFaceV.value.copy(face.v);
      U.uUV0.value.set(uv0x, uv0y); U.uUVStep.value = step; U.uDetailFreq.value = detailFreq;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, n, n, px);
      renderer.setRenderTarget(prev);
      const N = n * n, h = new Float32Array(N), d = new Float32Array(N), sea = new Uint8Array(N), ice = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        h[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 65535 * 4 - 2;
        d[i] = px[i * 4 + 2] / 255 * 2 - 1;
        sea[i] = px[i * 4 + 3] & 1; ice[i] = (px[i * 4 + 3] >> 1) & 1;
      }
      return { h, d, sea, ice };
    },
    // the ground's material: attributes aDir (unit direction), aH (the planet's
    // height there); opts.fog (haze per metre), opts.fogColor
    material(opts = {}) {
      const MU = Object.assign({}, U, {
        uSunDir: { value: new THREE.Vector3(1, 0.4, 0.3).normalize() },
        uFogColor: { value: new THREE.Color(opts.fogColor != null ? opts.fogColor : 0x000000) },
        uFog: { value: opts.fog || 0 },
        uGrainFreq: { value: opts.grainFreq || 400 },
      });
      return new THREE.ShaderMaterial({
        uniforms: MU,
        vertexShader: `
          attribute vec3 aDir; attribute float aH;
          varying vec3 vDir; varying float vH; varying vec3 vNormalW; varying vec3 vWorldPos;
          void main(){
            vDir = aDir; vH = aH;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: PLANET_GLSL + GLSL_PLANET_SURFACE + `
          uniform vec3 uSunDir; uniform vec3 uFogColor; uniform float uFog, uGrainFreq; uniform float uAtmo; uniform vec3 uAtmoColor;
          varying vec3 vDir; varying float vH; varying vec3 vNormalW; varying vec3 vWorldPos;
          void main(){
            vec3 p = normalize(vDir);
            vec3 col, emit; float water, ice;
            planetSurface(p, vH, col, emit, water, ice);
            // close up: grain and pebbles (the globe's colour is a whole region's)
            float g = snoise(p * uGrainFreq) * 0.5 + snoise(p * uGrainFreq * 3.7) * 0.25;
            col *= 1.0 + g * 0.12 * (1.0 - water);
            vec3 N = normalize(vNormalW), L = normalize(uSunDir), V = normalize(cameraPosition - vWorldPos);
            float diff = max(dot(N, L), 0.0);
            vec3 H = normalize(L + V);
            float spec = water * (1.0 - ice) * (1.0 - uLava) * pow(max(dot(N, H), 0.0), 60.0) * 0.8;
            vec3 lit = col * (0.05 + diff * 1.1 + uAtmo * 0.12 * uAtmoColor) + vec3(1.0, 0.95, 0.85) * spec + emit;
            float dist = length(cameraPosition - vWorldPos);
            lit = mix(lit, uFogColor, 1.0 - exp(-dist * uFog));               // haze in the air's colour
            gl_FragColor = vec4(lit, 1.0);
          }`,
      });
    },
    dispose() { if (rt) rt.dispose(); sampleMat.dispose(); scene.children[0].geometry.dispose(); },
  };
}

// =====================================================================
// SUNS
// A star's surface (granulation, sunspots, faculae, limb darkening, color
// from its temperature) and a corona billboard (glow, streamers,
// prominences). Self-lit: the light direction isn't used.
// =====================================================================
const GLSL_SUN = `
uniform vec3 uColor;
uniform float uGran, uSpots, uActivity, uBright, uCorona;
float sunTime(){ return uTime * (0.04 + uActivity * 0.2); }
`;

function sunSurfaceMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_SUN + `
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float tt = sunTime();
        // granulation: convection cells boiling slowly, plus supergranulation
        float g1 = 1.0 - abs(snoise(p * 34.0 + uSeed + vec3(0.0, tt, 0.0)));
        float g2 = snoise(p * 80.0 + uSeed.zyx - vec3(tt * 1.3));
        float gran = mix(1.0, 0.7 + 0.3 * g1 + 0.08 * g2, uGran);
        float large = fbm(p * 3.0 + uSeed + vec3(tt * 0.3), uOctaves, 0.5);
        // sunspots in two activity belts: dark umbra inside a penumbra
        float belt = smoothstep(0.05, 0.18, abs(p.y)) * (1.0 - smoothstep(0.42, 0.58, abs(p.y)));
        float sn = fbm(p * 4.5 + uSeed.yzx + vec3(tt * 0.08), 4, 0.5) * 0.5 + 0.5;
        float thr = 0.78 - uSpots * 0.2;
        float on = step(0.001, uSpots) * belt;
        float pen = smoothstep(thr, thr + 0.03, sn) * on;
        float umb = smoothstep(thr + 0.05, thr + 0.08, sn) * on;
        // limb darkening (and a redder limb): the disk's edge is cooler
        vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorldPos);
        float mu = clamp(dot(N, V), 0.0, 1.0);
        vec3 col = uColor * uBright * 1.3 * gran * (1.0 + large * 0.12);   // bright: the center goes white
        col *= 0.35 + 0.65 * pow(mu, 0.45);
        col = mix(col, col * vec3(1.0, 0.6, 0.3), pow(1.0 - mu, 1.5) * 0.8);   // cooler, orange limb
        col *= (1.0 - pen * 0.45) * (1.0 - umb * 0.75);
        // faculae: bright patches around the spots, seen near the limb
        float fac = smoothstep(thr - 0.08, thr, sn) * (1.0 - pen) * on * (1.0 - mu);
        col += uColor * fac * 0.5;
        // damage: dark, cooling fissures glowing white-hot inside
        float crack = crackAt(p);
        col = mix(col, col * 0.3, crack * 0.7) + vec3(1.0, 0.95, 0.85) * crack * uDamage * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

const SUN_CORONA_FRAGMENT = GLSL_SUN + `
  void main(){
    float r = length(vQ);
    float a = atan(vQ.y, vQ.x);
    float tt = sunTime();
    vec3 d = vec3(cos(a), sin(a), 0.0);
    // streamers: noise along the angle, drifting outward
    float s1 = snoise(d * 2.2 + vec3(0.0, 0.0, r * 0.5 - tt) + uSeed) * 0.5 + 0.5;
    float s2 = snoise(d * 7.0 + vec3(0.0, 0.0, r * 1.3 - tt * 1.7) + uSeed.zxy) * 0.5 + 0.5;
    float x = max(r - 1.0, 0.0);
    float inner = exp(-x * 9.0);                                          // bright rim above the surface
    float outer = uCorona * (0.45 + s1 * 0.8 + s2 * 0.35) * exp(-x / (0.25 + uCorona * 1.2));
    float halo = 0.3 * uCorona / (1.0 + x * x * 5.0);                    // wide soft glow
    // prominences: bright loops standing on the limb
    float pr = smoothstep(0.62, 0.9, snoise(vec3(d.xy * 5.0, tt * 0.4) + uSeed.yxz) * 0.5 + 0.5);
    float prom = pr * uActivity * exp(-x * 7.0) * smoothstep(0.98, 1.02, r) * (0.6 + s2 * 0.8);
    float fade = 1.0 - smoothstep(uHalfSize * 0.7, uHalfSize, r);        // no hard quad edge
    vec3 col = mix(uColor, vec3(1.0), 0.35) * (inner * 0.9 + outer * 0.8 + halo)
             + vec3(1.0, 0.45, 0.25) * prom * 1.4;
    gl_FragColor = vec4(col * uBright * fade, 1.0);
  }`;

const SPECTRAL = [[30000, "O"], [10000, "B"], [7500, "A"], [6000, "F"], [5200, "G"], [3700, "K"], [0, "M"]];

function buildSun(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uColor: { value: new THREE.Color() }, uGran: { value: 0 }, uSpots: { value: 0 },
    uActivity: { value: 0 }, uBright: { value: 1 }, uCorona: { value: 0 },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, seg(160, 16), seg(80, 8)), sunSurfaceMaterial(U));
  spin.add(surface);
  const corona = makeBillboard(U, 4, SUN_CORONA_FRAGMENT);
  group.add(corona);
  return makeBodyHandle({
    v, U, group, spin, pickMesh: surface,
    apply() {
      blackbody(v.temperature, U.uColor.value);
      U.uGran.value = v.granulation; U.uSpots.value = v.spots; U.uActivity.value = v.activity;
      U.uBright.value = v.brightness; U.uCorona.value = v.corona;
      corona.material.uniforms.uHalfSize.value = 1.3 + v.corona * 5;
    },
    layers: { atmosphere: { objects: [corona] } },
    describe() {
      const cls = SPECTRAL.find((s) => v.temperature >= s[0])[1];
      const lum = v.size * v.size * Math.pow(v.temperature / 5778, 4);
      return [["Temperature", Math.round(v.temperature).toLocaleString("en-US") + " K"],
              ["Spectral class", cls], ["Luminosity (Sun = 1)", lum < 10 ? lum.toFixed(2) : Math.round(lum).toLocaleString("en-US")]];
    },
  });
}

// =====================================================================
// ROCKS — meteoroids, asteroids, a comet's nucleus
// The shape is displaced on the GPU from the sphere (lumps + craters,
// elongated), normals from nearby displaced points; fine craters and grit
// in the fragment shader. Shared by the ROCKS and COMETS groups.
// =====================================================================
const GLSL_ROCK = `
uniform float uLump, uStretch, uCraters, uAlbedo, uRust, uIce, uMetal;
float rockHeight(vec3 p){
  float h = fbm(p * 1.1 + uSeed, 4, 0.5) * uLump * 0.5 + snoise(p * 3.1 + uSeed.yzx) * uLump * 0.08;
  return h + craterField(p, 2.0, uCraters) * 0.12 + craterField(p, 4.5, uCraters) * 0.05;
}
vec3 rockPoint(vec3 p){
  float s = inversesqrt(uStretch);
  return p * (1.0 + rockHeight(p)) * vec3(uStretch, s, s);
}
float rockDetail(vec3 p){ return craterField(p, 11.0, uCraters) * 0.5 + snoise(p * 24.0 + uSeed) * 0.15; }
`;
const ROCK_GLSL = GLSL_NOISE + GLSL_BODY + GLSL_ROCK;

function rockMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: ROCK_GLSL + `
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(position);
        vec3 t1 = normalize(cross(abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), p));
        vec3 t2 = cross(p, t1);
        vec3 P = rockPoint(p);
        const float e = 0.02;
        vec3 n = normalize(cross(rockPoint(normalize(p + t1 * e)) - P, rockPoint(normalize(p + t2 * e)) - P));
        vDir = p;
        vec4 wp = modelMatrix * vec4(P, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * n);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: ROCK_GLSL + `
      uniform vec3 uSunDir;
      uniform mat4 modelMatrix;    // declared for this stage, like the planet
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        // fine craters and grit as relief, sampled on the sphere
        vec3 t1 = normalize(cross(abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), p));
        vec3 t2 = cross(p, t1);
        const float e = 0.004;
        float d0 = rockDetail(p);
        vec3 g = ((rockDetail(normalize(p + t1 * e)) - d0) * t1 + (rockDetail(normalize(p + t2 * e)) - d0) * t2) / e;
        vec3 N = normalize(vNormalW);
        vec3 Nb = normalize(N - 0.02 * (mat3(modelMatrix) * g) / length(modelMatrix[0].xyz));

        // ---- colors: grey to rusty rock, darker crater floors, frost, metal veins
        float n1 = snoise(p * 5.0 + uSeed) * 0.5 + 0.5;
        vec3 base = mix(vec3(0.5), vec3(0.58, 0.38, 0.25), uRust) * uAlbedo * 2.2 * (0.75 + 0.5 * n1);
        base *= 1.0 + craterField(p, 4.5, uCraters) * 0.45;
        float frost = step(0.001, uIce) * smoothstep(0.6 - uIce * 0.6, 0.7 - uIce * 0.6, snoise(p * 3.0 + uSeed.zxy) * 0.5 + 0.5);
        base = mix(base, vec3(0.78, 0.84, 0.9), frost * 0.85);
        float vein = uMetal * smoothstep(0.972, 0.996, 1.0 - abs(snoise(p * 4.0 + uSeed.yxz)))
                   * smoothstep(0.35, 0.65, snoise(p * 1.5 + uSeed.zyx) * 0.5 + 0.5);   // only in some regions
        base = mix(base, vec3(0.62, 0.58, 0.52), vein * 0.8);

        // ---- lighting
        vec3 L = normalize(uSunDir), V = normalize(cameraPosition - vWorldPos), H = normalize(L + V);
        float diff = max(dot(Nb, L), 0.0);
        float spec = pow(max(dot(Nb, H), 0.0), 40.0) * (frost * 0.4 + vein * 1.5 + uMetal * 0.15) * step(0.0, dot(N, L));
        vec3 col = base * (0.02 + diff * 1.1 + pointLightAt(vWorldPos, Nb)) + vec3(1.0, 0.95, 0.85) * spec;
        float crack = crackAt(p);
        col = col * (1.0 - crack * 0.7) + vec3(1.0, 0.45, 0.12) * crack * (0.7 + 0.9 * uDamage);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// A rock's uniforms + mesh; the ROCKS group uses it as is, COMETS adds a
// coma and tails around it.
function rockParts(v, detail) {
  const U = Object.assign(bodyUniforms(v), {
    uLump: { value: 0 }, uStretch: { value: 1 }, uCraters: { value: 0 }, uAlbedo: { value: 0 },
    uRust: { value: 0 }, uIce: { value: 0 }, uMetal: { value: 0 },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, seg(128, 16), seg(64, 10)), rockMaterial(U));
  surface.frustumCulled = false;   // the displaced, stretched shape can stick out of the unit bounds
  spin.add(surface);
  const apply = () => {
    U.uLump.value = v.lumpiness; U.uStretch.value = v.elongation; U.uCraters.value = v.craters;
    U.uAlbedo.value = v.albedo; U.uRust.value = v.rust; U.uIce.value = v.ice; U.uMetal.value = v.metal;
  };
  const shape = () => {
    const s = 1 / Math.sqrt(v.elongation), km = (x) => (x * v.size * 2 * ROCK_KM).toFixed(1);
    return ["Shape (km)", `${km(v.elongation)} × ${km(s)} × ${km(s)}`];
  };
  return { U, group, spin, surface, apply, shape };
}
const ROCK_KM = 5;                  // lab size 1 = 5 km radius

function buildRock(values, detail) {
  const v = { ...values };
  const r = rockParts(v, detail);
  return makeBodyHandle({
    v, U: r.U, group: r.group, spin: r.spin, pickMesh: r.surface, apply: r.apply,
    describe: () => [r.shape(), ["Albedo", Math.round(v.albedo * 100) + "%"]],
  });
}

// =====================================================================
// COMETS — a rock nucleus with a glowing coma and two tails pointing away
// from the light: a straight blue ion tail and a wider, curved dust tail
// (bent back along -opts.velocity when given). opts.activity (default 1,
// the game: by distance from the Sun) scales the coma and the tails.
// =====================================================================
const GLSL_TAIL_VERTEX = `
uniform vec3 uTailDir, uBendDir;
uniform float uTailLen, uTailWidth, uBend, uActivity;
varying vec2 vT;                    // x: across -1..1, y: along the tail 0..1
void main(){
  vec3 C = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(modelMatrix[0].xyz);             // world units per radius
  float y = position.y, len = uTailLen * (0.35 + 0.65 * uActivity);
  vec3 P = C + (uTailDir * y + uBendDir * (uBend * y * y)) * len * s;
  vec3 tangent = normalize(uTailDir + uBendDir * (2.0 * uBend * y));
  vec3 side = normalize(cross(tangent, normalize(cameraPosition - P)));
  P += side * position.x * 2.0 * uTailWidth * s * (0.3 + y);     // widens away from the nucleus
  vT = vec2(position.x * 2.0, y);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const TAIL_FRAGMENT = `
  uniform vec3 uTailColor; uniform float uTailBright, uStriation, uActivity;
  varying vec2 vT;
  void main(){
    float core = exp(-vT.x * vT.x * 3.5);
    float fall = pow(1.0 - vT.y, 1.6) * smoothstep(0.0, 0.04, vT.y);
    float str = snoise(vec3(vT.x * 5.0, vT.y * 3.0 - uTime * 0.4, 0.0) + uSeed) * 0.5 + 0.5;
    float b = core * fall * mix(1.0, 0.45 + str, uStriation) * uTailBright * uActivity;
    gl_FragColor = vec4(uTailColor * b, 1.0);
  }`;
const COMA_FRAGMENT = `
  uniform float uComa, uActivity;
  void main(){
    float r = length(vQ);
    float g = uComa * uActivity * (exp(-r * 0.9) * 0.9 + 0.35 / (1.0 + r * r * 0.8));
    float fade = 1.0 - smoothstep(uHalfSize * 0.6, uHalfSize, r);
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * g * fade, 1.0);
  }`;

function makeTail(U, own) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 32);
  geo.translate(0, 0.5, 0);                        // y 0..1 along the tail
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...own },
    vertexShader: GLSL_TAIL_VERTEX, fragmentShader: GLSL_NOISE + GLSL_BODY + TAIL_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

function buildComet(values, detail) {
  const v = { ...values };
  const r = rockParts(v, detail);
  const U = Object.assign(r.U, {
    uComa: { value: 0 }, uActivity: { value: 1 },
    uTailDir: { value: new THREE.Vector3(1, 0, 0) }, uBendDir: { value: new THREE.Vector3(0, 1, 0) },
  });
  const coma = makeBillboard(U, 6, COMA_FRAGMENT);
  const ion = makeTail(U, {
    uTailLen: { value: 1 }, uTailWidth: { value: 0.9 }, uBend: { value: 0 }, uStriation: { value: 0.8 },
    uTailColor: { value: new THREE.Color() }, uTailBright: { value: 0.9 },
  });
  const dust = makeTail(U, {
    uTailLen: { value: 1 }, uTailWidth: { value: 2.6 }, uBend: { value: 0.3 }, uStriation: { value: 0.35 },
    uTailColor: { value: new THREE.Color(1.0, 0.88, 0.7) }, uTailBright: { value: 0.6 },
  });
  r.group.add(coma, ion, dust);
  const bend = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  return makeBodyHandle({
    v, U, group: r.group, spin: r.spin, pickMesh: r.surface,
    apply() {
      r.apply();
      U.uComa.value = v.coma;
      coma.material.uniforms.uHalfSize.value = 2 + v.coma * 10;
      ion.material.uniforms.uTailLen.value = v.tail;
      dust.material.uniforms.uTailLen.value = v.tail * 0.75;
      dust.material.uniforms.uTailBright.value = v.dustTail;
      ion.material.uniforms.uTailColor.value.setHSL(v.ionHue / 360, 0.8, 0.6);
    },
    layers: { atmosphere: { objects: [coma, ion, dust] } },
    onUpdate(t, dt, { velocity, activity = 1 }) {
      U.uActivity.value = activity;
      const away = U.uTailDir.value.copy(U.uSunDir.value).negate();
      // the dust tail lags behind the motion: bend it against the velocity
      bend.copy(velocity || UP).multiplyScalar(velocity ? -1 : 1);
      bend.addScaledVector(away, -bend.dot(away));
      if (bend.lengthSq() < 1e-8) bend.crossVectors(away, UP);
      U.uBendDir.value.copy(bend.normalize());
    },
    describe: () => [r.shape(), ["Tail length (shown)", Math.round(v.tail) + " nucleus radii"]],
  });
}

// =====================================================================
// BLACK HOLES — the event horizon (radius 1), an accretion disk (hotter
// and faster inside, the side turning toward the viewer brighter and
// bluer: relativistic beaming) and a billboard for the photon ring and
// the lensed glow around the shadow. Self-lit.
// =====================================================================
const GLSL_HOLE = `
uniform vec3 uColor;
uniform float uInner, uOuter, uTurb, uDoppler, uBright, uLens, uDiskSpeed;
`;
function diskMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: GLSL_HOLE + `
      varying vec2 vXY; varying vec3 vWorldPos; varying vec3 vTanW;
      void main(){
        // the ring geometry spans radius 1..2; mapped onto uInner..uOuter here
        float rr = length(position.xy);
        vec2 dir = position.xy / rr;
        vXY = dir * (uInner + (rr - 1.0) * (uOuter - uInner));
        vec4 wp = modelMatrix * vec4(vXY, 0.0, 1.0);
        vWorldPos = wp.xyz;
        vTanW = normalize(mat3(modelMatrix) * vec3(-dir.y, dir.x, 0.0));   // orbital motion
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_HOLE + `
      varying vec2 vXY; varying vec3 vWorldPos; varying vec3 vTanW;
      void main(){
        float r = length(vXY);
        float x = (r - uInner) / (uOuter - uInner);                // 0 inner edge .. 1 outer
        float ang = atan(vXY.y, vXY.x) - uTime * uDiskSpeed * 0.5;
        vec3 q = vec3(cos(ang) * r, sin(ang) * r, uTime * 0.05);
        float n = fbm(q * 1.6 + uSeed, uOctaves, 0.55) * 0.5 + 0.5;
        float lanes = snoise(vec3(r * 7.0, cos(ang) * 2.0, sin(ang) * 2.0) + uSeed.yzx) * 0.5 + 0.5;
        float turb = mix(1.0, 0.35 + n * 1.1 * (0.6 + 0.4 * lanes), uTurb);
        float heat = pow(1.0 - x, 1.6);                            // hotter inside
        float edge = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.7, 1.0, x));
        float beam = pow(clamp(1.0 + uDoppler * 0.6 * dot(vTanW, normalize(cameraPosition - vWorldPos)), 0.05, 2.0), 2.2);
        vec3 col = mix(uColor * vec3(1.0, 0.55, 0.3), mix(uColor, vec3(1.0), 0.5), heat);
        col = mix(col, col * vec3(0.8, 0.9, 1.25), clamp(beam - 1.0, 0.0, 1.0) * uDoppler);
        float crack = crackAt(vec3(vXY, 0.0) * 0.4);               // damage: the disk flickers apart
        gl_FragColor = vec4(col * turb * (0.15 + heat * 0.9) * edge * beam * uBright * (1.0 - crack * 0.6), 1.0);
      }`,
  });
}
const HOLE_LENS_FRAGMENT = GLSL_HOLE + `
  void main(){
    float r = length(vQ);
    float a = atan(vQ.y, vQ.x);
    float photon = exp(-pow((r - 1.14) * 34.0, 2.0)) * 0.7;                     // the thin photon ring
    float n = snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.3) + uSeed) * 0.5 + 0.5;
    float arc = exp(-pow((r - 1.45) * 5.0, 2.0)) * (0.7 + n * 0.3);       // the lensed image of the disk
    float glow = 0.15 / (1.0 + pow(max(r - 1.0, 0.0) * 2.5, 2.0));
    float shadow = smoothstep(0.98, 1.06, r);                             // the shadow stays black
    float fade = 1.0 - smoothstep(uHalfSize * 0.7, uHalfSize, r);
    vec3 col = mix(uColor, vec3(1.0), 0.45);
    gl_FragColor = vec4(col * (photon * 1.4 + (arc * 0.9 + glow) * uLens) * shadow * uBright * fade, 1.0);
  }`;

const HOLE_KM = 30;                 // lab size 1 = a 30 km event horizon

function buildBlackHole(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uColor: { value: new THREE.Color() }, uInner: { value: 1.6 }, uOuter: { value: 5 }, uTurb: { value: 0 },
    uDoppler: { value: 0 }, uBright: { value: 1 }, uLens: { value: 0 }, uDiskSpeed: { value: 1 },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(1, seg(64, 16), seg(32, 8)),
    new THREE.ShaderMaterial({ vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                               fragmentShader: `void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }` }));
  spin.add(horizon);
  const disk = new THREE.Mesh(new THREE.RingGeometry(1, 2, seg(192, 32), seg(12, 3)), diskMaterial(U));
  disk.rotation.x = -Math.PI / 2;            // in the equator plane (tilted with the body)
  disk.frustumCulled = false;
  disk.raycast = () => {};
  group.add(disk);                           // the pattern moves in the shader, not by spinning
  const lens = makeBillboard(U, 3, HOLE_LENS_FRAGMENT);
  group.add(lens);
  return makeBodyHandle({
    v, U, group, spin, pickMesh: horizon,
    apply() {
      blackbody(v.diskTemp, U.uColor.value);
      U.uOuter.value = v.disk; U.uTurb.value = v.turbulence; U.uDoppler.value = v.doppler;
      U.uBright.value = v.brightness; U.uLens.value = v.lensing; U.uDiskSpeed.value = v.diskSpeed;
      lens.material.uniforms.uHalfSize.value = 2.6;
    },
    layers: { atmosphere: { objects: [disk, lens] } },
    describe() {
      const rs = v.size * HOLE_KM;
      return [["Mass (Sun = 1)", (rs / 2.95).toFixed(1)], ["Event horizon radius", rs.toFixed(0) + " km"],
              ["Disk reaches", (v.disk * rs).toFixed(0) + " km"]];
    },
  });
}

// =====================================================================
// SKY — the backdrop: black space, colored nebulae with dark dust, a
// Milky Way band, small stars (some twinkling) and a few pulsars.
// The nebulae and the band are an expensive full-screen shader, so they
// are BAKED into a cube map (only again after a change) and shown by a
// cheap sphere sampling it; stars and pulsars are points on top, crisp at
// any resolution. Centered on the camera (opts.center) so it's infinitely
// far; opts.renderer is needed for the bake. Radius: setRadius().
// =====================================================================
const GLSL_SKY = `
uniform vec3 uBandN, uColA, uColB, uColC;
uniform float uBand, uDust, uNebula, uNebBright, uNebScale;
vec3 skyColor(vec3 d){
  vec3 col = vec3(0.0015, 0.002, 0.005);                       // black space
  // the Milky Way: a band around the galactic plane, clumpy, with dust lanes
  float h = dot(d, uBandN);
  float band = exp(-h * h / 0.02);
  float clump = fbm(d * 4.0 + uSeed, uOctaves, 0.55) * 0.5 + 0.5;
  float lanes = smoothstep(0.55, 0.85, 1.0 - abs(snoise(d * 6.0 + uSeed.zxy))) * exp(-h * h / 0.005);
  col += vec3(0.55, 0.52, 0.64) * band * (0.3 + clump * clump * 1.2) * (1.0 - lanes * uDust * 0.9) * uBand * 0.13;
  // nebulae: separate regions of glowing gas (domain-warped noise) with
  // bright wisps and hot cores, two colors mixing across a cloud; dark
  // dust only dims the gas, so the space around stays clean black
  vec3 q = d * uNebScale + uSeed.yzx;
  vec3 w = vec3(fbm(q + 1.7, 3, 0.5), fbm(q + 9.2, 3, 0.5), fbm(q + 4.4, 3, 0.5));
  float n = fbm(q + w * 1.2, uOctaves, 0.5) * 0.5 + 0.5;                    // gas density 0..1
  float region = smoothstep(0.6 - uNebula * 0.35, 0.85 - uNebula * 0.35, snoise(d * 0.9 + uSeed.zyx) * 0.5 + 0.5);
  float gas = smoothstep(0.35, 0.85, n);
  float wisps = pow(1.0 - abs(snoise(q * 2.5 + w * 1.5)), 4.0) * smoothstep(0.4, 0.7, n);
  float core = smoothstep(0.7, 0.95, n);
  vec3 nebCol = mix(uColA, uColB, smoothstep(0.35, 0.65, snoise(q * 0.5 + 3.1) * 0.5 + 0.5));
  nebCol = mix(nebCol, uColC, core * 0.7);
  float dust = smoothstep(0.5, 0.8, fbm(q * 2.0 + 7.0, 4, 0.5) * 0.5 + 0.5) * uDust;
  col += nebCol * region * (gas * 0.9 + wisps * 0.6 + core * 0.8) * (1.0 - dust * 0.8) * uNebBright * 0.75;
  return col;
}
`;
const SKY_GLSL = GLSL_NOISE + GLSL_BODY + GLSL_SKY;

// The bake: the full sky shader on a unit sphere, seen from its center.
function skyBakeMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }`,
  });
}
// What's drawn every frame: the baked cube, looked up by direction.
function skyDisplayMaterial(cubeTexture) {
  return new THREE.ShaderMaterial({
    uniforms: { uCube: { value: cubeTexture } }, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform samplerCube uCube; varying vec3 vDir;
      void main(){ gl_FragColor = vec4(textureCube(uCube, normalize(vDir)).rgb, 1.0); }`,
  });
}

// Stars + pulsars: one point cloud. aPulse > 0 marks pulsar n (only the
// first uPulsarCount are shown); aTw > 0 a twinkling star (its phase).
const SKY_POINTS_VERTEX = `
attribute vec3 aColor; attribute float aSize, aTw, aPulse;
uniform float uTime, uTwinkle, uPixelRatio, uStarBright, uPulsarCount;
varying vec3 vColor; varying float vPulse;
void main(){
  float b = 1.0, size = aSize;
  if (aTw > 0.0) b *= 1.0 - uTwinkle * 0.6 * (0.5 + 0.5 * sin(uTime * (1.3 + fract(aTw * 7.3) * 2.0) + aTw * 6.2832));
  vPulse = 0.0;
  if (aPulse > 0.0) {
    if (aPulse > uPulsarCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    float period = 0.6 + fract(aPulse * 0.618) * 1.6;              // seconds, per pulsar
    float p = pow(max(0.0, sin(uTime * 6.2832 / period + aPulse)), 8.0);
    b *= 0.35 + 1.4 * p; size = 16.0; vPulse = 0.35 + p;
  }
  vColor = aColor * b * uStarBright;
  gl_PointSize = size * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_POINTS_FRAGMENT = `
varying vec3 vColor; varying float vPulse;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c), a;
  if (vPulse > 0.0) {                                               // a pulsar: core, glow, cross-shaped beams
    float beams = exp(-abs(c.x) * 60.0) * exp(-c.y * c.y * 16.0) + exp(-abs(c.y) * 60.0) * exp(-c.x * c.x * 16.0);
    a = exp(-r * r * 140.0) + beams * 0.6 * vPulse + exp(-r * r * 30.0) * 0.25 * vPulse;
  } else {
    a = smoothstep(0.5, 0.05, r);
  }
  gl_FragColor = vec4(vColor * a, 1.0);
}`;
const SKY_MAX_STARS = 14000, SKY_MAX_PULSARS = 6;

// Deterministic 0..1 random from a seed (mulberry32), so a sky is the same
// for everyone with the same seed.
function seededRandom(seed) {
  let a = Math.floor(seed * 1000) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fills the star/pulsar buffers for a seed: 40% of the stars crowd toward
// the Milky Way's plane; most are faint, a few bright; colors from their
// temperature; ~12% twinkle. Returns the band's normal (the shader's too).
function fillStars(geo, seed) {
  const rand = seededRandom(seed + 0.5);
  const bandN = new THREE.Vector3(rand() - 0.5, 1.2, rand() - 0.5).normalize();
  const t1 = new THREE.Vector3(1, 0, 0).cross(bandN).normalize(), t2 = new THREE.Vector3().crossVectors(bandN, t1);
  const pos = geo.attributes.position.array, col = geo.attributes.aColor.array;
  const size = geo.attributes.aSize.array, tw = geo.attributes.aTw.array, pulse = geo.attributes.aPulse.array;
  const d = new THREE.Vector3(), c = new THREE.Color();
  const gauss = () => (rand() + rand() + rand() - 1.5) * 0.35;
  for (let i = 0; i < SKY_MAX_PULSARS + SKY_MAX_STARS; i++) {
    const isPulsar = i < SKY_MAX_PULSARS;
    if (!isPulsar && rand() < 0.4) {                                // near the band
      const a = rand() * Math.PI * 2;
      d.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(bandN, gauss()).normalize();
    } else {
      const z = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      d.set(s * Math.cos(a), z, s * Math.sin(a));
    }
    pos[i * 3] = d.x * 0.98; pos[i * 3 + 1] = d.y * 0.98; pos[i * 3 + 2] = d.z * 0.98;
    const mag = Math.pow(rand(), 3.2);                              // mostly faint
    blackbody(3000 + Math.pow(rand(), 1.5) * 11000, c);
    const b = isPulsar ? 1 : 0.18 + mag * 1.1;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    if (isPulsar) { col[i * 3] = 0.75; col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 1.0; }
    size[i] = isPulsar ? 16 : 1.1 + mag * 1.6;
    tw[i] = !isPulsar && rand() < 0.12 ? 0.01 + rand() : 0;
    pulse[i] = isPulsar ? i + 1 : 0;
  }
  for (const k of ["position", "aColor", "aSize", "aTw", "aPulse"]) geo.attributes[k].needsUpdate = true;
  return bandN;
}

function buildSky(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uBandN: { value: new THREE.Vector3(0, 1, 0) }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
    uColC: { value: new THREE.Color() }, uBand: { value: 0 }, uDust: { value: 0 }, uNebula: { value: 0 },
    uNebBright: { value: 1 }, uNebScale: { value: 1 },
    uTwinkle: { value: 0 }, uPixelRatio: { value: 1 }, uStarBright: { value: 1 }, uPulsarCount: { value: 0 },
  });
  // the bake: a cube render target, re-rendered only when marked dirty
  const faceSize = detail >= 1.5 ? 2048 : detail >= 0.5 ? 1024 : 512;
  const cubeRT = new THREE.WebGLCubeRenderTarget(faceSize, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.1, 10, cubeRT);
  const bakeScene = new THREE.Scene();
  const bakeMat = skyBakeMaterial(U);
  bakeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), bakeMat));
  let dirty = true;

  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const display = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyDisplayMaterial(cubeRT.texture));
  display.renderOrder = -1000;                                      // first: everything draws over it
  display.frustumCulled = false;
  display.raycast = () => {};
  spin.add(display);

  const geo = new THREE.BufferGeometry();
  const n = SKY_MAX_PULSARS + SKY_MAX_STARS;
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const k of ["aSize", "aTw", "aPulse"]) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n), 1));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, vertexShader: SKY_POINTS_VERTEX, fragmentShader: SKY_POINTS_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  points.raycast = () => {};
  spin.add(points);
  let starSeed = null;

  const handle = makeBodyHandle({
    v, U, group, spin, pickMesh: display,
    apply() {
      if (starSeed !== v.seed) { U.uBandN.value.copy(fillStars(geo, v.seed)); starSeed = v.seed; }
      geo.setDrawRange(0, SKY_MAX_PULSARS + Math.round(v.stars * SKY_MAX_STARS));
      U.uColA.value.setHSL(v.hueA / 360, 0.85, 0.5); U.uColB.value.setHSL(v.hueB / 360, 0.8, 0.5);
      U.uColC.value.copy(U.uColA.value).lerp(new THREE.Color(1, 0.95, 0.9), 0.65);
      U.uBand.value = v.band; U.uDust.value = v.dust; U.uNebula.value = v.nebula;
      U.uNebBright.value = v.nebulaBright; U.uNebScale.value = v.nebulaScale;
      U.uTwinkle.value = v.twinkle; U.uStarBright.value = v.starBright; U.uPulsarCount.value = v.pulsars;
      dirty = true;
    },
    layers: { clouds: { objects: [points] }, atmosphere: { objects: [display] } },
    onUpdate(t, dt, { center, renderer }) {
      if (center) group.position.copy(center);
      if (!renderer) return;
      U.uPixelRatio.value = renderer.getPixelRatio();
      if (dirty) { cubeCam.update(renderer, bakeScene); dirty = false; }
    },
    describe: () => [["Stars", (Math.round(v.stars * SKY_MAX_STARS)).toLocaleString("en-US")], ["Pulsars", String(v.pulsars)],
                     ["Nebula bake", faceSize + "² × 6"]],
    dispose() { cubeRT.dispose(); bakeMat.dispose(); bakeScene.children[0].geometry.dispose(); },
  });
  handle.setRadius(100);                                            // the game sets its own
  // setOctaves re-bakes (the octaves are baked into the nebulae)
  const setOctaves = handle.setOctaves;
  handle.setOctaves = (k) => { if (U.uOctaves.value !== k) dirty = true; setOctaves(k); };
  return handle;
}

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
    build: buildPlanet,
  },
  {
    id: "earthlike", name: "EARTH-LIKE", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUDS", atmosphere: "ATMOSPHERE" },
    params: planetParams(["size", "sea", "continents", "mountains", "roughness", "climate", "ice", "clouds", "cloudDrift", "atmosphere", "atmoHue"]),
    bodies: [
      { id: "terra",   name: "TERRA-1", slot: 3, values: { seed: 1 } },
      { id: "pelagia", name: "PELAGIA", slot: 5, values: { seed: 5, size: 1.35, tilt: 12, sea: 0.22, continents: 2.2,
        climate: 0.2, ice: 0.25, clouds: 0.55, atmoHue: 195 } },
    ],
    build: buildPlanet,
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
    build: buildPlanet,
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
    build: buildPlanet,
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
    build: buildPlanet,
  },
  {
    id: "moons", name: "MOONS", kmPerSize: 6371, view: 4.4, layers: {},
    params: planetParams(["size", ["continents", { label: "Terrain scale" }], ["mountains", { label: "Relief height", value: 0.006 }], "roughness",
      ["airless", { label: "Craters", value: 1 }], ["maria", { value: 0.6 }], ["rays", { value: 0.5 }]]),
    fixed: { sea: -0.6, ice: 0, clouds: 0, atmosphere: 0, climate: 0.5 },
    bodies: [
      { id: "luna", name: "LUNA", view: 1.6, values: { seed: 13, size: 0.27, tilt: 7, spin: 0.1, continents: 1.3, roughness: 0.55 } },
    ],
    build: buildPlanet,
  },
  {
    id: "airless", name: "AIRLESS", kmPerSize: 6371, view: 4.4, layers: {},
    params: planetParams(["size", ["continents", { label: "Terrain scale" }], ["mountains", { label: "Relief height", value: 0.006 }], "roughness",
      ["airless", { label: "Craters", value: 1 }], ["rays", { value: 0.9 }]]),
    fixed: { sea: -0.6, ice: 0, clouds: 0, atmosphere: 0, climate: 0.5 },
    bodies: [
      { id: "mercury", name: "MERCURY", values: { seed: 3, size: 0.38, tilt: 0, spin: 0.25, continents: 1.6, roughness: 0.55 } },
    ],
    build: buildPlanet,
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
    build: buildGiant,
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
    build: buildRingSystem,
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
    build: buildPulsar,
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
    build: buildSun,
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
    build: buildComet,
  },
  {
    id: "rocks", name: "ROCKS", kmPerSize: ROCK_KM, view: 5,
    params: ROCK_PARAMS,
    bodies: [
      { id: "ferrum", name: "FERRUM", slot: 8, values: { seed: 17, spin: 0.35, tilt: 35, metal: 0.55, rust: 0.45,
        albedo: 0.14, craters: 0.6 } },
    ],
    build: buildRock,
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
    build: buildBlackHole,
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
    build: buildSky,
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
  const body = group.build({ ...defaultValues(group, def), ...values }, detail);
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

return { GROUPS, COMMON_PARAMS, PLANET_PARAMS, PLANET_DEFAULTS, QUALITY_OCTAVES, GAME_DETAIL_SCALE, MAX_POINT_LIGHTS, GLSL_SKY, GAME_BODIES, GAME_KINDS, SPIN_RAD_PER_UNIT,
         buildBody, disposeBody, modelStats, defaultValues, planetTerrain,
         GLSL_NOISE, GLSL_BODY, GLSL_PLANET, GLSL_PLANET_SURFACE, GLSL_SUN, GLSL_ROCK, GLSL_HOLE, blackbody };
})();
