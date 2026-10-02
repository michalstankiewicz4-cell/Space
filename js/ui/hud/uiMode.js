import { t } from "../../i18n.js";
import { toggleLines } from "../../scene/linesToggle.js";
import { settings } from "../../settings.js";

// Hiding the interface (key C, the user's design). C steps through:
//   1  panels hidden (the command bar too); the 3D view's own buttons —
//      RETURN TO BASE, BASE/SYSTEM, the orbits toggle — stay where they are
//   2  only BASE/SYSTEM and the minimap
//   3  nothing but space
//   0  everything back
// Escape also brings everything back (ui/escapeKey.js). While anything is
// hidden the 3D scene fills the whole window (scene/viewRect.js#getViewRect);
// the HUD's own elements keep their places. The mode is body[data-ui]
// (css/ui/hud/hud.css). Also here: key O, orbits and trajectories on/off,
// and hiding when idle (Setup -> Mouse, settings.uiAutoHideS seconds, 0 =
// never): mode 3 on top of the player's own mode until the next mouse move,
// click, scroll or key — no hint, it isn't the player's choice.
let mode = 0, hintEl = null, hintTimer = 0;
let autoHidden = false, lastActivity = performance.now();

export function uiMode(){ return autoHidden ? 3 : mode; }
export function isUiHidden(){ return mode !== 0 || autoHidden; }

function applyMode(){
  const m = uiMode();
  if(m) document.body.dataset.ui = String(m);
  else delete document.body.dataset.ui;
}

function setMode(m){
  mode = m;
  applyMode();
  showHint();
}

export function showUi(){ autoHidden = false; setMode(0); }
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

// Not on the start screen or with a window/Setup open.
function inGameView(){
  if(!document.getElementById("banner").classList.contains("hidden")) return false;
  if(!document.getElementById("setupModal").classList.contains("hidden")) return false;
  return !document.querySelector(".uiWindow:not(.hidden)");
}

// Keys: in the game view only, not while typing, and never with a modifier
// (Ctrl+C is copy).
export function keysAllowed(e){
  if(e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  const el = e.target;
  if(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  return inGameView();
}

function onActivity(){
  lastActivity = performance.now();
  if(autoHidden){ autoHidden = false; applyMode(); }
}

function checkIdle(){
  const s = Number(settings.uiAutoHideS) || 0;
  if(!s || autoHidden || mode === 3) return;
  if(performance.now() - lastActivity < s * 1000 || !inGameView()) return;
  autoHidden = true;
  applyMode();
}

export function initUiMode(){
  ["pointermove", "pointerdown", "wheel", "touchstart"].forEach(function(ev){
    window.addEventListener(ev, onActivity, { capture: true, passive: true });
  });
  // A key that wakes the interface does only that (else Escape would also
  // open the start screen, C step the mode).
  window.addEventListener("keydown", function(e){
    const wasHidden = autoHidden;
    onActivity();
    if(wasHidden){ e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  setInterval(checkIdle, 250);
  window.addEventListener("keydown", function(e){
    if(e.code !== "KeyC" && e.code !== "KeyO") return;
    if(!keysAllowed(e)) return;
    e.preventDefault();
    if(e.code === "KeyC") cycleUi();
    else toggleLines();
  });
}
