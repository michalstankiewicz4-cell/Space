/* =======================================================================
   SHIPKIT — procedural spaceship models for Swarm Protocol
   =======================================================================
   One classic script (window.ShipKit), shared by the ship lab (ship.html)
   and the game (index.html loads it after Three.js) — not copied between
   them. The lab's viewer is its own <script> in ship.html.

   Dependencies: the global THREE (r128, same as the game) and a DOM
   (<canvas> for texture generation). No OrbitControls, no other libs.

   -----------------------------------------------------------------------
   API (window.ShipKit)
   -----------------------------------------------------------------------
   buildShipModel(id, { detail = 1 })  -> model
       id      "codewing", "scribe" (the drone) or "swarmer" (the swarm ship)
       detail  0.2 .. 2, scales every segment count
               (measured for "codewing": 0.2 ≈ 4.7k tris, 1 ≈ 70k, 2 ≈ 276k)
       model = {
         id, detail,
         group,                 THREE.Group — add it to your scene
         update(t, dt, opts),   call every frame; t = seconds since start,
                                dt = frame delta (s),
                                opts.power 0..1 engine throttle (smooth it
                                yourself), opts.particles false = no exhaust
                                particles (cheap mode for many ships)
         setLights(on),         running/nav lights on/off
         actions,               [{ id, label, kind, enabled }]: the standard set
                                (fire, scan, print, offline — disabled where the
                                ship has no animation for it) + ship extras
         damageEnabled          false if the ship opted out of damage effects
         act(id, on),           run an action / set a toggle
         setDamage(0..1),       procedural damage: scorch marks, smoke, sparks,
                                embers, flickering lights, parts breaking off
         destroyed              true after act("destroy"): the ship blew apart
                                (build a new model to get it back)
         size,                  THREE.Vector3 size of the solid hull (units;
                                plumes/glows/particles excluded)
         radius,                half the size diagonal (units)
       }
   disposeShipModel(model)  removes the group from its parent and frees its
                            geometries + per-model materials (shared cached
                            materials and textures are kept for reuse)
   modelStats(group)        object/figure/triangle/material/texture counts
   SHIP_DEFS                registry; add a ship = push one more entry
   allTextures              Set of every generated texture (anisotropy etc.)
   makePlating / makeBrushed / makeGlow, util.{rng, valueNoise, fbm, ...}
                            generators, reusable for other game objects

   Model conventions: origin at the ship's center, nose along +X, up +Y,
   "codewing" measures 12.06 × 5.78 × 9.76 units (length × height × span). Each model has its own shader uniforms,
   so many instances can animate/throttle independently.

   -----------------------------------------------------------------------
   IN THE GAME (see docs/ship.md "ShipKit in the game")
   -----------------------------------------------------------------------
   buildShipModel(id, { detail, merge: true, fxRoot: scene }) + makeGameHolder
   (model, length) — +Z forward, scaled; effects placed in the scene. The
   game renders like the labs (sRGB output, ACES, scene.environment from
   makeEnvironment()) and skips userData.shipkit objects in its color
   conversion. Mark animated/toggled parts userData.dynamic (mergeStatic).
   Changing this file changes the game: bump js/version.js, CHANGELOG.md
   and the ?v= params in index.html. English comments, no trademarked
   franchise names (CLAUDE.md).
   ======================================================================= */
