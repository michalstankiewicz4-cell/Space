import { ctx } from "../core/context.js";
import { removeItem, sRGBTexture } from "../core/utils.js";
import { SOLAR_REGEN_RATE } from "../config.js";
import { CONTENT } from "../content.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { hideBolt } from "../ships/biteBeam.js";
import { bodyParams, tempColor, randomPlanetSpawnData, contentKindFor } from "./bodyParams.js";
import { SOLAR_BODIES, SOLAR_BODY_BY_SLOT, bodyPosAt, nowSimTime } from "./solarSystem.js";
import { materializeBlackHole } from "./blackholes.js";
import { makeBodyLook, bodyLookRef, cometActivity } from "./bodyVisual.js";
import { stepComet, advanceComet, COMET_EXIT_RADIUS, computeCometTrajectory } from "./cometPhysics.js";
import { buildCometTrajectoryLine } from "../scene/orbitLines.js";

// Body lifecycle: a body row turned into a scene object, spawning and
// despawning (local and networked), the per-frame update. The kind math is
// ./bodyParams.js, the look ./bodyVisual.js (BodyKit). Two kinds pass through:
// - fixed solar bodies (row.orbit_slot set): shape from world/solarSystem.js,
//   only health from the server; position from wall-clock time; they grow
//   back and are never removed;
// - comets: everything from the row, simulated flight, spawned and despawned.
// The black hole isn't one of them (world/blackholes.js, not in ctx.planets).

// Damage shows as glowing cracks in the body's own BodyKit shader.
export function applyHealthVisual(obj){
  if(!obj.maxHealth) return;
  obj.look.setDamage(1 - Math.max(0, obj.health/obj.maxHealth));
}

