import { readStorage, sRGBTexture } from "../core/utils.js";

// Your bases on the game's planets: founded in the surface lab (surface.html,
// SurfaceKit — docs/surface.md), kept in this browser under "roj-bases" as
// { "<group>/<body>": { name, lat, lon, created, modules: [...] } }, keyed by
// the BodyKit body. A planet whose look is that body gets a gold diamond at
// the base's latitude / longitude, on its surface (BodyKit's surfaceRoot:
// +Y the north pole, unit radius), so it turns with the planet. Only you see
// your base (nothing goes to the server); another tab changing the bases
// moves the markers here too (the "storage" event).

const KEY = "roj-bases";
const placed = new Map();             // "group/body" → the marker sprite

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

let texture = null;
function markerTexture(){
  if(texture) return texture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const glow = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  glow.addColorStop(0, "rgba(248,187,86,0.55)"); glow.addColorStop(1, "rgba(248,187,86,0)");
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  g.beginPath(); g.moveTo(32, 12); g.lineTo(48, 32); g.lineTo(32, 52); g.lineTo(16, 32); g.closePath();
  g.fillStyle = "#f8bb56"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "#3a2405"; g.stroke();
  texture = sRGBTexture(new THREE.CanvasTexture(c));
  return texture;
}

function place(key){
  const sprite = placed.get(key);
  const b = readBases()[key];
  if(!valid(b)){ sprite.visible = false; return; }
  const lat = b.lat * Math.PI / 180, lon = b.lon * Math.PI / 180;
  // the same frame as SurfaceKit.latLonToDir, just off the surface
  sprite.position.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).multiplyScalar(1.03);
  sprite.visible = true;
}

// Called when a planet's look is made (world/bodies.js): the marker rides its
// surface from then on, hidden while the planet has no base of yours.
export function attachBaseMarker(look, ref){
  const key = keyOf(ref);
  if(placed.has(key)) return;         // one per body (the game shows each body once)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthWrite: false }));
  sprite.scale.setScalar(0.22);       // in planet radii: a clear dot, not a flag
  sprite.renderOrder = 2;             // over the clouds and the scorch marks
  sprite.userData.baseMarker = true;
  placed.set(key, sprite);
  look.attach(sprite);
  place(key);
}

window.addEventListener("storage", function(e){
  if(e.key === KEY || e.key === null) placed.forEach(function(_, key){ place(key); });
});
