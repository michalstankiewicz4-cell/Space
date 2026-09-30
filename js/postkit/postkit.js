/* =======================================================================
   PostKit — post-processing of a rendered view: MSAA level, bloom,
   gravitational lensing, FXAA, depth of field, a sun's lens flare and a
   "robot eyes" filter (aberration, vignette, grain). One classic script
   (window.PostKit), like ShipKit and BodyKit, shared by the game
   (js/scene/post.js — Setup -> Graphics) and the labs (ship.html,
   bodies.html — their IMAGE EFFECTS panel). Changing it changes the game.

   Needs Three.js r128 (global THREE) and, for bloom and FXAA, the r128
   add-ons in vendor/three-r128-examples (Pass, CopyShader,
   LuminosityHighPassShader, UnrealBloomPass, FXAAShader); without them
   those two steps are skipped.

   API
     const pipe = PostKit.create(renderer);
     pipe.render(scene, camera, opts)       // instead of renderer.render
     PostKit.sphereOnScreen(camera, pos, radius, outVec3, margin)
     PostKit.PRESETS                         // effect sets: min / normal / max

   opts (all optional; leave a step out and it doesn't run):
     rect:   { left, top, width, height } in CSS px, window coordinates —
             draw into that part of the canvas (default: all of it)
     msaa:   0 | 2 | 4 | 8 — samples of the offscreen target (WebGL2)
     bloom:  { strength, threshold }       — glow around bright things
     fxaa:   true
     lens:   { object, position, radius }  — a black hole: `object` is
             hidden while the scene renders, the picture is warped around
             `position`, then `object` is drawn over it; `radius` is the
             horizon's radius (world units)
     dof:    { amount 0..1, size, strength } — `size`: the sharp object's
             radius on screen (uv height units, see sphereOnScreen)
     flare:  { position, radius, strength } — a sun (world position/radius)
     filter: { vignette, grain, aberration } (0..1 each)

   How each step works:
   - The scene renders into an offscreen target the size of the view
     (multisampled where WebGL2 allows) whose texture is sRGB: the scene
     writes its final, tone-mapped colours into it, bloom's threshold works
     on what the screen shows, the last pass copies to the screen as is.
   - Lensing: a point lens — the pixel at distance r from the hole shows
     what's at r·(1 − E²/r²), E = the Einstein radius: stars behind smear
     into a ring at E, a mirrored image of the sky appears inside. The
     hole itself is drawn after the warp (warping its disk too made a
     bullseye). A 2D warp of the finished image, not ray tracing.
   - Bloom: UnrealBloomPass adds a blurred copy of the bright parts back
     over the image (its high-pass given a soft 0.06 ramp).
   - Depth of field: a quarter-size blurred copy mixed in with SCREEN
     distance from the centre — the sharp object is assumed centred (no
     depth readable from a multisampled target in WebGL here).
   - Flare: starburst, ghosts along the line from the sun through the
     centre, a halo; how much of the sun is visible is read from a few
     samples of its disc in the image, so something in front dims it.
   ======================================================================= */
