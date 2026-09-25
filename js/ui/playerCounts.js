import { ctx } from "../core/context.js";
import { supabase } from "../supabaseClient.js";
import { NET_ENABLED } from "../env.js";
import { isConnected } from "../net/connect.js";
import { t, onLangChange } from "../i18n.js";
import { fillIcons } from "./icons.js";

// The start screen's live player counters (#playerCounts in the top bar):
// players online right now (this client + everyone whose ships it hears
// over the Realtime channel — the same number as the HUD's "Online"
// slot) and players registered (every anonymous account that has ever
// connected, via the public player_count() RPC in supabase/schema.sql,
// which returns only the number). Only refreshed while the start screen
// is open. Hidden entirely in offline mode (no multiplayer configured).
const ONLINE_REFRESH_MS = 1000;
const REGISTERED_REFRESH_MS = 60000;
let online = null, registered = null;

function bannerOpen(){
  return !document.getElementById("banner").classList.contains("hidden");
}

function render(){
  document.getElementById("pcOnline").textContent = online == null ? "—" : String(online);
  document.getElementById("pcRegistered").textContent = registered == null ? "—" : String(registered);
  document.getElementById("pcOnlineLbl").textContent = t("banner.playersOnline")(online == null ? 0 : online);
  document.getElementById("pcRegisteredLbl").textContent = t("banner.playersRegistered")(registered == null ? 0 : registered);
  document.querySelector("#playerCounts .pcDot").classList.toggle("off", online == null);
}

function refreshOnline(){
  online = isConnected() ? Object.keys(ctx.remotePlayers).length + 1 : null;
  render();
}

function fetchRegistered(){
  supabase.rpc("player_count").then(function(res){
    if(res.error || res.data == null) return; // RPC not deployed yet: keep "—"
    registered = Number(res.data);
    render();
  });
}

export function initPlayerCounts(){
  const box = document.getElementById("playerCounts");
  if(!NET_ENABLED){
    box.classList.add("hidden");
    return;
  }
  fillIcons(box);
  render();
  onLangChange(render);
  fetchRegistered();
  setInterval(function(){ if(bannerOpen()) refreshOnline(); }, ONLINE_REFRESH_MS);
  setInterval(function(){ if(bannerOpen()) fetchRegistered(); }, REGISTERED_REFRESH_MS);
}
