// Współdzielony, zmienny stan gry (scena Three.js + kolekcje bytów).
// Zamiast eksportować osobne zmienne (które trzeba by re-eksportować przy
// każdej reasygnacji), moduły mutują pola/tablice tego obiektu w miejscu
// (push/splice), nigdy go nie podmieniają — dzięki temu każdy moduł, który
// go zaimportuje, zawsze widzi aktualny stan.
export const ctx = {
  scene: null,
  camera: null,
  renderer: null,

  ships: [],
  planets: [],       // planety, słońca, komety, meteoryty — wszystko "jadalne"
  blackholes: [],
  fragments: [],
  shockwaves: [],
  dustParticles: [],

  // Multiplayer: dbId -> lokalny obiekt (ciało lub czarna dziura) i
  // client_id -> stan zdalnego gracza. Współdzielone między world/* i net/*.
  netBodies: {},
  remotePlayers: {}
};
