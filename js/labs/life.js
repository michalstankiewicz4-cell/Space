// The life lab's own script (labs/life.html): a studio floor, LifeKit's
// creatures on it, their body's parameters and their gaits.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const LK = window.LifeKit;
const view = $("view");
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = ShipKit.makeEnvironment(renderer);
const BG = new THREE.Color(0x10141d);
scene.background = BG; scene.fog = new THREE.Fog(BG, 14, 60);
const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 400);
camera.position.set(2.6, 1.55, 3.4);
const controls = new THREE.OrbitControls(camera, view);
controls.enableDamping = true; controls.maxPolarAngle = 1.62; controls.minDistance = 0.4; controls.maxDistance = 30;
controls.target.set(0, 1, 0);
// a studio: a warm key with shadows, a cool rim from behind, a soft fill
const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.4, bottom: -0.4, near: 0.5, far: 20 });
const rim = new THREE.DirectionalLight(0x9fb8ff, 1.3);
const fill = new THREE.HemisphereLight(0xc9d4ff, 0x3a3128, 0.55);
scene.add(key, key.target, rim, rim.target, fill);

// ---------- the floor: a grid of metres (every fifth line stronger) ----------
const floorTex = (() => {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
  x.fillStyle = "#2a2f3a"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; x.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  for (let k = 0; k <= 5; k++) {
    x.strokeStyle = k === 0 || k === 5 ? "rgba(143,164,255,0.55)" : "rgba(143,164,255,0.22)"; x.lineWidth = k === 0 || k === 5 ? 3 : 1.5;
    const p = k * S / 5; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.moveTo(0, p); x.lineTo(S, p); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  t.repeat.set(40, 40); return t;   // 200 m / 40 = one tile every 5 m: lines every metre
})();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------- the scale bar: 2 m, every 10 cm marked ----------
const scaleBar = (() => {
  const g = new THREE.Group(), c = document.createElement("canvas"); c.width = 64; c.height = 1024; const x = c.getContext("2d");
  x.fillStyle = "#e9edf7"; x.fillRect(0, 0, 64, 1024);
  for (let i = 0; i < 20; i++) { x.fillStyle = i % 2 ? "#e9edf7" : "#f2b84b"; x.fillRect(0, 1024 - (i + 1) * 51.2, 64, 51.2); }
  for (let i = 0; i <= 20; i++) { x.fillStyle = "#11141c"; x.fillRect(0, 1024 - i * 51.2 - 1, i % 5 ? 30 : 64, 2); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2, 0.03), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  bar.position.y = 1; bar.castShadow = true; g.add(bar);
  [0.5, 1, 1.5, 2].forEach((h) => {
    const lc = document.createElement("canvas"); lc.width = 128; lc.height = 48; const lx = lc.getContext("2d");
    lx.fillStyle = "#e9edf7"; lx.font = "600 30px sans-serif"; lx.fillText(h.toFixed(1) + " m", 6, 34);
    const lt = new THREE.CanvasTexture(lc); lt.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, depthWrite: false })); sp.scale.set(0.2, 0.075, 1); sp.position.set(0.14, h, 0); g.add(sp);
  });
  g.position.set(-0.75, 0, 0); scene.add(g); return g;
})();

// ---------- the creature ----------
const state = { id: LK.CREATURES[0].id, params: {}, gait: "idle", speed: 1.4, path: "inplace", bones: false, wire: false, scale: true,
  face: {}, lively: true, talk: false, layers: {}, timeScale: 1 };
