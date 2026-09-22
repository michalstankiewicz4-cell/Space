import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { showToast } from "../ui/hud.js";
import { setShipSelected } from "../ships/swarm.js";
import { setPlanetSelected } from "../world/bodyMeshParts.js";
import { openDronePanel, closeDronePanel } from "../ui/dronePanel.js";
import { setDroneSelected } from "../drone/drone.js";
import { openStationPanel, closeStationPanel } from "../ui/stationPanel.js";
import { setStationSelected } from "../station/station.js";
import { openPlanetPanel, closePlanetPanel } from "../ui/planetPanel.js";
import { pickShipAt, pickDroneAt, pickStationAt, pickPlanetAt, pickBlackHoleAt } from "./picking.js";
import { initTooltip, showTooltip, showBlackHoleTooltip, hideTooltip } from "./tooltip.js";
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

const MOUSE_LEFT = 0, MOUSE_RIGHT = 2;
// Logical roles, resolved live from settings so toggling "swap" in Setup
// takes effect immediately without needing to reload.
function rotateButton(){ return settings.swapMouseButtons ? MOUSE_LEFT : MOUSE_RIGHT; }
function selectButton(){ return settings.swapMouseButtons ? MOUSE_RIGHT : MOUSE_LEFT; }
const DRAG_THRESHOLD = 6;
let leftDown = false, leftStartX = 0, leftStartY = 0, leftIsDrag = false;

function screenPos(vec3){
  const v = vec3.clone().project(ctx.camera);
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (v.x*0.5+0.5)*rect.width,
    y: rect.top + (-v.y*0.5+0.5)*rect.height,
    behind: v.z > 1
  };
}

// Planets support multi-select (for Dev Tools' "connect selected planets"
// line, see scene/planetDistanceLines.js) unlike the ship/drone/station's
// single-flag pattern — order matters (the line connects them in the order
// they were clicked), which a plain `.selected` boolean can't reconstruct
// on its own, so this is the one deliberate exception to this file's
// otherwise-universal "compute the filtered list on demand" convention
// (compare selectedShips() below).
let planetSelectionOrder = [];

// Exported so scene/planetDistanceLines.js can read the current multi-
// selection (in click order) without duplicating this file's tracking —
// read-only from the caller's side, only this file ever pushes/splices it.
export function getSelectedPlanetsOrdered(){
  for(let i=planetSelectionOrder.length-1;i>=0;i--){
    if(planetSelectionOrder[i].dying) planetSelectionOrder.splice(i,1);
  }
  return planetSelectionOrder;
}

function deselectAllPlanets(){
  if(planetSelectionOrder.length === 0) return;
  planetSelectionOrder.forEach(function(p){ setPlanetSelected(p, false); });
  planetSelectionOrder = [];
  closePlanetPanel();
}

// Exported so other selection entry points (e.g. ui/fleet.js's ship-list
// clicks) can match exactly what a plain click in the world does, instead
// of duplicating this clear-everything-first logic.
export function clearSelection(){
  ctx.ships.forEach(function(sh){ setShipSelected(sh, false); });
  if(ctx.drone && ctx.drone.selected) closeDronePanel();
  if(ctx.station && ctx.station.selected) closeStationPanel();
  deselectAllPlanets();
}

function selectedShips(){
  return ctx.ships.filter(function(sh){ return sh.selected; });
}

