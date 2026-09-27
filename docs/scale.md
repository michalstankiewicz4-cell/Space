# Scale: sizes, distances and what depends on them

How big things are in Swarm Protocol, why, what was changed so far and
what to watch for when changing it again. It's a topic we keep coming
back to: many systems depend on sizes and distances, often in ways that
aren't obvious from the constant itself.

**Goal (set by the user, 2026-09-27):** a *more realistic* scale — the
Sun towers over planets, planets tower over the station, and ships are
small next to both — but **not literal realism**. At real proportions a
planet seen from the next orbit would be a sub-pixel dot and the game
would be unreadable. Readability wins over physics.

**Approach:** gradual steps, each its own version, each tested in the game
before the next.

Contents:
- [The key idea: gameplay size vs drawn size](#the-key-idea-gameplay-size-vs-drawn-size)
- [Current numbers](#current-numbers)
- [What has been done](#what-has-been-done)
- [Problems found along the way](#problems-found-along-the-way)
- [What depends on what](#what-depends-on-what)
- [Checklist for the next change](#checklist-for-the-next-change)
- [Possible next steps](#possible-next-steps)

## The key idea: gameplay size vs drawn size

**Only ratios matter visually.** Making *everything* bigger (orbits,
bodies, ships, the camera) looks identical on screen. The expensive thing
is changing distances, because physics, travel times and the database
are tuned to them. So the steps so far **only changed the sizes of
things**, not the distances between them.

**Solar bodies have two radii** (since v2.17.0,
`world/solarSystem.js`):

| Field | What it is | Used for |
|---|---|---|
| `size` | The body's original radius, the gameplay size | gravity (`gm = size³ × 0.9`, SOI radius), point value (`bodyValueEstimate`), offline max health (`size × healthMult`), the Sun's PointLight range (`size × 40`), the minimap's schematic dot size |
| `radius` | `size × BODY_VISUAL_SCALE[kind]`, what's drawn | the BodyKit look, the pick sphere, the selection frame, the eating orbit, the drone's dock range, the camera focus distance/zoom, gravity's near clamp (`radius × 0.6`), scorch-mark scaling |

Every body object (`ctx.planets[i]`) carries both as `p.radius` and
`p.size`. A comet's `size` equals its `radius` (its radius comes from the
database row, see below).

The database never sees the drawn radius: `solar_bodies` stores only
health / max_health (seeded from `size × healthMult`, see
`supabase/schema.sql`), so drawing bodies bigger needed **no database
change**.

## Current numbers

As of v2.17.1. World units; the whole system spans about ±1200.

**Distances (unchanged since v2.0):**

| Thing | Value | Where |
|---|---|---|
| Orbits (semi-major axis) | 90, 150, 220, [290 station ring], 370, 470, 590, 730, 890 | `world/solarSystem.js#SOLAR_BODIES`, `STATION_RING` |
| Gap between neighbouring orbits | 60–150 | — |
| Comet entry / exit radius | 890 × 1.15 ≈ 1024 / × 1.1 ≈ 1126 | `world/cometPhysics.js` |
| Comet perihelion | 90 × 2/3 = 60 | `world/cometPhysics.js` |
| Sun's gravity | `GM_SUN` 60000 (tied to the orbit sizes) | `world/solarSystem.js` |

**Bodies (drawn radius = size × scale):**

| Body | size | × scale | drawn radius |
|---|---|---|---|
| Sun (SOL) | 4.2 | × 3 | 12.6 |
| Volcanic planets (CINDER, MAGMA) | 1.6, 2.3 | × 2.5 | 4.0, 5.75 |
| Neutral planets (TERRA-1, PELAGIA) | 1.9, 2.6 | × 2.5 | 4.75, 6.5 |
| Ice planets (RIME, GLACIES) | 1.7, 2.4 | × 2.5 | 4.25, 6.0 |
| Meteoroid (FERRUM) | 1.1 | × 1.5 | 1.65 |
| Black hole (ABYSS) | 1.5 | × 1 | 1.5 (disk reaches ~7.5) |
| Comet | 0.38–0.6 (random, DB) | × 1 | same |

`BODY_VISUAL_SCALE` in `world/solarSystem.js` holds the multipliers.

**Units (since v2.16.0, `config.js`):**

| Unit | Length | Constant |
|---|---|---|
| Swarm ship (SW-01) | 0.45 | `SHIP_MODEL_LENGTH` |
| Drone (DR-01) | 0.7 | `DRONE_MODEL_LENGTH` |
| Station (ST-04), along its truss | 5 (ring radius ≈ 1.4) | `STATION_MODEL_LENGTH` |

**Things sized around units or bodies:**

| Thing | Value | Constant / place |
|---|---|---|
| Eating orbit | body radius + 1.6 | `EAT_ORBIT_GAP` (`ships/swarm.js`) |
| Drone dock / attack range | body radius + 4 | `DRONE_DOCK_GAP` (`drone/drone.js`) |
| Ship pick sphere / selection ring | 0.4 / 0.26–0.31 | `ships/swarm.js#makeShipMesh` |
| Ship LOD (model ↔ cone) | 30 from the camera | `SHIP_LOD_DISTANCE` |
| Drone ring / pick sphere | 0.68–0.75 / 0.5 × drone length | `drone/drone.js` |
| Station pick sphere / selection | 1.7 | `STATION_PICK_RADIUS` |
| Station field (no gravity, pull-back) | 8 | `STATION_FIELD_RADIUS` |
| Ship spawn spiral around the station | 3 + 0.55·√i | `ships/swarm.js` |
| Other players' station label | 2.7 up, 3 wide | `net/shipsBroadcast.js#STATION_LABEL` |
| Ship glow, scene light | 0.8, range 2.2 | `SHIP_LIGHT_INTENSITY/RANGE` |
| Ship glow, on bodies | 1.5, range 7 | `SHIP_BODY_LIGHT_INTENSITY/RANGE` |
| Ship cam (at the canopy) | 0.17 / 0.055 × ship length | `scene/shipcam.js` |
| Unit miniature distance | 1.8 × ship / 2.4 × drone length | `scene/unitThumb.js` |

**Camera and scene limits:**

| Thing | Value | Where |
|---|---|---|
| "base" view (around the station) | radius 11, zoom 3–150 | `scene/controls.js` |
| "system" view (around the Sun) | radius 950, zoom 20–2500 | `scene/controls.js` |
| "focus" view (a body) | radius max(4, 6 × radius), zoom 1.6–80 × radius | `scene/controls.js#focusCameraOn` |
| Camera far plane | 12000 | `scene/setup.js` |
| Sky sphere | 9000, follows the camera | `scene/skybox.js` |
| Fog | FogExp2 density 0.0007 (BodyKit shaders ignore fog) | `scene/setup.js` |

## What has been done

### Step 1 — units at half size (v2.16.0)

Ships 0.9 → 0.45, drone 1.4 → 0.7, station 10 → 5.

- **Why first:** the cheapest step — no physics, orbits or database touched.
  Before it the station's ring (2.8) was wider than TERRA-1 (1.9) and a
  ship was half a planet's diameter.
- **What followed the units:** everything in the "sized around units"
  table above that concerns ships, the drone and the station — rings,
  pick spheres, the LOD cone, owner markers, bite beams (tube radii 0.03 /
  0.08), the drone's spawn offset above the station (3.5), the station's
  label and focus distance, the spawn spiral and the station field, the
  ship cam, the unit miniature and the base camera.
- **Result:** the station smaller than a planet, the swarm reads as a swarm.

### Step 2 — bodies drawn bigger (v2.17.0)

Sun × 3, planets × 2.5, meteoroid × 1.5, black hole × 1.

- **The two radii** (see the key idea above) keep gravity, points, health
  and the database exactly as before.
- **Fixed distances became "above the surface"**:
  - the eating orbit was a fixed 3.6 — inside a planet of radius 4.75; now
    `radius + EAT_ORBIT_GAP`;
  - the drone's dock range was `radius × 3.2` — 15 units for a big planet;
    now `radius + DRONE_DOCK_GAP`.
- **Result:** the user: "wygląda rewelacyjnie". FPS unchanged (143–163 in
  the tests).

### Step 2 follow-up — ship light split (v2.17.1)

The ship glow light's scene PointLight kept its old reach (7) while the
units shrank: the ships now park close around a smaller station, so the
whole station was lit teal-green whenever the lights were on. The light
was split: a short, weak scene light (hull and neighbours) and a separate
stronger light only for the bodies (BodyKit's `opts.lights`).

## Problems found along the way

Worth remembering — each would come back with the next rescale.

1. **Eating orbit inside the planet.** A fixed distance stops working
   when body sizes change. Anything "near a body" should be
   `radius + gap`, not a constant or a multiple.
2. **Scorch marks grew with the body.** They're painted on a texture that
   wraps the drawn sphere, so a 2.5× bigger sphere made every blot 2.5×
   bigger and a bitten planet turned white. Fixed by scaling the blot by
   `size / radius` (`world/bodies.js#paintScorch`).
3. **Lights tuned in world units.** A light's range that suited the old
   sizes can reach much more once the units shrink (the teal station).
   Lights and effects need re-checking after every size change.
4. **Gravity must not follow the drawn size.** `gm = r³ × 0.9` would have
   made a 2.5× bigger planet ~15× heavier, pulling ships off course.
   Gravity uses `size`.
5. **Test camera overrides stack.** In Playwright tests, overriding
   `renderer.render` twice captured the first override as "original";
   keep the real one in `window.__orig`. (Test-only, but it cost time.)

## What depends on what

**If you change a unit's size** (ship, drone, station): the rings, pick
spheres, markers, labels, spawn distances, field radius, ship cam, unit
miniature and base camera listed above; `SHIP_LIGHT_RANGE`; check the ship
cam isn't inside the hull; check picking still works (ships are picked
before planets).

**If you change a body's drawn size** (`BODY_VISUAL_SCALE`): nothing in
gameplay, by design — but check the look up close (the eating orbit is
automatic), the scorch blots, the selection frame, the camera focus
distance, and that the Sun doesn't swallow orbit 1 (90) or the comet's
perihelion (60).

**If you change a body's gameplay `size`**: gravity (SOI, pull), its
point value, its health — **and the database**, whose `solar_bodies`
max_health was seeded from `size × healthMult` (a new seed or an UPDATE
through the Management API; there's no client UPDATE policy on purpose,
see `docs/security.md`).

**If you change distances** (orbits, the system's extent) — the expensive
one:
- `GM_SUN` is tied to the orbit sizes (gravity falls off with r²);
- orbital speeds (`SOLAR_BODIES[].speed`) are tuned so ships (base speed
  6.5 × upgrade) can catch a body; they scale with the orbit;
- comet entry/exit radius and perihelion derive from the orbits, and the
  **database CHECK constraints** `bodies_pos_check` (±1200) and
  `bodies_vel_check` (±15) must allow the new positions and speeds —
  forgetting this once silently rejected every comet spawn for several
  commits (`docs/security.md`);
- travel times between orbits, the station ring (290) and station
  placement, the minimap's ring table, the system camera (950, zoom up to
  2500), the far plane (12000) and sky radius (9000), the fog density;
- float precision is fine up to far larger systems (it isn't the limit).

## Checklist for the next change

1. Read this file and the relevant `docs/architecture.md` sections.
2. Change constants in one place (`config.js`, `world/solarSystem.js`),
   derive the rest from them — no new magic numbers sized in world units.
3. Anything "near a body": `radius + gap`. Anything tied to a unit:
   a multiple of its length constant.
4. Test in the game (Playwright): base view, system view, focus on a
   planet, a ship eating (it must reach the orbit and the health must
   drop), the ship cam, the unit and planet miniatures, the station with
   ship lights on and off, a second session for other players' units,
   Dev Tools → Performance stats.
5. Bump the version, add a CHANGELOG entry and update the tables here.

## Possible next steps

Not decided yet — ideas for later steps:

- **Black hole:** bigger visually (the disk) while keeping its pull and
  kill radius (they come from `size`).
- **Comet:** a bigger nucleus and a longer tail through a visual scale
  only — its radius is in the database (`bodies_radius_check` ≤ 1.2).
- **Camera:** zoom ranges and default distances of the base/system views
  tuned to the new proportions.
- **Station:** its size relative to ships as more station parts arrive
  (repairs, building).
- **Distances:** only if really needed — see "If you change distances".
