/* =======================================================================
   MUSICKIT — the game's music, generated live (Web Audio), like ShipKit
   builds the ships: no audio files, parameters and a seed
   =======================================================================
   A classic script (window.MusicKit). The sound lab (labs/sound.html)
   tunes it; the game will play it (docs/sound.md). No dependencies.

   The music is layers over a slow chord progression in one scale:
     drone     two detuned saws and a sub on the root, a slow filter sweep
     pads      the chord, soft saws through a low-pass, crossfading
     bells     sparse FM chimes on the chord's notes, far up, echoing
     pulse     a heartbeat (lub-dub), the station's
     arp       short plucks walking the chord, in some passages only
     texture   radio noise through a wandering band-pass, and crackles
     whispers  wordless murmuring: noise (and a little voice) through the
               formants of vowels, syllable by syllable, panned around
     voice     a robot's announcements (the browser's speech synthesis —
               outside the audio graph: not in a recording, no effects)
   Everything goes through one reverb (an impulse generated from SPACE)
   and an echo; the seed decides the progression, the bells, the phrases —
   the same seed and parameters play the same piece.

   API
     MusicKit.create({ params }) → player
       player.start()             starts (call from a click: browsers need a gesture)
       player.stop()              fades out
       player.setParams(patch)    live: volume, tempo, density, brightness,
                                  space, root, scale, seed, levels.{layer},
                                  voiceLines (array), voiceEvery (seconds)
       player.params, player.playing, player.chordName
       player.analyser            an AnalyserNode (or null before start)
       player.stream              a MediaStream of the music (recording)
       player.say(text)           the robot voice, now
       player.dispose()
     MusicKit.PRESETS             { id: { name, params } }
     MusicKit.LAYERS, SCALES, NOTES
   ======================================================================= */
