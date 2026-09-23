// The fixed 9-orbit solar system (plus the sun at the center) — pure data
// + orbit math, no THREE.Scene/mesh code, same spirit as world/bodyParams.js.
// Every number here (a/e/inc/node/phase/speed, the orbitPoint()/soiRadius
// formulas) is a direct port of the user's own test.html prototype, just
// extended from its 4 example orbits out to this game's fixed 9 + sun.
//
// Deliberately NOT randomized at runtime (unlike the old scattered-pool
// model) — each slot is one specific, hand-picked body, the same way
// test.html's own `bodies` array hardcodes each planet's exact params.
// Orbital position is a closed-form function of wall-clock time (no spawn
// epoch to store/sync at all, since these bodies always exist) — the same
// "kinematic, nothing new to sync" property comets already use for their
// straight-line drift, just a different formula (see world/bodies.js).

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

// Slot 4 is deliberately absent here — it's the player-station ring, not a
// body (see STATION_RING below and station/station.js). a/e/inc/node/phase/
// speed follow test.html's own uneven, non-coplanar spread (its 4 example
// orbits: a=220/340/480/660, e=0.05/0.28/0.12/0.34, inc=4/14/-9/21,
// node=20/95/200/150) rescaled down to this game's much smaller existing
// world scale (compare FIELD_RADIUS=34, config.js).
export const SOLAR_BODIES = [
  { slot: 0, kind: "sun",       a: 0,    e: 0,    inc: 0,   node: 0,   phase: 0.0, speed: 0,     radius: 4.2, temp: 1.0 },
  { slot: 1, kind: "volcanic",  a: 7.5,  e: 0.04, inc: 3,   node: 15,  phase: 0.0, speed: 0.140, radius: 1.6, temp: 0.55 },
  { slot: 2, kind: "volcanic",  a: 11.5, e: 0.18, inc: -11, node: 70,  phase: 2.4, speed: 0.097, radius: 2.3, temp: 0.85 },
  { slot: 3, kind: "neutral",   a: 15.5, e: 0.07, inc: 6,   node: 140, phase: 4.1, speed: 0.070, radius: 1.9, temp: -0.05 },
  { slot: 5, kind: "neutral",   a: 23.0, e: 0.22, inc: -15, node: 260, phase: 1.0, speed: 0.048, radius: 2.6, temp: 0.05 },
  { slot: 6, kind: "ice",       a: 27.5, e: 0.10, inc: 18,  node: 305, phase: 3.3, speed: 0.037, radius: 1.7, temp: -0.5 },
  { slot: 7, kind: "ice",       a: 32.5, e: 0.30, inc: -22, node: 30,  phase: 5.5, speed: 0.030, radius: 2.4, temp: -0.9 },
  { slot: 8, kind: "meteoroid", a: 37.5, e: 0.15, inc: 12,  node: 100, phase: 0.8, speed: 0.025, radius: 1.1, temp: 0.1 },
  { slot: 9, kind: "blackhole", a: 44.0, e: 0.35, inc: -26, node: 180, phase: 2.0, speed: 0.019, radius: 1.5, temp: 0 }
];

// Starting point for visual tuning, not a final answer (see the plan's own
// "low-risk open questions" note) — chosen so a generic body's soiRadius
// lands comfortably under half the gap to its neighbor.
export const GM_SUN = 1200;

SOLAR_BODIES.forEach(function(b){
  b.b = b.a * Math.sqrt(1 - b.e * b.e);
  b.gm = Math.pow(b.radius, 3) * 0.9;
  b.soiRadius = b.a > 0 ? b.a * Math.pow(b.gm / GM_SUN, 0.4) : Infinity;
});

// O(1) lookup by actual DB orbit_slot (0,1,2,3,5,6,7,8,9 — NOT contiguous
// array indices, since slot 4 is the station ring, not a body here).
export const SOLAR_BODY_BY_SLOT = {};
SOLAR_BODIES.forEach(function(b){ SOLAR_BODY_BY_SLOT[b.slot] = b; });

// Verbatim port of test.html's orbitPoint() (lines 266-272 there).
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
export const STATION_RING = { a: 19.0, e: 0, inc: 9, node: 200 };
STATION_RING.b = STATION_RING.a * Math.sqrt(1 - STATION_RING.e * STATION_RING.e);
