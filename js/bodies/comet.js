// Comet generation parameters (see js/content.js and planetEditor.html).
export const COMET = {
  kind: "comet",
  spawnWeight: 0.10,

  radiusMin: 0.38, radiusMax: 0.6,
  tempMin: -1, tempMax: -1, // always "cold" (icy)
  healthMult: 17, valueBonus: 25, emissive: 0.4,

  speedMin: 3.2, speedRange: 1.8,
  tailLengthMin: 9, tailLengthRange: 4,
  tailWidthMin: 1.43, tailWidthRange: 0.39
};