window.ShipKit = (function () {
"use strict";

// =====================================================================
// Small procedural toolkit: seeded RNG + tileable value noise / fBm.
// =====================================================================
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// Tileable 2D value noise on a (cx × cy) lattice, sampled in [0,1)².
function valueNoise(rand, cx, cy) {
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
}
function fbm(rand, baseX, baseY, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise(rand, baseX << o, baseY << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const n of layers) { sum += n(u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}
// Fill a canvas per-pixel from f(u,v) -> [r,g,b] (0..255).
function paintPixels(ctx, w, h, f) {
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x / w, y / h), i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// =====================================================================
// Hull plating generator: recursively split panels, seams, rivets,
// grime streaks, painted stripes and hull markings. Produces matching
// color / roughness / bump / emissive maps from one layout, so the
// seams that look dark are also grooved and rougher.
// =====================================================================
function makePlating({ size = 1024, seed = 1, base = [150, 156, 170], minPanel = 70, maxPanel = 240,
                       stripes = [], markings = [], windows = [] }) {
  const rand = rng(seed);
  const W = size, H = size;
  const [cCol, col] = canvas(W, H);
  const [cRough, rough] = canvas(W, H);
  const [cBump, bump] = canvas(W, H);
  const [cEmi, emi] = canvas(W, H);

  // 1. base metal: low-frequency mottling + fine grain.
  const mottle = fbm(rand, 4, 4, 5), grain = fbm(rand, 64, 64, 2);
  paintPixels(col, W, H, (u, v) => {
    const m = (mottle(u, v) - 0.5) * 38 + (grain(u, v) - 0.5) * 14;
    return [clamp(base[0] + m, 0, 255), clamp(base[1] + m, 0, 255), clamp(base[2] + m * 1.05, 0, 255)];
  });
  paintPixels(rough, W, H, (u, v) => { const r = 120 + (mottle(u, v) - 0.5) * 60; return [r, r, r]; });
  bump.fillStyle = "#808080"; bump.fillRect(0, 0, W, H);
  emi.fillStyle = "#000"; emi.fillRect(0, 0, W, H);

  // 2. panels (recursive split).
  const panels = [];
  (function split(x, y, w, h, depth) {
    const big = w > maxPanel || h > maxPanel;
    const canSplit = w > minPanel * 2 || h > minPanel * 2;
    if (canSplit && (big || (depth < 5 && rand() < 0.55))) {
      if (w > h ? rand() < 0.8 : rand() < 0.2) {
        const k = Math.round(w * (0.3 + rand() * 0.4));
        if (k >= minPanel && w - k >= minPanel) { split(x, y, k, h, depth + 1); split(x + k, y, w - k, h, depth + 1); return; }
      } else {
        const k = Math.round(h * (0.3 + rand() * 0.4));
        if (k >= minPanel && h - k >= minPanel) { split(x, y, w, k, depth + 1); split(x, y + k, w, h - k, depth + 1); return; }
      }
    }
    panels.push([x, y, w, h]);
  })(0, 0, W, H, 0);

  for (const [x, y, w, h] of panels) {
    const tone = (rand() - 0.5) * 0.18;
    col.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(10,14,24,${-tone})`;
    col.fillRect(x, y, w, h);
    const r = 70 + rand() * 90;
    rough.fillStyle = `rgba(${r},${r},${r},0.55)`; rough.fillRect(x, y, w, h);
    // a few panels get a subtle bevel (raised plate)
    if (rand() < 0.35) {
      const gr = bump.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, "#9a9a9a"); gr.addColorStop(0.1, "#8a8a8a"); gr.addColorStop(0.9, "#8a8a8a"); gr.addColorStop(1, "#777");
      bump.fillStyle = gr; bump.fillRect(x + 3, y + 3, w - 6, h - 6);
    }
  }
  // 3. grime streaks running "down" the hull (along +v)
  for (let i = 0; i < 180; i++) {
    const x = rand() * W, y = rand() * H, len = 30 + rand() * 160, wdt = 2 + rand() * 7;
    const gr = col.createLinearGradient(x, y, x, y + len);
    gr.addColorStop(0, `rgba(20,18,22,${0.10 + rand() * 0.18})`); gr.addColorStop(1, "rgba(20,18,22,0)");
    col.fillStyle = gr; col.fillRect(x, y, wdt, len);
  }
  // 4. seams + rivets
  for (const [x, y, w, h] of panels) {
    col.strokeStyle = "rgba(18,22,32,0.85)"; col.lineWidth = 2.2; col.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    col.strokeStyle = "rgba(255,255,255,0.10)"; col.lineWidth = 1; col.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    bump.strokeStyle = "#1a1a1a"; bump.lineWidth = 3; bump.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    rough.strokeStyle = "#d0d0d0"; rough.lineWidth = 3; rough.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (rand() < 0.7) {
      const step = 13;
      const dot = (px, py) => {
        col.fillStyle = "rgba(40,44,56,0.8)"; col.beginPath(); col.arc(px, py, 1.9, 0, 7); col.fill();
        col.fillStyle = "rgba(255,255,255,0.35)"; col.beginPath(); col.arc(px - 0.5, py - 0.5, 0.9, 0, 7); col.fill();
        bump.fillStyle = "#e8e8e8"; bump.beginPath(); bump.arc(px, py, 2.1, 0, 7); bump.fill();
      };
      for (let px = x + 8; px < x + w - 6; px += step) { dot(px, y + 7); dot(px, y + h - 7); }
      for (let py = y + 8 + step; py < y + h - 6 - step; py += step) { dot(x + 7, py); dot(x + w - 7, py); }
    }
  }
  // 5. painted stripes (full-width bands: rings around a lathe hull)
  for (const s of stripes) {
    col.fillStyle = s.color; col.globalAlpha = 0.92; col.fillRect(0, s.y * H, W, s.h * H); col.globalAlpha = 1;
    // paint wears off a little: re-dust with grain
    for (let i = 0; i < 900; i++) {
      col.fillStyle = `rgba(90,94,104,${rand() * 0.5})`;
      col.fillRect(rand() * W, s.y * H + rand() * s.h * H, 1 + rand() * 3, 1 + rand() * 2);
    }
    rough.fillStyle = "rgba(170,170,170,0.8)"; rough.fillRect(0, s.y * H, W, s.h * H);
  }
  // 6. markings (rotated text)
  for (const m of markings) {
    col.save(); col.translate(m.x * W, m.y * H); col.rotate(m.rot || 0);
    col.font = `600 ${m.size}px "Oswald", "Arial Narrow", sans-serif`;
    col.textAlign = "center"; col.textBaseline = "middle";
    col.fillStyle = m.color; col.globalAlpha = 0.9; col.fillText(m.text, 0, 0); col.restore();
  }
  // 7. lit windows (emissive only)
  for (const wdw of windows) {
    for (let i = 0; i < wdw.count; i++) {
      const x = wdw.x * W - 5, y = (wdw.y + i * wdw.gap) * H;
      col.fillStyle = "#1b2130"; col.fillRect(x - 1, y - 1, 12, 8);
      if (rand() < 0.85) {
        emi.fillStyle = rand() < 0.75 ? "#ffcf8a" : "#9fb6ff"; emi.fillRect(x, y, 10, 6);
        emi.fillStyle = "rgba(255,210,150,0.25)"; emi.fillRect(x - 3, y - 3, 16, 12);
      }
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  };
  return { map: tex(cCol, true), roughnessMap: tex(cRough), bumpMap: tex(cBump), emissiveMap: tex(cEmi, true) };
}

// Brushed metal: anisotropic streaks along v (length), with machined
// ring grooves across it.
function makeBrushed({ size = 512, seed = 3, tint = [175, 180, 192], rings = 6 }) {
  const rand = rng(seed);
  const [c, ctx] = canvas(size, size);
  const streak = fbm(rand, 128, 2, 3), soft = fbm(rand, 8, 4, 3);
  paintPixels(ctx, size, size, (u, v) => {
    const s = (streak(u, v) - 0.5) * 60 + (soft(u, v) - 0.5) * 30;
    return [clamp(tint[0] + s, 0, 255), clamp(tint[1] + s, 0, 255), clamp(tint[2] + s, 0, 255)];
  });
  for (let i = 0; i < rings; i++) {
    const y = (i + 0.5) / rings * size;
    ctx.fillStyle = "rgba(20,22,30,0.7)"; ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, y + 3, size, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
  return t;
}

// Soft radial glow sprite texture.
function makeGlow(inner = "rgba(255,255,255,1)", mid = "rgba(255,200,120,0.5)") {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, mid); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// =====================================================================
// Shared resources (created lazily, cached for the whole page/game)
// =====================================================================
const GOLD = 0xf8bb56, BLUE = 0x5f77f7;
const shadowed = (m) => { m.castShadow = m.receiveShadow = true; return m; };
const allTextures = new Set();     // every generated texture (e.g. to set anisotropy)
const sharedMaterials = new Set(); // cached per ship type, never disposed with a model
const trackTextures = (...ts) => { for (const t of ts) if (t) allTextures.add(t); };
let _glow = null;
function glowTextures() {          // soft sprite textures shared by all ships
  if (_glow) return _glow;
  _glow = {
    engine: makeGlow("rgba(255,255,255,1)", "rgba(140,170,255,0.55)"),
    nav: makeGlow("rgba(255,255,255,1)", "rgba(255,255,255,0.35)"),
    core: makeGlow("rgba(220,230,255,1)", "rgba(95,119,247,0.6)"),
  };
  trackTextures(_glow.engine, _glow.nav, _glow.core);
  return _glow;
}

// Shader factories take U = { uTime, uPower } — one uniform set per built
// model, so every ship instance animates / throttles independently.
function makePlumeMaterial(color, U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPower: U.uPower, uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uPower; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        float along = vUv.y;                       // 1 at the nozzle, 0 at the tail end
        float flick = noise(vec2(vUv.x * 12.0, along * 6.0 - uTime * 9.0));
        float shock = 0.5 + 0.5 * sin(along * 38.0 - uTime * 30.0);   // shock diamonds
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6); // bright core, soft rim
        float a = pow(along, 1.8) * (0.55 + 0.45 * flick) * (0.75 + 0.25 * shock) * edge * uPower;
        vec3 col = mix(uColor, vec3(1.0), pow(along, 5.0) * 0.8);
        gl_FragColor = vec4(col * a * 2.6, 1.0);   // additive: alpha 1, brightness carried by rgb
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function makeCoreMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uOn: U.uOn || { value: 1 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vView; varying vec3 vPos;
      void main(){
        vN = normalize(normalMatrix * normal); vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; varying vec3 vN; varying vec3 vView; varying vec3 vPos;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
        float scan = 0.5 + 0.5 * sin(vPos.y * 40.0 - uTime * 6.0);           // scrolling "data" lines
        float pulse = 0.75 + 0.25 * sin(uTime * 2.3);
        vec3 base = vec3(0.23, 0.33, 0.95), hot = vec3(0.75, 0.85, 1.0);
        vec3 col = mix(base, hot, fres) * (0.6 + 0.5 * scan) * pulse + fres * 0.6;
        gl_FragColor = vec4(col * (0.05 + 0.95 * uOn), 1.0);         // uOn 0 = offline
      }`,
  });
}

function makeParticleMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uPower: U.uPower },
    vertexShader: `
      attribute float life; varying float vLife; uniform float uPower;
      void main(){
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.0 - life) * 70.0 * uPower / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vLife;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * 0.6;
        vec3 col = mix(vec3(1.0, 0.85, 0.6), vec3(0.4, 0.5, 1.0), vLife);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function additiveSprite(map, color = 0xffffff) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
}

// =====================================================================
// SHARED EFFECTS — every ship gets these for free (see buildShipModel):
//   • action helpers a ship can use: laser bolts, a scan wave, glowing
//     text; a ship lists its own actions in `actions` and handles them in
//     `act(id, on)`,
//   • OFFLINE mode (engines and lights off; the ship dims its own parts),
//   • procedural damage: scorch marks, smoke, sparks, embers, flickering
//     lights and, when badly hit, small parts breaking off.
// =====================================================================
let _fxTex = null;
function fxTextures() {             // soft smoke puff + ragged scorch mark, shared
  if (_fxTex) return _fxTex;
  const blob = (seed, fn) => {
    const rand = rng(seed), n = fbm(rand, 5, 5, 4);
    const [c, ctx] = canvas(128, 128), img = ctx.createImageData(128, 128), d = img.data;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const r = Math.hypot(x - 64, y - 64) / 64, i = (y * 128 + x) * 4;
      const [cr, cg, cb, a] = fn(r, n(x / 128, y / 128));
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = clamp(a, 0, 1) * 255;
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  };
  _fxTex = {
    smoke: blob(55, (r, n) => { const a = clamp(1 - r, 0, 1); return [255, 255, 255, a * a * (0.55 + (n - 0.5) * 1.6)]; }),
    scorch: blob(57, (r, n) => [22, 15, 10, (1 - r) * 1.7 - (n - 0.5) * 1.3 - 0.25]),
  };
  trackTextures(_fxTex.smoke, _fxTex.scorch);
  return _fxTex;
}

// Glowing text on a transparent canvas (for the drone's print()), cached.
const _textTex = new Map();
function textTexture(text, color = "#ffb45a") {
  const key = text + color;
  if (_textTex.has(key)) return _textTex.get(key);
  const [c, ctx] = canvas(512, 128);
  ctx.font = '700 72px "Oswald", "Arial Narrow", sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = color; ctx.shadowBlur = 24; ctx.fillStyle = color;
  ctx.fillText(text, 256, 66); ctx.shadowBlur = 0; ctx.fillStyle = "#fff4dc"; ctx.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  _textTex.set(key, t);
  if (_textTex.size > 24) {                    // arbitrary texts: keep the cache small
    const [oldKey, oldTex] = _textTex.entries().next().value;
    _textTex.delete(oldKey); oldTex.dispose();
  }
  return t;
}

// Effects that leave the ship (bolts, scan waves, print clouds) live under
// env.fxRoot when the caller gives one — in the game, the scene, so a
// turning ship doesn't drag its own shots along — otherwise under the
// ship. Positions/directions are given in ship space and converted here;
// sizes and speeds follow the ship's world scale. Objects placed outside
// the ship are remembered in env.owned so disposeShipModel frees them.
function fxHost(ship, env) {
  const root = (env && env.fxRoot) || ship;
  const toRoot = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  return {
    root,
    add(...objs) {
      for (const o of objs) o.userData.shipkit = true;   // authored for sRGB output + tone mapping
      root.add(...objs); if (root !== ship && env) env.owned.push(...objs);
    },
    // ship-space point -> root space (in place); returns ship/root scale ratio
    point(v) {
      ship.updateMatrixWorld(true); root.updateMatrixWorld(true);
      toRoot.copy(root.matrixWorld).invert();
      v.applyMatrix4(ship.matrixWorld).applyMatrix4(toRoot);
      return ship.getWorldScale(a).x / root.getWorldScale(b).x;
    },
    // world-space point -> root space (in place)
    worldPoint(v) { root.updateMatrixWorld(true); return root.worldToLocal(v); },
    // ship-space direction -> root space (in place, normalized)
    dir(v) { return v.transformDirection(ship.matrixWorld).transformDirection(toRoot); },
  };
}

// A pool of laser bolts (glowing rods) plus a muzzle flash.
// fire(origin, dir, target?) launches one: origin and dir in ship space,
// or aimed at `target` (a world-space point) when given; update(dt) moves
// them.
function makeBoltPool(ship, env, color, { count = 12, length = 0.9, radius = 0.045, speed = 28 } = {}) {
  const host = fxHost(ship, env);
  const G = glowTextures();
  const geo = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true);
  geo.rotateZ(-Math.PI / 2); // along +X
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = [], X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat));
    const glow = additiveSprite(G.nav, color);
    glow.scale.setScalar(length * 0.9); g.add(glow);
    g.userData.dynamic = true; // moves on its own: never merged
    g.visible = false; host.add(g);
    pool.push({ g, v: new THREE.Vector3(), age: 0 });
  }
  const flash = additiveSprite(G.engine, color);
  flash.visible = false; host.add(flash);
  let flashT = 0, flashK = 1;
  return {
    fire(origin, dir, target) {
      const b = pool.find((p) => !p.g.visible) || pool[0];
      const o = origin.clone(), k = host.point(o);
      let d;
      if (target) d = host.worldPoint(target.clone()).sub(o).normalize();
      else d = host.dir(dir.clone());
      b.g.visible = true; b.g.scale.setScalar(k);
      b.g.position.copy(o).addScaledVector(d, length * k / 2);
      b.g.quaternion.setFromUnitVectors(X, d);
      b.v.copy(d).multiplyScalar(speed * k); b.age = 0;
      flash.position.copy(o); flash.visible = true; flashT = 1; flashK = k;
    },
    update(dt) {
      for (const b of pool) {
        if (!b.g.visible) continue;
        b.g.position.addScaledVector(b.v, dt);
        if ((b.age += dt) > 1.4) b.g.visible = false;
      }
      if (flash.visible) {
        flashT -= dt * 7; flash.material.opacity = Math.max(0, flashT);
        flash.scale.setScalar((0.4 + (1 - flashT) * 0.9) * flashK);
        if (flashT <= 0) flash.visible = false;
      }
    },
  };
}

// An expanding sensor shell: Fresnel-bright rim with latitude scan lines,
// fading as it grows. start(position, maxRadius), both in ship space.
function makeScanWave(ship, env, color) {
  const host = fxHost(ship, env);
  const uniforms = { uT: { value: 0 }, uColor: { value: new THREE.Color(color) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vN; varying vec3 vView; varying vec3 vP;
      void main(){
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uT; uniform vec3 uColor; varying vec3 vN; varying vec3 vView; varying vec3 vP;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.5);
        float lines = 0.55 + 0.45 * sin(vP.y * 60.0);
        float a = (fres * 0.9 + 0.06) * lines * pow(1.0 - uT, 1.5);
        gl_FragColor = vec4(uColor * a * 1.8, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.userData.dynamic = true;
  mesh.visible = false; host.add(mesh);
  let t = -1, maxR = 8;
  return {
    start(pos, radius = 8) {
      const p = pos.clone(), k = host.point(p);
      mesh.position.copy(p); maxR = radius * k; t = 0; mesh.visible = true;
    },
    update(dt) {
      if (t < 0) return;
      t += dt / 1.7;
      if (t >= 1) { t = -1; mesh.visible = false; return; }
      mesh.scale.setScalar(0.3 + maxR * (1 - Math.pow(1 - t, 3)));
      uniforms.uT.value = t;
    },
  };
}

// Break one mesh into `pieces` chunks: triangles are grouped around
// randomly chosen seed triangles (nearest centroid), each group becomes its
// own mesh centered on itself (so it spins around its own middle), placed
// exactly where that part of the original was. The original is hidden.
function fractureMesh(mesh, pieces, rand) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = g.attributes.position, tris = pos.count / 3;
  const comp = (a, i, k) => a.array[i * a.itemSize + k]; // r128 has no getComponent()
  const cent = new Float32Array(tris * 3);
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
    cent[t * 3 + k] = (comp(pos, t * 3, k) + comp(pos, t * 3 + 1, k) + comp(pos, t * 3 + 2, k)) / 3;
  }
  const seeds = [];
  for (let i = 0; i < pieces; i++) seeds.push(Math.floor(rand() * tris));
  const bucket = new Int32Array(tris), counts = new Array(pieces).fill(0);
  for (let t = 0; t < tris; t++) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pieces; i++) {
      const s = seeds[i];
      const d = (cent[t * 3] - cent[s * 3]) ** 2 + (cent[t * 3 + 1] - cent[s * 3 + 1]) ** 2 + (cent[t * 3 + 2] - cent[s * 3 + 2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    bucket[t] = best; counts[best]++;
  }
  const chunks = [];
  for (let i = 0; i < pieces; i++) {
    if (!counts[i]) continue;
    const cg = new THREE.BufferGeometry(), center = new THREE.Vector3();
    for (const name of Object.keys(g.attributes)) {
      const src = g.attributes[name], n = src.itemSize, out = new Float32Array(counts[i] * 3 * n);
      let w = 0;
      for (let t = 0; t < tris; t++) {
        if (bucket[t] !== i) continue;
        for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) out[w++] = comp(src, t * 3 + v, c);
      }
      cg.setAttribute(name, new THREE.BufferAttribute(out, n));
    }
    for (let t = 0; t < tris; t++) if (bucket[t] === i) center.x += cent[t * 3], center.y += cent[t * 3 + 1], center.z += cent[t * 3 + 2];
    center.divideScalar(counts[i]);
    cg.translate(-center.x, -center.y, -center.z);
    const chunk = new THREE.Mesh(cg, mesh.material);
    chunk.castShadow = chunk.receiveShadow = true;
    chunk.position.copy(center);
    mesh.add(chunk);
    chunks.push(chunk);
  }
  if (g !== mesh.geometry) g.dispose();
  return chunks;
}

// Procedural damage, attached by buildShipModel to every model.
// Damage sites are sampled once (seeded) on the ship's big solid meshes:
// a random triangle, a random point on it, its outward normal. Each site
// carries a scorch decal and an ember glow as children of that mesh (so
// they follow any animation), and emits smoke and spark bursts. Small
// parts are the debris candidates. setDamage(0..1) decides how much of
// it shows; update() animates it.
function createDamageFx(ship, radius) {
  const T = fxTextures(), G = glowTextures(), rand = rng(101);
  ship.updateMatrixWorld(true);
  const toShip = new THREE.Matrix4().copy(ship.matrixWorld).invert();
  const big = [], small = [];
  ship.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position) return;
    const m = o.material;
    if (!m || m.isShaderMaterial || m.transparent || m.blending === THREE.AdditiveBlending) return;
    o.geometry.computeBoundingSphere();
    const s = new THREE.Vector3();
    o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    const r = o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z);
    if (r > radius * 0.3) big.push({ o, r });
    else if (r < radius * 0.12) small.push(o);
  });

  // --- damage sites
  const decalMat = new THREE.MeshBasicMaterial({ map: T.scorch, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4 });
  const sites = [], SITES = 8;
  const pickBig = () => {
    let x = rand() * big.reduce((a, b) => a + b.r, 0);
    for (const b of big) if ((x -= b.r) <= 0) return b.o;
    return big[0].o;
  };
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let i = 0; i < SITES && big.length; i++) {
    const o = pickBig(), g = o.geometry, pos = g.attributes.position, idx = g.index;
    const tri = Math.floor(rand() * (idx ? idx.count : pos.count) / 3);
    const at = (k) => (idx ? idx.getX(tri * 3 + k) : tri * 3 + k);
    va.fromBufferAttribute(pos, at(0)); vb.fromBufferAttribute(pos, at(1)); vc.fromBufferAttribute(pos, at(2));
    let u = rand(), v = rand(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = va.clone().addScaledVector(vb.clone().sub(va), u).addScaledVector(vc.clone().sub(va), v);
    const n = vb.clone().sub(va).cross(vc.clone().sub(va)).normalize();
    if (!isFinite(n.x) || n.lengthSq() === 0) n.set(0, 1, 0);
    if (n.dot(p.clone().sub(g.boundingSphere.center)) < 0) n.negate();
    const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 20), decalMat);
    const size = 0.38 + rand() * 0.34;
    decal.position.copy(p).addScaledVector(n, 0.012);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    decal.userData.size = size; decal.visible = false;
    o.add(decal);
    const ember = additiveSprite(G.engine, 0xff5a1a);
    ember.position.copy(p).addScaledVector(n, 0.05); ember.visible = false;
    o.add(ember);
    sites.push({ o, decal, ember, n, sparkT: rand() * 2, world: new THREE.Vector3(), dir: new THREE.Vector3() });
  }

  // --- smoke: soft grey puffs, normal blending, rising and spreading
  const SMOKE = 180, sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SMOKE * 3), sLife = new Float32Array(SMOKE).fill(1), sAlpha = new Float32Array(SMOKE);
  const sVel = new Float32Array(SMOKE * 3), sRate = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) { sLife[i] = rand(); sRate[i] = 0.25 + rand() * 0.2; }
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute("life", new THREE.BufferAttribute(sLife, 1));
  sGeo.setAttribute("alpha", new THREE.BufferAttribute(sAlpha, 1));
  const smoke = new THREE.Points(sGeo, new THREE.ShaderMaterial({
    uniforms: { uTex: { value: T.smoke } },
    vertexShader: `
      attribute float life; attribute float alpha; varying float vLife; varying float vAlpha;
      void main(){
        vLife = life; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.35 + life * 1.8) * 420.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; varying float vLife; varying float vAlpha;
      void main(){
        float a = texture2D(uTex, gl_PointCoord).a * vAlpha * (1.0 - vLife) * smoothstep(0.0, 0.12, vLife);
        gl_FragColor = vec4(mix(vec3(0.34, 0.31, 0.29), vec3(0.06), vLife), a * 0.95);
      }`,
    transparent: true, depthWrite: false,
  }));
  smoke.frustumCulled = false; ship.add(smoke);

  // --- sparks: short-lived additive points in bursts, with drag
  const SPARKS = 220, kGeo = new THREE.BufferGeometry();
  const kPos = new Float32Array(SPARKS * 3), kLife = new Float32Array(SPARKS).fill(1), kVel = new Float32Array(SPARKS * 3), kRate = new Float32Array(SPARKS);
  kGeo.setAttribute("position", new THREE.BufferAttribute(kPos, 3));
  kGeo.setAttribute("life", new THREE.BufferAttribute(kLife, 1));
  const sparks = new THREE.Points(kGeo, new THREE.ShaderMaterial({
    vertexShader: `
      attribute float life; varying float vLife;
      void main(){
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.0 - life) * 70.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vLife;
      void main(){
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * (1.0 - vLife);
        gl_FragColor = vec4(mix(vec3(1.0, 0.96, 0.8), vec3(1.0, 0.42, 0.08), vLife) * a * 2.0, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false; ship.add(sparks);
  let kNext = 0;
  const burst = (s, n) => {
    for (let j = 0; j < n; j++) {
      const i = kNext = (kNext + 1) % SPARKS;
      kPos[i * 3] = s.world.x; kPos[i * 3 + 1] = s.world.y; kPos[i * 3 + 2] = s.world.z;
      const sp = 1.2 + rand() * 2.2;
      kVel[i * 3] = (s.dir.x + (rand() - 0.5) * 1.4) * sp;
      kVel[i * 3 + 1] = (s.dir.y + (rand() - 0.5) * 1.4) * sp;
      kVel[i * 3 + 2] = (s.dir.z + (rand() - 0.5) * 1.4) * sp;
      kLife[i] = 0; kRate[i] = 1.4 + rand() * 2.2;
    }
  };

  // --- debris: small parts that break off, in a fixed (seeded) order
  for (let i = small.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [small[i], small[j]] = [small[j], small[i]]; }
  const loose = small.slice(0, 6).map((o) => ({ o, off: false }));
  const shipCenter = new THREE.Vector3();

  // --- final destruction: flash, fireball, shockwave, then the ship comes
  // apart — its top-level parts (engines, eye, crown, wings…) fly off whole,
  // the big hull pieces are fractured first. Burning sites stay attached to
  // the chunk they landed on, so the wreckage trails smoke.
  const builtParts = new Set(ship.children);  // snapshot before any effect objects are added below
  const flash = additiveSprite(G.engine, 0xffe2b0), fireballs = [];
  flash.visible = false; ship.add(flash);
  for (let i = 0; i < 7; i++) {
    const f = additiveSprite(G.engine, i % 2 ? 0xff6a1a : 0xffb45a);
    f.visible = false; ship.add(f);
    fireballs.push({ s: f, off: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(radius * 0.8), delay: rand() * 0.35 });
  }
  const shock = makeScanWave(ship, null, 0xff8a3c);
  const flying = [];
  let boomT = -1;
  function breakApart() {
    // parts = children of the group that holds most of the ship (the
    // drone keeps everything in a bobbing `body` group, codewing doesn't)
    const meshCount = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n++; }); return n; };
    let parts = ship.children.filter((c) => builtParts.has(c));   // not the effects added since
    const total = meshCount(ship);
    for (;;) {
      const g = parts.find((c) => !c.isMesh && c.children.length && meshCount(c) > total * 0.5);
      if (!g) break;
      parts = parts.filter((c) => c !== g).concat(g.children.slice());
    }
    parts = parts.filter((o) => (o.isMesh || (o.isGroup && meshCount(o) > 0)) && !o.isPoints && !o.isSprite && o.visible);
    ship.updateMatrixWorld(true);
    const pieces = [];
    for (const o of parts) {
      const solid = o.isMesh && !o.isInstancedMesh && o.material && !o.material.transparent && !o.material.isShaderMaterial;
      let r = 0;
      if (solid) { o.geometry.computeBoundingSphere(); const sc = new THREE.Vector3(); o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc); r = o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z); }
      if (solid && r > radius * 0.3) {
        const chunks = fractureMesh(o, 6 + Math.floor(rand() * 4), rand);
        o.updateMatrixWorld(true);
        for (const s of sites) if (s.o === o) {      // move burning sites onto the nearest chunk
          const lp = s.decal.position;
          let best = chunks[0], bd = Infinity;
          for (const c of chunks) { const d = c.position.distanceToSquared(lp); if (d < bd) { bd = d; best = c; } }
          best.attach(s.decal); best.attach(s.ember); s.o = best;
        }
        for (const c of chunks) { ship.attach(c); pieces.push(c); }
        o.visible = false;
      } else { ship.attach(o); pieces.push(o); }
    }
    const tmpC = new THREE.Vector3();
    for (const o of pieces) {
      new THREE.Box3().setFromObject(o).getCenter(tmpC);
      ship.worldToLocal(tmpC);
      const out = tmpC.lengthSq() > 1e-4 ? tmpC.clone().normalize() : new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      flying.push({ o, v: out.multiplyScalar(0.45 + rand() * 1.0).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.35)),
        spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), spinRate: 0.3 + rand() * 1.5 });
    }
  }

  let damage = 0, active = 0;
  const shipInv = new THREE.Matrix4();
  return {
    explode() {
      if (boomT >= 0) return;
      boomT = 0;
      this.setDamage(1);
      loose.forEach((l) => { l.off = true; l.o.visible = true; });   // no more separate break-offs
      flash.visible = true;
      shock.start(new THREE.Vector3(), radius * 1.8);
      for (const s of sites) { ship.updateMatrixWorld(true); s.decal.getWorldPosition(s.world); ship.worldToLocal(s.world); s.dir.copy(s.world).normalize(); burst(s, 36); }
    },
    get destroyed() { return boomT >= 0; },
    setDamage(d) {
      damage = d;
      active = d <= 0 ? 0 : Math.ceil(d * sites.length);
      sites.forEach((s, i) => {
        const on = i < active;
        s.decal.visible = on;
        s.decal.scale.setScalar(s.decal.userData.size * (0.6 + 0.9 * d));
        s.ember.visible = on && d > 0.45 && i % 2 === 0;
      });
      const wantOff = d >= 0.7 ? Math.round((d - 0.6) / 0.4 * loose.length) : 0;
      loose.forEach((l, i) => {
        if (i < wantOff && !l.off) {          // break off: keep its world pose, fly away
          l.parent = l.o.parent; l.pos = l.o.position.clone(); l.quat = l.o.quaternion.clone(); l.scale = l.o.scale.clone();
          ship.attach(l.o);
          l.v = l.o.position.clone().sub(shipCenter).normalize().multiplyScalar(0.7)
            .add(new THREE.Vector3(rand() - 0.5, rand() - 0.2, rand() - 0.5).multiplyScalar(0.5));
          l.spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
          l.spinRate = 1 + rand() * 3; l.age = 0; l.off = true;
        } else if (i >= wantOff && l.off) {   // repaired: back where it was
          l.parent.add(l.o); l.o.position.copy(l.pos); l.o.quaternion.copy(l.quat); l.o.scale.copy(l.scale);
          l.o.visible = true; l.off = false;
        }
      });
    },
    get damage() { return damage; },
    update(t, dt, particlesOn = true) {
      if (boomT >= 0) {
        const before = boomT;
        boomT += dt;
        if (before < 0.12 && boomT >= 0.12) breakApart();
        flash.material.opacity = Math.max(0, 1 - boomT / 0.9);
        flash.scale.setScalar(radius * (0.8 + 4 * Math.min(1, boomT / 0.35)));
        flash.visible = boomT < 0.9;
        for (const f of fireballs) {
          const k = (boomT - f.delay) / 1.4;
          f.s.visible = k > 0 && k < 1;
          if (!f.s.visible) continue;
          f.s.position.copy(f.off).multiplyScalar(1 + k * 1.5);
          f.s.scale.setScalar(radius * (0.4 + 1.3 * Math.sqrt(k)));
          f.s.material.opacity = (1 - k) * (0.8 + 0.2 * Math.sin(t * 30));
        }
        shock.update(dt);
        const drag = Math.max(0, 1 - dt * 0.18);
        for (const f of flying) {
          f.o.position.addScaledVector(f.v, dt);
          f.v.multiplyScalar(drag);
          f.o.rotateOnAxis(f.spin, f.spinRate * dt);
        }
      }
      shipInv.copy(ship.matrixWorld).invert();
      for (let i = 0; i < active; i++) {                // site positions in ship space
        const s = sites[i];
        s.decal.getWorldPosition(s.world).applyMatrix4(shipInv);
        s.dir.copy(s.n).transformDirection(s.o.matrixWorld).transformDirection(shipInv);
        if (s.ember.visible) s.ember.scale.setScalar(0.35 + 0.25 * Math.sin(t * 17 + i * 3) * Math.sin(t * 7 + i));
        if (damage > 0.25 && (s.sparkT -= dt) <= 0) {
          s.sparkT = 0.12 + rand() * (1.8 - damage * 1.5);
          if (particlesOn) burst(s, 10 + Math.floor(rand() * 18 * damage));
        }
      }
      for (const l of loose) {
        if (!l.off || !l.o.visible || !l.v) continue;
        l.o.position.addScaledVector(l.v, dt);
        l.o.rotateOnAxis(l.spin, l.spinRate * dt);
        if ((l.age += dt) > 6) l.o.visible = false;
      }
      smoke.visible = particlesOn && active > 0;
      sparks.visible = particlesOn && damage > 0.25;
      if (smoke.visible) {
        for (let i = 0; i < SMOKE; i++) {
          sLife[i] += dt * sRate[i];
          if (sLife[i] >= 1) {
            const s = sites[i % SITES];
            sLife[i] -= 1;
            if (!s || i % SITES >= active) { sAlpha[i] = 0; continue; }
            sPos[i * 3] = s.world.x + s.dir.x * 0.05; sPos[i * 3 + 1] = s.world.y + s.dir.y * 0.05; sPos[i * 3 + 2] = s.world.z + s.dir.z * 0.05;
            const sp = 0.25 + rand() * 0.25;
            sVel[i * 3] = s.dir.x * sp + (rand() - 0.5) * 0.12;
            sVel[i * 3 + 1] = s.dir.y * sp + 0.12 + (rand() - 0.5) * 0.12;
            sVel[i * 3 + 2] = s.dir.z * sp + (rand() - 0.5) * 0.12;
            sAlpha[i] = 0.35 + 0.65 * damage;
          }
          sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
        }
        sGeo.attributes.position.needsUpdate = true; sGeo.attributes.life.needsUpdate = true; sGeo.attributes.alpha.needsUpdate = true;
      }
      if (sparks.visible) {
        const drag = Math.max(0, 1 - dt * 1.8);
        for (let i = 0; i < SPARKS; i++) {
          if (kLife[i] >= 1) continue;
          kLife[i] = Math.min(1, kLife[i] + dt * kRate[i]);
          kVel[i * 3] *= drag; kVel[i * 3 + 1] *= drag; kVel[i * 3 + 2] *= drag;
          kPos[i * 3] += kVel[i * 3] * dt; kPos[i * 3 + 1] += kVel[i * 3 + 1] * dt; kPos[i * 3 + 2] += kVel[i * 3 + 2] * dt;
        }
        kGeo.attributes.position.needsUpdate = true; kGeo.attributes.life.needsUpdate = true;
      }
    },
  };
}

