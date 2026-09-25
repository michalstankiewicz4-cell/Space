import { ctx } from "../core/context.js";
import { gfxDetail, gfxParticles, onGraphicsChange } from "../scene/graphics.js";
import { SHIP_MODEL_LENGTH, SHIP_LOD_DISTANCE } from "../config.js";

// A swarm ship's look, shared by the player's own ships (ships/swarm.js)
// and other players' ghosts (net/shipsBroadcast.js): ShipKit's SW-01
// SWARMER (js/shipkit/shipkit.js, the ship lab's model) up close, and the
// old light teal cone further than SHIP_LOD_DISTANCE from the camera —
// in this solar system's scale ships are specks most of the time, and a
// few dozen full models would cost far more than they show. The model is
// built only the first time it's needed (merged static meshes, effects in
// the scene) and kept; it's always shown for a ship that's selected (its
// miniature) or seen through the ship cam (`forceDetail`).
// Other players' ships are never tinted (the user's call): they get a
// small marker in their owner's color floating above them instead.
const all = new Set();
const wreckage = [];
let animT = 0;
const camPos = new THREE.Vector3(), here = new THREE.Vector3();

let markerTex = null;
function markerTexture(){
  if(markerTex) return markerTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 32); g.lineTo(32, 58); g.lineTo(8, 32); g.closePath();
  g.fillStyle = "#ffffff"; g.fill();
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.75)"; g.stroke();
  markerTex = new THREE.CanvasTexture(c);
  markerTex.encoding = THREE.sRGBEncoding;
  return markerTex;
}

function makeCone(){
  const mat = new THREE.MeshStandardMaterial({ color: 0x4fe3c6, emissive: 0x1fae95, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.4 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 8), mat);
  cone.rotation.x = Math.PI / 2;
  return cone;
}

// opts: { remote: true, markerColor: "#rrggbb" } for another player's ship
export function makeShipVisual(opts){
  const remote = !!(opts && opts.remote);
  const root = new THREE.Group();
  const cone = makeCone();
  root.add(cone);
  let marker = null;
  if(remote && opts.markerColor){
    marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), color: opts.markerColor, sizeAttenuation: false, depthTest: false, transparent: true }));
    marker.scale.set(0.014, 0.014, 1);
    marker.position.y = 0.65;
    marker.renderOrder = 10;
    marker.userData.shipkit = true; // exact owner color, not converted (scene/colorManagement.js)
    root.add(marker);
  }
  const v = {
    root: root, model: null, holder: null, remote: remote,
    throttle: 0, forceDetail: false, near: false,
    // target 0..1 engine power; eased here
    power: 0,
    build: function(){
      const detail = remote ? Math.min(gfxDetail(), 1) * 0.3 : gfxDetail() * 0.5;
      v.model = ShipKit.buildShipModel("swarmer", { detail: Math.max(0.2, detail), merge: true, fxRoot: ctx.scene });
      v.holder = ShipKit.makeGameHolder(v.model, SHIP_MODEL_LENGTH);
      root.add(v.holder);
    },
    dropModel: function(){
      if(!v.model) return;
      root.remove(v.holder);
      ShipKit.disposeShipModel(v.model);
      v.model = v.holder = null;
    },
    update: function(dt){
      root.getWorldPosition(here);
      v.near = v.forceDetail || here.distanceTo(camPos) < SHIP_LOD_DISTANCE;
      if(v.near && !v.model) v.build();
      cone.visible = !v.near;
      if(v.holder) v.holder.visible = v.near;
      if(!v.near || !v.model) return;
      v.throttle += (v.power - v.throttle) * Math.min(1, dt * 3);
      v.model.update(animT, dt, { power: v.throttle, particles: gfxParticles() && !remote });
    },
    // Ship removed normally (fleet resized, player left): free everything.
    dispose: function(){
      v.dropModel();
      all.delete(v);
      if(marker) marker.material.dispose();
    },
    // Ship destroyed (black hole): the model blows apart and its wreck is
    // cleaned up later. `wreckRoot` is the group to take out of the scene
    // then; returns false when there's no model to blow up (far away).
    explode: function(wreckRoot){
      all.delete(v);
      if(!v.model || !v.near) return false;
      v.model.act("destroy");
      wreckage.push({ v: v, root: wreckRoot, t: 7 });
      return true;
    }
  };
  all.add(v);
  return v;
}

// Every frame, after the ships have moved.
export function updateShipVisuals(dt){
  animT += dt;
  if(!ctx.camera) return;
  ctx.camera.getWorldPosition(camPos);
  all.forEach(function(v){ v.update(dt); });
  for(let i = wreckage.length - 1; i >= 0; i--){
    const w = wreckage[i];
    w.v.model.update(animT, dt, { particles: gfxParticles() });
    if((w.t -= dt) <= 0){
      w.v.dropModel();                                     // shared ShipKit materials stay
      if(w.root.parent) w.root.parent.remove(w.root);
      w.root.traverse(function(o){ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
      wreckage.splice(i, 1);
    }
  }
}

// Geometry detail changed: drop the models, they rebuild on next use.
onGraphicsChange(function(before){
  if(before.detail === gfxDetail()) return;
  all.forEach(function(v){ v.dropModel(); });
});
