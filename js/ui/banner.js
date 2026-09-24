import { hasConfirmedNick, confirmNick, randomNickSuggestion, myIdentity } from "../net/identity.js";
import { t, onLangChange } from "../i18n.js";
import { openSetupModal } from "./setupModal.js";

// Start screen: the player must give a nickname before "ENTER ORBIT"
// unlocks. If a nick was already confirmed in this browser, the field is
// pre-filled and the button is active right away.

function updateNickPlaceholder(){
  document.getElementById("nickInput").placeholder = t("banner.nickPlaceholder") + " (" + t("banner.nickSuggestionPrefix") + " " + randomNickSuggestion() + ")";
}

function updateStartEnabled(){
  const nickInput = document.getElementById("nickInput");
  document.getElementById("startBtn").disabled = nickInput.value.trim().length === 0;
}

export function isBannerOpen(){
  return !document.getElementById("banner").classList.contains("hidden");
}

// Reopened mid-game with Escape (e.g. to change nickname or language).
export function toggleBanner(){
  document.getElementById("banner").classList.toggle("hidden");
  if(isBannerOpen()) document.getElementById("nickInput").focus();
}

export function initBanner(){
  const banner = document.getElementById("banner");
  const nickInput = document.getElementById("nickInput");
  const nickError = document.getElementById("nickError");
  const startBtn = document.getElementById("startBtn");

  updateNickPlaceholder();
  onLangChange(updateNickPlaceholder);

  nickInput.value = hasConfirmedNick() ? myIdentity.nick : "";
  updateStartEnabled();

  nickInput.addEventListener("input", function(){
    updateStartEnabled();
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

  document.getElementById("nickRandomBtn").addEventListener("click", function(){
    nickInput.value = randomNickSuggestion();
    updateStartEnabled();
    nickInput.focus();
  });

  document.getElementById("setupBtn").addEventListener("click", openSetupModal);

  nickInput.focus();
}
