# Sound lab (labs/sound.html) and MusicKit

The game's music, generated live in the browser (Web Audio) — no audio
files. Started 2026-10-05, the user's idea: "a music generator like the
ship generator". Lab first (labs 1.3.0); the game later.

## Files

| File | What it is |
|---|---|
| `js/musickit/musickit.js` | **MusicKit** (`window.MusicKit`), a classic script, no dependencies: `create({ params })` → a player (`start`, `stop`, `setParams` live, `say`, `analyser`, `stream`), `PRESETS`, `LAYERS`, `SCALES`, `NOTES`. Not in the game yet. |
| `labs/sound.html` + `js/labs/sound.js` | The lab: PLAY, MOODS, SEED, KEY, CHARACTER (tempo, density, brightness, space, volume), LAYERS (a level each), THE ROBOT'S VOICE (its lines, how often), RECORD (.webm), COPY SETTINGS; a picture of the sound in the middle. |

## How the music is made

A slow chord progression in one scale (a chord every 4 bars, in thirds,
sometimes a 7th or 9th), the seed choosing the progression and every
random event — the same seed and parameters play the same piece.

| Layer | Sound |
|---|---|
| drone | two detuned saws and a sub on the root (2 octaves down), a low-pass swept by a very slow LFO |
| pads | the chord's notes, two detuned saws each through a low-pass (BRIGHTNESS), crossfading at each chord |
| bells | FM chimes (ratio 3.5) on the chord's notes, an octave or two up, panned; DENSITY sets how often; into the echo |
| pulse | a heartbeat: two thumps (62→38 Hz) every two beats |
| arp | triangle plucks walking the chord, in about half the passages |
| texture ("Static") | pink noise through a slowly wandering band-pass, plus random high clicks |
| whispers | wordless murmuring: per syllable, noise and a faint sawtooth hum (~200 Hz) through three band-passes at a vowel's formants (F1–F3), with a soft "s" sometimes; 3–8 syllables a phrase, panned |
| voice | the robot's lines through the browser's speech synthesis (an English male voice if there is one, slow, low) |
| lead ("Melody") | phrases of 3–6 notes stepping along the scale, the last one long and on a chord tone; a saw + square, a glide from the previous note, a late vibrato, rests between phrases (DENSITY: shorter rests); into the echo |
| beat | a kick (140→42 Hz) on 1 and 3, a snare (noise + a tone) on 2 and 4 with its own big reverb send, hi-hats on 8ths (16ths above density 0.5); the bus itself sends little to the reverb |
| metal | inharmonic FM clangs (ratios 1.41 / 2.76 / 3.17 / 1.89, long decays) and, rarely, a hull's groan (a low saw bending down) |

**INSTRUMENTS** (`MusicKit.VOICES`) — what a layer sounds like:

