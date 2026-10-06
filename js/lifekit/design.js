/* LifeKit — creatures from a design (js/lifekit/design.js): the creature
   editor's builder (labs/creator.html). Loaded after lifekit.js and
   move/legs.js. docs/life.md, "The creature editor".

   A design is data (JSON), so it can be saved, shared and loaded:
     {
       name,
       spine: [{ p: [y, z], r, sq }],   tail tip first, the head's tip last;
                                        r: the body's half-width there (m),
                                        sq: its height ÷ its width
       legs:  [{ t, len, thick, spread, knee, foot }]  — each one a mirrored
              pair: t 0…1 along the spine, len (m), thick (× len),
              spread (how far out from the body), knee +1 forward / −1 back,
              foot "hoof" | "paw" | "claw"
       eyes:  { at, size }               0…1 back from the head's tip, × r
       skin:  { color, pattern, seed }   pattern 0 plain, 1 stripes, 2 spots, 3 banded
     }
   The builder makes a bone at every spine point (two chains out from the
   one nearest the middle, under a root), one sweep for the body through
   the points, a sweep and a foot per leg; the whole design is lowered so
   its legs stand at ~90% of their length — the body finds its own height.

   API
     LifeKit.design.build(design, opts) → a creature (as LifeKit.build's),
       moving with move/legs.js; .handles: the spine points' and the legs'
       hips' positions (for the editor)
     LifeKit.design.PRESETS               { id: design }
     LifeKit.design.clean(design)         a design with its numbers in range */
