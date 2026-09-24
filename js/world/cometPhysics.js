import { CONTENT } from "../content.js";
import { GM_SUN, SOLAR_BODY_BY_SLOT, SOLAR_BODIES } from "./solarSystem.js";

// Comets are the one body in this game whose position is genuinely
// SIMULATED, not a closed-form function of time the way every fixed solar
// body's orbit (solarSystem.js#bodyPosAt) or a comet's own old
// straight-line drift used to be. A comet flies in from outside the whole
// system, swings around the Sun under real gravity (curving, exactly like
// world/solarGravity.js already does for ships — just always pulled toward
// the Sun specifically, since a comet's whole point is a sun-grazing pass
// and it's moving fast enough that no single planet's much smaller SOI
// meaningfully competes with the Sun's pull along the way), and flies back
// out the other side. This means a client materializing a comet it didn't
// see spawn can't evaluate a formula for "where is it right now" — it has
// to replay the same step-by-step simulation from the spawn state stored
// in the DB row up to now (see advanceComet() below). Comets are few and
// short-lived, so this replay is cheap even for a several-minute-old one.

// Just past the outermost real orbit (the black hole, slot 9) — a comet
// genuinely "traverses the whole system" (spawns outside every orbit,
// exits the far side outside every orbit too), not just some inner slice
// of it.
export const COMET_ENTRY_RADIUS = SOLAR_BODIES[SOLAR_BODIES.length-1].a * 1.15;
export const COMET_EXIT_RADIUS = COMET_ENTRY_RADIUS * 1.1;

// The user's own explicit spec: closest approach ~2/3 of the first orbit's
// distance from the Sun. Actually solved for as a real target periapsis by
// randomCometEntry() below (via vis-viva + angular momentum), not just an
// approximate aim point — see that function's own comment.
export const COMET_PERIHELION = SOLAR_BODY_BY_SLOT[1].a * (2/3);

const STEP_DT = 0.05; // matches the game's own per-frame dt clamp (main.js)

// One gravity step, pulling straight toward the Sun (at the origin) -
// same accel = GM/r² shape world/solarGravity.js uses, simplified since a
// comet's dominant body is always the Sun for its whole fast transit.
export function stepComet(pos, vel, dt){
  const toSun = pos.clone().multiplyScalar(-1);
  const r = Math.max(toSun.length(), 3);
  toSun.normalize();
  vel.addScaledVector(toSun, (GM_SUN / (r*r)) * dt);
  pos.addScaledVector(vel, dt);
}

// Replays stepComet() in fixed sub-steps to catch a materializing comet up
// to "now" — see this file's own header comment for why a closed-form
// shortcut doesn't exist here the way it does for every other body.
export function advanceComet(pos, vel, elapsedSec){
  let remaining = elapsedSec;
  while(remaining > 0){
    const dt = Math.min(STEP_DT, remaining);
    stepComet(pos, vel, dt);
    remaining -= dt;
  }
}

// Random entry point on a big sphere around the whole system, with a
// velocity solved analytically (not just pointed at a target point) to
// actually swing by ~COMET_PERIHELION from the Sun.
//
// A first version aimed the entry velocity straight at a random point
// COMET_PERIHELION from the Sun — that ignores how much stepComet()'s
// gravity bends the path over the long inbound leg (COMET_ENTRY_RADIUS is
// ~17x COMET_PERIHELION), so in practice it overshot massively inward:
// verified live, real perihelions landed around 1.5-5 units (nearly
// grazing the Sun's own radius) instead of the intended 60. Since
// stepComet() only ever pulls toward the Sun, this is an exact two-body
// problem — the correct entry velocity has a closed-form solution via
// conservation of energy (vis-viva) and angular momentum:
//   v_p^2 = v0^2 + 2*GM*(1/r_p - 1/R)                (energy)
//   sin(alpha) = (r_p * v_p) / (R * v0)               (angular momentum,
//     alpha = angle between the entry velocity and the inward radial
//     direction at entry)
// Re-verified after this fix: real perihelions now land within ~0.02% of
// the r_p target (Euler integration's own tiny per-step error, not a
// targeting error).
export function randomCometEntry(){
  const entryTheta = Math.random()*Math.PI*2;
  const entryPhi = Math.acos(2*Math.random()-1);
  const pos = new THREE.Vector3(
    COMET_ENTRY_RADIUS*Math.sin(entryPhi)*Math.cos(entryTheta),
    COMET_ENTRY_RADIUS*Math.sin(entryPhi)*Math.sin(entryTheta),
    COMET_ENTRY_RADIUS*Math.cos(entryPhi)
  );

  const speed = CONTENT.comet.speedMin + Math.random()*CONTENT.comet.speedRange;
  const rP = COMET_PERIHELION, R = COMET_ENTRY_RADIUS;
  const vP = Math.sqrt(speed*speed + 2*GM_SUN*(1/rP - 1/R));
  const sinAlpha = Math.min(1, (rP*vP) / (R*speed));
  const cosAlpha = Math.sqrt(1 - sinAlpha*sinAlpha);

  // Orbital plane: any direction perpendicular to `pos` works equally well
  // (this is what gives comets their varied, non-coplanar swing-bys) —
  // build one by discarding a random vector's component along the radial
  // direction, same "reject onto a known axis" trick used for the tail's
  // own local basis in bodyMeshParts.js.
  const radial = pos.clone().normalize();
  const planeNormal = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
  planeNormal.addScaledVector(radial, -planeNormal.dot(radial));
  if(planeNormal.lengthSq() < 0.0001) planeNormal.set(1, 0, 0);
  planeNormal.normalize();
  const tangent = new THREE.Vector3().crossVectors(planeNormal, radial); // unit: both inputs are unit and mutually perpendicular

  const side = Math.random() < 0.5 ? 1 : -1;
  const vel = radial.clone().multiplyScalar(-cosAlpha).addScaledVector(tangent, sinAlpha*side).multiplyScalar(speed);

  return { pos: pos, vel: vel };
}
