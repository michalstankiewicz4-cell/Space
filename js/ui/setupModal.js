import { getLang, setLang, onLangChange, LANGS, t } from "../i18n.js";
import { settings, saveSettings } from "../settings.js";
import { gfxQuality, gfxDetail, setGraphics, gfxUnitLights, setUnitLights, setGfx, gfxResMode, gfxTargetFps, gfxMaxRes, gfxSmoothLines, gfxLineWidth, gfxFarShips, gfxLodDistance, gfxFxaa } from "../scene/graphics.js";
import { currentPixelRatio } from "../scene/resolution.js";

// Setup modal (language / mouse / graphics / help tabs), opened from the
// start screen. Tabs and panels are matched by their data-tab attribute.

function updateLangButtons(){
  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.classList.toggle("active", btn.dataset.lang === getLang());
  });
}

// The active tab gets the gold material, the rest blue (see css/ui/kit.css).
function switchSetupTab(tab){
  document.querySelectorAll("#setupTabs button").forEach(function(btn){
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    btn.classList.toggle("gold", on);
    btn.classList.toggle("blueT", !on);
  });
  document.querySelectorAll("#setupModal .setupTabPanel").forEach(function(panel){
    panel.classList.toggle("hidden", panel.dataset.tab !== tab);
  });
}

export function isSetupModalOpen(){
  return !document.getElementById("setupModal").classList.contains("hidden");
}

export function openSetupModal(){
  document.getElementById("setupModal").classList.remove("hidden");
}

export function closeSetupModal(){
  document.getElementById("setupModal").classList.add("hidden");
}

function bindSettingCheckbox(id, key){
  const check = document.getElementById(id);
  check.checked = settings[key];
  check.addEventListener("change", function(){
    settings[key] = check.checked;
    saveSettings();
  });
}

export function initSetupModal(){
  const setupModal = document.getElementById("setupModal");

  updateLangButtons();
  onLangChange(updateLangButtons);

  document.getElementById("setupCloseBtn").addEventListener("click", closeSetupModal);

  // Click on the backdrop (not the box itself) closes the modal.
  setupModal.addEventListener("click", function(e){
    if(e.target === setupModal) closeSetupModal();
  });

  document.querySelectorAll("#setupTabs button").forEach(function(btn){
    btn.addEventListener("click", function(){ switchSetupTab(btn.dataset.tab); });
  });

  document.querySelectorAll("#setupLangButtons button").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(LANGS.includes(btn.dataset.lang)) setLang(btn.dataset.lang);
    });
  });

  bindSettingCheckbox("invertXCheck", "invertX");
  bindSettingCheckbox("invertYCheck", "invertY");
  bindSettingCheckbox("swapButtonsCheck", "swapMouseButtons");
  initGraphicsSliders();
}

// Setup -> Graphics: render quality + geometry detail (scene/graphics.js).
// The detail slider applies when released — it rebuilds ship models.
function paintGfx(){
  const q = document.getElementById("gfxQualitySlider"), d = document.getElementById("gfxDetailSlider");
  const fill = function(s){ s.style.setProperty("--fill", ((s.value - s.min) / (s.max - s.min) * 100) + "%"); };
  fill(q); fill(d);
  document.getElementById("gfxQualityVal").textContent = t("setup.qualityLevels")[+q.value];
  document.getElementById("gfxDetailVal").textContent = Math.round(+d.value * 100) + "%";
}

function initGraphicsSliders(){
  const q = document.getElementById("gfxQualitySlider"), d = document.getElementById("gfxDetailSlider");
  q.value = gfxQuality();
  d.value = gfxDetail();
  paintGfx();
  q.addEventListener("input", function(){ paintGfx(); setGraphics(+q.value, gfxDetail()); });
  d.addEventListener("input", paintGfx);
  d.addEventListener("change", function(){ setGraphics(gfxQuality(), +d.value); });
  const lights = document.getElementById("unitLightsCheck");
  lights.checked = gfxUnitLights();
  lights.addEventListener("change", function(){ setUnitLights(lights.checked); });
  initImageQuality();
  onLangChange(paintGfx);
}

