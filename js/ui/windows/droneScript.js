import { ctx } from "../../core/context.js";
import { runUnitProgram, stopUnitProgram } from "../../program/runner.js";
import { getUnitScript, setUnitScript, getUnitMode, setUnitMode, unitBlocksKey, activeProgramSource } from "../../program/unitPrograms.js";
import { useProject } from "../../blocks/blockProject.js";
import { planUnitRoute } from "../../scene/trajectories.js";
import { isDronePanelOpen, closeDronePanel, updateUnitPanel, getProgramUnit } from "../hud/unitPanel.js";
import { discover } from "../../core/discovery.js";
import { scriptFeatures } from "../../drone/scriptFeatures.js";
import { initBlockEditor, openBlockEditor, closeBlockEditor, refreshBlockEditor } from "./blockEditor.js";
import { t, onLangChange } from "../../i18n.js";

// The program windows of a programmable unit — the drone or a swarm ship —
// the text-script window (the DSL editor, its help, error and log) plus
// the Start/Stop/Script buttons in the HUD's SELECTED UNIT panel (that
// panel, and which unit it shows, is ui/hud/unitPanel.js). Also owns the
// SCRIPT/BLOCKS switch shown in both editor windows: every unit keeps a
// text script AND a block program (program/unitPrograms.js), and its mode
// only decides which one START runs and which window SCRIPT opens.
//
// The panel's buttons act on the unit the panel shows; the editor windows
// on the unit they were opened for (editorUnit).
let editorUnit = null;

function unitAlive(u){ return !!u && (u === ctx.drone || ctx.ships.indexOf(u) >= 0); }

function unitTitle(u){
  return u === ctx.drone ? null : ctx.ships.indexOf(u) + 1;
}

export function isDroneScriptModalOpen(){
  return !document.getElementById("droneScriptModal").classList.contains("hidden");
}

function updateScriptStatus(u){
  const errEl = document.getElementById("droneScriptError");
  if(u.error){
    errEl.textContent = u.error;
    errEl.classList.remove("hidden");
  } else {
    errEl.classList.add("hidden");
  }
  document.getElementById("droneScriptLog").textContent = u.logs.join("\n");
}

function paintTitles(){
  const n = editorUnit && unitAlive(editorUnit) ? unitTitle(editorUnit) : null;
  document.getElementById("droneScriptModalTitle").textContent = n ? t("drone.scriptTitleShip")(n) : t("drone.scriptTitle");
}

function blocksTitle(){
  const n = editorUnit && unitAlive(editorUnit) ? unitTitle(editorUnit) : null;
  return n ? t("blocks.titleShip")(n) : t("blocks.title");
}

function openScriptModal(u){
  document.getElementById("droneScriptInput").value = getUnitScript(u);
  updateScriptStatus(u);
  paintTitles();
  document.getElementById("droneScriptModal").classList.remove("hidden");
}

export function closeDroneScriptModal(){
  document.getElementById("droneScriptModal").classList.add("hidden");
}

// Opens whichever editor the unit's mode uses, for that unit.
function openEditorFor(u){
  if(!u) return;
  editorUnit = u;
  paintModeSwitches();
  if(getUnitMode(u) === "blocks"){
    useProject(unitBlocksKey(u));
    openBlockEditor(blocksTitle);
  } else {
    openScriptModal(u);
  }
}

function paintModeSwitches(){
  const mode = editorUnit ? getUnitMode(editorUnit) : "script";
  document.querySelectorAll(".droneModeSwitch").forEach(function(sw){
    sw.title = t("blocks.modeTitle");
    sw.querySelectorAll("button").forEach(function(b){
      b.textContent = t("blocks.mode." + b.dataset.mode);
      b.classList.toggle("on", b.dataset.mode === mode);
    });
  });
}

function switchMode(mode){
  const u = editorUnit;
  if(!unitAlive(u) || mode === getUnitMode(u)) return;
  setUnitMode(u, mode);
  closeDroneScriptModal();
  closeBlockEditor();
  openEditorFor(u);
}

// Runs the unit's program of its current mode — the text script as typed,
// or the block project compiled to the same language — after fixing the
// route it will fly (scene/trajectories.js). Also fills in the Wiki:
// every command the program uses counts as discovered once the program
// actually starts (not on a parse error).
function runActive(u){
  const blocks = getUnitMode(u) === "blocks";
  const src = activeProgramSource(u);
  planUnitRoute(u);
  runUnitProgram(u, src);
  discover("tech:droneScript");
  if(u.error && !u.running) return;
  scriptFeatures(src).forEach(function(k){ discover("prog:" + k); });
  if(blocks) discover("prog:cmdBlocks");
}

function afterRunOrStop(u){
  if(isDroneScriptModalOpen() && u === editorUnit) updateScriptStatus(u);
  refreshBlockEditor(editorUnit);
  updateUnitPanel(true);
}

// Called every ~0.4s alongside the other HUD refreshes (ui/hud/hud.js) —
// the units' stats themselves are shown by ui/hud/unitPanel.js.
export function refreshDroneScript(){
  if(!ctx.drone && isDronePanelOpen()) closeDronePanel();
  if(editorUnit && !unitAlive(editorUnit)){        // destroyed while its editor was open
    editorUnit = null;
    closeDroneScriptModal();
    closeBlockEditor();
    return;
  }
  if(!editorUnit) return;
  if(isDroneScriptModalOpen()) updateScriptStatus(editorUnit);
  refreshBlockEditor(editorUnit);
}

export function initDroneScript(){
  document.getElementById("droneScriptBtn").addEventListener("click", function(){ openEditorFor(getProgramUnit()); });
  document.getElementById("droneScriptCloseBtn").addEventListener("click", closeDroneScriptModal);

  // Save on every keystroke, not just on Run - closing the editor (or
  // using the side panel's Run/Stop shortcuts right after) used to lose
  // whatever was typed since the last Run.
  document.getElementById("droneScriptInput").addEventListener("input", function(e){
    if(unitAlive(editorUnit)) setUnitScript(editorUnit, e.target.value);
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

  function run(u){ if(!unitAlive(u)) return; runActive(u); afterRunOrStop(u); }
  function stop(u){ if(!unitAlive(u)) return; stopUnitProgram(u); afterRunOrStop(u); }

  // The editor windows' Run/Stop act on their unit; the SELECTED UNIT
  // panel's START/STOP on the unit it shows.
  document.getElementById("droneScriptRunBtn").addEventListener("click", function(){ run(editorUnit); });
  document.getElementById("droneScriptStopBtn").addEventListener("click", function(){ stop(editorUnit); });
  document.getElementById("droneRunBtn").addEventListener("click", function(){ run(getProgramUnit()); });
  document.getElementById("droneStopBtn").addEventListener("click", function(){ stop(getProgramUnit()); });
  initBlockEditor(function(){ run(editorUnit); }, function(){ stop(editorUnit); });

  document.querySelectorAll(".droneModeSwitch button").forEach(function(b){
    b.addEventListener("click", function(){ switchMode(b.dataset.mode); });
  });
  paintModeSwitches();
  onLangChange(function(){ paintModeSwitches(); paintTitles(); });
}
