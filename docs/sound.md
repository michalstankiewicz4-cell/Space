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

## Limits (honest)

- **The voice** is the browser's own speech synthesis. It sits outside the
  audio graph: no effects (no vocoder), not in a recording, and it sounds
  different on each system. The plan for the game: the lines generated
  once into small files and played through a vocoder in the graph.
- **The whispers** are murmuring without words — real words need recordings.
- It's generative, not a song: no verses, no chorus, no arc beyond the
  ostinato's growing octave.

## Next

- Listen and tune (the user): the moods, the levels, the voice.
- Into the game: the music following the situation (orbit, landing, near the
  black hole, the surface), a volume and a mute in Setup, crossfades.
- The robot's lines as files through a vocoder; maybe recorded whispers.
