import { FIELD_RADIUS } from "../config.js";
import { CONTENT } from "../content.js";
import { SOLAR_BODY_BY_SLOT } from "./solarSystem.js";
import { randomCometEntry } from "./cometPhysics.js";

// Pure data/math for the 7 body types (kind+temp -> variant, spawn rolls,
// display value) — split out of world/bodies.js, which used to mix this
// with actual mesh-building and scene lifecycle. Nothing here touches
// THREE.Scene/Mesh or ctx; every function is a plain calculation, callable
// from anywhere (the game, the planet editor, a future server-side script)
// without pulling in rendering.
//
// As of the fixed 9-orbit solar system, comets are the only kind still
// randomly rolled/spawned by the game itself — the other 6 kinds
// (sun/ice/neutral/volcanic/meteoroid/blackhole) are each one fixed body
// now (see world/solarSystem.js). randomPlanetSpawnData() below stays
// generic over any kind anyway — it only needs a kind's js/bodies/*.js
// params.

// A "planet" DB row only stores kind+temp, not which of the 3 planet
// variants (ice/neutral/volcanic) generated it — so it's re-derived from
// temp whenever needed (e.g. when a client materializes a row it didn't
// generate itself). Falls back to sign-based classification so it always
// resolves to exactly one variant even if the ranges are edited to overlap
// or leave a gap.
export function variantForTemp(temp){
  const np = CONTENT.neutralPlanet;
  if(temp >= np.tempMin && temp <= np.tempMax) return np;
  return temp < 0 ? CONTENT.icePlanet : CONTENT.volcanicPlanet;
}

export function bodyParams(kind, temp){
  if(kind === "sun") return CONTENT.sun;
  if(kind === "meteoroid") return CONTENT.meteoroid;
  if(kind === "comet") return CONTENT.comet;
  return variantForTemp(temp!=null ? temp : 0);
}

// SOLAR_BODIES (world/solarSystem.js) stores the already-resolved planet
// variant directly ("volcanic"/"neutral"/"ice"), unlike the DB's older
// generic "planet"+temp pair — translates back to the "planet" kind string
// bodyParams()/variantForTemp() above expect, so a fixed body's shape still
// re-resolves through the exact same code path a comet/editor-preview row
// does. Used by both world/bodies.js#materializePlanet and #seedLocalWorld.
export function contentKindFor(solarKind){
  return (solarKind === "volcanic" || solarKind === "neutral" || solarKind === "ice") ? "planet" : solarKind;
}

// i18n key (see js/i18n.js "body" section) identifying which of the 7 body
// types a live planet object is, re-deriving the planet variant from temp
// the same way bodyParams()/variantForTemp() do.
export function bodyVariantKey(p){
  if(p.kind === "sun" || p.kind === "comet" || p.kind === "meteoroid") return p.kind;
  const params = variantForTemp(p.temp);
  if(params === CONTENT.icePlanet) return "ice";
  if(params === CONTENT.volcanicPlanet) return "volcanic";
  return "neutral";
}

// Same formula used when a body is fully devoured (see ships/swarm.js) —
// shared so the hover tooltip's estimate never drifts from the real payout.
// Fixed solar bodies (p.orbitSlot != null) don't carry their own
// radius/temp/valueBonus locally (only health/maxHealth come from their DB
// row — see world/bodies.js#materializePlanet) — read shape from the fixed
// SOLAR_BODIES table instead. Comets (orbitSlot == null) are unchanged.
export function bodyValueEstimate(p){
  const shape = p.orbitSlot != null ? SOLAR_BODY_BY_SLOT[p.orbitSlot] : p;
  return Math.round(shape.radius*14 + Math.abs(shape.temp)*8 + (p.valueBonus||0));
}

export function tempColor(t){
  // t ranges -1 (ice) .. 1 (lava)
  if(t < -0.15){
    const k = Math.min(1, (-t));
    return new THREE.Color().setHSL(0.58 - 0.03*k, 0.75, 0.55 - 0.1*k);
  } else if(t > 0.15){
    const k2 = Math.min(1, t);
    return new THREE.Color().setHSL(0.06 - 0.03*k2, 0.85, 0.52);
  }
  return new THREE.Color().setHSL(0.33, 0.35, 0.5);
}

// Pure function: rolls the parameters for a new body (no mesh/scene side
// effects). `type` is one of the exported CONTENT.* objects (e.g.
// CONTENT.comet) — every real caller forces one explicitly now (the comet
// top-up loop always forces CONTENT.comet) since there's no more shared
// weighted pool to roll an unforced type from.
export function randomPlanetSpawnData(type){
  const radius = type.radiusMin + Math.random()*(type.radiusMax-type.radiusMin);
  const temp = type.tempMin + Math.random()*(type.tempMax-type.tempMin);

  let pos, vel = null;
  if(type.kind === "comet"){
    // Entry point/aim/speed generation lives in world/cometPhysics.js now —
    // a comet flies in from outside the whole solar system and swings
    // around the Sun under real gravity (curving, not a straight line
    // through the middle), see that file's own header comment.
    const entry = randomCometEntry();
    pos = entry.pos;
    vel = entry.vel;
  } else {
    const dist = 10 + Math.random()*FIELD_RADIUS;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    pos = new THREE.Vector3(
      dist*Math.sin(phi)*Math.cos(theta),
      dist*Math.sin(phi)*Math.sin(theta)*0.55,
      dist*Math.cos(phi)
    );
  }

  return {
    kind: type.kind, radius: radius, temp: temp,
    health: radius*type.healthMult, maxHealth: radius*type.healthMult,
    valueBonus: type.valueBonus,
    pos: pos, vel: vel
  };
}