// =====================================================================
// SHIP BUILDING BLOCKS — parts and behaviours more than one ship uses.
// A ship definition composes these instead of re-writing them (see
// docs/ship.md "Adding a ship": anything a second ship would need goes
// here, not into the ship).
// =====================================================================

// Solar-cell sheet (texture): a grid of blue cells with bus lines and a silver frame.
function makeSolarCells({ size = 512, seed = 31, cols = 8, rows = 4 } = {}) {
  const rand = rng(seed);
  const W = size, H = size / 2, cw = W / cols, ch = H / rows;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#c9ced8"; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = i * cw + 3, y = j * ch + 3, w = cw - 6, h = ch - 6, k = rand() * 0.18;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, `rgb(${Math.round(34 + k * 120)},${Math.round(56 + k * 140)},${Math.round(130 + k * 200)})`);
    g.addColorStop(1, `rgb(8,16,${Math.round(58 + k * 90)})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(210,220,240,0.35)"; ctx.lineWidth = 1;
    for (let b = 1; b < 4; b++) { ctx.beginPath(); ctx.moveTo(x + w * b / 4, y); ctx.lineTo(x + w * b / 4, y + h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
  return t;
}

// A cylinder spanning from a to b: struts, spokes, booms, antenna feeds.
function strut(a, b, radius, material, segments = 8) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments), material));
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// Segment-count and bevel helpers bound to a build's `detail`.
function detailHelpers(detail) {
  const seg = (n, min = 3) => Math.max(min, Math.round(n * detail));
  const bevel = (t, sz) => ({ bevelEnabled: true, bevelThickness: t, bevelSize: sz, bevelSegments: seg(3, 1) });
  return { seg, bevel };
}

// Engines: a nacelle with a gold intake ring, a nose cone, a lathed bell,
// a glowing throat, an optional heat ring, a shader plume and a glow
// sprite. Built along local +Y and turned so the intake faces +X and the
// exhaust -X. One set per ship: add() builds an engine, update() drives
// every plume/glow from the throttle. `plumeMat` shares one plume material
// between engines (else each gets its own, e.g. per color).
function makeEngineSet(M, U, seg) {
  const G = glowTextures(), engines = [];
  return {
    add(parent, pos, { radius, length, color, plumeMat = null, heatMat = null, taper = 1.08, intake = 0.12,
                       cone = [0.55, 1.2], bell = [0.42, 1.2], plume = 7, glow = 4.2, res = 1 }) {
      const r = radius, sg = (n, min) => seg(n * res, min);
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * taper, length, sg(40, 8), 1), M.engine)));
      const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * intake, sg(16, 4), sg(48, 8)), M.gold));
      ring.rotation.x = Math.PI / 2; ring.position.y = length / 2; g.add(ring);
      const nose = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r * cone[0], r * cone[1], sg(32, 6)), M.dark));
      nose.position.y = length / 2 + r * 0.3; g.add(nose);
      const pts = [], steps = sg(16, 3);
      for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push(new THREE.Vector2(r * (0.72 + bell[0] * t * t), -t * r * bell[1])); }
      const bellMesh = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, sg(48, 8)), M.bell));
      bellMesh.position.y = -length / 2; g.add(bellMesh);
      const throat = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, sg(40, 8)), M.throat);
      throat.rotation.x = Math.PI / 2; throat.position.y = -length / 2 - 0.02; g.add(throat);
      if (heatMat) {
        const heat = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.05, sg(8), sg(48, 8)), heatMat);
        heat.rotation.x = Math.PI / 2; heat.position.y = -length / 2 - r * 0.3; g.add(heat);
      }
      const plumeLen = r * plume;
      const plumeGeo = new THREE.CylinderGeometry(r * 0.95, r * 0.08, plumeLen, sg(32, 8), sg(24, 4), true); // wide at the nozzle
      plumeGeo.translate(0, -plumeLen / 2, 0);
      const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat || makePlumeMaterial(color, U));
      plumeMesh.position.y = -length / 2 - r * 0.2;
      plumeMesh.userData.dynamic = true; // toggled on/off: never merged (see mergeStatic)
      g.add(plumeMesh);
      const sprite = additiveSprite(G.engine, color);
      sprite.scale.setScalar(r * glow); sprite.position.y = -length / 2 - r * 0.4; g.add(sprite);
      engines.push({ sprite, plume: plumeMesh, base: r * glow });
      g.rotation.z = -Math.PI / 2; // local +y (intake) -> +x (forward), exhaust toward -x
      g.position.copy(pos);
      parent.add(g);
      return g;
    },
    update(t, power) {
      for (const e of engines) {
        e.sprite.scale.setScalar(e.base * (0.4 + 0.6 * power) * (0.95 + 0.05 * Math.sin(t * 40)));
        e.plume.visible = power > 0.02;
      }
    },
  };
}

// Exhaust particles: recycled Points streaming back (-X) from each emitter
// { pos: [x, y, z], spread, length }, spread growing with age; `rate` is
// [base, random] lifetimes per second, `grow` how much the cone widens.
// update(dt, power, on, offsetY) — offsetY follows a bobbing body.
function makeExhaust(parent, U, { count, seed, emitters, rate = [0.9, 0.6], grow = 1.4 }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), life = new Float32Array(count), pseed = new Float32Array(count);
  const rand = rng(seed);
  for (let i = 0; i < count; i++) { life[i] = rand(); pseed[i] = rand(); }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("life", new THREE.BufferAttribute(life, 1));
  const points = new THREE.Points(geo, makeParticleMaterial(U));
  points.frustumCulled = false;
  parent.add(points);
  return {
    update(dt, power, on, offsetY = 0) {
      points.visible = on && power > 0.05;
      if (!points.visible) return;
      for (let i = 0; i < count; i++) {
        life[i] += dt * (rate[0] + pseed[i] * rate[1]);
        if (life[i] >= 1) life[i] -= 1;
        const e = emitters[i % emitters.length], l = life[i], spread = e.spread * (0.3 + l * grow), a = pseed[i] * 50 + i;
        pos[i * 3] = e.pos[0] - l * e.length * (0.3 + 0.7 * power);
        pos[i * 3 + 1] = e.pos[1] + Math.cos(a) * spread * pseed[i] + offsetY;
        pos[i * 3 + 2] = e.pos[2] + Math.sin(a) * spread * pseed[i];
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.life.needsUpdate = true;
    },
  };
}

// Navigation lights: glow sprites, "steady" (gentle pulse) or "strobe"
// (short flash; `phase` offsets it). defs: [{ color, pos: [x, y, z], size, kind, phase }]
function makeNavLights(parent, defs) {
  const G = glowTextures();
  const lights = defs.map((d) => {
    const s = additiveSprite(G.nav, d.color);
    s.position.set(d.pos[0], d.pos[1], d.pos[2]); s.scale.setScalar(d.size || 0.6);
    parent.add(s);
    return { s, kind: d.kind || "steady", phase: d.phase || 0 };
  });
  return {
    update(t) {
      for (const n of lights) {
        if (n.kind === "strobe") n.s.material.opacity = ((t * 0.8 + n.phase) % 1) < 0.06 ? 1 : 0.05;
        else n.s.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
      }
    },
    setVisible(on) { for (const n of lights) n.s.visible = on; },
  };
}

// Timed shots for act("fire"): schedule([{ delay, ...data }]) queues them
// relative to the current time; run(t, fn) calls fn(shot) for every one due.
function makeShotQueue() {
  const q = [];
  let now = 0;
  return {
    schedule(shots) { for (const sh of shots) q.push({ ...sh, at: now + sh.delay }); },
    run(t, fn) { now = t; while (q.length && q[0].at <= t) fn(q.shift()); },
  };
}

// Offline state for a ship's own parts: set(on) from act("offline"),
// update(dt) eases a 0..1 "online" level (1 = running) that the ship
// multiplies its glows, spins and emissive strengths by.
function makeOnlineFader(rate = 2) {
  let off = false, level = 1;
  return {
    set(on) { off = !!on; },
    get offline() { return off; },
    update(dt) { level += ((off ? 0 : 1) - level) * Math.min(1, dt * rate); return level; },
  };
}

// =====================================================================
// SHIP DEFINITIONS
// One entry per ship type:
//   id        stable key used by buildShipModel(id)
//   name      display name
//   camera    suggested viewer camera position (viewer only)
//   assets()  creates + caches this type's textures/materials (once)
//   build(detail) -> { group, update(t, dt, opts), setLights(on) } (+ optional
//             actions/act, and setDamage(d) for damage stages of its own)
// `detail` (0.2 .. 2) scales every segment count through seg(), so the
// same definition serves both a close-up hero model and cheap swarm LODs.
// To add a ship: push another entry following the same shape.
// =====================================================================
const SHIP_DEFS = [];

// ---------------------------------------------------------------------
// SP-01 CODEWING
// ---------------------------------------------------------------------
SHIP_DEFS.push({
  id: "codewing",
  name: "SP-01 CODEWING",
  camera: [9.5, 4.2, 11.5],
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 5, base: [156, 162, 176],
      stripes: [{ y: 0.10, h: 0.028, color: "#f8bb56" }, { y: 0.142, h: 0.012, color: "#5f77f7" },
                { y: 0.80, h: 0.02, color: "#5f77f7" }],
      // rotation per side so the text reads upright from both flanks (+z / -z)
      markings: [
        { text: "SP-01", x: 0.07, y: 0.36, rot: -Math.PI / 2, size: 44, color: "#f8bb56" },
        { text: "SP-01", x: 0.57, y: 0.36, rot: Math.PI / 2, size: 44, color: "#f8bb56" },
        { text: "SWARM PROTOCOL", x: 0.93, y: 0.56, rot: -Math.PI / 2, size: 26, color: "#dfe6ff" },
        { text: "SWARM PROTOCOL", x: 0.43, y: 0.56, rot: Math.PI / 2, size: 26, color: "#dfe6ff" },
      ],
      windows: [{ x: 0.0, y: 0.47, count: 9, gap: 0.022 }, { x: 0.5, y: 0.47, count: 9, gap: 0.022 },
                { x: 0.99, y: 0.47, count: 9, gap: 0.022 }],
    });
    const wingTex = makePlating({ seed: 9, size: 1024, base: [118, 124, 140], minPanel: 60, maxPanel: 200,
      stripes: [{ y: 0.0, h: 0.03, color: "#f8bb56" }] });
    for (const k of ["map", "roughnessMap", "bumpMap"]) wingTex[k].repeat.set(0.16, 0.16);
    const brushed = makeBrushed({ seed: 4 });
    brushed.repeat.set(2, 1);
    trackTextures(...Object.values(hullTex), ...Object.values(wingTex), brushed);

    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.018,
        emissiveMap: hullTex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.4,
        metalness: 0.78, roughness: 0.62 }),
      wing: new THREE.MeshStandardMaterial({
        map: wingTex.map, roughnessMap: wingTex.roughnessMap, bumpMap: wingTex.bumpMap, bumpScale: 0.015,
        metalness: 0.8, roughness: 0.6 }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3a404d, metalness: 0.85, roughness: 0.42 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.28 }),
      blueGlow: new THREE.MeshStandardMaterial({ color: 0x223066, emissive: BLUE, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x6f9dff, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
        transparent: true, opacity: 0.55, envMapIntensity: 2.2 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      dish: new THREE.MeshStandardMaterial({ color: 0xd9dde6, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
      reactor: new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: GOLD, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.3 }),
      throat: new THREE.MeshBasicMaterial({ color: 0xbfd0ff }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets(), G = glowTextures();
    const U = { uTime: { value: 0 }, uPower: { value: 1 }, uOn: { value: 1 } }; // per-model shader uniforms
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();

    // ---- 1. Fuselage: lathe of a smooth spline profile, axis along +X.
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -4.25), new THREE.Vector2(0.95, -4.1), new THREE.Vector2(1.18, -3.4),
      new THREE.Vector2(1.24, -1.6), new THREE.Vector2(1.2, 0.4), new THREE.Vector2(1.02, 2.0),
      new THREE.Vector2(0.72, 3.3), new THREE.Vector2(0.38, 4.35), new THREE.Vector2(0.1, 5.05),
      new THREE.Vector2(0.001, 5.2),
    ]).getSpacedPoints(seg(90, 12));
    const hullMat = M.hull.clone(); // per model: its lit windows go dark when offline (shares the textures)
    const fuselage = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, seg(96, 8)), hullMat));
    fuselage.rotation.z = -Math.PI / 2;
    fuselage.scale.set(1, 1, 0.92); // slightly flattened sideways (local z = world z)
    ship.add(fuselage);
    const radiusAt = (y) => { // hull radius at lathe height y (for placing parts)
      for (let i = 1; i < profile.length; i++) {
        if (profile[i].y >= y) {
          const a = profile[i - 1], b = profile[i], t = (y - a.y) / (b.y - a.y || 1);
          return a.x + (b.x - a.x) * t;
        }
      }
      return 0;
    };

    // ---- 2. Greebles: instanced boxes on the hull, aligned to its normal.
    {
      const rand = rng(21), count = Math.round(110 * Math.min(detail, 1.5));
      const g = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.dark, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      let n = 0;
      while (n < count) {
        const y = -3.6 + rand() * 6.2, phi = rand() * Math.PI * 2;
        // keep the flanks with windows/markings clean
        if (Math.abs(Math.cos(phi)) > 0.85 && y > -1 && y < 2.2) continue;
        const r = radiusAt(y);
        const normal = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
        q.setFromUnitVectors(up, normal);
        const s = new THREE.Vector3(0.05 + rand() * 0.16, 0.02 + rand() * 0.05, 0.05 + rand() * 0.24);
        m.compose(normal.clone().multiplyScalar(r + s.y * 0.4).add(new THREE.Vector3(0, y, 0)), q, s);
        g.setMatrixAt(n++, m);
      }
      g.castShadow = g.receiveShadow = true;
      fuselage.add(g);
    }

    // ---- 3. Cockpit canopy (glass half sphere) + gold frame.
    {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, seg(48, 8), seg(24, 4), 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
      canopy.scale.set(1.9, 0.75, 0.9);
      canopy.position.set(2.55, 0.86, 0);
      ship.add(canopy);
      const frame = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, seg(12), seg(64, 8)), M.gold));
      frame.rotation.x = Math.PI / 2; frame.scale.set(1.9, 0.9, 1); frame.position.copy(canopy.position);
      ship.add(frame);
      const spine = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, seg(8), seg(48, 6), Math.PI), M.gold));
      spine.scale.set(1.9, 0.75, 1); spine.position.copy(canopy.position);
      ship.add(spine);
    }

    // ---- 4. Wings: extruded swept shapes with bevels, mirrored.
    const wingShape = (k) => {
      const s = new THREE.Shape();
      s.moveTo(1.2, 0.7 * k); s.lineTo(-1.3, 0.8 * k); s.lineTo(-3.2, 4.6 * k);
      s.lineTo(-3.9, 4.75 * k); s.lineTo(-3.6, 1.0 * k); s.lineTo(-3.4, 0.7 * k); s.lineTo(1.2, 0.7 * k);
      return s;
    };
    for (const side of [1, -1]) {
      const wing = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape(side), { depth: 0.14, steps: 1, ...bevel(0.05, 0.05) }), M.wing));
      wing.rotation.x = Math.PI / 2; // shape y -> world z, extrusion -> world -y
      wing.position.y = -0.08;
      ship.add(wing);
      const edge = new THREE.LineCurve3(new THREE.Vector3(-1.3, -0.15, 0.82 * side), new THREE.Vector3(-3.2, -0.15, 4.62 * side));
      ship.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(edge, seg(20, 2), 0.05, seg(10), false), M.gold)));
      // wingtip pod: cylinder + two hemispheres + cannon
      const pod = new THREE.Group();
      pod.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, seg(24, 6)), M.engine)));
      for (const e of [1, -1]) {
        const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.16, seg(24, 6), seg(12, 3), 0, Math.PI * 2, 0, Math.PI / 2), M.engine));
        cap.position.y = 0.8 * e; if (e < 0) cap.rotation.x = Math.PI;
        pod.add(cap);
      }
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, seg(12)), M.dark));
      barrel.position.y = 1.3; pod.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, seg(8), seg(20, 6)), M.gold);
      muzzle.position.y = 1.85; muzzle.rotation.x = Math.PI / 2; pod.add(muzzle);
      pod.rotation.z = -Math.PI / 2;
      pod.position.set(-3.35, -0.12, 4.72 * side);
      ship.add(pod);
      const fin = new THREE.Shape();
      fin.moveTo(0, 0); fin.lineTo(-0.9, 0); fin.lineTo(-1.1, 0.75); fin.lineTo(-0.75, 0.75); fin.lineTo(0, 0);
      const winglet = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.05, ...bevel(0.02, 0.02) }), M.wing));
      winglet.position.set(-2.75, -0.02, 4.4 * side - 0.025);
      ship.add(winglet);
    }

    // ---- 5. Engines: two nacelles + the main drive (makeEngineSet).
    const engines = makeEngineSet(M, U, seg);
    const nacelle = { radius: 0.52, length: 2.8, color: 0x7f9bff, heatMat: M.blueGlow };
    engines.add(ship, new THREE.Vector3(-3.1, -0.15, 1.75), nacelle);
    engines.add(ship, new THREE.Vector3(-3.1, -0.15, -1.75), nacelle);
    engines.add(ship, new THREE.Vector3(-4.55, 0, 0), { radius: 0.72, length: 1.2, color: 0xffb45a, heatMat: M.blueGlow });
    for (const side of [1, -1]) {
      const pylon = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.9), M.dark));
      pylon.position.set(-2.9, -0.15, 1.15 * side);
      ship.add(pylon);
    }

    // ---- 6. Gyro ring with chase lights (instanced spheres, colors animated).
    const gyro = new THREE.Group();
    gyro.position.set(-0.9, 0, 0);
    gyro.rotation.y = Math.PI / 2; // torus lies in the YZ plane, around the X axis
    ship.add(gyro);
    const spinner = new THREE.Group(); // everything that rotates with the ring
    spinner.userData.dynamic = true;
    gyro.add(spinner);
    const ringR = 2.25;
    spinner.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.11, seg(20, 4), seg(160, 16)), M.engine)));
    for (const z of [0.11, -0.11]) {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.035, seg(8), seg(160, 16)), M.gold);
      trim.position.z = z; spinner.add(trim);
    }
    const LIGHTS = 48;
    const chase = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, seg(10, 4), seg(8, 3)), new THREE.MeshBasicMaterial({ color: 0xffffff }), LIGHTS);
    {
      const m = new THREE.Matrix4();
      for (let i = 0; i < LIGHTS; i++) {
        const a = i / LIGHTS * Math.PI * 2;
        m.makeTranslation(Math.cos(a) * (ringR + 0.12), Math.sin(a) * (ringR + 0.12), 0);
        chase.setMatrixAt(i, m);
        chase.setColorAt(i, new THREE.Color(0x000000));
      }
    }
    spinner.add(chase);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const strut = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, ringR - 1.05, seg(12)), M.dark));
      const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      strut.position.copy(dir.clone().multiplyScalar((ringR + 1.1) / 2)).add(new THREE.Vector3(-0.9, 0, 0));
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ship.add(strut);
    }

    // ---- 7. Logic core: icosahedron crystal + octahedron edge cage + cradle.
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0.35, 1.72, 0);
    ship.add(coreGroup);
    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, detail >= 1.5 ? 1 : 0), makeCoreMaterial(U));
    crystal.userData.dynamic = true;
    coreGroup.add(crystal);
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.55, 0)), new THREE.LineBasicMaterial({ color: GOLD }));
    coreGroup.add(cage);
    const cradle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 0.35, 6), M.gold));
    cradle.position.y = -0.5; coreGroup.add(cradle);
    const coreGlow = additiveSprite(G.core);
    coreGlow.scale.setScalar(1.8); coreGroup.add(coreGlow);

    // ---- 8. Dorsal fin (extruded) + antenna mast (tube along a curve).
    {
      const s = new THREE.Shape();
      s.moveTo(-1.6, 0); s.lineTo(-3.9, 0); s.lineTo(-4.4, 1.5); s.lineTo(-3.7, 1.55); s.lineTo(-1.6, 0);
      const fin = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.12, ...bevel(0.04, 0.04) }), M.wing));
      fin.position.set(0, 0.95, -0.06);
      ship.add(fin);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.9, 2.45, 0), new THREE.Vector3(-4.3, 3.1, 0), new THREE.Vector3(-5.1, 3.35, 0),
      ]);
      ship.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(30, 4), 0.035, seg(8), false), M.dark)));
    }
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, seg(16, 6), seg(12, 4)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    antennaTip.position.set(-5.1, 3.35, 0);
    ship.add(antennaTip);

    // ---- 9. Sensor dish + torus-knot reactor in a glass bulb.
    {
      const mount = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, seg(16, 6)), M.dark));
      mount.position.set(1.2, -1.2, 0); ship.add(mount);
      const dish = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.75, seg(40, 8), seg(16, 3), 0, Math.PI * 2, 0, 0.62), M.dish));
      dish.rotation.x = Math.PI; dish.position.set(1.2, -0.72, 0); ship.add(dish);
      const horn = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, seg(12)), M.gold));
      horn.position.set(1.2, -1.38, 0); horn.rotation.x = Math.PI; ship.add(horn);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, seg(40, 8), seg(24, 4)), M.glass);
      bulb.position.set(-1.9, -1.2, 0); ship.add(bulb);
      const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.25, seg(32, 6)), M.engine));
      collar.position.set(-1.9, -0.85, 0); ship.add(collar);
    }
    const reactor = new THREE.Mesh(new THREE.TorusKnotGeometry(0.17, 0.045, seg(128, 16), seg(12, 3), 2, 3), M.reactor);
    reactor.userData.dynamic = true;
    reactor.position.set(-1.9, -1.22, 0);
    ship.add(reactor);

    // ---- 10. Nose: RCS blocks (dodecahedra) + sensor tip.
    for (const side of [1, -1]) {
      const rcs = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), M.dark));
      rcs.position.set(3.7, 0.05, 0.52 * side); ship.add(rcs);
    }
    const noseTip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9, seg(12)), M.gold));
    noseTip.rotation.z = -Math.PI / 2; noseTip.position.set(5.6, 0, 0); ship.add(noseTip);

    // ---- 11. Navigation lights.
    const nav = makeNavLights(ship, [
      { color: 0x33ff77, pos: [-3.95, -0.1, 4.85], size: 0.7 },
      { color: 0xff3344, pos: [-3.95, -0.1, -4.85], size: 0.7 },
      { color: 0xffffff, pos: [-5.1, 3.35, 0], size: 0.9, kind: "strobe" },
      { color: 0xffffff, pos: [5.2, 0, 0], size: 0.6, kind: "strobe", phase: 0.5 },
    ]);

    // ---- 12. Exhaust particles.
    const exhaust = makeExhaust(ship, U, { count: 420, seed: 77, emitters: [
      { pos: [-4.6, -0.15, 1.75], spread: 0.35, length: 3.85 },
      { pos: [-4.6, -0.15, -1.75], spread: 0.35, length: 3.85 },
      { pos: [-5.4, 0, 0], spread: 0.5, length: 5.5 },
    ] });

    // ---- actions: alternating shots from the wingtip cannons, a sensor
    // ping from the dish. Offline: core, windows and gyro wind down.
    const bolts = makeBoltPool(ship, env, 0x9fb6ff, { count: 12, length: 1.1, radius: 0.05, speed: 34 });
    const wave = makeScanWave(ship, env, 0x7f95ff);
    const actions = [
      { id: "fire", label: "FIRE CANNONS", kind: "trigger" },
      { id: "scan", label: "SENSOR PING", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue();
    const muzzle = new THREE.Vector3(), forward = new THREE.Vector3(1, 0, 0);
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      // act("fire", { target }) aims at a world-space point; without one, straight ahead
      if (id === "fire") shots.schedule([0, 1, 2, 3].map((i) => ({ delay: i * 0.14, side: i % 2 ? -1 : 1, target: on && on.target })));
      if (id === "scan") wave.start(new THREE.Vector3(1.2, -1.4, 0), 13);
    }

    // ---- animation
    const tmpColor = new THREE.Color(), chaseBlue = new THREE.Color(0x7f95ff), chaseGold = new THREE.Color(GOLD);
    // t: seconds since start, dt: frame delta (s),
    // opts.power: engine throttle 0..1 (caller may smooth it),
    // opts.particles: false to skip the exhaust particles (cheap LOD).
    function update(t, dt, { power: throttle = 1, particles: particlesOn = true } = {}) {
      const online = power.update(dt);
      U.uOn.value = online;
      hullMat.emissiveIntensity = 1.4 * online;
      U.uTime.value = t;
      U.uPower.value = throttle * (0.92 + 0.08 * Math.sin(t * 37.0) * Math.sin(t * 11.0)); // flicker
      spinner.rotation.z += dt * 0.5 * online;
      shots.run(t, (sh) => bolts.fire(muzzle.set(-1.45, -0.12, 4.72 * sh.side), forward, sh.target));
      bolts.update(dt); wave.update(dt);
      for (let i = 0; i < LIGHTS; i++) {
        const p1 = ((i / LIGHTS - t * 0.35) % 1 + 1) % 1, p2 = ((i / LIGHTS - t * 0.35 + 0.5) % 1 + 1) % 1;
        const k = Math.max(Math.pow(1 - p1, 10), Math.pow(1 - p2, 10));
        tmpColor.copy(i % 6 === 0 ? chaseGold : chaseBlue).multiplyScalar(0.12 + 1.6 * k);
        chase.setColorAt(i, tmpColor);
      }
      chase.instanceColor.needsUpdate = true;

      crystal.rotation.y += dt * 0.8 * online; crystal.rotation.x += dt * 0.3 * online;
      cage.rotation.y -= dt * 0.5 * online; cage.rotation.z += dt * 0.2 * online;
      coreGlow.material.opacity = (0.7 + 0.3 * Math.sin(t * 2.3)) * online;
      reactor.rotation.x += dt * 1.2 * online; reactor.rotation.y += dt * 0.7 * online;

      engines.update(t, throttle);
      nav.update(t);
      antennaTip.material.color.setScalar(((t * 0.8) % 1) < 0.06 ? 1 : 0.25);
      exhaust.update(dt, throttle, particlesOn);
    }
    function setLights(on) { nav.setVisible(on); chase.visible = on; }
    return { group: ship, update, setLights, actions, act };
  },
});


// ---------------------------------------------------------------------
// DR-01 SCRIBE — the programmable drone
// ---------------------------------------------------------------------
// Meant to replace the game's plain gold octahedron, so it keeps that
// identity: a gold, faceted octahedral hull. Around it: a bevelled belt
// (extruded shape with a hole), four gimballed thruster pods on curved
// arms, a shader "eye" at the nose, a crown with a ring of scrolling
// program code (it runs the player's scripts), a solar wing that tracks
// the light, fuel tanks with a live gauge, and the laser "print" emitter
// under the belly (the in-game print() writes text into a gas cloud with
// a laser). Nose along +X like every ShipKit model.

// A horizontal strip of program text (the drone's own language), for a
// scrolling additive band. Tiles horizontally.
function makeCodeBand({ seed = 41 } = {}) {
  const rand = rng(seed);
  const [c, ctx] = canvas(1024, 64);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1024, 64);
  const words = ["move(10)", "turn(90)", "attack()", "while (fuel() > 10)", "if (nearPlanet())", "repeat (4)",
                 "print(\"...\")", "def side(l)", "return x * x", "wait(1)", "x = x + 1", "{", "}", "0110 1001"];
  ctx.font = '500 24px "IBM Plex Mono", "Courier New", monospace';
  ctx.textBaseline = "middle";
  for (let x = 10; x < 990;) {
    const w = words[Math.floor(rand() * words.length)];
    ctx.fillStyle = rand() < 0.2 ? "#f8bb56" : "#4fe3c6";
    ctx.globalAlpha = 0.55 + rand() * 0.45;
    ctx.fillText(w, x, 32);
    x += ctx.measureText(w).width + 26;
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  return t;
}

// The optic: concentric iris rings and spokes in polar coordinates around
// the eye's +X axis, a dark pupil with a hot rim, and a Fresnel sheen.
function makeEyeMaterial(U) {
  return new THREE.ShaderMaterial({
    // uOn: brightness (offline dims it), uFlare: firing flash, uScan: teal while scanning
    uniforms: { uTime: U.uTime, uOn: { value: 1 }, uFlare: { value: 0 }, uScan: { value: 0 } },
    vertexShader: `
      varying vec3 vP; varying vec3 vN; varying vec3 vView;
      void main(){
        vP = normalize(position);
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; uniform float uFlare; uniform float uScan;
      varying vec3 vP; varying vec3 vN; varying vec3 vView;
      void main(){
        float ang = acos(clamp(vP.x, -1.0, 1.0));             // 0 at the pupil's center
        float phi = atan(vP.z, vP.y);
        float rings = 0.5 + 0.5 * sin(ang * 30.0 - uTime * 3.0);
        float spokes = 0.5 + 0.5 * sin(phi * 24.0 + uTime * 0.5);
        float iris = smoothstep(0.95, 0.5, ang);
        float pupil = smoothstep(0.14, 0.2, ang);
        vec3 amber = vec3(1.0, 0.68, 0.24), teal = vec3(0.25, 0.9, 0.8);
        vec3 irisCol = mix(amber, teal, smoothstep(0.25, 0.85, ang)) * (0.6 + 0.4 * rings) * (0.85 + 0.15 * spokes);
        irisCol = mix(irisCol, teal * 1.4, uScan * 0.85);
        vec3 col = mix(vec3(0.02, 0.025, 0.035), irisCol * 1.5, iris) * pupil;
        col += (1.0 - smoothstep(0.0, 0.05, abs(ang - 0.18))) * mix(amber, teal, uScan) * 1.4;  // hot pupil rim
        col += uFlare * vec3(1.0, 0.85, 0.55) * (1.0 - smoothstep(0.0, 1.0, ang)) * 1.6;
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.0);
        col = col * uOn + fres * vec3(0.9, 0.8, 0.6) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The print laser: moving dashes along the beam, bright where it faces the
// camera. Additive, so alpha 1 and the intensity rides in RGB (see the
// plume gotcha in docs/ship.md). uOn fades it in and out.
function makeBeamMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uOn: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 2.0);
        float dash = step(0.35, fract(vUv.y * 14.0 - uTime * 6.0));
        float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        float a = edge * (0.55 + 0.45 * dash) * fade * uOn;
        gl_FragColor = vec4(vec3(1.0, 0.45, 0.2) * a * 2.4 + vec3(a * edge * 0.7), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

SHIP_DEFS.push({
  id: "scribe",
  name: "DR-01 SCRIBE",
  camera: [5.6, 3.3, 6.8],
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 13, size: 1024, base: [208, 160, 78], minPanel: 60, maxPanel: 200,
      stripes: [{ y: 0.30, h: 0.018, color: "#5f77f7" }, { y: 0.70, h: 0.018, color: "#5f77f7" }],
    });
    for (const k of ["map", "roughnessMap", "bumpMap", "emissiveMap"]) hullTex[k].repeat.set(2, 2);
    const brushed = makeBrushed({ seed: 8, tint: [168, 172, 184], rings: 4 });
    const solar = makeSolarCells({});
    const code = makeCodeBand({});
    code.repeat.set(2, 1);
    trackTextures(...Object.values(hullTex), brushed, solar, code);

    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.02,
        metalness: 0.75, roughness: 0.5, flatShading: true }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.3 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x353a46, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.26 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      throat: new THREE.MeshBasicMaterial({ color: 0xffd7a0 }),
      solar: new THREE.MeshStandardMaterial({ map: solar, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide }),
      code: new THREE.MeshBasicMaterial({ map: code, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide }),
      gauge: new THREE.MeshStandardMaterial({ color: 0x0a3a32, emissive: 0x4fe3c6, emissiveIntensity: 2.2 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0x0a2a26, emissive: 0x4fe3c6, emissiveIntensity: 1.8,
        metalness: 0.2, roughness: 0.2, flatShading: true }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets(), G = glowTextures();
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();
    const body = new THREE.Group(); // everything bobs gently while hovering
    body.userData.dynamic = true;   // animated: merged as its own unit (see mergeStatic)
    ship.add(body);

    // ---- 1. Hull: an octahedron stretched along X, flat-shaded facets.
    // Nearly regular, slightly longer than tall and wide, like the game's
    // drone. Half extents: L (nose at +L), H (up), W (sideways); the hull's
    // section at height y is a rhombus (L, W)·(1 - |y|/H).
    const L = 1.5, H = 1.35, W = 1.15;
    const hullGeo = new THREE.OctahedronGeometry(1, 0);
    hullGeo.scale(L, H, W);
    body.add(shadowed(new THREE.Mesh(hullGeo, M.hull)));
    const V = [new THREE.Vector3(L, 0, 0), new THREE.Vector3(-L, 0, 0), new THREE.Vector3(0, 0, W), new THREE.Vector3(0, 0, -W)];
    const TOP = new THREE.Vector3(0, H, 0), BOTTOM = new THREE.Vector3(0, -H, 0);

    // ---- 2. Edge frame: one InstancedMesh of cylinders, each aligned to a
    // hull edge (matrix = midpoint + rotation from +Y to the edge + length).
    {
      const edges = [];
      for (const v of V) edges.push([v, TOP], [v, BOTTOM]);
      const frame = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, seg(10, 4)), M.gold, edges.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      edges.forEach(([a, b], i) => {
        const dir = b.clone().sub(a), len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
        frame.setMatrixAt(i, m);
      });
      frame.castShadow = frame.receiveShadow = true;
      body.add(frame);
      for (const p of [TOP, BOTTOM]) {
        const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.1, seg(16, 6), seg(12, 4)), M.gold));
        cap.position.copy(p); body.add(cap);
      }
    }

    // ---- 3. Belt: an extruded rhombus with a rhombus hole, bevelled,
    // around the waist; hex bolts along it (instanced).
    {
      const outer = new THREE.Shape();
      outer.moveTo(1.74, 0); outer.lineTo(0, 1.34); outer.lineTo(-1.74, 0); outer.lineTo(0, -1.34); outer.lineTo(1.74, 0);
      const hole = new THREE.Path();
      hole.moveTo(1.44, 0); hole.lineTo(0, -1.1); hole.lineTo(-1.44, 0); hole.lineTo(0, 1.1); hole.lineTo(1.44, 0);
      outer.holes.push(hole);
      const beltGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.12, steps: 1, ...bevel(0.04, 0.04) });
      beltGeo.translate(0, 0, -0.06);
      const belt = shadowed(new THREE.Mesh(beltGeo, M.gold));
      belt.rotation.x = Math.PI / 2; // shape y -> world z
      body.add(belt);
      const count = seg(40, 12);
      const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6), M.dark, count);
      const m = new THREE.Matrix4(), corners = [[1.6, 0], [0, 1.23], [-1.6, 0], [0, -1.23]];
      for (let i = 0; i < count; i++) {
        const f = i / count * 4, k = Math.floor(f), t = f - k;
        const a = corners[k], b = corners[(k + 1) % 4];
        m.makeTranslation(a[0] + (b[0] - a[0]) * t, 0.11, a[1] + (b[1] - a[1]) * t);
        bolts.setMatrixAt(i, m);
      }
      body.add(bolts);
    }

    // ---- 4. Thruster pods on curved arms (tube along a Catmull-Rom curve),
    // each pod gimballed so it can swivel; the engine itself is makeEngineSet's.
    const pods = [], engines = makeEngineSet(M, U, seg), plumeMat = makePlumeMaterial(0xffb45a, U);
    const podDefs = [[0.8, 0.69, 0.9], [0.8, -0.69, 0.9], [-0.9, 0.61, -1.3], [-0.9, -0.61, -1.3]]; // [anchorX, anchorZ, podX]
    for (const [ax, az, px] of podDefs) {
      const side = Math.sign(az), podPos = new THREE.Vector3(px, 0.18, 2.0 * side);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ax, 0, az), new THREE.Vector3((ax + px) / 2, 0.4, 1.45 * side), podPos.clone(),
      ]);
      body.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(24, 4), 0.075, seg(10, 4), false), M.dark)));
      const sleeve = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, seg(8), seg(20, 6)), M.gold));
      const sp = curve.getPoint(0.5), st = curve.getTangent(0.5);
      sleeve.position.copy(sp); sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), st);
      body.add(sleeve);

      const gimbal = new THREE.Group();
      gimbal.userData.dynamic = true;
      gimbal.position.copy(podPos);
      body.add(gimbal);
      engines.add(gimbal, new THREE.Vector3(), { radius: 0.2, length: 0.85, color: 0xffb45a, plumeMat, taper: 1.1, intake: 0.14,
        cone: [0.6, 1.3], bell: [0.45, 1.3], plume: 8, glow: 4.5, res: 0.75 });
      pods.push({ gimbal, phase: pods.length * 1.7, side });
    }

    // ---- 5. The eye: a shader optic in a gold collar at the nose.
    const eyeMount = new THREE.Group();
    // Far enough forward that the sphere swallows the belt's pointed tip
    // (outer rhombus reaches x = 1.74), which otherwise pokes through the iris.
    eyeMount.position.set(L + 0.12, 0, 0);
    body.add(eyeMount);
    const eyeMat = makeEyeMaterial(U);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.38, seg(40, 10), seg(28, 8)), eyeMat);
    eye.userData.dynamic = true;
    eyeMount.add(eye);
    const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.065, seg(12, 4), seg(40, 8)), M.gold));
    collar.rotation.y = Math.PI / 2; collar.position.x = -0.08;
    eyeMount.add(collar);

    // ---- 6. Crown: a crystal floating in a ring of scrolling program code.
    const crown = new THREE.Group();
    crown.position.copy(TOP);
    body.add(crown);
    // per-model copies (sharing textures) so one drone going offline dims only itself
    const codeMat = M.code.clone(), crystalMat = M.crystal.clone(), gaugeMat = M.gauge.clone();
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, seg(48, 12), 1, true), codeMat);
    halo.userData.dynamic = true;
    halo.position.y = 0.36; crown.add(halo);
    for (const y of [0.2, 0.52]) {
      const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, seg(6, 3), seg(48, 12)), M.gold));
      rim.rotation.x = Math.PI / 2; rim.position.y = y; crown.add(rim);
    }
    const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), crystalMat);
    crystal.userData.dynamic = true;
    crystal.position.y = 0.36; crown.add(crystal);
    const crownGlow = additiveSprite(G.core, 0x4fe3c6);
    crownGlow.scale.setScalar(1.1); crownGlow.position.y = 0.36; crown.add(crownGlow);

    // ---- 7. Solar wing on a mast: a hinge bar with two cell panels that
    // slowly track the light.
    const wing = new THREE.Group();
    wing.position.set(-0.75, H * 0.5, 0);
    body.add(wing);
    const mast = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, seg(12, 6)), M.dark));
    mast.position.y = 0.25; wing.add(mast);
    const hinge = new THREE.Group();
    hinge.userData.dynamic = true;
    hinge.position.y = 0.52; wing.add(hinge);
    const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.7, seg(10, 4)), M.gold));
    bar.rotation.x = Math.PI / 2; hinge.add(bar);
    for (const s of [1, -1]) {
      const panel = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.46), M.solar));
      panel.rotation.x = -Math.PI / 2; panel.rotation.z = Math.PI / 2;
      panel.position.z = 0.78 * s; hinge.add(panel);
    }

    // ---- 8. Fuel tanks: lathed capsules under the waist, each with a glowing
    // gauge whose length follows the fuel level.
    const gauges = [];
    for (const s of [1, -1]) {
      const cap = [], R = 0.19, half = 0.45, n = seg(8, 3);
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; cap.push(new THREE.Vector2(Math.cos(a) * R + 0.0001, -half + Math.sin(a) * R)); }
      for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; cap.push(new THREE.Vector2(Math.cos(a) * R + 0.0001, half + Math.sin(a) * R)); }
      const tank = shadowed(new THREE.Mesh(new THREE.LatheGeometry(cap, seg(24, 8)), M.engine));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(-0.1, -0.75, 0.55 * s);
      body.add(tank);
      const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), gaugeMat);
      gauge.geometry.translate(0.45, 0, 0); // grows from its left end
      gauge.position.set(-0.55, -0.75, (0.55 + 0.19) * s);
      body.add(gauge);
      gauge.userData.dynamic = true;
      gauges.push(gauge);
    }

    // ---- 9. The print laser: a turret under the belly with a swept beam and
    // a glowing hit point at its end.
    const turret = new THREE.Group();
    turret.position.copy(BOTTOM);
    body.add(turret);
    turret.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2, seg(24, 8), seg(16, 6)), M.dark)));
    const emitter = new THREE.Group();
    emitter.userData.dynamic = true;
    turret.add(emitter);
    const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.4, seg(12, 6)), M.gold));
    barrel.position.y = 0.2; emitter.add(barrel);
    const beamLen = 2.2, beamMat = makeBeamMaterial(U);
    const beamGeo = new THREE.CylinderGeometry(0.022, 0.022, beamLen, seg(12, 6), 1, true);
    beamGeo.translate(0, beamLen / 2 + 0.4, 0);
    emitter.add(new THREE.Mesh(beamGeo, beamMat));
    const hit = additiveSprite(G.engine, 0xff7a45);
    hit.position.y = beamLen + 0.4; hit.scale.setScalar(0.7); emitter.add(hit);
    const aimDown = -Math.PI / 2 - 0.35; // +y turned forward (+x) and a little down

    // ---- 10. Sensor sweep: a dashed ring around the drone.
    const ringPts = [];
    for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0)); }
    const sweep = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineDashedMaterial({ color: 0x4fe3c6, dashSize: 0.2, gapSize: 0.14, transparent: true, opacity: 0.55 }));
    sweep.computeLineDistances();
    sweep.rotation.x = 0.28;
    ship.add(sweep);

    // ---- 11. Navigation lights.
    const nav = makeNavLights(body, [
      { color: 0x33ff77, pos: [-1.5, 0.4, 2.0], size: 0.55 },
      { color: 0xff3344, pos: [-1.5, 0.4, -2.0], size: 0.55 },
      { color: 0xffffff, pos: [-L - 0.15, 0, 0], size: 0.7, kind: "strobe" },
      { color: 0xffffff, pos: [0, H + 0.62, 0], size: 0.5, kind: "strobe", phase: 0.5 },
    ]);

    // ---- 12. Exhaust particles from the four pods.
    const exhaust = makeExhaust(ship, U, { count: 240, seed: 91, rate: [1.1, 0.7], grow: 1.6,
      emitters: podDefs.map((d) => ({ pos: [d[2] - 0.65, 0.18, 2.0 * Math.sign(d[1])], spread: 0.18, length: 2.2 })) });

    // ---- actions: laser bolts from the eye, a scan wave from the crown,
    // and print() — the belly laser writes a word into a cloud of gas, like
    // the game's print(). Offline: the drone sinks and lists, its eye, code
    // ring ("switched-off lettering"), crystal and gauges go dark.
    const bolts = makeBoltPool(ship, env, 0xffb45a, { count: 10, length: 0.7, radius: 0.04 });
    const wave = makeScanWave(ship, env, 0x4fe3c6);
    const host = fxHost(ship, env);
    const cloudMat = new THREE.SpriteMaterial({ map: fxTextures().smoke, color: 0xd8d2c8, transparent: true, depthWrite: false, opacity: 0 });
    const cloud = new THREE.Sprite(cloudMat);
    const word = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture("HELLO"), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    cloud.visible = word.visible = false;
    host.add(cloud, word);
    const actions = [
      { id: "fire", label: "FIRE LASER", kind: "trigger" },
      { id: "scan", label: "SCAN", kind: "trigger" },
      { id: "print", label: "PRINT", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue();
    let scanT = 0, printT = -1, flareT = 0, placed = false;
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;                              // a switched-off drone does nothing
      // act("fire", { target }): world-space aim point, else along the eye's gaze
      if (id === "fire") shots.schedule([0, 0.14, 0.28].map((delay) => ({ delay, tg: on && on.target })));
      if (id === "scan") { scanT = 2.2; wave.start(new THREE.Vector3(0, H + 0.36, 0).add(body.position), 9); }
      // act("print", { text }) writes that text (default HELLO)
      if (id === "print" && printT < 0) {
        printT = 0;
        word.material.map = textTexture(on && on.text ? String(on.text).slice(0, 24) : "HELLO");
      }
    }
    const tmp = new THREE.Vector3(), eyeDir = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpR = new THREE.Vector3();
    let printK = 1;

    // ---- animation
    let fuel = 1, eyeYaw = 0, eyePitch = 0;
    function update(t, dt, { power: throttle = 1, particles: particlesOn = true } = {}) {
      const online = power.update(dt), offline = power.offline;
      U.uTime.value = t;
      U.uPower.value = throttle * (0.9 + 0.1 * Math.sin(t * 33.0) * Math.sin(t * 13.0));
      body.position.y = Math.sin(t * 1.3) * 0.08 * online - 0.3 * (1 - online);   // hover bob / sink
      body.rotation.x = Math.sin(t * 0.9) * 0.03 * online;
      body.rotation.z = Math.sin(t * 0.7) * 0.02 * online + 0.14 * (1 - online);  // lists when dead

      for (const p of pods) {                                   // thrust vectoring
        p.gimbal.rotation.y = Math.sin(t * 0.8 + p.phase) * 0.18 * throttle;
        p.gimbal.rotation.z = Math.sin(t * 1.1 + p.phase) * 0.08 * online;
      }
      engines.update(t, throttle);

      // eye: short glances to new targets every ~1.3 s, eased (frozen offline)
      if (!offline) {
        const k = Math.floor(t / 1.3), h1 = Math.sin(k * 12.9898) * 43758.5453, h2 = Math.sin(k * 78.233) * 12543.123;
        eyeYaw += ((h1 - Math.floor(h1) - 0.5) * 0.9 - eyeYaw) * Math.min(1, dt * 8);
        eyePitch += ((h2 - Math.floor(h2) - 0.5) * 0.5 - eyePitch) * Math.min(1, dt * 8);
      }
      eye.rotation.set(0, eyeYaw, eyePitch);
      flareT = Math.max(0, flareT - dt * 3); scanT = Math.max(0, scanT - dt);
      eyeMat.uniforms.uOn.value = 0.05 + 0.95 * online;
      eyeMat.uniforms.uFlare.value = flareT;
      eyeMat.uniforms.uScan.value = Math.min(1, scanT);

      // The code texture is shared by every drone: set its scroll from the
      // clock (not += dt), or N drones on screen would scroll it N times as fast.
      M.code.map.offset.x = (-t * 0.06) % 1;
      codeMat.color.setScalar(0.06 + 0.94 * online);
      halo.rotation.y += dt * 0.25 * online;
      crystal.rotation.y += dt * 1.1 * online; crystal.rotation.x += dt * 0.5 * online;
      crystalMat.emissiveIntensity = 1.8 * online;
      crownGlow.material.opacity = (0.6 + 0.3 * Math.sin(t * 2.1)) * online;
      gaugeMat.emissiveIntensity = 2.2 * online;

      hinge.rotation.z = Math.sin(t * 0.25) * 0.35 * online;   // solar tracking
      sweep.rotation.y += dt * (scanT > 0 ? 3.5 : 0.4);

      fuel = clamp(fuel + (throttle > 0.5 ? -0.04 : 0.12 * online) * dt, 0.12, 1);
      for (const g of gauges) g.scale.x = fuel;

      // fire: bolts leave the eye along its gaze
      shots.run(t, (sh) => {
        eyeDir.set(1, 0, 0).applyEuler(eye.rotation);
        tmp.copy(eyeMount.position).addScaledVector(eyeDir, 0.42).add(body.position);
        bolts.fire(tmp, eyeDir, sh.tg); flareT = 1;
      });
      bolts.update(dt); wave.update(dt);

      // print: the beam writes for 2.4 s, the word stays in its gas cloud, then fades
      const writing = printT >= 0 && printT < 2.4 && !offline;
      emitter.rotation.set(writing ? Math.sin(t * 2.2) * 0.35 : 0, 0, aimDown + (writing ? Math.sin(t * 1.4) * 0.12 : 0));
      if (printT >= 0) {
        if (!placed) {
          ship.updateMatrixWorld(true);
          hit.getWorldPosition(tmp); host.worldPoint(tmp);
          printK = ship.getWorldScale(tmpS).x / host.root.getWorldScale(tmpR).x;
          cloud.position.copy(tmp); word.position.copy(tmp).y += 0.1 * printK;
          cloud.visible = word.visible = placed = true;
        }
        printT += dt;
        const grow = Math.min(1, printT / 0.8), fade = printT < 3.6 ? 1 : Math.max(0, 1 - (printT - 3.6) / 1.6);
        cloud.scale.setScalar((1.4 + 1.8 * grow + printT * 0.2) * printK);
        cloudMat.opacity = 0.5 * grow * fade;
        word.scale.set(2.3 * printK, 0.58 * printK, 1);
        word.material.opacity = Math.min(1, printT / 2.4) * fade;
        if (printT > 5.2) { printT = -1; placed = false; cloud.visible = word.visible = false; }
      }
      beamMat.uniforms.uOn.value += ((writing ? 1 : 0) - beamMat.uniforms.uOn.value) * Math.min(1, dt * 8);
      hit.material.opacity = beamMat.uniforms.uOn.value * (0.7 + 0.3 * Math.sin(t * 50));

      nav.update(t);
      exhaust.update(dt, throttle, particlesOn, body.position.y);
    }
    function setLights(on) { nav.setVisible(on); sweep.visible = on; }
    return { group: ship, update, setLights, actions, act };
  },
});


