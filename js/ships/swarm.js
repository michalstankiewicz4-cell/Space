import { ctx } from "../core/context.js";
import { disposeMesh } from "../core/utils.js";
import { ORBIT_RADIUS } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { state, swarmStats, save } from "../core/gameState.js";
import { paintScorch, destroyPlanet } from "../world/bodies.js";
import { bodyValueEstimate } from "../world/bodyParams.js";
import { spawnBiteParticles } from "../fx/particles.js";
import { triggerBreakup } from "../fx/breakup.js";
import { showToast } from "../ui/hud/eventLog.js";
import { refreshResearch } from "../ui/windows/research.js";
import { t } from "../i18n.js";

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

// New ships spawn arranged around the player's own station, not scattered
// near the origin (the old spawn cube predates the fixed 9-orbit solar
// system, when the origin was just empty space - it's the Sun's own
// position now, so that old +-2 cube would spawn ships almost inside the
// Sun's own radius, 4.2). A golden-angle spiral (the same even-spacing
// trick sunflower seed heads/phyllotaxis use) rather than a fixed ring: it
// doesn't need to know the eventual fleet size up front, so
// reconcileFleetSize() can call spawnShip() one at a time (buying a Fleet
// upgrade) and each new ship still lands in its own non-overlapping slot,
// same as the initial fleet spawning all at once.
const SHIP_SPAWN_GOLDEN_ANGLE = 2.399963229728653; // radians, ~137.5°
const SHIP_SPAWN_BASE_RADIUS = 5; // clears the station's own physical model (silhouette radius ~4.3)
const SHIP_SPAWN_RADIUS_STEP = 0.9; // keeps even a full ~23-ship fleet (TREE.fleet's max) well inside STATION_FIELD_RADIUS (11, config.js), so the whole formation starts inside the gravity-free field (world/solarGravity.js)

// Not a per-frame hot loop (only called at startup and when a Fleet
// upgrade adds a ship), so this returns a fresh Vector3 rather than
// reusing a module-level scratch one - the caller keeps this exact object
// as the new ship's own sh.pos for the rest of its life.
function shipSpawnPosition(index){
  if(!ctx.station){
    // Defensive fallback only - main.js spawns the station before any
    // fleet now, so this shouldn't be reachable in practice, but a ship
    // spawned with nothing to anchor to at least lands somewhere sane
    // instead of crashing on ctx.station.pos.
    return new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*4, (Math.random()-0.5)*4);
  }
  const angle = index * SHIP_SPAWN_GOLDEN_ANGLE;
  const r = SHIP_SPAWN_BASE_RADIUS + SHIP_SPAWN_RADIUS_STEP*Math.sqrt(index);
  return new THREE.Vector3(
    ctx.station.pos.x + r*Math.cos(angle),
    ctx.station.pos.y + Math.sin(index*0.9)*1.5,
    ctx.station.pos.z + r*Math.sin(angle)
  );
}

function makeShipMesh(){
  const group = new THREE.Group();
  const body = new THREE.ConeGeometry(0.28, 0.9, 8);
  const mat = new THREE.MeshStandardMaterial({ color:0x4fe3c6, emissive:0x1fae95, emissiveIntensity:0.9, roughness:0.35, metalness:0.4 });
  const mesh = new THREE.Mesh(body, mat);
  mesh.rotation.x = Math.PI/2;
  group.add(mesh);
  const glow = new THREE.PointLight(0x4fe3c6, 0.5, 6);
  group.add(glow);

  // selection ring (visible only when the ship is selected)
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  group.add(ring);

  // invisible sphere for raycasting - makes it easier to click a small unit
  const pickGeo = new THREE.SphereGeometry(0.55, 8, 8);
  const pickMat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0 });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);
  group.add(pickMesh);

  return { group: group, ring: ring, pickMesh: pickMesh };
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
    boltJitterTimer: 0
  };
  built.pickMesh.userData.ship = ship;
  ctx.ships.push(ship);
}

