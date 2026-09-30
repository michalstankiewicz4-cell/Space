import { readStorage, writeStorage } from "./core/utils.js";

// Player-local preferences (mouse behavior etc.), persisted in this browser.
// Not part of js/i18n.js (language) or js/net/identity.js (nick/color) —
// this is purely local input/UX config, never shared with other players.
const DEFAULTS = {
  invertX: false,
  invertY: false,
  swapMouseButtons: false,
  gfxQuality: 3,  // render quality 0..4 (see scene/graphics.js)
  gfxDetail: 1,   // ship geometry detail 0.2..2
  gfxUnitLights: false, // a PointLight at every ship (costly; see scene/graphics.js)
  // image quality (Setup -> Graphics, scene/graphics.js)
  gfxResMode: "auto",   // "auto": resolution follows the frame rate (scene/resolution.js) | "manual": gfxQuality
  gfxTargetFps: 60,     // auto: the frame rate to hold
  gfxMaxRes: 1.5,       // auto: the highest resolution, × the screen's pixel density
  gfxSmoothLines: true, // orbits/trajectories as anti-aliased thick lines (scene/lines.js)
  gfxLineWidth: 1.5,    // their width in pixels
  gfxFarShips: "dot",   // far ships: "dot" (a glow) | "cone" (the old stand-in) | "model" (always the full model)
  gfxLodDistance: 60,   // …beyond this distance from the camera
  gfxFxaa: false,       // FXAA over the main view (scene/post.js)
  gfxMsaa: 4,           // MSAA samples of the main view: 0 (off) | 2 | 4 | 8 (scene/post.js)
  gfxBloom: true,       // glow around bright things (scene/post.js)
  gfxBloomStrength: 0.7,
  gfxBloomThreshold: 0.93, // how bright (0..1, as shown on screen) a pixel must be to glow
  gfxLensing: true,     // the black hole bends the picture behind it (scene/post.js)
  gfxFlare: true,       // the Sun's lens flare
  gfxFlareStrength: 1,
  gfxFilter: false,     // "robot eyes": vignette, grain, chromatic aberration
  gfxVignette: 0.4,
  gfxGrain: 0.25,
  gfxAberration: 0.35,
  gfxDof: false,        // depth of field in the focus camera
  gfxDofStrength: 1,
  gfxTrails: true,      // engine trails behind own ships and the drone (fx/trails.js)
  gfxTrailLength: 2.5,  // …seconds of flight they show
  gfxEclipses: true,    // planets shade ships, the drone and stations (scene/eclipse.js)
  gfxPreset: "auto",    // "auto" | "min" | "normal" | "max" | "custom" (scene/graphics.js#applyPreset)
  gfxAutoTier: "normal", // AUTO: the tier it's on now
  gfxAniso: 4,          // anisotropic filtering 1 | 2 | 4 | 8 | 16 (scene/anisotropy.js)
  gfxSharpen: 0.3,      // contrast-adaptive sharpening 0..1 (PostKit)
  gfxRays: true,        // light rays from the Sun (PostKit)
  gfxRaysStrength: 1,
  gfxFpsCap: 0,         // frame limiter: 0 (none) | 30 | 60 | 120 (main.js tick)
  gfxBiteFx: true       // sparks and a hot spot where a ship bites (fx/particles.js, fx/impact.js)
};

function load(){
  try{
    const raw = readStorage("roj-settings");
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === "object") return Object.assign({}, DEFAULTS, parsed);
    }
  }catch(e){ /* ignore */ }
  return Object.assign({}, DEFAULTS);
}

export const settings = load();

export function saveSettings(){
  writeStorage("roj-settings", JSON.stringify(settings));
}
