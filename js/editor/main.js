// Editor for procedural body generation parameters. Uses the EXACT same
// functions as the game (materializePlanet/materializeBlackHole/
// updateBodies/updateBlackHoles) so the preview is guaranteed to match what
// players see, instead of a parallel implementation that could drift.
import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { CONTENT } from "../content.js";
import { settings } from "../settings.js";
import { initScene } from "../scene/setup.js";
import { camState, updateCamera } from "../scene/controls.js";
import { initParticles, updateParticles } from "../fx/particles.js";
import {
  randomPlanetSpawnData, materializePlanet, despawnLocalOnly
} from "../world/bodies.js";
import { updateBodies } from "../world/bodies.js";
import { randomBlackHoleSpawnData, materializeBlackHole, updateBlackHoles } from "../world/blackholes.js";

const TAB_LABELS = {
  sun: "Sun", icePlanet: "Ice Planet", neutralPlanet: "Neutral Planet",
  volcanicPlanet: "Volcanic Planet", comet: "Comet", meteoroid: "Meteoroid",
  blackhole: "Black Hole"
};

const SPAWN_WEIGHT_FIELD = { path: null, key: "spawnWeight", label: "Spawn weight", min: 0, max: 1, step: 0.01 };
const RADIUS_FIELDS = [
  { key: "radiusMin", label: "Radius: min", min: 0.05, max: 9, step: 0.02 },
  { key: "radiusMax", label: "Radius: max", min: 0.05, max: 9, step: 0.02 }
];
const TEMP_FIELDS = [
  { key: "tempMin", label: "Temperature: min", min: -1, max: 1, step: 0.01 },
  { key: "tempMax", label: "Temperature: max", min: -1, max: 1, step: 0.01 }
];
const COMMON_FIELDS = [
  { key: "healthMult", label: "Health multiplier", min: 1, max: 80, step: 1 },
  { key: "valueBonus", label: "Point bonus", min: 0, max: 150, step: 1 },
  { key: "emissive", label: "Self-glow", min: 0, max: 1.5, step: 0.01 }
];

const FIELD_DEFS = {
  sun: [
    SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS,
    { key: "rayCount", label: "Ray count", min: 0, max: 30, step: 1 },
    { key: "rayLengthLongMin", label: "Long rays: min length", min: 0, max: 6, step: 0.05 },
    { key: "rayLengthLongRange", label: "Long rays: length range", min: 0, max: 4, step: 0.05 },
    { key: "rayLengthShortMin", label: "Short rays: min length", min: 0, max: 4, step: 0.05 },
    { key: "rayLengthShortRange", label: "Short rays: length range", min: 0, max: 3, step: 0.05 },
    { key: "rayWidthMin", label: "Ray width: min", min: 0.02, max: 1, step: 0.01 },
    { key: "rayWidthRange", label: "Ray width: range", min: 0, max: 1, step: 0.01 },
    { key: "haloScale", label: "Halo scale", min: 1, max: 10, step: 0.1 }
  ],
  icePlanet: [ SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS ],
  neutralPlanet: [
    SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS,
    { key: "noiseScaleMin", label: "Terrain noise: scale min", min: 0.3, max: 5, step: 0.05 },
    { key: "noiseScaleRange", label: "Terrain noise: scale range", min: 0, max: 3, step: 0.05 },
    { key: "seaLevelMin", label: "Sea level: min", min: -0.5, max: 0.5, step: 0.01 },
    { key: "seaLevelRange", label: "Sea level: range", min: 0, max: 0.5, step: 0.01 },
    { key: "octaves", label: "Terrain noise: octaves", min: 1, max: 8, step: 1 }
  ],
  volcanicPlanet: [ SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS ],
  comet: [
    SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS,
    { key: "speedMin", label: "Speed: min", min: 0.2, max: 10, step: 0.1 },
    { key: "speedRange", label: "Speed: range", min: 0, max: 8, step: 0.1 },
    { key: "tailLengthMin", label: "Tail: min length", min: 0, max: 25, step: 0.5 },
    { key: "tailLengthRange", label: "Tail: length range", min: 0, max: 15, step: 0.5 },
    { key: "tailWidthMin", label: "Tail: min width", min: 0.1, max: 4, step: 0.05 },
    { key: "tailWidthRange", label: "Tail: width range", min: 0, max: 2, step: 0.05 }
  ],
  meteoroid: [ SPAWN_WEIGHT_FIELD, ...RADIUS_FIELDS, ...TEMP_FIELDS, ...COMMON_FIELDS ],
  blackhole: [
    { key: "radiusMin", label: "Radius: min", min: 0.3, max: 4, step: 0.05 },
    { key: "radiusRange", label: "Radius: range", min: 0, max: 3, step: 0.05 },
    { key: "lifeMin", label: "Lifetime: min (s)", min: 5, max: 120, step: 1 },
    { key: "lifeRange", label: "Lifetime: range (s)", min: 0, max: 100, step: 1 },
    { key: "firstSpawnMinS", label: "First spawn: min (s)", min: 0, max: 60, step: 1 },
    { key: "firstSpawnRangeS", label: "First spawn: range (s)", min: 0, max: 60, step: 1 },
    { key: "respawnMinS", label: "Respawn gap: min (s)", min: 1, max: 180, step: 1 },
    { key: "respawnRangeS", label: "Respawn gap: range (s)", min: 0, max: 120, step: 1 },
    { key: "fadeOutS", label: "Fade-out time (s)", min: 0.1, max: 10, step: 0.1 }
  ]
};

