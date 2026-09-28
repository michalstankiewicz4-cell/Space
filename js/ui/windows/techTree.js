import { TREE } from "../../config.js";
import { state, cost } from "../../core/gameState.js";
import { t } from "../../i18n.js";
import { TECH_TREES } from "./techTreeData.js";

// The Research window's tree view (#techTree): one tree at a time from
// techTreeData.js, ◀ ▶ to switch. Drawn as one SVG: a planet's horizon at
// the bottom, the trunk (a bundle of circuit traces) growing out of it,
// branches routed like PCB traces (straight, then 45°) with light pulses
// running along the live ones, round metal-rimmed nodes. The layout is
// computed from the data (see layout()); nothing here knows a specific
// node. Buying is research.js's job (onBuy).
const W = 1100, H = 640;
const ROOT = { x: W / 2, y: 452 };
const RING = [0, 205, 365, 470];            // radius per depth
const FAN = [170, 10];                      // leaves spread between these angles (deg, 0 = right, 90 = up)
const HORIZON_Y = 590;                      // the planet's highest point
const R = { root: 50, branch: 40, leaf: 31 };

const ICONS = {
  core: '<path d="M8 5L3 12L8 19M16 5L21 12L16 19"/><circle class="f" cx="12" cy="8.5" r="1.7"/><circle class="f" cx="9.8" cy="14.6" r="1.7"/><circle class="f" cx="14.2" cy="14.6" r="1.7"/>',
  code: '<path d="M8 7L3 12L8 17M16 7L21 12L16 17M14 4L10 20"/>',
  shield: '<path d="M12 3L19 6V11C19 16 16 19 12 21C8 19 5 16 5 11V6Z"/>',
  flame: '<path d="M12 21C7 21 5 17.5 6 14C7 11 9.5 10 9 6C12 8 13 10 12.5 12C14 11 15 9.5 15 8C18 11 19 14 17.5 17C16.5 19.5 14.5 21 12 21Z"/>',
  snow: '<path d="M12 3V21M4.2 7.5L19.8 16.5M4.2 16.5L19.8 7.5M9.5 4.5L12 6.5L14.5 4.5M9.5 19.5L12 17.5L14.5 19.5"/>',
  bolt: '<path d="M13 2L5 13H11L10 22L19 10H13Z"/>',
  jaw: '<path d="M4 10C4 6 8 3.5 12 3.5S20 6 20 10M4 14C4 18 8 20.5 12 20.5S20 18 20 14M6.5 10L8.5 12.5L10.5 10L12.5 12.5L14.5 10L16.5 12.5L18 10.5M6.5 14L8.5 11.5L10.5 14L12.5 11.5L14.5 14L16.5 11.5L18 13.5"/>',
  ships: '<path d="M3 8L8.5 10L3 12M11 4.5L16.5 6.5L11 8.5M11 15.5L16.5 17.5L11 19.5M14.5 11L21 13L14.5 15"/>',
  swarm: '<circle cx="12" cy="6.5" r="2.6"/><circle cx="6" cy="16.5" r="2.6"/><circle cx="18" cy="16.5" r="2.6"/><path d="M10.8 8.8L7.4 14.2M13.2 8.8L16.6 14.2M8.6 16.5H15.4"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M10 7V4M14 7V4M10 20V17M14 20V17M7 10H4M7 14H4M20 10H17M20 14H17"/>',
  memory: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 10V14M11 10V14M15 10V14M6 17V20M10 17V20M14 17V20M18 17V20"/>',
  antenna: '<path d="M12 12V21M9 21H15"/><circle cx="12" cy="10" r="2"/><path d="M8.3 6.5C6.8 8.5 6.8 11.5 8.3 13.5M15.7 6.5C17.2 8.5 17.2 11.5 15.7 13.5M5.3 4C2.8 7.5 2.8 12.5 5.3 16M18.7 4C21.2 7.5 21.2 12.5 18.7 16"/>',
  threads: '<path d="M4 6C8 4 10 8 14 6S19 5.5 20 6M4 12C8 10 10 14 14 12S19 11.5 20 12M4 18C8 16 10 20 14 18S19 17.5 20 18"/>',
  gauge: '<path d="M4 16A8 8 0 1 1 20 16"/><path d="M12 16L16 9"/><circle class="f" cx="12" cy="16" r="1.6"/>',
  layers: '<path d="M12 3.5L20.5 8L12 12.5L3.5 8ZM3.5 12L12 16.5L20.5 12M3.5 16L12 20.5L20.5 16"/>',
  stack: '<rect x="6" y="4" width="12" height="4" rx="1"/><rect x="6" y="10" width="12" height="4" rx="1"/><rect x="6" y="16" width="12" height="4" rx="1"/>',
  compress: '<path d="M4 4L10 10M10 5V10H5M20 20L14 14M14 19V14H19M20 4L14 10M19 10H14V5M4 20L10 14M5 14H10V19"/>',
  relay: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 11L17 7M7 13L17 17"/>',
  range: '<circle class="f" cx="12" cy="12" r="1.8"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="3 3"/>',
  parallel: '<path d="M4 7H16M4 12H20M4 17H13M14 4L17 7L14 10M17 14L20 17L17 20"/>',
  sync: '<path d="M19 8A8 8 0 0 0 5 9M5 16A8 8 0 0 0 19 15M19 4V8H15M5 20V16H9"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11"/>'
};

