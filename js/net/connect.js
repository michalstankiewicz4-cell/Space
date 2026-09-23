import { supabase } from "../supabaseClient.js";
import { clientId, joinedAt, myIdentity } from "./identity.js";
import { setPresenceState } from "./presence.js";
import { updatePlayersHud, setConnectionStatus } from "../ui/hud.js";
import { materializeBody, onBodyUpdated, onBodyDeleted, bootstrapWorld } from "./bodiesSync.js";
import { onSolarBodyUpdated, bootstrapSolarSystem } from "./solarBodiesSync.js";
import { handleRemoteShips, handleRemoteDronePrint } from "./shipsBroadcast.js";

export let roomChannel = null;

// Whether the Realtime channel is currently believed to be live — read by
// net/bodiesSync.js so a disconnected client won't act on its own
// (possibly stale) view of the world; see the reconnect logic below for
// why "possibly stale" is a real risk, not just caution.
let connected = false;
export function isConnected(){ return connected; }

// The channel's subscribe() callback only ever reported "SUBSCRIBED" —
// none of Realtime's failure statuses ("CHANNEL_ERROR", "TIMED_OUT",
// "CLOSED") were handled at all. If the socket drops (sleep/wake, network
// change, an expired token after a long background period) and the
// underlying library's own auto-reconnect doesn't fully recover the
// channel, this client goes silently deaf: postgres_changes/presence/
// broadcast stop updating forever, while everything that doesn't depend on
// the socket (local ship movement, and — importantly — bite_body/insert/
// delete, which are plain REST calls) keeps working normally. From the
// player's seat, "everything looks fine" while the shared world quietly
// stops syncing for them specifically.
let reconnectAttempt = 0;
let reconnectTimer = null;

function scheduleReconnect(){
  if(reconnectTimer) return; // one pending attempt at a time
  reconnectAttempt++;
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
  reconnectTimer = setTimeout(function(){
    reconnectTimer = null;
    if(roomChannel) supabase.removeChannel(roomChannel); // avoid piling up duplicate listeners on retry
    connectRoom();
  }, delay);
}

function connectRoom(){
  roomChannel = supabase.channel("room:main", { config: { presence: { key: clientId } } });

  roomChannel.on("presence", { event: "sync" }, function(){
    setPresenceState(roomChannel.presenceState());
    updatePlayersHud();
  });
  roomChannel.on("broadcast", { event: "ships" }, function(msg){ handleRemoteShips(msg.payload); });
  roomChannel.on("broadcast", { event: "dronePrint" }, function(msg){ handleRemoteDronePrint(msg.payload); });
  roomChannel.on("postgres_changes", { event: "INSERT", schema: "public", table: "bodies" }, function(payload){ materializeBody(payload.new); });
  roomChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "bodies" }, function(payload){ onBodyUpdated(payload.new); });
  roomChannel.on("postgres_changes", { event: "DELETE", schema: "public", table: "bodies" }, function(payload){ onBodyDeleted(payload.old); });
  // solar_bodies is a permanent, fixed set (see net/solarBodiesSync.js) —
  // only ever UPDATEd, never INSERTed/DELETEd after the one-time migration
  // seed, so that's the only event this subscribes to.
  roomChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "solar_bodies" }, function(payload){ onSolarBodyUpdated(payload.new); });

  roomChannel.subscribe(function(status){
    if(status === "SUBSCRIBED"){
      connected = true;
      reconnectAttempt = 0;
      setConnectionStatus(true);
      // Not awaited (this client doesn't block startup on it landing), but
      // its returned promise is still checked — a failed track() used to
      // fail completely silently: this client would never appear in
      // Presence, so it'd never be counted toward steward election or show
      // up in other players' HUD list, with nothing in the console to
      // explain why.
      roomChannel.track({ client_id: clientId, joined_at: joinedAt, nick: myIdentity.nick, color: myIdentity.color })
        .then(function(status){ if(status !== "ok") console.warn("Presence track() did not report ok:", status); })
        .catch(function(err){ console.warn("Presence track() rejected", err); });
      // Self-reported only (see actor_nicks' own comment in schema.sql) —
      // this is purely so admin.html can show a display name next to an
      // activity_log actor UUID for the common/honest case; `actor`
      // defaults to auth.uid() server-side, this client never needs to
      // know its own Supabase user id. Goes through the set_my_nick() RPC,
      // not a direct table write — that's what rate-limits a script
      // trying to hammer it (the table itself has no client-writable
      // policy at all). Not awaited: nothing here depends on it landing
      // before anything else, and it's fine if it silently fails offline/
      // rate-limited — it just means one row in one table won't be as
      // friendly to read later, nothing gameplay-visible.
      supabase.rpc("set_my_nick", { p_nick: myIdentity.nick })
        .then(function(res){ if(res.error) console.warn("set_my_nick failed", res.error); });
      // Re-fetches current world state and reconciles it against what this
      // client already has locally (see bootstrapWorld) — on a first
      // connect that's just the initial seed; on a reconnect it also
      // catches up on anything this client missed while disconnected,
      // including deletes, which Realtime never replays after the fact.
      bootstrapWorld();
      // The fixed solar bodies (+ sun) never need despawn/reconcile logic —
      // the set itself never changes, only health does, and any missed
      // UPDATEs during a disconnect self-correct via each body's own
      // (healthBase, healthUpdatedAtMs) regen recompute anyway. A plain
      // one-time fetch is enough, on both first connect and reconnect.
      bootstrapSolarSystem();
    } else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
      if(connected){ connected = false; setConnectionStatus(false); }
      scheduleReconnect();
    }
  });
}

// Reuses an already-stored session instead of always minting a fresh
// anonymous user — confirmed live (see CLAUDE.md's "Anonymous-auth spam"
// bullet) that calling signInAnonymously() unconditionally on every page
// load was creating a brand new Supabase user on every single reload, even
// in the exact same browser: auth.users grew by exactly one per reload,
// with a different user.id stored each time. getSession() reads (and
// silently refreshes, if needed) whatever's already in localStorage —
// nothing to do with the player's current IP, which the token doesn't
// care about at all — so a returning tab keeps its identity instead of
// counting as a fresh "user" every time.
export function initNet(){
  supabase.auth.getSession().then(function(res){
    if(res.data && res.data.session){
      connectRoom();
      return;
    }
    supabase.auth.signInAnonymously().then(function(signInRes){
      if(signInRes.error){ console.warn("Supabase anonymous sign-in failed", signInRes.error); }
      connectRoom();
    });
  });
}