| Param | Values |
|---|---|
| `padVoice` | `saw` (two soft saws), `brass` (three saws, the filter swelling open, a slow vibrato — 80s), `organ` (sine drawbars on harmonics 1–8, a pedal an octave down, a slow tremolo, quick changes), `glass` (sine + triangle partials) |
| `bellVoice` | `fm` (chimes), `piano` (five decaying partials and a soft hammer; plays more often, sometimes a second note) |
| `arpMode` | `chord` (plucks, in about half the passages), `ostinato` (one figure per seed, every 8th, always; an octave joins every other round of a fixed progression), `bass16` (a 16th-note octave bass on the chord's root) |
| `textureKind` | `radio` (the wandering band and crackles), `rain` (white noise, wide, and falling drops) |
| `droneVoice` | `warm`, `dissonant` (adds a tritone and a rubbing minor second) |

`progression`: an array of scale degrees cycled in order (e.g. `[0, 5, 3, 6]`)
instead of the seeded random walk; `null` for the seeded one.

- Everything goes through one reverb (an impulse generated from SPACE, 2–8 s)
  and an echo (¾ of a beat, filtered); a compressor on the master.
- The clock schedules events 0.25 s ahead (a 100 ms timer).
- Browsers start audio only after a click: `start()` comes from PLAY.
- MOODS: The station (dorian, D), Deep orbit (lydian, A), Descent
  (minor, E, faster, denser), The black hole (phrygian, C#, slow, dark);
  and, inspired by kinds of film and game music (labs 1.5.0 — the
  character, never a melody): Neon rain (80s sci-fi), Cathedral of stars
  (organ + ostinato), Music for orbits (ambient piano), Night drive
  (synthwave), Derelict (space horror). A mood sets everything but the
  volume, the seed and the robot's lines.

## WARM (labs 1.8.0)

`params.warm` (default true; the lab's WARM SOUND button) — the user's
"many sounds buzz" (2026-10-05): raw saws and squares, static filters,
perfect timing and a white-noise reverb sounded like a machine. With WARM:

| What | How |
|---|---|
| softer waves | `osc()` gives saw and square a `PeriodicWave`: the Fourier series × e^(−(k−1)/14), not normalized (the fundamental as loud as the browser's wave — normalized, they came out ~30% louder and the A/B lied) |
| breathing filters | the lead and the pads start brighter and darken while held; the piano darkens as it decays; louder notes brighter |
| imperfection | its own generator (`jit`, seed + 99 — the notes stay the same either way): timing ±3–8 ms, velocities ±10–15%, two slow LFOs (0.07 / 0.11 Hz, 3–4 cents) on the tuning of held notes (`drift`) |
| chorus | the pads' bus → two delays (18 / 25 ms, wobbling 3 ms at 0.27 / 0.33 Hz), left and right |
| round bass | a sine (felt) + a dark saw at 0.35 (heard), filter Q 1.2 instead of 5 |
| calm drone | a sine at the root, two quiet saws ±1.5 cents (not ±6–7: that was the beating, the "buzz"), Q 0.7, half the sweep |
| master | `tanh(1.6x)/1.6` saturation (unity when quiet), a high shelf −4 dB at 6.5 kHz, a 28 Hz high-pass |
| reverb | the impulse's noise through a low-pass closing 9 kHz → 1.2 kHz over the tail |

**Strings** (`pluckVoice: "strings"`): Karplus-Strong — a period of noise
circling a delay, averaged each round; computed once per note into a
buffer (`ksString`, cached), played at a corrected rate (the averaging
adds half a sample: pitch = sr / (period + 0.5)).

## Songs (MUSIC, labs 1.6.0)

The other way to play: `MusicKit.SONGS`, chosen in the lab's MUSIC tab
(`setParams({ song: id })`; a mood sets `song: null`). A song is a mood's
sound plus:

- **form** — sections and their bars, by default intro 4, verse 8, chorus
  8, verse 8, chorus 8, bridge 8, chorus 8, outro 4; then the last chord
  rings out and the next song in the list begins (its own tempo, key and
  sound).
- **prog** — a progression per section (scale degrees, cycled), a chord
  every `chordBars` bars (1 or 2); intro and outro play the verse's.
- **arrange** — what plays in each section (`ARRANGE`, overridden per
  song): pads, arp, bells on/off; bass `root8` | `pulse16` | `half`;
  drums `full` | `full16` | `half` | `light`; lead `verse` | `chorus`;
  a crash on the chorus. The last two beats before a section with drums
  are a snare roll.
- **The melody** is composed when the song starts, from the seed
  (`compose`): one cycle of the section's progression, bar by bar on a
  plan — A B A E (A B A C A B A E over 8 bars). An A bar's rhythm and
  shape come back on the next A, moved to fit its chord (a sequence);
  notes on strong beats sit on chord tones, the rest step along the
  scale; the E bar ends on the last chord's root. Verses sit lower with
  busier rhythms, choruses higher with longer notes. Played by
  `leadVoice`: synth (saw + square, glide, late vibrato), soft (sine +
  breath, flute-like), piano.
- `player.song` → `{ id, name, section, bar, bars, part, parts }`.
- **MIDI** (labs 1.7.0): `MusicKit.songMidi(params)` / `player.midi()` →
  a Standard MIDI File (format 1, 480 ticks a beat) of the song with
  these params — the lab's EXPORT MIDI. It walks the same form, chords
  and melody (`composeMelody` with the same seed rule, `songRng`) without
  audio; a track per part with a General MIDI program (`GM`: lead saw /
  flute / piano, pads polysynth / synth brass / church organ / bowed,
  synth bass, harp / square lead for the arp, tubular bells or piano),
  drums on channel 10 (kick 36, snare 38, closed hat 42, crash 49).
  Layers at 0 are left out; chance (bells, the arp's gaps, pickup kicks)
  is rolled again, so those may differ from what was heard; the tempo,
  key and instruments are the lab's current ones.

| Song | Style | Key, tempo | Sound |
|---|---|---|---|
| First light | synth-pop | G major, 112 | brass pads, synth lead, I–V–vi–IV verse |
| Neon heart | 80s ballad | F minor, 76 | brass, piano lead, rain, half-time drums, chords every 2 bars |
| Midnight highway | synthwave | E minor, 104 | 16th-note bass throughout, brass, synth lead |
| Orbit lullaby | piano | D major, 80 | piano lead and chimes, glass pads, no drums |
| Cathedral | organ | A minor, 84 | organ, the ostinato, soft lead, half-time drums in the chorus |
| Escape velocity | drive | D minor, 120 | saws, synth lead, full drums |

## Limits (honest)

- **The voice** is the browser's own speech synthesis. It sits outside the
  audio graph: no effects (no vocoder), not in a recording, and it sounds
  different on each system. The plan for the game: the lines generated
  once into small files and played through a vocoder in the graph.
- **The whispers** are murmuring without words — real words need recordings.
- The moods are generative, not songs (no arc beyond the ostinato's
  growing octave); the songs have a form, but one melody per section kind
  (every verse the same, every chorus the same) and no lyrics.

## Next

- Listen and tune (the user): the moods, the levels, the voice.
- Into the game: the music following the situation (orbit, landing, near the
  black hole, the surface), crossfades. Setup → Sound already exists
  (v2.38.0): music / effects / voice, a switch and a level each — the
  player's master gain is `settings.js#soundLevel("music")` (and "fx",
  "voice"; 0 when switched off).
- The robot's lines as files through a vocoder; maybe recorded whispers.
