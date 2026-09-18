import { IDENTITY_ADJECTIVES, IDENTITY_NOUNS } from "../config.js";

// Anonimowy identyfikator klienta (persystentny w tej przeglądarce) — używany
// do wyboru "stewarda" świata i do odróżniania statków innych graczy.
export const clientId = (function(){
  try{
    let v = localStorage.getItem("roj-client-id");
    if(!v){ v = "c"+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem("roj-client-id", v); }
    return v;
  }catch(e){ return "c"+Math.random().toString(36).slice(2); }
})();

export const joinedAt = Date.now();

function loadOrCreateIdentity(){
  let nick, color;
  try{
    nick = localStorage.getItem("roj-nick");
    color = localStorage.getItem("roj-color");
  }catch(e){ /* ignore */ }
  if(!nick) nick = IDENTITY_ADJECTIVES[Math.floor(Math.random()*IDENTITY_ADJECTIVES.length)]+" "+IDENTITY_NOUNS[Math.floor(Math.random()*IDENTITY_NOUNS.length)];
  if(!color) color = "#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0");
  try{ localStorage.setItem("roj-nick", nick); localStorage.setItem("roj-color", color); }catch(e){ /* ignore */ }
  return { nick: nick, color: color };
}

export const myIdentity = loadOrCreateIdentity();
