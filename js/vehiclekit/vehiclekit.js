/* =======================================================================
   VEHICLEKIT — ground vehicles (window.VehicleKit)
   =======================================================================
   A classic script like ShipKit, BodyKit and BaseKit: the vehicles lab
   (vehicles.html) uses it, the surface lab and the game can later. Built
   from ShipKit's generators (plating, solar cells, struts) — needs THREE
   and window.ShipKit. Not in the game yet (docs/vehicles.md).

   The world has no people (the story): every vehicle is a robot — sensor
   heads and lamps, no cabins or seats.

   Units are metres. A vehicle's origin is the ground under its middle, up
   +Y, front +Z. The caller moves and turns `group` on the ground; the kit
   does everything inside it:
     - wheels spin with the speed and the steered ones turn;
     - each wheel's suspension follows the ground (opts.contact), the body
       settles on a plane fitted through the wheels (pitch and roll), on
       springs;
     - tracks' treads run (left and right apart when turning);
     - lamps, a beacon, a sensor head looking around, and the vehicle's
       work (opts.work 0..1: the hauler tips its bed, the crawler lowers
       and spins its drill, the constructor swings its crane);
     - dust from the wheels (opts.dust: a makeDust() pool).

   API
     VEHICLES                        [{ id, name, role, length, width, height,
                                      maxSpeed (m/s), accel, turnRadius (m, 0 = on the spot),
                                      cargo (t), work: label }]
     buildVehicle(id, { detail })  → vehicle:
       group                         THREE.Group: place and turn it on the ground
       body                          the sprung part (inside group)
       wheels                        [{ x, z, r, steer }] contact points
       update(t, dt, opts)           opts: { speed, steer (-1..1), contact(x, z) →
                                      ground height at the vehicle-local point
                                      (relative to the group's origin), lights
                                      (0..1), work (0..1), dust }
     disposeVehicle(vehicle)
     drive(state, input, def, dt)    a simple driving model in a flat frame:
                                      state { x, z, yaw, speed }, input
                                      { throttle -1..1, steer -1..1 }
     makeDust(color)               → { points (add to the world), update(dt) }
     modelStats(group)
     parts.wheel(r, w, mats, seg), parts.mats()   building blocks for other kits
   ======================================================================= */
