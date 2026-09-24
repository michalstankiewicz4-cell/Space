import { ctx } from "../core/context.js";
import { SOLAR_BODIES, GM_SUN, bodyPosAt, nowSimTime } from "./solarSystem.js";
import { STATION_FIELD_RADIUS } from "../config.js";

// Per-frame ambient gravity — generalizes test.html's own patched-conics
// tick() (its lines 822-835): a ship/the drone is pulled toward exactly one
// dominant body at a time (whichever body's soiRadius it's currently
// inside), falling back to the sun everywhere else. Reuses the same
// scratch-vector + addScaledVector(...) shape world/blackholes.js already
// established for its own gravity loop.
//
// The black hole (slot 9) is deliberately EXCLUDED from this generic loop —
// it keeps its own existing kill-on-contact gravity/consumption logic in
// world/blackholes.js#updateBlackHoles(), called separately from main.js's
// tick(). Every other fixed body here is purely attractive, never lethal.
const toSrcScratch = new THREE.Vector3();

// One scratch Vector3 per orbiting body (persistent across frames, reused
// in place every frame — never a fresh array/Vector3 per frame, matching
// this project's established per-frame-hot-loop convention), keyed by the
// same array index as SOLAR_BODIES (not by slot number — this is a purely
// internal cache, unrelated to DB orbit_slot lookups elsewhere).
const bodyPosScratches = SOLAR_BODIES.map(function(){ return new THREE.Vector3(); });

function refreshBodyPositions(t){
  for(let i=0;i<SOLAR_BODIES.length;i++){
    bodyPosAt(SOLAR_BODIES[i].slot, t, bodyPosScratches[i]);
  }
}

// `applyToVel`: true for ships (accumulate into entity.vel, consumed by
// ships/swarm.js#updateShips' own position integration next), false for the
// drone (write straight into entity.pos instead) — the drone has no
// velocity/integration step at all, it only ever moves via explicit
// move()/turn() DSL calls (js/drone/drone.js), so a `drone.vel` field
// wouldn't be read by anything. This mirrors exactly how
// world/blackholes.js's own existing gravity loop already treats the drone
// differently from ships for the same reason.
function applyGravityToOne(entity, dt, applyToVel){
  let primary = null, primaryDist = Infinity, primaryPos = null;
  for(let i=0;i<SOLAR_BODIES.length;i++){
    const b = SOLAR_BODIES[i];
    if(b.kind === "blackhole") continue; // handled separately, see header comment
    const d = entity.pos.distanceTo(bodyPosScratches[i]);
    if(d < b.soiRadius && d < primaryDist){ primary = b; primaryDist = d; primaryPos = bodyPosScratches[i]; }
  }
  const gm = primary ? primary.gm : GM_SUN;
  // bodyPosScratches[0] is always the sun (slot 0, first entry) — used as
  // the fallback source whenever the entity is outside every other SOI.
  const srcPos = primary ? primaryPos : bodyPosScratches[0];
  toSrcScratch.subVectors(srcPos, entity.pos);
  const minR = primary ? primary.radius * 0.6 : 3;
  const r = Math.max(toSrcScratch.length(), minR);
  toSrcScratch.normalize();
  const accel = (gm / (r * r)) * dt;
  if(applyToVel) entity.vel.addScaledVector(toSrcScratch, accel);
  else entity.pos.addScaledVector(toSrcScratch, accel);
}

// Same radius as station/stationField.js's own containment pull-back
// (config.js#STATION_FIELD_RADIUS) - one coherent "protective field"
// around the station, not two independently-tuned radii: inside it,
// ambient gravity simply doesn't apply at all (so a freshly-spawned or
// docked fleet sits still instead of immediately drifting toward the Sun
// - real solar gravity is strong enough even at the station's own ~290-unit
// distance that this isn't a negligible effect over time); at/beyond the
// boundary, stationField.js's own pull-back takes over for anything that's
// drifted or traveled away. Ships only, matching stationField.js's own
// scope - the drone was never covered by that field either.
function insideStationField(pos){
  return !!ctx.station && pos.distanceTo(ctx.station.pos) < STATION_FIELD_RADIUS;
}

export function updateSolarGravity(dt){
  refreshBodyPositions(nowSimTime());
  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];
    if(insideStationField(sh.pos)) continue;
    applyGravityToOne(sh, dt, true);
  }
  if(ctx.drone) applyGravityToOne(ctx.drone, dt, false);
}
