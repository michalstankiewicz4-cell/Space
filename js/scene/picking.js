import { ctx } from "../core/context.js";
import { getViewRect } from "./viewRect.js";

// Raycasting hit-tests for everything clickable in the world — split out
// of scene/controls.js (which had grown crowded after ships/drone/station/
// planet selection all accumulated there over several sessions) since
// picking is a self-contained concern: given a pointer event, what did it
// hit. One shared THREE.Raycaster instance, reused across every pick call
// the same way controls.js always did — raycasting is synchronous and
// single-threaded, so there's never a need for more than one at a time.
const raycaster = new THREE.Raycaster();

// Relative to the 3D view's own rect (the HUD viewport), not the
// full-window canvas — see scene/viewRect.js.
function ndcFromEvent(e){
  const rect = getViewRect();
  return {
    x: ((e.clientX-rect.left)/rect.width)*2 - 1,
    y: -((e.clientY-rect.top)/rect.height)*2 + 1
  };
}

export function pickShipAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  const pickMeshes = ctx.ships.map(function(sh){ return sh.pickMesh; });
  const hits = raycaster.intersectObjects(pickMeshes, false);
  if(hits.length===0) return null;
  return hits[0].object.userData.ship;
}

// Shared by every "at most one of these exists" pickable (drone, station) —
// unlike ships/planets/black holes, there's only ever zero or one, so there's
// no need for intersectObjects()+array-search, just a single pickMesh test.
function pickSingletonAt(e, obj){
  if(!obj) return null;
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  const hits = raycaster.intersectObject(obj.pickMesh, false);
  return hits.length > 0 ? obj : null;
}

export function pickDroneAt(e){
  return pickSingletonAt(e, ctx.drone);
}

export function pickStationAt(e){
  return pickSingletonAt(e, ctx.station);
}

export function pickPlanetAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  const meshes = ctx.planets.map(function(p){ return p.mesh; });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length===0) return pickSmallBodyAt(e);
  const mesh = hits[0].object;
  for(let i=0;i<ctx.planets.length;i++){ if(ctx.planets[i].mesh===mesh) return ctx.planets[i]; }
  return null;
}

// A body that's only a few pixels on screen (a comet — small and fast — or
// anything far away) is near impossible to hit exactly: within
// SMALL_PICK_PX of its center counts, the nearest one wins.
const SMALL_PICK_PX = 14;
const projScratch = new THREE.Vector3();
function pickSmallBodyAt(e){
  const rect = getViewRect();
  let best = null, bestD = SMALL_PICK_PX;
  for(let i = 0; i < ctx.planets.length; i++){
    const p = ctx.planets[i];
    if(p.dying) continue;
    projScratch.copy(p.mesh.position).project(ctx.camera);
    if(projScratch.z > 1) continue;                         // behind the camera
    const x = rect.left + (projScratch.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-projScratch.y * 0.5 + 0.5) * rect.height;
    const d = Math.hypot(x - e.clientX, y - e.clientY);
    if(d < bestD){ bestD = d; best = p; }
  }
  return best;
}

export function pickBlackHoleAt(e){
  const ndc = ndcFromEvent(e);
  raycaster.setFromCamera(ndc, ctx.camera);
  for(let i=0;i<ctx.blackholes.length;i++){
    const bh = ctx.blackholes[i];
    const hits = raycaster.intersectObject(bh.pickMesh, false);
    if(hits.length>0) return bh;
  }
  return null;
}
