import { isSteward } from "./presence.js";
import { isConnected } from "./connect.js";

// Shared by every "top up this depleting shared resource" loop that's
// normally gated on being the elected steward (see net/presence.js).
// Originally grown independently by both the old scattered-planet pool and
// black holes before the fixed 9-orbit solar system replaced both of those
// spawn/despawn mechanics — the one remaining caller is
// net/bodiesSync.js#maintainComet (comets are the only body kind still
// spawned/despawned from a pool at all). Kept as its own small module
// rather than folded back into bodiesSync.js, since the pattern itself may
// be needed again for some future steward-gated top-up loop. Presence
// re-election only fires on an actual socket disconnect, so:
// - isConnected(): a steward whose Realtime channel silently died must
//   never keep inserting via plain REST (which keeps working even with a
//   dead socket) — see CLAUDE.md's "Realtime channel health has no free
//   lunch". Without this guard a desynced steward would flood the shared
//   world for everyone else while never noticing it's disconnected.
// - the staleness fallback: a steward whose tab is merely backgrounded (not
//   disconnected) never gets re-elected, so requestAnimationFrame-throttled
//   code can stop topping up for the whole session with nothing to correct
//   it. Once it's been suspiciously longer than the normal top-up cadence
//   since anyone last saw real activity, any other connected client can
//   step in instead of waiting forever for a steward that may never come
//   back.
export function createStalenessGate(baseMs, jitterMs){
  let lastActivityAt = Date.now();
  // Jittered per client (fixed once at creation, not re-rolled) so idle
  // clients don't all fire the fallback in the same instant.
  const staleMs = baseMs + Math.random()*jitterMs;
  return {
    // Call whenever fresh activity is observed, from any source — this
    // client's own spawn or another client's, seen via Realtime.
    bump(){ lastActivityAt = Date.now(); },
    shouldSpawn(){
      return isConnected() && (isSteward || (Date.now() - lastActivityAt > staleMs));
    }
  };
}
