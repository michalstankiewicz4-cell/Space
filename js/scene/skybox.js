import { ctx } from "../core/context.js";

// The backdrop is BodyKit's sky (js/bodykit/bodykit.js, SKY group, kind
// "sky" — the body lab's SKY tab edits it, and the lab shows it behind
// every body): black space, colored nebulae with dark dust, a Milky Way
// band, small stars (some twinkling) and a few pulsars. The nebulae are
// baked once into a cube map (BodyKit re-bakes only after a change), the
// stars and pulsars are points — cheap every frame.
// It's kept centered on the main camera (so it reads as infinitely far)
// and sized well inside the camera's far plane (12000, scene/setup.js).
// BodyKit shaders don't use fog, so the scene's FogExp2 never dims it.
const SKY_RADIUS = 9000;
let sky = null;
let t = 0;

export function addSkybox(scene){
  const ref = BodyKit.GAME_KINDS.sky;
  sky = BodyKit.buildBody(ref.groupId, ref.bodyId, { detail: 1 });
  sky.setRadius(SKY_RADIUS);
  scene.add(sky.group);
  return sky;
}

// Every frame, before rendering: follow the camera, twinkle, pulse; the
// first call (and any after a change) bakes the nebulae.
export function updateSkybox(dt){
  t += dt;
  sky.update(t, dt, { center: ctx.camera.position, renderer: ctx.renderer });
}
