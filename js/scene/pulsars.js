// A handful of background "pulsars" scattered among the starfield — small
// sprites that sharply brighten/dim on their own randomized period, so
// they don't blink in sync. Kept deliberately few (see PULSAR_COUNT): this
// is meant to read as a rare, eye-catching detail woven into the
// background, not a light show competing with actual gameplay.
const PULSAR_COUNT = 6;
const PULSAR_MIN_RADIUS = 1300; // inside the starfield's own 1200-2600 range (scene/setup.js)
const PULSAR_MAX_RADIUS = 2500;

function makePulsarTexture(){
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext("2d");
  const cx = size/2, cy = size/2;
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, size*0.5);
  grad.addColorStop(0,    "rgba(235,245,255,1)");
  grad.addColorStop(0.25, "rgba(200,225,255,0.9)");
  grad.addColorStop(0.6,  "rgba(150,190,255,0.35)");
  grad.addColorStop(1,    "rgba(120,170,255,0)");
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

let pulsars = [];
let elapsed = 0;

// Takes the scene directly, same reasoning as skybox.js#addSkybox() — this
// runs during initScene(), before ctx.scene is actually assigned.
export function addPulsars(scene){
  const texture = makePulsarTexture();
  pulsars = [];
  for(let i=0; i<PULSAR_COUNT; i++){
    const r = PULSAR_MIN_RADIUS + Math.random()*(PULSAR_MAX_RADIUS-PULSAR_MIN_RADIUS);
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);

    const material = new THREE.SpriteMaterial({
      map: texture, color: 0xffffff, transparent: true,
      opacity: 0, depthWrite: false,
      fog: false // same reasoning as the skybox/starfield — a fixed backdrop shouldn't dim with camera-relative fog
    });
    const sprite = new THREE.Sprite(material);
    sprite.userData.pulsar = true; // lets other code (and tests) tell these apart from sun-halo/print-fx sprites
    sprite.position.set(
      r*Math.sin(phi)*Math.cos(theta),
      r*Math.sin(phi)*Math.sin(theta),
      r*Math.cos(phi)
    );
    scene.add(sprite);

    pulsars.push({
      sprite,
      baseScale: 2.2 + Math.random()*1.4,
      period: 0.8 + Math.random()*1.7, // seconds per pulse, deliberately irregular so they never sync up
      phase: Math.random()*Math.PI*2,
      minOpacity: 0.05 + Math.random()*0.1 // never fully off, just dim between pulses
    });
  }
}

// Called every frame from main.js's tick(), same pattern as updateDrone(dt)
// etc. — dt-driven (not performance.now()) to stay tied to the same
// clamped delta the rest of the game uses.
export function updatePulsars(dt){
  elapsed += dt;
  pulsars.forEach(function(p){
    const t = (elapsed/p.period + p.phase) * Math.PI*2;
    // pow() sharpens sin's smooth hump into a quick flash-and-fade — a
    // real pulsar reads as a sharp pulse, not a slow gentle breathing glow.
    const wave = Math.pow(Math.max(0, Math.sin(t)), 4);
    p.sprite.material.opacity = p.minOpacity + (1-p.minOpacity)*wave;
    p.sprite.scale.setScalar(p.baseScale * (0.85 + 0.3*wave));
  });
}
