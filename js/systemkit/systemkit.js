/* =======================================================================
   SYSTEMKIT — star systems built from BodyKit's bodies.
   A classic script (window.SystemKit), like ShipKit and BodyKit: the system
   lab (systems.html) uses it now, the game can later (other systems on the
   galaxy map). Needs THREE and window.BodyKit.

   A system is plain data (JSON-friendly):
     { name, seed, sky: "<SKIES id>",
       centers: [{ ref: "group/body", size, values? }],          1–3; two or
                                       three orbit their common centre
       centerGap?                                    two or three centres: the distance between them
       orbits:  [{ ref, distance, size, incl, phase, values?,     one body
                   stretch?, axis?,                           the ellipse, centred: -0.6..0.6, degrees
                   ring: null | "broad" | "narrow" | "dust",      per orbit
                   moons: [{ ref, distance, size, phase, values? }] }] }
   A `ref` is "groupId/bodyId" from BodyKit.GROUPS; an orbit whose ref is a
   RINGS body is a belt around the centre (its middle at `distance`).
   Units are scene units (a star ~4, an Earth ~1), not to scale.

   API:
     SystemKit.PRESETS             [{ id, name, make() → system }]
     SystemKit.random(seed)        → a generated system (same seed = same system)
     SystemKit.SKIES               [{ id, name, values | none }]
     SystemKit.options(kind)       "center" | "orbit" | "moon" → [{ ref, label }]
     SystemKit.build(system, { detail }) → handle:
       handle.root                 THREE.Group with everything
       handle.bodies               [{ name, ref, body (BodyKit handle), role }]
       handle.update(t, dt, opts)  opts: { camera, renderer, time (orbit clock,
                                   default t), octaves (the quality's) }
       handle.lightPosition        world position of the main light
       handle.dispose()
   ======================================================================= */
