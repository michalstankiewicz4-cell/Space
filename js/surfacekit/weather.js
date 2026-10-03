/* =======================================================================
   SURFACEKIT · WEATHER — what falls and blows at a landing site
   =======================================================================
   A classic script after surfacekit.js (adds to window.SurfaceKit). The
   surface lab uses it. docs/surface.md, "Weather".

   WEATHER lists the kinds; each says on which worlds it can happen
   (allow(values): no rain without air, ash only on lava worlds…) and what
   it does at full strength:
     cloud   0..1  the deck over the sky (hides stars, sun, dims light)
     fog     0..   haze over the ground (×0.004 per metre) in fogCol
     wet     0..1  the ground darkens and shines (comes in ~8 s, dries ~40 s)
     snow    0..1  snow settles on level ground (~30 s; melts ~60 s)
     lightning     flashes now and then above half strength
     particles     rain streaks, snowflakes, dust, ash with embers — a box
                   of points around the camera, in the local frame (y up)
   createWeather() → weather:
     .root                            add to the ground's scene
     .set(id, strength 0..1, tint?)   tint: a colour for dust (the ground's)
     .update(t, dt, { camera, up, light }) → { cloud, cloudCol, fog, fogCol, wet, snow, flash }
                                      light: 0..1 how lit the scene is
     .dispose()
   ======================================================================= */
