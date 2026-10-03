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

const state = { mode: "orbit", ref: planets[0].ref, values: {}, key: "", sys: null, sky: null, worlds: [], pick: null, building: null, buildRot: 0, keys: {}, t: 0,
  theta: 0 };
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
  const tmp = BK.planetTerrain(g, b, state.values);
  state.full = tmp.values;
  const R = state.groundR = Math.max(0.15, tmp.values.size) * SK.M_PER_SIZE; tmp.dispose();
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
  } else if (state.mode === "ground" && state.building && e.button === 0) place();
});
function setMouse(e) { mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }

// =====================================================================
// GROUND: terrain, sky, the craft, the base
// =====================================================================
const ground = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 1, 1, 60000) };
ground.scene.environment = env;
const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.4), hemi = new THREE.HemisphereLight(0x9fb3ff, 0x3a2a1a, 0.35);
ground.scene.add(sunLight, sunLight.target, hemi);
const sunLight2 = new THREE.DirectionalLight(0xffffff, 0);
ground.scene.add(sunLight2, sunLight2.target);
// the craft's lamp (lights the modules; the ground's shader has its own cone)
const lamp = new THREE.SpotLight(0xfff0d0, 0, 260, 0.5, 0.5, 1.2);
ground.scene.add(lamp, lamp.target);
let surf = null;
// the sky (sky.js) and the weather (weather.js): one each, set up per world
const sky = SK.createSky(renderer), weather = SK.createWeather();
ground.scene.add(sky.root, weather.root);
let skyKey = "";

// ---------- the time of day: the world's spin (state.theta) ----------
// The slider shows the local solar hour where you are (the base or the pick
// in orbit); driving round the planet changes it, as it should.
const lightNow = { day: 1 }, orbitSun = SUN.clone(), Mframe = new THREE.Matrix4();
let daySecs = 120, sliding = false, wxStrength = 0.7, lampOn = 0;
function siteDir() {
  if (state.mode === "ground") return P.dir;
  const b = SK.bases.get(state.ref);
  return b ? SK.latLonToDir(b.lat, b.lon) : state.pick || new THREE.Vector3(1, 0, 0);
}
function hourNow() { return SK.hourAt(state.sky, state.full, siteDir(), state.theta); }
function setHour(h, at) { state.theta = SK.thetaFor(state.sky, state.full, at || siteDir(), h); showHour(); }
function showHour() {
  const h = hourNow(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  $("tVal").textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  if (!sliding) { $("tSlider").value = h; LabKit.paintSlider($("tSlider")); }
}
function advanceDay(dt) { if (daySecs && !sliding) setHour((hourNow() + 24 * dt / daySecs) % 24); }
$("tSlider").addEventListener("input", () => { sliding = true; setHour(+$("tSlider").value); LabKit.paintSlider($("tSlider")); });
$("tSlider").addEventListener("change", () => { sliding = false; });
$("daySpeed").addEventListener("change", () => { daySecs = +$("daySpeed").value; });

// ---------- the weather: only what this world can have ----------
function fillWeather() {
  $("wxSel").textContent = "";
  SK.weatherFor(state.full).forEach((w) => { const o = document.createElement("option"); o.value = w.id; o.textContent = w.name; $("wxSel").appendChild(o); });
  $("wxSel").value = "clear"; applyWeather();
}
function applyWeather() { weather.set($("wxSel").value, wxStrength, new THREE.Color(0.72, 0.46, 0.3).lerp(sky.horizon, 0.35)); }
$("wxSel").addEventListener("change", applyWeather);
$("wxSlider").addEventListener("input", () => {
  wxStrength = +$("wxSlider").value; $("wxVal").textContent = Math.round(wxStrength * 100) + "%"; LabKit.paintSlider($("wxSlider")); applyWeather();
});

// ---------- the light the sky gives, onto the ground and the modules ----------
const lum = (c) => Math.max(c.r, c.g, c.b);
function applyLight(L, wx, dt) {
  const U = surf.material.uniforms;
  U.uSunDir0.value.copy(L.sunDir0); U.uSunCol0.value.copy(L.sunCol0);
  U.uSunDir1.value.copy(L.sunDir1); U.uSunCol1.value.copy(L.sunCol1);
  U.uAmbient.value.copy(L.ambient); U.uFogColor.value.copy(L.fogColor); U.uFog.value = L.fog;
  U.uWet.value = wx.wet; U.uSnow.value = wx.snow;
  // the modules: the same suns as three.js lights (shadows from the first)
  sunLight.color.copy(L.sunCol0); sunLight.intensity = 2.4;
  sunLight.position.copy(craft.position).addScaledVector(L.sunDir0, 200); sunLight.target.position.copy(craft.position);
  sunLight2.color.copy(L.sunCol1); sunLight2.intensity = 2.4;
  sunLight2.position.copy(craft.position).addScaledVector(L.sunDir1, 200); sunLight2.target.position.copy(craft.position);
  hemi.color.copy(L.ambient).multiplyScalar(2.2); hemi.groundColor.copy(L.ambient).multiplyScalar(0.7); hemi.intensity = 1;
  // the lamp: on when it gets dark
  const dark = lum(L.sunCol0) + lum(L.sunCol1) + lum(L.ambient) * 2 < 0.35;
  lampOn += ((dark ? 1 : 0) - lampOn) * Math.min(1, dt * 3);
  lamp.position.copy(craft.position).addScaledVector(P.dir, 2.5).addScaledVector(P.fwd, 2);
  lamp.target.position.copy(craft.position).addScaledVector(P.fwd, 40).addScaledVector(P.dir, -8);
  lamp.intensity = lampOn * 3;
  U.uLamp.value = lampOn * 2.2; U.uLampPos.value.copy(lamp.position);
  U.uLampDir.value.subVectors(lamp.target.position, lamp.position).normalize();
  $("sunEl").textContent = Math.round(Math.asin(Math.max(-1, Math.min(1, L.sunDir0.dot(P.dir)))) * 180 / Math.PI) + "°";
}
// the craft: ShipKit's swarm ship as a 7 m hover craft
const craftModel = ShipKit.buildShipModel("swarmer", { detail: 1, envMap: env });
const craft = ShipKit.makeGameHolder(craftModel, 7);
ground.scene.add(craft);
const P = { dir: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), speed: 0, alt: 3, r: 0, yaw: 0, camYaw: 0, camPitch: 0.32, camDist: 26, lookUp: 0 };

