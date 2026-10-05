# Model doctor (tools/doctor.html, tools/modeldoctor.js)

A tool for the kits, not part of the game (no version bump). Started
2026-10-05, the user's idea: models made by code (and by AI) keep making
the same kinds of mistakes; a deterministic check finds them cheaper than
a person looking at screenshots, and every finding can become a rule the
next session reads (docs/ship.md, docs/gotchas.md).

## Use

- `tools/doctor.html` (local server): every model of ShipKit, BaseKit,
  VehicleKit and MarineKit, built **unmerged** (so a finding names a part),
  examined in a few seconds. Left: the models with their counts; click one,
  then a finding: its parts light up red, the rest fades.
  `?model=vehicle/scout` opens one. `window.doctorReport` holds every
  result as plain data, for scripts.
- `ModelDoctor.examine(root, { tolerance })` works on any THREE object —
  a lab can call it on what it shows.

## The checks

Only solid meshes count (visible, opaque standard / physical / lambert /
phong / basic materials); glows, plumes, sprites, particles, lines and
instanced copies are left out.

| Check | Severity | What | How |
|---|---|---|---|
| nan | error | positions that aren't numbers | any non-finite vertex |
| inverted | error | a closed shape built inside-out (one-sided: the outside culled) | negative signed volume in the geometry's own space (three.js corrects mirrored objects itself); closed shapes only (box, sphere, closed cylinder, torus, extrusion…) |
| zfight | warning | two parts' faces in one plane, overlapping: they flicker | triangles bucketed by plane (normal, distance within 0.06 % of the model), 2D overlap test on triangles shrunk 10 % (sharing an edge doesn't count). Skipped: the same material without a texture (identical pixels, invisible), materials with `polygonOffset` (decals offset on purpose) |
| floating | warning | a part touching nothing of the main body | boxes grown by the tolerance (0.4 % of the model), connected groups; every group but the biggest |
| hidden | info | a part entirely inside another (drawn for nothing) | every sampled vertex inside a closed part (ray parity) |
| speck | info | a part under 0.3 % of the model | its box |
| sliver | info | needle triangles that shade badly | area / longest edge² < 0.002 (zero-area ones, a cone's tip, are harmless) |

Part names: the nearest `userData.part` ancestor (ShipKit's `partsOf`),
else the object's name, else geometry + running number + material colour
(`box #19 #ffffff`) — the kits without named parts.

## First run (2026-10-05)

18 models in about 7 s. Swarmer, Haven, the pad, solar array, mine and
refinery: clean. Real finds, checked in the viewer:
- vehicle/scout: the antenna dish on the mast floats beside the camera
  head (gap ≈ 7 % of the model); the wheel spokes' end faces cross in one
  plane at the hub (a small flicker).
- The vehicles' and the amphibian's many zfight pairs are mostly that
  same spoke pattern (every wheel).

Not yet looked at one by one: scribe's floating part, the hidden parts in
codewing, scribe, barge and diver, the base modules' zfights.

## Next

- Look through every finding; fix the real ones in the kits (BaseKit is in
  the game: a bump), write the lesson into docs/ship.md's rules.
- Allow-list what's meant (a part that floats on purpose, e.g. a hologram)
  with `userData.doctorOk = "floating"` on it.
- Into kitcheck: findings counted per model in the golden file, so a new
  mistake shows up as a diff.
- More checks: parts poking through the hull, lights inside solids,
  unused materials and textures, too many draw calls for what's seen.
