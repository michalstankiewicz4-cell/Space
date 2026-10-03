/* =======================================================================
   BASEKIT — planetary base modules (window.BaseKit)
   =======================================================================
   A classic script like ShipKit and BodyKit: the building lab
   (buildings.html) and the surface lab (surface.html) use it; the game can
   later. Built from ShipKit's generators (plating, solar cells, struts) —
   needs THREE and window.ShipKit. Not in the game yet (docs/surface.md).

   Units are metres, origin at the module's base centre, up +Y, "front"
   +Z. Every module stands on its own footprint (a circle, `footprint`).

   API
     MODULES                          [{ id, name, footprint, height, maxSlope,
                                       build: seconds, cost: [[material, n]],
                                       wet: may stand in shallow water }]
     buildModule(id, { detail })    → module:
       group                          THREE.Group (add it to your scene)
       ghost                          the same shape as a hologram (a Group)
       setProgress(p, worldUp?)       0..1 construction: the solid model grows
                                      from the ground (a clipping plane), the
                                      ghost shows the rest, a glowing ring at
                                      the front of the work; 1 = finished
       setGhostState("ok" | "bad")    a placement preview: cyan or red
       update(t, dt)                  animated parts (lights, the drill, the
                                      hologram's scanlines)
       height, footprint
     disposeModule(module)
   Renderer: construction needs renderer.localClippingEnabled = true.
   ======================================================================= */