// the base on the ground: built modules, the beacon
const baseObjs = [];
let beacon = null;
function clearBase() { baseObjs.forEach((o) => BaseKit.disposeModule(o.mod)); baseObjs.length = 0; if (beacon) { ground.scene.remove(beacon); beacon = null; } }
function placeOnGround(obj, dir, rot) {
  const g = surf.groundAt(dir), r = g ? g.r : surf.R;
  const up = dir.clone(), { east, north } = SK.tangentFrame(dir);
  const fwd = north.clone().applyAxisAngle(up, rot), right = new THREE.Vector3().crossVectors(up, fwd);
  obj.position.copy(dir).multiplyScalar(r);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
}
function buildBase() {
  clearBase();
  const base = SK.bases.get(state.ref);
  if (!base) return;
  const c = SK.latLonToDir(base.lat, base.lon);
  for (const m of base.modules) {
    const mod = BaseKit.buildModule(m.type, { detail: 0.8 });
    const d = SK.offsetDir(c, m.e, m.n, surf.R);
    surf.ensure(d);
    placeOnGround(mod.group, d, m.rot);
    ground.scene.add(mod.group);
    baseObjs.push({ mod, m, dir: d });
  }
  surf.ensure(c);
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 900, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xf8bb56, transparent: true,
    opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beacon.geometry.translate(0, 450, 0);
  placeOnGround(beacon, c, 0);
  ground.scene.add(beacon);
}

function enterGround(dir, from) {
  if (!surf || surf.key !== state.key) {
    if (surf) { ground.scene.remove(surf.root); surf.dispose(); }
    surf = SK.createSurface(renderer, state.ref, state.values);
    surf.key = state.key;
    ground.scene.add(surf.root);
  }
  if (skyKey !== state.key) { sky.setup(state.sky, surf.values); skyKey = state.key; applyWeather(); }
  const { north } = SK.tangentFrame(dir);
  P.dir.copy(dir); P.fwd.copy(north); P.speed = 0;
  surf.ensure(dir); surf.update(dir, 25);
  buildBase();
  const g = surf.groundAt(dir);
  P.r = (g ? g.r : surf.R) + (from === "air" ? 650 : 3);
  P.alt = 3;
  state.mode = "ground"; state.phase = from === "air" ? "descending" : "driving"; state.phaseT = 0;
  $("orbitUi").classList.add("hidden"); $("groundUi").classList.remove("hidden");
  $("readout").classList.remove("hidden");
}

function groundRadius(dir) { const g = surf.groundAt(dir); return g ? g.r : null; }