const state = { activeKind: "sun" };

function formatVal(v){ return Number.isInteger(v) ? String(v) : v.toFixed(2); }

function sectionTitle(text){
  const el = document.createElement("div");
  el.className = "section-title";
  el.textContent = text;
  return el;
}

function makeSliderField(def){
  const target = CONTENT[state.activeKind];
  const wrap = document.createElement("div");
  wrap.className = "field";
  const labelEl = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = def.label;
  const valueB = document.createElement("b");
  labelEl.appendChild(span);
  labelEl.appendChild(valueB);
  const input = document.createElement("input");
  input.type = "range";
  input.min = def.min; input.max = def.max; input.step = def.step;
  input.value = target[def.key];
  valueB.textContent = formatVal(target[def.key]);
  input.addEventListener("input", function(){
    const v = parseFloat(input.value);
    target[def.key] = v;
    valueB.textContent = formatVal(v);
    scheduleRegen();
  });
  wrap.appendChild(labelEl);
  wrap.appendChild(input);
  return wrap;
}

function renderFields(){
  const el = document.getElementById("fields");
  el.innerHTML = "";
  el.appendChild(sectionTitle(TAB_LABELS[state.activeKind]));
  FIELD_DEFS[state.activeKind].forEach(function(def){
    el.appendChild(makeSliderField(def));
  });
}

function buildTabs(){
  const el = document.getElementById("kindTabs");
  Object.keys(TAB_LABELS).forEach(function(kind){
    const btn = document.createElement("button");
    btn.textContent = TAB_LABELS[kind];
    if(kind === state.activeKind) btn.classList.add("active");
    btn.addEventListener("click", function(){
      state.activeKind = kind;
      Array.prototype.forEach.call(el.children, function(c){ c.classList.remove("active"); });
      btn.classList.add("active");
      renderFields();
      regeneratePreview();
    });
    el.appendChild(btn);
  });
}

let previewPlanet = null;
let previewBlackhole = null;

function clearPreview(){
  if(previewPlanet){
    if(previewPlanet.dbId) delete ctx.netBodies[previewPlanet.dbId];
    despawnLocalOnly(previewPlanet);
    previewPlanet = null;
  }
  if(previewBlackhole){
    const bh = previewBlackhole;
    ctx.scene.remove(bh.group);
    bh.core.geometry.dispose(); bh.core.material.dispose();
    bh.horizon.geometry.dispose(); bh.horizon.material.dispose();
    bh.disk.geometry.dispose(); bh.disk.material.dispose();
    bh.halo.material.dispose();
    removeItem(ctx.blackholes, bh);
    if(bh.dbId) delete ctx.netBodies[bh.dbId];
    previewBlackhole = null;
  }
}

