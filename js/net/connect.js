import { supabase } from "../supabaseClient.js";
import { clientId, joinedAt, myIdentity } from "./identity.js";
import { setPresenceState } from "./presence.js";
import { updatePlayersHud } from "../ui/hud/topBar.js";
import { setConnectionStatus } from "../ui/hud/connectionStatus.js";
import { materializeBody, onBodyUpdated, onBodyDeleted, bootstrapWorld } from "./bodiesSync.js";
import { onSolarBodyUpdated, bootstrapSolarSystem } from "./solarBodiesSync.js";
import { handleRemoteShips, handleRemoteDronePrint } from "./shipsBroadcast.js";

export let roomChannel = null;

// Whether the Realtime channel is live — a disconnected client must not act
// on its stale view of the world (net/stewardFallback.js).
let connected = false;
export function isConnected(){ return connected; }

// Reconnecting: when the socket drops (sleep/wake, a network change, an
// expired token) and the library doesn't recover the channel, the client
// goes silently deaf — no world updates, no players — while the plain REST
// calls (bites, comets) keep working. So a failed channel is replaced,
// with exponential backoff (docs/architecture.md, "Realtime channel health").
let reconnectAttempt = 0;
let reconnectTimer = null;

function scheduleReconnect(){
  if(reconnectTimer) return; // one pending attempt at a time
  reconnectAttempt++;
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
  reconnectTimer = setTimeout(function(){
    reconnectTimer = null;
    // Forget the old channel BEFORE removing it: its removal reports
    // "CLOSED" to its own callback, which used to schedule yet another
    // reconnect — an endless loop every ~2 s (v2.26.1, docs/gotchas.md).
    const old = roomChannel;
    roomChannel = null;
    if(old) supabase.removeChannel(old); // avoid piling up duplicate listeners on retry
    connectRoom();
  }, delay);
}

function connectRoom(){
  const channel = supabase.channel("room:main", { config: { presence: { key: clientId } } });
  roomChannel = channel;

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
    if(channel !== roomChannel) return;   // a replaced channel's last word (its own removal) — not ours to act on
    if(status === "SUBSCRIBED"){
      connected = true;
      reconnectAttempt = 0;
      setConnectionStatus(true);
      // Checked, not awaited: a failed track() leaves this client out of
      // presence (no steward election, invisible to others) — say so.
      roomChannel.track({ client_id: clientId, joined_at: joinedAt, nick: myIdentity.nick, color: myIdentity.color })
        .then(function(status){ if(status !== "ok") console.warn("Presence track() did not report ok:", status); })
        .catch(function(err){ console.warn("Presence track() rejected", err); });
      // The nick for admin.html's log (self-reported; the RPC is
      // rate-limited, the table itself not writable by clients).
      supabase.rpc("set_my_nick", { p_nick: myIdentity.nick })
        .then(function(res){ if(res.error) console.warn("set_my_nick failed", res.error); });
      // The world, fetched fresh on every (re)connect: Realtime never
      // replays what was missed while disconnected (deletes included).
      bootstrapWorld();
      bootstrapSolarSystem();
    } else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
      if(connected){ connected = false; setConnectionStatus(false); }
      scheduleReconnect();
    }
  });
}

// A new anonymous account — at most one sign-in in flight. Once in the room,
// the new account registers the nick too (connectRoom does it on subscribe).
let signingIn = null, leaving = false, started = false;
function signInFresh(){
  if(!signingIn){
    signingIn = supabase.auth.signInAnonymously().then(function(res){
      if(res.error){ console.warn("Supabase anonymous sign-in failed", res.error); return; }
      if(connected) supabase.rpc("set_my_nick", { p_nick: myIdentity.nick })
        .then(function(r){ if(r.error) console.warn("set_my_nick failed", r.error); });
    }).finally(function(){ signingIn = null; });
  }
  return signingIn;
}

// "Delete my data" signs out on purpose (ui/privacy.js): no new account then.
export function leaveForGood(){ leaving = true; }

// Reuse the stored session: signing in anonymously on every load made a new
// account per reload (docs/security.md, "Anonymous-auth spam"). But the
// stored session may belong to an account that's gone (a game reset deletes
// them — docs/security.md, "Privacy"): its token can still look valid for up
// to an hour, so the server is asked (getUser) before it's used. And if the
// session is lost mid-game (the account deleted, a refresh refused), a new
// one is made without a reload.
export function initNet(){
  started = true;
  supabase.auth.onAuthStateChange(function(event){
    if(event === "SIGNED_OUT" && started && !leaving) signInFresh();
  });
  supabase.auth.getSession().then(function(res){
    if(!(res.data && res.data.session)){ signInFresh().then(connectRoom); return; }
    supabase.auth.getUser().then(function(u){
      if(u.data && u.data.user){ connectRoom(); return; }
      // gone: drop it here (no server call for an account that doesn't exist), then a new one
      supabase.auth.signOut({ scope: "local" }).catch(function(){}).then(signInFresh).then(connectRoom);
    });
  });
}
