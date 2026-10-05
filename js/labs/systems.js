// The systems lab's own script (systems.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const SK = window.SystemKit;

// ---------- renderer, camera ----------
const view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 6000);
camera.position.set(0, 70, 150);
const controls = new THREE.OrbitControls(camera, view);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 0.5; controls.maxDistance = 1200;
controls.autoRotateSpeed = 0.25;

const QUALITY = [
  { name: "LOW", pr: 0.5 }, { name: "MEDIUM", pr: 0.75 }, { name: "HIGH", pr: 1 },
  { name: "ULTRA", pr: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)) }, { name: "MAX", pr: Math.min(Math.max(1, window.devicePixelRatio || 1) * 1.5, 3) },
];
QUALITY.forEach((q, i) => { q.octaves = BodyKit.QUALITY_OCTAVES[i]; });

const state = { system: null, quality: 2, detail: 0.4, speed: 1, lines: true, labels: true, paused: false, focus: -1, simTime: 0,
  view: "free", sel: -1 };
let handle = null, sky = null, skyId = null;

// ---------- the background ----------
function setSky(id) {
  if (id === skyId) return;
  skyId = id;
  if (sky) { BodyKit.disposeBody(sky); sky = null; }
  const def = SK.SKIES.find((s) => s.id === id) || SK.SKIES[0];
  if (def.none) return;
  const ref = BodyKit.GAME_KINDS.sky;
  sky = BodyKit.buildBody(ref.groupId, ref.bodyId, { detail: 1, values: def.values });
  sky.setRadius(2500);
  sky.setOctaves(QUALITY[state.quality].octaves);
  scene.add(sky.group);
}

// ---------- building the system ----------
function rebuild() {
  if (handle) handle.dispose();
  handle = SK.build(state.system, { detail: state.detail });
  scene.add(handle.root);
  handle.showLines(state.lines);
  setSky(state.system.sky);
  $("sysName").textContent = state.system.name || "";
  fillFocus();
  fillStats();
  buildLabels();
  buildRuler();
  buildHandles();
  if (state.sel >= state.system.orbits.length) state.sel = -1;
  selectOrbit(state.sel);
}
let rebuildQueued = false;
function queueRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; rebuild(); renderEditor(); });
}
function frameSystem() {
  const far = state.system.orbits.reduce((m, o) => Math.max(m, o.distance), 20);
  controls.target.set(0, 0, 0);
  camera.position.set(0, far * 0.75, far * 1.9);
}
function load(sys) { state.system = sys; state.focus = -1; state.sel = -1; rebuild(); renderEditor(); setView("free", true); }

// ---------- the editor (left panel) ----------
const centerOpts = SK.options("center"), orbitOpts = SK.options("orbit"), moonOpts = SK.options("moon");
function select(opts, value, onChange, extraFirst) {
  const s = document.createElement("select");
  s.className = "lab";
  if (extraFirst) { const o = document.createElement("option"); o.value = extraFirst[0]; o.textContent = extraFirst[1]; s.appendChild(o); }
  let grp = null;   // the bodies grouped by their BodyKit group
  for (const op of opts) {
    if (!grp || grp.label !== op.group) { grp = document.createElement("optgroup"); grp.label = op.group; s.appendChild(grp); }
    const o = document.createElement("option"); o.value = op.ref; o.textContent = op.label; grp.appendChild(o);
  }
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}
function xButton(onClick) { const b = document.createElement("button"); b.className = "xBtn"; b.textContent = "✕"; b.title = "Remove"; b.addEventListener("click", onClick); return b; }
const num = (txt) => { const n = document.createElement("span"); n.className = "n"; n.textContent = txt; return n; };
const defaultCenterSize = (ref) => ref.startsWith("blackholes/") ? 1.4 : ref.startsWith("pulsars/") ? 0.8 : 4;
const defaultSize = (ref) => ref.startsWith("giants/") ? 2.6 : ref.startsWith("rings/") ? 1 : ref.startsWith("blackholes/") ? 1.2 : 1;
let moonSeed = 1;
const moonRefs = moonOpts.map((o) => o.ref);
function makeMoons(o, count) {
  o.moons = (o.moons || []).slice(0, count);
  const start = o.size * (o.ring || o.ref === "giants/saturn" ? 3 : 1.9);
  while (o.moons.length < count) {
    const j = o.moons.length;
    moonSeed = (moonSeed * 48271) % 2147483647;
    o.moons.push({ ref: moonRefs[moonSeed % moonRefs.length], distance: Math.round((start + j * o.size * 0.9) * 100) / 100,
      size: Math.round((o.ref.startsWith("giants/") ? 0.35 : 0.22) * 100) / 100, phase: (moonSeed % 628) / 100, values: { seed: moonSeed % 1000 } });
  }
}

