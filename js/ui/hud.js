import { ctx } from "../core/context.js";
import { state } from "../core/gameState.js";

export function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.remove("show"); }, 1400);
}

export function updateTelemetry(){
  document.getElementById("statPoints").textContent = state.points;
  document.getElementById("statShips").textContent = ctx.ships.length;
  document.getElementById("statEaten").textContent = state.eaten;
}

export function updatePlayersHud(){
  const el = document.getElementById("statPlayers");
  if(el) el.textContent = String(Object.keys(ctx.remotePlayers).length + 1);
}

// Purely informational — local gameplay (ship movement, biting, spawning)
// keeps working during a disconnect since those don't depend on the
// Realtime socket, so this never blocks anything, unlike the version-check
// overlay. See net/connect.js for when this fires.
export function setConnectionStatus(isConnected){
  const el = document.getElementById("connectionStatus");
  if(el) el.classList.toggle("hidden", isConnected);
}
