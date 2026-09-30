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
import { initPrivacyNotice, initPrivacySettings, whenPrivacyAccepted } from "./ui/privacy.js";
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
import { renderMainView, initViewRect } from "./scene/viewRect.js";
import { updateSelectionBrackets } from "./scene/selectionBrackets.js";
import { initUnitThumb, renderUnitThumb } from "./scene/unitThumb.js";
import { initInfoThumb, renderInfoThumb } from "./scene/infoThumb.js";
import { updateLightMarkers } from "./scene/lightMarkers.js";
import { updateDistanceLines } from "./scene/planetDistanceLines.js";
import { updateLightsToggle } from "./scene/lightsToggle.js";
import { updateTrajectories } from "./scene/trajectories.js";
import { updateResolution } from "./scene/resolution.js";
import { setLoad, loadDone, nextPaint } from "./ui/loader.js";
import { updateTrails } from "./fx/trails.js";
import { manageEclipses } from "./scene/eclipse.js";
import { initAnisotropy, updateAnisotropy } from "./scene/anisotropy.js";
import { gfxFpsCap } from "./scene/graphics.js";

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
initPrivacySettings();
initPrivacyNotice();
initPlayerCounts();   // its server requests wait for the privacy policy itself
initBanner();
initEscapeKey();
// The loading bar (ui/loader.js, in the ENTER ORBIT button): the rest of
// the start-up blocks the main thread in chunks, so each chunk is followed
// by nextPaint() — rAF + setTimeout, resumes right after the next frame is
// actually painted — and the bar moves between them. The libraries are
// already loaded once this module runs, hence the 30% head start.
// (A background tab doesn't paint, so there this waits until it's shown —
// fine, nothing below matters before the player can see it.)
setLoad(0.3, "scene");
await nextPaint();

initScene();
initViewRect();
initControls();
initParticles();
setLoad(0.45, "world");
await nextPaint();

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
setCameraMode("base", { instant: true });
setLoad(0.6, "fleet");
await nextPaint();

spawnInitialFleet();
reconcileFleetSize();
initShipCam();
initVersionCheck();
spawnDrone();
setLoad(0.72, "hud");
await nextPaint();

initWindows();
initHudWorld();
initAnisotropy();
initUnitThumb();
initInfoThumb();

// Nothing reaches the server (anonymous account, presence, broadcasts)
// before the player accepts the privacy policy (ui/privacy.js).
if(NET_ENABLED){
  whenPrivacyAccepted(function(){
    initNet();
    setInterval(flushDamage, NET_DAMAGE_FLUSH_MS);
    setInterval(flushSolarDamage, NET_DAMAGE_FLUSH_MS);
  });
}

/* ---------------------------------------------------------
   GAME LOOP
--------------------------------------------------------- */
const clock = new THREE.Clock();
let lastFrameAt = 0;

function tick(now){
  // Frame limiter (Setup -> Graphics): a frame that comes too soon is
  // skipped whole (the browser's own vsync can't be turned off). 1 ms of
  // slack so a 60 cap on a 60 Hz screen doesn't drop every other frame.
  // The leftover time carries over, so the average lands on the cap even
  // when the screen's frames don't divide evenly into it.
  const cap = gfxFpsCap();
  if(cap){
    const interval = 1000 / cap, since = now - lastFrameAt;
    if(since < interval - 1){ requestAnimationFrame(tick); return; }
    lastFrameAt += interval;                            // a steady beat…
    if(now - lastFrameAt > interval) lastFrameAt = now; // …unless far behind (a stall, a hidden tab)
  }
  perfFrameStart();             // Dev Tools -> Performance stats (ui/hud/perfStats.js)
  const dt = Math.min(0.05, clock.getDelta());
  updateCamera(dt);
  // Ambient gravity (every fixed solar body pulling ships/the drone, patched-
  // conics style, none inside the station's field) mutates ship velocity/
  // position — it runs BEFORE updateShips() so this frame's pull is
  // actually integrated into movement this frame, not next.
  updateSolarGravity(dt);
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
  updateTrajectories(dt);       // trajectory lines: the object in view + everything selected
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
  updateTrails(dt);             // engine trails behind own ships and the drone
  updateAnisotropy(dt);         // new ShipKit textures get the chosen filtering
  updateStationVisuals(dt);     // stations (ShipKit's ST-04 HAVEN): ring spin, lights, dish
  updateBodyLooks(dt);          // BodyKit bodies: animated layers, spin, sun direction
  updateSkybox(dt);             // BodyKit sky: follows the camera, twinkles, bakes after a change
  manageSceneColors(ctx.scene); // new materials/lights: sRGB -> linear, once each
  manageEclipses(ctx.scene);    // new lit materials learn eclipses; planets' positions for them

  // Main view into the HUD's viewport rect, then the extra passes (ship cam,
  // unit/planet miniatures) into their own panels' rects — all on the same
  // full-window canvas (see scene/viewRect.js).
  perfRenderStart();
  updateResolution();           // manual quality, or auto: following the frame rate
  renderMainView();
  updateShipCam();
  renderShipCamPIP();
  renderUnitThumb();
  renderInfoThumb(dt);
  updateSelectionBrackets();    // body selection frames: an HTML overlay, placed after the camera moved
  perfFrameEnd();

  requestAnimationFrame(tick);
}

// Shaders: compiled up front (the part of the first frames that stalls
// the most), so the game doesn't freeze right after ENTER ORBIT.
setLoad(0.85, "shaders");
await nextPaint();
updateCamera(0);
manageSceneColors(ctx.scene);
manageEclipses(ctx.scene);
ctx.renderer.compile(ctx.scene, ctx.camera);
renderMainView();
requestAnimationFrame(tick);
loadDone();
