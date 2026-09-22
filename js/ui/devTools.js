import { setLightMarkersVisible } from "../scene/lightMarkers.js";
import { setDistanceLinesVisible } from "../scene/planetDistanceLines.js";

// Small always-available debug menu (bottom-right) — see scene/lightMarkers.js
// and scene/planetDistanceLines.js for what each checkbox actually draws.
// Same "small button toggles a popup via classList" shape as the Wiki
// button/#legend (see ui/panels.js#initPanels).
export function initDevTools(){
  const btn = document.getElementById("devToolsBtn");
  const menu = document.getElementById("devToolsMenu");
  btn.addEventListener("click", function(){
    menu.classList.toggle("hidden");
  });

  document.getElementById("devLightsCheck").addEventListener("change", function(e){
    setLightMarkersVisible(e.target.checked);
  });
  document.getElementById("devDistanceCheck").addEventListener("change", function(e){
    setDistanceLinesVisible(e.target.checked);
  });
}
