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
| `js/lifekit/parts/face.js` | A humanoid head with a face that moves (`LifeKit.face`): openings for the eyes and the mouth, teeth, a tongue, 14 expressions as morph targets. Used by the human; meant for androids and other humanoids too. |
| `js/lifekit/creatures/human.js` | The humans: "Human I" (a bust's head and neck) and "Human II" (a made low-poly head); our own round sculpt isn't listed. One file per creature. |
| `js/lifekit/data/bust-head.js` | Human I's head and neck: "Lowpoly face model" by void (sketchfab.com/void22), CC BY 4.0, changed — 187 points, 360 triangles. |
| `js/lifekit/data/human-head.js` | Human II's head: "Low-poly Human Head" by Chermiful (sketchfab.com/Chermiful), CC BY 4.0, changed — 8.6k points, 17.1k triangles, quantised. The credit is in the file and in the lab's blurb. |
| `labs/life.html` + `js/labs/life.js` | The lab: the creatures, MOVEMENT (gait, speed, in place / around), VIEW (skeleton, wireframe, scale bar), BODY (the creature's own parameters, generated from `params`), MODEL and PERFORMANCE. |

Load order on a page: THREE → `lifekit.js` → the `move/` files → `parts/` →
the creature files. The lab also loads ShipKit's core (`makeEnvironment`,
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

### Blending and layers (labs 1.11.0)

From the three.js additive-animation example (its model and clips not
taken — ours are computed): every gait now gives a **pose** — plain
numbers (Euler angles per bone, the legs as hip / knee / foot pitch, the
pelvis's sway and flight) — and only `apply` touches the bones.

- **The base**: stand, T-pose, or moving; their weights fade toward the
  chosen one (~0.35 s). Moving mixes walk and run by the speed
  (`locoParams`: from 2.0 to 3.4 m/s the numbers slide from one to the
  other); the speed itself eases at 4 m/s².
- **Layers** (`LAYERS`, `state.layers = { name: weight }`): added to the
  base pose before the pelvis height is worked out — sneak (hips and knees
  bent, a lean, arms ready: the pelvis drops by itself), sad (the chest,
  the neck and the head down, a damped arm swing), angry (elbows out, the
  head forward), nod, shake, wave (the right arm up, the forearm waving),
  look (around). The face takes the moods too (`face.update` reads
  `state.layers`).
- The lab's **time** slider scales the clock (slow motion).

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

## The face (parts/face.js, labs 1.10.0)

After four rounds of sculpting a sphere by bumps (labs 1.9.0) the face
still looked like a mannequin's. The user pointed at the three.js face
morph-target example; its model wasn't taken (no licence with it, and a
scanned head would clash with bodies built from blocks) — its ideas were:
**expressions as morph targets, under the face-capture set's names**, and
**a mesh dense where the face is, with real openings**.

- **The grid**: longitude denser at the front (φ = π(0.42s + 0.58s³)),
  latitude denser around the face; ~16k vertices, ~32k triangles at
  detail 1 (≈1.5–2 mm apart on the face).
- **The shape** is still a function of the direction (`point`): the skull
  (`base`), the features that don't move (`featuresZ`), then the eyes and
  the mouth from a **layout** (eye centres, the almond's half-width and
  heights, the mouth line, its half-width and gap).
- **The openings**: triangles whose middle (at rest) lies inside an
  almond or the lip slit are left out; the nearest row of vertices on each
  side is **pulled onto the edge curve**, so the lid line and the lips are
  smooth, not stepped. The almond's thin corners stay closed (no white
  chips where it's thinner than the grid).
- **The lids** lie on the eyeball's sphere (+1.4 mm), fading into the face
  at the zone's edge; the eyeball sits 1.8 mm behind the face's surface.
  The lips bulge, roll in at the slit, and are coloured by vertex colours.
- **Inside the mouth**: the upper teeth (an arch), the lower teeth and the
  tongue (turning with the jaw — their own `jawOpen` target), a dark mouth
  behind them so the slit never shows through.
- **Expressions** (`EXPRESSIONS`): the same function computed again with
  one at full strength, stored as the difference (`morphTargetsRelative`),
  normals too. The jaw turns the face under the mouth line about a hinge in
  front of the ears, fading out past the corners and toward the ears.
  r128 blends the **4 strongest at a time** (with normals) — enough for a
  face (blink both + jaw + smile).
- **The controller** (`face.set`, `update`): the lab's slider values plus
  the lively motion — a blink every 2–6 s, a glance every 1–3 s (the
  eyeballs turn), breathing through the mouth when running, TALK.
- The creature's `animate` calls `face.update` (lifekit.js), so any
  creature with a face gets it.

### The low-poly style (labs 1.12.0)

The user brought a low-poly head as a reference ("Lowpoly face model" by
void, Sketchfab, CC-BY 4.0 — looked at, not used: its file stayed out of
the repo; credit it if it's ever used). Ours is made from our own head:

- `util.weld` merges the grid's duplicate points (the seam, the poles);
  `util.decimate` does half-edge collapses ordered by the quadric error
  (Garland–Heckbert): a vertex merges into a neighbour **and takes its
  position**, so every vertex kept is an original one — colours, UVs and
  all 14 expressions carry over by index. Open edges (the eyes, the
  mouth, the hairline, the midline of a half) hold through heavy
  boundary planes; collapses that flip or crush a face or pinch the
  surface are refused. Flat areas go first, so the triangles left run
  along the features.
- `symDecimate` (face.js): the right half is decimated and mirrored —
  the mirrored vertex is the original one at (−x, y, z), so one-sided
  expressions still move their own side.
- The materials get `flatShading` (`materials({ flat })`), the limbs 7
  sides, the fingers 5, the eyes and ears a few facets. ~760 triangles in
  the head, ~5.4k in the whole human.

The hair is now a shell on the head's own grid (both styles): the row
nearest the hairline is pulled onto it, the shell meets the skin at the
edge and rises to its thickness above — a clean hairline instead of a
ragged one.

### Two low-poly humans (labs 1.13–1.15)

Since 1.15 the lab lists two humans, the same body (the user's call,
2026-10-06: "the round one goes, the two low-poly ones stay"):

- **Human I** — the head and the neck after a low-poly bust,
  **"Lowpoly face model" by void** (sketchfab.com/void22), CC BY 4.0,
  changed (`data/bust-head.js`; BODY → Head: its own triangles 1:1, or
  fitted to our grid) — see "Human I" below.
- **Human II** — **"Low-poly Human Head" by Chermiful**
  (sketchfab.com/Chermiful), CC BY 4.0, changed (`data/human-head.js`).

Our own round sculpt (the build with no variant) is no longer listed; its
code stays — the bust's "fitted" head runs on its grid. Each credit is in
its data file, in the lab's blurb and here.

#### Human II

- **The data**: 8.6k points, 17.1k triangles, welded, stored quantised
  (Int16 points, Uint16 triangles, base64) — 200 KB. Scaled so its crown
  and chin meet ours (k = 0.218 m / its 0.766), face forward, upright.
- **1:1**: its own triangles are the head (`LifeKit.face.build({ mesh })`,
  no subdivision), each keeping its own normal (`facetsOf`), so at rest it
  looks exactly as made.
- **Changes to it** (`headData`): the opening under the jaw closed with a
  fan; the lips split — the row where they meet (y 0.500 ± 0.006 its
  units) gets copies for the triangles below, so the jaw parts them;
  triangles bridging the lips inside the mouth and its inner pocket are
  left out (our dark mouth, teeth and tongue are behind). The mouth line
  is straight for it (`curve: 0` — ours curves down at the corners, which
  sent the lower copies to the upper side).
- **Its eyes**: our eyeballs sit in its own openings (centres ±0.131,
  0.767; front at z 0.262 its units); its openings stay as made — the lids
  are **shells** on the eyeball (`lids`), the upper one turning down to
  blink (`eyeBlink*`, `eyeWide*` drive its angle); no lids in its skin.
- **Its hair**: its own triangles above a hairline (not the ears), lifted
  along their normals (1.5–6 mm).
- **Its neck**: ours, running up into its opening under the jaw.
- The face's other expressions (jaw, smile, frown, pucker, brows, cheeks)
  move its points through the same function as our grid's (`pointFrom`).

### Human I: a head after a bust (labs 1.13–1.14)

The bust's surface shaped our grid first (1.13, "fitted"), then its own
triangles became the head (1.14, "1:1", the default): `bustFit` samples
a field of radii from the head's centre (rays against its triangles,
smoothed for the smooth style); `bustNeck` slices its neck into our neck's
sections; `bustHeadTris` keeps its triangles above where the neck widens
into the shoulders; 1:1 cuts each into 121 on its own plane (`s: 11`) so
our lids and lips can move in its skin, each keeping its parent's normal.
Its eyes and mouth are ours, cut into its surface (it has none open);
the smile's and the jaw's pull is wider on it (`SOFT`), fading in under
the mouth line so its few long lip triangles don't crease.

## Limits (honest)

- **The face is better, not real.** Real lids and lips and moving
  expressions changed it most; up close it's still a sculpt (no skin
  shading beneath the surface, the hairline is a shell's edge, the jaw's
  edge at the cheeks is a little hard when it opens wide).
- The hands don't move their fingers; the feet have no toes bone.
- No inverse kinematics: on slopes the feet won't meet the ground.
- Not in the model doctor yet (its limbs overlap the torso by design).

## Next

- The user's look at the human; the face's next pass.
- More creatures per medium: `move/swim.js`, `fly.js`, `space.js`; the
  ENVIRONMENT switch (MarineKit's sea, SurfaceKit's ground and sky).
- Biomechanical forms (ShipKit's materials on a LifeKit skeleton).
