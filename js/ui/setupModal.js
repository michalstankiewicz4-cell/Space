import { getLang, setLang, onLangChange, LANGS, t } from "../i18n.js";
import { settings, saveSettings } from "../settings.js";
import { gfxQuality, gfxDetail, setGraphics, gfxUnitLights, setUnitLights, setGfx, gfxResMode, gfxTargetFps, gfxMaxRes, gfxSmoothLines, gfxLineWidth, gfxFarShips, gfxLodDistance, gfxFxaa, gfxMsaa, gfxBloom, gfxBloomStrength, gfxBloomThreshold,
  gfxLensing, gfxFlare, gfxFlareStrength, gfxFilter, gfxVignette, gfxGrain, gfxAberration, gfxDof, gfxDofStrength, gfxTrails, gfxTrailLength, gfxEclipses, gfxBiteFx,
  gfxPreset, gfxAutoTier, applyPreset, onGraphicsChange, gfxAniso, gfxSharpen, gfxRays, gfxRaysStrength, gfxFpsCap } from "../scene/graphics.js";
import { currentPixelRatio } from "../scene/resolution.js";

// Setup modal (language / mouse / graphics / sound / help / privacy tabs), opened from the
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
  // the Graphics tab gets a wider, taller window with the description pane
  document.getElementById("setupModalBox").classList.toggle("wide", tab === "graphics" || tab === "help");
  document.getElementById("gfxHelp").classList.toggle("hidden", tab !== "graphics");
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
  initMouseSens();
  initAutoHide();
  initSound();
  initGraphicsSliders();
}

// A slider's gold fill up to its value (css/ui/setupModal.css reads --fill).
function paintFill(s){ s.style.setProperty("--fill", ((s.value - s.min) / (s.max - s.min) * 100) + "%"); }

// Setup -> Mouse: rotation and zoom sensitivity (scene/controls.js reads them live).
function initMouseSens(){
  [["mouseRotSlider", "mouseRotVal", "mouseRotSens"], ["mouseZoomSlider", "mouseZoomVal", "mouseZoomSens"]].forEach(function(p){
    const s = document.getElementById(p[0]), v = document.getElementById(p[1]);
    const paint = function(){
      v.textContent = "×" + Number(s.value).toFixed(2);
      paintFill(s);
    };
    s.value = Number(settings[p[2]]) || 1;
    paint();
    s.addEventListener("input", function(){ settings[p[2]] = Number(s.value); saveSettings(); paint(); });
  });
}

// Setup -> Sound: a switch and a level for music, effects and voice. Off
// keeps the level (no need to drag it to 0); moving the slider switches it on.
function initSound(){
  [["Music", "soundMusic"], ["Fx", "soundFx"], ["Voice", "soundVoice"]].forEach(function(p){
    const on = document.getElementById("snd" + p[0] + "On"), s = document.getElementById("snd" + p[0] + "Slider"), v = document.getElementById("snd" + p[0] + "Val");
    const paint = function(){
      v.textContent = on.checked ? Math.round(s.value * 100) + "%" : t("setup.sound.off");
      s.classList.toggle("muted", !on.checked);
      paintFill(s);
    };
    on.checked = !!settings[p[1] + "On"];
    s.value = Number(settings[p[1]]);
    paint();
    on.addEventListener("change", function(){ settings[p[1] + "On"] = on.checked; saveSettings(); paint(); });
    s.addEventListener("input", function(){
      settings[p[1]] = Number(s.value);
      if(!on.checked){ on.checked = true; settings[p[1] + "On"] = true; }
      saveSettings(); paint();
    });
    onLangChange(paint);
  });
}

// Setup -> Mouse: hide the interface after N idle seconds, 0 = never
// (ui/hud/uiMode.js reads it live).
function initAutoHide(){
  const s = document.getElementById("autoHideSlider"), v = document.getElementById("autoHideVal");
  const paint = function(){
    v.textContent = +s.value ? s.value + " s" : t("setup.autoHideOff");
    paintFill(s);
  };
  s.value = Number(settings.uiAutoHideS) || 0;
  paint();
  s.addEventListener("input", function(){ settings.uiAutoHideS = Number(s.value); saveSettings(); paint(); });
  onLangChange(paint);
}

// Setup -> Graphics: render quality + geometry detail (scene/graphics.js).
// The detail slider applies when released — it rebuilds ship models.
function paintGfx(){
  const q = document.getElementById("gfxQualitySlider"), d = document.getElementById("gfxDetailSlider");
  paintFill(q); paintFill(d);
  document.getElementById("gfxQualityVal").textContent = t("setup.qualityLevels")[+q.value];
  document.getElementById("gfxDetailVal").textContent = Math.round(+d.value * 100) + "%";
}

