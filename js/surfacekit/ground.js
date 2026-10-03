/* =======================================================================
   SURFACEKIT · GROUND — being on a planet: the ground scene, the craft,
   the descent, driving, the hop and building a base
   =======================================================================
   A classic script after surfacekit.js, sky.js and weather.js (adds to
   window.SurfaceKit); needs ShipKit (the craft) and BaseKit (the modules).
   The surface lab and the game both run the ground through this — the lab
   is a lab, the game is the game, the ground is the same. docs/surface.md.

   No DOM here: the caller owns the page. It passes the keys and the
   pointer, renders G.scene with G.camera into its own viewport, and shows
   what update() returns (speed, altitude, the compass) and what the calls
   return (why a module doesn't fit — as a code, for its own language).

   The descent (enter(dir, "air")) is procedural:
     - a world with air: entry from ENTRY_TOP — a plasma sheath on the
       craft's belly, a glowing wake, speed streaks, the camera shaking,
       haze, and a cloud layer to fall through if the world has clouds;
     - then the burn from BURN_TOP: the engines brake it down to the ground;
     - an airless world: only the burn, from AIRLESS_TOP.

   API
     createGround(renderer, { env, onEvent }) → G
       G.scene, G.camera, G.P (the craft: dir, fwd, speed, r)
       G.setWorld({ ref, values, skyData, key })   which world (before enter)
       G.full, G.skyData, G.theta                  the world's values, sky, spin angle
       G.enter(dir, from)       onto the ground at a unit direction (the
                                body's frame); from "air": the descent
       G.update(dt, t, keys, pointer) → info: { phase, speed, alt, lat, lon,
                                sunEl, base: { dist, ang } | null, tiles }
       G.takeOff(then), G.hop() → km | null (no base)
       G.startBuild(id), G.cancelBuild(), G.rotateBuild(), G.building
       G.place() → { ok, why, name, founded }, G.removeUnderPointer() → name | null
       G.drag(dx, dy), G.zoom(deltaY), G.setAspect(a)
       G.weatherList(), G.setWeather(id, strength)
       G.setHour(h, at?), G.hourAt(dir), G.daySecs (0: paused), G.dayPaused
       G.setGraphics({ detail, particles, octaves })   the caller's graphics
                                settings (the game's Setup; the lab: 1, on, 6)
       G.leave(), G.dispose()
     onEvent(name, data): "landed", "founded", "placed", "removed"
     validate codes: "far" (BASE_RADIUS), "unloaded", "wet", "steep", "close" (+ name)
   ======================================================================= */
