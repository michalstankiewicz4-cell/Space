// Black hole generation parameters (see js/content.js and planetEditor.html).
// The game itself now uses exactly one fixed radius, world/solarSystem.js's
// SOLAR_BODY_BY_SLOT[9].radius (it's a permanent fixture on orbit 9, not
// spawned/despawned at all) — radiusMin/radiusRange stay here purely so
// planetEditor.html can still preview the kind's whole range, same as every
// other body type there (see world/blackholes.js#randomBlackHoleRadius).
export const BLACKHOLE = {
  kind: "blackhole",
  radiusMin: 1.1, radiusRange: 0.5
};
