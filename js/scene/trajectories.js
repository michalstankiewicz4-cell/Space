import { ctx } from "../core/context.js";
import { camState } from "./controls.js";
import { predictCurrentPath, predictProgramPath } from "../program/simulate.js";
import { activeProgramSource } from "../program/unitPrograms.js";
import { bodyPosAt, nowSimTime, SOLAR_BODY_BY_SLOT } from "../world/solarSystem.js";

// Trajectory lines, one rule (the user's): the object the camera is on
// ("focus" mode — a ship or the drone via VIEW, a body via the minimap)
// plus every selected object (ships only when a single one is selected). The station and the Sun don't move; a comet
// already draws its own full trajectory (world/cometPhysics.js). Lines:
//   cyan   — where it goes in the next HORIZON_S: a unit's drift or flight
//            to its order (program/simulate.js#predictCurrentPath), a
//            body's way along its orbit (closed-form, bodyPosAt)
//   violet — a unit's program: where it would fly if started now, or while
//            it runs, the route planned at its START (planUnitRoute)
// Recomputed a couple of times a second, not every frame: a unit's
// preview steps up to a couple of minutes ahead.
const CURRENT_COLOR = 0x49d3ff;
const PROGRAM_COLOR = 0xb48cf0;
const REFRESH_S = 0.4;
const HORIZON_S = 120;          // the same look-ahead as a unit's preview
const BODY_STEPS = 120;
const MAX_TRACKED = 12;         // a safety cap (planets can be multi-selected)
// A layer only the main camera sees: the miniatures (scene/unitThumb.js,
// infoThumb.js) and the cockpit view (shipcam.js) render layer 0 only —
// an arc drawn on top would otherwise cut across a planet's miniature.
const TRAJECTORY_LAYER = 2;

const pool = [];                // THREE.Line objects, reused
const materials = {};           // one per kind, shared (scene/colorManagement.js converts each once)
let shownKey = "", sinceRefresh = 0;

// `overOrbit`: a body's arc lies exactly on its orbit line
// (scene/orbitLines.js) — depth-tested, the two lines z-fight and the arc
// shows up broken and faint, so it's drawn on top instead.
function material(color, overOrbit){
  const key = color + (overOrbit ? "o" : "");
  if(!materials[key]) materials[key] = new THREE.LineBasicMaterial({
    color: color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: !overOrbit, fog: false,
    toneMapped: false    // full color, not dimmed by the filmic tone mapping
  });
  return materials[key];
}

function lineAt(i){
  if(pool[i]) return pool[i];
  const line = new THREE.Line(new THREE.BufferGeometry(), material(CURRENT_COLOR));
  line.frustumCulled = false;
  line.visible = false;
  line.renderOrder = 5;
  line.layers.set(TRAJECTORY_LAYER);
  ctx.camera.layers.enable(TRAJECTORY_LAYER);
  ctx.scene.add(line);
  pool[i] = line;
  return line;
}

function isUnit(obj){ return obj === ctx.drone || ctx.ships.indexOf(obj) >= 0; }

// The route a program will fly, fixed when it starts (the running
// generator can't be copied to re-predict from mid-run).
export function planUnitRoute(unit){
  unit.plannedPath = predictProgramPath(unit, activeProgramSource(unit)).points;
}

// What the camera is on, if it's something that can move.
function objectInView(){
  if(camState.mode !== "focus" || !camState.target) return null;
  const tgt = camState.target;
  if(tgt.unit) return tgt.alive() ? tgt.unit : null;
  return tgt;
}

function tracked(){
  const list = [];
  function add(o){ if(o && list.indexOf(o) === -1 && list.length < MAX_TRACKED) list.push(o); }
  add(objectInView());
  if(ctx.drone && ctx.drone.selected) add(ctx.drone);
  // ships only when exactly one is selected — a group's lines would just
  // be clutter (the user's call)
  const selShips = ctx.ships.filter(function(sh){ return sh.selected; });
  if(selShips.length === 1) add(selShips[0]);
  ctx.planets.forEach(function(p){ if(p.selected && !p.dying) add(p); });
  ctx.blackholes.forEach(function(bh){ if(bh.selected) add(bh); });
  return list;
}

// A fixed body's way along its orbit over the next HORIZON_S.
function bodyArc(slot){
  if(!SOLAR_BODY_BY_SLOT[slot] || !SOLAR_BODY_BY_SLOT[slot].speed) return null;   // the Sun stays put
  const t0 = nowSimTime(), pts = [];
  for(let i = 0; i <= BODY_STEPS; i++) pts.push(bodyPosAt(slot, t0 + HORIZON_S * i / BODY_STEPS, new THREE.Vector3()));
  return pts;
}

// [{ points, color }] for one object.
function pathsFor(obj){
  if(isUnit(obj)){
    if(obj.running) return [{ points: obj.plannedPath, color: PROGRAM_COLOR }];
    obj.plannedPath = null;
    const out = [{ points: predictCurrentPath(obj), color: CURRENT_COLOR }];
    const src = activeProgramSource(obj);
    if(src.trim()) out.push({ points: predictProgramPath(obj, src).points, color: PROGRAM_COLOR });
    return out;
  }
  if(obj.orbitSlot != null) return [{ points: bodyArc(obj.orbitSlot), color: CURRENT_COLOR, overOrbit: true }];
  return [];
}

function refresh(list){
  let n = 0;
  list.forEach(function(obj){
    pathsFor(obj).forEach(function(path){
      if(!path.points || path.points.length < 2) return;
      const line = lineAt(n++);
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(path.points);
      line.material = material(path.color, path.overOrbit);
      line.renderOrder = path.overOrbit ? 999 : 5;
      line.visible = true;
    });
  });
  for(let i = n; i < pool.length; i++) pool[i].visible = false;
}

export function updateTrajectories(dt){
  const list = tracked();
  const key = list.map(function(o){ return o.uuid || (o.mesh && o.mesh.uuid) || (o.group && o.group.uuid); }).join(",");
  sinceRefresh += dt;
  if(key === shownKey && sinceRefresh < REFRESH_S) return;
  shownKey = key;
  sinceRefresh = 0;
  refresh(list);
}
