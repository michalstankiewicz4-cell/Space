import { ctx } from "../../core/context.js";
import { state } from "../../core/gameState.js";

// The HUD top bar's live readouts: the four slots in #resBox and the
// cycle/clock box. Static labels are set by ui/i18nApply.js.
export function updateTelemetry(){
  document.getElementById("statPoints").textContent = state.points;
  document.getElementById("statShips").textContent = ctx.ships.length;
  document.getElementById("statEaten").textContent = state.eaten;
}

export function updatePlayersHud(){
  const el = document.getElementById("statPlayers");
  if(el) el.textContent = String(Object.keys(ctx.remotePlayers).length + 1);
}

// "Cycle" is days since the fixed solar system went live (one decimal, so
// it visibly ticks every ~2.4h), plus local wall-clock time. Purely
// informational — game time can't be paused or sped up in multiplayer,
// which is why the speed buttons next to it are decorative.
const CYCLE_EPOCH_MS = Date.UTC(2026, 8, 21);
export function updateClock(){
  const now = new Date();
  document.getElementById("sdCycleVal").textContent = ((now.getTime() - CYCLE_EPOCH_MS) / 86400000).toFixed(1);
  document.getElementById("sdTime").textContent =
    String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}
