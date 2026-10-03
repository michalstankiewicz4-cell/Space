/* =======================================================================
   BODYKIT · HOLES — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, HOLE_KM, KINDS, blackbody, bodyUniforms, makeBillboard, makeBodyHandle } = BodyKit._;

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

KINDS.hole = buildBlackHole;
Object.assign(BodyKit, { GLSL_HOLE });
})();
