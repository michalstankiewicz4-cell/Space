import { ctx } from "../../core/context.js";
import { setDroneScript, runDroneScript, stopDroneScript } from "../../drone/drone.js";
import { getDroneMode, setDroneMode } from "../../drone/droneMode.js";
import { isDronePanelOpen, closeDronePanel, updateUnitPanel } from "../hud/unitPanel.js";
import { discover } from "../../core/discovery.js";
import { initBlockEditor, openBlockEditor, closeBlockEditor, refreshBlockEditor, compiledBlocks } from "./blockEditor.js";
import { t, onLangChange } from "../../i18n.js";

// The drone script window (the DSL editor, its help, error and log) plus
// the drone's Start/Stop/Script buttons in the HUD's SELECTED UNIT panel —
// that panel itself (and "is the drone selected") is ui/hud/unitPanel.js.
// Also owns the SCRIPT/BLOCKS switch shown in both editor windows: the
// drone keeps a text script AND a block program, and the mode
// (drone/droneMode.js) only decides which one START runs and which window
// the SCRIPT button opens.
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

// Opens whichever editor the current mode uses.
function openDroneEditor(){
  if(getDroneMode() === "blocks") openBlockEditor();
  else openDroneScriptModal();
}

function paintModeSwitches(){
  const mode = getDroneMode();
  document.querySelectorAll(".droneModeSwitch").forEach(function(sw){
    sw.title = t("blocks.modeTitle");
    sw.querySelectorAll("button").forEach(function(b){
      b.textContent = t("blocks.mode." + b.dataset.mode);
      b.classList.toggle("on", b.dataset.mode === mode);
    });
  });
}

function switchMode(mode){
  if(mode === getDroneMode()) return;
  setDroneMode(mode);
  paintModeSwitches();
  closeDroneScriptModal();
  closeBlockEditor();
  openDroneEditor();
}

// Runs the program of the current mode — the text script as typed, or the
// block project compiled to the same language.
function runActive(drone){
  runDroneScript(drone, getDroneMode() === "blocks" ? compiledBlocks() : undefined);
  discover("tech:droneScript");
}

function afterRunOrStop(drone){
  if(isDroneScriptModalOpen()) updateScriptStatus(drone);
  refreshBlockEditor(drone);
  updateUnitPanel(true);
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
  refreshBlockEditor(drone);
}

export function initDroneScript(){
  document.getElementById("droneScriptBtn").addEventListener("click", openDroneEditor);
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

  function run(){ const drone = ctx.drone; if(!drone) return; runActive(drone); afterRunOrStop(drone); }
  function stop(){ const drone = ctx.drone; if(!drone) return; stopDroneScript(drone); afterRunOrStop(drone); }

  // The editor windows' Run/Stop and the SELECTED UNIT panel's START/STOP
  // shortcuts all do the same thing: run or stop the current mode's program.
  document.getElementById("droneScriptRunBtn").addEventListener("click", run);
  document.getElementById("droneScriptStopBtn").addEventListener("click", stop);
  document.getElementById("droneRunBtn").addEventListener("click", run);
  document.getElementById("droneStopBtn").addEventListener("click", stop);
  initBlockEditor(run, stop);

  document.querySelectorAll(".droneModeSwitch button").forEach(function(b){
    b.addEventListener("click", function(){ switchMode(b.dataset.mode); });
  });
  paintModeSwitches();
  onLangChange(paintModeSwitches);
}
