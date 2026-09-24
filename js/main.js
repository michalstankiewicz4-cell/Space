import { ctx } from "./core/context.js";
import { load } from "./core/gameState.js";
import { NET_ENABLED } from "./env.js";
import { NET_DAMAGE_FLUSH_MS } from "./config.js";
import { VERSION } from "./version.js";

import { initScene } from "./scene/setup.js";
import { initControls, updateCamera, setCameraMode } from "./scene/controls.js";
import { updatePulsars } from "./scene/pulsars.js";
import { initParticles, updateParticles } from "./fx/particles.js";
import { updateFragments, updateShockwaves, updateDust } from "./fx/breakup.js";
import { seedLocalWorld, updateBodies } from "./world/bodies.js";
import { updateBlackHoles } from "./world/blackholes.js";
import { updateSolarGravity } from "./world/solarGravity.js";
import { spawnInitialFleet, updateShips, reconcileFleetSize } from "./ships/swarm.js";
import { refreshDock } from "./ui/dock.js";
import { updateTelemetry } from "./ui/hud.js";
import { initBanner } from "./ui/banner.js";
import { initSetupModal } from "./ui/setupModal.js";
import { initEscapeKey } from "./ui/escapeKey.js";
import { applyStaticText } from "./ui/i18nApply.js";
import { onLangChange } from "./i18n.js";
import { initPanels } from "./ui/panels.js";
import { initFleet } from "./ui/fleet.js";
import { initShipCam, updateShipCam, renderShipCamPIP } from "./scene/shipcam.js";
import { renderPlayersList } from "./ui/players.js";
import { maintainComet, flushDamage } from "./net/bodiesSync.js";
import { flushSolarDamage } from "./net/solarBodiesSync.js";
import { updateRemoteShips, maybeBroadcastShips } from "./net/shipsBroadcast.js";
import { initNet } from "./net/connect.js";
import { initVersionCheck } from "./versionCheck.js";
import { spawnDrone, updateDrone } from "./drone/drone.js";
import { updateDronePrintFx } from "./drone/dronePrintFx.js";
import { initDroneThumb, renderDroneThumb } from "./drone/droneThumb.js";
import { initDronePanel, refreshDronePanel } from "./ui/dronePanel.js";
import { spawnStation } from "./station/station.js";
import { applyStationField } from "./station/stationField.js";
import { initStationPanel, refreshStationPanel } from "./ui/stationPanel.js";
import { initPlanetPanel, refreshPlanetPanel } from "./ui/planetPanel.js";
import { initPlanetThumb, renderPlanetThumb } from "./world/planetThumb.js";
import { initDevTools } from "./ui/devTools.js";
import { updateLightMarkers } from "./scene/lightMarkers.js";
import { updateDistanceLines } from "./scene/planetDistanceLines.js";
import { updateLightsToggle } from "./scene/lightsToggle.js";

load();

document.getElementById("versionTag").textContent = "v" + VERSION;
document.title = document.title + " — v" + VERSION;

// The start screen comes first and gets painted before anything else:
// initScene() (WebGL context + first shader compiles) blocks the main
// thread for a noticeable moment, and until it's done the browser can't
// paint — the player would stare at an untranslated / half-styled page.
// None of these touch the scene.
applyStaticText();
onLangChange(applyStaticText);
initSetupModal();
initBanner();
initEscapeKey();
// rAF + setTimeout: resumes right after the next frame is actually painted.
// (A background tab doesn't paint, so there this waits until it's shown —
// fine, nothing below matters before the player can see it.)
await new Promise(function(resolve){
  requestAnimationFrame(function(){ setTimeout(resolve, 0); });
});

initScene();
initControls();
initParticles();

if(!NET_ENABLED){
  seedLocalWorld();
}

// Spawns before the fleet on purpose - ships/swarm.js#spawnShip() arranges
// each new ship around ctx.station.pos, so the station has to exist first
// or the very first fleet would fall back to the old near-origin spawn
// (see spawnShip()'s own comment). Base camera's default framing needs
// ctx.station.pos too, so this runs right after spawnStation() rather than
// inside initControls() (which runs before any body/station exists yet) -
// "base" is the default view on load (see scene/controls.js#
// setCameraMode's own comment).
spawnStation();
setCameraMode("base");

spawnInitialFleet();
refreshDock();
onLangChange(refreshDock);
reconcileFleetSize();
initPanels();
initFleet();
initShipCam();
initVersionCheck();
spawnDrone();
initDroneThumb();
initDronePanel();
initStationPanel();
initPlanetPanel();
initPlanetThumb();
initDevTools();

if(NET_ENABLED){
  initNet();
  setInterval(flushDamage, NET_DAMAGE_FLUSH_MS);
  setInterval(flushSolarDamage, NET_DAMAGE_FLUSH_MS);
}

/* ---------------------------------------------------------
   GAME LOOP
--------------------------------------------------------- */
const clock = new THREE.Clock();
let uiTimer = 0;

function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  updateCamera(dt);
  updatePulsars(dt);
  // Ambient gravity (every fixed solar body pulling ships/the drone, patched-
  // conics style) and the station's containment field both mutate ship
  // velocity/position — both need to run BEFORE updateShips() so this
  // frame's pull is actually integrated into movement this frame, not next.
  updateSolarGravity(dt);
  applyStationField(dt);
  // Bodies' own orbital positions (+ health regen) refresh before ships:
  // ships/swarm.js's low-health "shake" effect overwrites a target's
  // mesh.position based on its freshly-updated basePos, and needs to run
  // AFTER that position is set for this frame, not before.
  updateBodies(dt);
  updateShips(dt);
  updateParticles(dt);
  updateFragments(dt);
  updateShockwaves(dt);
  updateBlackHoles(dt);
  updateDust(dt);
  updateDrone(dt);
  updateDronePrintFx(dt);
  updateLightMarkers();
  updateDistanceLines();
  updateLightsToggle();
  maintainComet(dt);
  if(NET_ENABLED){
    updateRemoteShips(dt);
    maybeBroadcastShips(performance.now());
  }

  uiTimer += dt;
  if(uiTimer > 0.4){
    uiTimer = 0;
    updateTelemetry();
    renderPlayersList();
    refreshDronePanel();
    refreshStationPanel();
    refreshPlanetPanel();
  }

  // Reset to full-canvas before the main render, in case last frame's ship
  // cam PIP pass (below) left the viewport/scissor set to its small rect.
  ctx.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  ctx.renderer.setScissorTest(false);
  ctx.renderer.render(ctx.scene, ctx.camera);

  updateShipCam();
  renderShipCamPIP();
  renderDroneThumb();
  renderPlanetThumb(dt);

  requestAnimationFrame(tick);
}

updateCamera(0);
ctx.renderer.render(ctx.scene, ctx.camera);
requestAnimationFrame(tick);
