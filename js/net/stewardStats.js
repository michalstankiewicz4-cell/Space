import { supabase } from "../supabaseClient.js";
import { isSteward, othersOnline } from "./presence.js";
import { isConnected } from "./connect.js";

// Players online, for admin.html's charts (supabase/schema.sql#report_online
// → stats_hourly.peak_online): only the steward reports, so it's one small
// request per REPORT_MS for the whole room, not one per player. Self-reported
// and clamped server-side — a hint, not a measurement.
const REPORT_MS = 5 * 60 * 1000;

function report(){
  if(!isSteward || !isConnected()) return;
  supabase.rpc("report_online", { p_count: othersOnline() + 1 })
    .then(function(res){ if(res.error) console.warn("report_online failed", res.error); });
}

export function initStewardStats(){
  setTimeout(report, 30000);   // soon after joining, then every few minutes
  setInterval(report, REPORT_MS);
}
