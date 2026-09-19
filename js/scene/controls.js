import { ctx } from "../core/context.js";
import { showToast } from "../ui/hud.js";
import { setShipSelected } from "../ships/swarm.js";
import { bodyVariantKey, bodyValueEstimate } from "../world/bodies.js";
import { t } from "../i18n.js";
import { settings } from "../settings.js";

// Camera: RIGHT button = rotate, scroll = zoom (unless the player swapped
// the buttons in Setup — see rotateButton()/selectButton() below).
export const camState = { az: 0.6, pol: 1.05, radius: 46, autoSpin: true };
let camDragging = false, camLastX = 0, camLastY = 0;
function clampPol(p){ return Math.max(0.35, Math.min(Math.PI-0.35, p)); }

export function updateCamera(dt){
  if(camState.autoSpin) camState.az += dt*0.035;
  const r = camState.radius;
  ctx.camera.position.set(
    r*Math.sin(camState.pol)*Math.cos(camState.az),
    r*Math.cos(camState.pol),
    r*Math.sin(camState.pol)*Math.sin(camState.az)
  );
  ctx.camera.lookAt(0,0,0);
}

const raycaster = new THREE.Raycaster();
const MOUSE_LEFT = 0, MOUSE_RIGHT = 2;
// Logical roles, resolved live from settings so toggling "swap" in Setup
// takes effect immediately without needing to reload.
function rotateButton(){ return settings.swapMouseButtons ? MOUSE_LEFT : MOUSE_RIGHT; }
function selectButton(){ return settings.swapMouseButtons ? MOUSE_RIGHT : MOUSE_LEFT; }
const DRAG_THRESHOLD = 6;
let leftDown = false, leftStartX = 0, leftStartY = 0, leftIsDrag = false;

function ndcFromEvent(e){
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  return {
    x: ((e.clientX-rect.left)/rect.width)*2 - 1,
    y: -((e.clientY-rect.top)/rect.height)*2 + 1
  };
}

function screenPos(vec3){
  const v = vec3.clone().project(ctx.camera);
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (v.x*0.5+0.5)*rect.width,
    y: rect.top + (-v.y*0.5+0.5)*rect.height,
    behind: v.z > 1
  };
}

function pickShipAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  const pickMeshes = ctx.ships.map(function(sh){ return sh.pickMesh; });
  const hits = raycaster.intersectObjects(pickMeshes, false);
  if(hits.length===0) return null;
  return hits[0].object.userData.ship;
}

function pickPlanetAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  const meshes = ctx.planets.map(function(p){ return p.mesh; });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length===0) return null;
  const mesh = hits[0].object;
  for(let i=0;i<ctx.planets.length;i++){ if(ctx.planets[i].mesh===mesh) return ctx.planets[i]; }
  return null;
}

let tooltipEl = null, ttTitleEl = null, ttRow1LabelEl = null, ttRow1ValEl = null, ttRow2LabelEl = null, ttRow2ValEl = null;
const TOOLTIP_OFFSET = 16;

function positionTooltip(clientX, clientY){
  tooltipEl.classList.remove("hidden");
  const rect = tooltipEl.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  tooltipEl.style.left = Math.max(8, Math.min(clientX+TOOLTIP_OFFSET, maxX)) + "px";
  tooltipEl.style.top = Math.max(8, Math.min(clientY+TOOLTIP_OFFSET, maxY)) + "px";
}

function showTooltip(p, clientX, clientY){
  if(!tooltipEl) return;
  ttTitleEl.textContent = t("body." + bodyVariantKey(p));
  ttRow1LabelEl.textContent = t("tooltip.health");
  ttRow1ValEl.textContent = Math.max(0, Math.round(p.health)) + " / " + Math.round(p.maxHealth);
  ttRow2LabelEl.textContent = t("tooltip.value");
  ttRow2ValEl.textContent = "~" + bodyValueEstimate(p);
  positionTooltip(clientX, clientY);
}

function showBlackHoleTooltip(bh, clientX, clientY){
  if(!tooltipEl) return;
  ttTitleEl.textContent = t("body.blackhole");
  ttRow1LabelEl.textContent = t("tooltip.timeLeft");
  ttRow1ValEl.textContent = Math.max(0, Math.round(bh.maxLife-bh.life)) + "s";
  ttRow2LabelEl.textContent = t("tooltip.hazard");
  ttRow2ValEl.textContent = t("tooltip.hazardWarning");
  positionTooltip(clientX, clientY);
}

function hideTooltip(){
  if(tooltipEl) tooltipEl.classList.add("hidden");
}

function pickBlackHoleAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  for(let i=0;i<ctx.blackholes.length;i++){
    const bh = ctx.blackholes[i];
    const hits = raycaster.intersectObjects([bh.core, bh.horizon, bh.disk], false);
    if(hits.length>0) return bh;
  }
  return null;
}

function clearSelection(){
  ctx.ships.forEach(function(sh){ setShipSelected(sh, false); });
}

function selectedShips(){
  return ctx.ships.filter(function(sh){ return sh.selected; });
}

