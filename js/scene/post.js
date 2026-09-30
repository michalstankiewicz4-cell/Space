import { ctx } from "../core/context.js";
import { camState } from "./controls.js";
import { SOLAR_BODY_BY_SLOT, BODY_VISUAL_SCALE } from "../world/solarSystem.js";
import { gfxFxaa, gfxMsaa, gfxBloom, gfxBloomStrength, gfxBloomThreshold, gfxLensing, gfxFlare, gfxFlareStrength,
  gfxFilter, gfxVignette, gfxGrain, gfxAberration, gfxDof, gfxDofStrength } from "./graphics.js";

// Post-processing of the main view (Setup -> Graphics). When anything here
// is on, the scene isn't drawn straight onto the screen but into an
// offscreen target the size of the view rect, and then through these steps:
//   0. gravitational lensing (when the black hole is in view): the scene
//      is drawn WITHOUT the hole, then warped around where it is — each
//      pixel at distance r from it shows what's at r·(1 − E²/r²) (a point
//      lens; E = the Einstein radius): the stars behind smear into a ring
//      at E, a mirrored image of the sky appears inside — and then the
//      hole itself is drawn over the warped picture (its disk, photon
//      ring and shadow are BodyKit's, already shaped like a lensed hole;
//      warping them too made a bullseye). A 2D warp, not ray tracing —
//      cheap. Whatever's in front of the hole is warped with the rest.
//   1. bloom — Three.js's UnrealBloomPass (vendor/three-r128-examples):
//      the bright parts (the Sun, engines, beams, lit windows) are cut
//      out, blurred at five sizes and added back over the image — glow
//   2. FXAA — smooths edges, thin lines, shader detail
//   3. depth of field (focus camera only) — a blurred quarter-size copy
//      (blurTargets) for the final pass to mix in
//   4. the final pass onto the view rect (FINAL_FS), all in one shader:
//      - depth of field: the focused object (always mid-screen) sharp, the
//        rest mixed toward the blurred copy with distance from it. Screen
//        distance, not depth — no depth buffer to read from a multisampled
//        target in WebGL here; the focused object is centred, so it reads
//        the same
//      - the Sun's lens flare: a starburst, ghosts along the line from the
//        Sun through the centre, a halo. Whether the Sun is visible is read
//        from the picture itself (a few samples of its disc): a planet in
//        front of it dims the flare with no extra render pass
//      - the "robot eyes" filter: chromatic aberration toward the edges,
//        vignette, film grain
// The target's texture is sRGB, so the scene writes its final, tone-mapped
// colours into it (the numbers bloom's threshold works on are what the
// screen shows) and the last pass copies them to the screen unchanged.
// MSAA (×2/×4/×8) is the target's sample count (WebGL2); the canvas's own
// anti-aliasing is fixed at context creation (≈×4), so another MSAA level
// is also a reason to go through the target.
// The miniatures and the cockpit view don't go through any of this.

let p = null;

export function postActive(){
  return !!(gfxFxaa() && THREE.FXAAShader) || !!(gfxBloom() && THREE.UnrealBloomPass) || gfxMsaa() !== 4
    || gfxLensing() || gfxFlare() || gfxFilter() || (gfxDof() && camState.mode === "focus");
}

