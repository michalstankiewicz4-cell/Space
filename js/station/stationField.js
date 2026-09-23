import { ctx } from "../core/context.js";
import { STATION_FIELD_RADIUS, STATION_FIELD_STRENGTH } from "../config.js";

// The station's containment field ("pole siłowe") — only meaningful once
// ambient solar gravity (world/solarGravity.js) can actually move an idle
// ship on its own; before that, an idle ship with no commandedTarget never
// moved at all, so nothing needed anchoring it near home. Only the local
// player's own ships are pulled — other players' ships are pure ghost
// interpolation (net/shipsBroadcast.js), never simulated locally.
const toStationScratch = new THREE.Vector3();

export function applyStationField(dt){
  if(!ctx.station) return;
  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];
    const d = sh.pos.distanceTo(ctx.station.pos);
    if(d > STATION_FIELD_RADIUS){
      toStationScratch.subVectors(ctx.station.pos, sh.pos).normalize();
      const pull = Math.min(1, (d - STATION_FIELD_RADIUS) / STATION_FIELD_RADIUS) * STATION_FIELD_STRENGTH;
      sh.vel.addScaledVector(toStationScratch, pull * dt);
    }
  }
}
