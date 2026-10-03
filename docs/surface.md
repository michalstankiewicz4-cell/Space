# Surface lab (surface.html), building lab (buildings.html), SurfaceKit, BaseKit

Landing on a planet and building a base there, tried out in two labs before
anything goes into the game. Started 2026-10-03. The user's goal: land on a
planet, put down a base from ready-made modules (first a ghost plan, then
materials are delivered and processed), all simple and automated for now.
For now everything is stored in **this browser only** (localStorage), and each
player sees only their own base. Later this may move to the server.

## Contents

- Files
- The ground: terrain from the planet's own look
- Scale
- The sky: from the star system, the time of day
- Weather
- Reaching the base: landing, driving, the hop
- Building
- Saved bases
- Decisions and numbers
- Not done yet

## Files

| File | What it is |
|---|---|
| `js/surfacekit/sky.js`, `weather.js` | SurfaceKit's sky (what the system puts in it, the world's turn, the light it gives) and weather (kinds per world, particles, wet ground, snow). Classic scripts after `surfacekit.js`, adding to `window.SurfaceKit`. |
| `js/surfacekit/surfacekit.js` | **SurfaceKit** (`window.SurfaceKit`), a classic script: the ground as cube-sphere tiles loaded around the player, lat/lon helpers, saved bases (`bases`), the globe's diamond marker (`makeMarker`). Needs BodyKit. |
| `js/basekit/basekit.js` | **BaseKit** (`window.BaseKit`): the base modules (`MODULES`: landing pad, habitat, solar array, mine, refinery, depot), built from ShipKit's generators. Each one can be shown built, as a placement hologram (fits or doesn't fit), and under construction (clipping planes). |
| `surface.html` | The surface lab: a BodyKit globe in orbit (click it to pick a landing site), then the ground with a craft, a sky, the compass to the base, and building. |
| `buildings.html` | The building lab: one module at a time on a flat patch of ground, with BUILT / GHOST / BLOCKED views, a construction slider and BUILD IT. |
| `js/bodykit/bodykit.js` | `planetTerrain()` (the sampler) and the shared GLSL (`GLSL_PLANET_SURFACE`, exported with `blackbody`). **This is game-shared**: changing it means a version bump. |

None of this is in the game yet. The labs are in Dev Tools → LABS.

## The ground: terrain from the planet's own look

The terrain is not a separate generator. It is the same GLSL that draws the
planet in orbit, sampled up close, so the ground matches what you saw from
space (continents, seas, ice, lava, dunes, craters).

- `BodyKit.planetTerrain(group, body, values)`: only for the planet groups,
  the ones built by `buildPlanet`. Gas giants and suns have no ground.
  - `sample(renderer, face, uv0x, uv0y, step, n, detailFreq)` renders an
    n×n grid of points on one face of the cube-sphere into a small render
    target and reads it back:
    - the height `heightAt` with `TERRAIN_OCTAVES` = 11, more than the globe uses;
    - fine detail;
    - sea and ice flags (`seaAt`, `iceAt`).

    Packed as RGBA8: the height as 16 bits in R and G, detail in B, the flags in A.
  - `material(opts)`: a plain lit ground material (kept, not used by the
    lab any more). SurfaceKit's own `groundMaterial()` colours the ground
    with `planetSurface()`, the function the globe's own shader calls, and
    lights it the surface's way:
    - two suns;
    - an ambient colour;
    - haze;
    - wet ground and snow cover;
    - the craft's lamp.
- **Tiles** (SurfaceKit): an equal-angle cube-sphere, about 1.1 km per tile,
  a 65×65 grid with a one-sample border for normals.
  - The tiles within 2 tiles of the player are loaded, nearest first, at most
    a few per frame.
  - Vertex positions are relative to each tile's centre (float precision).
  - `wanted()` steps a third of a tile at a time: near the edges and corners
    of a face the tiles are narrower than `tileAngle`, and a whole-tile step
    jumped right over one. That showed up as "Ground not loaded" right next
    to the player (fixed 2026-10-03).
- **Height**:
  - land: `R + max(h − sea, 0) · reliefM + detail · detailM`;
  - water, lava and frozen seas: flat at `R`, on worlds that have seas.

  `reliefM = mountains · R`, the same exaggerated relief the globe shows.
  We tried half of it and kept the full one: the hills give the land its
  character, and finding a flat spot becomes part of building.
