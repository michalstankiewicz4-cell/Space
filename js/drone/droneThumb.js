import { ctx } from "../core/context.js";

// Live "miniature" of the drone in its side panel — same second-render-pass
// technique as scene/shipcam.js (setViewport/setScissor into a sub-rect of
// the same canvas), but positioned to match a DOM element's actual
// bounding box instead of a fixed HUD corner, and framed as a third-person
// chase view (behind + above the drone) rather than first-person.
let camera = null;
let el = null;

export function initDroneThumb(){
  camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  el = document.getElementById("droneThumbWrap");
}

export function renderDroneThumb(){
  const drone = ctx.drone;
  if(!drone || !el || el.offsetParent === null) return; // panel closed -> nothing to draw
  const rect = el.getBoundingClientRect();
  if(rect.width < 2 || rect.height < 2) return;

  const fwd = new THREE.Vector3(Math.sin(drone.heading), 0, Math.cos(drone.heading));
  const camPos = drone.pos.clone().addScaledVector(fwd, -1.1);
  camPos.y += 0.55;
  camera.position.copy(camPos);
  camera.lookAt(drone.pos);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();

  const x = rect.left;
  const y = window.innerHeight - rect.bottom; // WebGL viewport Y origin is bottom-left
  ctx.renderer.setViewport(x, y, rect.width, rect.height);
  ctx.renderer.setScissor(x, y, rect.width, rect.height);
  ctx.renderer.setScissorTest(true);
  ctx.renderer.render(ctx.scene, camera);
  ctx.renderer.setScissorTest(false);
}
