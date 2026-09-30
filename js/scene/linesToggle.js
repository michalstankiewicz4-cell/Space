import { ctx } from "../core/context.js";
import { settings, saveSettings } from "../settings.js";
import { t, onLangChange } from "../i18n.js";
import { ORBIT_LAYER } from "./orbitLines.js";
import { TRAJECTORY_LAYER } from "./trajectories.js";

// Every orbit, comet path and trajectory line on or off at once: the 3D
// view's top-right button (and key O). The lines sit on two layers of
// their own (orbitLines.js, trajectories.js); this only switches those
// layers on the main camera — nothing is rebuilt. Kept in settings.
let btn = null;

function linesShown(){ return settings.showLines !== false; }

function apply(){
  const on = linesShown();
  [ORBIT_LAYER, TRAJECTORY_LAYER].forEach(function(l){
    if(on) ctx.camera.layers.enable(l); else ctx.camera.layers.disable(l);
  });
  if(btn){
    btn.classList.toggle("gold", on);
    btn.classList.toggle("blueT", !on);
    btn.textContent = t(on ? "camera.linesOn" : "camera.linesOff");
    btn.title = t("camera.linesTip");
  }
}

export function toggleLines(){
  settings.showLines = !linesShown();
  saveSettings();
  apply();
}

export function initLinesToggle(){
  btn = document.getElementById("linesToggleBtn");
  btn.addEventListener("click", toggleLines);
  onLangChange(apply);
  apply();
}
