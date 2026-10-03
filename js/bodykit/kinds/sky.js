/* =======================================================================
   BODYKIT · SKY — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, KINDS, blackbody, bodyUniforms, makeBodyHandle } = BodyKit._;

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

KINDS.sky = buildSky;
Object.assign(BodyKit, { GLSL_SKY });
})();
