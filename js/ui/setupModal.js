import { getLang, setLang, onLangChange, LANGS } from "../i18n.js";
import { settings, saveSettings } from "../settings.js";

// Setup modal (language / mouse / help tabs), opened from the start screen.

function updateLangButtons(){
  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.classList.toggle("active", btn.dataset.lang === getLang());
  });
}

// The active tab gets the gold material, the rest blue (see css/ui/kit.css).
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

export function isSetupModalOpen(){
  return !document.getElementById("setupModal").classList.contains("hidden");
}

export function openSetupModal(){
  document.getElementById("setupModal").classList.remove("hidden");
}

export function closeSetupModal(){
  document.getElementById("setupModal").classList.add("hidden");
}

function bindSettingCheckbox(id, key){
  const check = document.getElementById(id);
  check.checked = settings[key];
  check.addEventListener("change", function(){
    settings[key] = check.checked;
    saveSettings();
  });
}

export function initSetupModal(){
  const setupModal = document.getElementById("setupModal");

  updateLangButtons();
  onLangChange(updateLangButtons);

  document.getElementById("setupCloseBtn").addEventListener("click", closeSetupModal);

  // Click on the backdrop (not the box itself) closes the modal.
  setupModal.addEventListener("click", function(e){
    if(e.target === setupModal) closeSetupModal();
  });

  document.querySelectorAll("#setupTabs button").forEach(function(btn){
    btn.addEventListener("click", function(){ switchSetupTab(btn.dataset.tab); });
  });

  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(LANGS.includes(btn.dataset.lang)) setLang(btn.dataset.lang);
    });
  });

  bindSettingCheckbox("invertXCheck", "invertX");
  bindSettingCheckbox("invertYCheck", "invertY");
  bindSettingCheckbox("swapButtonsCheck", "swapMouseButtons");
}
