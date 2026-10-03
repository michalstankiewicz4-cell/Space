// The surface lab's own script (surface.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const SK = window.SurfaceKit, BK = window.BodyKit;
const view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.localClippingEnabled = true;
const PR = [0.6, 0.85, 1, Math.min(window.devicePixelRatio || 1, 2)], QN = ["LOW", "MEDIUM", "HIGH", "ULTRA"];
const env = ShipKit.makeEnvironment(renderer);

// ---------- the worlds: a SystemKit system's bodies you can land on ----------
// "A lone planet": any planet-group body, alone around a Sun-like star.
const planets = [];
for (const gid of SK.WORLD_GROUPS) { const g = BK.GROUPS.find((x) => x.id === gid); if (g) for (const b of g.bodies) planets.push({ ref: gid + "/" + b.id, name: b.name, group: g.name }); }
const SYSTEMS = SystemKit.PRESETS.map((p) => ({ id: p.id, name: p.name, make: p.make })).concat([{ id: "lone", name: "A lone planet", make: null }]);
SYSTEMS.forEach((x) => { const o = document.createElement("option"); o.value = x.id; o.textContent = x.name; $("system").appendChild(o); });
const loneSystem = (ref) => ({ name: "LONE", seed: 1, sky: "deep", centers: [{ ref: "suns/sol", size: 4 }], orbits: [{ ref, distance: 23, size: 1, phase: 0, incl: 0, ring: null, moons: [] }] });

const state = { mode: "orbit", ref: planets[0].ref, values: {}, key: "", sys: null, sky: null, worlds: [], pick: null, keys: {}, t: 0 };
function loadSystem(id) {
  const def = SYSTEMS.find((x) => x.id === id);
  state.sysId = id; $("system").value = id;
  $("planet").textContent = "";
  if (def.make) {
    state.sys = def.make();
    state.worlds = SK.worldsOf(state.sys);
  } else {
    state.sys = null;
    state.worlds = planets.map((p) => ({ ref: p.ref, values: {}, label: p.name + "  ·  " + p.group, path: { orbit: 0, moon: null } }));
  }
  state.worlds.forEach((w, i) => { const o = document.createElement("option"); o.value = i; o.textContent = w.label; $("planet").appendChild(o); });
  loadWorld(0);
}
function loadWorld(i) {
  const w = state.worlds[i];
  if (state.mode !== "orbit") backToOrbit(true);
  state.ref = w.ref; state.values = w.values || {}; state.key = state.sysId + ":" + i;
  state.sky = SK.skyOf(state.sys || loneSystem(w.ref), w.path);
  G.setWorld({ ref: state.ref, values: state.values, skyData: state.sky, key: state.key });
  $("planet").value = i;
  loadGlobe();
  // mid-morning at the base (or at the planet's 0°, 0°)
  const b = SK.bases.get(state.ref);
  setHour(10, b ? SK.latLonToDir(b.lat, b.lon) : new THREE.Vector3(1, 0, 0));
  fillWeather();
}
const toast = (msg) => { const t = $("toast"); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.opacity = 0; }, 2600); };

