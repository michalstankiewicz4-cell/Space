import { ctx } from "../core/context.js";
import { readStorage, writeStorage } from "../core/utils.js";

// Where the fleet was: every ship's position (and a course order to a
// fixed solar body, or RETURN TO BASE, if it had one) and the drone's,
// kept in this browser so a reload doesn't send the swarm back to the
// station. Saved every SAVE_S seconds and when the page is hidden or
// closed; restored once at start-up, after the fleet and the drone exist
// (main.js). Comet orders and running programs aren't kept — a comet may
// be gone by then, and a program restarts from its first line anyway.
const KEY = "roj-fleet-pos";
const SAVE_S = 2;
const LIMIT = 5000;   // anything farther out is a broken save, not a position
let timer = 0;
// Course orders waiting for their body: online, the solar bodies arrive
// from the server a moment after start-up — [ship, orbitSlot] pairs,
// resolved in updateFleetMemory until PENDING_S runs out.
let pending = [], pendingLeft = 0;
const PENDING_S = 30;

function finite3(a){
  return Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(function(v){ return typeof v === "number" && isFinite(v) && Math.abs(v) < LIMIT; });
}
const r2 = function(v){ return Math.round(v * 100) / 100; };

function saveFleet(){
  if(!ctx.station || pending.length) return;   // orders not restored yet: keep the old save
  const data = {
    v: 1,
    ships: ctx.ships.map(function(sh){
      const tgt = sh.commandedTarget && sh.commandedTarget.orbitSlot != null ? sh.commandedTarget.orbitSlot : null;
      return [r2(sh.pos.x), r2(sh.pos.y), r2(sh.pos.z), tgt, sh.returning ? 1 : 0];
    }),
    drone: ctx.drone ? [r2(ctx.drone.pos.x), r2(ctx.drone.pos.y), r2(ctx.drone.pos.z)] : null
  };
  writeStorage(KEY, JSON.stringify(data));
}

export function restoreFleet(){
  let data = null;
  try{ data = JSON.parse(readStorage(KEY) || "null"); }catch(e){ data = null; }
  if(data && data.v === 1 && Array.isArray(data.ships)){
    const n = Math.min(data.ships.length, ctx.ships.length);
    for(let i = 0; i < n; i++){
      const s = data.ships[i], sh = ctx.ships[i];
      if(!finite3(s)) continue;
      sh.pos.set(s[0], s[1], s[2]);
      sh.mesh.position.copy(sh.pos);
      if(s[3] != null) pending.push([sh, s[3]]);
      else if(s[4] === 1) sh.returning = true;
    }
    if(ctx.drone && finite3(data.drone)){
      ctx.drone.pos.set(data.drone[0], data.drone[1], data.drone[2]);
      ctx.drone.mesh.position.copy(ctx.drone.pos);
    }
  }
  pendingLeft = PENDING_S;
  resolvePending();
  const flush = function(){ saveFleet(); };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function(){ if(document.hidden) flush(); });
}

function resolvePending(){
  pending = pending.filter(function(pair){
    const sh = pair[0];
    if(ctx.ships.indexOf(sh) < 0 || sh.commandedTarget || sh.returning || sh.running) return false;   // gone, or given a new order meanwhile
    const body = ctx.planets.find(function(p){ return p.orbitSlot === pair[1]; });
    if(!body) return true;
    sh.commandedTarget = body; sh.target = body;
    return false;
  });
}

export function updateFleetMemory(dt){
  if(pending.length){
    pendingLeft -= dt;
    if(pendingLeft > 0) resolvePending(); else pending = [];
  }
  timer += dt;
  if(timer < SAVE_S) return;
  timer = 0;
  saveFleet();
}
