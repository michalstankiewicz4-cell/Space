import { ctx } from "../core/context.js";
import { STATION_FIELD_RADIUS, STATION_FIELD_STRENGTH } from "../config.js";

// The station's containment field ("pole siłowe") — only meaningful once
// ambient solar gravity (world/solarGravity.js) can actually move an idle
// ship on its own; before that, an idle ship with no commandedTarget never
// moved at all, so nothing needed anchoring it near home. Only the local
// player's own ships are pulled — other players' ships are pure ghost
// interpolation (net/shipsBroadcast.js), never simulated locally.
//
// Deliberately does NOT cover the drone, unlike solarGravity.js's own
// station-field exemption (which does) — a ship that's wandered off is
// always either idle (safe to nudge home) or actively eating something,
// in which case updateShips() overwrites its position outright every
// frame (the lerp-to-orbit-around-target branch), so this pull never
// actually fights a ship mid-task. The drone has no equivalent override:
// docking/refueling is a pure proximity check (isDocked(), drone.js) with
// nothing pinning its actual position, so pulling it back toward the
// station at STATION_FIELD_STRENGTH the same way would visibly drag it
// off whatever distant body it's deliberately docked at mid-script -
// breaking the drone's actual point (autonomously roaming/docking
// anywhere), not just nudging an idle unit home.
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
