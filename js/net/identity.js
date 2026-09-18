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

function readStored(key){
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}
function writeStored(key, value){
  try{ localStorage.setItem(key, value); }catch(e){ /* ignore */ }
}

export function randomNickSuggestion(){
  return IDENTITY_ADJECTIVES[Math.floor(Math.random()*IDENTITY_ADJECTIVES.length)]+" "+IDENTITY_NOUNS[Math.floor(Math.random()*IDENTITY_NOUNS.length)];
}

// Nick musi zostać jawnie potwierdzony przez gracza (patrz ui/banner.js) —
// dopóki tego nie zrobi, `myIdentity.nick` jest tylko podpowiedzią, nigdy
// niezapisaną, więc przy kolejnej wizycie bez potwierdzenia gra znów o niego zapyta.
export function hasConfirmedNick(){
  return !!readStored("roj-nick");
}

export function confirmNick(nick){
  const trimmed = (nick||"").trim().slice(0, 24);
  if(!trimmed) return null;
  myIdentity.nick = trimmed;
  writeStored("roj-nick", trimmed);
  return trimmed;
}

function loadOrCreateColor(){
  let color = readStored("roj-color");
  if(!color){
    color = "#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0");
    writeStored("roj-color", color);
  }
  return color;
}

export const myIdentity = {
  nick: readStored("roj-nick") || randomNickSuggestion(),
  color: loadOrCreateColor()
};
