/* =======================================================================
   BODYKIT · PULSARS — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, GLSL_SPHERE_VERTEX, KINDS, blackbody, bodyUniforms, makeBillboard, makeBodyHandle } = BodyKit._;

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

KINDS.pulsar = buildPulsar;
})();
