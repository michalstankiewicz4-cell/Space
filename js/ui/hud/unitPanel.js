import { ctx } from "../../core/context.js";
import { state, swarmStats } from "../../core/gameState.js";
import { TREE } from "../../config.js";
import { setShipSelected } from "../../ships/swarm.js";
import { setDroneSelected } from "../../drone/drone.js";
import { bodyVariantKey } from "../../world/bodyParams.js";
import { t } from "../../i18n.js";
import { fillIcons, svgIcon } from "../icons.js";
import { setShipCamTarget, clearShipCamTarget, getShipCamTarget } from "../../scene/shipcam.js";

// The HUD's SELECTED UNIT panel (#unitPanel). Shows, in priority order:
// the drone (while it's selected — openDronePanel/closeDronePanel below),
// else the single selected ship, else a summary of a multi-ship
// selection, else an empty hint. Ship selection itself lives on the ships
// (sh.selected, set by scene/controls.js and the fleet list), so this
// panel just watches it: updateUnitPanel() runs every frame but only
// touches the DOM when *what* is shown changes, plus a forced stats
// refresh every ~0.4s (ui/hud/hud.js).
let droneFocused = false;
let lastKey = null;

function el(id){ return document.getElementById(id); }

function currentUnit(){
  if(droneFocused && ctx.drone) return { kind: "drone", drone: ctx.drone };
  const sel = ctx.ships.filter(function(sh){ return sh.selected; });
  if(sel.length === 1) return { kind: "ship", ship: sel[0], index: ctx.ships.indexOf(sel[0]) };
  if(sel.length > 1) return { kind: "group", ships: sel };
  return null;
}

// The drone has no panel of its own: "open" means this panel shows the
// drone, with its live Start/Stop/Script buttons (wired in
// ui/windows/droneScript.js, next to the script window). Visibility tracks
// selection, RTS-style: selecting the drone (see scene/controls.js) opens
// it, deselecting — via the close button, Escape, or selecting/clicking
// something else — closes it. The camera never reacts to any of this;
// only the ring + the panel do.
export function isDronePanelOpen(){
  return droneFocused && !!ctx.drone;
}

export function openDronePanel(){
  droneFocused = true;
  updateUnitPanel(true);
}

export function closeDronePanel(){
  if(ctx.drone) setDroneSelected(ctx.drone, false);
  droneFocused = false;
  updateUnitPanel(true);
}

// For scene/unitThumb.js: {ship} / {drone}, or null for no live miniature.
export function getUnitThumbTarget(){
  const u = currentUnit();
  if(!u) return null;
  if(u.kind === "ship") return { ship: u.ship };
  if(u.kind === "drone") return { drone: u.drone };
  return null;
}

function bodyName(b){
  return b && !b.dying ? t("body." + bodyVariantKey(b)) : "—";
}

function isFeeding(sh){
  return !!(sh.boltCore && sh.boltCore.visible);
}

function shipStatus(sh){
  if(isFeeding(sh)) return t("hud.feeding");
  return sh.commandedTarget ? t("hud.enRoute") : t("hud.idle");
}

function setBar(i, label, frac, text, matClass){
  const row = el("unitBar" + i);
  row.classList.toggle("hidden", label == null);
  if(label == null) return;
  row.querySelector("span").textContent = label;
  const fill = row.querySelector("i");
  fill.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + "%";
  fill.className = "mat " + matClass;
  row.querySelector("b").textContent = text;
}

function levelBar(i, key, label){
  const lvl = state.levels[key], max = TREE[key].maxLvl;
  setBar(i, label, lvl / max, "L" + lvl, i === 1 ? "green" : "blueBar");
}

function setStats(rows){
  for(let i = 1; i <= 4; i++){
    const r = rows[i - 1];
    el("unitStat" + i + "L").textContent = r ? r[0] : "";
    el("unitStat" + i + "V").textContent = r ? r[1] : "";
  }
}