function renderEditor() {
  const sys = state.system;
  const cBox = $("centers"); cBox.textContent = "";
  sys.centers.forEach((c, i) => {
    const row = document.createElement("div"); row.className = "crow";
    row.append(num(i + 1), select(centerOpts, c.ref, (ref) => { c.ref = ref; c.size = defaultCenterSize(ref); c.values = {}; queueRebuild(); }),
      xButton(() => { if (sys.centers.length > 1) { sys.centers.splice(i, 1); queueRebuild(); } }));
    cBox.appendChild(row);
  });
  $("addCenter").disabled = sys.centers.length >= 3;
  showCenterGap();

  const oBox = $("orbits"); oBox.textContent = "";
  sys.orbits.forEach((o, i) => {
    const row = document.createElement("div"); row.className = "orow";
    const belt = o.ref.startsWith("rings/");
    const ring = document.createElement("select"); ring.className = "lab";
    [["", "—"], ["broad", "broad"], ["narrow", "narrow"], ["dust", "dust"]].forEach(([v, t]) => { const op = document.createElement("option"); op.value = v; op.textContent = t; ring.appendChild(op); });
    ring.value = o.ring || ""; ring.disabled = belt;
    ring.addEventListener("change", () => { o.ring = ring.value || null; queueRebuild(); });
    const moons = document.createElement("input"); moons.type = "number"; moons.min = 0; moons.max = 6; moons.step = 1; moons.value = (o.moons || []).length;
    moons.disabled = belt;
    moons.addEventListener("change", () => { makeMoons(o, Math.max(0, Math.min(6, Math.round(+moons.value) || 0))); queueRebuild(); });
    const n = num(i + 1); n.title = "Select this orbit: its distance, tilt and shape below";
    n.addEventListener("click", () => selectOrbit(i));
    if (i === state.sel) row.classList.add("sel");
    row.append(n, select(orbitOpts, o.ref, (ref) => {
      o.ref = ref; o.size = defaultSize(ref); o.values = { seed: (o.values && o.values.seed) || i * 7 + 1 };
      if (ref.startsWith("rings/")) { o.ring = null; o.moons = []; }
      queueRebuild();
    }), ring, moons, xButton(() => { sys.orbits.splice(i, 1); queueRebuild(); }));
    oBox.appendChild(row);
  });
  const skySel = $("sky");
  if (!skySel.options.length) SK.SKIES.forEach((s) => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; skySel.appendChild(o); });
  skySel.value = sys.sky;
}

$("addCenter").addEventListener("click", () => {
  if (state.system.centers.length < 3) { state.system.centers.push({ ref: "suns/sol", size: 3, values: { temperature: 4200, seed: state.system.centers.length * 5 } }); queueRebuild(); }
});
$("addOrbit").addEventListener("click", () => {
  const sys = state.system, last = sys.orbits[sys.orbits.length - 1];
  const distance = last ? Math.round(last.distance * 1.45 * 10) / 10 : SK.centerExtent(sys) * 2.4 + 8;
  sys.orbits.push({ ref: "earthlike/terra", distance, size: 1, incl: 0, phase: sys.orbits.length * 1.9, ring: null, moons: [], values: { seed: sys.orbits.length * 11 } });
  queueRebuild();
});
$("sky").addEventListener("change", () => { state.system.sky = $("sky").value; setSky(state.system.sky); });

