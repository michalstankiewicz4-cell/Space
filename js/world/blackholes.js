import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import {
  FIELD_RADIUS,
  BLACKHOLE_FIRST_SPAWN_MIN_S, BLACKHOLE_FIRST_SPAWN_RANGE_S,
  BLACKHOLE_RESPAWN_MIN_S, BLACKHOLE_RESPAWN_RANGE_S, BLACKHOLE_FADE_OUT_S
} from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { makeAccretionTexture, makeHaloTexture } from "./textures.js";
import { showToast } from "../ui/hud.js";
import { spawnExplosionParticles } from "../fx/particles.js";
import { spawnShockwave } from "../fx/breakup.js";
import { disposeShip, reconcileFleetSize } from "../ships/swarm.js";
import { refreshDock } from "../ui/dock.js";
import { save } from "../core/gameState.js";
import { isSteward } from "../net/presence.js";

let blackHoleTimer = BLACKHOLE_FIRST_SPAWN_MIN_S + Math.random()*BLACKHOLE_FIRST_SPAWN_RANGE_S;

export function randomBlackHoleSpawnData(){
  const radius = 1.1 + Math.random()*0.5;
  const dist = 16 + Math.random()*(FIELD_RADIUS*0.8);
  const theta = Math.random()*Math.PI*2;
  const phi = Math.acos(2*Math.random()-1);
  const pos = new THREE.Vector3(
    dist*Math.sin(phi)*Math.cos(theta),
    dist*Math.sin(phi)*Math.sin(theta)*0.55,
    dist*Math.cos(phi)
  );
  const maxLife = 26 + Math.random()*14;
  return { radius: radius, pos: pos, maxLife: maxLife };
}

export function materializeBlackHole(row, pos){
  const radius = row.radius;
  const group = new THREE.Group();
  group.position.copy(pos);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0x030106 })
  );
  group.add(core);

  const horizon = new THREE.Mesh(
    new THREE.RingGeometry(radius*1.05, radius*1.22, 40),
    new THREE.MeshBasicMaterial({ color:0xcaa8ff, transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide })
  );
  horizon.rotation.x = Math.PI/2 + (Math.random()-0.5)*0.3;
  group.add(horizon);

  // poswiata lensingu grawitacyjnego - sprite (zawsze zwrocony do kamery),
  // wiec z kazdego kata widac ja jako okrag - jak na prawdziwych zdjeciach czarnych dziur
  const haloMat = new THREE.SpriteMaterial({
    map: makeHaloTexture(), color:0xfff3d9, transparent:true, opacity:0.9,
    blending: THREE.AdditiveBlending, depthWrite:false
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius*3.1);
  group.add(halo);

  const diskGeo = new THREE.RingGeometry(radius*1.5, radius*4.2, 64);
  const diskMat = new THREE.MeshBasicMaterial({
    map: makeAccretionTexture(), transparent:true, opacity:0.85,
    blending: THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
  });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.rotation.x = Math.PI/2 + (Math.random()-0.5)*0.3;
  group.add(disk);

  ctx.scene.add(group);

  const elapsedSec = Math.max(0, (Date.now() - new Date(row.spawned_at||Date.now()).getTime())/1000);
  const bh = {
    dbId: row.id,
    group: group, core: core, horizon: horizon, disk: disk, halo: halo,
    radius: radius,
    gravityRadius: radius*7.5,
    killRadius: radius*1.35,
    life: elapsedSec,
    maxLife: row.max_life,
    pulsePhase: Math.random()*10,
    flowSpeed: 0.05+Math.random()*0.06
  };
  ctx.blackholes.push(bh);
  showToast("Wykryto czarną dziurę w sektorze");
  if(NET_ENABLED) ctx.netBodies[row.id] = bh;
  return bh;
}

export function spawnBlackHoleLocalOnly(){
  const data = randomBlackHoleSpawnData();
  materializeBlackHole({
    id: "local-"+Math.random().toString(36).slice(2),
    radius: data.radius, max_life: data.maxLife, spawned_at: new Date().toISOString()
  }, data.pos);
}

