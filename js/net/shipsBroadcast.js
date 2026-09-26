import { ctx } from "../core/context.js";
import { disposeMesh } from "../core/utils.js";
import { NET_SHIP_BROADCAST_MS, NET_REMOTE_PLAYER_TIMEOUT_MS, NET_GHOST_LERP_SPEED, NET_MAX_REMOTE_SHIPS, NET_MAX_REMOTE_PLAYERS, NET_MAX_NICK_LENGTH, DRONE_PRINT_MAX_LEN } from "../config.js";
import { clientId, myIdentity } from "./identity.js";
import { state } from "../core/gameState.js";
import { updatePlayersHud } from "../ui/hud/topBar.js";
import { roomChannel } from "./connect.js";
import { containsProfanity } from "../moderation.js";
import { t } from "../i18n.js";
import { spawnPrintEffect } from "../drone/dronePrintFx.js";
import { makeStationVisual } from "../station/stationVisual.js";
import { STATION_PICK_RADIUS } from "../config.js";
import { buildDroneModel } from "../drone/drone.js";
import { makeShipVisual, makeOwnerMarker } from "../ships/shipVisual.js";
import { sRGBTexture } from "../core/utils.js";

// Another player's ship: the same look as ours (ships/shipVisual.js — the
// ShipKit model up close, the cone far away), not tinted; a small marker
// in the owner's color tells whose it is. Turned to face where it's going.
function makeGhostShipMesh(colorHex){
  const group = new THREE.Group();
  const visual = makeShipVisual({ remote: true, markerColor: colorHex });
  group.add(visual.root);
  group.userData.visual = visual;
  group.userData.prev = new THREE.Vector3();
  ctx.scene.add(group);
  return group;
}

function disposeGhostShip(mesh){
  mesh.userData.visual.dispose();
  disposeMesh(ctx.scene, mesh);
}

// Another player's drone is the same ShipKit model as ours (drone/drone.js)
// in its own colors — not tinted: like their ships it carries the owner's
// diamond marker (ships/shipVisual.js#makeOwnerMarker); only the station
// shows the owner's name. Built at low detail, no particles: there can be
// many of them. Its engines/offline/shots follow the owner's broadcast.
const GHOST_DRONE_DETAIL = 0.4;
const MAX_GHOST_SHOTS_PER_UPDATE = 2;

// The owner's name over their station (only there; ships and drones get the
// diamond marker). opts: { y, width } — where it floats and how wide it is (world units)
function makeNameLabel(nick, colorHex, opts){
  opts = opts || {};
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  g.font = '500 44px "Oswald", "Arial Narrow", sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)"; g.shadowBlur = 8;
  g.fillStyle = "#eef1ff";
  g.fillText(nick, 256, 42);
  g.shadowBlur = 0;
  g.fillStyle = colorHex;                      // the owner's marker
  g.fillRect(256 - 40, 78, 80, 6);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sRGBTexture(new THREE.CanvasTexture(c)), transparent: true, depthWrite: false }));
  sprite.userData.shipkit = true;              // already sRGB-correct (scene/colorManagement.js)
  const w = opts.width || 2.4;
  sprite.scale.set(w, w * 0.1875, 1);
  sprite.position.y = opts.y !== undefined ? opts.y : 1.3;
  return sprite;
}

function makeGhostDrone(rp){
  const mesh = new THREE.Group();
  const built = buildDroneModel(GHOST_DRONE_DETAIL);
  mesh.add(built.holder);
  mesh.add(makeOwnerMarker(rp.color, 1.1));
  ctx.scene.add(mesh);
  rp.droneModel = built.model;
  rp.dronePower = 0;
  rp.droneShots = null;
  return mesh;
}

function removeGhostDrone(rp){
  if(!rp.droneMesh) return;
  ShipKit.disposeShipModel(rp.droneModel);
  disposeMesh(ctx.scene, rp.droneMesh);
  rp.droneMesh = null;
  rp.droneModel = null;
}

// The "target vector + snap-to-target on first sighting" bookkeeping below
// is identical for every ghost kind (ships, drone, station) — a ghost only
// ever learns a new position from a broadcast payload, never moves on its
// own, so lerpGhost() (used in updateRemoteShips()) can smoothly interpolate
// toward whatever this last set, except on the very first sighting where
// snapping avoids an initial lerp-in from the scene origin.
function setGhostTarget(mesh, x, y, z){
  if(!mesh.userData.target) mesh.userData.target = new THREE.Vector3();
  mesh.userData.target.set(x, y, z);
  if(!mesh.userData.inited){
    mesh.position.copy(mesh.userData.target);
    mesh.userData.inited = true;
  }
}

function lerpGhost(mesh, dt){
  if(mesh.userData.target) mesh.position.lerp(mesh.userData.target, Math.min(1, dt*NET_GHOST_LERP_SPEED));
}

// Another player's station: the same ShipKit model as ours
// (station/stationVisual.js), not tinted — like their drone, a name label
// with a bar in the owner's color floats above it.
const STATION_LABEL = { y: 5.2, width: 5 };

