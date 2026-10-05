import { setLightMarkersVisible } from "../../scene/lightMarkers.js";
import { setDistanceLinesVisible } from "../../scene/planetDistanceLines.js";
import { setLightsDisabled } from "../../scene/lightsToggle.js";
import { svgIcon } from "../icons.js";
import { initPerfStats, setPerfStatsVisible, perfStatsVisible } from "./perfStats.js";
import { t, onLangChange } from "../../i18n.js";

// The labs: one button, their start screen (labs.html — every lab and tool
// is a tile there), opened in a new tab. A button, not a link: no URL shown
// on hover.
const LABS = [
  ["labs.html", "all", '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'],
];
function renderLabs(){
  const box = document.getElementById("devLabs");
  box.textContent = "";
  LABS.forEach(function(l){
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + l[2] + "</svg>";
    const span = document.createElement("span");
    span.textContent = t("devTools.lab." + l[1]);
    b.appendChild(span);
    b.addEventListener("click", function(){ window.open(l[0], "_blank", "noopener"); });
    box.appendChild(b);
  });
}

// Small always-available debug menu (the wrench in the 3D viewport's
// bottom-right corner) — see scene/lightMarkers.js,
// scene/planetDistanceLines.js, scene/lightsToggle.js and ./perfStats.js
// for what each toggle actually does.
export function initDevTools(){
  const btn = document.getElementById("devToolsBtn");
  const menu = document.getElementById("devToolsMenu");
  btn.innerHTML = svgIcon("wrench");
  btn.addEventListener("click", function(){
    menu.classList.toggle("hidden");
  });

  document.getElementById("devLightsCheck").addEventListener("change", function(e){
    setLightMarkersVisible(e.target.checked);
  });
  document.getElementById("devDistanceCheck").addEventListener("change", function(e){
    setDistanceLinesVisible(e.target.checked);
  });
  document.getElementById("devNoLightsCheck").addEventListener("change", function(e){
    setLightsDisabled(e.target.checked);
  });
  renderLabs();
  onLangChange(renderLabs);
  initPerfStats();
  const perfCheck = document.getElementById("devPerfCheck");
  perfCheck.checked = perfStatsVisible();
  perfCheck.addEventListener("change", function(e){
    setPerfStatsVisible(e.target.checked);
  });
}
