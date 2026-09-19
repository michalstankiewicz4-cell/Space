import { ctx } from "../core/context.js";

// Picture-in-picture "cockpit" camera for a single ship, rendered as a
// second pass into a small corner rectangle of the SAME canvas/renderer
// (via setViewport/setScissor) right after the main full-screen render —
// see renderShipCamPIP() and its call site in main.js. Keep PIP_WIDTH/
// PIP_HEIGHT/PIP_MARGIN in sync with #shipCam's CSS size/position.
const PIP_WIDTH = 220, PIP_HEIGHT = 150, PIP_MARGIN = 18;

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
  shipCamera = new THREE.PerspectiveCamera(65, PIP_WIDTH / PIP_HEIGHT, 0.05, 300);
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

// Sits just ahead of and slightly above the ship's own origin, facing the
// same way the ship's mesh does (see the FLIP_Y180 note above for why the
// mesh's quaternion isn't used as-is).
export function updateShipCam(){
  if(!target) return;
  if(ctx.ships.indexOf(target) === -1){ clearShipCamTarget(); return; }
  FORWARD.set(0, 0, 1).applyQuaternion(target.mesh.quaternion);
  UP.set(0, 1, 0).applyQuaternion(target.mesh.quaternion);
  shipCamera.position.copy(target.mesh.position).addScaledVector(FORWARD, 0.15).addScaledVector(UP, 0.05);
  shipCamera.quaternion.copy(target.mesh.quaternion).multiply(FLIP_Y180);
}

export function renderShipCamPIP(){
  if(!target) return;
  const x = window.innerWidth - PIP_WIDTH - PIP_MARGIN;
  const y = PIP_MARGIN;
  ctx.renderer.setViewport(x, y, PIP_WIDTH, PIP_HEIGHT);
  ctx.renderer.setScissor(x, y, PIP_WIDTH, PIP_HEIGHT);
  ctx.renderer.setScissorTest(true);
  ctx.renderer.render(ctx.scene, shipCamera);
  ctx.renderer.setScissorTest(false);
}
