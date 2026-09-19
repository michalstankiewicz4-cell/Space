// Procedural textures/geometries used by celestial bodies.
import { CONTENT } from "../content.js";

// Compact 3D simplex noise (Perlin/Gustavson algorithm, public domain).
// The permutation is randomized on every call to makeSimplex3(), so every
// planet gets a different continent layout.
function makeSimplex3(){
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];
  const p = [];
  for(let i=0;i<256;i++) p[i] = i;
  for(let i=255;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    const tmp = p[i]; p[i]=p[j]; p[j]=tmp;
  }
  const perm = new Array(512);
  const permMod12 = new Array(512);
  for(let i=0;i<512;i++){
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  const F3 = 1/3, G3 = 1/6;
  function dot3(g, x, y, z){ return g[0]*x + g[1]*y + g[2]*z; }

  return function noise3(xin, yin, zin){
    const s = (xin+yin+zin)*F3;
    const i = Math.floor(xin+s), j = Math.floor(yin+s), k = Math.floor(zin+s);
    const t = (i+j+k)*G3;
    const x0 = xin-(i-t), y0 = yin-(j-t), z0 = zin-(k-t);

    let i1,j1,k1, i2,j2,k2;
    if(x0>=y0){
      if(y0>=z0){ i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
      else if(x0>=z0){ i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
    } else {
      if(y0<z0){ i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
      else if(x0<z0){ i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
    }

    const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;

    const ii=i&255, jj=j&255, kk=k&255;
    const gi0 = permMod12[ii+perm[jj+perm[kk]]];
    const gi1 = permMod12[ii+i1+perm[jj+j1+perm[kk+k1]]];
    const gi2 = permMod12[ii+i2+perm[jj+j2+perm[kk+k2]]];
    const gi3 = permMod12[ii+1+perm[jj+1+perm[kk+1]]];

    let n0=0, n1=0, n2=0, n3=0;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if(t0>=0){ t0*=t0; n0 = t0*t0*dot3(grad3[gi0], x0,y0,z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if(t1>=0){ t1*=t1; n1 = t1*t1*dot3(grad3[gi1], x1,y1,z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if(t2>=0){ t2*=t2; n2 = t2*t2*dot3(grad3[gi2], x2,y2,z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if(t3>=0){ t3*=t3; n3 = t3*t3*dot3(grad3[gi3], x3,y3,z3); }

    return 32*(n0+n1+n2+n3);
  };
}

// Sum of several noise octaves (fractal Brownian motion) - small, ever
// weaker "ripples" layered on top of the large shape, giving a natural,
// jagged coastline instead of smooth circles.
function fbm3(noise3, x, y, z, octaves){
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for(let o=0; o<octaves; o++){
    sum += noise3(x*freq, y*freq, z*freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.15;
  }
  return sum / norm;
}

// Surface map for the "neutral" planet variant: ocean/continents/polar
// caps/equatorial desert, generated with simplex noise sampled at real 3D
// points on the surface of a unit sphere (not on a flat u,v grid) — this
// makes the texture wrap seamlessly across longitude AND converge correctly
// at the poles, instead of "flattening out". The equirectangular mapping
// matches three.js's default sphere UVs.
export function makePlanetSurfaceTexture(){
  const w = 512, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");
  const img = c.createImageData(w, h);
  const data = img.data;

  const np = CONTENT.neutralPlanet;
  const noise3 = makeSimplex3();
  const scale = np.noiseScaleMin + Math.random()*np.noiseScaleRange;
  const seaLevel = np.seaLevelMin + Math.random()*np.seaLevelRange;

  for(let y=0; y<h; y++){
    const lat = (y/h)*Math.PI - Math.PI/2; // -pi/2 (pole) .. pi/2 (pole)
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const distFromEquator = Math.abs(y-h/2)/(h/2); // 0 equator, 1 pole

    for(let x=0; x<w; x++){
      const lon = (x/w)*Math.PI*2;
      const nx = cosLat*Math.cos(lon)*scale;
      const ny = sinLat*scale;
      const nz = cosLat*Math.sin(lon)*scale;
      const elevation = fbm3(noise3, nx, ny, nz, np.octaves);

      let r, g, b;
      if(elevation < seaLevel){
        const depth = Math.min(1, (seaLevel-elevation)/0.35);
        r = 22 + 18*(1-depth); g = 72 + 38*(1-depth); b = 122 + 68*(1-depth);
      } else {
        const landHeight = Math.min(1, (elevation-seaLevel)/0.4);
        if(distFromEquator < 0.16){
          r = 205 + 25*landHeight; g = 180 + 20*landHeight; b = 120 + 15*landHeight; // desert
        } else if(distFromEquator > 0.72){
          r = 210 + 30*landHeight; g = 222 + 20*landHeight; b = 226 + 20*landHeight; // tundra/snow
        } else {
          r = 60 + 40*landHeight; g = 118 + 55*landHeight; b = 58 + 28*landHeight; // forest/steppe
        }
      }

      // polar caps - the ocean near the poles whitens too (frozen sea)
      if(distFromEquator > 0.8){
        const t = (distFromEquator-0.8)/0.2;
        r += (250-r)*t; g += (252-g)*t; b += (255-b)*t;
      }

      const idx = (y*w+x)*4;
      data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
    }
  }
  c.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

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
  return new THREE.CanvasTexture(canvas);
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
  const tex = new THREE.CanvasTexture(canvas);
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
  return new THREE.CanvasTexture(canvas);
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

  return new THREE.CanvasTexture(canvas);
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

  return new THREE.CanvasTexture(canvas);
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

  return new THREE.CanvasTexture(canvas);
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
  return new THREE.CanvasTexture(canvas);
}
