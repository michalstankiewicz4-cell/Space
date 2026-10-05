/* LifeKit — a humanoid head with a face that moves (js/lifekit/parts/face.js).
   Loaded after lifekit.js; used by creatures/human.js (and, later, androids
   and other humanoids). docs/life.md, "The face".

   The head is one mesh computed by a function of a direction (like a sphere
   reshaped), on a grid that is dense where the face is (the front) and
   sparse at the back. It has real openings: the eyes (an almond between the
   lids, the eyeball behind it) and the mouth (a slit between the lips, with
   teeth, a tongue and a dark mouth behind). The lids wrap the eyeball, the
   lips roll in at the slit; the openings' edges are pulled exactly onto
   their curves so they're smooth, not stepped.

   Expressions are MORPH TARGETS, named as in the common face-capture set
   (eyeBlinkLeft, jawOpen, mouthSmileLeft …): the same function computed
   again with one expression at full strength, stored as the difference.
   r128 blends the 4 strongest at a time (with normals). The jaw also opens
   the lower teeth and the tongue (their own targets).

   API
     LifeKit.face.EXPRESSIONS                 the targets' names
     LifeKit.face.build({ F, tone, hair, hairHex, irisHex, mats, detail })
       → { group, set(name, v), base, names, update(t, dt, state), gaze(yaw, pitch) }
     state: { lively (blinks, glances), talk, gait } — base values (the
     lab's sliders) plus the lively motion on top. */
(function () {
"use strict";
const LK = window.LifeKit, U = LK.util;

const EXPRESSIONS = ["eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight", "jawOpen", "mouthSmileLeft", "mouthSmileRight",
  "mouthFrownLeft", "mouthFrownRight", "mouthPucker", "browInnerUp", "browDownLeft", "browDownRight", "cheekPuff"];
const R_EYE = 0.0124, LID = 0.0014;
const HINGE = { y: -0.012, z: -0.028 };      // the jaw's hinge, in front of the ears
const JAW_MAX = 0.32;                       // radians at jawOpen = 1

// ---------- the head's shape ----------
// the skull and the face without features: a superellipsoid (squarer from
// the front, round in profile), a jaw narrowing toward the chin
// the shape in use: our skull, or another head's surface (o.baseFn), and how
// much of our own features goes on top (o.features) — set for one build
let BASE = null, FEAT = 1;
// edges: our grid pulls its nearest row onto them; a mesh's irregular
// triangles are squeezed toward them instead (no folds) — SOFT
let SOFT = false;
const snap = (v, edge, band, dir) => {   // v beyond the edge by 0…band (dir +1 above, −1 below)
  const d = (v - edge) * dir;
  if (d <= 0 || d >= band) return v;
  return SOFT ? edge + dir * band * (d / band) * (d / band) : edge;
};
function skull(d, F) {
  const ax = 0.079 * F.w, ay = 0.113, az = 0.1, pw = 2.4;
  const xy = Math.pow(Math.abs(d.x / ax) ** pw + Math.abs(d.y / ay) ** pw, 2 / pw), rr = 1 / Math.sqrt(xy + (d.z / az) ** 2);
  let x = d.x * rr, y = d.y * rr, z = d.z * rr;
  if (y < -0.04) { const k = U.smooth((-y - 0.04) / 0.075); x *= 1 - 0.12 * F.jaw * k; if (z < 0) z *= 1 - 0.32 * k; }
  if (z < 0 && y > -0.035) z *= 1.05;                                   // a fuller back of the skull
  if (z > 0.045) z = 0.045 + (z - 0.045) * 0.8;                         // a flatter face
  if (y < -0.045 && z > 0.02) z -= 0.007 * U.smooth((-y - 0.045) / 0.035) * U.smooth((z - 0.02) / 0.03);
  return { x, y, z };
}
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2) / (2 * sx * sx) - ((y - cy) ** 2) / (2 * sy * sy));
// the features that don't move: the nose, the brow ridge, the cheekbones, the chin
function featuresZ(x, y, F) {
  return 0.0102 * F.nose * gauss(x, y, 0, -0.012, 0.0075 * F.noseW, 0.02) * (y < -0.042 ? Math.max(0, 1 - (-0.042 - y) / 0.009) : 1)
    + 0.0042 * F.nose * gauss(x, y, 0, -0.032, 0.007 * F.noseW, 0.007)
    + 0.0025 * gauss(x, y, 0, -0.041, 0.016 * F.noseW, 0.005)
    + 0.0048 * F.brow * gauss(x, y, 0, 0.034, 0.05, 0.008)
    - 0.0022 * (gauss(x, y, 0.03, 0.026, 0.014, 0.006) + gauss(x, y, -0.03, 0.026, 0.014, 0.006))   // the shade under the brow
    + 0.0095 * F.chin * gauss(x, y, 0, -0.094, 0.022, 0.013)
    + 0.003 * gauss(x, y, 0, -0.078, 0.02, 0.006);   // the dip under the lower lip, filled a little
}
// the eyes and the mouth: where they are on this face
function layout(F) {
  return { ex: 0.032, ey: 0.0125, a: 0.0118 * F.eyeW, bu: 0.0055, bl: 0.0042,
    my: -0.062, mw: 0.0245 * F.mouthW, gap: 0.0011 };
}
const front = (z) => U.smooth((z - 0.015) / 0.035);

