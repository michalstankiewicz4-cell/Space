/* =======================================================================
   LIFEKIT — life forms, built from blocks like ShipKit builds ships
   =======================================================================
   A classic script (window.LifeKit), for the life lab (labs/life.html);
   not in the game yet (docs/life.md). Needs THREE (r128).

   The core holds what every creature shares; the rest comes in files:
     js/lifekit/lifekit.js          this core: the registry, skeletons,
                                    swept bodies, materials, merging
     js/lifekit/move/<medium>.js    how a body moves in a medium — walk.js
                                    (land) now; swim / fly / space later
     js/lifekit/creatures/<id>.js   one file per creature (LifeKit.register)

   A body is SWEPT: a tube along a line of sections (each one an ellipse
   with its own width, front and back), smoothed between them, weighted to
   the skeleton's bones — so it bends at the joints instead of breaking
   into pieces. Rigid parts (a head, hands, feet) are meshes hung on a bone.

   API
     LifeKit.CREATURES                 [{ id, name, group, media, moves, params, blurb, build }]
     LifeKit.build(id, params, opts)   → creature: { group, rig, dims, def, params,
                                         animate(t, dt, { gait, speed }), dispose() }
     LifeKit.register(def), registerMove(id, move), MOVES
     LifeKit.util                      { rng, sweep, skeleton, merge, skinned, mat, ... }
   ======================================================================= */