// Drone/station selection is the same 3-step shape wherever it happens
// (drag-select and plain-click below both need it) — the only thing that
// differs per kind is which setSelected/openPanel pair to call. Doesn't
// itself handle clearSelection()/shift-key logic, since drag-select and
// plain-click each decide that differently.
function selectSingleton(obj, setSelectedFn, openPanelFn){
  deselectAllPlanets();
  setSelectedFn(obj, true);
  openPanelFn();
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

  initTooltip();

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
    const overDrone = overShip ? null : pickDroneAt(e);
    const overStation = (overShip || overDrone) ? null : pickStationAt(e);
    const overPlanet = (overShip || overDrone || overStation) ? null : pickPlanetAt(e);
    const overBlackHole = (overShip || overDrone || overStation || overPlanet) ? null : pickBlackHoleAt(e);
    dom.style.cursor = (overShip || overDrone || overStation) ? "pointer" : ((overPlanet || overBlackHole) ? "crosshair" : "grab");
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
      // A real click on the drone can jitter a pixel or two and land here
      // instead of the plain-click branch below (DRAG_THRESHOLD is only
      // 6px) — without this, that tiny jitter would silently fail to
      // select the drone at all (unlike ships, which this same box always
      // catches), making it feel unresponsive/unselectable.
      let droneHit = false;
      if(ctx.drone){
        const sp = screenPos(ctx.drone.pos);
        droneHit = !sp.behind && sp.x>=x1 && sp.x<=x2 && sp.y>=y1 && sp.y<=y2;
      }
      let stationHit = false;
      if(ctx.station){
        const sp = screenPos(ctx.station.pos);
        stationHit = !sp.behind && sp.x>=x1 && sp.x<=x2 && sp.y>=y1 && sp.y<=y2;
      }
      if(within.length>0 || droneHit || stationHit){
        if(!e.shiftKey) clearSelection();
        within.forEach(function(sh){ setShipSelected(sh, true); });
        // Drone/station and the planet panel share the same right-side HUD
        // slot (see ui/planetPanel.js) — selecting either one always closes
        // a still-open planet selection, even with shift held (clearSelection()
        // above only runs without shift).
        if(droneHit) selectSingleton(ctx.drone, setDroneSelected, openDronePanel);
        if(stationHit) selectSingleton(ctx.station, setStationSelected, openStationPanel);
        if(within.length>0) showToast(t("toast.selected")(selectedShips().length, ctx.ships.length));
      } else if(!e.shiftKey){
        clearSelection();
      }
    } else {
      const hitDrone = pickDroneAt(e);
      if(hitDrone){
        if(!e.shiftKey) clearSelection();
        selectSingleton(hitDrone, setDroneSelected, openDronePanel);
        return;
      }
      const hitStation = pickStationAt(e);
      if(hitStation){
        if(!e.shiftKey) clearSelection();
        selectSingleton(hitStation, setStationSelected, openStationPanel);
        return;
      }
      const hitShip = pickShipAt(e);
      if(hitShip){
        if(!e.shiftKey) clearSelection();
        setShipSelected(hitShip, !hitShip.selected || !e.shiftKey);
      } else {
        const hitPlanet = pickPlanetAt(e);
        if(hitPlanet){
          if(e.shiftKey){
            // Shift+click a planet always toggles it in/out of the
            // multi-select (for Dev Tools' distance line) and never
            // commands the fleet — decoupled from plain-click's
            // command-if-ships-selected behavior below, so there's no
            // ambiguity between "order ships here" and "add to selection".
            if(ctx.drone && ctx.drone.selected) closeDronePanel();
            if(ctx.station && ctx.station.selected) closeStationPanel();
            if(hitPlanet.selected){
              setPlanetSelected(hitPlanet, false);
              removeItem(planetSelectionOrder, hitPlanet);
            } else {
              setPlanetSelected(hitPlanet, true);
              planetSelectionOrder.push(hitPlanet);
            }
            if(planetSelectionOrder.length > 0) openPlanetPanel(planetSelectionOrder[planetSelectionOrder.length-1]);
            else closePlanetPanel();
          } else {
            const sel = selectedShips();
            if(sel.length>0){
              commandTo(hitPlanet, sel, cmdFlashEl);
            } else {
              clearSelection();
              setPlanetSelected(hitPlanet, true);
              planetSelectionOrder.push(hitPlanet);
              openPlanetPanel(hitPlanet);
            }
          }
        } else if(!e.shiftKey){
          clearSelection();
        }
      }
    }
  });
}
