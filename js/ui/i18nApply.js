import { t } from "../i18n.js";

// Sets every static (non-dynamic-stat) piece of UI text from the current
// language. Call once on startup and again whenever the language changes.
export function applyStaticText(){
  // See css/ui/startScreen.css: the start panel stays hidden until now.
  delete document.documentElement.dataset.langPending;
  document.getElementById("bannerBoot").textContent = t("banner.boot");
  document.getElementById("bannerDesc").textContent = t("banner.desc");
  document.getElementById("bannerNotice").textContent = t("banner.notice");
  document.getElementById("modeSingle").textContent = t("banner.modeSingle");
  document.getElementById("modeMulti").textContent = t("banner.modeMulti");
  document.getElementById("modeFriends").textContent = t("banner.modeFriends");
  document.getElementById("modeSingle").title = t("banner.modeComingSoon");
  document.getElementById("modeFriends").title = t("banner.modeComingSoon");
  document.getElementById("nickLabel").textContent = t("banner.nickPlaceholder");
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
  document.querySelector('#setupTabs button[data-tab="graphics"]').textContent = t("setup.tabGraphics");
  document.getElementById("gfxQualityLabel").textContent = t("setup.renderQuality");
  document.getElementById("gfxDetailLabel").textContent = t("setup.geometryDetail");
  document.getElementById("unitLightsLabel").textContent = t("setup.unitLights");
  document.querySelectorAll("#gfxQualityTicks span").forEach(function(s, i){ s.textContent = t("setup.qualityLevels")[i]; });
  document.getElementById("gfxSoon").textContent = t("setup.graphicsSoon");

  document.getElementById("aboutBtn").title = t("about.button");
  document.getElementById("aboutTitle").textContent = t("about.title");
  document.getElementById("aboutMade").textContent = t("about.made");
  document.getElementById("aboutAuthorsHd").textContent = t("about.authors");
  document.getElementById("aboutContactHd").textContent = t("about.contact");
  document.getElementById("aboutPhoneLabel").textContent = t("about.phone");
  document.getElementById("aboutCloseBtn").title = t("hud.close");
  document.getElementById("invertXLabel").textContent = t("setup.invertX");
  document.getElementById("invertYLabel").textContent = t("setup.invertY");
  document.getElementById("swapButtonsLabel").textContent = t("setup.swapButtons");
  document.getElementById("setupHelpText").innerHTML = t("hint");

  // In-game HUD (index.html #hud) — static labels only; the panels'
  // dynamic content re-derives its own text on every refresh.
  const $ = function(id){ return document.getElementById(id); };
  $("labelPoints").textContent = t("topbar.points");
  $("labelShips").textContent = t("topbar.ships");
  $("labelEaten").textContent = t("topbar.eaten");
  $("labelPlayers").textContent = t("topbar.players");
  $("resBox").title = [t("telemetry.points"), t("telemetry.ships"), t("telemetry.eaten"), t("telemetry.players")].join(" · ");
  $("sdCycleLabel").textContent = t("topbar.cycle");
  $("speedCtl").title = t("topbar.timeNote");
  ["fleet", "planets", "research", "build", "diplomacy", "wiki", "settings"].forEach(function(k){
    const row = document.querySelector('#nav .navRow[data-nav="' + k + '"]');
    row.querySelector(".navBtn").textContent = t("nav." + k);
    row.querySelector(".navBtn").title = row.classList.contains("soon") ? t("soon") : "";
  });
  $("fleetHd").textContent = t("hud.fleetList");
  $("unitHd").textContent = t("hud.selectedUnit");
  $("evHd").textContent = t("hud.eventLog");
  $("mmHd").textContent = t("hud.minimap");
  $("mmIn").title = t("hud.zoomIn");
  $("mmOut").title = t("hud.zoomOut");
  ["unitCloseBtn", "infoCloseBtn", "shipCamCloseBtn"].forEach(function(id){ $(id).title = t("hud.close"); });
  document.querySelectorAll("#unitBtns .uBtn").forEach(function(b){ b.title = t("cmd." + b.dataset.cmd) + " — " + t("soon"); });
  $("unitCamBtn").title = t("hud.shipCam");
  $("droneRunBtn").querySelector("span").textContent = t("hud.droneStart");
  $("droneStopBtn").querySelector("span").textContent = t("hud.droneStop");
  $("droneScriptBtn").querySelector("span").textContent = t("hud.droneScript");
  ["Tactical", "Movement", "Build", "Special"].forEach(function(k){ $("tab" + k).textContent = t("cmd." + k.toLowerCase()); });
  document.querySelectorAll("#cmdBtns .aBtn").forEach(function(b){
    b.querySelector("span").textContent = t("cmd." + b.dataset.cmd);
    b.title = t("soon");
  });
  // Empty-state hints (shown until something is selected).
  $("unitEmpty").textContent = t("hud.unitEmpty");
  $("infoEmpty").textContent = t("hud.infoEmpty");
  if($("infoBody").classList.contains("hidden")) $("infoHd").textContent = t("hud.planetInfo");

  $("playersTitle").textContent = t("players.title");
  $("wikiTitle").textContent = t("wiki.title");
  document.querySelectorAll("#wikiTabs button").forEach(function(b){ b.textContent = t("wiki.tabs." + b.dataset.tab); });
  $("wikiCloseBtn").title = t("hud.close");
  $("techModalTitle").textContent = t("tech.title");
  $("fleetModalTitle").textContent = t("fleet.title");
  $("shipCamLabel").textContent = t("fleet.shipCamLabel");


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

  document.getElementById("devToolsBtn").title = t("devTools.button");
  document.getElementById("devLightsLabel").textContent = t("devTools.lights");
  document.getElementById("devDistanceLabel").textContent = t("devTools.distance");
  document.getElementById("devNoLightsLabel").textContent = t("devTools.noLights");
  document.getElementById("devPerfLabel").textContent = t("devTools.perf");
}
