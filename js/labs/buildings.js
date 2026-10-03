// The buildings lab's own script (buildings.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = ShipKit.makeEnvironment(renderer);
scene.background = new THREE.Color(0x05070d);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
camera.position.set(22, 14, 26);
const controls = new THREE.OrbitControls(camera, view);
controls.enableDamping = true; controls.target.set(0, 3, 0); controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(30, 40, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 120 });
scene.add(sun, new THREE.HemisphereLight(0x8aa0ff, 0x2a1d14, 0.35));
// a patch of ground: dusty, with a faint grid
const groundTex = (() => {
  const S = 512, [c, ctx] = ShipKit.util.canvas(S, S), r = ShipKit.util.rng(3);
  ctx.fillStyle = "#4d4134"; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? "255,240,220" : "0,0,0"},${0.04 + r() * 0.06})`; ctx.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 4); }
  ctx.strokeStyle = "rgba(79,227,198,0.12)"; ctx.lineWidth = 2;
  for (let k = 0; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(k * S / 8, 0); ctx.lineTo(k * S / 8, S); ctx.moveTo(0, k * S / 8); ctx.lineTo(S, k * S / 8); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.encoding = THREE.sRGBEncoding; return t;
})();
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const state = { index: 0, view: "built", progress: 1, anim: false };
let mod = null;
function load() {
  if (mod) BaseKit.disposeModule(mod);
  const def = BaseKit.MODULES[state.index];
  mod = BaseKit.buildModule(def.id, { detail: 1 });
  scene.add(mod.group);
  $("hudTitle").textContent = def.name;
  [...$("modTabs").children].forEach((b, i) => b.classList.toggle("on", i === state.index));
  applyView();
  const st = BaseKit.modelStats(mod.solid);
  const rows = [["Footprint (radius)", def.footprint + " m"], ["Height", def.height + " m"], ["Max slope", Math.round(Math.atan(def.maxSlope) * 180 / Math.PI) + "°"],
    ["Build time", def.build + " s"], ["Triangles", st.triangles.toLocaleString("en-US")], ["Meshes", st.meshes]];
  $("modRows").textContent = ""; rows.forEach(([k, v]) => $("modRows").appendChild(row(k, v)));
  $("costList").textContent = ""; def.cost.forEach(([k, v]) => $("costList").appendChild(row(k, "×" + v)));
  controls.target.set(0, def.height * 0.45, 0);
}
function row(k, v) { const r = document.createElement("div"); r.className = "row"; const s = document.createElement("span"); s.textContent = k; const b = document.createElement("b"); b.textContent = v; r.append(s, b); return r; }
function applyView() {
  if (state.view === "built") mod.setProgress(state.progress);
  else mod.setGhostState(state.view === "bad" ? "bad" : "ok");
  for (const [id, v] of [["vBuilt", "built"], ["vOk", "ok"], ["vBad", "bad"]]) $(id).classList.toggle("on", state.view === v);
  $("pVal").textContent = Math.round(state.progress * 100) + "%";
  LabKit.paintSlider($("pSlider"));
}
BaseKit.MODULES.forEach((d, i) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = d.name;
  b.addEventListener("click", () => { state.index = i; load(); });
  $("modTabs").appendChild(b);
});
$("vBuilt").addEventListener("click", () => { state.view = "built"; applyView(); });
$("vOk").addEventListener("click", () => { state.view = "ok"; applyView(); });
$("vBad").addEventListener("click", () => { state.view = "bad"; applyView(); });
$("pSlider").addEventListener("input", () => { state.progress = +$("pSlider").value; state.view = "built"; state.anim = false; $("btnAnim").classList.remove("on"); applyView(); });
$("btnRotate").addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; $("btnRotate").classList.toggle("on", controls.autoRotate); });
$("btnAnim").addEventListener("click", () => { state.anim = true; state.view = "built"; state.progress = 0; $("btnAnim").classList.add("on"); });
LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 5);
const perf = LabKit.perfCounters(renderer);
renderer.info.autoReset = false;
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3);
}
window.addEventListener("resize", resize);
const clock = new THREE.Clock();
function frame() {
  const t0 = performance.now(), dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (state.anim) {
    state.progress = Math.min(1, state.progress + dt / 6);       // 6 s here; the real build time is the module's
    $("pSlider").value = state.progress; applyView();
    if (state.progress >= 1) { state.anim = false; $("btnAnim").classList.remove("on"); }
  }
  mod.update(t, dt);
  controls.update();
  renderer.info.reset();
  renderer.render(scene, camera);
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}
resize(); load(); frame();
window.buildingLab = { state, load, applyView, get mod() { return mod; }, camera, controls };
})();