window.MusicKit = (function () {
"use strict";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = {
  aeolian: { name: "Minor (aeolian)", steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { name: "Lydian (bright, floating)", steps: [0, 2, 4, 6, 7, 9, 11] },
  phrygian: { name: "Phrygian (dark)", steps: [0, 1, 3, 5, 7, 8, 10] },
  suspended: { name: "Suspended (pentatonic)", steps: [0, 2, 5, 7, 10] },
  hirajoshi: { name: "Hirajoshi (strange)", steps: [0, 2, 3, 7, 8] },
};
const LAYERS = ["drone", "pads", "bells", "pulse", "arp", "texture", "whispers", "voice"];
const DEFAULTS = {
  volume: 0.7, tempo: 60, density: 0.5, brightness: 0.45, space: 0.7, root: 2, scale: "aeolian", seed: 1,
  levels: { drone: 0.6, pads: 0.7, bells: 0.5, pulse: 0.25, arp: 0.25, texture: 0.3, whispers: 0.35, voice: 0.6 },
  voiceLines: ["Procedure ready.", "Life detected.", "Orbit stable.", "Swarm online.", "Signal lost.", "Memory: eleven percent."],
  voiceEvery: 45,
};
const PRESETS = {
  station: { name: "The station", params: { tempo: 56, density: 0.4, brightness: 0.4, space: 0.65, root: 2, scale: "dorian",
    levels: { drone: 0.6, pads: 0.75, bells: 0.4, pulse: 0.35, arp: 0.15, texture: 0.35, whispers: 0.4, voice: 0.6 } } },
  orbit: { name: "Deep orbit", params: { tempo: 50, density: 0.35, brightness: 0.5, space: 0.85, root: 9, scale: "lydian",
    levels: { drone: 0.5, pads: 0.8, bells: 0.55, pulse: 0.1, arp: 0.2, texture: 0.25, whispers: 0.3, voice: 0.5 } } },
  descent: { name: "Descent", params: { tempo: 72, density: 0.7, brightness: 0.6, space: 0.55, root: 4, scale: "aeolian",
    levels: { drone: 0.75, pads: 0.6, bells: 0.35, pulse: 0.5, arp: 0.5, texture: 0.5, whispers: 0.25, voice: 0.6 } } },
  abyss: { name: "The black hole", params: { tempo: 44, density: 0.3, brightness: 0.25, space: 1, root: 1, scale: "phrygian",
    levels: { drone: 0.85, pads: 0.55, bells: 0.25, pulse: 0.2, arp: 0, texture: 0.55, whispers: 0.5, voice: 0.4 } } },
};
// the vowels' formants (F1, F2, F3 in Hz), a lightish voice
const VOWELS = [[850, 1220, 2810], [610, 2330, 2990], [350, 2700, 3300], [590, 920, 2710], [400, 1000, 2600], [700, 1500, 2600]];

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clone = (o) => JSON.parse(JSON.stringify(o));

function create(opts = {}) {
  const params = clone(DEFAULTS);
  merge(params, opts.params || {});
  let ctx = null, rand = rng(params.seed);
  const N = {};                     // the graph's fixed nodes
  const live = { pads: [], drone: null, texture: null };
  let timer = null, playing = false, chordName = "";
  const clock = { nextChord: 0, chord: [], chordIdx: 0, nextBeat: 0, beat: 0, arpOn: false, nextWhisper: 0, nextVoice: 0, nextCrackle: 0 };

  function merge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) { dst[k] = dst[k] || {}; merge(dst[k], src[k]); }
      else dst[k] = src[k];
    }
  }

  // ---------- the graph ----------
  function impulse(seconds) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate), r = rng(7);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }
  function noiseBuffer(seconds, pink) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0), r = rng(11);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    N.master = ctx.createGain(); N.master.gain.value = 0;
    N.comp = ctx.createDynamicsCompressor(); N.comp.threshold.value = -18; N.comp.ratio.value = 3;
    N.analyser = ctx.createAnalyser(); N.analyser.fftSize = 2048;
    N.stream = ctx.createMediaStreamDestination();
    N.master.connect(N.comp); N.comp.connect(N.analyser); N.analyser.connect(ctx.destination); N.comp.connect(N.stream);
    // the reverb send and the echo send
    N.reverb = ctx.createConvolver(); N.reverb.buffer = impulse(2 + params.space * 6);
    N.revIn = ctx.createGain(); N.revIn.gain.value = 0.6 + params.space * 0.6;
    N.revIn.connect(N.reverb); N.reverb.connect(N.master);
    N.delay = ctx.createDelay(2); N.delay.delayTime.value = 60 / params.tempo * 0.75;
    N.fb = ctx.createGain(); N.fb.gain.value = 0.45;
    N.dlp = ctx.createBiquadFilter(); N.dlp.type = "lowpass"; N.dlp.frequency.value = 2400;
    N.delIn = ctx.createGain(); N.delIn.gain.value = 0.5;
    N.delIn.connect(N.delay); N.delay.connect(N.dlp); N.dlp.connect(N.fb); N.fb.connect(N.delay); N.dlp.connect(N.master); N.dlp.connect(N.revIn);
    // a bus per layer: dry to the master, wet to the reverb
    N.bus = {};
    LAYERS.forEach((l) => {
      const g = ctx.createGain(); g.gain.value = params.levels[l];
      g.connect(N.master); g.connect(N.revIn);
      N.bus[l] = g;
    });
    N.noise = noiseBuffer(4, false); N.pink = noiseBuffer(6, true);
  }

  // ---------- the music's material ----------
  const steps = () => (SCALES[params.scale] || SCALES.aeolian).steps;
  const rootMidi = () => 36 + params.root;
  // scale degree (can run past one octave) → midi
  function degree(d, base) {
    const s = steps(), n = s.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
    return base + o * 12 + s[i];
  }
  const PROG = [0, 5, 3, 4, 0, 2, 5, 6, 3];
  function nextChord() {
    const s = steps().length;
    const d = PROG[Math.floor(rand() * PROG.length)] % s;
    clock.chordIdx = d;
    const base = rootMidi() + 12;
    // a chord in thirds, sometimes with a seventh or a ninth
    const tones = [d, d + 2, d + 4];
    if (rand() < 0.5) tones.push(d + 6);
    if (rand() < 0.3) tones.push(d + 8);
    clock.chord = tones.map((t) => degree(t, base));
    chordName = NOTES[clock.chord[0] % 12] + (tones.length > 3 ? " (" + tones.length + " notes)" : "");
    clock.arpOn = rand() < 0.5;
  }

  // ---------- the layers ----------
  function startDrone() {
    const t = ctx.currentTime, f = hz(rootMidi());
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160 + params.brightness * 500; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.18, t, 3);
    const oscs = [["sawtooth", 1, -6], ["sawtooth", 1, 7], ["sine", 0.5, 0]].map(([type, mul, cents]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = cents; o.connect(lp); o.start(t); return o;
    });
    // a very slow sweep of the filter
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.025; lfoG.gain.value = 120 + params.brightness * 300;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(t);
    lp.connect(g); g.connect(N.bus.drone);
    live.drone = { oscs, lp, g, lfo };
  }
  function droneFollow() {
    if (!live.drone) return;
    const t = ctx.currentTime, f = hz(rootMidi());
    live.drone.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * (i === 2 ? 0.5 : 1), t, 2));
    live.drone.lp.frequency.setTargetAtTime(160 + params.brightness * 500, t, 1);
  }
  function padChord(t, dur) {
    const fade = Math.min(6, dur * 0.4);
    live.pads.forEach((v) => { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, fade / 3); v.stopAt = t + fade * 2.5; });
    const voices = clock.chord.slice(0, 4).map((m, i) => {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400 + params.brightness * 2600; lp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.07 / Math.sqrt(clock.chord.length), t, fade / 3);
      const pan = ctx.createStereoPanner(); pan.pan.value = (i / 3 - 0.5) * 0.8;
      const oscs = [-8, 8].map((c) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = c + (rand() - 0.5) * 6; o.connect(lp); o.start(t); return o; });
      lp.connect(g); g.connect(pan); pan.connect(N.bus.pads);
      return { oscs, g, stopAt: Infinity };
    });
    live.pads.push(...voices);
  }
  function bell(t) {
    const pool = clock.chord.concat(clock.chord.map((m) => m + 12));
    const m = pool[Math.floor(rand() * pool.length)] + 12, f = hz(m);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), modG = ctx.createGain(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    car.frequency.value = f; mod.frequency.value = f * 3.5; modG.gain.value = f * 2;
    modG.gain.setValueAtTime(f * 2, t); modG.gain.exponentialRampToValueAtTime(1, t + 1.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    pan.pan.value = rand() * 1.6 - 0.8;
    mod.connect(modG); modG.connect(car.frequency); car.connect(g); g.connect(pan); pan.connect(N.bus.bells); pan.connect(N.delIn);
    car.start(t); mod.start(t); car.stop(t + 3.6); mod.stop(t + 3.6);
  }
  function thump(t, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(N.bus.pulse); o.start(t); o.stop(t + 0.45);
  }
  function pluck(t, m) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    o.type = "triangle"; o.frequency.value = hz(m);
    lp.type = "lowpass"; lp.frequency.setValueAtTime(800 + params.brightness * 3000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    pan.pan.value = Math.sin(t * 1.3) * 0.5;
    o.connect(lp); lp.connect(g); g.connect(pan); pan.connect(N.bus.arp); pan.connect(N.delIn);
    o.start(t); o.stop(t + 0.55);
  }
  function startTexture() {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = N.pink; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.12, t, 3);
    src.connect(bp); bp.connect(g); g.connect(N.bus.texture); src.start(t);
    live.texture = { src, bp, g };
  }
  function crackle(t) {
    const src = ctx.createBufferSource(); src.buffer = N.noise; src.playbackRate.value = 0.5 + rand();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500 + rand() * 3000;
    const g = ctx.createGain(), len = 0.004 + rand() * 0.02;
    g.gain.setValueAtTime(0.25 * rand(), t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(hp); hp.connect(g); g.connect(N.bus.texture); src.start(t, rand() * 3); src.stop(t + len + 0.01);
  }
  // a murmured phrase: syllables of filtered noise (and a faint voiced hum)
  function whisper(t) {
    const pan = ctx.createStereoPanner(); pan.pan.value = rand() * 1.4 - 0.7; pan.connect(N.bus.whispers);
    const n = 3 + Math.floor(rand() * 6), pitch = 190 + rand() * 50;
    let at = t;
    for (let k = 0; k < n; k++) {
      const v = VOWELS[Math.floor(rand() * VOWELS.length)], len = 0.12 + rand() * 0.2;
      const src = ctx.createBufferSource(); src.buffer = N.noise; src.playbackRate.value = 1;
      const hum = ctx.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = pitch * (1 + (rand() - 0.5) * 0.08);
      const humG = ctx.createGain(); humG.gain.value = 0.18;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(0.5, at + 0.04); env.gain.setValueAtTime(0.5, at + len);
      env.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.12);
      v.forEach((f, i) => {
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * (1 + (rand() - 0.5) * 0.06); bp.Q.value = 9;
        const fg = ctx.createGain(); fg.gain.value = [1, 0.55, 0.3][i];
        src.connect(bp); hum.connect(humG); humG.connect(bp); bp.connect(fg); fg.connect(env);
      });
      env.connect(pan);
      src.start(at, rand() * 3); hum.start(at); src.stop(at + len + 0.15); hum.stop(at + len + 0.15);
      // a soft "s" now and then
      if (rand() < 0.25) {
        const s = ctx.createBufferSource(); s.buffer = N.noise; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
        const sg = ctx.createGain(); sg.gain.setValueAtTime(0.12, at + len); sg.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.09);
        s.connect(hp); hp.connect(sg); sg.connect(pan); s.start(at + len, rand() * 3); s.stop(at + len + 0.1);
      }
      at += len + 0.06 + rand() * 0.12;
    }
  }
  // the robot voice: the browser's speech synthesis, low and slow
  let voicePick = null;
  function speak(text) {
    if (!window.speechSynthesis || !(params.levels.voice > 0.01)) return;
    if (!voicePick) {
      const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      voicePick = vs.find((v) => /male|david|daniel|george|guy|fred/i.test(v.name) && !/female/i.test(v.name)) || vs[0] || null;
    }
    const u = new SpeechSynthesisUtterance(text);
    if (voicePick) u.voice = voicePick;
    u.rate = 0.82; u.pitch = 0.15; u.volume = Math.min(1, params.levels.voice * params.volume * 1.3);
    speechSynthesis.speak(u);
  }

  // ---------- the clock: events a little ahead ----------
  function tick() {
    const now = ctx.currentTime, ahead = now + 0.25, beat = 60 / params.tempo, lv = params.levels;
    // chords: every 4 bars
    if (clock.nextChord <= ahead) {
      const t = Math.max(now, clock.nextChord), dur = beat * 16;
      nextChord();
      if (lv.pads > 0.01) padChord(t, dur);
      clock.nextChord = t + dur;
    }
    // beats: the pulse, the bells, the arp
    while (clock.nextBeat <= ahead) {
      const t = Math.max(now, clock.nextBeat), b = clock.beat++;
      if (lv.pulse > 0.01 && b % 2 === 0) { thump(t, 0.5); thump(t + beat * 0.28, 0.3); }
      if (lv.bells > 0.01 && rand() < params.density * 0.3) bell(t + rand() * beat * 0.5);
      if (lv.arp > 0.01 && clock.arpOn) {
        const tones = clock.chord, pat = [0, 1, 2, 1, 3 % tones.length, 2, 1, 2];
        for (let s = 0; s < 2; s++) if (rand() < 0.4 + params.density * 0.6) pluck(t + s * beat / 2, tones[pat[(b * 2 + s) % pat.length] % tones.length] + 12);
      }
      clock.nextBeat = t + beat;
    }
    // the texture's band wanders; crackles
    if (live.texture) live.texture.bp.frequency.setTargetAtTime(400 + 2600 * (0.5 + 0.5 * Math.sin(now * 0.07) * Math.sin(now * 0.031)), now, 2);
    if (lv.texture > 0.01 && clock.nextCrackle <= ahead) { crackle(Math.max(now, clock.nextCrackle)); clock.nextCrackle = now + 0.05 + rand() * (1.6 - params.density); }
    // whispers: a phrase now and then
    if (lv.whispers > 0.01 && clock.nextWhisper <= ahead) { whisper(Math.max(now, clock.nextWhisper)); clock.nextWhisper = now + 4 + rand() * (14 - params.density * 9); }
    // the voice
    if (lv.voice > 0.01 && params.voiceLines.length && clock.nextVoice <= now) {
      speak(params.voiceLines[Math.floor(rand() * params.voiceLines.length)]);
      clock.nextVoice = now + params.voiceEvery * (0.6 + rand() * 0.8);
    }
    // the pads that have faded out
    live.pads = live.pads.filter((v) => { if (v.stopAt <= now) { v.oscs.forEach((o) => o.stop()); return false; } return true; });
  }

  // ---------- the player ----------
  let revTimer = 0;
  const player = {
    params,
    get playing() { return playing; },
    get chordName() { return chordName; },
    get analyser() { return N.analyser || null; },
    get stream() { return N.stream ? N.stream.stream : null; },
    start() {
      if (!ctx) build();
      if (ctx.state === "suspended") ctx.resume();
      if (playing) return;
      playing = true;
      rand = rng(params.seed);
      const t = ctx.currentTime;
      clock.nextChord = t + 0.05; clock.nextBeat = t + 0.5; clock.beat = 0;
      clock.nextWhisper = t + 3; clock.nextVoice = t + 8; clock.nextCrackle = t;
      N.master.gain.cancelScheduledValues(t); N.master.gain.setTargetAtTime(params.volume, t, 1.2);
      if (!live.drone && params.levels.drone > 0.01) startDrone();
      if (!live.texture) startTexture();
      timer = setInterval(tick, 100);
      tick();
    },
    stop() {
      if (!playing) return;
      playing = false;
      clearInterval(timer); timer = null;
      const t = ctx.currentTime;
      N.master.gain.cancelScheduledValues(t); N.master.gain.setTargetAtTime(0, t, 0.6);
      if (window.speechSynthesis) speechSynthesis.cancel();
      setTimeout(() => {
        if (playing) return;
        live.pads.forEach((v) => v.oscs.forEach((o) => o.stop())); live.pads = [];
        if (live.drone) { live.drone.oscs.forEach((o) => o.stop()); live.drone.lfo.stop(); live.drone = null; }
        if (live.texture) { live.texture.src.stop(); live.texture = null; }
      }, 3000);
    },
    setParams(patch) {
      const before = { root: params.root, scale: params.scale, seed: params.seed, space: params.space };
      merge(params, patch);
      if (!ctx) return;
      const t = ctx.currentTime;
      if (playing) N.master.gain.setTargetAtTime(params.volume, t, 0.2);
      LAYERS.forEach((l) => N.bus[l].gain.setTargetAtTime(params.levels[l], t, 0.15));
      N.delay.delayTime.setTargetAtTime(60 / params.tempo * 0.75, t, 0.5);
      N.revIn.gain.setTargetAtTime(0.6 + params.space * 0.6, t, 0.3);
      if (before.space !== params.space) { clearTimeout(revTimer); revTimer = setTimeout(() => { N.reverb.buffer = impulse(2 + params.space * 6); }, 250); }
      if (before.seed !== params.seed) rand = rng(params.seed);
      if (before.root !== params.root || before.scale !== params.scale) { clock.nextChord = t; }
      droneFollow();
      if (playing && params.levels.drone > 0.01 && !live.drone) startDrone();
    },
    say(text) { speak(text); },
    dispose() { player.stop(); setTimeout(() => { if (ctx) ctx.close(); ctx = null; }, 3200); },
  };
  return player;
}

return { create, PRESETS, LAYERS, SCALES, NOTES, DEFAULTS };
})();
