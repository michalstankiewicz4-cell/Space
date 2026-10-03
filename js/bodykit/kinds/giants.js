/* =======================================================================
   BODYKIT · GIANTS — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, GLSL_SPHERE_VERTEX, KINDS, bodyUniforms, hueColor, makeBodyHandle, atmosphereMaterial } = BodyKit._;

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

KINDS.giant = buildGiant;
KINDS.rings = buildRingSystem;
})();
