import { settings, saveSettings } from "../settings.js";

// Graphics settings (Setup -> Graphics): the same two sliders as the ship
// lab (ship.html), with the same meaning.
//  - Render quality: the renderer's pixel ratio, and whether ship models
//    run their particle effects (exhaust etc.). No shadows in the game.
//  - Geometry detail: how finely ShipKit ships are built (0.2 .. 2, the
//    lab's `detail`) — changing it rebuilds them.
//  - Ship glow lights (off by default): a small PointLight at every ship.
//    Each extra light makes every lit surface cost more to draw, and
//    changing how many there are recompiles the shaders (a hitch when a
//    ship is bought) — so it's opt-in. Such lights carry
//    userData.unitLight; scene/lightsToggle.js shows/hides them.
// Persisted with the other local preferences (settings.js).
export const QUALITY = [
  { name: "LOW", particles: false },
  { name: "MEDIUM", particles: true },
  { name: "HIGH", particles: true },
  { name: "ULTRA", particles: true },   // the default: device pixel ratio, clamped to 1..2
  { name: "MAX", particles: true },
];

const listeners = [];

export function gfxQuality(){
  const q = Math.round(Number(settings.gfxQuality));
  return q >= 0 && q <= 4 ? q : 3;
}

export function gfxDetail(){
  const d = Number(settings.gfxDetail);
  return d >= 0.2 && d <= 2 ? d : 1;
}

export function gfxParticles(){ return QUALITY[gfxQuality()].particles; }

export function gfxUnitLights(){ return settings.gfxUnitLights === true; }

// Image quality (the second half of Setup -> Graphics): each one on/off,
// adjustable, and — for resolution — automatic or manual.
function num(v, lo, hi, def){ v = Number(v); return v >= lo && v <= hi ? v : def; }
export function gfxResMode(){ return settings.gfxResMode === "manual" ? "manual" : "auto"; }
export function gfxTargetFps(){ return num(settings.gfxTargetFps, 20, 240, 60); }
export function gfxMaxRes(){ return num(settings.gfxMaxRes, 0.5, 2, 1.5); }
export function gfxSmoothLines(){ return settings.gfxSmoothLines !== false; }
export function gfxLineWidth(){ return num(settings.gfxLineWidth, 1, 4, 1.5); }
export function gfxFarShips(){ return ["dot", "cone", "model"].indexOf(settings.gfxFarShips) >= 0 ? settings.gfxFarShips : "dot"; }
export function gfxLodDistance(){ return num(settings.gfxLodDistance, 10, 300, 60); }
export function gfxFxaa(){ return settings.gfxFxaa === true; }
export function gfxMsaa(){ return [0, 2, 4, 8].indexOf(Number(settings.gfxMsaa)) >= 0 ? Number(settings.gfxMsaa) : 4; }
export function gfxBloom(){ return settings.gfxBloom !== false; }
export function gfxBloomStrength(){ return num(settings.gfxBloomStrength, 0, 3, 0.7); }
export function gfxBloomThreshold(){ return num(settings.gfxBloomThreshold, 0, 1, 0.93); }
export function gfxLensing(){ return settings.gfxLensing !== false; }
export function gfxFlare(){ return settings.gfxFlare !== false; }
export function gfxFlareStrength(){ return num(settings.gfxFlareStrength, 0, 3, 1); }
export function gfxFilter(){ return settings.gfxFilter !== false; }
export function gfxVignette(){ return num(settings.gfxVignette, 0, 1, 0.4); }
export function gfxGrain(){ return num(settings.gfxGrain, 0, 1, 0.25); }
export function gfxAberration(){ return num(settings.gfxAberration, 0, 1, 0.35); }
export function gfxDof(){ return settings.gfxDof !== false; }
export function gfxDofStrength(){ return num(settings.gfxDofStrength, 0.2, 2, 1); }
export function gfxBiteFx(){ return settings.gfxBiteFx !== false; }
export function gfxEclipses(){ return settings.gfxEclipses !== false; }
export function gfxTrails(){ return settings.gfxTrails !== false; }
export function gfxTrailLength(){ return num(settings.gfxTrailLength, 0.2, 6, 2.5); }

export function pixelRatioFor(level){
  const dpr = window.devicePixelRatio || 1;
  return [0.5, 0.75, 1, Math.max(1, Math.min(dpr, 2)), Math.min(Math.max(1, dpr) * 1.5, 3)][level];
}

export function onGraphicsChange(fn){ listeners.push(fn); }

function snapshot(){
  return { quality: gfxQuality(), detail: gfxDetail(), unitLights: gfxUnitLights(), resMode: gfxResMode(),
    smoothLines: gfxSmoothLines(), lineWidth: gfxLineWidth(), farShips: gfxFarShips(), lodDistance: gfxLodDistance(), fxaa: gfxFxaa(),
    msaa: gfxMsaa(), bloom: gfxBloom() };
}

// Any of the settings above: setGfx({ gfxLineWidth: 2 }) — saved, then
// every onGraphicsChange listener gets the values from before.
export function setGfx(patch){
  const before = snapshot();
  Object.keys(patch).forEach(function(k){ settings[k] = patch[k]; });
  saveSettings();
  listeners.forEach(function(fn){ fn(before); });
}

export function setGraphics(quality, detail){
  const before = snapshot();
  settings.gfxQuality = quality;
  settings.gfxDetail = detail;
  saveSettings();
  listeners.forEach(function(fn){ fn(before); });
}

export function setUnitLights(on){
  const before = snapshot();
  settings.gfxUnitLights = !!on;
  saveSettings();
  listeners.forEach(function(fn){ fn(before); });
}
