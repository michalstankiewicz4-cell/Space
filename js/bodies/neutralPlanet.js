// Neutral planet generation parameters (see js/content.js and editor.html).
// Gets a real surface map (ocean/continents/ice caps/desert) instead of a
// flat color — see world/textures.js#makePlanetSurfaceTexture.
export const NEUTRAL_PLANET = {
  kind: "planet",
  spawnWeight: 0.10,

  radiusMin: 0.9, radiusMax: 3.0,
  tempMin: -0.15, tempMax: 0.15,
  healthMult: 22, valueBonus: 0, emissive: 0.28,

  noiseScaleMin: 1.6, noiseScaleRange: 0.8,
  seaLevelMin: -0.05, seaLevelRange: 0.1,
  octaves: 5
};
