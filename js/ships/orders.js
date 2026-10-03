import { EAT_ORBIT_GAP, SHIP_MODEL_LENGTH, STATION_FIELD_RADIUS } from "../config.js";
import { ctx } from "../core/context.js";
import { baseOn } from "../world/baseMarkers.js";
import { bodyLookRef } from "../world/bodyVisual.js";
import { t } from "../i18n.js";

// What a ship does when it reaches the body it was sent to (sh.order, set
// with the course by scene/controls.js#commandTo; the order menu,
// ui/hud/orderMenu.js, picks it):
//   "orbit"  — the default: it circles the body, no beam;
//   "attack" — it orbits low and bites (ships/swarm.js, as before);
//   "land"   — it comes down onto the surface and stays there, turning with
//              the planet: next to your surface base if the planet has one
//              (world/baseMarkers.js), else right under where it arrived.
// Both "orbit" and "land" keep the order (commandedTarget), so the ship stays
// gravity-immune (world/solarGravity.js) and the fleet memory keeps it.
//
// The target can also be another player's station (v2.35.0; its handle
// rp.stationRef, net/shipsBroadcast.js): "orbit" circles it just outside its
// protective field, "land" goes into the field and holds in its inner layer
// (DOCK_LAYER of the field's radius) — one place per ship, still relative to
// the station; "attack" isn't open against stations yet. Those orders aren't
// kept across a reload (the station may be gone by then).
export const ORDERS = ["orbit", "attack", "land"];
const ORBIT_GAP = EAT_ORBIT_GAP * 2;   // above the surface: higher than a feeding ship
const ORBIT_SPEED = 1.2;               // units/s along the orbit
const LAND_S = 4;                      // the descent, seconds
const BASE_SPREAD = 0.05;              // ships landing at a base stand this far apart (planet radii)
const STATION_ORBIT = STATION_FIELD_RADIUS + 2.5;   // just outside another station's field
const DOCK_LAYER = 0.55;               // the field's inner layer, where "land" holds (× its radius)

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const basis = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

export function orderOf(sh){ return sh.order || "attack"; }

export function isStation(b){ return !!b && b.kind === "remoteStation"; }
// Still there to fly to: a station whose owner is online, a body not gone.
export function targetAlive(b){
  if(!b) return false;
  return isStation(b) ? b.alive() : !b.dying && ctx.planets.indexOf(b) >= 0;
}
// Stations can't be attacked yet (the order menu shows it as coming).
export function canAttack(b){ return !isStation(b); }
// The status line's target: a station by its owner, else null (a body: the caller's name).
export function targetLabel(b){ return isStation(b) && b.rp ? t("orders.stationOf")(b.rp.nick) : null; }

// Only rocky planets have ground to stand on (BodyKit's planet kind — the
// surface lab's ground comes from the same look): not the Sun, the black
// hole, the meteoroid or a comet.
export function canLand(body){
  if(isStation(body)) return true;                      // into its field (not onto it)
  if(!body || body.orbitSlot == null || body.kind === "sun") return false;
  let ref;
  try{ ref = bodyLookRef(body.orbitSlot, body.kind); }catch(e){ return false; }
  const g = BodyKit.GROUPS.find(function(gr){ return gr.id === ref.groupId; });
  return !!g && g.build === "planet";
}

// A new order starts its manoeuvre afresh. `slot`: the ship's place in the
// group it was sent with (spreads ships landing at the same base).
export function resetOrder(sh, order, slot){
  sh.order = order;
  sh.orbit = null;
  sh.land = null;
  sh.dock = null;
  sh.landSlot = slot || 0;
}

// How close the ship flies before its order takes over.
export function arriveRange(sh, body){
  if(isStation(body)) return orderOf(sh) === "land" ? STATION_FIELD_RADIUS : STATION_ORBIT;
  return body.radius + (orderOf(sh) === "orbit" ? ORBIT_GAP : EAT_ORBIT_GAP);
}
function orbitRadius(body){ return isStation(body) ? STATION_ORBIT : body.radius + ORBIT_GAP; }

// The manoeuvre has begun: it no longer cruises even if it drifts out.
export function manoeuvring(sh){ return !!(sh.orbit || sh.land || sh.dock); }

function faceAlong(sh, up, fwd){
  v3.crossVectors(up, fwd).normalize();             // right = up × forward (the model's +Z is its nose)
  basis.makeBasis(v3, v1.crossVectors(fwd, v3).normalize(), fwd);
  sh.mesh.quaternion.setFromRotationMatrix(basis);
}

