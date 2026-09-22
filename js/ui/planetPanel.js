import { bodyVariantKey, bodyValueEstimate } from "../world/bodies.js";
import { t } from "../i18n.js";

// Which planet the panel is currently showing — module-local, not on ctx,
// since (unlike the drone/station) this is transient UI focus rather than
// a world singleton: scene/controls.js's planetSelectionOrder can hold
// several selected planets at once (for Dev Tools' distance line), and
// this only ever points at the most-recently (de)selected one.
let currentPlanet = null;

export function isPlanetPanelOpen(){
  return !document.getElementById("planetPanel").classList.contains("hidden");
}

// Exported for world/planetThumb.js's live 3D preview — same idea as
// ctx.drone for renderDroneThumb(), just not a ctx field since it's UI
// state, not world state.
export function getPanelPlanet(){
  return currentPlanet;
}

export function openPlanetPanel(p){
  currentPlanet = p;
  document.getElementById("planetPanelTitle").textContent = t("body." + bodyVariantKey(p));
  document.getElementById("planetPanel").classList.remove("hidden");
  refreshPlanetPanel();
}

// Deliberately does NOT deselect the planet (unlike closeDronePanel/
// closeStationPanel, which do) — planets support multi-select, and closing
// this "what am I looking at" panel shouldn't also discard a multi-select
// someone's building for the distance-line tool. The only ways to actually
// deselect a planet are clicking elsewhere (clearSelection) or shift-
// clicking it again (see scene/controls.js).
export function closePlanetPanel(){
  document.getElementById("planetPanel").classList.add("hidden");
  currentPlanet = null;
}

// Called every ~0.4s from main.js's tick, same cadence as
// refreshDronePanel()/refreshStationPanel() — stats, not per-frame data.
export function refreshPlanetPanel(){
  const p = currentPlanet;
  if(!p || p.dying){
    closePlanetPanel();
    return;
  }
  document.getElementById("planetHealthVal").textContent =
    Math.max(0, Math.round(p.health)) + " / " + Math.round(p.maxHealth);
  document.getElementById("planetRadiusVal").textContent = p.radius.toFixed(1);
  // p.spin is radians/second (see world/bodies.js#materializePlanet) —
  // shown as degrees/second, a more readable unit than raw radians.
  document.getElementById("planetSpinVal").textContent = (p.spin * 180 / Math.PI).toFixed(1) + "°/s";
  document.getElementById("planetValueVal").textContent = "~" + bodyValueEstimate(p);
}

export function initPlanetPanel(){
  // pointerdown, not click — same fix as droneCloseBtn/stationCloseBtn
  // (see ui/dronePanel.js): a press/release that drifts a couple pixels
  // across the button's edge can silently fail to fire "click".
  document.getElementById("planetCloseBtn").addEventListener("pointerdown", function(e){
    e.stopPropagation();
    closePlanetPanel();
  });
}