window.LifeKit = (function () {
"use strict";

const CREATURES = [], MOVES = {};
function register(def) { CREATURES.push(def); }
function registerMove(id, move) { MOVES[id] = move; }

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- the skeleton ----------
// spec: [{ name, parent, at: [x, y, z] }] — rest positions in the
// creature's own space, parents first. The bones keep no rest rotation:
// every bone's axes are the creature's (X left, Y up, Z forward), so a
// rotation.x swings a limb forward or back the same way on every bone.
function skeleton(spec) {
  const bones = [], byName = {}, abs = {};
  spec.forEach((s) => {
    const b = new THREE.Bone(); b.name = s.name;
    const p = V3(s.at[0], s.at[1], s.at[2]); abs[s.name] = p;
    if (s.parent) { byName[s.parent].add(b); b.position.copy(p).sub(abs[s.parent]); } else b.position.copy(p);
    b.userData.rest = b.position.clone();
    bones.push(b); byName[s.name] = b;
  });
  const index = {}; bones.forEach((b, i) => { index[b.name] = i; });
  return { bones, byName, abs, index, root: bones[0] };
}

// ---------- a swept body ----------
// sections: [{ p: [x, y, z], rx, f, b, w: { bone: weight }, n }]
//   rx: the half-width across; f / b: how far it reaches to the front /
//   back (the "front" is opts.front, made square to the line); n: the
//   cross-section's roundness (2 an ellipse, more: boxier).
// opts: { seg (around), steps (per span), front: [x, y, z], capStart,
//   capEnd (0: open, 1: a round end), bones: skeleton.index, rigid: true
//   for no skin weights }
// The line runs through the points as a smooth curve; radii and weights
// blend between the sections.
function sweep(sections, opts) {
  const seg = opts.seg || 16, steps = opts.steps || 3, n = sections.length;
  const front = V3(...(opts.front || [0, 0, 1])).normalize();
  // centripetal: no loops or overshoot between close points
  const curve = new THREE.CatmullRomCurve3(sections.map((s) => V3(s.p[0], s.p[1], s.p[2])), false, "centripetal");
  const rings = [];
  const frameAt = (T) => {
    let A2 = front.clone().addScaledVector(T, -front.dot(T));
    if (A2.lengthSq() < 1e-6) A2 = V3(0, 1, 0).addScaledVector(T, -T.y);
    A2.normalize();
    const A1 = new THREE.Vector3().crossVectors(A2, T).normalize();
    return [A1, A2];
  };
  const blendW = (a, b, t) => {
    const w = {};
    for (const k in a) w[k] = (w[k] || 0) + a[k] * (1 - t);
    for (const k in b) w[k] = (w[k] || 0) + b[k] * t;
    return w;
  };
  const M = (n - 1) * steps;
  for (let m = 0; m <= M; m++) {
    const u = m / M, span = Math.min(n - 2, Math.floor(m / steps)), f = m / steps - span, e = 0.5 - 0.5 * Math.cos(Math.PI * f);
    const s0 = sections[span], s1 = sections[span + 1];
    // the tangent: a central difference along the line (the curve's own can
    // point backwards at an end), kept pointing the same way ring to ring
    const C = curve.getPoint(u);
    const T = curve.getPoint(Math.min(1, u + 1e-3)).sub(curve.getPoint(Math.max(0, u - 1e-3))).normalize();
    if (rings.length && T.dot(rings[rings.length - 1].T) < 0) T.negate();
    const [A1, A2] = frameAt(T);
    rings.push({ C, T, A1, A2, rx: lerp(s0.rx, s1.rx, e), f: lerp(s0.f, s1.f, e), b: lerp(s0.b, s1.b, e), n: lerp(s0.n || 2, s1.n || 2, e),
      w: blendW(s0.w || {}, s1.w || {}, f) });
  }
  // round ends: rings shrinking to a point along the line
  const cap = (end, dir) => {
    const r0 = end, k = 5, out = [], len = Math.min(r0.rx, Math.max(r0.f, r0.b)) * (opts.capLen || 1);
    for (let i = 1; i <= k; i++) {
      const phi = i / k * Math.PI / 2, c = Math.max(0.02, Math.cos(phi));
      out.push(Object.assign({}, r0, { C: r0.C.clone().addScaledVector(r0.T, dir * len * Math.sin(phi)), rx: r0.rx * c, f: r0.f * c, b: r0.b * c }));
    }
    return out;
  };
  let all = rings;
  if (opts.capStart) all = cap(rings[0], -1).reverse().concat(all);
  if (opts.capEnd) all = all.concat(cap(rings[rings.length - 1], 1));

  const pos = [], uv = [], si = [], sw = [], idx = [];
  let vAcc = 0;
  const bones = opts.bones || {};
  all.forEach((r, ri) => {
    if (ri) vAcc += r.C.distanceTo(all[ri - 1].C);
    // the four strongest bones of this ring
    const ws = Object.entries(r.w).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, [, v]) => s + v, 0) || 1;
    for (let j = 0; j <= seg; j++) {
      const th = -Math.PI / 2 + j / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const ce = Math.sign(c) * Math.pow(Math.abs(c), 2 / r.n), se = Math.sign(s) * Math.pow(Math.abs(s), 2 / r.n);
      const p = r.C.clone().addScaledVector(r.A1, ce * r.rx).addScaledVector(r.A2, se * (s > 0 ? r.f : r.b));
      pos.push(p.x, p.y, p.z);
      uv.push(j / seg, vAcc);
      if (!opts.rigid) {
        for (let q = 0; q < 4; q++) { si.push(ws[q] ? bones[ws[q][0]] || 0 : 0); sw.push(ws[q] ? ws[q][1] / tot : 0); }
      }
    }
  });
  const row = seg + 1;
  for (let r = 0; r < all.length - 1; r++) for (let j = 0; j < seg; j++) {
    const a = r * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (!opts.rigid) {
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  // the seam (the first and the last column are the same points): one normal
  const nr = g.attributes.normal;
  for (let r = 0; r < all.length; r++) {
    const a = r * row, b = a + seg;
    const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// ---------- merging geometries (the same attributes) into one ----------
function merge(geos) {
  const names = Object.keys(geos[0].attributes), out = new THREE.BufferGeometry(), idx = [];
  let base = 0;
  names.forEach((nm) => {
    const a0 = geos[0].attributes[nm], arrs = geos.map((g) => g.attributes[nm].array);
    const len = arrs.reduce((s, a) => s + a.length, 0), Arr = a0.array.constructor, buf = new Arr(len);
    let o = 0; arrs.forEach((a) => { buf.set(a, o); o += a.length; });
    out.setAttribute(nm, new THREE.BufferAttribute(buf, a0.itemSize));
  });
  geos.forEach((g) => {
    const ix = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += g.attributes.position.count;
  });
  out.setIndex(idx);
  geos.forEach((g) => g.dispose());
  return out;
}

// ---------- welding: one vertex per position ----------
// returns { map: old → new, keep: new → first old } (the grid's seam and
// poles are duplicated points; decimation needs them as one)
function weld(pos, eps) {
  const map = new Int32Array(pos.length / 3), keep = [], seen = new Map(), q = 1 / (eps || 1e-6);
  for (let i = 0; i < map.length; i++) {
    const k = Math.round(pos[i * 3] * q) + "," + Math.round(pos[i * 3 + 1] * q) + "," + Math.round(pos[i * 3 + 2] * q);
    let j = seen.get(k);
    if (j === undefined) { j = keep.length; keep.push(i); seen.set(k, j); }
    map[i] = j;
  }
  return { map, keep };
}

// ---------- decimation: far fewer triangles, the same shape ----------
// Half-edge collapses in the order of the quadric error (Garland–Heckbert):
// a vertex merges into a neighbour and takes that neighbour's position, so
// every vertex kept is an original one — its colours and morph targets
// carry over unchanged. Open edges (the eyes, the mouth) hold through heavy
// boundary planes; a collapse that would flip or crush a face, or break the
// surface into a non-manifold, is refused. Flat planes go first, so the
// triangles left settle along the features — a hand-made low-poly look.
// pos: Float32Array (welded), index: triangles; → the new index list
function decimate(pos, index, targetTris) {
  const nv = pos.length / 3, nf = index.length / 3, F = Int32Array.from(index), alive = new Uint8Array(nf).fill(1);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const Q = new Float64Array(nv * 10), gone = new Uint8Array(nv), ver = new Uint32Array(nv);
  const addQ = (v, a, b, c, d, w) => {
    const q = v * 10;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b;
    Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  const norm = (f, ov, nvx) => {   // a face's normal (unnormalised), vertex ov moved to nvx's position
    const p = [0, 1, 2].map((k) => { const v = F[f * 3 + k] === ov ? nvx : F[f * 3 + k]; return [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]; });
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2], wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
    return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  };
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const ecount = new Map(), eface = new Map();
  for (let f = 0; f < nf; f++) {
    const n = norm(f, -1, -1), l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-14) { alive[f] = 0; continue; }
    const a = F[f * 3], nx = n[0] / l, ny = n[1] / l, nz = n[2] / l, d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]);
    for (let k = 0; k < 3; k++) addQ(F[f * 3 + k], nx, ny, nz, d, l / 2);
    for (let k = 0; k < 3; k++) { const e = ekey(F[f * 3 + k], F[f * 3 + (k + 1) % 3]); ecount.set(e, (ecount.get(e) || 0) + 1); eface.set(e, f); }
  }
  // the open edges: planes along them, square to their face, weighed heavily
  ecount.forEach((c, e) => {
    if (c !== 1) return;
    const a = Math.floor(e / nv), b = e % nv, f = eface.get(e), n = norm(f, -1, -1), l = Math.hypot(n[0], n[1], n[2]) || 1;
    const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2];
    let px = ey * n[2] - ez * n[1], py = ez * n[0] - ex * n[2], pz = ex * n[1] - ey * n[0];
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const d = -(px * pos[a * 3] + py * pos[a * 3 + 1] + pz * pos[a * 3 + 2]), w = 1e4 * (ex * ex + ey * ey + ez * ez) / (l / l);
    addQ(a, px, py, pz, d, w); addQ(b, px, py, pz, d, w);
  });
  const cost = (u, v) => {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], a = u * 10, b = v * 10, q = (i) => Q[a + i] + Q[b + i];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  const neigh = (u) => { const s = new Set(); for (const f of vf[u]) if (alive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== u) s.add(w); } return s; };
  // a binary heap of [cost, u, v, ver u, ver v]
  const H = [];
  const push = (it) => { H.push(it); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => {
    const top = H[0], last = H.pop();
    if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } }
    return top;
  };
  const offer = (u, v) => push([cost(u, v), u, v, ver[u], ver[v]]);
  for (let u = 0; u < nv; u++) for (const v of neigh(u)) offer(u, v);
  let faces = 0; for (let f = 0; f < nf; f++) faces += alive[f];
  while (faces > targetTris && H.length) {
    const [, u, v, vu, vv] = pop();
    if (gone[u] || gone[v] || ver[u] !== vu || ver[v] !== vv) continue;
    const nu = neigh(u); if (!nu.has(v)) continue;
    const nvs = neigh(v);
    let shared = 0; for (const f of vf[u]) if (alive[f] && (F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v)) shared++;
    let common = 0; nu.forEach((w) => { if (nvs.has(w)) common++; });
    if (common > shared) continue;                                        // would pinch the surface
    let bad = false;
    for (const f of vf[u]) {
      if (!alive[f] || F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v) continue;
      const o = norm(f, -1, -1), n = norm(f, u, v), lo = Math.hypot(o[0], o[1], o[2]), ln = Math.hypot(n[0], n[1], n[2]);
      if (ln < lo * 0.05 || (o[0] * n[0] + o[1] * n[1] + o[2] * n[2]) < 0.3 * lo * ln) { bad = true; break; }
    }
    if (bad) continue;
    for (const f of vf[u]) {
      if (!alive[f]) continue;
      if (F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v) { alive[f] = 0; faces--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === u) F[f * 3 + k] = v;
      vf[v].push(f);
    }
    gone[u] = 1; for (let i = 0; i < 10; i++) Q[v * 10 + i] += Q[u * 10 + i];
    ver[v]++;
    const around = neigh(v);
    around.forEach((w) => { ver[w]++; });
    around.forEach((w) => { offer(v, w); offer(w, v); neigh(w).forEach((x) => { if (x !== v) { offer(w, x); offer(x, w); } }); });
  }
  const out = []; for (let f = 0; f < nf; f++) if (alive[f]) out.push(F[f * 3], F[f * 3 + 1], F[f * 3 + 2]);
  return out;
}

