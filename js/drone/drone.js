import { ctx } from "../core/context.js";
import { disposeMesh } from "../core/utils.js";
import { gfxDetail, gfxParticles, onGraphicsChange } from "../scene/graphics.js";
import { stepUnitProgram } from "../program/runner.js";
import { startMotion, advanceMotion, nearestLiveBody, isNearBody } from "../program/unitMotion.js";
import { biteNearestBody } from "../program/unitBite.js";
import { unitPrint } from "../program/unitPrint.js";
import { DRONE_MAX_FUEL, DRONE_FUEL_PER_MOVE_UNIT, DRONE_MOVE_SPEED, DRONE_TURN_SPEED, DRONE_BASE_ATTACK, DRONE_BASE_DEFENSE, DRONE_REFUEL_RATE, DRONE_ATTACK_COOLDOWN_S, DRONE_MODEL_LENGTH } from "../config.js";

// The drone's look is ShipKit's DR-01 SCRIBE (js/shipkit/shipkit.js — the
// same model as in the ship lab, ship.html), built with static meshes
// merged and effects (bolts, scan waves) placed in the scene. `mesh` is a
// plain holder the game moves/turns as before; the model sits inside it,
// turned to the game's +Z forward and scaled to DRONE_MODEL_LENGTH. It
// lights itself with glow sprites, so no PointLight of its own anymore.
export function buildDroneModel(detail){
  const model = ShipKit.buildShipModel("scribe", { detail: detail * ShipKit.GAME_DETAIL.scribe, merge: true, fxRoot: ctx.scene });
  return { model: model, holder: ShipKit.makeGameHolder(model, DRONE_MODEL_LENGTH) };
}

