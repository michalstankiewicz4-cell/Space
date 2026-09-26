import { onLangChange } from "../../i18n.js";
import { fillIcons } from "../icons.js";
import { refreshWindows } from "../windows/windows.js";
import { updateTelemetry, updateClock } from "./topBar.js";
import { initNav, refreshNav } from "./nav.js";
import { initCommandBar } from "./commandBar.js";
import { initInfoPanel } from "./infoPanel.js";
import { refreshPlanetPanel } from "./planetPanel.js";
import { refreshStationPanel } from "./stationPanel.js";
import { refreshBlackHolePanel } from "./blackHolePanel.js";
import { refreshRemoteStationPanel } from "./remoteStationPanel.js";
import { initUnitPanel, updateUnitPanel } from "./unitPanel.js";
import { refreshFleetList } from "./fleetList.js";
import { initMinimap, drawMinimap } from "./minimap.js";
import { initDevTools } from "./devTools.js";

// The in-game HUD's entry points (index.html #hud, css/ui/hud/): each panel
// lives in its own module next to this one; main.js only ever talks to
// these three functions.

// Before the 3D scene exists: the parts that don't touch the world, so
// their labels get translated in the same pass as the start screen's (the
// HUD stays hidden under the start screen until the player enters orbit
// either way).
export function initHudShell(){
  fillIcons(document.getElementById("resBox"));
  initNav();
  initCommandBar();
  initInfoPanel();
  updateClock();
}

// Once the world (station, fleet, drone) exists.
export function initHudWorld(){
  initUnitPanel();
  initMinimap();
  initDevTools();
  refreshFleetList();
  // Dynamic panel text is re-derived from t() on every refresh, so a
  // language change only needs one forced pass.
  onLangChange(function(){
    updateUnitPanel(true); refreshPlanetPanel(); refreshStationPanel(); refreshBlackHolePanel(); refreshRemoteStationPanel(); refreshFleetList(); drawMinimap();
  });
}

// Every frame. Which unit SELECTED UNIT shows is checked every frame
// (cheap, DOM only touched on change) so it reacts to a click instantly;
// stats, lists and the minimap refresh on slower timers.
let uiTimer = 0;
let mapTimer = 0;
export function updateHud(dt){
  updateUnitPanel(false);
  mapTimer += dt;
  if(mapTimer > 0.1){
    mapTimer = 0;
    drawMinimap();
  }
  uiTimer += dt;
  if(uiTimer > 0.4){
    uiTimer = 0;
    updateTelemetry();
    updateClock();
    refreshStationPanel();
    refreshPlanetPanel();
    refreshBlackHolePanel();
    refreshRemoteStationPanel();
    updateUnitPanel(true);
    refreshFleetList();
    refreshNav();
    refreshWindows();
  }
}
