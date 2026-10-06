# Labs changelog

The labs' own version, apart from the game's (`CHANGELOG.md` in the root).
It covers the labs (`labs/`, their start screen `labs.html`), the tools
(`tools/`), LabKit and the menu bar (`js/labkit/`) — and a kit change when it
changes what a lab shows. The number lives in `js/labkit/menubar.js`
(`LABS_VERSION`); the menu bar, the start screen and HELP → About show it.

`x.y.z`: **y** a new lab, tool or feature; **z** a fix or a small change;
**x** a big turn (none yet).

## [1.17.0] — 2026-10-06

### Added
- **The creature editor** (`labs/creator.html`): drag the spine's points
  into shape (the wheel on a point: thicker or thinner; + / − point; the
  height-to-width of each section), add pairs of legs anywhere along it
  (drag the teal point, or sliders: length, thickness, spread from upright
  to sprawled, the knee forward or back, hoof / paw / claws), eyes, the
  colour and the pattern — rebuilt as you drag; PLAY: it walks or runs on
  any number of legs (a wave of steps from the back pair to the front, the
  sides half a cycle apart, feet planted by IK, the spine swaying — a
  legless one glides on the sway alone), look around and crouch. Five
  starts: grazer, biped runner, six-legged crawler, low sprawler, legless
  glider. A design is JSON (COPY / LOAD), kept in this browser.
- LifeKit: `design.js` (a creature from a design), `move/legs.js` (any
  number of legs), `util.hide` (the painted hide, shared).

## [1.16.0] — 2026-10-06

### Added
- **The life lab: the first land animal — the plains strider**, an
  invented grazer (long legs on hooves, a long neck, horns swept back, a
  ridge of horn plates), in a group of its own (LAND ANIMALS; the humans
  are HUMANOIDS) with its own sliders: shoulder height, legs, neck, build,
  horns, back ridge, pattern (plain, stripes, spots, banded legs), colour,
  individual. One skin over 25 bones; the hide painted per individual
  (countershading, pattern, mottling, a hair bump), ridged horns.
- **Four legs** (`move/quad.js`): a walk (lateral sequence) and a trot
  (diagonal pairs) gliding into each other; each foot planted while on
  the ground (it never slides) and lifted in an arc; the legs reach their
  feet by inverse kinematics; a nod with every step; layers: graze,
  alert, look around. The lab shows each creature's own gaits and layers.

## [1.15.0] — 2026-10-06

### Changed
- **The life lab: two low-poly humans.** Our round sculpt is no longer
  listed (its code stays: the bust's "fitted" head uses it). **Human I**
  has the bust's head and neck (1.13–1.14, "Lowpoly face model" by void,
  CC BY 4.0); **Human II** is new: "Low-poly Human Head" by Chermiful
  (sketchfab.com/Chermiful), CC BY 4.0, changed — 1:1, only scaled; our
  eyeballs in its own eye openings with lids that blink (shells on the
  eyeballs), its lips split so the jaw opens the mouth on our teeth,
  tongue and dark mouth, every expression; its hair from its own
  triangles; its open underside closed, our neck into it.

## [1.14.0] — 2026-10-06

### Added
- **Human II's head 1:1**: BODY → Head, "The bust's own (1:1)" (the
  default) or "Fitted to our grid" (1.13.0). The bust's own triangles,
  only scaled (its nose, brows, ears, planes as made), cut where its neck
  widens into the shoulders — with our eyes and lids, the mouth with
  teeth, and all the expressions. Each triangle is cut into 121 on its own
  plane and keeps its own normal, so it looks exactly like the original
  while the lids, the lips and the cheeks move.

## [1.13.0] — 2026-10-06

### Added
- **The life lab: Human II** — the same body, the head and the neck
  shaped after a low-poly bust: "Lowpoly face model" by void
  (sketchfab.com/void22), CC BY 4.0, changed (credited in the lab, in
  `js/lifekit/data/bust-head.js` and in docs/life.md). Its surface gives
  our head its shape (a field of radii, rays from the head's centre; kept
  faceted in low-poly, smoothed otherwise); its neck's slices give our
  neck's sections, so it still bends. Our eyes, lids, mouth, teeth and all
  the expressions on top. Low-poly by default. The first human is
  unchanged.

## [1.12.0] — 2026-10-05

### Added
- **The life lab: a low-poly style** (BODY → Style). Faceted shading, few
  sides on the limbs, and a head decimated to ~760 triangles that still
  blinks, smiles and speaks: LifeKit's new decimator (quadric-error
  half-edge collapses) keeps original vertices only, so every expression
  carries over; the right half is decimated and mirrored, so the facets
  are symmetric like a hand-made low-poly head. The whole human: ~5.4k
  triangles instead of ~60k.

