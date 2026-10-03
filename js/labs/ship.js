// The ship lab's own script (ship.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
/* =======================================================================
   VIEWER — preview page only (not part of the game extraction).
   Uses ShipKit's public API exclusively.
   ======================================================================= */
(() => {
"use strict";

// The nebula sky (also the reflection environment) comes from ShipKit, shared
// with the game's environment map.
const makeSky = () => ShipKit.makeSpaceSky();

// =====================================================================
// Renderer, scene, camera, controls
// =====================================================================
const view = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(9.5, 4.2, 11.5);

const controls = new THREE.OrbitControls(camera, view);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 40;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

// Sky dome + image-based lighting from the same generated sky.
const skyTex = makeSky();
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(200, 64, 32),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
);
skyTex.mapping = THREE.UVMapping; // dome uses plain UVs…
scene.add(skyDome);
const envTex = skyTex.clone(); // …the PMREM input uses equirect mapping
envTex.mapping = THREE.EquirectangularReflectionMapping;
envTex.needsUpdate = true;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(envTex).texture;

// Lights: warm key (casts shadows), cool rim, soft hemisphere fill.
const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
key.position.set(-8, 10, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7f95ff, 1.6);
rim.position.set(7, -2, -9);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x1a1020, 0.35));

// =====================================================================
// Viewer: current ship, rebuild on detail change, disposal
// =====================================================================
const state = { rotate: true, freeze: false, engines: true, lights: true, wire: false, merge: false, quality: 3, detail: 1, round: 0, seal: 0, sealStyle: "fillet", shipIndex: 0,
                toggles: {}, damage: 0 };
let current = null;      // ShipKit model handle
const holder = new THREE.Group();
scene.add(holder);

function applyWire() {
  holder.traverse((o) => {
    const m = o.material;
    if (m && (m.isMeshStandardMaterial || m.isMeshBasicMaterial) && !o.isSprite) m.wireframe = state.wire;
  });
}
function loadShip(index, keepCamera) {
  if (current) ShipKit.disposeShipModel(current);
  const def = ShipKit.SHIP_DEFS[index];
  const tb = performance.now();
  current = ShipKit.buildShipModel(def.id, { detail: state.detail, merge: state.merge, round: state.round, seal: state.seal, sealStyle: state.sealStyle,
    labels: shipLabels(def.id) });   // the hull's lettering follows the renamed name / caption
  const buildMs = performance.now() - tb;
  holder.add(current.group);
  current.setLights(state.lights);
  if (!keepCamera) state.toggles = {};            // a different ship starts online
  for (const id in state.toggles) if (state.toggles[id]) current.act(id, true);
  current.setDamage(state.damage);
  document.getElementById("dmgSlider").disabled = !current.damageEnabled;
  renderActions();
  applyWire();
  renderModelStats({ ...ShipKit.modelStats(current.group), buildMs });
  if (typeof fitHud === "function") fitHud(); // panel height depends on the stats list
  if (!keepCamera) camera.position.set(...def.camera);
  // HUD
  showLabels();
  document.getElementById("shipIndex").textContent = `${index + 1} / ${ShipKit.SHIP_DEFS.length}`;
  document.getElementById("prevShip").disabled = document.getElementById("nextShip").disabled = ShipKit.SHIP_DEFS.length < 2;
}

// One button per model action: triggers flash, toggles stay lit.
function renderActions() {
  const box = document.getElementById("actBtns");
  box.textContent = "";
  for (const a of current.actions) {
    const b = document.createElement("button");
    b.className = "tBtn " + (a.kind === "toggle" ? "tgl" : "trig") + (a.id === "offline" || a.id === "destroy" ? " off" : "");
    b.textContent = a.label;
    b.disabled = !a.enabled;
    if (!a.enabled) b.title = "This ship has no animation for this action";
    b.classList.toggle("on", !!state.toggles[a.id]);
    b.addEventListener("click", () => {
      if (a.kind === "toggle") {
        state.toggles[a.id] = !state.toggles[a.id];
        b.classList.toggle("on", state.toggles[a.id]);
        current.act(a.id, state.toggles[a.id]);
      } else if (a.id === "destroy" && current.destroyed) {
        state.damage = 0; dmgSlider.value = 0; paintSlider(dmgSlider);    // REBUILD: a fresh model
        document.getElementById("dmgVal").textContent = "0%";
        state.toggles = {};
        loadShip(state.shipIndex, true);
      } else {
        current.act(a.id);
        if (a.id === "destroy") { b.textContent = "REBUILD"; b.classList.add("on"); }
        else { b.classList.add("pulse"); setTimeout(() => b.classList.remove("pulse"), 250); }
      }
    });
    box.appendChild(b);
  }
}

