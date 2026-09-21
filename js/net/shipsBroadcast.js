import { ctx } from "../core/context.js";
import {
  NET_SHIP_BROADCAST_MS, NET_REMOTE_PLAYER_TIMEOUT_MS, NET_GHOST_LERP_SPEED,
  NET_MAX_REMOTE_SHIPS, NET_MAX_REMOTE_PLAYERS, NET_MAX_NICK_LENGTH, DRONE_PRINT_MAX_LEN
} from "../config.js";
import { clientId, myIdentity } from "./identity.js";
import { state } from "../core/gameState.js";
import { updatePlayersHud } from "../ui/hud.js";
import { roomChannel } from "./connect.js";
import { containsProfanity } from "../moderation.js";
import { t } from "../i18n.js";
import { spawnPrintEffect } from "../drone/dronePrintFx.js";

function makeGhostShipMesh(colorHex){
  const geo = new THREE.ConeGeometry(0.28, 0.9, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex, emissive: colorHex, emissiveIntensity:0.6,
    roughness:0.5, metalness:0.3, transparent:true, opacity:0.75
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI/2;
  ctx.scene.add(mesh);
  return mesh;
}

// Same ghost treatment as a remote ship, but shaped like the drone
// (see drone/drone.js's makeDroneMesh) so another player's drone reads as
// a drone, tinted by owner color like their ships instead of drone gold —
// consistent with how every other remote unit is told apart.
function makeGhostDroneMesh(colorHex){
  const geo = new THREE.OctahedronGeometry(0.42, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex, emissive: colorHex, emissiveIntensity:0.6,
    roughness:0.5, metalness:0.3, transparent:true, opacity:0.75
  });
  const mesh = new THREE.Mesh(geo, mat);
  ctx.scene.add(mesh);
  return mesh;
}

function removeGhostDrone(rp){
  if(!rp.droneMesh) return;
  ctx.scene.remove(rp.droneMesh);
  rp.droneMesh.geometry.dispose();
  rp.droneMesh.material.dispose();
  rp.droneMesh = null;
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
  while(rp.meshes.length > list.length){
    const mOld = rp.meshes.pop();
    ctx.scene.remove(mOld);
    mOld.geometry.dispose(); mOld.material.dispose();
  }
  const d = Array.isArray(payload.drone) ? payload.drone : null;
  if(d){
    if(!rp.droneMesh) rp.droneMesh = makeGhostDroneMesh(rp.color);
    const mesh = rp.droneMesh;
    if(!mesh.userData.target) mesh.userData.target = new THREE.Vector3();
    mesh.userData.target.set(safeCoord(d[0]), safeCoord(d[1]), safeCoord(d[2]));
    mesh.rotation.y = Number.isFinite(Number(d[3])) ? Number(d[3]) : mesh.rotation.y;
    if(!mesh.userData.inited){
      mesh.position.copy(mesh.userData.target);
      mesh.userData.inited = true;
    }
  } else {
    removeGhostDrone(rp);
  }

  for(let i=0;i<list.length;i++){
    const mesh = rp.meshes[i];
    if(!mesh.userData.target) mesh.userData.target = new THREE.Vector3();
    const p = Array.isArray(list[i]) ? list[i] : [];
    mesh.userData.target.set(safeCoord(p[0]), safeCoord(p[1]), safeCoord(p[2]));
    if(!mesh.userData.inited){
      mesh.position.copy(mesh.userData.target);
      mesh.userData.inited = true;
    }
  }
}

export function updateRemoteShips(dt){
  const now = Date.now();
  Object.keys(ctx.remotePlayers).forEach(function(id){
    const rp = ctx.remotePlayers[id];
    if(now - rp.lastSeen > NET_REMOTE_PLAYER_TIMEOUT_MS){
      rp.meshes.forEach(function(m){ ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
      removeGhostDrone(rp);
      delete ctx.remotePlayers[id];
      updatePlayersHud();
      return;
    }
    rp.meshes.forEach(function(m){
      if(m.userData.target) m.position.lerp(m.userData.target, Math.min(1, dt*NET_GHOST_LERP_SPEED));
    });
    if(rp.droneMesh && rp.droneMesh.userData.target){
      rp.droneMesh.position.lerp(rp.droneMesh.userData.target, Math.min(1, dt*NET_GHOST_LERP_SPEED));
    }
  });
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
      drone: ctx.drone ? [ctx.drone.pos.x, ctx.drone.pos.y, ctx.drone.pos.z, ctx.drone.heading] : null
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