function makeDroneMesh(){
  const mesh = new THREE.Group();
  const built = buildDroneModel(gfxDetail());
  mesh.add(built.holder);

  // selection ring, same pattern as ships/swarm.js — visible only while selected
  const ringGeo = new THREE.RingGeometry(DRONE_MODEL_LENGTH * 0.68, DRONE_MODEL_LENGTH * 0.75, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  mesh.add(ring);

  // invisible sphere for raycasting - same trick as ships/swarm.js, but
  // smaller than a ship's (0.55): the drone sits apart from the swarm (see
  // spawnDrone()) specifically so an oversized hitbox can't "steal" clicks
  // meant for nearby ships/planets during normal fleet-commanding.
  const pickGeo = new THREE.SphereGeometry(DRONE_MODEL_LENGTH * 0.5, 8, 8);
  const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  mesh.add(pickMesh);

  return { mesh: mesh, pickMesh: pickMesh, ring: ring, model: built.model, modelHolder: built.holder };
}

// Rebuild the model at a new geometry detail (Setup -> Graphics), keeping
// its state (offline) — the holder, ring and pick sphere stay.
function rebuildDroneModel(drone){
  drone.mesh.remove(drone.modelHolder);
  ShipKit.disposeShipModel(drone.model);
  const built = buildDroneModel(gfxDetail());
  drone.model = built.model;
  drone.modelHolder = built.holder;
  drone.mesh.add(built.holder);
  if(drone.fuel <= 0) drone.model.act("offline", true);
}

// The drone is gone (swallowed by a black hole): it blows apart — the
// model's own destroy effect — and the wreck is cleaned up a few seconds
// later.
export function destroyDroneMesh(drone){
  drone.model.act("destroy");
  const wreck = drone;
  wreckage.push({ drone: wreck, t: 7 });
}
const wreckage = [];
let animT = 0;

// Purely a selection indicator (ring), like ships — never moves the camera.
// The drone's info panel tracks this same flag (see ui/hud/unitPanel.js) so
// opening/closing it and selecting/deselecting the drone stay in sync,
// RTS-style: the camera is completely independent of what's selected.
export function setDroneSelected(drone, val){
  drone.selected = val;
  drone.selectionRing.visible = val;
}

export function spawnDrone(){
  const built = makeDroneMesh();
  // Above the station, clear of the ships' spiral: clicks pick the drone
  // before ships and planets (scene/controls.js), so in the middle of the
  // fleet it stole orders meant for ships.
  const pos = ctx.station
    ? ctx.station.pos.clone().add(new THREE.Vector3(0, 3.5, 0))
    : new THREE.Vector3(Math.cos(Math.random()*Math.PI*2)*6, 3, Math.sin(Math.random()*Math.PI*2)*6);
  built.mesh.position.copy(pos);
  ctx.scene.add(built.mesh);

  const drone = {
    mesh: built.mesh,
    model: built.model,           // ShipKit model handle (animations, actions)
    modelHolder: built.modelHolder,
    visPower: 0,                  // eased engine throttle for the model
    shots: 0,                     // attack() hits so far — broadcast so others see the shots
    shotTarget: null,
    pickMesh: built.pickMesh,
    selectionRing: built.ring,
    selected: false,
    pos: pos,
    heading: Math.random() * Math.PI * 2,
    fuel: DRONE_MAX_FUEL, maxFuel: DRONE_MAX_FUEL,
    attackPower: DRONE_BASE_ATTACK, defense: DRONE_BASE_DEFENSE,
    docked: false,
    api: DRONE_API,               // what its program's builtins do (program/runner.js)
    running: false,
    error: null,
    logs: [],
    gen: null,
    pending: null,
    lastPrintAt: -Infinity,
    attackReadyIn: 0 // seconds until the next attack() may land
  };
  built.pickMesh.userData.drone = drone;
  ctx.drone = drone;
  return drone;
}

// The drone's program builtins (program/runner.js runs the program; the
// language is drone/dsl.js). Movement is program/unitMotion.js — shared
// with the swarm ships and the trajectory preview — spending fuel.
const DRONE_MOTION = { moveSpeed: DRONE_MOVE_SPEED, turnSpeed: DRONE_TURN_SPEED, fuelPerUnit: DRONE_FUEL_PER_MOVE_UNIT };

function isDocked(drone){
  const { body, dist } = nearestLiveBody(drone.pos);
  return isNearBody(body, dist);
}

function applyAttack(drone){
  return biteNearestBody(drone, drone.attackPower, function(surfacePoint){
    drone.model.act("fire", { target: surfacePoint });   // the eye fires at the bitten spot
    drone.shots += 1;
    drone.shotTarget = surfacePoint.clone();
  });
}

const DRONE_API = {
  start: function(drone, name, args){
    switch(name){
      case "__tick__": return { blocking: false, value: 0 }; // loop safety checkpoint, see interpreter.js
      case "fuel": return { blocking: false, value: drone.fuel };
      case "maxFuel": return { blocking: false, value: drone.maxFuel };
      case "nearPlanet": return { blocking: false, value: isDocked(drone) ? 1 : 0 };
      // Rate-limited by waiting, not by failing: a hit landing inside the
      // cooldown first blocks for the rest of it (like wait()), then lands.
      // So `while(true){ attack() }` paces itself at 1/DRONE_ATTACK_COOLDOWN_S
      // hits per second instead of ~2000 per frame, with no wait() needed.
      case "attack":
        if(drone.attackReadyIn > 0) return { blocking: true, state: { name: "attack", remaining: drone.attackReadyIn } };
        drone.attackReadyIn = DRONE_ATTACK_COOLDOWN_S;
        return { blocking: false, value: applyAttack(drone) };
      case "print": unitPrint(drone, args[0]); return { blocking: false, value: 0 };
      case "move": case "turn": case "wait": return { blocking: true, state: startMotion(name, args) };
      default:
        throw new Error("Unknown function '" + name + "()'");
    }
  },
  advance: function(drone, pending, dt){
    if(pending.name === "attack"){
      pending.remaining -= dt;
      if(pending.remaining > 0) return false;
      drone.attackReadyIn = DRONE_ATTACK_COOLDOWN_S;
      pending.value = applyAttack(drone);
      return true;
    }
    return advanceMotion(drone, pending, dt, DRONE_MOTION);
  }
};

export function updateDrone(dt){
  const drone = ctx.drone;
  if(!drone) return;

  drone.docked = isDocked(drone);
  if(drone.docked) drone.fuel = Math.min(drone.maxFuel, drone.fuel + DRONE_REFUEL_RATE*dt);

  drone.attackReadyIn = Math.max(0, drone.attackReadyIn - dt);
  stepUnitProgram(drone, dt);

  drone.mesh.position.copy(drone.pos);
  drone.mesh.rotation.y = drone.heading;

  // the model: engines follow move(), dark when out of fuel
  animT += dt;
  const moving = drone.running && drone.pending && drone.pending.name === "move";
  drone.visPower += ((moving ? 1 : 0.15) - drone.visPower) * Math.min(1, dt * 3);
  if((drone.fuel <= 0) !== drone.model.offline) drone.model.act("offline", drone.fuel <= 0);
  drone.model.update(animT, dt, { power: drone.visPower, particles: gfxParticles() });
}

// Wrecks of destroyed drones keep animating (debris, smoke) until removed.
export function updateDroneWreckage(dt){
  for(let i = wreckage.length - 1; i >= 0; i--){
    const w = wreckage[i];
    w.drone.model.update(animT, dt, { particles: gfxParticles() });
    if((w.t -= dt) <= 0){
      ShipKit.disposeShipModel(w.drone.model);
      disposeMesh(ctx.scene, w.drone.mesh);
      wreckage.splice(i, 1);
    }
  }
}

onGraphicsChange(function(before){
  if(ctx.drone && before.detail !== gfxDetail()) rebuildDroneModel(ctx.drone);
});