let cre = null, helper = null;
const stage = new THREE.Group(); scene.add(stage);
const travel = { a: 0, R: 4 };
function load() {
  if (cre) cre.dispose();
  if (helper) { scene.remove(helper); helper = null; }
  const def = LK.CREATURES.find((d) => d.id === state.id);
  cre = LK.build(state.id, state.params, { detail: 1 });
  stage.add(cre.group);
  $("hudTitle").textContent = def.name.toUpperCase();
  $("blurb").textContent = def.blurb;
  [...$("creTabs").children].forEach((b) => b.classList.toggle("on", b.dataset.id === state.id));
  applyView();
  showStats();
  buildFace();
}
// ---------- the face: expressions (morph targets), presets, LIVELY / TALK ----------
const FACE_PRESETS = {
  NEUTRAL: {},
  SMILE: { mouthSmileLeft: 0.85, mouthSmileRight: 0.85, eyeBlinkLeft: 0.12, eyeBlinkRight: 0.12 },
  SURPRISE: { jawOpen: 0.55, browInnerUp: 0.9, eyeWideLeft: 0.85, eyeWideRight: 0.85 },
  ANGRY: { browDownLeft: 0.9, browDownRight: 0.9, mouthFrownLeft: 0.45, mouthFrownRight: 0.45 },
  SAD: { browInnerUp: 0.75, mouthFrownLeft: 0.7, mouthFrownRight: 0.7 },
  PUCKER: { mouthPucker: 0.9, cheekPuff: 0.5 },
};
const FACE_NAMES = { eyeBlinkLeft: "Blink, left", eyeBlinkRight: "Blink, right", eyeWideLeft: "Eye wide, left", eyeWideRight: "Eye wide, right",
  jawOpen: "Jaw open", mouthSmileLeft: "Smile, left", mouthSmileRight: "Smile, right", mouthFrownLeft: "Frown, left", mouthFrownRight: "Frown, right",
  mouthPucker: "Pucker", browInnerUp: "Brows up (inner)", browDownLeft: "Brow down, left", browDownRight: "Brow down, right", cheekPuff: "Cheeks puffed" };
function buildFace() {
  const box = $("faceSliders"); box.textContent = "";
  const f = cre.face;
  $("facePresets").parentElement && [$("facePresets"), box, $("btnLively").parentElement].forEach((el) => { el.style.display = f ? "" : "none"; });
  if (!f) return;
  f.names.forEach((k) => {
    const l = document.createElement("label"); l.className = "sl"; l.innerHTML = "<span></span><b></b>"; l.firstChild.textContent = FACE_NAMES[k] || k;
    const sl = document.createElement("input"); sl.type = "range"; sl.min = 0; sl.max = 1; sl.step = 0.01; sl.value = state.face[k] || 0; sl.dataset.k = k;
    const show = () => { l.lastChild.textContent = Math.round(sl.value * 100) + "%"; LabKit.paintSlider(sl); };
    sl.addEventListener("input", () => { state.face[k] = +sl.value; f.set(k, +sl.value); show(); });
    f.set(k, +sl.value); show(); box.append(l, sl);
  });
}
Object.keys(FACE_PRESETS).forEach((name) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = name;
  b.addEventListener("click", () => {
    state.face = Object.assign({}, FACE_PRESETS[name]);
    if (cre.face) cre.face.names.forEach((k) => cre.face.set(k, state.face[k] || 0));
    buildFace();
  });
  $("facePresets").appendChild(b);
});
$("btnLively").addEventListener("click", () => { state.lively = !state.lively; $("btnLively").classList.toggle("on", state.lively); });
$("btnTalk").addEventListener("click", () => { state.talk = !state.talk; $("btnTalk").classList.toggle("on", state.talk); });
$("btnClose").addEventListener("click", () => {
  if (!cre.face) return;
  const p = new THREE.Vector3(); cre.face.group.getWorldPosition(p);
  controls.target.copy(p); camera.position.set(p.x + 0.14, p.y + 0.02, p.z + 0.42);
});
function showStats() {
  const st = ShipKit.modelStats(cre.group);
  let bones = 0; cre.group.traverse((o) => { if (o.isBone) bones++; });
  const rows = [["Height", cre.params.height ? cre.params.height.toFixed(2) + " m" : "–"], ["Triangles", st.triangles.toLocaleString("en-US")], ["Meshes", st.meshes], ["Bones", bones], ["Materials", st.materials.size]];
  $("stats").textContent = "";
  rows.forEach(([k, v]) => { const r = document.createElement("div"); r.className = "row"; const a = document.createElement("span"); a.textContent = k; const b = document.createElement("b"); b.textContent = v; r.append(a, b); $("stats").appendChild(r); });
}
function applyView() {
  cre.group.traverse((o) => { if (o.isMesh && o.material) o.material.wireframe = state.wire; });
  if (helper) { scene.remove(helper); helper = null; }
  if (state.bones) {
    helper = new THREE.SkeletonHelper(cre.group); helper.material.depthTest = false; helper.material.transparent = true; helper.renderOrder = 10;
    scene.add(helper);
  }
  scaleBar.visible = state.scale && state.path === "inplace";
}

