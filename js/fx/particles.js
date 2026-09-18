import { ctx } from "../core/context.js";
import { MAX_PARTICLES } from "../config.js";

const particlePool = [];
const particlePositions = new Float32Array(MAX_PARTICLES*3);
const particleColors = new Float32Array(MAX_PARTICLES*3);
let particleGeo, particlePoints;

for(let pi=0; pi<MAX_PARTICLES; pi++){
  particlePositions[pi*3+1] = -9999;
  particlePool.push({ active:false, life:0, maxLife:0, pos:new THREE.Vector3(), vel:new THREE.Vector3(), color:new THREE.Color() });
}

// Tworzy wspólny system cząsteczek (odprysków/wybuchów/smug komet) i dodaje
// go do sceny. Wywołaj raz, po initScene().
export function initParticles(){
  particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions,3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColors,3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.42, vertexColors:true, transparent:true, opacity:1,
    sizeAttenuation:true, blending: THREE.AdditiveBlending,
    depthWrite:false, depthTest:false
  });
  particlePoints = new THREE.Points(particleGeo, particleMat);
  particlePoints.renderOrder = 999;
  ctx.scene.add(particlePoints);
}

function acquireParticle(){
  for(let i=0;i<particlePool.length;i++){
    if(!particlePool[i].active) return particlePool[i];
  }
  return null;
}

export function spawnBiteParticles(surfacePoint, outward, color, count){
  for(let n=0;n<count;n++){
    const pt = acquireParticle();
    if(!pt) break;
    pt.active = true;
    pt.pos.copy(surfacePoint);
    const jitter = new THREE.Vector3((Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)).multiplyScalar(1.3);
    pt.vel.copy(outward).multiplyScalar(1.4+Math.random()*1.8).add(jitter);
    pt.life = 0;
    pt.maxLife = 0.4+Math.random()*0.35;
    pt.color.copy(color);
  }
}

export function spawnExplosionParticles(center, color, count){
  for(let n=0;n<count;n++){
    const pt = acquireParticle();
    if(!pt) break;
    pt.active = true;
    pt.pos.copy(center);
    const dir = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1));
    if(dir.lengthSq()<0.0001) dir.set(1,0,0);
    dir.normalize();
    pt.vel.copy(dir).multiplyScalar(2.2+Math.random()*4.2);
    pt.life = 0;
    pt.maxLife = 0.55+Math.random()*0.55;
    pt.color.copy(color);
  }
}

export function spawnTailParticle(pos, driftDir, color){
  const pt = acquireParticle();
  if(!pt) return;
  pt.active = true;
  pt.pos.copy(pos);
  const jitter = new THREE.Vector3((Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)).multiplyScalar(0.4);
  pt.vel.copy(driftDir).multiplyScalar(0.6+Math.random()*0.5).add(jitter);
  pt.life = 0;
  pt.maxLife = 0.7+Math.random()*0.5;
  pt.color.copy(color);
}

export function updateParticles(dt){
  let needsUpdate = false;
  for(let i=0;i<particlePool.length;i++){
    const pt = particlePool[i];
    if(!pt.active) continue;
    needsUpdate = true;
    pt.life += dt;
    const idx = i*3;
    if(pt.life >= pt.maxLife){
      pt.active = false;
      particlePositions[idx+1] = -9999;
    } else {
      pt.vel.multiplyScalar(0.93);
      pt.pos.addScaledVector(pt.vel, dt);
      const fade = 1-(pt.life/pt.maxLife);
      const boost = 0.7 + 0.5*fade;
      particlePositions[idx]=pt.pos.x; particlePositions[idx+1]=pt.pos.y; particlePositions[idx+2]=pt.pos.z;
      particleColors[idx]=pt.color.r*boost; particleColors[idx+1]=pt.color.g*boost; particleColors[idx+2]=pt.color.b*boost;
    }
  }
  if(needsUpdate){
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
  }
}