(function(){
"use strict";

const QUAD_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

const FINAL_FS = `
uniform sampler2D tDiffuse, tBlur;
uniform float uAspect, uTime;
uniform vec3 uDof;         // x: amount 0..1, y: sharp radius, z: fully blurred radius (uv height units)
uniform vec4 uSun;         // xy: the sun on screen (uv), z: its radius (uv height units), w: flare strength (0 = off)
uniform vec3 uFilter;      // vignette, grain, aberration (0..1 each)
varying vec2 vUv;

float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 scene(vec2 uv){ return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; }

void main(){
  vec2 k = vec2(uAspect, 1.0);
  vec2 uv = vUv;
  vec2 fromC = (vUv - 0.5) * k;

  // chromatic aberration: red and blue pulled apart toward the edges
  vec3 col;
  if(uFilter.z > 0.0){
    vec2 off = fromC * dot(fromC, fromC) * 0.012 * uFilter.z / k;
    col = vec3(scene(uv + off).r, scene(uv).g, scene(uv - off).b);
  }else col = scene(uv);

  // depth of field
  if(uDof.x > 0.0){
    float m = smoothstep(uDof.y, uDof.z, length(fromC)) * uDof.x;
    col = mix(col, texture2D(tBlur, clamp(uv, 0.001, 0.999)).rgb, m);
  }

  // the sun's lens flare
  if(uSun.w > 0.0){
    float vis = 0.0;                       // how much of its disc is visible: 7 samples of the image
    for(int i = 0; i < 7; i++){
      float a = float(i) * 0.8976;
      vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * uSun.z * 0.55;
      vis += smoothstep(0.55, 0.9, lum(scene(uSun.xy + o / k)));
    }
    vis /= 7.0;
    if(vis > 0.001){
      vec3 fl = vec3(0.0);
      vec2 toS = (vUv - uSun.xy) * k;
      float rs = length(toS);
      float ang = atan(toS.y, toS.x);      // starburst: thin rays, slowly turning
      float rays = pow(abs(sin(ang * 6.0 + uTime * 0.05)), 120.0) + pow(abs(sin(ang * 11.0 - uTime * 0.03 + 1.3)), 160.0) * 0.6;
      fl += vec3(1.0, 0.9, 0.75) * rays * exp(-rs / max(uSun.z * 2.2, 0.015)) * 0.45;
      fl += vec3(1.0, 0.85, 0.6) * exp(-rs / max(uSun.z * 1.8, 0.012)) * 0.35;                // soft core
      fl += vec3(0.7, 0.8, 1.0) * exp(-abs(toS.y) * 260.0) * exp(-abs(toS.x) * 3.0) * 0.25;   // horizontal streak
      vec2 axis = vec2(0.5) - uSun.xy;     // ghosts along the line from the sun through the centre
      for(int g = 0; g < 5; g++){
        float t = g == 0 ? 0.55 : g == 1 ? 0.8 : g == 2 ? 1.25 : g == 3 ? 1.55 : 1.9;
        float sz = g == 0 ? 0.05 : g == 1 ? 0.025 : g == 2 ? 0.08 : g == 3 ? 0.035 : 0.12;
        vec3 gc = g == 0 ? vec3(0.4, 0.7, 1.0) : g == 1 ? vec3(1.0, 0.6, 0.3) : g == 2 ? vec3(0.5, 1.0, 0.6)
                : g == 3 ? vec3(0.9, 0.5, 1.0) : vec3(0.4, 0.6, 1.0);
        float dg = length((vUv - (uSun.xy + axis * 2.0 * t)) * k);
        fl += gc * smoothstep(sz, sz * 0.6, dg) * (0.05 + 0.05 * smoothstep(sz * 0.5, sz, dg));
      }
      fl += vec3(0.6, 0.75, 1.0) * exp(-pow((rs - 0.32) * 18.0, 2.0)) * 0.05;                   // halo
      col += fl * vis * uSun.w;
    }
  }

  // vignette and grain
  if(uFilter.x > 0.0) col *= 1.0 - uFilter.x * 0.75 * smoothstep(0.35, 1.05, length(fromC / vec2(uAspect * 0.62, 0.62)));
  if(uFilter.y > 0.0) col += (hash(vUv * 1000.0 + fract(uTime) * 57.0) - 0.5) * 0.08 * uFilter.y;

  gl_FragColor = vec4(col, 1.0);
}`;

const LENS_FS = `
uniform sampler2D tDiffuse;
uniform float uAspect;
uniform vec3 uLens;        // xy: the hole on screen (uv), z: its horizon's radius (uv height units)
uniform float uLensE;      // Einstein radius / horizon radius
varying vec2 vUv;
void main(){
  vec2 k = vec2(uAspect, 1.0);
  vec2 d = (vUv - uLens.xy) * k;
  float r = length(d), E = uLens.z * uLensE;
  vec2 s = d * (1.0 - E * E / max(r * r, 1e-8));
  s = mix(s, d, smoothstep(E * 3.0, E * 7.0, r));   // the pull fades out, not reaching across the screen
  vec3 c = texture2D(tDiffuse, clamp(uLens.xy + s / k, 0.001, 0.999)).rgb;
  gl_FragColor = vec4(c * smoothstep(uLens.z * 0.8, uLens.z * 1.2, r), 1.0);   // dark toward the centre (the horizon covers it)
}`;

const BLUR_FS = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;         // one texel along the blur direction
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270;
  c += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.3162;
  c += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

const LENS_E = 1.6;   // Einstein radius in horizon radii

// Effect sets for the presets (the game adds resolution and detail to
// these; the labs their render-quality level).
const PRESETS = {
  min:    { msaa: 0, fxaa: true,  bloom: false, lens: false, flare: false, filter: false, dof: false },
  normal: { msaa: 4, fxaa: false, bloom: true,  lens: true,  flare: true,  filter: true,  dof: true },
  max:    { msaa: 8, fxaa: true,  bloom: true,  lens: true,  flare: true,  filter: true,  dof: true },
};

function plainTarget(depth){
  const t = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RGBAFormat, depthBuffer: !!depth, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  t.texture.encoding = THREE.sRGBEncoding;
  t.texture.generateMipmaps = false;
  return t;
}

function quad(mat){
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return scene;
}

function shader(fs, uniforms){
  return new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
}

// Where a sphere is on screen: fills `out` with (uv x, uv y, radius in uv
// height units); false when it's behind the camera or out of view
// (`margin` in normalized device units).
const tmpV = new THREE.Vector3();
function sphereOnScreen(camera, pos, radius, out, margin){
  tmpV.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  if(tmpV.z > -radius * 0.5) return false;
  const dist = -tmpV.z;
  tmpV.applyMatrix4(camera.projectionMatrix);
  const m = margin || 0;
  if(Math.abs(tmpV.x) > 1 + m || Math.abs(tmpV.y) > 1 + m) return false;
  out.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5, radius / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / 2);
  return true;
}

function create(renderer){
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mid = plainTarget(false);                     // FXAA's output
  const lensT = plainTarget(true);                    // the warped picture (+ depth, for drawing the hole into it)
  const blurA = plainTarget(false), blurB = plainTarget(false);   // depth of field, quarter size
  const fxaaMat = THREE.FXAAShader ? new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms),
    vertexShader: THREE.FXAAShader.vertexShader, fragmentShader: THREE.FXAAShader.fragmentShader,
    depthTest: false, depthWrite: false }) : null;
  const fxaaScene = fxaaMat ? quad(fxaaMat) : null;
  const blurMat = shader(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
  const blurScene = quad(blurMat);
  const lensMat = shader(LENS_FS, { tDiffuse: { value: null }, uAspect: { value: 1 }, uLens: { value: new THREE.Vector3() }, uLensE: { value: LENS_E } });
  const lensScene = quad(lensMat);
  const finalMat = shader(FINAL_FS, { tDiffuse: { value: null }, tBlur: { value: null }, uAspect: { value: 1 }, uTime: { value: 0 },
    uDof: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector4() }, uFilter: { value: new THREE.Vector3() } });
  const finalScene = quad(finalMat);
  let bloom = null;
  if(THREE.UnrealBloomPass){
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0.85);
    bloom.highPassUniforms.smoothWidth.value = 0.06;   // a soft ramp: just-over-the-threshold glows only a little
  }
  let target = null, samples = -1, w = 0, h = 0;
  const t0 = performance.now();
  const size = new THREE.Vector2();

  function sceneTarget(n){
    if(target && samples === n) return target;
    if(target) target.dispose();
    const o = { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    if(n > 0 && renderer.capabilities.isWebGL2){ target = new THREE.WebGLMultisampleRenderTarget(1, 1, o); target.samples = n; }
    else target = new THREE.WebGLRenderTarget(1, 1, o);
    target.texture.encoding = THREE.sRGBEncoding;
    samples = n; w = h = 0;
    return target;
  }

  function render(scene, camera, opts){
    opts = opts || {};
    renderer.getSize(size);
    const r = opts.rect || { left: 0, top: 0, width: size.x, height: size.y };
    const pr = renderer.getPixelRatio();
    const tgt = sceneTarget(opts.msaa == null ? 4 : opts.msaa);
    const W = Math.max(1, Math.round(r.width * pr)), H = Math.max(1, Math.round(r.height * pr));
    if(w !== W || h !== H){
      w = W; h = H;
      tgt.setSize(w, h); mid.setSize(w, h); lensT.setSize(w, h);
      const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
      blurA.setSize(bw, bh); blurB.setSize(bw, bh);
      if(bloom) bloom.setSize(w, h);
    }
    const aspect = r.width / Math.max(1, r.height);
    const L = lensMat.uniforms, lens = opts.lens;
    const lensOn = !!(lens && lens.object && lens.object.visible && sphereOnScreen(camera, lens.position, lens.radius, L.uLens.value, 0.8)
      && L.uLens.value.z * h > 2);

    renderer.setScissorTest(false);
    renderer.setRenderTarget(tgt);
    renderer.clear();
    if(lensOn) lens.object.visible = false;
    renderer.render(scene, camera);
    let src = tgt;

    if(lensOn){
      lens.object.visible = true;
      L.tDiffuse.value = tgt.texture;
      L.uAspect.value = aspect;
      renderer.setRenderTarget(lensT);
      renderer.render(lensScene, cam);
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(lens.object, camera);
      renderer.autoClear = auto;
      src = lensT;
    }

    if(bloom && opts.bloom){
      bloom.strength = opts.bloom.strength;
      bloom.threshold = opts.bloom.threshold;
      bloom.render(renderer, null, src);
    }

    if(fxaaMat && opts.fxaa){
      fxaaMat.uniforms.tDiffuse.value = src.texture;
      fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
      renderer.setRenderTarget(mid);
      renderer.render(fxaaScene, cam);
      src = mid;
    }

    const U = finalMat.uniforms, dof = opts.dof;
    if(dof && dof.amount > 0.01){
      const bw = blurA.width, bh = blurA.height, B = blurMat.uniforms;
      B.tDiffuse.value = src.texture; B.uDir.value.set(1 / bw, 0);
      renderer.setRenderTarget(blurB); renderer.render(blurScene, cam);
      B.tDiffuse.value = blurB.texture; B.uDir.value.set(0, 1 / bh);
      renderer.setRenderTarget(blurA); renderer.render(blurScene, cam);
      B.tDiffuse.value = blurA.texture; B.uDir.value.set(2 / bw, 0);
      renderer.setRenderTarget(blurB); renderer.render(blurScene, cam);
      B.tDiffuse.value = blurB.texture; B.uDir.value.set(0, 2 / bh);
      renderer.setRenderTarget(blurA); renderer.render(blurScene, cam);
      // sharp out to ~2 of the object's radii on screen, fully soft a good way beyond
      const k = dof.strength == null ? 1 : dof.strength;
      const sharp = Math.max(0.05, (dof.size || 0.03) * 2.2);
      U.uDof.value.set(dof.amount * Math.min(1, k), sharp, sharp + 0.25 / Math.max(0.3, k));
      U.tBlur.value = blurA.texture;
    }else U.uDof.value.x = 0;

    U.tDiffuse.value = src.texture;
    U.uAspect.value = aspect;
    U.uTime.value = (performance.now() - t0) / 1000;
    const fl = opts.flare;
    if(fl && sphereOnScreen(camera, fl.position, fl.radius, U.uSun.value, 0.05)) U.uSun.value.w = fl.strength == null ? 1 : fl.strength;
    else U.uSun.value.w = 0;
    const f = opts.filter;
    if(f) U.uFilter.value.set(f.vignette || 0, f.grain || 0, f.aberration || 0);
    else U.uFilter.value.set(0, 0, 0);

    renderer.setRenderTarget(null);
    const y = size.y - r.top - r.height;
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.setScissorTest(true);
    renderer.render(finalScene, cam);
    renderer.setScissorTest(false);
  }

  return { render: render };
}

