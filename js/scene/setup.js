import { gfxQuality, pixelRatioFor, onGraphicsChange } from "./graphics.js";
import { ctx } from "../core/context.js";
import { addSkybox } from "./skybox.js";
import { addOrbitLines } from "./orbitLines.js";

// Creates the scene/camera/renderer + lighting + the sky backdrop,
// mounts the canvas in the DOM and wires up resize handling. Call once, on
// startup, before any other module that references ctx.scene/camera/renderer.
export function initScene(){
  const stage = document.getElementById("stage");
  const scene = new THREE.Scene();
  // Density rescaled for the fixed 9-orbit solar system (world/
  // solarSystem.js, a=90..890) - the old 0.0065 was tuned for the previous
  // ~34-unit-radius world and would fog out almost everything past the
  // first orbit or two at this new scale (1-exp(-(0.0065*220)^2) alone is
  // already ~87% opaque at orbit 3's distance).
  scene.fog = new THREE.FogExp2(0x05060a, 0.0007);

  // far=12000: must clear the skybox's own radius (9000, scene/skybox.js)
  // from any camera position, not just the solar system's own farthest
  // orbit (a=890) - the skybox needs real margin beyond the camera's max
  // zoom (2500, scene/controls.js) to read as a smooth, distant backdrop
  // rather than a visibly faceted nearby shape (see skybox.js's own note).
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 0.1, 12000);
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setPixelRatio(pixelRatioFor(gfxQuality()));
  onGraphicsChange(function(){
    renderer.setPixelRatio(pixelRatioFor(gfxQuality()));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a, 1);
  // Rendered like the ship/body labs (ship.html, bodies.html): sRGB output,
  // filmic tone mapping and an environment map for reflections — the same
  // generated space sky the labs light their models with. Every color
  // texture the game makes is marked sRGB to match (see sRGBTexture()).
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene.environment = ShipKit.makeEnvironment(renderer);
  stage.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x8892b0, 0.55));
  const sun = new THREE.PointLight(0xbfe9ff, 1.3, 0, 0);
  sun.position.set(40, 60, 30);
  scene.add(sun);
  const rim = new THREE.PointLight(0xff7a45, 0.5, 0, 0);
  rim.position.set(-60,-30,-40);
  scene.add(rim);
  // Exposed for Dev Tools' light-source markers (scene/lightMarkers.js) —
  // the only two fixed-position lights in the scene (every other light is
  // a per-object PointLight child, e.g. each sun body's own glow).
  ctx.sceneLights = { sun: sun, rim: rim };

  addSkybox(scene);        // BodyKit's sky: nebulae, Milky Way, stars, pulsars
  addOrbitLines(scene);

  // The canvas always covers the whole window; the camera's aspect follows
  // the 3D view's own rect instead (scene/viewRect.js#renderMainView).
  window.addEventListener("resize", function(){
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  ctx.scene = scene;
  ctx.camera = camera;
  ctx.renderer = renderer;
}