// presets and random
SK.PRESETS.forEach((p) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = p.name.toUpperCase();
  b.addEventListener("click", () => load(p.make()));
  $("presets").appendChild(b);
});
$("btnRandom").addEventListener("click", () => load(SK.random(Math.max(1, Math.round(+$("seed").value) || 1))));
$("btnDice").addEventListener("click", () => { $("seed").value = Math.floor(Math.random() * 99999) + 1; $("btnRandom").click(); });
$("btnCopy").addEventListener("click", () => {
  const text = JSON.stringify(state.system, (k, v) => typeof v === "number" ? Math.round(v * 1000) / 1000 : v, 1);
  console.log(text);
  const b = $("btnCopy");
  (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => { b.textContent = "COPIED ✓"; }, () => { b.textContent = "SEE CONSOLE (F12)"; })
    .then(() => setTimeout(() => { b.textContent = "COPY SYSTEM"; }, 1600));
});

// ---------- view (right panel) ----------
function fillFocus() {
  const f = $("focus"); f.textContent = "";
  const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; f.appendChild(o); };
  add(-1, "The whole system");
  handle.bodies.forEach((e, i) => { if (e.role !== "ring") add(i, (e.role === "moon" ? "  ↳ " : "") + e.name); });
  f.value = state.focus;
}
$("focus").addEventListener("change", () => {
  state.focus = +$("focus").value;
  glide = null;
  if (state.focus < 0) { frameSystem(); return; }
  const e = handle.bodies[state.focus];
  const p = e.body.group.getWorldPosition(new THREE.Vector3());
  const d = e.role === "belt" ? e.size * 2.2 : e.role === "center" && e.ref.startsWith("pulsars/") ? 30 : e.size * (e.ref.startsWith("blackholes/") ? 16 : 6);
  controls.target.copy(p);
  camera.position.copy(p).add(new THREE.Vector3(0, d * 0.35, d));
});
function fillStats() {
  const sys = state.system, rows = [];
  const moons = sys.orbits.reduce((m, o) => m + (o.moons ? o.moons.length : 0), 0);
  rows.push(["Centre", sys.centers.map((c) => (SK.defOf(c.ref) || { name: c.ref }).name.split(" · ")[0]).join(" + ")]);
  rows.push(["Orbits", sys.orbits.length], ["Moons", moons], ["Rings", sys.orbits.filter((o) => o.ring || o.ref === "giants/saturn").length]);
  rows.push(["Bodies built", handle.bodies.length]);
  $("sysRows").innerHTML = "";
  for (const [k, v] of rows) { const r = document.createElement("div"); r.className = "row"; const s = document.createElement("span"); s.textContent = k; const b = document.createElement("b"); b.textContent = v; r.append(s, b); $("sysRows").appendChild(r); }
}
const paint = LabKit.paintSlider;
$("speed").addEventListener("input", () => { state.speed = +$("speed").value; $("speedVal").textContent = "×" + state.speed.toFixed(1); paint($("speed")); });
LabKit.toggle("btnLines", state, "lines", () => { if (handle) handle.showLines(state.lines); if (ruler) ruler.visible = state.lines; });
LabKit.toggle("btnLabels", state, "labels", () => { $("labels").classList.toggle("hidden", !state.labels); });
$("btnRotate").addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; $("btnRotate").classList.toggle("on", controls.autoRotate); });
LabKit.toggle("btnPause", state, "paused", () => {});

