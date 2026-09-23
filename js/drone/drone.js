import { ctx } from "../core/context.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { NET_ENABLED } from "../env.js";
import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud.js";
import { refreshDock } from "../ui/dock.js";
import { triggerBreakup } from "../fx/breakup.js";
import { spawnBiteParticles } from "../fx/particles.js";
import { applyHealthVisual, destroyPlanet, paintScorch } from "../world/bodies.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { t } from "../i18n.js";
import { containsProfanity } from "../moderation.js";
import { parseDroneScript } from "./dsl.js";
import { runProgram } from "./interpreter.js";
import { spawnPrintEffect } from "./dronePrintFx.js";
import { broadcastDronePrint } from "../net/shipsBroadcast.js";
import {
  DRONE_MAX_FUEL, DRONE_FUEL_PER_MOVE_UNIT, DRONE_MOVE_SPEED, DRONE_TURN_SPEED,
  DRONE_BASE_ATTACK, DRONE_BASE_DEFENSE, DRONE_DOCK_RANGE_MULT, DRONE_REFUEL_RATE,
  DRONE_PRINT_MAX_LEN, DRONE_PRINT_COOLDOWN_S
} from "../config.js";

// Runaway-script guard: a script with no move()/turn()/wait() in a while
// loop (e.g. `while(true){ attack() }`) would otherwise resolve instant
// builtins synchronously forever inside a single updateDrone() call,
// freezing the tab. If a script hasn't hit a blocking call within this
// many resumptions in one frame, it's stopped with an error instead.
const MAX_INSTANT_STEPS_PER_FRAME = 2000;

// The script itself is the only part of drone state worth surviving a
// reload — fuel/position/running-state are all meant to reset fresh each
// session, same as everything else in ctx (see core/context.js). Separate
// localStorage key, same "roj-" prefix and try/catch-guarded pattern as
// settings.js/gameState.js, deliberately not folded into either (same
// "small persisted modules, not merged" reasoning as settings/identity/i18n
// — see CLAUDE.md).
const SCRIPT_STORAGE_KEY = "roj-drone-script";

function loadStoredScript(){
  return readStorage(SCRIPT_STORAGE_KEY) || "";
}

function saveStoredScript(src){
  writeStorage(SCRIPT_STORAGE_KEY, src);
}

function makeDroneMesh(){
  const geo = new THREE.OctahedronGeometry(0.42, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcf4f, emissive: 0xffa726, emissiveIntensity: 0.75,
    roughness: 0.35, metalness: 0.55
  });
  const mesh = new THREE.Mesh(geo, mat);
  const glow = new THREE.PointLight(0xffcf4f, 0.5, 6);
  mesh.add(glow);

  // selection ring, same pattern as ships/swarm.js — visible only while selected
  const ringGeo = new THREE.RingGeometry(0.62, 0.72, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  mesh.add(ring);

  // invisible sphere for raycasting - same trick as ships/swarm.js, but
  // smaller than a ship's (0.55): the drone sits apart from the swarm (see
  // spawnDrone()) specifically so an oversized hitbox can't "steal" clicks
  // meant for nearby ships/planets during normal fleet-commanding.
  const pickGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  mesh.add(pickMesh);

  return { mesh: mesh, pickMesh: pickMesh, ring: ring };
}

// Purely a selection indicator (ring), like ships — never moves the camera.
// The drone's info panel tracks this same flag (see ui/dronePanel.js) so
// opening/closing it and selecting/deselecting the drone stay in sync,
// RTS-style: the camera is completely independent of what's selected.
export function setDroneSelected(drone, val){
  drone.selected = val;
  drone.selectionRing.visible = val;
}

export function spawnDrone(){
  const built = makeDroneMesh();
  // Deliberately spawned away from the ships' spawn cube (+-2 on each axis,
  // see spawnShip()), not inside it: picking the drone is checked before
  // ships/planets on every click (see scene/controls.js), so overlapping
  // the busy fleet-commanding area meant an ordinary click near the swarm
  // could silently hijack a planet/ship order into re-selecting the drone
  // instead - which, since selecting it reopens its panel, looked exactly
  // like "closing the panel doesn't work" (it closed fine; a later normal
  // click just reselected the drone and reopened it).
  const angle = Math.random() * Math.PI * 2;
  const pos = new THREE.Vector3(Math.cos(angle) * 6, (Math.random() - 0.5) * 2, Math.sin(angle) * 6);
  built.mesh.position.copy(pos);
  ctx.scene.add(built.mesh);

  const drone = {
    mesh: built.mesh,
    pickMesh: built.pickMesh,
    selectionRing: built.ring,
    selected: false,
    pos: pos,
    heading: Math.random() * Math.PI * 2,
    fuel: DRONE_MAX_FUEL, maxFuel: DRONE_MAX_FUEL,
    attackPower: DRONE_BASE_ATTACK, defense: DRONE_BASE_DEFENSE,
    docked: false,
    script: loadStoredScript(),
    running: false,
    error: null,
    logs: [],
    gen: null,
    pending: null,
    lastPrintAt: -Infinity
  };
  built.pickMesh.userData.drone = drone;
  ctx.drone = drone;
  return drone;
}