- `groundAt(dir)` interpolates the tile's own grid and matches the rendered
  mesh to within a few centimetres. Modules, the craft and the camera all
  use it.
- **Sky**: see "The sky" below.
- **Cloud worlds**: the globe never shows the ground under a deck with
  `overcast` 1. Their `fixed` ground values (dry rusty rock, no seas) only
  matter from the surface. The globe is pixel-identical.

## The sky: from the star system, the time of day

The lab picks a **system** (SystemKit's presets, or "a lone planet" around
a Sun-like star) and a **world** in it: any orbit or moon of a planet group
(`SurfaceKit.worldsOf`). `skyOf(system, path)` lists what that world sees,
at the system's start (positions don't move yet; only the world turns):

- **The centres.**
  - A star is a disc in its black-body colour (`BodyKit.blackbody`). Its
    strength comes from size and distance (the Sun from the Earth = 1,
    clamped to 0.15–1.8).
  - Two stars give two discs and two lights.
  - A pulsar is a flickering point with almost no light.
  - A black hole is a dark disc in a ring of light.
- **The other planets** are points (up to 8), brighter when bigger and
  nearer.
- **Moons and the planet you orbit** are real BodyKit bodies at 20 km,
  lit by the star, so moons show phases. From Glacies, Jupiter fills a
  quarter of the sky.
- **Sizes are compressed**, because the system's units aren't to scale:

  | What | Factor |
  |---|---|
  | stars | ×0.15 |
  | other planets | ×0.05 |
  | moons | ×0.15 |
  | the planet you orbit | ×0.4 |

**The world's turn**: `frame(values, theta)` rotates the system's frame (orbits
in XZ) into the body's own frame. It applies the axial tilt (`values.tilt`),
then the spin angle `theta`.

- The lab keeps `theta` and shows the **local solar hour** where you are
  (`hourAt` / `thetaFor`). Driving east makes the time go forward, as it
  should, and seasons and latitude come from the tilt.
- "A day passes in" runs the clock: paused, 10 min, 2 min or 30 s.
- In orbit, the globe is lit for the same hour, so a base at night is on
  the dark side.

**The dome** (`createSky`) has two layers:

| Layer | Distance | Render order | What it holds |
|---|---|---|---|
| Space | 30 km | −10 | stars, planet points, the suns' discs; writes no depth |
| Sky bodies | 20 km | −9 | moons, the giant you orbit |
| Air | 15 km | −8 | the lit air, dusk, cloud deck, fog |

- The air layer is premultiplied: it adds the lit air and covers with
  cloud and fog. So a Moon in the daytime sky is pale, and its dark side
  takes the sky's colour.
- The air layer is transparent (drawn after the ground) but depth-tested,
  so the ground stays in front of it.
- An attempt with the bodies past the dome, at 45 km, broke on depth
  precision: about 120 m there, which made the cloud shells fight the
  surfaces.

**Colours and light**:
- Dusk glows along the horizon under the sun in the sky's **opposite
  hue**: a blue sky sets orange, a rusty one blue, as on Mars.
- Light below the horizon is cut off and reddened low through the air.
- Ambient light = the lit sky + the cloud deck + starlight.
- When it gets dark, the craft's **lamp** comes on: a cone in the ground's
  shader, plus a SpotLight for the modules.
- To look at the sky, right-drag down past the lowest camera angle.
- `surfaceLab.skyList()` gives each sky object's elevation and azimuth,
  for scripts.

## Weather

`SurfaceKit.weatherFor(values)` lists only what the world can have:

| Weather | Where |
|---|---|
| clear | everywhere (airless worlds get only this) |
| haze and fog | worlds with air |
| overcast | worlds with air |
| rain and storms | air, no lava, no frozen seas, seas possible |
| snow | air plus ice or frozen seas |
| dust storm | air, no lava |
| ash fall | lava worlds |

**Strength** (0–1) scales everything.

**The cloud deck**:
- hides the stars and the suns' discs;
- dims direct light by up to 82 %;
- turns the ambient light into the cloud's colour.

**On the ground**:
- **Wet ground** darkens and shines. It comes in about 8 s and dries in
  about 40 s.
- **Snow** settles on level ground over about 30 s and melts over about
  60 s.

**Lightning** flashes every few seconds in strong rain.

