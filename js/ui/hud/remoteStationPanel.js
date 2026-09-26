import { t } from "../../i18n.js";
import { showInfo, hideInfo, getInfoOwner, setInfoRow, setInfoButtons } from "./infoPanel.js";
import { STATION_PICK_RADIUS } from "../../config.js";

// Another player's station in the HUD's PLANET INFO slot (like our own,
// ui/hud/stationPanel.js, but read-only): whose it is, their fleet size,
// points and bodies devoured — all from their broadcast (net/shipsBroadcast.js).
// `ref` is the station's selectable handle (rp.stationRef).
let current = null;

export function isRemoteStationPanelOpen(){
  return getInfoOwner() === "remoteStation";
}

export function openRemoteStationPanel(ref){
  current = ref;
  showInfo("remoteStation", {
    thumbTarget: function(){ return current && current.alive() ? { pos: current.group.position, radius: STATION_PICK_RADIUS } : null; },
    onClose: closeRemoteStationPanel
  });
  refreshRemoteStationPanel();
}

export function closeRemoteStationPanel(){
  current = null;
  hideInfo("remoteStation");
}

// Every ~0.4s from ui/hud/hud.js; the owner leaving closes it.
export function refreshRemoteStationPanel(){
  if(!isRemoteStationPanelOpen() || !current) return;
  if(!current.alive()){ closeRemoteStationPanel(); return; }
  const rp = current.rp;
  document.getElementById("infoHd").textContent = t("hud.station");
  document.getElementById("infoName").textContent = rp.nick;
  document.getElementById("infoType").textContent = t("hud.playerBase");
  setInfoRow(1, t("station.fleet"), String(rp.meshes.length));
  setInfoRow(2, t("topbar.points"), String(rp.points || 0));
  setInfoRow(3, t("topbar.eaten"), String(rp.eaten || 0));
  setInfoButtons([]);
}