// =====================================================================
// ORBIT: the globe, the landing pin, the base marker
// =====================================================================
const orbit = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(36, 1, 0.05, 600) };
orbit.camera.position.set(0, 2.5, 12);
const oc = new THREE.OrbitControls(orbit.camera, view);
oc.enableDamping = true; oc.minDistance = 4.2; oc.maxDistance = 40;
const skyRef = BK.GAME_KINDS.sky;
const backdrop = BK.buildBody(skyRef.groupId, skyRef.bodyId, { detail: 1 });
backdrop.setRadius(300); orbit.scene.add(backdrop.group);
const SUN = new THREE.Vector3(-1, 0.35, 0.6).normalize();
let globe = null, pin = SK.makeMarker(0x4fe3c6, 0.018), baseMark = SK.makeMarker(0xf8bb56, 0.02);
function loadGlobe() {
  if (globe) BK.disposeBody(globe);
  const [g, b] = state.ref.split("/");
  globe = BK.buildBody(g, b, { detail: 1, values: Object.assign({}, state.values, { spin: 0 }) });   // held still: you pick a spot on it, the base stays put
  globe.setRadius(3);
  orbit.scene.add(globe.group);
  globe.surfaceRoot.add(pin, baseMark);
  pin.visible = false;
  state.pick = null;
  const R = state.groundR = G.groundRadiusM();
  $("pRows").textContent = "";
  [["Radius on the ground", (R / 1000).toFixed(1) + " km"], ["Around it", (2 * Math.PI * R / 1000).toFixed(0) + " km"]].forEach(([k, v]) => $("pRows").appendChild(row(k, v)));
  refreshBase();
}
function refreshBase() {
  const base = SK.bases.get(state.ref);
  baseMark.visible = !!base;
  if (base) baseMark.position.copy(SK.latLonToDir(base.lat, base.lon)).multiplyScalar(1.04);
  $("btnLandBase").disabled = !base; $("btnForget").disabled = !base;
  $("bRows").textContent = "";
  const rows = base ? [["Where", base.lat.toFixed(1) + "°, " + base.lon.toFixed(1) + "°"], ["Modules", base.modules.length],
    ["Built", base.modules.filter((m) => Date.now() - m.start >= m.dur).length]] : [["", "none on this planet yet"]];
  rows.forEach(([k, v]) => $("bRows").appendChild(row(k, v)));
}
setInterval(refreshBase, 1000);                    // "Built" counts up as construction finishes
function row(k, v) { const r = document.createElement("div"); r.className = "row"; const s = document.createElement("span"); s.textContent = k; const b = document.createElement("b"); b.textContent = v; r.append(s, b); return r; }
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
view.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
view.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  setMouse(e);
  if (state.mode === "orbit" && globe) {
    ray.setFromCamera(mouse, orbit.camera);
    const hit = ray.intersectObject(globe.pickMesh)[0];
    if (!hit) return;
    const d = globe.surfaceRoot.worldToLocal(hit.point.clone()).normalize();
    state.pick = d; pin.visible = true; pin.position.copy(d).multiplyScalar(1.04);
    const ll = SK.dirToLatLon(d);
    $("pickNote").textContent = "Landing site: " + ll.lat.toFixed(1) + "°, " + ll.lon.toFixed(1) + "°";
    $("btnLand").disabled = false;
  } else if (state.mode === "ground" && G.building && e.button === 0) place();
});
function setMouse(e) { mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }


// =====================================================================
// GROUND: SurfaceKit's ground (js/surfacekit/ground.js) — the same one the
// game lands on. The lab adds its panels, the time slider and the weather.
// =====================================================================
const G = SK.createGround(renderer, { env, onEvent: (name) => { if (name === "landed") toast("Landed"); else if (name === "founded") toast("Base founded"); } });
const ground = { scene: G.scene, camera: G.camera };
const P = G.P;
const lightNow = { get day() { return G.light.day == null ? 1 : G.light.day; } }, orbitSun = SUN.clone(), Mframe = new THREE.Matrix4();
let sliding = false, wxStrength = 0.7;

