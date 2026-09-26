// Procedural textures/geometries used by celestial bodies.
import { sRGBTexture } from "../core/utils.js";

export function generateCrackTexture(){
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx2d = canvas.getContext("2d");
  ctx2d.clearRect(0,0,size,size);
  const originCount = 5 + Math.floor(Math.random()*3);
  for(let o=0;o<originCount;o++){
    let x = Math.random()*size, y = Math.random()*size;
    const branches = 4 + Math.floor(Math.random()*4);
    for(let b=0;b<branches;b++){
      let bx=x, by=y;
      const segs = 7 + Math.floor(Math.random()*6);
      ctx2d.beginPath();
      ctx2d.moveTo(bx,by);
      for(let s=0;s<segs;s++){
        bx += (Math.random()-0.5)*72;
        by += (Math.random()-0.5)*72;
        ctx2d.lineTo(bx,by);
      }
      ctx2d.strokeStyle = "rgba(220,255,248,0.95)";
      ctx2d.lineWidth = 1.3+Math.random()*1.8;
      ctx2d.shadowColor = "rgba(150,255,235,0.9)";
      ctx2d.shadowBlur = 7;
      ctx2d.stroke();
    }
  }
  return sRGBTexture(new THREE.CanvasTexture(canvas));
}

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

export function makeAccretionTexture(){
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx2d = canvas.getContext("2d");

  const grad = ctx2d.createRadialGradient(size/2,size/2,size*0.12, size/2,size/2,size*0.5);
  grad.addColorStop(0, "rgba(255,244,214,0.95)");
  grad.addColorStop(0.35, "rgba(255,150,90,0.75)");
  grad.addColorStop(0.7, "rgba(140,70,190,0.35)");
  grad.addColorStop(1, "rgba(80,40,140,0)");
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(0,0,size,size);

  // plasma turbulence - random radiating streaks instead of a smooth gradient
  ctx2d.globalCompositeOperation = "source-atop";
  for(let i=0;i<26;i++){
    const ang = Math.random()*Math.PI*2;
    const rr = size*(0.14+Math.random()*0.34);
    const bx = size/2 + Math.cos(ang)*rr, by = size/2 + Math.sin(ang)*rr;
    const streak = ctx2d.createRadialGradient(bx,by,0, bx,by, size*(0.05+Math.random()*0.09));
    const bright = Math.random() < 0.5;
    streak.addColorStop(0, bright ? "rgba(255,250,235,0.5)" : "rgba(40,10,60,0.45)");
    streak.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = streak;
    ctx2d.fillRect(0,0,size,size);
  }

  // Doppler asymmetry - one side (matter flying towards us) brighter and
  // whiter, the other (receding) dimmed and shifted towards red
  const doppler = ctx2d.createLinearGradient(0,0,size,0);
  doppler.addColorStop(0, "rgba(255,255,255,0.55)");
  doppler.addColorStop(0.5, "rgba(255,255,255,0)");
  doppler.addColorStop(1, "rgba(90,10,20,0.55)");
  ctx2d.fillStyle = doppler;
  ctx2d.fillRect(0,0,size,size);

  ctx2d.globalCompositeOperation = "source-over";
  const tex = sRGBTexture(new THREE.CanvasTexture(canvas));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeHaloTexture(){
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx2d = canvas.getContext("2d");
  ctx2d.clearRect(0,0,size,size);
  function ringPass(w, blur, alpha){
    ctx2d.beginPath();
    ctx2d.arc(size/2, size/2, size*0.32, 0, Math.PI*2);
    ctx2d.strokeStyle = "rgba(255,240,220,"+alpha+")";
    ctx2d.lineWidth = size*w;
    ctx2d.shadowColor = "rgba(255,205,150,0.95)";
    ctx2d.shadowBlur = size*blur;
    ctx2d.stroke();
  }
  ringPass(0.16, 0.24, 0.35);
  ringPass(0.07, 0.13, 0.9);
  return sRGBTexture(new THREE.CanvasTexture(canvas));
}

// Soft, round sun glow — a sprite facing the camera (like the black hole's
// halo). The gradient ends (alpha=0) well before the texture's edge (maxR <
// half the canvas), so it truly fades to full transparency instead of being
// hard-clipped at the edge.
export function makeSunHaloTexture(){
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx2d = canvas.getContext("2d");
  const cx = size/2, cy = size/2;
  const maxR = size*0.42;

  // Note: the sun's own disk (an opaque solid) covers the center of this
  // sprite up to about half its radius (see sunHalo in world/bodies.js) —
  // only the outer part of the gradient is actually visible, so the
  // brightness here is concentrated in the 0.3-0.6 band, not the hidden center.
  const glow = ctx2d.createRadialGradient(cx,cy,0, cx,cy,maxR);
  glow.addColorStop(0,    "rgba(255,250,230,1)");
  glow.addColorStop(0.3,  "rgba(255,240,190,0.95)");
  glow.addColorStop(0.5,  "rgba(255,210,140,0.7)");
  glow.addColorStop(0.75, "rgba(255,175,100,0.25)");
  glow.addColorStop(1,    "rgba(255,140,60,0)");
  ctx2d.fillStyle = glow;
  ctx2d.fillRect(0,0,size,size);

  return sRGBTexture(new THREE.CanvasTexture(canvas));
}

// Texture for a single "ray" — a thin blade: bright/opaque at the base
// (near the sun), fading to full transparency at the tip, with a soft
// falloff on both edges. Applied to real 3D geometry (see buildSunRays in
// world/bodies.js), not a flat sprite — so the rays have real depth and
// parallax as the camera rotates.
export function makeSunRayTexture(){
  const w = 64, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");

  // vertically: the bottom of the texture (ray base) is bright, the top (tip) transparent
  const vgrad = c.createLinearGradient(0, h, 0, 0);
  vgrad.addColorStop(0,    "rgba(255,250,230,0.85)");
  vgrad.addColorStop(0.12, "rgba(255,225,160,0.5)");
  vgrad.addColorStop(0.4,  "rgba(255,190,110,0.16)");
  vgrad.addColorStop(1,    "rgba(255,180,100,0)");
  c.fillStyle = vgrad;
  c.fillRect(0, 0, w, h);

  // horizontally: fade to transparency on both edges (the ray's "blade" shape)
  const hgrad = c.createLinearGradient(0, 0, w, 0);
  hgrad.addColorStop(0,   "rgba(0,0,0,0)");
  hgrad.addColorStop(0.5, "rgba(0,0,0,1)");
  hgrad.addColorStop(1,   "rgba(0,0,0,0)");
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = hgrad;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";

  return sRGBTexture(new THREE.CanvasTexture(canvas));
}

// Comet "tail" texture: bright/opaque at the base (right by the comet),
// fading to full transparency at the tip of the tail, with a soft falloff
// on both edges — the same construction as the sun's rays, just in cold,
// white-blue ice tones.
export function makeCometTailTexture(){
  const w = 64, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");

  const vgrad = c.createLinearGradient(0, h, 0, 0);
  vgrad.addColorStop(0,    "rgba(225,242,255,0.8)");
  vgrad.addColorStop(0.2,  "rgba(200,228,255,0.45)");
  vgrad.addColorStop(0.55, "rgba(175,210,255,0.16)");
  vgrad.addColorStop(1,    "rgba(160,200,255,0)");
  c.fillStyle = vgrad;
  c.fillRect(0, 0, w, h);

  const hgrad = c.createLinearGradient(0, 0, w, 0);
  hgrad.addColorStop(0,   "rgba(0,0,0,0)");
  hgrad.addColorStop(0.5, "rgba(0,0,0,1)");
  hgrad.addColorStop(1,   "rgba(0,0,0,0)");
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = hgrad;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";

  return sRGBTexture(new THREE.CanvasTexture(canvas));
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
