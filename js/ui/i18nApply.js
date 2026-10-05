import { t } from "../i18n.js";
import { isLoading } from "./loader.js";

// Every static piece of UI text in the current language — at start-up and
// on every language change.
const I18N_ATTRS = [["data-i18n", "textContent"], ["data-i18n-title", "title"], ["data-i18n-html", "innerHTML"], ["data-i18n-placeholder", "placeholder"]];

export function applyStaticText(){
  // See css/ui/startScreen.css: the start panel stays hidden until now.
  delete document.documentElement.dataset.langPending;
  // Static text is marked in index.html: data-i18n (textContent),
  // data-i18n-title, data-i18n-html (app-authored HTML only, never player
  // text) and data-i18n-placeholder hold the i18n key. What's below the
  // loop is text that depends on something (a state, a list, a template).
  I18N_ATTRS.forEach(function(a){
    document.querySelectorAll("[" + a[0] + "]").forEach(function(el){ el[a[1]] = t(el.getAttribute(a[0])); });
  });

  if(!isLoading()) document.getElementById("startBtn").textContent = t("banner.start");

  document.querySelectorAll("#gfxQualityTicks span").forEach(function(s, i){ s.textContent = t("setup.qualityLevels")[i]; });

  // the [?] badges: cost level + why (Setup -> Graphics)
  document.querySelectorAll("#setupTabGraphics .gfxCost").forEach(function(b){
    b.title = t("setup.gfx.cost." + b.dataset.cost) + " — " + t("setup.gfx.tip." + b.dataset.tip);
  });

  // In-game HUD (index.html #hud) — static labels only; the panels'
  // dynamic content re-derives its own text on every refresh.
  const $ = function(id){ return document.getElementById(id); };
  $("resBox").title = [t("telemetry.points"), t("telemetry.ships"), t("telemetry.eaten"), t("telemetry.players")].join(" · ");
  ["fleet", "planets", "research", "bases", "diplomacy", "wiki", "settings"].forEach(function(k){
    const row = document.querySelector('#nav .navRow[data-nav="' + k + '"]');
    row.querySelector(".navBtn").textContent = t("nav." + k);
  });
  ["unitCloseBtn", "infoCloseBtn", "shipCamCloseBtn"].forEach(function(id){ $(id).title = t("hud.close"); });
  $("unitCamBtn").title = t("hud.cockpitBtn") + " — " + t("hud.shipCam");
  $("unitCamBtn").querySelector("span").textContent = t("hud.cockpitBtn");
  $("unitViewBtn").title = t("hud.viewBtn") + " — " + t("hud.viewTitle");
  $("unitViewBtn").querySelector("span").textContent = t("hud.viewBtn");   // (in #droneBtns)
  // icon-only buttons: the name is the tooltip (and the hidden label)
  [["droneRunBtn", "hud.droneStart"], ["droneStopBtn", "hud.droneStop"], ["droneScriptBtn", "hud.droneScript"]].forEach(function(p){
    $(p[0]).querySelector("span").textContent = t(p[1]);
    $(p[0]).title = t(p[1]);
  });
  ["Tactical", "Movement", "Build", "Special"].forEach(function(k){ $("tab" + k).textContent = t("cmd." + k.toLowerCase()); });
  document.querySelectorAll("#cmdBtns .aBtn").forEach(function(b){
    b.querySelector("span").textContent = t("cmd." + b.dataset.cmd);
  });
  // Empty-state hints (shown until something is selected).
  if($("infoBody").classList.contains("hidden")) $("infoHd").textContent = t("hud.planetInfo");

  document.querySelectorAll("#wikiTabs button").forEach(function(b){ b.textContent = t("wiki.tabs." + b.dataset.tab); });
}