// labels: one per centre, planet, belt and moon, and the ruler's gaps; placed every frame
let labelEls = [], gapEls = [];
function buildLabels() {
  const box = $("labels"); box.textContent = "";
  labelEls = handle.bodies.map((e) => {
    if (e.role === "ring") return null;
    const d = document.createElement("div");
    d.textContent = e.name; d.className = e.role;
    box.appendChild(d); return d;
  });
  gapEls = [];
}
const tmpV = new THREE.Vector3();
// the more important first (centres, planets, belts, moons); a label that
// would cover one already placed stays hidden this frame
const RANK = { center: 0, planet: 1, belt: 2, moon: 3 };
function placeLabels() {
  const w = window.innerWidth, h = window.innerHeight, taken = [];
  const fits = (x, y, el, centred) => {
    const bw = el.offsetWidth || 60, bh = el.offsetHeight || 16;
    const r = centred ? [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2] : [x - bw / 2, y - bh, x + bw / 2, y];
    if (taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) return false;
    taken.push(r); return true;
  };
  // the ruler's gaps first: they're what you're adjusting
  gapEls.forEach((g) => {
    g.el.style.display = "none";
    if (!state.lines || !g.show) return;
    tmpV.copy(g.at).project(camera);
    if (tmpV.z > 1) return;
    const x = (tmpV.x + 1) / 2 * w, y = (1 - tmpV.y) / 2 * h;
    g.el.style.display = "";
    if (!fits(x, y, g.el, true)) { g.el.style.display = "none"; return; }
    g.el.style.left = x.toFixed(0) + "px"; g.el.style.top = y.toFixed(0) + "px";
  });
  if (!state.labels) return;
  const order = handle.bodies.map((e, i) => i).filter((i) => labelEls[i]).sort((a, b) => RANK[handle.bodies[a].role] - RANK[handle.bodies[b].role]);
  order.forEach((i) => {
    const e = handle.bodies[i], el = labelEls[i];
    e.body.group.getWorldPosition(tmpV);
    const dist = tmpV.distanceTo(camera.position);
    if (e.role === "belt") tmpV.x += e.size;                         // a belt: its label on its edge
    else tmpV.y += e.size * (e.ref.startsWith("blackholes/") ? 2 : 1.15);
    tmpV.project(camera);
    const hideMoon = e.role === "moon" && dist > 60;
    if (tmpV.z > 1 || hideMoon) { el.style.display = "none"; return; }
    const x = (tmpV.x + 1) / 2 * w, y = (1 - tmpV.y) / 2 * h;
    el.style.display = "";
    if (!fits(x, y, el, false)) { el.style.display = "none"; return; }
    el.style.left = x.toFixed(0) + "px";
    el.style.top = y.toFixed(0) + "px";
  });
}

// ---------- the ruler: a line from the centre with a tick at every orbit ----------
// It runs along +Z in the system's plane; between two ticks, the gap.
let ruler = null;
const RULER_COLOR = 0xf2b84b;
function sortedOrbits() { return state.system.orbits.map((o, i) => ({ o, i })).sort((a, b) => a.o.distance - b.o.distance); }
function buildRuler() {
  if (ruler) { scene.remove(ruler); ruler.geometry.dispose(); ruler.material.dispose(); ruler = null; }
  gapEls.forEach((g) => g.el.remove()); gapEls = [];
  const list = sortedOrbits();
  if (!list.length) return;
  const start = SK.centerExtent(state.system) * 1.15, end = list[list.length - 1].o.distance * 1.06;
  const tick = Math.max(0.6, end * 0.012);
  const pts = [0, 0, start, 0, 0, end];
  list.forEach(({ o }) => pts.push(-tick, 0, o.distance, tick, 0, o.distance));
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  ruler = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: RULER_COLOR, transparent: true, opacity: 0.55, depthWrite: false }));
  ruler.raycast = () => {};
  ruler.visible = state.lines;
  scene.add(ruler);
  // the gaps: from the centre to the first orbit, then between neighbours
  const box = $("labels");
  let prev = null;
  list.forEach(({ o }) => {
    const from = prev == null ? 0 : prev, gap = o.distance - from;
    const el = document.createElement("div"); el.className = "gap";
    el.textContent = (prev == null ? "" : "Δ ") + gap.toFixed(1);
    box.appendChild(el);
    gapEls.push({ el, at: new THREE.Vector3(tick * 3.2, 0, prev == null ? o.distance * 0.55 : (from + o.distance) / 2), show: prev != null });
    prev = o.distance;
  });
}