window.VehicleKit = (function () {
"use strict";
const SK = window.ShipKit;
const TAU = Math.PI * 2;

// ---------- materials (one set, cached) ----------
let M = null;
function tireTexture() {
  const W = 256, H = 64, [c, ctx] = SK.util.canvas(W, H);
  ctx.fillStyle = "#1c1d21"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#2c2e34";
  for (let i = 0; i < 24; i++) {                      // chevron lugs around the tyre
    const x = i * W / 24;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, H / 2); ctx.lineTo(x, H); ctx.lineTo(x + 5, H); ctx.lineTo(x + 11, H / 2); ctx.lineTo(x + 5, 0); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
}
function treadTexture() {
  const W = 64, H = 256, [c, ctx] = SK.util.canvas(W, H);
  ctx.fillStyle = "#18191c"; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {                      // track plates with a grouser bar each
    const y = i * H / 16;
    ctx.fillStyle = "#3a3c42"; ctx.fillRect(2, y + 1, W - 4, H / 16 - 3);
    ctx.fillStyle = "#55585f"; ctx.fillRect(2, y + 5, W - 4, 3);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; return t;
}
function mats() {
  if (M) return M;
  // big panels: a box face maps the whole texture, so small ones read as bricks
  const plate = SK.makePlating({ seed: 71, size: 512, base: [196, 198, 202], minPanel: 150, maxPanel: 380,
    stripes: [{ y: 0.18, h: 0.05, color: "#f8bb56" }] });
  const dark = SK.makePlating({ seed: 72, size: 512, base: [70, 76, 88], minPanel: 140, maxPanel: 360 });
  const solar = SK.makeSolarCells({ seed: 73, cols: 6, rows: 3 });
  const tire = tireTexture(), tread = treadTexture();
  for (const t of [...Object.values(plate), ...Object.values(dark), solar, tire, tread]) SK.allTextures.add(t);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    hull: std({ map: plate.map, roughnessMap: plate.roughnessMap, bumpMap: plate.bumpMap, bumpScale: 0.02, metalness: 0.45, roughness: 0.55 }),
    dark: std({ map: dark.map, roughnessMap: dark.roughnessMap, bumpMap: dark.bumpMap, bumpScale: 0.02, metalness: 0.7, roughness: 0.5 }),
    frame: std({ color: 0x8c929e, metalness: 0.9, roughness: 0.38 }),
    gold: std({ color: 0xf8bb56, metalness: 1, roughness: 0.3 }),
    rubber: std({ color: 0xffffff, map: tire, roughness: 0.92, metalness: 0 }),
    tread: std({ color: 0xffffff, map: tread, roughness: 0.85, metalness: 0.3 }),
    solar: std({ map: solar, metalness: 0.45, roughness: 0.3 }),
    lens: std({ color: 0x0a0d14, metalness: 0.2, roughness: 0.05, emissive: 0x4fe3c6, emissiveIntensity: 0.4 }),
    lamp: std({ color: 0x222222, emissive: 0xfff1d0, emissiveIntensity: 0 }),
    teal: std({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 1.8 }),
    beacon: std({ color: 0x2a1405, emissive: 0xffa230, emissiveIntensity: 0 }),
    cargo: std({ color: 0xc9772f, metalness: 0.3, roughness: 0.6 }),
  };
  return M;
}

// ---------- small builders ----------
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a wheel: a tyre with lugs, a rim, a hub — `spin` turns, `pivot` steers
function wheel(r, w, m, seg) {
  const pivot = new THREE.Group(), spin = new THREE.Group();
  const tyre = mesh(new THREE.CylinderGeometry(r, r, w, seg(28, 12), 1), [m.rubber, m.dark, m.dark]);
  tyre.rotation.z = Math.PI / 2;
  spin.add(tyre);
  const rim = mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 1.04, seg(18, 8)), m.frame); rim.rotation.z = Math.PI / 2; spin.add(rim);
  for (let k = 0; k < 5; k++) {                       // spokes: you can see the wheel turn
    const sp = box(w * 1.08, r * 0.12, r * 1.05, m.dark, 0, 0, 0); sp.rotation.x = k / 5 * Math.PI; spin.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 1.12, seg(12, 6)), m.gold); hub.rotation.z = Math.PI / 2; spin.add(hub);
  pivot.add(spin);
  return { pivot, spin };
}
// a lamp: a glowing face (+ a SpotLight the caller may switch on)
function lamp(g, m, x, y, z, dirZ = 1) {
  const l = box(0.34, 0.16, 0.06, m.lamp, x, y, z); g.add(l);
  return l;
}

