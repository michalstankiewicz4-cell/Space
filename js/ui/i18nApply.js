import { t } from "../i18n.js";

// Sets every static (non-dynamic-stat) piece of UI text from the current
// language. Call once on startup and again whenever the language changes.
export function applyStaticText(){
  document.getElementById("bannerDesc").textContent = t("banner.desc");
  document.getElementById("modeSingle").textContent = t("banner.modeSingle");
  document.getElementById("modeMulti").textContent = t("banner.modeMulti");
  document.getElementById("modeFriends").textContent = t("banner.modeFriends");
  document.getElementById("modeSingle").title = t("banner.modeComingSoon");
  document.getElementById("modeFriends").title = t("banner.modeComingSoon");
  document.getElementById("nickInput").placeholder = t("banner.nickPlaceholder");
  document.getElementById("startBtn").textContent = t("banner.start");
  document.getElementById("nickError").textContent = t("banner.nickRejected");

  document.getElementById("outdatedTitle").textContent = t("outdated.title");
  document.getElementById("outdatedText").textContent = t("outdated.text");
  document.getElementById("outdatedReloadBtn").textContent = t("outdated.reload");
  document.getElementById("outdatedHint").textContent = t("outdated.hint");

  document.getElementById("connectionStatus").textContent = t("connection.reconnecting");
  document.getElementById("camModeBaseBtn").textContent = t("camera.base");
  document.getElementById("camModeSystemBtn").textContent = t("camera.system");
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

  document.getElementById("dronePanelTitle").textContent = t("drone.title");
  document.getElementById("droneStatusLabel").textContent = t("drone.status");
  document.getElementById("droneFuelLabel").textContent = t("drone.fuel");
  document.getElementById("droneAttackLabel").textContent = t("drone.attack");
  document.getElementById("droneDefenseLabel").textContent = t("drone.defense");
  document.getElementById("droneScriptBtn").textContent = t("drone.scriptBtn");
  document.getElementById("droneScriptModalTitle").textContent = t("drone.scriptTitle");
  document.getElementById("droneScriptRunBtn").textContent = t("drone.run");
  document.getElementById("droneScriptStopBtn").textContent = t("drone.stop");
  document.getElementById("droneScriptInput").placeholder = t("drone.placeholder");

  document.getElementById("droneHelpMovementTitle").textContent = t("drone.help.movementTitle");
  document.getElementById("droneHelpMoveDesc").textContent = t("drone.help.move");
  document.getElementById("droneHelpTurnDesc").textContent = t("drone.help.turn");
  document.getElementById("droneHelpWaitDesc").textContent = t("drone.help.wait");
  document.getElementById("droneHelpSensorsTitle").textContent = t("drone.help.sensorsTitle");
  document.getElementById("droneHelpFuelDesc").textContent = t("drone.help.fuel");
  document.getElementById("droneHelpMaxFuelDesc").textContent = t("drone.help.maxFuelFn");
  document.getElementById("droneHelpNearDesc").textContent = t("drone.help.near");
  document.getElementById("droneHelpAttackDesc").textContent = t("drone.help.attackFn");
  document.getElementById("droneHelpPrintDesc").textContent = t("drone.help.print");
  document.getElementById("droneHelpSyntaxTitle").textContent = t("drone.help.syntaxTitle");
  document.getElementById("droneHelpSyntaxDesc").textContent = t("drone.help.syntax");
  document.getElementById("droneHelpExampleTitle").textContent = t("drone.help.exampleTitle");

  document.getElementById("stationPanelTitle").textContent = t("station.title");
  document.getElementById("stationFleetLabel").textContent = t("station.fleet");
  document.getElementById("stationPointsLabel").textContent = t("telemetry.points");
  document.getElementById("stationUpgradesLabel").textContent = t("station.upgrades");
  document.getElementById("stationTechBtn").textContent = t("station.techBtn");
  document.getElementById("stationFleetBtn").textContent = t("station.fleetBtn");

  document.getElementById("planetHealthLabel").textContent = t("planet.health");
  document.getElementById("planetRadiusLabel").textContent = t("planet.radius");
  document.getElementById("planetSpinLabel").textContent = t("planet.spin");
  document.getElementById("planetValueLabel").textContent = t("planet.value");

  document.getElementById("devToolsBtn").title = t("devTools.button");
  document.getElementById("devLightsLabel").textContent = t("devTools.lights");
  document.getElementById("devDistanceLabel").textContent = t("devTools.distance");
  document.getElementById("devNoLightsLabel").textContent = t("devTools.noLights");
}
