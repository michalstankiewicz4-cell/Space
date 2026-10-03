import { t } from "../../i18n.js";
import { ORDERS, canLand, canAttack } from "../../ships/orders.js";

// The order menu (#orderMenu): a click on a body with ships selected sends
// them there into orbit (scene/controls.js#clickPlanet) and opens this at
// the pointer — ORBIT / ATTACK / LAND, what they do once there
// (ships/orders.js). LAND only where there's ground (or into a station's
// field); ATTACK not against a station yet. It closes on a pick, a
// press anywhere else, Esc, or after CLOSE_S seconds untouched.
const CLOSE_S = 6;
let el = null, onPick = null, timer = 0;

export function closeOrderMenu(){
  if(!el) return;
  el.classList.add("hidden");
  onPick = null;
  clearTimeout(timer);
}

export function openOrderMenu(x, y, body, current, pick){
  if(!el) return;
  onPick = pick;
  el.querySelectorAll("button").forEach(function(b){
    const order = b.dataset.order;
    b.textContent = t("orders." + order);
    b.classList.toggle("on", order === current);
    const noLand = order === "land" && !canLand(body), noAttack = order === "attack" && !canAttack(body);
    b.disabled = noLand || noAttack;
    b.title = noLand ? t("orders.noGround") : noAttack ? t("orders.attackSoon") : "";
  });
  el.classList.remove("hidden");
  // beside the pointer, kept inside the window
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.min(x + 14, window.innerWidth - w - 6) + "px";
  el.style.top = Math.max(6, Math.min(y - h / 2, window.innerHeight - h - 6)) + "px";
  clearTimeout(timer);
  timer = setTimeout(closeOrderMenu, CLOSE_S * 1000);
}

export function initOrderMenu(){
  el = document.getElementById("orderMenu");
  ORDERS.forEach(function(order){
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.order = order;
    b.className = order;
    b.addEventListener("click", function(){
      const pick = onPick;
      closeOrderMenu();
      if(pick) pick(order);
    });
    el.appendChild(b);
  });
  // pointerdown so the press that ends it never also lands on the scene behind
  el.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
  document.addEventListener("pointerdown", function(e){ if(!el.contains(e.target)) closeOrderMenu(); }, true);
  window.addEventListener("keydown", function(e){ if(e.key === "Escape") closeOrderMenu(); });
}
