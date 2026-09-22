import { ctx } from "../core/context.js";
import { getSelectedPlanetsOrdered } from "./controls.js";

// Dev Tools debug visualization (see ui/devTools.js) — a single polyline
// through the currently multi-selected planets (scene/controls.js's
// planetSelectionOrder, built by shift-clicking planets, in click order),
// with a distance label at the midpoint of each segment. "Connect ... with
// A line" (singular) per the feature request — one path through all of
// them in selection order, not every pairwise connection.
let enabled = false;
let line = null;
let labels = [];

function getLabelTexture(text){
  const fontSize = 40;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "bold " + fontSize + "px 'Courier New', monospace";
  const w = Math.ceil(measure.measureText(text).width);
  const canvas = document.createElement("canvas");
  canvas.width = w + 24; canvas.height = fontSize + 16;
  const c2d = canvas.getContext("2d");
  c2d.font = "bold " + fontSize + "px 'Courier New', monospace";
  c2d.textBaseline = "middle"; c2d.textAlign = "center";
  c2d.shadowColor = "#ffe066"; c2d.shadowBlur = 14;
  c2d.fillStyle = "#ffe066";
  c2d.fillText(text, canvas.width/2, canvas.height/2);
  return { texture: new THREE.CanvasTexture(canvas), aspect: canvas.width/canvas.height };
}

function makeLabel(){
  const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
  return new THREE.Sprite(mat);
}

function disposeLabel(s){
  ctx.scene.remove(s);
  if(s.material.map) s.material.map.dispose();
  s.material.dispose();
}

function clearAll(){
  if(line){ ctx.scene.remove(line); line.geometry.dispose(); line.material.dispose(); line = null; }
  labels.forEach(disposeLabel);
  labels = [];
}

export function setDistanceLinesVisible(val){
  enabled = val;
  if(!enabled) clearAll();
}

export function updateDistanceLines(){
  if(!enabled) return;
  const planets = getSelectedPlanetsOrdered();
  if(planets.length < 2){ clearAll(); return; }

  const positions = new Float32Array(planets.length * 3);
  planets.forEach(function(p, i){
    positions[i*3] = p.mesh.position.x;
    positions[i*3+1] = p.mesh.position.y;
    positions[i*3+2] = p.mesh.position.z;
  });
  if(!line){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7 });
    line = new THREE.Line(geo, mat);
    ctx.scene.add(line);
  } else if(line.geometry.attributes.position.count !== planets.length){
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  } else {
    line.geometry.attributes.position.set(positions);
    line.geometry.attributes.position.needsUpdate = true;
  }
  line.geometry.computeBoundingSphere();

  const segCount = planets.length - 1;
  while(labels.length < segCount){ const s = makeLabel(); ctx.scene.add(s); labels.push(s); }
  while(labels.length > segCount){ disposeLabel(labels.pop()); }

  for(let i=0;i<segCount;i++){
    const a = planets[i].mesh.position, b = planets[i+1].mesh.position;
    const dist = a.distanceTo(b);
    const text = dist.toFixed(1);
    const sprite = labels[i];
    sprite.position.copy(a).add(b).multiplyScalar(0.5);
    // Only regenerate the canvas texture when the displayed number itself
    // changes (not every frame) — cheap for stationary planets, avoids
    // needless texture churn while a comet is one of the selected pair.
    if(sprite.userData.text !== text){
      sprite.userData.text = text;
      if(sprite.material.map) sprite.material.map.dispose();
      const { texture, aspect } = getLabelTexture(text);
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
      sprite.scale.set(0.6*aspect, 0.6, 1);
    }
  }
}
