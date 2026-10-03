import { ctx } from "../core/context.js";
import { t, onLangChange } from "../i18n.js";
import { showToast } from "../ui/hud/eventLog.js";
import { keysAllowed } from "../ui/hud/uiMode.js";
import { unitInView, focusCameraOn } from "../scene/camera.js";
import { getViewRect, isInViewRect, renderSceneInView } from "../scene/viewRect.js";
import { bodyLookRef } from "../world/bodyVisual.js";
import { refreshBaseMarkers } from "../world/baseMarkers.js";
import { resetOrder } from "../ships/orders.js";
import { gfxDetail, gfxParticles, gfxQuality, onGraphicsChange } from "../scene/graphics.js";
import { postActive, renderPostScene } from "../scene/post.js";

// On the ground: when the camera follows one of your ships (VIEW — not the
// cockpit cam) and that ship lands (the LAND order, ships/orders.js), the
// main view goes down to the surface with it. The ground is SurfaceKit's
// (js/surfacekit/ground.js, the same the surface lab runs): the descent,
// the craft you drive (W/S/A/D, Shift), the hop to your base, building it.
// The rest of the game goes on above; only the main view and this panel
// change. The sky comes from the game's own solar system as it stands, the
// time of day from where the Sun really is over the landing spot.
//
// Back up: TAKE OFF (the ship climbs back into orbit), or VIEW FROM SPACE
// (the ship stays down; VIEW on it again brings you back to the surface).
// Driving moves the landed ship too: its spot follows the craft.
const MIN_DAY_S = 600;
let G = null;               // SurfaceKit.createGround, made on the first landing
let active = false, ship = null, body = null, fading = false;
const keys = {};
let pointer = null, drag = null, downAt = null, clock = 0;
const $ = function(id){ return document.getElementById(id); };

export function isOnGround(){ return active; }
export function isBuildingOnGround(){ return active && !!G && !!G.building; }
export function cancelGroundBuild(){ if(G) G.cancelBuild(); markBuild(); }

// The game's solar system as a SurfaceKit sky: the Sun, and every other
// fixed body where it is now. Distances are scaled so the Sun looks from
// here as the lab's Sun does from the Earth (a size of 4 at 23).
function refOf(p){ const r = bodyLookRef(p.orbitSlot, p.kind); return r.groupId + "/" + r.bodyId; }
function skyFromGame(world){
  const k = 23 / Math.max(1, world.mesh.position.length());
  const sun = ctx.planets.find(function(p){ return p.kind === "sun"; });
  const sys = { centers: [{ ref: sun ? refOf(sun) : "suns/sol", size: 4 }], orbits: [] };
  let at = 0;
  ctx.planets.forEach(function(p){
    if(p.orbitSlot == null || p.kind === "sun") return;
    if(p === world) at = sys.orbits.length;
    const pos = p.mesh.position;
    sys.orbits.push({ ref: refOf(p), distance: pos.length() * k, size: p.size / world.size, phase: Math.atan2(pos.z, pos.x), moons: [] });
  });
  return SurfaceKit.skyOf(sys, { orbit: at, moon: null });
}

// the local solar hour at `spot` (the body's own frame) right now in the game
function hourNow(world, spot){
  const sr = world.look.body.surfaceRoot;
  sr.updateWorldMatrix(true, false);
  const sunLocal = sr.worldToLocal(new THREE.Vector3(0, 0, 0)).normalize();   // the Sun sits at the origin
  return SurfaceKit.hourAt({ suns: [{ dir: sunLocal }] }, { tilt: 0 }, spot, 0);
}

function fade(on, then){
  const el = $("groundFade");
  el.style.background = on && G && G.light.day > 0.5 && G.sky.air > 0.2 ? "#e9eefa" : "#000";
  el.style.opacity = on ? 1 : 0;
  if(then) setTimeout(then, 450);
}

function ensureGround(){
  if(G) return;
  ctx.renderer.localClippingEnabled = true;           // BaseKit's construction cut
  G = SurfaceKit.createGround(ctx.renderer, { env: ctx.scene.environment, onEvent: onGroundEvent });
  applyGraphics();
}
// Setup -> Graphics, as everywhere else in the game
function applyGraphics(){
  if(G) G.setGraphics({ detail: gfxDetail(), particles: gfxParticles(), octaves: BodyKit.QUALITY_OCTAVES[gfxQuality()] });
}

