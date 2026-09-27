import { NET_ENABLED } from "../env.js";
import { t } from "../i18n.js";
import { containsProfanity } from "../moderation.js";
import { spawnPrintEffect } from "../drone/dronePrintFx.js";
import { broadcastDronePrint } from "../net/shipsBroadcast.js";
import { myIdentity } from "../net/identity.js";
import { DRONE_PRINT_MAX_LEN, DRONE_PRINT_COOLDOWN_S } from "../config.js";
import { logTo } from "./runner.js";

// print(x) for any programmable unit: the log line, plus a gas puff from
// the unit's nose with a laser writing x into it (drone/dronePrintFx.js),
// relayed to other players over Realtime broadcast. In the player's own
// color — the same one other players see it in (net/shipsBroadcast.js).
export function unitPrint(unit, msg){
  logTo(unit, msg);
  // A while(true){ print("x") } script with no wait() would otherwise fire
  // this as fast as the interpreter's own runaway-script step limit allows
  // (program/runner.js#MAX_INSTANT_STEPS_PER_FRAME) — up to ~2000 broadcast
  // messages in a single frame. This cooldown lives outside the DSL sandbox
  // in plain JS the script can't touch; a fully custom/modified client
  // bypassing this file could still flood the channel directly, the same
  // residual risk broadcast spam already has everywhere else.
  const now = performance.now();
  if(now - (unit.lastPrintAt || -Infinity) < DRONE_PRINT_COOLDOWN_S * 1000){
    logTo(unit, t("drone.printCooldown"));
    return;
  }
  const text = String(msg).slice(0, DRONE_PRINT_MAX_LEN);
  // A courtesy check, same spirit as confirmNick()'s own-nick check: the
  // real defense is handleRemoteDronePrint() re-checking on the receiving
  // end. This one tells the player *why* nothing showed up.
  if(containsProfanity(text)){
    logTo(unit, t("drone.printBlocked"));
    return;
  }
  unit.lastPrintAt = now;
  const color = parseInt(String(myIdentity.color || "#ff7a45").slice(1), 16);
  spawnPrintEffect(unit.pos, unit.heading, text, isNaN(color) ? 0xff7a45 : color);
  if(NET_ENABLED) broadcastDronePrint(unit.pos, unit.heading, text);
}
