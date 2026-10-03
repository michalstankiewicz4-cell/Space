/* =======================================================================
   SURFACEKIT · SKY — a landing site's sky, from the star system it's in
   =======================================================================
   A classic script after surfacekit.js (adds to window.SurfaceKit). The
   surface lab uses it. docs/surface.md, "The sky".

   A world is one body of a SystemKit system (an orbit, or a moon of one);
   its sky holds what the system holds, seen from there at the system's
   start (positions don't move yet — only the world turns):
     - the centre(s): a star as a disc in its black-body colour (two for a
       binary), a pulsar as a flickering point, a black hole as a dark disc
       ringed with light; their light falls off with distance;
     - the other planets as points, brighter when bigger and nearer;
     - big neighbours (your own moons, or the giant you orbit, its other
       moons) as real BodyKit bodies, lit by the star, so moons show phases.
   Sizes in the sky are compressed (the system's units aren't to scale):
   stars ×0.15, other planets ×0.05 (points, as in a real sky), moons ×0.15,
   the planet you orbit ×0.4.

   The world's turn: frame(values, theta) is the rotation from the system's
   frame (orbits in XZ) into the body's own frame (+Y the pole, the ground's
   frame): the axial tilt (values.tilt, degrees) and the spin angle theta.
   hourAt / thetaFor convert theta ↔ the local solar hour at a place.

   API
     WORLD_GROUPS                     the groups you can land on
     worldsOf(system) → [{ ref, values, label, path: { orbit, moon } }]
     skyOf(system, path) → { suns: [...], bodies: [...] }  (system frame)
     frame(values, theta, out?) → Matrix4
     thetaFor(skyData, values, siteDir, hour), hourAt(skyData, values, siteDir, theta)
     createSky(renderer) → sky:
       .root                          add to the ground's scene
       .setup(skyData, planetValues)  what's in the sky, the air's colours
       .update(t, { camera, up, frame, weather }) → light:
           { sunDir0, sunCol0, sunDir1, sunCol1, ambient, fogColor, fog, day }
       .dispose()
   ======================================================================= */
