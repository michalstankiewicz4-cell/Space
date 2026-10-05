import { ctx } from "../../core/context.js";
import { t } from "../../i18n.js";
import { readBases, baseOn } from "../../world/baseMarkers.js";
import { bodyLookRef } from "../../world/bodyVisual.js";
import { bodyVariantKey } from "../../world/bodyParams.js";
import { clearSelection, clickPlanet } from "../../scene/controls.js";
import { focusCameraOn, focusCameraOnUnit } from "../../scene/camera.js";

// The Bases window (the HUD's BASES nav button): your surface bases on the
// game's planets, like the Fleet window lists the ships. A base lives in
// this browser ("roj-bases", world/baseMarkers.js), founded by building on
// the ground (surface/groundView.js). Each row: the planet (its own name —
// two planets share "Neutral planet"), the modules and how many are built,
// and your ships standing on it.
//   - the row: the camera to the planet, its PLANET INFO open;
//   - TO THE SURFACE: down with a ship that stands on that planet (the
//     camera on it, the ground view takes over); greyed out without one.
// Bases on bodies the game doesn't show (the surface lab's Mars…) aren't
// listed.

function refOf(p){ const r = bodyLookRef(p.orbitSlot, p.kind); return r; }
function bodyName(ref){
  const g = BodyKit.GROUPS.find(function(x){ return x.id === ref.groupId; });
  const b = g && g.bodies.find(function(x){ return x.id === ref.bodyId; });
  return b ? b.name : ref.bodyId.toUpperCase();
}
// your ships standing on planet p (the LAND order, down)
function shipsDown(p){
  return ctx.ships.filter(function(sh){
    return sh.commandedTarget === p && sh.order === "land" && sh.land && sh.land.t >= 1 && !sh.running;
  });
}

let shown = "";
function render(force){
  const list = document.getElementById("basesListEl");
  const all = readBases();
  const rows = ctx.planets.filter(function(p){ return p.orbitSlot != null && p.kind !== "sun" && !p.dying; })
    .map(function(p){ return { p: p, ref: refOf(p) }; })
    .filter(function(x){ return all[x.ref.groupId + "/" + x.ref.bodyId] && baseOn(x.ref); })
    .sort(function(a, b){ return a.p.orbitSlot - b.p.orbitSlot; });
  const sig = rows.map(function(x){ const b = baseOn(x.ref); return x.p.orbitSlot + ":" + b.modules + ":" + b.built + ":" + shipsDown(x.p).length; }).join("|") + "@" + t("bases.goDown");
  if(!force && sig === shown) return;
  shown = sig;
  list.textContent = "";
  document.getElementById("basesEmpty").classList.toggle("hidden", rows.length > 0);
  rows.forEach(function(x){
    const base = baseOn(x.ref), down = shipsDown(x.p);
    const li = document.createElement("li");
    const info = document.createElement("div"); info.className = "bInfo";
    const name = document.createElement("b"); name.textContent = bodyName(x.ref);
    const kind = document.createElement("span"); kind.className = "bKind"; kind.textContent = t("body." + bodyVariantKey(x.p));
    const mods = document.createElement("span"); mods.className = "bMods"; mods.textContent = t("planet.baseModules")(base.modules, base.built);
    const ships = document.createElement("span"); ships.className = "bShips";
    ships.textContent = down.length ? t("bases.shipsDown")(down.length) : t("bases.noShips");
    info.append(name, kind, mods, ships);
    const go = document.createElement("button");
    go.type = "button"; go.className = "mat gold bGo";
    go.textContent = t("bases.goDown");
    go.disabled = !down.length;
    go.title = down.length ? "" : t("bases.goDownNeedsShip");
    go.addEventListener("click", function(e){
      e.stopPropagation();
      if(!down.length) return;
      closeBasesModal();
      focusCameraOnUnit(down[0]);             // the ground view goes down with it (surface/groundView.js)
    });
    li.append(info, go);
    li.addEventListener("click", function(){
      closeBasesModal();
      clearSelection();
      clickPlanet(x.p, false);                 // selects it, PLANET INFO (with the base line)
      focusCameraOn(x.p);
    });
    list.appendChild(li);
  });
}

export function isBasesModalOpen(){
  return !document.getElementById("basesModal").classList.contains("hidden");
}
export function openBasesModal(){
  render(true);
  document.getElementById("basesModal").classList.remove("hidden");
}
export function closeBasesModal(){
  document.getElementById("basesModal").classList.add("hidden");
}
// While open: built counts and ships down change (main.js's ~0.4 s refresh).
export function refreshBases(){ if(isBasesModalOpen()) render(); }

export function initBases(){
  document.getElementById("basesCloseBtn").addEventListener("click", closeBasesModal);
  document.getElementById("basesModal").addEventListener("click", function(e){
    if(e.target.id === "basesModal") closeBasesModal();
  });
}
