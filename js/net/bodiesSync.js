import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { MAX_COMETS, NET_PLANET_TOPUP_S } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import {
  materializePlanet, requestSpawnComet, spawnCometLocalOnly,
  despawnLocalOnly, applyHealthVisual, destroyPlanet, pendingSpawnCount
} from "../world/bodies.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { refreshDock } from "../ui/dock.js";
import { triggerBreakup } from "../fx/breakup.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud.js";
import { createStalenessGate } from "./stewardFallback.js";
import { t } from "../i18n.js";

// Comet-only now — the fixed 9 solar bodies (+ sun) have their own sync
// module, net/solarBodiesSync.js, since they're a permanent set (only ever
// UPDATEd, never INSERTed/DELETEd after the one-time migration seed) with a
// completely different lifecycle than this file's insert/update/delete
// spawn-and-despawn pool. `bodies` itself narrowed to comet-only rows too
// (see supabase/schema.sql) — everything here assumes that.

// Builds a local comet object from a `bodies` row.
export function materializeBody(row){
  if(ctx.netBodies[row.id]) return;
  cometTopupGate.bump();
  const pos = new THREE.Vector3(row.pos_x, row.pos_y, row.pos_z);
  const vel = (row.vel_x!=null) ? new THREE.Vector3(row.vel_x, row.vel_y, row.vel_z) : null;
  const elapsedSec = Math.max(0, (Date.now() - new Date(row.spawned_at).getTime())/1000);
  materializePlanet(row, pos, vel, elapsedSec);
}

export function onBodyUpdated(row){
  const obj = ctx.netBodies[row.id];
  if(!obj) return;
  if(row.health != null){
    obj.health = Math.min(obj.health, row.health);
    applyHealthVisual(obj);
  }
}

// NOTE: Supabase Realtime for DELETE can send only the primary key (id) in
// `oldRow` — without REPLICA IDENTITY FULL the other columns (health, kind...)
// are simply absent, not `null`. So we deliberately do NOT rely on `oldRow`
// beyond `id` — whether its health was <= 0 is checked against the
// already-known local object (`obj`), which is always complete and up to
// date.
export function onBodyDeleted(oldRow){
  const obj = ctx.netBodies[oldRow.id];
  if(!obj) return;
  delete ctx.netBodies[oldRow.id];
  if(ctx.planets.indexOf(obj) === -1) return;

  // A comet has two legitimate reasons to leave the DB - eaten, or flew out
  // of the field on its own (see the p.moving check in
  // world/bodies.js#updateBodies) - so unlike a fixed solar body, this
  // still needs the health-based guess.
  const wasEaten = obj.maxHealth != null && obj.health <= 0;
  if(wasEaten && !obj.dying){
    // eaten by someone - shared explosion for everyone; points are awarded
    // only to the client that got killed:true from bite_body (see flushDamage)
    triggerBreakup(obj);
    destroyPlanet(obj);
    refreshDock();
  } else {
    // just flew out of the field - no points
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
const cometTopupGate = createStalenessGate(8000, 4000);

let topUpTimer = 0;
export function maintainCometCount(dt){
  topUpTimer -= dt;
  if(topUpTimer > 0) return;
  topUpTimer = NET_PLANET_TOPUP_S;
  // ctx.planets also holds the 9 fixed solar bodies (orbitSlot != null) —
  // count only comets here, or this would never top up at all once those
  // are loaded (9 alone already exceeds MAX_COMETS).
  let cometCount = 0;
  for(let i=0;i<ctx.planets.length;i++){ if(ctx.planets[i].orbitSlot == null) cometCount++; }
  if(cometCount + pendingSpawnCount >= MAX_COMETS) return;
  if(NET_ENABLED){
    if(cometTopupGate.shouldSpawn()) requestSpawnComet();
  } else {
    spawnCometLocalOnly();
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
    // No explosion/points here: we don't know if it was eaten or flew away
    // while we were gone, and guessing wrong to show a fake effect would be
    // worse than just quietly removing it.
    Object.keys(ctx.netBodies).forEach(function(id){
      if(freshIds[id]) return;
      const obj = ctx.netBodies[id];
      delete ctx.netBodies[id];
      if(ctx.planets.indexOf(obj) !== -1) despawnLocalOnly(obj);
    });
  });
}