// ---------- the panels ----------
LK.CREATURES.forEach((d) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = d.name.toUpperCase(); b.dataset.id = d.id;
  b.addEventListener("click", () => { state.id = d.id; state.params = {}; buildParams(); load(); });
  $("creTabs").appendChild(b);
});
let rebuildTimer = 0;
const rebuildSoon = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(load, 60); };
function buildParams() {
  const def = LK.CREATURES.find((d) => d.id === state.id), box = $("params"); box.textContent = "";
  def.params.forEach((q) => {
    if (state.params[q.key] == null) state.params[q.key] = q.value;
    if (q.choices) {
      const r = document.createElement("div"); r.className = "prow";
      r.innerHTML = "<span></span><select class='lab'></select>"; r.firstChild.textContent = q.name;
      const sel = r.querySelector("select");
      q.choices.forEach((c, i) => { const o = document.createElement("option"); o.value = i; o.textContent = c; sel.appendChild(o); });
      sel.value = state.params[q.key];
      sel.addEventListener("change", () => { state.params[q.key] = +sel.value; load(); });
      box.appendChild(r);
    } else if (q.seed) {
      const r = document.createElement("div"); r.className = "seedRow";
      r.innerHTML = "<span></span><input class='lab' type='number' min='1' step='1'><button class='tBtn' title='Another face'>🎲</button>"; r.firstChild.textContent = q.name;
      const inp = r.querySelector("input"); inp.value = state.params[q.key];
      inp.addEventListener("change", () => { state.params[q.key] = Math.max(1, Math.round(+inp.value) || 1); load(); });
      r.querySelector("button").addEventListener("click", () => { inp.value = state.params[q.key] = Math.floor(Math.random() * 9999) + 1; load(); });
      box.appendChild(r);
    } else {
      const l = document.createElement("label"); l.className = "sl"; l.innerHTML = "<span></span><b></b>"; l.firstChild.textContent = q.name;
      const sl = document.createElement("input"); sl.type = "range"; sl.min = q.min; sl.max = q.max; sl.step = q.step; sl.value = state.params[q.key];
      const show = () => { l.lastChild.textContent = q.fmt ? q.fmt(+sl.value) : sl.value; LabKit.paintSlider(sl); };
      sl.addEventListener("input", () => { state.params[q.key] = +sl.value; show(); rebuildSoon(); });
      show(); box.append(l, sl);
    }
  });
}
const GAIT_SPEED = { idle: 0, walk: 1.4, run: 3.6, tpose: 0 };
[...$("gaits").children].forEach((b) => b.addEventListener("click", () => {
  state.gait = b.dataset.g;
  [...$("gaits").children].forEach((x) => x.classList.toggle("on", x === b));
  if (GAIT_SPEED[state.gait]) { state.speed = GAIT_SPEED[state.gait]; $("spSlider").value = state.speed; }
  showSpeed();
}));
function showSpeed() {
  const moving = state.gait === "walk" || state.gait === "run";
  $("spVal").textContent = moving ? state.speed.toFixed(1) + " m/s · " + Math.round(state.speed * 3.6) + " km/h" : "–";
  LabKit.paintSlider($("spSlider"));
}
$("spSlider").addEventListener("input", () => { state.speed = +$("spSlider").value; showSpeed(); });
$("tsSlider").addEventListener("input", () => { state.timeScale = +$("tsSlider").value; $("tsVal").textContent = Math.round(state.timeScale * 100) + "%"; LabKit.paintSlider($("tsSlider")); });
LabKit.paintSlider($("tsSlider"));
// the layers (move/walk.js LAYERS): added on top of the gait, each with a weight
const LAYER_NAMES = { sneak: "Sneak", sad: "Sad", angry: "Angry", nod: "Nod", shake: "Shake the head", wave: "Wave", look: "Look around" };
(LK.MOVES.walk.LAYERS || []).forEach((k) => {
  const l = document.createElement("label"); l.className = "sl"; l.innerHTML = "<span></span><b>0%</b>"; l.firstChild.textContent = LAYER_NAMES[k] || k;
  const sl = document.createElement("input"); sl.type = "range"; sl.min = 0; sl.max = 1; sl.step = 0.01; sl.value = 0;
  sl.addEventListener("input", () => { state.layers[k] = +sl.value; l.lastChild.textContent = Math.round(sl.value * 100) + "%"; LabKit.paintSlider(sl); });
  LabKit.paintSlider(sl); $("layerSliders").append(l, sl);
});
const setPath = (p) => { state.path = p; $("pInPlace").classList.toggle("on", p === "inplace"); $("pCircle").classList.toggle("on", p === "circle"); if (p === "inplace") { stage.position.set(0, 0, 0); stage.rotation.y = 0; } applyView(); };
$("pInPlace").addEventListener("click", () => setPath("inplace"));
$("pCircle").addEventListener("click", () => setPath("circle"));
const flip = (id, key) => $(id).addEventListener("click", () => { state[key] = !state[key]; $(id).classList.toggle("on", state[key]); applyView(); });
flip("btnBones", "bones"); flip("btnWire", "wire"); flip("btnScale", "scale");

