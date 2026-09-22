import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { MAX_PLANETS, NET_PLANET_TOPUP_S } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import {
  materializePlanet, requestSpawnPlanet, spawnPlanetLocalOnly,
  despawnLocalOnly, applyHealthVisual, destroyPlanet, pendingSpawnCount
} from "../world/bodies.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { materializeBlackHole, disposeBlackHole } from "../world/blackholes.js";
import { refreshDock } from "../ui/dock.js";
import { triggerBreakup } from "../fx/breakup.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud.js";
import { createStalenessGate } from "./stewardFallback.js";
import { t } from "../i18n.js";

// Builds a local object (planet/comet/... or black hole) from a `bodies` row.
export function materializeBody(row){
  if(ctx.netBodies[row.id]) return;
  planetTopupGate.bump();
  const pos = new THREE.Vector3(row.pos_x, row.pos_y, row.pos_z);
  if(row.kind === "blackhole"){
    materializeBlackHole(row, pos);
    return;
  }
  const vel = (row.vel_x!=null) ? new THREE.Vector3(row.vel_x, row.vel_y, row.vel_z) : null;
  const elapsedSec = Math.max(0, (Date.now() - new Date(row.spawned_at).getTime())/1000);
  materializePlanet(row, pos, vel, elapsedSec);
}

export function onBodyUpdated(row){
  const obj = ctx.netBodies[row.id];
  if(!obj || row.kind === "blackhole") return;
  if(row.health != null){
    obj.health = Math.min(obj.health, row.health);
    applyHealthVisual(obj);
  }
}

// NOTE: Supabase Realtime for DELETE can send only the primary key (id) in
// `oldRow` — without REPLICA IDENTITY FULL the other columns (health, kind...)
// are simply absent, not `null`. So we deliberately do NOT rely on `oldRow`
// beyond `id` — whether this was a "black hole" and whether its health was
// <= 0 is checked against the already-known local object (`obj`), which is
// always complete and up to date.
export function onBodyDeleted(oldRow){
  const obj = ctx.netBodies[oldRow.id];
  if(!obj) return;
  delete ctx.netBodies[oldRow.id];

  if(ctx.blackholes.indexOf(obj) !== -1){
    disposeBlackHole(obj);
    ctx.blackholes.splice(ctx.blackholes.indexOf(obj), 1);
    return;
  }

  if(ctx.planets.indexOf(obj) === -1) return;
  // A planet/sun/meteoroid can NEVER leave the DB for any reason other
  // than being eaten (only comets ever self-despawn for "flew out of the
  // field" — see the p.moving check in world/bodies.js#updateBodies), so
  // for anything else a DELETE always means "eaten", full stop — no need
  // to guess from locally-tracked `health`, which depends on having
  // already received a separate, earlier UPDATE event in the right order.
  // That fragile guess is only actually needed for comets, which really
  // do have two legitimate reasons to disappear.
  const wasEaten = obj.kind !== "comet" || (obj.maxHealth != null && obj.health <= 0);
  if(wasEaten && !obj.dying){
    // eaten by someone - shared explosion for everyone; points are awarded
    // only to the client that got killed:true from bite_body (see flushDamage)
    triggerBreakup(obj);
    destroyPlanet(obj);
    refreshDock();
  } else {
    // just flew out of the field (comet) - no points
    despawnLocalOnly(obj);
  }
}

// If bite_body itself is unreachable (server error, timeout, dead socket —
// reported live as a Cloudflare 522, but any rejection behaves the same),
// re-queuing the failed damage unconditionally used to mean the very next
// setInterval(flushDamage, 150) tick fired an identical RPC call again —
// with nothing to ever break the cycle, a prolonged outage kept the client
// hammering the server every 150ms indefinitely. Same exponential-backoff
// shape as net/connect.js's Realtime reconnect (capped lower, since a
// missed bite is far cheaper to retry than a whole dropped connection):
// a run of consecutive failures grows the delay before flushDamage()
// attempts anything again, and a single success resets it back to full
// speed immediately.
let damageFailStreak = 0;
let damageBackoffUntil = 0;

export function flushDamage(){
  if(Date.now() < damageBackoffUntil) return;
  ctx.planets.forEach(function(p){
    if(p.pendingDamage > 0 && p.dbId){
      const amount = p.pendingDamage;
      p.pendingDamage = 0;
      supabase.rpc("bite_body", { p_body_id: p.dbId, p_amount: amount }).then(function(res){
        damageFailStreak = 0;
        const row = res.data && res.data[0];
        if(!row) return;
        if(row.killed){
          const gained = bodyValueEstimate(p);
          state.points += gained;
          state.eaten += 1;
          showToast(t("toast.eaten")(gained));
          save();
        } else {
          p.health = Math.min(p.health, row.health);
          applyHealthVisual(p);
        }
      }).catch(function(){
        p.pendingDamage += amount;
        damageFailStreak++;
        damageBackoffUntil = Date.now() + Math.min(10000, 500 * Math.pow(2, damageFailStreak));
      });
    }
  });
}

// See net/stewardFallback.js for why this needs both an isConnected() guard
// and a staleness fallback, not just steward-gating. bump() is called in
// materializeBody() on every INSERT this client sees (from any source), so
// shouldSpawn() knows how long it's actually been since anything last
// spawned.
const planetTopupGate = createStalenessGate(8000, 4000);

let topUpTimer = 0;
export function maintainPlanetCount(dt){
  topUpTimer -= dt;
  if(topUpTimer > 0) return;
  topUpTimer = NET_PLANET_TOPUP_S;
  if(ctx.planets.length + pendingSpawnCount >= MAX_PLANETS) return;
  if(NET_ENABLED){
    if(planetTopupGate.shouldSpawn()) requestSpawnPlanet();
  } else {
    spawnPlanetLocalOnly();
  }
}

export function bootstrapWorld(){
  supabase.from("bodies").select("*").then(function(res){
    const rows = res.data || [];
    const freshIds = {};
    rows.forEach(function(row){ freshIds[row.id] = true; });
    rows.forEach(materializeBody);

    // Reconcile: drop anything tracked locally that no longer exists
    // server-side. On a first connect this is a no-op (nothing tracked
    // yet); on a reconnect after a dropped Realtime channel, it catches up
    // on deletes that happened while disconnected — Realtime never replays
    // missed events, so this select-and-diff is the only way to find out.
    // No explosion/points here: we don't know if it was eaten or (for a
    // comet) flew away while we were gone, and guessing wrong to show a
    // fake effect would be worse than just quietly removing it.
    Object.keys(ctx.netBodies).forEach(function(id){
      if(freshIds[id]) return;
      const obj = ctx.netBodies[id];
      delete ctx.netBodies[id];
      if(ctx.blackholes.indexOf(obj) !== -1){
        disposeBlackHole(obj);
        removeItem(ctx.blackholes, obj);
      } else if(ctx.planets.indexOf(obj) !== -1){
        despawnLocalOnly(obj);
      }
    });

    if(rows.length === 0){
      supabase.rpc("claim_world_init").then(function(res2){
        if(res2.data === true){
          for(let i=0;i<MAX_PLANETS;i++) requestSpawnPlanet();
        }
      });
    }
  });
}
