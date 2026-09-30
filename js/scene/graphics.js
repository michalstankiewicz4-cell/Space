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
export function gfxFilter(){ return settings.gfxFilter === true; }
export function gfxVignette(){ return num(settings.gfxVignette, 0, 1, 0.4); }
export function gfxGrain(){ return num(settings.gfxGrain, 0, 1, 0.25); }
export function gfxAberration(){ return num(settings.gfxAberration, 0, 1, 0.35); }
export function gfxDof(){ return settings.gfxDof === true; }
export function gfxDofStrength(){ return num(settings.gfxDofStrength, 0.2, 2, 1); }
export function gfxAniso(){ return [1, 2, 4, 8, 16].indexOf(Number(settings.gfxAniso)) >= 0 ? Number(settings.gfxAniso) : 4; }
export function gfxSharpen(){ return num(settings.gfxSharpen, 0, 1, 0.3); }
export function gfxRays(){ return settings.gfxRays !== false; }
export function gfxRaysStrength(){ return num(settings.gfxRaysStrength, 0, 3, 1); }
export function gfxFpsCap(){ return [0, 30, 60, 120].indexOf(Number(settings.gfxFpsCap)) >= 0 ? Number(settings.gfxFpsCap) : 0; }
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
    msaa: gfxMsaa(), bloom: gfxBloom(), aniso: gfxAniso() };
}

// Any of the settings above: setGfx({ gfxLineWidth: 2 }) — saved, then
// every onGraphicsChange listener gets the values from before. A change
// by hand turns the preset into "custom"; presets pass fromPreset.
export function setGfx(patch, fromPreset){
  const before = snapshot();
  Object.keys(patch).forEach(function(k){ settings[k] = patch[k]; });
  if(!fromPreset) settings.gfxPreset = "custom";
  saveSettings();
  listeners.forEach(function(fn){ fn(before); });
}

export function setGraphics(quality, detail){
  setGfx({ gfxQuality: quality, gfxDetail: detail });
}

// Not part of any preset (see below), so it doesn't make the preset "custom".
export function setUnitLights(on){
  setGfx({ gfxUnitLights: !!on }, true);
}

// Presets (the top of Setup -> Graphics): MIN / NORMAL / MAX set everything
// at once; AUTO starts at NORMAL with automatic resolution, and
// scene/resolution.js moves it a tier down when even the lowest resolution
// can't hold the frame rate, or up when the highest one runs with plenty
// to spare (gfxAutoTier: the tier it's on). Changing any single setting by
// hand makes it "custom" (none lit). Presets never touch the frame limiter
// (the player's own choice, e.g. to save a laptop's battery) or the ship glow
// lights (gfxUnitLights): switching them recompiles every lit material —
// a hitch AUTO must not cause mid-game — so they stay a manual choice.
const TIERS = {
  min: { gfxQuality: 1, gfxDetail: 0.5, gfxMsaa: 0, gfxFxaa: true, gfxSmoothLines: false,
    gfxFarShips: "dot", gfxLodDistance: 30, gfxBloom: false, gfxLensing: false, gfxFlare: false, gfxFilter: false,
    gfxDof: false, gfxTrails: false, gfxEclipses: false, gfxBiteFx: false, gfxAniso: 1, gfxSharpen: 0.5, gfxRays: false },
  normal: { gfxQuality: 3, gfxDetail: 1, gfxMsaa: 4, gfxFxaa: false, gfxSmoothLines: true,
    gfxFarShips: "dot", gfxLodDistance: 60, gfxBloom: true, gfxLensing: true, gfxFlare: true, gfxFilter: false,
    gfxDof: false, gfxTrails: true, gfxEclipses: true, gfxBiteFx: true, gfxAniso: 4, gfxSharpen: 0.3, gfxRays: true },
  max: { gfxQuality: 4, gfxDetail: 1.5, gfxMsaa: 8, gfxFxaa: true, gfxSmoothLines: true,
    gfxFarShips: "dot", gfxLodDistance: 150, gfxBloom: true, gfxLensing: true, gfxFlare: true, gfxFilter: true,
    gfxDof: true, gfxTrails: true, gfxEclipses: true, gfxBiteFx: true, gfxAniso: 16, gfxSharpen: 0.2, gfxRays: true }
};
const RES = {
  min: { gfxResMode: "manual" },
  normal: { gfxResMode: "auto", gfxMaxRes: 1 },
  max: { gfxResMode: "auto", gfxMaxRes: 2 },
  auto: { gfxResMode: "auto", gfxMaxRes: 1.5 }
};
export const PRESETS = ["auto", "min", "normal", "max"];
export const TIER_ORDER = ["min", "normal", "max"];

export function gfxPreset(){ return PRESETS.indexOf(settings.gfxPreset) >= 0 ? settings.gfxPreset : "custom"; }
export function gfxAutoTier(){ return TIER_ORDER.indexOf(settings.gfxAutoTier) >= 0 ? settings.gfxAutoTier : "normal"; }

export function applyPreset(name){
  if(PRESETS.indexOf(name) < 0) return;
  const tier = name === "auto" ? "normal" : name;
  setGfx(Object.assign({ gfxPreset: name, gfxAutoTier: tier }, TIERS[tier], RES[name]), true);
}

// AUTO only: another tier's effects (the resolution stays automatic).
// Mid-game, so without what rebuilds things: geometry detail rebuilds every
// ship model, smooth lines rebuild every orbit (a hitch, like the ship
// lights) — those stay as AUTO first set them (NORMAL's).
const AUTO_KEEP = ["gfxDetail", "gfxSmoothLines", "gfxQuality"];
function pick(o, keys){ const r = {}; keys.forEach(function(k){ r[k] = o[k]; }); return r; }
export function setAutoTier(tier){
  if(gfxPreset() !== "auto" || !TIERS[tier]) return;
  const patch = Object.assign({ gfxAutoTier: tier }, TIERS[tier]);
  AUTO_KEEP.forEach(function(k){ delete patch[k]; });
  setGfx(patch, true);
}

// On load, a preset's values are re-applied: when a preset's contents
// change in an update (v2.25.4: NORMAL without depth of field and the
// filter), players on that preset get the new ones. "custom" is left alone.
(function syncPreset(){
  const p = gfxPreset();
  if(p === "custom") return;
  const tier = p === "auto" ? gfxAutoTier() : p;
  Object.assign(settings, TIERS[tier], p === "auto" ? pick(TIERS.normal, AUTO_KEEP) : RES[p]);
  saveSettings();
})();
