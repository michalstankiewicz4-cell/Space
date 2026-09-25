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
import { buildStationMesh, disposeStationMesh } from "../station/stationModel.js";
import { STATION_MODEL_SCALE } from "../config.js";
import { buildDroneModel } from "../drone/drone.js";
import { sRGBTexture } from "../core/utils.js";

// Shared by every simple (non-station) ghost unit — a remote ship/drone is
// flat-recolored to its owner's color, simple enough for one solid tint to
// read fine on a cone/octahedron (unlike the station, see makeGhostStationMesh
// below). Only the geometry+orientation differ between ship and drone ghosts.
function makeGhostMesh(geo, colorHex){
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex, emissive: colorHex, emissiveIntensity:0.6,
    roughness:0.5, metalness:0.3, transparent:true, opacity:0.75
  });
  const mesh = new THREE.Mesh(geo, mat);
  ctx.scene.add(mesh);
  return mesh;
}

function makeGhostShipMesh(colorHex){
  const mesh = makeGhostMesh(new THREE.ConeGeometry(0.28, 0.9, 8), colorHex);
  mesh.rotation.x = Math.PI/2;
  return mesh;
}

// Another player's drone is the same ShipKit model as ours (drone/drone.js)
// in its own colors — not tinted: its owner is told apart by a name label
// floating above it (with a small marker in the owner's color), not by
// recoloring the ship. Built at low detail, no particles: there can be
// many of them. Its engines/offline/shots follow the owner's broadcast.
const GHOST_DRONE_DETAIL = 0.4;
const MAX_GHOST_SHOTS_PER_UPDATE = 2;

function makeNameLabel(nick, colorHex){
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
  sprite.scale.set(2.4, 0.45, 1);
  sprite.position.y = 1.3;
  return sprite;
}

function makeGhostDrone(rp){
  const mesh = new THREE.Group();
  const built = buildDroneModel(GHOST_DRONE_DETAIL);
  mesh.add(built.holder);
  const label = makeNameLabel(rp.nick, rp.color);
  mesh.add(label);
  ctx.scene.add(mesh);
  rp.droneModel = built.model;
  rp.droneLabel = label;
  rp.droneLabelNick = rp.nick;
  rp.dronePower = 0;
  rp.droneShots = null;
  return mesh;
}

function removeGhostDrone(rp){
  if(!rp.droneMesh) return;
  ShipKit.disposeShipModel(rp.droneModel);
  rp.droneLabel.material.map.dispose();
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

// Unlike the ghost ship/drone (flat-recolored to the owner's color, simple
// enough for that to read fine on a cone/octahedron), the station keeps its
// grey hull materials and only tints the window glow + accent stripe via
// buildStationMesh()'s own windowColor/opacity options — recoloring this
// much greebled detail to one solid color would just read as a blob. Same
// source of truth as the local station (station/station.js), so a ghost
// can never visually diverge from what a real station looks like.
function makeGhostStationMesh(colorHex){
  const mesh = buildStationMesh({ windowColor: colorHex, opacity: 0.8 });
  mesh.scale.setScalar(STATION_MODEL_SCALE);
  ctx.scene.add(mesh);
  return mesh;
}

function removeGhostStation(rp){
  if(!rp.stationMesh) return;
  disposeStationMesh(ctx.scene, rp.stationMesh);
  rp.stationMesh = null;
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
      nick: t("players.defaultName")
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
  while(rp.meshes.length > list.length) disposeMesh(ctx.scene, rp.meshes.pop());
  const d = Array.isArray(payload.drone) ? payload.drone : null;
  if(d){
    if(!rp.droneMesh) rp.droneMesh = makeGhostDrone(rp);
    const mesh = rp.droneMesh;
    setGhostTarget(mesh, safeCoord(d[0]), safeCoord(d[1]), safeCoord(d[2]));
    mesh.rotation.y = Number.isFinite(Number(d[3])) ? Number(d[3]) : mesh.rotation.y;
    if(rp.droneLabelNick !== rp.nick){          // nick changed: redraw the label
      mesh.remove(rp.droneLabel); rp.droneLabel.material.map.dispose();
      rp.droneLabel = makeNameLabel(rp.nick, rp.color); rp.droneLabelNick = rp.nick;
      mesh.add(rp.droneLabel);
    }
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
    if(!rp.stationMesh) rp.stationMesh = makeGhostStationMesh(rp.color);
    const mesh = rp.stationMesh;
    setGhostTarget(mesh, safeCoord(st[0]), safeCoord(st[1]), safeCoord(st[2]));
    mesh.rotation.y = Number.isFinite(Number(st[3])) ? Number(st[3]) : mesh.rotation.y;
  } else {
    removeGhostStation(rp);
  }

  for(let i=0;i<list.length;i++){
    const p = Array.isArray(list[i]) ? list[i] : [];
    setGhostTarget(rp.meshes[i], safeCoord(p[0]), safeCoord(p[1]), safeCoord(p[2]));
  }
}

let ghostT = 0;
export function updateRemoteShips(dt){
  ghostT += dt;
  const now = Date.now();
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const rp = ctx.remotePlayers[id];
    if(now - rp.lastSeen > NET_REMOTE_PLAYER_TIMEOUT_MS){
      rp.meshes.forEach(function(m){ disposeMesh(ctx.scene, m); });
      removeGhostDrone(rp);
      removeGhostStation(rp);
      delete ctx.remotePlayers[id];
      updatePlayersHud();
      return;
    }
    rp.meshes.forEach(function(m){ lerpGhost(m, dt); });
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
