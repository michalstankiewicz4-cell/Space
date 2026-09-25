import { ctx } from "../../core/context.js";
import { setShipCamTarget } from "../../scene/shipcam.js";
import { setShipSelected } from "../../ships/swarm.js";
import { clearSelection } from "../../scene/controls.js";
import { setDroneSelected } from "../../drone/drone.js";
import { openDronePanel } from "../hud/unitPanel.js";
import { t } from "../../i18n.js";

// The Fleet window (opened from the HUD's FLEET nav button and the
// station's Fleet button) — the same list as the always-visible FLEET
// LIST panel (ui/hud/fleetList.js), in a centered window.
function renderFleetList(){
  const el = document.getElementById("fleetListEl");
  el.innerHTML = "";
  ctx.ships.forEach(function(sh, i){
    const li = document.createElement("li");
    li.textContent = "🚀 " + t("fleet.ship")(i + 1);
    li.addEventListener("click", function(){
      // Same effect as clicking this ship directly in the world (see
      // scene/controls.js): clears any existing selection first, so it
      // exclusively selects this one ship, not just adds to whatever was
      // already selected.
      clearSelection();
      setShipSelected(sh, true);
      setShipCamTarget(sh);
      closeFleetModal();
    });
    el.appendChild(li);
  });
  // The drone isn't in ctx.ships (see docs/architecture.md) and has no ship-cam view
  // of its own - clicking it selects it and shows it in the SELECTED UNIT
  // panel instead, the same as clicking it directly in the world.
  if(ctx.drone){
    const li = document.createElement("li");
    li.textContent = "🛰 " + t("drone.title");
    li.addEventListener("click", function(){
      clearSelection();
      setDroneSelected(ctx.drone, true);
      openDronePanel();
      closeFleetModal();
    });
    el.appendChild(li);
  }
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
  document.getElementById("fleetCloseBtn").addEventListener("click", closeFleetModal);
  document.getElementById("fleetModal").addEventListener("click", function(e){
    if(e.target.id === "fleetModal") closeFleetModal();
  });
}
