import { ctx } from "../core/context.js";
import { disposeMesh } from "../core/utils.js";
import { gfxUnitLights, gfxBiteFx } from "../scene/graphics.js";
import { makeShipVisual } from "./shipVisual.js";
import { getShipCamTarget } from "../scene/shipcam.js";
import { EAT_ORBIT_GAP, SHIP_MODEL_LENGTH, SHIP_LIGHT_INTENSITY, SHIP_LIGHT_RANGE } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { swarmStats } from "../core/gameState.js";
import { paintScorch, applyHealthVisual, isSpent } from "../world/bodies.js";
import { spawnBiteParticles, spawnSparks } from "../fx/particles.js";
import { showBeam, hideBolt, disposeBeam } from "./biteBeam.js";
import { showToast } from "../ui/hud/eventLog.js";
import { t } from "../i18n.js";
import { SHIP_API, updateProgrammedShip } from "./shipProgram.js";
import { stopUnitProgram } from "../program/runner.js";
import { awardKill } from "../world/rewards.js";

// Reused every frame across every ship in updateShips() instead of several
// fresh `new THREE.Vector3()`s per ship per frame (same pattern as
// world/blackholes.js's toHoleScratch) — every one of these is read and
// discarded within the same iteration (lerp()/lookAt()/copy()/clone() all
// read values immediately, none retain the vector object itself), so a
// single ship's leftover values from last iteration are always fully
// overwritten before the next ship reads them.
const toTargetScratch = new THREE.Vector3();
const lookTargetScratch = new THREE.Vector3();
const orbitScratch = new THREE.Vector3();
const orbitPosScratch = new THREE.Vector3();
const shakeScratch = new THREE.Vector3();
const outwardScratch = new THREE.Vector3();
const surfacePointScratch = new THREE.Vector3();

// New ships take their slots around the station on a golden-angle spiral
// (sunflower seeds): it doesn't need the final fleet size, so a ship bought
// later still gets a slot of its own. RETURN TO BASE flies back to the same
// slots.
const SHIP_SPAWN_GOLDEN_ANGLE = 2.399963229728653; // radians, ~137.5°
const SHIP_SPAWN_BASE_RADIUS = 3; // clears the station's own model (STATION_PICK_RADIUS 1.7 around its ring, the truss reaches 2.5)
const SHIP_SPAWN_RADIUS_STEP = 0.55; // keeps even a full ~23-ship fleet (TREE.fleet's max) well inside STATION_FIELD_RADIUS (8, config.js), so the whole formation starts inside the gravity-free field (world/solarGravity.js)

// Not a per-frame hot loop (only called at startup and when a Fleet
// upgrade adds a ship), so this returns a fresh Vector3 rather than
// reusing a module-level scratch one - the caller keeps this exact object
// as the new ship's own sh.pos for the rest of its life.
function shipSpawnPosition(index, out){
  if(!ctx.station){
    // Defensive fallback only - main.js spawns the station before any
    // fleet now, so this shouldn't be reachable in practice, but a ship
    // spawned with nothing to anchor to at least lands somewhere sane
    // instead of crashing on ctx.station.pos.
    return new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*4, (Math.random()-0.5)*4);
  }
  const angle = index * SHIP_SPAWN_GOLDEN_ANGLE;
  const r = SHIP_SPAWN_BASE_RADIUS + SHIP_SPAWN_RADIUS_STEP*Math.sqrt(index);
  return (out || new THREE.Vector3()).set(
    ctx.station.pos.x + r*Math.cos(angle),
    ctx.station.pos.y + Math.sin(index*0.9)*1.5,
    ctx.station.pos.z + r*Math.sin(angle)
  );
}

// The ship's look (ShipKit model up close, the light cone far away) is
// ships/shipVisual.js; this group adds the game's own light, selection
// ring and pick sphere around it.
function makeShipMesh(){
  const group = new THREE.Group();
  const visual = makeShipVisual();
  group.add(visual.root);
  const glow = new THREE.PointLight(0x4fe3c6, SHIP_LIGHT_INTENSITY, SHIP_LIGHT_RANGE);
  glow.position.z = -SHIP_MODEL_LENGTH * 0.7;   // behind the engines (+Z is forward), so it lights the hull
  glow.userData.unitLight = true;     // Setup -> Graphics -> ship glow lights (off by default)
  glow.visible = gfxUnitLights();
  group.add(glow);

  // selection ring (visible only when the ship is selected)
  const ringGeo = new THREE.RingGeometry(0.26, 0.31, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  group.add(ring);

  // invisible sphere for raycasting - makes it easier to click a small unit
  const pickGeo = new THREE.SphereGeometry(0.4, 8, 8);   // a bit bigger than the ship: easier to click
  const pickMat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0 });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  group.add(pickMesh);

  return { group: group, ring: ring, pickMesh: pickMesh, visual: visual, light: glow };
}