// ---------------------------------------------------------------------
// SW-01 SWARMER — the swarm's own ship
// ---------------------------------------------------------------------
// The game's swarm ship (replacing the teal cone), so it's built for
// numbers: small, readable from far away, few parts. Teal like the swarm,
// a dart-shaped hull with two gold "mandibles" at the nose — the bite
// beam emitters it eats planets with — swept fins with glowing edges, a
// sensor strip and one main engine. Composed almost entirely from the
// building blocks above; only the hull, mandibles, fins and strip are its own.
SHIP_DEFS.push({
  id: "swarmer",
  name: "SW-01 SWARMER",
  camera: [6.2, 3.0, 6.8],
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 21, size: 512, base: [96, 150, 148], minPanel: 40, maxPanel: 130,
      stripes: [{ y: 0.18, h: 0.03, color: "#4fe3c6" }, { y: 0.82, h: 0.03, color: "#4fe3c6" }],
    });
    const brushed = makeBrushed({ seed: 12, size: 256, tint: [150, 160, 168], rings: 3 });
    trackTextures(...Object.values(hullTex), brushed);
    const a = {
      hull: new THREE.MeshStandardMaterial({
        map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap, bumpScale: 0.015,
        metalness: 0.7, roughness: 0.5 }),
      engine: new THREE.MeshStandardMaterial({ map: brushed, metalness: 1.0, roughness: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c3340, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.28 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      throat: new THREE.MeshBasicMaterial({ color: 0xbffff2 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x7fe8d8, metalness: 0.1, roughness: 0.05, clearcoat: 1,
        transparent: true, opacity: 0.6, envMapIntensity: 2 }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets();
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg, bevel } = detailHelpers(detail);
    const ship = new THREE.Group();
    const glowMat = M.glow.clone(); // per model: dims when offline (shares nothing heavy)

    // ---- 1. Hull: a lathed dart, flattened, nose along +X.
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -2.0), new THREE.Vector2(0.42, -1.85), new THREE.Vector2(0.58, -1.1),
      new THREE.Vector2(0.55, 0.2), new THREE.Vector2(0.38, 1.2), new THREE.Vector2(0.16, 1.95), new THREE.Vector2(0.001, 2.2),
    ]).getSpacedPoints(seg(40, 10));
    const hull = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, seg(40, 8)), M.hull));
    hull.rotation.z = -Math.PI / 2;
    hull.scale.set(0.62, 1, 1); // flattened top-to-bottom (after the turn, local x points down)
    ship.add(hull);

    // ---- 2. Mandibles: two curved gold-tipped prongs at the nose — the bite emitters.
    const tips = [];
    for (const side of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.2, 0, 0.3 * side), new THREE.Vector3(2.0, 0, 0.62 * side), new THREE.Vector3(2.7, 0, 0.38 * side),
      ]);
      ship.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, seg(16, 4), 0.07, seg(8, 4), false), M.dark)));
      const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, seg(12, 5)), M.gold));
      tip.position.set(2.82, 0, 0.36 * side); tip.rotation.z = -Math.PI / 2;
      ship.add(tip);
      tips.push(new THREE.Vector3(3.0, 0, 0.36 * side));
    }

    // ---- 3. Swept fins with glowing leading edges.
    const finShape = new THREE.Shape();
    finShape.moveTo(0.6, 0); finShape.lineTo(-0.9, 0); finShape.lineTo(-1.75, 1.55); finShape.lineTo(-1.35, 1.6); finShape.lineTo(0.6, 0);
    for (const side of [1, -1]) {
      const fin = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, steps: 1, ...bevel(0.03, 0.03) }), M.hull));
      fin.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2; // shape y -> world ±z
      fin.position.set(0, side > 0 ? 0.04 : -0.04, 0.2 * side);
      ship.add(fin);
      const edge = new THREE.LineCurve3(new THREE.Vector3(0.55, 0.07, 0.25 * side), new THREE.Vector3(-1.72, 0.07, 1.78 * side));
      ship.add(new THREE.Mesh(new THREE.TubeGeometry(edge, seg(8, 2), 0.04, seg(6, 4), false), glowMat));
    }

    // ---- 4. Canopy + sensor strip along the spine.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, seg(24, 8), seg(12, 4), 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
    canopy.scale.set(1.9, 0.7, 0.9); canopy.position.set(0.7, 0.3, 0);
    ship.add(canopy);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.08), glowMat);
    strip.position.set(-0.6, 0.35, 0);
    ship.add(strip);

    // ---- 5. Main engine + two small side thrusters (makeEngineSet).
    const engines = makeEngineSet(M, U, seg);
    engines.add(ship, new THREE.Vector3(-2.2, 0, 0), { radius: 0.36, length: 0.9, color: 0x4fe3c6, res: 0.6, plume: 7.5, glow: 4.6 });
    const smallPlume = makePlumeMaterial(0x4fe3c6, U);
    for (const side of [1, -1]) {
      engines.add(ship, new THREE.Vector3(-1.2, -0.05, 0.62 * side), { radius: 0.13, length: 0.5, color: 0x4fe3c6,
        plumeMat: smallPlume, res: 0.4, plume: 6, glow: 4 });
    }

    // ---- 6. Running lights, exhaust.
    const nav = makeNavLights(ship, [
      { color: 0x33ff77, pos: [-1.6, 0.05, 1.7], size: 0.5 },
      { color: 0xff3344, pos: [-1.6, 0.05, -1.7], size: 0.5 },
      { color: 0xffffff, pos: [-2.4, 0.35, 0], size: 0.55, kind: "strobe" },
    ]);
    const exhaust = makeExhaust(ship, U, { count: 120, seed: 33, rate: [1.1, 0.6], grow: 1.5, emitters: [
      { pos: [-2.9, 0, 0], spread: 0.26, length: 2.8 },
      { pos: [-1.55, -0.05, 0.62], spread: 0.1, length: 1.2 },
      { pos: [-1.55, -0.05, -0.62], spread: 0.1, length: 1.2 },
    ] });

    // ---- actions: bite bolts from both mandibles, a scan ping.
    const bolts = makeBoltPool(ship, env, 0x4fe3c6, { count: 8, length: 0.6, radius: 0.035, speed: 30 });
    const wave = makeScanWave(ship, env, 0x4fe3c6);
    const actions = [
      { id: "fire", label: "BITE", kind: "trigger" },
      { id: "scan", label: "SCAN", kind: "trigger" },
    ];
    const power = makeOnlineFader(), shots = makeShotQueue(), forward = new THREE.Vector3(1, 0, 0);
    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      if (id === "fire") shots.schedule([0, 1, 2, 3].map((i) => ({ delay: i * 0.1, tip: i % 2, target: on && on.target })));
      if (id === "scan") wave.start(new THREE.Vector3(0.6, 0.4, 0), 8);
    }
    function update(t, dt, { power: throttle = 1, particles = true } = {}) {
      const online = power.update(dt);
      U.uTime.value = t;
      U.uPower.value = throttle * (0.92 + 0.08 * Math.sin(t * 31.0) * Math.sin(t * 9.0));
      glowMat.emissiveIntensity = 2.2 * online * (0.85 + 0.15 * Math.sin(t * 2.4));
      engines.update(t, throttle);
      nav.update(t);
      exhaust.update(dt, throttle, particles);
      shots.run(t, (sh) => bolts.fire(tips[sh.tip], forward, sh.target));
      bolts.update(dt); wave.update(dt);
    }
    return { group: ship, update, setLights: (on) => nav.setVisible(on), actions, act };
  },
});