window.SystemKit = (function () {
"use strict";

const BK = window.BodyKit;
const TAU = Math.PI * 2;

// ---------- what can go where ----------
const CENTER_GROUPS = ["suns", "blackholes", "pulsars"];
const ORBIT_GROUPS = ["lava", "earthlike", "icy", "desert", "clouded", "moons", "airless", "giants", "rocks", "rings", "blackholes"];
const MOON_GROUPS = ["moons", "airless", "rocks", "icy", "desert"];

function groupOf(ref) { return BK.GROUPS.find((g) => g.id === ref.split("/")[0]); }
function defOf(ref) { const g = groupOf(ref); return g && g.bodies.find((b) => b.id === ref.split("/")[1]); }
function options(kind) {
  const ids = kind === "center" ? CENTER_GROUPS : kind === "moon" ? MOON_GROUPS : ORBIT_GROUPS;
  const out = [];
  for (const id of ids) {
    const g = BK.GROUPS.find((x) => x.id === id);
    if (g) for (const b of g.bodies) out.push({ ref: g.id + "/" + b.id, group: g.name, label: b.name.split(" · ")[0] });
  }
  return out;
}

// ---------- backgrounds: BodyKit's sky with other values ----------
const SKIES = [
  { id: "deep",    name: "Deep field",     values: {} },
  { id: "quiet",   name: "Quiet sky",      values: { nebula: 0.06, band: 0.35, stars: 0.6 } },
  { id: "crimson", name: "Crimson nebula", values: { nebula: 0.75, nebulaBright: 1.2, hueA: 352, hueB: 18, dust: 0.7 } },
  { id: "emerald", name: "Emerald nebula", values: { nebula: 0.6, nebulaBright: 1.1, hueA: 150, hueB: 190 } },
  { id: "core",    name: "Galactic core",  values: { band: 2, stars: 1, starBright: 1.3, nebula: 0.3, hueA: 30, hueB: 45 } },
  { id: "black",   name: "Black",          none: true },
];

// ---------- a seeded random generator ----------
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
function pickWeighted(r, pairs) {           // [[value, weight], ...]
  let sum = 0; for (const p of pairs) sum += p[1];
  let x = r() * sum;
  for (const p of pairs) { if ((x -= p[1]) <= 0) return p[0]; }
  return pairs[pairs.length - 1][0];
}
const bodiesOf = (groupId) => (BK.GROUPS.find((g) => g.id === groupId) || { bodies: [] }).bodies.map((b) => groupId + "/" + b.id);

// ---------- random systems ----------
// Rules: hot, small rocky worlds near the star; temperate ones next (Earth-
// like, desert, clouded); gas and ice giants in the outer system, with
// rings and most of the moons; icy and airless worlds at the edge; at most
// one belt. Hotter stars push the zones outward.
function random(seed) {
  const r = rng(seed);
  const sys = { name: "HX-" + String(Math.floor(r() * 9000) + 1000), seed, sky: pickWeighted(r, [["deep", 5], ["quiet", 2], ["crimson", 1], ["emerald", 1], ["core", 1]]),
    centers: [], orbits: [] };
  const star = () => {
    const temperature = pickWeighted(r, [[3300, 3], [4500, 3], [5778, 4], [7500, 2], [11000, 1]]);
    return { ref: "suns/sol", size: 2.6 + temperature / 3000, values: { seed: Math.floor(r() * 1000), temperature } };
  };
  const kind = pickWeighted(r, [["single", 60], ["binary", 18], ["star+hole", 6], ["hole", 8], ["pulsar", 8]]);
  if (kind === "single") sys.centers.push(star());
  if (kind === "binary") sys.centers.push(star(), star());
  if (kind === "star+hole") sys.centers.push(star(), { ref: "blackholes/abyss", size: 1.1, values: { seed: Math.floor(r() * 1000) } });
  if (kind === "hole") sys.centers.push({ ref: "blackholes/abyss", size: 1.4, values: { seed: Math.floor(r() * 1000) } });
  if (kind === "pulsar") sys.centers.push({ ref: "pulsars/metronome", size: 0.8, values: { seed: Math.floor(r() * 1000), beamHue: 190 + r() * 110, magTilt: 20 + r() * 60 } });
  const hot = sys.centers.reduce((m, c) => Math.max(m, (c.values && c.values.temperature) || 3000), 0);
  const shift = Math.min(0.15, (hot - 5778) / 40000);    // hotter: zones further out

  const n = 3 + Math.floor(r() * 7);
  let d = centerExtent(sys) * 2.4 + 8;
  let belt = false;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) - shift : 0;
    const zone = f < 0.2 ? "hot" : f < 0.45 ? "temperate" : f < 0.8 ? "outer" : "edge";
    let group;
    if (!belt && f > 0.3 && r() < 0.12) { group = "belt"; belt = true; }
    else if (zone === "hot") group = pickWeighted(r, [["lava", 45], ["airless", 35], ["desert", 20]]);
    else if (zone === "temperate") group = pickWeighted(r, [["earthlike", 35], ["desert", 25], ["clouded", 20], ["airless", 10], ["icy", 10]]);
    else if (zone === "outer") group = pickWeighted(r, [["giants", 70], ["icy", 30]]);
    else group = pickWeighted(r, [["icy", 40], ["airless", 30], ["giants", 30]]);
    const o = { distance: Math.round(d * 10) / 10, incl: (r() - 0.5) * 6, phase: r() * TAU, ring: null, moons: [] };
    if (group === "belt") {
      o.ref = pick(r, ["rings/shards", "rings/gossamer"]); o.size = 1;
    } else if (group === "giants") {
      o.ref = zone === "edge" || r() < 0.35 ? pick(r, ["giants/uranus", "giants/neptune"]) : pick(r, ["giants/jupiter", "giants/saturn"]);
      o.size = 2.2 + r() * 1.4;
      o.values = { seed: Math.floor(r() * 1000) };
      if (o.ref !== "giants/saturn" && r() < 0.25) o.ring = pick(r, ["broad", "narrow"]);
      const m = 1 + Math.floor(r() * 4);
      for (let j = 0; j < m; j++) o.moons.push(randomMoon(r, o, j, 0.3 + r() * 0.25));
    } else {
      o.ref = pick(r, bodiesOf(group));
      o.size = 0.6 + r() * 0.9;
      o.values = { seed: Math.floor(r() * 1000) };
      if (r() < 0.06) o.ring = pick(r, ["narrow", "dust"]);
      const m = (group === "earthlike" || group === "desert") ? (r() < 0.35 ? 1 + Math.floor(r() * 2) : 0) : (r() < 0.15 ? 1 : 0);
      for (let j = 0; j < m; j++) o.moons.push(randomMoon(r, o, j, 0.18 + r() * 0.12));
    }
    sys.orbits.push(o);
    d *= 1.38 + r() * 0.22;
  }
  return sys;
}
function randomMoon(r, planet, j, size) {
  const start = planet.size * (planet.ring || planet.ref === "giants/saturn" ? 3 : 1.9);
  return { ref: pick(r, ["moons/luna", "airless/mercury", "rocks/ferrum", "icy/glacies", "icy/rime"]),
    distance: Math.round((start + j * planet.size * 0.9 + r() * 0.4) * 100) / 100, size: Math.round(size * 100) / 100,
    phase: r() * TAU, values: { seed: Math.floor(r() * 1000) } };
}
function centerExtent(sys) {
  // how far the centre reaches: the stars' radii, a pair's separation
  const radii = sys.centers.map(centerReach);
  return Math.max(...radii, 1) + centerRadius(sys);
}
// Two or three centres circle their common middle. `centerGap` (optional)
// is the distance between neighbours — a pair: from one to the other; three:
// a triangle's side; left out, it's 2.2 times the biggest one's reach from
// the middle. Returns how far each one is from the middle.
const GAP_TO_RADIUS = { 2: 0.5, 3: 1 / Math.sqrt(3) };
function centerRadius(sys) {
  const n = sys.centers.length;
  if (n < 2) return 0;
  if (sys.centerGap > 0) return sys.centerGap * GAP_TO_RADIUS[n];
  return Math.max(...sys.centers.map(centerReach)) * 2.2;
}
// the gap the default radius gives (the lab's slider starts there)
function centerGapOf(sys) { const n = sys.centers.length; return n < 2 ? 0 : centerRadius(sys) / GAP_TO_RADIUS[n]; }
// the gaps that make sense: the bodies not touching; the pair inside the first orbit
function centerGapRange(sys) {
  const n = sys.centers.length;
  if (n < 2) return [0, 0];
  const reach = sys.centers.map(centerReach).sort((a, b) => b - a);
  const min = (reach[0] + reach[1]) * 1.05;
  const first = sys.orbits.reduce((m, o) => Math.min(m, o.distance), Infinity);
  const max = isFinite(first) ? (first * 0.8 - reach[0]) / GAP_TO_RADIUS[n] : min * 4;
  return [min, Math.max(min, max)];
}
function centerReach(c) {
  const g = c.ref.split("/")[0];
  return g === "blackholes" ? c.size * 5 : g === "pulsars" ? c.size * 3 : c.size;   // a disk, a glow
}

