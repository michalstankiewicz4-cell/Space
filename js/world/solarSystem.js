// The fixed solar system: the Sun and 9 orbit slots — data and orbit math
// only, no meshes. The orbits and formulas come from the user's original
// prototype, extended from its 4 example orbits to 9. Hand-picked, never
// randomized; a body's position is a closed-form function of wall-clock
// time, so every client agrees on it with nothing to sync.

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

// Slot 4 is missing on purpose: it's the station ring (STATION_RING below).
// a/e/inc/node follow the prototype's uneven, tilted spread at its own scale
// (the user asked for its real distances). `speed` (rad/s) doesn't: at this
// scale the prototype's values made bodies faster than a ship (~1-3 units/s),
// which could then never catch one. Each orbit's linear speed stays at
// 0.12-0.5 units/s — hence orbital periods of minutes to hours, on purpose.
export const SOLAR_BODIES = [
  { slot: 0, kind: "sun",       a: 0,   e: 0,    inc: 0,   node: 0,   phase: 0.0, speed: 0,        radius: 4.2, temp: 1.0 },
  { slot: 1, kind: "volcanic",  a: 90,  e: 0.04, inc: 3,   node: 15,  phase: 0.0, speed: 0.005556,  radius: 1.6, temp: 0.55 },
  { slot: 2, kind: "volcanic",  a: 150, e: 0.18, inc: -11, node: 70,  phase: 2.4, speed: 0.0028,    radius: 2.3, temp: 0.85 },
  { slot: 3, kind: "neutral",   a: 220, e: 0.07, inc: 6,   node: 140, phase: 4.1, speed: 0.001636,  radius: 1.9, temp: -0.05 },
  { slot: 5, kind: "neutral",   a: 370, e: 0.22, inc: -15, node: 260, phase: 1.0, speed: 0.000757,  radius: 2.6, temp: 0.05 },
  { slot: 6, kind: "ice",       a: 470, e: 0.10, inc: 18,  node: 305, phase: 3.3, speed: 0.000511,  radius: 1.7, temp: -0.5 },
  { slot: 7, kind: "ice",       a: 590, e: 0.30, inc: -22, node: 30,  phase: 5.5, speed: 0.000339,  radius: 2.4, temp: -0.9 },
  { slot: 8, kind: "meteoroid", a: 730, e: 0.15, inc: 12,  node: 100, phase: 0.8, speed: 0.000219,  radius: 1.1, temp: 0.1 },
  { slot: 9, kind: "blackhole", a: 890, e: 0.35, inc: -26, node: 180, phase: 2.0, speed: 0.000135,  radius: 1.5, temp: 0 }
];

// The prototype's value; tied to the distances above (gravity falls off
// with r²) — rescale one, rescale the other.
export const GM_SUN = 60000;

// Scale step 2 (v2.17.0): bodies are drawn bigger than their gameplay size.
// `size` keeps each body's original radius — what gravity (gm, SOI), its
// point value and its offline health are computed from, so the balance
// doesn't change — while `radius` (what's drawn, picked, orbited while
// eating) is size × the kind's BODY_VISUAL_SCALE. The black hole keeps its
// size: its pull and kill radius come from it.
export const BODY_VISUAL_SCALE = { sun: 3, volcanic: 2.5, neutral: 2.5, ice: 2.5, meteoroid: 1.5, blackhole: 1 };

SOLAR_BODIES.forEach(function(b){
  b.size = b.radius;
  b.radius = b.size * (BODY_VISUAL_SCALE[b.kind] || 1);
  b.b = b.a * Math.sqrt(1 - b.e * b.e);
  b.gm = Math.pow(b.size, 3) * 0.9;
  b.soiRadius = b.a > 0 ? b.a * Math.pow(b.gm / GM_SUN, 0.4) : Infinity;
});

// O(1) lookup by actual DB orbit_slot (0,1,2,3,5,6,7,8,9 — NOT contiguous
// array indices, since slot 4 is the station ring, not a body here).
export const SOLAR_BODY_BY_SLOT = {};
SOLAR_BODIES.forEach(function(b){ SOLAR_BODY_BY_SLOT[b.slot] = b; });

// The prototype's orbitPoint(): the ellipse, tilted by inc, turned by node.
export function orbitPoint(a, b, inc, node, angle, out){
  out = out || new THREE.Vector3();
  out.set(a * Math.cos(angle), 0, b * Math.sin(angle));
  out.applyAxisAngle(AXIS_X, inc * Math.PI / 180);
  out.applyAxisAngle(AXIS_Y, node * Math.PI / 180);
  return out;
}

// Where a fixed body sits right now — a pure function of wall-clock time,
// independent of any per-client state (no spawn epoch to track).
export function bodyPosAt(slot, tSeconds, out){
  const b = SOLAR_BODY_BY_SLOT[slot];
  return orbitPoint(b.a, b.b, b.inc, b.node, b.phase + b.speed * tSeconds, out);
}

export function nowSimTime(){
  return Date.now() / 1000;
}

// The player-station ring (orbit 4) — a fixed plane, not a body. Each
// player's station sits at one static point on it (see
// station/station.js#angleFromClientId) rather than continuously orbiting
// like the 9 real bodies above.
export const STATION_RING = { a: 290, e: 0, inc: 9, node: 200 };
STATION_RING.b = STATION_RING.a * Math.sqrt(1 - STATION_RING.e * STATION_RING.e);