let current = 0;                 // the tree shown
let onBuyFn = null;

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

// ---------- layout: leaves in a fan, parents over their children ----------
function layout(root){
  const leaves = [];
  (function collect(n, depth, parent){
    n._depth = depth; n._parent = parent;
    if(!n.children || !n.children.length) leaves.push(n);
    (n.children || []).forEach(function(c){ collect(c, depth + 1, n); });
  })(root, 0, null);
  const a0 = FAN[0], a1 = FAN[1];
  leaves.forEach(function(l, i){ l._angle = leaves.length === 1 ? 90 : a0 + (a1 - a0) * i / (leaves.length - 1); });
  (function angle(n){
    if(n.children && n.children.length){
      n.children.forEach(angle);
      n._angle = n.children.reduce(function(s, c){ return s + c._angle; }, 0) / n.children.length;
    }
  })(root);
  const all = [];
  (function place(n){
    const r = RING[Math.min(n._depth, RING.length - 1)];
    const a = n._angle * Math.PI / 180;
    n._x = ROOT.x + Math.cos(a) * r;
    n._y = ROOT.y - Math.sin(a) * r;
    all.push(n);
    (n.children || []).forEach(place);
  })(root);
  return all;
}

// ---------- node state ----------
function info(n){
  if(n.kind === "upgrade"){
    const node = TREE[n.upgrade];
    const lvl = state.levels[n.upgrade], c = cost(node);
    return { name: t("upgrades." + n.upgrade), desc: t("upgrades.tree." + n.id + "Desc"), lvl: lvl, max: node.maxLvl, cost: c,
      affordable: c !== null && c <= state.points, maxed: c === null };
  }
  return { name: t("upgrades.tree." + n.id), desc: t("upgrades.tree." + n.id + "Desc") };
}

function stateClass(n, i){
  if(n.kind === "root") return "root";
  if(n.kind === "soon") return "soon";
  if(n.kind === "hub") return "hub";
  return i.maxed ? "maxed" : i.affordable ? "affordable" : i.lvl > 0 ? "owned" : "poor";
}

// ---------- drawing ----------
// A PCB-style route from a to b: straight along the longer axis, then 45°.
function trace(a, b){
  const dx = b._x - a._x, dy = b._y - a._y, ax = Math.abs(dx), ay = Math.abs(dy);
  let mx, my;
  if(ay > ax){ mx = a._x; my = a._y + Math.sign(dy) * (ay - ax); }
  else { mx = a._x + Math.sign(dx) * (ax - ay); my = a._y; }
  return "M" + a._x.toFixed(1) + " " + a._y.toFixed(1) + " L" + mx.toFixed(1) + " " + my.toFixed(1) + " L" + b._x.toFixed(1) + " " + b._y.toFixed(1);
}

function icon(key, x, y, size){
  const s = size / 24;
  return '<g class="ic" transform="translate(' + (x - size / 2).toFixed(1) + " " + (y - size / 2).toFixed(1) + ") scale(" + s.toFixed(3) + ')">' + (ICONS[key] || "") + "</g>";
}

function wrap(text, max){
  const words = String(text).split(" "), lines = [];
  let line = "";
  words.forEach(function(w){ if((line + " " + w).trim().length > max && line){ lines.push(line); line = w; } else line = (line + " " + w).trim(); });
  if(line) lines.push(line);
  return lines.slice(0, 3);
}

