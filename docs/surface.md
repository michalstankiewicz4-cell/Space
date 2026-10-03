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
- Reaching the base: landing, driving, the hop
- Building
- Saved bases
- Decisions and numbers
- Not done yet

## Files

| File | What it is |
|---|---|
| `js/surfacekit/surfacekit.js` | **SurfaceKit** (`window.SurfaceKit`), a classic script: the ground as cube-sphere tiles loaded around the player, lat/lon helpers, saved bases (`bases`), the globe's diamond marker (`makeMarker`). Needs BodyKit. |
| `js/basekit/basekit.js` | **BaseKit** (`window.BaseKit`): the base modules (`MODULES`: landing pad, habitat, solar array, mine, refinery, depot), built from ShipKit's generators. Each one can be shown built, as a placement hologram (fits or doesn't fit), and under construction (clipping planes). |
| `surface.html` | The surface lab: a BodyKit globe in orbit (click it to pick a landing site), then the ground with a craft, a sky, the compass to the base, and building. |
| `buildings.html` | The building lab: one module at a time on a flat patch of ground, with BUILT / GHOST / BLOCKED views, a construction slider and BUILD IT. |
| `js/bodykit/bodykit.js` | `planetTerrain()` and the shared `planetSurface()` GLSL. **This is game-shared**: changing it means a version bump. |

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
  - `material(opts)` colours the ground with `planetSurface()`, the function
    the globe's own shader calls, plus:
    - grain up close;
    - sun lighting;
    - haze in the colour of the atmosphere.
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
- **Sky** (`makeSky` in surface.html):
  - a gradient from the horizon to the zenith in the atmosphere's hue,
    blended with stars;
  - its density comes from `atmosphere`, plus `haze` and `overcast` on cloud
    worlds, so no stars show on Venus.

  It is always day at the landing site for now.
- **Cloud worlds**: the globe never shows the ground under a deck with
  `overcast` 1. Their `fixed` ground values (dry rusty rock, no seas) only
  matter from the surface. The globe is pixel-identical.

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
- Materials, delivery and processing; real night and day; collisions with
  modules; bases on the server, seen by other players.
