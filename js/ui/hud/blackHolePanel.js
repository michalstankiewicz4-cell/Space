import { t } from "../../i18n.js";
import { showInfo, hideInfo, getInfoOwner, setInfoRow, setInfoButtons } from "./infoPanel.js";
import { discover } from "../../core/discovery.js";

// The black hole in the HUD's PLANET INFO slot (same slot as planets and
// the station, ui/hud/infoPanel.js): what it is and how close is too
// close. Read-only — there's nothing to do with a black hole but keep away.
let current = null;

export function isBlackHolePanelOpen(){
  return getInfoOwner() === "blackhole";
}

export function openBlackHolePanel(bh){
  current = bh;
  discover("body:blackhole");
  showInfo("blackhole", {
    thumbTarget: function(){ return current ? { pos: current.group.position, radius: current.radius * 2.2 } : null; },
    onClose: closeBlackHolePanel
  });
  refreshBlackHolePanel();
}

export function closeBlackHolePanel(){
  current = null;
  hideInfo("blackhole");
}

// Called every ~0.4s from ui/hud/hud.js (texts re-derived from t(), so a
// language switch updates it too).
export function refreshBlackHolePanel(){
  if(!isBlackHolePanelOpen() || !current) return;
  document.getElementById("infoHd").textContent = t("hud.planetInfo");
  document.getElementById("infoName").textContent = t("body.blackhole");
  document.getElementById("infoType").textContent = t("tooltip.hazardWarning");
  setInfoRow(1, t("planet.radius"), current.radius.toFixed(1));
  setInfoRow(2, t("blackhole.pull"), current.gravityRadius.toFixed(1));
  setInfoRow(3, t("blackhole.noReturn"), current.killRadius.toFixed(1));
  setInfoButtons([]);
}
