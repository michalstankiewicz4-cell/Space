import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { FIELD_RADIUS, MAX_PLANETS } from "../config.js";
import { CONTENT, BODY_TYPES } from "../content.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import {
  generateCrackTexture, makeRockGeometry, makeSunHaloTexture, makeSunRayTexture,
  makeCometTailTexture, makePlanetSurfaceTexture
} from "./textures.js";
import { spawnTailParticle } from "../fx/particles.js";
import { hideBolt } from "../ships/swarm.js";

// Picks one of the 7 body types (everything in js/bodies/* except
// blackhole.js, which spawns on its own timer — see world/blackholes.js),
// weighted by .spawnWeight. Weights don't need to sum to 1.
export function pickBodyType(){
  const total = BODY_TYPES.reduce(function(s, t){ return s + t.spawnWeight; }, 0);
  let r = Math.random() * total;
  for(let i=0;i<BODY_TYPES.length;i++){
    if(r < BODY_TYPES[i].spawnWeight) return BODY_TYPES[i];
    r -= BODY_TYPES[i].spawnWeight;
  }
  return BODY_TYPES[BODY_TYPES.length-1];
}

// A "planet" DB row only stores kind+temp, not which of the 3 planet
// variants (ice/neutral/volcanic) generated it — so it's re-derived from
// temp whenever needed (e.g. when a client materializes a row it didn't
// generate itself). Falls back to sign-based classification so it always
// resolves to exactly one variant even if the ranges are edited to overlap
// or leave a gap.
export function variantForTemp(temp){
  const np = CONTENT.neutralPlanet;
  if(temp >= np.tempMin && temp <= np.tempMax) return np;
  return temp < 0 ? CONTENT.icePlanet : CONTENT.volcanicPlanet;
}

export function bodyParams(kind, temp){
  if(kind === "sun") return CONTENT.sun;
  if(kind === "meteoroid") return CONTENT.meteoroid;
  if(kind === "comet") return CONTENT.comet;
  return variantForTemp(temp!=null ? temp : 0);
}

// i18n key (see js/i18n.js "body" section) identifying which of the 7 body
// types a live planet object is, re-deriving the planet variant from temp
// the same way bodyParams()/variantForTemp() do.
export function bodyVariantKey(p){
  if(p.kind === "sun" || p.kind === "comet" || p.kind === "meteoroid") return p.kind;
  const params = variantForTemp(p.temp);
  if(params === CONTENT.icePlanet) return "ice";
  if(params === CONTENT.volcanicPlanet) return "volcanic";
  return "neutral";
}

// Same formula used when a body is fully devoured (see ships/swarm.js) —
// shared so the hover tooltip's estimate never drifts from the real payout.
export function bodyValueEstimate(p){
  return Math.round(p.radius*14 + Math.abs(p.temp)*8 + (p.valueBonus||0));
}

export function tempColor(t){
  // t ranges -1 (ice) .. 1 (lava)
  if(t < -0.15){
    const k = Math.min(1, (-t));
    return new THREE.Color().setHSL(0.58 - 0.03*k, 0.75, 0.55 - 0.1*k);
  } else if(t > 0.15){
    const k2 = Math.min(1, t);
    return new THREE.Color().setHSL(0.06 - 0.03*k2, 0.85, 0.52);
  }
  return new THREE.Color().setHSL(0.33, 0.35, 0.5);
}

