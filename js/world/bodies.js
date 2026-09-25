import { ctx } from "../core/context.js";
import { removeItem, sRGBTexture } from "../core/utils.js";
import { SOLAR_REGEN_RATE } from "../config.js";
import { CONTENT } from "../content.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { generateCrackTexture, makeRockGeometry, makeSunHaloTexture, makePlanetSurfaceTexture } from "./textures.js";
import { hideBolt } from "../ships/swarm.js";
import { bodyParams, tempColor, randomPlanetSpawnData, contentKindFor } from "./bodyParams.js";
import { buildSunRays, buildCometTail, updateCometTailDirection, buildSelectionBracket } from "./bodyMeshParts.js";
import { SOLAR_BODIES, SOLAR_BODY_BY_SLOT, bodyPosAt, nowSimTime } from "./solarSystem.js";
import { materializeBlackHole } from "./blackholes.js";
import { stepComet, advanceComet, COMET_EXIT_RADIUS, computeCometTrajectory } from "./cometPhysics.js";
import { buildCometTrajectoryLine } from "../scene/orbitLines.js";

// Body lifecycle: materializing a mesh from spawn data, spawning/despawning
// (local-only and networked), and the per-frame update. Pure body-type
// math/data lives in ./bodyParams.js, and mesh-building helpers for a
// body's optional decorations (sun rays, comet tail, selection bracket)
// live in ./bodyMeshParts.js — this file is what's left: turning that data
// into an actual scene object and keeping it alive.
//
// Two kinds of body pass through materializePlanet()/updateBodies() now:
// - Fixed solar bodies (sun + 8 planet-ish orbit slots, `row.orbit_slot`
//   set) — shape (kind/radius/temp) comes from the hardcoded
//   world/solarSystem.js table, never from the DB row; only health/
//   max_health/updated_at are server state. Position is re-derived from
//   bodyPosAt() every frame, health regenerates (see the "health
//   checkpoint" comment below) — never destroyed/removed.
// - Comets (`row.orbit_slot` absent) — entirely unchanged from before:
//   full row-driven shape, straight-line drift, spawn/despawn pool.
// The black hole (orbit_slot 9) is NOT among these — it has its own,
// visually distinct materializeBlackHole() in world/blackholes.js.

export function applyHealthVisual(obj){
  if(!obj.crackMesh || !obj.maxHealth) return;
  const healthFrac = Math.max(0, obj.health/obj.maxHealth);
  obj.crackMesh.material.opacity = Math.min(1, (1-healthFrac)*1.2);
}

