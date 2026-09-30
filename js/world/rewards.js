import { state, save } from "../core/gameState.js";
import { showToast } from "../ui/hud/eventLog.js";
import { refreshResearch } from "../ui/windows/research.js";
import { triggerBreakup } from "../fx/breakup.js";
import { destroyPlanet } from "./bodies.js";
import { bodyValueEstimate } from "./bodyParams.js";
import { t } from "../i18n.js";

// A body eaten: its points, the "eaten" count, the toast, a save — the one
// place every kill goes through (the swarm, a program's attack(), and the
// server's confirmation online: net/biteBudget.js). Offline, the local
// kill also plays the break-up (`breakup`) and removes a comet (`remove`);
// online the server's DELETE / UPDATE does that for every client.
export function awardKill(body, opts){
  const gained = bodyValueEstimate(body);
  state.points += gained;
  state.eaten += 1;
  showToast(t("toast.eaten")(gained), "arrive");
  if(opts && opts.breakup) triggerBreakup(body);
  if(opts && opts.remove) destroyPlanet(body);
  refreshResearch();
  save();
}
