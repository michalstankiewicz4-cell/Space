import { readStorage, writeStorage } from "./core/utils.js";

// Player-local preferences (mouse behavior etc.), persisted in this browser.
// Not part of js/i18n.js (language) or js/net/identity.js (nick/color) —
// this is purely local input/UX config, never shared with other players.
const DEFAULTS = {
  invertX: false,
  invertY: false,
  swapMouseButtons: false,
  gfxQuality: 3,  // render quality 0..4 (see scene/graphics.js)
  gfxDetail: 1    // ship geometry detail 0.2..2
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
