import { t, getLang, onLangChange } from "../../i18n.js";
import { keysAllowed } from "../hud/uiMode.js";
import { createGalaxyRenderer, SUN_KPC, LY_PER_KPC } from "../../galaxy/galaxyRender.js";

// The galaxy map (key M): the Milky Way from above (galaxy/galaxyRender.js,
// a WebGL shader in its own canvas) under an SVG overlay — distance rings,
// the arms' names, the Galactic Centre and the starting system. Scroll
// zooms around the pointer, drag moves, the buttons zoom / fly to the start
// / show the whole galaxy. Rendered only when the view changes. Lengths in
// kpc; the view's scale is kpc per layout px (the window is CSS-scaled).
const NS = "http://www.w3.org/2000/svg";
const K = 0.2217, R0 = 4.6;                       // the arms' pitch and start radius (galaxyRender.js)
const ARMS = [                                     // [i18n key, start angle, label at radius, kpc offset outward]
  ["perseus", 1.0996, 14.0], ["scutum", -2.0420, 12.8], ["sagittarius", 2.9496, 9.2], ["norma", -0.1920, 14.6]
];
const MIN_SCALE = 0.0025, MAX_SCALE = 0.08;
const WHOLE = { cx: 0, cy: -1.5, kpcPerPx: 0.036 };
const START = { cx: SUN_KPC.x, cy: SUN_KPC.y, kpcPerPx: 0.006 };

let win, body, canvas, svg, renderer = null, failed = false;
const view = { cx: WHOLE.cx, cy: WHOLE.cy, kpcPerPx: WHOLE.kpcPerPx };
let anim = null, frameQueued = false;

export function isGalaxyOpen(){ return !!win && !win.classList.contains("hidden"); }

export function openGalaxy(){
  win.classList.remove("hidden");
  if(!renderer && !failed){
    try{ renderer = createGalaxyRenderer(canvas); }catch(e){ renderer = null; }
    if(!renderer){ failed = true; document.getElementById("galaxyFail").classList.remove("hidden"); }
  }
  redraw();
}
export function closeGalaxy(){ win.classList.add("hidden"); anim = null; }

function size(){ return { w: body.clientWidth, h: body.clientHeight }; }
function toScreen(x, y){
  const s = size();
  return [s.w / 2 + (x - view.cx) / view.kpcPerPx, s.h / 2 - (y - view.cy) / view.kpcPerPx];
}
function clampView(){
  view.kpcPerPx = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.kpcPerPx));
  view.cx = Math.max(-25, Math.min(25, view.cx));
  view.cy = Math.max(-25, Math.min(25, view.cy));
}

// One render per animation frame at most.
function redraw(){
  if(frameQueued || !isGalaxyOpen()) return;
  frameQueued = true;
  requestAnimationFrame(function(){
    frameQueued = false;
    if(anim) stepAnim();
    clampView();
    if(renderer) renderer.render(view);
    drawOverlay();
    if(anim) redraw();
  });
}

// A smooth flight to a view (the buttons): centre and zoom eased, zoom in log space.
function flyTo(target){
  anim = { from: { cx: view.cx, cy: view.cy, k: Math.log(view.kpcPerPx) }, to: target, t0: performance.now() };
  redraw();
}
function stepAnim(){
  const u = Math.min(1, (performance.now() - anim.t0) / 900), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  view.cx = anim.from.cx + (anim.to.cx - anim.from.cx) * e;
  view.cy = anim.from.cy + (anim.to.cy - anim.from.cy) * e;
  view.kpcPerPx = Math.exp(anim.from.k + (Math.log(anim.to.kpcPerPx) - anim.from.k) * e);
  if(u >= 1) anim = null;
}

function zoomAt(factor, sx, sy){
  const s = size();
  const wx = view.cx + (sx - s.w / 2) * view.kpcPerPx, wy = view.cy - (sy - s.h / 2) * view.kpcPerPx;
  const k = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.kpcPerPx * factor));
  view.cx = wx - (sx - s.w / 2) * k;
  view.cy = wy + (sy - s.h / 2) * k;
  view.kpcPerPx = k;
  anim = null;
  redraw();
}

