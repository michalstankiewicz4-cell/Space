import { hasConfirmedNick, confirmNick, randomNickSuggestion, myIdentity } from "../net/identity.js";
import { t, getLang, setLang, LANGS } from "../i18n.js";
import { applyStaticText } from "./i18nApply.js";
import { refreshDock } from "./dock.js";
import { settings, saveSettings } from "../settings.js";

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
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.getElementById("setupTabLanguage").classList.toggle("hidden", tab !== "language");
  document.getElementById("setupTabMouse").classList.toggle("hidden", tab !== "mouse");
}

// Start screen: the player must give a nickname before "ENTER ORBIT"
// unlocks. If a nick was already confirmed in this browser, the field is
// pre-filled and the button is active right away.
export function initBanner(){
  const banner = document.getElementById("banner");
  const nickInput = document.getElementById("nickInput");
  const startBtn = document.getElementById("startBtn");
  const setupBtn = document.getElementById("setupBtn");
  const setupModal = document.getElementById("setupModal");
  const setupCloseBtn = document.getElementById("setupCloseBtn");
  const nickRandomBtn = document.getElementById("nickRandomBtn");
  const invertXCheck = document.getElementById("invertXCheck");
  const invertYCheck = document.getElementById("invertYCheck");
  const swapButtonsCheck = document.getElementById("swapButtonsCheck");

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
  });

  nickInput.addEventListener("keydown", function(e){
    if(e.key === "Enter" && !startBtn.disabled) startBtn.click();
  });

  startBtn.addEventListener("click", function(){
    if(!confirmNick(nickInput.value)) return;
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

  // Escape closes the setup modal if it's open; otherwise it reopens/closes
  // the start screen itself (e.g. to change nickname or language mid-game).
  window.addEventListener("keydown", function(e){
    if(e.key !== "Escape") return;
    if(isSetupModalOpen()){ closeSetupModal(); return; }
    banner.classList.toggle("hidden");
    if(!banner.classList.contains("hidden")) nickInput.focus();
  });

  nickInput.focus();
}
