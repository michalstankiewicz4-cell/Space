import { TREE } from "../../config.js";
import { state, cost, save } from "../../core/gameState.js";
import { reconcileFleetSize } from "../../ships/swarm.js";
import { showToast } from "../hud/eventLog.js";
import { updateTelemetry } from "../hud/topBar.js";
import { t } from "../../i18n.js";

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

function renderNode(node){
  const lvl = state.levels[node.key];
  const c = cost(node);
  const div = document.createElement("div");
  div.className = "node" + (c===null || c>state.points ? " disabled" : "");
  const pct = Math.min(100, Math.round((lvl/node.maxLvl)*100));
  div.innerHTML =
    '<div class="icon">'+node.icon+'</div>'+
    '<div class="name">'+t("upgrades."+node.key)+'</div>'+
    '<div class="lvl">'+t("upgrades.level")(lvl, node.maxLvl)+'</div>'+
    '<div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="cost">'+(c===null ? t("upgrades.max") : c+" "+t("upgrades.pts"))+'</div>';
  div.addEventListener("click", function(){
    const c2 = cost(node);
    if(c2===null || state.points < c2) return;
    state.points -= c2;
    state.levels[node.key] += 1;
    if(node.key === "fleet") reconcileFleetSize();
    refreshResearch();
    save();
  });
  return div;
}

function renderResetButton(){
  const div = document.createElement("div");
  div.className = "node node-reset";
  div.innerHTML =
    '<div class="icon">↺</div>'+
    '<div class="name">'+t("upgrades.resetName")+'</div>'+
    '<div class="lvl">'+t("upgrades.resetDesc")+'</div>';
  div.addEventListener("click", resetUpgrades);
  return div;
}

export function refreshResearch(){
  const dock = document.getElementById("dock");
  dock.innerHTML = "";
  Object.keys(TREE).forEach(function(k){ dock.appendChild(renderNode(TREE[k])); });
  dock.appendChild(renderResetButton());
  updateTelemetry();
}
