// Black hole generation parameters (see js/content.js).
// The game itself now uses exactly one fixed radius, world/solarSystem.js's
// SOLAR_BODY_BY_SLOT[9].radius (it's a permanent fixture on orbit 9, not
// spawned/despawned at all) — radiusMin/radiusRange aren't read by the game
// anymore; they stay as the kind's documented size range, like every other
// body type's (useful when porting bodies from the bodies.html lab).
export const BLACKHOLE = {
  kind: "blackhole",
  radiusMin: 1.1, radiusRange: 0.5
};
