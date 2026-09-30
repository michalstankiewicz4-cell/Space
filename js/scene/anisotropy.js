import { ctx } from "../core/context.js";
import { gfxAniso, onGraphicsChange } from "./graphics.js";

// Anisotropic filtering (Setup -> Graphics): how sharp a texture stays when
// seen at a steep angle (a hull panel, the station's ring). ShipKit keeps
// every texture it generates in ShipKit.allTextures (built at 8× by
// default); this sets them all to the chosen level, capped by what the
// graphics card supports. New ships add textures, so the set is re-checked
// now and then — changing a texture's anisotropy is cheap (no recompile).
let applied = -1, count = -1, timer = 0;

function apply(){
  if(!ctx.renderer || typeof ShipKit === "undefined") return;
  const level = Math.min(gfxAniso(), ctx.renderer.capabilities.getMaxAnisotropy());
  ShipKit.allTextures.forEach(function(t){
    if(t.anisotropy !== level){ t.anisotropy = level; t.needsUpdate = true; }
  });
  applied = level;
  count = ShipKit.allTextures.size;
}

export function initAnisotropy(){
  apply();
  onGraphicsChange(function(before){ if(before.aniso !== gfxAniso()) apply(); });
}

// Every frame (cheap): every 2 s, apply to textures that appeared since.
export function updateAnisotropy(dt){
  if((timer -= dt) > 0) return;
  timer = 2;
  if(typeof ShipKit !== "undefined" && (ShipKit.allTextures.size !== count || applied < 0)) apply();
}
