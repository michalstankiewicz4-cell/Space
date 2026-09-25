// Every celestial body is its own file with its own properties — see
// js/bodies/*.js. This module just aggregates them into one place the
// game (js/world/*) reads from.
//
// This is not runtime config (like js/config.js) — it's input data for the
// procedural generator. Changing a value here changes how NEWLY generated
// bodies look/behave (bodies already in the world are unaffected).
import { SUN } from "./bodies/sun.js";
import { ICE_PLANET } from "./bodies/icePlanet.js";
import { NEUTRAL_PLANET } from "./bodies/neutralPlanet.js";
import { VOLCANIC_PLANET } from "./bodies/volcanicPlanet.js";
import { COMET } from "./bodies/comet.js";
import { METEOROID } from "./bodies/meteoroid.js";
import { BLACKHOLE } from "./bodies/blackhole.js";

export const CONTENT = {
  sun: SUN,
  icePlanet: ICE_PLANET,
  neutralPlanet: NEUTRAL_PLANET,
  volcanicPlanet: VOLCANIC_PLANET,
  comet: COMET,
  meteoroid: METEOROID,
  blackhole: BLACKHOLE
};