// Pure function: rolls the parameters for a new body (no mesh/scene side
// effects). Used both for network seeding (INSERT into Supabase) and for
// offline mode (multiplayer not configured). `forcedType` is one of the
// exported CONTENT.* objects (e.g. CONTENT.icePlanet) — pass it to force a
// specific type instead of rolling one via pickBodyType().
export function randomPlanetSpawnData(forcedType){
  const type = forcedType || pickBodyType();
  const radius = type.radiusMin + Math.random()*(type.radiusMax-type.radiusMin);
  const temp = type.tempMin + Math.random()*(type.tempMax-type.tempMin);

  let pos, vel = null;
  if(type.kind === "comet"){
    // start tuz za granica pola, lecac po linii przez srodek obszaru gry
    const shellDist = FIELD_RADIUS*1.15;
    const theta0 = Math.random()*Math.PI*2;
    const phi0 = Math.acos(2*Math.random()-1);
    pos = new THREE.Vector3(
      shellDist*Math.sin(phi0)*Math.cos(theta0),
      shellDist*Math.sin(phi0)*Math.sin(theta0)*0.55,
      shellDist*Math.cos(phi0)
    );
    const aimPoint = new THREE.Vector3((Math.random()-0.5)*FIELD_RADIUS*0.5,(Math.random()-0.5)*FIELD_RADIUS*0.3,(Math.random()-0.5)*FIELD_RADIUS*0.5);
    const speed = CONTENT.comet.speedMin + Math.random()*CONTENT.comet.speedRange;
    vel = new THREE.Vector3().subVectors(aimPoint,pos).normalize().multiplyScalar(speed);
  } else {
    const dist = 10 + Math.random()*FIELD_RADIUS;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    pos = new THREE.Vector3(
      dist*Math.sin(phi)*Math.cos(theta),
      dist*Math.sin(phi)*Math.sin(theta)*0.55,
      dist*Math.cos(phi)
    );
  }

  return {
    kind: type.kind, radius: radius, temp: temp,
    health: radius*type.healthMult, maxHealth: radius*type.healthMult,
    valueBonus: type.valueBonus,
    pos: pos, vel: vel
  };
}

export function applyHealthVisual(obj){
  if(!obj.crackMesh || !obj.maxHealth) return;
  const healthFrac = Math.max(0, obj.health/obj.maxHealth);
  obj.crackMesh.material.opacity = Math.min(1, (1-healthFrac)*1.2);
}

