// Sun generation parameters (see js/content.js and editor.html).
export const SUN = {
  kind: "sun",
  spawnWeight: 0.05,

  radiusMin: 3.0, radiusMax: 4.3,
  tempMin: 1, tempMax: 1, // always "hot"
  healthMult: 30, valueBonus: 40, emissive: 0.95,

  rayCount: 12,
  rayLengthLongMin: 2.6, rayLengthLongRange: 0.9,
  rayLengthShortMin: 1.5, rayLengthShortRange: 0.7,
  rayWidthMin: 0.32, rayWidthRange: 0.16,
  haloScale: 5.0
};
