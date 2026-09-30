import { ctx } from "../core/context.js";
import { gfxBiteFx } from "../scene/graphics.js";
import { showImpact, hideImpact, disposeImpact } from "../fx/impact.js";

// The lightning beam a ship bites with (ships/swarm.js), and the hot spot
// where it touches the body (fx/impact.js). Two additive tubes — a white
// core and a teal glow — along a zigzag from the ship to the surface. The
// zigzag re-rolls ~11 times a second (the crackle), but the tube is rebuilt
// every frame from the ship's current position, so the beam stretches with
// the ship as it orbits instead of jumping. The meshes are made on a ship's
// first bite and kept (hidden between bites) until the ship goes.
const SEGMENTS = 6, JITTER_S = 0.09;

function zigzag(start, end, offsets){
  const points = [start.clone()];
  for(let i = 1; i < SEGMENTS; i++){
    points.push(new THREE.Vector3().lerpVectors(start, end, i / SEGMENTS).add(offsets[i - 1]));
  }
  points.push(end.clone());
  return points;
}

function jitterOffsets(scale){
  const offs = [];
  for(let i = 1; i < SEGMENTS; i++){
    const f = i / SEGMENTS;
    offs.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(scale * (1 - f * 0.4)));
  }
  return offs;
}

function tube(color, opacity){
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  mesh.renderOrder = 998;
  ctx.scene.add(mesh);
  return mesh;
}

function setTube(mesh, curve, segs, radius, radial){
  const old = mesh.geometry;
  mesh.geometry = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  old.dispose();
  mesh.visible = true;
}

// Every frame a ship bites: the beam from it to `surfacePoint` on its target.
export function showBeam(sh, surfacePoint, dt){
  if(!sh.boltCore){
    sh.boltCore = tube(0xeafbff, 0.95);
    sh.boltGlow = tube(0x4fe3c6, 0.4);
    sh.boltPulse = 0;
  }
  sh.boltJitterTimer = (sh.boltJitterTimer || 0) - dt;
  if(sh.boltJitterTimer <= 0 || !sh.boltJitterOffsets){
    sh.boltJitterTimer = JITTER_S;
    sh.boltJitterOffsets = jitterOffsets(sh.target.radius * 0.35 + 0.15);
  }
  const pts = zigzag(sh.pos, surfacePoint, sh.boltJitterOffsets);
  const curve = new THREE.CatmullRomCurve3(pts);
  setTube(sh.boltCore, curve, pts.length * 3, 0.03, 5);
  setTube(sh.boltGlow, curve, pts.length * 3, 0.08, 6);
  sh.boltPulse += dt * 22;
  const op = 0.6 + 0.4 * Math.abs(Math.sin(sh.boltPulse));
  sh.boltCore.material.opacity = op;
  sh.boltGlow.material.opacity = op * 0.4;
  if(gfxBiteFx()) showImpact(sh, surfacePoint, dt); else hideImpact(sh);
}

export function hideBolt(sh){
  if(sh.boltCore){ sh.boltCore.visible = false; sh.boltGlow.visible = false; }
  hideImpact(sh);
  sh.boltJitterOffsets = null;
  sh.boltJitterTimer = 0;
}

// Is this ship biting right now (the fleet list and unit panel's "Feeding")?
export function isBiting(sh){ return !!(sh.boltCore && sh.boltCore.visible); }

// The ship is gone: its beam and hot spot go too.
export function disposeBeam(sh){
  hideBolt(sh);
  [sh.boltCore, sh.boltGlow].forEach(function(m){
    if(!m) return;
    ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose();
  });
  sh.boltCore = sh.boltGlow = null;
  disposeImpact(sh);
}