// "orbit": a circle in the plane of its arrival (where it was and where it
// was heading), around the moving body.
export function updateOrbit(sh, body, dt){
  const c = body.mesh.position;
  const R = orbitRadius(body);
  if(!sh.orbit){
    const a = v1.subVectors(sh.pos, c).normalize().clone();
    let n = v2.crossVectors(a, sh.vel);
    if(n.lengthSq() < 1e-6) n = v2.crossVectors(a, Math.abs(a.y) < 0.9 ? Y : X);
    n.normalize();
    sh.orbit = { a: a, b: new THREE.Vector3().crossVectors(n, a).normalize(), ang: 0 };
  }
  const o = sh.orbit;
  o.ang += ORBIT_SPEED / R * dt;
  const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
  const goal = v2.copy(o.a).multiplyScalar(ca * R).addScaledVector(o.b, sa * R).add(c);
  sh.pos.lerp(goal, 1 - Math.exp(-3 * dt));
  sh.vel.set(0, 0, 0);
  sh.mesh.position.copy(sh.pos);
  // nose along the orbit, belly to the planet
  const fwd = v3.copy(o.b).multiplyScalar(ca).addScaledVector(o.a, -sa).normalize().clone();
  faceAlong(sh, v1.subVectors(sh.pos, c).normalize().clone(), fwd);
  sh.visual.power = 0.25;
}

// "land": down onto the surface, in the planet's own turning frame
// (BodyKit's surfaceRoot: unit radius, +Y the north pole — the frame the
// base's lat/lon is in), so once down it turns with the planet.
export function updateLanding(sh, body, dt){
  const sr = body.look.body.surfaceRoot;
  sr.updateWorldMatrix(true, false);
  if(!sh.land){
    const here = sr.worldToLocal(v1.copy(sh.pos));
    const from = here.length();
    const start = here.clone().normalize();
    let spot = start.clone();
    const base = baseOn(bodyLookRef(body.orbitSlot, body.kind));
    if(base){
      const lat = base.lat * Math.PI / 180, lon = base.lon * Math.PI / 180;
      spot.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      // a ring around the base, one place per ship (none on the base itself)
      const east = new THREE.Vector3().crossVectors(Y, spot);
      if(east.lengthSq() < 1e-6) east.set(1, 0, 0);
      east.normalize();
      const north = new THREE.Vector3().crossVectors(spot, east);
      const k = sh.landSlot + 1, ang = k * 2.4, d = BASE_SPREAD * Math.sqrt(k);
      spot.addScaledVector(east, Math.cos(ang) * d).addScaledVector(north, Math.sin(ang) * d).normalize();
    }
    // a heading of its own on the ground: east, or along the meridian at a pole
    let head = new THREE.Vector3().crossVectors(Y, spot);
    if(head.lengthSq() < 1e-6) head.crossVectors(X, spot);
    head.normalize();
    // stands on the ground: the mountains' average lift and half the ship's height
    const ground = 1 + (body.look.body.values.mountains || 0) * 0.3 + SHIP_MODEL_LENGTH * 0.1 / body.radius;
    sh.land = { start: start, spot: spot, head: head, from: from, to: ground, t: 0 };
  }
  const L = sh.land;
  L.t = Math.min(1, L.t + dt / LAND_S);
  const e = L.t * L.t * (3 - 2 * L.t);
  const dir = v2.copy(L.start).lerp(L.spot, e).normalize();
  sr.localToWorld(v1.copy(dir).multiplyScalar(L.from + (L.to - L.from) * e));
  sh.pos.copy(v1);
  sh.vel.set(0, 0, 0);
  sh.mesh.position.copy(sh.pos);
  const up = v1.subVectors(sh.pos, body.mesh.position).normalize().clone();
  const fwd = v3.copy(L.head).transformDirection(sr.matrixWorld);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  faceAlong(sh, up, fwd.clone());
  sh.visual.power = L.t < 1 ? 0.5 * (1 - e) + 0.1 : 0;
}

// "land" at another player's station: into its field, then hold in the inner
// layer — a place of its own around the station (spread by the ship's slot),
// eased in, facing the station.
export function updateDock(sh, ref, dt){
  const c = ref.mesh.position;
  if(!sh.dock){
    const k = sh.landSlot, a = k * 2.39996 + 0.7, y = ((k % 3) - 1) * 0.35;
    sh.dock = { off: new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize().multiplyScalar(STATION_FIELD_RADIUS * DOCK_LAYER), in: false };
  }
  const goal = v2.copy(c).add(sh.dock.off);
  sh.pos.lerp(goal, 1 - Math.exp(-1.6 * dt));
  sh.vel.set(0, 0, 0);
  sh.mesh.position.copy(sh.pos);
  sh.mesh.lookAt(c);
  const d = sh.pos.distanceTo(goal);
  if(d < 0.25) sh.dock.in = true;
  sh.visual.power = sh.dock.in ? 0.08 : Math.min(0.6, 0.15 + d * 0.1);
}

// The status line for an ordered ship that isn't feeding (the fleet list
// and the unit panel); null: not one of these, the caller decides.
export function orderStatus(sh){
  if(!sh.commandedTarget || sh.running || sh.returning) return null;
  if(sh.land) return t(sh.land.t >= 1 ? "hud.landed" : "hud.landing");
  if(sh.dock) return t(sh.dock.in ? "hud.docked" : "hud.docking");
  if(sh.orbit) return t("hud.orbiting");
  return null;
}