// Seeded stars, the same every time the window opens.
function stars(){
  let s = 7, out = "";
  function rnd(){ s = (s * 16807) % 2147483647; return s / 2147483647; }
  for(let i = 0; i < 140; i++){
    const x = rnd() * W, y = rnd() * (HORIZON_Y - 10), r = rnd() < 0.1 ? 1.4 : 0.8, o = 0.25 + rnd() * 0.6;
    out += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + r + '" fill="#dfe6ff" opacity="' + o.toFixed(2) + '"' + (rnd() < 0.25 ? ' class="tw" style="animation-delay:' + (rnd() * 4).toFixed(1) + 's"' : "") + "/>";
  }
  return out;
}

function background(){
  return (
    '<defs>' +
      '<radialGradient id="ttNebA" cx="0.22" cy="0.25" r="0.6"><stop offset="0" stop-color="#3d2a8c" stop-opacity=".55"/><stop offset="1" stop-color="#3d2a8c" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="ttNebB" cx="0.82" cy="0.35" r="0.55"><stop offset="0" stop-color="#1c6f8c" stop-opacity=".45"/><stop offset="1" stop-color="#1c6f8c" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="ttPlanet" cx="0.5" cy="0" r="0.55"><stop offset="0" stop-color="#1b2d6b"/><stop offset="0.35" stop-color="#0a1233"/><stop offset="1" stop-color="#02040f"/></radialGradient>' +
      '<linearGradient id="ttAtmo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fe3c6" stop-opacity=".0"/><stop offset=".5" stop-color="#4fb6ff" stop-opacity=".35"/><stop offset="1" stop-color="#4fe3c6" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="ttRimGold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffe7b0"/><stop offset=".45" stop-color="#f8bb56"/><stop offset=".7" stop-color="#9a6127"/><stop offset="1" stop-color="#e9ab55"/></linearGradient>' +
      '<linearGradient id="ttRimSteel" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#a8b3d8"/><stop offset=".5" stop-color="#4c5680"/><stop offset=".75" stop-color="#262c48"/><stop offset="1" stop-color="#7580ad"/></linearGradient>' +
      '<radialGradient id="ttFace" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#16214f"/><stop offset=".6" stop-color="#070c24"/><stop offset="1" stop-color="#02040f"/></radialGradient>' +
      '<linearGradient id="ttCopper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2a25a"/><stop offset="1" stop-color="#8a5226"/></linearGradient>' +
      '<pattern id="ttHex" width="42" height="24.25" patternUnits="userSpaceOnUse"><path d="M0 12.1L7 0H21L28 12.1L21 24.25H7Z" fill="none" stroke="#3c55d8" stroke-width="1"/></pattern>' +
      '<filter id="ttGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="ttSoft"><feGaussianBlur stdDeviation="8"/></filter>' +
      '<radialGradient id="ttHexFade" cx="0" cy="0" r="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<mask id="ttHexMaskL"><rect width="' + W + '" height="' + H + '" fill="url(#ttHexFadeL)"/></mask>' +
      '<radialGradient id="ttHexFadeL" cx="0.05" cy="0.05" r="0.35"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<mask id="ttHexMaskR"><rect width="' + W + '" height="' + H + '" fill="url(#ttHexFadeR)"/></mask>' +
      '<radialGradient id="ttHexFadeR" cx="0.95" cy="0.08" r="0.3"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="#02030c"/>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#ttNebA)"/><rect width="' + W + '" height="' + H + '" fill="url(#ttNebB)"/>' +
    stars() +
    '<rect width="' + W + '" height="' + H + '" fill="url(#ttHex)" opacity=".35" mask="url(#ttHexMaskL)"/>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#ttHex)" opacity=".35" mask="url(#ttHexMaskR)"/>' +
    // the planet the tree grows from, and its atmosphere
    '<circle cx="' + W / 2 + '" cy="' + (HORIZON_Y + 1400) + '" r="1400" fill="url(#ttPlanet)"/>' +
    '<circle cx="' + W / 2 + '" cy="' + (HORIZON_Y + 1400) + '" r="1404" fill="none" stroke="#4fb6ff" stroke-width="10" opacity=".35" filter="url(#ttSoft)"/>' +
    '<circle cx="' + W / 2 + '" cy="' + (HORIZON_Y + 1400) + '" r="1400.5" fill="none" stroke="#9fe8ff" stroke-width="1.2" opacity=".7"/>'
  );
}

