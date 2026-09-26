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
   Groups: planets (the game's six planets, one per orbit slot, see
   the bodies' `slot`), comets, suns, other (the last three empty yet).
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
// three pseudo-random numbers 0..1 for a cell (integer coordinates)
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
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
function bodyUniforms(v) {
  return {
    uSeed: { value: seedVec(v.seed, new THREE.Vector3()) }, uTime: { value: 0 },
    uDamage: { value: v.damage }, uOctaves: { value: 6 }, uSunDir: { value: new THREE.Vector3(1, 0, 0) },
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
    update(t, dt, opts = {}) {
      U.uTime.value = t;
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

// continents: domain-warped fBm, ~ -1..1
float heightOct(vec3 p, int octaves){
  vec3 q = p * uFreq + uSeed;
  vec3 warp = vec3(snoise(q * 0.7 + 11.3), snoise(q * 0.7 + 27.1), snoise(q * 0.7 + 3.7));
  return fbm(q + warp * 0.35, octaves, uRough);
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
  float peaks = step(uSea, h) * smoothstep(snowLine, snowLine + 0.05, alt);
  return uIce <= 0.001 ? 0.0 : max(polar, peaks);
}
float cloudAt(vec3 p){
  float a = uTime * uCloudDrift * 0.05;                  // clouds drift over the surface
  mat3 rot = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  vec3 q = rot * p * 3.2 + uSeed.yzx;
  float n = fbm(q + vec3(0.0, uTime * 0.01, 0.0), uOctaves, 0.55) * 0.5 + 0.5;
  // threshold = inverse of n's (≈ normal, sd ≈ 0.11) distribution at
  // 1 - uClouds (logistic approximation), so coverage ≈ the slider value
  float cq = clamp(1.0 - uClouds, 0.001, 0.999);
  float t = 0.5 + 0.11 * log(cq / (1.0 - cq)) / 1.702;
  return smoothstep(t - 0.05, t + 0.05, n);
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
    fragmentShader: PLANET_GLSL + `
      uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uAtmoColor; uniform float uMountain;
      uniform mat4 modelMatrix;    // set by three for every object (declared for this stage)
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float h = heightAt(p);
        float water = step(h, uSea);
        float ice = iceAt(p, h);
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
        // volcanic world: basalt instead of soil, molten rock instead of water
        land = mix(land, mix(vec3(0.10, 0.085, 0.08), vec3(0.24, 0.17, 0.13), m), uLava);
        float flow = uLava > 0.001 ? lavaFlowAt(p) : 0.0;
        ocean = mix(ocean, mix(vec3(0.09, 0.05, 0.04), vec3(1.0, 0.36, 0.06), flow), uLava);
        // ice world: seas frozen over into cracked sheets, frost on the land
        float sheet = uFrozen > 0.001 ? iceSheetAt(p) : 0.0;
        ocean = mix(ocean, mix(vec3(0.55, 0.72, 0.84), vec3(0.86, 0.93, 0.98), sheet), uFrozen * (1.0 - uLava));
        land = mix(land, mix(vec3(0.36, 0.38, 0.42), vec3(0.50, 0.52, 0.55), m), uFrozen * 0.85);   // bare tundra rock
        land = mix(land, vec3(0.80, 0.86, 0.92), uFrozen * 0.5 * smoothstep(0.0, 0.1, alt));      // frost
        vec3 col = mix(land, ocean, water);
        col = mix(col, mix(vec3(0.82, 0.90, 0.97), vec3(0.95, 0.97, 1.0), alt), ice);         // ice / snow
        // self-lit, also on the night side: molten rock and its shores, damage cracks
        float shore = uLava * (1.0 - water) * (1.0 - smoothstep(0.0, 0.05, alt));
        vec3 emit = vec3(1.0, 0.36, 0.06) * (water * uLava * (0.12 + flow * 1.3) + shore * 0.5);
        float crack = crackAt(p);
        col *= 1.0 - crack * 0.75;
        emit += vec3(1.0, 0.45, 0.12) * crack * (0.7 + 0.9 * uDamage);

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
          float h0 = max(heightOct(p, o), uSea);
          float hx = max(heightOct(normalize(p + t1 * eps), o), uSea);
          float hy = max(heightOct(normalize(p + t2 * eps), o), uSea);
          float k = 0.012 + uMountain * 0.25;                    // relief strength
          vec3 nObj = normalize(p - k * ((hx - h0) * t1 + (hy - h0) * t2) / eps);
          Nb = normalize(mat3(modelMatrix) * nObj);
        }

        // ---- lighting
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float diff = max(dot(Nb, L), 0.0);
        float wrap = smoothstep(-0.15, 0.25, dot(N, L));            // soft terminator
        vec3 H = normalize(L + V);
        float gloss = (1.0 - uLava) * (1.0 - 0.6 * uFrozen);           // lava is matte, ice duller than water
        float spec = water * (1.0 - ice) * gloss * pow(max(dot(N, H), 0.0), 70.0) * 0.9 * wrap;
        vec3 lit = col * (0.025 + diff * wrap * 1.15) + vec3(1.0, 0.95, 0.85) * spec;
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
        float c = cloudAt(normalize(vDir));
        float diff = smoothstep(-0.1, 0.35, dot(normalize(vNormalW), normalize(uSunDir)));
        vec3 tint = mix(vec3(0.97), vec3(0.34, 0.30, 0.28), uLava);    // ash clouds over a volcanic world
        gl_FragColor = vec4(tint * (0.04 + diff * 1.05), c * 0.92);
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
        float frozenSea = step(h, uSea) * uFrozen * (1.0 - uLava);
        gl_FragColor = vec4(step(h, uSea), step(0.5, max(iceAt(p, h), frozenSea)), step(0.5, cloudAt(p)), 1.0);
      }`,
  });
}

function buildPlanet(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uFreq: { value: 0 }, uSea: { value: 0 }, uRough: { value: 0 }, uIce: { value: 0 }, uClimate: { value: 0 },
    uClouds: { value: 0 }, uCloudDrift: { value: 0 }, uMountain: { value: 0 }, uAtmo: { value: 0 },
    uAtmoColor: { value: new THREE.Color() }, uLava: { value: 0 }, uFrozen: { value: 0 },
  });
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
      U.uFreq.value = v.continents; U.uSea.value = v.sea; U.uRough.value = v.roughness;
      U.uIce.value = v.ice; U.uClimate.value = v.climate; U.uClouds.value = v.clouds;
      U.uCloudDrift.value = v.cloudDrift; U.uMountain.value = v.mountains;
      U.uAtmo.value = v.atmosphere; U.uAtmoColor.value.copy(hueColor(v.atmoHue));
      U.uLava.value = v.lava; U.uFrozen.value = v.frozen;
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
// the nearest crater per cell (only a uCraters share of cells has one):
// a bowl below 0, a raised rim, 0 elsewhere
float craterField(vec3 p, float freq){
  vec3 q = p * freq + uSeed;
  vec3 i = floor(q), f = fract(q);
  float best = 9.0; vec3 hb = vec3(1.0);
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash33(i + o);
    vec3 d = o + h - f;
    float dd = dot(d, d);
    if (dd < best){ best = dd; hb = h; }
  }
  if (hb.y > uCraters) return 0.0;
  float k = sqrt(best) / (0.25 + 0.3 * hb.z);          // distance in crater radii
  float bowl = k < 1.0 ? k * k - 1.0 : 0.0;
  return bowl + exp(-pow((k - 1.0) * 3.5, 2.0)) * 0.3;
}
float rockHeight(vec3 p){
  float h = fbm(p * 1.1 + uSeed, 4, 0.5) * uLump * 0.5 + snoise(p * 3.1 + uSeed.yzx) * uLump * 0.08;
  return h + craterField(p, 2.0) * 0.12 + craterField(p, 4.5) * 0.05;
}
vec3 rockPoint(vec3 p){
  float s = inversesqrt(uStretch);
  return p * (1.0 + rockHeight(p)) * vec3(uStretch, s, s);
}
float rockDetail(vec3 p){ return craterField(p, 11.0) * 0.5 + snoise(p * 24.0 + uSeed) * 0.15; }
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
        base *= 1.0 + craterField(p, 4.5) * 0.45;
        float frost = step(0.001, uIce) * smoothstep(0.6 - uIce * 0.6, 0.7 - uIce * 0.6, snoise(p * 3.0 + uSeed.zxy) * 0.5 + 0.5);
        base = mix(base, vec3(0.78, 0.84, 0.9), frost * 0.85);
        float vein = uMetal * smoothstep(0.972, 0.996, 1.0 - abs(snoise(p * 4.0 + uSeed.yxz)))
                   * smoothstep(0.35, 0.65, snoise(p * 1.5 + uSeed.zyx) * 0.5 + 0.5);   // only in some regions
        base = mix(base, vec3(0.62, 0.58, 0.52), vein * 0.8);

        // ---- lighting
        vec3 L = normalize(uSunDir), V = normalize(cameraPosition - vWorldPos), H = normalize(L + V);
        float diff = max(dot(Nb, L), 0.0);
        float spec = pow(max(dot(Nb, H), 0.0), 40.0) * (frost * 0.4 + vein * 1.5 + uMetal * 0.15) * step(0.0, dot(N, L));
        vec3 col = base * (0.02 + diff * 1.1) + vec3(1.0, 0.95, 0.85) * spec;
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
const GROUPS = [
  {
    id: "planets", name: "PLANETS", kmPerSize: 6371, view: 4.4, layers: { clouds: "CLOUDS", atmosphere: "ATMOSPHERE" },
    params: [
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
    ],
    bodies: [
      { id: "cinder",  name: "CINDER",  slot: 1, values: { seed: 11, size: 0.85, tilt: 6, lava: 1, sea: -0.05, mountains: 0.06,
        climate: 0.9, ice: 0, clouds: 0.08, cloudDrift: 0.5, atmosphere: 0.35, atmoHue: 18 } },
      { id: "magma",   name: "MAGMA",   slot: 2, values: { seed: 23, size: 1.2, tilt: 30, lava: 1, sea: 0.06, roughness: 0.6,
        climate: 1, ice: 0, clouds: 0.15, atmosphere: 0.5, atmoHue: 12 } },
      { id: "terra",   name: "TERRA-1", slot: 3, values: { seed: 1 } },
      { id: "pelagia", name: "PELAGIA", slot: 5, values: { seed: 5, size: 1.35, tilt: 12, sea: 0.22, continents: 2.2,
        climate: 0.2, ice: 0.25, clouds: 0.55, atmoHue: 195 } },
      { id: "rime",    name: "RIME",    slot: 6, values: { seed: 31, size: 0.9, tilt: 20, frozen: 1, sea: 0.05, ice: 0.75,
        climate: 0.1, clouds: 0.3, atmosphere: 0.45, atmoHue: 190 } },
      { id: "glacies", name: "GLACIES", slot: 7, values: { seed: 47, size: 1.25, tilt: 40, frozen: 1, sea: 0.25, ice: 1,
        mountains: 0.03, clouds: 0.4, atmosphere: 0.35, atmoHue: 215 } },
    ],
    build: buildPlanet,
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
];
// Parameters every body has, whatever its group (the "classic" controls).
const COMMON_PARAMS = [
  { key: "spin", label: "Rotation speed", min: 0, max: 2,  step: 0.01, value: 0.25, fmt: (x) => x.toFixed(2) + "×" },
  { key: "tilt", label: "Axial tilt",     min: 0, max: 90, step: 1,    value: 23,   fmt: (x) => Math.round(x) + "°" },
  // a preview of the game's health: 1 - health / maxHealth (setDamage)
  { key: "damage", label: "Damage (game health)", min: 0, max: 1, step: 0.01, value: 0, fmt: pct },
];

// Noise octaves per pixel for the render-quality presets LOW .. MAX —
// the lab's quality buttons and the game's Setup -> Graphics use the same.
const QUALITY_OCTAVES = [3, 4, 5, 6, 8];

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
  return Object.assign(v, body.values);
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

return { GROUPS, COMMON_PARAMS, QUALITY_OCTAVES, GAME_BODIES, GAME_KINDS, SPIN_RAD_PER_UNIT,
         buildBody, disposeBody, modelStats, defaultValues,
         GLSL_NOISE, GLSL_BODY, GLSL_PLANET, GLSL_SUN, GLSL_ROCK, GLSL_HOLE };
})();
