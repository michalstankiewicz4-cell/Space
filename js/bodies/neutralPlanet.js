// Neutral planet generation parameters (see js/content.js).
// Its look is a BodyKit body from the body lab (js/bodykit/bodykit.js,
// e.g. TERRA-1 on orbit 3), not generated here.
export const NEUTRAL_PLANET = {
  kind: "planet",
  spawnWeight: 0.10,

  radiusMin: 0.9, radiusMax: 3.0,
  tempMin: -0.15, tempMax: 0.15,
  healthMult: 22, valueBonus: 0, emissive: 0.28
};
