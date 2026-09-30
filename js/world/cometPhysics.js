import { CONTENT } from "../content.js";
import { GM_SUN, SOLAR_BODY_BY_SLOT, SOLAR_BODIES } from "./solarSystem.js";

// Comets are the one body whose position is simulated, not a formula of
// time: one flies in from outside the system, swings round the Sun under its
// gravity alone (fast enough that no planet competes) and out again. A
// client that didn't see it spawn replays the flight from the spawn state
// in its DB row (advanceComet) — cheap, comets are few and short-lived.

// Just past the outermost orbit (the black hole's): a comet crosses the
// whole system.
const COMET_ENTRY_RADIUS = SOLAR_BODIES[SOLAR_BODIES.length-1].a * 1.15;
export const COMET_EXIT_RADIUS = COMET_ENTRY_RADIUS * 1.1;

// The user's spec: the closest approach is 2/3 of the first orbit's
// distance from the Sun (solved exactly by randomCometEntry).
const COMET_PERIHELION = SOLAR_BODY_BY_SLOT[1].a * (2/3);

const STEP_DT = 0.05; // matches the game's own per-frame dt clamp (main.js)

// One gravity step toward the Sun at the origin (GM/r², as in
// world/solarGravity.js, Sun only).
const toSun = new THREE.Vector3();
export function stepComet(pos, vel, dt){
  toSun.copy(pos).multiplyScalar(-1);
  const r = Math.max(toSun.length(), 3);
  toSun.normalize();
  vel.addScaledVector(toSun, (GM_SUN / (r*r)) * dt);
  pos.addScaledVector(vel, dt);
}

// Replays stepComet() in fixed sub-steps: a comet materialized late,
// caught up to now.
export function advanceComet(pos, vel, elapsedSec){
  let remaining = elapsedSec;
  while(remaining > 0){
    const dt = Math.min(STEP_DT, remaining);
    stepComet(pos, vel, dt);
    remaining -= dt;
  }
}

// A random entry point on a sphere around the system, and the entry
// velocity that swings by exactly COMET_PERIHELION. Aiming at a point that
// far from the Sun ignored how gravity bends the long inbound leg (comets
// grazed the Sun at 1.5-5 units instead of 60). It's a two-body problem, so
// it has a closed form — energy (vis-viva) and angular momentum:
//   v_p² = v0² + 2·GM·(1/r_p − 1/R)
//   sin α = r_p·v_p / (R·v0)   (α: entry velocity vs. the inward radial)
// Measured: perihelions within ~0.02 % of the target.
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

  // Any orbital plane containing `pos` works (varied, tilted swing-bys): a
  // random vector with its radial component removed.
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

// A comet's whole flight, entry to exit, for its trajectory line
// (scene/orbitLines.js#buildCometTrajectoryLine) — from the spawn state, so a
// late joiner sees the whole path too. Every 8th physics step (~400-600
// points); the step cap only guards against a path that never leaves.
const TRAJECTORY_SAMPLE_STRIDE = 8;
const TRAJECTORY_MAX_STEPS = 20000;
export function computeCometTrajectory(pos, vel){
  const p = pos.clone(), v = vel.clone();
  const points = [p.clone()];
  let i = 0;
  while(p.length() < COMET_EXIT_RADIUS && i < TRAJECTORY_MAX_STEPS){
    stepComet(p, v, STEP_DT);
    i++;
    if(i % TRAJECTORY_SAMPLE_STRIDE === 0) points.push(p.clone());
  }
  points.push(p.clone());
  return points;
}
