import { ctx } from "../core/context.js";
import { renderIntoElement } from "./viewRect.js";
import { SHIP_MODEL_LENGTH, DRONE_MODEL_LENGTH } from "../config.js";
import { ORBIT_LAYER } from "./orbitLines.js";

// Picture-in-picture "cockpit" camera for a single ship or the drone (the
// unit panel's COCKPIT button, ui/hud/unitPanel.js), rendered as a
// second pass into #shipCam's on-screen box (a corner of the HUD's 3D
// viewport) on the SAME canvas/renderer, right after the main render — see
// renderShipCamPIP() and its call site in main.js.

let shipCamera = null;
let target = null;
let pipEl = null;
const FORWARD = new THREE.Vector3();
const UP = new THREE.Vector3();
// Empirically, ships' mesh groups (see ships/swarm.js) face their travel
// direction/target along local +Z, not -Z — the opposite of what
// Object3D.lookAt()'s "-Z at target" convention would suggest, most likely
// because the group's own child geometry is pre-rotated 180° around some
// axis before lookAt ever runs. A camera always looks down its own -Z, so
// this 180°-about-Y flip is applied on top of the mesh's quaternion to
// turn its "actual forward" (+Z) into the camera's forward (-Z), without
// touching "up" (unaffected by a rotation around Y).
const FLIP_Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export function initShipCam(){
  shipCamera = new THREE.PerspectiveCamera(65, 1.5, 0.02, 300);
  shipCamera.layers.enable(ORBIT_LAYER);   // orbit lines, as before they got their own layer
  pipEl = document.getElementById("shipCam");
  document.getElementById("shipCamCloseBtn").addEventListener("click", clearShipCamTarget);
}

export function setShipCamTarget(ship){
  target = ship;
  pipEl.classList.remove("hidden");
}

export function clearShipCamTarget(){
  target = null;
  if(pipEl) pipEl.classList.add("hidden");
}

export function isShipCamActive(){
  return !!target;
}

export function getShipCamTarget(){
  return target;
}

// Sits just ahead of and slightly above the ship's own origin, facing the
// same way the ship's mesh does (see the FLIP_Y180 note above for why the
// mesh's quaternion isn't used as-is).
export function updateShipCam(){
  if(!target) return;
  const isDrone = target === ctx.drone;
  if(!isDrone && ctx.ships.indexOf(target) === -1){ clearShipCamTarget(); return; }
  const len = isDrone ? DRONE_MODEL_LENGTH : SHIP_MODEL_LENGTH;
  FORWARD.set(0, 0, 1).applyQuaternion(target.mesh.quaternion);
  UP.set(0, 1, 0).applyQuaternion(target.mesh.quaternion);
  // at the canopy, in proportion to the ship's size
  shipCamera.position.copy(target.mesh.position).addScaledVector(FORWARD, len * (isDrone ? 0.5 : 0.17)).addScaledVector(UP, len * 0.055);
  shipCamera.quaternion.copy(target.mesh.quaternion).multiply(FLIP_Y180);
}

// The unit's own selection ring would cut across the view — hidden for
// this pass only.
export function renderShipCamPIP(){
  if(!target) return;
  const ring = target.selectionRing, wasVisible = ring && ring.visible;
  if(ring) ring.visible = false;
  renderIntoElement(pipEl, shipCamera);
  if(ring) ring.visible = wasVisible;
}
