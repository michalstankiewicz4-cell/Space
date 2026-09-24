// Procedural ring-and-hub station mesh — pure primitives (sphere/cylinder/
// cone/torus/box), no model files. Single source of truth shared by two
// callers: the local player's own station (js/station/station.js,
// spawnStation()) and every remote player's ghost station
// (js/net/shipsBroadcast.js, makeGhostStationMesh()) — same function,
// different opts (see buildStationMesh() below), so a ghost can never
// visually diverge from what a real station looks like.
//
// Proportions here (ring radius 23, etc.) are this file's own arbitrary
// native scale — callers shrink the whole returned group down for actual
// gameplay (see STATION_MODEL_SCALE in config.js) rather than these
// numbers changing.
import { disposeMesh } from "../core/utils.js";

export const STATION_RING_RADIUS = 23;
export const STATION_RING_TUBE = 2.3;
// Rough outer silhouette radius (ring + a small margin), used to size a
// pick sphere / selection ring that comfortably covers the hull without
// needing to reach the thin antenna booms exactly.
export const STATION_SILHOUETTE_RADIUS = STATION_RING_RADIUS + STATION_RING_TUBE + 2;

// Orients a unit-Y cylinder mesh so it spans exactly from a to b — the
// standard "cylinder between two points" trick (quaternion from the
// cylinder's default +Y axis to the actual span direction).
function beam(a, b, radiusTop, radiusBottom, material, segments){
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments || 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

// opts.windowColor: tints the window glow + hull accent stripe (default
// teal, matching the game's own palette) — the only thing that varies per
// caller. Ghost stations (other players, see net/shipsBroadcast.js) pass
// the owner's player color here instead, so "whose station is this" reads
// at a glance without flattening the whole hull to one solid color the way
// ghost ships/the ghost drone do (this model has too much greebled detail
// for that to read as anything but a blob).
// opts.opacity: < 1 makes every material transparent, for the same ghost
// use case.
export function buildStationMesh(opts){
  opts = opts || {};
  const windowColor = opts.windowColor !== undefined ? opts.windowColor : 0x4fe3c6;
  const opacity = opts.opacity !== undefined ? opts.opacity : 1;
  const transparent = opacity < 1;

  const hullDark = new THREE.MeshStandardMaterial({ color: 0x262b34, metalness: 0.65, roughness: 0.5, transparent, opacity });
  const hullMid = new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 0.55, roughness: 0.45, transparent, opacity });
  const hullPanel = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.7, roughness: 0.6, transparent, opacity });
  const accentMat = new THREE.MeshStandardMaterial({ color: windowColor, metalness: 0.4, roughness: 0.35, transparent, opacity });
  const windowMat = new THREE.MeshStandardMaterial({
    color: windowColor, emissive: windowColor, emissiveIntensity: 1.6, metalness: 0.1, roughness: 0.3, transparent, opacity
  });

  const station = new THREE.Group();

  // Central docking hub — a sphere with polar spires and an equatorial belt.
  const core = new THREE.Mesh(new THREE.SphereGeometry(6.4, 28, 18), hullDark);
  station.add(core);

  const coreBelt = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.55, 10, 40), hullMid);
  coreBelt.rotation.x = Math.PI / 2;
  station.add(coreBelt);

  const accentBelt = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.16, 8, 40), accentMat);
  accentBelt.rotation.x = Math.PI / 2;
  accentBelt.position.y = 1.1;
  station.add(accentBelt);

  [1, -1].forEach(function(sign){
    const spike = new THREE.Mesh(new THREE.ConeGeometry(2.1, 6, 14), hullPanel);
    spike.position.y = sign * (6.4 + 3);
    if(sign < 0) spike.rotation.x = Math.PI;
    station.add(spike);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 14), hullMid);
    collar.position.y = sign * 6.3;
    station.add(collar);
  });

  // Greebled hull detail scattered over the core sphere surface.
  for(let i = 0; i < 16; i++){
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), hullMid);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 1.3) - 0.65); // bias away from poles (spires live there)
    const r = 6.5;
    box.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    box.lookAt(0, 0, 0);
    station.add(box);
  }

  // Outer habitat ring.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(STATION_RING_RADIUS, STATION_RING_TUBE, 18, 72), hullDark);
  station.add(ring);

  const ringStripe = new THREE.Mesh(new THREE.TorusGeometry(STATION_RING_RADIUS, 0.22, 8, 72), accentMat);
  ringStripe.position.y = STATION_RING_TUBE * 0.95;
  station.add(ringStripe);

  // Lit windows running around the ring's outer face.
  const windowCount = 110;
  for(let i = 0; i < windowCount; i++){
    const angle = (i / windowCount) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.15), windowMat);
    const rr = STATION_RING_RADIUS + STATION_RING_TUBE - 0.05;
    win.position.set(Math.cos(angle) * rr, (i % 2 === 0 ? 0.7 : -0.7), Math.sin(angle) * rr);
    win.lookAt(win.position.clone().multiplyScalar(2));
    station.add(win);
  }

  // Six pylons (alternating upper/lower) connecting the core to the ring,
  // each capped with a torus "docking port" at the ring end.
  const pylonCount = 6;
  for(let i = 0; i < pylonCount; i++){
    const angle = (i / pylonCount) * Math.PI * 2;
    const upper = i % 2 === 0;
    const yEnd = upper ? 5.5 : -5.5;

    const start = new THREE.Vector3(Math.cos(angle) * 7.2, upper ? 2.4 : -2.4, Math.sin(angle) * 7.2);
    const end = new THREE.Vector3(Math.cos(angle) * STATION_RING_RADIUS, yEnd, Math.sin(angle) * STATION_RING_RADIUS);

    station.add(beam(start, end, 0.55, 0.85, hullMid, 8));

    const port = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 10, 20), hullPanel);
    port.position.copy(end);
    const portDir = end.clone().sub(start).normalize();
    port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), portDir);
    station.add(port);

    const portGlow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), windowMat);
    portGlow.position.copy(end).addScaledVector(portDir, 0.3);
    portGlow.quaternion.copy(port.quaternion);
    station.add(portGlow);
  }

  // Two long antenna/sensor booms jutting outward, for silhouette variety.
  [1, -1].forEach(function(sign){
    const tip = new THREE.Vector3(sign * 34, sign * 3, sign * -6);
    const base = new THREE.Vector3(sign * 6.5, sign * 1, sign * -2);
    station.add(beam(base, tip, 0.18, 0.4, hullPanel, 6));
    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), windowMat);
    tipLight.position.copy(tip);
    station.add(tipLight);
  });

  return station;
}

// Thin wrapper around core/utils.js#disposeMesh, kept exported from here so
// callers (see net/shipsBroadcast.js#removeGhostStation) don't need to know
// this model happens to share ~150+ sub-meshes' worth of materials — that
// dedupe-before-dispose behavior now lives once, in the shared helper.
export function disposeStationMesh(scene, group){
  disposeMesh(scene, group);
}
