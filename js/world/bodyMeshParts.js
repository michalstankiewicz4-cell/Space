import { sRGBTexture } from "../core/utils.js";
import { PLANET_BRACKET_SCALE } from "../config.js";

// Mesh-building helpers for a body's game-side decorations — split out of
// world/bodies.js#materializePlanet (same "model-building lives in its own
// file" split as the station's, station/stationVisual.js vs station.js).
// The bodies themselves (sun corona, comet tails, …) are
// BodyKit's now (world/bodyVisual.js); what's left here is the game's own
// selection bracket.

// Selection indicator for a planet: four L-shaped corner marks (a
// "targeting bracket", not a full ring like ships/drone/station use) —
// there's no way to draw that with a plain RingGeometry, so it's a
// canvas-drawn texture on a THREE.Sprite instead, same "canvas texture"
// approach as the drone print effect's gas+text sprites.
// A THREE.Sprite always faces the camera regardless of its parent's own
// rotation, so adding it as a child of the planet mesh at local (0,0,0)
// (matching how the ship/drone/station rings ride along as children) is
// safe whatever the mesh's rotation — the sprite doesn't inherit it, only
// the (unchanging, since it's at the origin) position. The texture is built once and cached — every planet's bracket
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
  bracketTexture = sRGBTexture(new THREE.CanvasTexture(canvas));
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
