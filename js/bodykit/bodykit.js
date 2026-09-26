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
// PLANETS
// Shared GLSL: terrain height + surface classification, used by the
// surface shader AND the coverage probe, so the land/water/ice
// statistics are exactly what is drawn.
// =====================================================================
const GLSL_PLANET = `
uniform vec3 uSeed;
uniform float uFreq, uSea, uRough, uIce, uClimate, uClouds, uCloudDrift, uTime;
uniform int uOctaves;

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

uniform float uLava, uFrozen, uDamage;
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
`;

// Surface: vertex displacement for mountains + per-pixel colors, bump
// from screen-space derivatives of the height, own sun lighting.
function planetSurfaceMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: GLSL_NOISE + GLSL_PLANET + `
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
    fragmentShader: GLSL_NOISE + GLSL_PLANET + `
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
    vertexShader: `
      varying vec3 vDir; varying vec3 vNormalW;
      void main(){
        vDir = normalize(position);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: GLSL_NOISE + GLSL_PLANET + `
      uniform vec3 uSunDir;
      varying vec3 vDir; varying vec3 vNormalW;
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
    vertexShader: `
      varying vec3 vNormalW; varying vec3 vWorldPos;
      void main(){
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uAtmoColor;
      varying vec3 vNormalW; varying vec3 vWorldPos;
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
// target (r = water, g = ice, b = clouds) with the SAME GLSL functions.
function planetProbeMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL_NOISE + GLSL_PLANET + `
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

const hueColor = (hue) => new THREE.Color().setHSL(hue / 360, 0.75, 0.62);
const SPIN_RAD_PER_UNIT = 0.6;              // values.spin 1 = 0.6 rad/s
const ORIGIN = new THREE.Vector3();         // default light source: a sun at (0,0,0)

