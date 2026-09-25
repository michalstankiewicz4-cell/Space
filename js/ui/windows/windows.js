import { renderPlayersList } from "./players.js";
import { initFleet } from "./fleet.js";
import { initDroneScript, refreshDroneScript } from "./droneScript.js";
import { refreshResearch } from "./research.js";
import { onLangChange } from "../../i18n.js";

// The windows opened from the HUD (css/ui/windows/). This file owns the
// three simple ones — Research (the upgrade tree, filled by research.js),
// Planets (the body type legend) and Intel (the players online, filled by
// players.js) — and is the one init/refresh entry point for all of them,
// including the Fleet window (fleet.js) and the drone script window
// (droneScript.js). Each closes via its red ✕, a click on the backdrop, or
// Escape (ui/escapeKey.js).
function makeWindow(id, closeBtnId, onOpen){
  const win = document.getElementById(id);
  const api = {
    isOpen: function(){ return !win.classList.contains("hidden"); },
    open: function(){ if(onOpen) onOpen(); win.classList.remove("hidden"); },
    close: function(){ win.classList.add("hidden"); }
  };
  api.init = function(){
    document.getElementById(closeBtnId).addEventListener("click", api.close);
    win.addEventListener("click", function(e){ if(e.target === win) api.close(); });
  };
  return api;
}

const tech = makeWindow("techModal", "techCloseBtn");
const legend = makeWindow("legendModal", "legendCloseBtn");
const players = makeWindow("playersModal", "playersCloseBtn", renderPlayersList);

export const isTechModalOpen = tech.isOpen;
export const openTechModal = tech.open;
export const closeTechModal = tech.close;
export const isLegendOpen = legend.isOpen;
export const openLegend = legend.open;
export const closeLegend = legend.close;
export const isPlayersModalOpen = players.isOpen;
export const openPlayersModal = players.open;
export const closePlayersModal = players.close;

// Call once the world exists (the Research tree reads the player's state,
// the drone script window the drone).
export function initWindows(){
  tech.init();
  legend.init();
  players.init();
  initFleet();
  initDroneScript();
  refreshResearch();
  onLangChange(refreshResearch);
}

// Every ~0.4s (ui/hud/hud.js): the live parts of whichever window is open.
export function refreshWindows(){
  if(players.isOpen()) renderPlayersList();
  refreshDroneScript();
}
