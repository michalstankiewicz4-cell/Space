import { ctx } from "../core/context.js";
import {
  NET_SHIP_BROADCAST_MS, NET_REMOTE_PLAYER_TIMEOUT_MS, NET_GHOST_LERP_SPEED,
  NET_MAX_REMOTE_SHIPS, NET_MAX_REMOTE_PLAYERS, NET_MAX_NICK_LENGTH
} from "../config.js";
import { clientId, myIdentity } from "./identity.js";
import { state } from "../core/gameState.js";
import { updatePlayersHud } from "../ui/hud.js";
import { roomChannel } from "./connect.js";
import { t } from "../i18n.js";

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
    rp.nick = payload.nick.trim().slice(0, NET_MAX_NICK_LENGTH);
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
      delete ctx.remotePlayers[id];
      updatePlayersHud();
      return;
    }
    rp.meshes.forEach(function(m){
      if(m.userData.target) m.position.lerp(m.userData.target, Math.min(1, dt*NET_GHOST_LERP_SPEED));
    });
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
      ships: ctx.ships.map(function(sh){ return [sh.pos.x, sh.pos.y, sh.pos.z]; })
    }
  });
}