function renderModelStats(st) {
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const rows = [
    ["3D objects", fmt(st.objects)],
    ["Solid meshes", fmt(st.meshes)],
    ["Instanced groups", `${st.instanced} (${fmt(st.copies)} copies)`],
    ["Glow sprites", fmt(st.sprites)],
    ["Wire / particle systems", `${st.lines} / ${st.points} (${fmt(st.particles)} pts)`],
    ["Triangles", fmt(st.triangles)],
    ["Vertices", fmt(st.vertices)],
    ["Figure types", fmt(Object.keys(st.figures).length)],
    ["Materials / custom shaders", `${st.materials.size} / ${st.shaders}`],
    ["Textures", `${st.texCount} (≈${st.texMB.toFixed(0)} MB GPU)`],
    ["Build time", st.buildMs.toFixed(0) + " ms"],
  ];
  const box = document.getElementById("infoRows");
  box.textContent = "";
  for (const [k, v] of rows) {
    const r = document.createElement("div"); r.className = "row";
    const a = document.createElement("span"); a.textContent = k;
    const b = document.createElement("b"); b.textContent = v;
    r.append(a, b); box.appendChild(r);
  }
  const list = document.getElementById("figList");
  list.textContent = "";
  for (const [name, n] of Object.entries(st.figures).sort((x, y) => y[1] - x[1])) {
    const li = document.createElement("li");
    const a = document.createElement("span"); a.textContent = name;
    const b = document.createElement("b"); b.textContent = n;
    li.append(a, b); list.appendChild(li);
  }
}

// =====================================================================
// Quality presets (render cost) — the geometry slider is separate.
// =====================================================================
const dpr = window.devicePixelRatio || 1;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const QUALITY = [
  { name: "LOW",    pr: 0.5,                          shadow: 0,    aniso: 1,  particles: false },
  { name: "MEDIUM", pr: 0.75,                         shadow: 1024, aniso: 2,  particles: true },
  { name: "HIGH",   pr: 1,                            shadow: 2048, aniso: 4,  particles: true },
  { name: "ULTRA",  pr: Math.max(1, Math.min(dpr, 2)), shadow: 2048, aniso: 8,  particles: true },
  { name: "MAX",    pr: Math.min(Math.max(1, dpr) * 1.5, 3), shadow: 4096, aniso: 16, particles: true },
];
function applyQuality(level) {
  const q = QUALITY[level];
  renderer.setPixelRatio(q.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const shadowsOn = q.shadow > 0;
  if (renderer.shadowMap.enabled !== shadowsOn) {
    renderer.shadowMap.enabled = shadowsOn;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); // recompile with/without shadows
  }
  key.castShadow = shadowsOn;
  if (shadowsOn && key.shadow.mapSize.x !== q.shadow) {
    key.shadow.mapSize.set(q.shadow, q.shadow);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  }
  for (const t of ShipKit.allTextures) { t.anisotropy = Math.min(q.aniso, maxAniso); t.needsUpdate = true; }
  document.getElementById("qVal").textContent = q.name;
  document.getElementById("statRes").textContent =
    `${Math.round(window.innerWidth * q.pr)}×${Math.round(window.innerHeight * q.pr)}`;
}

// =====================================================================
// HUD wiring
// =====================================================================
const toggle = (id, key, apply) => LabKit.toggle(id, state, key, apply);
toggle("btnRotate", "rotate", (on) => { controls.autoRotate = on; });
toggle("btnEngines", "engines", () => {});
toggle("btnLights", "lights", (on) => current && current.setLights(on));
toggle("btnWire", "wire", applyWire);
toggle("btnFreeze", "freeze", () => {});   // the frame loop gives the model no time to move (see current.update)
toggle("btnMerge", "merge", () => loadShip(state.shipIndex, true));

