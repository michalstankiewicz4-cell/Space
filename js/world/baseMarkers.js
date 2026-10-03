import { readStorage, sRGBTexture } from "../core/utils.js";

// Your bases on the game's planets: founded in the surface lab (surface.html,
// SurfaceKit — docs/surface.md), kept in this browser under "roj-bases" as
// { "<group>/<body>": { name, lat, lon, created, modules: [...] } }, keyed by
// the BodyKit body. A planet whose look is that body gets a pulsing gold dot at
// the base's latitude / longitude, on its surface (BodyKit's surfaceRoot:
// +Y the north pole, unit radius), so it turns with the planet. Only you see
// your base (nothing goes to the server); another tab changing the bases
// moves the markers here too (the "storage" event), and so does building on
// the ground in the game (refreshBaseMarkers).

const KEY = "roj-bases";
const MARKER_SCREEN = 0.018;          // the dot's size, a fraction of the view's height
const placed = new Map();             // "group/body" → the marker (a group of sprites)

function readBases(){
  try{
    const all = JSON.parse(readStorage(KEY) || "{}");
    return all && typeof all === "object" ? all : {};
  }catch(e){ return {}; }             // a corrupt entry: no bases
}
const valid = (b) => b && isFinite(b.lat) && isFinite(b.lon) && Array.isArray(b.modules);
const keyOf = (ref) => ref.groupId + "/" + ref.bodyId;

// the planet's base, or null: { name, lat, lon, modules, built }
export function baseOn(ref){
  const b = readBases()[keyOf(ref)];
  if(!valid(b)) return null;
  const now = Date.now();
  const built = b.modules.filter(function(m){ return now - (m.start || 0) >= (m.dur || 0); }).length;
  return { name: String(b.name || "BASE"), lat: b.lat, lon: b.lon, modules: b.modules.length, built: built };
}

// The marker: a small gold dot with two rings spreading out of it and
// fading, a pulse every PULSE_S seconds (the user's call: discreet, not a
// big diamond). Each part is a sprite of a constant size on screen.
const PULSE_S = 2.4;
const textures = {};
function canvasTexture(key, draw){
  if(textures[key]) return textures[key];
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  draw(c.getContext("2d"));
  return (textures[key] = sRGBTexture(new THREE.CanvasTexture(c)));
}
const dotTexture = function(){ return canvasTexture("dot", function(g){
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,226,168,1)"); glow.addColorStop(0.28, "rgba(248,187,86,0.95)");
  glow.addColorStop(0.42, "rgba(248,187,86,0.25)"); glow.addColorStop(1, "rgba(248,187,86,0)");
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
}); };
const ringTexture = function(){ return canvasTexture("ring", function(g){
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2);
  g.lineWidth = 4.5; g.strokeStyle = "rgba(248,187,86,1)"; g.stroke();
}); };

function makeMarker(radius){
  const group = new THREE.Group();
  const sprite = function(map, opacity){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: map, transparent: true, depthWrite: false, sizeAttenuation: false, opacity: opacity }));
    s.renderOrder = 2;                // over the clouds and the scorch marks
    group.add(s);
    return s;
  };
  // sizes are fractions of the view's height; the surface the marker rides
  // is scaled by the planet's radius, and that scale would carry over too
  const unit = 1 / radius;
  const dot = sprite(dotTexture(), 1);
  dot.scale.setScalar(MARKER_SCREEN * unit);
  const rings = [sprite(ringTexture(), 0), sprite(ringTexture(), 0)];
  // the pulse, from the clock, just before the dot is drawn
  dot.onBeforeRender = function(){
    const t = performance.now() / 1000 / PULSE_S;
    rings.forEach(function(r, i){
      const k = (t + i * 0.5) % 1;
      r.scale.setScalar(MARKER_SCREEN * unit * (0.6 + k * 2.4));
      r.material.opacity = 0.95 * (1 - k) * (1 - k);
    });
  };
  group.userData.baseMarker = true;
  return group;
}

function place(key){
  const marker = placed.get(key);
  const b = readBases()[key];
  if(!valid(b)){ marker.visible = false; return; }
  const lat = b.lat * Math.PI / 180, lon = b.lon * Math.PI / 180;
  // the same frame as SurfaceKit.latLonToDir, just off the surface
  marker.position.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(1.03);
  marker.visible = true;
}

// Called when a planet's look is made (world/bodies.js): the marker rides its
// surface from then on, hidden while the planet has no base of yours.
export function attachBaseMarker(look, ref){
  const key = keyOf(ref);
  if(placed.has(key)) return;         // one per body (the game shows each body once)
  const marker = makeMarker(look.radius);
  placed.set(key, marker);
  look.attach(marker);
  place(key);
}

// After a base changed in this tab (building on the ground, surface/groundView.js).
export function refreshBaseMarkers(){ placed.forEach(function(_, key){ place(key); }); }

window.addEventListener("storage", function(e){
  if(e.key === KEY || e.key === null) refreshBaseMarkers();
});
