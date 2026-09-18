import { ctx } from "../core/context.js";
import { ORBIT_RADIUS } from "../config.js";
import { NET_ENABLED } from "../env.js";
import { state, swarmStats, save } from "../core/gameState.js";
import { paintScorch, destroyPlanet } from "../world/bodies.js";
import { spawnBiteParticles } from "../fx/particles.js";
import { triggerBreakup } from "../fx/breakup.js";
import { showToast } from "../ui/hud.js";
import { refreshDock } from "../ui/dock.js";

function makeShipMesh(){
  const group = new THREE.Group();
  const body = new THREE.ConeGeometry(0.28, 0.9, 8);
  const mat = new THREE.MeshStandardMaterial({ color:0x4fe3c6, emissive:0x1fae95, emissiveIntensity:0.9, roughness:0.35, metalness:0.4 });
  const mesh = new THREE.Mesh(body, mat);
  mesh.rotation.x = Math.PI/2;
  group.add(mesh);
  const glow = new THREE.PointLight(0x4fe3c6, 0.5, 6);
  group.add(glow);

  // pierscien zaznaczenia (widoczny tylko gdy statek wybrany)
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2;
  ring.visible = false;
  group.add(ring);

  // niewidzialna sfera pod raycasting - latwiej trafic mala jednostke myszka
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
  const startPos = new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*4, (Math.random()-0.5)*4);
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

function nearestPlanet(fromPos){
  let best=null, bestD=Infinity;
  for(let i=0;i<ctx.planets.length;i++){
    const p = ctx.planets[i];
    if(p.dying) continue;
    const d = fromPos.distanceTo(p.mesh.position);
    if(d<bestD){ bestD=d; best=p; }
  }
  return best;
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

// przebudowuje geometrie promienia KAZDA RAMKE, uzywajac aktualnej pozycji
// statku i biezacego punktu kontaktu - dzieki temu promien plynnie
// "rozciaga sie" wraz z orbitowaniem statku, a nie "skacze" co kilka ramek
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

export function updateShips(dt){
  const stats = swarmStats();
  const baseSpeed = 6.5 * stats.speed;
  const basePower = 5.5 * stats.power;

  for(let i=0;i<ctx.ships.length;i++){
    const sh = ctx.ships[i];

    if(sh.commandedTarget){
      if(sh.commandedTarget.dying || ctx.planets.indexOf(sh.commandedTarget)===-1){
        sh.commandedTarget = null;
      } else {
        sh.target = sh.commandedTarget;
      }
    }
    if(!sh.target || sh.target.dying || ctx.planets.indexOf(sh.target)===-1){
      sh.target = sh.commandedTarget ? null : nearestPlanet(sh.pos);
    }
    if(!sh.target){ hideBolt(sh); continue; }

    const toTarget = new THREE.Vector3().subVectors(sh.target.mesh.position, sh.pos);
    const dist = toTarget.length();
    const eatRange = ORBIT_RADIUS;

    if(dist > eatRange){
      hideBolt(sh);
      toTarget.normalize();
      sh.vel.lerp(toTarget.multiplyScalar(baseSpeed*0.15), 0.08);
      sh.pos.addScaledVector(sh.vel, dt);
      sh.mesh.position.copy(sh.pos);
      // orientacja w strone ruchu
      const lookTarget = new THREE.Vector3().addVectors(sh.pos, sh.vel);
      sh.mesh.lookAt(lookTarget);
    } else {
      // orbituj lekko wokol planety podczas zjadania
      sh.eatPulse += dt*4;
      const orbit = new THREE.Vector3(Math.cos(sh.eatPulse), Math.sin(sh.eatPulse*0.7)*0.4, Math.sin(sh.eatPulse)).multiplyScalar(eatRange*0.9);
      const orbitPos = new THREE.Vector3().addVectors(sh.target.mesh.position, orbit);
      sh.pos.lerp(orbitPos, 0.12);
      sh.mesh.position.copy(sh.pos);
      sh.mesh.lookAt(sh.target.mesh.position);

      const eff = eatEfficiency(stats, sh.target);
      const dmg = basePower*eff*dt;
      sh.target.health -= dmg;
      sh.target.pendingDamage = (sh.target.pendingDamage||0) + dmg;

      pulseBolt(sh, dt);

      // planeta NIE kurczy sie - peka: nakladka peknieс odslania sie z uszkodzeniem,
      // a przy niskim "zdrowiu" dostaje lekkie drzenie napiecia przed rozpadem
      const healthFrac = Math.max(0, sh.target.health/sh.target.maxHealth);
      const damage = 1-healthFrac;
      sh.target.crackMesh.material.opacity = Math.min(1, damage*1.2);
      if(healthFrac < 0.3){
        const shakeAmt = ((0.3-healthFrac)/0.3) * sh.target.radius*0.014;
        sh.target.shakePhase += dt*32;
        const shk = new THREE.Vector3(
          Math.sin(sh.target.shakePhase*1.3),
          Math.sin(sh.target.shakePhase*1.7),
          Math.sin(sh.target.shakePhase*0.9)
        ).multiplyScalar(shakeAmt);
        sh.target.mesh.position.copy(sh.target.basePos).add(shk);
      }

      // odpryski/czasteczki + promien-piorun + ogniste slady na powierzchni
      const outward = new THREE.Vector3().subVectors(sh.pos, sh.target.mesh.position).normalize();
      const surfacePoint = new THREE.Vector3().addVectors(sh.target.mesh.position, outward.clone().multiplyScalar(sh.target.radius));

      // ksztalt zygzaka odswieza sie z mniejsza czestotliwoscia (efekt "trzasku"),
      // ale geometria promienia jest przebudowywana KAZDA RAMKE wedlug aktualnej
      // pozycji statku - dzieki temu promien plynnie ciagnie sie za statkiem,
      // gdy ten orbituje wokol planety po trafieniu
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

      if(sh.target.health <= 0){
        if(!NET_ENABLED && !sh.target.dying){
          // tryb offline: brak serwera do rozstrzygania "kto zadał ostatni cios",
          // więc zjedzenie rozstrzyga się od razu lokalnie, jak dawniej
          const gained = Math.round(sh.target.radius*14 + Math.abs(sh.target.temp)*8 + (sh.target.valueBonus||0));
          state.points += gained;
          state.eaten += 1;
          showToast("+"+gained+" pkt // planeta pochłonięta");
          const deadPlanet = sh.target;
          triggerBreakup(deadPlanet);
          destroyPlanet(deadPlanet);
          refreshDock();
          save();
        } else {
          // tryb sieciowy: serwer (bite_body RPC) rozstrzyga kto dostaje punkty,
          // wybuch i sprzątanie przychodzą przez Realtime DELETE dla wszystkich
          hideBolt(sh);
          sh.target = null;
        }
      }
    }
  }
}

export function disposeShip(sh){
  setShipSelected(sh, false);
  ctx.scene.remove(sh.mesh);
  sh.mesh.traverse(function(obj){
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material) obj.material.dispose();
  });
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