// =====================================================================
// PUBLIC API
// =====================================================================
// ---------------------------------------------------------------------
// ST-04 HAVEN — the player's space station
// ---------------------------------------------------------------------
// The station the story starts on ("you wake up on a ruined station on
// the fourth orbit"): a spinning habitat ring on spokes around a central
// spine, a lit greenhouse dome where someone still keeps 21 °C, a solar
// truss, radiators, a comms dish and a docking port for the swarm. Its
// ruin follows the damage (setDamage, on top of the shared smoke and
// sparks): at 0 it's whole; from 10% a stretch of ring windows goes dark,
// from 20% a solar panel breaks and hangs, from 30% a ring segment is torn
// open with debris drifting in the gap. The game starts it damaged (the
// story) and repairs will bring it back. Ring flat in XZ, spine along +Y; the
// truss runs along X, so X is its longest extent (makeGameHolder sizes by it).
SHIP_DEFS.push({
  id: "haven",
  name: "ST-04 HAVEN",
  camera: [12, 7.5, 13],
  features: { damage: true, destroy: true },
  _assets: null,
  assets() {
    if (this._assets) return this._assets;
    const hullTex = makePlating({
      seed: 44, size: 1024, base: [176, 180, 188], minPanel: 50, maxPanel: 180,
      stripes: [{ y: 0.12, h: 0.022, color: "#4fe3c6" }, { y: 0.88, h: 0.022, color: "#f8bb56" }],
      markings: [{ text: "HAVEN-04", x: 0.5, y: 0.5, size: 64, color: "#2a3140" }],
    });
    for (const k of ["map", "roughnessMap", "bumpMap", "emissiveMap"]) hullTex[k].repeat.set(3, 1);
    const moduleTex = makePlating({ seed: 45, size: 512, base: [104, 110, 122], minPanel: 40, maxPanel: 140,
      stripes: [{ y: 0.5, h: 0.03, color: "#4fe3c6" }] });
    const solar = makeSolarCells({ seed: 47, cols: 10, rows: 5 });
    trackTextures(...Object.values(hullTex), ...Object.values(moduleTex), solar);
    const a = {
      hull: new THREE.MeshStandardMaterial({ map: hullTex.map, roughnessMap: hullTex.roughnessMap, bumpMap: hullTex.bumpMap,
        bumpScale: 0.02, metalness: 0.6, roughness: 0.55 }),
      module: new THREE.MeshStandardMaterial({ map: moduleTex.map, roughnessMap: moduleTex.roughnessMap, bumpMap: moduleTex.bumpMap,
        bumpScale: 0.02, metalness: 0.7, roughness: 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2c313c, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1.0, roughness: 0.3 }),
      truss: new THREE.MeshStandardMaterial({ color: 0x8c929e, metalness: 0.9, roughness: 0.4 }),
      solar: new THREE.MeshStandardMaterial({ map: solar, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide }),
      solarDead: new THREE.MeshStandardMaterial({ map: solar, color: 0x4a4f5a, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide }),
      radiator: new THREE.MeshStandardMaterial({ color: 0xd8dce4, emissive: 0x6a2410, emissiveIntensity: 0.6,
        metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }),
      window: new THREE.MeshStandardMaterial({ color: 0x1b2130, emissive: 0xffcf8a, emissiveIntensity: 1.8 }),
      windowDead: new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.4, roughness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x6fb8ae, metalness: 0.2, roughness: 0.04, clearcoat: 1,
        transparent: true, opacity: 0.14, envMapIntensity: 1.4, depthWrite: false }),
      garden: new THREE.MeshStandardMaterial({ color: 0x14360f, emissive: 0x3fbf3a, emissiveIntensity: 1.4, roughness: 0.8 }),
      glow: new THREE.MeshStandardMaterial({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 }),
    };
    for (const m of Object.values(a)) sharedMaterials.add(m);
    return (this._assets = a);
  },

  build(detail, env) {
    const M = this.assets();
    const U = { uTime: { value: 0 }, uPower: { value: 1 } };
    const { seg } = detailHelpers(detail);
    const station = new THREE.Group();
    // per model: these dim when the station goes offline (shares the textures)
    const windowMat = M.window.clone(), gardenMat = M.garden.clone(), glowMat = M.glow.clone(), radiatorMat = M.radiator.clone();
    const R = 4, TUBE = 0.34;                     // habitat ring radius / tube

    // ---- 1. Spine: stacked modules and nodes along Y, the hub in the middle.
    const cyl = (r, h, y, mat, s = 32) => {
      const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg(s, 8)), mat));
      m.position.y = y; station.add(m); return m;
    };
    const node = (r, y) => {
      const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg(28, 8), seg(18, 6)), M.hull));
      m.position.y = y; station.add(m); return m;
    };
    cyl(1.05, 1.1, 0, M.hull, 48);                 // hub
    node(0.62, 0.95); node(0.62, -0.95);
    cyl(0.5, 1.2, 1.75, M.module);                 // upper module
    node(0.56, 2.4);
    cyl(0.6, 1.4, -1.75, M.module);                // lower module
    node(0.56, -2.55);
    for (const y of [0.42, -0.42]) {               // gold collars around the hub
      const c = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, seg(8, 3), seg(56, 12)), M.gold));
      c.rotation.x = Math.PI / 2; c.position.y = y; station.add(c);
    }
    // hub windows: one instanced band all around
    {
      const n = seg(36, 12), w = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.09, 0.03), windowMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < n; i++) {
        const ang = i / n * Math.PI * 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang + Math.PI / 2);
        m.compose(new THREE.Vector3(Math.cos(ang) * 1.06, 0.18, Math.sin(ang) * 1.06), q, s);
        w.setMatrixAt(i, m);
      }
      station.add(w);
    }

    // ---- 2. Greenhouse dome on top: glass over lit garden beds, gold ribs.
    const dome = new THREE.Group();
    dome.position.y = 3.5;
    station.add(dome);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, seg(40, 10)), gardenMat);
    bed.position.y = -0.45; dome.add(bed);
    {
      const n = seg(40, 10), plants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.22, 5), gardenMat, n);
      const m = new THREE.Matrix4(), rand = rng(7);
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(rand()) * 0.7, a = rand() * Math.PI * 2, sc = 0.6 + rand() * 0.9;
        m.compose(new THREE.Vector3(Math.cos(a) * r, -0.27 + 0.1 * sc, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
        plants.setMatrixAt(i, m);
      }
      dome.add(plants);
    }
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.95, seg(40, 10), seg(20, 6), 0, Math.PI * 2, 0, Math.PI * 0.62), M.glass);
    glass.renderOrder = 1;                         // after the garden inside it
    glass.position.y = -0.5; dome.add(glass);
    const CAP = Math.PI * 0.62;                    // the glass cap reaches this far from the top
    for (let i = 0; i < 6; i++) {                  // meridian ribs: a torus arc from the top down to the rim
      const rib = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, seg(6, 3), seg(28, 8), CAP), M.gold));
      rib.rotation.set(0, i / 6 * Math.PI * 2, Math.PI / 2 - CAP);   // Z first (into place), then Y (around)
      rib.position.y = -0.5;
      dome.add(rib);
    }
    const rimY = -0.5 + 0.95 * Math.cos(CAP);
    const domeRim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.95 * Math.sin(CAP), 0.07, seg(8, 3), seg(40, 10)), M.gold));
    domeRim.rotation.x = Math.PI / 2; domeRim.position.y = rimY; dome.add(domeRim);
    const floor = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.95 * Math.sin(CAP), 0.95 * Math.sin(CAP), 0.08, seg(40, 10)), M.module));
    floor.position.y = rimY; dome.add(floor);

    // ---- 3. Docking port at the bottom: a gold ring around a teal glow.
    const port = new THREE.Group();
    port.position.y = -3.1;
    station.add(port);
    port.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.4, seg(32, 8)), M.dark)));
    const portRing = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, seg(10, 4), seg(40, 10)), M.gold));
    portRing.rotation.x = Math.PI / 2; portRing.position.y = -0.2; port.add(portRing);
    const portGlow = new THREE.Mesh(new THREE.CircleGeometry(0.36, seg(32, 8)), glowMat);
    portGlow.rotation.x = Math.PI / 2; portGlow.position.y = -0.21; port.add(portGlow);

    // ---- 4. Radiators under the ring plane, glowing faintly with waste heat.
    for (const side of [1, -1]) {
      const rad = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.9), radiatorMat));
      rad.position.set(side * 1.9, -1.75, 0); station.add(rad);
      station.add(strut(new THREE.Vector3(side * 0.55, -1.75, 0), new THREE.Vector3(side * 0.85, -1.75, 0), 0.08, M.truss, seg(8, 4)));
    }

    // ---- 5. Habitat ring: spins slowly on four spokes. One segment torn open.
    const spin = new THREE.Group();
    spin.userData.dynamic = true;               // animated: merged as its own unit
    station.add(spin);
    // Damage stages: each a pair of groups, the whole and the ruined version,
    // swapped by setDamage (dynamic: toggled, so merged as their own units).
    const stage = (parent) => {
      const whole = new THREE.Group(), ruined = new THREE.Group();
      whole.userData.dynamic = ruined.userData.dynamic = true;
      ruined.visible = false;
      parent.add(whole, ruined);
      return { whole, ruined, set(on) { whole.visible = !on; ruined.visible = on; } };
    };
    const winStage = stage(spin), breachStage = stage(spin), panelStage = stage(station);
    const GAP = 0.5, ARC = Math.PI * 2 - GAP;  // the breach segment: ARC .. 2π
    const ringSeg = (from, arc, parent) => {
      const m = shadowed(new THREE.Mesh(new THREE.TorusGeometry(R, TUBE, seg(20, 6), Math.max(3, Math.round(seg(160, 24) * arc / (Math.PI * 2))), arc), M.hull));
      m.rotation.set(Math.PI / 2, 0, 0);       // torus arc runs in its XY plane -> XZ
      m.rotateZ(from);                          // then along the ring (local Z is world -Y now)
      parent.add(m);
      return m;
    };
    ringSeg(0, ARC, spin);
    ringSeg(ARC, GAP, breachStage.whole);      // the segment the breach tears out
    const ringPoint = (ang, r = R, y = 0) => new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r); // matches the rotated torus
    // torn ends: jagged cones where the hull broke off
    for (const [ang, dir] of [[0, -1], [ARC, 1]]) {     // dir: along the ring, into the gap
      const rand = rng(ang > 0 ? 3 : 5);
      for (let i = 0; i < 5; i++) {
        const shard = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.07 + rand() * 0.06, 0.25 + rand() * 0.3, 4), M.dark));
        const p = ringPoint(ang, R + (rand() - 0.5) * TUBE * 1.4, (rand() - 0.5) * TUBE * 1.4);
        shard.position.copy(p);
        const tangent = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(dir);
        shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8)).normalize());
        breachStage.ruined.add(shard);
      }
    }
    // debris drifting in the gap (its own animated unit)
    const debris = new THREE.Group();
    debris.userData.dynamic = true;
    breachStage.ruined.add(debris);
    const debrisParts = [];
    {
      const rand = rng(21);
      for (let i = 0; i < seg(9, 4); i++) {
        const d = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12 + rand() * 0.16, 0.05 + rand() * 0.08, 0.1 + rand() * 0.14), rand() < 0.5 ? M.hull : M.dark));
        const ang = ARC + GAP * (0.15 + rand() * 0.7);
        d.position.copy(ringPoint(ang, R + (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.6));
        debris.add(d);
        debrisParts.push({ d, base: d.position.clone(), ph: rand() * 6.28, spin: new THREE.Vector3(rand(), rand(), rand()).multiplyScalar(0.6) });
      }
    }
    // windows: two rows on the outer face all around; the stretch next to
    // the breach goes dark (a stage), the breach segment's own windows go with it
    {
      const n = seg(150, 44), darkFrom = ARC - 0.9;
      const lit = [], zone = [], gap = [];
      for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
        const ang = (i + 0.5) / n * Math.PI * 2, w = [ang, row ? 0.1 : -0.1];
        (ang > ARC ? gap : ang > darkFrom ? zone : lit).push(w);
      }
      const box = new THREE.BoxGeometry(0.03, 0.07, 0.11);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      const windows = (list, mat, parent) => {
        const im = new THREE.InstancedMesh(box, mat, list.length);
        list.forEach(([ang, y], i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);      // thin side (+X) turned outward
          m.compose(ringPoint(ang, R + TUBE * 0.97, y), q, s);
          im.setMatrixAt(i, m);
        });
        parent.add(im);
      };
      windows(lit, windowMat, spin);
      windows(zone, windowMat, winStage.whole);
      windows(zone, M.windowDead, winStage.ruined);
      windows(gap, windowMat, breachStage.whole);
    }
    // spokes from the hub to the ring, with a module where each meets it
    for (let k = 0; k < 4; k++) {
      const ang = (k + 0.5) / 4 * ARC;
      spin.add(strut(ringPoint(ang, 1.1), ringPoint(ang, R - TUBE * 0.8), 0.1, M.truss, seg(10, 4)));
      const mod = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.62), M.module));
      mod.position.copy(ringPoint(ang, R, 0));
      mod.rotation.y = -ang;
      spin.add(mod);
    }
    const collar = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.09, seg(10, 4), seg(56, 12)), M.dark));
    collar.rotation.x = Math.PI / 2; spin.add(collar);   // the rotating joint the spokes hang on

    // ---- 6. Solar truss above the ring, along X, two panels per side; the
    // outer -X one breaks and hangs (a damage stage).
    const TY = 1.75, TL = 7.2;
    const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TL * 2, 0.16, 0.16), M.truss));
    beam.position.y = TY; station.add(beam);
    {
      const n = seg(28, 10), braces = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), M.truss, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const x = -TL + (i + 0.5) / n * TL * 2;
        q.setFromEuler(new THREE.Euler(0, 0, i % 2 ? 0.6 : -0.6));
        m.compose(new THREE.Vector3(x, TY, i % 2 ? 0.1 : -0.1), q, new THREE.Vector3(1, 0.3, 1));
        braces.setMatrixAt(i, m);
      }
      station.add(braces);
    }
    station.add(strut(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, TY, 0), 0.12, M.truss, seg(8, 4)));
    const panelGeo = new THREE.PlaneGeometry(2.4, 1.25);
    for (const side of [1, -1]) {
      for (const [i, x] of [[0, 3.4], [1, 6.0]]) {
        const breaks = side < 0 && i === 1;
        const panel = (parent, broken) => {
          const mount = new THREE.Group();
          mount.position.set(side * x, TY, 0);
          parent.add(mount);
          const p = new THREE.Mesh(panelGeo, broken ? M.solarDead : M.solar);
          p.rotation.x = -Math.PI / 2 + 0.25;    // tilted toward the light
          if (broken) { p.rotation.set(-Math.PI / 2 + 1.2, 0.25, -0.35); p.position.set(0.15, -0.35, 0.3); }
          mount.add(p);
          const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.03, 0.05), M.truss));
          frame.position.z = broken ? 0.1 : 0.62; mount.add(frame);
        };
        if (!breaks) panel(station, false);
        else { panel(panelStage.whole, false); panel(panelStage.ruined, true); }
      }
    }

    // ---- 7. Comms dish on a boom off the hub (+Z), slowly scanning.
    const dishBase = new THREE.Vector3(0, 0.55, 1.05), dishTip = new THREE.Vector3(0, 1.1, 2.4);
    station.add(strut(dishBase, dishTip, 0.06, M.truss, seg(8, 4)));
    const dish = new THREE.Group();
    dish.userData.dynamic = true;
    dish.position.copy(dishTip);
    station.add(dish);
    {
      const pts = [], steps = seg(14, 4);
      for (let i = 0; i <= steps; i++) { const r = i / steps * 0.65; pts.push(new THREE.Vector2(r, r * r * 0.55)); }
      const bowl = shadowed(new THREE.Mesh(new THREE.LatheGeometry(pts, seg(36, 10)), M.hull));
      bowl.rotation.x = 0.9;                       // opens up and outward (+Z)
      dish.add(bowl);
      bowl.add(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0), 0.025, M.gold, seg(6, 3)));  // the feed
    }

    // ---- 8. Lights, the scan ping.
    const nav = makeNavLights(station, [
      { color: 0xff3344, pos: [-TL, TY, 0], size: 0.7 },
      { color: 0x33ff77, pos: [TL, TY, 0], size: 0.7 },
      { color: 0xffffff, pos: [0, -3.35, 0], size: 0.8, kind: "strobe" },
      { color: 0xffffff, pos: [0, 4.05, 0], size: 0.6, kind: "strobe", phase: 0.5 },
      { color: 0x4fe3c6, pos: [dishTip.x, dishTip.y + 0.5, dishTip.z + 0.4], size: 0.45 },
    ]);
    const wave = makeScanWave(station, env, 0x4fe3c6);
    const power = makeOnlineFader(0.8);
    const actions = [{ id: "scan", label: "SCAN" }];
    let scanT = 0;

    function act(id, on) {
      if (id === "offline") { power.set(on); return; }
      if (power.offline) return;
      if (id === "scan") { wave.start(dishTip.clone(), 14); scanT = 2.5; }
    }
    function update(t, dt) {
      const online = power.update(dt);
      U.uTime.value = t;
      spin.rotation.y += dt * 0.06 * online;                        // the habitat ring turns (gravity)
      for (const p of debrisParts) {                                 // debris tumbles slowly in the gap
        p.d.position.copy(p.base).addScaledVector(p.spin, Math.sin(t * 0.3 + p.ph) * 0.15);
        p.d.rotation.x += dt * p.spin.x * 0.5; p.d.rotation.y += dt * p.spin.y * 0.5;
      }
      scanT = Math.max(0, scanT - dt);
      dish.rotation.y = Math.sin(t * 0.15) * 0.8 + (scanT > 0 ? (2.5 - scanT) * 2.5 : 0);
      windowMat.emissiveIntensity = 1.8 * online;
      gardenMat.emissiveIntensity = 1.4 * (0.3 + 0.7 * online) * (0.95 + 0.05 * Math.sin(t * 0.7)); // the garden keeps a little light
      glowMat.emissiveIntensity = 2.2 * online * (0.8 + 0.2 * Math.sin(t * 2));
      radiatorMat.emissiveIntensity = 0.6 * online;
      nav.update(t);
      wave.update(dt);
    }
    // the ruin stages (buildShipModel passes the damage on)
    function setDamage(d) { winStage.set(d >= 0.1); panelStage.set(d >= 0.2); breachStage.set(d >= 0.3); }
    return { group: station, update, setLights: (on) => nav.setVisible(on), actions, act, setDamage };
  },
});