**Particles**:
- one box of up to 6000 points around the camera, turned to the local up;
- the box keeps track of the camera's travel, so driving through rain looks right;
- rain falls as streaks, snow as fluttering flakes;
- dust has the ground's colour, and ash falls with glowing embers.

## Scale

`M_PER_SIZE` = 8000 m of ground radius per Earth size (`size` 1).

| Planet | Ground radius | Distance around |
|---|---|---|
| Terra | 8 km | ~50 km |
| Mars | 4.2 km | ~27 km |

The whole planet can be crossed in minutes, yet the base is a dot on the
globe.

## Reaching the base: landing, driving, the hop

- **LAND HERE / LAND AT THE BASE**: the camera glides to the globe, the
  screen fades, and you descend for 5 s from 650 m onto the ground. LAND AT
  THE BASE puts you 30 m south of the base, using that planet's own radius.
- **Driving**:
  - W/S drive, A/D turn, Shift boosts up to 180 m/s;
  - the craft follows great circles;
  - right-drag turns the chase camera, the wheel zooms;
  - the compass at the top shows the direction and distance to the base.

  The craft is ShipKit's swarm ship as a hover craft for now. The vehicles
  lab will replace it with a rover.
- **HOP TO THE BASE**: a suborbital hop. Take off (3 s), fade, then come down
  next to the base.
- **TAKE OFF**: back to orbit, with the camera above the spot you left.

## Building

- Pick a module (the buttons, or B for the first one). A hologram follows
  the pointer: cyan if it fits, red if it doesn't. Click to place it. R turns
  it, Esc cancels, Delete removes the module under the pointer.
- `validate()` checks, in this order:
  - **within 600 m** of the base's centre (the first module founds the base);
  - **ground loaded**;
  - **not on water, lava or ice sheets**;
  - **not too steep**;
  - **no overlap** with other modules.
- **Slope**: a plane is fitted through 8 points on the footprint's rim, so
  bumps smaller than the module don't tilt it. It must stay under the
  module's `maxSlope`.

  | Module | maxSlope |
  |---|---|
  | landing pad | 0.2 |
  | habitat | 0.28 |
  | solar array | 0.35 |
  | mine | 0.4 |
  | refinery | 0.25 |
  | depot | 0.3 |

  Measured on a 10 m circle (2026-10-03):

  | Planet | Median | 90th percentile |
  |---|---|---|
  | Mars | 0.12 | 0.22 |
  | Terra hills | 0.27 | 0.39 |
  | Luna | 0.06 | — |

  So almost all of Mars is buildable, about half of Terra, and Terra's
  hillsides are not. The first limits (0.12–0.25) refused nearly everything.
- **Foundations**: every module stands on a levelled plinth, flared like an
  earthwork. It reaches as deep as the steepest slope the module accepts
  (`maxSlope · footprint + 0.6` m). On a slope its low side shows; on flat
  ground it stays buried. Modules stand upright (along the radius), not
  tilted with the ground.
- **Construction**: the progress comes from the clock (`start`, `dur` = the
  module's `build` seconds).
  - The solid model grows from the ground behind a clipping plane.
  - The hologram shows the rest, with a glowing ring at the work's front.
  - The foundation is there from the start.
  - Materials (`cost`) are listed but not used yet.
- A beacon (a tall additive cylinder) marks the base's centre on the ground.
  The globe shows a gold diamond (`makeMarker`).

## Saved bases

Saved in localStorage under `roj-bases`, one base per planet:

```js
{ "desert/mars": { name, lat, lon, created,
    modules: [{ type, e, n, rot, start, dur }] } }
```

- `e` and `n` are metres east and north of the base's centre.
- `start` and `dur` are in ms.
- The key is the BodyKit ref of the planet.
- ABANDON THE BASE deletes it.

## Not done yet

- Vehicles lab (`vehicles.html` and its own kit, reusing ShipKit's blocks):
  rovers with a driving animation. The user's call: separate from the ship
  lab.
- The base marker on the game's own planets (read `roj-bases`, map the
  game's slots to BodyKit refs).
- Underwater: the seas have a floor, and a sea vehicles lab is planned
  (the user's call: separate from the ground vehicles).
- The system moving (orbits, so moons rise at different times through a
  month), eclipses, weather that changes on its own.
- Materials, delivery and processing; collisions with modules; bases on
  the server, seen by other players.
