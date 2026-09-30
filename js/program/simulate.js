import { ctx } from "../core/context.js";
import { swarmStats } from "../core/gameState.js";
import { parseDroneScript } from "../drone/dsl.js";
import { runProgram } from "../drone/interpreter.js";
import { bodyPosAt, nowSimTime } from "../world/solarSystem.js";
import { gravityAccelAt, insideStationField } from "../world/solarGravity.js";
import { startMotion, advanceMotion, headingOfMesh } from "./unitMotion.js";
import { MAX_INSTANT_STEPS_PER_FRAME } from "./runner.js";
import { shipMoveSpeed, SHIP_FUEL } from "../ships/shipProgram.js";
import { EAT_ORBIT_GAP, DRONE_MOVE_SPEED, DRONE_TURN_SPEED, DRONE_FUEL_PER_MOVE_UNIT, DRONE_DOCK_GAP, DRONE_REFUEL_RATE,
  DRONE_ATTACK_COOLDOWN_S } from "../config.js";

// Trajectory preview for the drone and swarm ships (drawn by
// scene/trajectories.js) — the game's counterpart of the prototype's
// orbit line and "orbit + program" line (the original prototype page's
// predictTrajectory / predictTrajectoryWithProgram). Both step a COPY of the unit forward in
// time with the game's own rules, never touching the real one:
//
// - predictCurrentPath(): where the unit goes as things stand — an idle
//   ship falling under real gravity, the drone drifting, a ship flying to
//   its order (no forces then: it cruises straight at its target,
//   ships/swarm.js).
// - predictProgramPath(): where it would go if its program started now —
//   the real interpreter (drone/interpreter.js) runs the real program;
//   move/turn/wait are the same code as in the game
//   (program/unitMotion.js), gravity the same function
//   (world/solarGravity.js#gravityAccelAt), bodies where their orbits will
//   have taken them. attack() only waits out its cooldown (no damage),
//   print() does nothing.
//
// Fixed-step (SIM_DT) instead of the game's frame steps, so a path is an
// accurate guide, not a frame-exact replay.

const SIM_DT = 0.2;
const HORIZON_S = 120;
const MAX_TOTAL_STEPS = 60000;    // instant builtins over the whole preview
const ACCEL = new THREE.Vector3();
const TMP = new THREE.Vector3();

// Where a body will be at simulated time t: a fixed solar body follows its
// orbit; anything else (a comet) is taken where it is now.
function bodyAt(p, t, out){
  if(p.orbitSlot != null) return bodyPosAt(p.orbitSlot, t, out);
  return out.copy(p.mesh.position);
}

function nearBodyAt(pos, t){
  for(let i = 0; i < ctx.planets.length; i++){
    const p = ctx.planets[i];
    if(p.dying) continue;
    if(pos.distanceTo(bodyAt(p, t, TMP)) <= p.radius + DRONE_DOCK_GAP) return true;
  }
  return false;
}

// One step of the forces the game applies (main.js's tick, before the
// units move). `flown` (the drone always; a ship while its program runs):
// gravity drifts its position directly (world/solarGravity.js) and — the
// drone — a body nearby refuels it. Otherwise (an idle ship) gravity goes
// into its velocity. None inside the station's field.
function forces(v, t, dt, flown){
  if(!insideStationField(v.pos)){
    gravityAccelAt(v.pos, t, ACCEL);
    if(flown) v.pos.addScaledVector(ACCEL, dt);
    else v.vel.addScaledVector(ACCEL, dt);
  }
  if(v.isDrone && nearBodyAt(v.pos, t)) v.fuel = Math.min(v.maxFuel, v.fuel + DRONE_REFUEL_RATE * dt);
}

// Forces, then an idle ship coasts on its velocity.
function physics(v, t, dt, flown){
  forces(v, t, dt, flown);
  if(!flown) v.pos.addScaledVector(v.vel, dt);
}

function copyOf(unit){
  const isDrone = unit === ctx.drone;
  return {
    isDrone: isDrone,
    pos: unit.pos.clone(),
    vel: isDrone ? null : unit.vel.clone(),
    heading: isDrone ? unit.heading : (unit.running ? unit.heading : headingOfMesh(unit.mesh)),
    fuel: isDrone ? unit.fuel : SHIP_FUEL,
    maxFuel: isDrone ? unit.maxFuel : SHIP_FUEL
  };
}

