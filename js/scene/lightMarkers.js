import { ctx } from "../core/context.js";

// Dev Tools debug visualization (see ui/hud/devTools.js) — a small "light bulb"
// icon at every light's world position, game-engine-editor style (Unity/
// Unreal-esque light gizmos): always drawn on top (depthTest:false), tinted
// to that light's own color, and kept at a constant apparent size on screen
// regardless of camera zoom, so it never gets lost inside — or shrinks to
// invisibility next to — whatever it's illuminating.
//
// The whole scene is traversed fresh every frame while enabled, rather than
// tracking a fixed list of "the lights we know about" (the two fixed scene
// lights from scene/setup.js, plus one per sun/ship/drone) — lights keep
// spawning and despawning as suns/ships come and go, so there's no static
// list that would stay correct; a generic `o.isLight` scan naturally covers
// all of them, including any added later, for free. AmbientLight is
// deliberately skipped — it has a `.position` (inherited from Object3D)
// but it's meaningless for an ambient light, which doesn't originate from
// a point the way every other light in this game does.
let enabled = false;
let pool = [];
const tmpPos = new THREE.Vector3();

let iconTexture = null;
function getIconTexture(){
  if(iconTexture) return iconTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const c2d = canvas.getContext("2d");
  const cx = size/2, cy = size/2, r = size*0.22;
  c2d.strokeStyle = "#ffffff";
  c2d.lineWidth = 3;
  c2d.lineCap = "round";
  for(let i=0;i<8;i++){
    const a = (i/8) * Math.PI*2;
    c2d.beginPath();
    c2d.moveTo(cx + Math.cos(a)*(r+3), cy + Math.sin(a)*(r+3));
    c2d.lineTo(cx + Math.cos(a)*(r+11), cy + Math.sin(a)*(r+11));
    c2d.stroke();
  }
  c2d.fillStyle = "#ffffff";
  c2d.beginPath(); c2d.arc(cx, cy, r, 0, Math.PI*2); c2d.fill();
  // White base texture, tinted per-instance via SpriteMaterial.color (see
  // updateLightMarkers) — one shared texture, same cached-canvas-texture
  // pattern as world/bodies.js's selection bracket.
  iconTexture = new THREE.CanvasTexture(canvas);
  return iconTexture;
}

function makeIcon(){
  const mat = new THREE.SpriteMaterial({
    map: getIconTexture(), transparent: true, depthTest: false, depthWrite: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999; // draw after (on top of) everything else
  return sprite;
}

function disposeIcon(s){
  ctx.scene.remove(s);
  s.material.dispose();
}

export function setLightMarkersVisible(val){
  enabled = val;
  if(!enabled){
    pool.forEach(disposeIcon);
    pool = [];
  }
}

export function updateLightMarkers(){
  if(!enabled || !ctx.scene || !ctx.camera || !ctx.renderer) return;

  const lights = [];
  ctx.scene.traverse(function(o){
    if(o.isLight && !o.isAmbientLight) lights.push(o);
  });

  while(pool.length < lights.length){ const s = makeIcon(); ctx.scene.add(s); pool.push(s); }
  while(pool.length > lights.length){ disposeIcon(pool.pop()); }

  // Constant-apparent-size trick: at distance 1 from the camera, a plane
  // filling `pixelWorldFactor` world-units tall fills the whole viewport
  // height — scaling by (desiredPx/viewportHeight) * pixelWorldFactor *
  // actualDistance keeps a fixed screen-space height at any zoom, the same
  // as an editor's light gizmo staying a fixed size regardless of how far
  // the camera is.
  const pixelWorldFactor = 2 * Math.tan((ctx.camera.fov * Math.PI/180) / 2);
  const desiredPx = 22;
  const viewportH = ctx.renderer.domElement.clientHeight || window.innerHeight;
  const camPos = ctx.camera.position;

  lights.forEach(function(light, i){
    const sprite = pool[i];
    light.getWorldPosition(tmpPos);
    sprite.position.copy(tmpPos);
    sprite.material.color.copy(light.color);
    const dist = camPos.distanceTo(tmpPos);
    sprite.scale.setScalar(Math.max(0.05, (desiredPx/viewportH) * pixelWorldFactor * dist));
  });
}
