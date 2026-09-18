import { hasConfirmedNick, confirmNick, randomNickSuggestion, myIdentity } from "../net/identity.js";

// Ekran startowy: gracz musi podać nick, zanim przycisk "WEJDŹ NA ORBITĘ"
// się odblokuje. Jeśli nick był już wcześniej potwierdzony w tej przeglądarce,
// pole jest od razu wypełnione i przycisk aktywny.
export function initBanner(){
  const banner = document.getElementById("banner");
  const nickInput = document.getElementById("nickInput");
  const startBtn = document.getElementById("startBtn");

  nickInput.value = hasConfirmedNick() ? myIdentity.nick : "";
  nickInput.placeholder = "np. " + randomNickSuggestion();
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

  nickInput.focus();
}
