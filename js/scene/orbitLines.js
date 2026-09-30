import { SOLAR_BODIES, STATION_RING, orbitPoint } from "../world/solarSystem.js";
import { makeLineMaterial, makeLine, onLinesChange, disposeLineMaterial } from "./lines.js";

// Static orbit path lines for the fixed 9-orbit solar system — a direct
// port of test.html's own approach (its own scene-setup loop, lines
// 578-582): each orbit is sampled at 128 points around the full ellipse
// once, since the ellipse's shape never changes (only where a body sits
// on it does) — no per-frame update needed at all, unlike the bodies
// themselves.
const ORBIT_SEGMENTS = 128;
const ORBIT_LINE_COLOR = 0x2a3554; // same dim blue-gray as test.html's own orbit lines
const ORBIT_LINE_OPACITY = 0.55;

// Shared by both the 9 fixed orbits below and each comet's own trajectory
// line (buildCometTrajectoryLine) — a comet's flight path reads as "this is
// an orbit too", same visual language. Plain or smooth (scene/lines.js),
// per Setup -> Graphics; a change rebuilds the orbits (a comet's line keeps
// its look until the next comet).
let lineMaterial = null;
function getLineMaterial(){
  if(!lineMaterial) lineMaterial = makeLineMaterial({ color: ORBIT_LINE_COLOR, opacity: ORBIT_LINE_OPACITY });
  return lineMaterial;
}

function buildOrbitLine(orbit, material){
  const points = [];
  for(let i=0;i<=ORBIT_SEGMENTS;i++){
    points.push(orbitPoint(orbit.a, orbit.b, orbit.inc, orbit.node, (i/ORBIT_SEGMENTS)*Math.PI*2));
  }
  return makeLine(points, material);
}

// Takes the scene directly (like scene/skybox.js#addSkybox()) — runs
// during initScene(), before ctx.scene is actually assigned.
let orbitScene = null, orbitObjs = [];
// Orbits and comet paths live on their own layer, so the main camera can
// hide them in one go (scene/linesToggle.js); the miniature cameras keep it.
export const ORBIT_LAYER = 3;
export function addOrbitLines(scene){
  orbitScene = scene;
  const material = getLineMaterial();
  SOLAR_BODIES.forEach(function(b){
    if(b.a <= 0) return; // the sun itself sits at the center, not on an orbit
    orbitObjs.push(buildOrbitLine(b, material));
  });
  // The player-station ring (orbit 4) gets the same treatment, even though
  // it isn't a body — it's still a real, fixed orbit players should be
  // able to see.
  orbitObjs.push(buildOrbitLine(STATION_RING, material));
  orbitObjs.forEach(function(o){ o.layers.set(ORBIT_LAYER); scene.add(o); });
}

onLinesChange(function(){
  if(!orbitScene) return;
  orbitObjs.forEach(function(o){ orbitScene.remove(o); o.geometry.dispose(); });
  orbitObjs = [];
  if(lineMaterial) disposeLineMaterial(lineMaterial);
  lineMaterial = null;
  addOrbitLines(orbitScene);
});

// A comet's own flight path (world/cometPhysics.js#computeCometTrajectory)
// isn't a closed ellipse like the 9 fixed orbits above - it's an open
// polyline from entry to exit, built straight from the precomputed points.
// Called once per comet spawn (world/bodies.js#materializePlanet); the
// caller owns adding it to the scene and disposing it again when the comet
// despawns (despawnLocalOnly/destroyPlanet), same as every other
// comet-owned mesh piece.
export function buildCometTrajectoryLine(points){
  const line = makeLine(points, getLineMaterial());
  line.layers.set(ORBIT_LAYER);
  return line;
}
