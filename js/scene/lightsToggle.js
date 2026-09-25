import { ctx } from "../core/context.js";
import { gfxUnitLights, onGraphicsChange } from "./graphics.js";

// Dev Tools debug toggle — hides every light in the scene: the ambient
// light + the two fixed PointLights (scene/setup.js) + every dynamically
// spawned one (each sun/ship/drone gets its own PointLight child of its
// own mesh — see world/bodies.js, ships/swarm.js, drone/drone.js). New
// lights keep spawning while this is on (new suns, new ships), so a plain
// scene traversal every frame while disabled is simpler and more robust
// than hooking every light-creation site individually to check this flag.
let disabled = false;

// Ships' own glow lights (userData.unitLight) also follow Setup ->
// Graphics -> "Ship glow lights": restoring lights never switches those on
// if the player turned them off.
function applyVisibility(visible){
  if(!ctx.scene) return;
  const unitLights = gfxUnitLights();
  ctx.scene.traverse(function(o){
    if(o.isLight) o.visible = visible && (!o.userData.unitLight || unitLights);
  });
}

onGraphicsChange(function(){ if(!disabled) applyVisibility(true); });

export function setLightsDisabled(val){
  disabled = val;
  if(!disabled) applyVisibility(true); // restore immediately, no need to wait for the next frame
}

export function updateLightsToggle(){
  if(disabled) applyVisibility(false);
}
