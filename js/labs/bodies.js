// The bodies lab's own script (bodies.html): its scene and panels, wired to the kits'
// public APIs. Moved out of the page (2026-10-03) so the page is markup and styles.
/* =======================================================================
   VIEWER — preview page only (not part of the game extraction).
   Uses BodyKit's public API exclusively.
   ======================================================================= */
(() => {
"use strict";

const makeGlow = LabKit.makeGlow;


// =====================================================================
// Renderer, scene, camera, controls
// =====================================================================
const view = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0.6, 0.9, 4.4);
const controls = new THREE.OrbitControls(camera, view);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.4;
controls.maxDistance = 90;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// The backdrop is the game's own sky (BodyKit's SKY group, kind "sky"):
// what you see behind a body here is what the game shows. Hidden while
// the SKY tab edits a sky of its own.
const gameSky = BodyKit.GAME_KINDS.sky;
const backdrop = BodyKit.buildBody(gameSky.groupId, gameSky.bodyId, { detail: 1 });
backdrop.setRadius(200);
scene.add(backdrop.group);

// The bodies light themselves from sunDir; the sprite just shows where it is.
const sunDir = new THREE.Vector3(-1, 0.28, 0.5).normalize();
const sun = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow("rgba(255,255,255,1)", "rgba(255,200,120,0.6)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sun.position.copy(sunDir).multiplyScalar(150);
sun.scale.setScalar(30);
scene.add(sun);

// SHIP LIGHT toggle: a teal point light circling the body (BodyKit's
// opts.lights), with a glow dot to show where it is.
const shipLight = { position: new THREE.Vector3(), color: new THREE.Color(0x4fe3c6).convertSRGBToLinear(), intensity: 1.5, distance: 4 };
const shipLights = [shipLight];
const shipLightDot = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlow("rgba(220,255,248,1)", "rgba(79,227,198,0.6)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
shipLightDot.visible = false;
scene.add(shipLightDot);

// =====================================================================
// State + body loading
// =====================================================================
const state = { groupIndex: 0, bodyIndex: 0, rotate: true, clouds: true, atmosphere: true, wire: false, shipLight: false, gameBuild: false,
                quality: 3, detail: 1, values: null };
let current = null;
const $ = (id) => document.getElementById(id);
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");

function currentGroup() { return BodyKit.GROUPS[state.groupIndex]; }

function loadBody(keepValues) {
  if (current) { BodyKit.disposeBody(current); current = null; }
  const g = currentGroup(), def = g.bodies[state.bodyIndex];
  $("bodyIndex").textContent = def ? `${state.bodyIndex + 1} / ${g.bodies.length}` : "0 / 0";
  $("prevBody").disabled = $("nextBody").disabled = g.bodies.length < 2;
  $("hudTitle").textContent = def ? def.name + (def.slot != null ? ` · ORBIT ${def.slot}` : "") : g.name;
  $("emptyNote").classList.toggle("hidden", !!def);
  $("bodyStats").classList.toggle("hidden", !def);
  // layer toggles: only the layers this group has, named by the group
  const layers = g.layers || {};
  $("btnClouds").classList.toggle("hidden", !def || !layers.clouds); $("btnAtmo").classList.toggle("hidden", !def || !layers.atmosphere);
  $("btnClouds").textContent = layers.clouds || "CLOUDS"; $("btnAtmo").textContent = layers.atmosphere || "ATMOSPHERE";
  if (!def) { state.values = null; buildParamSliders(); return; }
  backdrop.group.visible = g.id !== gameSky.groupId;       // the SKY tab shows its own sky
  if (!keepValues || !state.values) state.values = BodyKit.defaultValues(g, def);
  // GAME BUILD: the detail the game uses for this body (the sky is built as is)
  const detail = state.gameBuild && g.id !== gameSky.groupId ? state.detail * BodyKit.GAME_DETAIL_SCALE : state.detail;
  current = BodyKit.buildBody(g.id, def.id, { detail, values: state.values });
  scene.add(current.group);
  current.setOctaves(QUALITY[state.quality].octaves);
  current.setLayers({ clouds: state.clouds, atmosphere: state.atmosphere });
  applyWire();
  if (!keepValues) buildParamSliders();
  refreshModelStats();
  queueMeasure();
}

function applyWire() {
  if (current) current.group.traverse((o) => { if (o.material) o.material.wireframe = state.wire; });
}

// ---- statistics
function row(box, k, v) {
  const r = document.createElement("div"); r.className = "row";
  const a = document.createElement("span"); a.textContent = k;
  const b = document.createElement("b"); b.textContent = v;
  r.append(a, b); box.appendChild(r);
}
function refreshModelStats() {
  const box = $("modelRows"); box.textContent = "";
  if (!current) return;
  const st = BodyKit.modelStats(current.group);
  row(box, "Meshes", st.meshes);
  row(box, "Triangles", fmtInt(st.triangles));
  row(box, "Vertices", fmtInt(st.vertices));
  row(box, "Custom shaders", st.shaderCount);
  row(box, "Noise octaves per pixel", QUALITY[state.quality].octaves);
  row(box, "Textures", "0 (fully procedural)");
  fitHud();
}
let measureTimer = 0;
function queueMeasure() { clearTimeout(measureTimer); measureTimer = setTimeout(measure, 120); }
function measure() {
  if (!current) return;
  const v = state.values, g = currentGroup();
  const box = $("physRows"); box.textContent = "";
  if (g.kmPerSize) {                                     // a body (not the sky)
    const R = g.kmPerSize * v.size, area = 4 * Math.PI * R * R;
    row(box, "Radius", fmtInt(R) + " km");
    row(box, "Surface area", area >= 1e6 ? fmtInt(area / 1e6) + " M km²" : fmtInt(area) + " km²");
  }
  for (const [k, text] of current.describe(renderer)) row(box, k, text);   // the group's own statistics
  if (g.kmPerSize) row(box, "Axial tilt", Math.round(v.tilt) + "°");
  fitHud();
}
setInterval(() => { if (current && state.values.cloudDrift > 0) measure(); }, 2000); // clouds drift

// ---- parameter sliders, generated from the group's schema
const paintSlider = LabKit.paintSlider;
function slider(container, p, value, onChange) {
  const wrap = document.createElement("div"); wrap.className = "param";
  const lab = document.createElement("label"); lab.className = "sl";
  const name = document.createElement("span"); name.textContent = p.label;
  const val = document.createElement("b"); val.textContent = p.fmt ? p.fmt(value) : value;
  lab.append(name, val);
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min: p.min, max: p.max, step: p.step, value });
  input.addEventListener("input", () => {
    const x = +input.value; val.textContent = p.fmt ? p.fmt(x) : x; paintSlider(input); onChange(x);
  });
  wrap.append(lab, input); container.appendChild(wrap);
  paintSlider(input);
}
function buildParamSliders() {
  const common = $("commonParams"), own = $("groupParams");
  common.textContent = ""; own.textContent = "";
  const g = currentGroup();
  $("groupParamsHd").textContent = g.name + " PARAMETERS";
  const has = !!state.values;
  $("paramsBody").classList.toggle("hidden", !has);
  $("paramsEmpty").classList.toggle("hidden", has);
  if (!has) { fitHud(); return; }
  const showCommon = g.common !== false;                 // the sky has no spin/tilt/damage sliders
  $("commonHd").classList.toggle("hidden", !showCommon); common.classList.toggle("hidden", !showCommon);
  const set = (key) => (x) => { state.values[key] = x; current.setValues({ [key]: x }); if (key !== "spin" && key !== "damage") queueMeasure(); };
  if (showCommon) for (const p of BodyKit.COMMON_PARAMS) slider(common, p, state.values[p.key], set(p.key));
  if (g.params.length === 0) {
    const n = document.createElement("div"); n.className = "note"; n.textContent = "No group-specific parameters yet.";
    own.appendChild(n);
  }
  for (const p of g.params) slider(own, p, state.values[p.key], set(p.key));
  fitHud();
}

// =====================================================================
// Quality presets (render cost); geometry detail is separate.
// =====================================================================
const dpr = window.devicePixelRatio || 1;
const QUALITY = [
  { name: "LOW",    pr: 0.5 },
  { name: "MEDIUM", pr: 0.75 },
  { name: "HIGH",   pr: 1 },
  { name: "ULTRA",  pr: Math.max(1, Math.min(dpr, 2)) },
  { name: "MAX",    pr: Math.min(Math.max(1, dpr) * 1.5, 3) },
];
QUALITY.forEach((q, i) => { q.octaves = BodyKit.QUALITY_OCTAVES[i]; }); // the game uses the same
function applyQuality(level) {
  const q = QUALITY[level];
  renderer.setPixelRatio(q.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (current) current.setOctaves(q.octaves);
  backdrop.setOctaves(q.octaves);
  $("qVal").textContent = q.name;
  $("statRes").textContent = `${Math.round(window.innerWidth * q.pr)}×${Math.round(window.innerHeight * q.pr)}`;
  refreshModelStats();
  queueMeasure();
}

// =====================================================================
// HUD wiring
// =====================================================================
const tabs = $("groupTabs");
BodyKit.GROUPS.forEach((g, i) => {
  const b = document.createElement("button");
  b.className = "mat groupTab"; b.textContent = g.name;
  b.addEventListener("click", () => {
    state.groupIndex = i; state.bodyIndex = 0;
    camera.position.setLength((g.bodies[0] && g.bodies[0].view) || g.view || 4.4);    // frame the group's bodies (a comet's tail is long)
    [...tabs.children].forEach((t, j) => { t.classList.toggle("gold", j === i); t.classList.toggle("blueT", j !== i); });
    loadBody(false);
  });
  b.classList.add(i === 0 ? "gold" : "blueT");
  tabs.appendChild(b);
});
const stepBody = (d) => {
  const n = currentGroup().bodies.length; if (n < 2) return;
  state.bodyIndex = (state.bodyIndex + d + n) % n; loadBody(false);
  const g = currentGroup();
  camera.position.setLength(g.bodies[state.bodyIndex].view || g.view || 4.4);   // a body may need more room (rings)
};
$("prevBody").addEventListener("click", () => stepBody(-1));
$("nextBody").addEventListener("click", () => stepBody(1));

const toggle = (id, key, apply) => LabKit.toggle(id, state, key, apply);
toggle("btnRotate", "rotate", (on) => { controls.autoRotate = on; });
toggle("btnClouds", "clouds", (on) => current && current.setLayers({ clouds: on }));
toggle("btnAtmo", "atmosphere", (on) => current && current.setLayers({ atmosphere: on }));
toggle("btnWire", "wire", applyWire);
toggle("btnGameBuild", "gameBuild", () => loadBody(true));
toggle("btnShipLight", "shipLight", (on) => { shipLightDot.visible = on; });

$("btnSeed").addEventListener("click", () => {
  if (!current) return;
  state.values.seed = Math.floor(Math.random() * 100000) / 10;
  current.setValues({ seed: state.values.seed }); queueMeasure();
});
$("btnReset").addEventListener("click", () => loadBody(false));

// The current body as a ready-to-paste entry for the group's `bodies` list
// in js/bodykit/bodykit.js — the sliders only change this preview, the
// game shows what's in that file. Only values that differ from the
// group's defaults are written (plus the seed); damage is a preview, not
// part of a body.
function bodyEntryText() {
  const g = currentGroup(), def = g.bodies[state.bodyIndex], v = state.values;
  const defaults = BodyKit.defaultValues(g, { values: {} });
  const decimals = (step) => Math.max(0, (String(step).split(".")[1] || "").length);
  const parts = [`seed: ${+v.seed.toFixed(1)}`];
  for (const p of [...BodyKit.COMMON_PARAMS, ...g.params]) {
    if (p.key === "damage") continue;
    const x = +v[p.key].toFixed(decimals(p.step));
    if (x !== +defaults[p.key].toFixed(decimals(p.step))) parts.push(`${p.key}: ${x}`);
  }
  // the body's own values for keys its group shows no slider for (kept as they are)
  const shown = new Set([...BodyKit.COMMON_PARAMS, ...g.params].map((p) => p.key));
  for (const k of Object.keys(def.values || {})) if (k !== "seed" && !shown.has(k)) parts.push(`${k}: ${def.values[k]}`);
  const slot = def.slot != null ? ` slot: ${def.slot},` : "";
  return `{ id: "${def.id}", name: "${def.name}",${slot} values: { ${parts.join(", ")} } },`;
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");   // fallback (older browsers)
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); ta.remove();
  return Promise.resolve();
}
$("btnCopy").addEventListener("click", () => {
  if (!current) return;
  const text = bodyEntryText(), b = $("btnCopy");
  console.log(text);
  copyText(text).then(() => { b.textContent = "COPIED ✓"; }, () => { b.textContent = "SEE CONSOLE (F12)"; })
    .then(() => setTimeout(() => { b.textContent = "COPY VALUES"; }, 1600));
});

const qSlider = $("qSlider"), dSlider = $("dSlider");
qSlider.addEventListener("input", () => { state.quality = +qSlider.value; paintSlider(qSlider); applyQuality(state.quality); fx.markCustom(); });

// =====================================================================
// IMAGE EFFECTS (LabKit + PostKit, shared with the game): the camera's
// picture, not part of the body; a preset also sets the render quality.
// =====================================================================
const fx = LabKit.imageEffects({ renderer, scene, camera, panel: $("fxPanel"),
  effects: ["bloom", "fxaa", "sharpen", "filter", "dof", "flare", "rays", "lens"],
  setQuality: (level) => { state.quality = level; qSlider.value = level; paintSlider(qSlider); applyQuality(level); },
});
// the sun of the SUNS tab, else the lab's light sprite; the black hole of its tab
function bodyFx(o) {
  const gid = currentGroup().id, here = current && current.group.position;
  return {
    flare: o.flare || o.rays ? Object.assign(gid === "suns" && current ? { position: here, radius: current.radius } : { position: sun.position, radius: 6 },
      { strength: o.flare ? 1 : 0, rays: o.rays ? 1 : 0 }) : null,
    lens: o.lens && gid === "blackholes" && current ? { object: current.group, position: here, radius: current.radius } : null,
  };
}
let rebuildQueued = false;
dSlider.addEventListener("input", () => {
  state.detail = +dSlider.value;
  $("dVal").textContent = Math.round(state.detail * 100) + "%";
  paintSlider(dSlider);
  if (!rebuildQueued) {
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; loadBody(true); });
  }
});