// ---------- the time of day: the world's spin (G.theta) ----------
// The slider shows the local solar hour where you are (the base or the pick
// in orbit); driving round the planet changes it, as it should.
function siteDir() {
  if (state.mode === "ground") return P.dir;
  const b = SK.bases.get(state.ref);
  return b ? SK.latLonToDir(b.lat, b.lon) : state.pick || new THREE.Vector3(1, 0, 0);
}
function hourNow() { return G.hourAt(siteDir()); }
function setHour(h, at) { G.setHour(h, at || siteDir()); showHour(); }
function showHour() {
  const h = hourNow(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  $("tVal").textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  if (!sliding) { $("tSlider").value = h; LabKit.paintSlider($("tSlider")); }
}
$("tSlider").addEventListener("input", () => { sliding = true; G.dayPaused = true; setHour(+$("tSlider").value); LabKit.paintSlider($("tSlider")); });
$("tSlider").addEventListener("change", () => { sliding = false; G.dayPaused = false; });
$("daySpeed").addEventListener("change", () => { G.daySecs = +$("daySpeed").value; });

// ---------- the weather: only what this world can have ----------
function fillWeather() {
  $("wxSel").textContent = "";
  G.weatherList().forEach((w) => { const o = document.createElement("option"); o.value = w.id; o.textContent = w.name; $("wxSel").appendChild(o); });
  $("wxSel").value = "clear"; applyWeather();
}
function applyWeather() { G.setWeather($("wxSel").value, wxStrength); }
$("wxSel").addEventListener("change", applyWeather);
$("wxSlider").addEventListener("input", () => {
  wxStrength = +$("wxSlider").value; $("wxVal").textContent = Math.round(wxStrength * 100) + "%"; LabKit.paintSlider($("wxSlider")); applyWeather();
});

function enterGround(dir, from) {
  G.enter(dir, from);
  state.mode = "ground";
  $("orbitUi").classList.add("hidden"); $("groundUi").classList.remove("hidden");
  $("readout").classList.remove("hidden");
}

// =====================================================================
// transitions: land, take off, hop
// =====================================================================
const fade = (on) => { $("fade").style.background = G.sky.air > 0.2 && lightNow.day > 0.5 ? "#e9eefa" : "#000"; $("fade").style.opacity = on ? 1 : 0; };
function land(dir) {
  state.mode = "transit";
  const targ = globe.surfaceRoot.localToWorld(dir.clone().multiplyScalar(1.3));
  const start = orbit.camera.position.clone(), t0 = performance.now();
  oc.enabled = false;
  (function step() {
    const k = Math.min(1, (performance.now() - t0) / 1600), e = k * k * (3 - 2 * k);
    orbit.camera.position.lerpVectors(start, targ, e);
    orbit.camera.lookAt(globe.surfaceRoot.localToWorld(dir.clone()));
    if (k < 1) return requestAnimationFrame(step);
    $("fade").style.background = "#000"; $("fade").style.opacity = 1;
    setTimeout(() => { enterGround(dir, "air"); setTimeout(() => fade(false), 120); }, 480);
  })();
}
function backToOrbit(now) {
  const go = () => {
    state.mode = "orbit"; oc.enabled = true;
    G.leave(); markBuild();
    $("orbitUi").classList.remove("hidden"); $("groundUi").classList.add("hidden");
    $("compass").classList.add("hidden"); $("readout").classList.add("hidden");
    // above the spot we left, turned at most 20° toward the sun (more daylight,
    // the base still well inside the disc)
    const w = globe.surfaceRoot.localToWorld(P.dir.clone()).sub(globe.group.position).normalize();
    const axis = new THREE.Vector3().crossVectors(w, orbitSun);
    if (axis.lengthSq() > 1e-6) w.applyAxisAngle(axis.normalize(), Math.min(0.35, w.angleTo(orbitSun)));
    const at = w.multiplyScalar(12).add(globe.group.position);
    orbit.camera.position.copy(at); oc.target.set(0, 0, 0);
    refreshBase();
  };
  if (now) { go(); return; }
  fade(true);
  setTimeout(() => { go(); setTimeout(() => fade(false), 80); }, 450);
}
$("btnLand").addEventListener("click", () => state.pick && land(state.pick));
$("btnLandBase").addEventListener("click", () => { const b = SK.bases.get(state.ref); if (b) land(SK.offsetDir(SK.latLonToDir(b.lat, b.lon), 0, -30, state.groundR)); });
$("btnForget").addEventListener("click", () => { if (confirm("Abandon this planet's base? Its modules are lost.")) { SK.bases.remove(state.ref); refreshBase(); } });
$("btnTakeOff").addEventListener("click", () => G.takeOff(() => backToOrbit()));
$("btnHop").addEventListener("click", () => {
  const km = G.hop();
  if (km == null) { toast("No base on this planet yet — place a module first."); return; }
  toast("Suborbital hop: " + km.toFixed(1) + " km");
});
$("system").addEventListener("change", () => loadSystem($("system").value));
$("planet").addEventListener("change", () => loadWorld(+$("planet").value));

// =====================================================================
// building
// =====================================================================
BaseKit.MODULES.forEach((d) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = d.name;
  b.addEventListener("click", () => startBuild(d.id));
  $("modBtns").appendChild(b);
});
function markBuild() { [...$("modBtns").children].forEach((b, i) => b.classList.toggle("on", !!G.building && BaseKit.MODULES[i].id === G.building.id)); }
function startBuild(id) { G.startBuild(id); markBuild(); }
function cancelBuild() { G.cancelBuild(); markBuild(); }
const WHY = { far: "Too far from the base (" + SK.BASE_RADIUS + " m)", unloaded: "Ground not loaded", wet: "Not on water, lava or ice sheets", steep: "Too steep" };
function place() {
  const r = G.place();
  if (r && !r.ok) toast(r.why === "close" ? "Too close to the " + r.name.toLowerCase() : WHY[r.why]);
  markBuild(); refreshBase();
}
function removeUnderPointer() { const name = G.removeUnderPointer(); if (name) { toast("Removed: " + name.toLowerCase()); refreshBase(); } }
let drag = null;
view.addEventListener("pointermove", (e) => { setMouse(e); if (drag) { G.drag(e.clientX - drag[0], e.clientY - drag[1]); drag = [e.clientX, e.clientY]; } });
view.addEventListener("pointerdown", (e) => { if (state.mode === "ground" && e.button === 2) drag = [e.clientX, e.clientY]; });
window.addEventListener("pointerup", () => { drag = null; });
view.addEventListener("contextmenu", (e) => e.preventDefault());
view.addEventListener("wheel", (e) => { if (state.mode === "ground") G.zoom(e.deltaY); }, { passive: true });
window.addEventListener("keydown", (e) => {
  state.keys[e.code] = true;
  if (state.mode !== "ground") return;
  if (e.code === "Escape") cancelBuild();
  if (e.code === "KeyR" && G.building) G.rotateBuild();
  if (e.code === "KeyB") { if (G.building) cancelBuild(); else startBuild(BaseKit.MODULES[0].id); }
  if (e.code === "Delete") removeUnderPointer();
});
window.addEventListener("keyup", (e) => { state.keys[e.code] = false; });

