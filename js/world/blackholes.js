import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { makeBodyLook, bodyLookRef } from "./bodyVisual.js";
import { showToast } from "../ui/hud/eventLog.js";
import { spawnExplosionParticles } from "../fx/particles.js";
import { spawnShockwave } from "../fx/breakup.js";
import { destroyShip } from "../ships/swarm.js";
import { refreshResearch } from "../ui/windows/research.js";
import { save } from "../core/gameState.js";
import { stopDroneScript, destroyDroneMesh } from "../drone/drone.js";
import { SOLAR_BODY_BY_SLOT, bodyPosAt, nowSimTime } from "./solarSystem.js";
import { t } from "../i18n.js";

// The black hole is now a single permanent fixture on orbit 9 (see
// world/solarSystem.js) — no more spawn timer, expiry, fade-out or
// respawn. It's materialized once at boot from the fixed SOLAR_BODIES
// entry (not a spawned/despawned `bodies` row) and its position is
// recomputed every frame from bodyPosAt(9, t), same as every other fixed
// orbiting body — it just also happens to pull/consume ships, which none
// of the others do.

// Reused every frame by updateBlackHoles()'s gravity loops (ships, then
// drone) instead of a fresh `new THREE.Vector3()` per ship/drone x
// black-hole pair — see the comment at its first use site below.
const toHoleScratch = new THREE.Vector3();

// `radius` comes from the caller: the game passes SOLAR_BODY_BY_SLOT[9].radius
// (one fixed value). `orbitSlot` is optional — the game passes 9 so
// updateBlackHoles() keeps repositioning it every frame from bodyPosAt();
// without it the group just stays put at the origin (where it starts).
export function materializeBlackHole(radius, orbitSlot){
  const group = new THREE.Group();

  // The look is BodyKit's black hole from the body lab (world/bodyVisual.js:
  // horizon, accretion disk with Doppler beaming, photon ring and lensing
  // glow). An invisible sphere around it is what picking hits — larger
  // than the horizon, so the disk is clickable too.
  const look = makeBodyLook(bodyLookRef(orbitSlot != null ? orbitSlot : 9, "blackhole"), radius);
  group.add(look.root);
  const pickMesh = new THREE.Mesh(new THREE.SphereGeometry(radius*2.5, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  group.add(pickMesh);

  ctx.scene.add(group);

  const bh = {
    orbitSlot: orbitSlot,
    group: group, look: look, pickMesh: pickMesh,
    selected: false,   // selectable like a planet (scene/controls.js#clickBlackHole, scene/selectionBrackets.js)
    radius: radius,
    gravityRadius: radius*7.5,
    killRadius: radius*1.35
  };
  ctx.blackholes.push(bh);
  showToast(t("toast.blackholeDetected"), "alert");
  return bh;
}

export function updateBlackHoles(dt){
  const t = nowSimTime();
  for(let i=0;i<ctx.blackholes.length;i++){
    const bh = ctx.blackholes[i];
    if(bh.orbitSlot != null) bodyPosAt(bh.orbitSlot, t, bh.group.position);
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
    destroyShip(sh);   // blows apart; the wreck is cleaned up later (ships/shipVisual.js)
    removeItem(ctx.ships, sh);
    showToast(t("toast.shipConsumed"), "alert");
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
  // upgrade level, not from what was lost - see ui/windows/research.js/main.js).
  if(toConsume.length>0){ refreshResearch(); save(); }

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
          showToast(t("toast.droneSurvived"), "alert");
        } else {
          spawnExplosionParticles(drone.pos, new THREE.Color(0xb98cff), 26);
          spawnShockwave({ mesh:{ position: drone.pos, material:{ color:new THREE.Color(0x6a3fb0) } }, radius: 0.7 });
          stopDroneScript(drone);
          destroyDroneMesh(drone);   // blows apart; the wreck is cleaned up later (drone.js)
          ctx.drone = null;
          showToast(t("toast.shipConsumed"), "alert");
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
