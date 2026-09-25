// A page never re-fetches its own JS on its own once loaded — a deploy
// doesn't reach an already-open tab until it's reloaded (see the
// cache-busting gotcha in docs/gotchas.md). This periodically re-fetches
// js/version.js itself (bypassing HTTP cache) to see what's actually
// deployed, and blocks play with a "please refresh" overlay if this tab
// is running something older, so a stale client can't act on
// game/network logic that may have moved on (e.g. schema/RPC changes).
import { VERSION } from "./version.js";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // deploys are infrequent; no need to poll harder

// Why "Refresh now" could still serve stale code even after this file's
// own fix (navigating to a `?_=<timestamp>` URL, see below): that trick
// only forces a fresh fetch of index.html itself, plus js/main.js and
// css/style.css because *they* carry a `?v=` in index.html. Every file
// main.js `import`s transitively (all of these) has no cache-busting of
// its own — a bare `import "./drone/drone.js"` always resolves to that
// exact unversioned URL, and if the browser's HTTP cache still considers
// it fresh (GitHub Pages: Cache-Control max-age=600), the native ES
// module loader serves the stale cached copy with no way for us to
// intervene (there's no way to pass fetch options to a static `import`).
// So before navigating, force-refresh the browser's cache entry for
// every one of them via a plain fetch with cache:"reload" (revalidates
// and overwrites the cached copy) — then the subsequent navigation's own
// `import`s hit the freshly-stored entries instead of stale ones.
// MAINTENANCE: this list has to be kept in sync by hand (no build step
// to derive it automatically) — add new files here when they're added
// to js/, or this stops being reliable for exactly the files it can't see.
const MODULE_FILES = [
  "css/fonts.css", "css/style.css", "css/ui/hud/commandBar.css",
  "css/ui/hud/eventLog.css", "css/ui/hud/fleetList.css", "css/ui/hud/hud.css",
  "css/ui/hud/infoPanel.css", "css/ui/hud/minimap.css", "css/ui/hud/nav.css",
  "css/ui/hud/topBar.css", "css/ui/hud/unitPanel.css",
  "css/ui/hud/viewport.css", "css/ui/kit.css", "css/ui/setupModal.css",
  "css/ui/startScreen.css", "css/ui/topBar.css", "css/ui/windows/about.css",
  "css/ui/windows/droneScript.css", "css/ui/windows/fleet.css",
  "css/ui/windows/planets.css", "css/ui/windows/players.css",
  "css/ui/windows/research.css", "css/ui/windows/window.css",
  "js/bodies/blackhole.js", "js/bodies/comet.js", "js/bodies/icePlanet.js",
  "js/bodies/meteoroid.js", "js/bodies/neutralPlanet.js", "js/bodies/sun.js",
  "js/bodies/volcanicPlanet.js", "js/config.js", "js/content.js",
  "js/core/context.js", "js/core/gameState.js", "js/core/utils.js",
  "js/drone/drone.js", "js/drone/dronePrintFx.js", "js/drone/dsl.js",
  "js/drone/interpreter.js", "js/env.js", "js/fx/breakup.js",
  "js/fx/particles.js", "js/i18n.js", "js/main.js", "js/moderation.js",
  "js/net/bodiesSync.js", "js/net/connect.js", "js/net/identity.js",
  "js/net/presence.js", "js/net/shipsBroadcast.js",
  "js/net/solarBodiesSync.js", "js/net/stewardFallback.js",
  "js/scene/controls.js", "js/scene/infoThumb.js", "js/scene/lightMarkers.js",
  "js/scene/lightsToggle.js", "js/scene/orbitLines.js", "js/scene/picking.js",
  "js/scene/planetDistanceLines.js", "js/scene/pulsars.js",
  "js/scene/setup.js", "js/scene/shipcam.js", "js/scene/skybox.js",
  "js/scene/tooltip.js", "js/scene/unitThumb.js", "js/scene/viewRect.js",
  "js/settings.js", "js/ships/swarm.js", "js/station/station.js",
  "js/station/stationField.js", "js/station/stationModel.js",
  "js/supabaseClient.js", "js/ui/about.js", "js/ui/banner.js",
  "js/ui/escapeKey.js", "js/ui/hud/commandBar.js",
  "js/ui/hud/connectionStatus.js", "js/ui/hud/devTools.js",
  "js/ui/hud/eventLog.js", "js/ui/hud/fleetList.js", "js/ui/hud/hud.js",
  "js/ui/hud/infoPanel.js", "js/ui/hud/minimap.js", "js/ui/hud/nav.js",
  "js/ui/hud/planetPanel.js", "js/ui/hud/stationPanel.js",
  "js/ui/hud/topBar.js", "js/ui/hud/unitPanel.js", "js/ui/i18nApply.js",
  "js/ui/icons.js", "js/ui/playerCounts.js", "js/ui/setupModal.js",
  "js/ui/windows/droneScript.js", "js/ui/windows/fleet.js",
  "js/ui/windows/players.js", "js/ui/windows/research.js",
  "js/ui/windows/windows.js", "js/version.js", "js/versionCheck.js",
  "js/world/blackholes.js", "js/world/bodies.js", "js/world/bodyMeshParts.js",
  "js/world/bodyParams.js", "js/world/cometPhysics.js",
  "js/world/solarGravity.js", "js/world/solarSystem.js",
  "js/world/textures.js"
];
const REFRESH_TIMEOUT_MS = 3000; // don't leave the player stuck if the network is slow/flaky

function refreshModuleCache(){
  const fetches = MODULE_FILES.map(function(path){
    return fetch(path, { cache: "reload" }).catch(function(){ /* best-effort */ });
  });
  const timeout = new Promise(function(resolve){ setTimeout(resolve, REFRESH_TIMEOUT_MS); });
  return Promise.race([Promise.all(fetches), timeout]);
}

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
  if(reloadBtn) reloadBtn.addEventListener("click", async function(){
    reloadBtn.disabled = true;
    // refreshModuleCache() re-warms the browser's HTTP cache for every
    // imported module first (see the big comment above) — without it,
    // navigating below can still leave stale files behind even though it
    // fetches a genuinely new index.html.
    await refreshModuleCache();
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