(function () {
"use strict";
const SK = window.SurfaceKit, BK = window.BodyKit;
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const WORLD_GROUPS = ["earthlike", "lava", "icy", "desert", "clouded", "moons", "airless"];
const canLand = (ref) => WORLD_GROUPS.includes(ref.split("/")[0]);
const nameOf = (ref) => { const d = window.SystemKit && SystemKit.defOf(ref); return d ? d.name.split(" · ")[0] : ref; };

// ---------- the worlds of a system ----------
function worldsOf(sys) {
  const out = [];
  sys.orbits.forEach((o, i) => {
    if (canLand(o.ref)) out.push({ ref: o.ref, values: o.values || {}, label: nameOf(o.ref) + " · orbit " + (i + 1), path: { orbit: i, moon: null } });
    (o.moons || []).forEach((m, j) => {
      if (canLand(m.ref)) out.push({ ref: m.ref, values: m.values || {}, label: nameOf(m.ref) + " · moon of " + nameOf(o.ref), path: { orbit: i, moon: j } });
    });
  });
  return out;
}

// ---------- positions at the system's start ----------
const flat = (a, d) => new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
function centerPositions(sys) {
  const n = sys.centers.length;
  if (n === 1) return [new THREE.Vector3()];
  const r = (window.SystemKit ? SystemKit.centerExtent(sys) : 6) * 0.45;
  return sys.centers.map((c, k) => flat(k / n * TAU, r));
}
const orbitPos = (o) => flat(o.phase || 0, o.distance);
const moonPos = (o, m) => orbitPos(o).add(flat(m.phase || 0, m.distance));

function skyOf(sys, path) {
  const host = sys.orbits[path.orbit];
  const W = path.moon == null ? orbitPos(host) : moonPos(host, host.moons[path.moon]);
  const cps = centerPositions(sys);
  const REF = 4 / 23;                                  // the Sun seen from the Earth (Sol preset): strength 1
  const suns = sys.centers.map((c, k) => {
    const to = cps[k].clone().sub(W), dist = to.length(), g = c.ref.split("/")[0];
    const ratio = c.size / dist / REF;
    const s = { dir: to.normalize(), kind: 0, color: new THREE.Color(1, 1, 1), strength: Math.min(1.8, Math.max(0.15, Math.pow(ratio, 0.8))),
      ang: Math.min(0.06, Math.max(0.006, Math.atan(c.size / dist) * 0.15)) };
    if (g === "suns") BK.blackbody((c.values && c.values.temperature) || 5778, s.color);
    else if (g === "pulsars") { s.kind = 1; s.color.setRGB(0.7, 0.8, 1); s.strength *= 0.12; s.ang = 0.004; }
    else { s.kind = 2; s.color.setRGB(1, 0.6, 0.3); s.strength *= 0.05; s.ang = Math.min(0.08, Math.max(0.01, Math.atan(c.size * 3 / dist) * 0.15)); }
    return s;
  }).sort((a, b) => b.strength - a.strength);
  const bodies = [];
  const add = (ref, values, P, size, kind) => {
    const g = ref.split("/")[0];
    if (g === "rings" || g === "blackholes") return;
    const to = P.clone().sub(W), dist = to.length();
    const ang = Math.atan(size / dist) * (kind === "parent" ? 0.4 : kind === "moon" ? 0.15 : 0.05);
    bodies.push({ ref, values: values || {}, dir: to.normalize(), ang, kind, mag: Math.min(1, Math.max(0.2, size / dist * 25)),
      sunFrom: cps[0].clone().sub(P).normalize() });
  };
  sys.orbits.forEach((o, i) => {
    if (i !== path.orbit) add(o.ref, o.values, orbitPos(o), o.size, "planet");
  });
  if (path.moon == null) (host.moons || []).forEach((m) => add(m.ref, m.values, moonPos(host, m), m.size, "moon"));
  else {
    add(host.ref, host.values, orbitPos(host), host.size, "parent");
    host.moons.forEach((m, j) => { if (j !== path.moon) add(m.ref, m.values, moonPos(host, m), m.size, "moon"); });
  }
  return { suns, bodies };
}

// ---------- the world's turn ----------
const _mt = new THREE.Matrix4(), _ms = new THREE.Matrix4(), _v = new THREE.Vector3();
function frame(values, theta, out = new THREE.Matrix4()) {
  _mt.makeRotationX(-((values && values.tilt) || 0) * DEG);
  _ms.makeRotationY(-theta);
  return out.multiplyMatrices(_ms, _mt);
}
// which way is "east" in longitude here: +1 if east = increasing atan2(z, x)
function eastSign(siteDir) {
  const { east } = SK.tangentFrame(siteDir), lon = Math.atan2(siteDir.z, siteDir.x);
  return (east.x * -Math.sin(lon) + east.z * Math.cos(lon)) >= 0 ? 1 : -1;
}
const lonOf = (v) => Math.atan2(v.z, v.x);
function sunLonTilted(sky, values) {
  _v.copy(sky.suns[0].dir).applyMatrix4(_mt.makeRotationX(-((values && values.tilt) || 0) * DEG));
  return lonOf(_v);
}
// the spin angle that puts the local solar hour at siteDir to `hour`
function thetaFor(sky, values, siteDir, hour) {
  const target = lonOf(siteDir) + eastSign(siteDir) * (12 - hour) * 15 * DEG;
  return target - sunLonTilted(sky, values);
}
function hourAt(sky, values, siteDir, theta) {
  const d = (sunLonTilted(sky, values) + theta - lonOf(siteDir)) / (15 * DEG) * eastSign(siteDir);
  return (((12 - d) % 24) + 24) % 24;
}

// ---------- the dome ----------
const SKY_VERT = "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const SKY_FRAG = `
uniform vec3 uUp, uHorizon, uZenith, uTwilight, uCloudCol, uFogCol;
uniform vec3 uSunDir[2], uSunCol[2]; uniform float uSunAng[2], uSunKind[2];
uniform vec4 uPts[8];
uniform float uAir, uCloud, uFogAmt, uTime, uFlash;
varying vec3 vD;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vD);
  float e = dot(d, uUp);
  vec3 air = vec3(0.0), discs = vec3(0.0);
  float dayAll = 0.0, starMask = 1.0;
  vec3 base = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, e));
  for (int i = 0; i < 2; i++) {
    vec3 c = uSunCol[i];
    float lum = max(max(c.r, c.g), c.b);
    if (lum < 0.001) continue;
    vec3 cn = c / lum;
    vec3 L = normalize(uSunDir[i]);
    float el = dot(L, uUp), sd = dot(d, L);
    float day = smoothstep(-0.12, 0.10, el) * min(lum, 1.0) * (uSunKind[i] < 0.5 ? 1.0 : 0.15);
    dayAll += day;
    air += base * day * mix(vec3(1.0), cn, 0.35);
    // dusk and dawn: a glow along the horizon under the sun
    float tw = smoothstep(-0.28, 0.0, el) * (1.0 - smoothstep(0.0, 0.3, el));
    vec3 dh = d - uUp * e, lh = L - uUp * el;
    float toward = pow(max(dot(normalize(dh + 1e-5), normalize(lh + 1e-5)), 0.0), 3.0);
    air += uTwilight * cn * tw * (0.25 + toward) * (1.0 - smoothstep(-0.05, 0.4, e)) * min(lum, 1.0);
    air += cn * pow(max(sd, 0.0), 10.0) * 0.3 * day;
    float r = acos(clamp(sd, -1.0, 1.0)), a = uSunAng[i];
    if (uSunKind[i] < 0.5) {            // a star: a bright disc and a corona
      discs += c * (smoothstep(a * 1.05, a * 0.9, r) * 7.0 + exp(-r / (a * 1.4)) * 0.6);
    } else if (uSunKind[i] < 1.5) {     // a pulsar: a flickering point
      float f = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 22.0), 6.0);
      discs += cn * (smoothstep(a, a * 0.3, r) * 10.0 + exp(-r / 0.02) * 0.6) * f;
    } else {                            // a black hole: a dark disc in a ring of light
      starMask *= smoothstep(a * 0.7, a * 0.85, r);
      discs += cn * exp(-pow((r - a) / (a * 0.22), 2.0)) * 2.5;
    }
  }
  dayAll = clamp(dayAll, 0.0, 1.0);
  air += uZenith * 0.025;                                    // the night air's own faint glow
  float seen = (1.0 - min(1.0, uAir * dayAll * 1.6)) * (1.0 - uCloud) * starMask;
  vec3 cs = floor(d * 400.0);
  float star = step(0.9975, hash(cs)) * (0.4 + 0.6 * hash(cs + 3.1));
  vec3 col = vec3(star) * seen;
  for (int k = 0; k < 8; k++) {                               // the other planets
    if (uPts[k].w <= 0.0) continue;
    float pd = dot(d, uPts[k].xyz);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.999992, 0.9999985, pd) * uPts[k].w * 2.5 * (0.25 + 0.75 * seen);
  }