export function requestSpawnBlackHole(){
  const data = randomBlackHoleSpawnData();
  supabase.from("bodies").insert({
    kind: "blackhole", radius: data.radius, temp: 0,
    pos_x: data.pos.x, pos_y: data.pos.y, pos_z: data.pos.z,
    max_life: data.maxLife
  }).then(function(res){
    if(res.error) console.warn("requestSpawnBlackHole failed", res.error);
  });
}

export function updateBlackHoles(dt){
  blackHoleTimer -= dt;
  if(blackHoleTimer <= 0 && ctx.blackholes.length === 0){
    if(NET_ENABLED){ if(isSteward) requestSpawnBlackHole(); }
    else { spawnBlackHoleLocalOnly(); }
    blackHoleTimer = BLACKHOLE_RESPAWN_MIN_S + Math.random()*BLACKHOLE_RESPAWN_RANGE_S;
  }

  for(let i=ctx.blackholes.length-1; i>=0; i--){
    const bh = ctx.blackholes[i];
    bh.life += dt;
    bh.disk.rotation.z += dt*0.6;
    bh.disk.material.map.offset.x += dt*bh.flowSpeed;
    bh.pulsePhase += dt*3;
    bh.horizon.material.opacity = 0.6 + 0.35*Math.abs(Math.sin(bh.pulsePhase));
    bh.halo.material.opacity = 0.75 + 0.2*Math.abs(Math.sin(bh.pulsePhase*0.8));
    const haloPulseScale = 1 + 0.04*Math.abs(Math.sin(bh.pulsePhase*0.8));
    bh.halo.scale.setScalar(bh.radius*3.1*haloPulseScale);

    const fadeStart = bh.maxLife - BLACKHOLE_FADE_OUT_S;
    if(bh.life >= fadeStart){
      const e = Math.min(1, (bh.life-fadeStart)/BLACKHOLE_FADE_OUT_S);
      bh.group.scale.setScalar(1-e);
      bh.horizon.material.opacity *= (1-e);
      bh.halo.material.opacity *= (1-e);
      bh.disk.material.opacity = 0.85*(1-e);
    }

    if(bh.life >= bh.maxLife){
      ctx.scene.remove(bh.group);
      bh.core.geometry.dispose(); bh.core.material.dispose();
      bh.horizon.geometry.dispose(); bh.horizon.material.dispose();
      bh.disk.geometry.dispose(); bh.disk.material.dispose();
      bh.halo.material.dispose();
      ctx.blackholes.splice(i,1);
      if(NET_ENABLED && bh.dbId){
        delete ctx.netBodies[bh.dbId];
        if(isSteward) supabase.from("bodies").delete().eq("id", bh.dbId).then(function(){});
      }
    }
  }

  if(ctx.blackholes.length === 0 && blackHoleTimer <= 0){
    // zabezpieczenie: gdyby dziura wygasla w tym samym momencie co zerowanie timera
    blackHoleTimer = BLACKHOLE_RESPAWN_MIN_S + Math.random()*BLACKHOLE_RESPAWN_RANGE_S;
  }

  if(ctx.blackholes.length === 0 || ctx.ships.length === 0) return;

  const toConsume = [];
  for(let s=0;s<ctx.ships.length;s++){
    const sh = ctx.ships[s];
    for(let b=0;b<ctx.blackholes.length;b++){
      const hole = ctx.blackholes[b];
      const toHole = new THREE.Vector3().subVectors(hole.group.position, sh.pos);
      const d = toHole.length();
      if(d < hole.killRadius){
        toConsume.push({ ship: sh, hole: hole });
        break;
      }
      if(d < hole.gravityRadius && d > 0.001){
        const pull = Math.min(0.9, (hole.gravityRadius-d)/hole.gravityRadius) * 6.5;
        sh.vel.addScaledVector(toHole.normalize(), pull*dt);
      }
    }
  }

  toConsume.forEach(function(entry){
    const sh = entry.ship;
    spawnExplosionParticles(sh.pos, new THREE.Color(0xb98cff), 26);
    spawnShockwave({ mesh:{ position: sh.pos, material:{ color:new THREE.Color(0x6a3fb0) } }, radius: 0.7 });
    disposeShip(sh);
    removeItem(ctx.ships, sh);
    showToast("Statek wciągnięty w czarną dziurę!");
  });
  if(toConsume.length>0){ reconcileFleetSize(); refreshDock(); save(); }
}
