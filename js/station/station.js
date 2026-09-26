import { ctx } from "../core/context.js";
import { makeStationVisual } from "./stationVisual.js";
import { STATION_PICK_RADIUS } from "../config.js";
import { STATION_RING, orbitPoint } from "../world/solarSystem.js";
import { clientId } from "../net/identity.js";

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

  // Deterministic point on the station ring, not a random circle — see
  // angleFromClientId() above. No exact per-slot reservation (that would
  // need a new backend table, which the design explicitly avoids) — the
  // hash spreads angles evenly and player counts are small, so exact
  // overlap is rare in practice, and unlike a rank-based scheme this angle
  // never shifts just because some other player joined or left.
  const angle = angleFromClientId(clientId);
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
    selected: false, pos: pos, heading: heading
  };
  pickMesh.userData.station = station;
  ctx.station = station;
  return station;
}