// ---------- materials and their textures ----------
function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c, repeat, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 4;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  return t;
}
// a fine mottled grey (skin pores, fabric weave): bump and roughness
function grain(seed, size, dots, alpha) {
  const [c, x] = canvas(size, size), r = rng(seed);
  x.fillStyle = "#808080"; x.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    const s = 1 + r() * 2.5; x.fillRect(r() * size, r() * size, s, s);
  }
  return c;
}
// skin: the tone in the colour, a faint warm mottling in the map
function skinCanvas(seed) {
  const S = 256, [c, x] = canvas(S, S), r = rng(seed);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${r() < 0.6 ? "190,90,80" : "120,80,50"},${0.02 + r() * 0.035})`;
    x.beginPath(); x.arc(r() * S, r() * S, 2 + r() * 9, 0, Math.PI * 2); x.fill();
  }
  return c;
}
// cloth: a weave and a few seams
function clothCanvas(seed) {
  const S = 256, [c, x] = canvas(S, S), r = rng(seed);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) { x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`; x.fillRect(0, y, S, 1); }
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.05})`; x.fillRect(r() * S, r() * S, 1, 2 + r() * 3); }
  return c;
}
// hair: strands along v
function hairCanvas(seed) {
  const S = 256, [c, x] = canvas(S, S), r = rng(seed);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const px = r() * S; x.strokeStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.05 + r() * 0.12})`; x.lineWidth = 0.6 + r();
    x.beginPath(); x.moveTo(px, r() * S); x.lineTo(px + (r() - 0.5) * 6, r() * S); x.stroke();
  }
  return c;
}
// an eye: the sclera, the iris and the pupil around the front pole (v near 1)
function eyeCanvas(iris) {
  const W = 128, H = 128, [c, x] = canvas(W, H);
  x.fillStyle = "#e9e3da"; x.fillRect(0, 0, W, H);
  // a real iris is ~12 mm across on a 24 mm eyeball: the top 17% of the map
  const g = x.createLinearGradient(0, 0, 0, H * 0.17);
  g.addColorStop(0, "#050505"); g.addColorStop(0.4, "#050505"); g.addColorStop(0.46, iris); g.addColorStop(0.9, iris); g.addColorStop(1, "#2a2420");
  x.fillStyle = g; x.fillRect(0, 0, W, H * 0.17);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; x.fillRect(Math.random() * W, H * 0.075 + Math.random() * H * 0.08, 1, 2); }
  // a few veins at the edges
  x.strokeStyle = "rgba(170,60,60,0.12)";
  for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(Math.random() * W, H); x.lineTo(Math.random() * W, H * 0.55); x.stroke(); }
  return c;
}
// a material cache per creature (disposed with it); skinned and rigid
// copies differ only in .skinning (r128 needs the flag on the material)
function materials(opts) {
  const made = [], textures = [], flat = !!(opts && opts.flat);
  // flat: faceted shading for the low-poly style (each triangle one shade)
  const keep = (m) => { if (flat) { m.flatShading = true; m.bumpMap = null; } made.push(m); return m; };
  const T = (t) => { textures.push(t); return t; };
  const color = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const cache = {};
  function get(key, skinned, make) {
    const k = key + (skinned ? "/s" : "");
    if (!cache[k]) { cache[k] = keep(make()); cache[k].skinning = !!skinned; }
    return cache[k];
  }
  let skinMap = null, skinBump = null, clothMap = null, clothBump = null, hairMap = null;
  return {
    skin(tone, skinned) {
      skinMap = skinMap || T(tex(skinCanvas(3), [3, 3], true)); skinBump = skinBump || T(tex(grain(4, 256, 5000, 0.35), [14, 14]));
      return get("skin" + tone, skinned, () => new THREE.MeshStandardMaterial({ color: color(tone), map: skinMap, bumpMap: skinBump, bumpScale: 0.0006, roughness: 0.58, metalness: 0, envMapIntensity: 0.55 }));
    },
    cloth(hex, skinned, rough) {
      clothMap = clothMap || T(tex(clothCanvas(5), [5, 5], true)); clothBump = clothBump || T(tex(grain(6, 256, 7000, 0.5), [9, 9]));
      return get("cloth" + hex + (rough || ""), skinned, () => new THREE.MeshStandardMaterial({ color: color(hex), map: clothMap, bumpMap: clothBump, bumpScale: 0.0009, roughness: rough || 0.82, metalness: 0, envMapIntensity: 0.5 }));
    },
    rubber(hex, skinned) {
      return get("rubber" + hex, skinned, () => new THREE.MeshStandardMaterial({ color: color(hex), roughness: 0.62, metalness: 0.05, envMapIntensity: 0.6 }));
    },
    metal(hex, skinned) {
      return get("metal" + hex, skinned, () => new THREE.MeshStandardMaterial({ color: color(hex), roughness: 0.32, metalness: 0.85, envMapIntensity: 1 }));
    },
    hair(hex, skinned) {
      hairMap = hairMap || T(tex(hairCanvas(7), [6, 2], true));
      return get("hair" + hex, skinned, () => new THREE.MeshStandardMaterial({ color: color(hex), map: hairMap, roughness: 0.72, metalness: 0, envMapIntensity: 0.35 }));
    },
    eye(iris) {
      return get("eye" + iris, false, () => new THREE.MeshStandardMaterial({ map: T(tex(eyeCanvas(iris), [1, 1], true)), roughness: 0.12, metalness: 0, envMapIntensity: 1 }));
    },
    // the skin's tone through vertex colours (lips, brows, cheeks on a head)
    // (morph: the mesh has morph targets — r128 needs the flags on the material)
    skinVC(tone, morph) {
      skinMap = skinMap || T(tex(skinCanvas(3), [3, 3], true)); skinBump = skinBump || T(tex(grain(4, 256, 5000, 0.35), [14, 14]));
      return get("skinvc" + tone + (morph ? "/m" : ""), false, () => new THREE.MeshStandardMaterial({ color: color(tone), vertexColors: true, map: skinMap, bumpMap: skinBump, bumpScale: 0.0004, roughness: 0.55, metalness: 0, envMapIntensity: 0.55,
        morphTargets: !!morph, morphNormals: !!morph }));
    },
    // a plain colour (teeth, the inside of a mouth); o: { side, morph }
    flat(hex, rough, o) {
      o = o || {};
      return get("flat" + hex + rough + (o.side || "") + (o.morph ? "/m" : ""), false, () => new THREE.MeshStandardMaterial({ color: color(hex), roughness: rough, metalness: 0, envMapIntensity: 0.5,
        side: o.side || THREE.FrontSide, morphTargets: !!o.morph }));
    },
    dispose() { made.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); },
  };
}

