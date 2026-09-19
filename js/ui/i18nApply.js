import { t } from "../i18n.js";

// Sets every static (non-dynamic-stat) piece of UI text from the current
// language. Call once on startup and again whenever the language changes.
export function applyStaticText(){
  document.getElementById("bannerDesc").textContent = t("banner.desc");
  document.getElementById("nickInput").placeholder = t("banner.nickPlaceholder");
  document.getElementById("startBtn").textContent = t("banner.start");
  document.getElementById("setupBtn").textContent = t("banner.setup");
  document.getElementById("setupLangLabel").textContent = t("banner.language");

  document.getElementById("setupModalTitle").textContent = t("setup.title");
  document.querySelector('#setupTabs button[data-tab="language"]').textContent = t("setup.tabLanguage");
  document.querySelector('#setupTabs button[data-tab="mouse"]').textContent = t("setup.tabMouse");
  document.querySelector('#setupTabs button[data-tab="help"]').textContent = t("setup.tabHelp");
  document.getElementById("invertXLabel").textContent = t("setup.invertX");
  document.getElementById("invertYLabel").textContent = t("setup.invertY");
  document.getElementById("swapButtonsLabel").textContent = t("setup.swapButtons");
  document.getElementById("setupHelpText").innerHTML = t("hint");

  document.getElementById("telemetryTitle").textContent = t("telemetry.title");
  document.getElementById("labelPoints").textContent = t("telemetry.points");
  document.getElementById("labelShips").textContent = t("telemetry.ships");
  document.getElementById("labelEaten").textContent = t("telemetry.eaten");
  document.getElementById("labelPlayers").textContent = t("telemetry.players");

  document.getElementById("playersTitle").textContent = t("players.title");

  document.getElementById("techModalTitle").textContent = t("tech.title");
  document.getElementById("fleetModalTitle").textContent = t("fleet.title");
  document.getElementById("shipCamLabel").textContent = t("fleet.shipCamLabel");

  document.getElementById("legendIce").textContent = t("legend.ice");
  document.getElementById("legendNeutral").textContent = t("legend.neutral");
  document.getElementById("legendVolcanic").textContent = t("legend.volcanic");
  document.getElementById("legendSun").textContent = t("legend.sun");
  document.getElementById("legendComet").textContent = t("legend.comet");
  document.getElementById("legendMeteoroid").textContent = t("legend.meteoroid");
  document.getElementById("legendBlackhole").textContent = t("legend.blackhole");
}