// A body row (local or networked) -> its entry in ctx.planets. `elapsedSec`
// brings a comet up to now (a late joiner). The look is BodyKit's
// (world/bodyVisual.js); `mesh` is only an invisible sphere for picking and
// position, carrying the body's colour (bite particles, debris).
export function materializePlanet(row, pos, vel, elapsedSec){
  const orbitSlot = row.orbit_slot != null ? row.orbit_slot : null;
  // radius = drawn size; size = gameplay size (gravity, value, health —
  // see world/solarSystem.js#BODY_VISUAL_SCALE; a comet's are the same)
  let kind, radius, size, temp;
  if(orbitSlot != null){
    const solar = SOLAR_BODY_BY_SLOT[orbitSlot];
    kind = contentKindFor(solar.kind);
    radius = solar.radius;
    size = solar.size;
    temp = solar.temp;
  } else {
    kind = row.kind;
    radius = size = row.radius;
    temp = row.temp;
  }
  const params = bodyParams(kind, temp);
  const color = kind==="sun" ? new THREE.Color().setHSL(0.09,0.9,0.6)
    : kind==="comet" ? new THREE.Color(0xffffff)
    : tempColor(temp);
  const look = makeBodyLook(bodyLookRef(orbitSlot, kind), radius);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color: color, visible: false })
  );
  mesh.position.copy(pos);
  ctx.scene.add(mesh);
  mesh.add(look.root);

  // scorch-mark overlay - starts completely clean, burned in by ships'
  // beams; attached to the body's surface so it turns with it (unit radius)
  const scorchCanvas = document.createElement("canvas");
  scorchCanvas.width = 256; scorchCanvas.height = 256;
  const scorchCtx = scorchCanvas.getContext("2d");
  scorchCtx.clearRect(0,0,256,256);
  const scorchTexture = sRGBTexture(new THREE.CanvasTexture(scorchCanvas));
  const scorchMat = new THREE.MeshBasicMaterial({
    map: scorchTexture, transparent:true, opacity:0.95,
    depthWrite:false, blending: THREE.AdditiveBlending
  });
  const scorchMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 22, 16), scorchMat);
  scorchMesh.renderOrder = 1; // over a planet's clouds
  look.attach(scorchMesh);

  // the Sun lights the game's own (standard-material) objects: ships,
  // the station; BodyKit bodies light themselves from its position
  if(kind === "sun") mesh.add(new THREE.PointLight(0xffcf8a, 1.6, size*40));

  // The comet's own "orbit" line (see scene/orbitLines.js) - a separate,
  // top-level scene object (not a mesh child), since it shows the WHOLE
  // static flight path in world space while the comet itself moves along
  // it - added to the scene when the comet appears, removed again when it
  // despawns (despawnLocalOnly/destroyPlanet below).
  let trajectoryLine = null;


  const basePos = pos.clone();
  // `vel` is the comet's velocity at spawn; its current one comes from
  // replaying the flight up to now (world/cometPhysics.js#advanceComet).
  let cometVel = null;
  if(kind === "comet" && vel){
    cometVel = vel.clone();
    advanceComet(basePos, cometVel, elapsedSec||0);
    mesh.position.copy(basePos);
    // the dust tail bends back along the motion (BodyKit's comet)
    look.opts.velocity = cometVel;
    // From the ORIGINAL entry pos/vel (not basePos/cometVel, which the
    // advanceComet() call above already fast-forwarded to "now") - the
    // line should trace the whole path from where the comet entered, not
    // just what's left of it for a late-joining client.
    trajectoryLine = buildCometTrajectoryLine(computeCometTrajectory(pos, vel));
    ctx.scene.add(trajectoryLine);
  }

  // Fixed bodies' health checkpoint: (healthBase, healthUpdatedAtMs) is the
  // last known value and when; `health` is recomputed from it every frame
  // (updateBodies) as checkpoint + regen × elapsed — never ticked in place.
  // Local damage must move the checkpoint too (ships/swarm.js), or the next
  // frame's recompute undoes the hit.
  let healthBase = null, healthUpdatedAtMs = null, health, maxHealth;
  if(orbitSlot != null){
    healthBase = row.health;
    healthUpdatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();
    maxHealth = row.max_health;
    health = Math.min(maxHealth, healthBase + SOLAR_REGEN_RATE*(Date.now()-healthUpdatedAtMs)/1000);
  } else {
    health = row.health!=null ? row.health : radius*params.healthMult;
    maxHealth = row.max_health!=null ? row.max_health : radius*params.healthMult;
  }

  const p = {
    dbId: orbitSlot != null ? null : row.id,
    orbitSlot: orbitSlot,
    kind: kind,
    mesh: mesh, radius: radius, size: size, temp: temp,
    health: health,
    maxHealth: maxHealth,
    healthBase: healthBase,
    healthUpdatedAtMs: healthUpdatedAtMs,
    valueBonus: orbitSlot != null ? (params.valueBonus||0) : (row.value_bonus||0),
    pendingDamage: 0,
    // rad/s, for the info panel only: the body spins itself, at its lab rate
    spin: look.spinRate(),
    selected: false,
    dying: false,
    look: look,
    scorchMesh: scorchMesh,
    scorchCanvas: scorchCanvas,
    scorchCtx: scorchCtx,
    scorchTexture: scorchTexture,
    basePos: basePos,
    shakePhase: Math.random()*10,
    moving: kind==="comet",
    trajectoryLine: trajectoryLine,
    // The CURRENT (gravity-advanced) velocity, not the original spawn
    // value - see the comment above where cometVel is computed. Comets
    // are the only body whose velocity keeps changing every frame
    // (updateBodies() steps it forward under the Sun's pull, unlike every
    // fixed solar body's closed-form orbit or a ship's own steering).
    vel: kind==="comet" ? cometVel : vel
  };
  ctx.planets.push(p);
  applyHealthVisual(p);
  if(NET_ENABLED){
    if(orbitSlot != null) ctx.netSolarBodies[orbitSlot] = p;
    else ctx.netBodies[row.id] = p;
  }
  return p;
}

// Comets are the only body kind still spawned/despawned from a pool (see
// this file's header comment) — these two functions used to be generic
// over any forcedType, but every real caller now always means "a comet".

// Offline mode (multiplayer not configured): creates the body immediately, no networking.
export function spawnCometLocalOnly(){
  const data = randomPlanetSpawnData(CONTENT.comet);
  materializePlanet({
    id: "local-"+Math.random().toString(36).slice(2),
    kind: data.kind, radius: data.radius, temp: data.temp,
    health: data.health, max_health: data.maxHealth, value_bonus: data.valueBonus
  }, data.pos, data.vel, 0);
}

