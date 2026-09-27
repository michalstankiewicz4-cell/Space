import { ctx } from "../core/context.js";
import { unitInView } from "./controls.js";
import { predictCurrentPath, predictProgramPath } from "../program/simulate.js";
import { activeProgramSource } from "../program/unitPrograms.js";

// The trajectory lines of the unit the camera is looking at (the unit
// panel's VIEW, scene/controls.js#focusCameraOnUnit) — only in that view,
// the user's call. Two lines, like the prototype (test.html):
//   cyan   — where it goes as things stand (drift, an order's flight)
//   violet — where its program would take it if started now; while the
//            program runs, the route planned when it started
// Recomputed a couple of times a second (program/simulate.js), not every
// frame: a preview steps up to a couple of minutes ahead.
const CURRENT_COLOR = 0x49d3ff;
const PROGRAM_COLOR = 0xb48cf0;
const REFRESH_S = 0.4;

let currentLine = null, programLine = null;
let shownFor = null, sinceRefresh = 0;

function makeLine(color){
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: color, transparent: true, opacity: 0.9, depthWrite: false, fog: false,
    toneMapped: false    // full color, not dimmed by the filmic tone mapping
  }));
  line.frustumCulled = false;
  line.visible = false;
  line.renderOrder = 5;
  ctx.scene.add(line);
  return line;
}

function setPoints(line, pts){
  if(!pts || pts.length < 2){ line.visible = false; return; }
  line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  line.visible = true;
}

// The route a program will fly, fixed when it starts (the running
// generator can't be copied to re-predict from mid-run).
export function planUnitRoute(unit){
  const res = predictProgramPath(unit, activeProgramSource(unit));
  unit.plannedPath = res.points;
}

function refresh(unit){
  if(unit.running){
    setPoints(currentLine, null);
    setPoints(programLine, unit.plannedPath);
    return;
  }
  unit.plannedPath = null;
  setPoints(currentLine, predictCurrentPath(unit));
  const src = activeProgramSource(unit);
  setPoints(programLine, src.trim() ? predictProgramPath(unit, src).points : null);
}

export function updateUnitTrajectory(dt){
  if(!currentLine){ currentLine = makeLine(CURRENT_COLOR); programLine = makeLine(PROGRAM_COLOR); }
  const unit = unitInView();
  if(!unit){
    if(shownFor){ currentLine.visible = false; programLine.visible = false; shownFor = null; }
    return;
  }
  sinceRefresh += dt;
  if(unit !== shownFor || sinceRefresh >= REFRESH_S){
    shownFor = unit;
    sinceRefresh = 0;
    refresh(unit);
  }
}
