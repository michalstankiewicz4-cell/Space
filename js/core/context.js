// Shared, mutable game state (Three.js scene + entity collections). Instead
// of exporting separate variables (which would need to be re-exported on
// every reassignment), modules mutate this object's fields/arrays in place
// (push/splice), never replace it — so every module that imports it always
// sees the current state.
export const ctx = {
  scene: null,
  camera: null,
  renderer: null,
  sceneLights: null, // {sun, rim} — set by scene/setup.js, read by scene/lightMarkers.js

  ships: [],
  planets: [],       // planets, suns, comets, meteoroids — everything "edible"
  blackholes: [],
  drone: null,       // the player's single programmable ship — see js/drone/*.js
  station: null,     // the player's single space station — see js/station/*.js
  fragments: [],
  shockwaves: [],
  dustParticles: [],

  // Multiplayer: dbId -> local object, client_id -> remote player state.
  // As of the fixed 9-orbit solar system, netBodies is comet-only (fixed
  // solar bodies use netSolarBodies below, keyed by orbit_slot — an int
  // 0-9, a different identity scheme than comets' uuid ids, so a single
  // shared dict would mix two unrelated key types). Shared between world/*
  // and net/*.
  netBodies: {},
  netSolarBodies: {}, // orbit_slot (int) -> local object — see net/solarBodiesSync.js
  remotePlayers: {}
};
