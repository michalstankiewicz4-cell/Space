// Sun generation parameters (see js/content.js).
export const SUN = {
  kind: "sun",
  spawnWeight: 0.05,

  radiusMin: 3.0, radiusMax: 4.3,
  tempMin: 1, tempMax: 1, // always "hot"
  healthMult: 30, valueBonus: 40, emissive: 0.95
  // its look (surface, corona) is BodyKit's SOL (js/bodykit/bodykit.js)
};
