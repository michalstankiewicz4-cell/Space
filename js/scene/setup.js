import { ctx } from "../core/context.js";
import { addSkybox } from "./skybox.js";

// Creates the scene/camera/renderer + lighting + starfield background,
// mounts the canvas in the DOM and wires up resize handling. Call once, on
// startup, before any other module that references ctx.scene/camera/renderer.
export function initScene(){
  const stage = document.getElementById("stage");
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.0065);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 0.1, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a, 1);
  stage.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x8892b0, 0.55));
  const sun = new THREE.PointLight(0xbfe9ff, 1.3, 0, 0);
  sun.position.set(40, 60, 30);
  scene.add(sun);
  const rim = new THREE.PointLight(0xff7a45, 0.5, 0, 0);
  rim.position.set(-60,-30,-40);
  scene.add(rim);

  addSkybox(scene);
  starfield(scene);

  window.addEventListener("resize", function(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
}

// Slight per-star color variation (cool blue-white, warm white, and a rare
// faint tealtint echoing the nebula skybox's own palette) instead of one
// flat color — cheap (baked once into a per-vertex color attribute, no
// per-frame cost) but reads noticeably richer than a uniform starfield.
const STAR_TINTS = [
  [0.85, 0.90, 1.00], // cool blue-white (most common)
  [0.85, 0.90, 1.00],
  [0.85, 0.90, 1.00],
  [1.00, 0.93, 0.82], // warm white
  [0.75, 0.98, 0.92]  // faint teal, rare
];

function starfield(scene){
  const count = 2400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  const col = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const r = 260 + Math.random()*500;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    pos[i*3]   = r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    pos[i*3+2] = r*Math.cos(phi);

    const tint = STAR_TINTS[Math.floor(Math.random()*STAR_TINTS.length)];
    const brightness = 0.7 + Math.random()*0.3;
    col[i*3]   = tint[0]*brightness;
    col[i*3+1] = tint[1]*brightness;
    col[i*3+2] = tint[2]*brightness;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
  geo.setAttribute("color", new THREE.BufferAttribute(col,3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true, size:1.15, sizeAttenuation:true, transparent:true, opacity:0.85,
    // Without this, the scene's FogExp2 (density 0.0065) blends stars this
    // far out almost entirely into the fog color well before they'd
    // naturally fade from distance alone — a fixed backdrop shouldn't dim
    // with camera-relative fog the way foreground objects do.
    fog: false
  });
  scene.add(new THREE.Points(geo, mat));
}
