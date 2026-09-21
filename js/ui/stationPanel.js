import { ctx } from "../core/context.js";
import { setStationSelected } from "../station/station.js";
import { state } from "../core/gameState.js";
import { TREE } from "../config.js";
import { openTechModal } from "./panels.js";
import { openFleetModal } from "./fleet.js";

export function isStationPanelOpen(){
  return !document.getElementById("stationPanel").classList.contains("hidden");
}

// Panel visibility tracks selection, RTS-style — same shape as
// dronePanel.js: selecting the station (see scene/controls.js) opens it,
// deselecting (close button, or selecting/clicking something else) closes
// it. The camera never reacts to any of this.
export function openStationPanel(){
  document.getElementById("stationPanel").classList.remove("hidden");
}

export function closeStationPanel(){
  document.getElementById("stationPanel").classList.add("hidden");
  if(ctx.station) setStationSelected(ctx.station, false);
}

// Compact icon+level readout (e.g. "⚡3 · 💥2 · 🔥0 · ❄️1 · 🚀4") reusing
// TREE's own icons from config.js rather than adding a second set of
// upgrade names/icons just for this panel.
function upgradesSummary(){
  return Object.keys(TREE).map(function(key){
    return TREE[key].icon + state.levels[key];
  }).join(" · ");
}

// Called every ~0.4s from main.js's tick, same cadence as
// refreshDronePanel() — a stats overview, not something needing
// frame-accurate updates.
export function refreshStationPanel(){
  if(!ctx.station){
    closeStationPanel();
    return;
  }
  document.getElementById("stationFleetVal").textContent = String(ctx.ships.length);
  document.getElementById("stationPointsVal").textContent = String(state.points);
  document.getElementById("stationUpgradesVal").textContent = upgradesSummary();
}

export function initStationPanel(){
  // pointerdown, not click — same fix as droneCloseBtn (see
  // ui/dronePanel.js): a press/release that drifts a couple pixels across
  // the button's edge can silently fail to fire "click".
  document.getElementById("stationCloseBtn").addEventListener("pointerdown", function(e){
    e.stopPropagation();
    closeStationPanel();
  });
  document.getElementById("stationTechBtn").addEventListener("click", openTechModal);
  document.getElementById("stationFleetBtn").addEventListener("click", openFleetModal);
}
