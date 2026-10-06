// The creature editor's own script (labs/creator.html): a design (LifeKit
// design.js) built into a creature, handles to shape it, and its walk.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const LK = window.LifeKit, DK = LK.design;
const view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = ShipKit.makeEnvironment(renderer);
const BG = new THREE.Color(0x10141d);
scene.background = BG; scene.fog = new THREE.Fog(BG, 16, 70);
const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 400);
const controls = new THREE.OrbitControls(camera, view);
controls.enableDamping = true; controls.maxPolarAngle = 1.62; controls.minDistance = 0.4; controls.maxDistance = 30;
const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1, near: 0.5, far: 20 });
key.position.set(3, 5, 3);
const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2); rim.position.set(-2, 3, -4);
scene.add(key, key.target, rim, new THREE.HemisphereLight(0xc9d4ff, 0x3a3128, 0.55));
const floorTex = (() => {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
  x.fillStyle = "#2a2f3a"; x.fillRect(0, 0, S, S);
  for (let k = 0; k <= 5; k++) { x.strokeStyle = k === 0 || k === 5 ? "rgba(143,164,255,0.55)" : "rgba(143,164,255,0.22)"; x.lineWidth = k === 0 || k === 5 ? 3 : 1.5; const p = k * S / 5; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.moveTo(0, p); x.lineTo(S, p); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.repeat.set(40, 40); return t;
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------- the design, kept in this browser ----------
const KEY = "creatorLab.design";
let design;
try { design = DK.clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { design = DK.clean(DK.PRESETS.grazer); }
if (!localStorage.getItem(KEY)) design = DK.clean(DK.PRESETS.grazer);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(design)); } catch (e) { /* storage blocked */ } };
const state = { mode: "edit", gait: "walk", speed: 1, look: 0, low: 0, sel: Math.floor(design.spine.length / 2), leg: 0, view: "side" };

// ---------- the creature and its handles ----------
let cre = null, dirty = true, lastBuild = 0;
const handles = new THREE.Group(); scene.add(handles);
const hGeo = new THREE.SphereGeometry(1, 16, 12);
const gold = new THREE.MeshBasicMaterial({ color: 0xf8bb56, depthTest: false, transparent: true, opacity: 0.95 });
const goldSel = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
const teal = new THREE.MeshBasicMaterial({ color: 0x36d6b5, depthTest: false, transparent: true, opacity: 0.95 });
const lineMat = new THREE.LineBasicMaterial({ color: 0xf8bb56, depthTest: false, transparent: true, opacity: 0.5 });
function rebuild() {
  if (cre) cre.dispose();
  cre = DK.build(design, { detail: 1 });
  scene.add(cre.group);
  if (state.mode === "edit") cre.rest();
  drawHandles(); showStats(); save();
  $("hudTitle").textContent = design.name.toUpperCase();
  dirty = false; lastBuild = performance.now();
}
function drawHandles() {
  handles.clear();
  if (state.mode !== "edit") return;
  const H = cre.handles, sz = Math.max(0.018, cre.dims.H * 0.022);
  H.spine.forEach((p, i) => { const m = new THREE.Mesh(hGeo, i === state.sel ? goldSel : gold); m.scale.setScalar(i === state.sel ? sz * 1.35 : sz); m.position.copy(p).setX(0.001); m.renderOrder = 20; m.userData = { kind: "spine", i }; handles.add(m); });
  const lg = new THREE.BufferGeometry().setFromPoints(H.spine); const line = new THREE.Line(lg, lineMat); line.renderOrder = 19; handles.add(line);
  H.legs.forEach((p, k) => { const m = new THREE.Mesh(hGeo, teal); m.scale.setScalar(sz * (k === state.leg ? 1.3 : 1)); m.position.copy(p); m.renderOrder = 20; m.userData = { kind: "leg", k }; handles.add(m); });
}
function showStats() {
  const st = ShipKit.modelStats(cre.group);
  let bones = 0; cre.group.traverse((o) => { if (o.isBone) bones++; });
  const rows = [["Legs", design.legs.length * 2], ["Spine points", design.spine.length], ["Height", cre.dims.H.toFixed(2) + " m"], ["Triangles", st.triangles.toLocaleString("en-US")], ["Bones", bones]];
  $("stats").textContent = "";
  rows.forEach(([k, v]) => { const r = document.createElement("div"); r.className = "row"; const a = document.createElement("span"); a.textContent = k; const b = document.createElement("b"); b.textContent = v; r.append(a, b); $("stats").appendChild(r); });
}

// ---------- dragging the handles (in the side plane, x = 0) ----------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), hit = new THREE.Vector3();
let drag = null;
function pick(e) {
  const r = view.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hs = ray.intersectObjects(handles.children.filter((m) => m.isMesh));
  return hs.length ? hs[0].object.userData : null;
}
function onPlane(e) {
  const r = view.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera); return ray.ray.intersectPlane(plane, hit) ? hit : null;
}
view.addEventListener("pointerdown", (e) => {
  if (state.mode !== "edit" || e.button !== 0) return;
  const h = pick(e); if (!h) return;
  drag = Object.assign({ shift: cre.handles.shift }, h); controls.enabled = false;
  if (h.kind === "spine") state.sel = h.i; else state.leg = h.k;
  showSel(); drawHandles(); e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (!drag) { view.style.cursor = state.mode === "edit" && pick(e) ? "grab" : ""; return; }
  const p = onPlane(e); if (!p) return;
  if (drag.kind === "spine") {
    design.spine[drag.i].p = [Math.max(0.02, p.y + drag.shift), p.z];
  } else {
    // a leg slides along the spine: the nearest point of the body's line
    const S = design.spine, curve = new THREE.CatmullRomCurve3(S.map((q) => new THREE.Vector3(0, q.p[0] - drag.shift, q.p[1])), false, "centripetal");
    let best = 0.5, bd = 1e9; for (let i = 0; i <= 200; i++) { const q = curve.getPoint(i / 200), d = (q.y - p.y) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = i / 200; } }
    design.legs[drag.k].t = Math.min(0.98, Math.max(0.02, best));
  }
  dirty = true; showSel();
});
window.addEventListener("pointerup", () => { if (drag) { drag = null; controls.enabled = true; dirty = true; } });
view.addEventListener("wheel", (e) => {
  if (state.mode !== "edit") return;
  const h = pick(e); if (!h || h.kind !== "spine") return;
  e.preventDefault(); e.stopPropagation();
  const q = design.spine[h.i]; q.r = Math.max(0.01, Math.min(0.6, q.r * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
  state.sel = h.i; dirty = true; showSel();
}, { capture: true, passive: false });

// ---------- the panels ----------
Object.entries(DK.PRESETS).forEach(([id, d]) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = d.name.toUpperCase();
  b.addEventListener("click", () => { design = DK.clean(d); state.sel = Math.floor(design.spine.length / 2); state.leg = 0; dirty = true; showSel(); frameCamera(); });
  $("presets").appendChild(b);
});
DK.COLORS.forEach((c, i) => { const o = document.createElement("option"); o.value = i; o.textContent = ["Sand", "Rust", "Dun", "Slate", "Umber", "Olive", "Steel"][i] || c; $("sColor").appendChild(o); });
const slider = (id, valId, get, set, fmt) => {
  const el = $(id);
  el.addEventListener("input", () => { set(+el.value); $(valId).textContent = fmt(+el.value); LabKit.paintSlider(el); dirty = true; });
  return () => { const v = get(); if (v == null) return; el.value = v; $(valId).textContent = fmt(v); LabKit.paintSlider(el); };
};
const m = (v) => v.toFixed(2) + " m", pc = (v) => Math.round(v * 100) + "%";
const sel = () => design.spine[state.sel], leg = () => design.legs[state.leg];
const shows = [
  slider("rSlider", "rVal", () => sel() && sel().r, (v) => { sel().r = v; }, m),
  slider("sqSlider", "sqVal", () => sel() && sel().sq, (v) => { sel().sq = v; }, (v) => v.toFixed(2)),
  slider("ltSlider", "ltVal", () => leg() && leg().t, (v) => { leg().t = v; }, pc),
  slider("llSlider", "llVal", () => leg() && leg().len, (v) => { leg().len = v; }, m),
  slider("lkThSlider", "lkThVal", () => leg() && leg().thick, (v) => { leg().thick = v; }, pc),
  slider("lsSlider", "lsVal", () => leg() && leg().spread, (v) => { leg().spread = v; }, (v) => v.toFixed(2)),
  slider("eaSlider", "eaVal", () => design.eyes.at, (v) => { design.eyes.at = v; }, pc),
  slider("esSlider", "esVal", () => design.eyes.size, (v) => { design.eyes.size = v; }, pc),
  slider("spSlider", "spVal", () => state.speed, (v) => { state.speed = v; }, (v) => v.toFixed(1) + " m/s"),
  slider("lkSlider", "lkVal", () => state.look, (v) => { state.look = v; }, pc),
  slider("lwSlider", "lwVal", () => state.low, (v) => { state.low = v; }, pc),
];
$("lKnee").addEventListener("change", () => { leg().knee = +$("lKnee").value; dirty = true; });
$("lFoot").addEventListener("change", () => { leg().foot = $("lFoot").value; dirty = true; });
$("sColor").addEventListener("change", () => { design.skin.color = +$("sColor").value; dirty = true; });
$("sPattern").addEventListener("change", () => { design.skin.pattern = +$("sPattern").value; dirty = true; });
$("sSeed").addEventListener("click", () => { design.skin.seed = Math.floor(Math.random() * 9999) + 1; dirty = true; });
$("dName").addEventListener("click", () => { const n = prompt("Name this creature", design.name); if (n) { design.name = n.slice(0, 40); dirty = true; } });
function showSel() {
  shows.forEach((f) => f());
  const L = leg();
  $("legBox").style.display = L ? "" : "none";
  if (L) { $("lKnee").value = String(L.knee); $("lFoot").value = L.foot; }
  $("sColor").value = design.skin.color; $("sPattern").value = design.skin.pattern;
  $("sel").textContent = "Point " + (state.sel + 1) + " of " + design.spine.length + (state.sel === design.spine.length - 1 ? " (the head's tip)" : state.sel === 0 ? " (the tail's tip)" : "");
  $("pairs").textContent = "";
  design.legs.forEach((l, k) => { const b = document.createElement("button"); b.className = "tBtn" + (k === state.leg ? " on" : ""); b.textContent = "#" + (k + 1); b.addEventListener("click", () => { state.leg = k; showSel(); drawHandles(); }); $("pairs").appendChild(b); });
}
$("ptAdd").addEventListener("click", () => {
  const S = design.spine, i = Math.min(state.sel, S.length - 2), a = S[i], b = S[i + 1];
  if (S.length >= 14) return;
  S.splice(i + 1, 0, { p: [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], r: (a.r + b.r) / 2, sq: (a.sq + b.sq) / 2 });
  state.sel = i + 1; dirty = true; showSel();
});
$("ptDel").addEventListener("click", () => { if (design.spine.length <= 3) return; design.spine.splice(state.sel, 1); state.sel = Math.min(state.sel, design.spine.length - 1); dirty = true; showSel(); });
$("lgAdd").addEventListener("click", () => {
  if (design.legs.length >= 5) return;
  const last = design.legs[state.leg] || { t: 0.5, len: 0.6, thick: 0.08, spread: 0.6, knee: 1, foot: "paw" };
  design.legs.push(Object.assign({}, last, { t: Math.min(0.95, Math.max(0.05, last.t + (last.t > 0.5 ? -0.15 : 0.15))) }));
  state.leg = design.legs.length - 1; dirty = true; showSel();
});
$("lgDel").addEventListener("click", () => { if (!design.legs.length) return; design.legs.splice(state.leg, 1); state.leg = Math.max(0, state.leg - 1); dirty = true; showSel(); });
const setMode = (mode) => {
  state.mode = mode; $("mEdit").classList.toggle("on", mode === "edit"); $("mPlay").classList.toggle("on", mode === "play");
  $("playBox").classList.toggle("hidden", mode !== "play");
  if (mode === "edit") { cre.rest(); cre.ls = null; } drawHandles();
};
$("mEdit").addEventListener("click", () => setMode("edit"));
$("mPlay").addEventListener("click", () => setMode("play"));
[...$("gaits").children].forEach((b) => b.addEventListener("click", () => {
  state.gait = b.dataset.g; [...$("gaits").children].forEach((x) => x.classList.toggle("on", x === b));
  if (b.dataset.g === "run") state.speed = 2.6; else if (b.dataset.g === "walk") state.speed = 1; shows.forEach((f) => f());
}));
const setView = (v) => { state.view = v; $("vSide").classList.toggle("on", v === "side"); $("vFree").classList.toggle("on", v === "free"); if (v === "side") frameCamera(); };
$("vSide").addEventListener("click", () => setView("side"));
$("vFree").addEventListener("click", () => { setView("free"); camera.position.add(new THREE.Vector3(-1.5, 0.6, 1.5)); });
$("fCopy").addEventListener("click", () => {
  const text = JSON.stringify(design);
  (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => { $("fCopy").textContent = "COPIED ✓"; }, () => { $("fText").classList.remove("hidden"); $("fText").value = text; $("fCopy").textContent = "SEE BELOW"; })
    .then(() => setTimeout(() => { $("fCopy").textContent = "COPY"; }, 1600));
});
$("fLoad").addEventListener("click", () => {
  const box = $("fText");
  if (box.classList.contains("hidden") || !box.value.trim()) { box.classList.remove("hidden"); box.value = ""; box.focus(); return; }
  try { design = DK.clean(JSON.parse(box.value)); state.sel = 0; state.leg = 0; dirty = true; showSel(); frameCamera(); box.classList.add("hidden"); }
  catch (e) { box.value = "Not a design: " + e.message; }
});
// the camera from the side, framing the whole creature
function frameCamera() {
  const S = design.spine, zs = S.map((q) => q.p[1]), ys = S.map((q) => q.p[0]);
  const zc = (Math.min(...zs) + Math.max(...zs)) / 2, span = Math.max(1, Math.max(...zs) - Math.min(...zs), Math.max(...ys) * 1.4);
  controls.target.set(0, Math.max(...ys) * 0.5, zc);
  camera.position.set(span * 2.1, Math.max(...ys) * 0.6, zc + 0.01);
}

// ---------- the loop ----------
LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 10);
const perf = LabKit.perfCounters(renderer); renderer.info.autoReset = false;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3); }
window.addEventListener("resize", resize);
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const t0 = performance.now(), dt = Math.min(clock.getDelta(), 0.05); t += dt;
  if (dirty && performance.now() - lastBuild > 60) rebuild();
  if (state.mode === "play") {
    cre.animate(t, dt, { gait: state.gait, speed: state.speed, layers: { look: state.look, low: state.low } });
    if (state.gait !== "idle") floorTex.offset.y -= (cre.ls ? cre.ls.spd : state.speed) * dt / 5;
  }
  controls.update();
  renderer.info.reset(); renderer.render(scene, camera);
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}
resize(); rebuild(); showSel(); frameCamera(); frame();
window.creatorLab = { state, get design() { return design; }, get creature() { return cre; }, camera, controls, setMode, rebuild: () => { dirty = true; } };
})();
