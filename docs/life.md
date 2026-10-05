# Life lab (labs/life.html) and LifeKit

Life forms, built from blocks the way ShipKit builds ships. Started
2026-10-05 (labs 1.9.0), the user's plan: creatures as background to
discover (the Wiki's "Life forms"), reacting to the player later; from a
virus to a dinosaur, and in space a huge being or a nanobot swarm. Not in
the game yet. The plan and its reasons: IDEAS.md, "Life forms".

## Files

| File | What it is |
|---|---|
| `js/lifekit/lifekit.js` | The core (`window.LifeKit`): the registry (`CREATURES`, `register`, `MOVES`, `registerMove`), `build(id, params, opts)`, and `util` — `skeleton`, `sweep`, `merge`, `materials`, `skinned`, `rigid`, `rng`. |
| `js/lifekit/move/walk.js` | Moving on land: a biped's gaits (stand, walk, run, T-pose). Swimming, flying and space come as `move/<medium>.js`. |
| `js/lifekit/creatures/human.js` | The human. One file per creature. |
| `labs/life.html` + `js/labs/life.js` | The lab: the creatures, MOVEMENT (gait, speed, in place / around), VIEW (skeleton, wireframe, scale bar), BODY (the creature's own parameters, generated from `params`), MODEL and PERFORMANCE. |

Load order on a page: THREE → `lifekit.js` → the `move/` files → the
creature files. The lab also loads ShipKit's core (`makeEnvironment`,
`modelStats`).

## How a body is built

- **The skeleton** (`util.skeleton`): bones with rest positions in the
  creature's space and **no rest rotation** — every bone's axes are the
  creature's (X left, Y up, Z forward), so `rotation.x` swings any limb
  forward (−) or back (+) the same way. Rest: standing, arms a little out
  (an A-pose).
- **Swept parts** (`util.sweep`): a tube along a smooth line (a
  centripetal Catmull-Rom curve) through *sections*; each section an
  ellipse — `rx` across, `f` to the front, `b` to the back, `n` its
  squareness (a superellipse) — with bone weights. Radii ease between
  sections, weights blend linearly, the four strongest bones per ring go
  into `skinIndex` / `skinWeight`. Round ends (`capStart`, `capEnd`).
  The torso, the neck, the arms and the legs are swept and **skinned**, so
  they bend at the joints instead of breaking apart.
- **Rigid parts** (`util.rigid`): meshes hung on a bone — the head, the
  eyes and lids, the ears, the hands, the feet. Merged per material.
- **Materials** (`util.materials()`, one cache per creature, disposed with
  it): skin (a warm mottled map, a pore bump), cloth (a weave), rubber,
  metal, hair (strands), eyes (the iris and pupil around the front pole);
  colours converted to linear like everywhere else. r128 needs
  `skinning: true` on a skinned mesh's material — the cache keeps skinned
  and rigid copies apart.

Gotcha (cost an hour): THREE's Catmull-Rom curve through **two** points
gives a tangent pointing *backwards* at the start, so a two-section ring
(a belt) came out twisted into an X. `sweep` takes the tangent as a
central difference and keeps it pointing the same way ring to ring.

## Moving on land (move/walk.js)

A creature using it gives a `rig` (pelvis, spine, chest, neck, head, and
arms and legs as `[left, right]`) and `dims` (thigh, shin, ankle height,
heel and ball lengths, pelvis and hip heights).

- The legs swing on a sine, opposite each other; the knee bends in the
  swing (and gives a little as the heel lands); the foot stays level in
  the stance, rolls off the toes, lifts them in the swing.
- **The pelvis height comes from the legs**: the lower foot always
  touches the ground (plus a short flight when running).
- **The cycle's length comes from the stance foot's travel**, so at the
  chosen speed the feet don't slide on the ground — check it IN PLACE
  against the moving grid.
- The pelvis turns with the forward leg, the chest against it, the arms
  swing against their legs, the head stays steady; idle breathes and
  shifts its weight.

## The human (creatures/human.js)

Real proportions (about 7.5 heads), 19 bones, ~25k triangles.
Parameters: height 1.50–2.05 m, build (slim → heavy), frame (hips →
shoulders), skin tone, hair (short, buzz cut, ponytail, none), hair and
eye colour, outfit (a flight suit with a belt, a collar and boots — or
the bare mannequin: smooth, no anatomy beyond the shape), the suit's
colour, and a seed for the face.

The head is a sphere sculpted by a function (`headShape`): a
superellipsoid (squarer from the front, round in profile), a narrowing
jaw, a flatter face, and features as small bumps and dents — the nose,
the brow, the eye sockets, the lips, the chin, the cheekbones; vertex
colours for the lips, the brows, a blush. The eyes sit in the sockets
with an upper and a lower lid (parts of a slightly bigger sphere). The
hair is the same shape a little bigger, sinking under the skin below a
hairline.

Lore: there are no living humans in the game's world — the model is for
the Wiki, holograms, statues, remains, a base for androids and
biomechanical forms. The user decides its role.

## Limits (honest)

- **The face is stylised, not realistic.** Sculpting by bumps on a sphere
  gets a believable head from a distance; up close it's a mannequin's.
  Realism would need a proper face mesh (more vertices where the features
  are, real eyelids and lips), or a hand-made model.
- The hands don't move their fingers; the feet have no toes bone.
- No inverse kinematics: on slopes the feet won't meet the ground.
- Not in the model doctor yet (its limbs overlap the torso by design).

## Next

- The user's look at the human; the face's next pass.
- More creatures per medium: `move/swim.js`, `fly.js`, `space.js`; the
  ENVIRONMENT switch (MarineKit's sea, SurfaceKit's ground and sky).
- Biomechanical forms (ShipKit's materials on a LifeKit skeleton).
