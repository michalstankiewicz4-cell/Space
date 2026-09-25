import { t } from "../../i18n.js";

// The HUD's PLANET INFO panel (#infoPanel) is one slot shared by two
// selections: a planet (ui/hud/planetPanel.js) or the player's station
// (ui/hud/stationPanel.js). Only one owns it at a time — scene/controls.js
// already makes those two selections mutually exclusive — and each owner
// fills in the rows/buttons itself. hideInfo(owner) is a no-op unless that
// owner is the one currently showing, so a late "close planet" can never
// blank a station that has since taken the slot.
let owner = null;       // "planet" | "station" | null
let thumbTarget = null; // () => {pos, radius} | null — for scene/infoThumb.js
let onClose = null;

function el(id){ return document.getElementById(id); }

export function getInfoOwner(){
  return owner;
}

export function showInfo(who, opts){
  owner = who;
  thumbTarget = opts.thumbTarget || null;
  onClose = opts.onClose || null;
  el("infoEmpty").classList.add("hidden");
  el("infoBody").classList.remove("hidden");
  el("infoCloseBtn").classList.remove("hidden");
}

export function hideInfo(who){
  if(owner !== who) return;
  owner = null;
  thumbTarget = null;
  onClose = null;
  el("infoBody").classList.add("hidden");
  el("infoCloseBtn").classList.add("hidden");
  el("infoEmpty").classList.remove("hidden");
  el("infoHd").textContent = t("hud.planetInfo");
}

export function getInfoThumbTarget(){
  return thumbTarget ? thumbTarget() : null;
}

// One of the three label/value rows. `barFrac` (0..1) shows the row's bar
// and puts the value right-aligned as a percentage-style readout.
export function setInfoRow(i, label, value, barFrac){
  const row = el("infoRow" + i);
  row.querySelector("span").textContent = label;
  row.querySelector("b").textContent = value;
  const bar = row.querySelector(".bar");
  if(bar){
    const hasBar = barFrac != null;
    bar.classList.toggle("hidden", !hasBar);
    row.classList.toggle("hasBar", hasBar);
    if(hasBar) bar.querySelector("i").style.width = (Math.max(0, Math.min(1, barFrac)) * 100).toFixed(1) + "%";
  }
}

// btns: [{text, onClick?}] for infoBtnA/B/C; a missing entry hides that
// button, an entry without onClick is shown as not-yet-available.
const handlers = {};
export function setInfoButtons(btns){
  ["infoBtnA", "infoBtnB", "infoBtnC"].forEach(function(id, i){
    const b = el(id);
    const spec = btns[i];
    b.classList.toggle("hidden", !spec);
    if(!spec) return;
    b.textContent = spec.text;
    b.classList.toggle("soon", !spec.onClick);
    b.title = spec.onClick ? "" : t("soon");
    handlers[id] = spec.onClick || null;
  });
}

export function initInfoPanel(){
  ["infoBtnA", "infoBtnB", "infoBtnC"].forEach(function(id){
    el(id).addEventListener("click", function(){ if(handlers[id]) handlers[id](); });
  });
  // pointerdown, not click — a press/release that drifts a couple pixels
  // across a small button's edge can silently fail to fire "click" (see
  // ui/hud/unitPanel.js's history with the old drone panel's close button).
  el("infoCloseBtn").addEventListener("pointerdown", function(e){
    e.stopPropagation();
    if(onClose) onClose();
  });
}