(function () {
"use strict";
const LK = window.LifeKit, U = LK.util;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const COLORS = ["#b48a5c", "#9a5434", "#8a7a5c", "#5e6266", "#4e3828", "#6b6a3a", "#3a4a52"];

const PRESETS = {
  grazer: { name: "Grazer", spine: [
    { p: [0.95, -0.85], r: 0.03, sq: 1 }, { p: [1.05, -0.7], r: 0.13, sq: 1.1 }, { p: [1.12, -0.35], r: 0.2, sq: 1.25 },
    { p: [1.15, 0.05], r: 0.21, sq: 1.35 }, { p: [1.25, 0.4], r: 0.17, sq: 1.3 }, { p: [1.55, 0.62], r: 0.09, sq: 1.15 },
    { p: [1.82, 0.78], r: 0.08, sq: 1.1 }, { p: [1.78, 1.0], r: 0.05, sq: 1 } ],
    legs: [{ t: 0.3, len: 0.95, thick: 0.08, spread: 0.6, knee: 1, foot: "hoof" }, { t: 0.62, len: 0.95, thick: 0.075, spread: 0.6, knee: -1, foot: "hoof" }],
    eyes: { at: 0.08, size: 0.17 }, skin: { color: 0, pattern: 1, seed: 1 } },
  runner: { name: "Biped runner", spine: [
    { p: [0.85, -1.0], r: 0.025, sq: 1 }, { p: [0.95, -0.6], r: 0.08, sq: 1.1 }, { p: [1.0, -0.2], r: 0.17, sq: 1.25 },
    { p: [1.05, 0.15], r: 0.16, sq: 1.25 }, { p: [1.2, 0.38], r: 0.08, sq: 1.1 }, { p: [1.42, 0.5], r: 0.075, sq: 1.15 }, { p: [1.42, 0.72], r: 0.035, sq: 1 } ],
    legs: [{ t: 0.4, len: 1.0, thick: 0.08, spread: 0.55, knee: 1, foot: "claw" }],
    eyes: { at: 0.14, size: 0.2 }, skin: { color: 5, pattern: 2, seed: 3 } },
  crawler: { name: "Six-legged crawler", spine: [
    { p: [0.3, -0.75], r: 0.04, sq: 0.7 }, { p: [0.35, -0.5], r: 0.16, sq: 0.6 }, { p: [0.38, -0.15], r: 0.2, sq: 0.6 },
    { p: [0.38, 0.2], r: 0.17, sq: 0.65 }, { p: [0.36, 0.45], r: 0.12, sq: 0.75 }, { p: [0.34, 0.62], r: 0.06, sq: 0.8 } ],
    legs: [{ t: 0.38, len: 0.6, thick: 0.06, spread: 1.6, knee: 1, foot: "claw" }, { t: 0.55, len: 0.6, thick: 0.06, spread: 1.6, knee: 1, foot: "claw" },
      { t: 0.72, len: 0.55, thick: 0.06, spread: 1.6, knee: -1, foot: "claw" }],
    eyes: { at: 0.15, size: 0.25 }, skin: { color: 6, pattern: 3, seed: 5 } },
  sprawler: { name: "Low sprawler", spine: [
    { p: [0.15, -1.3], r: 0.025, sq: 0.8 }, { p: [0.2, -0.85], r: 0.07, sq: 0.8 }, { p: [0.26, -0.4], r: 0.15, sq: 0.75 },
    { p: [0.28, 0.05], r: 0.17, sq: 0.75 }, { p: [0.28, 0.45], r: 0.12, sq: 0.8 }, { p: [0.3, 0.75], r: 0.09, sq: 0.8 }, { p: [0.27, 1.0], r: 0.04, sq: 0.7 } ],
    legs: [{ t: 0.4, len: 0.42, thick: 0.13, spread: 1.4, knee: 1, foot: "claw" }, { t: 0.66, len: 0.4, thick: 0.13, spread: 1.4, knee: -1, foot: "claw" }],
    eyes: { at: 0.12, size: 0.22 }, skin: { color: 5, pattern: 2, seed: 8 } },
  serpent: { name: "Legless glider", spine: [
    { p: [0.07, -1.6], r: 0.02, sq: 0.9 }, { p: [0.08, -1.1], r: 0.05, sq: 0.9 }, { p: [0.09, -0.55], r: 0.08, sq: 0.85 },
    { p: [0.09, 0], r: 0.09, sq: 0.85 }, { p: [0.09, 0.55], r: 0.08, sq: 0.85 }, { p: [0.12, 0.95], r: 0.07, sq: 0.8 }, { p: [0.11, 1.15], r: 0.035, sq: 0.7 } ],
    legs: [], eyes: { at: 0.1, size: 0.25 }, skin: { color: 3, pattern: 1, seed: 2 } },
};

function clean(d) {
  const o = JSON.parse(JSON.stringify(d || PRESETS.grazer));
  o.spine = (o.spine || []).slice(0, 14).map((q) => ({ p: [clamp(+q.p[0] || 0, 0.02, 4), clamp(+q.p[1] || 0, -4, 4)], r: clamp(+q.r || 0.05, 0.01, 1), sq: clamp(+q.sq || 1, 0.3, 3) }));
  while (o.spine.length < 3) o.spine.push({ p: [0.5, o.spine.length * 0.3], r: 0.1, sq: 1 });
  o.legs = (o.legs || []).slice(0, 5).map((l) => ({ t: clamp(+l.t || 0.5, 0.02, 0.98), len: clamp(+l.len || 0.5, 0.1, 3), thick: clamp(+l.thick || 0.08, 0.02, 0.3),
    spread: clamp(l.spread == null ? 0.6 : +l.spread, 0, 3), knee: l.knee === -1 ? -1 : 1, foot: ["hoof", "paw", "claw"].includes(l.foot) ? l.foot : "paw" }));
  o.eyes = { at: clamp(o.eyes && o.eyes.at != null ? +o.eyes.at : 0.1, 0.02, 0.5), size: clamp(o.eyes && o.eyes.size ? +o.eyes.size : 0.2, 0.05, 0.6) };
  o.skin = { color: clamp(Math.round(o.skin && o.skin.color != null ? +o.skin.color : 0), 0, COLORS.length - 1), pattern: clamp(Math.round(o.skin && o.skin.pattern != null ? +o.skin.pattern : 0), 0, 3), seed: Math.max(1, Math.round(o.skin && o.skin.seed ? +o.skin.seed : 1)) };
  o.name = String(o.name || "Creature").slice(0, 40);
  return o;
}

// along the spine: a smooth curve through the points, t 0 (tail) … 1 (head)
function spineCurve(S) { return new THREE.CatmullRomCurve3(S.map((q) => new THREE.Vector3(0, q.p[0], q.p[1])), false, "centripetal"); }
function radiusAt(S, t) { const f = t * (S.length - 1), i = Math.min(S.length - 2, Math.floor(f)), k = f - i; return { r: S[i].r + (S[i + 1].r - S[i].r) * k, sq: S[i].sq + (S[i + 1].sq - S[i].sq) * k, i: k < 0.5 ? i : i + 1 }; }

function build(design, opts) {
  const D = clean(design), S = D.spine, n = S.length, det = (opts && opts.detail) || 1;
  const curve = spineCurve(S);
  // the legs' hips, and how low the whole design goes so its legs stand
  const legs = D.legs.map((l) => {
    const A = curve.getPoint(l.t), ra = radiusAt(S, l.t);
    return Object.assign({}, l, { A, r: ra.r, sq: ra.sq, bone: ra.i, hipY: A.y - ra.r * ra.sq * 0.45, hipZ: A.z });
  });
  let shift = 0;
  if (legs.length) shift = legs.reduce((s, l) => s + (l.hipY - 0.9 * l.len), 0) / legs.length;
  else shift = Math.min(...S.map((q) => q.p[0] - q.r * q.sq)) - 0.002;
  const P = S.map((q) => new THREE.Vector3(0, q.p[0] - shift, q.p[1]));
  const H = Math.max(...P.map((v) => v.y)) + 0.1;

  // ---------- the skeleton ----------
  const zs = P.map((v) => v.z), zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
  let c = 0; P.forEach((v, i) => { if (Math.abs(v.z - zMid) < Math.abs(P[c].z - zMid)) c = i; });
  const spec = [{ name: "root", at: [0, P[c].y, P[c].z] }, { name: "s" + c, parent: "root", at: P[c].toArray() }];
  for (let i = c + 1; i < n; i++) spec.push({ name: "s" + i, parent: "s" + (i - 1), at: P[i].toArray() });
  for (let i = c - 1; i >= 0; i--) spec.push({ name: "s" + i, parent: "s" + (i + 1), at: P[i].toArray() });
  const LEG = [];
  legs.forEach((l, k) => [1, -1].forEach((sg) => {
    const id = k + (sg > 0 ? "L" : "R"), x = sg * l.r * (0.35 + 0.45 * l.spread), y = l.hipY - shift, z = l.hipZ;
    const a = l.len * 0.48, b = l.len * 0.44, hh = l.len * 0.08;
    // sprawled legs (spread > 1) go out sideways first: their hip sits further out
    const xo = x + sg * Math.max(0, l.spread - 1) * l.len * 0.25;
    spec.push({ name: "hip" + id, parent: "s" + l.bone, at: [xo, y, z] }, { name: "knee" + id, parent: "hip" + id, at: [xo, y - a, z] },
      { name: "foot" + id, parent: "knee" + id, at: [xo, y - a - b, z] });
    LEG.push({ id, k, sg, a, b, hh, x: xo, y, z, bodyX: x, l });
  }));
  const skel = U.skeleton(spec), B = skel.byName;
  const group = new THREE.Group(); group.name = "creature:" + D.name; group.add(skel.root);
  const mats = U.materials();
  const hex = COLORS[D.skin.color];
  const hide = (sk) => mats.own("hide", sk, (T) => {
    const { c: cv, cb } = U.hide({ seed: D.skin.seed, pattern: D.skin.pattern }, hex);
    return new THREE.MeshStandardMaterial({ map: T(U.tex(cv, [1, 0.6], true)), bumpMap: T(U.tex(cb, [1, 0.6], false)), bumpScale: 0.0015, roughness: 0.8, metalness: 0, envMapIntensity: 0.5 });
  });
  const keratin = mats.own("keratin", false, () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#2a231d").convertSRGBToLinear(), roughness: 0.5, envMapIntensity: 0.6 }));
  const eyeMat = mats.own("eye", false, () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#120c08").convertSRGBToLinear(), roughness: 0.06, envMapIntensity: 1.3 }));
  const seg = Math.max(10, Math.round(20 * det));
  const sec = (p, rx, f, b, w, nn) => ({ p: Array.isArray(p) ? p : p.toArray(), rx, f, b, w, n: nn || 2.15 });
  const parts = [];
  // ---------- the body: one sweep through the spine points ----------
  const body = S.map((q, i) => sec(P[i], q.r, q.r * q.sq, q.r * q.sq, (() => {
    const w = { ["s" + i]: 1 };
    return w;
  })()));
  parts.push({ geo: U.sweep(body, { seg, steps: Math.max(3, Math.round(5 * det)), bones: skel.index, front: [0, 1, 0], capStart: 1, capEnd: 1, capLen: 0.8 }), mat: hide(true) });
  // ---------- the legs ----------
  LEG.forEach((g) => {
    const t = g.l.thick * g.l.len, hip = "hip" + g.id, knee = "knee" + g.id, foot = "foot" + g.id, par = "s" + g.l.bone;
    const top = new THREE.Vector3(g.bodyX * 0.6, g.y + g.l.r * g.l.sq * 0.4, g.z);
    const secs = [
      sec(top, t * 1.1, t * 1.3, t * 1.3, { [par]: 1 }),
      sec([g.x, g.y, g.z], t * 1.15, t * 1.3, t * 1.2, { [par]: 0.3, [hip]: 0.7 }),
      sec([g.x, g.y - g.a * 0.5, g.z], t * 0.9, t * 1.0, t * 1.0, { [hip]: 1 }),
      sec([g.x, g.y - g.a, g.z], t * 0.6, t * 0.65, t * 0.65, { [hip]: 0.5, [knee]: 0.5 }),
      sec([g.x, g.y - g.a - g.b * 0.5, g.z], t * 0.5, t * 0.55, t * 0.55, { [knee]: 1 }),
      sec([g.x, g.y - g.a - g.b, g.z], t * 0.42, t * 0.45, t * 0.45, { [knee]: 0.4, [foot]: 0.6 }),
    ];
    parts.push({ geo: U.sweep(secs, { seg: Math.max(8, Math.round(14 * det)), steps: 3, bones: skel.index, front: [0, 0, 1], capStart: 1 }), mat: hide(true) });
    // the foot, in the foot bone's space (origin at the ankle; the ground g.hh below)
    const fb = B[foot], kind = g.l.foot, hh = g.hh, fw = t * 0.55;
    const fparts = [];
    if (kind === "hoof") {
      const hs = (y, rx, f, b) => sec([0, y, t * 0.1], rx, f, b, {}, 2.6);
      fparts.push({ geo: U.sweep([hs(-hh * 0.1, fw, fw * 1.05, fw), hs(-hh * 0.6, fw * 1.15, fw * 1.3, fw), hs(-hh + 0.002, fw * 1.25, fw * 1.45, fw * 1.05)], { seg: 14, steps: 2, rigid: true, front: [0, 0, 1], capEnd: 1, capLen: 0.2 }), mat: keratin });
    } else {
      // a paw (a padded foot) or a claw (three toes and nails)
      const pad = U.sweep([sec([0, -hh * 0.1, 0], fw, fw, fw, {}), sec([0, -hh * 0.75, fw * 0.6], fw * 1.2, fw * 0.9, fw * 0.9, {}), sec([0, -hh * 0.95, fw * 1.6], fw * 1.15, fw * 0.6, fw * 0.6, {})],
        { seg: 14, steps: 2, rigid: true, front: [0, 1, 0], capStart: 1, capEnd: 1 });
      fparts.push({ geo: pad, mat: hide(false) });
      if (kind === "claw") [-1, 0, 1].forEach((k) => {
        const toe = U.sweep([sec([k * fw * 0.7, -hh * 0.85, fw * 1.4], fw * 0.35, fw * 0.35, fw * 0.35, {}), sec([k * fw * 0.95, -hh * 0.95, fw * 2.6], fw * 0.18, fw * 0.12, fw * 0.12, {})],
          { seg: 8, steps: 2, rigid: true, front: [0, 1, 0], capEnd: 1, capLen: 1.4 });
        fparts.push({ geo: toe, mat: keratin });
      });
    }
    U.rigid(fb, fparts);
  });
  const { meshes } = U.skinned(group, skel, parts);
  // ---------- the eyes, on the head's sides ----------
  const head = B["s" + (n - 1)], hp = P[n - 1], prev = P[n - 2], dir = hp.clone().sub(prev).normalize();
  const ht = 1 - D.eyes.at * 0.9, ep = curve.getPoint(Math.min(0.999, ht)); ep.y -= shift;
  const er = radiusAt(S, ht);
  const eyes = [];
  [1, -1].forEach((sg) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.006, er.r * D.eyes.size), 16, 12), eyeMat);
    e.position.set(sg * er.r * 0.8, ep.y + er.r * er.sq * 0.35, ep.z).sub(hp); head.add(e); eyes.push(e);
  });
  const backs = []; for (let i = c - 1; i >= 0; i--) backs.push(B["s" + i]);
  const fronts = []; for (let i = c + 1; i < n; i++) fronts.push(B["s" + i]);
  const rig = { root: B.root, center: B["s" + c], fronts, backs, head,
    legs: LEG.map((g) => ({ hip: B["hip" + g.id], knee: B["knee" + g.id], foot: B["foot" + g.id], a: g.a, b: g.b, hh: g.hh, bend: g.l.knee, pair: g.k, sg: g.sg, zN: g.z, xN: g.x })) };
  const pairsZ = D.legs.map((l, k) => ({ k, z: legs[k].hipZ })).sort((a, b) => b.z - a.z);
  const order = {}; pairsZ.forEach((q, i) => { order[q.k] = i; });
  const dims = { H, legLen: legs.length ? legs.reduce((s, l) => s + l.len, 0) / legs.length : 0.3, pairs: D.legs.length, order, drop: 0 };
  const cre = { group, rig, dims, mats, skeleton: skel, meshes, eyes, design: D, params: {}, def: { id: "design", name: D.name, moves: ["legs"] } };
  cre.handles = { spine: P.map((v) => v.clone()), legs: legs.map((l, k) => new THREE.Vector3(LEG[k * 2].x, LEG[k * 2].y, LEG[k * 2].z)), shift };
  const move = LK.MOVES.legs;
  cre.animate = (t, dt, st) => move.animate(cre, t, dt, st || {});
  cre.rest = () => move.rest(cre);
  cre.dispose = () => { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mats.dispose(); if (group.parent) group.parent.remove(group); };
  return cre;
}

LK.design = { build, PRESETS, clean, COLORS };
})();
