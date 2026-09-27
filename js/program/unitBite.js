import { NET_ENABLED } from "../env.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud/eventLog.js";
import { refreshResearch } from "../ui/windows/research.js";
import { triggerBreakup } from "../fx/breakup.js";
import { spawnBiteParticles } from "../fx/particles.js";
import { applyHealthVisual, destroyPlanet, paintScorch } from "../world/bodies.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { t } from "../i18n.js";
import { nearestLiveBody, isNearBody } from "./unitMotion.js";

// attack() for any programmable unit (the drone, a programmed swarm ship):
// one bite on the nearest body in range — `dmg` is a number or a
// function(body) returning one (a ship's bite depends on the body's heat).
// `onFire(surfacePoint, outward, body)` plays the unit's own shot effect.
// Returns 1 on a hit, 0 when nothing is in range.
export function biteNearestBody(unit, dmg, onFire){
  const { body, dist } = nearestLiveBody(unit.pos);
  if(!isNearBody(body, dist)) return 0;
  if(typeof dmg === "function") dmg = dmg(body);

  const healthBeforeDamage = body.health;
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
    // Fixed solar body: never destroyed/removed, health regenerates
    // instead - same edge-triggered kill detection (against a 10%-of-
    // maxHealth threshold, not a bare >0 check - see
    // ships/swarm.js#updateShips and supabase/schema.sql#bite_solar_body
    // for why a bare >0 check was a real, live-confirmed exploit) as
    // ships/swarm.js#updateShips, so a unit camping a barely-regenerating
    // body can't re-collect the kill reward every hit.
    if(healthBeforeDamage > body.maxHealth * 0.1 && body.health <= 0){
      if(!NET_ENABLED) awardKill(body, false);
      // else: net/solarBodiesSync.js#flushSolarDamage awards points once
      // the server's bite_solar_body RPC confirms killed:true.
      body.healthBase = 0;
      body.healthUpdatedAtMs = Date.now();
    }
  } else if(!NET_ENABLED && !body.dying && body.health <= 0){
    awardKill(body, true);
  }
  return 1;
}

// Offline only: no server to arbitrate the kill, so it resolves here.
function awardKill(body, remove){
  const gained = bodyValueEstimate(body);
  state.points += gained;
  state.eaten += 1;
  showToast(t("toast.eaten")(gained), "arrive");
  triggerBreakup(body);
  if(remove) destroyPlanet(body);
  refreshResearch();
  save();
}
