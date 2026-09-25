import { settings, saveSettings } from "../settings.js";

// Graphics settings (Setup -> Graphics): the same two sliders as the ship
// lab (ship.html), with the same meaning.
//  - Render quality: the renderer's pixel ratio, and whether ship models
//    run their particle effects (exhaust etc.). No shadows in the game.
//  - Geometry detail: how finely ShipKit ships are built (0.2 .. 2, the
//    lab's `detail`) — changing it rebuilds them.
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

export function pixelRatioFor(level){
  const dpr = window.devicePixelRatio || 1;
  return [0.5, 0.75, 1, Math.max(1, Math.min(dpr, 2)), Math.min(Math.max(1, dpr) * 1.5, 3)][level];
}

export function onGraphicsChange(fn){ listeners.push(fn); }

export function setGraphics(quality, detail){
  const before = { quality: gfxQuality(), detail: gfxDetail() };
  settings.gfxQuality = quality;
  settings.gfxDetail = detail;
  saveSettings();
  listeners.forEach(function(fn){ fn(before); });
}
