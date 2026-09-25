import { discover, isDiscovered } from "./discovery.js";
import { state } from "./gameState.js";

// The Wiki's Story tab: fragments of the world's story ("story:<key>"),
// recovered as the player plays. The AI's memory comes back gradually, so
// fragments do too: each one has a condition (below), but even when
// several conditions are already met — a long-time player opening this
// for the first time — they're recovered one at a time, in story order,
// at most one per RECOVER_INTERVAL_MS of play. The timer starts at page
// load, so reloading can't hurry it. The one exception is the reboot log,
// recovered the moment the player enters orbit.
// Fragments tied to features that don't exist yet aren't listed here at
// all; they stay locked (Wiki `unlock` "story", ui/windows/wikiEntries.js).
const RECOVER_INTERVAL_MS = 3 * 60 * 1000;

function anyUpgrade(){
  return Object.keys(state.levels || {}).some(function(k){ return state.levels[k] > 0; });
}

// In story (LOG) order. `also` is discovered together with the fragment.
let stationOpened = false;
const QUEUE = [
  { id: "story:logHunger", ready: function(){ return state.eaten >= 1; } },
  { id: "story:logToy", ready: function(){ return isDiscovered("tech:droneScript"); } },
  { id: "story:logGreenhouse", ready: function(){ return stationOpened; } },
  { id: "story:logProtocol", ready: anyUpgrade },
  { id: "story:logGardener", ready: function(){ return state.eaten >= 10; }, also: "life:gardener" },
  { id: "story:logDispute", ready: function(){ return state.eaten >= 50; } },
  { id: "story:logRings", ready: function(){ return state.eaten >= 25 && isDiscovered("body:blackhole"); } }
];

let lastRecoveredAt = Date.now();

export function storyEvent(name){
  if(name === "enter") discover("story:logReboot");
  if(name === "station") stationOpened = true;
}

function check(){
  if(!isDiscovered("story:logReboot")) return; // not in the game yet
  if(Date.now() - lastRecoveredAt < RECOVER_INTERVAL_MS) return;
  const next = QUEUE.find(function(f){ return !isDiscovered(f.id) && f.ready(); });
  if(!next) return;
  discover(next.id);
  if(next.also) discover(next.also);
  lastRecoveredAt = Date.now();
}

export function initStoryLog(){
  setInterval(check, 1000);
}
