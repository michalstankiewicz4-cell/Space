import { ctx } from "../../core/context.js";
import { setShipCamTarget } from "../../scene/shipcam.js";
import { setShipSelected } from "../../ships/swarm.js";
import { clearSelection } from "../../scene/controls.js";
import { setDroneSelected } from "../../drone/drone.js";
import { openDronePanel } from "./unitPanel.js";
import { bodyVariantKey } from "../../world/bodyParams.js";
import { svgIcon } from "../icons.js";
import { t } from "../../i18n.js";

// The HUD's always-visible FLEET LIST panel: one card per ship plus the
// drone — the same list, and the same click behavior, as the Fleet window
// (ui/windows/fleet.js). Cards are rebuilt only when the fleet size changes; their
// text and selected state are refreshed in place every ~0.4s (main.js).
let builtFor = -1;

function statusText(sh){
  if(sh.boltCore && sh.boltCore.visible) return t("hud.feeding");
  return sh.commandedTarget ? t("hud.enRoute") : t("hud.idle");
}

function targetText(sh){
  const b = sh.commandedTarget || sh.target;
  return b && !b.dying ? "→ " + t("body." + bodyVariantKey(b)) : "";
}

function makeCard(iconName){
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.innerHTML = '<span class="cIcon">' + svgIcon(iconName) + '</span><span class="cn"></span><span class="cc"></span><span class="ch"></span>';
  return card;
}

function build(list){
  list.innerHTML = "";
  ctx.ships.forEach(function(sh){
    const card = makeCard("ship");
    card.addEventListener("click", function(){
      // Same effect as clicking this ship directly in the world (see
      // scene/controls.js): clears any existing selection first, so it
      // exclusively selects this one ship, and opens its ship cam.
      clearSelection();
      setShipSelected(sh, true);
      setShipCamTarget(sh);
      refreshFleetList();
    });
    card._ship = sh;
    list.appendChild(card);
  });
  // The drone isn't in ctx.ships (see docs/architecture.md) and has no
  // ship-cam view of its own — its card selects it and shows it in the
  // SELECTED UNIT panel instead, same as clicking it in the world.
  if(ctx.drone){
    const card = makeCard("drone");
    card.classList.add("drone");
    card.insertAdjacentHTML("beforeend", '<span class="bar"><i class="mat blueBar"></i></span>');
    card.addEventListener("click", function(){
      clearSelection();
      setDroneSelected(ctx.drone, true);
      openDronePanel();
      refreshFleetList();
    });
    card._drone = true;
    list.appendChild(card);
  }
  builtFor = ctx.ships.length + (ctx.drone ? 1000 : 0);
}

export function refreshFleetList(){
  const list = document.getElementById("fleetList");
  if(!list) return;
  if(builtFor !== ctx.ships.length + (ctx.drone ? 1000 : 0)) build(list);
  Array.prototype.forEach.call(list.children, function(card){
    if(card._ship){
      const sh = card._ship;
      card.classList.toggle("sel", !!sh.selected);
      card.querySelector(".cn").textContent = t("fleet.ship")(ctx.ships.indexOf(sh) + 1);
      card.querySelector(".cc").textContent = statusText(sh);
      card.querySelector(".ch").textContent = targetText(sh);
    } else if(card._drone && ctx.drone){
      const d = ctx.drone;
      card.classList.toggle("sel", !!d.selected);
      card.querySelector(".cn").textContent = t("drone.title");
      card.querySelector(".cc").textContent = d.error ? t("drone.error") : (d.running ? t("drone.running") : t("drone.idle"));
      card.querySelector(".ch").textContent = t("drone.fuel");
      card.querySelector(".bar i").style.width = (d.fuel / d.maxFuel * 100).toFixed(1) + "%";
    }
  });
}