function regeneratePreview(){
  clearPreview();
  if(state.activeKind === "blackhole"){
    const data = randomBlackHoleSpawnData();
    const row = {
      id: "preview-"+Math.random().toString(36).slice(2),
      radius: data.radius, max_life: data.maxLife, spawned_at: new Date().toISOString()
    };
    previewBlackhole = materializeBlackHole(row, new THREE.Vector3(0,0,0));
  } else {
    const type = CONTENT[state.activeKind];
    const data = randomPlanetSpawnData(type);
    const row = {
      id: "preview-"+Math.random().toString(36).slice(2),
      kind: data.kind, radius: data.radius, temp: data.temp,
      health: data.health, max_health: data.maxHealth, value_bonus: data.valueBonus,
      spawned_at: new Date().toISOString()
    };
    previewPlanet = materializePlanet(row, new THREE.Vector3(0,0,0), data.vel, 0);
  }
}

let regenTimer = null;
function scheduleRegen(){
  if(regenTimer) clearTimeout(regenTimer);
  regenTimer = setTimeout(regeneratePreview, 60);
}

const EXPORT_NAMES = {
  sun: "SUN", icePlanet: "ICE_PLANET", neutralPlanet: "NEUTRAL_PLANET",
  volcanicPlanet: "VOLCANIC_PLANET", comet: "COMET", meteoroid: "METEOROID",
  blackhole: "BLACKHOLE"
};

function downloadContent(){
  const header =
    "// Generated by editor.html — " + new Date().toISOString() + "\n" +
    "// Each section below is a ready-to-paste replacement for the\n" +
    "// `export const ... = {...}` block in the matching js/bodies/*.js file.\n";
  let body = "";
  Object.keys(CONTENT).forEach(function(key){
    body += "\n// ==== js/bodies/" + key + ".js ====\n";
    body += "export const " + EXPORT_NAMES[key] + " = " + JSON.stringify(CONTENT[key], null, 2) + ";\n";
  });
  const blob = new Blob([header + body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "content-export.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  document.getElementById("saveNote").textContent = "Downloaded content-export.txt (" + new Date().toLocaleTimeString() + ") — copy each section into its js/bodies/*.js file.";
}

function initEditorControls(){
  const dom = ctx.renderer.domElement;
  let dragging = false, lastX = 0, lastY = 0;
  dom.addEventListener("contextmenu", function(e){ e.preventDefault(); });
  dom.addEventListener("pointerdown", function(e){
    dragging = true; camState.autoSpin = false; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener("pointermove", function(e){
    if(!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    camState.az += dx*0.006*(settings.invertX ? -1 : 1);
    camState.pol = Math.max(0.2, Math.min(Math.PI-0.2, camState.pol - dy*0.006*(settings.invertY ? -1 : 1)));
  });
  window.addEventListener("pointerup", function(){ dragging = false; });
  dom.addEventListener("wheel", function(e){
    e.preventDefault();
    camState.radius = Math.max(2, Math.min(80, camState.radius + e.deltaY*0.01));
  }, { passive: false });
}

initScene();
initParticles();
initEditorControls();
camState.radius = 16;

// initScene() sized the canvas to the whole window (fine in-game, where the
// panel is just an overlay) — here the scene and side panel share the
// screen via flex, so the canvas must match #stage's actual box, not window.
function fitRendererToStage(){
  const stage = document.getElementById("stage");
  const w = stage.clientWidth, h = stage.clientHeight;
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(w, h);
}
fitRendererToStage();
window.addEventListener("resize", fitRendererToStage);

buildTabs();
renderFields();
regeneratePreview();

document.getElementById("rerollBtn").addEventListener("click", regeneratePreview);
document.getElementById("downloadBtn").addEventListener("click", downloadContent);

const clock = new THREE.Clock();
function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  updateCamera(dt);
  updateParticles(dt);
  updateBodies(dt);
  updateBlackHoles(dt);
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
