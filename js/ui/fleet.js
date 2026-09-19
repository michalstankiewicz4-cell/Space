import { ctx } from "../core/context.js";
import { setShipCamTarget } from "../scene/shipcam.js";
import { t } from "../i18n.js";

function renderFleetList(){
  const el = document.getElementById("fleetListEl");
  el.innerHTML = "";
  ctx.ships.forEach(function(sh, i){
    const li = document.createElement("li");
    li.textContent = "🚀 " + t("fleet.ship")(i + 1);
    li.addEventListener("click", function(){
      setShipCamTarget(sh);
      closeFleetModal();
    });
    el.appendChild(li);
  });
}

export function isFleetModalOpen(){
  return !document.getElementById("fleetModal").classList.contains("hidden");
}

export function openFleetModal(){
  renderFleetList();
  document.getElementById("fleetModal").classList.remove("hidden");
}

export function closeFleetModal(){
  document.getElementById("fleetModal").classList.add("hidden");
}

export function initFleet(){
  document.getElementById("fleetBtn").addEventListener("click", openFleetModal);
  document.getElementById("fleetCloseBtn").addEventListener("click", closeFleetModal);
  document.getElementById("fleetModal").addEventListener("click", function(e){
    if(e.target.id === "fleetModal") closeFleetModal();
  });
}
