import { IDENTITY_ADJECTIVES, IDENTITY_NOUNS, NET_MAX_NICK_LENGTH } from "../config.js";
import { containsProfanity } from "../moderation.js";
import { readStorage, writeStorage } from "../core/utils.js";

// Letters (any script - \p{L} isn't just a-z), digits, and spaces only.
const NICK_PATTERN = /^[\p{L}\p{N} ]+$/u;

// Anonymous client identifier (persisted in this browser) — used to elect
// the world's "steward" and to tell other players' ships apart.
export const clientId = (function(){
  try{
    let v = localStorage.getItem("roj-client-id");
    if(!v){ v = "c"+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem("roj-client-id", v); }
    return v;
  }catch(e){ return "c"+Math.random().toString(36).slice(2); }
})();

export const joinedAt = Date.now();

export function randomNickSuggestion(){
  return IDENTITY_ADJECTIVES[Math.floor(Math.random()*IDENTITY_ADJECTIVES.length)]+" "+IDENTITY_NOUNS[Math.floor(Math.random()*IDENTITY_NOUNS.length)];
}

// The nickname must be explicitly confirmed by the player (see ui/banner.js)
// — until they do, `myIdentity.nick` is just a suggestion, never saved, so on
// the next visit without confirming, the game will ask for it again.
export function hasConfirmedNick(){
  return !!readStorage("roj-nick");
}

export function confirmNick(nick){
  const trimmed = (nick||"").trim().slice(0, NET_MAX_NICK_LENGTH);
  if(!trimmed || !NICK_PATTERN.test(trimmed) || containsProfanity(trimmed)) return null;
  myIdentity.nick = trimmed;
  writeStorage("roj-nick", trimmed);
  return trimmed;
}

function loadOrCreateColor(){
  let color = readStorage("roj-color");
  if(!color){
    color = "#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0");
    writeStorage("roj-color", color);
  }
  return color;
}

export const myIdentity = {
  nick: readStorage("roj-nick") || randomNickSuggestion(),
  color: loadOrCreateColor()
};