// ---------- the vehicles ----------
// Each make(body, m, seg) builds the body (axle height = body y 0) and
// returns { wheels: [{ x, z, r, w, steer, side }], tracks?, parts }.
const VEHICLES = [
  { id: "scout", name: "SCOUT", role: "Explores and maps: six wheels on rockers, a camera mast, solar deck.",
    length: 3.4, width: 2.7, height: 2.6, maxSpeed: 16, accel: 4, turnRadius: 4, cargo: 0.2, work: "Scan",
    make(b, m, seg) {
      b.add(box(2.1, 0.62, 2.8, m.hull, 0, 0.62, 0));
      b.add(box(2.2, 0.08, 2.9, m.dark, 0, 0.3, 0));
      const deck = box(2.0, 0.05, 2.5, m.solar, 0, 0.96, -0.1); b.add(deck);
      // rockers: the struts from the body to each wheel
      for (const s of [-1, 1]) {
        b.add(SK.strut(V(s * 1.05, 0.55, 0.3), V(s * 1.25, 0.1, 1.2), 0.07, m.frame, seg(6, 4)));
        b.add(SK.strut(V(s * 1.05, 0.55, 0.3), V(s * 1.25, 0.1, -0.1), 0.07, m.frame, seg(6, 4)));
        b.add(SK.strut(V(s * 1.05, 0.45, -0.6), V(s * 1.25, 0.1, -1.25), 0.07, m.frame, seg(6, 4)));
      }
      // the mast and its sensor head
      b.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.3, seg(8, 4)), m.frame, 0.55, 1.6, 0.95));
      const head = new THREE.Group(); head.position.set(0.55, 2.3, 0.95);
      head.add(box(0.55, 0.28, 0.3, m.hull, 0, 0, 0));
      for (const x of [-0.13, 0.13]) { const e = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, seg(12, 6)), m.lens, x, 0.02, 0.17); e.rotation.x = Math.PI / 2; head.add(e); }
      b.add(head);
      const dish = mesh(new THREE.SphereGeometry(0.32, seg(14, 6), seg(6, 3), 0, TAU, 0, 1.0), m.frame, -0.6, 1.35, -0.9); dish.rotation.x = -0.6; b.add(dish);
      const lamps = [lamp(b, m, -0.6, 0.72, 1.42), lamp(b, m, 0.6, 0.72, 1.42)];
      const beacon = mesh(new THREE.SphereGeometry(0.08, 8, 6), m.beacon, -0.6, 1.62, -0.9); b.add(beacon);
      return { wheels: [-1, 1].flatMap((s) => [[1.2, 1], [-0.1, 0], [-1.25, -1]].map(([z, st]) => ({ x: s * 1.3, z, r: 0.42, w: 0.34, steer: st, side: s }))),
        lamps, beacon, head };
    } },
  { id: "hauler", name: "HAULER", role: "Carries materials between the mine, the refinery and the base: eight wheels, a tipping bed.",
    length: 7.2, width: 3.2, height: 3.1, maxSpeed: 20, accel: 2.5, turnRadius: 9, cargo: 18, work: "Tip the bed",
    make(b, m, seg) {
      b.add(box(2.6, 0.5, 6.8, m.dark, 0, 0.45, 0));                         // the chassis
      // the front: a sensor pod, not a cabin
      const pod = box(2.5, 1.3, 1.6, m.hull, 0, 1.35, 2.55); b.add(pod);
      b.add(box(2.3, 0.3, 0.06, m.teal, 0, 1.6, 3.36));                         // a sensor band where a windscreen would be
      for (const x of [-0.7, 0, 0.7]) { const e = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, seg(12, 6)), m.lens, x, 1.15, 3.37); e.rotation.x = Math.PI / 2; b.add(e); }
      // the bed, hinged at its back
      const hinge = new THREE.Group(); hinge.position.set(0, 0.75, -3.2); b.add(hinge);
      const bed = new THREE.Group(); bed.position.set(0, 0, 2.55); hinge.add(bed);
      bed.add(box(2.7, 0.12, 5.0, m.hull, 0, 0.06, 0));
      for (const s of [-1, 1]) bed.add(box(0.1, 0.9, 5.0, m.hull, s * 1.3, 0.5, 0));
      bed.add(box(2.7, 0.9, 0.1, m.hull, 0, 0.5, 2.48));
      for (let i = 0; i < 4; i++) bed.add(box(1.0 + (i % 2) * 0.3, 0.6 + (i % 3) * 0.15, 1.0, m.cargo, (i % 2 ? 0.55 : -0.5), 0.45, -1.6 + i * 1.05));   // the load
      const lamps = [lamp(b, m, -0.85, 0.8, 3.38), lamp(b, m, 0.85, 0.8, 3.38)];
      const beacon = mesh(new THREE.SphereGeometry(0.1, 8, 6), m.beacon, 0, 2.07, 2.6); b.add(beacon);
      return { wheels: [-1, 1].flatMap((s) => [[2.6, 1], [1.5, 1], [-1.5, 0], [-2.6, 0]].map(([z, st]) => ({ x: s * 1.45, z, r: 0.62, w: 0.42, steer: st, side: s }))),
        lamps, beacon, hinge };
    } },
  { id: "crawler", name: "CRAWLER", role: "Digs where wheels sink: two tracks, a drill arm. Slow, turns on the spot.",
    length: 6.0, width: 3.4, height: 3.0, maxSpeed: 7, accel: 1.8, turnRadius: 0, cargo: 4, work: "Drill",
    make(b, m, seg) {
      const tracks = [];
      for (const s of [-1, 1]) {
        // a track: a long loop (a box with rounded ends), road wheels inside
        const tr = new THREE.Group(); tr.position.set(s * 1.35, 0, 0); b.add(tr);
        // its own copy of the tread (left and right run apart when turning)
        const mat = m.tread.clone(); mat.map = m.tread.map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(1, 2);
        const belt = mesh(new THREE.BoxGeometry(0.75, 1.0, 4.4), mat); tr.add(belt);
        for (const z of [-2.2, 2.2]) { const end = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.75, seg(20, 10)), mat, 0, 0, z); end.rotation.z = Math.PI / 2; tr.add(end); }
        for (const z of [-1.5, -0.5, 0.5, 1.5]) { const rw = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, seg(14, 6)), m.frame, 0, -0.15, z); rw.rotation.z = Math.PI / 2; tr.add(rw); }
        tracks.push({ side: s, belt });
      }
      b.add(box(2.0, 0.9, 4.2, m.hull, 0, 0.75, -0.2));
      b.add(box(1.8, 0.6, 1.4, m.dark, 0, 1.45, -1.2));                         // the power pack
      b.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, seg(8, 4)), m.dark, 0.6, 2.1, -1.5));   // its stack
      // the drill arm: a boom from the front, a spinning auger
      const arm = new THREE.Group(); arm.position.set(0, 1.1, 1.8); b.add(arm);
      arm.add(SK.strut(V(0, 0, 0), V(0, 0.6, 1.8), 0.16, m.frame, seg(8, 4)));
      const head = new THREE.Group(); head.position.set(0, 0.6, 1.8); arm.add(head);
      head.add(box(0.6, 0.6, 0.6, m.hull, 0, 0, 0));
      const drill = new THREE.Group(); drill.position.set(0, -0.3, 0); head.add(drill);
      drill.add(mesh(new THREE.ConeGeometry(0.28, 1.6, seg(12, 6)), m.gold, 0, -0.8, 0));
      for (let k = 0; k < 6; k++) { const f = box(0.06, 0.06, 0.55, m.frame, 0, -0.3 - k * 0.2, 0); f.rotation.y = k * 1.1; drill.add(f); }
      drill.children[0].rotation.x = Math.PI;
      const lamps = [lamp(b, m, -0.7, 1.0, 1.92), lamp(b, m, 0.7, 1.0, 1.92)];
      const beacon = mesh(new THREE.SphereGeometry(0.1, 8, 6), m.beacon, -0.6, 1.85, -1.2); b.add(beacon);
      // contact points along the tracks
      const wheels = [-1, 1].flatMap((s) => [2.2, 0.75, -0.75, -2.2].map((z) => ({ x: s * 1.35, z, r: 0.5, w: 0, steer: 0, side: s, hidden: true })));
      return { wheels, tracks, lamps, beacon, arm, drill };
    } },
  { id: "constructor", name: "CONSTRUCTOR", role: "Builds the base: lifts modules into place with its crane.",
    length: 5.6, width: 3.4, height: 4.2, maxSpeed: 12, accel: 2, turnRadius: 6, cargo: 6, work: "Swing the crane",
    make(b, m, seg) {
      b.add(box(2.4, 0.8, 4.6, m.hull, 0, 0.7, 0));
      b.add(box(2.5, 0.12, 4.7, m.dark, 0, 0.28, 0));
      for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) b.add(box(0.5, 0.9, 1.9, m.dark, s * 1.2, 0.55, z));   // fenders
      // the turret and the crane
      const turret = new THREE.Group(); turret.position.set(0, 1.1, -0.6); b.add(turret);
      turret.add(mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, seg(20, 8)), m.dark, 0, 0.25, 0));
      turret.add(box(1.0, 0.8, 1.2, m.hull, 0, 0.85, -0.2));
      const boom = new THREE.Group(); boom.position.set(0, 1.1, 0.2); turret.add(boom);
      const L = 4.2;
      for (const x of [-0.18, 0.18]) for (const y of [-0.15, 0.15]) boom.add(SK.strut(V(x, y, 0), V(x * 0.4, y * 0.4, L), 0.04, m.gold, 4));
      for (let k = 0.5; k < L; k += 0.6) boom.add(SK.strut(V(-0.18 * (1 - k / L * 0.6), -0.15, k), V(0.18 * (1 - k / L * 0.6), 0.15, k + 0.3), 0.025, m.gold, 4));
      const hook = new THREE.Group(); hook.position.set(0, 0, L); boom.add(hook);
      hook.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), m.frame, 0, -0.6, 0));
      hook.add(box(0.3, 0.22, 0.3, m.cargo, 0, -1.25, 0));
      boom.rotation.x = -0.5;
      const lamps = [lamp(b, m, -0.75, 0.9, 2.32), lamp(b, m, 0.75, 0.9, 2.32)];
      const beacon = mesh(new THREE.SphereGeometry(0.1, 8, 6), m.beacon, 0.35, 1.95, -0.5); turret.add(beacon);
      return { wheels: [-1, 1].flatMap((s) => [[1.6, 1], [-1.6, 0]].map(([z, st]) => ({ x: s * 1.45, z, r: 0.78, w: 0.6, steer: st, side: s }))),
        lamps, beacon, turret, boom, hook };
    } },
];

