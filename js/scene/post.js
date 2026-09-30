import { ctx } from "../core/context.js";
import { camState } from "./camera.js";
import { SOLAR_BODY_BY_SLOT } from "../world/solarSystem.js";
import { gfxFxaa, gfxMsaa, gfxBloom, gfxBloomStrength, gfxBloomThreshold, gfxLensing, gfxFlare, gfxFlareStrength,
  gfxFilter, gfxVignette, gfxGrain, gfxAberration, gfxDof, gfxDofStrength, gfxSharpen, gfxRays, gfxRaysStrength } from "./graphics.js";

// Post-processing of the main view (Setup -> Graphics): the settings and
// the game's objects handed to PostKit (js/postkit/postkit.js — the steps
// themselves, shared with the labs). The black hole is lensed, the Sun
// gets the flare, depth of field follows the focus camera (eased in and
// out over ~0.6 s). The miniatures and the cockpit view don't go through
// any of this.

let pipe = null, dofAmount = 0, dofSize = 0.03, lastT = performance.now();
const ORIGIN = new THREE.Vector3();

export function postActive(){
  return !!(gfxFxaa() && THREE.FXAAShader) || !!(gfxBloom() && THREE.UnrealBloomPass) || gfxMsaa() !== 4
    || gfxLensing() || gfxFlare() || gfxFilter() || gfxSharpen() > 0 || gfxRays() || (gfxDof() && camState.mode === "focus") || dofAmount > 0.01;
}

// r: the view rect (CSS px, window coordinates).
export function renderPost(r){
  if(!pipe) pipe = PostKit.create(ctx.renderer);
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  const tgt = camState.mode === "focus" && gfxDof() ? camState.target : null;
  dofAmount += ((tgt ? 1 : 0) - dofAmount) * Math.min(1, dt * 4);
  if(tgt){
    const dist = ctx.camera.position.distanceTo(tgt.mesh ? tgt.mesh.position : tgt.group.position);
    dofSize = (tgt.radius || 1) / (dist * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2)) / 2;
  }
  const hole = ctx.blackholes[0];

  pipe.render(ctx.scene, ctx.camera, {
    rect: r,
    msaa: gfxMsaa(),
    bloom: gfxBloom() ? { strength: gfxBloomStrength(), threshold: gfxBloomThreshold() } : null,
    fxaa: gfxFxaa(),
    lens: gfxLensing() && hole ? { object: hole.group, position: hole.group.position, radius: hole.radius } : null,
    dof: dofAmount > 0.01 ? { amount: dofAmount, size: dofSize, strength: gfxDofStrength() } : null,
    flare: gfxFlare() || gfxRays() ? { position: ORIGIN, radius: SOLAR_BODY_BY_SLOT[0].radius,
      strength: gfxFlare() ? gfxFlareStrength() : 0, rays: gfxRays() ? gfxRaysStrength() : 0 } : null,
    sharpen: gfxSharpen(),
    filter: gfxFilter() ? { vignette: gfxVignette(), grain: gfxGrain(), aberration: gfxAberration() } : null
  });
}
