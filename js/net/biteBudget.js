import { ctx } from "../core/context.js";
import { supabase } from "../supabaseClient.js";
import { awardKill } from "../world/rewards.js";

// One shared budget for bite RPCs (bite_body for comets, bite_solar_body for
// the fixed bodies): the server allows 20 per second per player, combined
// (supabase/schema.sql), and drops the rest. Damage is flushed per body
// every NET_DAMAGE_FLUSH_MS, so a fleet split over several bodies used to
// go past that — found in the v2.26 audit with 15 ships on 5 bodies: 26
// calls/s, 30 % of them dropped (their damage lost), each one written to
// the security log as abuse. Now a flush only sends what fits in
// BITES_PER_S; a body that doesn't get a turn keeps its pendingDamage for
// the next flush (nothing is lost), and the starting body rotates so none
// of them waits forever.
const BITES_PER_S = 15;          // headroom under the server's 20
const sent = [];
let rotation = 0;

export function takeBiteToken(){
  const now = performance.now();
  while(sent.length && now - sent[0] >= 1000) sent.shift();
  if(sent.length >= BITES_PER_S) return false;
  sent.push(now);
  return true;
}

// The list, starting at a different element on every call.
export function rotated(list){
  if(list.length < 2) return list;
  const k = rotation++ % list.length;
  return list.slice(k).concat(list.slice(0, k));
}

// One damage flusher per RPC (bite_body for comets — net/bodiesSync.js,
// bite_solar_body for the fixed bodies — net/solarBodiesSync.js), run every
// NET_DAMAGE_FLUSH_MS. `argsFor(body)` returns the RPC's arguments, or null
// for a body this flusher doesn't handle; `onRow(body, row)` applies the
// server's answer after a kill has been awarded (row.killed). A rejected call
// (server error, timeout, dead socket — seen live as a Cloudflare 522) puts
// the damage back and backs off exponentially (0.5 s .. 10 s), or a long
// outage would hammer the server every 150 ms; one success resets it.
export function createBiteFlusher(rpc, argsFor, onRow){
  let failStreak = 0, backoffUntil = 0;
  return function flush(){
    if(Date.now() < backoffUntil) return;
    rotated(ctx.planets).forEach(function(p){
      if(!(p.pendingDamage > 0)) return;
      const args = argsFor(p);
      if(!args) return;
      if(!takeBiteToken()) return;   // over the shared budget: the damage waits for the next flush
      const amount = p.pendingDamage;
      p.pendingDamage = 0;
      args.p_amount = amount;
      supabase.rpc(rpc, args).then(function(res){
        failStreak = 0;
        const row = res.data && res.data[0];
        if(!row) return;
        if(row.killed) awardKill(p);
        onRow(p, row);
      }).catch(function(){
        p.pendingDamage += amount;
        failStreak++;
        backoffUntil = Date.now() + Math.min(10000, 500 * Math.pow(2, failStreak));
      });
    });
  };
}
