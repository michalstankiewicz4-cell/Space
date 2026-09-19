import { ctx } from "../core/context.js";
import { removeItem } from "../core/utils.js";
import { FIELD_RADIUS, MAX_PLANETS } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { supabase } from "../supabaseClient.js";
import { generateCrackTexture, makeRockGeometry, makeSunHaloTexture, makeSunRayTexture } from "./textures.js";
import { spawnTailParticle } from "../fx/particles.js";
import { hideBolt } from "../ships/swarm.js";

export function pickBodyKind(){
  const r = Math.random();
  if(r < 0.05) return "sun";
  if(r < 0.15) return "comet";
  if(r < 0.34) return "meteoroid";
  return "planet";
}

export function bodyParams(kind){
  if(kind === "sun"){
    return { radiusMin:3.0, radiusMax:4.3, forcedTemp:1, healthMult:30, valueBonus:40, emissive:0.95 };
  }
  if(kind === "meteoroid"){
    return { radiusMin:0.32, radiusMax:0.68, forcedTemp:null, tempRange:0.35, healthMult:15, valueBonus:0, emissive:0.28 };
  }
  if(kind === "comet"){
    return { radiusMin:0.38, radiusMax:0.6, forcedTemp:-1, healthMult:17, valueBonus:25, emissive:0.4 };
  }
  return { radiusMin:0.9, radiusMax:3.0, forcedTemp:null, tempRange:1, healthMult:22, valueBonus:0, emissive:0.28 };
}

export function tempColor(t){
  // t w zakresie -1 (lod) .. 1 (ogien)
  if(t < -0.15){
    const k = Math.min(1, (-t));
    return new THREE.Color().setHSL(0.58 - 0.03*k, 0.75, 0.55 - 0.1*k);
  } else if(t > 0.15){
    const k2 = Math.min(1, t);
    return new THREE.Color().setHSL(0.06 - 0.03*k2, 0.85, 0.52);
  }
  return new THREE.Color().setHSL(0.33, 0.35, 0.5);
}

// Czysta funkcja: losuje parametry nowego ciała (bez tworzenia mesha/sceny).
// Używana zarówno do zasiewania sieciowego (INSERT do Supabase), jak i do
// trybu lokalnego (offline, gdy multiplayer nie jest skonfigurowany).
export function randomPlanetSpawnData(forcedKind){
  const kind = forcedKind || pickBodyKind();
  const params = bodyParams(kind);
  const radius = params.radiusMin + Math.random()*(params.radiusMax-params.radiusMin);
  const temp = params.forcedTemp!==null && params.forcedTemp!==undefined ? params.forcedTemp : (Math.random()*2-1)*(params.tempRange||1);

  let pos, vel = null;
  if(kind === "comet"){
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
    vel = new THREE.Vector3().subVectors(aimPoint,pos).normalize().multiplyScalar(3.2+Math.random()*1.8);
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
    kind: kind, radius: radius, temp: temp,
    health: radius*params.healthMult, maxHealth: radius*params.healthMult,
    valueBonus: params.valueBonus,
    pos: pos, vel: vel
  };
}

export function applyHealthVisual(obj){
  if(!obj.crackMesh || !obj.maxHealth) return;
  const healthFrac = Math.max(0, obj.health/obj.maxHealth);
  obj.crackMesh.material.opacity = Math.min(1, (1-healthFrac)*1.2);
}