// Builds a mesh + entry in `ctx.planets` from a body row (local or networked).
// `elapsedSec` advances comets to where they should be "now" (important for
// a player joining a game already in progress) — meaningless for fixed
// solar bodies, which derive position from wall-clock time instead (see
// below), not an elapsed-since-spawn value.
export function materializePlanet(row, pos, vel, elapsedSec){
  const orbitSlot = row.orbit_slot != null ? row.orbit_slot : null;
  let kind, radius, temp;
  if(orbitSlot != null){
    const solar = SOLAR_BODY_BY_SLOT[orbitSlot];
    kind = contentKindFor(solar.kind);
    radius = solar.radius;
    temp = solar.temp;
  } else {
    kind = row.kind;
    radius = row.radius;
    temp = row.temp;
  }
  const params = bodyParams(kind, temp);
  const color = kind==="sun" ? new THREE.Color().setHSL(0.09,0.9,0.6)
    : kind==="comet" ? new THREE.Color(0xffffff)
    : tempColor(temp);
  const geo = (kind==="meteoroid" || kind==="comet") ? makeRockGeometry(radius) : new THREE.SphereGeometry(radius, 22, 16);
  // The neutral planet variant (neither volcanic nor icy) gets a real
  // surface map (ocean/continents/ice caps/desert) instead of a flat color,
  // and no emissive glow so it doesn't shine like lava/ice.
  const isNeutralPlanet = kind === "planet" && params === CONTENT.neutralPlanet;
  const mat = isNeutralPlanet
    ? new THREE.MeshStandardMaterial({
        map: makePlanetSurfaceTexture(), roughness: 0.8, metalness: 0.05
      })
    : new THREE.MeshStandardMaterial({
        color: color, emissive: color, emissiveIntensity: params.emissive,
        roughness: 0.65, metalness: 0.15
      });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  ctx.scene.add(mesh);

  // crack overlay - invisible at first, revealed as the body gets bitten down
  const crackGeo = new THREE.SphereGeometry(radius*1.02, 22, 16);
  const crackMat = new THREE.MeshBasicMaterial({
    map: generateCrackTexture(), transparent:true, opacity:0,
    depthWrite:false, blending: THREE.AdditiveBlending
  });
  const crackMesh = new THREE.Mesh(crackGeo, crackMat);
  mesh.add(crackMesh);

  // scorch-mark overlay - starts completely clean, burned in by ships' beams
  const scorchCanvas = document.createElement("canvas");
  scorchCanvas.width = 256; scorchCanvas.height = 256;
  const scorchCtx = scorchCanvas.getContext("2d");
  scorchCtx.clearRect(0,0,256,256);
  const scorchTexture = sRGBTexture(new THREE.CanvasTexture(scorchCanvas));
  const scorchGeo = new THREE.SphereGeometry(radius*1.012, 22, 16);
  const scorchMat = new THREE.MeshBasicMaterial({
    map: scorchTexture, transparent:true, opacity:0.95,
    depthWrite:false, blending: THREE.AdditiveBlending
  });
  const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
  mesh.add(scorchMesh);

  // sun: a smooth, single-layer glow (a sprite facing the camera - the
  // canvas gradient interpolates continuously, without the "banding" that
  // earlier layered 3D-sphere shells produced) + real 3D rays (see
  // buildSunRays - real objects in space, with parallax as the camera
  // rotates) + its own light
  let sunHalo = null;
  let sunRays = null;
  if(kind === "sun"){
    const haloMat = new THREE.SpriteMaterial({
      map: makeSunHaloTexture(), color: 0xffffff, transparent:true, opacity:0.9,
      blending: THREE.AdditiveBlending, depthWrite:false
    });
    sunHalo = new THREE.Sprite(haloMat);
    sunHalo.scale.setScalar(radius*CONTENT.sun.haloScale);
    mesh.add(sunHalo);

    sunRays = buildSunRays(radius);
    mesh.add(sunRays);

    const sunLight = new THREE.PointLight(0xffcf8a, 1.6, radius*40);
    mesh.add(sunLight);
  }

  // comet: a tail pointing away from the sun (bodyMeshParts.js's own
  // comment explains why, and why it needs to be re-oriented every frame
  // now) - built after the fast-forward below computes where it actually
  // is right now, so the tail's initial direction isn't stale for a
  // late-joining client.
  let cometTail = null;
  // The comet's own "orbit" line (see scene/orbitLines.js) - a separate,
  // top-level scene object (not a mesh child), since it shows the WHOLE
  // static flight path in world space while the comet itself moves along
  // it - added to the scene when the comet appears, removed again when it
  // despawns (despawnLocalOnly/destroyPlanet below).
  let trajectoryLine = null;

  // a subtle orbital ring on some planets (not comets) - a purely cosmetic
  // choice, rolled independently by each client
  if(kind!=="comet" && Math.random() < 0.3){
    const rg = new THREE.RingGeometry(radius*1.5, radius*1.75, 40);
    const rm = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:0.25, side:THREE.DoubleSide });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = Math.PI/2 + (Math.random()-0.5)*0.6;
    mesh.add(ring);
  }

  const selectionBracket = buildSelectionBracket(radius);
  mesh.add(selectionBracket);

  const basePos = pos.clone();
  // A comet's `vel` (the one stored in the DB row, or freshly rolled for a
  // local-only spawn) is only ever its INITIAL velocity at spawn — its
  // real, current velocity has to be reconstructed by replaying gravity
  // from that starting state up through `elapsedSec` of real time (see
  // world/cometPhysics.js's header comment for why a closed-form shortcut
  // doesn't exist here). `cometVel` below is that reconstructed, CURRENT
  // velocity - the one actually stored on `p.vel` going forward, not the
  // original spawn value.
  let cometVel = null;
  if(kind === "comet" && vel){
    cometVel = vel.clone();
    advanceComet(basePos, cometVel, elapsedSec||0);
    mesh.position.copy(basePos);
    cometTail = buildCometTail(radius, basePos.clone().normalize());
    mesh.add(cometTail);
    // From the ORIGINAL entry pos/vel (not basePos/cometVel, which the
    // advanceComet() call above already fast-forwarded to "now") - the
    // line should trace the whole path from where the comet entered, not
    // just what's left of it for a late-joining client.
    trajectoryLine = buildCometTrajectoryLine(computeCometTrajectory(pos, vel));
    ctx.scene.add(trajectoryLine);
  }

  // Health checkpoint for fixed solar bodies — (healthBase, healthUpdatedAtMs)
  // is the last committed server value + when it was set; `health` itself is
  // recomputed from that checkpoint every frame in updateBodies() (and once
  // more here, in case a lot of time passed between the server row's
  // updated_at and this exact materialize moment, e.g. reconnecting after
  // being away) — a pure function of "last known state + elapsed time",
  // never a locally-ticked/incremented number. See ships/swarm.js's kill
  // handling for the matching rule: any optimistic local damage must reset
  // this checkpoint too, or next frame's regen recompute would silently
  // undo the hit.
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
    mesh: mesh, radius: radius, temp: temp,
    health: health,
    maxHealth: maxHealth,
    healthBase: healthBase,
    healthUpdatedAtMs: healthUpdatedAtMs,
    valueBonus: orbitSlot != null ? (params.valueBonus||0) : (row.value_bonus||0),
    pendingDamage: 0,
    // Comets get spin:0 deliberately - the tail group is a child of this
    // mesh, re-oriented every frame in world-space terms (bodyMeshParts.js#
    // updateCometTailDirection); if the mesh itself kept rotating, that
    // world-space direction would immediately drift out of alignment again
    // since it's set in the mesh's LOCAL space.
    spin: kind==="comet" ? 0 : (Math.random()-0.5)*0.6,
    selected: false,
    selectionBracket: selectionBracket,
    sunHalo: sunHalo,
    sunRays: sunRays,
    sunPhase: Math.random()*10,
    dying: false,
    crackMesh: crackMesh,
    scorchCanvas: scorchCanvas,
    scorchCtx: scorchCtx,
    scorchTexture: scorchTexture,
    basePos: basePos,
    shakePhase: Math.random()*10,
    moving: kind==="comet",
    cometTail: cometTail,
    trajectoryLine: trajectoryLine,
    // The CURRENT (gravity-advanced) velocity, not the original spawn
    // value - see the comment above where cometVel is computed. Comets
    // are the only body whose velocity keeps changing every frame
    // (updateBodies() steps it forward under the Sun's pull, unlike every
    // fixed solar body's closed-form orbit or a ship's own steering) — no
    // more cached driftDir, either: "away from the sun" changes as the
    // comet moves, so it's recomputed fresh each frame instead.
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
  const local = planet.mesh.worldToLocal(worldPoint.clone());
  local.normalize();
  const u = 0.5 + Math.atan2(local.z, local.x)/(2*Math.PI);
  const v = 0.5 - Math.asin(Math.max(-1,Math.min(1,local.y)))/Math.PI;
  const size = planet.scorchCanvas.width;
  const x = u*size, y = v*size;
  const r = 9 + intensity*7;
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
  if(p.trajectoryLine){ ctx.scene.remove(p.trajectoryLine); p.trajectoryLine.geometry.dispose(); }
  removeItem(ctx.planets, p);
}