function render(u){
  const empty = !u;
  el("unitEmpty").classList.toggle("hidden", !empty);
  el("unitBody").classList.toggle("hidden", empty);
  el("unitCloseBtn").classList.toggle("hidden", empty);
  if(empty){
    el("unitEmpty").textContent = t("hud.unitEmpty");
    return;
  }
  const isDrone = u.kind === "drone";
  el("unitBtns").classList.toggle("hidden", isDrone);
  el("droneBtns").classList.toggle("hidden", !isDrone);
  el("unitThumb").classList.toggle("hidden", u.kind === "group");
  el("unitCamBtn").classList.toggle("hidden", u.kind !== "ship");
  el("unitCamBtn").classList.toggle("active", u.kind === "ship" && getShipCamTarget() === u.ship);
  el("unitBars").classList.toggle("hidden", u.kind === "group");

  if(u.kind === "ship"){
    const sh = u.ship;
    const stats = swarmStats();
    el("unitName").textContent = t("fleet.ship")(u.index + 1);
    el("unitClass").textContent = t("hud.shipClass");
    levelBar(1, "speed", t("hud.speedLvl"));
    levelBar(2, "power", t("hud.biteLvl"));
    levelBar(3, "heat", t("hud.heatLvl"));
    setStats([
      [t("hud.status"), shipStatus(sh)],
      [t("hud.target"), bodyName(sh.commandedTarget || sh.target)],
      [t("hud.velocity"), sh.vel.length().toFixed(1)],
      [t("hud.bite"), (5.5 * stats.power).toFixed(1)]
    ]);
  } else if(u.kind === "group"){
    const ships = u.ships;
    const first = ships[0].commandedTarget;
    const same = ships.every(function(sh){ return sh.commandedTarget === first; });
    el("unitName").textContent = t("hud.group")(ships.length);
    el("unitClass").textContent = t("hud.groupClass");
    setStats([
      [t("hud.selected"), ships.length + " / " + ctx.ships.length],
      [t("hud.target"), same ? bodyName(first) : t("hud.mixed")],
      [t("hud.enRoute"), String(ships.filter(function(sh){ return sh.commandedTarget && !isFeeding(sh); }).length)],
      [t("hud.feeding"), String(ships.filter(isFeeding).length)]
    ]);
  } else {
    const d = u.drone;
    el("unitName").textContent = t("drone.title");
    el("unitClass").textContent = t("hud.droneClass");
    setBar(1, t("drone.fuel"), d.fuel / d.maxFuel, Math.round(d.fuel / d.maxFuel * 100) + "%", "blueBar");
    setBar(2, null);
    setBar(3, null);
    setStats([
      [t("drone.status"), d.error ? t("drone.error") : (d.running ? t("drone.running") : t("drone.idle"))],
      [t("drone.fuel"), Math.round(d.fuel) + " / " + d.maxFuel],
      [t("drone.attack"), String(d.attackPower)],
      [t("drone.defense"), String(d.defense)]
    ]);
  }
}

// force=true re-renders even if the same unit is still shown (stats tick,
// language change); otherwise only when the shown unit changes.
export function updateUnitPanel(force){
  const u = currentUnit();
  const key = !u ? "none" : u.kind === "ship" ? "ship" + u.index : u.kind === "group" ? "group" + u.ships.length : "drone";
  // Cheap enough per frame: keeps CAM's lit state in sync however the ship
  // cam was toggled (this button, the fleet list, the cam's own ✕, Escape).
  el("unitCamBtn").classList.toggle("active", !!u && u.kind === "ship" && getShipCamTarget() === u.ship);
  if(!force && key === lastKey) return;
  lastKey = key;
  render(u);
}

// The drone's Start/Stop/Script buttons (#droneBtns) are wired in
// ui/windows/droneScript.js, next to the script window they belong with.
export function initUnitPanel(){
  fillIcons(el("unitBtns"), { target: "url(#gGoldIcon)", formup: "url(#gBlueIcon)", shield: "#c7d0ff", scan2: "url(#gBlueIcon)" });
  fillIcons(el("droneBtns"));
  el("unitCamBtn").insertAdjacentHTML("afterbegin", svgIcon("camera"));
  // Ship cam on/off for the selected ship — also reachable by clicking the
  // ship's card in the fleet list, but that's the only other way in.
  el("unitCamBtn").addEventListener("click", function(){
    const u = currentUnit();
    if(!u || u.kind !== "ship") return;
    if(getShipCamTarget() === u.ship) clearShipCamTarget();
    else setShipCamTarget(u.ship);
    updateUnitPanel(true);
  });
  // pointerdown, not click: confirmed by direct A/B testing on the old
  // drone panel, a press on a small button released a few px outside it
  // silently never fires "click".
  el("unitCloseBtn").addEventListener("pointerdown", function(e){
    e.stopPropagation();
    if(isDronePanelOpen()) closeDronePanel();
    else ctx.ships.forEach(function(sh){ if(sh.selected) setShipSelected(sh, false); });
    updateUnitPanel(true);
  });
  updateUnitPanel(true);
}
