import { bodyVariantKey, bodyValueEstimate } from "../../world/bodyParams.js";
import { t } from "../../i18n.js";
import { showInfo, hideInfo, getInfoOwner, setInfoRow, setInfoButtons } from "./infoPanel.js";
import { discover } from "../../core/discovery.js";

// Which planet the PLANET INFO panel is currently showing — module-local,
// not on ctx, since (unlike the drone/station) this is transient UI focus
// rather than a world singleton: scene/controls.js's planetSelectionOrder
// can hold several selected planets at once (for Dev Tools' distance
// line), and this only ever points at the most-recently (de)selected one.
let currentPlanet = null;

export function isPlanetPanelOpen(){
  return getInfoOwner() === "planet";
}

export function openPlanetPanel(p){
  currentPlanet = p;
  discover("body:" + bodyVariantKey(p));
  showInfo("planet", {
    thumbTarget: function(){
      return currentPlanet && !currentPlanet.dying ? { pos: currentPlanet.mesh.position, radius: currentPlanet.radius } : null;
    },
    onClose: closePlanetPanel
  });
  refreshPlanetPanel();
}

// Deliberately does NOT deselect the planet (unlike closeDronePanel/
// closeStationPanel, which do) — planets support multi-select, and closing
// this "what am I looking at" panel shouldn't also discard a multi-select
// someone's building for the distance-line tool. The only ways to actually
// deselect a planet are clicking elsewhere (clearSelection) or shift-
// clicking it again (see scene/controls.js).
export function closePlanetPanel(){
  currentPlanet = null;
  hideInfo("planet");
}

// Called every ~0.4s from ui/hud/hud.js, and re-derives every text from
// t() each time, so switching language while the panel is open updates it
// too (applyStaticText() has no reference to these dynamic fields).
export function refreshPlanetPanel(){
  if(!isPlanetPanelOpen()) return;
  const p = currentPlanet;
  if(!p || p.dying){
    closePlanetPanel();
    return;
  }
  document.getElementById("infoHd").textContent = t("hud.planetInfo");
  document.getElementById("infoName").textContent = t("body." + bodyVariantKey(p));
  document.getElementById("infoType").textContent = t("hud.value")(bodyValueEstimate(p));
  const hp = Math.max(0, p.health);
  setInfoRow(1, t("planet.health"), Math.round(hp) + " / " + Math.round(p.maxHealth), hp / p.maxHealth);
  setInfoRow(2, t("planet.radius"), p.radius.toFixed(1));
  // p.spin is radians/second (see world/bodies.js#materializePlanet) —
  // shown as degrees/second, a more readable unit than raw radians.
  setInfoRow(3, t("planet.spin"), (p.spin * 180 / Math.PI).toFixed(1) + "°/s");
  // Mockup actions — not wired up yet.
  setInfoButtons([{ text: t("planet.waypoint") }, { text: t("planet.scan") }, { text: t("planet.colonize") }]);
}
