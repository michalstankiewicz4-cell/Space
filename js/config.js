// Game configuration constants — data, not logic. Change here, not in code.

export const FIELD_RADIUS = 34;
export const MAX_PLANETS = 14;
export const ORBIT_RADIUS = 3.6; // fixed eating-orbit distance, independent of planet size
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

// Programmable drone (see js/drone/*.js) — a single extra ship per player,
// Colobot-style: doesn't fly on its own, only moves/attacks by running a
// script the player writes. Kept separate from the swarm's own TREE/
// upgrade stats since the drone isn't part of that economy.
export const DRONE_MAX_FUEL = 100;
export const DRONE_FUEL_PER_MOVE_UNIT = 1; // fuel spent per unit of move() distance
export const DRONE_MOVE_SPEED = 4; // units/second while a move() is in progress
export const DRONE_TURN_SPEED = 120; // degrees/second while a turn() is in progress
export const DRONE_BASE_ATTACK = 6; // bite power per attack() call
export const DRONE_BASE_DEFENSE = 1; // survival odds multiplier vs. a black hole's pull (see world/blackholes.js)
export const DRONE_DOCK_RANGE_MULT = 3.2; // x radius of the nearest body = "close enough to refuel/attack"
export const DRONE_REFUEL_RATE = 18; // fuel/second while docked at a planet/sun
export const DRONE_PRINT_MAX_LEN = 32; // print()'s in-world gas+laser message, clamped (see drone/dronePrintFx.js)
export const DRONE_PRINT_COOLDOWN_S = 1.5; // min seconds between print() calls (see drone.js#triggerPrintFx) — a while(true){print(...)} loop with no wait() would otherwise flood the broadcast channel as fast as the interpreter's step limit allows

// Player space station (see js/station/*.js) — one static landmark per
// player, procedurally built (js/station/stationModel.js, shared by the
// local station and every remote player's ghost station so they can
// never visually drift apart). Purely a docking-panel overview for now
// (fleet count, points, upgrade levels) — no new resource economy, just a
// window onto the existing one.
export const STATION_SPAWN_RADIUS = 16; // world units from origin (random angle) — outside both the ships' +-2 spawn cube and the drone's own radius-6 spawn circle
export const STATION_MODEL_SCALE = 0.16; // shrinks stationModel.js's native proportions (ring radius 23) down to roughly sun-sized in actual gameplay

// Planet selection (see world/bodies.js#setPlanetSelected, ui/planetPanel.js)
export const PLANET_BRACKET_SCALE = 2.6; // corner-bracket sprite size, x radius

// Multiplayer: intervals and time limits
export const NET_SHIP_BROADCAST_MS = 120;
export const NET_DAMAGE_FLUSH_MS = 150;
export const NET_PLANET_TOPUP_S = 1.0;
export const NET_REMOTE_PLAYER_TIMEOUT_MS = 6000;
export const NET_GHOST_LERP_SPEED = 6;

// Hard limits on data coming from other clients via broadcast — broadcast
// has no server-side validation at all, so the sender can send anything.
// These limits don't constrain fair play (nobody has more than a few dozen
// ships), but they stop one malicious message from freezing every other
// player's browser.
export const NET_MAX_REMOTE_SHIPS = 40;
export const NET_MAX_REMOTE_PLAYERS = 60;
// Also the actual max length enforced on a player's own nick (see
// net/identity.js#confirmNick) — one shared limit, not two.
export const NET_MAX_NICK_LENGTH = 20;

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
