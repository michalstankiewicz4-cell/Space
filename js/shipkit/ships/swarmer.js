/* =======================================================================
   SHIPKIT · SWARMER — one ship definition (see js/shipkit/shipkit.js,
   "SHIP DEFINITIONS", and docs/ship.md). A classic script loaded after
   shipkit.js: it pushes its entry into ShipKit.SHIP_DEFS and builds with
   ShipKit's blocks and helpers (ShipKit._).
   ======================================================================= */
(function () {
"use strict";
const { GOLD, detailHelpers, makeBoltPool, makeBrushed, makeEngineSet, makeExhaust, makeNavLights, makeOnlineFader, makePlating, makePlumeMaterial, makeScanWave, makeShotQueue, partsOf, shadowed, sharedMaterials, trackTextures } = ShipKit._;
const SHIP_DEFS = ShipKit.SHIP_DEFS;

// ---------------------------------------------------------------------
// SW-01 SWARMER — the swarm's own ship
// ---------------------------------------------------------------------
// The game's swarm ship (replacing the teal cone), so it's built for
// numbers: small, readable from far away, few parts. Teal like the swarm,
// a dart-shaped hull with two gold "mandibles" at the nose — the bite
// beam emitters it eats planets with — swept fins with glowing edges, a
// sensor strip and one main engine. Composed almost entirely from the
// building blocks above; only the hull, mandibles, fins and strip are its own.
SHIP_DEFS.push({
  id: "swarmer",
  name: "SW-01 SWARMER",
  camera: [6.2, 3.0, 6.8],
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 21, size: 512, base: [96, 150, 148], minPanel: 40, maxPanel: 130,
      stripes: [{ y: 0.18, h: 0.03, color: "#4fe3c6" }, { y: 0.82, h: 0.03, color: "#4fe3c6" }],
    });
    const brushed = makeBrushed({ seed: 12, size: 256, tint: [150, 160, 168], rings: 3 });
    trackTextures(...Object.values(hullTex), brushed);
    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.015,
        metalness: 0.7, roughness: 0.5 }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c3340, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.28 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      throat: new THREE.MeshBasicMaterial({ color: 0xbffff2 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x7fe8d8, metalness: 0.1, roughness: 0.05, clearcoat: 1,
        transparent: true, opacity: 0.6, envMapIntensity: 2 }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets();
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();
    const part = partsOf(ship);   // named parts (see partsOf)
    const glowMat = M.glow.clone(); // per model: dims when offline (shares nothing heavy)

    // ---- 1. Hull: a lathed dart, flattened, nose along +X.
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -2.0), new THREE.Vector2(0.42, -1.85), new THREE.Vector2(0.58, -1.1),
      new THREE.Vector2(0.55, 0.2), new THREE.Vector2(0.38, 1.2), new THREE.Vector2(0.16, 1.95), new THREE.Vector2(0.001, 2.2),
    ]).getSpacedPoints(seg(40, 10));
    const hull = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, seg(40, 8)), M.hull));
    hull.rotation.z = -Math.PI / 2;
    hull.scale.set(0.62, 1, 1); // flattened top-to-bottom (after the turn, local x points down)
    part("hull").add(hull);

    // ---- 2. Mandibles: two curved gold-tipped prongs at the nose — the bite emitters.
    const tips = [];
    for (const side of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.2, 0, 0.3 * side), new THREE.Vector3(2.0, 0, 0.62 * side), new THREE.Vector3(2.7, 0, 0.38 * side),
      ]);
      part("mandibles").add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(16, 4), 0.07, seg(8, 4), false), M.dark)));
      const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, seg(12, 5)), M.gold));
      tip.position.set(2.82, 0, 0.36 * side); tip.rotation.z = -Math.PI / 2;
      part("mandibles").add(tip);
      tips.push(new THREE.Vector3(3.0, 0, 0.36 * side));
    }

    // ---- 3. Swept fins with glowing leading edges.
    const finShape = new THREE.Shape();
    finShape.moveTo(0.6, 0); finShape.lineTo(-0.9, 0); finShape.lineTo(-1.75, 1.55); finShape.lineTo(-1.35, 1.6); finShape.lineTo(0.6, 0);
    for (const side of [1, -1]) {
      const fin = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, steps: 1, ...bevel(0.03, 0.03) }), M.hull));
      fin.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2; // shape y -> world ±z
      fin.position.set(0, side > 0 ? 0.04 : -0.04, 0.2 * side);
      part("fins").add(fin);
      const edge = new THREE.LineCurve3(new THREE.Vector3(0.55, 0.07, 0.25 * side), new THREE.Vector3(-1.72, 0.07, 1.78 * side));
      part("fins").add(new THREE.Mesh(new THREE.TubeGeometry(edge, seg(8, 2), 0.04, seg(6, 4), false), glowMat));
    }

    // ---- 4. Canopy + sensor strip along the spine.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, seg(24, 8), seg(12, 4), 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    canopy.scale.set(1.9, 0.7, 0.9); canopy.position.set(0.7, 0.3, 0);
    part("canopy").add(canopy);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.08), glowMat);
    strip.position.set(-0.6, 0.35, 0);
    part("canopy").add(strip);

    // ---- 5. Main engine + two small side thrusters (makeEngineSet).
    const engines = makeEngineSet(M, U, seg);
    engines.add(part("engines"), new THREE.Vector3(-2.2, 0, 0), { radius: 0.36, length: 0.9, color: 0x4fe3c6, res: 0.6, plume: 7.5, glow: 4.6 });
    const smallPlume = makePlumeMaterial(0x4fe3c6, U);
    for (const side of [1, -1]) {
      engines.add(part("engines"), new THREE.Vector3(-1.2, -0.05, 0.62 * side), { radius: 0.13, length: 0.5, color: 0x4fe3c6,
        plumeMat: smallPlume, res: 0.4, plume: 6, glow: 4 });
    }

    // ---- 6. Running lights, exhaust.
    const nav = makeNavLights(part("lights"), [
      { color: 0x33ff77, pos: [-1.6, 0.05, 1.7], size: 0.5 },
      { color: 0xff3344, pos: [-1.6, 0.05, -1.7], size: 0.5 },
      { color: 0xffffff, pos: [-2.4, 0.35, 0], size: 0.55, kind: "strobe" },
    ]);
    const exhaust = makeExhaust(part("lights"), U, { count: 120, seed: 33, rate: [1.1, 0.6], grow: 1.5, emitters: [
      { pos: [-2.9, 0, 0], spread: 0.26, length: 2.8 },
      { pos: [-1.55, -0.05, 0.62], spread: 0.1, length: 1.2 },
      { pos: [-1.55, -0.05, -0.62], spread: 0.1, length: 1.2 },
    ] });

    // ---- actions: bite bolts from both mandibles, a scan ping.
    const bolts = makeBoltPool(ship, env, 0x4fe3c6, { count: 8, length: 0.6, radius: 0.035, speed: 30 });
    const wave = makeScanWave(ship, env, 0x4fe3c6);
    const actions = [
      { id: "fire", label: "BITE", kind: "trigger" },
      { id: "scan", label: "SCAN", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue(), forward = new THREE.Vector3(1, 0, 0);
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      if (id === "fire") shots.schedule([0, 1, 2, 3].map((i) => ({ delay: i * 0.1, tip: i % 2, target: on && on.target })));
      if (id === "scan") wave.start(new THREE.Vector3(0.6, 0.4, 0), 8);
    }
    function update(t, dt, { power: throttle = 1, particles = true } = {}) {
      const online = power.update(dt);
      U.uTime.value = t;
      U.uPower.value = throttle * (0.92 + 0.08 * Math.sin(t * 31.0) * Math.sin(t * 9.0));
      glowMat.emissiveIntensity = 2.2 * online * (0.85 + 0.15 * Math.sin(t * 2.4));
      engines.update(t, throttle);
      nav.update(t);
      exhaust.update(dt, throttle, particles);
      shots.run(t, (sh) => bolts.fire(tips[sh.tip], forward, sh.target));
      bolts.update(dt); wave.update(dt);
    }
    return { group: ship, update, setLights: (on) => nav.setVisible(on), actions, act };
  },
});
})();