// The image-quality controls (data-key = the setting's name): segmented
// buttons, sliders (data-list = the values a slider's steps map to) and
// checkboxes, all through graphics.js#setGfx.
const GFX_GET = { gfxResMode: gfxResMode, gfxTargetFps: gfxTargetFps, gfxMaxRes: gfxMaxRes, gfxSmoothLines: gfxSmoothLines,
  gfxLineWidth: gfxLineWidth, gfxFarShips: gfxFarShips, gfxLodDistance: gfxLodDistance, gfxFxaa: gfxFxaa };
const GFX_FMT = {
  gfxTargetFps: function(v){ return v + " FPS"; },
  gfxMaxRes: function(v){ return "×" + v.toFixed(1); },
  gfxLineWidth: function(v){ return v.toFixed(2).replace(/0$/, "") + " px"; },
  gfxLodDistance: function(v){ return String(v); }
};
function sliderList(el){ return el.dataset.list ? el.dataset.list.split(",").map(Number) : null; }

function paintImageQuality(){
  const box = document.getElementById("setupTabGraphics");
  box.querySelectorAll(".gfxSeg").forEach(function(seg){
    const v = GFX_GET[seg.dataset.key]();
    seg.querySelectorAll("button").forEach(function(b){
      b.classList.toggle("on", b.dataset.v === v);
      b.textContent = t("setup.gfx.seg." + b.dataset.v);
    });
  });
  box.querySelectorAll("input[type=range][data-key]").forEach(function(s){
    const v = GFX_GET[s.dataset.key](), list = sliderList(s);
    s.value = list ? Math.max(0, list.indexOf(v) >= 0 ? list.indexOf(v) : list.indexOf(60)) : v;
    s.style.setProperty("--fill", ((s.value - s.min) / (s.max - s.min) * 100) + "%");
  });
  box.querySelectorAll("input[type=checkbox][data-key]").forEach(function(c){ c.checked = GFX_GET[c.dataset.key](); });
  box.querySelectorAll("[data-val]").forEach(function(b){ b.textContent = GFX_FMT[b.dataset.val](GFX_GET[b.dataset.val]()); });
  const auto = gfxResMode() === "auto";
  document.getElementById("gfxResAuto").classList.toggle("hidden", !auto);
  document.getElementById("gfxResManual").classList.toggle("hidden", auto);
  document.getElementById("gfxLineWidthBox").classList.toggle("hidden", !gfxSmoothLines());
  document.getElementById("gfxLodBox").classList.toggle("hidden", gfxFarShips() === "model");
  paintResNow();
}

// "auto": the resolution in use right now, refreshed while Setup is open.
function paintResNow(){
  const el = document.getElementById("gfxResNow");
  if(el) el.textContent = t("setup.gfx.resNow")(currentPixelRatio(), window.devicePixelRatio || 1);
}

function initImageQuality(){
  const box = document.getElementById("setupTabGraphics");
  box.querySelectorAll(".gfxSeg button").forEach(function(b){
    b.addEventListener("click", function(){ const p = {}; p[b.parentNode.dataset.key] = b.dataset.v; setGfx(p); paintImageQuality(); });
  });
  box.querySelectorAll("input[type=range][data-key]").forEach(function(s){
    s.addEventListener("input", function(){
      const list = sliderList(s), p = {};
      p[s.dataset.key] = list ? list[+s.value] : +s.value;
      setGfx(p);
      paintImageQuality();
    });
  });
  box.querySelectorAll("input[type=checkbox][data-key]").forEach(function(c){
    c.addEventListener("change", function(){ const p = {}; p[c.dataset.key] = c.checked; setGfx(p); paintImageQuality(); });
  });
  setInterval(function(){ if(!box.classList.contains("hidden")) paintResNow(); }, 500);
  paintImageQuality();
  onLangChange(paintImageQuality);
}
