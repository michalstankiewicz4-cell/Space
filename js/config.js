// Game configuration constants — data, not logic. Change here, not in code.

// The area comets spawn and despawn in (the fixed orbits are well inside it).
export const FIELD_RADIUS = 34;
// Ships eat from an orbit this far above the body's surface (its drawn
// radius + this) — bodies come in very different sizes since v2.17.0.
export const EAT_ORBIT_GAP = 1.6;
export const MAX_PARTICLES = 420;

// One comet at a time: after it's eaten or has flown out, the next one
// comes this much later (net/bodiesSync.js#maintainComet).
export const COMET_RESPAWN_DELAY_MS = 60000;
// A comet's coma and tails at this distance from the Sun have activity 1
// (world/bodyVisual.js#cometActivity): 1.5 near perihelion (~60), 0.3 far out.
export const COMET_ACTIVITY_DISTANCE = 100;

// Health a fixed body grows back per second — must equal v_regen_rate in
// supabase/schema.sql#bite_solar_body (both compute the same number).
export const SOLAR_REGEN_RATE = 0.6;

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

// Unit sizes (v2.16.0: units are small next to the bodies). Everything sized
// around a unit — rings, pick spheres, labels, the ship cam, the base
// camera — follows these lengths.
export const SHIP_MODEL_LENGTH = 0.45;
export const DRONE_MODEL_LENGTH = 0.7;

// Ship glow light (Setup -> Graphics, off by default), following the engine
// power: a short, weak light on the ship's own hull and its neighbours, and
// a stronger one on the body it flies by or bites (world/bodyVisual.js ->
// BodyKit's opts.lights).
export const SHIP_LIGHT_INTENSITY = 0.8;
export const SHIP_LIGHT_RANGE = 2.2;
export const SHIP_BODY_LIGHT_INTENSITY = 1.5;
export const SHIP_BODY_LIGHT_RANGE = 7;

// The programmable drone (js/drone/): no swarm upgrades, its own stats.
export const DRONE_MAX_FUEL = 100;
export const DRONE_FUEL_PER_MOVE_UNIT = 1; // fuel spent per unit of move() distance
export const DRONE_MOVE_SPEED = 4; // units/second while a move() is in progress
export const DRONE_TURN_SPEED = 120; // degrees/second while a turn() is in progress
export const DRONE_BASE_ATTACK = 6; // bite power per attack() call
export const DRONE_BASE_DEFENSE = 1; // survival odds multiplier vs. a black hole's pull (see world/blackholes.js)
export const DRONE_DOCK_GAP = 4; // within the nearest body's radius + this = "close enough to refuel/attack"
export const DRONE_REFUEL_RATE = 18; // fuel/second while docked at a planet/sun
export const DRONE_PRINT_MAX_LEN = 32; // print()'s in-world gas+laser message, clamped (see drone/dronePrintFx.js)
export const DRONE_ATTACK_COOLDOWN_S = 0.25; // min seconds between attack() hits (see drone.js#DRONE_API attack) — else a loop lands ~2000 hits a frame
export const DRONE_PRINT_COOLDOWN_S = 1.5; // min seconds between print() calls (see program/unitPrint.js) — else a print() loop floods the broadcast channel

// The black hole's reach, in multiples of its radius (world/blackholes.js):
// its pull starts at GRAVITY, a unit closer than KILL is lost.
export const BLACKHOLE_GRAVITY_RADIUS_MULT = 7.5;
export const BLACKHOLE_KILL_RADIUS_MULT = 1.35;

// The player's space station (js/station/, ShipKit's ST-04 HAVEN — the same
// model for the local and every remote station): its length along the
// solar truss in world units (the habitat ring is ~0.28 of it), and the
// radius of its pick sphere / selection ring — around the ring, not the
// truss tips, so it doesn't steal clicks meant for ships parked nearby.
export const STATION_MODEL_LENGTH = 5;
export const STATION_PICK_RADIUS = 1.7;
// The story's station is a ruin: it starts at this damage (0..1 — ShipKit's
// damage stages: dark windows from 0.1, a broken panel from 0.2, the torn
// ring from 0.3, plus smoke and sparks). Repairs are meant to bring it down.
export const STATION_START_DAMAGE = 0.35;

// The station's protective field: no gravity on your ships and drone within
// this radius (world/solarGravity.js). It shields, it doesn't pull (v2.19.0).
export const STATION_FIELD_RADIUS = 8;

// Multiplayer: intervals and time limits
export const NET_SHIP_BROADCAST_MS = 120;
export const NET_DAMAGE_FLUSH_MS = 150;
export const NET_PLANET_TOPUP_S = 1.0;
export const NET_REMOTE_PLAYER_TIMEOUT_MS = 6000;
export const NET_GHOST_LERP_SPEED = 6;

// Limits on what other clients broadcast — broadcast has no server-side
// validation, so one malicious message mustn't freeze everyone's browser
// (net/shipsBroadcast.js). Ships: the biggest real fleet (the Fleet tree's
// last level) + 2 to spare. Messages per sender: a real client sends ships
// every NET_SHIP_BROADCAST_MS (~8/s) and print() at most every 1.5 s.
export const NET_MAX_REMOTE_SHIPS = TREE.fleet.effect(TREE.fleet.maxLvl) + 2;
export const NET_MAX_REMOTE_PLAYERS = 60;
export const NET_SHIPS_MSG_RATE = 12, NET_SHIPS_MSG_BURST = 24;   // per second, bucket size
export const NET_PRINT_MSG_RATE = 1, NET_PRINT_MSG_BURST = 3;
// Also the limit on your own nick (net/identity.js#confirmNick).
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