function log(drone, msg){
  drone.logs.push(String(msg));
  if(drone.logs.length > 50) drone.logs.shift();
}

// print()'s in-world half: a gas+laser effect at the drone's current
// position/heading (see drone/dronePrintFx.js), plus relaying it to other
// players over Realtime broadcast so they see it too, not just the log
// entry above.
function triggerPrintFx(drone, msg){
  // A while(true){ print("x") } script with no wait() would otherwise
  // fire this as fast as the interpreter's own runaway-script step limit
  // allows (MAX_INSTANT_STEPS_PER_FRAME) — up to ~2000 broadcast messages
  // in a single frame. This cooldown lives outside the DSL sandbox in
  // plain JS the script can't touch, so no amount of script cleverness
  // gets around it — unlike the profanity check below, it doesn't need a
  // server-side backstop for *this* specific purpose, since broadcast
  // messages never touch the database at all (nothing there to rate-limit
  // against); a fully custom/modified client bypassing this file entirely
  // could still flood the channel directly, same residual risk broadcast
  // spam already has everywhere else (see net/shipsBroadcast.js).
  const now = performance.now();
  if(now - drone.lastPrintAt < DRONE_PRINT_COOLDOWN_S * 1000){
    log(drone, t("drone.printCooldown"));
    return;
  }

  const text = String(msg).slice(0, DRONE_PRINT_MAX_LEN);
  // A courtesy check, same spirit as confirmNick()'s own-nick check: the
  // real defense is handleRemoteDronePrint() re-checking on the receiving
  // end, since a modified client could broadcast anything regardless of
  // what this one blocks. This one exists so the player who typed it
  // knows *why* nothing showed up, instead of silently doing nothing.
  if(containsProfanity(text)){
    log(drone, t("drone.printBlocked"));
    return;
  }
  drone.lastPrintAt = now;
  spawnPrintEffect(drone.pos, drone.heading, text, drone.mesh.material.color.getHex());
  if(NET_ENABLED) broadcastDronePrint(drone.pos, drone.heading, text);
}

function nearestBody(drone){
  let best = null, bestDist = Infinity;
  for(let i=0; i<ctx.planets.length; i++){
    const p = ctx.planets[i];
    if(p.dying) continue;
    const d = drone.pos.distanceTo(p.mesh.position);
    if(d < bestDist){ bestDist = d; best = p; }
  }
  return { body: best, dist: bestDist };
}

function isDocked(drone){
  const { body, dist } = nearestBody(drone);
  return !!body && dist <= body.radius * DRONE_DOCK_RANGE_MULT;
}

function applyAttack(drone){
  const { body, dist } = nearestBody(drone);
  if(!body || dist > body.radius * DRONE_DOCK_RANGE_MULT) return 0;

  const healthBeforeDamage = body.health;
  const dmg = drone.attackPower;
  body.health -= dmg;
  body.pendingDamage = (body.pendingDamage || 0) + dmg;
  applyHealthVisual(body);
  if(body.orbitSlot != null){
    // Keep the health checkpoint in lockstep with every optimistic
    // decrement, same reasoning as ships/swarm.js#updateShips - otherwise
    // the next frame's regen recompute (world/bodies.js#updateBodies)
    // would overwrite this hit with a checkpoint that never moved.
    body.healthBase = body.health;
    body.healthUpdatedAtMs = Date.now();
  }

  const outward = drone.pos.clone().sub(body.mesh.position).normalize();
  const surfacePoint = body.mesh.position.clone().addScaledVector(outward, body.radius);
  spawnBiteParticles(surfacePoint, outward, body.mesh.material.color, 4);
  paintScorch(body, surfacePoint, 1);

  if(body.orbitSlot != null){
    // Fixed solar body: never destroyed/removed, health regenerates
    // instead - same edge-triggered kill detection (against a 10%-of-
    // maxHealth threshold, not a bare >0 check - see
    // ships/swarm.js#updateShips and supabase/schema.sql#bite_solar_body
    // for why a bare >0 check was a real, live-confirmed exploit) as
    // ships/swarm.js#updateShips, so a drone camping a barely-
    // regenerating body can't re-collect the kill reward every hit.
    if(healthBeforeDamage > body.maxHealth*0.1 && body.health <= 0){
      if(!NET_ENABLED){
        const gained = bodyValueEstimate(body);
        state.points += gained;
        state.eaten += 1;
        showToast(t("toast.eaten")(gained));
        triggerBreakup(body);
        refreshDock();
        save();
      }
      // else: net/solarBodiesSync.js#flushSolarDamage awards points once
      // the server's bite_solar_body RPC confirms killed:true.
      body.healthBase = 0;
      body.healthUpdatedAtMs = Date.now();
    }
  } else if(!NET_ENABLED && !body.dying && body.health <= 0){
    const gained = bodyValueEstimate(body);
    state.points += gained;
    state.eaten += 1;
    showToast(t("toast.eaten")(gained));
    triggerBreakup(body);
    destroyPlanet(body);
    refreshDock();
    save();
  }
  return 1;
}

