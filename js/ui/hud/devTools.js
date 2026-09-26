import { setLightMarkersVisible } from "../../scene/lightMarkers.js";
import { setDistanceLinesVisible } from "../../scene/planetDistanceLines.js";
import { setLightsDisabled } from "../../scene/lightsToggle.js";
import { svgIcon } from "../icons.js";
import { initPerfStats, setPerfStatsVisible, perfStatsVisible } from "./perfStats.js";

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
  initPerfStats();
  const perfCheck = document.getElementById("devPerfCheck");
  perfCheck.checked = perfStatsVisible();
  perfCheck.addEventListener("change", function(e){
    setPerfStatsVisible(e.target.checked);
  });
}
