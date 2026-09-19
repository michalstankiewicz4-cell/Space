// Stałe konfiguracyjne gry — dane, nie logika. Zmieniaj tu, nie w kodzie.

export const FIELD_RADIUS = 34;
export const MAX_PLANETS = 14;
export const ORBIT_RADIUS = 3.6; // stała odległość orbity zjadania, niezależna od rozmiaru planety
export const MAX_PARTICLES = 420;

// Swarm upgrade tree. Display names come from i18n (t("upgrades."+key)),
// not from here, so the tree works in any language.
export const TREE = {
  speed: {
    icon: "⚡", key: "speed",
    base: 40, growth: 1.55, maxLvl: 12,
    effect: function(lvl){ return 1 + lvl * 0.16; } // multiplier
  },
  power: {
    icon: "💥", key: "power",
    base: 55, growth: 1.55, maxLvl: 12,
    effect: function(lvl){ return 1 + lvl * 0.22; }
  },
  heat: {
    icon: "🔥", key: "heat",
    base: 50, growth: 1.5, maxLvl: 10,
    effect: function(lvl){ return lvl * 0.11; } // 0..1.1 threshold
  },
  cold: {
    icon: "❄️", key: "cold",
    base: 50, growth: 1.5, maxLvl: 10,
    effect: function(lvl){ return lvl * 0.11; }
  },
  fleet: {
    icon: "🚀", key: "fleet",
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

// Twarde limity na dane przychodzące od innych klientów przez broadcast —
// broadcast nie ma żadnej walidacji po stronie serwera, więc nadawca może
// wysłać cokolwiek. Te limity nie ograniczają uczciwej gry (nikt nie ma
// więcej niż kilkadziesiąt statków), ale nie pozwalają jednej złośliwej
// wiadomości zawiesić przeglądarki wszystkich innych graczy.
export const NET_MAX_REMOTE_SHIPS = 40;
export const NET_MAX_REMOTE_PLAYERS = 60;
export const NET_MAX_NICK_LENGTH = 24;

// Random player identity generator (no login) — English, ~20 of each so
// there's plenty of variety before names repeat.
export const IDENTITY_ADJECTIVES = [
  "Silent","Swift","Wild","Dark","Icy","Blazing","Ravenous","Fast","Hungry","Watchful",
  "Crimson","Shadow","Golden","Feral","Cosmic","Rogue","Solar","Lunar","Void","Stellar"
];
export const IDENTITY_NOUNS = [
  "Swarm","Condor","Meteor","Kraken","Wasp","Hornet","Wolf","Falcon","Vortex","Dust",
  "Comet","Nebula","Reaper","Phantom","Drifter","Nomad","Raider","Specter","Titan","Orbit"
];
