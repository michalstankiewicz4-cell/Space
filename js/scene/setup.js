import { ctx } from "../core/context.js";

// Tworzy scenę/kamerę/renderer + oświetlenie + tło gwiazd, montuje canvas w
// DOM i podpina obsługę resize. Wywołaj raz, na starcie, przed jakimkolwiek
// innym modułem odwołującym się do ctx.scene/camera/renderer.
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

function starfield(scene){
  const count = 2400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const r = 260 + Math.random()*500;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    pos[i*3]   = r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    pos[i*3+2] = r*Math.cos(phi);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({ color:0xdfe6ff, size:1.15, sizeAttenuation:true, transparent:true, opacity:0.85 });
  scene.add(new THREE.Points(geo, mat));
}
