import { ctx } from "../../core/context.js";
import { SOLAR_BODIES, STATION_RING } from "../../world/solarSystem.js";
import { camState, clickPlanet, clickStation, clickBlackHole, focusCameraOn, bodyPosition } from "../../scene/controls.js";
import { bodyVariantKey } from "../../world/bodyParams.js";
import { t } from "../../i18n.js";

// The HUD's MINIMAP: a schematic of the solar system, deliberately NOT to
// scale — the 9 orbits are evenly spaced rings (the real ones span a=90..890,
// which would squash the inner planets into a few pixels), and each body
// sits on its own ring at its real angle around the Sun, so it's easy to
// see where things are relative to each other and to click one. A click
// does exactly what clicking that planet in the 3D view does
// (scene/controls.js#clickPlanet): course order for the selected ships,
// otherwise select it; shift toggles the multi-select. +/- (or the mouse
// wheel) zoom, dragging pans.
const W = 295, H = 206, CX = W / 2, CY = H / 2;
const RING_STEP = 13, RING_BASE = 16, TILT = 0.66;
const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 1.5;
const PICK_RADIUS = 11;
const KIND_COLOR = {
  volcanic: "#ff7a45", neutral: "#8fd88f", ice: "#4fa8ff",
  meteoroid: "#c9a27a", comet: "#bfe9ff"
};

// Real orbit radius -> schematic ring radius (for bodies that aren't on a
// fixed ring: the comet, the player's ships), piecewise-linear through the
// fixed orbits' own (a, ring) pairs so everything lines up with the rings.
const RING_TABLE = [[0, 0]].concat(
  SOLAR_BODIES.filter(function(b){ return b.slot > 0; }).map(function(b){ return [b.a, ringRadius(b.slot)]; }),
  [[STATION_RING.a, ringRadius(4)]]
).sort(function(a, b){ return a[0] - b[0]; });

function ringRadius(slot){ return RING_BASE + slot * RING_STEP; }

function schematicRadius(r){
  for(let i = 1; i < RING_TABLE.length; i++){
    const a = RING_TABLE[i - 1], b = RING_TABLE[i];
    if(r <= b[0]) return a[1] + (r - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
  }
  // Past the outermost orbit (an arriving/leaving comet, out to ~1.3x
  // its radius) only a sliver of extra room: the outer ring already nearly
  // fills the box, and more would push the comet off the map's edge.
  const last = RING_TABLE[RING_TABLE.length - 1];
  return Math.min(last[1] + 8, last[1] + (r - last[0]) * 0.03);
}

let zoom = 1, panX = 0, panY = 0;
let svg = null;
let picks = []; // [{x, y, obj, kind}] from the last draw, in viewBox units

function project(ringR, angle){
  return {
    x: CX + panX + Math.cos(angle) * ringR * zoom,
    y: CY + panY + Math.sin(angle) * ringR * TILT * zoom
  };
}

function angleOf(p){ return Math.atan2(p.z, p.x); }

function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}

