import { ctx } from "../../core/context.js";
import { setStationSelected } from "../../station/station.js";
import { STATION_SILHOUETTE_RADIUS } from "../../station/stationModel.js";
import { STATION_MODEL_SCALE, TREE } from "../../config.js";
import { state } from "../../core/gameState.js";
import { myIdentity } from "../../net/identity.js";
import { t } from "../../i18n.js";
import { openTechModal } from "../windows/windows.js";
import { openFleetModal } from "../windows/fleet.js";
import { showInfo, hideInfo, getInfoOwner, setInfoRow, setInfoButtons } from "./infoPanel.js";

// The player's station shown in the HUD's PLANET INFO slot (ui/hud/infoPanel.js).
// Visibility tracks selection, RTS-style: selecting the station (see
// scene/controls.js) opens it, deselecting (close button, or selecting/
// clicking something else) closes it. The camera never reacts to any of this.
export function isStationPanelOpen(){
  return getInfoOwner() === "station";
}

export function openStationPanel(){
  showInfo("station", {
    thumbTarget: function(){
      return ctx.station ? { pos: ctx.station.pos, radius: STATION_SILHOUETTE_RADIUS * STATION_MODEL_SCALE } : null;
    },
    onClose: closeStationPanel
  });
  refreshStationPanel();
}

export function closeStationPanel(){
  hideInfo("station");
  if(ctx.station) setStationSelected(ctx.station, false);
}

// Compact icon+level readout (e.g. "⚡3 · 💥2 · 🔥0 · ❄️1 · 🚀4") reusing
// TREE's own icons from config.js rather than adding a second set of
// upgrade names/icons just for this panel.
function upgradesSummary(){
  return Object.keys(TREE).map(function(key){
    return TREE[key].icon + state.levels[key];
  }).join(" · ");
}

// Called every ~0.4s from ui/hud/hud.js — a stats overview, not something
// needing frame-accurate updates.
export function refreshStationPanel(){
  if(!isStationPanelOpen()) return;
  if(!ctx.station){
    closeStationPanel();
    return;
  }
  document.getElementById("infoHd").textContent = t("hud.station");
  document.getElementById("infoName").textContent = myIdentity.nick || t("players.defaultName");
  document.getElementById("infoType").textContent = t("hud.yourBase");
  setInfoRow(1, t("station.fleet"), String(ctx.ships.length));
  setInfoRow(2, t("topbar.points"), String(state.points));
  setInfoRow(3, t("station.upgrades"), upgradesSummary());
  setInfoButtons([
    { text: t("station.techBtn"), onClick: openTechModal },
    { text: t("station.fleetBtn"), onClick: openFleetModal }
  ]);
}
