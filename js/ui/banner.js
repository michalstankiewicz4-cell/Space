import { hasConfirmedNick, confirmNick, randomNickSuggestion, myIdentity } from "../net/identity.js";
import { t, getLang, setLang, LANGS } from "../i18n.js";
import { applyStaticText } from "./i18nApply.js";
import { refreshDock } from "./dock.js";
import { settings, saveSettings } from "../settings.js";
import { isTechModalOpen, closeTechModal } from "./panels.js";
import { isFleetModalOpen, closeFleetModal } from "./fleet.js";
import { isShipCamActive, clearShipCamTarget } from "../scene/shipcam.js";
import { isDroneScriptModalOpen, closeDroneScriptModal, isDronePanelOpen, closeDronePanel } from "./dronePanel.js";
import { isStationPanelOpen, closeStationPanel } from "./stationPanel.js";
import { isPlanetPanelOpen, closePlanetPanel } from "./planetPanel.js";
import { initUiKit } from "./uiKit.js";

function updateNickPlaceholder(){
  document.getElementById("nickInput").placeholder = t("banner.nickPlaceholder") + " (" + t("banner.nickSuggestionPrefix") + " " + randomNickSuggestion() + ")";
}

function updateLangButtons(){
  const buttons = document.querySelectorAll("#setupLangButtons button");
  buttons.forEach(function(btn){
    btn.classList.toggle("active", btn.dataset.lang === getLang());
  });
}

function onLanguageChanged(){
  applyStaticText();
  updateNickPlaceholder();
  updateLangButtons();
  refreshDock();
}

function isSetupModalOpen(){
  return !document.getElementById("setupModal").classList.contains("hidden");
}

function openSetupModal(){
  document.getElementById("setupModal").classList.remove("hidden");
}

function closeSetupModal(){
  document.getElementById("setupModal").classList.add("hidden");
}

function switchSetupTab(tab){
  document.querySelectorAll("#setupTabs button").forEach(function(btn){
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    btn.classList.toggle("gold", on);
    btn.classList.toggle("blueT", !on);
  });
  document.getElementById("setupTabLanguage").classList.toggle("hidden", tab !== "language");
  document.getElementById("setupTabMouse").classList.toggle("hidden", tab !== "mouse");
  document.getElementById("setupTabHelp").classList.toggle("hidden", tab !== "help");
}

// Start screen: the player must give a nickname before "ENTER ORBIT"
// unlocks. If a nick was already confirmed in this browser, the field is
// pre-filled and the button is active right away.
export function initBanner(){
  const banner = document.getElementById("banner");
  const nickInput = document.getElementById("nickInput");
  const nickError = document.getElementById("nickError");
  const startBtn = document.getElementById("startBtn");
  const setupBtn = document.getElementById("setupBtn");
  const setupModal = document.getElementById("setupModal");
  const setupCloseBtn = document.getElementById("setupCloseBtn");
  const nickRandomBtn = document.getElementById("nickRandomBtn");
  const invertXCheck = document.getElementById("invertXCheck");
  const invertYCheck = document.getElementById("invertYCheck");
  const swapButtonsCheck = document.getElementById("swapButtonsCheck");

  initUiKit();
  applyStaticText();
  updateNickPlaceholder();
  updateLangButtons();

  invertXCheck.checked = settings.invertX;
  invertYCheck.checked = settings.invertY;
  swapButtonsCheck.checked = settings.swapMouseButtons;

  nickInput.value = hasConfirmedNick() ? myIdentity.nick : "";
  startBtn.disabled = nickInput.value.trim().length === 0;

  nickInput.addEventListener("input", function(){
    startBtn.disabled = nickInput.value.trim().length === 0;
    nickError.classList.add("hidden");
  });

  nickInput.addEventListener("keydown", function(e){
    if(e.key === "Enter" && !startBtn.disabled) startBtn.click();
  });

  startBtn.addEventListener("click", function(){
    if(!confirmNick(nickInput.value)){
      nickError.classList.remove("hidden");
      return;
    }
    nickError.classList.add("hidden");
    banner.classList.add("hidden");
  });

  setupBtn.addEventListener("click", function(){
    openSetupModal();
  });

  setupCloseBtn.addEventListener("click", closeSetupModal);

  // Click on the backdrop (not the box itself) closes the modal.
  setupModal.addEventListener("click", function(e){
    if(e.target === setupModal) closeSetupModal();
  });

  document.querySelectorAll("#setupTabs button").forEach(function(btn){
    btn.addEventListener("click", function(){ switchSetupTab(btn.dataset.tab); });
  });

  nickRandomBtn.addEventListener("click", function(){
    nickInput.value = randomNickSuggestion();
    startBtn.disabled = nickInput.value.trim().length === 0;
    nickInput.focus();
  });

  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!LANGS.includes(btn.dataset.lang)) return;
      setLang(btn.dataset.lang);
      onLanguageChanged();
    });
  });

  invertXCheck.addEventListener("change", function(){
    settings.invertX = invertXCheck.checked;
    saveSettings();
  });
  invertYCheck.addEventListener("change", function(){
    settings.invertY = invertYCheck.checked;
    saveSettings();
  });
  swapButtonsCheck.addEventListener("change", function(){
    settings.swapMouseButtons = swapButtonsCheck.checked;
    saveSettings();
  });

  // Escape closes whichever overlay is topmost first (drone script, then
  // tech/fleet modals, then setup, then the drone/station/planet panel or
  // ship cam), and only once nothing else is open does it reopen/close the
  // start screen itself (e.g. to change nickname or language mid-game).
  window.addEventListener("keydown", function(e){
    if(e.key !== "Escape") return;
    if(isDroneScriptModalOpen()){ closeDroneScriptModal(); return; }
    if(isTechModalOpen()){ closeTechModal(); return; }
    if(isFleetModalOpen()){ closeFleetModal(); return; }
    if(isSetupModalOpen()){ closeSetupModal(); return; }
    if(isDronePanelOpen()){ closeDronePanel(); return; }
    if(isStationPanelOpen()){ closeStationPanel(); return; }
    if(isPlanetPanelOpen()){ closePlanetPanel(); return; }
    if(isShipCamActive()){ clearShipCamTarget(); return; }
    banner.classList.toggle("hidden");
    if(!banner.classList.contains("hidden")) nickInput.focus();
  });

  nickInput.focus();
}
