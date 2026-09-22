import { TREE } from "../config.js";
import { readStorage, writeStorage } from "./utils.js";

// Player progress — deliberately local (localStorage), not synced over the
// network. The world (planets/other players' ships) is shared, but how many
// points you have and how developed your swarm is stays on this device.
export const state = {
  points: 1000000,
  eaten: 0,
  levels: { speed: 0, power: 0, heat: 0, cold: 0, fleet: 0 }
};

export function cost(node){
  const lvl = state.levels[node.key];
  if(lvl >= node.maxLvl) return null;
  return Math.round(node.base * Math.pow(node.growth, lvl));
}

export function swarmStats(){
  return {
    speed: TREE.speed.effect(state.levels.speed),
    power: TREE.power.effect(state.levels.power),
    heat: TREE.heat.effect(state.levels.heat),
    cold: TREE.cold.effect(state.levels.cold),
    fleetTarget: TREE.fleet.effect(state.levels.fleet)
  };
}

export function save(){
  writeStorage("roj-swarm-save", JSON.stringify(state));
}

export function load(){
  try{
    const raw = readStorage("roj-swarm-save");
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.levels){
        state.points = parsed.points;
        state.eaten = parsed.eaten;
        // Merge key-by-key onto the current default `state.levels`, never
        // replace the object outright - a save written before some future
        // TREE node existed would otherwise leave that key `undefined`,
        // and TREE.<key>.effect(undefined) turns into NaN (most effect()
        // formulas are `lvl * something`), which then poisons swarmStats()
        // and every derived stat (ship speed/damage/etc) for the rest of
        // the session - including sh.target.health, which can never drop
        // to <=0 again once it's NaN, silently freezing that planet as
        // unkillable. Only copying known TREE keys also means a save from
        // a *newer* build with an extra key some older build doesn't know
        // about won't leak stray fields into state.levels either.
        Object.keys(state.levels).forEach(function(key){
          if(typeof parsed.levels[key] === "number") state.levels[key] = parsed.levels[key];
        });
      }
    }
  }catch(e){ /* ignore */ }
}
