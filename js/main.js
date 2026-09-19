import { ctx } from "./core/context.js";
import { load } from "./core/gameState.js";
import { NET_ENABLED } from "./env.js";
import { NET_DAMAGE_FLUSH_MS } from "./config.js";
import { VERSION } from "./version.js";

import { initScene } from "./scene/setup.js";
import { initControls, updateCamera } from "./scene/controls.js";
import { initParticles, updateParticles } from "./fx/particles.js";
import { updateFragments, updateShockwaves, updateDust } from "./fx/breakup.js";
import { seedLocalWorld, updateBodies } from "./world/bodies.js";
import { updateBlackHoles } from "./world/blackholes.js";
import { spawnInitialFleet, updateShips, reconcileFleetSize } from "./ships/swarm.js";
import { refreshDock } from "./ui/dock.js";
import { updateTelemetry } from "./ui/hud.js";
import { initBanner } from "./ui/banner.js";
import { initPanels } from "./ui/panels.js";
import { initFleet } from "./ui/fleet.js";
import { initShipCam, updateShipCam, renderShipCamPIP } from "./scene/shipcam.js";
import { renderPlayersList } from "./ui/players.js";
import { maintainPlanetCount, flushDamage } from "./net/bodiesSync.js";
import { updateRemoteShips, maybeBroadcastShips } from "./net/shipsBroadcast.js";
import { initNet } from "./net/connect.js";
import { initVersionCheck } from "./versionCheck.js";

load();

document.getElementById("versionTag").textContent = "v" + VERSION;
document.title = document.title + " — v" + VERSION;

initScene();
initControls();
initParticles();

if(!NET_ENABLED){
  seedLocalWorld();
}

spawnInitialFleet();
refreshDock();
reconcileFleetSize();
initBanner();
initPanels();
initFleet();
initShipCam();
initVersionCheck();

if(NET_ENABLED){
  initNet();
  setInterval(flushDamage, NET_DAMAGE_FLUSH_MS);
}

/* ---------------------------------------------------------
   GAME LOOP
--------------------------------------------------------- */
const clock = new THREE.Clock();
let uiTimer = 0;

function tick(){
  const dt = Math.min(0.05, clock.getDelta());
  updateCamera(dt);
  updateShips(dt);
  updateParticles(dt);
  updateFragments(dt);
  updateShockwaves(dt);
  updateBodies(dt);
  updateBlackHoles(dt);
  updateDust(dt);
  maintainPlanetCount(dt);
  if(NET_ENABLED){
    updateRemoteShips(dt);
    maybeBroadcastShips(performance.now());
  }

  uiTimer += dt;
  if(uiTimer > 0.4){
    uiTimer = 0;
    updateTelemetry();
    renderPlayersList();
  }

  // Reset to full-canvas before the main render, in case last frame's ship
  // cam PIP pass (below) left the viewport/scissor set to its small rect.
  ctx.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  ctx.renderer.setScissorTest(false);
  ctx.renderer.render(ctx.scene, ctx.camera);

  updateShipCam();
  renderShipCamPIP();

  requestAnimationFrame(tick);
}

updateCamera(0);
ctx.renderer.render(ctx.scene, ctx.camera);
requestAnimationFrame(tick);