// Resolves one builtin call. Returns { blocking: false, value } for an
// instant result, or { blocking: true, state } to start a multi-frame
// operation that updateDrone() will keep advancing via advanceBlocking().
function startBuiltin(drone, name, args){
  switch(name){
    case "__tick__": return { blocking: false, value: 0 }; // while-loop safety checkpoint, see interpreter.js
    case "fuel": return { blocking: false, value: drone.fuel };
    case "maxFuel": return { blocking: false, value: drone.maxFuel };
    case "nearPlanet": return { blocking: false, value: isDocked(drone) ? 1 : 0 };
    case "attack": return { blocking: false, value: applyAttack(drone) };
    case "print": log(drone, args[0]); triggerPrintFx(drone, args[0]); return { blocking: false, value: 0 };
    case "move": return { blocking: true, state: { name: "move", total: Math.max(0, args[0]||0), remaining: Math.max(0, args[0]||0) } };
    case "turn": return { blocking: true, state: { name: "turn", total: args[0]||0, remaining: args[0]||0 } };
    case "wait": return { blocking: true, state: { name: "wait", remaining: Math.max(0, args[0]||0) } };
    default:
      throw new Error("Unknown function '" + name + "()'");
  }
}

// Advances an in-progress blocking op by dt. Returns true once it's done
// (and the drone's transform/fuel have been updated for this frame).
function advanceBlocking(drone, pending, dt){
  if(pending.name === "wait"){
    pending.remaining -= dt;
    return pending.remaining <= 0;
  }
  if(pending.name === "turn"){
    const step = Math.sign(pending.total) * Math.min(Math.abs(pending.remaining), DRONE_TURN_SPEED*dt);
    drone.heading += step * Math.PI/180;
    pending.remaining -= step;
    return Math.abs(pending.remaining) < 0.001;
  }
  if(pending.name === "move"){
    const maxByFuel = drone.fuel / DRONE_FUEL_PER_MOVE_UNIT;
    const step = Math.min(pending.remaining, DRONE_MOVE_SPEED*dt, Math.max(0, maxByFuel));
    if(step > 0){
      const fwd = new THREE.Vector3(Math.sin(drone.heading), 0, Math.cos(drone.heading));
      drone.pos.addScaledVector(fwd, step);
      drone.fuel = Math.max(0, drone.fuel - step*DRONE_FUEL_PER_MOVE_UNIT);
      pending.remaining -= step;
    }
    return pending.remaining < 0.001 || drone.fuel <= 0;
  }
  return true;
}

export function setDroneScript(drone, src){
  drone.script = src;
  saveStoredScript(src);
}

export function stopDroneScript(drone){
  drone.running = false;
  drone.gen = null;
  drone.pending = null;
}

export function runDroneScript(drone){
  stopDroneScript(drone);
  drone.error = null;
  drone.logs = [];
  try{
    const ast = parseDroneScript(drone.script || "");
    drone.gen = runProgram(ast, { vars: {} });
    drone.running = true;
    driveGenerator(drone, undefined);
  }catch(e){
    drone.error = e.message;
    drone.running = false;
  }
}

// Resumes drone.gen with `input` (the value its last `yield` should
// evaluate to) and keeps resolving instant builtins synchronously until
// either the script finishes, it hits a blocking call (move/turn/wait —
// stored in drone.pending for updateDrone() to advance over time), or it
// errors. Shared by both the initial run and every resume after a
// blocking op completes, so there's exactly one place this loop lives.
function driveGenerator(drone, input){
  let steps = 0;
  try{
    while(true){
      const res = drone.gen.next(input);
      if(res.done){
        drone.running = false;
        drone.gen = null;
        return;
      }
      const call = res.value; // {name, args}
      const outcome = startBuiltin(drone, call.name, call.args);
      if(outcome.blocking){
        drone.pending = outcome.state;
        return; // updateDrone() advances this over subsequent frames
      }
      input = outcome.value;
      steps++;
      if(steps > MAX_INSTANT_STEPS_PER_FRAME){
        throw new Error("Script did not pause (missing wait()?) — stopped after " + MAX_INSTANT_STEPS_PER_FRAME + " steps.");
      }
    }
  }catch(e){
    drone.error = e.message;
    drone.running = false;
    drone.gen = null;
    drone.pending = null;
  }
}

export function updateDrone(dt){
  const drone = ctx.drone;
  if(!drone) return;

  drone.docked = isDocked(drone);
  if(drone.docked) drone.fuel = Math.min(drone.maxFuel, drone.fuel + DRONE_REFUEL_RATE*dt);

  if(drone.running){
    if(drone.pending){
      if(advanceBlocking(drone, drone.pending, dt)){
        drone.pending = null;
        driveGenerator(drone, undefined);
      }
    } else {
      driveGenerator(drone, undefined);
    }
  }

  drone.mesh.position.copy(drone.pos);
  drone.mesh.rotation.y = drone.heading;
}
