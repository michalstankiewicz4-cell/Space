import { ctx } from "../core/context.js";
import { buildStationMesh, STATION_SILHOUETTE_RADIUS } from "./stationModel.js";
import { STATION_SPAWN_RADIUS, STATION_MODEL_SCALE } from "../config.js";

// Purely a selection indicator (ring), same pattern as ships/drone — never
// touches camState/ctx.camera (see setDroneSelected in drone.js for the
// same RTS-style reasoning: selecting something never moves the camera).
export function setStationSelected(station, val){
  station.selected = val;
  station.selectionRing.visible = val;
}

function makePickMesh(radiusNative){
  const geo = new THREE.SphereGeometry(radiusNative, 12, 10);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  return new THREE.Mesh(geo, mat);
}

function makeSelectionRing(radiusNative){
  const ringGeo = new THREE.RingGeometry(radiusNative * 0.96, radiusNative * 1.04, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4fe3c6, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  return ring;
}

// A single extra world object per player, one instance (ctx.station),
// same "singleton, not an array" shape as ctx.drone — not part of
// ctx.ships. Unlike the drone/ships it never moves once spawned: no
// fuel, no commands, just a landmark with a selectable docking panel
// (see ui/stationPanel.js). If it ever needs to move/rotate, give it an
// updateStation(dt) wired into main.js's tick() the same way updateDrone()
// is — deliberately skipped for now, no per-frame work needed yet.
export function spawnStation(){
  const mesh = buildStationMesh();
  mesh.scale.setScalar(STATION_MODEL_SCALE);

  // Random point on a ring well outside both the ships' spawn cube (+-2,
  // see ships/swarm.js#spawnShip) and the drone's own spawn circle (radius
  // 6, see drone/drone.js#spawnDrone) — same reasoning as the drone's own
  // separation from the ships: picking priority puts singleton entities
  // before ships/planets on every click (scene/controls.js), so an
  // oversized/overlapping hitbox here could otherwise steal clicks meant
  // to command the fleet.
  const angle = Math.random() * Math.PI * 2;
  const pos = new THREE.Vector3(
    Math.cos(angle) * STATION_SPAWN_RADIUS,
    (Math.random() - 0.5) * 2,
    Math.sin(angle) * STATION_SPAWN_RADIUS
  );
  const heading = Math.random() * Math.PI * 2;
  mesh.position.copy(pos);
  mesh.rotation.y = heading;

  // Pick sphere / selection ring are sized in the model's own native
  // (pre-scale) units and added as children of the group, so
  // STATION_MODEL_SCALE shrinks them along with the visible hull
  // automatically — sizing them in already-scaled world units here would
  // double-apply the scale.
  const pickMesh = makePickMesh(STATION_SILHOUETTE_RADIUS);
  mesh.add(pickMesh);
  const selectionRing = makeSelectionRing(STATION_SILHOUETTE_RADIUS);
  mesh.add(selectionRing);

  ctx.scene.add(mesh);

  const station = {
    mesh: mesh, pickMesh: pickMesh, selectionRing: selectionRing,
    selected: false, pos: pos, heading: heading
  };
  pickMesh.userData.station = station;
  ctx.station = station;
  return station;
}
