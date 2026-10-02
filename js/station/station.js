import { ctx } from "../core/context.js";
import { makeStationVisual } from "./stationVisual.js";
import { STATION_PICK_RADIUS, STATION_FIELD_RADIUS } from "../config.js";
import { STATION_RING, orbitPoint } from "../world/solarSystem.js";
import { clientId } from "../net/identity.js";
import { isConnected } from "../net/connect.js";
import { othersOnline } from "../net/presence.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { camState, setCameraMode } from "../scene/camera.js";
import { showToast } from "../ui/hud/eventLog.js";
import { t } from "../i18n.js";

// Purely a selection indicator (ring), same pattern as ships/drone — never
// touches camState/ctx.camera (see setDroneSelected in drone.js for the
// same RTS-style reasoning: selecting something never moves the camera).
export function setStationSelected(station, val){
  station.selected = val;
  station.selectionRing.visible = val;
}

function makePickMesh(radius){
  const geo = new THREE.SphereGeometry(radius, 12, 10);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  return new THREE.Mesh(geo, mat);
}

function makeSelectionRing(radius){
  const ringGeo = new THREE.RingGeometry(radius * 0.96, radius * 1.04, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4fe3c6, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  return ring;
}

// Deterministic angle on the station ring (orbit 4, world/solarSystem.js)
// from this client's own stable identity — a station never relocates on
// unrelated presence churn (someone else joining/leaving), unlike a
// rank-based scheme would. Simple string hash (not cryptographic, doesn't
// need to be), scaled to [0, 2*PI).
function angleFromClientId(id){
  let h = 0;
  for(let i=0;i<id.length;i++){ h = (h * 31 + id.charCodeAt(i)) >>> 0; }
  return (h / 0xffffffff) * Math.PI * 2;
}

// A single extra world object per player, one instance (ctx.station),
// same "singleton, not an array" shape as ctx.drone — not part of
// ctx.ships. Unlike the drone/ships it never moves once spawned: no
// fuel, no commands, just a landmark with a selectable docking panel
// (see ui/hud/stationPanel.js). If it ever needs to move/rotate, give it an
// updateStation(dt) wired into main.js's tick() the same way updateDrone()
// is — deliberately skipped for now, no per-frame work needed yet.
export function spawnStation(){
  // The look is ShipKit's ST-04 HAVEN (stationVisual.js), already sized in
  // world units inside its own holder — this group is never scaled.
  const visual = makeStationVisual();
  const mesh = new THREE.Group();
  mesh.add(visual.root);

  // The kept angle (see "a free spot on the ring" below), else the hashed one.
  const saved = parseFloat(readStorage(SLOT_KEY));
  const angle = isFinite(saved) ? saved : angleFromClientId(clientId);
  const pos = orbitPoint(STATION_RING.a, STATION_RING.b, STATION_RING.inc, STATION_RING.node, angle);
  const heading = angle + Math.PI; // face back toward the sun, a stable/readable default
  mesh.position.copy(pos);
  mesh.rotation.y = heading;

  // Pick sphere / selection ring around the habitat ring (world units).
  const pickMesh = makePickMesh(STATION_PICK_RADIUS);
  mesh.add(pickMesh);
  const selectionRing = makeSelectionRing(STATION_PICK_RADIUS);
  mesh.add(selectionRing);

  ctx.scene.add(mesh);

  const station = {
    mesh: mesh, visual: visual, pickMesh: pickMesh, selectionRing: selectionRing,
    selected: false, pos: pos, heading: heading, angle: angle
  };
  pickMesh.userData.station = station;
  ctx.station = station;
  return station;
}

// ---------- a free spot on the ring ----------
// The hashed angle can land on another player's station. The newcomer
// yields: on the first connection in this browser, once the stations of
// the players online have arrived, a station overlapping one of them moves
// to the nearest free spot. The angle is then kept (localStorage) and never
// changes again, so a station already standing never moves for a newcomer.
// Players offline at that moment aren't known — rare, accepted (a server
// reservation would need a table of its own).
const SLOT_KEY = "roj-station-angle";
const MIN_GAP = STATION_FIELD_RADIUS * 2 + 4;   // the two fields don't touch
const SETTLE_MIN_MS = 4000, SETTLE_MAX_MS = 12000;   // presence + the first broadcasts; give up waiting after
let slotTimer = 0, connectedAt = 0;

function remoteStationPositions(){
  const out = [];
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const m = ctx.remotePlayers[id].stationMesh;
    if(m) out.push(m.userData.target || m.position);
  });
  return out;
}

function isFree(angle, others){
  const p = orbitPoint(STATION_RING.a, STATION_RING.b, STATION_RING.inc, STATION_RING.node, angle);
  return others.every(function(o){ return p.distanceTo(o) >= MIN_GAP; });
}

// The nearest free angle, searching both ways in 1° steps; null if the ring is full.
function nearestFreeAngle(angle, others){
  const step = Math.PI / 180;
  for(let k = 0; k <= 180; k++){
    for(const s of k ? [1, -1] : [1]){
      const a = ((angle + s * k * step) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if(isFree(a, others)) return a;
    }
  }
  return null;
}

// Moves the station, and the fleet and drone parked in its field with it.
function moveStation(angle){
  const st = ctx.station;
  const to = orbitPoint(STATION_RING.a, STATION_RING.b, STATION_RING.inc, STATION_RING.node, angle);
  const delta = to.clone().sub(st.pos);
  const parked = function(p){ return p.distanceTo(st.pos) < STATION_FIELD_RADIUS; };
  ctx.ships.forEach(function(sh){
    if(parked(sh.pos)){ sh.pos.add(delta); sh.mesh.position.copy(sh.pos); }
  });
  if(ctx.drone && parked(ctx.drone.pos)){ ctx.drone.pos.add(delta); ctx.drone.mesh.position.copy(ctx.drone.pos); }
  st.pos.copy(to);
  st.mesh.position.copy(to);
  st.angle = angle;
  st.heading = angle + Math.PI;
  st.mesh.rotation.y = st.heading;
  if(camState.mode === "base") setCameraMode("base");   // glides to the new spot
}

function checkSlot(){
  if(!ctx.station || !isConnected()){ connectedAt = 0; return; }
  const now = performance.now();
  if(!connectedAt) connectedAt = now;
  const waited = now - connectedAt;
  if(waited < SETTLE_MIN_MS) return;
  const others = remoteStationPositions();
  if(others.length < othersOnline() && waited < SETTLE_MAX_MS) return;   // not every station seen yet
  clearInterval(slotTimer);
  let angle = ctx.station.angle;
  if(!isFree(angle, others)){
    const free = nearestFreeAngle(angle, others);
    if(free !== null){
      angle = free;
      moveStation(angle);
      showToast(t("toast.stationMoved"));
    }
  }
  writeStorage(SLOT_KEY, String(angle));
}

// Once per browser: nothing to do when the angle is already kept.
export function initStationSlot(){
  if(isFinite(parseFloat(readStorage(SLOT_KEY)))) return;
  slotTimer = setInterval(checkSlot, 500);
}
