import { ctx } from "../../core/context.js";
import { setDroneScript, runDroneScript, stopDroneScript } from "../../drone/drone.js";
import { isDronePanelOpen, closeDronePanel, updateUnitPanel } from "../hud/unitPanel.js";

// The drone script window (the DSL editor, its help, error and log) plus
// the drone's Start/Stop/Script buttons in the HUD's SELECTED UNIT panel —
// that panel itself (and "is the drone selected") is ui/hud/unitPanel.js.
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

// Called every ~0.4s alongside the other HUD refreshes (ui/hud/hud.js) —
// the drone's stats themselves are shown by ui/hud/unitPanel.js.
export function refreshDroneScript(){
  const drone = ctx.drone;
  if(!drone){
    if(isDronePanelOpen()) closeDronePanel();
    return;
  }
  if(isDroneScriptModalOpen()) updateScriptStatus(drone);
}

export function initDroneScript(){
  document.getElementById("droneScriptBtn").addEventListener("click", openDroneScriptModal);
  document.getElementById("droneScriptCloseBtn").addEventListener("click", closeDroneScriptModal);

  // Save on every keystroke, not just on Run - closing the editor (or
  // using the side panel's Run/Stop shortcuts right after) used to lose
  // whatever was typed since the last Run.
  document.getElementById("droneScriptInput").addEventListener("input", function(e){
    if(ctx.drone) setDroneScript(ctx.drone, e.target.value);
  });

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
    runDroneScript(drone);
    updateScriptStatus(drone);
  });

  document.getElementById("droneScriptStopBtn").addEventListener("click", function(){
    const drone = ctx.drone;
    if(!drone) return;
    stopDroneScript(drone);
    updateScriptStatus(drone);
  });

  // Side-panel shortcuts: re-run/stop the last saved script without
  // opening the editor. Reuse the drone's already-stored .script (set the
  // last time it was edited+run from the modal) — nothing to read from a
  // textarea here.
  document.getElementById("droneRunBtn").addEventListener("click", function(){
    const drone = ctx.drone;
    if(!drone) return;
    runDroneScript(drone);
    if(isDroneScriptModalOpen()) updateScriptStatus(drone);
    updateUnitPanel(true);
  });

  document.getElementById("droneStopBtn").addEventListener("click", function(){
    const drone = ctx.drone;
    if(!drone) return;
    stopDroneScript(drone);
    if(isDroneScriptModalOpen()) updateScriptStatus(drone);
    updateUnitPanel(true);
  });
}
