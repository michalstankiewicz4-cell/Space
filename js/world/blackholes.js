import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { FIELD_RADIUS } from "../config.js";
import { CONTENT } from "../content.js";
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
import { isConnected } from "../net/connect.js";
import { stopDroneScript } from "../drone/drone.js";
import { t } from "../i18n.js";

let blackHoleTimer = CONTENT.blackhole.firstSpawnMinS + Math.random()*CONTENT.blackhole.firstSpawnRangeS;

// Same class of bug bodiesSync.js#maintainPlanetCount() already had fixed
// once (see CLAUDE.md's "Realtime channel health has no free lunch"): a
// steward whose Realtime socket has silently died (while plain REST still
// works fine) sees its own ctx.blackholes as perpetually empty even when a
// black hole genuinely exists, and — unlike maintainPlanetCount() — nothing
// here was checking isConnected() before spawning, so a desynced steward
// could keep inserting duplicate black holes nobody asked for. Worse: with
// no fallback at all, a steward whose tab is merely backgrounded (not
// disconnected — Presence re-election never fires for that, only for an
// actual socket drop) has requestAnimationFrame throttled to a crawl by the
// browser, so its own blackHoleTimer barely advances in real time — black
// holes could stop appearing for the whole session with nothing to correct
// it. `lastBlackHoleActivityAt` (bumped in materializeBlackHole() below,
// which every client's own spawn *and* every remote one they observe both
// go through) tracks the last confirmed non-stuck moment; BLACKHOLE_STALE_MS
// sits comfortably above the longest legitimate gap between two black holes
// (respawnMinS..respawnMinS+respawnRangeS, 34-58s) so it never fires during
// normal play, jittered per client so idle clients don't all fire the
// fallback in the same instant.
let lastBlackHoleActivityAt = Date.now();
const BLACKHOLE_STALE_MS = 90000 + Math.random()*30000;

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
  lastBlackHoleActivityAt = Date.now();
  showToast(t("toast.blackholeDetected"));
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
    if(NET_ENABLED){
      // isConnected() guard: same reasoning as maintainPlanetCount() — a
      // steward with a dead Realtime socket must not insert blindly via
      // plain REST, since it can no longer see whether one already exists.
      // The staleness half of the condition is the actual fix for "black
      // holes stopped appearing": any other connected client can step in
      // once it's been far longer than the normal cadence since one last
      // appeared, instead of waiting forever for a steward stuck on a
      // backgrounded tab.
      const stale = Date.now() - lastBlackHoleActivityAt > BLACKHOLE_STALE_MS;
      if(isConnected() && (isSteward || stale)) requestSpawnBlackHole();
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
    // safety net: in case the hole expired at the exact same moment the timer reset
    blackHoleTimer = CONTENT.blackhole.respawnMinS + Math.random()*CONTENT.blackhole.respawnRangeS;
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
    showToast(t("toast.shipConsumed"));
  });
  if(toConsume.length>0){ reconcileFleetSize(); refreshDock(); save(); }

  // The drone isn't in ctx.ships (it never auto-moves, so it isn't part of
  // the swarm loop above) — handled separately here, with its `defense`
  // stat giving it a chance to survive a kill-radius encounter instead of
  // being destroyed outright like a normal ship.
  if(ctx.drone){
    const drone = ctx.drone;
    for(let b=0; b<ctx.blackholes.length; b++){
      const hole = ctx.blackholes[b];
      const toHole = new THREE.Vector3().subVectors(hole.group.position, drone.pos);
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
          ctx.scene.remove(drone.mesh);
          drone.mesh.traverse(function(obj){
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
          });
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