// RETURN TO BASE (the viewport's top-left button, ui/hud/returnBase.js):
// each ship flies back to its own slot of the spawn formation around the
// station (shipSpawnPosition, the same slot it started in) and stops there.
// Like a course order it takes a ship back from its program, and it's
// gravity-immune on the way (world/solarGravity.js); a new course order
// replaces it.
export function returnToBase(list){
  list.forEach(function(sh){
    if(sh.running) stopUnitProgram(sh);
    sh.commandedTarget = null;
    sh.target = null;
    sh.returning = true;
  });
  showToast(list.length === ctx.ships.length ? t("toast.returnAll") : t("toast.returnSome")(list.length));
}
const homeScratch = new THREE.Vector3();
const RETURN_ARRIVE = 0.12;

// One ship on its way home; false once it has arrived (and stopped).
function flyHome(sh, index, speed, dt){
  shipSpawnPosition(index, homeScratch);
  const to = toTargetScratch.subVectors(homeScratch, sh.pos);
  const dist = to.length();
  if(dist < RETURN_ARRIVE){
    sh.returning = false;
    sh.vel.set(0, 0, 0);
    return false;
  }
  // full cruise speed far out, easing in over the last few units
  to.multiplyScalar(Math.min(speed, dist * 1.5) / dist);
  sh.vel.lerp(to, 0.1);
  sh.pos.addScaledVector(sh.vel, dt);
  sh.mesh.position.copy(sh.pos);
  if(sh.vel.lengthSq() > 1e-6) sh.mesh.lookAt(lookTargetScratch.addVectors(sh.pos, sh.vel));
  sh.visual.power = Math.min(1, sh.vel.length() / Math.max(0.01, speed));
  return true;
}

export function setShipSelected(sh, val){
  sh.selected = val;
  sh.selectionRing.visible = val;
}

export function spawnShip(){
  const built = makeShipMesh();
  const startPos = shipSpawnPosition(ctx.ships.length);
  built.group.position.copy(startPos);
  ctx.scene.add(built.group);
  const ship = {
    mesh: built.group,
    visual: built.visual,
    light: built.light,
    selectionRing: built.ring,
    pickMesh: built.pickMesh,
    pos: startPos,
    vel: new THREE.Vector3(),
    target: null,
    commandedTarget: null,
    selected: false,
    eatPulse: 0,
    particleTimer: 0,
    boltCore: null,
    boltGlow: null,
    boltPulse: 0,
    boltJitterOffsets: null,
    boltJitterTimer: 0,
    // its program (ships/shipProgram.js, run by program/runner.js)
    api: SHIP_API,
    heading: 0,
    running: false,
    error: null,
    logs: [],
    gen: null,
    pending: null,
    lastPrintAt: -Infinity,
    attackReadyIn: 0
  };
  built.pickMesh.userData.ship = ship;
  ctx.ships.push(ship);
}

export function eatEfficiency(stats, planet){
  if(planet.temp > 0.15){
    const need = planet.temp;
    return Math.min(1, 0.25 + stats.heat) >= need ? 1 : Math.max(0.15, 0.25+stats.heat);
  }
  if(planet.temp < -0.15){
    const needC = -planet.temp;
    return Math.min(1, 0.25 + stats.cold) >= needC ? 1 : Math.max(0.15, 0.25+stats.cold);
  }
  return 1;
}