const qSlider = document.getElementById("qSlider"), dSlider = document.getElementById("dSlider");
const paintSlider = LabKit.paintSlider;
qSlider.addEventListener("input", () => { state.quality = +qSlider.value; paintSlider(qSlider); applyQuality(state.quality); fx.markCustom(); });
let rebuildQueued = false;
function queueRebuild() {
  if (!rebuildQueued) { // coalesce rebuilds to at most one per frame while dragging
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; loadShip(state.shipIndex, true); });
  }
}
dSlider.addEventListener("input", () => {
  state.detail = +dSlider.value;
  document.getElementById("dVal").textContent = Math.round(state.detail * 100) + "%";
  paintSlider(dSlider);
  queueRebuild();
});
// SHAPING: rounded edges and sealed joints (ShipKit's SHAPING; the game builds with 0 for now)
for (const [id, style] of [["btnFillet", "fillet"], ["btnBead", "bead"]]) document.getElementById(id).addEventListener("click", () => {
  state.sealStyle = style;
  document.getElementById("btnFillet").classList.toggle("on", style === "fillet");
  document.getElementById("btnBead").classList.toggle("on", style === "bead");
  if (state.seal > 0) queueRebuild();
});
for (const [id, key, val] of [["rSlider", "round", "rVal"], ["sSlider", "seal", "sVal"]]) {
  const el = document.getElementById(id);
  paintSlider(el);
  el.addEventListener("input", () => {
    state[key] = +el.value;
    document.getElementById(val).textContent = Math.round(state[key] * 100) + "%";
    paintSlider(el);
    queueRebuild();
  });
}
const dmgSlider = document.getElementById("dmgSlider");
dmgSlider.addEventListener("input", () => {
  state.damage = +dmgSlider.value;
  document.getElementById("dmgVal").textContent = Math.round(state.damage * 100) + "%";
  paintSlider(dmgSlider);
  current.setDamage(state.damage);
});

// =====================================================================
// IMAGE EFFECTS (LabKit + PostKit, shared with the game): the camera's
// picture, not part of the model; a preset also sets the render quality.
// =====================================================================
const fx = LabKit.imageEffects({ renderer, scene, camera, panel: document.getElementById("fxPanel"),
  effects: ["bloom", "fxaa", "sharpen", "filter", "dof"],
  setQuality: (level) => { state.quality = level; qSlider.value = level; paintSlider(qSlider); applyQuality(level); },
});

const step = (d) => { state.shipIndex = (state.shipIndex + d + ShipKit.SHIP_DEFS.length) % ShipKit.SHIP_DEFS.length; loadShip(state.shipIndex, false); };
document.getElementById("prevShip").addEventListener("click", () => step(-1));
document.getElementById("nextShip").addEventListener("click", () => step(1));

