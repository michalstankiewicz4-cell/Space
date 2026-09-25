import { readStorage, writeStorage } from "./utils.js";

// What the player has discovered so far, for the Wiki (ui/windows/wiki.js):
// a set of entry ids like "body:ice" or "tech:speed". Local to this
// browser, like the rest of a player's progress (core/gameState.js), but
// its own key so the Wiki can grow without touching the save format.
const STORAGE_KEY = "roj-discovered";
const listeners = [];
let found = new Set();

try{
  const raw = JSON.parse(readStorage(STORAGE_KEY) || "[]");
  if(Array.isArray(raw)) found = new Set(raw.filter(function(id){ return typeof id === "string"; }));
}catch(e){ /* corrupt entry: start empty */ }

export function isDiscovered(id){
  return found.has(id);
}

export function discoveredCount(ids){
  return ids.filter(function(id){ return found.has(id); }).length;
}

// Returns true only the first time an id is discovered. `silent` skips the
// listeners (the event log toast) — used when catching up on progress the
// player made before the Wiki existed, e.g. upgrades already bought.
export function discover(id, silent){
  if(found.has(id)) return false;
  found.add(id);
  writeStorage(STORAGE_KEY, JSON.stringify(Array.from(found)));
  if(!silent) listeners.forEach(function(fn){ fn(id); });
  return true;
}

export function onDiscover(fn){
  listeners.push(fn);
}