function eatEfficiency(stats, planet){
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

function buildZigzagPoints(start, end, segments, offsets){
  const points = [start.clone()];
  for(let i=1;i<segments;i++){
    const base = new THREE.Vector3().lerpVectors(start, end, i/segments);
    base.add(offsets[i-1]);
    points.push(base);
  }
  points.push(end.clone());
  return points;
}

function generateJitterOffsets(jitterScale, segments){
  const offs = [];
  for(let i=1;i<segments;i++){
    const t = i/segments;
    offs.push(new THREE.Vector3((Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)).multiplyScalar(jitterScale*(1-t*0.4)));
  }
  return offs;
}

function makeBoltMesh(color, opacity){
  const mat = new THREE.MeshBasicMaterial({
    color: color, transparent:true, opacity:opacity,
    blending: THREE.AdditiveBlending, depthWrite:false, depthTest:false
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.renderOrder = 998;
  ctx.scene.add(mesh);
  return mesh;
}

// rebuilds the beam geometry EVERY FRAME, using the ship's current position
// and the current contact point - this way the beam smoothly "stretches"
// as the ship orbits, instead of "jumping" every few frames
function regenBolt(sh, surfacePoint){
  if(!sh.boltCore){
    sh.boltCore = makeBoltMesh(0xeafbff, 0.95);
    sh.boltGlow = makeBoltMesh(0x4fe3c6, 0.4);
  }
  if(!sh.boltJitterOffsets){
    sh.boltJitterOffsets = generateJitterOffsets(sh.target.radius*0.35+0.15, 6);
  }
  const pts = buildZigzagPoints(sh.pos, surfacePoint, 6, sh.boltJitterOffsets);
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubularSeg = pts.length*3;

  const oldCore = sh.boltCore.geometry;
  sh.boltCore.geometry = new THREE.TubeGeometry(curve, tubularSeg, 0.045, 5, false);
  oldCore.dispose();

  const oldGlow = sh.boltGlow.geometry;
  sh.boltGlow.geometry = new THREE.TubeGeometry(curve, tubularSeg, 0.13, 6, false);
  oldGlow.dispose();

  sh.boltCore.visible = true;
  sh.boltGlow.visible = true;
}

function pulseBolt(sh, dt){
  if(!sh.boltCore) return;
  sh.boltPulse += dt*22;
  const op = 0.6 + 0.4*Math.abs(Math.sin(sh.boltPulse));
  sh.boltCore.material.opacity = op;
  sh.boltGlow.material.opacity = op*0.4;
}

export function hideBolt(sh){
  if(sh.boltCore){ sh.boltCore.visible = false; sh.boltGlow.visible = false; }
  sh.boltJitterOffsets = null;
  sh.boltJitterTimer = 0;
}

// A commanded ship's cruise-flight velocity is deliberately immune to
// ambient gravity (world/solarGravity.js), even though gravity itself is
// real and correctly strong (v2.0.9). Tried making it genuinely felt via
// bounded "seek" steering instead of the instant every-frame re-home
// below (letting gravity's own additive contribution persist rather than
// being overridden each frame) - reverted after live testing found it
// genuinely unstable, not just weak/strong-tuned wrong: a ship commanded
// 345 units to a real planet target got hijacked passing near an
// unrelated body's own small-SOI gravity and never arrived at all across
// 1000 simulated seconds, even with the ship's own "engine" strengthened
// 20x to try to compensate. Capping the raw acceleration itself
// (world/solarGravity.js's own MAX_GRAVITY_ACCEL, added at the same time
// - a real, separate numerical-stability bug this uncovered, kept
// regardless of this decision since it also protects the drone/idle
// ships) tamed the worst blow-up (peak speed dropped from ~424 to ~11
// units/s) but the ship still never arrived in the same 1000-second
// window - gravity alone, even bounded, is still strong enough over a
// multi-hundred-unit commanded flight to prevent reliable net progress
// with only an 8%/frame course-correction to fight it. Predictable
// point-to-point travel ("select ships, click a target, they get there")
// is a real, load-bearing property of this game, not an incidental side
// effect of how this was written - gravity still visibly matters for
// anything genuinely idle and for the drone (both go through
// world/solarGravity.js directly), just not for a ship actively
// following an order.
export function updateShips(dt){
  const stats = swarmStats();
  const baseSpeed = 6.5 * stats.speed;
  const basePower = 5.5 * stats.power;

  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];

    // Ships only ever move on an explicit player order (commandTo() in
    // scene/controls.js) — no automatic nearest-planet targeting.
    if(sh.commandedTarget && (sh.commandedTarget.dying || ctx.planets.indexOf(sh.commandedTarget)===-1)){
      sh.commandedTarget = null;
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
      continue;
    }

    const toTarget = toTargetScratch.subVectors(sh.target.mesh.position, sh.pos);
    const dist = toTarget.length();
    const eatRange = ORBIT_RADIUS;

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
    } else {
      // orbit gently around the planet while eating
      sh.eatPulse += dt*4;
      const orbit = orbitScratch.set(Math.cos(sh.eatPulse), Math.sin(sh.eatPulse*0.7)*0.4, Math.sin(sh.eatPulse)).multiplyScalar(eatRange*0.9);
      const orbitPos = orbitPosScratch.addVectors(sh.target.mesh.position, orbit);
      sh.pos.lerp(orbitPos, 0.12);
      sh.mesh.position.copy(sh.pos);
      sh.mesh.lookAt(sh.target.mesh.position);

      const healthBeforeDamage = sh.target.health;
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

      pulseBolt(sh, dt);

      // the planet does NOT shrink - it cracks: the crack overlay reveals
      // itself with damage, and at low "health" gets a light tension shake
      // before breaking apart
      const healthFrac = Math.max(0, sh.target.health/sh.target.maxHealth);
      const damage = 1-healthFrac;
      sh.target.crackMesh.material.opacity = Math.min(1, damage*1.2);
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

      // the zigzag shape refreshes at a lower rate (a "crackle" effect), but
      // the beam geometry is rebuilt EVERY FRAME from the ship's current
      // position - this way the beam smoothly trails the ship as it orbits
      // the planet after making contact
      sh.boltJitterTimer -= dt;
      if(sh.boltJitterTimer <= 0 || !sh.boltJitterOffsets){
        sh.boltJitterTimer = 0.09;
        sh.boltJitterOffsets = generateJitterOffsets(sh.target.radius*0.35+0.15, 6);
      }
      regenBolt(sh, surfacePoint);

      sh.particleTimer -= dt;
      if(sh.particleTimer <= 0){
        sh.particleTimer = 0.035;
        spawnBiteParticles(surfacePoint, outward, sh.target.mesh.material.color, 4);
        paintScorch(sh.target, surfacePoint, 1+damage*2);
      }

      if(sh.target.orbitSlot != null){
        // Fixed solar body: never destroyed/removed - health regenerates
        // over time instead (world/bodies.js#updateBodies). Edge-triggered
        // against a 10%-of-maxHealth threshold, exactly like the server's
        // own bite_solar_body RPC (supabase/schema.sql) - NOT a bare `> 0`
        // check. Found live (against the server RPC, same bug would apply
        // here): per-frame regen ticks health up by a tiny sliver almost
        // immediately after hitting 0, so a bare `>0` check would silently
        // re-award the kill on nearly every subsequent frame a ship sits
        // there, instead of once per real kill.
        if(healthBeforeDamage > sh.target.maxHealth*0.1 && sh.target.health <= 0){
          const deadBody = sh.target;
          hideBolt(sh);
          sh.target = null;
          sh.commandedTarget = null;
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
            const gained = bodyValueEstimate(deadBody);
            state.points += gained;
            state.eaten += 1;
            showToast(t("toast.eaten")(gained), "arrive");
            triggerBreakup(deadBody);
            refreshResearch();
            save();
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
          const gained = bodyValueEstimate(sh.target);
          state.points += gained;
          state.eaten += 1;
          showToast(t("toast.eaten")(gained), "arrive");
          const deadPlanet = sh.target;
          triggerBreakup(deadPlanet);
          destroyPlanet(deadPlanet);
          refreshResearch();
          save();
        } else {
          // networked mode: the server (bite_body RPC) decides who gets the
          // points; the explosion and cleanup arrive via Realtime DELETE for everyone
          hideBolt(sh);
          sh.target = null;
          // Also clear commandedTarget, not just target - the top-of-loop
          // guard above only re-clears commandedTarget once the planet is
          // flagged .dying or actually removed from ctx.planets, neither of
          // which happens until the real server DELETE round-trips back.
          // Without this, the very next frame re-assigns sh.target from the
          // still-set commandedTarget (same planet, not yet gone locally),
          // and since the ship never moved, it re-enters the eat branch and
          // keeps damaging/spawning particles on an already-dead body for
          // the whole DELETE round-trip window.
          sh.commandedTarget = null;
        }
      }
    }
  }
}

export function disposeShip(sh){
  setShipSelected(sh, false);
  disposeMesh(ctx.scene, sh.mesh);
  hideBolt(sh);
  if(sh.boltCore){ ctx.scene.remove(sh.boltCore); sh.boltCore.geometry.dispose(); sh.boltCore.material.dispose(); }
  if(sh.boltGlow){ ctx.scene.remove(sh.boltGlow); sh.boltGlow.geometry.dispose(); sh.boltGlow.material.dispose(); }
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