// ---------- presets ----------
const orbit = (ref, distance, size, extra) => Object.assign({ ref, distance, size, incl: 0, phase: 0, ring: null, moons: [] }, extra);
const moon = (ref, distance, size, phase) => ({ ref, distance, size, phase: phase || 0 });
const PRESETS = [
  { id: "game", name: "The game's system", make() {
    // the game's own nine orbits (BodyKit.GAME_BODIES); orbit 4 is the station ring
    const s = { name: "THE GAME'S SYSTEM", seed: 1, sky: "deep", centers: [{ ref: "suns/sol", size: 4 }], orbits: [] };
    const slot = (n) => { const g = BK.GAME_BODIES[n]; return g && g.groupId + "/" + g.bodyId; };
    [[1, 14, 0.9], [2, 20, 1.2], [3, 28, 1.1], [5, 48, 1.35], [6, 62, 0.95], [7, 78, 1.25], [8, 92, 0.5], [9, 110, 1.2]].forEach(([n, d, sz], i) => {
      if (slot(n)) s.orbits.push(orbit(slot(n), d, sz, { phase: i * 1.7, incl: (i % 3 - 1) * 1.5 }));
    });
    return s;
  } },
  { id: "sol", name: "The Solar System", make() {
    return { name: "SOL SYSTEM", seed: 2, sky: "deep", centers: [{ ref: "suns/sol", size: 4 }], orbits: [
      orbit("airless/mercury", 12, 0.45, { phase: 0.4, incl: 3 }),
      orbit("clouded/venus", 17, 0.95, { phase: 2.1, incl: 1.5 }),
      orbit("earthlike/terra", 23, 1, { phase: 4.0, moons: [moon("moons/luna", 2.1, 0.28)] }),
      orbit("desert/mars", 30, 0.6, { phase: 5.3, incl: 1.8 }),
      orbit("rings/shards", 38, 1, { incl: 2 }),
      orbit("giants/jupiter", 50, 3.2, { phase: 1.1, incl: 1.3, moons: [moon("icy/glacies", 5, 0.3), moon("lava/cinder", 6.2, 0.3, 2), moon("moons/luna", 7.6, 0.4, 4), moon("airless/mercury", 9.2, 0.38, 5)] }),
      orbit("giants/saturn", 66, 2.8, { phase: 3.3, incl: 2.5, moons: [moon("clouded/venus", 8.2, 0.42, 1), moon("icy/rime", 9.6, 0.25, 3)] }),
      orbit("giants/uranus", 80, 1.8, { phase: 5.6, incl: 0.8 }),
      orbit("giants/neptune", 94, 1.75, { phase: 0.7, incl: 1.8, moons: [moon("icy/glacies", 3.4, 0.28)] }),
    ] };
  } },
  { id: "binary", name: "Binary star", make() {
    return { name: "TWIN LIGHTS", seed: 3, sky: "emerald", centers: [
      { ref: "suns/sol", size: 3.6, values: { temperature: 6200 } }, { ref: "suns/sol", size: 2.4, values: { temperature: 4100, seed: 9 } } ], orbits: [
      orbit("desert/mars", 24, 0.9, { phase: 1 }),
      orbit("earthlike/pelagia", 33, 1.2, { phase: 3, moons: [moon("moons/luna", 2.6, 0.3)] }),
      orbit("giants/saturn", 50, 2.6, { phase: 5, incl: 3 }),
      orbit("icy/glacies", 68, 1, { phase: 2 }),
    ] };
  } },
  { id: "pulsar", name: "Pulsar graveyard", make() {
    return { name: "METRONOME'S RUINS", seed: 4, sky: "quiet", centers: [{ ref: "pulsars/metronome", size: 0.8 }], orbits: [
      orbit("airless/mercury", 12, 0.8, { phase: 2 }),
      orbit("rings/shards", 20, 1, { incl: 4 }),
      orbit("icy/glacies", 30, 1.1, { phase: 4, ring: "dust" }),
      orbit("rocks/ferrum", 40, 0.6, { phase: 1 }),
    ] };
  } },
  { id: "abyss", name: "Black hole", make() {
    return { name: "THE MAW", seed: 5, sky: "crimson", centers: [{ ref: "blackholes/abyss", size: 1.4 }], orbits: [
      orbit("rings/gossamer", 14, 1, { incl: 6 }),
      orbit("airless/mercury", 20, 0.8, { phase: 1 }),
      orbit("icy/rime", 30, 1, { phase: 3.5, moons: [moon("rocks/ferrum", 2.2, 0.25)] }),
      orbit("giants/neptune", 44, 2.2, { phase: 5 }),
    ] };
  } },
];