function initGraphicsSliders(){
  const q = document.getElementById("gfxQualitySlider"), d = document.getElementById("gfxDetailSlider");
  q.value = gfxQuality();
  d.value = gfxDetail();
  paintGfx();
  q.addEventListener("input", function(){ paintGfx(); setGraphics(+q.value, gfxDetail()); paintImageQuality(); });
  d.addEventListener("input", paintGfx);
  d.addEventListener("change", function(){ setGraphics(gfxQuality(), +d.value); paintImageQuality(); });
  const lights = document.getElementById("unitLightsCheck");
  lights.checked = gfxUnitLights();
  lights.addEventListener("change", function(){ setUnitLights(lights.checked); paintImageQuality(); });
  initImageQuality();
  onLangChange(paintGfx);
}

// The image-quality controls (data-key = the setting's name): segmented
// buttons, sliders (data-list = the values a slider's steps map to) and
// checkboxes, all through graphics.js#setGfx.
const GFX_GET = { gfxResMode: gfxResMode, gfxTargetFps: gfxTargetFps, gfxMaxRes: gfxMaxRes, gfxSmoothLines: gfxSmoothLines,
  gfxLineWidth: gfxLineWidth, gfxFarShips: gfxFarShips, gfxLodDistance: gfxLodDistance, gfxFxaa: gfxFxaa,
  gfxMsaa: function(){ return String(gfxMsaa()); }, gfxBloom: gfxBloom, gfxBloomStrength: gfxBloomStrength, gfxBloomThreshold: gfxBloomThreshold,
  gfxLensing: gfxLensing, gfxFlare: gfxFlare, gfxFlareStrength: gfxFlareStrength, gfxFilter: gfxFilter, gfxVignette: gfxVignette,
  gfxGrain: gfxGrain, gfxAberration: gfxAberration, gfxDof: gfxDof, gfxDofStrength: gfxDofStrength,
  gfxTrails: gfxTrails, gfxTrailLength: gfxTrailLength, gfxEclipses: gfxEclipses, gfxBiteFx: gfxBiteFx, gfxPreset: gfxPreset,
  gfxAniso: function(){ return String(gfxAniso()); }, gfxFpsCap: function(){ return String(gfxFpsCap()); },
  gfxSharpen: gfxSharpen, gfxRays: gfxRays, gfxRaysStrength: gfxRaysStrength };
const NUMERIC_SEGS = ["gfxMsaa", "gfxAniso", "gfxFpsCap"];
function pct(v){ return Math.round(v * 100) + "%"; }
const GFX_FMT = {
  gfxTargetFps: function(v){ return v + " FPS"; },
  gfxMaxRes: function(v){ return "×" + v.toFixed(1); },
  gfxLineWidth: function(v){ return v.toFixed(2).replace(/0$/, "") + " px"; },
  gfxLodDistance: function(v){ return String(v); },
  gfxBloomStrength: function(v){ return v.toFixed(1); },
  gfxBloomThreshold: function(v){ return v.toFixed(2); },
  gfxFlareStrength: pct, gfxVignette: pct, gfxGrain: pct, gfxAberration: pct, gfxDofStrength: pct,
  gfxTrailLength: function(v){ return v.toFixed(1) + " s"; },
  gfxSharpen: function(v){ return v > 0 ? pct(v) : t("setup.gfx.seg.0"); }, gfxRaysStrength: pct
};
function sliderList(el){ return el.dataset.list ? el.dataset.list.split(",").map(Number) : null; }

