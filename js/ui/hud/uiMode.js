import { t } from "../../i18n.js";
import { toggleLines } from "../../scene/linesToggle.js";

// Hiding the interface (key C, the user's design). C steps through:
//   1  panels hidden (the command bar too); the 3D view's own buttons —
//      RETURN TO BASE, BASE/SYSTEM, the orbits toggle — stay where they are
//   2  only BASE/SYSTEM and the minimap
//   3  nothing but space
//   0  everything back
// Escape also brings everything back (ui/escapeKey.js). While anything is
// hidden the 3D scene fills the whole window (scene/viewRect.js#getViewRect);
// the HUD's own elements keep their places. The mode is body[data-ui]
// (css/ui/hud/hud.css). Also here: key O, orbits and trajectories on/off.
let mode = 0, hintEl = null, hintTimer = 0;

export function uiMode(){ return mode; }
export function isUiHidden(){ return mode !== 0; }

function setMode(m){
  mode = m;
  if(m) document.body.dataset.ui = String(m);
  else delete document.body.dataset.ui;
  showHint();
}

export function showUi(){ setMode(0); }
function cycleUi(){ setMode((mode + 1) % 4); }

function showHint(){
  if(!hintEl){
    hintEl = document.createElement("div");
    hintEl.id = "uiModeHint";
    document.body.appendChild(hintEl);
  }
  hintEl.textContent = t("uiMode.hint")(mode);
  hintEl.classList.add("on");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(function(){ hintEl.classList.remove("on"); }, 1400);
}

// Not while typing, not on the start screen or with a window/Setup open,
// and never with a modifier (Ctrl+C is copy).
function keysAllowed(e){
  if(e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  const el = e.target;
  if(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  if(!document.getElementById("banner").classList.contains("hidden")) return false;
  if(!document.getElementById("setupModal").classList.contains("hidden")) return false;
  return !document.querySelector(".uiWindow:not(.hidden)");
}

export function initUiMode(){
  window.addEventListener("keydown", function(e){
    if(e.code !== "KeyC" && e.code !== "KeyO") return;
    if(!keysAllowed(e)) return;
    e.preventDefault();
    if(e.code === "KeyC") cycleUi();
    else toggleLines();
  });
}
