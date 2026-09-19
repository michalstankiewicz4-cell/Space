// Edytor parametrów generowania ciał niebieskich. Używa DOKŁADNIE tych
// samych funkcji co gra (materializePlanet/materializeBlackHole/updateBodies/
// updateBlackHoles) — podgląd jest więc gwarantowanie identyczny z tym, co
// zobaczą gracze, zamiast osobnej, potencjalnie rozjeżdżającej się kopii kodu.
import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { CONTENT } from "../content.js";
import { initScene } from "../scene/setup.js";
import { camState, updateCamera } from "../scene/controls.js";
import { initParticles, updateParticles } from "../fx/particles.js";
import {
  randomPlanetSpawnData, materializePlanet, despawnLocalOnly
} from "../world/bodies.js";
import { updateBodies } from "../world/bodies.js";
import { randomBlackHoleSpawnData, materializeBlackHole, updateBlackHoles } from "../world/blackholes.js";

const TAB_LABELS = {
  planet: "Planeta", sun: "Słońce", comet: "Kometa",
  meteoroid: "Meteoryt", blackhole: "Czarna dziura"
};

const FIELD_DEFS = {
  planet: [
    { path: ["planet","radiusMin"], label: "Promień min", min:0.2, max:5, step:0.05 },
    { path: ["planet","radiusMax"], label: "Promień maks", min:0.2, max:6, step:0.05 },
    { path: ["planet","tempRange"], label: "Zakres temperatury", min:0, max:1, step:0.01 },
    { path: ["planet","healthMult"], label: "Mnożnik zdrowia", min:1, max:60, step:1 },
    { path: ["planet","valueBonus"], label: "Bonus punktowy", min:0, max:100, step:1 },
    { path: ["planet","emissive"], label: "Jasność własna", min:0, max:1, step:0.01 },
    { special: "previewTemp", label: "Temperatura podglądu (-1 lód .. 1 lawa)", min:-1, max:1, step:0.01 },
    { path: ["neutralPlanet","tempThreshold"], label: "Próg \"neutralności\"", min:0, max:0.5, step:0.01 },
    { path: ["neutralPlanet","noiseScaleMin"], label: "Szum terenu: skala min", min:0.3, max:5, step:0.05 },
    { path: ["neutralPlanet","noiseScaleRange"], label: "Szum terenu: skala zakres", min:0, max:3, step:0.05 },
    { path: ["neutralPlanet","seaLevelMin"], label: "Poziom morza: min", min:-0.5, max:0.5, step:0.01 },
    { path: ["neutralPlanet","seaLevelRange"], label: "Poziom morza: zakres", min:0, max:0.5, step:0.01 },
    { path: ["neutralPlanet","octaves"], label: "Szum terenu: oktawy", min:1, max:8, step:1 }
  ],
  sun: [
    { path:["sun","radiusMin"], label:"Promień min", min:0.5, max:8, step:0.05 },
    { path:["sun","radiusMax"], label:"Promień maks", min:0.5, max:9, step:0.05 },
    { path:["sun","healthMult"], label:"Mnożnik zdrowia", min:1, max:80, step:1 },
    { path:["sun","valueBonus"], label:"Bonus punktowy", min:0, max:150, step:1 },
    { path:["sun","emissive"], label:"Jasność własna", min:0, max:1.5, step:0.01 },
    { path:["sun","rayCount"], label:"Liczba promieni", min:0, max:30, step:1 },
    { path:["sun","rayLengthLongMin"], label:"Długie promienie: min", min:0, max:6, step:0.05 },
    { path:["sun","rayLengthLongRange"], label:"Długie promienie: zakres", min:0, max:4, step:0.05 },
    { path:["sun","rayLengthShortMin"], label:"Krótkie promienie: min", min:0, max:4, step:0.05 },
    { path:["sun","rayLengthShortRange"], label:"Krótkie promienie: zakres", min:0, max:3, step:0.05 },
    { path:["sun","rayWidthMin"], label:"Szerokość promieni: min", min:0.02, max:1, step:0.01 },
    { path:["sun","rayWidthRange"], label:"Szerokość promieni: zakres", min:0, max:1, step:0.01 },
    { path:["sun","haloScale"], label:"Skala łuny", min:1, max:10, step:0.1 }
  ],
  comet: [
    { path:["comet","radiusMin"], label:"Promień min", min:0.1, max:2, step:0.02 },
    { path:["comet","radiusMax"], label:"Promień maks", min:0.1, max:2.5, step:0.02 },
    { path:["comet","healthMult"], label:"Mnożnik zdrowia", min:1, max:60, step:1 },
    { path:["comet","valueBonus"], label:"Bonus punktowy", min:0, max:100, step:1 },
    { path:["comet","emissive"], label:"Jasność własna", min:0, max:1, step:0.01 },
    { path:["comet","speedMin"], label:"Prędkość: min", min:0.2, max:10, step:0.1 },
    { path:["comet","speedRange"], label:"Prędkość: zakres", min:0, max:8, step:0.1 },
    { path:["comet","tailLengthMin"], label:"Warkocz: długość min", min:0, max:25, step:0.5 },
    { path:["comet","tailLengthRange"], label:"Warkocz: długość zakres", min:0, max:15, step:0.5 },
    { path:["comet","tailWidthMin"], label:"Warkocz: szerokość min", min:0.1, max:4, step:0.05 },
    { path:["comet","tailWidthRange"], label:"Warkocz: szerokość zakres", min:0, max:2, step:0.05 }
  ],
  meteoroid: [
    { path:["meteoroid","radiusMin"], label:"Promień min", min:0.05, max:1.5, step:0.02 },
    { path:["meteoroid","radiusMax"], label:"Promień maks", min:0.05, max:2, step:0.02 },
    { path:["meteoroid","tempRange"], label:"Zakres temperatury", min:0, max:1, step:0.01 },
    { path:["meteoroid","healthMult"], label:"Mnożnik zdrowia", min:1, max:40, step:1 },
    { path:["meteoroid","valueBonus"], label:"Bonus punktowy", min:0, max:60, step:1 },
    { path:["meteoroid","emissive"], label:"Jasność własna", min:0, max:1, step:0.01 }
  ],
  blackhole: [
    { path:["blackhole","radiusMin"], label:"Promień min", min:0.3, max:4, step:0.05 },
    { path:["blackhole","radiusRange"], label:"Promień zakres", min:0, max:3, step:0.05 },
    { path:["blackhole","lifeMin"], label:"Czas życia: min (s)", min:5, max:120, step:1 },
    { path:["blackhole","lifeRange"], label:"Czas życia: zakres (s)", min:0, max:100, step:1 },
    { path:["blackhole","firstSpawnMinS"], label:"Pierwszy spawn: min (s)", min:0, max:60, step:1 },
    { path:["blackhole","firstSpawnRangeS"], label:"Pierwszy spawn: zakres (s)", min:0, max:60, step:1 },
    { path:["blackhole","respawnMinS"], label:"Odstęp respawn: min (s)", min:1, max:180, step:1 },
    { path:["blackhole","respawnRangeS"], label:"Odstęp respawn: zakres (s)", min:0, max:120, step:1 },
    { path:["blackhole","fadeOutS"], label:"Czas zanikania (s)", min:0.1, max:10, step:0.1 }
  ]
};

