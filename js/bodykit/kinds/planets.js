/* =======================================================================
   BODYKIT · PLANETS — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { PLANET_DEFAULTS, defaultValues, GLSL_BODY, GLSL_NOISE, GLSL_SPHERE_VERTEX, GROUPS, KINDS, bodyUniforms, hueColor, makeBodyHandle, seedVec } = BodyKit._;

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
  if (!def || group.build !== "planet") return null;
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

KINDS.planet = buildPlanet;
Object.assign(BodyKit, { GLSL_PLANET, GLSL_PLANET_SURFACE, planetTerrain });
Object.assign(BodyKit._, { atmosphereMaterial });
})();
