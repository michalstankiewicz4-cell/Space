import { ctx } from "../core/context.js";

// The hot spot where a ship's bite beam touches a body (Setup -> Graphics
// -> Bite effects): a flickering white-orange glow sprite at the contact
// point, sized to the ship's beam rather than the body, drawn over the
// surface. One per biting ship, hidden with the beam (ships/swarm.js).
// The glowing, slowly cooling scars on the surface itself are the body's
// scorch texture (world/bodies.js#paintScorch).
let texture = null;
function glowTexture(){
  if(texture) return texture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,240,1)");
  grad.addColorStop(0.18, "rgba(255,220,150,0.9)");
  grad.addColorStop(0.45, "rgba(255,120,40,0.35)");
  grad.addColorStop(1, "rgba(160,30,10,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  texture = new THREE.CanvasTexture(c);
  return texture;
}

export function showImpact(sh, point, dt){
  if(!sh.impactSprite){
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, toneMapped: false });
    sh.impactSprite = new THREE.Sprite(mat);
    sh.impactSprite.renderOrder = 997;
    sh.impactSprite.raycast = function(){};
    sh.impactFlicker = 0;
    ctx.scene.add(sh.impactSprite);
  }
  sh.impactFlicker += dt * 30;
  const f = 0.75 + 0.25 * Math.sin(sh.impactFlicker) * Math.sin(sh.impactFlicker * 0.37 + 1.7);
  sh.impactSprite.position.copy(point);
  sh.impactSprite.scale.setScalar(0.55 * f);
  sh.impactSprite.material.opacity = 0.85 * f;
  sh.impactSprite.visible = true;
}

export function hideImpact(sh){
  if(sh.impactSprite) sh.impactSprite.visible = false;
}

// A ship removed for good: its sprite goes too.
export function disposeImpact(sh){
  if(!sh.impactSprite) return;
  ctx.scene.remove(sh.impactSprite);
  sh.impactSprite.material.dispose();
  sh.impactSprite = null;
}