// ---------- building one ----------
function buildVehicle(id, { detail = 1 } = {}) {
  const def = VEHICLES.find((v) => v.id === id);
  if (!def) throw new Error("VehicleKit: unknown vehicle " + id);
  const m = mats(), seg = (n = 16, min = 3) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const parts = def.make(body, m, seg);
  // the wheels hang off the body; their struts stretch with the suspension
  const wheels = parts.wheels.map((w) => {
    const o = Object.assign({ y: 0, vy: 0 }, w);
    if (!w.hidden) {
      const wh = wheel(w.r, w.w, m, seg);
      wh.pivot.position.set(w.x, 0, w.z);
      body.add(wh.pivot);
      const shock = mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), m.gold);
      body.add(shock);
      Object.assign(o, wh, { shock });
    }
    return o;
  });
  // each vehicle's own lamps: a light per vehicle (two would cost too much)
  const spot = new THREE.SpotLight(0xfff1d8, 0, 60, 0.55, 0.5, 1.4);
  spot.position.set(0, 1.2, def.length / 2); spot.target.position.set(0, -2, def.length / 2 + 20);
  body.add(spot, spot.target);
  const state = { y: 0, vy: 0, pitch: 0, vp: 0, roll: 0, vr: 0, spinL: 0, spinR: 0, tread: [0, 0], work: 0, look: 0 };
  const plane = { a: 0, b: 0, c: 0 };
  const tmp = new THREE.Vector3();

  // a plane y = a + b·x + c·z through the contacts (least squares)
  function fit(hs) {
    let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
    wheels.forEach((w, i) => { const y = hs[i]; n++; sx += w.x; sz += w.z; sy += y; sxx += w.x * w.x; szz += w.z * w.z; sxz += w.x * w.z; sxy += w.x * y; szy += w.z * y; });
    const mx = sx / n, mz = sz / n, my = sy / n;
    const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz, cxy = sxy / n - mx * my, czy = szy / n - mz * my;
    const det = cxx * czz - cxz * cxz || 1e-6;
    plane.b = (cxy * czz - czy * cxz) / det; plane.c = (czy * cxx - cxy * cxz) / det;
    plane.a = my - plane.b * mx - plane.c * mz;
  }
  const hs = new Array(wheels.length).fill(0);
  const spring = (pos, vel, target, k, dt) => { const acc = (target - pos) * k * k - vel * 2 * k * 0.7; vel += acc * dt; return [pos + vel * dt, vel]; };

  return {
    def, group, body, wheels, parts,
    update(t, dt, opts = {}) {
      dt = Math.min(dt, 0.05);
      const speed = opts.speed || 0, steer = opts.steer || 0;
      // the ground under each wheel → the body's plane, on springs
      wheels.forEach((w, i) => { hs[i] = opts.contact ? opts.contact(w.x, w.z) : 0; });
      fit(hs);
      const r0 = wheels[0].r;
      [state.y, state.vy] = spring(state.y, state.vy, plane.a + r0, 9, dt);
      [state.pitch, state.vp] = spring(state.pitch, state.vp, -Math.atan(plane.c), 7, dt);
      [state.roll, state.vr] = spring(state.roll, state.vr, Math.atan(plane.b), 7, dt);
      body.position.y = state.y;
      body.rotation.set(state.pitch, 0, state.roll);
      // the wheels: suspension (what the plane misses), spin, steering
      const travel = def.id === "hauler" ? 0.35 : 0.3;
      wheels.forEach((w, i) => {
        const want = Math.max(-travel, Math.min(travel, hs[i] - (plane.a + plane.b * w.x + plane.c * w.z)));
        [w.y, w.vy] = spring(w.y, w.vy, want, 22, dt);
        if (!w.pivot) return;
        w.pivot.position.y = w.y;
        const turn = def.turnRadius ? steer * 0.45 : 0;
        w.pivot.rotation.y = w.steer * turn;
        w.spin.rotation.x += speed / w.r * dt;
        // the shock absorber from the body to the hub
        const top = 0.55 + (def.id === "hauler" ? 0.1 : 0), len = top - w.y;
        w.shock.position.set(w.x * 0.93, w.y + len / 2, w.z);
        w.shock.scale.y = Math.max(0.1, len);
      });
      // tracks: left and right run apart when turning on the spot
      if (parts.tracks) {
        const turnV = steer * 2.2;
        parts.tracks.forEach((tr) => {
          const v = speed + (tr.side < 0 ? turnV : -turnV);
          tr.belt.material.map.offset.y -= v * dt / 2.2;
        });
      }
      // lamps and the beacon
      const lights = opts.lights || 0;
      parts.lamps.forEach((l) => { l.material.emissiveIntensity = 0.2 + lights * 3; });
      spot.intensity = lights * 4;
      parts.beacon.material.emissiveIntensity = (Math.sin(t * 5) > 0.3 ? 3 : 0.2) * (Math.abs(speed) > 0.3 || (opts.work || 0) > 0.05 ? 1 : 0.4);
      // the work, eased
      state.work += ((opts.work || 0) - state.work) * Math.min(1, dt * 1.5);
      const k = state.work;
      if (parts.head) { state.look += dt; parts.head.rotation.y = Math.sin(state.look * 0.7) * 0.9 * (0.4 + k); parts.head.rotation.x = Math.sin(state.look * 1.3) * 0.15 * k; }
      if (parts.hinge) parts.hinge.rotation.x = -k * 0.8;
      if (parts.arm) { parts.arm.rotation.x = k * 0.75; parts.drill.rotation.y += dt * 14 * k; }
      if (parts.turret) { parts.turret.rotation.y = Math.sin(t * 0.4) * 1.4 * k; parts.boom.rotation.x = -0.5 - k * 0.35 * (1 + Math.sin(t * 0.7)); parts.hook.rotation.x = -parts.boom.rotation.x; }
      // dust from the wheels
      if (opts.dust && Math.abs(speed) > 1.5) {
        const n = Math.min(6, Math.abs(speed) * dt * 8);
        for (let i = 0; i < wheels.length; i++) {
          if (Math.random() > n / wheels.length * 2) continue;
          const w = wheels[i];
          tmp.set(w.x, w.y - w.r + 0.1 + state.y, w.z);
          group.localToWorld(tmp);
          opts.dust.emit(tmp, Math.abs(speed));
        }
      }
    },
  };
}