function makeGhostStation(rp){
  const mesh = new THREE.Group();
  const visual = makeStationVisual({ remote: true });
  mesh.add(visual.root);
  const label = makeNameLabel(rp.nick, rp.color, STATION_LABEL);
  mesh.add(label);
  // selectable (scene/controls.js#clickRemoteStation): an invisible pick
  // sphere around the ring, like our own station's
  const pickMesh = new THREE.Mesh(new THREE.SphereGeometry(STATION_PICK_RADIUS, 12, 10), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.add(pickMesh);
  ctx.scene.add(mesh);
  rp.stationVisual = visual;
  rp.stationLabel = label;
  rp.stationLabelNick = rp.nick;
  // The handle selection, the info panel, the minimap and the camera focus
  // use; alive() turns false when the owner leaves or stops sending it.
  rp.stationRef = {
    kind: "remoteStation", rp: rp, group: mesh, pickMesh: pickMesh,
    radius: STATION_PICK_RADIUS, frameRadius: STATION_PICK_RADIUS, focusDistance: 16,
    selected: false,
    alive: function(){ return rp.stationMesh === mesh && !!ctx.remotePlayers[rp.id]; }
  };
  pickMesh.userData.remoteStation = rp.stationRef;
  return mesh;
}

function removeGhostStation(rp){
  if(!rp.stationMesh) return;
  rp.stationVisual.dispose();
  rp.stationLabel.material.map.dispose();
  disposeMesh(ctx.scene, rp.stationMesh);
  rp.stationMesh = null;
  rp.stationVisual = null;
  if(rp.stationRef) rp.stationRef.selected = false;
  rp.stationRef = null;
}

function isValidHexColor(c){
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

function safeCoord(v){
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-1000, Math.min(1000, n)) : 0;
}

// Broadcast has no server-side validation whatsoever — the payload can be
// crafted by any client, straight over the WebSocket, bypassing our UI
// entirely. So everything coming from here is treated as untrusted and
// clamped/validated before it ever reaches the scene (see NET_MAX_* in
// config.js).
export function handleRemoteShips(payload){
  if(!payload || typeof payload.id !== "string" || payload.id === clientId) return;
  let rp = ctx.remotePlayers[payload.id];
  if(!rp){
    if(Object.keys(ctx.remotePlayers).length >= NET_MAX_REMOTE_PLAYERS) return;
    rp = ctx.remotePlayers[payload.id] = {
      meshes: [],
      color: isValidHexColor(payload.color) ? payload.color : "#ff7a45",
      nick: t("players.defaultName"),
      id: payload.id
    };
    updatePlayersHud();
  }
  rp.lastSeen = Date.now();
  if(typeof payload.nick === "string" && payload.nick.trim()){
    // Own-nick confirmation already blocks profanity (see net/identity.js),
    // but that's a courtesy, not a security boundary — a modified client
    // can broadcast anything straight over the WebSocket. Re-checking here
    // means everyone else still sees a clean fallback name regardless.
    const candidate = payload.nick.trim().slice(0, NET_MAX_NICK_LENGTH);
    rp.nick = containsProfanity(candidate) ? t("players.defaultName") : candidate;
  }
  rp.points = Number.isFinite(Number(payload.points)) ? Number(payload.points) : rp.points;
  rp.eaten = Number.isFinite(Number(payload.eaten)) ? Number(payload.eaten) : rp.eaten;

  const list = Array.isArray(payload.ships) ? payload.ships.slice(0, NET_MAX_REMOTE_SHIPS) : [];
  while(rp.meshes.length < list.length) rp.meshes.push(makeGhostShipMesh(rp.color));
  while(rp.meshes.length > list.length) disposeGhostShip(rp.meshes.pop());
  const d = Array.isArray(payload.drone) ? payload.drone : null;
  if(d){
    if(!rp.droneMesh) rp.droneMesh = makeGhostDrone(rp);
    const mesh = rp.droneMesh;
    setGhostTarget(mesh, safeCoord(d[0]), safeCoord(d[1]), safeCoord(d[2]));
    mesh.rotation.y = Number.isFinite(Number(d[3])) ? Number(d[3]) : mesh.rotation.y;
    // [4] engine power 0..1, [5] offline 0/1, [6] shots fired so far,
    // [7..9] the last shot's target — all untrusted, clamped here.
    const power = Number(d[4]);
    rp.dronePower = Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0;
    const off = d[5] === 1;
    if(off !== rp.droneModel.offline) rp.droneModel.act("offline", off);
    const shots = Number(d[6]);
    if(Number.isInteger(shots) && shots >= 0){
      if(rp.droneShots !== null && shots > rp.droneShots && !off){
        const target = new THREE.Vector3(safeCoord(d[7]), safeCoord(d[8]), safeCoord(d[9]));
        for(let k = 0; k < Math.min(MAX_GHOST_SHOTS_PER_UPDATE, shots - rp.droneShots); k++) rp.droneModel.act("fire", { target: target });
      }
      rp.droneShots = shots;
    }
  } else {
    removeGhostDrone(rp);
  }

  const st = Array.isArray(payload.station) ? payload.station : null;
  if(st){
    if(!rp.stationMesh) rp.stationMesh = makeGhostStation(rp);
    const mesh = rp.stationMesh;
    setGhostTarget(mesh, safeCoord(st[0]), safeCoord(st[1]), safeCoord(st[2]));
    mesh.rotation.y = Number.isFinite(Number(st[3])) ? Number(st[3]) : mesh.rotation.y;
    if(rp.stationLabelNick !== rp.nick){        // nick changed: redraw the label
      mesh.remove(rp.stationLabel); rp.stationLabel.material.map.dispose();
      rp.stationLabel = makeNameLabel(rp.nick, rp.color, STATION_LABEL); rp.stationLabelNick = rp.nick;
      mesh.add(rp.stationLabel);
    }
  } else {
    removeGhostStation(rp);
  }

  for(let i=0;i<list.length;i++){
    const p = Array.isArray(list[i]) ? list[i] : [];
    setGhostTarget(rp.meshes[i], safeCoord(p[0]), safeCoord(p[1]), safeCoord(p[2]));
  }
}

let ghostT = 0;
const ghostDelta = new THREE.Vector3(), ghostLook = new THREE.Vector3();
export function updateRemoteShips(dt){
  ghostT += dt;
  const now = Date.now();
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const rp = ctx.remotePlayers[id];
    if(now - rp.lastSeen > NET_REMOTE_PLAYER_TIMEOUT_MS){
      rp.meshes.forEach(disposeGhostShip);
      removeGhostDrone(rp);
      removeGhostStation(rp);
      delete ctx.remotePlayers[id];
      updatePlayersHud();
      return;
    }
    rp.meshes.forEach(function(m){
      m.userData.prev.copy(m.position);
      lerpGhost(m, dt);
      // face the direction of travel; engines follow the speed
      const moved = ghostDelta.subVectors(m.position, m.userData.prev);
      const speed = moved.length() / Math.max(dt, 1e-4);
      if(speed > 0.05) m.lookAt(ghostLook.addVectors(m.position, moved));
      m.userData.visual.power = Math.min(1, speed / 1.2);
    });
    if(rp.droneMesh){
      lerpGhost(rp.droneMesh, dt);
      rp.droneModel.update(ghostT, dt, { power: rp.dronePower, particles: false });
    }
    if(rp.stationMesh) lerpGhost(rp.stationMesh, dt);
  });
}

