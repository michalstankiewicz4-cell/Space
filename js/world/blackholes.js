import { ctx } from "../core/context.js";
import { removeItem, disposeMesh } from "../core/utils.js";
import { FIELD_RADIUS } from "../config.js";
import { CONTENT } from "../content.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { makeAccretionTexture, makeHaloTexture } from "./textures.js";
import { showToast } from "../ui/hud.js";
import { spawnExplosionParticles } from "../fx/particles.js";
import { spawnShockwave } from "../fx/breakup.js";
import { disposeShip } from "../ships/swarm.js";
import { refreshDock } from "../ui/dock.js";
import { save } from "../core/gameState.js";
import { isSteward } from "../net/presence.js";
import { createStalenessGate } from "../net/stewardFallback.js";
import { stopDroneScript } from "../drone/drone.js";
import { t } from "../i18n.js";

let blackHoleTimer = CONTENT.blackhole.firstSpawnMinS + Math.random()*CONTENT.blackhole.firstSpawnRangeS;

// Reused every frame by updateBlackHoles()'s gravity loops (ships, then
// drone) instead of a fresh `new THREE.Vector3()` per ship/drone x
// black-hole pair — see the comment at its first use site below.
const toHoleScratch = new THREE.Vector3();

// See net/stewardFallback.js for why this needs both an isConnected() guard
// and a staleness fallback, not just steward-gating (this exact gap once
// meant black holes could stop appearing for a whole session — see
// CLAUDE.md's "Realtime channel health has no free lunch"). bump() is
// called in materializeBlackHole() below, which every client's own spawn
// *and* every remote one they observe both go through. The base/jitter here
// (90-120s) sits comfortably above the longest legitimate gap between two
// black holes (respawnMinS..respawnMinS+respawnRangeS, 34-58s) so it never
// fires during normal play.
const blackHoleTopupGate = createStalenessGate(90000, 30000);

export function randomBlackHoleSpawnData(){
  const bh = CONTENT.blackhole;
  const radius = bh.radiusMin + Math.random()*bh.radiusRange;
  const dist = 16 + Math.random()*(FIELD_RADIUS*0.8);
  const theta = Math.random()*Math.PI*2;
  const phi = Math.acos(2*Math.random()-1);
  const pos = new THREE.Vector3(
    dist*Math.sin(phi)*Math.cos(theta),
    dist*Math.sin(phi)*Math.sin(theta)*0.55,
    dist*Math.cos(phi)
  );
  const maxLife = bh.lifeMin + Math.random()*bh.lifeRange;
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

  // gravitational-lensing glow - a sprite (always facing the camera), so
  // from any angle it looks like a ring - like in real black hole photos
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
  blackHoleTopupGate.bump();
  showToast(t("toast.blackholeDetected"));
  if(NET_ENABLED) ctx.netBodies[row.id] = bh;
  return bh;
}

// Shared teardown for a black hole's 4-piece mesh group (core/horizon/disk/
// halo) — used both by its natural expiry below and by net/bodiesSync.js
// (a remote DELETE, or bootstrapWorld's reconcile) and js/editor/main.js's
// preview, instead of each site re-deriving the same dispose sequence by
// hand. If a future change adds/renames a sub-mesh, there's now exactly one
// place that needs to know about it — previously all 4 call sites did.
export function disposeBlackHole(bh){
  ctx.scene.remove(bh.group);
  bh.core.geometry.dispose(); bh.core.material.dispose();
  bh.horizon.geometry.dispose(); bh.horizon.material.dispose();
  bh.disk.geometry.dispose(); bh.disk.material.dispose();
  bh.halo.material.dispose();
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
  }).catch(function(err){
    // No pending-counter to leak here (unlike requestSpawnPlanet), but a
    // rejected promise with no .catch() is still an unhandled rejection -
    // add explicit, quiet handling for the same reason bodies.js does.
    console.warn("requestSpawnBlackHole rejected", err);
  });
}

