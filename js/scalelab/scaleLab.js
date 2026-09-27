// Scale lab (scale.html): every object of the game in one row at its
// in-game size, over a ruler in world units (docs/scale.md). Every number
// comes from the game's own modules — none are copied here — so the row
// always shows the game as it is. Standalone dev tool, not part of the
// game bundle (no version bump, not in js/versionCheck.js).
import { SOLAR_BODY_BY_SLOT } from "../world/solarSystem.js";
import { SHIP_MODEL_LENGTH, DRONE_MODEL_LENGTH, STATION_MODEL_LENGTH, STATION_PICK_RADIUS, STATION_FIELD_RADIUS,
  STATION_START_DAMAGE, EAT_ORBIT_GAP, DRONE_DOCK_GAP, BLACKHOLE_GRAVITY_RADIUS_MULT, BLACKHOLE_KILL_RADIUS_MULT } from "../config.js";
import { COMET } from "../bodies/comet.js";

const COLORS = { drawn: 0xffffff, game: 0xf8bb56, eat: 0x4fe3c6, dock: 0xb48cf0, kill: 0xff5a5f, pull: 0xff9a45, field: 0x7ee081, ruler: 0x3c55d8 };
const SUN_DIR = new THREE.Vector3(-0.6, 0.35, 0.75).normalize();   // one light for the whole row, from the front left
const PLANET_SLOTS = [1, 2, 3, 5, 6, 7];

// ---------- the row: what's in it, from the game's data ----------
function bodyName(slot){
  const ref = BodyKit.GAME_BODIES[slot];
  const g = BodyKit.GROUPS.find(function(x){ return x.id === ref.groupId; });
  return g.bodies.find(function(b){ return b.id === ref.bodyId; }).name;
}

function bodyItem(slot){
  const b = SOLAR_BODY_BY_SLOT[slot];
  const it = { type: "body", slot: slot, kind: b.kind, name: bodyName(slot), radius: b.radius, size: b.size, rings: [] };
  it.rings.push({ r: b.radius, color: COLORS.drawn });
  if(b.size !== b.radius) it.rings.push({ r: b.size, color: COLORS.game, dashed: true });
  if(b.kind === "blackhole"){
    it.rings.push({ r: b.radius * BLACKHOLE_KILL_RADIUS_MULT, color: COLORS.kill });
    it.rings.push({ r: b.radius * BLACKHOLE_GRAVITY_RADIUS_MULT, color: COLORS.pull, dashed: true });
    it.info = ["radius " + fmt(b.radius), "no return " + fmt(b.radius * BLACKHOLE_KILL_RADIUS_MULT) + " · pull " + fmt(b.radius * BLACKHOLE_GRAVITY_RADIUS_MULT)];
  } else {
    it.rings.push({ r: b.radius + EAT_ORBIT_GAP, color: COLORS.eat });
    it.rings.push({ r: b.radius + DRONE_DOCK_GAP, color: COLORS.dock, dashed: true });
    it.info = ["radius " + fmt(b.radius) + (b.size !== b.radius ? " (gameplay " + fmt(b.size) + ")" : ""),
      "eats at " + fmt(b.radius + EAT_ORBIT_GAP) + " · dock " + fmt(b.radius + DRONE_DOCK_GAP)];
  }
  return it;
}

