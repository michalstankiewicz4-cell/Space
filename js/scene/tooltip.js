import { bodyVariantKey, bodyValueEstimate } from "../world/bodyParams.js";
import { t } from "../i18n.js";

// The hover tooltip shown over a planet/black hole — split out of
// scene/controls.js, which only ever reaches this via showTooltip/
// showBlackHoleTooltip/hideTooltip from its own pointermove hover-feedback
// handling. initTooltip() must be called once (controls.js#initControls
// does this) before any of the show*/hide functions are used.
let tooltipEl = null, ttTitleEl = null, ttRow1LabelEl = null, ttRow1ValEl = null, ttRow2LabelEl = null, ttRow2ValEl = null;
const TOOLTIP_OFFSET = 16;

export function initTooltip(){
  tooltipEl = document.getElementById("bodyTooltip");
  ttTitleEl = document.getElementById("ttTitle");
  ttRow1LabelEl = document.getElementById("ttRow1Label");
  ttRow1ValEl = document.getElementById("ttRow1Val");
  ttRow2LabelEl = document.getElementById("ttRow2Label");
  ttRow2ValEl = document.getElementById("ttRow2Val");
}

function positionTooltip(clientX, clientY){
  tooltipEl.classList.remove("hidden");
  const rect = tooltipEl.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  tooltipEl.style.left = Math.max(8, Math.min(clientX+TOOLTIP_OFFSET, maxX)) + "px";
  tooltipEl.style.top = Math.max(8, Math.min(clientY+TOOLTIP_OFFSET, maxY)) + "px";
}

export function showTooltip(p, clientX, clientY){
  if(!tooltipEl) return;
  ttTitleEl.textContent = t("body." + bodyVariantKey(p));
  ttRow1LabelEl.textContent = t("tooltip.health");
  ttRow1ValEl.textContent = Math.max(0, Math.round(p.health)) + " / " + Math.round(p.maxHealth);
  ttRow2LabelEl.textContent = t("tooltip.value");
  ttRow2ValEl.textContent = "~" + bodyValueEstimate(p);
  positionTooltip(clientX, clientY);
}

export function showBlackHoleTooltip(bh, clientX, clientY){
  if(!tooltipEl) return;
  ttTitleEl.textContent = t("body.blackhole");
  ttRow1LabelEl.textContent = t("tooltip.timeLeft");
  ttRow1ValEl.textContent = Math.max(0, Math.round(bh.maxLife-bh.life)) + "s";
  ttRow2LabelEl.textContent = t("tooltip.hazard");
  ttRow2ValEl.textContent = t("tooltip.hazardWarning");
  positionTooltip(clientX, clientY);
}

export function hideTooltip(){
  if(tooltipEl) tooltipEl.classList.add("hidden");
}
