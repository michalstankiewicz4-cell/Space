import { supabase } from "../supabaseClient.js";
import { clientId, joinedAt, myIdentity } from "./identity.js";
import { setPresenceState } from "./presence.js";
import { updatePlayersHud } from "../ui/hud.js";
import { materializeBody, onBodyUpdated, onBodyDeleted, bootstrapWorld } from "./bodiesSync.js";
import { handleRemoteShips } from "./shipsBroadcast.js";

export let roomChannel = null;

function connectRoom(){
  roomChannel = supabase.channel("room:main", { config: { presence: { key: clientId } } });

  roomChannel.on("presence", { event: "sync" }, function(){
    setPresenceState(roomChannel.presenceState());
    updatePlayersHud();
  });
  roomChannel.on("broadcast", { event: "ships" }, function(msg){ handleRemoteShips(msg.payload); });
  roomChannel.on("postgres_changes", { event: "INSERT", schema: "public", table: "bodies" }, function(payload){ materializeBody(payload.new); });
  roomChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "bodies" }, function(payload){ onBodyUpdated(payload.new); });
  roomChannel.on("postgres_changes", { event: "DELETE", schema: "public", table: "bodies" }, function(payload){ onBodyDeleted(payload.old); });

  roomChannel.subscribe(function(status){
    if(status === "SUBSCRIBED"){
      roomChannel.track({ client_id: clientId, joined_at: joinedAt, nick: myIdentity.nick, color: myIdentity.color });
      bootstrapWorld();
    }
  });
}

export function initNet(){
  supabase.auth.signInAnonymously().then(function(res){
    if(res.error){ console.warn("Supabase anonymous sign-in failed", res.error); }
    connectRoom();
  });
}
