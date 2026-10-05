// The sound lab's own script (labs/sound.html): MusicKit's player, its
// panels and a picture of the sound.
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const MK = window.MusicKit;
const player = MK.create({ params: MK.PRESETS.station.params });
const P = player.params;
const paint = LabKit.paintSlider;

// ---------- the panels ----------
MK.NOTES.forEach((n, i) => { const o = document.createElement("option"); o.value = i; o.textContent = n; $("root").appendChild(o); });
Object.entries(MK.SCALES).forEach(([id, s]) => { const o = document.createElement("option"); o.value = id; o.textContent = s.name; $("scale").appendChild(o); });
Object.entries(MK.PRESETS).forEach(([id, p]) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.textContent = p.name.toUpperCase(); b.dataset.id = id;
  b.addEventListener("click", () => { player.setParams(JSON.parse(JSON.stringify(p.params))); showAll(); markPreset(id); });
  $("presets").appendChild(b);
});
function markPreset(id) { [...$("presets").children].forEach((b) => b.classList.toggle("on", b.dataset.id === id)); }
// MUSIC: the songs (MusicKit.SONGS) — a click plays one from its start; at its end the next one begins
Object.entries(MK.SONGS).forEach(([id, s]) => {
  const b = document.createElement("button"); b.className = "tBtn"; b.dataset.id = id;
  b.innerHTML = "<span></span><small></small>"; b.firstChild.textContent = s.name.toUpperCase(); b.lastChild.textContent = s.style;
  b.addEventListener("click", () => {
    player.setParams(Object.assign(JSON.parse(JSON.stringify(s.params)), { song: id }));
    if (!player.playing) toggle();
    showAll(); markPreset(null);
  });
  $("songs").appendChild(b);
});
function showTab(music) {
  $("tabMoods").classList.toggle("on", !music); $("tabMusic").classList.toggle("on", music);
  $("presets").classList.toggle("hidden", music); $("songs").classList.toggle("hidden", !music);
  try { localStorage.setItem("soundLab.tab", music ? "music" : "moods"); } catch (e) { /* blocked */ }
  fitHud();
}
$("tabMoods").addEventListener("click", () => showTab(false));
$("tabMusic").addEventListener("click", () => showTab(true));
const LAYER_NAMES = { drone: "Drone", pads: "Pads", bells: "Bells", pulse: "Pulse", arp: "Arp", texture: "Static", whispers: "Whispers", voice: "Voice",
  lead: "Melody", beat: "Beat", metal: "Metal", bass: "Bass" };