// skinned meshes from a list of { geo, mat } (one mesh per material),
// all bound to the same skeleton inside `group`
function skinned(group, skel, parts) {
  const byMat = new Map();
  parts.forEach(({ geo, mat }) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geo); });
  group.updateMatrixWorld(true);
  const skeletonObj = new THREE.Skeleton(skel.bones);
  const meshes = [];
  byMat.forEach((geos, mat) => {
    const m = new THREE.SkinnedMesh(merge(geos), mat);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    group.add(m); m.bind(skeletonObj);
    meshes.push(m);
  });
  return { skeleton: skeletonObj, meshes };
}
// rigid meshes from { geo, mat }, merged per material, hung on a bone
function rigid(bone, parts) {
  const byMat = new Map();
  parts.forEach(({ geo, mat }) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geo); });
  const out = [];
  byMat.forEach((geos, mat) => {
    const keepIdx = geos.every((g) => g.index);
    const g = merge(geos.map((x) => (keepIdx ? x : x.toNonIndexed())));
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
    bone.add(m); out.push(m);
  });
  return out;
}
// only the attributes a merge with swept rigid parts expects
function plain(geo, withColor) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", geo.attributes.position);
  g.setAttribute("normal", geo.attributes.normal);
  g.setAttribute("uv", geo.attributes.uv);
  if (withColor) g.setAttribute("color", geo.attributes.color);
  g.setIndex(geo.index);
  return g;
}

// ---------- building and moving a creature ----------
function build(id, params, opts) {
  const def = CREATURES.find((d) => d.id === id);
  if (!def) throw new Error("LifeKit: no creature " + id);
  const p = {};
  def.params.forEach((q) => { p[q.key] = params && params[q.key] != null ? params[q.key] : q.value; });
  const c = def.build(p, opts || {});
  c.def = def; c.params = p;
  c.phase = 0;
  const move = MOVES[(def.moves || [])[0]];
  c.animate = (t, dt, state) => {
    const r = move ? move.animate(c, t, dt, state || {}) : null;
    if (c.face) c.face.update(t, dt, Object.assign({ gait: (state || {}).gait }, state));   // a face: blinks, glances, expressions
    return r;
  };
  c.dispose = () => {
    c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (c.mats) c.mats.dispose();
    if (c.group.parent) c.group.parent.remove(c.group);
  };
  return c;
}

return {
  CREATURES, MOVES, register, registerMove, build,
  util: { rng, V3, smooth, lerp, skeleton, sweep, merge, materials, skinned, rigid, plain, weld, decimate },
};
})();
