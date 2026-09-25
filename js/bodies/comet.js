// Comet generation parameters (see js/content.js).
export const COMET = {
  kind: "comet",
  spawnWeight: 0.10,

  radiusMin: 0.38, radiusMax: 0.6,
  tempMin: -1, tempMax: -1, // always "cold" (icy)
  healthMult: 17, valueBonus: 25, emissive: 0.4,

  // Entry speed at the edge of the system (world/cometPhysics.js) - real
  // gravity then speeds it up further during its close sun pass (vis-viva:
  // faster near perihelion, slower once receding), same as any real
  // hyperbolic flyby. Rescaled for the fixed 9-orbit solar system's actual
  // size (world/solarSystem.js) - the old 3.2-5.0 was tuned for the
  // previous, much smaller world and would take a comet a very long time
  // to cross this one.
  speedMin: 8, speedRange: 4,
  tailLengthMin: 9, tailLengthRange: 4,
  tailWidthMin: 1.43, tailWidthRange: 0.39
};
