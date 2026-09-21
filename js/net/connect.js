import { supabase } from "../supabaseClient.js";
import { clientId, joinedAt, myIdentity } from "./identity.js";
import { setPresenceState } from "./presence.js";
import { updatePlayersHud, setConnectionStatus } from "../ui/hud.js";
import { materializeBody, onBodyUpdated, onBodyDeleted, bootstrapWorld } from "./bodiesSync.js";
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

  roomChannel.subscribe(function(status){
    if(status === "SUBSCRIBED"){
      connected = true;
      reconnectAttempt = 0;
      setConnectionStatus(true);
      roomChannel.track({ client_id: clientId, joined_at: joinedAt, nick: myIdentity.nick, color: myIdentity.color });
      // Self-reported only (see actor_nicks' own comment in schema.sql) —
      // this is purely so admin.html can show a display name next to an
      // activity_log actor UUID for the common/honest case; `actor`
      // defaults to auth.uid() server-side, this client never needs to
      // know its own Supabase user id. Not awaited: nothing here depends
      // on it landing before anything else, and it's fine if it silently
      // fails offline/rate-limited — it just means one row in one table
      // won't be as friendly to read later, nothing gameplay-visible.
      supabase.from("actor_nicks").upsert({ nick: myIdentity.nick, updated_at: new Date().toISOString() })
        .then(function(res){ if(res.error) console.warn("actor_nicks upsert failed", res.error); });
      // Re-fetches current world state and reconciles it against what this
      // client already has locally (see bootstrapWorld) — on a first
      // connect that's just the initial seed; on a reconnect it also
      // catches up on anything this client missed while disconnected,
      // including deletes, which Realtime never replays after the fact.
      bootstrapWorld();
    } else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
      if(connected){ connected = false; setConnectionStatus(false); }
      scheduleReconnect();
    }
  });
}

export function initNet(){
  supabase.auth.signInAnonymously().then(function(res){
    if(res.error){ console.warn("Supabase anonymous sign-in failed", res.error); }
    connectRoom();
  });
}