function commandTo(planet, list, cmdFlashEl){
  if(!planet || list.length===0) return;
  list.forEach(function(sh){ sh.commandedTarget = planet; sh.target = planet; });
  const sp = screenPos(planet.mesh.position);
  cmdFlashEl.style.left = sp.x+"px";
  cmdFlashEl.style.top = sp.y+"px";
  cmdFlashEl.classList.remove("fire");
  void cmdFlashEl.offsetWidth;
  cmdFlashEl.classList.add("fire");
  showToast(list.length===ctx.ships.length ? t("toast.orderAll") : t("toast.orderSome")(list.length));
}

// Wires up mouse handling (camera, ship selection, course orders).
// Call once, after initScene().
export function initControls(){
  const selectBoxEl = document.getElementById("selectBox");
  const cmdFlashEl = document.getElementById("cmdFlash");
  const dom = ctx.renderer.domElement;

  tooltipEl = document.getElementById("bodyTooltip");
  ttTitleEl = document.getElementById("ttTitle");
  ttRow1LabelEl = document.getElementById("ttRow1Label");
  ttRow1ValEl = document.getElementById("ttRow1Val");
  ttRow2LabelEl = document.getElementById("ttRow2Label");
  ttRow2ValEl = document.getElementById("ttRow2Val");

  dom.addEventListener("contextmenu", function(e){ e.preventDefault(); });
  dom.addEventListener("pointerleave", hideTooltip);

  dom.addEventListener("wheel", function(e){
    e.preventDefault();
    camState.radius = Math.max(14, Math.min(140, camState.radius + e.deltaY*0.02));
  }, { passive:false });

  dom.addEventListener("pointerdown", function(e){
    hideTooltip();
    if(e.button === rotateButton()){
      camDragging = true; camState.autoSpin = false; camLastX=e.clientX; camLastY=e.clientY;
    } else if(e.button === selectButton()){
      leftDown = true; leftIsDrag = false; leftStartX=e.clientX; leftStartY=e.clientY;
    }
  });

  window.addEventListener("pointermove", function(e){
    if(camDragging){
      const dx = e.clientX-camLastX, dy = e.clientY-camLastY;
      camLastX=e.clientX; camLastY=e.clientY;
      const xSign = settings.invertX ? -1 : 1;
      const ySign = settings.invertY ? -1 : 1;
      camState.az += dx*0.0045*xSign;
      camState.pol = clampPol(camState.pol - dy*0.0045*ySign);
      return;
    }
    if(leftDown){
      const mdx = e.clientX-leftStartX, mdy = e.clientY-leftStartY;
      if(!leftIsDrag && Math.sqrt(mdx*mdx+mdy*mdy) > DRAG_THRESHOLD){ leftIsDrag = true; }
      if(leftIsDrag){
        const x1=Math.min(leftStartX,e.clientX), x2=Math.max(leftStartX,e.clientX);
        const y1=Math.min(leftStartY,e.clientY), y2=Math.max(leftStartY,e.clientY);
        selectBoxEl.style.display = "block";
        selectBoxEl.style.left = x1+"px"; selectBoxEl.style.top = y1+"px";
        selectBoxEl.style.width = (x2-x1)+"px"; selectBoxEl.style.height = (y2-y1)+"px";
      }
      return;
    }
    // hover cursor feedback (not while dragging)
    const overShip = pickShipAt(e);
    const overPlanet = overShip ? null : pickPlanetAt(e);
    const overBlackHole = (overShip || overPlanet) ? null : pickBlackHoleAt(e);
    dom.style.cursor = overShip ? "pointer" : ((overPlanet || overBlackHole) ? "crosshair" : "grab");
    if(overPlanet) showTooltip(overPlanet, e.clientX, e.clientY);
    else if(overBlackHole) showBlackHoleTooltip(overBlackHole, e.clientX, e.clientY);
    else hideTooltip();
  });

  window.addEventListener("pointerup", function(e){
    if(e.button === rotateButton()){ camDragging = false; return; }
    if(e.button !== selectButton() || !leftDown) return;
    leftDown = false;

    if(leftIsDrag){
      selectBoxEl.style.display = "none";
      const x1=Math.min(leftStartX,e.clientX), x2=Math.max(leftStartX,e.clientX);
      const y1=Math.min(leftStartY,e.clientY), y2=Math.max(leftStartY,e.clientY);
      const within = ctx.ships.filter(function(sh){
        const sp = screenPos(sh.pos);
        return !sp.behind && sp.x>=x1 && sp.x<=x2 && sp.y>=y1 && sp.y<=y2;
      });
      if(within.length>0){
        if(!e.shiftKey) clearSelection();
        within.forEach(function(sh){ setShipSelected(sh, true); });
        showToast(t("toast.selected")(selectedShips().length, ctx.ships.length));
      } else if(!e.shiftKey){
        clearSelection();
      }
    } else {
      const hitShip = pickShipAt(e);
      if(hitShip){
        if(!e.shiftKey) clearSelection();
        setShipSelected(hitShip, !hitShip.selected || !e.shiftKey);
      } else {
        const hitPlanet = pickPlanetAt(e);
        if(hitPlanet){
          const sel = selectedShips();
          commandTo(hitPlanet, sel.length>0 ? sel : ctx.ships, cmdFlashEl);
        } else if(!e.shiftKey){
          clearSelection();
        }
      }
    }
  });
}