LabKit.applyGrain();   // the panels' grain (css/lab.css --grain)
LabKit.autoHideHud([$("hud"), $("opt")], 5);   // the panels fade out when idle

// =====================================================================
// HUD scaling: all panels share one scale factor (--ui) so they follow
// the window and never overlap horizontally. It depends on the WINDOW
// only, not on the content — a panel that doesn't fit vertically scrolls
// (CSS max-height on #hud/#opt), so switching tabs (other sliders) never
// changes the UI size.
// =====================================================================
const hudEl = $("hud"), optEl = $("opt");
function fitHud() { LabKit.fitHud([hudEl, optEl], 0.4, 1.3); }

const perf = LabKit.perfCounters(renderer);   // FPS, frame/CPU time, triangles, draw calls + graph

// =====================================================================
// Animation
// =====================================================================
const clock = new THREE.Clock();
function frame() {
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  controls.update();
  camera.updateMatrixWorld();
  if (current) {
    // SHIP LIGHT: the game's ship glow (config.js SHIP_LIGHT_*) orbiting at
    // the eating distance, in the body's radius units
    const R = current.radius, a = t * 0.6;
    shipLight.position.set(Math.cos(a) * R * 1.8, R * 0.35, Math.sin(a) * R * 1.8);
    shipLight.distance = R * 4.5;
    shipLightDot.position.copy(shipLight.position);
    shipLightDot.scale.setScalar(R * 0.25);
    current.update(t, dt, { sunDir, lights: state.shipLight ? shipLights : undefined, center: camera.position, renderer });
  }
  backdrop.update(t, dt, { center: camera.position, renderer });
  renderer.info.reset();
  if (current) fx.render(current.group.position, current.radius, bodyFx);
  else renderer.render(scene, camera);
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyQuality(state.quality);
  fitHud();
});
if (document.fonts) document.fonts.ready.then(fitHud);

paintSlider(qSlider); paintSlider(dSlider);
loadBody(false);
applyQuality(state.quality);
fitHud();
frame();
const loading = $("loading");
loading.style.opacity = "0";
setTimeout(() => loading.remove(), 700);
})();
