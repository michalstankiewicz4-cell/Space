import { ctx } from "../core/context.js";

// Dev Tools debug toggle — hides every light in the scene: the ambient
// light + the two fixed PointLights (scene/setup.js) + every dynamically
// spawned one (each sun/ship/drone gets its own PointLight child of its
// own mesh — see world/bodies.js, ships/swarm.js, drone/drone.js). New
// lights keep spawning while this is on (new suns, new ships), so a plain
// scene traversal every frame while disabled is simpler and more robust
// than hooking every light-creation site individually to check this flag.
let disabled = false;

function applyVisibility(visible){
  if(!ctx.scene) return;
  ctx.scene.traverse(function(o){
    if(o.isLight) o.visible = visible;
  });
}

export function setLightsDisabled(val){
  disabled = val;
  if(!disabled) applyVisibility(true); // restore immediately, no need to wait for the next frame
}

export function updateLightsToggle(){
  if(disabled) applyVisibility(false);
}
