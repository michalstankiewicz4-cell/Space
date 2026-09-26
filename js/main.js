import { load } from "./core/gameState.js";
import { NET_ENABLED } from "./env.js";
import { NET_DAMAGE_FLUSH_MS } from "./config.js";
import { VERSION } from "./version.js";

import { initScene } from "./scene/setup.js";
import { manageSceneColors } from "./scene/colorManagement.js";
import { updateShipVisuals } from "./ships/shipVisual.js";
import { updateStationVisuals } from "./station/stationVisual.js";
import { updateBodyLooks } from "./world/bodyVisual.js";
import { perfFrameStart, perfRenderStart, perfFrameEnd } from "./ui/hud/perfStats.js";
import { ctx } from "./core/context.js";
import { initControls, updateCamera, setCameraMode } from "./scene/controls.js";
import { updateSkybox } from "./scene/skybox.js";
import { initParticles, updateParticles } from "./fx/particles.js";
import { updateFragments, updateShockwaves, updateDust } from "./fx/breakup.js";
import { seedLocalWorld, updateBodies } from "./world/bodies.js";
import { updateBlackHoles } from "./world/blackholes.js";
import { updateSolarGravity } from "./world/solarGravity.js";
import { spawnInitialFleet, updateShips, reconcileFleetSize } from "./ships/swarm.js";
import { initBanner } from "./ui/banner.js";
import { initSetupModal } from "./ui/setupModal.js";
import { initAbout } from "./ui/about.js";
import { initPlayerCounts } from "./ui/playerCounts.js";
import { initEscapeKey } from "./ui/escapeKey.js";
import { applyStaticText } from "./ui/i18nApply.js";
import { onLangChange } from "./i18n.js";
import { initWindows } from "./ui/windows/windows.js";
import { initHudShell, initHudWorld, updateHud } from "./ui/hud/hud.js";
import { initShipCam, updateShipCam, renderShipCamPIP } from "./scene/shipcam.js";
import { maintainComet, flushDamage } from "./net/bodiesSync.js";
import { flushSolarDamage } from "./net/solarBodiesSync.js";
import { updateRemoteShips, maybeBroadcastShips } from "./net/shipsBroadcast.js";
import { initNet } from "./net/connect.js";
import { initVersionCheck } from "./versionCheck.js";
import { spawnDrone, updateDrone, updateDroneWreckage } from "./drone/drone.js";
import { updateDronePrintFx } from "./drone/dronePrintFx.js";
import { spawnStation } from "./station/station.js";
import { applyStationField } from "./station/stationField.js";
import { renderMainView, initViewRect } from "./scene/viewRect.js";
import { initUnitThumb, renderUnitThumb } from "./scene/unitThumb.js";
import { initInfoThumb, renderInfoThumb } from "./scene/infoThumb.js";
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
initHudShell();
applyStaticText();
onLangChange(applyStaticText);
initSetupModal();
initAbout();
initPlayerCounts();
initBanner();
initEscapeKey();
// rAF + setTimeout: resumes right after the next frame is actually painted.
// (A background tab doesn't paint, so there this waits until it's shown —
// fine, nothing below matters before the player can see it.)
await new Promise(function(resolve){
  requestAnimationFrame(function(){ setTimeout(resolve, 0); });
});

initScene();
initViewRect();
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
reconcileFleetSize();
initShipCam();
initVersionCheck();
spawnDrone();
initWindows();
initHudWorld();
initUnitThumb();
initInfoThumb();

if(NET_ENABLED){
  initNet();
  setInterval(flushDamage, NET_DAMAGE_FLUSH_MS);
  setInterval(flushSolarDamage, NET_DAMAGE_FLUSH_MS);
}

/* ---------------------------------------------------------
   GAME LOOP
--------------------------------------------------------- */
const clock = new THREE.Clock();

function tick(){
  perfFrameStart();             // Dev Tools -> Performance stats (ui/hud/perfStats.js)
  const dt = Math.min(0.05, clock.getDelta());
  updateCamera(dt);
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
  updateDroneWreckage(dt);
  updateDronePrintFx(dt);
  updateLightMarkers();
  updateDistanceLines();
  updateLightsToggle();
  maintainComet(dt);
  if(NET_ENABLED){
    updateRemoteShips(dt);
    maybeBroadcastShips(performance.now());
  }

  updateHud(dt);

  updateShipVisuals(dt);        // ship models: level of detail, animation, wrecks
  updateStationVisuals(dt);     // stations (ShipKit's ST-04 HAVEN): ring spin, lights, dish
  updateBodyLooks(dt);          // BodyKit bodies: animated layers, spin, sun direction
  updateSkybox(dt);             // BodyKit sky: follows the camera, twinkles, bakes after a change
  manageSceneColors(ctx.scene); // new materials/lights: sRGB -> linear, once each

  // Main view into the HUD's viewport rect, then the extra passes (ship cam,
  // unit/planet miniatures) into their own panels' rects — all on the same
  // full-window canvas (see scene/viewRect.js).
  perfRenderStart();
  renderMainView();
  updateShipCam();
  renderShipCamPIP();
  renderUnitThumb();
  renderInfoThumb(dt);
  perfFrameEnd();

  requestAnimationFrame(tick);
}

updateCamera(0);
renderMainView();
requestAnimationFrame(tick);