### Changed
- The hair is a shell on the head's own grid with its nearest row pulled
  onto the hairline: a clean edge in both styles (it was ragged).

## [1.11.0] — 2026-10-05

### Added
- **The life lab: gaits that blend, and layers on top.** Changing between
  stand, walk, run and the T-pose fades (~0.35 s) instead of jumping; the
  speed changes like a body's (4 m/s² at most) and a walk turns into a
  jog, then a run, as it rises. **LAYERS** add a pose on top of any gait,
  each with a weight: sneak (the crouch lowers the body by itself — the
  pelvis comes from the legs), sad, angry, nod, shake the head, wave, look
  around; sad, angry, sneaking and waving show on the face too. A **slow
  motion** slider. The idea from the three.js additive-animation example
  (base actions with crossfades, additive poses with weights); no model or
  clips taken from it — the motion is computed.

## [1.10.0] — 2026-10-05

### Added
- **The life lab: a face that moves.** The human's head is new
  (`js/lifekit/parts/face.js`): a grid dense at the front, real openings —
  lids wrapping the eyeballs, a slit between the lips with teeth, a tongue
  and a mouth behind — and 14 expressions as morph targets, named as in
  the common face-capture set (blinks, eyes wide, jaw open, smile and
  frown per side, pucker, brows up and down, cheeks puffed). FACE in the
  lab: a slider each, presets (neutral, smile, surprise, angry, sad,
  pucker), LIVELY (blinks, glances, breathing through the mouth when
  running), TALK, CLOSE-UP. The idea and the expression names from the
  three.js face morph-target example; no model taken from it.

## [1.9.0] — 2026-10-05