// ---------- overlay ----------
function el(tag, attrs, parent, text){
  const e = document.createElementNS(NS, tag);
  Object.keys(attrs).forEach(function(k){ e.setAttribute(k, attrs[k]); });
  if(text != null) e.textContent = text;
  if(parent) parent.appendChild(e);
  return e;
}
function fmt(n){ return Math.round(n).toLocaleString(getLang() === "pl" ? "pl-PL" : "en-US"); }
// A label lying along a curve: rotated to its tangent, kept upright.
function curvedLabel(parent, x, y, angleRad, text, cls){
  let deg = -angleRad * 180 / Math.PI;
  deg = ((deg + 540) % 360) - 180;
  if(deg > 90) deg -= 180; else if(deg < -90) deg += 180;
  const p = toScreen(x, y);
  el("text", { x: 0, y: 0, class: cls, transform: "translate(" + p[0].toFixed(1) + " " + p[1].toFixed(1) + ") rotate(" + deg.toFixed(1) + ")", "text-anchor": "middle" }, parent, text);
}

function drawOverlay(){
  const s = size();
  svg.setAttribute("viewBox", "0 0 " + s.w + " " + s.h);
  svg.textContent = "";
  const k = view.kpcPerPx;

  // distance rings from the centre, every 10 000 ly
  const c = toScreen(0, 0);
  for(let ly = 10000; ly <= 60000; ly += 10000){
    const rr = ly / LY_PER_KPC / k;
    el("circle", { cx: c[0], cy: c[1], r: rr, class: "gRing" }, svg);
    el("text", { x: c[0], y: c[1] - rr - 4, class: "gRingLbl", "text-anchor": "middle" }, svg, fmt(ly) + " " + t("galaxy.ly"));
  }

  // the arms' names, along the arms
  if(k > 0.009){
    ARMS.forEach(function(a){
      const th = a[1] + Math.log(a[2] / R0) / K;
      const x = a[2] * Math.cos(th), y = a[2] * Math.sin(th);
      curvedLabel(svg, x, y, th + Math.PI / 2 - Math.atan(K), t("galaxy.arms." + a[0]), "gArm");
    });
  }

  // the Galactic Centre
  const g = el("g", { class: "gCenter" }, svg);
  el("circle", { cx: c[0], cy: c[1], r: 5 }, g);
  el("path", { d: "M" + (c[0] - 14) + " " + c[1] + "h8 M" + (c[0] + 6) + " " + c[1] + "h8 M" + c[0] + " " + (c[1] - 14) + "v8 M" + c[0] + " " + (c[1] + 6) + "v8" }, g);
  el("text", { x: c[0], y: c[1] + 30, "text-anchor": "middle" }, g, t("galaxy.center"));

  // the starting system: pulse, crosshair, a label on a leader line
  const p = toScreen(SUN_KPC.x, SUN_KPC.y);
  const m = el("g", { class: "gStart" }, svg);
  el("circle", { cx: p[0], cy: p[1], r: 12, class: "gPulse" }, m);
  el("circle", { cx: p[0], cy: p[1], r: 12, class: "gPulse gPulse2" }, m);
  el("circle", { cx: p[0], cy: p[1], r: 9, class: "gRingMark" }, m);
  el("circle", { cx: p[0], cy: p[1], r: 2.6, class: "gDot" }, m);
  el("path", { class: "gTicks", d: "M" + (p[0] - 18) + " " + p[1] + "h6 M" + (p[0] + 12) + " " + p[1] + "h6 M" + p[0] + " " + (p[1] - 18) + "v6 M" + p[0] + " " + (p[1] + 12) + "v6" }, m);
  // the Orion Spur's name just above-right of the marker, in screen space
  el("text", { x: p[0] + 26, y: p[1] - 16, class: "gArm gArmSmall", transform: "rotate(-9 " + (p[0] + 26) + " " + (p[1] - 16) + ")" }, svg, t("galaxy.arms.orion"));
  const lx = p[0] + 46, ly = p[1] + 52;
  el("path", { class: "gLeader", d: "M" + (p[0] + 9) + " " + (p[1] + 9) + "L" + (lx - 10) + " " + ly + "h10" }, m);
  const title = t("galaxy.start"), sub = t("galaxy.startSub")(fmt(Math.round(Math.hypot(SUN_KPC.x, SUN_KPC.y) * LY_PER_KPC / 100) * 100));
  const box = el("rect", { x: lx, y: ly - 22, rx: 4, height: 44, class: "gLabelBox" }, m);
  const t1 = el("text", { x: lx + 12, y: ly - 4, class: "gLabelTitle" }, m, title);
  const t2 = el("text", { x: lx + 12, y: ly + 14, class: "gLabelSub" }, m, sub);
  box.setAttribute("width", Math.max(t1.getComputedTextLength(), t2.getComputedTextLength()) + 24);

  // scale bar: a round number of light years, ~110 px
  const target = 110 * k * LY_PER_KPC, pow = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map(function(f){ return f * pow; }).reduce(function(a, b){ return Math.abs(b - target) < Math.abs(a - target) ? b : a; });
  const px = nice / LY_PER_KPC / k;
  document.getElementById("galaxyScaleBar").style.width = px.toFixed(1) + "px";
  document.getElementById("galaxyScaleText").textContent = fmt(nice) + " " + t("galaxy.ly");
}

