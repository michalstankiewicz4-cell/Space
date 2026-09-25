import { isTechModalOpen, closeTechModal, isPlayersModalOpen, closePlayersModal } from "./windows/windows.js";
import { isWikiOpen, closeWiki } from "./windows/wiki.js";
import { isFleetModalOpen, closeFleetModal } from "./windows/fleet.js";
import { isShipCamActive, clearShipCamTarget } from "../scene/shipcam.js";
import { isDroneScriptModalOpen, closeDroneScriptModal } from "./windows/droneScript.js";
import { isDronePanelOpen, closeDronePanel } from "./hud/unitPanel.js";
import { isStationPanelOpen, closeStationPanel } from "./hud/stationPanel.js";
import { isPlanetPanelOpen, closePlanetPanel } from "./hud/planetPanel.js";
import { isSetupModalOpen, closeSetupModal } from "./setupModal.js";
import { toggleBanner } from "./banner.js";
import { isAboutOpen, closeAbout } from "./about.js";

// Escape closes whichever overlay is topmost first (drone script, then the
// HUD windows, then setup, then the drone/station/planet selection or
// ship cam), and only once nothing else is open does it reopen/close the
// start screen itself (e.g. to change nickname or language mid-game).
const ESCAPE_CHAIN = [
  [isDroneScriptModalOpen, closeDroneScriptModal],
  [isTechModalOpen, closeTechModal],
  [isFleetModalOpen, closeFleetModal],
  [isPlayersModalOpen, closePlayersModal],
  [isWikiOpen, closeWiki],
  [isAboutOpen, closeAbout],
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