const FINAL_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const FINAL_FS = `
uniform sampler2D tDiffuse, tBlur;
uniform float uAspect, uTime;
uniform vec3 uDof;         // x: amount 0..1, y: sharp radius, z: fully blurred radius (uv height units)
uniform vec4 uSun;         // xy: the Sun on screen (uv), z: its radius (uv height units), w: flare strength (0 = off)
uniform vec3 uFilter;      // vignette, grain, aberration (0..1 each)
varying vec2 vUv;

float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 scene(vec2 uv){ return texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb; }

void main(){
  vec2 k = vec2(uAspect, 1.0);
  vec2 uv = vUv;

  // chromatic aberration: red and blue pulled apart toward the edges
  vec3 col;
  vec2 fromC = (vUv - 0.5) * k;
  if(uFilter.z > 0.0){
    vec2 off = fromC * dot(fromC, fromC) * 0.012 * uFilter.z / k;
    col = vec3(scene(uv + off).r, scene(uv).g, scene(uv - off).b);
  }else col = scene(uv);

  // depth of field
  if(uDof.x > 0.0){
    float m = smoothstep(uDof.y, uDof.z, length(fromC)) * uDof.x;
    col = mix(col, texture2D(tBlur, clamp(uv, 0.001, 0.999)).rgb, m);
  }

  // the Sun's lens flare
  if(uSun.w > 0.0){
    // how much of the Sun's disc is visible: 7 samples of the image
    float vis = 0.0;
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
      // starburst: thin rays around the Sun, slowly turning
      float ang = atan(toS.y, toS.x);
      float rays = pow(abs(sin(ang * 6.0 + uTime * 0.05)), 120.0) + pow(abs(sin(ang * 11.0 - uTime * 0.03 + 1.3)), 160.0) * 0.6;
      float burst = rays * exp(-rs / max(uSun.z * 2.2, 0.015)) * 0.45;
      fl += vec3(1.0, 0.9, 0.75) * burst;
      fl += vec3(1.0, 0.85, 0.6) * exp(-rs / max(uSun.z * 1.8, 0.012)) * 0.35;      // soft core
      fl += vec3(0.7, 0.8, 1.0) * exp(-abs(toS.y) * 260.0) * exp(-abs(toS.x) * 3.0) * 0.25;   // horizontal streak
      // ghosts along the line from the Sun through the centre
      vec2 axis = (vec2(0.5) - uSun.xy);
      for(int g = 0; g < 5; g++){
        float t = g == 0 ? 0.55 : g == 1 ? 0.8 : g == 2 ? 1.25 : g == 3 ? 1.55 : 1.9;
        float sz = g == 0 ? 0.05 : g == 1 ? 0.025 : g == 2 ? 0.08 : g == 3 ? 0.035 : 0.12;
        vec3 gc = g == 0 ? vec3(0.4, 0.7, 1.0) : g == 1 ? vec3(1.0, 0.6, 0.3) : g == 2 ? vec3(0.5, 1.0, 0.6)
                : g == 3 ? vec3(0.9, 0.5, 1.0) : vec3(0.4, 0.6, 1.0);
        float dg = length((vUv - (uSun.xy + axis * 2.0 * t)) * k);
        fl += gc * smoothstep(sz, sz * 0.6, dg) * (0.05 + 0.05 * smoothstep(sz * 0.5, sz, dg));
      }
      // a faint halo ring around the Sun
      float halo = exp(-pow((rs - 0.32) * 18.0, 2.0));
      fl += vec3(0.6, 0.75, 1.0) * halo * 0.05;
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
uniform vec3 uLens;        // xy: the black hole on screen (uv), z: its horizon's radius (uv height units)
uniform float uLensE;      // Einstein radius / horizon radius
varying vec2 vUv;
void main(){
  vec2 k = vec2(uAspect, 1.0);
  vec2 d = (vUv - uLens.xy) * k;
  float r = length(d), E = uLens.z * uLensE;
  vec2 s = d * (1.0 - E * E / max(r * r, 1e-8));
  s = mix(s, d, smoothstep(E * 3.0, E * 7.0, r));   // the pull fades out, not reaching across the screen
  vec2 uv = uLens.xy + s / k;
  vec3 c = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
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

function makeTarget(samples){
  const opts = { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
  let t;
  if(samples > 0 && ctx.renderer.capabilities.isWebGL2){
    t = new THREE.WebGLMultisampleRenderTarget(1, 1, opts);
    t.samples = samples;
  }else t = new THREE.WebGLRenderTarget(1, 1, opts);
  t.texture.encoding = THREE.sRGBEncoding;
  return t;
}

function plainTarget(){
  const t = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
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

function pipeline(){
  if(p && p.samples === gfxMsaa()) return p;
  if(p) p.target.dispose();
  if(!p){
    p = { camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), dofAmount: 0 };
    p.mid = plainTarget();                          // FXAA's output
    p.blurA = plainTarget(); p.blurB = plainTarget();   // depth of field, quarter size
    if(THREE.FXAAShader){
      p.fxaaMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms),
        vertexShader: THREE.FXAAShader.vertexShader, fragmentShader: THREE.FXAAShader.fragmentShader,
        depthTest: false, depthWrite: false
      });
      p.fxaaScene = quad(p.fxaaMat);
    }
    p.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FINAL_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false
    });
    p.blurScene = quad(p.blurMat);
    p.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBlur: { value: null }, uAspect: { value: 1 }, uTime: { value: 0 },
        uDof: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector4() }, uFilter: { value: new THREE.Vector3() }
      },
      vertexShader: FINAL_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false
    });
    p.finalScene = quad(p.finalMat);
    p.lensMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uAspect: { value: 1 }, uLens: { value: new THREE.Vector3() }, uLensE: { value: LENS_E } },
      vertexShader: FINAL_VS, fragmentShader: LENS_FS, depthTest: false, depthWrite: false
    });
    p.lensScene = quad(p.lensMat);
    // the warped picture, with a depth buffer for drawing the hole into it
    p.lens = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    p.lens.texture.encoding = THREE.sRGBEncoding;
    if(THREE.UnrealBloomPass){
      p.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 0.85);
      p.bloom.highPassUniforms.smoothWidth.value = 0.06;   // a soft ramp: just-over-the-threshold glows only a little
    }
  }
  p.samples = gfxMsaa();
  p.target = makeTarget(p.samples);
  p.w = p.h = 0;
  return p;
}

// Where a sphere (world centre, radius) is on screen: fills `out` with
// (uv x, uv y, radius in uv height units) and returns true when it's in
// front of the camera and roughly in view (`margin` in NDC).
const tmpV = new THREE.Vector3();
function sphereOnScreen(pos, radius, out, margin){
  const cam = ctx.camera;
  tmpV.copy(pos).applyMatrix4(cam.matrixWorldInverse);
  if(tmpV.z > -radius * 0.5) return false;
  const dist = -tmpV.z;
  tmpV.applyMatrix4(cam.projectionMatrix);
  if(Math.abs(tmpV.x) > 1 + margin || Math.abs(tmpV.y) > 1 + margin) return false;
  out.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5, radius / (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / 2);
  return true;
}

const LENS_E = 1.6;   // Einstein radius in horizon radii
const ORIGIN = new THREE.Vector3();
let t0 = performance.now(), lastT = t0;

// r: the view rect (CSS px), pr: pixel ratio; setRect(r) points the
// renderer's viewport + scissor at it (scene/viewRect.js).
export function renderPost(r, pr, setRect){
  const q = pipeline(), rend = ctx.renderer;
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const w = Math.max(1, Math.round(r.width * pr)), h = Math.max(1, Math.round(r.height * pr));
  if(q.w !== w || q.h !== h){
    q.w = w; q.h = h;
    q.target.setSize(w, h);
    q.mid.setSize(w, h);
    q.lens.setSize(w, h);
    const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
    q.blurA.setSize(bw, bh); q.blurB.setSize(bw, bh);
    if(q.bloom) q.bloom.setSize(w, h);
  }
  const hole = ctx.blackholes[0], L = q.lensMat.uniforms;
  const lensOn = gfxLensing() && hole && hole.group.visible && sphereOnScreen(hole.group.position, hole.radius, L.uLens.value, 0.8)
    && L.uLens.value.z * h > 2;

  rend.setScissorTest(false);
  rend.setRenderTarget(q.target);
  rend.clear();
  if(lensOn) hole.group.visible = false;
  rend.render(ctx.scene, ctx.camera);
  let src = q.target;

  if(lensOn){
    hole.group.visible = true;
    L.tDiffuse.value = q.target.texture;
    L.uAspect.value = r.width / Math.max(1, r.height);
    rend.setRenderTarget(q.lens);
    rend.render(q.lensScene, q.camera);
    const auto = rend.autoClear;
    rend.autoClear = false;
    rend.clearDepth();
    rend.render(hole.group, ctx.camera);
    rend.autoClear = auto;
    src = q.lens;
  }

  if(q.bloom && gfxBloom()){
    q.bloom.strength = gfxBloomStrength();
    q.bloom.threshold = gfxBloomThreshold();
    q.bloom.render(rend, null, src);
  }

  if(q.fxaaMat && gfxFxaa()){
    q.fxaaMat.uniforms.tDiffuse.value = src.texture;
    q.fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
    rend.setRenderTarget(q.mid);
    rend.render(q.fxaaScene, q.camera);
    src = q.mid;
  }

  const U = q.finalMat.uniforms;

  // depth of field: eases in and out with the focus camera (~0.6 s)
  const tgt = camState.mode === "focus" && gfxDof() ? camState.target : null;
  q.dofAmount += ((tgt ? 1 : 0) - q.dofAmount) * Math.min(1, dt * 4);
  if(q.dofAmount > 0.01){
    const bw = q.blurA.width, bh = q.blurA.height, B = q.blurMat.uniforms;
    B.tDiffuse.value = src.texture; B.uDir.value.set(1 / bw, 0);
    rend.setRenderTarget(q.blurB); rend.render(q.blurScene, q.camera);
    B.tDiffuse.value = q.blurB.texture; B.uDir.value.set(0, 1 / bh);
    rend.setRenderTarget(q.blurA); rend.render(q.blurScene, q.camera);
    B.tDiffuse.value = q.blurA.texture; B.uDir.value.set(2 / bw, 0);
    rend.setRenderTarget(q.blurB); rend.render(q.blurScene, q.camera);
    B.tDiffuse.value = q.blurB.texture; B.uDir.value.set(0, 2 / bh);
    rend.setRenderTarget(q.blurA); rend.render(q.blurScene, q.camera);
    // sharp out to ~2 of the object's radii on screen, fully soft a good way beyond
    let size = 0.06;
    if(tgt){
      const dist = ctx.camera.position.distanceTo(tgt.mesh ? tgt.mesh.position : tgt.group.position);
      size = (tgt.radius || 1) / (dist * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2)) / 2;
      q.dofSize = size;
    }else if(q.dofSize) size = q.dofSize;
    const sharp = Math.max(0.05, size * 2.2);
    U.uDof.value.set(q.dofAmount * Math.min(1, gfxDofStrength()), sharp, sharp + 0.25 / Math.max(0.3, gfxDofStrength()));
    U.tBlur.value = q.blurA.texture;
  }else U.uDof.value.x = 0;

  U.tDiffuse.value = src.texture;
  U.uAspect.value = r.width / Math.max(1, r.height);
  U.uTime.value = (now - t0) / 1000;
  if(gfxFlare() && sphereOnScreen(ORIGIN, SOLAR_BODY_BY_SLOT[0].radius * BODY_VISUAL_SCALE.sun, U.uSun.value, 0.05)) U.uSun.value.w = gfxFlareStrength();
  else U.uSun.value.w = 0;
  if(gfxFilter()) U.uFilter.value.set(gfxVignette(), gfxGrain(), gfxAberration());
  else U.uFilter.value.set(0, 0, 0);

  rend.setRenderTarget(null);
  setRect(r);
  rend.render(q.finalScene, q.camera);
  rend.setScissorTest(false);
}
