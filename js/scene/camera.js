import { ctx } from "../core/context.js";
import { settings } from "../settings.js";
import { SHIP_MODEL_LENGTH, DRONE_MODEL_LENGTH } from "../config.js";

// The camera orbits a pivot (az / pol / radius, driven by the mouse through
// scene/controls.js): "base" — the player's station (the default), "system"
// — the Sun, the whole system in view, "focus" — one body or unit, followed
// (focusCameraOn / focusCameraOnUnit: a minimap click, VIEW). BASE / SYSTEM
// switch over the 3D view; every change glides over CAM_TRANSITION_S.

const SYSTEM_CAM_DEFAULT = { az: 0.6, pol: 1.05, radius: 950 };
const SYSTEM_ZOOM_RANGE = [20, 2500];
const BASE_CAM_RADIUS_DEFAULT = 11;     // around a STATION_MODEL_LENGTH 5 station
const BASE_ZOOM_RANGE = [3, 150];
// How far above the Sun-behind-the-station line the base camera starts
// (baseCameraDefaults).
const BASE_CAM_ELEVATION_LIFT = 0.35;

export const camState = { mode: "base", az: SYSTEM_CAM_DEFAULT.az, pol: SYSTEM_CAM_DEFAULT.pol, radius: SYSTEM_CAM_DEFAULT.radius, autoSpin: true,
  target: null };   // "focus" mode: the body (an entry of ctx.planets) the camera orbits
const CAM_TRANSITION_S = 1.0;
// The glide between two framings: where the camera was (pivot + orbit),
// eased toward the live camState over CAM_TRANSITION_S.
const camFrom = { pivot: new THREE.Vector3(), az: 0, pol: 0, radius: 1, t: 1 };
const lastPivot = new THREE.Vector3();
const pivotScratch = new THREE.Vector3();
function clampPol(p){ return Math.max(0.35, Math.min(Math.PI-0.35, p)); }

// The base camera's starting place: out along the Sun -> station line, so
// the Sun is behind the station, then lifted a little so it peeks out above
// it (the user's spec: the Sun visible just above the base).
function baseCameraDefaults(){
  if(!ctx.station) return { az: SYSTEM_CAM_DEFAULT.az, pol: SYSTEM_CAM_DEFAULT.pol, radius: BASE_CAM_RADIUS_DEFAULT };
  const p = ctx.station.pos;
  const d = p.length() || 1;
  const az0 = Math.atan2(p.z, p.x);
  const pol0 = Math.acos(Math.max(-1, Math.min(1, p.y/d)));
  return { az: az0, pol: clampPol(pol0 - BASE_CAM_ELEVATION_LIFT), radius: BASE_CAM_RADIUS_DEFAULT };
}

// Switches camera mode and resets az/pol/radius to that mode's own
// default framing (not remembered per-mode across switches - simpler,
// and matches the one-shot "default view" the user actually asked for).
// Called once at startup for the "base" default (main.js, right after
// spawnStation() so ctx.station.pos is already known) and from the
// #cameraModeToggle button handlers below.
// Start a glide from the current framing (called before a mode change).
function beginCamTransition(){
  camFrom.pivot.copy(lastPivot);
  camFrom.az = camState.az; camFrom.pol = camState.pol; camFrom.radius = camState.radius;
  camFrom.t = 0;
}

// opts.instant: no glide (the first framing at startup)
export function setCameraMode(mode, opts){
  beginCamTransition();
  if(opts && opts.instant) camFrom.t = 1;
  camState.mode = mode;
  camState.target = null;
  const d = mode === "base" ? baseCameraDefaults() : SYSTEM_CAM_DEFAULT;
  camState.az = d.az; camState.pol = d.pol; camState.radius = d.radius;
  camState.autoSpin = true;
  refreshCamModeButtons();
}

// Where a focusable body is: a planet-like body's mesh, the black hole's group.
export function bodyPosition(body){
  return body.mesh ? body.mesh.position : body.group.position;
}

// "focus" mode: orbit `body` (an entry of ctx.planets — a planet, the Sun,
// the meteoroid, a comet — or a black hole) from its sunlit side, a little
// above its orbit, and follow it. Its zoom range scales with the body
// (focusZoomRange()).
export function focusCameraOn(body){
  if(!body || !(body.mesh || body.group)) return;
  beginCamTransition();
  camState.mode = "focus";
  camState.target = body;
  const p = bodyPosition(body);
  if(p.lengthSq() > 1) camState.az = Math.atan2(-p.z, -p.x) + 0.6;   // toward the Sun, turned a bit
  camState.pol = clampPol(Math.PI / 2 - 0.35);
  camState.radius = body.focusDistance || Math.max(4, body.radius * (body.group ? 9 : 6));   // a black hole's disk is wide
  camState.autoSpin = true;
  refreshCamModeButtons();
}