// Every ship, every frame: a program flies it, or it follows its order
// (a body to eat, RETURN TO BASE), or it idles. An ordered ship is immune to
// gravity: steering against it, a ship sent 345 units never arrived (tried
// and measured, docs/architecture.md, "Ship movement") — "click a target,
// they get there" matters more. Idle ships and the drone feel gravity.
export function updateShips(dt){
  const stats = swarmStats();
  const baseSpeed = 6.5 * stats.speed;
  const basePower = 5.5 * stats.power;

  const camTarget = getShipCamTarget();
  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];
    // the model: full detail whenever it's looked at up close (miniature, ship cam)
    sh.visual.forceDetail = sh.selected || camTarget === sh;
    // the glow light follows the engines (power is last frame's, eased by shipVisual.js)
    sh.light.intensity = SHIP_LIGHT_INTENSITY * (0.55 + 0.45 * sh.visual.throttle);

    // A ship running its program is flown by it (ships/shipProgram.js).
    if(sh.running){ updateProgrammedShip(sh, dt); continue; }

    // Ships only ever move on an explicit player order (commandTo() in
    // scene/controls.js) — no automatic nearest-planet targeting.
    if(sh.commandedTarget && (sh.commandedTarget.dying || ctx.planets.indexOf(sh.commandedTarget)===-1)){
      sh.commandedTarget = null;
    }
    if(sh.commandedTarget) sh.returning = false;   // a course order replaces RETURN TO BASE
    if(sh.returning){
      hideBolt(sh);
      if(flyHome(sh, i, baseSpeed * 0.15, dt)) continue;
    }
    sh.target = sh.commandedTarget;
    if(!sh.target){
      // Ambient solar gravity (world/solarGravity.js, called earlier in
      // main.js's tick()) mutates sh.vel every frame regardless of whether
      // this ship has a target - an idle ship still needs to integrate that
      // into position, or gravity silently has zero visible effect on it.
      hideBolt(sh);
      sh.pos.addScaledVector(sh.vel, dt);
      sh.mesh.position.copy(sh.pos);
      sh.visual.power = 0.1;                       // idling
      continue;
    }

    const toTarget = toTargetScratch.subVectors(sh.target.mesh.position, sh.pos);
    const dist = toTarget.length();
    const eatRange = sh.target.radius + EAT_ORBIT_GAP;   // just above the surface, whatever the body's size

    if(dist > eatRange){
      hideBolt(sh);
      // Deliberately gravity-immune - see updateShips()'s own header
      // comment above for why.
      toTarget.normalize();
      sh.vel.lerp(toTarget.multiplyScalar(baseSpeed*0.15), 0.08);
      sh.pos.addScaledVector(sh.vel, dt);
      sh.mesh.position.copy(sh.pos);
      // orient towards the direction of travel
      const lookTarget = lookTargetScratch.addVectors(sh.pos, sh.vel);
      sh.mesh.lookAt(lookTarget);
      sh.visual.power = 1;                         // cruising
    } else {
      // orbit gently around the planet while eating
      sh.eatPulse += dt*4;
      const orbit = orbitScratch.set(Math.cos(sh.eatPulse), Math.sin(sh.eatPulse*0.7)*0.4, Math.sin(sh.eatPulse)).multiplyScalar(eatRange*0.9);
      const orbitPos = orbitPosScratch.addVectors(sh.target.mesh.position, orbit);
      sh.pos.lerp(orbitPos, 0.12);
      sh.mesh.position.copy(sh.pos);
      sh.mesh.lookAt(sh.target.mesh.position);
      sh.visual.power = 0.35;                      // orbiting while it eats

      const wasSpent = isSpent(sh.target);   // eaten and not grown back: no second kill (world/bodies.js)
      const eff = eatEfficiency(stats, sh.target);
      const dmg = basePower*eff*dt;
      sh.target.health -= dmg;
      sh.target.pendingDamage = (sh.target.pendingDamage||0) + dmg;
      if(sh.target.orbitSlot != null){
        // Keep the health checkpoint (world/bodies.js#updateBodies' regen
        // source of truth) in lockstep with every optimistic decrement, not
        // just the final kill one - otherwise the very next frame's regen
        // recompute (which runs before this file, see main.js's tick())
        // would overwrite this frame's damage with a checkpoint that never
        // moved, making the crack overlay flicker up and down instead of
        // smoothly increasing while a ship is actively biting.
        sh.target.healthBase = sh.target.health;
        sh.target.healthUpdatedAtMs = Date.now();
      }

      // the planet does NOT shrink - it cracks: the crack overlay reveals
      // itself with damage, and at low "health" gets a light tension shake
      // before breaking apart
      const healthFrac = Math.max(0, sh.target.health/sh.target.maxHealth);
      const damage = 1-healthFrac;
      applyHealthVisual(sh.target);
      if(healthFrac < 0.3){
        const shakeAmt = ((0.3-healthFrac)/0.3) * sh.target.radius*0.014;
        sh.target.shakePhase += dt*32;
        const shk = shakeScratch.set(
          Math.sin(sh.target.shakePhase*1.3),
          Math.sin(sh.target.shakePhase*1.7),
          Math.sin(sh.target.shakePhase*0.9)
        ).multiplyScalar(shakeAmt);
        sh.target.mesh.position.copy(sh.target.basePos).add(shk);
      }

      // debris/particles + lightning-beam + scorch marks on the surface
      const outward = outwardScratch.subVectors(sh.pos, sh.target.mesh.position).normalize();
      const surfacePoint = surfacePointScratch.copy(outward).multiplyScalar(sh.target.radius).add(sh.target.mesh.position);

      showBeam(sh, surfacePoint, dt);   // the beam and its hot spot (ships/biteBeam.js)

      sh.particleTimer -= dt;
      if(sh.particleTimer <= 0){
        sh.particleTimer = 0.035;
        spawnBiteParticles(surfacePoint, outward, sh.target.mesh.material.color, 4);
        if(gfxBiteFx()) spawnSparks(surfacePoint, outward, 3);
        paintScorch(sh.target, surfacePoint, 1+damage*2);
      }

      if(sh.target.orbitSlot != null){
        // Fixed solar body: never removed, it grows back
        // (world/bodies.js#updateBodies) — a kill only if it wasn't still
        // spent from the last one (world/bodies.js#isSpent).
        if(!wasSpent && sh.target.health <= 0){
          const deadBody = sh.target;
          // every ship eating it is done, not just the one that landed the last bite
          ctx.ships.forEach(function(o){
            if(o.target !== deadBody && o.commandedTarget !== deadBody) return;
            hideBolt(o);
            o.target = null;
            o.commandedTarget = null;
          });
          if(NET_ENABLED){
            // Points are awarded later, by net/solarBodiesSync.js's
            // flushSolarDamage() once the server's bite_solar_body RPC
            // confirms killed:true - same deferred-to-server-confirmation
            // pattern comets/old planets already used in networked mode
            // (see the else-if branch below).
          } else {
            // No server to confirm a kill offline - resolve immediately,
            // same spirit as the offline comet/old-planet branch below,
            // just never calling destroyPlanet (this body isn't going
            // anywhere).
            awardKill(deadBody, { breakup: true });
          }
          // Reset the health checkpoint to exactly 0 right now, in both
          // modes - otherwise the very next updateBodies() regen recompute
          // would use a stale (pre-kill) checkpoint and instantly show a
          // big chunk of health back, undoing the kill's visual/gameplay
          // weight until the server's own row syncs back.
          deadBody.healthBase = 0;
          deadBody.healthUpdatedAtMs = Date.now();
        }
      } else if(sh.target.health <= 0){
        if(!NET_ENABLED && !sh.target.dying){
          // offline mode: no server to arbitrate "who landed the last hit",
          // so the kill is resolved immediately, locally, as before
          awardKill(sh.target, { breakup: true, remove: true });
        } else {
          // networked mode: the server (bite_body RPC) decides who gets the
          // points; the explosion and cleanup arrive via Realtime DELETE for everyone
          hideBolt(sh);
          sh.target = null;
          // The order too: until the server's DELETE arrives the comet is
          // still in ctx.planets, and the ship would go on biting it.
          sh.commandedTarget = null;
        }
      }
    }
  }
}

export function disposeShip(sh){
  setShipSelected(sh, false);
  sh.visual.dispose();
  disposeMesh(ctx.scene, sh.mesh);
  disposeBeam(sh);
}

export function reconcileFleetSize(){
  const stats = swarmStats();
  const wanted = Math.round(stats.fleetTarget);
  while(ctx.ships.length < wanted) spawnShip();
  while(ctx.ships.length > wanted){
    const sh = ctx.ships.pop();
    disposeShip(sh);
  }
}

export function spawnInitialFleet(){
  const initialFleet = Math.max(3, Math.round(swarmStats().fleetTarget));
  for(let s=0;s<initialFleet;s++) spawnShip();
}

// A ship swallowed by a black hole: its model blows apart (the shared
// ShipKit destroy effect) and the wreck is cleaned up a few seconds later
// by ships/shipVisual.js. Far away (no model built) it just goes, as before.
export function destroyShip(sh){
  setShipSelected(sh, false);
  disposeBeam(sh);
  sh.mesh.remove(sh.pickMesh); sh.mesh.remove(sh.selectionRing); sh.mesh.remove(sh.light);
  if(!sh.visual.explode(sh.mesh)){ sh.visual.dispose(); disposeMesh(ctx.scene, sh.mesh); }
}
