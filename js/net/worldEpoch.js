import { supabase } from "../supabaseClient.js";
import { readStorage, writeStorage } from "../core/utils.js";
import { resetProgress } from "../core/progressReset.js";

// A reset for everyone: the server's world_meta.epoch goes up
// (admin_reset_progress, admin.html), and each player's game clears its
// progress the next time it connects (core/progressReset.js). The epoch this
// browser has played in is roj-epoch; a browser that has never seen one (a
// first visit, or a player from before this existed) just takes the current
// one — nobody loses anything when the mechanism arrives. Behind the privacy
// acceptance like every server call (net/connect.js#initNet calls this).
const KEY = "roj-epoch";

// Resolves true when the game carries on, false when it's resetting (reloading).
export function checkWorldEpoch(){
  return supabase.from("world_meta").select("epoch").eq("id", 1).maybeSingle().then(function(res){
    const server = res && res.data && Number(res.data.epoch);
    if(!server || !isFinite(server)) return true;               // unreadable: play on
    const mine = Number(readStorage(KEY));
    if(!mine || mine > server){ writeStorage(KEY, String(server)); return true; }
    if(mine === server) return true;
    writeStorage(KEY, String(server));
    resetProgress("world");
    return false;
  }, function(){ return true; });
}
