/* =======================================================================
   SHIPKIT · CODEWING — one ship definition (see js/shipkit/shipkit.js,
   "SHIP DEFINITIONS", and docs/ship.md). A classic script loaded after
   shipkit.js: it pushes its entry into ShipKit.SHIP_DEFS and builds with
   ShipKit's blocks and helpers (ShipKit._).
   ======================================================================= */
(function () {
"use strict";
const { GOLD, BLUE, additiveSprite, detailHelpers, glowTextures, labelKey, makeBoltPool, makeBrushed, makeCoreMaterial, makeEngineSet, makeExhaust, makeNavLights, makeOnlineFader, makePlating, makeScanWave, makeShotQueue, partsOf, rng, shadowed, sharedMaterials, strut, trackTextures } = ShipKit._;
const SHIP_DEFS = ShipKit.SHIP_DEFS;

// ---------------------------------------------------------------------
// SP-01 CODEWING
// ---------------------------------------------------------------------
SHIP_DEFS.push({
  id: "codewing",
  name: "SP-01 CODEWING",
  camera: [9.5, 4.2, 11.5],
  _assets: null,
  // labels { name, sub }: the hull's lettering (default "SP-01" / "SWARM
  // PROTOCOL"); each pair gets its own texture set, the default one shared
  assets(labels) {
    const key = labelKey(labels);
    this._assets = this._assets || {};
    if (this._assets[key]) return this._assets[key];
    const tag = (labels && labels.name) || "SP-01", motto = (labels && labels.sub) || "SWARM PROTOCOL";
    const hullTex = makePlating({
      seed: 5, base: [156, 162, 176],
      stripes: [{ y: 0.10, h: 0.028, color: "#f8bb56" }, { y: 0.142, h: 0.012, color: "#5f77f7" },
                { y: 0.80, h: 0.02, color: "#5f77f7" }],
      // rotation per side so the text reads upright from both flanks (+z / -z)
      markings: [
        { text: tag, x: 0.07, y: 0.36, rot: -Math.PI / 2, size: 44, color: "#f8bb56", max: 300 },
        { text: tag, x: 0.57, y: 0.36, rot: Math.PI / 2, size: 44, color: "#f8bb56", max: 300 },
        { text: motto, x: 0.93, y: 0.56, rot: -Math.PI / 2, size: 26, color: "#dfe6ff", max: 300 },
        { text: motto, x: 0.43, y: 0.56, rot: Math.PI / 2, size: 26, color: "#dfe6ff", max: 300 },
      ],
      windows: [{ x: 0.0, y: 0.47, count: 9, gap: 0.022 }, { x: 0.5, y: 0.47, count: 9, gap: 0.022 },
                { x: 0.99, y: 0.47, count: 9, gap: 0.022 }],
    });
    const wingTex = makePlating({ seed: 9, size: 1024, base: [118, 124, 140], minPanel: 60, maxPanel: 200,
      stripes: [{ y: 0.0, h: 0.03, color: "#f8bb56" }] });
    for (const k of ["map", "roughnessMap", "bumpMap"]) wingTex[k].repeat.set(0.16, 0.16);
    const brushed = makeBrushed({ seed: 4 });
    brushed.repeat.set(2, 1);
    trackTextures(...Object.values(hullTex), ...Object.values(wingTex), brushed);

    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.018,
        emissiveMap: hullTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4,
        metalness: 0.78, roughness: 0.62 }),
      wing: new THREE.MeshStandardMaterial({
        map: wingTex.map, roughnessMap: wingTex.roughnessMap, bumpMap: wingTex.bumpMap, bumpScale: 0.015,
        metalness: 0.8, roughness: 0.6 }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3a404d, metalness: 0.85, roughness: 0.42 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.28 }),
      blueGlow: new THREE.MeshStandardMaterial({ color: 0x223066, emissive: BLUE, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x6f9dff, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
        transparent: true, opacity: 0.55, envMapIntensity: 2.2 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      dish: new THREE.MeshStandardMaterial({ color: 0xd9dde6, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
      reactor: new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: GOLD, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.3 }),
      throat: new THREE.MeshBasicMaterial({ color: 0xbfd0ff }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets[key] = a);
  },

  build(detail, env) {
    const M = this.assets(env && env.labels), G = glowTextures();
    const U = { uTime: { value: 0 }, uPower: { value: 1 }, uOn: { value: 1 } }; // per-model shader uniforms
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();
    const part = partsOf(ship);   // named parts (see partsOf)

    // ---- 1. Fuselage: lathe of a smooth spline profile, axis along +X.
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -4.25), new THREE.Vector2(0.95, -4.1), new THREE.Vector2(1.18, -3.4),
      new THREE.Vector2(1.24, -1.6), new THREE.Vector2(1.2, 0.4), new THREE.Vector2(1.02, 2.0),
      new THREE.Vector2(0.72, 3.3), new THREE.Vector2(0.38, 4.35), new THREE.Vector2(0.1, 5.05),
      new THREE.Vector2(0.001, 5.2),
    ]).getSpacedPoints(seg(90, 12));
    const hullMat = M.hull.clone(); // per model: its lit windows go dark when offline (shares the textures)
    const fuselage = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, seg(96, 8)), hullMat));
    fuselage.rotation.z = -Math.PI / 2;
    fuselage.scale.set(1, 1, 0.92); // slightly flattened sideways (local z = world z)
    part("hull").add(fuselage);
    const radiusAt = (y) => { // hull radius at lathe height y (for placing parts)
      for (let i = 1; i < profile.length; i++) {
        if (profile[i].y >= y) {
          const a = profile[i - 1], b = profile[i], t = (y - a.y) / (b.y - a.y || 1);
          return a.x + (b.x - a.x) * t;
        }
      }
      return 0;
    };

    // ---- 2. Greebles: instanced boxes on the hull, aligned to its normal.
    {
      const rand = rng(21), count = Math.round(110 * Math.min(detail, 1.5));
      const g = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.dark, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      let n = 0;
      while (n < count) {
        const y = -3.6 + rand() * 6.2, phi = rand() * Math.PI * 2;
        // keep the flanks with windows/markings clean
        if (Math.abs(Math.cos(phi)) > 0.85 && y > -1 && y < 2.2) continue;
        const r = radiusAt(y);
        const normal = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
        q.setFromUnitVectors(up, normal);
        const s = new THREE.Vector3(0.05 + rand() * 0.16, 0.02 + rand() * 0.05, 0.05 + rand() * 0.24);
        m.compose(normal.clone().multiplyScalar(r + s.y * 0.4).add(new THREE.Vector3(0, y, 0)), q, s);
        g.setMatrixAt(n++, m);
      }
      g.castShadow = g.receiveShadow = true;
      fuselage.add(g);
    }

    // ---- 3. Cockpit canopy (glass half sphere) + gold frame.
    {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, seg(48, 8), seg(24, 4), 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
      canopy.scale.set(1.9, 0.75, 0.9);
      canopy.position.set(2.55, 0.86, 0);
      part("cockpit").add(canopy);
      const frame = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, seg(12), seg(64, 8)), M.gold));
      frame.rotation.x = Math.PI / 2; frame.scale.set(1.9, 0.9, 1); frame.position.copy(canopy.position);
      part("cockpit").add(frame);
      const spine = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, seg(8), seg(48, 6), Math.PI), M.gold));
      spine.scale.set(1.9, 0.75, 1); spine.position.copy(canopy.position);
      part("cockpit").add(spine);
    }

    // ---- 4. Wings: extruded swept shapes with bevels, mirrored.
    const wingShape = (k) => {
      const s = new THREE.Shape();
      s.moveTo(1.2, 0.7 * k); s.lineTo(-1.3, 0.8 * k); s.lineTo(-3.2, 4.6 * k);
      s.lineTo(-3.9, 4.75 * k); s.lineTo(-3.6, 1.0 * k); s.lineTo(-3.4, 0.7 * k); s.lineTo(1.2, 0.7 * k);
      return s;
    };
    for (const side of [1, -1]) {
      const wing = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape(side), { depth: 0.14, steps: 1, ...bevel(0.05, 0.05) }), M.wing));
      wing.rotation.x = Math.PI / 2; // shape y -> world z, extrusion -> world -y
      wing.position.y = -0.08;
      part("wings").add(wing);
      const edge = new THREE.LineCurve3(new THREE.Vector3(-1.3, -0.15, 0.82 * side), new THREE.Vector3(-3.2, -0.15, 4.62 * side));
      part("wings").add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(edge, seg(20, 2), 0.05, seg(10), false), M.gold)));
      // wingtip pod: cylinder + two hemispheres + cannon
      const pod = new THREE.Group();
      pod.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, seg(24, 6)), M.engine)));
      for (const e of [1, -1]) {
        const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, seg(24, 6), seg(12, 3), 0, Math.PI * 2, 0, Math.PI / 2), M.engine));
        cap.position.y = 0.8 * e; if (e < 0) cap.rotation.x = Math.PI;
        pod.add(cap);
      }
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, seg(12)), M.dark));
      barrel.position.y = 1.3; pod.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, seg(8), seg(20, 6)), M.gold);
      muzzle.position.y = 1.85; muzzle.rotation.x = Math.PI / 2; pod.add(muzzle);
      pod.rotation.z = -Math.PI / 2;
      pod.position.set(-3.35, -0.12, 4.72 * side);
      part("wings").add(pod);
      const fin = new THREE.Shape();
      fin.moveTo(0, 0); fin.lineTo(-0.9, 0); fin.lineTo(-1.1, 0.75); fin.lineTo(-0.75, 0.75); fin.lineTo(0, 0);
      const winglet = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.05, ...bevel(0.02, 0.02) }), M.wing));
      winglet.position.set(-2.75, -0.02, 4.4 * side - 0.025);
      part("wings").add(winglet);
    }

    // ---- 5. Engines: two nacelles + the main drive (makeEngineSet).
    const engines = makeEngineSet(M, U, seg);
    const nacelle = { radius: 0.52, length: 2.8, color: 0x7f9bff, heatMat: M.blueGlow };
    engines.add(part("engines"), new THREE.Vector3(-3.1, -0.15, 1.75), nacelle);
    engines.add(part("engines"), new THREE.Vector3(-3.1, -0.15, -1.75), nacelle);
    engines.add(part("engines"), new THREE.Vector3(-4.55, 0, 0), { radius: 0.72, length: 1.2, color: 0xffb45a, heatMat: M.blueGlow });
    for (const side of [1, -1]) {
      const pylon = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.9), M.dark));
      pylon.position.set(-2.9, -0.15, 1.15 * side);
      part("engines").add(pylon);
    }

    // ---- 6. Gyro ring with chase lights (instanced spheres, colors animated).
    const gyro = new THREE.Group();
    gyro.position.set(-0.9, 0, 0);
    gyro.rotation.y = Math.PI / 2; // torus lies in the YZ plane, around the X axis
    part("gyro").add(gyro);
    const spinner = new THREE.Group(); // everything that rotates with the ring
    spinner.userData.dynamic = true;
    gyro.add(spinner);
    const ringR = 2.25;
    spinner.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.11, seg(20, 4), seg(160, 16)), M.engine)));
    for (const z of [0.11, -0.11]) {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.035, seg(8), seg(160, 16)), M.gold);
      trim.position.z = z; spinner.add(trim);
    }
    const LIGHTS = 48;
    const chase = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, seg(10, 4), seg(8, 3)), new THREE.MeshBasicMaterial({ color: 0xffffff }), LIGHTS);
    {
      const m = new THREE.Matrix4();
      for (let i = 0; i < LIGHTS; i++) {
        const a = i / LIGHTS * Math.PI * 2;
        m.makeTranslation(Math.cos(a) * (ringR + 0.12), Math.sin(a) * (ringR + 0.12), 0);
        chase.setMatrixAt(i, m);
        chase.setColorAt(i, new THREE.Color(0x000000));
      }
    }
    spinner.add(chase);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const strut = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, ringR - 1.05, seg(12)), M.dark));
      const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      strut.position.copy(dir.clone().multiplyScalar((ringR + 1.1) / 2)).add(new THREE.Vector3(-0.9, 0, 0));
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      part("gyro").add(strut);
    }

    // ---- 7. Logic core: icosahedron crystal + octahedron edge cage + cradle.
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0.35, 1.72, 0);
    part("core").add(coreGroup);
    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, detail >= 1.5 ? 1 : 0), makeCoreMaterial(U));
    crystal.userData.dynamic = true;
    coreGroup.add(crystal);
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.55, 0)), new THREE.LineBasicMaterial({ color: GOLD }));
    coreGroup.add(cage);
    const cradle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 0.35, 6), M.gold));
    cradle.position.y = -0.5; coreGroup.add(cradle);
    const coreGlow = additiveSprite(G.core);
    coreGlow.scale.setScalar(1.8); coreGroup.add(coreGlow);

    // ---- 8. Dorsal fin (extruded) + antenna mast (tube along a curve).
    {
      const s = new THREE.Shape();
      s.moveTo(-1.6, 0); s.lineTo(-3.9, 0); s.lineTo(-4.4, 1.5); s.lineTo(-3.7, 1.55); s.lineTo(-1.6, 0);
      const fin = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.12, ...bevel(0.04, 0.04) }), M.wing));
      fin.position.set(0, 0.95, -0.06);
      part("fin").add(fin);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.9, 2.45, 0), new THREE.Vector3(-4.3, 3.1, 0), new THREE.Vector3(-5.1, 3.35, 0),
      ]);
      part("fin").add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(30, 4), 0.035, seg(8), false), M.dark)));
    }
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, seg(16, 6), seg(12, 4)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    antennaTip.position.set(-5.1, 3.35, 0);
    part("fin").add(antennaTip);

    // ---- 9. Sensor dish + torus-knot reactor in a glass bulb.
    {
      const mount = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, seg(16, 6)), M.dark));
      mount.position.set(1.2, -1.2, 0); part("sensors").add(mount);
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, seg(40, 8), seg(16, 3), 0, Math.PI * 2, 0, 0.62), M.dish));
      dish.rotation.x = Math.PI; dish.position.set(1.2, -0.72, 0); part("sensors").add(dish);
      const horn = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, seg(12)), M.gold));
      horn.position.set(1.2, -1.38, 0); horn.rotation.x = Math.PI; part("sensors").add(horn);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, seg(40, 8), seg(24, 4)), M.glass);
      bulb.position.set(-1.9, -1.2, 0); part("sensors").add(bulb);
      const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.25, seg(32, 6)), M.engine));
      collar.position.set(-1.9, -0.85, 0); part("sensors").add(collar);
    }
    const reactor = new THREE.Mesh(new THREE.TorusKnotGeometry(0.17, 0.045, seg(128, 16), seg(12, 3), 2, 3), M.reactor);
    reactor.userData.dynamic = true;
    reactor.position.set(-1.9, -1.22, 0);
    part("sensors").add(reactor);

    // ---- 10. Nose: RCS blocks (dodecahedra) + sensor tip.
    for (const side of [1, -1]) {
      const rcs = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), M.dark));
      rcs.position.set(3.7, 0.05, 0.52 * side); part("nose").add(rcs);
    }
    const noseTip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9, seg(12)), M.gold));
    noseTip.rotation.z = -Math.PI / 2; noseTip.position.set(5.6, 0, 0); part("nose").add(noseTip);

    // ---- 11. Navigation lights.
    const nav = makeNavLights(part("lights"), [
      { color: 0x33ff77, pos: [-3.95, -0.1, 4.85], size: 0.7 },
      { color: 0xff3344, pos: [-3.95, -0.1, -4.85], size: 0.7 },
      { color: 0xffffff, pos: [-5.1, 3.35, 0], size: 0.9, kind: "strobe" },
      { color: 0xffffff, pos: [5.2, 0, 0], size: 0.6, kind: "strobe", phase: 0.5 },
    ]);

    // ---- 12. Exhaust particles.
    const exhaust = makeExhaust(part("exhaust"), U, { count: 420, seed: 77, emitters: [
      { pos: [-4.6, -0.15, 1.75], spread: 0.35, length: 3.85 },
      { pos: [-4.6, -0.15, -1.75], spread: 0.35, length: 3.85 },
      { pos: [-5.4, 0, 0], spread: 0.5, length: 5.5 },
    ] });

    // ---- actions: alternating shots from the wingtip cannons, a sensor
    // ping from the dish. Offline: core, windows and gyro wind down.
    const bolts = makeBoltPool(ship, env, 0x9fb6ff, { count: 12, length: 1.1, radius: 0.05, speed: 34 });
    const wave = makeScanWave(ship, env, 0x7f95ff);
    const actions = [
      { id: "fire", label: "FIRE CANNONS", kind: "trigger" },
      { id: "scan", label: "SENSOR PING", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue();
    const muzzle = new THREE.Vector3(), forward = new THREE.Vector3(1, 0, 0);
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      // act("fire", { target }) aims at a world-space point; without one, straight ahead
      if (id === "fire") shots.schedule([0, 1, 2, 3].map((i) => ({ delay: i * 0.14, side: i % 2 ? -1 : 1, target: on && on.target })));
      if (id === "scan") wave.start(new THREE.Vector3(1.2, -1.4, 0), 13);
    }

    // ---- animation
    const tmpColor = new THREE.Color(), chaseBlue = new THREE.Color(0x7f95ff), chaseGold = new THREE.Color(GOLD);
    const chaseUnlit = new THREE.Color(0.07, 0.075, 0.09);   // a bulb with its light off
    let chaseOn = true, chaseLevel = 1, chaseLastT = null;
    // t: seconds since start, dt: frame delta (s),
    // opts.power: engine throttle 0..1 (caller may smooth it),
    // opts.particles: false to skip the exhaust particles (cheap LOD).
    function update(t, dt, { power: throttle = 1, particles: particlesOn = true } = {}) {
      const online = power.update(dt);
      U.uOn.value = online;
      hullMat.emissiveIntensity = 1.4 * online;
      U.uTime.value = t;
      U.uPower.value = throttle * (0.92 + 0.08 * Math.sin(t * 37.0) * Math.sin(t * 11.0)); // flicker
      spinner.rotation.z += dt * 0.5 * online;
      shots.run(t, (sh) => bolts.fire(muzzle.set(-1.45, -0.12, 4.72 * sh.side), forward, sh.target));
      bolts.update(dt); wave.update(dt);
      // lights fade by the clock (t), not dt: they still switch with the motion stopped
      const lightDt = chaseLastT === null ? 0 : Math.max(0, Math.min(0.1, t - chaseLastT)); chaseLastT = t;
      chaseLevel += ((chaseOn ? 1 : 0) - chaseLevel) * Math.min(1, lightDt * 14);
      for (let i = 0; i < LIGHTS; i++) {
        const p1 = ((i / LIGHTS - t * 0.35) % 1 + 1) % 1, p2 = ((i / LIGHTS - t * 0.35 + 0.5) % 1 + 1) % 1;
        const k = Math.max(Math.pow(1 - p1, 10), Math.pow(1 - p2, 10));
        // lit: the running chase; off: unlit bulbs (still there)
        tmpColor.copy(i % 6 === 0 ? chaseGold : chaseBlue).multiplyScalar(0.12 + 1.6 * k).lerp(chaseUnlit, 1 - chaseLevel);
        chase.setColorAt(i, tmpColor);
      }
      chase.instanceColor.needsUpdate = true;

      crystal.rotation.y += dt * 0.8 * online; crystal.rotation.x += dt * 0.3 * online;
      cage.rotation.y -= dt * 0.5 * online; cage.rotation.z += dt * 0.2 * online;
      coreGlow.material.opacity = (0.7 + 0.3 * Math.sin(t * 2.3)) * online;
      reactor.rotation.x += dt * 1.2 * online; reactor.rotation.y += dt * 0.7 * online;

      engines.update(t, throttle);
      nav.update(t);
      antennaTip.material.color.setScalar(((t * 0.8) % 1) < 0.06 ? 1 : 0.25);
      exhaust.update(dt, throttle, particlesOn);
    }
    function setLights(on) { nav.setVisible(on); chaseOn = on; }
    return { group: ship, update, setLights, actions, act };
  },
});
})();