window.BaseKit = (function () {
"use strict";
const SK = window.ShipKit;

// ---------- shared materials (one set, cached) ----------
let M = null;
function mats() {
  if (M) return M;
  const plate = SK.makePlating({ seed: 61, size: 512, base: [168, 172, 180], minPanel: 40, maxPanel: 150,
    stripes: [{ y: 0.86, h: 0.03, color: "#f8bb56" }] });
  const dark = SK.makePlating({ seed: 62, size: 512, base: [86, 92, 104], minPanel: 30, maxPanel: 120 });
  const padTex = padTexture();
  const solar = SK.makeSolarCells({ seed: 63, cols: 6, rows: 3 });
  for (const t of [...Object.values(plate), ...Object.values(dark), padTex, solar]) SK.allTextures.add(t);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    hull: std({ map: plate.map, roughnessMap: plate.roughnessMap, bumpMap: plate.bumpMap, bumpScale: 0.03, metalness: 0.55, roughness: 0.6 }),
    dark: std({ map: dark.map, roughnessMap: dark.roughnessMap, bumpMap: dark.bumpMap, bumpScale: 0.03, metalness: 0.7, roughness: 0.55 }),
    frame: std({ color: 0x8c929e, metalness: 0.9, roughness: 0.4 }),
    gold: std({ color: 0xf8bb56, metalness: 1, roughness: 0.32 }),
    pad: std({ map: padTex, metalness: 0.4, roughness: 0.75 }),
    solar: std({ map: solar, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x86c9c0, metalness: 0.1, roughness: 0.05, clearcoat: 1,
      transparent: true, opacity: 0.32, depthWrite: false }),
    window: std({ color: 0x1b2130, emissive: 0xffcf8a, emissiveIntensity: 1.6 }),
    teal: std({ color: 0x0b3a33, emissive: 0x4fe3c6, emissiveIntensity: 2.0 }),
    hot: std({ color: 0x2a0d05, emissive: 0xff6a20, emissiveIntensity: 2.2 }),
    garden: std({ color: 0x14360f, emissive: 0x3fbf3a, emissiveIntensity: 1.1, roughness: 0.8 }),
  };
  return M;
}
// the landing pad's surface: dark concrete, a hex border, an H in a ring
function padTexture() {
  const S = 512, [c, ctx] = SK.util.canvas(S, S);
  ctx.fillStyle = "#3a3e46"; ctx.fillRect(0, 0, S, S);
  const r = SK.util.rng(9);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.03 + r() * 0.05})`; ctx.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6); }
  ctx.strokeStyle = "#f8bb56"; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f8bb56";
  ctx.fillRect(S * 0.38, S * 0.36, S * 0.05, S * 0.28); ctx.fillRect(S * 0.57, S * 0.36, S * 0.05, S * 0.28); ctx.fillRect(S * 0.38, S * 0.475, S * 0.24, S * 0.05);
  ctx.strokeStyle = "#e6ebff"; ctx.lineWidth = 6; ctx.setLineDash([26, 18]);
  ctx.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; ctx[k ? "lineTo" : "moveTo"](S / 2 + Math.cos(a) * S * 0.46, S / 2 + Math.sin(a) * S * 0.46); } ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

// ---------- small builders ----------
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }
function light(color, size) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: SK.makeGlow ? glowTex() : null, color, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true }));
  sp.scale.setScalar(size);
  sp.userData.blink = true;
  return sp;
}
let GLOW = null;
function glowTex() {
  if (GLOW) return GLOW;
  const [c, ctx] = SK.util.canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return (GLOW = new THREE.CanvasTexture(c));
}
// four splayed legs with feet, from the corners of a square of half-size s
function legs(g, s, h, mat, seg) {
  for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) {
    g.add(SK.strut(new THREE.Vector3(x * 0.8, h, z * 0.8), new THREE.Vector3(x * 1.1, 0.15, z * 1.1), 0.16, mat, seg));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.15, seg), mat, x * 1.1, 0.07, z * 1.1));
  }
}

// ---------- the modules ----------
const MODULES = [
  { id: "pad", name: "LANDING PAD", footprint: 10, height: 1.2, maxSlope: 0.12, build: 40,
    cost: [["concrete", 30], ["hull plating", 6]],
    make(g, m, seg) {
      const plate = mesh(new THREE.CylinderGeometry(9, 9.4, 0.6, 6), [m.dark, m.pad, m.dark], 0, 0.3, 0);
      plate.rotation.y = Math.PI / 6; g.add(plate);
      g.userData.lights = [];
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 8.6, z = Math.sin(a) * 8.6;
        g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, seg(8, 4)), m.frame, x, 0.85, z));
        const l = light(k % 2 ? 0x4fe3c6 : 0xf8bb56, 1.2); l.position.set(x, 1.2, z); l.userData.phase = k; g.add(l); g.userData.lights.push(l);
      }
    } },
  { id: "hab", name: "HABITAT", footprint: 7, height: 6.5, maxSlope: 0.18, build: 90,
    cost: [["hull plating", 24], ["glass", 10], ["electronics", 6]],
    make(g, m, seg) {
      g.add(mesh(new THREE.CylinderGeometry(6, 6.3, 2.6, seg(32, 12)), m.hull, 0, 1.3, 0));
      const band = mesh(new THREE.CylinderGeometry(6.04, 6.04, 0.5, seg(32, 12), 1, true), m.window, 0, 1.6, 0); g.add(band);
      const dome = mesh(new THREE.SphereGeometry(5.6, seg(32, 12), seg(16, 6), 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, 2.6, 0);
      dome.castShadow = false; g.add(dome);
      for (let k = 0; k < 8; k++) {                           // the dome's ribs
        const rib = mesh(new THREE.TorusGeometry(5.62, 0.09, 6, seg(24, 8), Math.PI), m.frame, 0, 2.6, 0);
        rib.rotation.y = k / 8 * Math.PI; g.add(rib);
      }
      g.add(mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.4, seg(24, 10)), m.garden, 0, 2.8, 0));   // the garden under the dome
      const door = mesh(new THREE.BoxGeometry(2.4, 2.2, 1.6), m.dark, 0, 1.1, 6.3); g.add(door);
      g.add(mesh(new THREE.BoxGeometry(1.4, 1.5, 0.1), m.teal, 0, 1.15, 7.12));
    } },
  { id: "solar", name: "SOLAR ARRAY", footprint: 7, height: 4.2, maxSlope: 0.22, build: 45,
    cost: [["silicon", 18], ["hull plating", 4]],
    make(g, m, seg) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = (i - 1) * 4.2, z = (j - 0.5) * 5;
        g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.2, seg(8, 4)), m.frame, x, 1.1, z));
        // a panel: the cells on top, a thin frame under them, tilted toward the sky
        const panel = new THREE.Group(); panel.position.set(x, 2.35, z); panel.rotation.x = 0.45;   // facing the front (+Z)
        panel.add(mesh(new THREE.BoxGeometry(3.8, 0.06, 2.4), [m.frame, m.frame, m.solar, m.frame, m.frame, m.frame], 0, 0.04, 0));
        panel.add(mesh(new THREE.BoxGeometry(3.9, 0.05, 0.12), m.frame, 0, 0, 1.2));
        panel.add(mesh(new THREE.BoxGeometry(3.9, 0.05, 0.12), m.frame, 0, 0, -1.2));
        g.add(panel);
      }
      g.add(mesh(new THREE.BoxGeometry(1.2, 1, 1.2), m.dark, 6.6, 0.5, 0));     // the inverter box
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.12, 0.05), m.teal, 6.6, 0.75, 0.61));
    } },
  { id: "drill", name: "MINE", footprint: 6, height: 15, maxSlope: 0.25, build: 120,
    cost: [["steel", 20], ["hull plating", 8], ["electronics", 4]],
    make(g, m, seg) {
      g.add(mesh(new THREE.BoxGeometry(7, 1, 7), m.dark, 0, 0.5, 0));
      const top = 13, s = 2.2;                             // the lattice tower
      for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) g.add(SK.strut(new THREE.Vector3(x, 1, z), new THREE.Vector3(x * 0.35, top, z * 0.35), 0.13, m.frame, seg(6, 4)));
      for (let y = 3; y < top; y += 2.5) {
        const k = 1 - (y - 1) / (top - 1) * 0.65, q = s * k;
        g.add(SK.strut(new THREE.Vector3(q, y, q), new THREE.Vector3(-q, y, -q), 0.06, m.frame, 4));
        g.add(SK.strut(new THREE.Vector3(-q, y, q), new THREE.Vector3(q, y, -q), 0.06, m.frame, 4));
      }
      g.add(mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), m.hull, 0, top + 0.6, 0));
      const drill = mesh(new THREE.CylinderGeometry(0.35, 0.35, top - 1, seg(10, 6)), m.gold, 0, top / 2, 0);
      drill.userData.spin = 2.5; g.add(drill);
      g.add(mesh(new THREE.BoxGeometry(2.6, 2.2, 2.4), m.hull, 4.2, 1.6, 0));   // the ore hopper
      g.add(mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), m.hot, 4.2, 2.3, 1.22));
      const l = light(0xff5a3c, 1.4); l.position.set(0, top + 1.6, 0); l.userData.phase = 0; g.add(l); g.userData.lights = [l];
    } },
  { id: "refinery", name: "REFINERY", footprint: 8, height: 11, maxSlope: 0.15, build: 150,
    cost: [["steel", 26], ["hull plating", 10], ["electronics", 8]],
    make(g, m, seg) {
      g.add(mesh(new THREE.BoxGeometry(12, 0.6, 9), m.dark, 0, 0.3, 0));
      for (const x of [-3.5, 0]) {                          // two tall tanks
        g.add(mesh(new THREE.CylinderGeometry(1.8, 1.8, 7, seg(20, 10)), m.hull, x, 4.1, -2));
        g.add(mesh(new THREE.SphereGeometry(1.8, seg(20, 10), seg(10, 5), 0, Math.PI * 2, 0, Math.PI / 2), m.hull, x, 7.6, -2));
        g.add(mesh(new THREE.TorusGeometry(1.85, 0.09, 6, seg(20, 10)), m.gold, x, 5.5, -2).rotateX(Math.PI / 2));
      }
      const h = mesh(new THREE.CylinderGeometry(1.4, 1.4, 6, seg(18, 8)), m.hull, 1, 2.2, 2.4); h.rotation.z = Math.PI / 2; g.add(h);   // a lying tank
      g.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 10, seg(12, 6)), m.dark, 4.8, 5.3, -2.5));      // the stack
      const ember = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, seg(12, 6)), m.hot, 4.8, 10.4, -2.5); g.add(ember);
      for (const [a, b] of [[[-3.5, 3, -0.2], [-0.6, 2.2, 2.4]], [[0, 5, -0.2], [0, 2.4, 1.0]], [[1.6, 1.2, -2], [4.2, 1.2, -2.5]]])
        g.add(SK.strut(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.18, m.frame, seg(8, 4)));
      const l = light(0xff8a3c, 1.6); l.position.set(4.8, 11, -2.5); l.userData.phase = 2; g.add(l); g.userData.lights = [l];
    } },
  { id: "depot", name: "DEPOT", footprint: 7, height: 6.5, maxSlope: 0.2, build: 60,
    cost: [["hull plating", 16], ["steel", 8]],
    make(g, m, seg) {
      g.add(mesh(new THREE.BoxGeometry(11, 0.4, 9), m.dark, 0, 0.2, 0));
      const cont = (x, z, y, ry) => { const c = mesh(new THREE.BoxGeometry(4.2, 2.1, 2.1), m.hull, x, y, z); c.rotation.y = ry; g.add(c);
        const s = mesh(new THREE.BoxGeometry(4.24, 0.12, 2.14), m.teal, x, y + 0.4, z); s.rotation.y = ry; g.add(s); };
      cont(-2.6, 2, 1.45, 0); cont(-2.6, -0.4, 1.45, 0); cont(-2.6, 0.8, 3.55, 0.05);
      g.add(mesh(new THREE.CylinderGeometry(2, 2, 5.5, seg(20, 10)), m.hull, 2.8, 3.15, 0));   // the silo
      g.add(mesh(new THREE.ConeGeometry(2.05, 1.2, seg(20, 10)), m.dark, 2.8, 6.5, 0));
      legs(g, 1.5, 0.6, m.frame, seg(6, 4));
    } },
];

// ---------- the hologram ----------
const HOLO_VERT = `
varying vec3 vN; varying vec3 vW; varying float vY;
void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const HOLO_FRAG = `
uniform vec3 uColor; uniform float uTime, uFrom;
varying vec3 vN; varying vec3 vW; varying float vY;
void main(){
  if (vY < uFrom) discard;                                       // under the work's front: the solid model is there
  float fres = pow(1.0 - abs(normalize(vN).z), 2.0);
  float scan = 0.55 + 0.45 * sin(vW.y * 6.0 - uTime * 4.0);
  float a = (0.12 + fres * 0.6) * scan;
  gl_FragColor = vec4(uColor * (0.6 + fres), a);
}`;
function holoMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x4fe3c6) }, uTime: { value: 0 }, uFrom: { value: -1e9 } },
    vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function buildModule(id, { detail = 1 } = {}) {
  const def = MODULES.find((d) => d.id === id);
  if (!def) throw new Error("BaseKit: unknown module " + id);
  const m = mats(), seg = (n = 16, min = 3) => Math.max(min, Math.round(n * detail));
  // root: the solid model, its hologram and the construction ring
  const root = new THREE.Group(), solid = new THREE.Group();
  def.make(solid, m, seg);
  const lights = solid.userData.lights || [];
  const ghost = new THREE.Group(), holo = holoMaterial();
  solid.updateMatrixWorld(true);
  solid.traverse((o) => {
    if (!o.isMesh) return;
    const gm = new THREE.Mesh(o.geometry, holo);
    gm.matrixAutoUpdate = false; gm.matrix.copy(o.matrixWorld);      // solid is at the origin: its world = its own space
    ghost.add(gm);
  });
  // construction: a clipping plane on the solid model's materials (cloned per module)
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), cloned = new Map();
  solid.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const next = list.map((mt) => { if (!cloned.has(mt)) { const c = mt.clone(); c.clippingPlanes = [clip]; cloned.set(mt, c); } return cloned.get(mt); });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(def.footprint * 0.92, def.footprint, 48), new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false;
  root.add(solid, ghost, ring);
  ghost.renderOrder = 2;
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(), spinners = [];
  solid.traverse((o) => { if (o.userData.spin) spinners.push(o); });
  let progress = 1;
  const mod = {
    id, def, group: root, solid, ghost, footprint: def.footprint, height: def.height,
    // 0..1: the solid model grows from the ground, the hologram shows the rest
    setProgress(p) {
      progress = Math.max(0, Math.min(1, p));
      const done = progress >= 1, yCut = progress * (def.height + 0.2);
      root.updateMatrixWorld(true);
      up.set(0, 1, 0).transformDirection(root.matrixWorld);
      tmp.set(0, yCut, 0).applyMatrix4(root.matrixWorld);
      clip.normal.copy(up).negate();
      clip.constant = done ? 1e9 : up.dot(tmp);
      holo.uniforms.uFrom.value = done ? 1e9 : yCut;
      holo.uniforms.uColor.value.set(0x4fe3c6);
      solid.visible = true;
      ghost.visible = !done;
      ring.visible = progress > 0 && !done;
      ring.position.y = yCut;
      lights.forEach((l) => { l.visible = done; });
    },
    // a placement preview: only the hologram, cyan (fits) or red (doesn't)
    setGhostState(state) {
      holo.uniforms.uColor.value.set(state === "bad" ? 0xff5a5f : 0x4fe3c6);
      holo.uniforms.uFrom.value = -1e9;
      solid.visible = false; ghost.visible = true; ring.visible = false;
    },
    update(t, dt = 0.016) {
      holo.uniforms.uTime.value = t;
      lights.forEach((l) => { l.material.opacity = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2 + (l.userData.phase || 0))); });
      if (progress >= 1) spinners.forEach((o) => { o.rotation.y += o.userData.spin * dt; });
      if (ring.visible) ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 6);
    },
    _owned: { holo, cloned: [...cloned.values()], ring },
  };
  mod.setProgress(1);
  return mod;
}

function disposeModule(mod) {
  if (mod.group.parent) mod.group.parent.remove(mod.group);
  mod.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  mod._owned.holo.dispose(); mod._owned.cloned.forEach((m) => m.dispose());
  mod._owned.ring.material.dispose();
}

function modelStats(group) { return SK.modelStats(group); }

return { MODULES, buildModule, disposeModule, modelStats };
})();
