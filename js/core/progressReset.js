import { readStorage, writeStorage } from "./utils.js";

// Starting over: the game's PROGRESS goes, everything else stays.
//   gone:  points and upgrades (roj-swarm-save), where the fleet is
//          (roj-fleet-pos), your surface bases (roj-bases), what the wiki
//          has found (roj-discovered);
//   kept:  settings, language, nickname, colour, the privacy acceptance,
//          the anonymous account, your ship and drone programs (your work,
//          not progress), the station's spot, the labs' own keys.
// Two ways in: a player's own START OVER (Setup → Privacy, ui/privacy.js),
// and a reset for everyone (admin.html raises the world's epoch on the
// server; net/worldEpoch.js notices it on the next connection).
// A new kind of progress kept in this browser goes into PROGRESS_KEYS.
export const PROGRESS_KEYS = ["roj-swarm-save", "roj-fleet-pos", "roj-bases", "roj-discovered"];
const NOTICE_KEY = "roj-reset-notice";
let resetting = false;
// True from a reset until the reload: savers that run on the way out (the
// fleet's positions on pagehide) must not write the old progress back.
export function isResetting(){ return resetting; }

// Clears the progress and reloads; `why` ("self" | "world") is shown once
// after the reload (takeResetNotice).
export function resetProgress(why){
  resetting = true;
  try { PROGRESS_KEYS.forEach(function(k){ localStorage.removeItem(k); }); } catch(e){ /* storage unavailable */ }
  writeStorage(NOTICE_KEY, why || "self");
  location.reload();
}

// After a reset's reload: why it happened (once), or null.
export function takeResetNotice(){
  const why = readStorage(NOTICE_KEY);
  if(!why) return null;
  try { localStorage.removeItem(NOTICE_KEY); } catch(e){ /* storage unavailable */ }
  return why;
}
