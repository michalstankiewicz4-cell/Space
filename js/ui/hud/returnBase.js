import { ctx } from "../../core/context.js";
import { returnToBase } from "../../ships/swarm.js";

// RETURN TO BASE — the 3D view's top-left button, shown while one or more
// of the player's own ships are selected (the drone isn't part of the
// swarm's formation, so it doesn't count). Sends them back to their slots
// around the station (ships/swarm.js#returnToBase).
let btn = null;

export function initReturnBase(){
  btn = document.getElementById("returnBaseBtn");
  btn.addEventListener("click", function(){
    const sel = ctx.ships.filter(function(sh){ return sh.selected; });
    if(sel.length) returnToBase(sel);
  });
}

export function updateReturnBase(){
  if(!btn) return;
  const any = ctx.ships.some(function(sh){ return sh.selected; });
  if(btn.classList.contains("hidden") === any) btn.classList.toggle("hidden", !any);
}