// As things stand (no program started). Null while a program runs — then
// its planned path (predictProgramPath at START) is what's drawn.
export function predictCurrentPath(unit){
  if(unit.running) return null;
  const v = copyOf(unit);
  const t0 = nowSimTime();
  const pts = [v.pos.clone()];
  const target = !v.isDrone ? unit.commandedTarget : null;
  const cruise = 6.5 * swarmStats().speed * 0.15;
  // the flight's per-frame 8% course correction (ships/swarm.js), per step
  const steer = 1 - Math.pow(1 - 0.08, SIM_DT * 60);
  for(let e = 0; e < HORIZON_S; e += SIM_DT){
    const t = t0 + e;
    if(target){
      if(target.dying || ctx.planets.indexOf(target) === -1) break;
      bodyAt(target, t, TMP).sub(v.pos);
      if(TMP.length() <= target.radius + EAT_ORBIT_GAP) break;     // arrived: it orbits and eats there
      v.vel.lerp(TMP.normalize().multiplyScalar(cruise), steer);
      v.pos.addScaledVector(v.vel, SIM_DT);
    } else {
      physics(v, t, SIM_DT, v.isDrone);
    }
    pts.push(v.pos.clone());
  }
  return pts;
}

// If `src` started now. { points, error } — error: a parse/runtime error
// the program would hit (the path then shows how far it got).
export function predictProgramPath(unit, src){
  const v = copyOf(unit);
  if(!v.isDrone) v.vel.set(0, 0, 0);                    // SHIP_API.prepare: all stop
  const spec = v.isDrone
    ? { moveSpeed: DRONE_MOVE_SPEED, turnSpeed: DRONE_TURN_SPEED, fuelPerUnit: DRONE_FUEL_PER_MOVE_UNIT }
    : { moveSpeed: shipMoveSpeed(), turnSpeed: DRONE_TURN_SPEED, fuelPerUnit: 0 };
  const t0 = nowSimTime();
  const pts = [v.pos.clone()];
  let gen, pending = null, input, total = 0, done = false, attackReadyIn = 0, error = null;
  try{ gen = runProgram(parseDroneScript(src || ""), { vars: {} }); }
  catch(e){ return { points: pts, error: e.message }; }

  function instant(name, t){
    switch(name){
      case "__tick__": case "print": return 0;
      case "fuel": return v.fuel;
      case "maxFuel": return v.maxFuel;
      case "nearPlanet": return nearBodyAt(v.pos, t) ? 1 : 0;
      default: throw new Error("Unknown function '" + name + "()'");
    }
  }

  for(let e = 0; e < HORIZON_S; e += SIM_DT){
    const t = t0 + e;
    // resolve instant builtins until the program blocks or ends
    let steps = 0;
    try{
      while(!done && !pending){
        const res = gen.next(input);
        if(res.done){ done = true; break; }
        const c = res.value;
        if(c.name === "move" || c.name === "turn" || c.name === "wait"){ pending = startMotion(c.name, c.args); break; }
        if(c.name === "attack"){
          if(attackReadyIn > 0){ pending = { name: "attack", remaining: attackReadyIn }; break; }
          attackReadyIn = DRONE_ATTACK_COOLDOWN_S;
          input = nearBodyAt(v.pos, t) ? 1 : 0;
        } else {
          input = instant(c.name, t);
        }
        if(++steps > MAX_INSTANT_STEPS_PER_FRAME || ++total > MAX_TOTAL_STEPS) throw new Error("Script did not pause (missing wait()?)");
      }
    }catch(err){
      error = err.message; done = true; pending = null;
    }
    attackReadyIn = Math.max(0, attackReadyIn - SIM_DT);
    if(pending){
      let fin;
      if(pending.name === "attack"){
        pending.remaining -= SIM_DT;
        fin = pending.remaining <= 0;
        if(fin){ attackReadyIn = DRONE_ATTACK_COOLDOWN_S; input = nearBodyAt(v.pos, t) ? 1 : 0; }
      } else {
        fin = advanceMotion(v, pending, SIM_DT, spec);
        if(fin) input = undefined;
      }
      if(fin) pending = null;
    }
    // once the program has ended a ship idles again: real gravity
    physics(v, t, SIM_DT, v.isDrone || !(done && !pending));
    pts.push(v.pos.clone());
  }
  return { points: pts, error: error };
}
