import { CONTENT } from "../content.js";
import { PLANET_BRACKET_SCALE } from "../config.js";
import { makeSunRayTexture, makeCometTailTexture } from "./textures.js";

// Mesh-building helpers for a body's optional decorations — split out of
// world/bodies.js#materializePlanet (same "model-building lives in its own
// file" split already used for the station, see station/stationModel.js
// vs station.js). Each function here only builds and returns a THREE
// object; bodies.js decides when to call them and adds the result to its
// own mesh.

// Real 3D sun rays: thin planes (not a sprite/billboard) shot out in random
// directions in space and randomly rotated around their own axis ("roll") —
// this way, unlike a flat image always facing the camera, they have real
// parallax as the view rotates.
export function buildSunRays(radius){
  const group = new THREE.Group();
  const rayTexture = makeSunRayTexture();
  const s = CONTENT.sun;
  const up = new THREE.Vector3(0, 1, 0);

  for(let i=0;i<s.rayCount;i++){
    const long = i % 2 === 0;
    const length = radius * (long ? (s.rayLengthLongMin+Math.random()*s.rayLengthLongRange) : (s.rayLengthShortMin+Math.random()*s.rayLengthShortRange));
    const width = radius * (s.rayWidthMin + Math.random()*s.rayWidthRange);

    const geo = new THREE.PlaneGeometry(width, length);
    geo.translate(0, length/2, 0); // local (0,0,0) = ray base at the surface

    const mat = new THREE.MeshBasicMaterial({
      map: rayTexture, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(geo, mat);

    const dir = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()*2-1);
    if(dir.lengthSq() < 0.0001) dir.set(0,1,0);
    dir.normalize();
    plane.quaternion.setFromUnitVectors(up, dir);
    plane.rotateY(Math.random()*Math.PI*2); // random rotation around its own axis (now = dir)

    group.add(plane);
  }
  return group;
}

// Comet tail: two crossed planes (the classic "crossed billboard" trick -
// visible from almost any angle, unlike a single flat plane that disappears
// when seen "edge-on") trailing in the direction opposite to velocity. A
// comet's direction of travel is constant for its whole life, so we compute
// the orientation once, at creation.
export function buildCometTail(radius, vel){
  const group = new THREE.Group();
  if(!vel || vel.lengthSq() < 0.0001) return group;

  const length = radius * (CONTENT.comet.tailLengthMin + Math.random()*CONTENT.comet.tailLengthRange);
  const width = radius * (CONTENT.comet.tailWidthMin + Math.random()*CONTENT.comet.tailWidthRange);
  const geo = new THREE.PlaneGeometry(width, length);
  geo.translate(0, length/2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: makeCometTailTexture(), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  const dir = vel.clone().normalize().multiplyScalar(-1);
  const up = new THREE.Vector3(0, 1, 0);
  for(let i=0;i<2;i++){
    const plane = new THREE.Mesh(geo, mat);
    plane.quaternion.setFromUnitVectors(up, dir);
    plane.rotateY(i * Math.PI/2);
    group.add(plane);
  }
  return group;
}

// Selection indicator for a planet: four L-shaped corner marks (a
// "targeting bracket", not a full ring like ships/drone/station use) —
// there's no way to draw that with a plain RingGeometry, so it's a
// canvas-drawn texture on a THREE.Sprite instead, same "canvas texture"
// approach as the nebula skybox / drone print effect's gas+text sprites.
// A THREE.Sprite always faces the camera regardless of its parent's own
// rotation, so adding it as a child of the planet mesh at local (0,0,0)
// (matching how the ship/drone/station rings ride along as children) is
// safe even though the mesh itself spins (p.spin) — the sprite doesn't
// inherit that rotation, only the (unchanging, since it's at the origin)
// position. The texture is built once and cached — every planet's bracket
// reuses the same texture, just scaled per-instance by radius.
let bracketTexture = null;
function getBracketTexture(){
  if(bracketTexture) return bracketTexture;
  const size = 128, margin = 14, arm = 32, lineWidth = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext("2d");
  c2d.strokeStyle = "#ffffff";
  c2d.lineWidth = lineWidth;
  c2d.lineCap = "square";
  function corner(x, y, dx, dy){
    c2d.beginPath();
    c2d.moveTo(x + dx*arm, y);
    c2d.lineTo(x, y);
    c2d.lineTo(x, y + dy*arm);
    c2d.stroke();
  }
  corner(margin, margin, 1, 1);                       // top-left
  corner(size-margin, margin, -1, 1);                  // top-right
  corner(margin, size-margin, 1, -1);                  // bottom-left
  corner(size-margin, size-margin, -1, -1);             // bottom-right
  bracketTexture = new THREE.CanvasTexture(canvas);
  return bracketTexture;
}

export function buildSelectionBracket(radius){
  const bracketMat = new THREE.SpriteMaterial({
    map: getBracketTexture(), transparent: true, opacity: 0.95, depthWrite: false
  });
  const selectionBracket = new THREE.Sprite(bracketMat);
  selectionBracket.scale.setScalar(radius * PLANET_BRACKET_SCALE);
  selectionBracket.visible = false;
  return selectionBracket;
}

// Purely a selection indicator (bracket sprite), same RTS-style pattern as
// setShipSelected/setDroneSelected/setStationSelected — never touches the
// camera. Unlike those singletons, planets support MULTI-select (see
// scene/controls.js's planetSelectionOrder, needed for the dev-tools
// "connect selected planets" line), so this only toggles the one planet's
// own flag/bracket — the caller is responsible for tracking which planets
// are selected.
export function setPlanetSelected(p, val){
  p.selected = val;
  p.selectionBracket.visible = val;
}
