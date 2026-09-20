import { ctx } from "../core/context.js";
import { setDroneScript, runDroneScript, stopDroneScript, setDroneSelected } from "../drone/drone.js";
import { t } from "../i18n.js";

export function isDronePanelOpen(){
  return !document.getElementById("dronePanel").classList.contains("hidden");
}

// Panel visibility tracks selection, RTS-style: selecting the drone (see
// scene/controls.js) opens it, deselecting — via the close button, Escape,
// or selecting/clicking something else — closes it. The camera never
// reacts to any of this; only the ring + this panel do.
export function openDronePanel(){
  document.getElementById("dronePanel").classList.remove("hidden");
}

export function closeDronePanel(){
  document.getElementById("dronePanel").classList.add("hidden");
  if(ctx.drone) setDroneSelected(ctx.drone, false);
}

export function isDroneScriptModalOpen(){
  return !document.getElementById("droneScriptModal").classList.contains("hidden");
}

function updateScriptStatus(drone){
  const errEl = document.getElementById("droneScriptError");
  if(drone.error){
    errEl.textContent = drone.error;
    errEl.classList.remove("hidden");
  } else {
    errEl.classList.add("hidden");
  }
  document.getElementById("droneScriptLog").textContent = drone.logs.join("\n");
}

function openDroneScriptModal(){
  const drone = ctx.drone;
  if(!drone) return;
  document.getElementById("droneScriptInput").value = drone.script || "";
  updateScriptStatus(drone);
  document.getElementById("droneScriptModal").classList.remove("hidden");
}

export function closeDroneScriptModal(){
  document.getElementById("droneScriptModal").classList.add("hidden");
}

// Called every ~0.4s from main.js's tick alongside the other HUD refreshes
// (telemetry, players list) — not on every frame, a stats panel doesn't
// need 60fps updates.
export function refreshDronePanel(){
  const drone = ctx.drone;
  if(!drone){
    closeDronePanel();
    return;
  }
  document.getElementById("droneFuelVal").textContent = Math.round(drone.fuel) + " / " + drone.maxFuel;
  document.getElementById("droneAttackVal").textContent = String(drone.attackPower);
  document.getElementById("droneDefenseVal").textContent = String(drone.defense);
  document.getElementById("droneStatusVal").textContent =
    drone.error ? t("drone.error") : (drone.running ? t("drone.running") : t("drone.idle"));
  if(isDroneScriptModalOpen()) updateScriptStatus(drone);
}

export function initDronePanel(){
  document.getElementById("droneCloseBtn").addEventListener("click", closeDronePanel);
  document.getElementById("droneScriptBtn").addEventListener("click", openDroneScriptModal);
  document.getElementById("droneScriptCloseBtn").addEventListener("click", closeDroneScriptModal);

  document.getElementById("droneScriptHelpBtn").addEventListener("click", function(){
    const help = document.getElementById("droneScriptHelp");
    const nowOpen = help.classList.toggle("hidden") === false;
    this.classList.toggle("active", nowOpen);
  });

  const modal = document.getElementById("droneScriptModal");
  modal.addEventListener("click", function(e){
    if(e.target === modal) closeDroneScriptModal();
  });

  document.getElementById("droneScriptRunBtn").addEventListener("click", function(){
    const drone = ctx.drone;
    if(!drone) return;
    setDroneScript(drone, document.getElementById("droneScriptInput").value);
    runDroneScript(drone);
    updateScriptStatus(drone);
  });

  document.getElementById("droneScriptStopBtn").addEventListener("click", function(){
    const drone = ctx.drone;
    if(!drone) return;
    stopDroneScript(drone);
    updateScriptStatus(drone);
  });
}
