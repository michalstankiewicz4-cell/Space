// Procedural textures/geometries used by celestial bodies.
import { sRGBTexture } from "../core/utils.js";

export function makeRockGeometry(size){
  const base = Math.random() < 0.5 ? new THREE.IcosahedronGeometry(size, 0) : new THREE.DodecahedronGeometry(size, 0);
  const pos = base.attributes.position;
  const seen = {};
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    const key = x.toFixed(2)+","+y.toFixed(2)+","+z.toFixed(2);
    let factor = seen[key];
    if(factor===undefined){ factor = 0.72+Math.random()*0.55; seen[key]=factor; }
    pos.setXYZ(i, x*factor, y*factor, z*factor);
  }
  pos.needsUpdate = true;
  base.computeVertexNormals();
  return base;
}

export function generateDustTexture(){
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx2d = canvas.getContext("2d");
  ctx2d.clearRect(0,0,size,size);
  const blobs = 4 + Math.floor(Math.random()*3);
  for(let i=0;i<blobs;i++){
    const cx = size*0.5 + (Math.random()-0.5)*size*0.4;
    const cy = size*0.5 + (Math.random()-0.5)*size*0.4;
    const r = size*(0.26+Math.random()*0.22);
    const grad = ctx2d.createRadialGradient(cx,cy,0, cx,cy,r);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.24)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.arc(cx,cy,r,0,Math.PI*2);
    ctx2d.fill();
  }
  return sRGBTexture(new THREE.CanvasTexture(canvas));
}