function buildItems(){
  const items = [bodyItem(0)];
  PLANET_SLOTS.slice().sort(function(a, b){ return SOLAR_BODY_BY_SLOT[b].radius - SOLAR_BODY_BY_SLOT[a].radius; })
    .forEach(function(s){ items.push(bodyItem(s)); });
  items.push(bodyItem(9), bodyItem(8));
  const cr = COMET.radiusMax;
  items.push({ type: "comet", name: "COMET", radius: cr,
    rings: [{ r: cr, color: COLORS.drawn }, { r: COMET.radiusMin, color: COLORS.drawn, dashed: true },
      { r: cr + EAT_ORBIT_GAP, color: COLORS.eat }, { r: cr + DRONE_DOCK_GAP, color: COLORS.dock, dashed: true }],
    info: ["radius " + fmt(COMET.radiusMin) + "–" + fmt(cr) + " (random)", "eats at " + fmt(cr + EAT_ORBIT_GAP)] });
  items.push({ type: "ship", id: "haven", name: "ST-04 HAVEN", length: STATION_MODEL_LENGTH, radius: STATION_MODEL_LENGTH / 2, tilt: 0.45,
    rings: [{ r: STATION_PICK_RADIUS, color: COLORS.drawn }, { r: STATION_FIELD_RADIUS, color: COLORS.field, dashed: true }],
    info: ["length " + fmt(STATION_MODEL_LENGTH) + " · click " + fmt(STATION_PICK_RADIUS), "field (no gravity) " + fmt(STATION_FIELD_RADIUS)] });
  items.push({ type: "ship", id: "scribe", name: "DR-01 SCRIBE", length: DRONE_MODEL_LENGTH, radius: DRONE_MODEL_LENGTH / 2,
    rings: [{ r: DRONE_MODEL_LENGTH / 2, color: COLORS.drawn }], info: ["length " + fmt(DRONE_MODEL_LENGTH)] });
  items.push({ type: "ship", id: "swarmer", name: "SW-01 SWARMER", length: SHIP_MODEL_LENGTH, radius: SHIP_MODEL_LENGTH / 2,
    rings: [{ r: SHIP_MODEL_LENGTH / 2, color: COLORS.drawn }], info: ["length " + fmt(SHIP_MODEL_LENGTH)] });

  // side by side: each takes the room of its widest ring, plus a gap
  let x = 0;
  items.forEach(function(it){
    it.extent = Math.max.apply(null, it.rings.map(function(r){ return r.r; }).concat([it.radius]));
    const gap = Math.max(0.6, it.extent * 0.15);
    it.x = x + it.extent;
    x = it.x + it.extent + gap;
  });
  return items;
}

function fmt(v){ return (Math.round(v * 100) / 100).toString(); }

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;           // the game's pipeline (scene/setup.js)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x03040a, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = ShipKit.makeEnvironment(renderer);
scene.add(new THREE.AmbientLight(0x8892b0, 0.55));
const sunLight = new THREE.DirectionalLight(0xbfe9ff, 1.3);
sunLight.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(sunLight);

// orthographic: no perspective, so sizes compare exactly at any spot
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
camera.position.set(0, 0, 100);
const view = { cx: 0, cy: 0, unitsPerPx: 0.1 };
function applyView(){
  const w = window.innerWidth, h = window.innerHeight;
  camera.left = view.cx - w / 2 * view.unitsPerPx; camera.right = view.cx + w / 2 * view.unitsPerPx;
  camera.top = view.cy + h / 2 * view.unitsPerPx; camera.bottom = view.cy - h / 2 * view.unitsPerPx;
  camera.updateProjectionMatrix();
}

const items = buildItems();
const rowEnd = items[items.length - 1].x + items[items.length - 1].extent;
const maxExtent = Math.max.apply(null, items.map(function(it){ return it.extent; }));
const rulerY = -maxExtent - 1.5;

// ---------- models (the game's kits) ----------
let detailHigh = false;
const modelsRoot = new THREE.Group();
scene.add(modelsRoot);
let live = [];   // { update(t, dt) }

function buildModels(){
  live.forEach(function(l){ l.dispose(); });
  live = [];
  items.forEach(function(it){
    if(it.type === "body" || it.type === "comet"){
      const ref = it.type === "comet" ? BodyKit.GAME_KINDS.comet : BodyKit.GAME_BODIES[it.slot];
      const body = BodyKit.buildBody(ref.groupId, ref.bodyId, { detail: (detailHigh ? 1 : 0.35) * BodyKit.GAME_DETAIL_SCALE });
      body.setRadius(it.radius);
      body.setOctaves(BodyKit.QUALITY_OCTAVES[detailHigh ? 3 : 0]);
      body.group.position.set(it.x, 0, 0);
      modelsRoot.add(body.group);
      // a comet's tail points away from the light, as in the game
      const opts = { sunDir: SUN_DIR, lights: [], velocity: new THREE.Vector3(1, 0, 0), activity: 1 };
      live.push({ update: function(t, dt){ body.update(t, dt, opts); }, dispose: function(){ BodyKit.disposeBody(body); } });
    } else {
      const model = ShipKit.buildShipModel(it.id, { detail: detailHigh ? 1 : 0.2, merge: true, fxRoot: modelsRoot });
      const holder = ShipKit.makeGameHolder(model, it.length);
      holder.rotation.y = Math.PI / 2;          // side view: nose to +X
      if(it.tilt) holder.rotation.z = it.tilt;  // the station's ring a little open
      holder.position.set(it.x, 0, 0);
      if(it.id === "haven") model.setDamage(STATION_START_DAMAGE);
      modelsRoot.add(holder);
      live.push({ update: function(t, dt){ model.update(t, dt, { power: 0.3, particles: false }); },
        dispose: function(){ modelsRoot.remove(holder); ShipKit.disposeShipModel(model); } });
    }
  });
}

