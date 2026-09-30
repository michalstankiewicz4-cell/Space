import { t } from "../i18n.js";
import { hasAcceptedPrivacy } from "./privacy.js";

// "Coming soon" tooltip for every control that doesn't work yet — shown at
// once (a native title waits a second, and a disabled button shows none in
// some browsers). One document-level listener: the element under the
// pointer (elementsFromPoint, which disabled buttons are part of) or one of
// its ancestors matches SOON. The tooltip names the control and says it's
// coming; its own `data-soon-text` (an i18n key) replaces the second line.
const SOON = ".soon, .modeDisabled, #nickGoogleBtn, #cmdTabs .cTab, #btnPause, #btnFast";
// Also here: why ENTER ORBIT is still locked once loading has finished —
// no nickname yet, or the privacy policy not accepted (ui/banner.js).
function startBlocked(el){
  if(el.id !== "startBtn" || !el.disabled || el.classList.contains("loading")) return null;
  if(!hasAcceptedPrivacy()) return t("banner.needPrivacy");
  if(!document.getElementById("nickInput").value.trim()) return t("banner.needNick");
  return null;
}
let tip = null, current = null;

function nameOf(el){
  if(el.dataset.cmd) return t("cmd." + el.dataset.cmd);
  if(el.dataset.soonName) return t(el.dataset.soonName);
  const txt = (el.textContent || "").trim();
  return txt || el.getAttribute("aria-label") || "";
}

function show(el, x, y){
  if(!tip){
    tip = document.createElement("div");
    tip.id = "soonTip";
    tip.innerHTML = "<b></b><span></span>";
    document.body.appendChild(tip);
  }
  if(el !== current){
    current = el;
    const blocked = startBlocked(el);
    const name = nameOf(el);
    tip.querySelector("b").textContent = blocked ? name : (name ? name + " — " + t("soon") : t("soon"));
    tip.querySelector("span").textContent = blocked || t(el.dataset.soonText || "soonLong");
  }
  tip.style.display = "block";
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
  tip.style.top = (y - h - 12 < 4 ? y + 18 : y - h - 12) + "px";
}

function hide(){
  current = null;
  if(tip) tip.style.display = "none";
}

export function initSoonTip(){
  window.addEventListener("pointermove", function(e){
    const top = document.elementsFromPoint(e.clientX, e.clientY)[0];
    const start = top ? top.closest("#startBtn") : null;
    if(start && startBlocked(start)){ show(start, e.clientX, e.clientY); return; }
    const el = top ? top.closest(SOON) : null;
    // the research trees' locked nodes are SVG ".soon" with a tooltip of their own
    if(!el || el instanceof SVGElement){ hide(); return; }
    show(el, e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener("pointerdown", hide);
}