// =====================================================================
// transitions: land, take off, hop
// =====================================================================
const fade = (on) => { $("fade").style.background = sky.air > 0.2 && lightNow.day > 0.5 ? "#e9eefa" : "#000"; $("fade").style.opacity = on ? 1 : 0; };
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
function takeOff(then) {
  state.phase = "ascending"; state.phaseT = 0; state.after = then;
}
function backToOrbit(now) {
  const go = () => {
    state.mode = "orbit"; oc.enabled = true;
    $("orbitUi").classList.remove("hidden"); $("groundUi").classList.add("hidden");
    $("compass").classList.add("hidden"); $("readout").classList.add("hidden");
    cancelBuild();
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
$("btnTakeOff").addEventListener("click", () => takeOff(backToOrbit));
$("btnHop").addEventListener("click", () => {
  const b = SK.bases.get(state.ref); if (!b) { toast("No base on this planet yet — place a module first."); return; }
  const c = SK.latLonToDir(b.lat, b.lon), km = SK.greatCircle(P.dir, c, surf.R) / 1000;
  toast("Suborbital hop: " + km.toFixed(1) + " km");
  takeOff(() => { fade(true); setTimeout(() => { enterGround(SK.offsetDir(c, 0, -30, surf.R), "air"); setTimeout(() => fade(false), 120); }, 450); });
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
function startBuild(id) {
  cancelBuild();
  const mod = BaseKit.buildModule(id, { detail: 0.8 });
  mod.setGhostState("ok");
  ground.scene.add(mod.group);
  state.building = { id, mod, ok: false, dir: null, why: "" };
  [...$("modBtns").children].forEach((b, i) => b.classList.toggle("on", BaseKit.MODULES[i].id === id));
}
function cancelBuild() {
  if (!state.building) return;
  BaseKit.disposeModule(state.building.mod); state.building = null;
  [...$("modBtns").children].forEach((b) => b.classList.remove("on"));
}
const BASE_RADIUS = 600;
function validate(id, dir) {
  const def = BaseKit.MODULES.find((m) => m.id === id), base = SK.bases.get(state.ref);
  if (base) {
    const c = SK.latLonToDir(base.lat, base.lon);
    if (SK.greatCircle(c, dir, surf.R) > BASE_RADIUS) return "Too far from the base (" + BASE_RADIUS + " m)";
  }
  const g0 = surf.groundAt(dir); if (!g0) return "Ground not loaded";
  // the slope: a plane fitted through 8 points on the footprint's rim (bumps
  // smaller than the module don't tilt it)
  let sx = 0, sy = 0;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, d = SK.offsetDir(dir, Math.cos(a) * def.footprint, Math.sin(a) * def.footprint, surf.R);
    const g = surf.groundAt(d); if (!g) return "Ground not loaded";
    if (g.sea && !def.wet) return "Not on water, lava or ice sheets";
    sx += g.r * Math.cos(a); sy += g.r * Math.sin(a);
  }
  if (g0.sea && !def.wet) return "Not on water, lava or ice sheets";
  if (Math.hypot(sx, sy) / (4 * def.footprint) > def.maxSlope) return "Too steep";
  for (const o of baseObjs) if (SK.greatCircle(o.dir, dir, surf.R) < def.footprint + o.mod.footprint - 1) return "Too close to the " + o.mod.def.name.toLowerCase();
  return "";
}
function place() {
  const b = state.building; if (!b || !b.dir) return;
  if (!b.ok) { toast(b.why); return; }
  let base = SK.bases.get(state.ref);
  const def = BaseKit.MODULES.find((m) => m.id === b.id);
  if (!base) {
    const ll = SK.dirToLatLon(b.dir);
    base = { name: "BASE", lat: ll.lat, lon: ll.lon, created: Date.now(), modules: [] };
    toast("Base founded");
  }
  const c = SK.latLonToDir(base.lat, base.lon), { east, north } = SK.tangentFrame(c);
  const off = b.dir.clone().multiplyScalar(surf.R).sub(c.clone().multiplyScalar(surf.R));
  base.modules.push({ type: b.id, e: Math.round(off.dot(east) * 10) / 10, n: Math.round(off.dot(north) * 10) / 10, rot: state.buildRot,
    start: Date.now(), dur: def.build * 1000 });
  SK.bases.put(state.ref, base);
  cancelBuild(); buildBase(); refreshBase();
}
function removeUnderPointer() {
  ray.setFromCamera(mouse, ground.camera);
  const hits = ray.intersectObjects(baseObjs.map((o) => o.mod.solid), true);
  if (!hits.length) return;
  const o = baseObjs.find((x) => { let p = hits[0].object; while (p) { if (p === x.mod.solid) return true; p = p.parent; } return false; });
  if (!o) return;
  const base = SK.bases.get(state.ref);
  base.modules.splice(base.modules.indexOf(base.modules.find((m) => m.e === o.m.e && m.n === o.m.n && m.type === o.m.type)), 1);
  if (!base.modules.length) SK.bases.remove(state.ref); else SK.bases.put(state.ref, base);
  buildBase(); refreshBase(); toast("Removed: " + o.mod.def.name.toLowerCase());
}
view.addEventListener("pointermove", (e) => { setMouse(e); if (drag) { P.camYaw -= (e.clientX - drag[0]) * 0.005; // dragging down past the lowest camera angle lifts the view to the sky
    const dy = (e.clientY - drag[1]) * 0.004;
    if (P.lookUp > 0 || P.camPitch + dy < 0.05) { P.lookUp = Math.max(0, Math.min(1.2, P.lookUp - dy)); P.camPitch = 0.05; }
    else P.camPitch = Math.min(1.4, P.camPitch + dy); drag = [e.clientX, e.clientY]; } });
let drag = null;
view.addEventListener("pointerdown", (e) => { if (state.mode === "ground" && e.button === 2) drag = [e.clientX, e.clientY]; });
window.addEventListener("pointerup", () => { drag = null; });
view.addEventListener("contextmenu", (e) => e.preventDefault());
view.addEventListener("wheel", (e) => { if (state.mode === "ground") P.camDist = Math.max(8, Math.min(400, P.camDist * Math.exp(e.deltaY * 0.001))); }, { passive: true });
window.addEventListener("keydown", (e) => {
  state.keys[e.code] = true;
  if (state.mode !== "ground") return;
  if (e.code === "Escape") cancelBuild();
  if (e.code === "KeyR" && state.building) state.buildRot += Math.PI / 4;
  if (e.code === "KeyB") { if (state.building) cancelBuild(); else startBuild(BaseKit.MODULES[0].id); }
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
  for (const c of [orbit.camera, ground.camera]) { c.aspect = window.innerWidth / window.innerHeight; c.updateProjectionMatrix(); }
  LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3);
}
window.addEventListener("resize", resize);
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camUp = new THREE.Vector3();
function stepGround(dt, t) {
  const k = state.keys;
  if (state.phase === "driving") {
    const max = k.ShiftLeft || k.ShiftRight ? 180 : 60;
    const want = (k.KeyW || k.ArrowUp ? max : 0) - (k.KeyS || k.ArrowDown ? max * 0.4 : 0);
    P.speed += (want - P.speed) * Math.min(1, dt * 1.6);
    const turn = ((k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)) * 1.2;
    P.fwd.applyAxisAngle(P.dir, turn * dt);
    // move along the great circle
    const a = P.speed * dt / surf.R;
    if (a) {
      const nd = P.dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(P.fwd, Math.sin(a)).normalize();
      P.fwd.multiplyScalar(Math.cos(a)).addScaledVector(P.dir, -Math.sin(a));
      P.dir.copy(nd);
    }
    P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize();
    const gr = groundRadius(P.dir);
    if (gr != null) P.r += (gr + 3 - P.r) * Math.min(1, dt * 6);
  } else if (state.phase === "descending" || state.phase === "ascending") {
    state.phaseT += dt;
    const gr = groundRadius(P.dir) || surf.R, dur = state.phase === "descending" ? 5 : 3, k2 = Math.min(1, state.phaseT / dur);
    const e = 1 - Math.pow(1 - k2, 3);
    P.r = state.phase === "descending" ? gr + 3 + 650 * (1 - e) : gr + 3 + 650 * k2 * k2;
    if (k2 >= 1) {
      if (state.phase === "descending") { state.phase = "driving"; toast("Landed"); }
      else { state.phase = "done"; state.after && state.after(); }
    }
  }
  surf.update(P.dir, 1);
  // the craft
  craft.position.copy(P.dir).multiplyScalar(P.r);
  const right = tmp.crossVectors(P.dir, P.fwd).normalize();
  craft.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, P.dir, P.fwd));
  craftModel.update(t, dt, { power: state.phase === "driving" ? 0.2 + Math.abs(P.speed) / 180 : 1 });
  // the chase camera, in the local frame
  const back = P.fwd.clone().applyAxisAngle(P.dir, P.camYaw).negate();
  const cam = ground.camera;
  cam.up.copy(P.dir);
  cam.position.copy(craft.position).addScaledVector(back, P.camDist * Math.cos(P.camPitch)).addScaledVector(P.dir, P.camDist * Math.sin(P.camPitch));
  const cr = cam.position.length(), cd = camUp.copy(cam.position).normalize(), cg = groundRadius(cd);
  if (cg != null && cr < cg + 2) cam.position.copy(cd).multiplyScalar(cg + 2);
  cam.lookAt(tmp2.copy(craft.position).addScaledVector(P.dir, 2));
  if (P.lookUp) cam.rotateX(P.lookUp);
  // the sky, the weather, the light
  advanceDay(dt);
  SK.frame(state.full, state.theta, Mframe);
  const wx = weather.update(t, dt, { camera: cam, up: cd, light: Math.min(1, lightNow.day * 0.9 + 0.06), pixelHeight: renderer.domElement.height });
  if (P.lookUp) cam.updateMatrixWorld();
  const L = sky.update(t, { camera: cam, up: cd, frame: Mframe, weather: wx });
  lightNow.day = L.day;
  applyLight(L, wx, dt);
  // the base: construction progress from the clock, the compass
  const now = Date.now();
  baseObjs.forEach((o) => { o.mod.setProgress((now - o.m.start) / o.m.dur); o.mod.update(t, dt); });
  const base = SK.bases.get(state.ref);
  $("compass").classList.toggle("hidden", !base);
  if (base) {
    const c = SK.latLonToDir(base.lat, base.lon), dist = SK.greatCircle(P.dir, c, surf.R);
    const to = c.clone().addScaledVector(P.dir, -c.dot(P.dir)).normalize();
    const ang = Math.atan2(to.dot(right), to.dot(P.fwd));
    $("cArrow").setAttribute("transform", "rotate(" + (ang * 180 / Math.PI).toFixed(1) + " 15 15)");
    $("cDist").textContent = dist < 1000 ? Math.round(dist) + " m" : (dist / 1000).toFixed(1) + " km";
  }
  $("rSpeed").textContent = Math.round(Math.abs(P.speed)); $("rAlt").textContent = Math.round(P.r - (groundRadius(P.dir) || P.r));
  const ll = SK.dirToLatLon(P.dir); $("rWhere").textContent = ll.lat.toFixed(2) + "°, " + ll.lon.toFixed(2) + "°";
  // the building hologram follows the pointer
  if (state.building) {
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObjects(surf.meshes)[0], b = state.building;
    b.mod.group.visible = !!hit;
    if (hit) {
      b.dir = hit.point.clone().normalize();
      b.why = validate(b.id, b.dir); b.ok = !b.why;
      placeOnGround(b.mod.group, b.dir, state.buildRot);
      b.mod.setGhostState(b.ok ? "ok" : "bad");
      b.mod.update(t, dt);
    }
  }
  $("statTiles").textContent = surf.loadedCount();
}
function frame() {
  const t0 = performance.now(), dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  renderer.info.reset();
  if (state.mode === "orbit" || state.mode === "transit") {
    if (state.mode === "orbit") { oc.update(); advanceDay(dt); }
    SK.frame(state.full, state.theta, Mframe);
    globe.surfaceRoot.updateMatrixWorld(true);
    orbitSun.copy(state.sky.suns[0].dir).applyMatrix4(Mframe).transformDirection(globe.surfaceRoot.matrixWorld);
    globe.update(t, dt, { sunDir: orbitSun, center: orbit.camera.position, renderer });
    backdrop.update(t, dt, { center: orbit.camera.position, renderer });
    renderer.render(orbit.scene, orbit.camera);
  } else {
    stepGround(dt, t);
    renderer.render(ground.scene, ground.camera);
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
  SK.frame(state.full, state.theta, Mframe);
  return state.sky.suns.map((x) => ({ ref: "sun", kind: x.kind, d: x.dir, ang: x.ang })).concat(state.sky.bodies.map((x) => ({ ref: x.ref, kind: x.kind, d: x.dir, ang: x.ang })))
    .map((x) => { v.copy(x.d).applyMatrix4(Mframe).normalize(); return { ref: x.ref, kind: x.kind, ang: +(x.ang * deg).toFixed(2),
      el: +(Math.asin(v.dot(up)) * deg).toFixed(1), az: +(Math.atan2(v.dot(east), v.dot(north)) * deg).toFixed(0) }; });
}
window.surfaceLab = { sky, weather, skyList, pickWorld, setHour, hourNow, get light() { return lightNow; }, get daySecs() { return daySecs; }, set daySecs(v) { daySecs = v; }, state, P, land, enterGround, startBuild, place, validate, get surf() { return surf; }, get globe() { return globe; }, toast, camera: ground.camera };
})();
