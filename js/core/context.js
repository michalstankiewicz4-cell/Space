// Shared, mutable game state (Three.js scene + entity collections). Instead
// of exporting separate variables (which would need to be re-exported on
// every reassignment), modules mutate this object's fields/arrays in place
// (push/splice), never replace it — so every module that imports it always
// sees the current state.
export const ctx = {
  scene: null,
  camera: null,
  renderer: null,

  ships: [],
  planets: [],       // planets, suns, comets, meteoroids — everything "edible"
  blackholes: [],
  drone: null,       // the player's single programmable ship — see js/drone/*.js
  fragments: [],
  shockwaves: [],
  dustParticles: [],

  // Multiplayer: dbId -> local object (body or black hole), and
  // client_id -> remote player state. Shared between world/* and net/*.
  netBodies: {},
  remotePlayers: {}
};