// one point of the head, with an expression E ({ name: weight }) or the rest (E = {})
function point(d, F, L, ez, E) { return pointFrom(BASE(d, F), F, L, ez, E); }
// b: the bare surface point (the skull, or a mesh's own vertex), the rest
// (eyes, lips, expressions) built on it
function pointFrom(b, F, L, ez, E) {
  let x = b.x, y = b.y, z = b.z;
  const fr = front(z), sg = x >= 0 ? 1 : -1, side = sg > 0 ? "Left" : "Right";   // +X is the creature's left
  const info = { eye: false, lid: 0, lower: false, lip: 0, mouthEdge: 0, upLip: 0, loLip: 0 };
  // --- the eye: the almond, the lids over the eyeball ---
  let ex = Math.abs(x) - L.ex, ey = y - L.ey, inLidZone = false, zLid = 0, wl = 0;
  if (fr > 0.5) {
    const q = 1 - (ex / L.a) ** 2, tilt = 0.0011 * (ex / L.a);
    const zoneX = 0.0185, zoneUp = 0.0128, zoneDn = 0.0112;
    const ze = (ex / zoneX) ** 2 + (ey / (ey > 0 ? zoneUp : zoneDn)) ** 2;
    if (ze < 1) {
      inLidZone = true;
      const up0 = q > 0 ? L.bu * Math.sqrt(q) + tilt : tilt, lo0 = q > 0 ? -L.bl * Math.sqrt(q) + tilt : tilt;
      // pull the nearest rows onto the edges: a smooth lid line
      if (q > 0) {
        ey = snap(ey, up0, 0.0019, 1);
        ey = snap(ey, lo0, 0.0019, -1);
      }
      info.eye = q > 0 && ey < up0 - 1e-7 && ey > lo0 + 1e-7;
      const blink = E["eyeBlink" + side] || 0, wide = E["eyeWide" + side] || 0;
      const topZ = zoneUp * Math.sqrt(Math.max(0, 1 - (ex / zoneX) ** 2)), botZ = -zoneDn * Math.sqrt(Math.max(0, 1 - (ex / zoneX) ** 2));
      if (ey >= up0 && topZ > up0) {
        const upW = up0 + 0.0024 * wide * Math.max(0, q), up2 = U.lerp(upW, lo0 + 0.0004, blink);
        const t = (ey - up0) / (topZ - up0);
        ey = up2 + t * (topZ - up2);
        info.lid = 1 - t;
      } else if (ey <= lo0 && botZ < lo0) {
        const lo2 = lo0 + 0.0009 * blink;
        const t = (lo0 - ey) / (lo0 - botZ);
        ey = lo2 - t * (lo2 - botZ);
        info.lid = 1 - t;
      }
      y = L.ey + ey;
      // the lid lies on the eyeball (its radius + the lid), fading into the face at the zone's edge
      const r2 = (R_EYE + LID) ** 2 - ex * ex - ey * ey;
      zLid = r2 > 0 ? ez + Math.sqrt(r2) : -1;
      wl = r2 > 0 ? 1 - U.smooth((ze - 0.45) / 0.55) : 0;
    }
  }
  // --- the mouth: the slit between the lips, the lips ---
  const lineY = L.my - 0.0022 * (x / L.mw) ** 2;
  let my = y - lineY;
  const qm = 1 - (x / L.mw) ** 2, gap = qm > 0 ? L.gap * Math.sqrt(qm) : 0;
  if (fr > 0.5 && !inLidZone) {
    if (qm > 0.04) {
      // (inside the slit counts too: those points go to its edge, as before)
      if (my > 0) my = my < gap ? gap : snap(my, gap, 0.0019, 1);
      if (my < 0) my = my > -gap ? -gap : snap(my, -gap, 0.0019, -1);
      y = lineY + my;
    }
    info.lower = my < 0;
    info.mouth = qm > 0 && Math.abs(my) < gap - 1e-7;
  } else info.lower = y < lineY;
  // the face's depth here (base + features), then the lips on top
  let zf = b.z + fr * FEAT * featuresZ(x, y, F);
  const lat = Math.sqrt(Math.max(0, 1 - (x / (L.mw * 1.08)) ** 2));
  if (fr > 0.5 && lat > 0) {
    const up = my - gap, dn = -my - gap;
    if (up >= 0 && up < 0.0068) { const k = Math.pow(Math.sin(Math.PI * Math.min(1, up / 0.0068 + 0.12)), 0.7) * lat; zf += 0.0036 * F.lips * k; info.upLip = k; }
    if (dn >= 0 && dn < 0.0085) { const k = Math.pow(Math.sin(Math.PI * Math.min(1, dn / 0.0085 + 0.1)), 0.7) * lat; zf += 0.0042 * F.lips * k; info.loLip = k; }
    // the lips roll in at the slit
    const edge = Math.max(0, 1 - Math.min(Math.abs(up), Math.abs(dn)) / 0.0016);
    if (qm > 0) { zf -= 0.0014 * edge * lat; info.mouthEdge = edge * lat; }
  }
  z = inLidZone && wl > 0 ? U.lerp(zf, Math.max(zLid, zf - 0.004), wl) : zf;
  // cheekbones (sideways)
  x += Math.sign(x) * 0.0035 * F.cheek * (gauss(x, y, 0.05, -0.008, 0.02, 0.02) + gauss(x, y, -0.05, -0.008, 0.02, 0.02));

  // ---------- the expressions that move the skin ----------
  const cx = sg * L.mw, cy = L.my - 0.0022;
  // (a mesh's long thin lip triangles crease under a narrow pull: wider for it)
  const corner = fr * gauss(x, y, cx, cy, SOFT ? 0.017 : 0.011, SOFT ? 0.017 : 0.013);
  const sm = E["mouthSmile" + side] || 0, fw = E["mouthFrown" + side] || 0;
  if (sm) {
    const cheek = fr * gauss(x, y, sg * 0.04, -0.03, 0.016, 0.016);
    x += sg * 0.0035 * corner * sm; y += (0.006 * corner + 0.003 * cheek) * sm; z += (-0.0025 * corner + 0.0025 * cheek) * sm;
  }
  if (fw) { y -= 0.0045 * corner * fw; x -= sg * 0.001 * corner * fw; }
  const pk = E.mouthPucker || 0;
  if (pk) { const g = fr * gauss(x, y, 0, L.my, 0.022, 0.011); x *= 1 - 0.28 * g * pk; z += 0.0065 * g * pk; }
  const bu = E.browInnerUp || 0;
  if (bu) { const g = fr * (gauss(x, y, 0.016, 0.034, 0.012, 0.012) + gauss(x, y, -0.016, 0.034, 0.012, 0.012)); y += 0.0055 * g * bu; }
  const bd = E["browDown" + side] || 0;
  if (bd) {
    const g = fr * gauss(x, y, sg * 0.026, 0.032, 0.02, 0.01), gi = fr * gauss(x, y, sg * 0.012, 0.03, 0.009, 0.009);
    y -= (0.0035 * g + 0.002 * gi) * bd; z += 0.0015 * g * bd; x -= sg * 0.0015 * gi * bd;
  }
  const cp = E.cheekPuff || 0;
  if (cp) { const g = fr * (gauss(x, y, 0.042, -0.045, 0.018, 0.016) + gauss(x, y, -0.042, -0.045, 0.018, 0.016)); x += Math.sign(x) * 0.007 * g * cp; z += 0.003 * g * cp; }
  const jw = E.jawOpen || 0;
  if (jw && info.lower) {
    // the jaw: everything under the mouth line in the front half, turning
    // about the hinge; it fades out past the mouth's corners and toward the ears
    const below = U.smooth((lineY - y) / 0.03);
    const reach = L.mw * 0.9 + 0.045 * below;
    const w = (1 - U.smooth((Math.abs(x) - reach + 0.01) / (SOFT ? 0.08 : 0.05))) * U.smooth((z + 0.02) / 0.04) * (SOFT ? U.smooth((lineY - y + 0.002) / 0.008) : 1);
    const th = JAW_MAX * jw * w, dy = y - HINGE.y, dz = z - HINGE.z, c = Math.cos(th), s = Math.sin(th);
    y = HINGE.y + dy * c - dz * s; z = HINGE.z + dy * s + dz * c;
  }
  return { x, y, z, info, fr };
}
// the face's depth at the eye's centre (for placing the eyeball)
function eyeDepth(F, L) {
  let best = 0, bd = 1e9; const v = new THREE.Vector3();
  for (let a = 0.15; a <= 0.6; a += 0.006) for (let b = -0.1; b <= 0.3; b += 0.006) {
    v.set(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b));
    const p = BASE(v, F), dd = (p.x - L.ex) ** 2 + (p.y - L.ey) ** 2;
    if (dd < bd) { bd = dd; best = p.z + FEAT * featuresZ(p.x, p.y, F); }
  }
  return best;
}

