import { getInfoThumbTarget } from "../ui/hud/infoPanel.js";
import { renderIntoElement } from "./viewRect.js";

// Live miniature of the object in the PLANET INFO panel (a planet, or the
// player's station), rendered into #infoThumb's box on the main canvas
// (see scene/viewRect.js). The camera sits on the object's sunlit side
// (the Sun at the origin is the key light) and slowly sways ±50° around
// it, so the shape and surface read instead of a dark silhouette.
let camera = null;
let el = null;
let swayT = 0;
const DIR = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function initInfoThumb(){
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
  el = document.getElementById("infoThumb");
}

export function renderInfoThumb(dt){
  const t = getInfoThumbTarget();
  if(!t) return;
  swayT += dt * 0.35;
  DIR.copy(t.pos).negate().setY(0);
  // The Sun itself (at the origin): any direction will do.
  if(DIR.lengthSq() < 1e-6) DIR.set(1, 0, 0);
  DIR.normalize().applyAxisAngle(UP, Math.sin(swayT) * 0.87);
  const dist = t.radius * 3.2 + 1.5;
  camera.position.copy(t.pos).addScaledVector(DIR, dist);
  camera.position.y += dist * 0.3;
  camera.lookAt(t.pos);
  camera.near = Math.max(0.05, dist - t.radius * 1.6);
  renderIntoElement(el, camera, true);
}
