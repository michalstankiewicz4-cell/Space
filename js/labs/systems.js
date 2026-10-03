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

const state = { system: null, quality: 2, detail: 0.4, speed: 1, lines: true, labels: true, paused: false, focus: -1, simTime: 0 };
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
function load(sys) { state.system = sys; state.focus = -1; rebuild(); renderEditor(); frameSystem(); }

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
    row.append(num(i + 1), select(orbitOpts, o.ref, (ref) => {
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
LabKit.toggle("btnLines", state, "lines", () => handle && handle.showLines(state.lines));
LabKit.toggle("btnLabels", state, "labels", () => { $("labels").classList.toggle("hidden", !state.labels); });
$("btnRotate").addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; $("btnRotate").classList.toggle("on", controls.autoRotate); });
LabKit.toggle("btnPause", state, "paused", () => {});

// labels: one per centre, planet, belt and moon; placed every frame
let labelEls = [];
function buildLabels() {
  const box = $("labels"); box.textContent = "";
  labelEls = handle.bodies.map((e) => {
    if (e.role === "ring") return null;
    const d = document.createElement("div");
    d.textContent = e.name; d.className = e.role;
    box.appendChild(d); return d;
  });
}
const tmpV = new THREE.Vector3();
function placeLabels() {
  if (!state.labels) return;
  const w = window.innerWidth, h = window.innerHeight;
  handle.bodies.forEach((e, i) => {
    const el = labelEls[i]; if (!el) return;
    e.body.group.getWorldPosition(tmpV);
    const dist = tmpV.distanceTo(camera.position);
    if (e.role === "belt") tmpV.x += e.size;                         // a belt: its label on its edge
    else tmpV.y += e.size * (e.ref.startsWith("blackholes/") ? 2 : 1.15);
    tmpV.project(camera);
    const hideMoon = e.role === "moon" && dist > 60;
    if (tmpV.z > 1 || hideMoon) { el.style.display = "none"; return; }
    el.style.display = "";
    el.style.left = ((tmpV.x + 1) / 2 * w).toFixed(0) + "px";
    el.style.top = ((1 - tmpV.y) / 2 * h).toFixed(0) + "px";
  });
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
  controls.update();
  camera.updateMatrixWorld();
  if (sky) sky.update(t, dt, { center: camera.position, renderer });
  renderer.info.reset();
  const focusPos = e ? e.body.group.getWorldPosition(new THREE.Vector3()) : controls.target, focusR = e ? e.size : 10;
  fx.render(focusPos, focusR, systemFx);
  placeLabels();
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
window.systemLab = { load, state, get handle() { return handle; }, camera, controls };
})();
