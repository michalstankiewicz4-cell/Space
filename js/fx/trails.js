import { ctx } from "../core/context.js";
import { SHIP_MODEL_LENGTH, DRONE_MODEL_LENGTH } from "../config.js";
import { gfxTrails, gfxTrailLength } from "../scene/graphics.js";

// Engine trails (Setup -> Graphics): a short fading ribbon behind each of
// the player's own ships and the drone, so the swarm's movement reads even
// from far away. Each trail is the unit's recent positions (one point per
// 1/40 s while it moves — sparser for long trails, MAX_POINTS in all), drawn as a strip that always faces the camera
// (three vertices across: a bright middle, dark edges — a soft ribbon),
// narrowing and darkening with age — additive, so "darker" is "more
// transparent". Points older than gfxTrailLength seconds drop off, so a
// unit that stops pulls its trail in after it.
// One mesh per unit; the geometry is rewritten each frame (≤ MAX_POINTS × 3
// vertices — trivial). Colours are set here at runtime, so they're
// converted to linear by hand (scene/colorManagement.js only converts
// material colours).
const MAX_POINTS = 90;
const MIN_STEP = 0.004;
const SHIP_COLOR = new THREE.Color(0x8fd8ff).convertSRGBToLinear();
const DRONE_COLOR = new THREE.Color(0xffc86a).convertSRGBToLinear();

const trails = new Map();   // unit -> trail
const camPos = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
let clock = 0;

let material = null;
function trailMaterial(){
  if(material) return material;
  material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return material;
}

function makeTrail(width, color){
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for(let i = 0; i < MAX_POINTS - 1; i++){
    const k = i * 3, n = k + 3;   // vertices: edge, middle, edge
    idx.push(k, k + 1, n, k + 1, n + 1, n, k + 1, k + 2, n + 1, k + 2, n + 2, n + 1);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, trailMaterial());
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.raycast = function(){};
  ctx.scene.add(mesh);
  return { mesh: mesh, points: [], width: width, color: color, lastSample: -1, seen: 0,
    prev: new THREE.Vector3(), back: new THREE.Vector3() };
}

function dropTrail(unit, tr){
  ctx.scene.remove(tr.mesh);
  tr.mesh.geometry.dispose();
  trails.delete(unit);
}

// The unit's tail: its position moved back along its latest movement by
// about half its length (the drone has no velocity vector — its moves are
// program steps — so the direction comes from where it was last frame).
function tailOf(unit, tr, len, out){
  out.subVectors(tr.prev, unit.pos);
  const l = out.length();
  if(l > 1e-6) tr.back.copy(out).multiplyScalar(1 / l);
  return out.copy(unit.pos).addScaledVector(tr.back, len * 0.1);
}

function track(unit, len, color){
  if(!unit || !unit.pos) return;
  let tr = trails.get(unit);
  if(!tr){ tr = makeTrail(len * 0.12, color); tr.prev.copy(unit.pos); trails.set(unit, tr); }
  tr.seen = clock;
  tailOf(unit, tr, len, a);
  tr.prev.copy(unit.pos);
  // A new point every so often; in between, the newest one rides along
  // with the engine so the trail never lags behind the ship.
  const head = tr.points[0], moved = !head || head.p.distanceToSquared(a) > MIN_STEP * MIN_STEP;
  if(clock - tr.lastSample >= Math.max(1 / 40, gfxTrailLength() / (MAX_POINTS - 4)) || !head){
    if(moved){
      tr.points.unshift({ p: a.clone(), t: clock });
      if(tr.points.length > MAX_POINTS) tr.points.pop();
    }
    tr.lastSample = clock;
  }else if(moved && tr.points.length > 1) head.p.copy(a);
}

function rebuild(tr, maxAge){
  while(tr.points.length && clock - tr.points[tr.points.length - 1].t > maxAge) tr.points.pop();
  const n = tr.points.length;
  const geo = tr.mesh.geometry;
  if(n < 2){ geo.setDrawRange(0, 0); return; }
  const pos = geo.attributes.position.array, col = geo.attributes.color.array;
  for(let i = 0; i < n; i++){
    const pt = tr.points[i].p;
    a.copy(tr.points[Math.max(0, i - 1)].p);
    b.copy(tr.points[Math.min(n - 1, i + 1)].p);
    a.sub(b);                                  // along the trail
    toCam.subVectors(camPos, pt);
    side.crossVectors(a, toCam);
    const l = side.length();
    const age = Math.min(1, (clock - tr.points[i].t) / maxAge);
    const w = tr.width * (1 - age * 0.9) * (0.35 + 0.65 * Math.min(1, age / 0.08));   // widens out of the nozzle, then narrows
    if(l > 1e-9) side.multiplyScalar(w / l); else side.set(0, 0, 0);
    const k = i * 9;
    pos[k] = pt.x + side.x; pos[k + 1] = pt.y + side.y; pos[k + 2] = pt.z + side.z;
    pos[k + 3] = pt.x; pos[k + 4] = pt.y; pos[k + 5] = pt.z;
    pos[k + 6] = pt.x - side.x; pos[k + 7] = pt.y - side.y; pos[k + 8] = pt.z - side.z;
    const f = Math.pow(1 - age, 1.8) * (i === 0 ? 0.7 : 1) * 0.6;   // the newest point soft, not a hard edge at the engine
    col[k] = col[k + 6] = 0; col[k + 1] = col[k + 7] = 0; col[k + 2] = col[k + 8] = 0;
    col[k + 3] = tr.color.r * f; col[k + 4] = tr.color.g * f; col[k + 5] = tr.color.b * f;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.setDrawRange(0, (n - 1) * 12);
}

// Every frame, after the units have moved.
export function updateTrails(dt){
  clock += dt;
  if(!gfxTrails()){
    trails.forEach(function(tr, unit){ dropTrail(unit, tr); });
    return;
  }
  ctx.camera.getWorldPosition(camPos);
  for(let i = 0; i < ctx.ships.length; i++) track(ctx.ships[i], SHIP_MODEL_LENGTH, SHIP_COLOR);
  if(ctx.drone) track(ctx.drone, DRONE_MODEL_LENGTH, DRONE_COLOR);
  const maxAge = gfxTrailLength();
  trails.forEach(function(tr, unit){
    if(tr.seen !== clock){ dropTrail(unit, tr); return; }   // the unit is gone
    rebuild(tr, maxAge);
  });
}