function disposeVehicle(v) {
  if (v.group.parent) v.group.parent.remove(v.group);
  v.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  if (v.parts.tracks) v.parts.tracks.forEach((tr) => { tr.belt.material.map.dispose(); tr.belt.material.dispose(); });
}

// ---------- a simple driving model (flat frame) ----------
function drive(st, input, def, dt) {
  const target = (input.throttle || 0) * def.maxSpeed * (input.throttle < 0 ? 0.4 : 1);
  const rate = Math.abs(target) > Math.abs(st.speed) ? def.accel : def.accel * 2;   // brakes harder than it speeds up
  st.speed += Math.max(-rate * dt, Math.min(rate * dt, target - st.speed));
  if (def.turnRadius) st.yaw += st.speed / def.turnRadius * (input.steer || 0) * dt;
  else st.yaw += (input.steer || 0) * 0.8 * dt;                                        // tracks: on the spot
  st.x += Math.sin(st.yaw) * st.speed * dt; st.z += Math.cos(st.yaw) * st.speed * dt;
  return st;
}

// ---------- dust ----------
function makeDust(color = 0xb08a64) {
  const N = 400;
  const pos = new Float32Array(N * 3), age = new Float32Array(N).fill(99), vel = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aAge", new THREE.BufferAttribute(age, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uLight: { value: 1 } },
    vertexShader: `attribute float aAge; varying float vA;
      void main(){ vA = clamp(1.0 - aAge / 1.8, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (90.0 + aAge * 380.0) / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uLight; varying float vA;
      void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.5; if (a < 0.005) discard; gl_FragColor = vec4(uColor * uLight, a); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let next = 0;
  return {
    points, material: mat,
    emit(p, speed) {
      const i = next; next = (next + 1) % N;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; age[i] = 0;
      vel[i * 3] = (Math.random() - 0.5) * 1.2; vel[i * 3 + 1] = 0.4 + Math.random() * 0.6 + speed * 0.02; vel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    },
    update(dt, up) {
      for (let i = 0; i < N; i++) {
        if (age[i] > 2) continue;
        age[i] += dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] *= 1 - dt * 1.5;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aAge.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

function modelStats(group) { return SK.modelStats(group); }

// parts for other kits (MarineKit's amphibian): a wheel, the shared materials
return { VEHICLES, buildVehicle, disposeVehicle, drive, makeDust, modelStats, parts: { wheel, mats } };
})();