// ---------- the handles (HTML points, placed every frame) ----------
// distance: a gold diamond on the ruler (any view); shape: a teal point at
// the end of the orbit's long axis (from above); tilt: a violet point at
// the orbit's edge across from the ruler (from the side)
let handles = [];
function buildHandles() {
  const box = $("handles"); box.textContent = ""; handles = [];
  state.system.orbits.forEach((o, i) => {
    const belt = o.ref.startsWith("rings/");
    for (const kind of ["dist", "incl", "shape"]) {
      if (kind === "shape" && belt) continue;
      const el = document.createElement("div"); el.className = "hdl " + kind;
      el.title = { dist: "Drag along the ruler: the distance", incl: "Drag up or down: the tilt", shape: "Drag out: longer this way, narrower across; in: the other way; around: turn the long axis" }[kind];
      el.addEventListener("pointerdown", (e) => startDrag(e, i, kind));
      box.appendChild(el);
      handles.push({ el, i, kind });
    }
  });
}
const hp = new THREE.Vector3();
function handlePos(h, out) {
  const o = state.system.orbits[h.i];
  if (h.kind === "dist") return out.set(0, 0, o.distance);
  if (h.kind === "shape") return handle.orbitWorldPoint(h.i, 0, out);
  // tilt: the orbit plane's -Z edge (the ruler runs along +Z: no overlap)
  const orb = handle.orbits[h.i]; orb.plane.updateMatrixWorld();
  return out.set(0, 0, -o.distance).applyMatrix4(orb.plane.matrixWorld);
}
function placeHandles() {
  const w = window.innerWidth, h = window.innerHeight, show = state.lines;
  handles.forEach((hd) => {
    const want = show && (hd.kind === "dist" || (hd.kind === "shape" && state.view === "top") || (hd.kind === "incl" && state.view === "side"));
    if (!want) { hd.el.style.display = "none"; return; }
    handlePos(hd, hp).project(camera);
    if (hp.z > 1) { hd.el.style.display = "none"; return; }
    hd.el.style.display = "";
    hd.el.style.left = ((hp.x + 1) / 2 * w).toFixed(1) + "px";
    hd.el.style.top = ((1 - hp.y) / 2 * h).toFixed(1) + "px";
    hd.el.classList.toggle("sel", hd.i === state.sel);
  });
}