// Networked mode: only the steward sends the INSERT; the mesh is created for
// everyone (including the steward) once the Realtime echo arrives — a single
// code path. `pendingSpawnCount` counts inserts "in flight" (sent, not yet
// materialized), so the top-up logic (net/bodiesSync.js#maintainComet)
// doesn't treat the system as empty and start a second cooldown/spawn while
// this one is still on the way.
export let pendingSpawnCount = 0;
export function requestSpawnComet(){
  const data = randomPlanetSpawnData(CONTENT.comet);
  pendingSpawnCount++;
  supabase.from("bodies").insert({
    kind: data.kind, radius: data.radius, temp: data.temp,
    health: data.health, max_health: data.maxHealth, value_bonus: data.valueBonus,
    pos_x: data.pos.x, pos_y: data.pos.y, pos_z: data.pos.z,
    vel_x: data.vel ? data.vel.x : null,
    vel_y: data.vel ? data.vel.y : null,
    vel_z: data.vel ? data.vel.z : null
  }).then(function(res){
    pendingSpawnCount--;
    if(res.error) console.warn("requestSpawnComet failed", res.error);
  }).catch(function(err){
    // A rejected promise (not just a resolved {error}) skips .then()
    // entirely - same class of failure as the bite_body 522 documented in
    // net/bodiesSync.js#flushDamage. Without this, pendingSpawnCount never
    // decrements on a rejection, and maintainComet() permanently believes a
    // spawn is still in flight - the system stays stuck "topping up" and
    // never starts a fresh cooldown, for the rest of the session.
    pendingSpawnCount--;
    console.warn("requestSpawnComet rejected", err);
  });
}

export function paintScorch(planet, worldPoint, intensity){
  const local = planet.scorchMesh.worldToLocal(worldPoint.clone());
  local.normalize();
  const u = 0.5 + Math.atan2(local.z, local.x)/(2*Math.PI);
  const v = 0.5 - Math.asin(Math.max(-1,Math.min(1,local.y)))/Math.PI;
  const size = planet.scorchCanvas.width;
  const x = u*size, y = v*size;
  // the same size in the world on any body: the texture wraps the drawn
  // sphere, so a body drawn bigger than its gameplay size gets smaller blots
  const r = (9 + intensity*7) * (planet.size || planet.radius) / planet.radius;
  const ctx2d = planet.scorchCtx;
  ctx2d.globalCompositeOperation = "lighter";
  function blot(px){
    const grad = ctx2d.createRadialGradient(px,y,0, px,y,r);
    grad.addColorStop(0, "rgba(255,235,180,0.85)");
    grad.addColorStop(0.4, "rgba(255,130,55,0.6)");
    grad.addColorStop(1, "rgba(110,15,10,0)");
    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.arc(px, y, r, 0, Math.PI*2);
    ctx2d.fill();
  }
  blot(x);
  if(x < r) blot(x+size);
  if(x > size-r) blot(x-size);
  planet.scorchTexture.needsUpdate = true;
}

// Removes a body only locally (mesh + array), without touching the network.
// Used when the removal has already arrived confirmed via Realtime DELETE.
export function despawnLocalOnly(p){
  ctx.ships.forEach(function(other){
    if(other.target===p){ other.target=null; hideBolt(other); }
    if(other.commandedTarget===p) other.commandedTarget=null;
  });
  ctx.scene.remove(p.mesh);
  p.look.dispose();
  if(p.trajectoryLine){ ctx.scene.remove(p.trajectoryLine); p.trajectoryLine.geometry.dispose(); }
  removeItem(ctx.planets, p);
}

// Called by the client that LOCALLY noticed, e.g., that a comet flew outside
// the play field — removes it locally right away and reports the removal to
// the network (DELETE is idempotent, so the Realtime echo on other clients
// won't break anything).
function despawnBodySilently(p){
  despawnLocalOnly(p);
  if(NET_ENABLED && p.dbId){
    delete ctx.netBodies[p.dbId];
    supabase.from("bodies").delete().eq("id", p.dbId).then(function(){});
  }
}