// ---------- the low-poly head ----------
// The full head welded (the grid's seam and poles are duplicate points),
// then decimated (LifeKit.util.decimate): the vertices kept are original
// ones, so the colours and every expression carry over — a faceted face
// that still blinks and speaks. The openings' edges hold.
// the right half (x ≥ 0) decimated, then mirrored: symmetric facets, as a
// hand-made low-poly head has (the midline is an open edge in the half,
// so it holds). Every mirrored vertex is the original vertex at (−x, y, z),
// so one-sided expressions (a left smile) still move only their side.
function symDecimate(pos, idx, target) {
  const nv = pos.length / 3, key = (x, y, z) => Math.round(x * 1e6) + "," + Math.round(y * 1e6) + "," + Math.round(z * 1e6);
  const at = new Map(); for (let i = 0; i < nv; i++) at.set(key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), i);
  const mir = new Int32Array(nv); for (let i = 0; i < nv; i++) { const j = at.get(key(-pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])); mir[i] = j === undefined ? -1 : j; }
  const used = new Map(), hp = [], back = [], hidx = [];
  const take = (v) => { if (!used.has(v)) { used.set(v, back.length); back.push(v); hp.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } return used.get(v); };
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (pos[a * 3] >= -1e-7 && pos[b * 3] >= -1e-7 && pos[c * 3] >= -1e-7) hidx.push(take(a), take(b), take(c));
  }
  const out = U.decimate(new Float32Array(hp), hidx, Math.round(target / 2)), faces = [];
  for (let i = 0; i < out.length; i += 3) {
    const a = back[out[i]], b = back[out[i + 1]], c = back[out[i + 2]];
    faces.push(a, b, c);
    if (mir[a] >= 0 && mir[b] >= 0 && mir[c] >= 0) faces.push(mir[a], mir[c], mir[b]);
  }
  return faces;
}
function weldedOf(geo) {
  const P = geo.attributes.position.array, w = U.weld(P);
  const pos = new Float32Array(w.keep.length * 3);
  w.keep.forEach((o, i) => { pos[i * 3] = P[o * 3]; pos[i * 3 + 1] = P[o * 3 + 1]; pos[i * 3 + 2] = P[o * 3 + 2]; });
  const ix = geo.index.array, idx = [];
  for (let i = 0; i < ix.length; i += 3) { const a = w.map[ix[i]], b = w.map[ix[i + 1]], c = w.map[ix[i + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  return { w, pos, idx };
}
// a plain mesh (no morphs) decimated, symmetric
function lowPolyPlain(geo, target) {
  const { w, pos, idx } = weldedOf(geo), out = symDecimate(pos, idx, target);
  const used = new Map(), from = [];
  const tri = out.map((v) => { if (!used.has(v)) { used.set(v, from.length); from.push(w.keep[v]); } return used.get(v); });
  const g = new THREE.BufferGeometry();
  ["position", "uv"].forEach((nm) => { const a = geo.attributes[nm], k = a.itemSize, b = new Float32Array(from.length * k); from.forEach((o, i) => { for (let q = 0; q < k; q++) b[i * k + q] = a.array[o * k + q]; }); g.setAttribute(nm, new THREE.BufferAttribute(b, k)); });
  g.setIndex(tri); geo.dispose();
  return g;
}
function lowPoly(geo, target) {
  const { w, pos, idx } = weldedOf(geo);
  const out = symDecimate(pos, idx, target);
  // compact: the vertices still used, in a new order
  const used = new Map(), from = [];
  const tri = out.map((v) => { if (!used.has(v)) { used.set(v, from.length); from.push(w.keep[v]); } return used.get(v); });
  const g = new THREE.BufferGeometry();
  const pick = (attr) => { const n = attr.itemSize, a = new Float32Array(from.length * n); from.forEach((o, i) => { for (let k = 0; k < n; k++) a[i * n + k] = attr.array[o * n + k]; }); return new THREE.BufferAttribute(a, n); };
  ["position", "uv", "color"].forEach((nm) => g.setAttribute(nm, pick(geo.attributes[nm])));
  g.setIndex(tri); g.computeVertexNormals();
  g.morphTargetsRelative = true;
  ["position", "normal"].forEach((nm) => { g.morphAttributes[nm] = geo.morphAttributes[nm].map((a) => { const b = pick(a); b.name = a.name; return b; }); });
  geo.dispose();
  return g;
}

// ---------- a mesh's surface, finer: every triangle cut into s² on its own
// plane (the shape and, flat-shaded, the look stay exactly the same) ----------
function subdivide(V, T, s) {
  const P = [], key = new Map(), tri = [], par = [];
  const at = (x, y, z) => { const k = Math.round(x * 1e6) + "," + Math.round(y * 1e6) + "," + Math.round(z * 1e6); let i = key.get(k); if (i === undefined) { i = P.length; P.push([x, y, z]); key.set(k, i); } return i; };
  for (let t = 0; t < T.length; t += 3) {
    const A = V[T[t]], B = V[T[t + 1]], C = V[T[t + 2]], id = [];
    for (let i = 0; i <= s; i++) { id.push([]); for (let j = 0; j <= s - i; j++) { const u = i / s, v = j / s; id[i].push(at(A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v, A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v)); } }
    for (let i = 0; i < s; i++) for (let j = 0; j < s - i; j++) {
      tri.push(id[i][j], id[i + 1][j], id[i][j + 1]); par.push(t / 3);
      if (j < s - i - 1) { tri.push(id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]); par.push(t / 3); }
    }
  }
  return { P, T: tri, par };
}

// a mesh's head, shaded like the original: unindexed, each small triangle
// keeping its parent triangle's normal (so the moving lids, lips and cheeks
// change the silhouette, never break the facets into noise)
function facetsOf(geo, par, mesh) {
  const idx = geo.index.array, nT = idx.length / 3, out = new THREE.BufferGeometry(), V = mesh.V, T = mesh.T;
  const corner = (attr) => { const k = attr.itemSize, a = new Float32Array(nT * 3 * k); for (let c = 0; c < nT * 3; c++) for (let q = 0; q < k; q++) a[c * k + q] = attr.array[idx[c] * k + q]; return new THREE.BufferAttribute(a, k); };
  ["position", "uv", "color"].forEach((nm) => out.setAttribute(nm, corner(geo.attributes[nm])));
  const N = new Float32Array(nT * 9);
  for (let t = 0; t < nT; t++) {
    const o = par[t] * 3, A = V[T[o]], B = V[T[o + 1]], C = V[T[o + 2]];
    let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let c = 0; c < 3; c++) { N[t * 9 + c * 3] = nx; N[t * 9 + c * 3 + 1] = ny; N[t * 9 + c * 3 + 2] = nz; }
  }
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.morphTargetsRelative = true;
  out.morphAttributes.position = geo.morphAttributes.position.map((a) => { const b = corner(a); b.name = a.name; return b; });
  geo.dispose();
  return out;
}

// ---------- building ----------
// the grid: longitude denser at the front, latitude denser around the face
function grid(det) {
  const NC = Math.max(48, Math.round(144 * det)) & ~1, NL = Math.max(36, Math.round(112 * det));
  const dirs = [], uvs = [];
  for (let i = 0; i <= NL; i++) {
    const t = i / NL * 2 - 1, th = Math.PI / 2 * (0.62 * t + 0.38 * t * t * t);
    for (let j = 0; j <= NC; j++) {
      const s = j / NC * 2 - 1, ph = Math.PI * (0.42 * s + 0.58 * s * s * s);
      dirs.push(new THREE.Vector3(Math.cos(th) * Math.sin(ph), Math.sin(th), Math.cos(th) * Math.cos(ph)));
      uvs.push(j / NC * 3, i / NL * 3);
    }
  }
  return { dirs, uvs, NC, NL };
}
function build(o) {
  BASE = o.baseFn || skull; FEAT = o.features == null ? 1 : o.features; SOFT = !!o.mesh;
  try { return buildFace(o); } finally { BASE = skull; FEAT = 1; SOFT = false; }
}
function buildFace(o) {
  const F = o.F, L = Object.assign(layout(F), o.layout || {}), det = o.detail || 1, mats = o.mats;
  const group = new THREE.Group();
  const ez = eyeDepth(F, L) - R_EYE - 0.0018;
  const G = grid(det), M = o.mesh ? subdivide(o.mesh.V, o.mesh.T, o.mesh.s || 9) : null;
  const n = M ? M.P.length : G.dirs.length;
  const at = (i, E) => (M ? pointFrom({ x: M.P[i][0], y: M.P[i][1], z: M.P[i][2] }, F, L, ez, E) : point(G.dirs[i], F, L, ez, E));
  // the rest
  const rest = new Float32Array(n * 3), col = new Float32Array(n * 3), infos = new Array(n);
  const hairC = new THREE.Color(o.hairHex);
  for (let i = 0; i < n; i++) {
    const p = at(i, {});
    rest[i * 3] = p.x; rest[i * 3 + 1] = p.y; rest[i * 3 + 2] = p.z; infos[i] = p.info;
    // skin colours: the lips, a blush, the lids' shade, the brows, the slit's dark edge
    let c = [1, 1, 1];
    const mix = (to, t) => { if (t > 0) c = c.map((q, k) => q + (to[k] - q) * Math.min(1, t)); };
    mix([0.86, 0.6, 0.58], Math.pow(p.info.upLip + p.info.loLip, 0.8) * 0.7);
    if (!M) mix([0.96, 0.82, 0.8], p.fr * (gauss(p.x, p.y, 0.045, -0.02, 0.02, 0.018) + gauss(p.x, p.y, -0.045, -0.02, 0.02, 0.018)) * 0.35);
    mix([0.8, 0.68, 0.66], p.info.lid * 0.22);
    mix([0.42, 0.22, 0.2], p.info.mouthEdge * 0.8);
    const brow = p.fr * (gauss(p.x, p.y, 0.031, 0.033, 0.017, 0.0045) + gauss(p.x, p.y, -0.031, 0.033, 0.017, 0.0045));
    if (!M) mix([hairC.r * 1.4 + 0.05, hairC.g * 1.4 + 0.04, hairC.b * 1.4 + 0.04], brow * 0.85);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  // the faces, minus the openings (judged by each triangle's middle at rest)
  const idx = [], row = G.NC + 1;
  const inside = (a, b, c) => {
    const x = (rest[a * 3] + rest[b * 3] + rest[c * 3]) / 3, y = (rest[a * 3 + 1] + rest[b * 3 + 1] + rest[c * 3 + 1]) / 3, z = (rest[a * 3 + 2] + rest[b * 3 + 2] + rest[c * 3 + 2]) / 3;
    if (z < 0.03) return false;
    const ex = Math.abs(x) - L.ex, ey = y - L.ey, q = 1 - (ex / L.a) ** 2, tilt = 0.0011 * (ex / L.a);
    if (q > 0.07 && ey < L.bu * Math.sqrt(q) + tilt - 2e-5 && ey > -L.bl * Math.sqrt(q) + tilt + 2e-5) return true;
    const lineY = L.my - 0.0022 * (x / L.mw) ** 2, qm = 1 - (x / L.mw) ** 2;
    return qm > 0 && Math.abs(y - lineY) < L.gap * Math.sqrt(qm) - 2e-5;
  };
  const keptPar = [];
  if (M) { for (let t = 0; t < M.T.length; t += 3) if (!inside(M.T[t], M.T[t + 1], M.T[t + 2])) { idx.push(M.T[t], M.T[t + 1], M.T[t + 2]); keptPar.push(M.par[t / 3]); } }
  else for (let i = 0; i < G.NL; i++) for (let j = 0; j < G.NC; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    if (!inside(a, b, c)) idx.push(a, b, c);
    if (!inside(b, d, c)) idx.push(b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(rest, 3));
  // a mesh's UVs: a projection from the front (the skin's mottling is fine-grained anyway)
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(M ? M.P.flatMap((q) => [q[0] * 12 + q[2] * 4, q[1] * 12]) : G.uvs, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const restN = geo.attributes.normal.array.slice();
  // the expressions: each one computed in full, stored as the difference
  geo.morphAttributes.position = []; geo.morphAttributes.normal = []; geo.morphTargetsRelative = true;
  const tmp = new THREE.BufferGeometry(); tmp.setIndex(idx);
  EXPRESSIONS.forEach((name) => {
    const P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const p = at(i, { [name]: 1 }); P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; }
    tmp.setAttribute("position", new THREE.BufferAttribute(P, 3)); tmp.computeVertexNormals();
    const N = tmp.attributes.normal.array, dP = new Float32Array(n * 3), dN = new Float32Array(n * 3);
    for (let k = 0; k < n * 3; k++) { dP[k] = P[k] - rest[k]; dN[k] = N[k] - restN[k]; }
    const pa = new THREE.BufferAttribute(dP, 3); pa.name = name; geo.morphAttributes.position.push(pa);
    const na = new THREE.BufferAttribute(dN, 3); na.name = name; geo.morphAttributes.normal.push(na);
  });
  tmp.dispose();
  const head = new THREE.Mesh(M ? facetsOf(geo, keptPar, o.mesh) : o.lowpoly ? lowPoly(geo, o.lowpoly) : geo, mats.skinVC(o.tone, true, !!M)); head.castShadow = head.receiveShadow = true;
  head.updateMorphTargets(); group.add(head);
  const morphed = [head];

  // ---------- inside the mouth: a dark mouth, the teeth, the tongue ----------
  const lipZ = (() => { let best = 0; for (let i = 0; i < n; i++) if (Math.abs(rest[i * 3]) < 0.004 && Math.abs(rest[i * 3 + 1] - L.my) < 0.004) best = Math.max(best, rest[i * 3 + 2]); return best || 0.075; })();
  const jawTarget = (geoIn, lowerOf) => {
    // one target, jawOpen: the jaw's part turned about the hinge
    const p = geoIn.attributes.position, d = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      if (!lowerOf(p.getY(i))) continue;
      const y = p.getY(i), z = p.getZ(i), th = JAW_MAX, dy = y - HINGE.y, dz = z - HINGE.z;
      d[i * 3 + 1] = HINGE.y + dy * Math.cos(th) - dz * Math.sin(th) - y;
      d[i * 3 + 2] = HINGE.z + dy * Math.sin(th) + dz * Math.cos(th) - z;
    }
    const a = new THREE.BufferAttribute(d, 3); a.name = "jawOpen";
    geoIn.morphAttributes.position = [a]; geoIn.morphTargetsRelative = true;
    return geoIn;
  };
  const arch = (y0, y1, R, zc, span) => {
    const pos = [], ix = [], N = 24;
    for (let k = 0; k <= N; k++) {
      const ph = -span + 2 * span * k / N, x = R * Math.sin(ph), z = zc + R * Math.cos(ph);
      pos.push(x, y0, z, x, y1, z);
      if (k) { const a = (k - 1) * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals();
    return g;
  };
  const R = 0.026, zc = lipZ - (L.teethBack || 0.0075) - R;
  const teethMat = mats.flat("#ece6d8", 0.3, { side: THREE.DoubleSide, morph: true });
  const upper = new THREE.Mesh(arch(L.my + 0.0006, L.my + 0.0092, R, zc, 0.9), teethMat);
  const lowerG = jawTarget(arch(L.my - 0.0008, L.my - 0.0075, R * 0.92, zc - 0.002, 0.8), () => true);
  const lower = new THREE.Mesh(lowerG, teethMat);
  const tongueG = new THREE.SphereGeometry(1, 16, 10); tongueG.scale(0.018, 0.006, 0.022); tongueG.translate(0, L.my - 0.008, lipZ - 0.036);
  const tongue = new THREE.Mesh(jawTarget(tongueG, () => true), mats.flat("#a5524f", 0.45, { morph: true }));
  const cavG = new THREE.SphereGeometry(1, 20, 14); cavG.scale(0.028, 0.02, 0.03); cavG.translate(0, L.my - 0.003, lipZ - 0.046);
  const cav = new THREE.Mesh(jawTarget(cavG, (y) => y < L.my - 0.006), mats.flat("#3a1515", 0.8, { morph: true }));
  [upper, lower, tongue, cav].forEach((m) => { if (m.geometry.morphAttributes.position) m.updateMorphTargets(); group.add(m); });
  morphed.push(lower, tongue, cav);

  // ---------- the eyes, the ears ----------
  const eyes = [];
  [1, -1].forEach((sg) => {
    const eg = o.lowpoly ? new THREE.SphereGeometry(R_EYE, 10, 8) : new THREE.SphereGeometry(R_EYE, 28, 20); eg.rotateX(Math.PI / 2);
    const e = new THREE.Mesh(eg, mats.eye(o.irisHex)); e.position.set(sg * L.ex, L.ey, ez); group.add(e); eyes.push(e);
    if (o.ears === false) return;
    const ag = o.lowpoly ? new THREE.SphereGeometry(1, 7, 5) : new THREE.SphereGeometry(1, 16, 12); ag.scale(0.0085, 0.03, 0.019);
    const ear = new THREE.Mesh(ag, mats.skin(o.tone, false)); ear.castShadow = true;
    ear.position.set(sg * (o.earX != null ? o.earX : 0.077 * F.w - 0.004), -0.004, -0.008); ear.rotation.y = sg * 0.35; group.add(ear);
  });

  // ---------- the hair: a shell on the head's own grid, above a hairline ----------
  // The row of vertices nearest the hairline is pulled onto it (a clean edge,
  // as with the lids); the shell meets the skin at the edge and rises to its
  // thickness above it. The low-poly style decimates it, symmetric.
  if (o.hair !== 3) {
    const thick = o.hair === 1 ? 1.012 : 1.035;
    const hn = G.dirs.length, hp = new Float32Array(hn * 3), keep = new Uint8Array(hn), hrow = G.NC + 1;
    const hairline = (az) => (az < 0.3 ? U.lerp(0.07, 0.045, az / 0.3) : az < 0.6 ? U.lerp(0.045, 0.012, (az - 0.3) / 0.3) : U.lerp(0.012, -0.06, (az - 0.6) / 0.4));
    for (let i = 0; i < hn; i++) {
      const h = BASE(G.dirs[i], F), az = Math.abs(Math.atan2(h.x, h.z)) / Math.PI, line = hairline(az);
      let y = h.y;
      if (y < line && y > line - 0.0042) y = line;
      keep[i] = y >= line - 1e-7 ? 1 : 0;
      const up = U.smooth((y - line) / 0.014);
      const k = U.lerp(1.004, thick + (o.hair === 1 ? 0 : 0.03 * U.smooth((y - 0.02) / 0.09)), up);
      hp[i * 3] = h.x * k; hp[i * 3 + 1] = y * k + (o.hair === 1 ? 0 : 0.004 * up); hp[i * 3 + 2] = h.z * k;
    }
    const hidx = [];
    for (let i = 0; i < G.NL; i++) for (let j = 0; j < G.NC; j++) {
      const a = i * hrow + j, b = a + 1, c = a + hrow, d = c + 1;
      if (keep[a] && keep[b] && keep[c]) hidx.push(a, b, c);
      if (keep[b] && keep[d] && keep[c]) hidx.push(b, d, c);
    }
    let hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute("position", new THREE.BufferAttribute(hp, 3));
    hgeo.setAttribute("uv", new THREE.Float32BufferAttribute(G.uvs.map((u, k) => (k % 2 ? u * 0.7 : u * 1.5)), 2));
    hgeo.setIndex(hidx);
    if (o.lowpoly) hgeo = lowPolyPlain(hgeo, 280);
    hgeo.computeVertexNormals();
    const hm = new THREE.Mesh(hgeo, mats.hair(o.hairHex, false)); hm.castShadow = true; group.add(hm);
    if (o.hair === 2) {
      const tail = U.sweep([[0, 0.04, -0.095, 0.017], [0, 0.0, -0.118, 0.021], [0, -0.06, -0.122, 0.017], [0, -0.13, -0.105, 0.01]].map(([x, y, z, r]) => ({ p: [x, y, z], rx: r, f: r * 0.85, b: r * 0.85 })),
        { seg: 14, steps: 3, rigid: true, capEnd: 1, capStart: 1, front: [0, 0, -1] });
      U.rigid(group, [{ geo: tail, mat: mats.hair(o.hairHex, false) }]);
    }
  }

  // ---------- the controller ----------
  const baseVals = {}; EXPRESSIONS.forEach((k) => { baseVals[k] = 0; });
  const auto = {}; EXPRESSIONS.forEach((k) => { auto[k] = 0; });
  const look = { yaw: 0, pitch: 0, ty: 0, tp: 0, next: 1 }, blink = { next: 2, t: -1 };
  function apply() {
    morphed.forEach((m) => {
      const dict = m.morphTargetDictionary;
      for (const k in dict) m.morphTargetInfluences[dict[k]] = Math.max(0, Math.min(1, baseVals[k] + auto[k]));
    });
  }
  function gaze(yaw, pitch) { eyes.forEach((e) => { e.rotation.set(-pitch, yaw, 0); }); }
  function update(t, dt, st) {
    EXPRESSIONS.forEach((k) => { auto[k] = 0; });
    if (st.lively) {
      // a blink every 2–6 s (0.16 s down and up), both eyes
      if (blink.t < 0 && t > blink.next) { blink.t = 0; }
      if (blink.t >= 0) {
        blink.t += dt; const k = blink.t < 0.08 ? blink.t / 0.08 : Math.max(0, 1 - (blink.t - 0.08) / 0.1);
        auto.eyeBlinkLeft = auto.eyeBlinkRight = k;
        if (blink.t > 0.18) { blink.t = -1; blink.next = t + 2 + Math.random() * 4; }
      }
      // glances: a new spot every 1–3 s, reached quickly (a saccade)
      if (t > look.next) { look.ty = (Math.random() - 0.5) * 0.5; look.tp = (Math.random() - 0.5) * 0.25; look.next = t + 1 + Math.random() * 2; }
      look.yaw += (look.ty - look.yaw) * Math.min(1, dt * 18); look.pitch += (look.tp - look.pitch) * Math.min(1, dt * 18);
      gaze(look.yaw, look.pitch);
      // running: breathing through the mouth; the brows a little alive
      if (st.gait === "run") auto.jawOpen = 0.18 + 0.08 * Math.sin(t * 6);
      auto.browInnerUp = 0.08 * Math.max(0, Math.sin(t * 0.37));
    } else gaze(0, 0);
    // the body's mood layers show on the face too (move/walk.js LAYERS)
    const Ly = st.layers || {};
    if (Ly.sad) { auto.browInnerUp += 0.7 * Ly.sad; auto.mouthFrownLeft += 0.6 * Ly.sad; auto.mouthFrownRight += 0.6 * Ly.sad; }
    if (Ly.angry) { auto.browDownLeft += 0.85 * Ly.angry; auto.browDownRight += 0.85 * Ly.angry; auto.mouthFrownLeft += 0.3 * Ly.angry; auto.mouthFrownRight += 0.3 * Ly.angry; }
    if (Ly.sneak) { auto.eyeWideLeft += 0.3 * Ly.sneak; auto.eyeWideRight += 0.3 * Ly.sneak; auto.browDownLeft += 0.2 * Ly.sneak; auto.browDownRight += 0.2 * Ly.sneak; }
    if (Ly.wave) { auto.mouthSmileLeft += 0.5 * Ly.wave; auto.mouthSmileRight += 0.5 * Ly.wave; }
    if (st.talk) {
      const s = Math.abs(Math.sin(t * 9.3) * Math.sin(t * 3.1 + 1));
      auto.jawOpen = Math.max(auto.jawOpen, 0.08 + 0.35 * s);
      auto.mouthPucker = 0.25 * Math.max(0, Math.sin(t * 5.2));
    }
    apply();
  }
  apply();
  return { group, names: EXPRESSIONS, base: baseVals, set(k, v) { baseVals[k] = v; apply(); }, update, gaze, eyes };
}

LK.face = { EXPRESSIONS, build };
})();
