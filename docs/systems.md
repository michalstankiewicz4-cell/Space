# System lab (systems.html) and SystemKit

Star systems built from the body lab's bodies. Started 2026-10-03 (the
user's idea: build systems by hand from `bodies`, with 1–3 centre bodies,
orbits, rings, moons and a background; settled as "presets + random from a
seed + editing on top", a full hand editor later if needed).

## Files

| File | What it is |
|---|---|
| `js/systemkit/systemkit.js` | **SystemKit** (`window.SystemKit`), a classic script like ShipKit and BodyKit: the system data format, presets, the random generator, building a system from BodyKit bodies. Not loaded by the game yet; meant for it (other systems on the galaxy map). |
| `systems.html` | The lab: Three.js, OrbitControls, PostKit (IMAGE EFFECTS), LabKit (the labs' HUD helpers, `css/lab.css`), BodyKit, SystemKit. |

## The data

A system is plain, JSON-friendly data (COPY SYSTEM copies it):

```js
{ name, seed, sky: "deep",                                   // SystemKit.SKIES id
  centers: [{ ref: "suns/sol", size: 4, values: { temperature: 5778 } }],   // 1–3
  orbits:  [{ ref: "giants/saturn", distance: 66, size: 2.8, incl: 2.5, phase: 3.3,
              values: { seed: 7 }, ring: null | "broad" | "narrow" | "dust",
              moons: [{ ref: "moons/luna", distance: 2.1, size: 0.28, phase: 0 }] }] }
```

- `ref` is `"groupId/bodyId"` from `BodyKit.GROUPS`; `values` override the
  body's own (a new `seed` makes another planet of the same kind).
- A centre may be a star, a black hole or a pulsar (`options("center")`);
  two or three centres circle their common middle.
- An orbit holds one body (`options("orbit")`: every planet group, gas
  giants, rocks, a black hole) — or, with a RINGS ref, a **belt** around
  the centre, the middle of its band at `distance`.
- `ring`: a giant uses its own rings (`rings`, `ringStyle`); any other body
  gets a RINGS body of that style around it, at its tilt.
- Moons (`options("moon")`: moons, airless, rocks, icy, desert bodies)
  orbit their planet on their own small orbits.
- Units are scene units (a star ~4, an Earth ~1, the first orbit ~12–20),
  not to scale. The orbits turn Kepler-like (ω ∝ distance^-1.5).

## Presets and the generator

Presets (`SystemKit.PRESETS`): the game's own system (from
`BodyKit.GAME_BODIES`, orbit 4 left for the station ring), the Solar System
(Mercury … Neptune, Luna, an asteroid belt, Jupiter's and Saturn's moons),
a binary star, a pulsar's graveyard (METRONOME and debris), a black hole.

`SystemKit.random(seed)` — the same seed is always the same system:

- the centre: one star (60%), two (18%), a star and a black hole, a black
  hole alone, or a pulsar alone; a star's temperature from red dwarf to
  hot white (and its size with it);
- 3–9 orbits, each ~1.38–1.6× further than the last;
- zones by place in the system (pushed outward by a hotter star): hot —
  lava, airless, desert; temperate — Earth-like, desert, cloud worlds;
  outer — gas and ice giants; the edge — icy, airless, giants; at most one
  belt;
- giants: 1–4 moons, sometimes rings (Saturn has its own); rocky worlds:
  rarely a ring, Earth-like and desert worlds sometimes a moon or two;
- a background and a catalogue name (`HX-0000`).

## Building (`SystemKit.build(system, { detail })`)

Every body is `BodyKit.buildBody(...)` + `setRadius(size)`, placed in a
group tree: an orbit's plane (tilted by `incl`) > a holder that moves along
the circle > the body (its own tilt and spin); moons hang off their planet's
holder. `handle.update(t, dt, { camera, renderer, time, octaves })` moves
everything (`time` is the orbits' clock — the lab's pause and speed), lights
every body from the main star (`lightPosition`; with no star, from the
first centre), and gives far bodies fewer noise octaves (the quality's,
minus 1 beyond 30 radii, minus 2 beyond 80) — the cost of many BodyKit
bodies at once. `dispose()` frees everything.

## The lab

- **Left**: PRESETS; RANDOM (a seed, 🎲 a new one, GENERATE); the
  CENTRE rows (1–3); the ORBITS rows — body, ring, moons, ✕ — and
  ADD AN ORBIT (each new one 1.45× further); BACKGROUND; COPY SYSTEM.
  Every change rebuilds the system (once per frame at most).
- **Right**: FOLLOW (the camera moves with a body), TIME (×0–6), ORBITS,
  LABELS, AUTO-ROTATE, PAUSE; the system's numbers; render quality and
  geometry detail (40% by default: many bodies); IMAGE EFFECTS (the sun's
  flare from the main star, lensing from a black hole in the centre);
  performance.
- The panels fade out after 5 idle seconds (LabKit's `autoHideHud`, as in
  the ship and body labs); the labels stay.
- Measured: the Solar System preset (18 bodies) and the others hold 60 fps
  on the test machine at the defaults.

## Next

A full hand editor (distances, sizes, inclinations per orbit, moons one by
one), moons of moons, comets on long orbits, and taking SystemKit into the
game.
