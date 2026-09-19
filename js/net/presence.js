import { clientId } from "./identity.js";

// The "steward" is the client responsible for topping up bodies and black
// holes in the world (see net/bodiesSync.js, world/blackholes.js) —
// deterministically elected as the presence with the smallest
// (joined_at, client_id) pair, so when the current steward disconnects, the
// next client picks up the role on its own, with no extra coordination.
export let isSteward = false;
let presenceState = {};

export function setPresenceState(next){
  presenceState = next;
  recomputeSteward();
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
