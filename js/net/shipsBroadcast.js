import { ctx } from "../core/context.js";
import { NET_SHIP_BROADCAST_MS, NET_REMOTE_PLAYER_TIMEOUT_MS, NET_GHOST_LERP_SPEED } from "../config.js";
import { clientId, myIdentity } from "./identity.js";
import { state } from "../core/gameState.js";
import { updatePlayersHud } from "../ui/hud.js";
import { roomChannel } from "./connect.js";

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

export function handleRemoteShips(payload){
  if(!payload || payload.id === clientId) return;
  let rp = ctx.remotePlayers[payload.id];
  if(!rp){
    rp = ctx.remotePlayers[payload.id] = { meshes: [], color: payload.color || "#ff7a45", nick: payload.nick || "Gracz" };
    updatePlayersHud();
  }
  rp.lastSeen = Date.now();
  rp.nick = payload.nick || rp.nick;
  rp.points = payload.points;
  rp.eaten = payload.eaten;
  const list = payload.ships || [];
  while(rp.meshes.length < list.length) rp.meshes.push(makeGhostShipMesh(rp.color));
  while(rp.meshes.length > list.length){
    const mOld = rp.meshes.pop();
    ctx.scene.remove(mOld);
    mOld.geometry.dispose(); mOld.material.dispose();
  }
  for(let i=0;i<list.length;i++){
    const mesh = rp.meshes[i];
    if(!mesh.userData.target) mesh.userData.target = new THREE.Vector3();
    mesh.userData.target.set(list[i][0], list[i][1], list[i][2]);
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
