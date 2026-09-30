import { ctx } from "../core/context.js";
import { MAX_PARTICLES } from "../config.js";

const particlePool = [];
const particlePositions = new Float32Array(MAX_PARTICLES*3);
const particleColors = new Float32Array(MAX_PARTICLES*3);
let particleGeo, particlePoints;

for(let pi=0; pi<MAX_PARTICLES; pi++){
  particlePositions[pi*3+1] = -9999;
  particlePool.push({ active:false, hot:false, life:0, maxLife:0, pos:new THREE.Vector3(), vel:new THREE.Vector3(), color:new THREE.Color() });
}

// Creates the shared particle system (bite debris/explosions) and adds it
// to the scene. Call once, after initScene(). Comets used to also spawn a
// sparkle trail from this pool (spawnTailParticle, removed) - at real
// comet speeds (up to ~44 units/s near perihelion) a fixed-time spawn
// interval spaced particles too far apart to read as a continuous trail,
// showing up instead as a visibly dashed line of separate dots trailing
// the comet - reported live, and redundant with the comet's own geometric
// tail (BodyKit's comet, js/bodykit/bodykit.js) plus the new trajectory line
// (scene/orbitLines.js#buildCometTrajectoryLine) anyway.
// A soft round dot for every particle (a bare PointsMaterial draws squares).
function dotTexture(){
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function initParticles(){
  particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions,3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColors,3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.42, vertexColors:true, transparent:true, opacity:1, map: dotTexture(),
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
    pt.hot = false;
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
    pt.hot = false;
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

// Sparks from a bite (Setup -> Graphics -> Bite effects): fast, white-hot,
// cooling through yellow and orange to a dull red as they fly
// (sparkColor), slowed by drag like the rest.
const SPARK_RAMP = [[1, 1, 0.92], [1, 0.85, 0.45], [1, 0.45, 0.12], [0.55, 0.08, 0.03]];
function sparkColor(f, out){
  const x = Math.min(0.999, f) * (SPARK_RAMP.length - 1), i = Math.floor(x), k = x - i;
  const a = SPARK_RAMP[i], b = SPARK_RAMP[i + 1];
  return out.setRGB(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k).convertSRGBToLinear();
}
export function spawnSparks(surfacePoint, outward, count){
  for(let n = 0; n < count; n++){
    const pt = acquireParticle();
    if(!pt) break;
    pt.active = true;
    pt.hot = true;
    pt.pos.copy(surfacePoint);
    const jitter = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4);
    pt.vel.copy(outward).multiplyScalar(3 + Math.random() * 4).add(jitter);
    pt.life = 0;
    pt.maxLife = 0.35 + Math.random() * 0.5;
  }
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
      if(pt.hot){
        sparkColor(pt.life / pt.maxLife, pt.color);
        particleColors[idx]=pt.color.r*fade*1.4; particleColors[idx+1]=pt.color.g*fade*1.4; particleColors[idx+2]=pt.color.b*fade*1.4;
        continue;
      }
      particleColors[idx]=pt.color.r*boost; particleColors[idx+1]=pt.color.g*boost; particleColors[idx+2]=pt.color.b*boost;
    }
  }
  if(needsUpdate){
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
  }
}