export function drawMinimap(){
  if(!svg) return;
  picks = [];
  let out = '<defs><filter id="mmGlow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

  for(let s = 1; s <= 9; s++){
    const r = ringRadius(s) * zoom;
    const station = s === 4;
    out += '<ellipse cx="' + (CX + panX) + '" cy="' + (CY + panY) + '" rx="' + r + '" ry="' + r * TILT +
      '" fill="none" stroke="' + (station ? "#f5bd5c" : "#2f5cff") + '" stroke-opacity="' + (station ? 0.35 : 0.55) +
      '" stroke-width="1"' + (station ? ' stroke-dasharray="3 3"' : "") + "/>";
  }
  const sun = project(0, 0);
  out += '<circle cx="' + sun.x + '" cy="' + sun.y + '" r="' + 13 * Math.sqrt(zoom) + '" fill="#ffc21f" opacity=".22" filter="url(#mmGlow)"/>' +
    '<circle cx="' + sun.x + '" cy="' + sun.y + '" r="' + 8 * Math.sqrt(zoom) + '" fill="url(#gSun)" filter="url(#mmGlow)"><title>' + esc(t("hud.sun")) + "</title></circle>";

  ctx.planets.forEach(function(p){
    if(p.dying || p.kind === "sun") return;
    const pos = p.mesh.position;
    const ringR = p.orbitSlot != null ? ringRadius(p.orbitSlot) : schematicRadius(Math.hypot(pos.x, pos.z));
    const pt = project(ringR, angleOf(pos));
    const rad = (p.kind === "comet" ? 2.6 : 2.2 + p.radius * 0.9) * Math.sqrt(zoom);
    const name = t("body." + bodyVariantKey(p));
    out += '<g class="mmPick"><title>' + esc(name) + "</title>" +
      (p.selected ? '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + (rad + 3.5) + '" fill="none" stroke="#f5bd5c" stroke-width="1.5"/>' : "") +
      '<circle class="mmBody" cx="' + pt.x + '" cy="' + pt.y + '" r="' + rad + '" fill="' + (KIND_COLOR[p.kind] || "#c7d0ff") + '" filter="url(#mmGlow)"/></g>';
    picks.push({ x: pt.x, y: pt.y, obj: p, kind: "planet" });
  });

  ctx.blackholes.forEach(function(bh){
    const pos = bh.group.position;
    const ringR = bh.orbitSlot != null ? ringRadius(bh.orbitSlot) : schematicRadius(Math.hypot(pos.x, pos.z));
    const pt = project(ringR, angleOf(pos));
    out += '<g class="mmPick"><title>' + esc(t("body.blackhole")) + '</title>' +
      (bh.selected ? '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + (5 * Math.sqrt(zoom) + 3.5) + '" fill="none" stroke="#f5bd5c" stroke-width="1.5"/>' : "") +
      '<circle class="mmBody" cx="' + pt.x + '" cy="' + pt.y + '" r="' + 5 * Math.sqrt(zoom) +
      '" fill="#000" stroke="#b06cff" stroke-width="1.6" filter="url(#mmGlow)"/></g>';
    picks.push({ x: pt.x, y: pt.y, obj: bh, kind: "blackhole" });
  });

  ctx.ships.forEach(function(sh){
    const pt = project(schematicRadius(Math.hypot(sh.pos.x, sh.pos.z)), angleOf(sh.pos));
    out += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="1.3" fill="#4fe3c6"/>';
  });

  if(ctx.station){
    const pt = project(ringRadius(4), angleOf(ctx.station.pos));
    const d = 4.5 * Math.sqrt(zoom);
    out += '<g class="mmPick"><title>' + esc(t("hud.yourBase")) + "</title>" +
      '<path d="M' + pt.x + " " + (pt.y - d) + " L" + (pt.x + d) + " " + pt.y + " L" + pt.x + " " + (pt.y + d) + " L" + (pt.x - d) + " " + pt.y +
      ' Z" class="mmBody" fill="#f5bd5c" stroke="' + (ctx.station.selected ? "#fff" : "none") + '" stroke-width="1.2" filter="url(#mmGlow)"/></g>';
    picks.push({ x: pt.x, y: pt.y, obj: ctx.station, kind: "station" });
  }

  // Camera: a green frame around what the 3D view orbits (the station in
  // "base" mode, the focused body in "focus" mode, the Sun in "system"
  // mode), sized by its zoom distance.
  let pivot = sun;
  if(camState.mode === "base" && ctx.station) pivot = project(ringRadius(4), angleOf(ctx.station.pos));
  else if(camState.mode === "focus" && camState.target && camState.target.kind !== "sun"){
    const b = camState.target, pos = bodyPosition(b);
    pivot = project(b.orbitSlot != null ? ringRadius(b.orbitSlot) : schematicRadius(Math.hypot(pos.x, pos.z)), angleOf(pos));
  }
  const size = Math.max(10, Math.min(250, Math.sqrt(camState.radius / 950) * 250)) * zoom;
  out += '<rect x="' + (pivot.x - size / 2) + '" y="' + (pivot.y - size * 0.33) + '" width="' + size + '" height="' + size * 0.66 +
    '" fill="none" stroke="#27d05a" stroke-width="1.4" pointer-events="none"/>';

  svg.innerHTML = out;
}

function toViewBox(e){
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

function pickAt(pt){
  let best = null, bestD = PICK_RADIUS;
  picks.forEach(function(p){
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if(d < bestD){ bestD = d; best = p; }
  });
  return best;
}

function setZoom(z){
  const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  // Keep whatever is at the view's center in place while zooming.
  panX = panX * nz / zoom;
  panY = panY * nz / zoom;
  zoom = nz;
  if(zoom === ZOOM_MIN){ panX = 0; panY = 0; }
  drawMinimap();
}

export function initMinimap(){
  svg = document.getElementById("mmSvg");
  document.getElementById("mmIn").addEventListener("click", function(){ setZoom(zoom * ZOOM_STEP); });
  document.getElementById("mmOut").addEventListener("click", function(){ setZoom(zoom / ZOOM_STEP); });
  document.getElementById("mmBox").addEventListener("wheel", function(e){
    e.preventDefault();
    setZoom(e.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
  }, { passive: false });

  let down = null;
  svg.addEventListener("pointerdown", function(e){
    if(e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, panX: panX, panY: panY, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", function(e){
    if(!down) return;
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - down.x) / r.width * W, dy = (e.clientY - down.y) / r.height * H;
    if(!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
    if(down.moved && zoom > ZOOM_MIN){ panX = down.panX + dx; panY = down.panY + dy; drawMinimap(); }
  });
  svg.addEventListener("pointerup", function(e){
    if(!down) return;
    const wasDrag = down.moved;
    down = null;
    if(wasDrag) return;
    const hit = pickAt(toViewBox(e));
    if(!hit) return;
    // a body: the same as clicking it in the world, and the camera flies to it
    if(hit.kind === "planet"){ clickPlanet(hit.obj, e.shiftKey); focusCameraOn(hit.obj); }
    else if(hit.kind === "blackhole"){ clickBlackHole(hit.obj); focusCameraOn(hit.obj); }
    else if(hit.kind === "station") clickStation(e.shiftKey);
    drawMinimap();
  });
  drawMinimap();
}
