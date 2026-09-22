import { setLightMarkersVisible } from "../scene/lightMarkers.js";
import { setDistanceLinesVisible } from "../scene/planetDistanceLines.js";
import { setLightsDisabled } from "../scene/lightsToggle.js";

// Small always-available debug menu (bottom-right) — see scene/lightMarkers.js,
// scene/planetDistanceLines.js and scene/lightsToggle.js for what each
// checkbox actually does. Same "small button toggles a popup via classList"
// shape as the Wiki button/#legend (see ui/panels.js#initPanels).
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
  document.getElementById("devNoLightsCheck").addEventListener("change", function(e){
    setLightsDisabled(e.target.checked);
  });
}
