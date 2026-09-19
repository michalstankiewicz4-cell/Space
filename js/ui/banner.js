import { hasConfirmedNick, confirmNick, randomNickSuggestion, myIdentity } from "../net/identity.js";
import { t, getLang, setLang, LANGS } from "../i18n.js";
import { applyStaticText } from "./i18nApply.js";
import { refreshDock } from "./dock.js";

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

// Start screen: the player must give a nickname before "ENTER ORBIT"
// unlocks. If a nick was already confirmed in this browser, the field is
// pre-filled and the button is active right away.
export function initBanner(){
  const banner = document.getElementById("banner");
  const nickInput = document.getElementById("nickInput");
  const startBtn = document.getElementById("startBtn");
  const setupBtn = document.getElementById("setupBtn");
  const setupPanel = document.getElementById("setupPanel");

  applyStaticText();
  updateNickPlaceholder();
  updateLangButtons();

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
    setupPanel.classList.toggle("hidden");
  });

  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!LANGS.includes(btn.dataset.lang)) return;
      setLang(btn.dataset.lang);
      onLanguageChanged();
    });
  });

  nickInput.focus();
}
