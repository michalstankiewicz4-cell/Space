import { SOLAR_BODIES, STATION_RING, orbitPoint } from "../world/solarSystem.js";

// Static orbit path lines for the fixed 9-orbit solar system — a direct
// port of test.html's own approach (its own scene-setup loop, lines
// 578-582): each orbit is sampled at 128 points around the full ellipse
// once, since the ellipse's shape never changes (only where a body sits
// on it does) — no per-frame update needed at all, unlike the bodies
// themselves.
const ORBIT_SEGMENTS = 128;
const ORBIT_LINE_COLOR = 0x2a3554; // same dim blue-gray as test.html's own orbit lines
const ORBIT_LINE_OPACITY = 0.55;

function buildOrbitLine(orbit, material){
  const points = [];
  for(let i=0;i<=ORBIT_SEGMENTS;i++){
    points.push(orbitPoint(orbit.a, orbit.b, orbit.inc, orbit.node, (i/ORBIT_SEGMENTS)*Math.PI*2));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geo, material);
}

// Takes the scene directly (like scene/skybox.js#addSkybox()/scene/
// pulsars.js#addPulsars()) — runs during initScene(), before ctx.scene is
// actually assigned.
export function addOrbitLines(scene){
  const material = new THREE.LineBasicMaterial({
    color: ORBIT_LINE_COLOR, transparent: true, opacity: ORBIT_LINE_OPACITY, fog: false
  });
  SOLAR_BODIES.forEach(function(b){
    if(b.a <= 0) return; // the sun itself sits at the center, not on an orbit
    scene.add(buildOrbitLine(b, material));
  });
  // The player-station ring (orbit 4) gets the same treatment, even though
  // it isn't a body — it's still a real, fixed orbit players should be
  // able to see.
  scene.add(buildOrbitLine(STATION_RING, material));
}