// ---------- building ----------
const RING_STYLE = { broad: 0, narrow: 1, dust: 2 };
const RING_BODY = { broad: "halo", narrow: "filament", dust: "gossamer" };

// A point of an orbit in its own plane, at angle t: an ellipse CENTRED on
// the centre (the user's call: it stretches one way and narrows the other,
// it doesn't slide aside like a comet's). d the mean radius, stretch -0.6..0.6
// (0 a circle; + longer along `axis`, narrower across; - the other way),
// axis the long direction (radians, in the plane).
function orbitPoint(d, stretch, axis, t, out) {
  const x = d * (1 + stretch) * Math.cos(t), z = -d * (1 - stretch) * Math.sin(t);
  const c = Math.cos(axis), s = Math.sin(axis);
  return out.set(x * c - z * s, 0, x * s + z * c);
}
const LINE_SEG = 160;
function orbitLine(d, stretch, axis, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((LINE_SEG + 1) * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  line.raycast = () => {};
  line.userData.base = { color, opacity };
  shapeLine(line, d, stretch, axis);
  return line;
}
const _p = new THREE.Vector3();
function shapeLine(line, d, stretch, axis) {
  const pos = line.geometry.attributes.position;
  for (let i = 0; i <= LINE_SEG; i++) { orbitPoint(d, stretch, axis, i / LINE_SEG * TAU, _p); pos.setXYZ(i, _p.x, _p.y, _p.z); }
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}
const circleLine = (radius, color, opacity) => orbitLine(radius, 0, 0, color, opacity);

function build(sys, { detail = 0.5 } = {}) {
  const root = new THREE.Group();
  const entries = [], lines = [];
  const make = (ref, size, values, extra) => {
    const [g, b] = ref.split("/");
    const body = BK.buildBody(g, b, { detail, values: Object.assign({}, values || {}, extra || {}) });
    body.setRadius(size);
    return body;
  };
  const def = (ref) => defOf(ref) || { name: ref };

  // centres: one at the origin, two or three on a circle around it
  const centers = sys.centers.map((c, i) => {
    const body = make(c.ref, c.size, c.values);
    const holder = new THREE.Group();
    holder.add(body.group);
    root.add(holder);
    const e = { name: def(c.ref).name.split(" · ")[0], ref: c.ref, body, role: "center", holder, size: c.size };
    entries.push(e);
    return e;
  });
  let sep = centerRadius(sys);   // each centre's distance from the middle (setCenterGap changes it)
  const lightIndex = Math.max(0, sys.centers.findIndex((c) => c.ref.startsWith("suns/")));

  // orbits: a plane (tilted by incl), its line (a centred ellipse: stretch, axis) and the body
  const orbits = [];
  sys.orbits.forEach((o, i) => {
    const plane = new THREE.Group();
    plane.rotation.x = THREE.MathUtils.degToRad(o.incl || 0);
    root.add(plane);
    const isBelt = o.ref.startsWith("rings/");
    const line = orbitLine(o.distance, isBelt ? 0 : (o.stretch || 0), THREE.MathUtils.degToRad(o.axis || 0), 0x5f77f7, 0.32);
    plane.add(line); lines.push(line);
    const name = def(o.ref).name.split(" · ")[0];
    const orb = { data: o, plane, line, entry: null, belt: isBelt };
    orbits.push(orb);
    if (isBelt) {
      // a belt around the centre: the middle of its band (~1.8 ring radii) at `distance` (always round)
      const body = make(o.ref, o.distance / 1.8, o.values, { tilt: 0, spin: 0.02 });
      plane.add(body.group);
      orb.entry = { name, ref: o.ref, body, role: "belt", holder: body.group, size: o.distance };
      entries.push(orb.entry);
      return;
    }
    const holder = new THREE.Group();
    plane.add(holder);
    const isGiant = o.ref.startsWith("giants/");
    const extra = {};
    if (isGiant && o.ring) { extra.rings = 1; extra.ringStyle = RING_STYLE[o.ring] === 1 ? 1 : 0; }
    const body = make(o.ref, o.size, o.values, extra);
    holder.add(body.group);
    const e = { name, ref: o.ref, body, role: "planet", holder, size: o.size, distance: o.distance, phase: o.phase || 0, moons: [], orbit: orb };
    orb.entry = e;
    entries.push(e);
    // a ring around a body that has none of its own: a RINGS body, the same tilt
    if (o.ring && !isGiant) {
      const tilt = body.values ? body.values.tilt : 20;
      const ring = make("rings/" + RING_BODY[o.ring], o.size, null, { tilt, spin: 0.05 });
      holder.add(ring.group);
      entries.push({ name: name + " ring", ref: "rings/" + RING_BODY[o.ring], body: ring, role: "ring", holder, size: o.size, follows: e });
    }
    (o.moons || []).forEach((m, j) => {
      const mPlane = new THREE.Group();
      holder.add(mPlane);
      const mLine = circleLine(m.distance, 0x8fa4ff, 0.22);
      mPlane.add(mLine); lines.push(mLine);
      const mHolder = new THREE.Group();
      mPlane.add(mHolder);
      const mBody = make(m.ref, m.size, m.values, { tilt: 5 });
      mHolder.add(mBody.group);
      const me = { name: name + " " + "abcdefgh"[j], ref: m.ref, body: mBody, role: "moon", holder: mHolder, size: m.size, distance: m.distance, phase: m.phase || 0 };
      entries.push(me); e.moons.push(me);
    });
  });

  const lightPosition = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const handle = {
    root, lines, lightPosition, orbits,
    bodies: entries,
    showLines(on) { lines.forEach((l) => { l.visible = on; }); },
    // the distance between the centre's bodies (two or three), live
    setCenterGap(gap) { sys.centerGap = gap; sep = centerRadius(sys); },
    // where each centre body is now (world)
    centerPositions(out = []) { centers.forEach((c, i) => { out[i] = c.holder.getWorldPosition(out[i] || new THREE.Vector3()); }); out.length = centers.length; return out; },
    // change an orbit live — distance, incl (degrees), stretch (-0.6..0.6),
    // axis (degrees) — without building anything again; the data follows
    setOrbit(i, patch) {
      const orb = orbits[i]; if (!orb) return;
      const o = Object.assign(orb.data, patch);
      o.stretch = orb.belt ? 0 : Math.max(-0.6, Math.min(0.6, o.stretch || 0));
      orb.plane.rotation.x = THREE.MathUtils.degToRad(o.incl || 0);
      shapeLine(orb.line, o.distance, o.stretch, THREE.MathUtils.degToRad(o.axis || 0));
      if (orb.belt) { orb.entry.body.setRadius(o.distance / 1.8); orb.entry.size = o.distance; }
      else orb.entry.distance = o.distance;
    },
    // a point of orbit i in the world, at angle t (0: the end of its long axis)
    orbitWorldPoint(i, t, out) {
      const orb = orbits[i], o = orb.data;
      orbitPoint(o.distance, o.stretch || 0, THREE.MathUtils.degToRad(o.axis || 0), t || 0, out);
      orb.plane.updateMatrixWorld();
      return out.applyMatrix4(orb.plane.matrixWorld);
    },
    // one orbit drawn brighter (the lab's selected one), or none (-1)
    highlight(i) {
      orbits.forEach((orb, k) => {
        const m = orb.line.material, b = orb.line.userData.base;
        m.color.set(k === i ? 0xf8bb56 : b.color); m.opacity = k === i ? 0.95 : b.opacity;
      });
    },
    // the orbits turn (Kepler: ω ∝ d^-1.5); every body is updated with the
    // main light; far bodies get fewer noise octaves
    update(t, dt, opts = {}) {
      const ot = opts.time == null ? t : opts.time;   // the orbits' clock (pausable, faster or slower)
      centers.forEach((c, i) => {
        if (centers.length === 1) { c.holder.position.set(0, 0, 0); return; }
        const a = ot * 0.25 + i / centers.length * TAU;
        c.holder.position.set(Math.cos(a) * sep, 0, Math.sin(a) * sep);
      });
      centers[lightIndex].holder.getWorldPosition(lightPosition);
      const cam = opts.camera;
      for (const e of entries) {
        if (e.role === "planet") {
          // along its (centred) ellipse; the pace by the mean radius (Kepler-like: ∝ d^-1.5)
          const o = e.orbit.data;
          orbitPoint(o.distance, o.stretch || 0, THREE.MathUtils.degToRad(o.axis || 0), e.phase + ot * 9 * Math.pow(o.distance, -1.5), e.holder.position);
        } else if (e.role === "moon") {
          const a = e.phase + ot * 3 * Math.pow(e.distance, -1.5);
          e.holder.position.set(Math.cos(a) * e.distance, 0, -Math.sin(a) * e.distance);
        }
        if (opts.octaves && cam) {
          const far = e.body.group.getWorldPosition(tmp).distanceTo(cam.position) / Math.max(0.1, e.size);
          e.body.setOctaves(Math.max(2, opts.octaves - (far > 80 ? 2 : far > 30 ? 1 : 0)));
        }
        e.body.update(t, dt, { sunPosition: lightPosition, center: cam && cam.position, renderer: opts.renderer });
      }
    },
    dispose() {
      entries.forEach((e) => BK.disposeBody(e.body));
      lines.forEach((l) => { l.geometry.dispose(); l.material.dispose(); });
      if (root.parent) root.parent.remove(root);
    },
  };
  handle.update(0, 0, {});
  return handle;
}

return { PRESETS, SKIES, random, options, build, centerExtent, centerGapOf, centerGapRange, defOf, orbitPoint };
})();
