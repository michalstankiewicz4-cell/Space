/* =======================================================================
   LabKit — what the ship lab (ship.html) and the body lab (bodies.html)
   share around their models: the panels' grain, slider fills, toggle
   buttons, the HUD's scale, the performance counters and the IMAGE
   EFFECTS render (PostKit). A classic script (window.LabKit) like ShipKit,
   BodyKit and PostKit, so the labs still open straight from disk. Labs
   only — the game doesn't load it. Styles: css/lab.css.
   ======================================================================= */
window.LabKit = (function () {
"use strict";
const $ = (id) => document.getElementById(id);

// The panels' paper grain (--grain in css/lab.css): streaks + blotches of
// tileable value noise, the same idea as the game's css/ui/grain.png.
function applyGrain() {
  let s = 7;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const noise = (cx, cy) => {
    const g = new Float32Array(cx * cy);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const at = (x, y) => g[((y % cy + cy) % cy) * cx + ((x % cx + cx) % cx)];
    return (u, v) => {
      const fx = u * cx, fy = v * cy, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  };
  const streaks = noise(4, 20), blotches = noise(5, 5), N = 160;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d"), img = ctx.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = (streaks(x / N, y / N) - 0.5) * 0.8 + (blotches(x / N, y / N) - 0.5) * 0.7 + (rand() - 0.5) * 0.22;
    const g = Math.max(0, Math.min(255, 128 + n * 60)), i = (y * N + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`);
}

// A range input's gold fill up to its value (css/lab.css reads --fill).
function paintSlider(s) {
  s.style.setProperty("--fill", ((s.value - s.min) / (s.max - s.min) * 100) + "%");
}

// An on/off button (.tBtn): flips state[key], lights up, calls apply(on).
function toggle(id, state, key, apply) {
  const b = $(id);
  b.addEventListener("click", () => { state[key] = !state[key]; b.classList.toggle("on", state[key]); apply(state[key]); });
}

// Soft radial glow sprite texture.
function makeGlow(inner = "rgba(255,255,255,1)", mid = "rgba(255,200,120,0.5)") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d"), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, mid); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// HUD scaling: the panels share one factor (--ui) that follows the WINDOW
// only, never the content — a panel too tall for the window scrolls (CSS
// max-height), so switching tabs or rebuilding a model never resizes the UI
// — and keeps the panels (fixed widths) apart horizontally.
function fitHud(panels, min, max) {
  const w = window.innerWidth, h = window.innerHeight, margin = 16, gap = 24;
  const both = panels.reduce((sum, p) => sum + p.offsetWidth, 0);
  const s = Math.max(min, Math.min(max, Math.min(w / 1500, h / 900) * 1.05, (w - margin * 2 - gap) / both));
  document.documentElement.style.setProperty("--ui", s.toFixed(3));
}

// Performance counters (#statFps, #statMs, #statCpu, #statTris, #statCalls)
// and the FPS graph (#fpsGraph), refreshed every 250 ms.
function perfCounters(renderer) {
  const graph = $("fpsGraph"), gctx = graph.getContext("2d"), hist = new Array(90).fill(0);
  let frames = 0, cpuAcc = 0, last = performance.now();
  function draw() {
    const w = graph.width, h = graph.height;
    gctx.clearRect(0, 0, w, h);
    gctx.strokeStyle = "rgba(95,119,247,0.35)"; gctx.lineWidth = 1;
    for (const f of [30, 60]) { const y = h - f / 75 * h; gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(w, y); gctx.stroke(); }
    const bw = w / hist.length;
    hist.forEach((f, i) => {
      const bh = Math.min(1, f / 75) * h;
      gctx.fillStyle = f >= 50 ? "#f8bb56" : f >= 30 ? "#8ea6fd" : "#d05b69";
      gctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
    });
  }
  return {
    // once a frame: now, and the CPU milliseconds that frame took
    update(now, cpuMs) {
      frames++; cpuAcc += cpuMs;
      const elapsed = now - last;
      if (elapsed < 250) return;
      const fps = frames * 1000 / elapsed;
      $("statFps").textContent = fps.toFixed(0);
      $("statMs").textContent = (elapsed / frames).toFixed(1) + " ms";
      $("statCpu").textContent = (cpuAcc / frames).toFixed(1) + " ms";
      $("statTris").textContent = Math.round(renderer.info.render.triangles).toLocaleString("en-US");
      $("statCalls").textContent = renderer.info.render.calls;
      hist.push(fps); hist.shift(); draw();
      frames = 0; cpuAcc = 0; last = now;
    },
  };
}

// IMAGE EFFECTS (PostKit, shared with the game): the camera's picture, not
// part of the model. PostKit's lab panel owns the switches and presets (a
// preset also sets the render quality: setQuality). render() replaces
// renderer.render; `extra(options)` adds per-lab steps (a sun's flare, a
// black hole's lensing). renderer.info is reset by the caller once a frame
// (several passes are counted together).
function imageEffects({ renderer, scene, camera, panel, effects, setQuality }) {
  const pipe = PostKit.create(renderer);
  renderer.info.autoReset = false;
  const fx = PostKit.labPanel(panel, { effects, setQuality });
  const size = new THREE.Vector3();
  return {
    markCustom: () => fx.markCustom(),
    render(focusPos, focusRadius, extra) {
      fx.tick(performance.now());
      const o = fx.options();
      if (!(o.bloom || o.fxaa || o.filter || o.dof || o.flare || o.lens || o.sharpen || o.rays || o.msaa !== 4)) { renderer.render(scene, camera); return; }
      const dofOn = o.dof && PostKit.sphereOnScreen(camera, focusPos, focusRadius, size, 0.5);
      pipe.render(scene, camera, Object.assign({
        msaa: o.msaa,
        bloom: o.bloom ? { strength: 0.7, threshold: 0.93 } : null,
        fxaa: o.fxaa,
        dof: dofOn ? { amount: 1, size: size.z, strength: 1 } : null,
        filter: o.filter ? { vignette: 0.4, grain: 0.25, aberration: 0.35 } : null,
        sharpen: o.sharpen ? 0.3 : 0,
      }, extra ? extra(o) : null));
    },
  };
}

// The panels fade out after `seconds` without a mouse move, click, scroll
// or key, and come back at the next one (like the game's Setup -> Mouse
// option). Not while the pointer rests on a panel or a field in it has the
// focus (a reader, a typist). Styles: css/lab.css .labIdle.
function autoHideHud(panels, seconds = 5) {
  let last = performance.now(), hidden = false, over = 0;
  const show = () => {
    last = performance.now();
    if (hidden) { hidden = false; panels.forEach((p) => p.classList.remove("labIdle")); }
  };
  ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, show, { capture: true, passive: true }));
  panels.forEach((p) => {
    p.addEventListener("pointerenter", () => { over++; });
    p.addEventListener("pointerleave", () => { over = Math.max(0, over - 1); });
  });
  setInterval(() => {
    if (hidden || over > 0 || performance.now() - last < seconds * 1000) return;
    const a = document.activeElement;
    if (a && panels.some((p) => p.contains(a)) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    hidden = true;
    panels.forEach((p) => p.classList.add("labIdle"));
  }, 250);
}

return { applyGrain, paintSlider, toggle, makeGlow, fitHud, perfCounters, imageEffects, autoHideHud };
})();