// ---------- the loop ----------
LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 6);
const perf = LabKit.perfCounters(renderer);
renderer.info.autoReset = false;
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3);
}
window.addEventListener("resize", resize);
const clock = new THREE.Clock(), prev = new THREE.Vector3(), now = new THREE.Vector3();
let t = 0;
function frame() {
  const t0 = performance.now(), dt = Math.min(clock.getDelta(), 0.05) * state.timeScale;
  t += dt;
  const moving = state.gait === "walk" || state.gait === "run";
  cre.animate(t, dt, { gait: state.gait, speed: state.speed, lively: state.lively, talk: state.talk, layers: state.layers });
  if (moving && state.path === "inplace") {
    // the ground slides back under the feet (one texture tile is 5 m)
    floorTex.offset.y -= state.speed * dt / 5;
  } else if (moving) {
    prev.copy(stage.position);
    travel.a += state.speed * dt / travel.R;
    stage.position.set(Math.sin(travel.a) * travel.R - 0, 0, Math.cos(travel.a) * travel.R - travel.R);
    stage.rotation.y = travel.a + Math.PI / 2;
    now.copy(stage.position).sub(prev);
    camera.position.add(now); controls.target.add(now);
  }
  const c = stage.position;
  key.position.set(c.x + 2.5, 4.5, c.z + 3); key.target.position.set(c.x, 0.9, c.z);
  rim.position.set(c.x - 2, 3, c.z - 4); rim.target.position.set(c.x, 1, c.z);
  controls.update();
  renderer.info.reset();
  renderer.render(scene, camera);
  perf.update(performance.now(), performance.now() - t0);
  requestAnimationFrame(frame);
}
buildParams(); resize(); load(); showSpeed();
frame();
window.lifeLab = { state, get creature() { return cre; }, camera, controls, load, setPath, scene };
})();