LabKit.applyGrain();   // the panels' grain (css/lab.css --grain)
LabKit.autoHideHud([document.getElementById("hud"), document.getElementById("opt")], 5);
// Per-viewer conveniences, in this browser only (storage may be unavailable)
const store = {
  get(k, d) { try { const v = localStorage.getItem("shipLab." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("shipLab." + k, JSON.stringify(v)); } catch (e) { /* not kept */ } },
};
// Rename: double-click the ship's name or the caption; Enter keeps it, Esc
// cancels, empty brings the original back. Kept per ship, in the lab only.
const DEFAULT_SUB = "SWARM PROTOCOL // SHIP LAB";
function shipLabels(id) { return store.get("names", {})[id] || {}; }
function showLabels() {
  const def = ShipKit.SHIP_DEFS[state.shipIndex], L = shipLabels(def.id);
  document.getElementById("hudTitle").textContent = L.name || def.name;
  document.getElementById("hudSub").textContent = L.sub || DEFAULT_SUB;
}
for (const [elId, key] of [["hudTitle", "name"], ["hudSub", "sub"]]) {
  const el = document.getElementById(elId);
  let before = "";
  const finish = (keepIt) => {
    if (el.getAttribute("contenteditable") !== "true") return;
    el.removeAttribute("contenteditable");
    const def = ShipKit.SHIP_DEFS[state.shipIndex], all = store.get("names", {}), mine = Object.assign({}, all[def.id]);
    const text = el.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
    const changed = keepIt && text !== (all[def.id] || {})[key] && !(text === "" && !(all[def.id] || {})[key]);
    if (keepIt) { if (text) mine[key] = text; else delete mine[key]; all[def.id] = mine; store.set("names", all); }
    else el.textContent = before;
    showLabels();
    if (changed) loadShip(state.shipIndex, true);          // repaint the hull's lettering
  };
  el.addEventListener("dblclick", () => {
    before = el.textContent;
    el.setAttribute("contenteditable", "true"); el.focus();
    const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  el.addEventListener("keydown", (e) => {
    e.stopPropagation();                                   // C and the other keys type, not switch views
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  el.addEventListener("blur", () => finish(true));
}
// CHANGE VIEW / C: the full UI, or only the ticked blocks (kept per viewer)
{
  const picked = store.get("picked", {});
  document.querySelectorAll("[data-pick]").forEach((box) => {
    const block = box.closest(".block");
    box.checked = !!picked[box.dataset.pick];
    block.classList.toggle("picked", box.checked);
    box.addEventListener("change", () => {
      picked[box.dataset.pick] = box.checked; store.set("picked", picked);
      block.classList.toggle("picked", box.checked);
    });
  });
  let focus = false;
  const setFocus = (on) => { focus = on; document.body.classList.toggle("focus", on); fitHud(); };
  document.getElementById("btnView").addEventListener("click", () => setFocus(!focus));
  window.addEventListener("keydown", (e) => {
    // not while typing (a text field, a name being edited); a checkbox or a slider in focus is fine
    const a = document.activeElement, typing = a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" ||
      (a.tagName === "INPUT" && !/^(checkbox|range|button|radio)$/.test(a.type));
    if (e.code !== "KeyC" || e.ctrlKey || e.metaKey || e.altKey || typing) return;
    setFocus(!focus);
  });
}

const perf = LabKit.perfCounters(renderer);   // FPS, frame/CPU time, triangles, draw calls + graph

// =====================================================================
// Animation
// =====================================================================
const clock = new THREE.Clock();
let power = 1;
let bob = 1;
function frame() {
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  power += ((state.engines ? 1 : 0) - power) * Math.min(1, dt * 3);

  // idle drift of the whole ship (the lab only): STOP ANIMATIONS eases it
  // to rest instead of snapping it, and back again
  bob += ((state.freeze ? 0 : 1) - bob) * Math.min(1, dt * 2);
  holder.position.y = Math.sin(t * 0.7) * 0.12 * bob;
  holder.rotation.x = Math.sin(t * 0.5) * 0.035 * bob;
  holder.rotation.z = Math.sin(t * 0.37) * 0.02 * bob;
  // STOP ANIMATIONS: the model gets no frame time (dt 0), so whatever moves
  // by dt — spinners, rings, turrets, particles — stands still, while what
  // runs on the clock (t) — blinking lights, engine flames — goes on
  current.update(t, state.freeze ? 0 : dt, { power, particles: QUALITY[state.quality].particles });

  controls.update();
  renderer.info.reset();
  fx.render(controls.target, 3.2);
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}

// HUD scaling: both panels share one scale factor (--ui) so they follow
// the window: grow a little on big screens, shrink on small ones and never
// overlap each other horizontally. It depends on the WINDOW only, not on
// the panels' content — a panel that doesn't fit vertically scrolls (CSS
// max-height on #hud/#opt), so the UI doesn't change size when, e.g., GAME
// BUILD rebuilds the model and its stats list gets shorter.
const hudEl = document.getElementById("hud"), optEl = document.getElementById("opt");
function fitHud() { LabKit.fitHud([hudEl, optEl], 0.45, 1.35); }
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyQuality(state.quality);
  fitHud();
});
if (document.fonts) document.fonts.ready.then(fitHud); // text metrics change once web fonts load

loadShip(0, false);
paintSlider(qSlider); paintSlider(dSlider); paintSlider(dmgSlider);
applyQuality(state.quality);
fitHud();
frame();
const loading = document.getElementById("loading");
loading.style.opacity = "0";
setTimeout(() => loading.remove(), 700);
// for scripts (tests, screenshots)
window.shipLab = { camera, controls, state, loadShip, get model() { return current; } };
})();