const FIGURE_NAMES = {
  LatheGeometry: "Lathe (revolved)", BoxGeometry: "Box", SphereGeometry: "Sphere / segment",
  TorusGeometry: "Torus", ExtrudeGeometry: "Extruded shape", TubeGeometry: "Tube along curve",
  CylinderGeometry: "Cylinder", ConeGeometry: "Cone", CircleGeometry: "Circle",
  IcosahedronGeometry: "Icosahedron", OctahedronGeometry: "Octahedron", DodecahedronGeometry: "Dodecahedron",
  TorusKnotGeometry: "Torus knot", EdgesGeometry: "Edges (wire cage)", PlaneGeometry: "Plane",
};

// The action buttons every ship shows, in this order. A ship enables the
// ones it implements by listing them in its build() result's `actions`
// (it may relabel them, e.g. "FIRE CANNONS"); the rest show up disabled,
// so a ship with no extra animation for something simply doesn't list it.
// Ship-specific extra actions (any other id) are appended after these.
// "offline" and "destroy" are implemented here for every ship; a
// definition can switch the shared features off with
// features: { offline: false, damage: false, destroy: false }
// (destroy needs damage: it reuses its smoke and sparks).
const STANDARD_ACTIONS = [
  { id: "fire", label: "FIRE", kind: "trigger" },
  { id: "scan", label: "SCAN", kind: "trigger" },
  { id: "print", label: "PRINT", kind: "trigger" },
  { id: "offline", label: "OFFLINE", kind: "toggle" },
  { id: "destroy", label: "DESTROY", kind: "trigger" },
];