// ---------- dragging ----------
const rayc = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), dragPlane = new THREE.Plane();
let drag = null;
function pointerRay(e) { ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); rayc.setFromCamera(ndc, camera); return rayc.ray; }
function startDrag(e, i, kind) {
  e.preventDefault(); e.stopPropagation();
  selectOrbit(i);
  drag = { i, kind, id: e.pointerId };
  controls.enabled = false;
  document.body.classList.add("dragging");
  const n = new THREE.Vector3();
  if (kind === "dist") {
    // a plane holding the ruler (+Z), turned toward the camera
    camera.getWorldDirection(n); n.z = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    dragPlane.setFromNormalAndCoplanarPoint(n.normalize(), new THREE.Vector3());
  } else if (kind === "incl") dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), new THREE.Vector3());
  else {
    // the orbit's own plane
    const orb = handle.orbits[i]; orb.plane.updateMatrixWorld();
    n.set(0, 1, 0).transformDirection(orb.plane.matrixWorld);
    dragPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3());
  }
}
window.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!pointerRay(e).intersectPlane(dragPlane, hit)) return;
  const o = state.system.orbits[drag.i], list = sortedOrbits(), k = list.findIndex((x) => x.i === drag.i);
  if (drag.kind === "dist") {
    // between its neighbours (orbits never pass through each other)
    const lo = k > 0 ? list[k - 1].o.distance + 1 : SK.centerExtent(state.system) * 1.3;
    const hi = k < list.length - 1 ? list[k + 1].o.distance - 1 : 1000;
    setOrbit(drag.i, { distance: Math.round(Math.max(lo, Math.min(hi, hit.z)) * 2) / 2 });
  } else if (drag.kind === "incl") {
    // the -Z edge: (0, 0, -d) turned by incl about X lands at (0, d·sin, -d·cos)
    setOrbit(drag.i, { incl: Math.round(THREE.MathUtils.radToDeg(Math.atan2(hit.y, Math.max(0.01, -hit.z))) * 2) / 2 });
  } else {
    // out from the centre: longer along this direction (and narrower across);
    // in: shorter here, longer across; around: the axis turns (an axis, so 0..180°)
    const orb = handle.orbits[drag.i], local = orb.plane.worldToLocal(hit.clone());
    const r = Math.hypot(local.x, local.z);
    setOrbit(drag.i, { stretch: Math.round(Math.max(-0.6, Math.min(0.6, r / o.distance - 1)) * 100) / 100,
      axis: ((Math.round(THREE.MathUtils.radToDeg(Math.atan2(local.z, local.x))) % 180) + 180) % 180 });
  }
});
function endDrag() { if (!drag) return; drag = null; controls.enabled = true; document.body.classList.remove("dragging"); }
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

// ---------- the centre: the distance between two or three bodies ----------
// A slider (CENTRE), and in the view a line between the bodies with the
// distance written on it, the ruler's style.
function showCenterGap() {
  const sys = state.system, n = sys.centers.length;
  $("cGapBox").classList.toggle("hidden", n < 2);
  if (n < 2) return;
  const [lo, hi] = SK.centerGapRange(sys), gap = sys.centerGap || SK.centerGapOf(sys);
  const s = $("cGap");
  s.min = lo.toFixed(1); s.max = hi.toFixed(1);
  if (document.activeElement !== s) s.value = gap;
  paint(s);
  $("cGapLbl").textContent = n === 2 ? "Distance between them" : "Distance between each two";
  $("cGapVal").textContent = gap.toFixed(1) + (gap > hi + 0.05 ? " (past the first orbit!)" : "");
}
$("cGap").addEventListener("input", () => {
  const g = +$("cGap").value;
  handle.setCenterGap(g);
  showCenterGap();
  buildRuler();
});
let gapLine = null, gapLabel = null;
const cPos = [];
function placeCenterGap() {
  // the bodies actually built (the data may already hold one more, until the rebuild)
  const n = handle.centerPositions(cPos).length;
  if (!gapLine) {
    gapLine = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(18), 3)),
      new THREE.LineBasicMaterial({ color: RULER_COLOR, transparent: true, opacity: 0.6, depthWrite: false }));
    gapLine.raycast = () => {}; gapLine.frustumCulled = false;
    scene.add(gapLine);
    gapLabel = document.createElement("div"); gapLabel.className = "gap";
  }
  if (gapLabel.parentNode !== $("labels")) $("labels").appendChild(gapLabel);
  const show = n > 1 && state.lines;
  gapLine.visible = show;
  if (!show) { gapLabel.style.display = "none"; return; }
  // each pair of neighbours (a pair: one line; three: the triangle)
  const pos = gapLine.geometry.attributes.position, pairs = n === 2 ? [[0, 1]] : [[0, 1], [1, 2], [2, 0]];
  for (let k = 0; k < 3; k++) {
    const p = pairs[k] || pairs[0];
    pos.setXYZ(k * 2, cPos[p[0]].x, cPos[p[0]].y, cPos[p[0]].z); pos.setXYZ(k * 2 + 1, cPos[p[1]].x, cPos[p[1]].y, cPos[p[1]].z);
  }
  pos.needsUpdate = true;
  tmpV.copy(cPos[0]).add(cPos[1]).multiplyScalar(0.5).project(camera);
  if (tmpV.z > 1) { gapLabel.style.display = "none"; return; }
  gapLabel.style.display = "";
  gapLabel.textContent = "↔ " + cPos[0].distanceTo(cPos[1]).toFixed(1);
  gapLabel.style.left = ((tmpV.x + 1) / 2 * window.innerWidth).toFixed(0) + "px";
  gapLabel.style.top = ((1 - tmpV.y) / 2 * window.innerHeight + 14).toFixed(0) + "px";
}

