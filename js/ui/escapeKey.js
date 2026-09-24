import { isTechModalOpen, closeTechModal } from "./panels.js";
import { isFleetModalOpen, closeFleetModal } from "./fleet.js";
import { isShipCamActive, clearShipCamTarget } from "../scene/shipcam.js";
import { isDroneScriptModalOpen, closeDroneScriptModal, isDronePanelOpen, closeDronePanel } from "./dronePanel.js";
import { isStationPanelOpen, closeStationPanel } from "./stationPanel.js";
import { isPlanetPanelOpen, closePlanetPanel } from "./planetPanel.js";
import { isSetupModalOpen, closeSetupModal } from "./setupModal.js";
import { toggleBanner } from "./banner.js";

// Escape closes whichever overlay is topmost first (drone script, then
// tech/fleet modals, then setup, then the drone/station/planet panel or
// ship cam), and only once nothing else is open does it reopen/close the
// start screen itself (e.g. to change nickname or language mid-game).
const ESCAPE_CHAIN = [
  [isDroneScriptModalOpen, closeDroneScriptModal],
  [isTechModalOpen, closeTechModal],
  [isFleetModalOpen, closeFleetModal],
  [isSetupModalOpen, closeSetupModal],
  [isDronePanelOpen, closeDronePanel],
  [isStationPanelOpen, closeStationPanel],
  [isPlanetPanelOpen, closePlanetPanel],
  [isShipCamActive, clearShipCamTarget],
];

export function initEscapeKey(){
  window.addEventListener("keydown", function(e){
    if(e.key !== "Escape") return;
    const open = ESCAPE_CHAIN.find(function(entry){ return entry[0](); });
    if(open) open[1]();
    else toggleBanner();
  });
}
