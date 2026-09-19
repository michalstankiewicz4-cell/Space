import { ctx } from "../core/context.js";
import { showToast } from "../ui/hud.js";
import { setShipSelected } from "../ships/swarm.js";
import { t } from "../i18n.js";

// Kamera: PRAWY przycisk = obrót, scroll = zoom.
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
const LEFT = 0, RIGHT = 2;
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

// Podpina obsługę myszki (kamera, zaznaczanie statków, rozkazy kursu).
// Wywołaj raz, po initScene().
export function initControls(){
  const selectBoxEl = document.getElementById("selectBox");
  const cmdFlashEl = document.getElementById("cmdFlash");
  const dom = ctx.renderer.domElement;

  dom.addEventListener("contextmenu", function(e){ e.preventDefault(); });

  dom.addEventListener("wheel", function(e){
    e.preventDefault();
    camState.radius = Math.max(14, Math.min(140, camState.radius + e.deltaY*0.02));
  }, { passive:false });

  dom.addEventListener("pointerdown", function(e){
    if(e.button === RIGHT){
      camDragging = true; camState.autoSpin = false; camLastX=e.clientX; camLastY=e.clientY;
    } else if(e.button === LEFT){
      leftDown = true; leftIsDrag = false; leftStartX=e.clientX; leftStartY=e.clientY;
    }
  });

  window.addEventListener("pointermove", function(e){
    if(camDragging){
      const dx = e.clientX-camLastX, dy = e.clientY-camLastY;
      camLastX=e.clientX; camLastY=e.clientY;
      camState.az += dx*0.0045;
      camState.pol = clampPol(camState.pol - dy*0.0045);
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
    // hover cursor feedback (nie podczas przeciagania)
    const overShip = pickShipAt(e);
    const overPlanet = overShip ? null : pickPlanetAt(e);
    dom.style.cursor = overShip ? "pointer" : (overPlanet ? "crosshair" : "grab");
  });

  window.addEventListener("pointerup", function(e){
    if(e.button === RIGHT){ camDragging = false; return; }
    if(e.button !== LEFT || !leftDown) return;
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
