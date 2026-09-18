import { TREE } from "../config.js";

// Postęp gracza — celowo lokalny (localStorage), nie zsynchronizowany przez
// sieć. Świat (planety/statki innych graczy) jest współdzielony, ale to,
// ile masz punktów i jak rozwinięty jest Twój rój, zostaje na tym urządzeniu.
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
  try{
    localStorage.setItem("roj-swarm-save", JSON.stringify(state));
  }catch(e){ /* storage unavailable - ignore */ }
}

export function load(){
  try{
    const raw = localStorage.getItem("roj-swarm-save");
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.levels){
        state.points = parsed.points;
        state.eaten = parsed.eaten;
        state.levels = parsed.levels;
      }
    }
  }catch(e){ /* ignore */ }
}
