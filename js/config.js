// Stałe konfiguracyjne gry — dane, nie logika. Zmieniaj tu, nie w kodzie.

export const FIELD_RADIUS = 34;
export const MAX_PLANETS = 14;
export const ORBIT_RADIUS = 3.6; // stała odległość orbity zjadania, niezależna od rozmiaru planety
export const MAX_PARTICLES = 420;

// Drzewko rozwoju roju
export const TREE = {
  speed: {
    icon: "⚡", name: "Prędkość", key: "speed",
    base: 40, growth: 1.55, maxLvl: 12,
    effect: function(lvl){ return 1 + lvl * 0.16; } // multiplier
  },
  power: {
    icon: "💥", name: "Siła żucia", key: "power",
    base: 55, growth: 1.55, maxLvl: 12,
    effect: function(lvl){ return 1 + lvl * 0.22; }
  },
  heat: {
    icon: "🔥", name: "Odporność+ (gorąco)", key: "heat",
    base: 50, growth: 1.5, maxLvl: 10,
    effect: function(lvl){ return lvl * 0.11; } // 0..1.1 threshold
  },
  cold: {
    icon: "❄️", name: "Odporność- (zimno)", key: "cold",
    base: 50, growth: 1.5, maxLvl: 10,
    effect: function(lvl){ return lvl * 0.11; }
  },
  fleet: {
    icon: "🚀", name: "Wielkość roju", key: "fleet",
    base: 90, growth: 1.7, maxLvl: 20,
    effect: function(lvl){ return 3 + lvl; } // ship count
  }
};

// Multiplayer: interwały i limity czasowe
export const NET_SHIP_BROADCAST_MS = 120;
export const NET_DAMAGE_FLUSH_MS = 150;
export const NET_PLANET_TOPUP_S = 1.0;
export const NET_REMOTE_PLAYER_TIMEOUT_MS = 6000;
export const NET_GHOST_LERP_SPEED = 6;

// Czarne dziury: pierwszy spawn i odstęp między kolejnymi
export const BLACKHOLE_FIRST_SPAWN_MIN_S = 18;
export const BLACKHOLE_FIRST_SPAWN_RANGE_S = 12;
export const BLACKHOLE_RESPAWN_MIN_S = 34;
export const BLACKHOLE_RESPAWN_RANGE_S = 24;
export const BLACKHOLE_FADE_OUT_S = 1.6;

// Generator losowej tożsamości gracza (bez logowania)
export const IDENTITY_ADJECTIVES = ["Cichy","Zwinny","Dziki","Mroczny","Lodowy","Płomienny","Zjadliwy","Szybki","Głodny","Czujny"];
export const IDENTITY_NOUNS = ["Rój","Kondor","Meteor","Kraken","Komar","Szerszeń","Wilk","Sokół","Wir","Pył"];
