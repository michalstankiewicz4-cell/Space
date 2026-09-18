import { clientId } from "./identity.js";

// "Steward" to klient odpowiedzialny za dosypywanie ciał i czarnych dziur w
// świecie (patrz net/bodiesSync.js, world/blackholes.js) — wybierany
// deterministycznie jako obecność z najmniejszą parą (joined_at, client_id),
// więc przy rozłączeniu obecnego stewarda kolejny klient przejmuje rolę sam,
// bez dodatkowej koordynacji.
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