// ---------- outlines ----------
const outlinesRoot = new THREE.Group();
scene.add(outlinesRoot);
const lineMats = {};
function lineMat(color, dashed){
  const key = color + (dashed ? "d" : "");
  if(!lineMats[key]) lineMats[key] = dashed
    ? new THREE.LineDashedMaterial({ color: color, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9, toneMapped: false, depthTest: false })
    : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.9, toneMapped: false, depthTest: false });
  return lineMats[key];
}
function circle(x, r, color, dashed){
  const pts = [];
  for(let i = 0; i <= 160; i++){ const a = i / 160 * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * r, Math.sin(a) * r, 0)); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color, dashed));
  if(dashed) line.computeLineDistances();
  line.renderOrder = 10;
  return line;
}
function segment(a, b, color){
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat(color, false));
  line.renderOrder = 10;
  return line;
}
items.forEach(function(it){
  it.rings.forEach(function(r){ outlinesRoot.add(circle(it.x, r.r, r.color, r.dashed)); });
  // its width on the ruler
  outlinesRoot.add(segment(new THREE.Vector3(it.x - it.radius, rulerY + 0.6, 0), new THREE.Vector3(it.x + it.radius, rulerY + 0.6, 0), COLORS.drawn));
});

// ---------- ruler (world units) ----------
const rulerRoot = new THREE.Group();
scene.add(rulerRoot);
const rulerLen = Math.ceil(rowEnd);
rulerRoot.add(segment(new THREE.Vector3(0, rulerY, 0), new THREE.Vector3(rulerLen, rulerY, 0), COLORS.ruler));
const tickPts = [];
for(let u = 0; u <= rulerLen; u++){
  const h = u % 10 === 0 ? 0.9 : u % 5 === 0 ? 0.55 : 0.3;
  tickPts.push(new THREE.Vector3(u, rulerY, 0), new THREE.Vector3(u, rulerY - h, 0));
}
const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), lineMat(COLORS.ruler, false));
rulerRoot.add(ticks);
// fine ticks every 0.1 unit — only worth drawing once zoomed in on the small units
const finePts = [];
for(let u = 0; u < rulerLen; u += 0.1) finePts.push(new THREE.Vector3(u, rulerY, 0), new THREE.Vector3(u, rulerY - 0.12, 0));
const fineTicks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(finePts), lineMat(COLORS.ruler, false));
rulerRoot.add(fineTicks);

// ---------- labels (HTML over the canvas) ----------
const labelsEl = document.getElementById("labels");
items.forEach(function(it){
  it.el = document.createElement("div");
  it.el.className = "lbl";
  const b = document.createElement("b"); b.textContent = it.name; it.el.appendChild(b);
  it.infoEls = it.info.map(function(line){ const s = document.createElement("span"); s.textContent = line; it.el.appendChild(s); return s; });
  labelsEl.appendChild(it.el);
});
const tickEls = [];
function tickLabel(i){
  if(!tickEls[i]){ const e = document.createElement("div"); e.className = "tick"; labelsEl.appendChild(e); tickEls[i] = e; }
  return tickEls[i];
}
function toScreen(x, y){
  return { x: (x - camera.left) / view.unitsPerPx, y: (camera.top - y) / view.unitsPerPx };
}
const scaleBarText = document.querySelector("#scaleBar span"), scaleBarLine = document.querySelector("#scaleBar div");
function placeLabels(){
  items.forEach(function(it, i){
    const top = toScreen(it.x, Math.max(it.radius, Math.min(it.extent, it.radius * 1.4)));
    const slotPx = it.extent * 2 / view.unitsPerPx;     // the room it has in the row, on screen
    it.el.style.left = top.x + "px";
    // 8 px above it (crowded small ones: every other name a line higher),
    // never under the top bar
    const y = top.y - 8 - (slotPx < 110 && i % 2 ? 18 : 0);
    it.el.style.top = Math.max(56 + it.el.offsetHeight, y) + "px";
    it.el.style.display = top.x < -200 || top.x > window.innerWidth + 200 ? "none" : "";
    // numbers only when there's room for them
    it.infoEls.forEach(function(s){ s.style.display = slotPx > 170 ? "" : "none"; });
  });
  // the scale bar: the longest round length that fits in ~160 px
  const lengths = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  let len = lengths[0];
  lengths.forEach(function(l){ if(l / view.unitsPerPx <= 160) len = l; });
  scaleBarLine.style.width = (len / view.unitsPerPx) + "px";
  scaleBarText.textContent = len + (len === 1 ? " unit" : " units");
  // ruler numbers: a step that keeps them ~70 px apart
  const steps = [0.1, 0.5, 1, 5, 10, 50];
  const step = steps.find(function(s){ return s / view.unitsPerPx >= 70; }) || 100;
  let n = 0;
  const from = Math.max(0, Math.floor(camera.left / step) * step), to = Math.min(rulerLen, camera.right);
  for(let u = from; u <= to && n < 200; u += step){
    const p = toScreen(u, rulerY - 0.9);
    const e = tickLabel(n++);
    e.style.display = "";
    e.style.left = p.x + "px"; e.style.top = p.y + "px";
    e.textContent = step < 1 ? u.toFixed(1) : String(Math.round(u));
  }
  for(; n < tickEls.length; n++) tickEls[n].style.display = "none";
  fineTicks.visible = view.unitsPerPx < 0.02;
}