(function () {
"use strict";
const SK = window.SurfaceKit;
const hasAir = (v) => (v.airless || 0) < 0.5 && (v.atmosphere || 0) > 0.04;
const rgb = (r, g, b) => new THREE.Color(r, g, b);

const WEATHER = [
  { id: "clear", name: "Clear", allow: () => true },
  { id: "haze", name: "Haze and fog", allow: hasAir, cloud: 0.35, fog: 1.1, fogCol: rgb(0.74, 0.77, 0.8) },
  { id: "overcast", name: "Overcast", allow: hasAir, cloud: 0.95, fog: 0.12 },
  { id: "rain", name: "Rain and storms", allow: (v) => hasAir(v) && (v.lava || 0) < 0.3 && (v.frozen || 0) < 0.4 && (v.sea == null || v.sea > -0.55),
    cloud: 0.95, cloudCol: rgb(0.42, 0.45, 0.5), fog: 0.35, fogCol: rgb(0.45, 0.48, 0.52), wet: 1, lightning: true,
    particles: { kind: 0, n: 5000, box: 50, fall: 26, wind: 2.5, size: 1.3, col: rgb(0.72, 0.78, 0.88), alpha: 0.42 } },
  { id: "snow", name: "Snow", allow: (v) => hasAir(v) && (v.lava || 0) < 0.3 && ((v.ice || 0) > 0.1 || (v.frozen || 0) > 0.2),
    cloud: 0.85, cloudCol: rgb(0.78, 0.8, 0.84), fog: 0.5, fogCol: rgb(0.82, 0.85, 0.9), snow: 1,
    particles: { kind: 1, n: 5000, box: 40, fall: 1.5, wind: 1.2, size: 0.22, col: rgb(0.96, 0.97, 1), alpha: 0.9, flutter: 1 } },
  { id: "dust", name: "Dust storm", allow: (v) => hasAir(v) && (v.lava || 0) < 0.3,
    cloud: 0.6, fog: 1.6, dusty: true,
    particles: { kind: 1, n: 6000, box: 40, fall: -0.3, wind: 24, size: 0.3, alpha: 0.5, flutter: 0.4 } },
  { id: "ash", name: "Ash fall", allow: (v) => (v.lava || 0) > 0.3,
    cloud: 0.8, cloudCol: rgb(0.2, 0.15, 0.13), fog: 0.9, fogCol: rgb(0.2, 0.13, 0.1),
    particles: { kind: 1, n: 4000, box: 46, fall: 1.1, wind: 3, size: 0.14, col: rgb(0.16, 0.14, 0.13), alpha: 0.9, flutter: 0.6, embers: 0.08 } },
];
const allowed = (v) => WEATHER.filter((w) => w.allow(v || {}));

const P_VERT = `
attribute float aSeed;
uniform float uBox, uTime, uSize, uFall, uWind, uFlutter, uAmount, uPx;
uniform vec3 uOffset, uWindDir;
varying float vA; varying float vSeed;
void main(){
  float s = 0.8 + 0.4 * fract(aSeed * 13.7);
  vec3 p = position * uBox + uWindDir * uWind * uTime * s + vec3(0.0, -uFall * uTime * s, 0.0);
  p.x += sin(uTime * 1.3 + aSeed * 40.0) * 0.7 * uFlutter;
  p.z += cos(uTime * 1.1 + aSeed * 31.0) * 0.7 * uFlutter;
  p += uOffset;
  p = mod(p, uBox) - uBox * 0.5;
  vA = step(aSeed, uAmount) * (1.0 - smoothstep(0.3 * uBox, 0.5 * uBox, length(p)));
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize * uPx / max(-mv.z, 0.1), 1.0, 64.0);
  gl_Position = projectionMatrix * mv;
}`;
const P_FRAG = `
uniform vec3 uCol; uniform float uAlpha, uKind, uLight, uEmbers;
varying float vA; varying float vSeed;
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float a = uKind < 0.5
    ? smoothstep(0.07, 0.0, abs(pc.x)) * smoothstep(0.5, 0.2, abs(pc.y))     // a rain streak
    : smoothstep(0.5, 0.15, length(pc));                                      // a flake, a grain
  vec3 c = uCol * uLight;
  if (fract(vSeed * 91.3) < uEmbers) c = vec3(1.0, 0.42, 0.1) * 2.5;          // embers glow on their own
  if (a * vA < 0.01) discard;
  gl_FragColor = vec4(c, a * vA * uAlpha);
}`;

function createWeather() {
  const root = new THREE.Group();
  const N = 6000;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const U = {
    uBox: { value: 50 }, uTime: { value: 0 }, uSize: { value: 1 }, uFall: { value: 0 }, uWind: { value: 0 }, uFlutter: { value: 0 },
    uAmount: { value: 0 }, uPx: { value: 600 }, uOffset: { value: new THREE.Vector3() }, uWindDir: { value: new THREE.Vector3(1, 0, 0.3).normalize() },
    uCol: { value: new THREE.Color() }, uAlpha: { value: 1 }, uKind: { value: 1 }, uLight: { value: 1 }, uEmbers: { value: 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: P_VERT, fragmentShader: P_FRAG,
    transparent: true, depthWrite: false }));
  points.frustumCulled = false; points.visible = false; points.renderOrder = 5;
  root.add(points);
  let kind = WEATHER[0], strength = 0, wet = 0, snow = 0, flash = 0, nextFlash = 5;
  const dustCol = new THREE.Color(0.7, 0.45, 0.28), lastCam = new THREE.Vector3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
  const tmp = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const out = { cloud: 0, cloudCol: null, fog: 0, fogCol: null, wet: 0, snow: 0, flash: 0 };
  let first = true;
  return {
    root,
    set(id, s, tint) {
      kind = WEATHER.find((w) => w.id === id) || WEATHER[0];
      strength = Math.max(0, Math.min(1, s));
      if (tint) dustCol.copy(tint);
      const p = kind.particles;
      points.visible = !!p;
      if (p) {
        U.uBox.value = p.box; U.uSize.value = p.size; U.uFall.value = p.fall; U.uWind.value = p.wind; U.uFlutter.value = p.flutter || 0;
        U.uCol.value.copy(p.col || dustCol); U.uAlpha.value = p.alpha; U.uKind.value = p.kind; U.uEmbers.value = p.embers || 0;
      }
    },
    get id() { return kind.id; },
    update(t, dt, opts) {
      const cam = opts.camera;
      // the box rides the camera, turned to the local up; it keeps what the camera travelled
      q.setFromUnitVectors(Y, opts.up);
      root.position.copy(cam.position); root.quaternion.copy(q);
      if (first) { lastCam.copy(cam.position); first = false; }
      tmp.subVectors(cam.position, lastCam).applyQuaternion(qi.copy(q).invert());
      if (tmp.lengthSq() < 1e6) U.uOffset.value.sub(tmp);
      lastCam.copy(cam.position);
      U.uTime.value = t; U.uAmount.value = strength * (kind.particles ? Math.min(1, kind.particles.n / N) : 0);
      U.uLight.value = Math.max(0.05, opts.light == null ? 1 : opts.light);
      U.uPx.value = (opts.pixelHeight || 900) * 0.5;
      // the ground: wet comes fast and dries slowly; snow settles slowly and melts slower
      const wantWet = (kind.wet || 0) * strength, wantSnow = (kind.snow || 0) * strength;
      wet += (wantWet - wet) * Math.min(1, dt * (wantWet > wet ? 1 / 8 : 1 / 40));
      snow += (wantSnow - snow) * Math.min(1, dt * (wantSnow > snow ? 1 / 30 : 1 / 60));
      // lightning: a flicker every few seconds in a strong storm
      if (kind.lightning && strength > 0.5) {
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 1; nextFlash = 3 + Math.random() * 9 / strength; }
      }
      flash = Math.max(0, flash - dt * 4);
      out.flash = flash > 0 ? flash * (0.6 + 0.4 * Math.sin(t * 90)) : 0;
      out.cloud = (kind.cloud || 0) * strength;
      out.cloudCol = kind.cloudCol || (kind.dusty ? dustCol : null);
      out.fog = (kind.fog || 0) * strength;
      out.fogCol = kind.dusty ? dustCol : kind.fogCol || null;
      out.wet = wet; out.snow = snow;
      return out;
    },
    dispose() { geo.dispose(); points.material.dispose(); },
  };
}

Object.assign(SK, { WEATHER, weatherFor: allowed, createWeather });
})();