export function updateBlackHoles(dt){
  blackHoleTimer -= dt;
  if(blackHoleTimer <= 0 && ctx.blackholes.length === 0){
    if(NET_ENABLED){
      if(blackHoleTopupGate.shouldSpawn()) requestSpawnBlackHole();
    }
    else { spawnBlackHoleLocalOnly(); }
    blackHoleTimer = CONTENT.blackhole.respawnMinS + Math.random()*CONTENT.blackhole.respawnRangeS;
  }

  for(let i=ctx.blackholes.length-1; i>=0; i--){
    const bh = ctx.blackholes[i];
    bh.life += dt;
    // We rotate the whole mesh (not the texture via offset.x) - RingGeometry
    // has planar UV mapping (u,v from x,y position, not from angle), so
    // animating the offset slides the texture like a flat image: the bright
    // center slides in from one side and falls out the other, while the true
    // center (the hole in the geometry) always looks dark. Rotating around
    // its own axis preserves symmetry - the texture's bright spot (if visible
    // at all) circles around the center along with everything else.
    bh.disk.rotation.z += dt*(0.6 + bh.flowSpeed);
    bh.pulsePhase += dt*3;
    bh.horizon.material.opacity = 0.6 + 0.35*Math.abs(Math.sin(bh.pulsePhase));
    bh.halo.material.opacity = 0.75 + 0.2*Math.abs(Math.sin(bh.pulsePhase*0.8));
    const haloPulseScale = 1 + 0.04*Math.abs(Math.sin(bh.pulsePhase*0.8));
    bh.halo.scale.setScalar(bh.radius*3.1*haloPulseScale);

    const fadeStart = bh.maxLife - CONTENT.blackhole.fadeOutS;
    if(bh.life >= fadeStart){
      const e = Math.min(1, (bh.life-fadeStart)/CONTENT.blackhole.fadeOutS);
      bh.group.scale.setScalar(1-e);
      bh.horizon.material.opacity *= (1-e);
      bh.halo.material.opacity *= (1-e);
      bh.disk.material.opacity = 0.85*(1-e);
    }

    if(bh.life >= bh.maxLife){
      disposeBlackHole(bh);
      ctx.blackholes.splice(i,1);
      if(NET_ENABLED && bh.dbId){
        delete ctx.netBodies[bh.dbId];
        if(isSteward) supabase.from("bodies").delete().eq("id", bh.dbId).then(function(){});
      }
    }
  }

  if(ctx.blackholes.length === 0 && blackHoleTimer <= 0){
    // safety net: in case the hole expired at the exact same moment the timer reset
    blackHoleTimer = CONTENT.blackhole.respawnMinS + Math.random()*CONTENT.blackhole.respawnRangeS;
  }

  if(ctx.blackholes.length === 0 || ctx.ships.length === 0) return;

  const toConsume = [];
  for(let s=0;s<ctx.ships.length;s++){
    const sh = ctx.ships[s];
    for(let b=0;b<ctx.blackholes.length;b++){
      const hole = ctx.blackholes[b];
      // Reused scratch vector, not a fresh `new THREE.Vector3()` per
      // ships*blackholes iteration every frame - this loop runs every
      // frame whenever any black hole exists, so with a larger fleet and
      // multiple simultaneous holes the allocation count added up to real
      // GC pressure right when frame time matters most (many ships near a
      // hazard).
      toHoleScratch.subVectors(hole.group.position, sh.pos);
      const toHole = toHoleScratch;
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
    showToast(t("toast.shipConsumed"));
  });
  // Deliberately NOT calling reconcileFleetSize() here. That function's
  // only job is "top ctx.ships back up to the upgrade-derived target" (see
  // ships/swarm.js) - correct right after spawnInitialFleet()/a fleet
  // upgrade purchase, where the target itself just changed, but calling it
  // after a black-hole loss instantly respawned the eaten ship in the same
  // frame, silently undoing the toast/VFX above and leaving "a hazard to
  // avoid" with zero actual gameplay cost. Losing a ship now lasts for the
  // rest of the session (until the next reconcile - a reload or a new
  // fleet-level purchase, both of which re-derive the count from the
  // upgrade level, not from what was lost - see ui/dock.js/main.js).
  if(toConsume.length>0){ refreshDock(); save(); }

  // The drone isn't in ctx.ships (it never auto-moves, so it isn't part of
  // the swarm loop above) — handled separately here, with its `defense`
  // stat giving it a chance to survive a kill-radius encounter instead of
  // being destroyed outright like a normal ship.
  if(ctx.drone){
    const drone = ctx.drone;
    for(let b=0; b<ctx.blackholes.length; b++){
      const hole = ctx.blackholes[b];
      toHoleScratch.subVectors(hole.group.position, drone.pos);
      const toHole = toHoleScratch;
      const d = toHole.length();
      if(d < hole.killRadius){
        const survivalChance = Math.min(0.9, drone.defense * 0.18);
        if(Math.random() < survivalChance){
          const pushDir = drone.pos.clone().sub(hole.group.position);
          if(pushDir.lengthSq() < 0.0001) pushDir.set(1,0,0);
          pushDir.normalize();
          drone.pos.copy(hole.group.position).addScaledVector(pushDir, hole.killRadius*1.4);
          drone.fuel = Math.max(0, drone.fuel - 15);
          showToast(t("toast.droneSurvived"));
        } else {
          spawnExplosionParticles(drone.pos, new THREE.Color(0xb98cff), 26);
          spawnShockwave({ mesh:{ position: drone.pos, material:{ color:new THREE.Color(0x6a3fb0) } }, radius: 0.7 });
          stopDroneScript(drone);
          disposeMesh(ctx.scene, drone.mesh);
          ctx.drone = null;
          showToast(t("toast.shipConsumed"));
        }
        break;
      }
      if(d < hole.gravityRadius && d > 0.001){
        const pull = Math.min(0.9, (hole.gravityRadius-d)/hole.gravityRadius) * 6.5 / Math.max(0.3, drone.defense);
        drone.pos.addScaledVector(toHole.normalize(), pull*dt);
      }
    }
  }
}