// ---------- the selected orbit: its sliders ----------
function setOrbit(i, patch) {
  handle.setOrbit(i, patch);
  buildRuler();
  if (i === state.sel) showSelected();
}
function selectOrbit(i) {
  state.sel = i;
  if (handle) handle.highlight(i);
  document.querySelectorAll("#orbits .orow").forEach((r, k) => r.classList.toggle("sel", k === i));
  showSelected();
}
function showSelected() {
  const o = state.sel >= 0 && state.system.orbits[state.sel];
  $("selHint").classList.toggle("hidden", !!o); $("selCtl").classList.toggle("hidden", !o);
  $("selName").textContent = o ? " · " + (state.sel + 1) + " " + (SK.defOf(o.ref) || { name: o.ref }).name.split(" · ")[0] : "";
  if (!o) return;
  const belt = o.ref.startsWith("rings/");
  const set = (id, v, txt) => { const s = $(id); if (document.activeElement !== s) { s.value = v; paint(s); } $(id + "Val").textContent = txt; };
  set("oDist", o.distance, o.distance.toFixed(1));
  set("oIncl", o.incl || 0, (o.incl || 0).toFixed(1) + "°");
  const st = o.stretch || 0;
  set("oEcc", st, belt ? "a belt stays round" : Math.abs(st) < 0.01 ? "0 (a circle)" : (st > 0 ? "+" : "") + st.toFixed(2));
  set("oPeri", o.axis || 0, Math.round(o.axis || 0) + "°");
  $("oEcc").disabled = $("oPeri").disabled = belt;
}
[["oDist", "distance"], ["oIncl", "incl"], ["oEcc", "stretch"], ["oPeri", "axis"]].forEach(([id, key]) => {
  $(id).addEventListener("input", () => { if (state.sel < 0) return; paint($(id)); setOrbit(state.sel, { [key]: +$(id).value }); });
});

// ---------- the camera: from above, from the side, free ----------
let glide = null;
function setView(v, instant) {
  state.view = v;
  ["vTop", "vSide", "vFree"].forEach((id) => $(id).classList.toggle("on", id === { top: "vTop", side: "vSide", free: "vFree" }[v]));
  state.focus = -1; if ($("focus").options.length) $("focus").value = -1;
  if (v !== "free") { controls.autoRotate = false; $("btnRotate").classList.remove("on"); }
  const far = state.system.orbits.reduce((m, o) => Math.max(m, o.distance * (1 + Math.abs(o.stretch || 0))), 20);
  const to = v === "top" ? new THREE.Vector3(0, far * 2.6, 0.001) : v === "side" ? new THREE.Vector3(far * 2.6, 0, 0) : new THREE.Vector3(0, far * 0.75, far * 1.9);
  if (instant) { controls.target.set(0, 0, 0); camera.position.copy(to); glide = null; return; }
  glide = { from: camera.position.clone(), fromT: controls.target.clone(), to, t: 0 };
}
$("vTop").addEventListener("click", () => setView("top"));
$("vSide").addEventListener("click", () => setView("side"));
$("vFree").addEventListener("click", () => setView("free"));
function stepGlide(dt) {
  if (!glide) return;
  glide.t = Math.min(1, glide.t + dt / 0.7);
  const k = glide.t * glide.t * (3 - 2 * glide.t);
  camera.position.lerpVectors(glide.from, glide.to, k);
  controls.target.lerpVectors(glide.fromT, new THREE.Vector3(), k);
  if (glide.t >= 1) glide = null;
}