// ---------- controls: zoom at the cursor, drag to pan, double-click to fit ----------
function fit(x0, x1){
  const w = window.innerWidth, h = window.innerHeight - 60;
  const halfH = Math.max(maxExtent, 2) + 3;
  view.unitsPerPx = Math.max((x1 - x0) * 1.08 / w, (x1 - x0) > 20 ? halfH * 2 / h : 0);
  view.cx = (x0 + x1) / 2;
  view.cy = (x1 - x0) > 20 ? (rulerY - 1.5 + maxExtent) / 2 : 0;
  applyView();
}
function fitItem(it){
  const w = window.innerWidth, h = window.innerHeight - 60;
  const r = it.extent * 1.5;      // room for its label above
  view.unitsPerPx = Math.max(r * 2 / w, r * 2 / h);
  view.cx = it.x; view.cy = 0;
  applyView();
}
const canvas = renderer.domElement;
canvas.addEventListener("wheel", function(e){
  e.preventDefault();
  const k = Math.exp(e.deltaY * 0.0015);
  const wx = camera.left + e.clientX * view.unitsPerPx, wy = camera.top - e.clientY * view.unitsPerPx;
  view.unitsPerPx = Math.max(0.0005, Math.min(1, view.unitsPerPx * k));
  view.cx = wx - (e.clientX - window.innerWidth / 2) * view.unitsPerPx;
  view.cy = wy + (e.clientY - window.innerHeight / 2) * view.unitsPerPx;
  applyView();
}, { passive: false });
let drag = null;
canvas.addEventListener("pointerdown", function(e){ drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", function(e){
  if(!drag) return;
  view.cx = drag.cx - (e.clientX - drag.x) * view.unitsPerPx;
  view.cy = drag.cy + (e.clientY - drag.y) * view.unitsPerPx;
  applyView();
});
canvas.addEventListener("pointerup", function(){ drag = null; });
canvas.addEventListener("dblclick", function(e){
  const wx = camera.left + e.clientX * view.unitsPerPx;
  const it = items.find(function(i){ return Math.abs(wx - i.x) <= i.extent; });
  if(it) fitItem(it);
});
window.addEventListener("resize", function(){ renderer.setSize(window.innerWidth, window.innerHeight); applyView(); });

// ---------- the bar ----------
function toggle(id, fn){
  const b = document.getElementById(id);
  b.addEventListener("click", function(){ b.classList.toggle("on"); fn(b.classList.contains("on"), b); });
}
toggle("btnModels", function(on){ modelsRoot.visible = on; });
toggle("btnOutlines", function(on){ outlinesRoot.visible = on; });
toggle("btnDetail", function(on, b){ detailHigh = on; b.textContent = "Detail: " + (on ? "high" : "low"); buildModels(); });
document.getElementById("btnFit").addEventListener("click", function(){ fit(0, rowEnd); });

// ---------- loop ----------
buildModels();
fit(0, rowEnd);
const clock = new THREE.Clock();
const fpsEl = document.getElementById("fps");
let t = 0, frames = 0, fpsT = 0;
function frame(){
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  live.forEach(function(l){ l.update(t, dt); });
  renderer.render(scene, camera);
  placeLabels();
  frames++; fpsT += dt;
  if(fpsT >= 0.5){
    fpsEl.textContent = Math.round(frames / fpsT) + " FPS · " + renderer.info.render.triangles.toLocaleString() + " triangles";
    frames = 0; fpsT = 0;
  }
  requestAnimationFrame(frame);
}
frame();
