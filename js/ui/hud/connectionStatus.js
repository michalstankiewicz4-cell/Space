import { showToast } from "./eventLog.js";
import { t } from "../../i18n.js";

// The "reconnecting" badge at the top of the 3D viewport. Purely
// informational — local gameplay (ship movement, biting, spawning) keeps
// working during a disconnect since those don't depend on the Realtime
// socket, so this never blocks anything, unlike the version-check overlay.
// See net/connect.js for when this fires. Only state changes are logged to
// the event log, not every call.
let lastConnected = true;
export function setConnectionStatus(isConnected){
  const el = document.getElementById("connectionStatus");
  if(el) el.classList.toggle("hidden", isConnected);
  if(isConnected !== lastConnected){
    showToast(isConnected ? t("event.connectionBack") : t("event.connectionLost"), isConnected ? "info" : "alert");
    lastConnected = isConnected;
  }
}
