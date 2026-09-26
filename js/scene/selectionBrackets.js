import { ctx } from "../core/context.js";
import { getViewRect } from "./viewRect.js";

// Selection indicator for bodies (planets, the Sun, the meteoroid, comets,
// the black hole) and other players' stations: four thin L-shaped corner marks drawn as an HTML overlay
// on the 3D view, not in the scene — so the lines stay BRACKET_LINE_PX
// thick and the arms short at any zoom, and they never show up in the
// ship cam or the PLANET INFO miniature. The frame follows the body's size
// on screen, BRACKET_GAP_PX outside its edge. Ships, the drone and the
// station keep their own rings. Styling: css/ui/hud/viewport.css
// (#selectionBrackets); the line width is set there too (2px).
const BRACKET_GAP_PX = 8;       // between the body's edge and the marks
const BRACKET_ARM_MAX_PX = 12;  // arm length (shorter for a tiny frame)
const BRACKET_MIN_HALF_PX = 10; // a speck still gets a clickable-looking frame

let layer = null;
const pool = [];               // reused bracket elements
const center = new THREE.Vector3(), edge = new THREE.Vector3(), right = new THREE.Vector3();

// Purely a selection flag, same RTS-style pattern as setShipSelected/
// setDroneSelected/setStationSelected — never touches the camera. Planets
// support MULTI-select (scene/controls.js's planetSelectionOrder, for the
// dev-tools "connect selected planets" line), so this only toggles the one
// body's flag — the caller tracks which bodies are selected; the brackets
// below are drawn for every selected one.
export function setPlanetSelected(p, val){
  p.selected = val;
}

function bodyPos(b){ return b.mesh ? b.mesh.position : b.group.position; }

function bracketEl(i){
  if(pool[i]) return pool[i];
  const el = document.createElement("div");
  el.className = "selBracket";
  for(const c of ["tl", "tr", "bl", "br"]){
    const corner = document.createElement("i");
    corner.className = c;
    el.appendChild(corner);
  }
  layer.appendChild(el);
  pool[i] = el;
  return el;
}

// Every frame, after the camera has moved (main.js): place one frame per
// selected body, hide the rest.
export function updateSelectionBrackets(){
  if(!layer){
    // straight under <body>: inside the HUD (transform-scaled) a fixed
    // layer would be offset and scaled with it
    layer = document.createElement("div");
    layer.id = "selectionBrackets";
    document.body.appendChild(layer);
  }
  const rect = getViewRect();
  layer.style.left = rect.left + "px"; layer.style.top = rect.top + "px";
  layer.style.width = rect.width + "px"; layer.style.height = rect.height + "px";
  right.setFromMatrixColumn(ctx.camera.matrixWorld, 0);   // the camera's screen-right, in world space
  let n = 0;
  const bodies = ctx.planets.concat(ctx.blackholes);
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const ref = ctx.remotePlayers[id].stationRef;
    if(ref && ref.selected) bodies.push(ref);
  });
  for(let i = 0; i < bodies.length; i++){
    const b = bodies[i];
    if(!b.selected || b.dying) continue;
    center.copy(bodyPos(b)).project(ctx.camera);
    if(center.z > 1) continue;                            // behind the camera
    // the body's radius on screen: its center vs a point one radius to the side
    const r = b.frameRadius || (b.group ? b.radius * 2.2 : b.radius);   // a black hole: around its disk's core
    edge.copy(bodyPos(b)).addScaledVector(right, r).project(ctx.camera);
    const cx = (center.x * 0.5 + 0.5) * rect.width, cy = (-center.y * 0.5 + 0.5) * rect.height;
    const rpx = Math.abs(edge.x - center.x) * 0.5 * rect.width;
    const half = Math.max(BRACKET_MIN_HALF_PX, rpx + BRACKET_GAP_PX);
    const arm = Math.min(BRACKET_ARM_MAX_PX, half * 0.6);
    const el = bracketEl(n++);
    el.style.display = "block";
    el.style.left = (cx - half) + "px"; el.style.top = (cy - half) + "px";
    el.style.width = el.style.height = (half * 2) + "px";
    el.style.setProperty("--arm", arm + "px");
  }
  for(let i = n; i < pool.length; i++) pool[i].style.display = "none";
}
