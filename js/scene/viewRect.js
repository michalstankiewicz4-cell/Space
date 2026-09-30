import { ctx } from "../core/context.js";
import { setLineResolution } from "./lines.js";
import { gfxFxaa } from "./graphics.js";

// The canvas covers the whole window, but the main 3D view only renders
// into — and only takes mouse input from — one rect of it: the HUD's
// #viewport frame (css/ui/hud/). While the start screen covers
// everything, it's the whole window instead, so the scene still shows
// full-screen behind the translucent start panel. A page without the HUD
// (none today) would fall back to the canvas's own rect.
//
// Every rect here is in CSS pixels, window coordinates (same space as a
// pointer event's clientX/clientY and getBoundingClientRect()).
let viewportEl, bannerEl;

export function getViewRect(){
  if(viewportEl === undefined){
    viewportEl = document.getElementById("viewport");
    bannerEl = document.getElementById("banner");
  }
  if(!viewportEl) return ctx.renderer.domElement.getBoundingClientRect();
  if(bannerEl && !bannerEl.classList.contains("hidden")){
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight,
      width: window.innerWidth, height: window.innerHeight };
  }
  return viewportEl.getBoundingClientRect();
}

export function isInViewRect(x, y){
  const r = getViewRect();
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}

// Points the renderer's viewport + scissor at a window-space rect (WebGL's
// own origin is the canvas's bottom-left corner, hence the flipped Y). The
// canvas sits at the window's top-left, so window space == canvas space.
function setRenderRect(r){
  const y = window.innerHeight - r.bottom;
  ctx.renderer.setViewport(r.left, y, r.width, r.height);
  ctx.renderer.setScissor(r.left, y, r.width, r.height);
  ctx.renderer.setScissorTest(true);
}

export function initViewRect(){
  // Created up front so the one-time shader recompile its arrival causes
  // happens at startup, not the first time a miniature is shown.
  ensureStudioLight();
}

// Main view: clears the whole canvas (the gaps between HUD panels stay
// black), then draws the scene into the view rect only.
export function renderMainView(){
  const r = getViewRect();
  const aspect = r.width / Math.max(1, r.height);
  if(Math.abs(ctx.camera.aspect - aspect) > 1e-4){
    ctx.camera.aspect = aspect;
    ctx.camera.updateProjectionMatrix();
  }
  ctx.renderer.setScissorTest(false);
  ctx.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  ctx.renderer.setClearColor(0x000000, 1);
  ctx.renderer.clear();
  ctx.renderer.setClearColor(0x05060a, 1);
  const pr = ctx.renderer.getPixelRatio();
  setLineResolution(r.width * pr, r.height * pr);
  if(gfxFxaa() && THREE.FXAAShader){ renderWithFxaa(r, pr); return; }
  setRenderRect(r);
  ctx.renderer.render(ctx.scene, ctx.camera);
  ctx.renderer.setScissorTest(false);
}

// FXAA (Setup -> Graphics): the scene goes into an offscreen target the
// size of the view rect (multisampled where WebGL2 allows, so the edge
// anti-aliasing isn't lost), then onto the screen through Three.js's FXAA
// shader (vendor/three-r128-examples), which also smooths what MSAA can't:
// thin lines, shader detail, tiny far objects. The target's texture is
// sRGB, so the scene writes its final, tone-mapped colours into it and the
// FXAA pass copies them straight to the screen.
let fx = null;
function fxaaPass(){
  if(fx) return fx;
  const opts = { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
  const target = ctx.renderer.capabilities.isWebGL2 ? new THREE.WebGLMultisampleRenderTarget(1, 1, opts) : new THREE.WebGLRenderTarget(1, 1, opts);
  target.texture.encoding = THREE.sRGBEncoding;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms),
    vertexShader: THREE.FXAAShader.vertexShader, fragmentShader: THREE.FXAAShader.fragmentShader,
    depthTest: false, depthWrite: false
  });
  mat.uniforms.tDiffuse.value = target.texture;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), mat));
  fx = { target: target, mat: mat, scene: scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  return fx;
}

function renderWithFxaa(r, pr){
  const f = fxaaPass();
  const w = Math.max(1, Math.round(r.width * pr)), h = Math.max(1, Math.round(r.height * pr));
  if(f.target.width !== w || f.target.height !== h) f.target.setSize(w, h);
  f.mat.uniforms.resolution.value.set(1 / w, 1 / h);
  const rend = ctx.renderer;
  rend.setRenderTarget(f.target);
  rend.setScissorTest(false);
  rend.clear();
  rend.render(ctx.scene, ctx.camera);
  rend.setRenderTarget(null);
  setRenderRect(r);
  rend.render(f.scene, f.camera);
  rend.setScissorTest(false);
}

// "Studio" light for the miniatures: the scene's own lights are fixed in
// space, so a miniature camera often looks at an object's dark side. This
// light sits at the miniature camera and is only switched on for that one
// render pass. It lives in the scene permanently (added on first use) and
// only its intensity toggles — adding/removing a light would change the
// light count and force every material's shader to recompile each time.
let studioLight = null;
function ensureStudioLight(){
  if(studioLight) return studioLight;
  studioLight = new THREE.PointLight(0xffffff, 0, 0, 0);
  ctx.scene.add(studioLight);
  return studioLight;
}

// Second render pass into a HUD element's on-screen box (unit/planet
// thumbnails, ship cam) — same canvas, same scene, a different camera.
// `studio` lights the shot from the camera (miniatures, not the ship
// cam's cockpit view). Returns false (drawing nothing) when the element
// isn't visible.
export function renderIntoElement(el, camera, studio){
  if(!el || el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  if(r.width < 2 || r.height < 2) return false;
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  const pr = ctx.renderer.getPixelRatio();
  setLineResolution(r.width * pr, r.height * pr);
  setRenderRect(r);
  const light = studio ? ensureStudioLight() : null;
  if(light){ light.position.copy(camera.position); light.intensity = 1.1; }
  ctx.renderer.render(ctx.scene, camera);
  if(light) light.intensity = 0;
  ctx.renderer.setScissorTest(false);
  return true;
}
