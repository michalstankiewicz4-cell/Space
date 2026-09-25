import { WIKI_TABS, WIKI_ENTRIES, allWikiIds, findWikiEntry } from "./wikiEntries.js";
import { wikiArt } from "./wikiArt.js";
import { isDiscovered, discover, discoveredCount, onDiscover } from "../../core/discovery.js";
import { state } from "../../core/gameState.js";
import { TREE } from "../../config.js";
import { showToast } from "../hud/eventLog.js";
import { t, onLangChange } from "../../i18n.js";
import { initStoryLog } from "../../core/storyLog.js";

// The Wiki window (#wikiModal): a read-only encyclopedia the player fills
// in by playing. Tabs across the top, the tab's entries on the left, the
// selected entry's picture and description on the right. Entries not yet
// discovered (core/discovery.js) show as a dark silhouette with a hint on
// how to find them. Nothing here changes the game — it only reads.
let tab = WIKI_TABS[0];
let selectedId = null;

function el(id){ return document.getElementById(id); }
function textKey(id){ return id.slice(id.indexOf(":") + 1); }
function isKnown(e){ return e.unlock === "start" || isDiscovered(e.id); }
function entryName(e){ return t("wiki.entries." + textKey(e.id) + ".name"); }

export function isWikiOpen(){ return !el("wikiModal").classList.contains("hidden"); }
export function getWikiTab(){ return tab; }
export function closeWiki(){ el("wikiModal").classList.add("hidden"); }

// Opens on `tabName` if given (e.g. the PLANETS nav button opens "bodies"),
// otherwise wherever the player left it.
export function openWiki(tabName){
  if(tabName && WIKI_TABS.indexOf(tabName) !== -1 && tabName !== tab){ tab = tabName; selectedId = null; }
  render();
  el("wikiModal").classList.remove("hidden");
}

function renderDetail(e){
  const known = isKnown(e);
  const art = el("wikiArt");
  art.innerHTML = wikiArt(e.art) + (known ? "" : '<span class="wikiQ">?</span>');
  art.classList.toggle("locked", !known);
  el("wikiName").textContent = known ? entryName(e) : "???";
  el("wikiCat").textContent = t("wiki.tabs." + tab);
  el("wikiMeta").textContent = known && e.meta ? e.meta : "";
  el("wikiDesc").textContent = known ? t("wiki.entries." + textKey(e.id) + ".desc") : t("wiki.hint." + e.unlock);
  el("wikiDesc").classList.toggle("locked", !known);
}

function render(){
  document.querySelectorAll("#wikiTabs button").forEach(function(b){
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.classList.toggle("gold", on);
    b.classList.toggle("blueT", !on);
  });
  const entries = WIKI_ENTRIES[tab];
  if(!entries.some(function(e){ return e.id === selectedId; })) selectedId = entries[0].id;
  const list = el("wikiList");
  list.innerHTML = "";
  entries.forEach(function(e){
    const known = isKnown(e);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wikiItem" + (known ? "" : " locked") + (e.id === selectedId ? " sel" : "");
    btn.innerHTML = '<span class="wikiThumb">' + wikiArt(e.art) + '</span><span class="wikiItemName"></span>';
    btn.querySelector(".wikiItemName").textContent = known ? entryName(e) : "???";
    btn.addEventListener("click", function(){ selectedId = e.id; render(); });
    li.appendChild(btn);
    list.appendChild(li);
  });
  renderDetail(findWikiEntry(selectedId));
  const ids = allWikiIds();
  const knownCount = ids.filter(function(id){ return isKnown(findWikiEntry(id)); }).length;
  el("wikiProgress").textContent = t("wiki.progress")(knownCount, ids.length);
}

export function initWiki(){
  const win = el("wikiModal");
  el("wikiCloseBtn").addEventListener("click", closeWiki);
  win.addEventListener("click", function(e){ if(e.target === win) closeWiki(); });
  document.querySelectorAll("#wikiTabs button").forEach(function(b){
    b.addEventListener("click", function(){ tab = b.dataset.tab; selectedId = null; render(); });
  });
  onDiscover(function(id){
    const e = findWikiEntry(id);
    if(e) showToast(t(id.indexOf("story:") === 0 ? "wiki.newStory" : "wiki.newEntry")(entryName(e)), "arrive");
    if(isWikiOpen()) render();
  });
  onLangChange(function(){ if(isWikiOpen()) render(); });
  // Upgrades bought before the Wiki existed count as discovered — quietly,
  // without a burst of event-log messages on the first load.
  Object.keys(TREE).forEach(function(k){ if(state.levels[k] > 0) discover("tech:" + k, true); });
  discoveredCount(allWikiIds()); // warm read, nothing to show yet
  initStoryLog();
}
