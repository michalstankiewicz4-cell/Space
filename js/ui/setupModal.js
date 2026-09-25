import { getLang, setLang, onLangChange, LANGS, t } from "../i18n.js";
import { settings, saveSettings } from "../settings.js";
import { gfxQuality, gfxDetail, setGraphics } from "../scene/graphics.js";

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
  onLangChange(paintGfx);
}
