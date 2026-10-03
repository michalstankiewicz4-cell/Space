import { setLightMarkersVisible } from "../../scene/lightMarkers.js";
import { setDistanceLinesVisible } from "../../scene/planetDistanceLines.js";
import { setLightsDisabled } from "../../scene/lightsToggle.js";
import { svgIcon } from "../icons.js";
import { initPerfStats, setPerfStatsVisible, perfStatsVisible } from "./perfStats.js";
import { t, onLangChange } from "../../i18n.js";

// The labs (docs: ship.md, bodies.md, systems.md, scale.md, skins.md): one
// button each, opened in a new tab. Buttons, not links: no URL shown on hover.
const LABS = [
  ["ship.html", "ship", '<path d="M12 3 L18 20 L12 16 L6 20 Z"/>'],
  ["bodies.html", "bodies", '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-20 12 12)"/>'],
  ["systems.html", "systems", '<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>'],
  ["scale.html", "scale", '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 8 V11 M9.5 8 V12.5 M13 8 V11 M16.5 8 V12.5"/>'],
  ["skins.html", "skins", '<path d="M12 3 C6.5 3 3 7 3 11.5 C3 16 6.5 20 11 20 C12.5 20 13 19 12.5 17.8 C12 16.5 13 15.5 14.3 15.5 H16.5 C19 15.5 21 13.5 21 11 C21 6.5 17 3 12 3 Z"/><circle cx="7.8" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="7.3" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.6" r="1.2" fill="currentColor"/>'],
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
