import { ctx } from "../core/context.js";
import { SOLAR_BODIES, GM_SUN, bodyPosAt, nowSimTime } from "./solarSystem.js";
import { STATION_FIELD_RADIUS } from "../config.js";

// Per-frame ambient gravity, patched conics: a ship or the drone is pulled
// toward one body at a time — the one whose sphere of influence (soiRadius)
// it's inside — and toward the Sun everywhere else. The black hole isn't
// part of it: its pull and kill live in world/blackholes.js.
// History of both bugs below: docs/architecture.md, "Solar system and gravity".
const toSrcScratch = new THREE.Vector3();

// Cap on GM/r² itself. Near a body's centre the force explodes (GM_SUN/3² is
// ~6700/s², a 333 units/s kick in one frame) and the fixed time step flung
// ships into chaos — measured at 424 units/s against a cruise speed of ~1.
// 20/s² is far above any real pull (~0.7/s² at the station), so a close pass
// still matters without blowing up. Keep it (CLAUDE.md).
const MAX_GRAVITY_ACCEL = 20;

// Every body's position this frame, by SOLAR_BODIES index (reused, no
// per-frame allocation).
const bodyPosScratches = SOLAR_BODIES.map(function(){ return new THREE.Vector3(); });

function refreshBodyPositions(t){
  for(let i=0;i<SOLAR_BODIES.length;i++){
    bodyPosAt(SOLAR_BODIES[i].slot, t, bodyPosScratches[i]);
  }
}

// The ambient gravity acceleration at `pos` (per second², capped), given
// every body's position in `positions` (same order as SOLAR_BODIES).
function accelInto(pos, positions, out){
  let primary = null, primaryDist = Infinity, primaryPos = null;
  for(let i=0;i<SOLAR_BODIES.length;i++){
    const b = SOLAR_BODIES[i];
    // Not the Sun either: its soiRadius is Infinity, so it would always win
    // here with its tiny per-body gm (~67) instead of GM_SUN (60000) as the
    // fallback below — gravity was ~900× too weak everywhere until v2.0.9.
    // Keep the Sun and the black hole out of this loop (CLAUDE.md).
    if(b.kind === "blackhole" || b.kind === "sun") continue;
    const d = pos.distanceTo(positions[i]);
    if(d < b.soiRadius && d < primaryDist){ primary = b; primaryDist = d; primaryPos = positions[i]; }
  }
  const gm = primary ? primary.gm : GM_SUN;
  // positions[0] is always the sun (slot 0, first entry) — used as the
  // fallback source whenever the entity is outside every other SOI.
  const srcPos = primary ? primaryPos : positions[0];
  out.subVectors(srcPos, pos);
  const minR = primary ? primary.radius * 0.6 : 3;
  const r = Math.max(out.length(), minR);
  return out.normalize().multiplyScalar(Math.min(gm / (r * r), MAX_GRAVITY_ACCEL));
}

// `applyToVel`: true adds to entity.vel (an idle ship, integrated in
// ships/swarm.js); false moves entity.pos directly (the drone and programmed
// ships — they have no velocity of their own, only program steps).
function applyGravityToOne(entity, dt, applyToVel){
  accelInto(entity.pos, bodyPosScratches, toSrcScratch);
  if(applyToVel) entity.vel.addScaledVector(toSrcScratch, dt);
  else entity.pos.addScaledVector(toSrcScratch, dt);
}

// The same acceleration at `pos` at simulated time `t` (seconds, like
// nowSimTime()), for the trajectory preview (program/simulate.js) — so a
// predicted path feels exactly the gravity the game will apply.
const predictPosScratches = SOLAR_BODIES.map(function(){ return new THREE.Vector3(); });
export function gravityAccelAt(pos, t, out){
  for(let i = 0; i < SOLAR_BODIES.length; i++) bodyPosAt(SOLAR_BODIES[i].slot, t, predictPosScratches[i]);
  return accelInto(pos, predictPosScratches, out);
}

// The station's protective field (config.js#STATION_FIELD_RADIUS): no
// gravity inside it, so a parked fleet and the drone sit still. It only
// shields — it doesn't pull anything back (the user's call, v2.19.0).
export function insideStationField(pos){
  return !!ctx.station && pos.distanceTo(ctx.station.pos) < STATION_FIELD_RADIUS;
}

export function updateSolarGravity(dt){
  refreshBodyPositions(nowSimTime());
  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];
    if(insideStationField(sh.pos)) continue;
    // Ordered (or returning) ships are immune while they fly: steering
    // against gravity halved their speed, frame-rate dependently (v2.19.0).
    if(sh.commandedTarget || sh.returning) continue;
    // Programmed ships drift by position like the drone (as velocity the
    // Sun would drag them away within seconds); idle ships feel real gravity
    // and can fall into a body (the user's call, v2.19.0).
    applyGravityToOne(sh, dt, !sh.running);
  }
  if(ctx.drone && !insideStationField(ctx.drone.pos)) applyGravityToOne(ctx.drone, dt, false);
}
