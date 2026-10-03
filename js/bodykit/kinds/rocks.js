/* =======================================================================
   BODYKIT · ROCKS — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, KINDS, ROCK_KM, bodyUniforms, makeBillboard, makeBodyHandle } = BodyKit._;

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

KINDS.rock = buildRock;
KINDS.comet = buildComet;
Object.assign(BodyKit, { GLSL_ROCK });
})();