// ---------- quality ----------
function applyQuality(level) {
  const q = QUALITY[level];
  renderer.setPixelRatio(q.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (sky) sky.setOctaves(q.octaves);
  $("qVal").textContent = q.name;
}
$("qSlider").addEventListener("input", () => { state.quality = +$("qSlider").value; paint($("qSlider")); applyQuality(state.quality); fx.markCustom(); });
$("dSlider").addEventListener("input", () => { state.detail = +$("dSlider").value; $("dVal").textContent = Math.round(state.detail * 100) + "%"; paint($("dSlider")); queueRebuild(); });
const fx = LabKit.imageEffects({ renderer, scene, camera, panel: $("fxPanel"),
  effects: ["bloom", "fxaa", "sharpen", "filter", "dof", "flare", "rays", "lens"],
  setQuality: (level) => { state.quality = level; $("qSlider").value = level; paint($("qSlider")); applyQuality(level); },
});
// the flare and rays from the main star; the lensing of a black hole in the centre
function systemFx(o) {
  const star = handle.bodies.find((e) => e.role === "center" && e.ref.startsWith("suns/"));
  const hole = handle.bodies.find((e) => e.role === "center" && e.ref.startsWith("blackholes/"));
  return {
    flare: (o.flare || o.rays) && star ? { position: star.body.group.getWorldPosition(new THREE.Vector3()), radius: star.size, strength: o.flare ? 1 : 0, rays: o.rays ? 1 : 0 } : null,
    lens: o.lens && hole ? { object: hole.body.group, position: hole.body.group.getWorldPosition(new THREE.Vector3()), radius: hole.size } : null,
  };
}
LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 5);   // the panels fade out when idle
const perf = LabKit.perfCounters(renderer);
function fitHud() { LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3); }

// ---------- the loop ----------
const clock = new THREE.Clock();
const followPrev = new THREE.Vector3(), followNow = new THREE.Vector3();
function frame() {
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!state.paused) state.simTime += dt * state.speed;
  // follow: the camera moves along with the followed body
  const e = state.focus >= 0 && handle.bodies[state.focus];
  if (e) e.body.group.getWorldPosition(followPrev);
  handle.update(t, dt, { camera, renderer, octaves: QUALITY[state.quality].octaves, time: state.simTime });
  if (e) {
    const delta = e.body.group.getWorldPosition(followNow).sub(followPrev);
    camera.position.add(delta);
    controls.target.add(delta);
  }
  stepGlide(dt);
  controls.update();
  camera.updateMatrixWorld();
  if (sky) sky.update(t, dt, { center: camera.position, renderer });
  renderer.info.reset();
  const focusPos = e ? e.body.group.getWorldPosition(new THREE.Vector3()) : controls.target, focusR = e ? e.size : 10;
  fx.render(focusPos, focusR, systemFx);
  placeLabels();
  placeHandles();
  placeCenterGap();
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}
window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); applyQuality(state.quality); fitHud(); });
if (document.fonts) document.fonts.ready.then(fitHud);

[$("speed"), $("qSlider"), $("dSlider")].forEach(paint);
applyQuality(state.quality);
load(SK.PRESETS[1].make());
fitHud();
frame();
const loading = $("loading");
loading.style.opacity = "0";
setTimeout(() => loading.remove(), 700);
window.systemLab = { load, state, get handle() { return handle; }, camera, controls, setView, selectOrbit, setOrbit };
})();