// Real 3D sun rays: thin planes (not a sprite/billboard) shot out in random
// directions in space and randomly rotated around their own axis ("roll") —
// this way, unlike a flat image always facing the camera, they have real
// parallax as the view rotates.
function buildSunRays(radius){
  const group = new THREE.Group();
  const rayTexture = makeSunRayTexture();
  const s = CONTENT.sun;
  const up = new THREE.Vector3(0, 1, 0);

  for(let i=0;i<s.rayCount;i++){
    const long = i % 2 === 0;
    const length = radius * (long ? (s.rayLengthLongMin+Math.random()*s.rayLengthLongRange) : (s.rayLengthShortMin+Math.random()*s.rayLengthShortRange));
    const width = radius * (s.rayWidthMin + Math.random()*s.rayWidthRange);

    const geo = new THREE.PlaneGeometry(width, length);
    geo.translate(0, length/2, 0); // local (0,0,0) = ray base at the surface

    const mat = new THREE.MeshBasicMaterial({
      map: rayTexture, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(geo, mat);

    const dir = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1);
    if(dir.lengthSq() < 0.0001) dir.set(0,1,0);
    dir.normalize();
    plane.quaternion.setFromUnitVectors(up, dir);
    plane.rotateY(Math.random()*Math.PI*2); // random rotation around its own axis (now = dir)

    group.add(plane);
  }
  return group;
}

// Comet tail: two crossed planes (the classic "crossed billboard" trick -
// visible from almost any angle, unlike a single flat plane that disappears
// when seen "edge-on") trailing in the direction opposite to velocity. A
// comet's direction of travel is constant for its whole life, so we compute
// the orientation once, at creation.
function buildCometTail(radius, vel){
  const group = new THREE.Group();
  if(!vel || vel.lengthSq() < 0.0001) return group;

  const length = radius * (CONTENT.comet.tailLengthMin + Math.random()*CONTENT.comet.tailLengthRange);
  const width = radius * (CONTENT.comet.tailWidthMin + Math.random()*CONTENT.comet.tailWidthRange);
  const geo = new THREE.PlaneGeometry(width, length);
  geo.translate(0, length/2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: makeCometTailTexture(), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  const dir = vel.clone().normalize().multiplyScalar(-1);
  const up = new THREE.Vector3(0, 1, 0);
  for(let i=0;i<2;i++){
    const plane = new THREE.Mesh(geo, mat);
    plane.quaternion.setFromUnitVectors(up, dir);
    plane.rotateY(i * Math.PI/2);
    group.add(plane);
  }
  return group;
}

// Builds a mesh + entry in `ctx.planets` from a body row (local or networked).
// `elapsedSec` advances comets to where they should be "now" (important for
// a player joining a game already in progress).
export function materializePlanet(row, pos, vel, elapsedSec){
  const kind = row.kind;
  const radius = row.radius;
  const temp = row.temp;
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
  const scorchTexture = new THREE.CanvasTexture(scorchCanvas);
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

  // comet: a tail trailing behind it, opposite the direction of travel
  let cometTail = null;
  if(kind === "comet"){
    cometTail = buildCometTail(radius, vel);
    mesh.add(cometTail);
  }

  // a subtle orbital ring on some planets (not comets) - a purely cosmetic
  // choice, rolled independently by each client
  if(kind!=="comet" && Math.random() < 0.3){
    const rg = new THREE.RingGeometry(radius*1.5, radius*1.75, 40);
    const rm = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:0.25, side:THREE.DoubleSide });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = Math.PI/2 + (Math.random()-0.5)*0.6;
    mesh.add(ring);
  }

  const basePos = pos.clone();
  if(kind === "comet" && vel){
    basePos.addScaledVector(vel, elapsedSec||0);
    mesh.position.copy(basePos);
  }

  const p = {
    dbId: row.id,
    kind: kind,
    mesh: mesh, radius: radius, temp: temp,
    health: row.health!=null ? row.health : radius*params.healthMult,
    maxHealth: row.max_health!=null ? row.max_health : radius*params.healthMult,
    valueBonus: row.value_bonus||0,
    pendingDamage: 0,
    spin: (Math.random()-0.5)*0.6,
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
    vel: vel,
    tailTimer: 0
  };
  ctx.planets.push(p);
  applyHealthVisual(p);
  if(NET_ENABLED) ctx.netBodies[row.id] = p;
  return p;
}

// Offline mode (multiplayer not configured): creates the body immediately, no networking.
export function spawnPlanetLocalOnly(forcedType){
  const data = randomPlanetSpawnData(forcedType);
  materializePlanet({
    id: "local-"+Math.random().toString(36).slice(2),
    kind: data.kind, radius: data.radius, temp: data.temp,
    health: data.health, max_health: data.maxHealth, value_bonus: data.valueBonus
  }, data.pos, data.vel, 0);
}

// Networked mode: only the steward sends the INSERT; the mesh is created for
// everyone (including the steward) once the Realtime echo arrives — a single
// code path. `pendingSpawnCount` counts inserts "in flight" (sent, not yet
// materialized), so the top-up logic (maintainPlanetCount) doesn't count them
// again while the network response is still pending.
export let pendingSpawnCount = 0;
export function requestSpawnPlanet(forcedType){
  const data = randomPlanetSpawnData(forcedType);
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
    if(res.error) console.warn("requestSpawnPlanet failed", res.error);
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
      p.basePos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.basePos);

      p.tailTimer -= dt;
      if(p.tailTimer <= 0){
        p.tailTimer = 0.03;
        const driftDir = p.vel.clone().normalize().multiplyScalar(-1);
        spawnTailParticle(p.mesh.position, driftDir, p.mesh.material.color);
      }

      if(p.basePos.length() > FIELD_RADIUS*1.6){
        despawnBodySilently(p);
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
// world comes from the database — see net/bodiesSync.js.
export function seedLocalWorld(){
  for(let i=0;i<MAX_PLANETS;i++) spawnPlanetLocalOnly();
}