// ---------- input ----------
function layoutPoint(e){
  const r = body.getBoundingClientRect(), f = body.clientWidth / r.width;   // screen px -> layout px
  return [(e.clientX - r.left) * f, (e.clientY - r.top) * f, f];
}

export function initGalaxyMap(){
  win = document.getElementById("galaxyModal");
  body = document.getElementById("galaxyBody");
  canvas = document.getElementById("galaxyCanvas");
  svg = document.getElementById("galaxyOverlay");
  document.getElementById("galaxyCloseBtn").addEventListener("click", closeGalaxy);
  win.addEventListener("click", function(e){ if(e.target === win) closeGalaxy(); });
  document.getElementById("galaxyZoomIn").addEventListener("click", function(){ const s = size(); zoomAt(1 / 1.6, s.w / 2, s.h / 2); });
  document.getElementById("galaxyZoomOut").addEventListener("click", function(){ const s = size(); zoomAt(1.6, s.w / 2, s.h / 2); });
  document.getElementById("galaxyToStart").addEventListener("click", function(){ flyTo(START); });
  document.getElementById("galaxyWhole").addEventListener("click", function(){ flyTo(WHOLE); });

  body.addEventListener("wheel", function(e){
    e.preventDefault();
    const pt = layoutPoint(e);
    zoomAt(Math.exp(e.deltaY * 0.0015), pt[0], pt[1]);
  }, { passive: false });
  let drag = null;
  body.addEventListener("pointerdown", function(e){
    if(e.target.closest("button")) return;
    drag = layoutPoint(e);
    body.setPointerCapture(e.pointerId);
    body.classList.add("dragging");
    anim = null;
  });
  body.addEventListener("pointermove", function(e){
    if(!drag) return;
    const pt = layoutPoint(e);
    view.cx -= (pt[0] - drag[0]) * view.kpcPerPx;
    view.cy += (pt[1] - drag[1]) * view.kpcPerPx;
    drag = pt;
    redraw();
  });
  const endDrag = function(){ drag = null; body.classList.remove("dragging"); };
  body.addEventListener("pointerup", endDrag);
  body.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", function(e){
    if(e.code !== "KeyM" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if(isGalaxyOpen()){ e.preventDefault(); closeGalaxy(); return; }
    if(!keysAllowed(e)) return;
    e.preventDefault();
    openGalaxy();
  });
  window.addEventListener("resize", redraw);
  onLangChange(redraw);
}
