import { clientId } from "./identity.js";

// The "steward" is the client responsible for topping up bodies and black
// holes in the world (see net/bodiesSync.js, world/blackholes.js) —
// deterministically elected as the presence with the smallest
// (joined_at, client_id) pair, so when the current steward disconnects, the
// next client picks up the role on its own, with no extra coordination.
export let isSteward = false;
let presenceState = {};
let inRoom = new Set();   // every client_id present in the room

export function setPresenceState(next){
  presenceState = next;
  inRoom = new Set();
  Object.keys(next).forEach(function(key){
    (next[key] || []).forEach(function(meta){ if(meta && typeof meta.client_id === "string") inRoom.add(meta.client_id); });
  });
  recomputeSteward();
}

// Is this client id in the room's presence right now? Broadcasts from ids
// that aren't are dropped (net/shipsBroadcast.js): one connection is one
// presence, so a spoofing client can't invent dozens of players.
export function isInRoom(id){ return inRoom.has(id); }

// How many OTHER clients are in the room right now (presence).
export function othersOnline(){
  let n = 0;
  Object.keys(presenceState).forEach(function(key){
    (presenceState[key] || []).forEach(function(meta){ if(meta.client_id !== clientId) n++; });
  });
  return n;
}

function recomputeSteward(){
  let best = null;
  Object.keys(presenceState).forEach(function(key){
    (presenceState[key]||[]).forEach(function(meta){
      if(!best || meta.joined_at < best.joined_at ||
         (meta.joined_at === best.joined_at && meta.client_id < best.client_id)){
        best = meta;
      }
    });
  });
  isSteward = !!best && best.client_id === clientId;
}
