import { NET_ENABLED } from "../env.js";
import { spawnBiteParticles } from "../fx/particles.js";
import { applyHealthVisual, paintScorch, isSpent } from "../world/bodies.js";
import { nearestLiveBody, isNearBody } from "./unitMotion.js";
import { awardKill } from "../world/rewards.js";

// attack() for any programmable unit (the drone, a programmed swarm ship):
// one bite on the nearest body in range — `dmg` is a number or a
// function(body) returning one (a ship's bite depends on the body's heat).
// `onFire(surfacePoint, outward, body)` plays the unit's own shot effect.
// Returns 1 on a hit, 0 when nothing is in range.
export function biteNearestBody(unit, dmg, onFire){
  const { body, dist } = nearestLiveBody(unit.pos);
  if(!isNearBody(body, dist)) return 0;
  if(typeof dmg === "function") dmg = dmg(body);

  const wasSpent = isSpent(body);   // eaten and not grown back: no second kill (world/bodies.js)
  body.health -= dmg;
  body.pendingDamage = (body.pendingDamage || 0) + dmg;
  applyHealthVisual(body);
  if(body.orbitSlot != null){
    // Keep the health checkpoint in lockstep with every optimistic
    // decrement, same reasoning as ships/swarm.js#updateShips - otherwise
    // the next frame's regen recompute (world/bodies.js#updateBodies)
    // would overwrite this hit with a checkpoint that never moved.
    body.healthBase = body.health;
    body.healthUpdatedAtMs = Date.now();
  }

  const outward = unit.pos.clone().sub(body.mesh.position).normalize();
  const surfacePoint = body.mesh.position.clone().addScaledVector(outward, body.radius);
  if(onFire) onFire(surfacePoint, outward, body);
  spawnBiteParticles(surfacePoint, outward, body.mesh.material.color, 4);
  paintScorch(body, surfacePoint, 1);

  if(body.orbitSlot != null){
    // Fixed solar body: never removed, it grows back — a kill only if it
    // wasn't still spent from the last one (world/bodies.js#isSpent).
    if(!wasSpent && body.health <= 0){
      if(!NET_ENABLED) awardKill(body, { breakup: true });   // offline: no server to arbitrate the kill
      // else: net/solarBodiesSync.js#flushSolarDamage awards points once
      // the server's bite_solar_body RPC confirms killed:true.
      body.healthBase = 0;
      body.healthUpdatedAtMs = Date.now();
    }
  } else if(!NET_ENABLED && !body.dying && body.health <= 0){
    awardKill(body, { breakup: true, remove: true });
  }
  return 1;
}

