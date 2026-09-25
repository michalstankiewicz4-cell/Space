import { discover, isDiscovered } from "./discovery.js";
import { state } from "./gameState.js";

// The Wiki's Story tab: fragments of the world's story ("story:<key>"),
// recovered one by one as the player plays. Two ways in:
//  - storyEvent(name) from the few places where something happens once
//    (entering orbit, opening the station),
//  - a once-a-second check of the player's progress (state.eaten, bought
//    upgrades, other Wiki discoveries), so fragments earned before this
//    existed — or while the Wiki window was closed — still turn up.
// Fragments tied to features that don't exist yet stay locked (their
// Wiki `unlock` is "story", see ui/windows/wikiEntries.js).
const EVENTS = {
  enter: "story:logReboot",
  station: "story:logGreenhouse"
};

export function storyEvent(name){
  if(EVENTS[name]) discover(EVENTS[name]);
}

function anyUpgrade(){
  return Object.keys(state.levels || {}).some(function(k){ return state.levels[k] > 0; });
}

function check(){
  if(state.eaten >= 1) discover("story:logHunger");
  if(isDiscovered("tech:droneScript")) discover("story:logToy");
  if(anyUpgrade()) discover("story:logProtocol");
  if(state.eaten >= 5){
    discover("story:logGardener");
    discover("life:gardener"); // the fragment introduces him
  }
  if(state.eaten >= 10 && isDiscovered("body:blackhole")) discover("story:logRings");
  if(state.eaten >= 20) discover("story:logDispute");
}

export function initStoryLog(){
  check();
  setInterval(check, 1000);
}