const state = { activeKind: "planet", previewTemp: 0 };

function getByPath(path){ let o = CONTENT; for(const k of path) o = o[k]; return o; }
function setByPath(path, val){
  let o = CONTENT;
  for(let i=0;i<path.length-1;i++) o = o[path[i]];
  o[path[path.length-1]] = val;
}
function formatVal(v){ return Number.isInteger(v) ? String(v) : v.toFixed(2); }

function sectionTitle(text){
  const el = document.createElement("div");
  el.className = "section-title";
  el.textContent = text;
  return el;
}

function makeSliderField({ label, min, max, step, get, set }){
  const wrap = document.createElement("div");
  wrap.className = "field";
  const labelEl = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  const valueB = document.createElement("b");
  labelEl.appendChild(span);
  labelEl.appendChild(valueB);
  const input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.step = step;
  input.value = get();
  valueB.textContent = formatVal(get());
  input.addEventListener("input", function(){
    const v = parseFloat(input.value);
    set(v);
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

  el.appendChild(sectionTitle("Szanse spawnu (globalne)"));
  ["sun","comet","meteoroid"].forEach(function(k){
    el.appendChild(makeSliderField({
      label: "Szansa: " + TAB_LABELS[k],
      min: 0, max: 0.5, step: 0.01,
      get: function(){ return CONTENT.spawnWeights[k]; },
      set: function(v){ CONTENT.spawnWeights[k] = v; }
    }));
  });
  const remainder = Math.max(0, 1 - CONTENT.spawnWeights.sun - CONTENT.spawnWeights.comet - CONTENT.spawnWeights.meteoroid);
  const remEl = document.createElement("div");
  remEl.className = "field";
  remEl.innerHTML = '<label><span>Szansa: Planeta (reszta)</span><b>' + remainder.toFixed(2) + "</b></label>";
  el.appendChild(remEl);

  el.appendChild(sectionTitle(TAB_LABELS[state.activeKind]));
  FIELD_DEFS[state.activeKind].forEach(function(def){
    const isPreviewTemp = def.special === "previewTemp";
    el.appendChild(makeSliderField({
      label: def.label, min: def.min, max: def.max, step: def.step,
      get: isPreviewTemp ? function(){ return state.previewTemp; } : function(){ return getByPath(def.path); },
      set: isPreviewTemp ? function(v){ state.previewTemp = v; } : function(v){ setByPath(def.path, v); }
    }));
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
    const data = randomPlanetSpawnData(state.activeKind);
    if(state.activeKind === "planet") data.temp = state.previewTemp;
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

function downloadContent(){
  const header =
    "// Parametry generowania ciał niebieskich — jedno miejsce, z którego\n" +
    "// korzysta zarówno gra (js/world/*), jak i edytor (editor.html).\n" +
    "// Wygenerowano edytorem (editor.html) — " + new Date().toISOString() + "\n";
  const body = "export const CONTENT = " + JSON.stringify(CONTENT, null, 2) + ";\n";
  const blob = new Blob([header + body], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "content.js";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  document.getElementById("saveNote").textContent = "Pobrano content.js (" + new Date().toLocaleTimeString() + ") — podmień nim js/content.js w projekcie.";
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
    camState.az -= dx*0.006;
    camState.pol = Math.max(0.2, Math.min(Math.PI-0.2, camState.pol - dy*0.006));
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

// initScene() rozmiarowal canvas na cale okno (tak jak w grze, gdzie panel
// jest tylko nakladka) - tutaj scena i panel dziela ekran przez flex, wiec
// trzeba dopasowac canvas do faktycznego obszaru #stage, nie do window.
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
