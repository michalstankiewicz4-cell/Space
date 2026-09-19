// A page never re-fetches its own JS on its own once loaded — a deploy
// doesn't reach an already-open tab until it's reloaded (see the
// cache-busting gotcha in CLAUDE.md). This periodically re-fetches
// js/version.js itself (bypassing HTTP cache) to see what's actually
// deployed, and blocks play with a "please refresh" overlay if this tab
// is running something older, so a stale client can't act on
// game/network logic that may have moved on (e.g. schema/RPC changes).
import { VERSION } from "./version.js";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // deploys are infrequent; no need to poll harder

function parseVersion(v){
  return String(v).split(".").map(function(n){ return parseInt(n, 10) || 0; });
}

// true if `a` is strictly older than `b`, e.g. isOlder("1.2.0", "1.3.0") === true
function isOlder(a, b){
  const pa = parseVersion(a), pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for(let i=0; i<len; i++){
    const x = pa[i]||0, y = pb[i]||0;
    if(x !== y) return x < y;
  }
  return false;
}

async function fetchDeployedVersion(){
  try{
    const res = await fetch("js/version.js?_=" + Date.now(), { cache: "no-store" });
    if(!res.ok) return null;
    const text = await res.text();
    const m = text.match(/VERSION\s*=\s*["']([0-9.]+)["']/);
    return m ? m[1] : null;
  }catch(e){
    return null;
  }
}

async function checkOnce(){
  const deployed = await fetchDeployedVersion();
  if(deployed && isOlder(VERSION, deployed)){
    const el = document.getElementById("outdatedOverlay");
    if(el) el.classList.remove("hidden");
  }
}

export function initVersionCheck(){
  const reloadBtn = document.getElementById("outdatedReloadBtn");
  if(reloadBtn) reloadBtn.addEventListener("click", function(){
    // A plain location.reload() is just F5 — it can still serve
    // sub-resources (js/main.js, css/style.css) straight from the HTTP
    // cache if they're within GitHub Pages' 10-minute freshness window,
    // since a normal reload only revalidates resources the browser
    // already considers stale. There's no standard cross-browser JS API
    // for a true hard reload (Ctrl+Shift+R) — `reload(true)` is a
    // long-removed non-standard Firefox-ism. Navigating to a cache-busted
    // URL instead guarantees a real fetch: it's a URL the browser has
    // never seen, so there's nothing cached to serve. `replace()` (not
    // setting `.href`) avoids leaving a junk entry in browser history.
    location.replace(location.pathname + "?_=" + Date.now());
  });
  checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MS);
}