(function () {
"use strict";
const SK = window.SurfaceKit;
const BASE_RADIUS = 600;                     // metres from the base's centre
const HOVER = 3;                             // the craft's height over the ground
const ENTRY_TOP = 3000, BURN_TOP = 1200, AIRLESS_TOP = 900;
const ENTRY_S = 5, BURN_S = 5, ASCENT_S = 3, ASCENT_TOP = 650;
const CLOUD_LO = 850, CLOUD_HI = 1450;          // the cloud deck the descent falls through
const FAR_SINK = 0.996;                        // the far globe sits this much under the tiles (~30 m on Terra)                           // up high the air hides the edge of the loaded ground
const lum = (c) => Math.max(c.r, c.g, c.b);
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// ---------- the entry effects ----------
// The bow shock: a cup under the belly (it falls along -Y), white-hot at the
// tip, orange to the rim, with bands flowing up its sides. The wake: faint
// filaments streaming up from the rim. Speed streaks pass the craft.
const PLASMA_VERT = `varying vec3 vN, vV, vP; void main(){ vP = position; vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SHOCK_FRAG = `uniform float uI, uT; uniform vec3 uHot, uCool; varying vec3 vN, vV, vP;
void main(){
  float up = clamp((vP.y + 2.6) / 6.0, 0.0, 1.0);                   // 0 at the tip, 1 at the rim
  float ang = atan(vP.z, vP.x);
  float bands = 0.82 + 0.18 * sin(ang * 7.0 + vP.y * 1.3 - uT * 21.0) * sin(ang * 3.0 - uT * 9.0 + vP.y * 0.7);
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 col = mix(uHot, uCool, smoothstep(0.0, 0.7, up));
  float a = uI * (1.0 - up) * bands * (0.6 + rim * 0.6);
  gl_FragColor = vec4(col * a * 1.5, a);
}`;
const WAKE_FRAG = `uniform float uI, uT; uniform vec3 uCool; varying vec3 vN, vV, vP;
void main(){
  float along = clamp(vP.y, 0.0, 1.0);                             // 0 at the craft, 1 at the tail's end
  float ang = atan(vP.z, vP.x);
  float fil = pow(abs(sin(ang * 5.0 + along * 4.0 - uT * 6.0)), 6.0);
  float a = uI * 0.45 * (1.0 - along) * (1.0 - along) * fil * (0.8 + 0.2 * sin(uT * 31.0 - along * 20.0));
  gl_FragColor = vec4(uCool * a, a);
}`;
const JET_FRAG = `uniform float uJ, uT; varying vec3 vN, vV, vP;
void main(){
  float along = clamp(-vP.y, 0.0, 1.0);                            // 0 at the nozzle, 1 at the tip
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = uJ * (1.0 - along) * (0.35 + 0.65 * (1.0 - rim)) * (0.85 + 0.15 * sin(uT * 60.0 + along * 25.0));
  gl_FragColor = vec4(mix(vec3(0.75, 0.85, 1.0), vec3(0.3, 0.5, 1.0), along) * a, a);
}`;
function softSprite() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  for (let k = 0; k < 7; k++) {                                      // a lumpy puff, not a disc
    const x = 64 + (Math.sin(k * 2.1) * 14), y = 64 + (Math.cos(k * 1.7) * 10), r = 30 + (k % 3) * 7;   // stays inside the canvas
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function makeEntryFx() {
  const root = new THREE.Group();
  const U = { uI: { value: 0 }, uT: { value: 0 }, uJ: { value: 0 }, uHot: { value: new THREE.Color(1, 0.72, 0.38) }, uCool: { value: new THREE.Color(1, 0.3, 0.06) } };
  const blend = (frag) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: U, vertexShader: PLASMA_VERT, fragmentShader: frag });
  // the cup: y = -2.6 at the tip, up to the rim (r 7) at y 3.4
  const prof = [];
  for (let i = 0; i <= 16; i++) { const r = i / 16 * 9; prof.push(new THREE.Vector2(Math.max(0.05, r), -2.6 + Math.pow(r / 9, 2) * 6)); }
  const shock = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), blend(SHOCK_FRAG));
  shock.scale.set(1, 1, 1.3);
  const wakeGeo = new THREE.CylinderGeometry(10, 7, 1, 40, 10, true); wakeGeo.translate(0, 0.5, 0);
  const wake = new THREE.Mesh(wakeGeo, blend(WAKE_FRAG));
  wake.scale.set(1, 45, 1.3); wake.position.y = 3;
  // the landing jets: a cone down from the belly
  const jetGeo = new THREE.ConeGeometry(1.1, 1, 20, 4, true); jetGeo.rotateX(Math.PI); jetGeo.translate(0, -0.5, 0);
  const jet = new THREE.Mesh(jetGeo, blend(JET_FRAG));
  jet.position.y = -0.9;
  // speed streaks: segments around the craft, streaming up past it
  const N = 120, pos = new Float32Array(N * 6), seeds = [];
  const seed = (s) => { s.a = Math.random() * Math.PI * 2; s.r = 10 + Math.random() * 30; s.k = 0.6 + Math.random() * 0.8; return s; };
  for (let i = 0; i < N; i++) seeds.push(Object.assign(seed({}), { y: Math.random() * 200 - 100 }));
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xffd6a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const streaks = new THREE.LineSegments(sg, streakMat);
  streaks.frustumCulled = false;
  root.add(shock, wake, streaks, jet);
  return {
    root, U,
    // heat 0..1, jets 0..1, speed: m/s down; air: the sky's colour tints the cool end
    update(t, dt, heat, jets, speed, air) {
      shock.visible = wake.visible = streaks.visible = heat > 0.01;
      jet.visible = jets > 0.01;
      U.uI.value = heat; U.uJ.value = jets; U.uT.value = t;
      jet.scale.set(1 + jets * 0.4, 4 + jets * 9, 1 + jets * 0.4);
      if (!streaks.visible) return;
      U.uCool.value.setRGB(1, 0.3, 0.06).lerp(air, 0.15);
      const len = Math.min(35, 4 + speed * 0.03);
      for (let k = 0; k < N; k++) {
        const s = seeds[k];
        s.y += speed * s.k * dt * 0.35;
        if (s.y > 100) { s.y -= 200; seed(s); }
        const x = Math.cos(s.a) * s.r, z = Math.sin(s.a) * s.r;
        pos[k * 6] = x; pos[k * 6 + 1] = s.y; pos[k * 6 + 2] = z;
        pos[k * 6 + 3] = x; pos[k * 6 + 4] = s.y + len * s.k; pos[k * 6 + 5] = z;
      }
      sg.attributes.position.needsUpdate = true;
      streakMat.opacity = Math.min(1, heat * 1.3) * 0.3;
    },
    dispose() { [shock, wake, jet].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); sg.dispose(); streakMat.dispose(); },
  };
}

// dust (or spray over water) blown out by the jets near the ground
function makeDust(tex) {
  const root = new THREE.Group(), mats = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    mats.push(m); root.add(new THREE.Sprite(m));
  }
  const tmpD = new THREE.Vector3();
  return {
    root,
    // amount 0..1 at the spot (dir, ground radius), coloured `color`
    update(t, amount, dir, gr, R, color) {
      root.visible = amount > 0.01;
      if (!root.visible) return;
      root.children.forEach((s, i) => {
        const f = (t * 0.55 + i / 18) % 1, a = i / 18 * Math.PI * 2 + Math.sin(i * 7.3) * 0.3, rr = 5 + f * 34;
        tmpD.copy(SK.offsetDir(dir, Math.cos(a) * rr, Math.sin(a) * rr, R));
        s.position.copy(tmpD).multiplyScalar(gr + 1.5 + f * 4);
        s.scale.setScalar(6 + f * 18);
        mats[i].color.copy(color); mats[i].opacity = amount * (1 - f) * 0.7;
      });
    },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}

// a ring of cloud puffs around the descent column, to fall through
function makeCloudLayer(tex) {
  const root = new THREE.Group(), mats = [];
  for (let i = 0; i < 70; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    s.userData.seed = { e: (Math.random() * 2 - 1), n: (Math.random() * 2 - 1), h: Math.random(), size: 160 + Math.random() * 260 };
    mats.push(m); root.add(s);
  }
  root.visible = false;
  return {
    root,
    // around dir, between lo and hi metres over a ground of radius R
    place(dir, R, lo, hi) {
      root.children.forEach((s) => {
        const sd = s.userData.seed, d = SK.offsetDir(dir, sd.e * 700, sd.n * 700, R);
        s.position.copy(d).multiplyScalar(R + lo + (hi - lo) * sd.h);
        s.scale.setScalar(sd.size);
      });
    },
    update(show, color, opacity) {
      root.visible = show && opacity > 0.01;
      if (!root.visible) return;
      mats.forEach((m) => { m.color.copy(color); m.opacity = opacity; });
    },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}

// ---------- the ground ----------
function createGround(renderer, opts = {}) {
  const env = opts.env || null, emit = opts.onEvent || (() => {});
  const scene = new THREE.Scene();
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 60000);
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.4), hemi = new THREE.HemisphereLight(0x9fb3ff, 0x3a2a1a, 0.35);
  const sunLight2 = new THREE.DirectionalLight(0xffffff, 0);
  // the craft's lamp (lights the modules; the ground's shader has its own cone)
  const lamp = new THREE.SpotLight(0xfff0d0, 0, 260, 0.5, 0.5, 1.2);
  scene.add(sunLight, sunLight.target, hemi, sunLight2, sunLight2.target, lamp, lamp.target);
  const sky = SK.createSky(renderer), weather = SK.createWeather();
  scene.add(sky.root, weather.root);
  // the craft: ShipKit's swarm ship as a 7 m hover craft (VehicleKit's rover
  // later), always close to the camera: Setup's detail as is (like the drone)
  const gfx = { detail: 1, particles: true, octaves: 6 };
  let craftModel = null, craft = null;
  function buildCraft() {
    if (craft) { scene.remove(craft); ShipKit.disposeShipModel(craftModel); }
    craftModel = ShipKit.buildShipModel("swarmer", { detail: gfx.detail, envMap: env });
    craft = ShipKit.makeGameHolder(craftModel, 7);
    scene.add(craft);
  }
  buildCraft();
  const puff = softSprite(), fx = makeEntryFx(), clouds = makeCloudLayer(puff), dust = makeDust(puff);
  scene.add(fx.root, clouds.root, dust.root);

  const P = { dir: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1), speed: 0, r: 0, camYaw: 0, camPitch: 0.32, camDist: 26, lookUp: 0 };
  const W = { ref: null, values: {}, full: null, skyData: null, key: "", R: 0 };
  let surf = null, far = null, skyKey = "", theta = 0, lampOn = 0, light = { day: 1 };
  let phase = "none", phaseT = 0, after = null, top = 0, entry = false, wxId = "clear", wxStrength = 0.7;
  let building = null, buildRot = 0, pointer = null;
  const baseObjs = [];
  let beacon = null;
  const ray = new THREE.Raycaster(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camUp = new THREE.Vector3();
  const Mframe = new THREE.Matrix4(), basis = new THREE.Matrix4(), shake = new THREE.Vector3(), dusk = new THREE.Color(), dustCol = new THREE.Color();
  let down = 0;

  const G = {
    scene, camera, P, get craft() { return craft; }, daySecs: 120, dayPaused: false,
    get full() { return W.full; }, get skyData() { return W.skyData; }, get theta() { return theta; }, set theta(v) { theta = v; },
    get surf() { return surf; }, get building() { return building; }, get phase() { return phase; }, get light() { return light; },
  };

  G.setWorld = function ({ ref, values, skyData, key }) {
    W.ref = ref; W.values = values || {}; W.skyData = skyData; W.key = key || ref;
    const [g, b] = ref.split("/"), tt = BodyKit.planetTerrain(g, b, W.values);
    W.full = tt.values; W.R = Math.max(0.15, tt.values.size) * SK.M_PER_SIZE; tt.dispose();
  };
  G.groundRadiusM = () => W.R;
  G.setGraphics = function (o) {
    const detailChanged = o.detail != null && o.detail !== gfx.detail;
    Object.assign(gfx, o);
    if (far) far.setOctaves(gfx.octaves);
    if (detailChanged) { buildCraft(); if (surf) buildBase(); }
  };
  G.hourAt = (dir) => SK.hourAt(W.skyData, W.full, dir, theta);
  G.setHour = (h, at) => { theta = SK.thetaFor(W.skyData, W.full, at || P.dir, h); };
  G.advanceDay = (dt, at) => { if (G.daySecs && !G.dayPaused) G.setHour((G.hourAt(at || P.dir) + 24 * dt / G.daySecs) % 24, at); };

  // ---------- weather ----------
  G.weatherList = () => SK.weatherFor(W.full);
  G.setWeather = (id, strength) => {
    if (id != null) wxId = id;
    if (strength != null) wxStrength = strength;
    weather.set(wxId, wxStrength, new THREE.Color(0.72, 0.46, 0.3).lerp(sky.horizon, 0.35));
  };

  // ---------- the base on the ground ----------
  function placeOnGround(obj, dir, rot) {
    const g = surf.groundAt(dir), r = g ? g.r : surf.R;
    const up = dir.clone(), { north } = SK.tangentFrame(dir);
    const fwd = north.clone().applyAxisAngle(up, rot), right = new THREE.Vector3().crossVectors(up, fwd);
    obj.position.copy(dir).multiplyScalar(r);
    obj.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, fwd));
  }
  function clearBase() {
    baseObjs.forEach((o) => { scene.remove(o.mod.group); BaseKit.disposeModule(o.mod); });
    baseObjs.length = 0;
    if (beacon) { scene.remove(beacon); beacon.geometry.dispose(); beacon.material.dispose(); beacon = null; }
  }
  function buildBase() {
    clearBase();
    const base = SK.bases.get(W.ref);
    if (!base) return;
    const c = SK.latLonToDir(base.lat, base.lon);
    for (const m of base.modules) {
      const mod = BaseKit.buildModule(m.type, { detail: 0.8 * gfx.detail });
      const d = SK.offsetDir(c, m.e, m.n, surf.R);
      surf.ensure(d);
      placeOnGround(mod.group, d, m.rot);
      scene.add(mod.group);
      baseObjs.push({ mod, m, dir: d });
    }
    surf.ensure(c);
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 900, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xf8bb56, transparent: true,
      opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beacon.geometry.translate(0, 450, 0);
    placeOnGround(beacon, c, 0);
    scene.add(beacon);
  }
  const groundRadius = (dir) => { const g = surf.groundAt(dir); return g ? g.r : null; };

  // ---------- onto the ground ----------
  G.enter = function (dir, from) {
    if (!surf || surf.key !== W.key) {
      if (surf) { scene.remove(surf.root); surf.dispose(); }
      surf = SK.createSurface(renderer, W.ref, W.values);
      surf.key = W.key;
      scene.add(surf.root);
      // the rest of the planet beyond the loaded tiles: its own globe (no
      // clouds, no air shell, held still) a little under the ground, so the
      // horizon and the view from high up are the planet, not a hole
      if (far) { scene.remove(far.group); BodyKit.disposeBody(far); }
      const [g, b] = W.ref.split("/");
      far = BodyKit.buildBody(g, b, { detail: 1, values: Object.assign({}, W.values, { spin: 0, tilt: 0 }) });
      far.setRadius(surf.R * FAR_SINK);
      far.setOctaves(gfx.octaves);
      far.group.traverse((o) => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.radius > 1.001) o.visible = false; });
      scene.add(far.group);
    }
    if (skyKey !== W.key) { sky.setup(W.skyData, surf.values); skyKey = W.key; G.setWeather(); }
    const { north } = SK.tangentFrame(dir);
    P.dir.copy(dir); P.fwd.copy(north); P.speed = 0;
    surf.ensure(dir); surf.update(dir, 25);
    buildBase();
    const g = groundRadius(dir), gr = g != null ? g : surf.R;
    const air = sky.air > 0.05;
    entry = from === "air" && air;
    top = from !== "air" ? 0 : air ? ENTRY_TOP : AIRLESS_TOP;
    P.r = gr + HOVER + top;
    phase = from === "air" ? (entry ? "entry" : "burn") : "driving"; phaseT = 0;
    // the cloud deck to fall through: a cloudy world, or cloudy weather
    const cloudy = (surf.values.clouds || 0) > 0.15 || /overcast|rain|snow|haze/.test(wxId);
    clouds.place(dir, gr, CLOUD_LO, CLOUD_HI);
    clouds.cloudy = entry && cloudy;
  };
  G.takeOff = function (then) { if (phase === "driving") { phase = "ascending"; phaseT = 0; after = then; cancelBuild(); } };
  G.hop = function () {
    const b = SK.bases.get(W.ref);
    if (!b || phase !== "driving") return null;
    const c = SK.latLonToDir(b.lat, b.lon), km = SK.greatCircle(P.dir, c, surf.R) / 1000;
    G.takeOff(() => G.enter(SK.offsetDir(c, 0, -30, surf.R), "air"));
    return km;
  };
  G.leave = function () { cancelBuild(); phase = "none"; fx.update(0, 0, 0, 0, 0, sky.horizon); clouds.update(false); dust.update(0, 0); };

  // ---------- the camera ----------
  G.drag = function (dx, dy) {
    P.camYaw -= dx * 0.005;
    // dragging down past the lowest camera angle lifts the view to the sky
    const d = dy * 0.004;
    if (P.lookUp > 0 || P.camPitch + d < 0.05) { P.lookUp = Math.max(0, Math.min(1.2, P.lookUp - d)); P.camPitch = 0.05; }
    else P.camPitch = Math.min(1.4, P.camPitch + d);
  };
  G.zoom = (dy) => { P.camDist = Math.max(8, Math.min(400, P.camDist * Math.exp(dy * 0.001))); };
  G.setAspect = (a) => { camera.aspect = a; camera.updateProjectionMatrix(); };

  // ---------- building ----------
  function startBuild(id) {
    cancelBuild();
    const mod = BaseKit.buildModule(id, { detail: 0.8 * gfx.detail });
    mod.setGhostState("ok");
    scene.add(mod.group);
    building = { id, mod, ok: false, dir: null, why: "", name: "" };
  }
  function cancelBuild() {
    if (!building) return;
    scene.remove(building.mod.group); BaseKit.disposeModule(building.mod); building = null;
  }
  G.startBuild = (id) => { if (phase === "driving") startBuild(id); };
  G.cancelBuild = cancelBuild;
  G.rotateBuild = () => { buildRot += Math.PI / 4; };
  // why a module can't go here: "" (it can), or a code (+ name for "close")
  function validate(id, dir) {
    const def = BaseKit.MODULES.find((m) => m.id === id), base = SK.bases.get(W.ref);
    if (base && SK.greatCircle(SK.latLonToDir(base.lat, base.lon), dir, surf.R) > BASE_RADIUS) return { why: "far" };
    const g0 = surf.groundAt(dir); if (!g0) return { why: "unloaded" };
    // the slope: a plane fitted through 8 points on the footprint's rim (bumps
    // smaller than the module don't tilt it)
    let sx = 0, sy = 0;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, d = SK.offsetDir(dir, Math.cos(a) * def.footprint, Math.sin(a) * def.footprint, surf.R);
      const g = surf.groundAt(d); if (!g) return { why: "unloaded" };
      if (g.sea && !def.wet) return { why: "wet" };
      sx += g.r * Math.cos(a); sy += g.r * Math.sin(a);
    }
    if (g0.sea && !def.wet) return { why: "wet" };
    if (Math.hypot(sx, sy) / (4 * def.footprint) > def.maxSlope) return { why: "steep" };
    for (const o of baseObjs) if (SK.greatCircle(o.dir, dir, surf.R) < def.footprint + o.mod.footprint - 1) return { why: "close", name: o.mod.def.name };
    return { why: "" };
  }
  G.validate = validate;
  G.place = function () {
    const b = building; if (!b || !b.dir) return null;
    if (!b.ok) return { ok: false, why: b.why, name: b.name };
    let base = SK.bases.get(W.ref), founded = false;
    const def = BaseKit.MODULES.find((m) => m.id === b.id);
    if (!base) {
      const ll = SK.dirToLatLon(b.dir);
      base = { name: "BASE", lat: ll.lat, lon: ll.lon, created: Date.now(), modules: [] };
      founded = true;
    }
    const c = SK.latLonToDir(base.lat, base.lon), { east, north } = SK.tangentFrame(c);
    const off = b.dir.clone().multiplyScalar(surf.R).sub(c.clone().multiplyScalar(surf.R));
    base.modules.push({ type: b.id, e: Math.round(off.dot(east) * 10) / 10, n: Math.round(off.dot(north) * 10) / 10, rot: buildRot,
      start: Date.now(), dur: def.build * 1000 });
    SK.bases.put(W.ref, base);
    cancelBuild(); buildBase();
    emit(founded ? "founded" : "placed", { ref: W.ref, type: def.id });
    return { ok: true, founded, name: def.name };
  };
  G.removeUnderPointer = function () {
    if (!pointer) return null;
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects(baseObjs.map((o) => o.mod.solid), true);
    if (!hits.length) return null;
    const o = baseObjs.find((x) => { let p = hits[0].object; while (p) { if (p === x.mod.solid) return true; p = p.parent; } return false; });
    if (!o) return null;
    const base = SK.bases.get(W.ref);
    base.modules.splice(base.modules.indexOf(base.modules.find((m) => m.e === o.m.e && m.n === o.m.n && m.type === o.m.type)), 1);
    if (!base.modules.length) SK.bases.remove(W.ref); else SK.bases.put(W.ref, base);
    buildBase();
    emit("removed", { ref: W.ref, type: o.mod.def.id });
    return o.mod.def.name;
  };

  // ---------- the light the sky gives, onto the ground and the modules ----------
  function applyLight(L, wx, dt) {
    const U = surf.material.uniforms;
    U.uSunDir0.value.copy(L.sunDir0); U.uSunCol0.value.copy(L.sunCol0);
    U.uSunDir1.value.copy(L.sunDir1); U.uSunCol1.value.copy(L.sunCol1);
    U.uAmbient.value.copy(L.ambient); U.uFogColor.value.copy(L.fogColor); U.uFog.value = L.fog;
    U.uWet.value = wx.wet; U.uSnow.value = wx.snow;
    // the modules: the same suns as three.js lights
    sunLight.color.copy(L.sunCol0); sunLight.intensity = 2.4;
    sunLight.position.copy(craft.position).addScaledVector(L.sunDir0, 200); sunLight.target.position.copy(craft.position);
    sunLight2.color.copy(L.sunCol1); sunLight2.intensity = 2.4;
    sunLight2.position.copy(craft.position).addScaledVector(L.sunDir1, 200); sunLight2.target.position.copy(craft.position);
    hemi.color.copy(L.ambient).multiplyScalar(2.2); hemi.groundColor.copy(L.ambient).multiplyScalar(0.7); hemi.intensity = 1;
    // the lamp: on when it gets dark
    const dark = lum(L.sunCol0) + lum(L.sunCol1) + lum(L.ambient) * 2 < 0.35;
    lampOn += ((dark ? 1 : 0) - lampOn) * Math.min(1, dt * 3);
    lamp.position.copy(craft.position).addScaledVector(P.dir, 2.5).addScaledVector(P.fwd, 2);
    lamp.target.position.copy(craft.position).addScaledVector(P.fwd, 40).addScaledVector(P.dir, -8);
    lamp.intensity = lampOn * 3;
    U.uLamp.value = lampOn * 2.2; U.uLampPos.value.copy(lamp.position);
    U.uLampDir.value.subVectors(lamp.target.position, lamp.position).normalize();
  }

  // ---------- every frame ----------
  G.update = function (dt, t, keys, ptr) {
    pointer = ptr || null;
    const k = keys || {};
    let heat = 0, cine = 0, jets = 0;
    down = 0;
    if (phase === "driving") {
      const max = k.ShiftLeft || k.ShiftRight ? 180 : 60;
      const want = (k.KeyW || k.ArrowUp ? max : 0) - (k.KeyS || k.ArrowDown ? max * 0.4 : 0);
      P.speed += (want - P.speed) * Math.min(1, dt * 1.6);
      const turn = ((k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0)) * 1.2;
      P.fwd.applyAxisAngle(P.dir, turn * dt);
      // along the great circle
      const a = P.speed * dt / surf.R;
      if (a) {
        const nd = P.dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(P.fwd, Math.sin(a)).normalize();
        P.fwd.multiplyScalar(Math.cos(a)).addScaledVector(P.dir, -Math.sin(a));
        P.dir.copy(nd);
      }
      P.fwd.addScaledVector(P.dir, -P.fwd.dot(P.dir)).normalize();
      const gr = groundRadius(P.dir);
      if (gr != null) P.r += (gr + HOVER - P.r) * Math.min(1, dt * 6);
    } else if (phase === "entry" || phase === "burn" || phase === "ascending") {
      phaseT += dt;
      const gr = groundRadius(P.dir) || surf.R, r0 = P.r;
      if (phase === "entry") {
        // from ENTRY_TOP to BURN_TOP, fast, slowing a little at the end
        const k2 = Math.min(1, phaseT / ENTRY_S), e = 1 - Math.pow(1 - k2, 1.6);
        P.r = gr + HOVER + BURN_TOP + (ENTRY_TOP - BURN_TOP) * (1 - e);
        heat = smooth(0, 0.1, k2) * (1 - smooth(0.5, 0.85, k2));
        cine = 1;
        if (k2 >= 1) { phase = "burn"; phaseT = 0; top = BURN_TOP; }
      } else if (phase === "burn") {
        const k2 = Math.min(1, phaseT / BURN_S), e = 1 - Math.pow(1 - k2, 3);
        P.r = gr + HOVER + top * (1 - e);
        cine = entry ? 1 - smooth(0.2, 1, k2) : 0;
        jets = (0.35 + 0.65 * (1 - e)) * (1 - smooth(0.9, 1, k2));
        if (k2 >= 1) { phase = "driving"; entry = false; emit("landed", { ref: W.ref, dir: P.dir.clone() }); }
      } else {
        const k2 = Math.min(1, phaseT / ASCENT_S);
        P.r = gr + HOVER + ASCENT_TOP * k2 * k2;
        jets = 1 - smooth(0.5, 1, k2);
        if (k2 >= 1) { phase = "done"; const then = after; after = null; if (then) then(); if (phase === "done") return G.info(); }
      }
      down = Math.max(0, (r0 - P.r) / Math.max(dt, 1e-3));
    }
    surf.update(P.dir, phase === "entry" ? 2 : 1);
    // the craft
    craft.position.copy(P.dir).multiplyScalar(P.r);
    const right = tmp.crossVectors(P.dir, P.fwd).normalize();
    craft.quaternion.setFromRotationMatrix(basis.makeBasis(right, P.dir, P.fwd));
    const power = phase === "driving" ? 0.2 + Math.abs(P.speed) / 180 : phase === "entry" ? 0.15 : 1;
    craftModel.update(t, dt, { power, particles: gfx.particles });
    fx.root.position.copy(craft.position); fx.root.quaternion.copy(craft.quaternion);
    // the chase camera, in the local frame; the descent's view is higher and wider
    const pitch = P.camPitch + (0.85 - P.camPitch) * cine, dist = P.camDist + (55 - P.camDist) * cine;
    const back = tmp2.copy(P.fwd).applyAxisAngle(P.dir, P.camYaw).negate();
    camera.up.copy(P.dir);
    camera.position.copy(craft.position).addScaledVector(back, dist * Math.cos(pitch)).addScaledVector(P.dir, dist * Math.sin(pitch));
    const cr = camera.position.length(), cd = camUp.copy(camera.position).normalize(), cg = groundRadius(cd);
    if (cg != null && cr < cg + 2) camera.position.copy(cd).multiplyScalar(cg + 2);
    camera.lookAt(tmp.copy(craft.position).addScaledVector(P.dir, 2 - 30 * cine));
    if (heat > 0) {                                     // the buffeting
      shake.set(Math.sin(t * 53) + Math.sin(t * 31.7), Math.sin(t * 47.3) + Math.sin(t * 23.1), Math.sin(t * 41.9)).multiplyScalar(heat * 0.35);
      camera.position.add(shake);
    }
    if (P.lookUp) camera.rotateX(P.lookUp);
    // the sky, the weather, the light
    G.advanceDay(dt);
    SK.frame(W.full, theta, Mframe);
    const wx = weather.update(t, dt, { camera, up: cd, light: Math.min(1, light.day * 0.9 + 0.06), pixelHeight: renderer.domElement.height });
    camera.updateMatrixWorld();
    const L = sky.update(t, { camera, up: cd, frame: Mframe, weather: wx });
    light = L;
    applyLight(L, wx, dt);
    far.update(t, dt, { sunDir: L.sunDir0 });
    // the entry: the sheath, the haze it trails, the cloud deck
    fx.update(t, dt, heat, jets, down, sky.horizon);
    const gr0 = groundRadius(P.dir) || surf.R, alt = P.r - gr0;
    // the sky's distance haze is for the ground around you; seen from high up
    // it would wash the loaded tiles out against the far globe (which has none)
    surf.material.uniforms.uFog.value *= 1 - smooth(150, 1200, alt);
    // the jets blow dust (spray over water) as they near the ground
    const g0 = surf.groundAt(P.dir);
    if (g0 && g0.sea) dustCol.setRGB(0.92, 0.96, 1); else dustCol.setRGB(0.62, 0.53, 0.42);
    dustCol.multiply(dusk.copy(L.ambient).multiplyScalar(2.5).add(L.sunCol0).add(L.sunCol1));
    dust.update(t, jets * (1 - smooth(8, 70, alt)), P.dir, gr0, surf.R, dustCol);
    if (clouds.cloudy) {
      const near = 1 - smooth(300, 900, Math.abs(alt - (CLOUD_LO + CLOUD_HI) / 2));
      // white in daylight, grey towards night, tinted a little by the sky
      dusk.setRGB(0.96, 0.97, 1).lerp(sky.horizon, 0.15).multiplyScalar(0.05 + 0.95 * Math.min(1, light.day || 0));
      clouds.update(true, dusk, 0.25 + near * 0.55);
      if (phase === "driving") clouds.cloudy = false;
    } else clouds.update(false);
    // the base: construction progress from the clock
    const now = Date.now();
    baseObjs.forEach((o) => { o.mod.setProgress((now - o.m.start) / o.m.dur); o.mod.update(t, dt); });
    // the building hologram follows the pointer
    if (building) {
      const b = building;
      let hit = null;
      if (pointer) { ray.setFromCamera(pointer, camera); hit = ray.intersectObjects(surf.meshes)[0]; }
      b.mod.group.visible = !!hit;
      if (hit) {
        b.dir = hit.point.clone().normalize();
        const v = validate(b.id, b.dir); b.why = v.why; b.name = v.name || ""; b.ok = !b.why;
        placeOnGround(b.mod.group, b.dir, buildRot);
        b.mod.setGhostState(b.ok ? "ok" : "bad");
        b.mod.update(t, dt);
      }
    }
    return G.info();
  };

  // what the caller shows
  G.info = function () {
    const out = { phase, speed: Math.hypot(P.speed, down), alt: surf ? P.r - (groundRadius(P.dir) || P.r) : 0, sunEl: 0, base: null, tiles: surf ? surf.loadedCount() : 0 };
    const ll = SK.dirToLatLon(P.dir); out.lat = ll.lat; out.lon = ll.lon;
    if (light.sunDir0) out.sunEl = Math.asin(Math.max(-1, Math.min(1, light.sunDir0.dot(P.dir)))) * 180 / Math.PI;
    const base = W.ref && SK.bases.get(W.ref);
    if (base && surf) {
      const c = SK.latLonToDir(base.lat, base.lon), right = tmp.crossVectors(P.dir, P.fwd).normalize();
      const to = c.clone().addScaledVector(P.dir, -c.dot(P.dir)).normalize();
      out.base = { dist: SK.greatCircle(P.dir, c, surf.R), ang: Math.atan2(to.dot(right), to.dot(P.fwd)) };
    }
    return out;
  };

  G.dispose = function () {
    cancelBuild(); clearBase();
    if (surf) { scene.remove(surf.root); surf.dispose(); surf = null; }
    if (far) { scene.remove(far.group); BodyKit.disposeBody(far); far = null; }
    sky.dispose(); weather.dispose();
    fx.dispose(); clouds.dispose(); dust.dispose(); puff.dispose();
    ShipKit.disposeShipModel(craftModel);
  };
  G.sky = sky; G.weather = weather;
  return G;
}

Object.assign(SK, { createGround, BASE_RADIUS });
})();
