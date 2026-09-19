// Parametry generowania ciał niebieskich — jedno miejsce, z którego korzysta
// zarówno gra (js/world/*), jak i edytor (editor.html). Edytuj ręcznie albo
// suwakami w edytorze -> "Pobierz content.js" -> podmień ten plik.
//
// UWAGA: to nie jest konfiguracja runtime (jak js/config.js) — to dane
// wejściowe do proceduralnego generatora (world/bodies.js, world/blackholes.js,
// world/textures.js). Zmiana wartości tutaj zmienia jak wyglądają/zachowują
// się NOWO wygenerowane ciała (już istniejące w świecie zostają bez zmian).
export const CONTENT = {
  // Prawdopodobieństwa wylosowania danego rodzaju ciała przy każdym spawnie.
  // Reszta puli (1 - suma poniższych) trafia w zwykłą "planet".
  spawnWeights: {
    sun: 0.05,
    comet: 0.10,
    meteoroid: 0.19
  },

  planet: {
    radiusMin: 0.9, radiusMax: 3.0,
    tempRange: 1,        // losowy temp w [-tempRange, tempRange]
    healthMult: 22, valueBonus: 0, emissive: 0.28
  },

  neutralPlanet: {
    // planeta "planet" z |temp| <= tempThreshold dostaje mapę powierzchni
    // (ocean/kontynenty/czapy polarne/pustynia) zamiast płaskiego koloru
    tempThreshold: 0.15,
    noiseScaleMin: 1.6, noiseScaleRange: 0.8,
    seaLevelMin: -0.05, seaLevelRange: 0.1,
    octaves: 5
  },

  sun: {
    radiusMin: 3.0, radiusMax: 4.3,
    healthMult: 30, valueBonus: 40, emissive: 0.95,
    rayCount: 12,
    rayLengthLongMin: 2.6, rayLengthLongRange: 0.9,
    rayLengthShortMin: 1.5, rayLengthShortRange: 0.7,
    rayWidthMin: 0.32, rayWidthRange: 0.16,
    haloScale: 5.0
  },

  comet: {
    radiusMin: 0.38, radiusMax: 0.6,
    healthMult: 17, valueBonus: 25, emissive: 0.4,
    speedMin: 3.2, speedRange: 1.8,
    tailLengthMin: 9, tailLengthRange: 4,
    tailWidthMin: 1.43, tailWidthRange: 0.39
  },

  meteoroid: {
    radiusMin: 0.32, radiusMax: 0.68,
    tempRange: 0.35,
    healthMult: 15, valueBonus: 0, emissive: 0.28
  },

  blackhole: {
    radiusMin: 1.1, radiusRange: 0.5,
    lifeMin: 26, lifeRange: 14,
    firstSpawnMinS: 18, firstSpawnRangeS: 12,
    respawnMinS: 34, respawnRangeS: 24,
    fadeOutS: 1.6
  }
};