function onGroundEvent(name, data){
  if(name === "landed") showToast(t("ground.landed"));
  else if(name === "founded") showToast(t("ground.founded"));
  else if(name === "placed") showToast(t("ground.placed")(t("ground.mod." + data.type)));
  else if(name === "removed") showToast(t("ground.removed")(t("ground.mod." + data.type)));
  if(name !== "landed") refreshBaseMarkers();
}

// Down to the surface with `sh` (landing on `world`): `from` "air" plays the
// descent, "ground" puts you straight down where it stands.
function enter(sh, world, from){
  ensureGround();
  fading = true;
  fade(true, function(){
    const ref = refOf(world);
    G.setWorld({ ref: ref, values: {}, skyData: skyFromGame(world), key: "game:" + ref });
    const spot = sh.land.spot.clone();
    G.setHour(hourNow(world, spot), spot);
    // the day: the planet's own turn, but never shorter than MIN_DAY_S (the
    // game's planets spin in about a minute — down there that's a strobe)
    const spin = world.look.spinRate();
    G.daySecs = spin > 1e-5 ? Math.max(MIN_DAY_S, Math.PI * 2 / spin) : 0;
    // the weather: what this world can have, clear more often than not
    const list = G.weatherList();
    G.setWeather(Math.random() < 0.55 ? "clear" : list[Math.floor(Math.random() * list.length)].id, 0.6);
    G.enter(spot, from);
    active = true; ship = sh; body = world; fading = false;
    document.body.classList.add("onGround");
    $("groundPanel").classList.remove("hidden");
    $("gReadout").classList.remove("hidden");
    $("gHopBtn").disabled = false;
    markBuild();
    setTimeout(function(){ fade(false); }, 120);
  });
}

// Back to space; `takeOff`: the ship climbs into orbit (else it stays down).
function leave(opts){
  const done = function(){
    active = false; fading = false;
    if(G) G.leave();
    document.body.classList.remove("onGround");
    $("groundPanel").classList.add("hidden");
    $("gReadout").classList.add("hidden");
    $("gCompass").classList.add("hidden");
    if(opts && opts.takeOff && ship && body && ctx.ships.indexOf(ship) >= 0){
      resetOrder(ship, "orbit", 0);
      ship.commandedTarget = body; ship.target = body;
    }
    if(opts && opts.space && body) focusCameraOn(body);
    ship = null; body = null;
    setTimeout(function(){ fade(false); }, 80);
  };
  if(opts && opts.now){ done(); return; }
  fading = true;
  fade(true, done);
}

function markBuild(){
  const b = G && G.building;
  $("gModBtns").querySelectorAll("button").forEach(function(btn){ btn.classList.toggle("on", !!b && btn.dataset.mod === b.id); });
}
function startBuild(id){ if(!G) return; if(G.building && G.building.id === id) G.cancelBuild(); else G.startBuild(id); markBuild(); }
function place(){
  const r = G.place();
  if(r && !r.ok){
    const why = r.why === "close" ? t("ground.why.close")(t("ground.mod." + idOfName(r.name))) : t("ground.why." + r.why);
    showToast(why);
  }
  markBuild();
}
function idOfName(name){ const m = BaseKit.MODULES.find(function(d){ return d.name === name; }); return m ? m.id : ""; }

