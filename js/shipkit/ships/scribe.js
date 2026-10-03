/* =======================================================================
   SHIPKIT · SCRIBE — one ship definition (see js/shipkit/shipkit.js,
   "SHIP DEFINITIONS", and docs/ship.md). A classic script loaded after
   shipkit.js: it pushes its entry into ShipKit.SHIP_DEFS and builds with
   ShipKit's blocks and helpers (ShipKit._).
   ======================================================================= */
(function () {
"use strict";
const { GOLD, additiveSprite, canvas, clamp, detailHelpers, fxHost, fxTextures, glowTextures, makeBoltPool, makeBrushed, makeEngineSet, makeExhaust, makeNavLights, makeOnlineFader, makePlating, makePlumeMaterial, makeScanWave, makeShotQueue, makeSolarCells, mergeStatic, partsOf, rng, shadowed, sharedMaterials, textTexture, trackTextures } = ShipKit._;
const SHIP_DEFS = ShipKit.SHIP_DEFS;

// ---------------------------------------------------------------------
// DR-01 SCRIBE — the programmable drone
// ---------------------------------------------------------------------
// Meant to replace the game's plain gold octahedron, so it keeps that
// identity: a gold, faceted octahedral hull. Around it: a bevelled belt
// (extruded shape with a hole), four gimballed thruster pods on curved
// arms, a shader "eye" at the nose, a crown with a ring of scrolling
// program code (it runs the player's scripts), a solar wing that tracks
// the light, fuel tanks with a live gauge, and the laser "print" emitter
// under the belly (the in-game print() writes text into a gas cloud with
// a laser). Nose along +X like every ShipKit model.

// A horizontal strip of program text (the drone's own language), for a
// scrolling additive band. Tiles horizontally.
function makeCodeBand({ seed = 41 } = {}) {
  const rand = rng(seed);
  const [c, ctx] = canvas(1024, 64);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1024, 64);
  const words = ["move(10)", "turn(90)", "attack()", "while (fuel() > 10)", "if (nearPlanet())", "repeat (4)",
                 "print(\"...\")", "def side(l)", "return x * x", "wait(1)", "x = x + 1", "{", "}", "0110 1001"];
  ctx.font = '500 24px "IBM Plex Mono", "Courier New", monospace';
  ctx.textBaseline = "middle";
  for (let x = 10; x < 990;) {
    const w = words[Math.floor(rand() * words.length)];
    ctx.fillStyle = rand() < 0.2 ? "#f8bb56" : "#4fe3c6";
    ctx.globalAlpha = 0.55 + rand() * 0.45;
    ctx.fillText(w, x, 32);
    x += ctx.measureText(w).width + 26;
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  return t;
}

// The optic: concentric iris rings and spokes in polar coordinates around
// the eye's +X axis, a dark pupil with a hot rim, and a Fresnel sheen.
function makeEyeMaterial(U) {
  return new THREE.ShaderMaterial({
    // uOn: brightness (offline dims it), uFlare: firing flash, uScan: teal while scanning
    uniforms: { uTime: U.uTime, uOn: { value: 1 }, uFlare: { value: 0 }, uScan: { value: 0 } },
    vertexShader: `
      varying vec3 vP; varying vec3 vN; varying vec3 vView;
      void main(){
        vP = normalize(position);
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; uniform float uFlare; uniform float uScan;
      varying vec3 vP; varying vec3 vN; varying vec3 vView;
      void main(){
        float ang = acos(clamp(vP.x, -1.0, 1.0));             // 0 at the pupil's center
        float phi = atan(vP.z, vP.y);
        float rings = 0.5 + 0.5 * sin(ang * 30.0 - uTime * 3.0);
        float spokes = 0.5 + 0.5 * sin(phi * 24.0 + uTime * 0.5);
        float iris = smoothstep(0.95, 0.5, ang);
        float pupil = smoothstep(0.14, 0.2, ang);
        vec3 amber = vec3(1.0, 0.68, 0.24), teal = vec3(0.25, 0.9, 0.8);
        vec3 irisCol = mix(amber, teal, smoothstep(0.25, 0.85, ang)) * (0.6 + 0.4 * rings) * (0.85 + 0.15 * spokes);
        irisCol = mix(irisCol, teal * 1.4, uScan * 0.85);
        vec3 col = mix(vec3(0.02, 0.025, 0.035), irisCol * 1.5, iris) * pupil;
        col += (1.0 - smoothstep(0.0, 0.05, abs(ang - 0.18))) * mix(amber, teal, uScan) * 1.4;  // hot pupil rim
        col += uFlare * vec3(1.0, 0.85, 0.55) * (1.0 - smoothstep(0.0, 1.0, ang)) * 1.6;
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.0);
        col = col * uOn + fres * vec3(0.9, 0.8, 0.6) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The print laser: moving dashes along the beam, bright where it faces the
// camera. Additive, so alpha 1 and the intensity rides in RGB (see the
// plume gotcha in docs/ship.md). uOn fades it in and out.
function makeBeamMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uOn: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 2.0);
        float dash = step(0.35, fract(vUv.y * 14.0 - uTime * 6.0));
        float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float a = edge * (0.55 + 0.45 * dash) * fade * uOn;
        gl_FragColor = vec4(vec3(1.0, 0.45, 0.2) * a * 2.4 + vec3(a * edge * 0.7), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

SHIP_DEFS.push({
  id: "scribe",
  name: "DR-01 SCRIBE",
  camera: [5.6, 3.3, 6.8],
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 13, size: 1024, base: [208, 160, 78], minPanel: 60, maxPanel: 200,
      stripes: [{ y: 0.30, h: 0.018, color: "#5f77f7" }, { y: 0.70, h: 0.018, color: "#5f77f7" }],
    });
    for (const k of ["map", "roughnessMap", "bumpMap", "emissiveMap"]) hullTex[k].repeat.set(2, 2);
    const brushed = makeBrushed({ seed: 8, tint: [168, 172, 184], rings: 4 });
    const solar = makeSolarCells({});
    const code = makeCodeBand({});
    code.repeat.set(2, 1);
    trackTextures(...Object.values(hullTex), brushed, solar, code);

    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.02,
        metalness: 0.75, roughness: 0.5, flatShading: true }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x353a46, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.26 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      throat: new THREE.MeshBasicMaterial({ color: 0xffd7a0 }),
      solar: new THREE.MeshStandardMaterial({ map: solar, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide }),
      code: new THREE.MeshBasicMaterial({ map: code, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide }),
      gauge: new THREE.MeshStandardMaterial({ color: 0x0a3a32, emissive: 0x4fe3c6, emissiveIntensity: 2.2 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0x0a2a26, emissive: 0x4fe3c6, emissiveIntensity: 1.8,
        metalness: 0.2, roughness: 0.2, flatShading: true }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets(), G = glowTextures();
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();
    const body = new THREE.Group(); // everything bobs gently while hovering
    const shipPart = partsOf(ship);   // what doesn't bob with the body (the sweep ring, the exhaust)
    const part = partsOf(body);   // named parts (see partsOf)
    body.userData.dynamic = true;   // animated: merged as its own unit (see mergeStatic)
    ship.add(body);

    // ---- 1. Hull: an octahedron stretched along X, flat-shaded facets.
    // Nearly regular, slightly longer than tall and wide, like the game's
    // drone. Half extents: L (nose at +L), H (up), W (sideways); the hull's
    // section at height y is a rhombus (L, W)·(1 - |y|/H).
    const L = 1.5, H = 1.35, W = 1.15;
    const hullGeo = new THREE.OctahedronGeometry(1, 0);
    hullGeo.scale(L, H, W);
    part("hull").add(shadowed(new THREE.Mesh(hullGeo, M.hull)));
    const V = [new THREE.Vector3(L, 0, 0), new THREE.Vector3(-L, 0, 0), new THREE.Vector3(0, 0, W), new THREE.Vector3(0, 0, -W)];
    const TOP = new THREE.Vector3(0, H, 0), BOTTOM = new THREE.Vector3(0, -H, 0);

    // ---- 2. Edge frame: one InstancedMesh of cylinders, each aligned to a
    // hull edge (matrix = midpoint + rotation from +Y to the edge + length).
    {
      const edges = [];
      for (const v of V) edges.push([v, TOP], [v, BOTTOM]);
      const frame = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, seg(10, 4)), M.gold, edges.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      edges.forEach(([a, b], i) => {
        const dir = b.clone().sub(a), len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
        frame.setMatrixAt(i, m);
      });
      frame.castShadow = frame.receiveShadow = true;
      part("frame").add(frame);
      for (const p of [TOP, BOTTOM]) {
        const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, seg(16, 6), seg(12, 4)), M.gold));
        cap.position.copy(p); part("frame").add(cap);
      }
    }

    // ---- 3. Belt: an extruded rhombus with a rhombus hole, bevelled,
    // around the waist; hex bolts along it (instanced).
    {
      const outer = new THREE.Shape();
      outer.moveTo(1.74, 0); outer.lineTo(0, 1.34); outer.lineTo(-1.74, 0); outer.lineTo(0, -1.34); outer.lineTo(1.74, 0);
      const hole = new THREE.Path();
      hole.moveTo(1.44, 0); hole.lineTo(0, -1.1); hole.lineTo(-1.44, 0); hole.lineTo(0, 1.1); hole.lineTo(1.44, 0);
      outer.holes.push(hole);
      const beltGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.12, steps: 1, ...bevel(0.04, 0.04) });
      beltGeo.translate(0, 0, -0.06);
      const belt = shadowed(new THREE.Mesh(beltGeo, M.gold));
      belt.rotation.x = Math.PI / 2; // shape y -> world z
      part("belt").add(belt);
      const count = seg(40, 12);
      const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6), M.dark, count);
      const m = new THREE.Matrix4(), corners = [[1.6, 0], [0, 1.23], [-1.6, 0], [0, -1.23]];
      for (let i = 0; i < count; i++) {
        const f = i / count * 4, k = Math.floor(f), t = f - k;
        const a = corners[k], b = corners[(k + 1) % 4];
        m.makeTranslation(a[0] + (b[0] - a[0]) * t, 0.11, a[1] + (b[1] - a[1]) * t);
        bolts.setMatrixAt(i, m);
      }
      part("belt").add(bolts);
    }

    // ---- 4. Thruster pods on curved arms (tube along a Catmull-Rom curve),
    // each pod gimballed so it can swivel; the engine itself is makeEngineSet's.
    const pods = [], engines = makeEngineSet(M, U, seg), plumeMat = makePlumeMaterial(0xffb45a, U);
    const podDefs = [[0.8, 0.69, 0.9], [0.8, -0.69, 0.9], [-0.9, 0.61, -1.3], [-0.9, -0.61, -1.3]]; // [anchorX, anchorZ, podX]
    for (const [ax, az, px] of podDefs) {
      const side = Math.sign(az), podPos = new THREE.Vector3(px, 0.18, 2.0 * side);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ax, 0, az), new THREE.Vector3((ax + px) / 2, 0.4, 1.45 * side), podPos.clone(),
      ]);
      part("thrusters").add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(24, 4), 0.075, seg(10, 4), false), M.dark)));
      const sleeve = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, seg(8), seg(20, 6)), M.gold));
      const sp = curve.getPoint(0.5), st = curve.getTangent(0.5);
      sleeve.position.copy(sp); sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), st);
      part("thrusters").add(sleeve);

      const gimbal = new THREE.Group();
      gimbal.userData.dynamic = true;
      gimbal.position.copy(podPos);
      part("thrusters").add(gimbal);
      engines.add(gimbal, new THREE.Vector3(), { radius: 0.2, length: 0.85, color: 0xffb45a, plumeMat, taper: 1.1, intake: 0.14,
        cone: [0.6, 1.3], bell: [0.45, 1.3], plume: 8, glow: 4.5, res: 0.75 });
      pods.push({ gimbal, phase: pods.length * 1.7, side });
    }

    // ---- 5. The eye: a shader optic in a gold collar at the nose.
    const eyeMount = new THREE.Group();
    // Far enough forward that the sphere swallows the belt's pointed tip
    // (outer rhombus reaches x = 1.74), which otherwise pokes through the iris.
    eyeMount.position.set(L + 0.12, 0, 0);
    part("eye").add(eyeMount);
    const eyeMat = makeEyeMaterial(U);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.38, seg(40, 10), seg(28, 8)), eyeMat);
    eye.userData.dynamic = true;
    eyeMount.add(eye);
    const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.065, seg(12, 4), seg(40, 8)), M.gold));
    collar.rotation.y = Math.PI / 2; collar.position.x = -0.08;
    eyeMount.add(collar);

    // ---- 6. Crown: a crystal floating in a ring of scrolling program code.
    const crown = new THREE.Group();
    crown.position.copy(TOP);
    part("crown").add(crown);
    // per-model copies (sharing textures) so one drone going offline dims only itself
    const codeMat = M.code.clone(), crystalMat = M.crystal.clone(), gaugeMat = M.gauge.clone();
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, seg(48, 12), 1, true), codeMat);
    halo.userData.dynamic = true;
    halo.position.y = 0.36; crown.add(halo);
    for (const y of [0.2, 0.52]) {
      const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, seg(6, 3), seg(48, 12)), M.gold));
      rim.rotation.x = Math.PI / 2; rim.position.y = y; crown.add(rim);
    }
    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), crystalMat);
    crystal.userData.dynamic = true;
    crystal.position.y = 0.36; crown.add(crystal);
    const crownGlow = additiveSprite(G.core, 0x4fe3c6);
    crownGlow.scale.setScalar(1.1); crownGlow.position.y = 0.36; crown.add(crownGlow);

    // ---- 7. Solar wing on a mast: a hinge bar with two cell panels that
    // slowly track the light.
    const wing = new THREE.Group();
    wing.position.set(-0.75, H * 0.5, 0);
    part("solar").add(wing);
    const mast = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, seg(12, 6)), M.dark));
    mast.position.y = 0.25; wing.add(mast);
    const hinge = new THREE.Group();
    hinge.userData.dynamic = true;
    hinge.position.y = 0.52; wing.add(hinge);
    const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.7, seg(10, 4)), M.gold));
    bar.rotation.x = Math.PI / 2; hinge.add(bar);
    for (const s of [1, -1]) {
      const panel = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.46), M.solar));
      panel.rotation.x = -Math.PI / 2; panel.rotation.z = Math.PI / 2;
      panel.position.z = 0.78 * s; hinge.add(panel);
    }

    // ---- 8. Fuel tanks: lathed capsules under the waist, each with a glowing
    // gauge whose length follows the fuel level.
    const gauges = [];
    for (const s of [1, -1]) {
      const cap = [], R = 0.19, half = 0.45, n = seg(8, 3);
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; cap.push(new THREE.Vector2(Math.cos(a) * R + 0.0001, -half + Math.sin(a) * R)); }
      for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; cap.push(new THREE.Vector2(Math.cos(a) * R + 0.0001, half + Math.sin(a) * R)); }
      const tank = shadowed(new THREE.Mesh(new THREE.LatheGeometry(cap, seg(24, 8)), M.engine));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(-0.1, -0.75, 0.55 * s);
      part("tanks").add(tank);
      const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), gaugeMat);
      gauge.geometry.translate(0.45, 0, 0); // grows from its left end
      gauge.position.set(-0.55, -0.75, (0.55 + 0.19) * s);
      part("tanks").add(gauge);
      gauge.userData.dynamic = true;
      gauges.push(gauge);
    }

    // ---- 9. The print laser: a turret under the belly with a swept beam and
    // a glowing hit point at its end.
    const turret = new THREE.Group();
    turret.position.copy(BOTTOM);
    part("laser").add(turret);
    turret.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, seg(24, 8), seg(16, 6)), M.dark)));
    const emitter = new THREE.Group();
    emitter.userData.dynamic = true;
    turret.add(emitter);
    const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.4, seg(12, 6)), M.gold));
    barrel.position.y = 0.2; emitter.add(barrel);
    const beamLen = 2.2, beamMat = makeBeamMaterial(U);
    const beamGeo = new THREE.CylinderGeometry(0.022, 0.022, beamLen, seg(12, 6), 1, true);
    beamGeo.translate(0, beamLen / 2 + 0.4, 0);
    emitter.add(new THREE.Mesh(beamGeo, beamMat));
    const hit = additiveSprite(G.engine, 0xff7a45);
    hit.position.y = beamLen + 0.4; hit.scale.setScalar(0.7); emitter.add(hit);
    const aimDown = -Math.PI / 2 - 0.35; // +y turned forward (+x) and a little down

    // ---- 10. Sensor sweep: a dashed ring around the drone.
    const ringPts = [];
    for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0)); }
    const sweep = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineDashedMaterial({ color: 0x4fe3c6, dashSize: 0.2, gapSize: 0.14, transparent: true, opacity: 0.55 }));
    sweep.computeLineDistances();
    sweep.rotation.x = 0.28;
    shipPart("sweep").add(sweep);

    // ---- 11. Navigation lights.
    const nav = makeNavLights(part("lights"), [
      { color: 0x33ff77, pos: [-1.5, 0.4, 2.0], size: 0.55 },
      { color: 0xff3344, pos: [-1.5, 0.4, -2.0], size: 0.55 },
      { color: 0xffffff, pos: [-L - 0.15, 0, 0], size: 0.7, kind: "strobe" },
      { color: 0xffffff, pos: [0, H + 0.62, 0], size: 0.5, kind: "strobe", phase: 0.5 },
    ]);

    // ---- 12. Exhaust particles from the four pods.
    const exhaust = makeExhaust(shipPart("exhaust"), U, { count: 240, seed: 91, rate: [1.1, 0.7], grow: 1.6,
      emitters: podDefs.map((d) => ({ pos: [d[2] - 0.65, 0.18, 2.0 * Math.sign(d[1])], spread: 0.18, length: 2.2 })) });

    // ---- actions: laser bolts from the eye, a scan wave from the crown,
    // and print() — the belly laser writes a word into a cloud of gas, like
    // the game's print(). Offline: the drone sinks and lists, its eye, code
    // ring ("switched-off lettering"), crystal and gauges go dark.
    const bolts = makeBoltPool(ship, env, 0xffb45a, { count: 10, length: 0.7, radius: 0.04 });
    const wave = makeScanWave(ship, env, 0x4fe3c6);
    const host = fxHost(ship, env);
    const cloudMat = new THREE.SpriteMaterial({ map: fxTextures().smoke, color: 0xd8d2c8, transparent: true, depthWrite: false, opacity: 0 });
    const cloud = new THREE.Sprite(cloudMat);
    const word = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture("HELLO"), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    cloud.visible = word.visible = false;
    host.add(cloud, word);
    const actions = [
      { id: "fire", label: "FIRE LASER", kind: "trigger" },
      { id: "scan", label: "SCAN", kind: "trigger" },
      { id: "print", label: "PRINT", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue();
    let scanT = 0, printT = -1, flareT = 0, placed = false;
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;                              // a switched-off drone does nothing
      // act("fire", { target }): world-space aim point, else along the eye's gaze
      if (id === "fire") shots.schedule([0, 0.14, 0.28].map((delay) => ({ delay, tg: on && on.target })));
      if (id === "scan") { scanT = 2.2; wave.start(new THREE.Vector3(0, H + 0.36, 0).add(body.position), 9); }
      // act("print", { text }) writes that text (default HELLO)
      if (id === "print" && printT < 0) {
        printT = 0;
        word.material.map = textTexture(on && on.text ? String(on.text).slice(0, 24) : "HELLO");
      }
    }
    const tmp = new THREE.Vector3(), eyeDir = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpR = new THREE.Vector3();
    let printK = 1;

    // ---- animation
    let fuel = 1, eyeYaw = 0, eyePitch = 0;
    // moving parts run on the model's own motion clock (mt, advanced by dt),
    // lights and shaders on t: with dt 0 (the ship lab's STOP ANIMATIONS)
    // the drone stands still while its lights keep going
    let mt = 0;
    function update(t, dt, { power: throttle = 1, particles: particlesOn = true } = {}) {
      const online = power.update(dt), offline = power.offline;
      mt += dt;
      U.uTime.value = t;
      U.uPower.value = throttle * (0.9 + 0.1 * Math.sin(t * 33.0) * Math.sin(t * 13.0));
      body.position.y = Math.sin(mt * 1.3) * 0.08 * online - 0.3 * (1 - online);   // hover bob / sink
      body.rotation.x = Math.sin(mt * 0.9) * 0.03 * online;
      body.rotation.z = Math.sin(mt * 0.7) * 0.02 * online + 0.14 * (1 - online);  // lists when dead

      for (const p of pods) {                                   // thrust vectoring
        p.gimbal.rotation.y = Math.sin(mt * 0.8 + p.phase) * 0.18 * throttle;
        p.gimbal.rotation.z = Math.sin(mt * 1.1 + p.phase) * 0.08 * online;
      }
      engines.update(t, throttle);

      // eye: short glances to new targets every ~1.3 s, eased (frozen offline)
      if (!offline) {
        const k = Math.floor(mt / 1.3), h1 = Math.sin(k * 12.9898) * 43758.5453, h2 = Math.sin(k * 78.233) * 12543.123;
        eyeYaw += ((h1 - Math.floor(h1) - 0.5) * 0.9 - eyeYaw) * Math.min(1, dt * 8);
        eyePitch += ((h2 - Math.floor(h2) - 0.5) * 0.5 - eyePitch) * Math.min(1, dt * 8);
      }
      eye.rotation.set(0, eyeYaw, eyePitch);
      flareT = Math.max(0, flareT - dt * 3); scanT = Math.max(0, scanT - dt);
      eyeMat.uniforms.uOn.value = 0.05 + 0.95 * online;
      eyeMat.uniforms.uFlare.value = flareT;
      eyeMat.uniforms.uScan.value = Math.min(1, scanT);

      // The code texture is shared by every drone: set its scroll from the
      // clock (not += dt), or N drones on screen would scroll it N times as fast.
      M.code.map.offset.x = (-t * 0.06) % 1;
      codeMat.color.setScalar(0.06 + 0.94 * online);
      halo.rotation.y += dt * 0.25 * online;
      crystal.rotation.y += dt * 1.1 * online; crystal.rotation.x += dt * 0.5 * online;
      crystalMat.emissiveIntensity = 1.8 * online;
      crownGlow.material.opacity = (0.6 + 0.3 * Math.sin(t * 2.1)) * online;
      gaugeMat.emissiveIntensity = 2.2 * online;

      hinge.rotation.z = Math.sin(mt * 0.25) * 0.35 * online;   // solar tracking
      sweep.rotation.y += dt * (scanT > 0 ? 3.5 : 0.4);

      fuel = clamp(fuel + (throttle > 0.5 ? -0.04 : 0.12 * online) * dt, 0.12, 1);
      for (const g of gauges) g.scale.x = fuel;

      // fire: bolts leave the eye along its gaze
      shots.run(t, (sh) => {
        eyeDir.set(1, 0, 0).applyEuler(eye.rotation);
        tmp.copy(eyeMount.position).addScaledVector(eyeDir, 0.42).add(body.position);
        bolts.fire(tmp, eyeDir, sh.tg); flareT = 1;
      });
      bolts.update(dt); wave.update(dt);

      // print: the beam writes for 2.4 s, the word stays in its gas cloud, then fades
      const writing = printT >= 0 && printT < 2.4 && !offline;
      emitter.rotation.set(writing ? Math.sin(mt * 2.2) * 0.35 : 0, 0, aimDown + (writing ? Math.sin(mt * 1.4) * 0.12 : 0));
      if (printT >= 0) {
        if (!placed) {
          ship.updateMatrixWorld(true);
          hit.getWorldPosition(tmp); host.worldPoint(tmp);
          printK = ship.getWorldScale(tmpS).x / host.root.getWorldScale(tmpR).x;
          cloud.position.copy(tmp); word.position.copy(tmp).y += 0.1 * printK;
          cloud.visible = word.visible = placed = true;
        }
        printT += dt;
        const grow = Math.min(1, printT / 0.8), fade = printT < 3.6 ? 1 : Math.max(0, 1 - (printT - 3.6) / 1.6);
        cloud.scale.setScalar((1.4 + 1.8 * grow + printT * 0.2) * printK);
        cloudMat.opacity = 0.5 * grow * fade;
        word.scale.set(2.3 * printK, 0.58 * printK, 1);
        word.material.opacity = Math.min(1, printT / 2.4) * fade;
        if (printT > 5.2) { printT = -1; placed = false; cloud.visible = word.visible = false; }
      }
      beamMat.uniforms.uOn.value += ((writing ? 1 : 0) - beamMat.uniforms.uOn.value) * Math.min(1, dt * 8);
      hit.material.opacity = beamMat.uniforms.uOn.value * (0.7 + 0.3 * Math.sin(t * 50));

      nav.update(t);
      exhaust.update(dt, throttle, particlesOn, body.position.y);
    }
    function setLights(on) { nav.setVisible(on); sweep.visible = on; }
    return { group: ship, update, setLights, actions, act };
  },
});
})();
