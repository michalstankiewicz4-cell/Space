import { ctx } from "../core/context.js";
import { gfxQuality, pixelRatioFor, gfxResMode, gfxTargetFps, gfxMaxRes } from "./graphics.js";

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

let pr = null;
let windowStart = 0, frames = 0, autoSince = 0;

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
  const fps = frames / elapsed, target = gfxTargetFps();
  windowStart = now; frames = 0;
  if(fps > target * 1.2) pr += UP;
  else if(fps < target * 0.92 && (now - autoSince) / 1000 > WARMUP_S) pr -= DOWN;
  pr = Math.round(Math.max(MIN_PR, Math.min(maxPR(), pr)) * 100) / 100;
  apply(pr);
}