// Every frame (main.js): start when a watched ship lands, else run the ground.
export function updateGroundView(dt){
  if(fading) return;
  if(!active){
    const sh = unitInView();
    if(!sh || sh === ctx.drone || sh.running || sh.order !== "land" || !sh.land || !sh.commandedTarget) return;
    if(sh.land.t < 0.2) return;                                    // a moment of the descent from space first
    enter(sh, sh.commandedTarget, sh.land.t < 1 ? "air" : "ground");
    return;
  }
  // the ship was sent elsewhere, taken by a program, or lost, or the camera
  // went to something else (the minimap, another unit's VIEW): back up
  if(ctx.ships.indexOf(ship) < 0 || ship.commandedTarget !== body || ship.order !== "land" || ship.running || !ship.land || unitInView() !== ship){ leave(); return; }
  clock += dt;
  const r = getViewRect();
  G.setAspect(r.width / Math.max(1, r.height));
  const info = G.update(dt, clock, keys, pointer);
  if(!active) return;
  // the landed ship stands where the craft is (it turns with the planet in space)
  ship.land.spot.copy(G.P.dir);
  ship.land.t = Math.max(ship.land.t, info.phase === "driving" ? 1 : ship.land.t);
  $("gCompass").classList.toggle("hidden", !info.base);
  if(info.base){
    $("gArrow").setAttribute("transform", "rotate(" + (info.base.ang * 180 / Math.PI).toFixed(1) + " 15 15)");
    $("gDist").textContent = info.base.dist < 1000 ? Math.round(info.base.dist) + " m" : (info.base.dist / 1000).toFixed(1) + " km";
  }
  $("gSpeed").textContent = Math.round(info.speed);
  $("gAlt").textContent = Math.round(info.alt);
  $("gWhere").textContent = info.lat.toFixed(2) + "°, " + info.lon.toFixed(2) + "°";
  const driving = info.phase === "driving";
  $("gTakeOffBtn").disabled = !driving; $("gHopBtn").disabled = !driving;
}

// The same post-processing as the space view (Setup's bloom, edge smoothing,
// sharpening, filter), without what belongs to space (lensing, the Sun's
// flare, depth of field).
export function renderGroundView(){
  if(postActive()) renderPostScene(getViewRect(), G.scene, G.camera);
  else renderSceneInView(G.scene, G.camera);
}

// The ground itself, for scripts and tests (null before the first landing).
export function groundKit(){ return G; }

function toPointer(e){
  const r = getViewRect();
  if(!pointer) pointer = new THREE.Vector2();
  pointer.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

export function initGroundView(){
  onGraphicsChange(applyGraphics);
  // the module buttons: BaseKit's modules
  BaseKit.MODULES.forEach(function(d){
    const b = document.createElement("button");
    b.type = "button"; b.className = "mat blueT gMod"; b.dataset.mod = d.id;
    b.addEventListener("click", function(){ startBuild(d.id); });
    $("gModBtns").appendChild(b);
  });
  const labelMods = function(){ $("gModBtns").querySelectorAll("button").forEach(function(b){ b.textContent = t("ground.mod." + b.dataset.mod); }); };
  labelMods();
  onLangChange(labelMods);
  $("gTakeOffBtn").addEventListener("click", function(){
    if(!active) return;
    G.takeOff(function(){ leave({ takeOff: true }); });
  });
  $("gSpaceBtn").addEventListener("click", function(){ if(active) leave({ space: true }); });
  $("gHopBtn").addEventListener("click", function(){
    if(!active) return;
    const km = G.hop();
    showToast(km == null ? t("ground.noBase") : t("ground.hopping")(km.toFixed(1)));
  });
  // the pointer on the canvas, only inside the view (scene/controls.js stands aside meanwhile)
  const dom = ctx.renderer.domElement;
  dom.addEventListener("pointermove", function(e){
    if(!active) return;
    toPointer(e);
    if(drag){ G.drag(e.clientX - drag[0], e.clientY - drag[1]); drag = [e.clientX, e.clientY]; }
  });
  dom.addEventListener("pointerdown", function(e){
    if(!active || !isInViewRect(e.clientX, e.clientY)) return;
    toPointer(e);
    if(e.button === 2) drag = [e.clientX, e.clientY];
    else if(e.button === 0) downAt = [e.clientX, e.clientY];
  });
  window.addEventListener("pointerup", function(e){
    if(active && downAt && e.button === 0 && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && G.building) place();
    drag = null; downAt = null;
  });
  dom.addEventListener("wheel", function(e){ if(active){ e.preventDefault(); G.zoom(e.deltaY); } }, { passive: false });
  window.addEventListener("keydown", function(e){
    if(!active || !keysAllowed(e)) return;
    keys[e.code] = true;
    if(e.code === "KeyR" && G.building) G.rotateBuild();
    else if(e.code === "KeyB"){ if(G.building) G.cancelBuild(); else G.startBuild(BaseKit.MODULES[0].id); markBuild(); }
    else if(e.code === "Delete"){ const name = G.removeUnderPointer(); if(name) markBuild(); }
  });
  window.addEventListener("keyup", function(e){ keys[e.code] = false; });
  window.addEventListener("blur", function(){ Object.keys(keys).forEach(function(k){ keys[k] = false; }); });
}