function paintImageQuality(){
  const box = document.getElementById("setupTabGraphics");
  // a preset changes these too (they have their own handlers above)
  document.getElementById("gfxQualitySlider").value = gfxQuality();
  document.getElementById("gfxDetailSlider").value = gfxDetail();
  document.getElementById("unitLightsCheck").checked = gfxUnitLights();
  paintGfx();
  const pr = gfxPreset();
  document.getElementById("gfxPresetNote").textContent = pr === "custom" ? t("setup.gfx.presetCustom")
    : pr === "auto" ? t("setup.gfx.presetAuto")(t("setup.gfx.seg." + gfxAutoTier())) : t("setup.gfx.presetNote");
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
    paintFill(s);
  });
  box.querySelectorAll("input[type=checkbox][data-key]").forEach(function(c){ c.checked = GFX_GET[c.dataset.key](); });
  box.querySelectorAll("[data-val]").forEach(function(b){ b.textContent = GFX_FMT[b.dataset.val](GFX_GET[b.dataset.val]()); });
  const auto = gfxResMode() === "auto";
  document.getElementById("gfxResAuto").classList.toggle("hidden", !auto);
  document.getElementById("gfxResManual").classList.toggle("hidden", auto);
  document.getElementById("gfxLineWidthBox").classList.toggle("hidden", !gfxSmoothLines());
  document.getElementById("gfxLodBox").classList.toggle("hidden", gfxFarShips() === "model");
  document.getElementById("gfxBloomBox").classList.toggle("hidden", !gfxBloom());
  document.getElementById("gfxFlareBox").classList.toggle("hidden", !gfxFlare());
  document.getElementById("gfxFilterBox").classList.toggle("hidden", !gfxFilter());
  document.getElementById("gfxDofBox").classList.toggle("hidden", !gfxDof());
  document.getElementById("gfxTrailsBox").classList.toggle("hidden", !gfxTrails());
  document.getElementById("gfxRaysBox").classList.toggle("hidden", !gfxRays());
  paintResNow();
}

// "auto": the resolution in use right now, refreshed while Setup is open.
function paintResNow(){
  const el = document.getElementById("gfxResNow");
  if(el) el.textContent = t("setup.gfx.resNow")(currentPixelRatio(), window.devicePixelRatio || 1);
}

function initImageQuality(){
  const box = document.getElementById("setupTabGraphics");
  // a [?] badge inside a checkbox's label explains, it doesn't toggle
  box.querySelectorAll(".gfxCost").forEach(function(b){ b.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); }); });
  box.querySelectorAll(".gfxSeg button").forEach(function(b){
    b.addEventListener("click", function(){
      const p = {}, k = b.parentNode.dataset.key;
      if(k === "gfxPreset") applyPreset(b.dataset.v);
      else{ p[k] = NUMERIC_SEGS.indexOf(k) >= 0 ? Number(b.dataset.v) : b.dataset.v; setGfx(p); }
      paintImageQuality();
    });
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
  initGfxHelp(box);
  paintImageQuality();
  onLangChange(paintImageQuality);
  onGraphicsChange(function(){ paintImageQuality(); });   // e.g. the AUTO preset changing tier
}

// The description pane (Setup -> Graphics, right): the option under the
// pointer — what it does, what each value means, the default and the cost.
// An option is found by its [?] badge (data-tip) or a data-help marker: of
// the ones in the hovered section, the last one above the pointer.
let helpKey = null;
function showGfxHelp(key, badge){
  helpKey = key;
  const h = t("setup.gfx.help")[key];
  if(!h) return;
  const labelEl = badge ? badge.parentNode.querySelector("span[id]") : document.getElementById("gfxPresetLabel");
  document.getElementById("gfxHelpTitle").textContent = labelEl ? labelEl.textContent : key;
  const cost = document.getElementById("gfxHelpCost");
  cost.className = badge ? badge.dataset.cost : "";
  cost.textContent = badge ? t("setup.gfx.cost." + badge.dataset.cost) + " — " + t("setup.gfx.tip." + key) : "";
  document.getElementById("gfxHelpText").textContent = h.d;
  const vals = document.getElementById("gfxHelpValues");
  vals.textContent = "";
  (h.v || []).forEach(function(v){
    const p = document.createElement("p"), b = document.createElement("b");
    b.textContent = v[0];
    p.append(b, " — " + v[1]);
    vals.appendChild(p);
  });
  const def = document.getElementById("gfxHelpDef");
  def.textContent = t("setup.gfx.helpDefault");
  const db = document.createElement("b");
  db.textContent = h.def;
  def.appendChild(db);
}
function initGfxHelp(box){
  box.addEventListener("mousemove", function(e){
    const sec = e.target.closest(".gfxSec");
    if(!sec) return;
    const marks = sec.querySelectorAll(".gfxCost, [data-help]");
    let pick = marks[0];
    marks.forEach(function(m){ if(m.getBoundingClientRect().top <= e.clientY) pick = m; });
    if(!pick) return;
    const key = pick.dataset.tip || pick.dataset.help;
    if(key !== helpKey) showGfxHelp(key, pick.classList.contains("gfxCost") ? pick : null);
  });
  showGfxHelp("preset", null);
  onLangChange(function(){
    const badge = box.querySelector('.gfxCost[data-tip="' + helpKey + '"]');
    const k = helpKey; helpKey = null;
    showGfxHelp(k, badge);
  });
}