// The trunk: a bundle of traces from the horizon up to the root, spreading
// into roots along the surface.
function trunk(){
  let out = "";
  const offs = [-18, -9, 0, 9, 18];
  offs.forEach(function(o, i){
    const x0 = ROOT.x + o * 0.55, xb = ROOT.x + o * 1.3;
    const d = "M" + x0 + " " + (ROOT.y + R.root - 4) + " L" + x0 + " " + (HORIZON_Y - 40) + " L" + xb + " " + (HORIZON_Y - 10) + " L" + xb + " " + (HORIZON_Y + 6);
    out += '<path class="tr-base" d="' + d + '"/><path class="tr-core" d="' + d + '"/>';
    // roots along the surface
    const dir = o === 0 ? (i % 2 ? 1 : -1) : Math.sign(o), len = 60 + Math.abs(o) * 7;
    const root = "M" + xb + " " + (HORIZON_Y + 6) + " L" + (xb + dir * len) + " " + (HORIZON_Y + 6 + len * 0.18) + " L" + (xb + dir * (len + 40)) + " " + (HORIZON_Y + 6 + len * 0.18);
    out += '<path class="tr-base root" d="' + root + '"/><path class="tr-core" d="' + root + '"/>';
  });
  return out + '<path class="pulse up" d="M' + ROOT.x + " " + (HORIZON_Y + 6) + " L" + ROOT.x + " " + (ROOT.y + R.root) + '"/>';
}

function nodeSvg(n, i){
  const cls = stateClass(n, i);
  const r = n.kind === "root" ? R.root : (n.children && n.children.length) ? R.branch : R.leaf;
  const x = n._x, y = n._y;
  const rim = cls === "soon" ? "url(#ttRimSteel)" : "url(#ttRimGold)";
  let out = '<g class="tt-node ' + cls + (n.children && n.children.length && n.kind !== "root" ? " branch" : "") + '" data-id="' + esc(n.id) + '" tabindex="0">';
  out += '<circle class="halo" cx="' + x + '" cy="' + y + '" r="' + (r + 10) + '"/>';
  out += '<circle class="rim" cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#ttFace)" stroke="' + rim + '" stroke-width="5"/>';
  out += '<circle class="inner" cx="' + x + '" cy="' + y + '" r="' + (r - 6) + '"/>';
  // rivets on the rim, like the concept art's bolted metal plates
  [45, 135, 225, 315].forEach(function(a){
    const rad = a * Math.PI / 180;
    out += '<circle class="rivet" cx="' + (x + Math.cos(rad) * r).toFixed(1) + '" cy="' + (y + Math.sin(rad) * r).toFixed(1) + '" r="1.7"/>';
  });
  if(n.kind === "upgrade"){
    // the level as a ring around the rim
    const circ = 2 * Math.PI * (r + 6), frac = i.lvl / i.max;
    out += '<circle class="ring-bg" cx="' + x + '" cy="' + y + '" r="' + (r + 6) + '"/>';
    out += '<circle class="ring" cx="' + x + '" cy="' + y + '" r="' + (r + 6) + '" stroke-dasharray="' + (circ * frac).toFixed(1) + " " + circ.toFixed(1) + '" transform="rotate(-90 ' + x + " " + y + ')"/>';
  }
  if(n.kind === "root"){
    out += '<circle class="spin" cx="' + x + '" cy="' + y + '" r="' + (r + 12) + '"/>';
    out += icon(n.icon, x, y - 10, 34);
    // a long name gets a smaller font so it stays inside the circle
    const fs = Math.min(17, 150 / Math.max(1, i.name.length));
    out += '<text class="lbl-in root" x="' + x + '" y="' + (y + 24) + '" style="font-size:' + fs.toFixed(1) + 'px">' + esc(i.name) + "</text>";
  } else if(n.children && n.children.length){
    out += icon(n.icon, x, y - 13, 20);
    wrap(i.name, 12).forEach(function(line, k, arr){
      out += '<text class="lbl-in" x="' + x + '" y="' + (y + 8 + (k - (arr.length - 1) / 2) * 13 + (arr.length > 1 ? 4 : 0)) + '">' + esc(line) + "</text>";
    });
  } else {
    out += icon(cls === "soon" ? n.icon : n.icon, x, y - (n.kind === "upgrade" ? 6 : 0), 26);
    if(n.kind === "upgrade") out += '<text class="lvl" x="' + x + '" y="' + (y + 20) + '">' + i.lvl + "/" + i.max + "</text>";
    wrap(i.name, 16).forEach(function(line, k){ out += '<text class="lbl" x="' + x + '" y="' + (y + r + 22 + k * 14) + '">' + esc(line) + "</text>"; });
    if(n.kind === "upgrade"){
      const lines = wrap(i.name, 16).length;
      const txt = i.maxed ? t("upgrades.max") : i.cost + " " + t("upgrades.pts");
      const ty = y + r + 22 + lines * 14 + 4, w = 12 + txt.length * 6.6;
      out += '<rect class="cost-bg" x="' + (x - w / 2) + '" y="' + (ty - 12) + '" width="' + w + '" height="17" rx="8.5"/>';
      out += '<text class="cost" x="' + x + '" y="' + (ty + 1) + '">' + esc(txt) + "</text>";
    }
  }
  if(cls === "soon") out += icon("lock", x + r * 0.72, y - r * 0.72, 16);
  return out + "</g>";
}