// Called by the client that LOCALLY noticed, e.g., that a comet flew outside
// the play field — removes it locally right away and reports the removal to
// the network (DELETE is idempotent, so the Realtime echo on other clients
// won't break anything).
export function despawnBodySilently(p){
  despawnLocalOnly(p);
  if(NET_ENABLED && p.dbId){
    delete ctx.netBodies[p.dbId];
    supabase.from("bodies").delete().eq("id", p.dbId).then(function(){});
  }
}

// Reused every frame by updateBodies()'s comet branch instead of a fresh
// `new THREE.Vector3()` per comet per frame - same scratch-vector pattern
// already established elsewhere (world/blackholes.js's toHoleScratch,
// ships/swarm.js's toTargetScratch, etc.).
const outwardCometScratch = new THREE.Vector3();

export function updateBodies(dt){
  for(let i=ctx.planets.length-1; i>=0; i--){
    const p = ctx.planets[i];
    if(p.dying) continue;
    p.mesh.rotation.y += p.spin*dt;

    if(p.sunHalo){
      p.sunPhase += dt*2.2;
      p.sunHalo.material.rotation += dt*0.09;
      const pulse = 1 + 0.06*Math.abs(Math.sin(p.sunPhase*0.55));
      p.sunHalo.scale.setScalar(p.radius*CONTENT.sun.haloScale*pulse);
      p.sunHalo.material.opacity = 0.82 + 0.14*Math.abs(Math.sin(p.sunPhase*0.9));
    }

    if(p.sunRays){
      // its own, slightly faster rotation than the sun's base (p.spin) -
      // real 3D geometry, so the rays get parallax as the camera rotates
      p.sunRays.rotation.y += dt*0.15;
      p.sunRays.rotation.x += dt*0.045;
      const pulse = 1 + 0.08*Math.abs(Math.sin(p.sunPhase*0.7));
      p.sunRays.scale.setScalar(pulse);
    }

    if(p.moving){
      // Real gravity-curved flight (world/cometPhysics.js), not a straight
      // line - stepComet() pulls p.vel toward the Sun every frame, same
      // formula world/solarGravity.js uses for ships, before integrating
      // position from it.
      stepComet(p.basePos, p.vel, dt);
      p.mesh.position.copy(p.basePos);

      // "Away from the sun," recomputed fresh every frame since the comet
      // is now curving (not moving in a fixed direction) - the Sun sits at
      // the origin, so the comet's own position IS that direction once
      // normalized (bodyMeshParts.js#updateCometTailDirection uses this
      // same real-astronomy direction, not "opposite velocity").
      const awayFromSun = outwardCometScratch.copy(p.basePos).normalize();
      if(p.cometTail) updateCometTailDirection(p.cometTail, awayFromSun);

      if(p.basePos.length() > COMET_EXIT_RADIUS){
        despawnBodySilently(p);
      }
    } else if(p.orbitSlot != null){
      // Fixed solar body: position is a pure function of wall-clock time,
      // not something integrated frame-to-frame (see world/solarSystem.js).
      // Written into basePos first, then copied to mesh.position - same
      // two-step shape comets use above - so ships/swarm.js's low-health
      // "shake" effect (which reads basePos + an offset, applied to
      // mesh.position AFTER this runs, since updateBodies() is called
      // before updateShips() in main.js's tick()) always shakes around
      // this frame's correct orbital position, not last frame's.
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
  function pop(){
    const el = (performance.now()-t0)/220;
    if(el >= 1){ ctx.scene.remove(p.mesh); return; }
    let s;
    if(el < 0.22){
      s = 1 + (el/0.22)*0.18; // short flash-swell
    } else {
      const e2 = (el-0.22)/0.78;
      s = (1.18)*(1-e2);
    }
    p.mesh.scale.setScalar(Math.max(s,0.001));
    const op = el < 0.22 ? 1 : 1-((el-0.22)/0.78);
    p.mesh.material.opacity = op;
    p.mesh.material.transparent = true;
    p.crackMesh.material.opacity = op;
    requestAnimationFrame(pop);
  }
  pop();
  removeItem(ctx.planets, p);
}

// Initial seeding in offline mode (no multiplayer). In networked mode the
// fixed solar bodies come from the database once (see
// net/solarBodiesSync.js#bootstrapSolarSystem) rather than being generated
// here — offline mode has no server, so it builds the exact same 9 fixed
// slots (+ sun) directly from SOLAR_BODIES, health=maxHealth, no DB row
// needed. The black hole (slot 9) goes through its own
// materializeBlackHole(), not materializePlanet() — see world/blackholes.js.
// No initial comet: same as the networked path, the empty system is simply
// noticed by the normal cooldown-based spawn logic (net/bodiesSync.js#
// maintainComet) a moment later — a fine steady state, not something that
// needs seeding.
export function seedLocalWorld(){
  SOLAR_BODIES.forEach(function(solar){
    if(solar.kind === "blackhole"){
      materializeBlackHole(solar.radius, solar.slot);
      return;
    }
    const healthMult = bodyParams(contentKindFor(solar.kind), solar.temp).healthMult;
    const maxHealth = solar.radius*healthMult;
    const pos = bodyPosAt(solar.slot, nowSimTime());
    materializePlanet({
      orbit_slot: solar.slot, kind: solar.kind,
      health: maxHealth, max_health: maxHealth,
      updated_at: new Date().toISOString()
    }, pos, null, 0);
  });
}