// the instruments: what a layer sounds like (MusicKit.VOICES)
const INSTR_NAMES = { padVoice: "Pads", bellVoice: "Bells", arpMode: "Arp", pluckVoice: "Plucks", textureKind: "Static", droneVoice: "Drone", leadVoice: "Melody" };
Object.entries(MK.VOICES).forEach(([k, opts]) => {
  const r = document.createElement("div"); r.className = "irow";
  r.innerHTML = `<span>${INSTR_NAMES[k]}</span><select class="lab" id="in_${k}"></select>`;
  const sel = r.querySelector("select");
  Object.entries(opts).forEach(([v, label]) => { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); });
  sel.addEventListener("change", () => { player.setParams({ [k]: sel.value }); markPreset(null); });
  $("instruments").appendChild(r);
});
MK.LAYERS.forEach((l) => {
  const r = document.createElement("div"); r.className = "lrow";
  r.innerHTML = `<span>${LAYER_NAMES[l]}</span><input type="range" min="0" max="1" step="0.01" id="lv_${l}"><b id="lv_${l}Val"></b>`;
  $("layers").appendChild(r);
  const s = r.querySelector("input");
  s.addEventListener("input", () => { player.setParams({ levels: { [l]: +s.value } }); showAll(); markPreset(null); });
});
const pct = (v) => Math.round(v * 100) + "%";
const FMT = { tempo: (v) => v + " bpm", density: pct, brightness: pct, space: pct, volume: pct };
Object.keys(FMT).forEach((k) => $(k).addEventListener("input", () => { player.setParams({ [k]: +$(k).value }); showAll(); if (k !== "volume") markPreset(null); }));
$("root").addEventListener("change", () => { player.setParams({ root: +$("root").value }); markPreset(null); });
$("scale").addEventListener("change", () => { player.setParams({ scale: $("scale").value }); markPreset(null); });
$("seed").addEventListener("change", () => player.setParams({ seed: Math.max(1, Math.round(+$("seed").value) || 1) }));
$("btnDice").addEventListener("click", () => { $("seed").value = Math.floor(Math.random() * 99999) + 1; player.setParams({ seed: +$("seed").value }); });
$("lines").addEventListener("input", () => player.setParams({ voiceLines: $("lines").value.split("\n").map((s) => s.trim()).filter(Boolean) }));
$("every").addEventListener("input", () => { player.setParams({ voiceEvery: +$("every").value }); showAll(); });
$("btnSay").addEventListener("click", () => { const L = P.voiceLines; if (L.length) player.say(L[Math.floor(Math.random() * L.length)]); });
// WARM: the natural sound on or off (MusicKit's warm) — to compare
$("btnWarm").addEventListener("click", () => { player.setParams({ warm: !P.warm }); showAll(); });
$("btnCopy").addEventListener("click", () => {
  const text = JSON.stringify(P, (k, v) => typeof v === "number" ? Math.round(v * 1000) / 1000 : v, 1);
  console.log(text);
  (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => { $("btnCopy").textContent = "COPIED ✓"; }, () => { $("btnCopy").textContent = "SEE CONSOLE (F12)"; })
    .then(() => setTimeout(() => { $("btnCopy").textContent = "COPY SETTINGS"; }, 1600));
});
function showAll() {
  Object.keys(FMT).forEach((k) => { const s = $(k); if (document.activeElement !== s) s.value = P[k]; paint(s); $(k + "Val").textContent = FMT[k](P[k]); });
  MK.LAYERS.forEach((l) => { const s = $("lv_" + l); if (document.activeElement !== s) s.value = P.levels[l]; paint(s); $("lv_" + l + "Val").textContent = pct(P.levels[l]); });
  $("root").value = P.root; $("scale").value = P.scale; $("seed").value = P.seed;
  $("btnWarm").textContent = "WARM SOUND: " + (P.warm ? "ON" : "OFF"); $("btnWarm").classList.toggle("on", !!P.warm);
  Object.keys(MK.VOICES).forEach((k) => { $("in_" + k).value = P[k]; });
  if (document.activeElement !== $("lines")) $("lines").value = P.voiceLines.join("\n");
  $("every").value = P.voiceEvery; paint($("every")); $("everyVal").textContent = P.voiceEvery + " s";
}

// ---------- play / stop ----------
function toggle() {
  if (player.playing) player.stop(); else player.start();
  $("btnPlay").classList.toggle("on", player.playing);
  $("btnPlay").textContent = player.playing ? "■ STOP" : "▶ PLAY";
  $("tapHint").style.opacity = player.playing ? 0 : 0.85;
}
$("btnPlay").addEventListener("click", toggle);
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); toggle();
});