function droneSnapshot(dr){
  const tg = dr.shotTarget || dr.pos;
  const r2 = function(v){ return Math.round(v * 100) / 100; };
  return [dr.pos.x, dr.pos.y, dr.pos.z, dr.heading, r2(dr.visPower), dr.fuel <= 0 ? 1 : 0, dr.shots % 100000, r2(tg.x), r2(tg.y), r2(tg.z)];
}

let lastShipBroadcast = 0;
export function maybeBroadcastShips(nowMs){
  if(!roomChannel || nowMs - lastShipBroadcast < NET_SHIP_BROADCAST_MS) return;
  lastShipBroadcast = nowMs;
  roomChannel.send({
    type: "broadcast", event: "ships",
    payload: {
      id: clientId, nick: myIdentity.nick, color: myIdentity.color,
      points: state.points, eaten: state.eaten,
      ships: ctx.ships.map(function(sh){ return [sh.pos.x, sh.pos.y, sh.pos.z]; }),
      // drone: position, heading, then what its model shows (see handleRemoteShips)
      drone: ctx.drone ? droneSnapshot(ctx.drone) : null,
      station: ctx.station ? [ctx.station.pos.x, ctx.station.pos.y, ctx.station.pos.z, ctx.station.heading] : null
    }
  });
}

// print()'s in-world effect (see drone.js) is a one-shot event, not
// ongoing state like ship/drone positions, so it gets its own broadcast
// event instead of riding along on the periodic "ships" snapshot above —
// sent once immediately when print() runs, not on the NET_SHIP_BROADCAST_MS
// interval.
export function broadcastDronePrint(pos, heading, text){
  if(!roomChannel) return;
  roomChannel.send({
    type: "broadcast", event: "dronePrint",
    payload: { id: clientId, pos: [pos.x, pos.y, pos.z], heading: heading, text: String(text).slice(0, DRONE_PRINT_MAX_LEN) }
  });
}

export function handleRemoteDronePrint(payload){
  if(!payload || typeof payload.id !== "string" || payload.id === clientId) return;
  const p = Array.isArray(payload.pos) ? payload.pos : null;
  if(!p) return;
  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, DRONE_PRINT_MAX_LEN) : "";
  if(!text || containsProfanity(text)) return;
  const heading = Number.isFinite(Number(payload.heading)) ? Number(payload.heading) : 0;
  const pos = new THREE.Vector3(safeCoord(p[0]), safeCoord(p[1]), safeCoord(p[2]));
  const rp = ctx.remotePlayers[payload.id];
  const colorHex = rp && isValidHexColor(rp.color) ? parseInt(rp.color.slice(1), 16) : 0xff7a45;
  spawnPrintEffect(pos, heading, text, colorHex);
}
