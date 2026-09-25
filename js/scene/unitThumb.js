import { getUnitThumbTarget } from "../ui/hud/unitPanel.js";
import { renderIntoElement } from "./viewRect.js";

// Live miniature of the selected unit (one ship, or the drone) in the
// SELECTED UNIT panel, rendered into #unitThumb's box on the main canvas
// (see scene/viewRect.js). A three-quarter view from the unit's sunlit
// side — the Sun sits at the origin and is the scene's key light, so a
// camera on the far side would mostly show a dark silhouette.
let camera = null;
let el = null;
const POS = new THREE.Vector3();
const DIR = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function initUnitThumb(){
  camera = new THREE.PerspectiveCamera(40, 3, 0.05, 200);
  el = document.getElementById("unitThumb");
}

export function renderUnitThumb(){
  const t = getUnitThumbTarget();
  if(!t) return;
  POS.copy(t.ship ? t.ship.mesh.position : t.drone.pos);
  DIR.copy(POS).negate().setY(0);
  if(DIR.lengthSq() < 1e-6) DIR.set(1, 0, 0);
  DIR.normalize().applyAxisAngle(UP, 0.7);
  const dist = t.ship ? 1.6 : 2.0;
  camera.position.copy(POS).addScaledVector(DIR, dist);
  camera.position.y += dist * 0.45;
  camera.lookAt(POS);
  // Ships fly inside the station's own structure: clipping everything in
  // the first ~70% of the way keeps a strut between the camera and the
  // unit from filling the whole miniature.
  camera.near = dist * 0.7;
  renderIntoElement(el, camera, true);
}
