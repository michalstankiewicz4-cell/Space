import { ctx } from "../core/context.js";
import { supabase } from "../supabaseClient.js";
import { materializePlanet } from "../world/bodies.js";
import { materializeBlackHole } from "../world/blackholes.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { SOLAR_BODY_BY_SLOT, bodyPosAt, nowSimTime } from "../world/solarSystem.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud/eventLog.js";
import { t } from "../i18n.js";

// The fixed 9 solar bodies + sun — a permanent set, seeded once by the
// Supabase migration (see supabase/schema.sql), never inserted/deleted
// again after that. Only `health` ever changes, via bite_solar_body.
// Deliberately separate from net/bodiesSync.js (comet-only): that file's
// whole shape (INSERT-to-spawn, DELETE-to-despawn, a top-up pool) doesn't
// apply here at all — this table is only ever read once at boot and then
// watched for UPDATEs.

function materializeSolarRow(row){
  const slotDef = SOLAR_BODY_BY_SLOT[row.orbit_slot];
  if(slotDef.kind === "blackhole"){
    const bh = materializeBlackHole(slotDef.radius, slotDef.slot);
    ctx.netSolarBodies[row.orbit_slot] = bh;
    return;
  }
  const pos = bodyPosAt(row.orbit_slot, nowSimTime());
  materializePlanet(row, pos, null, 0);
}

// Called on both first connect and every reconnect — on a reconnect, some
// bodies are already materialized (from before the drop), so this refreshes
// their health checkpoint from the fresh row instead of skipping them
// outright, the same way onSolarBodyUpdated() would for a live UPDATE this
// client might have missed while disconnected (Realtime never replays
// missed events after the fact).
export function bootstrapSolarSystem(){
  supabase.from("solar_bodies").select("*").then(function(res){
    const rows = res.data || [];
    rows.forEach(function(row){
      if(ctx.netSolarBodies[row.orbit_slot]) onSolarBodyUpdated(row);
      else materializeSolarRow(row);
    });
  });
}

// Replaces the health checkpoint outright — never a Math.min merge like
// net/bodiesSync.js's onBodyUpdated() uses for comets. Health legitimately
// *rises* over time under regen (see world/bodies.js's health-checkpoint
// comment), so "only ever accept a lower number" would permanently hide
// that regen ever happened.
export function onSolarBodyUpdated(row){
  const obj = ctx.netSolarBodies[row.orbit_slot];
  if(!obj || obj.healthBase == null) return; // the black hole has no health tracking at all
  obj.healthBase = row.health;
  obj.healthUpdatedAtMs = new Date(row.updated_at).getTime();
  obj.maxHealth = row.max_health;
}

// Same exponential-backoff shape as net/bodiesSync.js#flushDamage, for the
// same reason (a rejected RPC call must not just retry every interval tick
// forever).
let damageFailStreak = 0;
let damageBackoffUntil = 0;

export function flushSolarDamage(){
  if(Date.now() < damageBackoffUntil) return;
  ctx.planets.forEach(function(p){
    if(p.orbitSlot == null || !(p.pendingDamage > 0)) return;
    const amount = p.pendingDamage;
    p.pendingDamage = 0;
    supabase.rpc("bite_solar_body", { p_orbit_slot: p.orbitSlot, p_amount: amount }).then(function(res){
      damageFailStreak = 0;
      const row = res.data && res.data[0];
      if(!row) return;
      if(row.killed){
        const gained = bodyValueEstimate(p);
        state.points += gained;
        state.eaten += 1;
        showToast(t("toast.eaten")(gained), "arrive");
        save();
      }
      p.healthBase = row.health;
      p.healthUpdatedAtMs = Date.now();
    }).catch(function(){
      p.pendingDamage += amount;
      damageFailStreak++;
      damageBackoffUntil = Date.now() + Math.min(10000, 500 * Math.pow(2, damageFailStreak));
    });
  });
}
