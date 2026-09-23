// Procedural nebula skybox — a huge inverted sphere with a canvas-generated
// gradient + soft color-cloud texture, same "no external image assets"
// approach as every other texture in the game (see world/textures.js),
// just for the backdrop instead of a body.
// Well past the starfield's own outer radius (setup.js) and the fixed
// 9-orbit solar system's farthest orbit (world/solarSystem.js, a=890) —
// always behind everything. Needs to stay proportionally FAR beyond the
// camera's own max zoom (2500, scene/controls.js), not just numerically
// larger than it — found live: an earlier, smaller radius here (3200) put
// the camera close enough to the sphere's surface that its low-poly facets
// (invisible when it was proportionally much farther away, as it used to
// be at the old, much smaller camera-zoom scale) became visible as a
// distinct faceted shape instead of reading as a smooth, distant backdrop.
const SKY_RADIUS = 9000;

function makeNebulaTexture(){
  const w = 1024, h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");

  // Base: near-black at both poles (top/bottom of the equirect map), a
  // touch of deep navy around the equator. Subtle on purpose — this is a
  // backdrop, not the main show, and shouldn't compete with the planets.
  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0,   "#020306");
  base.addColorStop(0.5, "#070a14");
  base.addColorStop(1,   "#020306");
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);

  // Soft nebula cloud blobs in the game's own accent palette (teal/ice/
  // ember, plus a violet for variety), additive-blended so overlaps
  // brighten naturally instead of muddying into grey — same layering idea
  // as makeAccretionTexture()'s plasma streaks in world/textures.js.
  const palette = ["79,227,198", "79,168,255", "255,122,69", "150,120,255"];
  c.globalCompositeOperation = "lighter";
  const cloudCount = 9;
  for(let i=0; i<cloudCount; i++){
    const cx = Math.random()*w;
    const cy = h*0.18 + Math.random()*h*0.64; // stay clear of the poles, where the equirect stretch is worst
    const r = w*(0.07 + Math.random()*0.11);
    const color = palette[Math.floor(Math.random()*palette.length)];
    const alpha = 0.05 + Math.random()*0.06;
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba("+color+","+alpha+")");
    grad.addColorStop(1, "rgba("+color+",0)");
    c.fillStyle = grad;
    c.fillRect(cx-r, cy-r, r*2, r*2);

    // A cloud straddling the left/right seam needs a second copy offset by
    // one canvas width so it doesn't visibly cut off — the texture wraps
    // horizontally (tex.wrapS below), the drawing has to match.
    if(cx-r < 0){ c.save(); c.translate(w,0); c.fillRect(cx-r, cy-r, r*2, r*2); c.restore(); }
    if(cx+r > w){ c.save(); c.translate(-w,0); c.fillRect(cx-r, cy-r, r*2, r*2); c.restore(); }
  }
  c.globalCompositeOperation = "source-over";

  // A faint grain of tiny stars woven directly into the texture — distinct
  // from the sharp twinkling THREE.Points starfield (setup.js), just here
  // so the gradient doesn't read as flat up close.
  for(let i=0; i<900; i++){
    const x = Math.random()*w, y = Math.random()*h;
    const s = Math.random()*1.1;
    const a = 0.12 + Math.random()*0.3;
    c.fillStyle = "rgba(255,255,255,"+a+")";
    c.fillRect(x, y, s, s);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Takes the scene directly (like setup.js's own local starfield() helper)
// rather than importing ctx — this runs during initScene(), before
// ctx.scene is actually assigned, so reading it here would just be null.
export function addSkybox(scene){
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: makeNebulaTexture(),
    side: THREE.BackSide,
    // The scene's FogExp2 (see initScene()) would otherwise fully hide
    // something this far out — so the sky has to opt out of fog entirely,
    // same as a skybox always should.
    fog: false,
    depthWrite: false
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  return sky;
}