// Merge the static meshes of a built ship to cut draw calls: meshes
// sharing a material are baked into one geometry, per "unit" — the root
// plus every object marked userData.dynamic (anything the ship animates
// by transform or toggles on/off), each merged in its own local space so
// its animation still works. A mesh with children, an instanced mesh, or
// a material used only once is left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const units = [root];
  root.traverse((o) => { if (o !== root && o.userData.dynamic) units.push(o); });
  for (const unit of units) {
    const inv = new THREE.Matrix4().copy(unit.matrixWorld).invert();
    const byMat = new Map();
    (function walk(o) {
      for (const c of o.children) {
        if (c.userData.dynamic) continue;                 // its own unit
        if (c.isMesh && !c.isInstancedMesh && !c.children.length && !Array.isArray(c.material)
            && c.geometry && c.geometry.attributes.position) {
          if (!byMat.has(c.material)) byMat.set(c.material, []);
          byMat.get(c.material).push(c);
        }
        walk(c);
      }
    })(unit);
    for (const [mat, meshes] of byMat) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        return g;
      });
      const names = ["position", "normal", "uv"].filter((n) => parts.some((g) => g.attributes[n]));
      const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
      const merged = new THREE.BufferGeometry();
      for (const n of names) {
        const size = n === "uv" ? 2 : 3, out = new Float32Array(total * size);
        let off = 0;
        for (const g of parts) {
          const a = g.attributes[n];
          if (a) out.set(a.array.subarray(0, a.count * size), off);  // missing uv stays 0
          off += g.attributes.position.count * size;
        }
        merged.setAttribute(n, new THREE.BufferAttribute(out, size));
      }
      parts.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      unit.add(mesh);
      for (const m of meshes) { m.parent.remove(m); m.geometry.dispose(); }
    }
  }
}

