import { FIELD_RADIUS } from "../config.js";
import { CONTENT, BODY_TYPES } from "../content.js";

// Pure data/math for the 7 body types (kind+temp -> variant, spawn rolls,
// display value) — split out of world/bodies.js, which used to mix this
// with actual mesh-building and scene lifecycle. Nothing here touches
// THREE.Scene/Mesh or ctx; every function is a plain calculation, callable
// from anywhere (the game, the planet editor, a future server-side script)
// without pulling in rendering.

// Picks one of the 7 body types (everything in js/bodies/* except
// blackhole.js, which spawns on its own timer — see world/blackholes.js),
// weighted by .spawnWeight. Weights don't need to sum to 1.
export function pickBodyType(){
  const total = BODY_TYPES.reduce(function(s, t){ return s + t.spawnWeight; }, 0);
  let r = Math.random() * total;
  for(let i=0;i<BODY_TYPES.length;i++){
    if(r < BODY_TYPES[i].spawnWeight) return BODY_TYPES[i];
    r -= BODY_TYPES[i].spawnWeight;
  }
  return BODY_TYPES[BODY_TYPES.length-1];
}

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
export function bodyValueEstimate(p){
  return Math.round(p.radius*14 + Math.abs(p.temp)*8 + (p.valueBonus||0));
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
// effects). Used both for network seeding (INSERT into Supabase) and for
// offline mode (multiplayer not configured). `forcedType` is one of the
// exported CONTENT.* objects (e.g. CONTENT.icePlanet) — pass it to force a
// specific type instead of rolling one via pickBodyType().
export function randomPlanetSpawnData(forcedType){
  const type = forcedType || pickBodyType();
  const radius = type.radiusMin + Math.random()*(type.radiusMax-type.radiusMin);
  const temp = type.tempMin + Math.random()*(type.tempMax-type.tempMin);

  let pos, vel = null;
  if(type.kind === "comet"){
    // start tuz za granica pola, lecac po linii przez srodek obszaru gry
    const shellDist = FIELD_RADIUS*1.15;
    const theta0 = Math.random()*Math.PI*2;
    const phi0 = Math.acos(2*Math.random()-1);
    pos = new THREE.Vector3(
      shellDist*Math.sin(phi0)*Math.cos(theta0),
      shellDist*Math.sin(phi0)*Math.sin(theta0)*0.55,
      shellDist*Math.cos(phi0)
    );
    const aimPoint = new THREE.Vector3((Math.random()-0.5)*FIELD_RADIUS*0.5,(Math.random()-0.5)*FIELD_RADIUS*0.3,(Math.random()-0.5)*FIELD_RADIUS*0.5);
    const speed = CONTENT.comet.speedMin + Math.random()*CONTENT.comet.speedRange;
    vel = new THREE.Vector3().subVectors(aimPoint,pos).normalize().multiplyScalar(speed);
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