// ---------------------------------------------------------------------
// The labs' IMAGE EFFECTS panel (ship.html, bodies.html): presets AUTO /
// MIN / NORMAL / MAX, a switch per effect, MSAA. Clearly apart from the
// model's own controls — these change the camera's picture, not the ship
// or the body. A preset also sets the lab's render quality (setQuality);
// AUTO starts at NORMAL and steps a tier down while the lab runs below
// 45 fps, up after a while above 100. Touching anything makes it custom.
//   const fx = PostKit.labPanel(parentEl, { effects: ["bloom", …], setQuality(level) });
//   fx.options()  -> { msaa, bloom, fxaa, filter, dof, flare, lens } (flags)
//   fx.tick(now)  -> once per frame (AUTO's frame-rate watch)
//   fx.markCustom() — the lab's own quality slider moved
// ---------------------------------------------------------------------
const LAB_QUALITY = { min: 1, normal: 3, max: 4 };
const LAB_LABELS = { bloom: "BLOOM", fxaa: "FXAA", filter: "ROBOT EYES", dof: "DEPTH OF FIELD", flare: "SUN FLARE", lens: "LENSING" };
const LAB_TITLES = {
  bloom: "Glow around bright things (engines, lights, the sun)",
  fxaa: "Smooths edges and fine detail over the whole picture",
  filter: "Vignette, film grain and chromatic aberration",
  dof: "The model sharp, the background soft",
  flare: "Rays, ghosts and a halo from a sun in view",
  lens: "A black hole bends the picture behind it",
};
function labPanel(parent, cfg){
  const effects = cfg.effects || ["bloom", "fxaa", "filter", "dof"];
  const st = { preset: "auto", tier: "normal", msaa: 4 };
  effects.forEach(function(k){ st[k] = PRESETS.normal[k]; });
  if(!document.getElementById("postkitLabCss")){
    const css = document.createElement("style");
    css.id = "postkitLabCss";
    css.textContent = ".pkNote{ font-size:11.5px; color:#7f92e8; margin:2px 0 6px; line-height:1.3; }"
      + ".pkRow{ display:flex; flex-wrap:wrap; gap:5px; margin:4px 0 6px; } .pkRow .tBtn{ flex:1 1 auto; padding:0 8px; font-size:12px; }"
      + ".pkLbl{ font-size:12px; color:#9fb0ff; margin-top:2px; }";
    document.head.appendChild(css);
  }
  const box = document.createElement("div");
  box.innerHTML = '<div class="secHd">IMAGE EFFECTS</div>'
    + '<div class="pkNote">The camera\'s picture, as in the game\'s Setup → Graphics — not part of the model.</div>'
    + '<div class="pkRow" data-pk="preset"></div><div class="pkNote" data-pk="presetNote"></div>'
    + '<div class="pkRow" data-pk="fx"></div>'
    + '<div class="pkLbl">EDGE SMOOTHING (MSAA)</div><div class="pkRow" data-pk="msaa"></div>';
  parent.appendChild(box);
  const q = function(n){ return box.querySelector('[data-pk="' + n + '"]'); };
  function btn(row, text, title, onClick){
    const b = document.createElement("button");
    b.className = "tBtn"; b.textContent = text; if(title) b.title = title;
    b.addEventListener("click", onClick);
    q(row).appendChild(b);
    return b;
  }
  const presetBtns = {}, fxBtns = {}, msaaBtns = {};
  ["auto", "min", "normal", "max"].forEach(function(p){ presetBtns[p] = btn("preset", p.toUpperCase(), null, function(){ applyPreset(p); }); });
  effects.forEach(function(k){ fxBtns[k] = btn("fx", LAB_LABELS[k], LAB_TITLES[k], function(){ st[k] = !st[k]; st.preset = "custom"; paint(); }); });
  [0, 2, 4, 8].forEach(function(n){ msaaBtns[n] = btn("msaa", n ? "×" + n : "OFF", null, function(){ st.msaa = n; st.preset = "custom"; paint(); }); });

  function setTier(tier){
    st.tier = tier;
    const s = PRESETS[tier];
    st.msaa = s.msaa;
    effects.forEach(function(k){ st[k] = s[k]; });
    if(cfg.setQuality) cfg.setQuality(LAB_QUALITY[tier]);
  }
  function applyPreset(p){
    st.preset = p;
    setTier(p === "auto" ? "normal" : p);
    watch.since = watch.start = performance.now(); watch.frames = 0; watch.high = 0;
    paint();
  }
  function paint(){
    Object.keys(presetBtns).forEach(function(p){ presetBtns[p].classList.toggle("on", st.preset === p); });
    effects.forEach(function(k){ fxBtns[k].classList.toggle("on", !!st[k]); });
    Object.keys(msaaBtns).forEach(function(n){ msaaBtns[n].classList.toggle("on", st.msaa === +n); });
    q("presetNote").textContent = st.preset === "auto" ? "Adjusts to this computer — now: " + st.tier.toUpperCase() + "."
      : st.preset === "custom" ? "Your own mix." : "Sets the effects and the render quality at once.";
  }
  // AUTO: the frame rate over 2-second windows
  const watch = { since: performance.now(), start: performance.now(), frames: 0, high: 0 };   // start: no stepping down for 6 s (shaders compile)
  const TIERS = ["min", "normal", "max"];
  function tick(now){
    watch.frames++;
    const el = (now - watch.since) / 1000;
    if(el < 2) return;
    const fps = watch.frames / el;
    watch.since = now; watch.frames = 0;
    if(st.preset !== "auto") return;
    const i = TIERS.indexOf(st.tier);
    watch.high = fps > 100 ? watch.high + 1 : 0;
    let next = null;
    if(fps < 45 && i > 0 && now - watch.start > 6000) next = TIERS[i - 1];
    else if(watch.high >= 5 && i < TIERS.length - 1) next = TIERS[i + 1];
    if(next){ watch.high = 0; watch.start = now; setTier(next); paint(); }
  }
  applyPreset("auto");
  return {
    options: function(){ const o = { msaa: st.msaa }; effects.forEach(function(k){ o[k] = !!st[k]; }); return o; },
    tick: tick,
    markCustom: function(){ st.preset = "custom"; paint(); }
  };
}

window.PostKit = { create: create, sphereOnScreen: sphereOnScreen, labPanel: labPanel, PRESETS: PRESETS, LENS_E: LENS_E };
})();
