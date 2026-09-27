import { ctx } from "../core/context.js";
import { DRONE_DOCK_GAP } from "../config.js";

// The motion builtins every programmable unit shares — move(n), turn(deg),
// wait(s) — as plain math on { pos, heading, fuel? }, so the game
// (program/runner.js via the drone's and ships' APIs) and the trajectory
// preview (program/simulate.js, on a copy of the unit) move a unit exactly
// the same way. Movement is in the horizontal plane along `heading`
// (+Z at heading 0, the same forward the ship and drone models face).
//
// spec = { moveSpeed, turnSpeed, fuelPerUnit } — fuelPerUnit 0 means the
// unit doesn't spend fuel (swarm ships).

const FWD = new THREE.Vector3();

export function startMotion(name, args){
  const n = args[0] || 0;
  if(name === "move") return { name: "move", remaining: Math.max(0, n) };
  if(name === "turn") return { name: "turn", total: n, remaining: n };
  if(name === "wait") return { name: "wait", remaining: Math.max(0, n) };
  return null;
}

// Advances move/turn/wait by dt; true once done.
export function advanceMotion(u, pending, dt, spec){
  if(pending.name === "wait"){
    pending.remaining -= dt;
    return pending.remaining <= 0;
  }
  if(pending.name === "turn"){
    const step = Math.sign(pending.total) * Math.min(Math.abs(pending.remaining), spec.turnSpeed * dt);
    u.heading += step * Math.PI / 180;
    pending.remaining -= step;
    return Math.abs(pending.remaining) < 0.001;
  }
  if(pending.name === "move"){
    const byFuel = spec.fuelPerUnit > 0 ? Math.max(0, u.fuel / spec.fuelPerUnit) : Infinity;
    const step = Math.min(pending.remaining, spec.moveSpeed * dt, byFuel);
    if(step > 0){
      u.pos.addScaledVector(FWD.set(Math.sin(u.heading), 0, Math.cos(u.heading)), step);
      if(spec.fuelPerUnit > 0) u.fuel = Math.max(0, u.fuel - step * spec.fuelPerUnit);
      pending.remaining -= step;
    }
    return pending.remaining < 0.001 || (spec.fuelPerUnit > 0 && u.fuel <= 0);
  }
  return true;
}

// The live body nearest to `pos` (not a dying one), and how far it is.
export function nearestLiveBody(pos){
  let best = null, bestDist = Infinity;
  for(let i = 0; i < ctx.planets.length; i++){
    const p = ctx.planets[i];
    if(p.dying) continue;
    const d = pos.distanceTo(p.mesh.position);
    if(d < bestDist){ bestDist = d; best = p; }
  }
  return { body: best, dist: bestDist };
}

// "Close enough to attack() / refuel": within the body's radius + a gap.
export function isNearBody(body, dist){
  return !!body && dist <= body.radius + DRONE_DOCK_GAP;
}

// The heading a unit's mesh currently faces (its local +Z, flattened).
export function headingOfMesh(mesh){
  FWD.set(0, 0, 1).applyQuaternion(mesh.quaternion);
  return Math.atan2(FWD.x, FWD.z);
}