// "focus" on one of the player's own units (the unit panel's VIEW button):
// the same orbit-and-follow camera, framed for something ship-sized. One
// stable target object per unit, so "is this unit in view" is a plain
// comparison (unitInView(); the VIEW button's lit state).
const unitTargets = new WeakMap();
export function focusCameraOnUnit(unit){
  let tgt = unitTargets.get(unit);
  if(!tgt){
    const len = unit === ctx.drone ? DRONE_MODEL_LENGTH : SHIP_MODEL_LENGTH;
    tgt = { unit: unit, mesh: unit.mesh, radius: len / 2, focusDistance: len * 7, zoomRange: [len * 1.5, 400],
      alive: function(){ return unit === ctx.drone || ctx.ships.indexOf(unit) >= 0; } };
    unitTargets.set(unit, tgt);
  }
  focusCameraOn(tgt);
}

// The unit the camera is looking at in "focus" mode, or null.
export function unitInView(){
  const tgt = camState.mode === "focus" ? camState.target : null;
  return tgt && tgt.unit && tgt.alive() ? tgt.unit : null;
}

function focusZoomRange(){
  if(camState.target && camState.target.zoomRange) return camState.target.zoomRange;
  const r = camState.target ? camState.target.radius : 2;
  return [Math.max(2, r * 1.6), Math.max(60, r * 80)];
}

function zoomRange(){
  if(camState.mode === "focus") return focusZoomRange();
  return camState.mode === "base" ? BASE_ZOOM_RANGE : SYSTEM_ZOOM_RANGE;
}

// What the camera orbits right now: the station, the focused body, or the
// Sun at the origin. A focused body that's gone (a comet flew off or was
// eaten) sends the camera back to the system view.
function currentPivot(out){
  if(camState.mode === "focus"){
    const b = camState.target;
    const alive = b && !b.dying && (b.alive ? b.alive() : ctx.planets.indexOf(b) >= 0 || ctx.blackholes.indexOf(b) >= 0);
    if(!alive){ setCameraMode("system"); return out.set(0, 0, 0); }
    return out.copy(bodyPosition(b));
  }
  if(camState.mode === "base" && ctx.station) return out.copy(ctx.station.pos);
  return out.set(0, 0, 0);
}

const easeInOut = function(x){ return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

export function updateCamera(dt){
  if(camState.autoSpin) camState.az += dt*0.035;
  const pivot = currentPivot(pivotScratch);
  let az = camState.az, pol = camState.pol, r = camState.radius;
  if(camFrom.t < 1){
    camFrom.t = Math.min(1, camFrom.t + dt / CAM_TRANSITION_S);
    const k = easeInOut(camFrom.t);
    pivot.lerpVectors(camFrom.pivot, pivot, k);
    let dAz = (az - camFrom.az) % (Math.PI * 2);                   // the short way round
    if(dAz > Math.PI) dAz -= Math.PI * 2; else if(dAz < -Math.PI) dAz += Math.PI * 2;
    az = camFrom.az + dAz * k;
    pol = camFrom.pol + (pol - camFrom.pol) * k;
    r = Math.exp(Math.log(camFrom.radius) + (Math.log(r) - Math.log(camFrom.radius)) * k);  // 950 -> 12 evenly
  }
  lastPivot.copy(pivot);
  ctx.camera.position.set(
    pivot.x + r*Math.sin(pol)*Math.cos(az),
    pivot.y + r*Math.cos(pol),
    pivot.z + r*Math.sin(pol)*Math.sin(az)
  );
  ctx.camera.lookAt(pivot);
}

// The two toggle buttons: the active mode lit, neither in "focus" mode.
function refreshCamModeButtons(){
  const base = document.getElementById("camModeBaseBtn"), system = document.getElementById("camModeSystemBtn");
  if(!base || !system) return;
  base.classList.toggle("camModeActive", camState.mode === "base");
  system.classList.toggle("camModeActive", camState.mode === "system");
}

// A sensitivity setting (Setup -> Mouse), 0.25..3, 1 if it's missing or broken.
function sens(v){ v = Number(v); return v >= 0.25 && v <= 3 ? v : 1; }

// Mouse input from scene/controls.js: a drag of (dx, dy) pixels, a wheel
// step — with the player's sensitivity and axis settings (Setup -> Mouse).
export function rotateCamera(dx, dy){
  const k = 0.0045 * sens(settings.mouseRotSens);
  camState.az += dx * k * (settings.invertX ? -1 : 1);
  camState.pol = clampPol(camState.pol - dy * k * (settings.invertY ? -1 : 1));
}

// Multiplicative, not additive: the zoom ranges span 20..2500 (system) and
// 3..150 (base), and an additive step sized for one crawls across the other.
export function zoomCamera(deltaY){
  const range = zoomRange();
  camState.radius = Math.max(range[0], Math.min(range[1], camState.radius * (1 + deltaY * 0.001 * sens(settings.mouseZoomSens))));
}

// The BASE / SYSTEM toggle over the 3D view.
export function initCameraButtons(){
  document.getElementById("camModeBaseBtn").addEventListener("click", function(){ setCameraMode("base"); });
  document.getElementById("camModeSystemBtn").addEventListener("click", function(){ setCameraMode("system"); });
}