// Prawdziwe promienie 3D słońca: cienkie płaszczyzny (nie sprite/billboard)
// wystrzelone w losowych kierunkach w przestrzeni i losowo obrócone wokół
// własnej osi ("roll") — dzięki temu, w przeciwieństwie do płaskiego obrazka
// zwróconego zawsze do kamery, mają realną paralaksę przy obrocie widoku.
function buildSunRays(radius){
  const group = new THREE.Group();
  const rayTexture = makeSunRayTexture();
  const rayCount = 12;
  const up = new THREE.Vector3(0, 1, 0);

  for(let i=0;i<rayCount;i++){
    const long = i % 2 === 0;
    const length = radius * (long ? (2.6+Math.random()*0.9) : (1.5+Math.random()*0.7));
    const width = radius * (0.32 + Math.random()*0.16);

    const geo = new THREE.PlaneGeometry(width, length);
    geo.translate(0, length/2, 0); // (0,0,0) lokalnie = nasada promienia przy powierzchni

    const mat = new THREE.MeshBasicMaterial({
      map: rayTexture, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(geo, mat);

    const dir = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1);
    if(dir.lengthSq() < 0.0001) dir.set(0,1,0);
    dir.normalize();
    plane.quaternion.setFromUnitVectors(up, dir);
    plane.rotateY(Math.random()*Math.PI*2); // losowy obrot wokol wlasnej osi (teraz = dir)

    group.add(plane);
  }
  return group;
}

// Buduje mesh + wpis w `ctx.planets` z wiersza ciała (lokalnego lub z sieci).
// `elapsedSec` przesuwa komety do miejsca, w którym powinny być "teraz"
// (ważne dla gracza dołączającego do już trwającej gry).
export function materializePlanet(row, pos, vel, elapsedSec){
  const kind = row.kind;
  const radius = row.radius;
  const temp = row.temp;
  const params = bodyParams(kind);
  const color = kind==="sun" ? new THREE.Color().setHSL(0.09,0.9,0.6) : tempColor(temp);
  const geo = kind==="meteoroid" ? makeRockGeometry(radius) : new THREE.SphereGeometry(radius, 22, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: color, emissive: color, emissiveIntensity: params.emissive,
    roughness: 0.65, metalness: 0.15
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  ctx.scene.add(mesh);

  // nakladka pekniec - niewidoczna na starcie, odslania sie w miare obgryzania
  const crackGeo = new THREE.SphereGeometry(radius*1.02, 22, 16);
  const crackMat = new THREE.MeshBasicMaterial({
    map: generateCrackTexture(), transparent:true, opacity:0,
    depthWrite:false, blending: THREE.AdditiveBlending
  });
  const crackMesh = new THREE.Mesh(crackGeo, crackMat);
  mesh.add(crackMesh);

  // nakladka ognistych sladow - zaczyna calkowicie czysta, wypalana przez promien statkow
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

  // slonce: poswiata korony (3D, blisko powierzchni) + okragla łuna (sprite
  // zwrocony do kamery - dla gladkiej poswiaty kat widzenia nie ma znaczenia)
  // + prawdziwe promienie 3D (patrz buildSunRays - realne obiekty w
  // przestrzeni, wiec przy obrocie kamery maja paralakse, nie sa plaskim
  // obrazkiem) + wlasne swiatlo
  let corona = null;
  let sunHalo = null;
  let sunRays = null;
  if(kind === "sun"){
    const coronaGeo = new THREE.SphereGeometry(radius*1.4, 20, 14);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffcf7a, transparent:true, opacity:0.35,
      blending: THREE.AdditiveBlending, depthWrite:false
    });
    corona = new THREE.Mesh(coronaGeo, coronaMat);
    mesh.add(corona);

    const haloMat = new THREE.SpriteMaterial({
      map: makeSunHaloTexture(), color: 0xffffff, transparent:true, opacity:0.85,
      blending: THREE.AdditiveBlending, depthWrite:false
    });
    sunHalo = new THREE.Sprite(haloMat);
    sunHalo.scale.setScalar(radius*4.4);
    mesh.add(sunHalo);

    sunRays = buildSunRays(radius);
    mesh.add(sunRays);

    const sunLight = new THREE.PointLight(0xffcf8a, 1.6, radius*40);
    mesh.add(sunLight);
  }

  // subtelny pierscien orbitalny na co kilka planet (nie dla komet) - decyzja czysto
  // kosmetyczna, losowana niezaleznie przez kazdego klienta
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
    corona: corona,
    sunHalo: sunHalo,
    sunRays: sunRays,
    coronaPhase: Math.random()*10,
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

// Tryb offline (multiplayer nieskonfigurowany): tworzy ciało od razu, bez sieci.
export function spawnPlanetLocalOnly(forcedKind){
  const data = randomPlanetSpawnData(forcedKind);
  materializePlanet({
    id: "local-"+Math.random().toString(36).slice(2),
    kind: data.kind, radius: data.radius, temp: data.temp,
    health: data.health, max_health: data.maxHealth, value_bonus: data.valueBonus
  }, data.pos, data.vel, 0);
}

// Tryb sieciowy: tylko steward wysyla INSERT; mesh powstaje u wszystkich
// (wliczajac stewarda) po odebraniu echa przez Realtime — jedna sciezka kodu.
// `pendingSpawnCount` liczy inserty "w locie" (wyslane, jeszcze nie
// zmaterializowane), zeby dosypywanie (maintainPlanetCount) nie doliczalo
// ich sobie jeszcze raz, gdy odpowiedz sieci sie spoznia.
export let pendingSpawnCount = 0;
export function requestSpawnPlanet(forcedKind){
  const data = randomPlanetSpawnData(forcedKind);
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

// Usuwa ciało tylko lokalnie (mesh + tablica), bez dotykania sieci.
// Używane gdy usunięcie przychodzi już potwierdzone przez Realtime DELETE.
export function despawnLocalOnly(p){
  ctx.ships.forEach(function(other){
    if(other.target===p){ other.target=null; hideBolt(other); }
    if(other.commandedTarget===p) other.commandedTarget=null;
  });
  ctx.scene.remove(p.mesh);
  removeItem(ctx.planets, p);
}

// Wywoływane przez klienta, który LOKALNIE zauważył np. że kometa wyleciała
// poza pole gry — usuwa u siebie od razu i zgłasza usunięcie do sieci
// (DELETE jest idempotentny, więc echo Realtime u innych nic nie popsuje).
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

    if(p.corona){
      p.coronaPhase += dt*2.2;
      p.corona.material.opacity = 0.28 + 0.14*Math.abs(Math.sin(p.coronaPhase));
      const cs = 1 + 0.05*Math.abs(Math.sin(p.coronaPhase*0.7));
      p.corona.scale.setScalar(cs);
    }

    if(p.sunHalo){
      p.sunHalo.material.rotation += dt*0.09;
      const pulse = 1 + 0.06*Math.abs(Math.sin(p.coronaPhase*0.55));
      p.sunHalo.scale.setScalar(p.radius*4.4*pulse);
      p.sunHalo.material.opacity = 0.78 + 0.12*Math.abs(Math.sin(p.coronaPhase*0.9));
    }

    if(p.sunRays){
      // wlasny, nieco szybszy obrot niz baza slonca (p.spin) - realna
      // geometria 3D, wiec przy obrocie kamery promienie maja paralakse
      p.sunRays.rotation.y += dt*0.15;
      p.sunRays.rotation.x += dt*0.045;
      const pulse = 1 + 0.08*Math.abs(Math.sin(p.coronaPhase*0.7));
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
      s = 1 + (el/0.22)*0.18; // krotki blysk-rozdecie
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

// Zasiew startowy w trybie offline (bez multiplayera). W trybie sieciowym
// świat przychodzi z bazy — patrz net/bodiesSync.js.
export function seedLocalWorld(){
  for(let i=0;i<MAX_PLANETS;i++) spawnPlanetLocalOnly();
}
