import { TREE } from "../../config.js";
import { state, cost, save } from "../../core/gameState.js";
import { reconcileFleetSize } from "../../ships/swarm.js";
import { showToast } from "../hud/eventLog.js";
import { updateTelemetry } from "../hud/topBar.js";
import { t } from "../../i18n.js";
import { discover } from "../../core/discovery.js";
import { renderTechTree, initTechTree } from "./techTree.js";

function totalSpentOn(node, level){
  if(level<=0) return 0;
  return Math.round(node.base * (Math.pow(node.growth, level)-1) / (node.growth-1));
}

function resetUpgrades(){
  if(!window.confirm(t("upgrades.resetConfirm"))) return;
  let refund = 0;
  Object.keys(TREE).forEach(function(k){
    refund += totalSpentOn(TREE[k], state.levels[k]);
    state.levels[k] = 0;
  });
  state.points += refund;
  reconcileFleetSize();
  refreshResearch();
  save();
  showToast(t("upgrades.resetToast")(refund));
}

// Buys the next level of an upgrade (config.js#TREE key) — the tree view
// (ui/windows/techTree.js) calls this when an upgrade node is clicked.
function buy(key){
  const node = TREE[key];
  const c = cost(node);
  if(c===null || state.points < c) return;
  state.points -= c;
  state.levels[key] += 1;
  discover("tech:" + key);
  if(key === "fleet") reconcileFleetSize();
  refreshResearch();
  save();
}

// The Research window: the upgrade trees (ui/windows/techTree.js, their
// shape in techTreeData.js) plus the reset button.
export function initResearch(){
  initTechTree();
  document.getElementById("ttReset").addEventListener("click", resetUpgrades);
}

export function refreshResearch(){
  renderTechTree(buy);
  const reset = document.getElementById("ttReset");
  reset.textContent = "↺ " + t("upgrades.resetName");
  reset.title = t("upgrades.resetDesc");
  updateTelemetry();
}