### Added
- **The life lab** (`labs/life.html`) and **LifeKit** (`js/lifekit/`):
  life forms from blocks — a skeleton, bodies swept along it and skinned
  (they bend at the joints), rigid heads, hands and feet; movement by
  medium (`move/walk.js`: stand, walk, run, T-pose — the pelvis height
  from the legs, the cycle from the stance foot's travel), one file per
  creature. The first: **a human** to real proportions — height, build,
  frame, skin, hair, eyes, a flight suit or the bare mannequin, a seeded
  face. A studio floor with a metre grid, a 2 m scale bar, walking in place
  (the ground slides) or around, SKELETON and WIREFRAME views. In the
  start screen, the menus, the kit check and the sitemap.

## [1.8.0] — 2026-10-05

### Added
- **WARM SOUND** in the sound lab (on by default, a button under
  CHARACTER to compare with the raw sound): softer saw and square waves,
  filters that breathe (bright as a note starts, darker as it holds), a
  little imperfection (drifting tuning, timing off by a few ms, uneven
  velocities), a chorus on the pads, a round bass (a sine under a dark
  saw, a gentle filter instead of a squelchy one), a calm drone (no
  beating saws), soft saturation and a gentler top on the master, a
  reverb whose tail darkens. The notes and the melodies stay the same.
- **Plucked strings**: a new pluck instrument, a physical model of a
  string (Karplus-Strong) — *Deep orbit* and *First light* use it.

## [1.7.0] — 2026-10-05

### Added
- **EXPORT MIDI** in the sound lab (under RECORD): the chosen song as a
  `.mid` file — the same form, chords and composed melody as heard (the
  same seed gives the same file), a track per part (melody, pads, bass,
  arp, bells, drums on channel 10) with General MIDI instruments close to
  the sounds. Open it in any music program and give it real instruments.
  `MusicKit.songMidi(params)`, `player.midi()`.

## [1.6.0] — 2026-10-05

### Added
- **The sound lab: MUSIC**, a tab beside MOODS — songs instead of ambient:
  *First light* (synth-pop), *Neon heart* (80s ballad), *Midnight
  highway* (synthwave), *Orbit lullaby* (piano), *Cathedral* (organ),
  *Escape velocity* (drive). Each has a form — intro, verse, chorus,
  verse, chorus, bridge, chorus, outro — a chord every bar or two, a
  melody composed from the seed (motifs that come back, phrases ending on
  the chord), a bass line, drums with a roll into the next section and a
  crash on the chorus. At a song's end the next one begins; the player
  shows the section and the bar. Another seed: other melodies.
- MusicKit: `SONGS`, a **Bass** layer, a **Melody** instrument (synth,
  soft flute-like, piano), the major and mixolydian scales.

## [1.5.0] — 2026-10-05

### Added
- **The sound lab: music with a character.** Five new MOODS, each inspired
  by a kind of film or game music (the feel, never anyone's melody):
  *Neon rain* (80s sci-fi: brass swells, a lonely lead, piano, rain),
  *Cathedral of stars* (an organ and an ostinato that grows), *Music for
  orbits* (sparse ambient piano), *Night drive* (synthwave: a 16th-note
  bass, drums, a bright lead), *Derelict* (space horror: a dissonant drone,
  metal clangs, a hull groaning, whispers).
- MusicKit: three new layers — **Melody** (phrases on the scale, gliding,
  landing on the chord), **Beat** (kick, a snare in a big room, hi-hats),
  **Metal** — and **INSTRUMENTS**: pads (soft saws, 80s brass, organ,
  glass), bells (FM, piano), arp (plucks, ostinato, 16th bass), static
  (radio, rain), drone (warm, dissonant); a mood can fix its chord
  progression. Tempo up to 120 bpm.

## [1.4.0] — 2026-10-05

### Added
- **QUICK ACCESS** on the start screen, a row above the labs: the pinned
  lab (the pin on any tile, beside the grip), the last opened, and the
  two most opened (with how many times) — nothing twice; until there's
  something to show, a hint. The menu bar counts every visit to a lab or
  tool page (labsHub.visits, labsHub.recent — in this browser only).

## [1.3.0] — 2026-10-05

### Added
- **The sound lab** (`labs/sound.html`) and **MusicKit**: the game's music
  generated live, no files — a drone, pads, FM bells, a heartbeat pulse,
  an arp, radio static, wordless whispers and a robot's voice over a
  seeded chord progression. MOODS (the station, deep orbit, descent, the
  black hole), SEED, KEY, tempo, density, brightness, space, a level per
  layer, the robot's lines, recording to .webm, COPY SETTINGS; a ring of
  the spectrum and the wave in the middle. On the start screen, in the
  menu, in kitcheck and the sitemap.

## [1.2.0] — 2026-10-05

### Added
- The system lab: **the distance between the centre's bodies** — two or
  three stars (or a star and a black hole…): a slider under CENTRE (from
  touching to just inside the first orbit), and in the view a line
  between them with the distance on it. Live, no rebuild (SystemKit's
  `centerGap`, `setCenterGap`).

## [1.1.1] — 2026-10-05

### Changed
- The start screen has a description and a link preview for search
  engines and shared links; the tools (model doctor, kit check, grain
  texture) stay out of search results.

## [1.1.0] — 2026-10-05

The system lab: shape the orbits by hand.

### Added
- **The ruler**: a line from the centre with a tick at every orbit and the
  gap between neighbours written on it; drag an orbit's gold diamond to
  move it nearer or further.
- **Stretched orbits** (SystemKit `stretch`, `axis`): an ellipse centred
  on the star — from above, drag an orbit's teal point out to make it
  longer that way and narrower across, in for the other way round,
  around to turn its long axis.
- **Tilt by hand**: from the side, drag an orbit's violet point up or
  down.
- **Camera**: FROM ABOVE, FROM THE SIDE, FREE.
- **SELECTED ORBIT**: click an orbit's number — it turns gold, with
  sliders for distance, tilt, stretch and the long axis's direction.
- Everything changes live, without rebuilding the system.

### Fixed
- The system lab's labels showed through the panels and covered each
  other (SOL / MERCURY): they stay under the panels now, and a label that
  would cover another waits.

## [1.0.0] — 2026-10-05

The labs get a home, a menu and a version of their own.

### Added
- **The start screen** (`labs.html`): a tile for every lab and tool — its
  drawn picture, what it's for, in the game / lab only / tool, its kit —
  with the counts and both versions. Drag a tile by its six-dot grip to
  reorder (Alt+arrows from the keyboard); RESET ORDER brings the default
  back.
- **The menu bar** on every lab and tool: FILES (the start screen, back to
  the game), OPTIONS (full screen, reload, reset this lab's saved
  settings), TOOLS (every lab and tool), HELP (this lab's keys and mouse,
  its notes, all docs, what's new, about). Always visible; the labs' top
  panels sit under it.
- **The model doctor** (`tools/doctor.html`): every kit model examined for
  repeating mistakes — inside-out shapes, flickering coplanar faces,
  floating and hidden parts, specks, needle triangles — each finding
  lit up red on the model.
- This changelog and the version.

### Changed
- The labs moved to `labs/` (the start screen stays in the root); the
  game's Dev Tools → LABS has one button to the start screen.
- The surface lab runs on SurfaceKit's shared ground (`ground.js`), the
  same the game lands on; the descent is procedural (entry, clouds, the
  burn, dust).
- The ship lab matches the game: exposure, environment map, anisotropy;
  GAME BUILD at the game's detail; GAME LIGHTING shows the game's lights.

### Removed
- The labs' old root addresses (`ship.html`…) and the studio logo files.
