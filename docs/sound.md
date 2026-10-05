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

- Everything goes through one reverb (an impulse generated from SPACE, 2–8 s)
  and an echo (¾ of a beat, filtered); a compressor on the master.
- The clock schedules events 0.25 s ahead (a 100 ms timer).
- Browsers start audio only after a click: `start()` comes from PLAY.
- MOODS: The station (dorian, D), Deep orbit (lydian, A), Descent
  (minor, E, faster, denser), The black hole (phrygian, C#, slow, dark).

## Limits (honest)

- **The voice** is the browser's own speech synthesis. It sits outside the
  audio graph: no effects (no vocoder), not in a recording, and it sounds
  different on each system. The plan for the game: the lines generated
  once into small files and played through a vocoder in the graph.
- **The whispers** are murmuring without words — real words need recordings.
- It's generative ambient, not a song.

## Next

- Listen and tune (the user): the moods, the levels, the voice.
- Into the game: the music following the situation (orbit, landing, near the
  black hole, the surface), a volume and a mute in Setup, crossfades.
- The robot's lines as files through a vocoder; maybe recorded whispers.