// ---------- record ----------
let rec = null, recTimer = 0;
function startRec(limit) {
  if (!player.playing) toggle();
  const chunks = [];
  rec = new MediaRecorder(player.stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "" });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(chunks, { type: "audio/webm" }));
    a.download = "swarm-music-" + (P.song || P.scale) + "-seed" + P.seed + ".webm"; a.click();
    $("recState").textContent = "Saved: " + a.download;
    ["btnRec", "btnRec60"].forEach((id) => $(id).classList.remove("on"));
    $("btnRec").textContent = "● RECORD"; rec = null;
  };
  rec.start(1000);
  const t0 = performance.now();
  recTimer = setInterval(() => {
    const s = Math.round((performance.now() - t0) / 1000);
    $("recState").textContent = "Recording… " + s + " s" + (limit ? " / " + limit : "");
    if (limit && s >= limit) stopRec();
  }, 250);
  $("btnRec").textContent = "■ STOP RECORDING"; $("btnRec").classList.add("on");
}
function stopRec() { clearInterval(recTimer); if (rec && rec.state !== "inactive") rec.stop(); }
$("btnRec").addEventListener("click", () => { if (rec) stopRec(); else startRec(0); });
$("btnRec60").addEventListener("click", () => { if (!rec) { startRec(60); $("btnRec60").classList.add("on"); } });
// MIDI: the chosen song's notes (MusicKit.songMidi) — the same melody for the same seed
$("btnMidi").addEventListener("click", () => {
  const bytes = P.song ? player.midi() : null;
  if (!bytes) { $("recState").textContent = "MIDI is for songs: pick one in MUSIC first."; return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  a.download = "swarm-" + P.song + "-seed" + P.seed + ".mid"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $("recState").textContent = "Saved: " + a.download + " — a track per part (melody, pads, bass, drums…).";
});

// ---------- the picture: stars, a ring of the spectrum, the wave inside ----------
const cv = $("viz"), g = cv.getContext("2d");
const stars = Array.from({ length: 260 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6 }));
let freq = null, wave = null, energy = 0;
function resize() { const pr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * pr; cv.height = innerHeight * pr; g.setTransform(pr, 0, 0, pr, 0, 0); }
window.addEventListener("resize", resize); resize();
let shownSong;
function draw(t) {
  const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2 + 10, R = Math.min(w, h) * 0.2;
  g.fillStyle = "rgba(1,2,10,0.32)"; g.fillRect(0, 0, w, h);
  const an = player.analyser;
  if (an) {
    if (!freq) { freq = new Uint8Array(an.frequencyBinCount); wave = new Uint8Array(an.fftSize); }
    an.getByteFrequencyData(freq); an.getByteTimeDomainData(wave);
    let e = 0; for (let i = 0; i < 64; i++) e += freq[i]; energy += (e / 64 / 255 - energy) * 0.08;
  }
  // stars, breathing with the music
  for (const s of stars) {
    const a = 0.25 + 0.5 * s.z * (0.6 + 0.4 * Math.sin(t / 900 * s.z + s.tw)) + energy * 0.5;
    g.fillStyle = `rgba(200,215,255,${Math.min(1, a)})`; g.fillRect(s.x * w, s.y * h, s.z * 1.6, s.z * 1.6);
  }
  // a soft glow in the middle
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * (1.6 + energy));
  glow.addColorStop(0, `rgba(91,140,255,${0.18 + energy * 0.35})`); glow.addColorStop(0.5, `rgba(54,214,181,${0.06 + energy * 0.12})`); glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  if (freq && player.playing) {
    // the spectrum as a ring of rays, mirrored: the bass at the top, the
    // highs meeting at the bottom
    const bins = 90;
    for (let i = 0; i < bins; i++) {
      const v = freq[Math.floor(Math.pow(i / bins, 1.8) * freq.length * 0.6)] / 255, r0 = R * 1.05, r1 = r0 + v * R * 0.9;
      g.strokeStyle = `hsla(${215 - v * 175}, 85%, ${55 + v * 20}%, ${0.25 + v * 0.75})`; g.lineWidth = 2;
      for (const side of [1, -1]) {
        const a = -Math.PI / 2 + side * (i + 0.5) / bins * Math.PI;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      }
    }
    // the wave, bent into a circle
    g.beginPath();
    for (let i = 0; i <= 256; i++) {
      const v = (wave[Math.floor(i / 256 * (wave.length - 1))] - 128) / 128, a = i / 256 * Math.PI * 2 - Math.PI / 2, r = R * (0.82 + v * 0.35);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.strokeStyle = "rgba(248,187,86,0.8)"; g.lineWidth = 1.6; g.stroke();
  }
  // the ring itself
  g.strokeStyle = "rgba(143,164,255,0.25)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * 1.05, 0, Math.PI * 2); g.stroke();
  // a song moves on by itself: the panels follow
  if (P.song !== shownSong) { shownSong = P.song; showAll(); [...$("songs").children].forEach((b) => b.classList.toggle("on", b.dataset.id === P.song)); }
  const sg = player.song;
  if (sg) $("nowPlaying").innerHTML = `♪ <b>${sg.name}</b> · ${sg.section} · bar ${Math.min(sg.bar, sg.bars)}/${sg.bars} · chord <b>${player.chordName}</b>`;
  else $("nowPlaying").innerHTML = player.playing ? `Playing · chord <b>${player.chordName}</b> · ${MK.SCALES[P.scale].name.split(" ")[0].toLowerCase()} in ${MK.NOTES[P.root]}${Array.isArray(P.progression) && P.progression.length ? " · fixed progression" : ""}` : "Stopped";
  requestAnimationFrame(draw);
}

LabKit.applyGrain();
LabKit.autoHideHud([$("hud"), $("opt")], 8);
function fitHud() { LabKit.fitHud([$("hud"), $("opt")], 0.4, 1.3); }
window.addEventListener("resize", fitHud);
if (document.fonts) document.fonts.ready.then(fitHud);
showAll(); markPreset("station"); fitHud();
try { if (localStorage.getItem("soundLab.tab") === "music") showTab(true); } catch (e) { /* blocked */ }
requestAnimationFrame(draw);
window.soundLab = { player, toggle };
})();
