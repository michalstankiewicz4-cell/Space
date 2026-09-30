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

// Caps the raw GM/r² acceleration itself (before multiplying by dt), not
// just the position/velocity result - a real, live instability found only
// after fixing the Sun's own ~900x-weak gravity (v2.0.9): at the `minR`
// clamp below (radius*0.6 for a real planet, or a flat 3 units for the
// Sun-as-fallback case), GM/r² can still be enormous - e.g. GM_SUN/3² =
// 6666.7/s², which even at a single 0.05s frame is a ~333 unit/s velocity
// KICK in one step. A ship/the drone passing close enough to actually hit
// that clamp got flung into a chaotic trajectory instead of a
// close-but-controlled swing-by - confirmed live: a commanded ship that
// reliably arrived in ~300 simulated seconds without gravity never
// arrived at all across 1000 simulated seconds once real gravity was
// re-enabled, reaching a peak speed of ~424 units/s (cruise speed is
// ~1). This is a numerical-integration problem (a fixed, comparatively
// large timestep sampling a 1/r² force too coarsely near its own
// singularity), not a tuning problem - no `MAX_STEER_ACCEL`-style
// "stronger engine" fix on the receiving end can fully compensate for an
// unbounded force on the source end. Capped well above any legitimate
// ambient pull (compare: ~0.7/s² at the station's own ~290-unit distance
// from the Sun) so a genuine close pass still visibly matters, just
// doesn't blow up.
const MAX_GRAVITY_ACCEL = 20;

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

// The ambient gravity acceleration at `pos` (per second², capped), given
// every body's position in `positions` (same order as SOLAR_BODIES).
function accelInto(pos, positions, out){
  let primary = null, primaryDist = Infinity, primaryPos = null;
  for(let i=0;i<SOLAR_BODIES.length;i++){
    const b = SOLAR_BODIES[i];
    // The black hole is handled separately (see header comment). The Sun
    // itself must ALSO be excluded here, not just used as the fallback
    // below - its own soiRadius is Infinity (world/solarSystem.js: a=0
    // means no SOI competition needed against other bodies), so without
    // this it always "won" the primary-body competition below trivially,
    // at its own generic per-body `gm` (radius^3*0.9 = ~66.7 for the Sun's
    // radius 4.2) instead of the real GM_SUN constant (60000) meant for
    // "the Sun pulling things directly" - a real, live bug, not just a
    // weak-but-working effect: found because the drone visibly wasn't
    // drifting after flying far from the station, and confirmed by
    // calling updateSolarGravity(1) directly - it moved a drone 300 units
    // out by 0.0007 units in one full second of simulated gravity instead
    // of the ~0.667 the real GM_SUN/r² predicts, an ~900x undershoot that
    // matches 60000/66.7 almost exactly. This silently weakened gravity
    // for EVERY ship too, not just the drone, ever since this file was
    // first written - not something introduced by the drone-specific
    // v2.0.8 change, just never noticed until the drone's own field
    // exemption made "does gravity work AT ALL past the field" a much
    // easier thing to actually observe.
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

// `applyToVel`: true for ships (accumulate into entity.vel, consumed by
// ships/swarm.js#updateShips' own position integration next), false for the
// drone (write straight into entity.pos instead) — the drone has no
// velocity/integration step at all, it only ever moves via explicit
// move()/turn() DSL calls (js/drone/drone.js), so a `drone.vel` field
// wouldn't be read by anything. This mirrors exactly how
// world/blackholes.js's own existing gravity loop already treats the drone
// differently from ships for the same reason.
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

// The station's protective field (config.js#STATION_FIELD_RADIUS): inside
// it, ambient gravity simply doesn't apply at all (so a freshly-spawned or
// docked fleet sits still instead of immediately drifting toward the Sun
// - real solar gravity is strong enough even at the station's own ~290-unit
// distance that this isn't a negligible effect over time); beyond it, real
// gravity. It only shields — until v2.19.0 a separate pull-back
// (station/stationField.js, removed at the user's call) also dragged idle
// ships home from beyond it, a gravity of the station's own. Covers the
// drone too (v2.0.8) - it's "kind of a ship" too, per the user's own
// framing, and spawns right next to the station the same way.
export function insideStationField(pos){
  return !!ctx.station && pos.distanceTo(ctx.station.pos) < STATION_FIELD_RADIUS;
}

export function updateSolarGravity(dt){
  refreshBodyPositions(nowSimTime());
  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];
    if(insideStationField(sh.pos)) continue;
    // A ship flying to an order is gravity-immune while it cruises
    // (ships/swarm.js#updateShips) — skipped here outright: added to its
    // velocity and only partly steered away again, gravity (and the
    // station's old pull-back) still slowed an ordered ship to about half its cruise
    // speed, by an amount that depended on the frame rate (measured,
    // v2.19.0), so its flight could be neither predicted nor trusted.
    if(sh.commandedTarget || sh.returning) continue;   // returning to base: same as a course order
    // A ship flown by its program drifts like the drone (position, not
    // velocity): accumulated, the Sun's pull would have it falling sunward
    // at dozens of units/s within half a minute (measured) — unflyable.
    // An idle ship outside the field feels real gravity: it speeds up and
    // can fall into the Sun or a planet unless given an order (the user's
    // call, v2.19.0).
    applyGravityToOne(sh, dt, !sh.running);
  }
  if(ctx.drone && !insideStationField(ctx.drone.pos)) applyGravityToOne(ctx.drone, dt, false);
}
