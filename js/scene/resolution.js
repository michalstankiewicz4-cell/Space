import { ctx } from "../core/context.js";
import { gfxQuality, pixelRatioFor, gfxResMode, gfxTargetFps, gfxMaxRes, gfxPreset, gfxAutoTier, setAutoTier, TIER_ORDER, gfxFpsCap } from "./graphics.js";

// The renderer's resolution (pixel ratio), every frame:
//   manual — the Render quality slider (graphics.js#pixelRatioFor)
//   auto   — follows the frame rate: every CHECK_S seconds, up a step
//            while the game runs comfortably above the target frame rate,
//            down a (bigger) step when it falls below it; between MIN_PR
//            and the screen's pixel density × gfxMaxRes (Setup). Above
//            1 × the density it renders more pixels than the screen shows
//            and scales down — supersampling: small ships, thin details
//            and shader noise stop shimmering.
// Changing the pixel ratio reallocates the drawing buffer, so it moves in
// steps and only now and then, never every frame.
const CHECK_S = 1.5;
const MIN_PR = 0.6;
const UP = 0.1, DOWN = 0.15;
// No stepping down for the first seconds of auto: shaders compile at start
// (a second or so of stalls) and that says nothing about the frame rate.
const WARMUP_S = 6;

// The AUTO preset's tiers (scene/graphics.js#setAutoTier): a tier down
// after TIER_DOWN_S of the lowest resolution still missing the target
// frame rate, a tier up after TIER_UP_S of the highest one running well
// above it. Either change restarts the warm-up (new shaders compile).
const TIER_DOWN_S = 6, TIER_UP_S = 20;

let pr = null;
let windowStart = 0, frames = 0, autoSince = 0, lowSince = 0, highSince = 0;

function maxPR(){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return Math.min(3, dpr * gfxMaxRes());
}

function apply(v){
  if(Math.abs(v - ctx.renderer.getPixelRatio()) < 0.005) return;
  ctx.renderer.setPixelRatio(v);
  ctx.renderer.setSize(window.innerWidth, window.innerHeight);
}

// The pixel ratio in use now (Setup shows it for "auto").
export function currentPixelRatio(){ return ctx.renderer ? ctx.renderer.getPixelRatio() : 1; }

export function updateResolution(){
  if(gfxResMode() !== "auto"){
    pr = null;
    apply(pixelRatioFor(gfxQuality()));
    return;
  }
  const now = performance.now();
  if(pr === null){
    pr = Math.min(maxPR(), Math.max(1, window.devicePixelRatio || 1));
    windowStart = now; frames = 0; autoSince = now;
    apply(pr);
    return;
  }
  frames++;
  const elapsed = (now - windowStart) / 1000;
  if(elapsed < CHECK_S) return;
  // With the frame limiter below the target, the cap is the target — and
  // hitting it counts as headroom (the frame rate can't go above it).
  const cap = gfxFpsCap(), target = cap ? Math.min(gfxTargetFps(), cap) : gfxTargetFps();
  const fps = frames / elapsed;
  windowStart = now; frames = 0;
  const warm = (now - autoSince) / 1000 > WARMUP_S;
  if(fps > target * 1.2 || (cap && cap <= target && fps >= cap * 0.97)) pr += UP;
  else if(fps < target * 0.92 && warm) pr -= DOWN;
  pr = Math.round(Math.max(MIN_PR, Math.min(maxPR(), pr)) * 100) / 100;
  apply(pr);
  if(gfxPreset() === "auto" && warm) autoTier(now, fps, target);
}

function autoTier(now, fps, target){
  const i = TIER_ORDER.indexOf(gfxAutoTier());
  lowSince = pr <= MIN_PR + 0.001 && fps < target * 0.9 ? (lowSince || now) : 0;
  highSince = pr >= maxPR() - 0.001 && fps > target * 1.3 ? (highSince || now) : 0;
  let next = null;
  if(lowSince && (now - lowSince) / 1000 > TIER_DOWN_S && i > 0) next = TIER_ORDER[i - 1];
  else if(highSince && (now - highSince) / 1000 > TIER_UP_S && i < TIER_ORDER.length - 1) next = TIER_ORDER[i + 1];
  if(!next) return;
  lowSince = highSince = 0;
  autoSince = now;
  setAutoTier(next);
}
