import { ctx } from "../core/context.js";
import { getPanelPlanet } from "../ui/planetPanel.js";

// Live "miniature" of the selected planet in its side panel — same
// second-render-pass technique as drone/droneThumb.js (setViewport/
// setScissor into a sub-rect of the same canvas, positioned to match a DOM
// element's actual bounding box). Unlike the drone's fixed chase-cam
// framing, this slowly orbits the planet (driven by dt, like every other
// per-frame update — see main.js's tick()) so its shape/texture actually
// reads instead of showing one static, possibly-featureless face forever.
let camera = null;
let el = null;
let orbitAngle = 0;

export function initPlanetThumb(){
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  el = document.getElementById("planetThumbWrap");
}

export function renderPlanetThumb(dt){
  const p = getPanelPlanet();
  if(!p || p.dying || !el || el.offsetParent === null) return; // panel closed -> nothing to draw
  const rect = el.getBoundingClientRect();
  if(rect.width < 2 || rect.height < 2) return;

  orbitAngle += dt * 0.3;
  const dist = p.radius * 3.2 + 1.5;
  const camPos = p.mesh.position.clone().add(new THREE.Vector3(
    Math.sin(orbitAngle) * dist, dist * 0.35, Math.cos(orbitAngle) * dist
  ));
  camera.position.copy(camPos);
  camera.lookAt(p.mesh.position);
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