#ifdef AIR
  // the air layer, over the sky's bodies (premultiplied: rgb + what's behind × (1 − a)):
  // the lit air adds, the cloud deck and the fog cover
  vec3 rgb = air * uAir; float al = 0.0;
  rgb *= 1.15 / max(1.15, max(max(rgb.r, rgb.g), rgb.b));   // two suns setting: glowing, not burnt white
  float ca = uCloud * smoothstep(-0.2, 0.08, e);
  rgb = uCloudCol * (0.06 + 0.94 * dayAll) * ca + rgb * (1.0 - ca); al = ca + al * (1.0 - ca);
  float fa = uFogAmt * (1.0 - smoothstep(-0.1, 0.6, e) * 0.7);
  rgb = uFogCol * fa + rgb * (1.0 - fa); al = fa + al * (1.0 - fa);
  gl_FragColor = vec4(rgb + vec3(0.75, 0.82, 1.0) * uFlash, al);
#else
  // the space layer: stars, the other planets, the suns' discs
  gl_FragColor = vec4(col + discs * (1.0 - uCloud * 0.97), 1.0);
#endif
}`;

const SKY_DIST = 20000;                 // between the air layer (15 km) and the space dome (30 km)

function createSky(renderer) {
  const v3 = () => new THREE.Vector3(), c3 = () => new THREE.Color();
  const U = {
    uUp: { value: v3() }, uHorizon: { value: c3() }, uZenith: { value: c3() }, uTwilight: { value: new THREE.Color(1, 0.42, 0.18) },
    uCloudCol: { value: c3() }, uFogCol: { value: c3() },
    uSunDir: { value: [v3(), v3()] }, uSunCol: { value: [c3(), c3()] }, uSunAng: { value: [0.01, 0.01] }, uSunKind: { value: [0, 0] },
    uPts: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    uAir: { value: 0 }, uCloud: { value: 0 }, uFogAmt: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
  };
  // two layers: space (30 km, -10, writes no depth), the sky's bodies (20 km,
  // -9), the air over them (15 km, -8: transparent, so drawn after the ground,
  // but depth-tested — the ground, always nearer, stays in front of it)
  const domeGeo = new THREE.SphereGeometry(30000, 48, 24), airGeo = new THREE.SphereGeometry(15000, 48, 24);
  const dome = new THREE.Mesh(domeGeo,
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
  dome.frustumCulled = false; dome.renderOrder = -10;
  const airDome = new THREE.Mesh(airGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    defines: { AIR: 1 }, side: THREE.BackSide, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  airDome.frustumCulled = false; airDome.renderOrder = -8;
  const root = new THREE.Group(); root.add(dome, airDome);
  let data = null, air = 0, discs = [], pts = [];
  const horizon = c3(), zenith = c3();
  const out = { sunDir0: v3(), sunCol0: c3(), sunDir1: v3(), sunCol1: c3(), ambient: c3(), fogColor: c3(), fog: 0, day: 0 };
  const tmp = v3(), tmpC = c3(), RED = new THREE.Color(1, 0.5, 0.28), WHITE = new THREE.Color(1, 1, 1);

  function clearDiscs() { discs.forEach((d) => BK.disposeBody(d.body)); discs = []; }
  return {
    root, get air() { return air; }, get horizon() { return horizon; },
    setup(skyData, v) {
      clearDiscs();
      data = skyData;
      // the air: thick atmospheres, a cloud world's lid
      air = Math.min(1, ((v.atmosphere || 0) * 1.6 + (v.haze || 0) * 1.5 + (v.overcast || 0) * 1.5) * (1 - (v.airless || 0)));
      const hue = new THREE.Color().setHSL((v.atmoHue || 210) / 360, 0.65, 0.62);
      horizon.copy(hue).lerp(WHITE, 0.35); zenith.copy(hue).multiplyScalar(0.45);
      U.uHorizon.value.copy(horizon); U.uZenith.value.copy(zenith); U.uAir.value = air;
      // dusk takes the sky's opposite colour: a blue sky sets orange, a rusty one blue (as on Mars)
      U.uTwilight.value.setHSL((((v.atmoHue || 210) + 180) % 360) / 360, 0.75, 0.55);
      pts = []; let k = 0;
      for (const b of data.bodies) {
        if (b.ang > 0.006) {
          const [g, id] = b.ref.split("/");
          const body = BK.buildBody(g, id, { detail: 0.6, values: Object.assign({}, b.values, { spin: 0.02 }) });
          body.setRadius(SKY_DIST * Math.tan(b.ang));
          if (body.setOctaves) body.setOctaves(5);
          body.group.traverse((o) => { o.renderOrder = -9; o.frustumCulled = false; });
          root.add(body.group);
          discs.push({ b, body });
        } else if (k < 8) pts.push(b), k++;
      }
      U.uPts.value.forEach((p, i) => p.set(0, 0, 0, 0));
    },
    // opts: { camera, up (unit, body frame), frame (Matrix4 system → body), weather: { cloud, fog, fogCol, flash } }
    update(t, opts) {
      const w = opts.weather || {}, cloud = w.cloud || 0, up = opts.up, M = opts.frame;
      dome.position.copy(opts.camera.position); airDome.position.copy(opts.camera.position);
      U.uUp.value.copy(up); U.uTime.value = t; U.uCloud.value = cloud; U.uFlash.value = w.flash || 0;
      let dayAll = 0;
      out.sunCol1.setRGB(0, 0, 0); out.sunDir1.copy(up);
      for (let i = 0; i < 2; i++) {
        const s = data.suns[i];
        if (!s) { U.uSunCol.value[i].setRGB(0, 0, 0); continue; }
        const L = U.uSunDir.value[i].copy(s.dir).applyMatrix4(M).normalize();
        U.uSunCol.value[i].copy(s.color).multiplyScalar(s.strength);
        U.uSunAng.value[i] = s.ang; U.uSunKind.value[i] = s.kind;
        const el = L.dot(up);
        const day = THREE.MathUtils.smoothstep(el, -0.12, 0.10) * Math.min(s.strength, 1) * (s.kind ? 0.15 : 1);
        dayAll += day;
        // direct light: gone below the horizon, reddened low through the air, dimmed by cloud
        const vis = THREE.MathUtils.smoothstep(el, -0.04, 0.06);
        const low = air * (1 - THREE.MathUtils.smoothstep(el, 0, 0.35));
        tmpC.copy(WHITE).lerp(RED, low * 0.85);
        const col = i === 0 ? out.sunCol0 : out.sunCol1;
        col.copy(s.color).multiply(tmpC).multiplyScalar(s.strength * vis * (1 - 0.82 * cloud));
        (i === 0 ? out.sunDir0 : out.sunDir1).copy(L);
      }
      dayAll = Math.min(1, dayAll);
      out.day = dayAll;
      // ambient: the lit sky, the cloud deck, starlight
      out.ambient.setRGB(0.010, 0.012, 0.018)
        .add(tmpC.copy(horizon).multiplyScalar(air * dayAll * 0.45 * (1 - cloud * 0.4)))
        .add(tmpC.copy(w.cloudCol || horizon).multiplyScalar(cloud * dayAll * 0.45));
      if (air < 0.1) out.ambient.add(tmpC.copy(data.suns[0] ? data.suns[0].color : WHITE).multiplyScalar(dayAll * 0.05));   // light thrown back by the ground
      if (w.flash) out.ambient.addScalar(w.flash * 0.6);
      // haze in the sky's colour; weather's fog on top
      out.fogColor.copy(horizon).lerp(zenith, 0.3).multiplyScalar(dayAll * air + 0.02);
      out.fog = air * 0.00028;
      if (w.fog) {
        tmpC.copy(w.fogCol || horizon).multiplyScalar(0.06 + 0.94 * dayAll);
        out.fogColor.lerp(tmpC, Math.min(1, w.fog));
        out.fog += w.fog * 0.004;
      }
      U.uCloudCol.value.copy(w.cloudCol || horizon);
      U.uFogCol.value.copy(out.fogColor); U.uFogAmt.value = Math.min(1, (w.fog || 0) * 0.8);
      // the other planets: points; the big ones: bodies lit by the star
      pts.forEach((b, i) => { tmp.copy(b.dir).applyMatrix4(M).normalize(); U.uPts.value[i].set(tmp.x, tmp.y, tmp.z, b.mag); });
      for (const d of discs) {
        tmp.copy(d.b.dir).applyMatrix4(M).normalize();
        const above = tmp.dot(up) > -0.05;
        d.body.group.visible = above && cloud < 0.7;
        d.body.group.position.copy(opts.camera.position).addScaledVector(tmp, SKY_DIST);
        const sunDir = tmp.copy(d.b.sunFrom).applyMatrix4(M).normalize();
        d.body.update(t, 0.016, { sunDir, center: opts.camera.position, renderer });
      }
      return out;
    },
    dispose() { clearDiscs(); domeGeo.dispose(); airGeo.dispose(); dome.material.dispose(); airDome.material.dispose(); },
  };
}

Object.assign(SK, { WORLD_GROUPS, worldsOf, skyOf, frame, thetaFor, hourAt, createSky });
})();