// Build one ship model. Returns a model handle:
//   { id, detail, group, update(t, dt, opts), setLights(on), size, radius }
// group: THREE.Group, origin at the ship's center, nose along +X, up +Y.
// Options:
//   detail   0.2 .. 2, scales every segment count
//   merge    true: merge static meshes (far fewer draw calls — use in the game)
//   fxRoot   an Object3D (e.g. the scene) for effects that leave the ship
//   envMap   environment map for the ship's reflective materials
function buildShipModel(id, { detail = 1, merge = false, fxRoot = null, envMap = null } = {}) {
  const def = SHIP_DEFS.find((d) => d.id === id);
  if (!def) throw new Error("ShipKit: unknown ship id " + id);
  const env = { fxRoot, owned: [] };
  const built = def.build(detail, env);
  built.group.userData.shipkit = true; // a host's color management can skip ShipKit models
  if (merge) mergeStatic(built.group);
  if (envMap) built.group.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (m.isMeshStandardMaterial && m.envMap !== envMap) { m.envMap = envMap; m.needsUpdate = true; }
    }
  });
  // Size of the solid hull only: engine plumes, glow sprites and particles
  // are effects and would inflate the box.
  built.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  built.group.traverse((o) => {
    if (!o.isMesh || (o.material && o.material.blending === THREE.AdditiveBlending)) return;
    box.union(new THREE.Box3().setFromObject(o));
  });
  const size = box.getSize(new THREE.Vector3()), radius = size.length() / 2;

  // Everything below is shared by every ship type: offline mode, damage
  // effects and flickering lights, on top of the ship's own actions.
  const features = { offline: true, damage: true, destroy: true, ...(def.features || {}) };
  if (!features.damage) features.destroy = false;
  const fx = features.damage ? createDamageFx(built.group, radius)
    : { damage: 0, setDamage() {}, update() {} };
  const own = built.actions || [];
  const actions = STANDARD_ACTIONS.map((a) => {
    const mine = own.find((x) => x.id === a.id);
    const shared = a.id === "offline" || a.id === "destroy";
    return { ...a, ...(mine || {}), enabled: shared ? features[a.id] : !!mine };
  }).concat(own.filter((x) => !STANDARD_ACTIONS.some((a) => a.id === x.id)).map((x) => ({ kind: "trigger", ...x, enabled: true })));
  const st = { offline: false, lights: true, shown: true, flickerT: 0 };
  const showLights = (on) => { if (on !== st.shown) { st.shown = on; built.setLights(on); } };
  const model = {
    id, detail, group: built.group, size, radius, _owned: env.owned,
    // [{ id, label, kind: "trigger" | "toggle", enabled }] — see STANDARD_ACTIONS
    actions,
    damageEnabled: features.damage,
    get offline() { return st.offline; },
    get destroyed() { return !!fx.destroyed; },
    get damage() { return fx.damage; },
    update(t, dt, opts = {}) {
      const dead = st.offline || !!fx.destroyed;
      const power = dead ? 0 : (opts.power === undefined ? 1 : opts.power);
      built.update(t, dt, { ...opts, power });
      // lights: off when offline; flicker when badly damaged
      if (!st.lights || dead) showLights(false);
      else if (fx.damage > 0.4) {
        if ((st.flickerT -= dt) <= 0) {
          st.flickerT = 0.04 + Math.random() * 0.3;
          showLights(Math.random() > fx.damage * 0.5);
        }
      } else showLights(true);
      fx.update(t, dt, opts.particles !== false);
    },
    setLights(on) { st.lights = on; },
    // Trigger an action, or set a toggle (on = true/false). "offline" is
    // handled here and passed on so the ship can dim its own parts.
    act(actionId, on) {
      const a = actions.find((x) => x.id === actionId);
      if (!a || !a.enabled || fx.destroyed) return;  // not available / nothing left to act
      if (actionId === "destroy") {                   // the ship powers down as it blows apart
        if (built.act) built.act("offline", true);
        if (built.setDamage) built.setDamage(1);
        fx.explode();
        return;
      }
      if (actionId === "offline") st.offline = on === undefined ? !st.offline : !!on;
      if (built.act) built.act(actionId, actionId === "offline" ? st.offline : on);
    },
    // 0 = pristine, 1 = wrecked; a ship with damage stages of its own
    // (built.setDamage, e.g. the station's breach) gets it too
    setDamage(d) {
      if (fx.destroyed) return;
      fx.setDamage(clamp(d, 0, 1));
      if (built.setDamage) built.setDamage(clamp(d, 0, 1));
    },
  };
  return model;
}

// Free a model's GPU resources: all geometries + per-model materials.
// Shared (cached) materials and all textures are kept for reuse.
function disposeShipModel(model) {
  if (model.group.parent) model.group.parent.remove(model.group);
  for (const o of model._owned || []) {          // effects placed outside the ship (fxRoot)
    if (o.parent) o.parent.remove(o);
    o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material && !sharedMaterials.has(c.material)) c.material.dispose(); });
  }
  model.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!sharedMaterials.has(m)) m.dispose();
  });
}

// Technical statistics of a built model (object / figure / triangle counts,
// materials, shaders, textures + GPU memory estimate).
function modelStats(root) {
  const st = { objects: 0, meshes: 0, instanced: 0, copies: 0, sprites: 0, lines: 0, points: 0, particles: 0,
               triangles: 0, vertices: 0, figures: {}, materials: new Set(), shaders: 0, textures: new Set() };
  root.traverse((o) => {
    if (o === root || o.type === "Group") return;
    st.objects++;
    const k = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) { st.instanced++; st.copies += o.count; }
    else if (o.isMesh) st.meshes++;
    else if (o.isSprite) st.sprites++;
    else if (o.isLineSegments || o.isLine) st.lines++;
    else if (o.isPoints) { st.points++; st.particles += o.geometry.attributes.position.count; }
    if (o.geometry && !o.isSprite && !o.isPoints) {
      const g = o.geometry, name = FIGURE_NAMES[g.type] || g.type;
      st.figures[name] = (st.figures[name] || 0) + k;
      st.vertices += g.attributes.position.count * k;
      if (o.isMesh) st.triangles += (g.index ? g.index.count / 3 : g.attributes.position.count / 3) * k;
    }
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      st.materials.add(m);
      for (const key of ["map", "roughnessMap", "bumpMap", "emissiveMap", "metalnessMap", "normalMap"]) if (m[key]) st.textures.add(m[key]);
    }
  });
  st.shaders = [...st.materials].filter((m) => m.isShaderMaterial).length;
  const images = new Set([...st.textures].map((t) => t.image));
  st.texCount = images.size;
  st.texMB = [...images].reduce((a, im) => a + (im ? im.width * im.height * 4 * 4 / 3 : 0), 0) / 1048576; // RGBA8 + mips
  return st;
}

// The labs' reflection sky: an equirectangular nebula with stars, a warm
// sun (gives metal a strong highlight) and a cool rim source. The ship and
// body labs use it as their sky and environment; the game uses it as the
// environment map so its ships and planets are lit like in the labs.
function makeSpaceSky(w = 2048, h = 1024) {
  const rand = rng(11);
  const [c, ctx] = canvas(w, h);
  const n1 = fbm(rand, 6, 3, 6), n2 = fbm(rand, 3, 2, 5);
  paintPixels(ctx, w, h, (u, v) => {
    const a = n1(u, v), b = n2(u, v);
    const neb = Math.pow(clamp((a - 0.42) * 2.4, 0, 1), 2.2);
    const neb2 = Math.pow(clamp((b - 0.48) * 2.6, 0, 1), 2);
    const lat = 1 - Math.abs(v - 0.5) * 1.6;
    return [
      clamp(4 + neb * 70 * lat + neb2 * 90, 0, 255),
      clamp(6 + neb * 40 * lat + neb2 * 30, 0, 255),
      clamp(16 + neb * 150 * lat + neb2 * 110, 0, 255),
    ];
  });
  for (let i = 0; i < 2600; i++) {
    const x = rand() * w, y = rand() * h, r = rand() < 0.97 ? rand() * 0.9 + 0.3 : rand() * 1.8 + 1;
    const t = rand();
    ctx.fillStyle = t < 0.2 ? "#ffd9a8" : t < 0.4 ? "#b8c8ff" : "#ffffff";
    ctx.globalAlpha = 0.4 + rand() * 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const sun = (x, y, r, col) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.08, col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  sun(w * 0.18, h * 0.36, 260, "rgba(255,190,110,0.85)");
  sun(w * 0.68, h * 0.55, 200, "rgba(110,140,255,0.6)");
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// A prefiltered environment map from makeSpaceSky(), for scene.environment
// (or buildShipModel's envMap option).
function makeEnvironment(renderer) {
  const sky = makeSpaceSky(1024, 512);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(sky).texture;
  sky.dispose(); pmrem.dispose();
  return env;
}

// Game wrapper: turns the model to the game's convention (forward = +Z)
// and scales it to `length` units. Move/rotate `holder`, not model.group.
function makeGameHolder(model, length) {
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = -Math.PI / 2;                 // +X nose -> +Z forward
  inner.scale.setScalar(length / model.size.x);
  inner.add(model.group);
  holder.add(inner);
  return holder;
}

// Generate a ship type's textures and materials ahead of time (the first
// build costs ~1 s of CPU) — e.g. while a start screen is showing.
function prewarm(ids) {
  glowTextures(); fxTextures();
  for (const id of ids) { const d = SHIP_DEFS.find((x) => x.id === id); if (d) d.assets(); }
}

return {
  SHIP_DEFS, buildShipModel, disposeShipModel, modelStats, makeGameHolder, prewarm, mergeStatic,
  makeSpaceSky, makeEnvironment,
  makeBoltPool, makeScanWave, textTexture, fxTextures, // action/effect helpers for ship defs
  // building blocks for ship definitions (see "SHIP BUILDING BLOCKS")
  detailHelpers, makeEngineSet, makeExhaust, makeNavLights, makeShotQueue, makeOnlineFader, makeSolarCells, strut,
  STANDARD_ACTIONS,
  allTextures,                      // Set of every generated texture
  isSharedMaterial: (m) => sharedMaterials.has(m),
  // lower-level generators, reusable for other game objects:
  makePlating, makeBrushed, makeGlow,
  util: { rng, valueNoise, fbm, canvas, paintPixels, clamp },
};
})();