function draw(){
  const tree = TECH_TREES[current];
  const nodes = layout(tree);
  const infos = {};
  nodes.forEach(function(n){ infos[n.id] = info(n); });
  let traces = "";
  nodes.forEach(function(n){
    if(!n._parent) return;
    const d = trace(n._parent, n);
    const cls = stateClass(n, infos[n.id]);
    const live = cls === "owned" || cls === "affordable" || cls === "maxed" || cls === "hub" || (n.kind === "hub");
    traces += '<path class="tr-base ' + (cls === "soon" ? "dim" : "") + '" d="' + d + '"/><path class="tr-core ' + (cls === "soon" ? "dim" : "") + '" d="' + d + '"/>';
    if(live) traces += '<path class="pulse" d="' + d + '" style="animation-delay:' + (-(n._angle % 7) * 0.4).toFixed(2) + 's"/>';
  });
  let nodeMarkup = "";
  nodes.slice().reverse().forEach(function(n){ nodeMarkup += nodeSvg(n, infos[n.id]); });
  const svg = document.getElementById("ttSvg");
  svg.innerHTML = background() + trunk() + traces + nodeMarkup;
  svg.querySelectorAll(".tt-node").forEach(function(g){
    const n = nodes.find(function(x){ return x.id === g.dataset.id; });
    g.addEventListener("mouseenter", function(){ showTip(n, infos[n.id]); });
    g.addEventListener("mouseleave", hideTip);
    g.addEventListener("click", function(){ if(n.kind === "upgrade" && onBuyFn) onBuyFn(n.upgrade); });
  });
  document.getElementById("ttTitle").textContent = t("upgrades.tree." + tree.id);
  document.getElementById("ttPage").textContent = (current + 1) + " / " + TECH_TREES.length;
  document.getElementById("ttPoints").textContent = t("upgrades.tree.points")(state.points);
}

// ---------- tooltip ----------
function showTip(n, i){
  const tip = document.getElementById("ttTip");
  let html = "<b>" + esc(i.name) + "</b>";
  if(i.desc) html += "<p>" + esc(i.desc) + "</p>";
  if(n.kind === "upgrade"){
    html += "<p class='k'>" + esc(t("upgrades.level")(i.lvl, i.max)) + "</p>";
    html += "<p class='c'>" + esc(i.maxed ? t("upgrades.max") : (i.cost + " " + t("upgrades.pts") + (i.affordable ? " — " + t("upgrades.tree.clickToBuy") : " — " + t("upgrades.tree.notEnough")))) + "</p>";
  } else if(n.kind === "soon"){
    html += "<p class='s'>" + esc(t("upgrades.tree.soon")) + "</p>";
  }
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  // above the node (SVG viewBox units -> percentage of the box)
  tip.style.left = (n._x / W * 100) + "%";
  tip.style.top = (n._y / H * 100) + "%";
}
function hideTip(){ document.getElementById("ttTip").classList.add("hidden"); }

export function renderTechTree(onBuy){
  onBuyFn = onBuy;
  draw();
}

export function initTechTree(){
  document.getElementById("ttPrev").addEventListener("click", function(){ current = (current - 1 + TECH_TREES.length) % TECH_TREES.length; hideTip(); draw(); });
  document.getElementById("ttNext").addEventListener("click", function(){ current = (current + 1) % TECH_TREES.length; hideTip(); draw(); });
}
