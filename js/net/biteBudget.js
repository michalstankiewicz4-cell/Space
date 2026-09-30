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