// =====================================================================
// the loop
// =====================================================================
LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 5);
const perf = LabKit.perfCounters(renderer);
renderer.info.autoReset = false;
let quality = 2;
$("qSlider").addEventListener("input", () => { quality = +$("qSlider").value; LabKit.paintSlider($("qSlider")); resize(); });
function resize() {
  renderer.setPixelRatio(PR[quality]); renderer.setSize(window.innerWidth, window.innerHeight, false);
  $("qVal").textContent = QN[quality];
  orbit.camera.aspect = window.innerWidth / window.innerHeight; orbit.camera.updateProjectionMatrix();
  G.setAspect(window.innerWidth / window.innerHeight);
  LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3);
}
window.addEventListener("resize", resize);
const clock = new THREE.Clock();
function stepGround(dt, t) {
  const info = G.update(dt, t, state.keys, mouse);
  if (state.mode !== "ground") return;                // took off this frame
  showHour();
  $("sunEl").textContent = Math.round(info.sunEl) + "°";
  $("compass").classList.toggle("hidden", !info.base);
  if (info.base) {
    $("cArrow").setAttribute("transform", "rotate(" + (info.base.ang * 180 / Math.PI).toFixed(1) + " 15 15)");
    $("cDist").textContent = info.base.dist < 1000 ? Math.round(info.base.dist) + " m" : (info.base.dist / 1000).toFixed(1) + " km";
  }
  $("rSpeed").textContent = Math.round(info.speed); $("rAlt").textContent = Math.round(info.alt);
  $("rWhere").textContent = info.lat.toFixed(2) + "°, " + info.lon.toFixed(2) + "°";
  $("statTiles").textContent = info.tiles;
}
function frame() {
  const t0 = performance.now(), dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  renderer.info.reset();
  if (state.mode === "orbit" || state.mode === "transit") {
    if (state.mode === "orbit") { oc.update(); G.advanceDay(dt, siteDir()); showHour(); }
    SK.frame(G.full, G.theta, Mframe);
    globe.surfaceRoot.updateMatrixWorld(true);
    orbitSun.copy(state.sky.suns[0].dir).applyMatrix4(Mframe).transformDirection(globe.surfaceRoot.matrixWorld);
    globe.update(t, dt, { sunDir: orbitSun, center: orbit.camera.position, renderer });
    backdrop.update(t, dt, { center: orbit.camera.position, renderer });
    renderer.render(orbit.scene, orbit.camera);
  } else {
    stepGround(dt, t);
    if (state.mode === "ground") renderer.render(ground.scene, ground.camera);
  }
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}
LabKit.paintSlider($("qSlider")); LabKit.paintSlider($("wxSlider"));
// start: the Solar System, the Earth
function pickWorld(sysId, ref) {
  if (state.sysId !== sysId) loadSystem(sysId);
  const i = state.worlds.findIndex((w) => w.ref === ref);
  if (i > 0) loadWorld(i);
}
resize(); pickWorld("sol", "earthlike/terra"); frame();
// what's in the sky now: [{ ref, kind, el (degrees above the horizon), az, ang }] — for scripts
function skyList() {
  const up = P.dir, { east, north } = SK.tangentFrame(up), v = new THREE.Vector3(), deg = 180 / Math.PI;
  SK.frame(G.full, G.theta, Mframe);
  return state.sky.suns.map((x) => ({ ref: "sun", kind: x.kind, d: x.dir, ang: x.ang })).concat(state.sky.bodies.map((x) => ({ ref: x.ref, kind: x.kind, d: x.dir, ang: x.ang })))
    .map((x) => { v.copy(x.d).applyMatrix4(Mframe).normalize(); return { ref: x.ref, kind: x.kind, ang: +(x.ang * deg).toFixed(2),
      el: +(Math.asin(v.dot(up)) * deg).toFixed(1), az: +(Math.atan2(v.dot(east), v.dot(north)) * deg).toFixed(0) }; });
}
window.surfaceLab = { G, sky: G.sky, weather: G.weather, skyList, pickWorld, setHour, hourNow, get light() { return G.light; }, get daySecs() { return G.daySecs; }, set daySecs(v) { G.daySecs = v; }, state, P, land, enterGround, startBuild, place, validate: G.validate, get surf() { return G.surf; }, get globe() { return globe; }, toast, camera: ground.camera };
})();
