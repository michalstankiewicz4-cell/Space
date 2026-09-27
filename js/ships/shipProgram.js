import { swarmStats } from "../core/gameState.js";
import { stepUnitProgram } from "../program/runner.js";
import { startMotion, advanceMotion, nearestLiveBody, isNearBody, headingOfMesh } from "../program/unitMotion.js";
import { biteNearestBody } from "../program/unitBite.js";
import { unitPrint } from "../program/unitPrint.js";
import { DRONE_TURN_SPEED, DRONE_ATTACK_COOLDOWN_S } from "../config.js";
import { eatEfficiency, hideBolt } from "./swarm.js";

// A swarm ship's program — the same language and builtins as the drone's
// (drone/drone.js), run by program/runner.js, so a script written for one
// runs on the other. While it runs, the program flies the ship: no course
// order (a click order stops the program, scene/controls.js#commandTo),
// no pull back to the station (station/stationField.js); ambient gravity
// still acts on it the way it does on the drone — a drift of its position,
// not an ever-growing velocity (world/solarGravity.js).
//
// Differences from the drone: ships have no fuel — fuel() and maxFuel()
// both report SHIP_FUEL, a full tank, so drone scripts work unchanged —
// they move at the ship's cruise speed (the Speed upgrade), and attack()
// bites like the ship does while eating (the Bite upgrade and its thermal
// resistance vs. the body's heat), in DRONE_ATTACK_COOLDOWN_S slices.

export const SHIP_FUEL = 100;

// Cruise speed, the same as a ship flying to an order (ships/swarm.js).
export function shipMoveSpeed(){ return 6.5 * swarmStats().speed * 0.15; }

function motion(){
  return { moveSpeed: shipMoveSpeed(), turnSpeed: DRONE_TURN_SPEED, fuelPerUnit: 0 };
}

function isNear(sh){
  const { body, dist } = nearestLiveBody(sh.pos);
  return isNearBody(body, dist);
}

function applyAttack(sh){
  const stats = swarmStats();
  return biteNearestBody(sh, function(body){
    return 5.5 * stats.power * eatEfficiency(stats, body) * DRONE_ATTACK_COOLDOWN_S;
  });
}

export const SHIP_API = {
  // All stop: no order, no drift from the last flight; face where it faces.
  prepare: function(sh){
    sh.commandedTarget = null;
    sh.target = null;
    sh.vel.set(0, 0, 0);
    sh.heading = headingOfMesh(sh.mesh);
    sh.attackReadyIn = 0;
    hideBolt(sh);
  },
  start: function(sh, name, args){
    switch(name){
      case "__tick__": return { blocking: false, value: 0 };
      case "fuel": case "maxFuel": return { blocking: false, value: SHIP_FUEL };
      case "nearPlanet": return { blocking: false, value: isNear(sh) ? 1 : 0 };
      case "attack":
        if(sh.attackReadyIn > 0) return { blocking: true, state: { name: "attack", remaining: sh.attackReadyIn } };
        sh.attackReadyIn = DRONE_ATTACK_COOLDOWN_S;
        return { blocking: false, value: applyAttack(sh) };
      case "print": unitPrint(sh, args[0]); return { blocking: false, value: 0 };
      case "move": case "turn": case "wait": return { blocking: true, state: startMotion(name, args) };
      default:
        throw new Error("Unknown function '" + name + "()'");
    }
  },
  advance: function(sh, pending, dt){
    if(pending.name === "attack"){
      pending.remaining -= dt;
      if(pending.remaining > 0) return false;
      sh.attackReadyIn = DRONE_ATTACK_COOLDOWN_S;
      pending.value = applyAttack(sh);
      return true;
    }
    return advanceMotion(sh, pending, dt, motion());
  }
};

// One frame of a ship flown by its program (ships/swarm.js#updateShips).
export function updateProgrammedShip(sh, dt){
  sh.attackReadyIn = Math.max(0, sh.attackReadyIn - dt);
  stepUnitProgram(sh, dt);
  sh.mesh.position.copy(sh.pos);
  sh.mesh.rotation.set(0, sh.heading, 0);      // the model faces +Z
  const moving = sh.pending && sh.pending.name === "move";
  sh.visual.power = moving ? 1 : 0.15;
}
