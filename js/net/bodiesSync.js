import { ctx } from "../core/context.js";
import { COMET_RESPAWN_DELAY_MS, NET_PLANET_TOPUP_S } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { materializePlanet, requestSpawnComet, spawnCometLocalOnly, despawnLocalOnly, applyHealthVisual, destroyPlanet, pendingSpawnCount } from "../world/bodies.js";
import { refreshResearch } from "../ui/windows/research.js";
import { triggerBreakup } from "../fx/breakup.js";
import { createStalenessGate } from "./stewardFallback.js";
import { createBiteFlusher } from "./biteBudget.js";

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
    refreshResearch();
  } else {
    // just flew out of the field - no points
    despawnLocalOnly(obj);
  }
}

// Comet damage to the server (bite_body); the shared flusher is in
// net/biteBudget.js. A comet that survives the bite takes the server's
// health if it's lower (another player bit it too); a kill's cleanup comes
// with the server's DELETE.
export const flushDamage = createBiteFlusher("bite_body",
  function(p){ return p.dbId ? { p_body_id: p.dbId } : null; },
  function(p, row){
    if(row.killed) return;
    p.health = Math.min(p.health, row.health);
    applyHealthVisual(p);
  });

// Who may spawn the next comet (net/stewardFallback.js): the steward, or
// anyone once no comet has appeared for 8-10 minutes (a steward gone quiet
// for several whole flyby cycles). materializeBody() bumps it on every
// comet seen.
const cometTopupGate = createStalenessGate(480000, 120000);

// At most one comet exists at a time — not a population pool topped up
// toward a max, but a single flyby followed by a fixed cooldown before the
// next one starts (the user's explicit spec: "po despawnie odstęp 1
// minuty" - a 1-minute gap after despawn, not a fixed spawn rate). Edge-
// triggered: noCometSinceMs is set the instant the system is first noticed
// empty, and only a spawn attempt (gated the normal steward/staleness way)
// fires once COMET_RESPAWN_DELAY_MS has actually elapsed since then.
let noCometSinceMs = null;
let checkTimer = 0;
export function maintainComet(dt){
  checkTimer -= dt;
  if(checkTimer > 0) return;
  checkTimer = NET_PLANET_TOPUP_S;
  // ctx.planets also holds the 9 fixed solar bodies (orbitSlot != null) —
  // only a comet has orbitSlot == null.
  const hasComet = ctx.planets.some(function(p){ return p.orbitSlot == null; });
  if(hasComet || pendingSpawnCount > 0){
    noCometSinceMs = null;
    return;
  }
  if(noCometSinceMs == null){ noCometSinceMs = Date.now(); return; }
  if(Date.now() - noCometSinceMs < COMET_RESPAWN_DELAY_MS) return;
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

    // Drop what the server no longer has (deletes missed while
    // disconnected — Realtime never replays them). Quietly: eaten or flown
    // off, we can't tell, so no effect and no points.
    Object.keys(ctx.netBodies).forEach(function(id){
      if(freshIds[id]) return;
      const obj = ctx.netBodies[id];
      delete ctx.netBodies[id];
      if(ctx.planets.indexOf(obj) !== -1) despawnLocalOnly(obj);
    });
  });
}