function buildPlanet(values, detail) {
  const v = { ...values };
  const U = {
    uSeed: { value: new THREE.Vector3(v.seed * 17.13 % 97, v.seed * 7.71 % 89, v.seed * 3.37 % 83) },
    uFreq: { value: v.continents }, uSea: { value: v.sea }, uRough: { value: v.roughness },
    uIce: { value: v.ice }, uClimate: { value: v.climate }, uClouds: { value: v.clouds },
    uCloudDrift: { value: v.cloudDrift }, uMountain: { value: v.mountains },
    uAtmo: { value: v.atmosphere }, uAtmoColor: { value: hueColor(v.atmoHue) },
    uLava: { value: v.lava }, uFrozen: { value: v.frozen }, uDamage: { value: v.damage },
    uTime: { value: 0 }, uOctaves: { value: 6 }, uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
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

  const tmp = new THREE.Vector3();
  let radiusOverride = null;
  const body = {
    group,
    pickMesh: surface,                 // the mesh to raycast against
    surfaceRoot: spin,                 // turns with the surface: attach decals here (unit radius)
    values: v,
    get radius() { return radiusOverride != null ? radiusOverride : v.size; },
    // opts.sunDir: world direction toward the light, or
    // opts.sunPosition: world position of the light (default (0,0,0));
    // the direction is then taken from the body's own world position.
    update(t, dt, { sunDir, sunPosition } = {}) {
      U.uTime.value = t;
      spin.rotation.y += dt * v.spin * SPIN_RAD_PER_UNIT;
      group.rotation.z = THREE.MathUtils.degToRad(v.tilt);
      if (sunDir) U.uSunDir.value.copy(sunDir).normalize();
      else U.uSunDir.value.copy(sunPosition || ORIGIN).sub(group.getWorldPosition(tmp)).normalize();
    },
    // Radius in world units, overriding values.size (use the game's radius).
    setRadius(units) { radiusOverride = units; group.scale.setScalar(body.radius); },
    setValues(nv) {
      Object.assign(v, nv);
      group.scale.setScalar(body.radius);
      U.uFreq.value = v.continents; U.uSea.value = v.sea; U.uRough.value = v.roughness;
      U.uIce.value = v.ice; U.uClimate.value = v.climate; U.uClouds.value = v.clouds;
      U.uCloudDrift.value = v.cloudDrift; U.uMountain.value = v.mountains;
      U.uAtmo.value = v.atmosphere; U.uAtmoColor.value.copy(hueColor(v.atmoHue));
      U.uLava.value = v.lava; U.uFrozen.value = v.frozen; U.uDamage.value = v.damage;
      U.uSeed.value.set(v.seed * 17.13 % 97, v.seed * 7.71 % 89, v.seed * 3.37 % 83);
      clouds.visible = body._layers.clouds && v.clouds > 0.001;
      atmo.visible = body._layers.atmosphere && v.atmosphere > 0.001;
    },
    setDamage(x) { v.damage = x; U.uDamage.value = x; },
    setOctaves(n) { U.uOctaves.value = n; },
    _layers: { clouds: true, atmosphere: true },
    setLayers(layers) { Object.assign(body._layers, layers); body.setValues({}); },
    // Area-weighted coverage (cos(latitude)), read back from the GPU.
    measure(renderer) {
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
    },
    _dispose() { probeRT.dispose(); probeMat.dispose(); probeScene.children[0].geometry.dispose(); },
  };
  body.setValues({});
  return body;
}

// =====================================================================
// GROUPS — each with its own parameter schema.
// =====================================================================
const pct = (x) => Math.round(x * 100) + "%";
const GROUPS = [
  {
    id: "planets", name: "PLANETS",
    params: [
      { key: "size",       label: "Size (Earth radii)",     min: 0.3, max: 2.5, step: 0.05, value: 1,    fmt: (x) => x.toFixed(2) },
      { key: "sea",        label: "Water level",            min: -0.6, max: 0.6, step: 0.01, value: 0.04, fmt: (x) => x.toFixed(2) },
      { key: "continents", label: "Continent scale",        min: 0.5, max: 3.5, step: 0.05, value: 1.4,  fmt: (x) => x.toFixed(2) },
      { key: "mountains",  label: "Mountain height",        min: 0,   max: 0.15, step: 0.005, value: 0.045, fmt: pct },
      { key: "roughness",  label: "Terrain roughness",      min: 0.35, max: 0.7, step: 0.01, value: 0.52, fmt: (x) => x.toFixed(2) },
      { key: "climate",    label: "Climate (lush → arid)",  min: 0,   max: 1,   step: 0.01, value: 0.35, fmt: pct },
      { key: "ice",        label: "Ice caps (reach)",       min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: (x) => x.toFixed(2) },
      { key: "clouds",     label: "Cloud cover",            min: 0,   max: 1,   step: 0.01, value: 0.35, fmt: pct },
      { key: "cloudDrift", label: "Cloud drift",            min: 0,   max: 1,   step: 0.01, value: 0.3,  fmt: pct },
      { key: "atmosphere", label: "Atmosphere",             min: 0,   max: 1,   step: 0.01, value: 0.6,  fmt: pct },
      { key: "atmoHue",    label: "Atmosphere hue",         min: 0,   max: 360, step: 1,    value: 205,  fmt: (x) => Math.round(x) + "°" },
      { key: "lava",       label: "Molten lowlands",        min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
      { key: "frozen",     label: "Frozen seas",            min: 0,   max: 1,   step: 0.01, value: 0,    fmt: pct },
    ],
    // `slot`: the game's fixed solar orbit this body is (world/solarSystem.js);
    // `size` only matters here — the game sizes it to the slot's radius.
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
  { id: "comets", name: "COMETS", params: [], bodies: [] },
  { id: "suns",   name: "SUNS",   params: [], bodies: [] },
  { id: "other",  name: "OTHER",  params: [], bodies: [] },
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

// The game's fixed orbit slots and the body each one shows: { slot: { groupId, bodyId } }.
const GAME_BODIES = {};
for (const g of GROUPS) for (const b of g.bodies) if (b.slot != null) GAME_BODIES[b.slot] = { groupId: g.id, bodyId: b.id };

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

return { GROUPS, COMMON_PARAMS, QUALITY_OCTAVES, GAME_BODIES, buildBody, disposeBody, modelStats, defaultValues,
         GLSL_NOISE, GLSL_PLANET };
})();

