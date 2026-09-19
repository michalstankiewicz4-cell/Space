// Black hole generation parameters (see js/content.js and editor.html).
// Not part of the weighted random spawn pool (world/bodies.js#pickBodyType) —
// spawns on its own timer, see world/blackholes.js.
export const BLACKHOLE = {
  kind: "blackhole",

  radiusMin: 1.1, radiusRange: 0.5,
  lifeMin: 26, lifeRange: 14,
  firstSpawnMinS: 18, firstSpawnRangeS: 12,
  respawnMinS: 34, respawnRangeS: 24,
  fadeOutS: 1.6
};
