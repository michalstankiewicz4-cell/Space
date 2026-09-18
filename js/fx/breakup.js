import { ctx } from "../core/context.js";
import { makeRockGeometry, generateDustTexture } from "../world/textures.js";
import { spawnExplosionParticles } from "./particles.js";

// Rozpad planety (odłamki + fala uderzeniowa + pył) — wszystko czysto
// wizualne, wywoływane raz w momencie zjedzenia/zniszczenia ciała.

function spawnFragments(planet){
  const color = planet.mesh.material.color;
  const count = 9 + Math.floor(planet.radius*4);
  for(let i=0;i<count;i++){
    const size = planet.radius*(0.14+Math.random()*0.24);
    const geo = makeRockGeometry(size);
    const mat = new THREE.MeshStandardMaterial({
      color: color.clone(), emissive: color.clone(), emissiveIntensity:0.55,
      roughness:0.85, metalness:0.08, flatShading:true, transparent:true, opacity:1
    });
    const mesh = new THREE.Mesh(geo, mat);
    const dir = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1));
    if(dir.lengthSq()<0.0001) dir.set(1,0,0);
    dir.normalize();
    mesh.position.copy(planet.mesh.position).addScaledVector(dir, planet.radius*0.4*Math.random());
    mesh.rotation.set(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2);
    ctx.scene.add(mesh);
    ctx.fragments.push({
      mesh: mesh,
      vel: dir.clone().multiplyScalar(2.3+Math.random()*4.3),
      angVel: new THREE.Vector3((Math.random()-0.5)*4,(Math.random()-0.5)*4,(Math.random()-0.5)*4),
      life: 0,
      maxLife: 9+Math.random()*7
    });
  }
}

export function updateFragments(dt){
  for(let i=ctx.fragments.length-1; i>=0; i--){
    const f = ctx.fragments[i];
    f.life += dt;
    if(f.life >= f.maxLife){
      ctx.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
      ctx.fragments.splice(i,1);
      continue;
    }
    // opor niezalezny od liczby ramek - spowalnia w ciagu ok. 2-3 sekund,
    // po czym odlamek dryfuje/wisi w miejscu az do wygaśniecia (dluzszy zywot)
    f.vel.multiplyScalar(Math.pow(0.45, dt));
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.angVel.x*dt;
    f.mesh.rotation.y += f.angVel.y*dt;
    f.mesh.rotation.z += f.angVel.z*dt;
    const t = f.life/f.maxLife;
    f.mesh.material.opacity = t < 0.85 ? 1 : 1-((t-0.85)/0.15);
    f.mesh.scale.setScalar(1-Math.max(0,t-0.85)/0.15*0.6);
  }
}

export function spawnShockwave(planet){
  const geo = new THREE.RingGeometry(0.15, 0.32, 40);
  const mat = new THREE.MeshBasicMaterial({
    color: planet.mesh.material.color, transparent:true, opacity:0.85,
    blending: THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.copy(planet.mesh.position);
  ring.lookAt(ctx.camera.position);
  ctx.scene.add(ring);
  ctx.shockwaves.push({ mesh: ring, life:0, maxLife:0.55, baseRadius: Math.max(1, planet.radius) });
}

export function updateShockwaves(dt){
  for(let i=ctx.shockwaves.length-1; i>=0; i--){
    const s = ctx.shockwaves[i];
    s.life += dt;
    if(s.life >= s.maxLife){
      ctx.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      ctx.shockwaves.splice(i,1);
      continue;
    }
    const t = s.life/s.maxLife;
    const scale = s.baseRadius*(1+t*5);
    s.mesh.scale.setScalar(scale);
    s.mesh.material.opacity = 0.85*(1-t);
  }
}

let dustTexture = null;

function spawnDustCloud(center, planetColor, radius){
  if(!dustTexture) dustTexture = generateDustTexture();
  const greyBase = new THREE.Color(0x9a958d);
  const count = 10 + Math.round(radius*3.2);
  for(let i=0;i<count;i++){
    const tint = greyBase.clone().lerp(planetColor, 0.3+Math.random()*0.3);
    const mat = new THREE.SpriteMaterial({
      map: dustTexture, color: tint, transparent:true,
      opacity: 0.5+Math.random()*0.3, blending: THREE.NormalBlending,
      depthWrite:false, rotation: Math.random()*Math.PI*2
    });
    const sprite = new THREE.Sprite(mat);
    const dir = new THREE.Vector3((Math.random()*2-1),(Math.random()*2-1),(Math.random()*2-1));
    if(dir.lengthSq()<0.0001) dir.set(1,0,0);
    dir.normalize();
    sprite.position.copy(center).addScaledVector(dir, radius*0.3*Math.random());
    const baseScale = radius*(0.6+Math.random()*0.7);
    sprite.scale.setScalar(baseScale);
    ctx.scene.add(sprite);
    ctx.dustParticles.push({
      sprite: sprite,
      vel: dir.clone().multiplyScalar(1.0+Math.random()*1.7),
      spinSpeed: (Math.random()-0.5)*1.3,
      baseScale: baseScale,
      growth: 1.3+Math.random()*1.1,
      life: 0,
      maxLife: 5.2+Math.random()*4.2,
      baseOpacity: mat.opacity
    });
  }
}

export function updateDust(dt){
  for(let i=ctx.dustParticles.length-1; i>=0; i--){
    const d = ctx.dustParticles[i];
    d.life += dt;
    if(d.life >= d.maxLife){
      ctx.scene.remove(d.sprite);
      d.sprite.material.dispose();
      ctx.dustParticles.splice(i,1);
      continue;
    }
    d.vel.multiplyScalar(Math.pow(0.3, dt));
    d.sprite.position.addScaledVector(d.vel, dt);
    d.sprite.material.rotation += d.spinSpeed*dt;
    const t = d.life/d.maxLife;
    d.sprite.scale.setScalar(d.baseScale*(1+d.growth*Math.min(1, t*1.3)));
    const fadeIn = Math.min(1, t/0.12);
    const fadeOut = t < 0.6 ? 1 : 1-((t-0.6)/0.4);
    d.sprite.material.opacity = d.baseOpacity*fadeIn*Math.max(0,fadeOut);
  }
}

export function triggerBreakup(planet){
  spawnFragments(planet);
  spawnShockwave(planet);
  spawnExplosionParticles(planet.mesh.position, planet.mesh.material.color, 32 + Math.round(planet.radius*10));
  spawnDustCloud(planet.mesh.position, planet.mesh.material.color, planet.radius);
}
