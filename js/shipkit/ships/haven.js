/* =======================================================================
   SHIPKIT · HAVEN — one ship definition (see js/shipkit/shipkit.js,
   "SHIP DEFINITIONS", and docs/ship.md). A classic script loaded after
   shipkit.js: it pushes its entry into ShipKit.SHIP_DEFS and builds with
   ShipKit's blocks and helpers (ShipKit._).
   ======================================================================= */
(function () {
"use strict";
const { GOLD, buildShipModel, detailHelpers, labelKey, makeGameHolder, makeNavLights, makeOnlineFader, makePlating, makeScanWave, makeSolarCells, partsOf, rng, shadowed, sharedMaterials, strut, trackTextures } = ShipKit._;
const SHIP_DEFS = ShipKit.SHIP_DEFS;

// ---------------------------------------------------------------------
// ST-04 HAVEN — the player's space station
// ---------------------------------------------------------------------
// The station the story starts on ("you wake up on a ruined station on
// the fourth orbit"): a spinning habitat ring on spokes around a central
// spine, a lit greenhouse dome where someone still keeps 21 °C, a solar
// truss, radiators, a comms dish and a docking port for the swarm. Its
// ruin follows the damage (setDamage, on top of the shared smoke and
// sparks): at 0 it's whole; from 10% a stretch of ring windows goes dark,
// from 20% a solar panel breaks and hangs, from 30% a ring segment is torn
// open with debris drifting in the gap. The game starts it damaged (the
// story) and repairs will bring it back. Ring flat in XZ, spine along +Y; the
// truss runs along X, so X is its longest extent (makeGameHolder sizes by it).
SHIP_DEFS.push({
  id: "haven",
  name: "ST-04 HAVEN",
  camera: [12, 7.5, 13],
  features: { damage: true, destroy: true },
  _assets: null,
  // labels { name }: the hull's lettering (default "HAVEN-04"), as on the codewing
  assets(labels) {
    const key = labelKey(labels && { name: labels.name });
    this._assets = this._assets || {};
    if (this._assets[key]) return this._assets[key];
    const tag = (labels && labels.name) || "HAVEN-04";
    const hullTex = makePlating({
      seed: 44, size: 1024, base: [176, 180, 188], minPanel: 50, maxPanel: 180,
      stripes: [{ y: 0.12, h: 0.022, color: "#4fe3c6" }, { y: 0.88, h: 0.022, color: "#f8bb56" }],
      markings: [{ text: tag, x: 0.5, y: 0.5, size: 64, color: "#2a3140", max: 900 }],
    });
    for (const k of ["map", "roughnessMap", "bumpMap", "emissiveMap"]) hullTex[k].repeat.set(3, 1);
    const moduleTex = makePlating({ seed: 45, size: 512, base: [104, 110, 122], minPanel: 40, maxPanel: 140,
      stripes: [{ y: 0.5, h: 0.03, color: "#4fe3c6" }] });
    const solar = makeSolarCells({ seed: 47, cols: 10, rows: 5 });
    trackTextures(...Object.values(hullTex), ...Object.values(moduleTex), solar);
    const a = {
      hull: new THREE.MeshStandardMaterial({ map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap,
        bumpScale: 0.02, metalness: 0.6, roughness: 0.55 }),
      module: new THREE.MeshStandardMaterial({ map: moduleTex.map, roughnessMap: moduleTex.roughnessMap, bumpMap: moduleTex.bumpMap,
        bumpScale: 0.02, metalness: 0.7, roughness: 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c313c, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.3 }),
      truss: new THREE.MeshStandardMaterial({ color: 0x8c929e, metalness: 0.9, roughness: 0.4 }),
      solar: new THREE.MeshStandardMaterial({ map: solar, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide }),
      solarDead: new THREE.MeshStandardMaterial({ map: solar, color: 0x4a4f5a, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide }),
      radiator: new THREE.MeshStandardMaterial({ color: 0xd8dce4, emissive: 0x6a2410, emissiveIntensity: 0.6,
        metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }),
      window: new THREE.MeshStandardMaterial({ color: 0x1b2130, emissive: 0xffcf8a, emissiveIntensity: 1.8 }),
      windowDead: new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.4, roughness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x6fb8ae, metalness: 0.2, roughness: 0.04, clearcoat: 1,
        transparent: true, opacity: 0.14, envMapIntensity: 1.4, depthWrite: false }),
      garden: new THREE.MeshStandardMaterial({ color: 0x14360f, emissive: 0x3fbf3a, emissiveIntensity: 1.4, roughness: 0.8 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets[key] = a);
  },

  build(detail, env) {
    const M = this.assets(env && env.labels);
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg } = detailHelpers(detail);
    const station = new THREE.Group();
    const part = partsOf(station);   // named parts (see partsOf)
    // per model: these dim when the station goes offline (shares the textures)
    const windowMat = M.window.clone(), gardenMat = M.garden.clone(), glowMat = M.glow.clone(), radiatorMat = M.radiator.clone();
    const R = 4, TUBE = 0.34;                     // habitat ring radius / tube

    // ---- 1. Spine: stacked modules and nodes along Y, the hub in the middle.
    const cyl = (r, h, y, mat, s = 32) => {
      const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg(s, 8)), mat));
      m.position.y = y; part("spine").add(m); return m;
    };
    const node = (r, y) => {
      const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg(28, 8), seg(18, 6)), M.hull));
      m.position.y = y; part("spine").add(m); return m;
    };
    cyl(1.05, 1.1, 0, M.hull, 48);                 // hub
    node(0.62, 0.95); node(0.62, -0.95);
    cyl(0.5, 1.2, 1.75, M.module);                 // upper module
    node(0.56, 2.4);
    cyl(0.6, 1.4, -1.75, M.module);                // lower module
    node(0.56, -2.55);
    for (const y of [0.42, -0.42]) {               // gold collars around the hub
      const c = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, seg(8, 3), seg(56, 12)), M.gold));
      c.rotation.x = Math.PI / 2; c.position.y = y; part("spine").add(c);
    }
    // hub windows: one instanced band all around
    {
      const n = seg(36, 12), w = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.09, 0.03), windowMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const ang = i / n * Math.PI * 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + Math.PI / 2);
        m.compose(new THREE.Vector3(Math.cos(ang) * 1.06, 0.18, Math.sin(ang) * 1.06), q, s);
        w.setMatrixAt(i, m);
      }
      part("spine").add(w);
    }

    // ---- 2. Greenhouse dome on top: glass over lit garden beds, gold ribs.
    const dome = new THREE.Group();
    dome.position.y = 3.5;
    part("dome").add(dome);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, seg(40, 10)), gardenMat);
    bed.position.y = -0.45; dome.add(bed);
    {
      const n = seg(40, 10), plants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.22, 5), gardenMat, n);
      const m = new THREE.Matrix4(), rand = rng(7);
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(rand()) * 0.7, a = rand() * Math.PI * 2, sc = 0.6 + rand() * 0.9;
        m.compose(new THREE.Vector3(Math.cos(a) * r, -0.27 + 0.1 * sc, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
        plants.setMatrixAt(i, m);
      }
      dome.add(plants);
    }
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.95, seg(40, 10), seg(20, 6), 0, Math.PI * 2, 0, Math.PI * 0.62), M.glass);
    glass.renderOrder = 1;                         // after the garden inside it
    glass.position.y = -0.5; dome.add(glass);
    const CAP = Math.PI * 0.62;                    // the glass cap reaches this far from the top
    for (let i = 0; i < 6; i++) {                  // meridian ribs: a torus arc from the top down to the rim
      const rib = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, seg(6, 3), seg(28, 8), CAP), M.gold));
      rib.rotation.set(0, i / 6 * Math.PI * 2, Math.PI / 2 - CAP);   // Z first (into place), then Y (around)
      rib.position.y = -0.5;
      dome.add(rib);
    }
    const rimY = -0.5 + 0.95 * Math.cos(CAP);
    const domeRim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.95 * Math.sin(CAP), 0.07, seg(8, 3), seg(40, 10)), M.gold));
    domeRim.rotation.x = Math.PI / 2; domeRim.position.y = rimY; dome.add(domeRim);
    const floor = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.95 * Math.sin(CAP), 0.95 * Math.sin(CAP), 0.08, seg(40, 10)), M.module));
    floor.position.y = rimY; dome.add(floor);

    // ---- 3. Docking port at the bottom: a gold ring around a teal glow.
    const port = new THREE.Group();
    port.position.y = -3.1;
    part("dock").add(port);
    port.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.4, seg(32, 8)), M.dark)));
    const portRing = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, seg(10, 4), seg(40, 10)), M.gold));
    portRing.rotation.x = Math.PI / 2; portRing.position.y = -0.2; port.add(portRing);
    const portGlow = new THREE.Mesh(new THREE.CircleGeometry(0.36, seg(32, 8)), glowMat);
    portGlow.rotation.x = Math.PI / 2; portGlow.position.y = -0.21; port.add(portGlow);

    // ---- 4. Radiators under the ring plane, glowing faintly with waste heat.
    for (const side of [1, -1]) {
      const rad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.9), radiatorMat));
      rad.position.set(side * 1.9, -1.75, 0); part("radiators").add(rad);
      part("radiators").add(strut(new THREE.Vector3(side * 0.55, -1.75, 0), new THREE.Vector3(side * 0.85, -1.75, 0), 0.08, M.truss, seg(8, 4)));
    }

    // ---- 5. Habitat ring: spins slowly on four spokes. One segment torn open.
    const spin = new THREE.Group();
    spin.userData.dynamic = true;               // animated: merged as its own unit
    part("ring").add(spin);
    // Damage stages: each a pair of groups, the whole and the ruined version,
    // swapped by setDamage (dynamic: toggled, so merged as their own units).
    const stage = (parent) => {
      const whole = new THREE.Group(), ruined = new THREE.Group();
      whole.userData.dynamic = ruined.userData.dynamic = true;
      ruined.visible = false;
      parent.add(whole, ruined);
      return { whole, ruined, set(on) { whole.visible = !on; ruined.visible = on; } };
    };
    const winStage = stage(spin), breachStage = stage(spin), panelStage = stage(part("solar"));
    const GAP = 0.5, ARC = Math.PI * 2 - GAP;  // the breach segment: ARC .. 2π
    const ringSeg = (from, arc, parent) => {
      const m = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, TUBE, seg(20, 6), Math.max(3, Math.round(seg(160, 24) * arc / (Math.PI * 2))), arc), M.hull));
      m.rotation.set(Math.PI / 2, 0, 0);       // torus arc runs in its XY plane -> XZ
      m.rotateZ(from);                          // then along the ring (local Z is world -Y now)
      parent.add(m);
      return m;
    };
    ringSeg(0, ARC, spin);
    ringSeg(ARC, GAP, breachStage.whole);      // the segment the breach tears out
    const ringPoint = (ang, r = R, y = 0) => new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r); // matches the rotated torus
    // torn ends: jagged cones where the hull broke off
    for (const [ang, dir] of [[0, -1], [ARC, 1]]) {     // dir: along the ring, into the gap
      const rand = rng(ang > 0 ? 3 : 5);
      for (let i = 0; i < 5; i++) {
        const shard = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.07 + rand() * 0.06, 0.25 + rand() * 0.3, 4), M.dark));
        const p = ringPoint(ang, R + (rand() - 0.5) * TUBE * 1.4, (rand() - 0.5) * TUBE * 1.4);
        shard.position.copy(p);
        const tangent = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(dir);
        shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8)).normalize());
        breachStage.ruined.add(shard);
      }
    }
    // debris drifting in the gap (its own animated unit)
    const debris = new THREE.Group();
    debris.userData.dynamic = true;
    breachStage.ruined.add(debris);
    const debrisParts = [];
    {
      const rand = rng(21);
      for (let i = 0; i < seg(9, 4); i++) {
        const d = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12 + rand() * 0.16, 0.05 + rand() * 0.08, 0.1 + rand() * 0.14), rand() < 0.5 ? M.hull : M.dark));
        const ang = ARC + GAP * (0.15 + rand() * 0.7);
        d.position.copy(ringPoint(ang, R + (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.6));
        debris.add(d);
        debrisParts.push({ d, base: d.position.clone(), ph: rand() * 6.28, spin: new THREE.Vector3(rand(), rand(), rand()).multiplyScalar(0.6) });
      }
    }
    // windows: two rows on the outer face all around; the stretch next to
    // the breach goes dark (a stage), the breach segment's own windows go with it
    {
      const n = seg(150, 44), darkFrom = ARC - 0.9;
      const lit = [], zone = [], gap = [];
      for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
        const ang = (i + 0.5) / n * Math.PI * 2, w = [ang, row ? 0.1 : -0.1];
        (ang > ARC ? gap : ang > darkFrom ? zone : lit).push(w);
      }
      const box = new THREE.BoxGeometry(0.03, 0.07, 0.11);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      const windows = (list, mat, parent) => {
        const im = new THREE.InstancedMesh(box, mat, list.length);
        list.forEach(([ang, y], i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);      // thin side (+X) turned outward
          m.compose(ringPoint(ang, R + TUBE * 0.97, y), q, s);
          im.setMatrixAt(i, m);
        });
        parent.add(im);
      };
      windows(lit, windowMat, spin);
      windows(zone, windowMat, winStage.whole);
      windows(zone, M.windowDead, winStage.ruined);
      windows(gap, windowMat, breachStage.whole);
    }
    // spokes from the hub to the ring, with a module where each meets it
    for (let k = 0; k < 4; k++) {
      const ang = (k + 0.5) / 4 * ARC;
      spin.add(strut(ringPoint(ang, 1.1), ringPoint(ang, R - TUBE * 0.8), 0.1, M.truss, seg(10, 4)));
      const mod = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.62), M.module));
      mod.position.copy(ringPoint(ang, R, 0));
      mod.rotation.y = -ang;
      spin.add(mod);
    }
    const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.09, seg(10, 4), seg(56, 12)), M.dark));
    collar.rotation.x = Math.PI / 2; spin.add(collar);   // the rotating joint the spokes hang on

    // ---- 6. Solar truss above the ring, along X, two panels per side; the
    // outer -X one breaks and hangs (a damage stage).
    const TY = 1.75, TL = 7.2;
    const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TL * 2, 0.16, 0.16), M.truss));
    beam.position.y = TY; part("solar").add(beam);
    {
      const n = seg(28, 10), braces = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), M.truss, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const x = -TL + (i + 0.5) / n * TL * 2;
        q.setFromEuler(new THREE.Euler(0, 0, i % 2 ? 0.6 : -0.6));
        m.compose(new THREE.Vector3(x, TY, i % 2 ? 0.1 : -0.1), q, new THREE.Vector3(1, 0.3, 1));
        braces.setMatrixAt(i, m);
      }
      part("solar").add(braces);
    }
    part("solar").add(strut(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, TY, 0), 0.12, M.truss, seg(8, 4)));
    const panelGeo = new THREE.PlaneGeometry(2.4, 1.25);
    for (const side of [1, -1]) {
      for (const [i, x] of [[0, 3.4], [1, 6.0]]) {
        const breaks = side < 0 && i === 1;
        const panel = (parent, broken) => {
          const mount = new THREE.Group();
          mount.position.set(side * x, TY, 0);
          parent.add(mount);
          const p = new THREE.Mesh(panelGeo, broken ? M.solarDead : M.solar);
          p.rotation.x = -Math.PI / 2 + 0.25;    // tilted toward the light
          if (broken) { p.rotation.set(-Math.PI / 2 + 1.2, 0.25, -0.35); p.position.set(0.15, -0.35, 0.3); }
          mount.add(p);
          const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.03, 0.05), M.truss));
          frame.position.z = broken ? 0.1 : 0.62; mount.add(frame);
        };
        if (!breaks) panel(part("solar"), false);
        else { panel(panelStage.whole, false); panel(panelStage.ruined, true); }
      }
    }

    // ---- 7. Comms dish on a boom off the hub (+Z), slowly scanning.
    const dishBase = new THREE.Vector3(0, 0.55, 1.05), dishTip = new THREE.Vector3(0, 1.1, 2.4);
    part("dish").add(strut(dishBase, dishTip, 0.06, M.truss, seg(8, 4)));
    const dish = new THREE.Group();
    dish.userData.dynamic = true;
    dish.position.copy(dishTip);
    part("dish").add(dish);
    {
      const pts = [], steps = seg(14, 4);
      for (let i = 0; i <= steps; i++) { const r = i / steps * 0.65; pts.push(new THREE.Vector2(r, r * r * 0.55)); }
      const bowl = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, seg(36, 10)), M.hull));
      bowl.rotation.x = 0.9;                       // opens up and outward (+Z)
      dish.add(bowl);
      bowl.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0), 0.025, M.gold, seg(6, 3)));  // the feed
    }

    // ---- 8. Lights, the scan ping.
    const nav = makeNavLights(part("lights"), [
      { color: 0xff3344, pos: [-TL, TY, 0], size: 0.7 },
      { color: 0x33ff77, pos: [TL, TY, 0], size: 0.7 },
      { color: 0xffffff, pos: [0, -3.35, 0], size: 0.8, kind: "strobe" },
      { color: 0xffffff, pos: [0, 4.05, 0], size: 0.6, kind: "strobe", phase: 0.5 },
      { color: 0x4fe3c6, pos: [dishTip.x, dishTip.y + 0.5, dishTip.z + 0.4], size: 0.45 },
    ]);
    const wave = makeScanWave(station, env, 0x4fe3c6);
    const power = makeOnlineFader(0.8);
    const actions = [{ id: "scan", label: "SCAN" }];
    let scanT = 0;

    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      if (id === "scan") { wave.start(dishTip.clone(), 14); scanT = 2.5; }
    }
    let mt = 0;                                                     // the motion clock (see the drone)
    function update(t, dt) {
      const online = power.update(dt);
      mt += dt;
      U.uTime.value = t;
      spin.rotation.y += dt * 0.06 * online;                        // the habitat ring turns (gravity)
      for (const p of debrisParts) {                                 // debris tumbles slowly in the gap
        p.d.position.copy(p.base).addScaledVector(p.spin, Math.sin(mt * 0.3 + p.ph) * 0.15);
        p.d.rotation.x += dt * p.spin.x * 0.5; p.d.rotation.y += dt * p.spin.y * 0.5;
      }
      scanT = Math.max(0, scanT - dt);
      dish.rotation.y = Math.sin(mt * 0.15) * 0.8 + (scanT > 0 ? (2.5 - scanT) * 2.5 : 0);
      windowMat.emissiveIntensity = 1.8 * online;
      gardenMat.emissiveIntensity = 1.4 * (0.3 + 0.7 * online) * (0.95 + 0.05 * Math.sin(t * 0.7)); // the garden keeps a little light
      glowMat.emissiveIntensity = 2.2 * online * (0.8 + 0.2 * Math.sin(t * 2));
      radiatorMat.emissiveIntensity = 0.6 * online;
      nav.update(t);
      wave.update(dt);
    }
    // the ruin stages (buildShipModel passes the damage on)
    function setDamage(d) { winStage.set(d >= 0.1); panelStage.set(d >= 0.2); breachStage.set(d >= 0.3); }
    return { group: station, update, setLights: (on) => nav.setVisible(on), actions, act, setDamage };
  },
});
})();