export function updateBodies(dt){
  for(let i=ctx.planets.length-1; i>=0; i--){
    const p = ctx.planets[i];
    if(p.dying) continue;

    if(p.moving){
      // Real gravity-curved flight (world/cometPhysics.js), not a straight
      // line - stepComet() pulls p.vel toward the Sun every frame, same
      // formula world/solarGravity.js uses for ships, before integrating
      // position from it.
      stepComet(p.basePos, p.vel, dt);
      p.mesh.position.copy(p.basePos);

      // The tails point away from the Sun by themselves (BodyKit's comet
      // takes the direction from its world position); they grow as the
      // comet nears the Sun.
      p.look.opts.activity = cometActivity(p.basePos.length());

      if(p.basePos.length() > COMET_EXIT_RADIUS){
        despawnBodySilently(p);
      }
    } else if(p.orbitSlot != null){
      // Position from wall-clock time, into basePos first: the low-health
      // shake (ships/swarm.js, later in the frame) adds its offset to it.
      bodyPosAt(p.orbitSlot, nowSimTime(), p.basePos);
      p.mesh.position.copy(p.basePos);

      // Health regeneration - recomputed fresh from the (healthBase,
      // healthUpdatedAtMs) checkpoint every frame, never incremented in
      // place, so there's nothing here that can drift from what the server
      // (or this client's own last optimistic hit) actually knows. See the
      // materializePlanet() comment on this same checkpoint shape.
      if(p.healthBase != null){
        p.health = Math.min(p.maxHealth, p.healthBase + SOLAR_REGEN_RATE*(Date.now()-p.healthUpdatedAtMs)/1000);
        applyHealthVisual(p);
      }
    }
  }
}

// A fixed body eaten and not grown back yet: checkpoint 0 (the kill) and no
// more than 10 % regenerated since. Eating it again earns nothing (else a
// unit camping it collects the kill over and over). The server applies the
// same rule — docs/security.md, "Solar-body kill rule".
export function isSpent(p){
  return p.healthBase != null && p.healthBase <= 0 && p.health <= p.maxHealth * 0.1;
}

export function destroyPlanet(p){
  p.dying = true;
  ctx.ships.forEach(function(other){
    if(other.target===p){ other.target=null; hideBolt(other); }
    if(other.commandedTarget===p) other.commandedTarget=null;
  });
  // Removed right away, not tied to the pop() animation below - the
  // trajectory line is a separate static indicator, not part of the
  // body's own death effect.
  if(p.trajectoryLine){ ctx.scene.remove(p.trajectoryLine); p.trajectoryLine.geometry.dispose(); }
  const t0 = performance.now();
  // a short swell, then the body (its BodyKit look inside the mesh)
  // shrinks away
  function pop(){
    const el = (performance.now()-t0)/220;
    if(el >= 1){ ctx.scene.remove(p.mesh); p.look.dispose(); return; }
    let s;
    if(el < 0.22){
      s = 1 + (el/0.22)*0.18; // short flash-swell
    } else {
      const e2 = (el-0.22)/0.78;
      s = (1.18)*(1-e2);
    }
    p.mesh.scale.setScalar(Math.max(s,0.001));
    requestAnimationFrame(pop);
  }
  pop();
  removeItem(ctx.planets, p);
}

// Offline only: the fixed bodies at full health straight from SOLAR_BODIES
// (online they come from the server, net/solarBodiesSync.js). No comet —
// maintainComet notices the empty system and spawns one after its delay.
export function seedLocalWorld(){
  SOLAR_BODIES.forEach(function(solar){
    if(solar.kind === "blackhole"){
      materializeBlackHole(solar.radius, solar.slot);
      return;
    }
    const healthMult = bodyParams(contentKindFor(solar.kind), solar.temp).healthMult;
    const maxHealth = solar.size*healthMult;   // gameplay size, not the drawn radius
    const pos = bodyPosAt(solar.slot, nowSimTime());
    materializePlanet({
      orbit_slot: solar.slot, kind: solar.kind,
      health: maxHealth, max_health: maxHealth,
      updated_at: new Date().toISOString()
    }, pos, null, 0);
  });
}
