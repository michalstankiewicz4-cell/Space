/* LifeKit — the plains strider (js/lifekit/creatures/strider.js). Loaded
   after lifekit.js and move/quad.js. docs/life.md, "Four legs".

   An invented grazer of open plains, built to be believable rather than
   any real animal: long legs on hooves, a deep chest, a back sloping to
   the hips, a long neck, a narrow head with two horns swept back, a low
   ridge of horn plates along the spine, a short tail. Around the size of a
   large antelope.

   The body, the neck, the head and the legs are swept and skinned to one
   skeleton (24 bones), so it bends at every joint; hooves, horns, plates,
   ears and eyes are rigid on their bones. The hide is painted per seed:
   countershading (dark back, pale belly), a pattern (stripes, spots or
   banded legs), mottling, a fine hair grain for the bump. */
(function () {
"use strict";
const LK = window.LifeKit, U = LK.util;
const COLORS = [["Sand", "#b48a5c"], ["Rust", "#9a5434"], ["Dun", "#8a7a5c"], ["Slate", "#5e6266"], ["Umber", "#4e3828"]];
const pct = (v) => Math.round(v * 100) + "%";

LK.register({
  id: "strider", name: "Plains strider", group: "Land animals", media: ["land"], moves: ["quad"],
  blurb: "An invented grazer of open plains — long legs on hooves, a long neck, horns swept back, a ridge of horn plates. Walks, trots, grazes.",
  params: [
    { key: "size", name: "Shoulder height", min: 0.8, max: 2.2, step: 0.01, value: 1.4, fmt: (v) => v.toFixed(2) + " m" },
    { key: "legs", name: "Legs (short → long)", min: 0, max: 1, step: 0.01, value: 0.55, fmt: pct },
    { key: "neck", name: "Neck (short → long)", min: 0, max: 1, step: 0.01, value: 0.5, fmt: pct },
    { key: "bulk", name: "Build (lean → heavy)", min: 0, max: 1, step: 0.01, value: 0.4, fmt: pct },
    { key: "horns", name: "Horns", choices: ["None", "Short spikes", "Swept back", "Long and curved"], value: 2 },
    { key: "ridge", name: "Back ridge", choices: ["None", "Low plates", "Tall spines"], value: 1 },
    { key: "pattern", name: "Pattern", choices: ["Plain", "Stripes", "Spots", "Banded legs"], value: 1 },
    { key: "color", name: "Colour", choices: COLORS.map((x) => x[0]), value: 0 },
    { key: "seed", name: "Individual", seed: true, value: 1 },
  ],
  build,
});

// the hide: LifeKit.util.hide (lifekit.js), shared with the creature editor
const hideCanvases = (P, hex) => U.hide(P, hex);
const TAU = Math.PI * 2;

// horn: rings in the bump, a darker tip
function hornCanvases(seed) {
  const [c, x] = U.canvas(64, 256), [cb, xb] = U.canvas(64, 256), r = U.rng(seed);
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#5a4c3c"); g.addColorStop(0.7, "#3a3028"); g.addColorStop(1, "#16120e");
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  xb.fillStyle = "#808080"; xb.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 6 + r() * 4) { xb.fillStyle = "rgba(0,0,0,0.35)"; xb.fillRect(0, y, 64, 2); xb.fillStyle = "rgba(255,255,255,0.2)"; xb.fillRect(0, y + 2, 64, 1); }
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,240,220,${r() * 0.05})`; x.fillRect(r() * 64, r() * 256, 1, 3 + r() * 6); }
  return { c, cb };
}

function build(P, opts) {
  const det = opts.detail || 1, H = P.size, s = H / 1.4;
  const legK = 0.88 + 0.3 * P.legs, bw = 0.85 + 0.35 * P.bulk, nk = P.neck;
  const r = U.rng(P.seed * 31 + 7);
  const hex = COLORS[P.color][1];
  const mats = U.materials();
  const seg = Math.max(10, Math.round(20 * det)), steps = Math.max(2, Math.round(3 * det));

  // ---------- proportions ----------
  const shY = H * 0.8 * (0.92 + 0.08 * legK), hpY = H * 0.77 * (0.92 + 0.08 * legK);          // the joints' heights (straight legs, rest)
  const BL = H * 1.05 * (0.95 + 0.1 * P.bulk) / Math.sqrt(legK) * 1.05;                    // the body's length
  const depth = H * 0.36 * bw / Math.pow(legK, 0.6);                                       // the chest's depth
  const wF = H * 0.11 * bw, wH = H * 0.1 * bw;
  const zF = BL * 0.38, zH = -BL * 0.45;
  const withers = shY + H * 0.16, rumpTop = hpY + H * 0.13, belly = shY - depth * 0.95;
  const NL = H * (0.38 + 0.5 * nk), ndir = new THREE.Vector3(0, Math.sin(0.95 - 0.25 * nk), Math.cos(0.95 - 0.25 * nk));
  const neckBase = new THREE.Vector3(0, withers - H * 0.01, zF + BL * 0.2);
  const headP = neckBase.clone().addScaledVector(ndir, NL), HL = H * 0.34;
  const hdir = new THREE.Vector3(0, -0.55, 1).normalize();

  // the legs' bones (fractions of the joint's height), straight down at rest
  const legDef = (front, sg) => {
    const Y = front ? shY : hpY, f = front ? [0.36, 0.34, 0.22, 0.08] : [0.37, 0.36, 0.21, 0.06];
    const [a, b, c, hh] = f.map((q) => q * Y);
    return { front, sg, x: sg * (front ? wF : wH), z: front ? zF : zH, Y, a, b, c, hh, bend: front ? -1 : 1 };
  };
  const LD = [legDef(true, 1), legDef(true, -1), legDef(false, 1), legDef(false, -1)];   // LF, RF, LH, RH (+X: its left)
  const spec = [
    { name: "root", at: [0, hpY + H * 0.04, zH + BL * 0.04] },
    { name: "spine", parent: "root", at: [0, (hpY + shY) / 2 + H * 0.05, 0] },
    { name: "chest", parent: "spine", at: [0, shY + H * 0.05, zF - BL * 0.1] },
    { name: "neck1", parent: "chest", at: neckBase.toArray() },
    { name: "neck2", parent: "neck1", at: neckBase.clone().addScaledVector(ndir, NL * 0.5).toArray() },
    { name: "head", parent: "neck2", at: headP.toArray() },
    { name: "tail1", parent: "root", at: [0, rumpTop - H * 0.03, zH - BL * 0.14] },
    { name: "tail2", parent: "tail1", at: [0, rumpTop - H * 0.12, zH - BL * 0.2] },
    { name: "tail3", parent: "tail2", at: [0, rumpTop - H * 0.24, zH - BL * 0.22] },
  ];
  const LN = ["LF", "RF", "LH", "RH"];
  LD.forEach((g, i) => {
    const n = LN[i], par = g.front ? "chest" : "root";
    spec.push({ name: "hip" + n, parent: par, at: [g.x, g.Y, g.z] }, { name: "knee" + n, parent: "hip" + n, at: [g.x, g.Y - g.a, g.z] },
      { name: "hock" + n, parent: "knee" + n, at: [g.x, g.Y - g.a - g.b, g.z] }, { name: "hoof" + n, parent: "hock" + n, at: [g.x, g.hh, g.z] });
  });
  const skel = U.skeleton(spec), B = skel.byName;
  const group = new THREE.Group(); group.name = "strider"; group.add(skel.root);

  // ---------- materials ----------
  const hide = (skinned) => mats.own("hide" + P.color + "/" + P.pattern + "/" + P.seed, skinned, (T) => {
    const { c, cb } = hideCanvases(P, hex);
    const m = T(U.tex(c, [1, 0.55], true)), bm = T(U.tex(cb, [1, 0.55], false));
    return new THREE.MeshStandardMaterial({ map: m, bumpMap: bm, bumpScale: 0.0012 * s, roughness: 0.82, metalness: 0, envMapIntensity: 0.5 });
  });
  const horn = mats.own("horn" + P.seed, false, (T) => {
    const { c, cb } = hornCanvases(P.seed);
    return new THREE.MeshStandardMaterial({ map: T(U.tex(c, [1, 1], true)), bumpMap: T(U.tex(cb, [1, 1], false)), bumpScale: 0.002 * s, roughness: 0.45, metalness: 0, envMapIntensity: 0.7 });
  });
  const keratin = mats.own("hoof", false, () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#2a231d").convertSRGBToLinear(), roughness: 0.5, metalness: 0, envMapIntensity: 0.6 }));
  const eyeMat = mats.own("eye", false, () => new THREE.MeshStandardMaterial({ color: new THREE.Color("#140d08").convertSRGBToLinear(), roughness: 0.08, metalness: 0, envMapIntensity: 1.2 }));
  const innerEar = mats.own("innerEar", false, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.75).convertSRGBToLinear(), roughness: 0.9, side: THREE.DoubleSide }));

  const parts = [];
  const sk = (secs, o) => U.sweep(secs, Object.assign({ seg, steps, bones: skel.index }, o));
  const sec = (p, rx, f, b, w, n) => ({ p: Array.isArray(p) ? p : p.toArray(), rx, f, b, w, n: n || 2.15 });

  // ---------- the body, the neck and the head: one sweep ----------
  const mid = (top, bot) => [(top + bot) / 2, (top - bot) / 2];
  const at = (z, top, bot, rx, w, n) => { const [y, h] = mid(top, bot); return sec([0, y, z], rx, h, h, w, n); };
  const hp = (k) => headP.clone().addScaledVector(hdir, HL * k);
  const body = [
    at(zH - BL * 0.17, rumpTop - H * 0.04, rumpTop - H * 0.16, H * 0.06 * bw, { root: 1 }),
    at(zH - BL * 0.08, rumpTop + H * 0.005, hpY - H * 0.2, H * 0.13 * bw, { root: 1 }),
    at(zH + BL * 0.06, rumpTop + H * 0.01, hpY - H * 0.24 * bw, H * 0.15 * bw, { root: 1 }),
    at(zH + BL * 0.28, (rumpTop + withers) / 2 - H * 0.01, belly + H * 0.04, H * 0.16 * bw, { root: 0.4, spine: 0.6 }),
    at(0, (rumpTop + withers) / 2 + H * 0.02, belly, H * 0.17 * bw, { spine: 1 }),
    at(zF - BL * 0.18, withers - H * 0.01, belly - H * 0.01, H * 0.17 * bw, { spine: 0.4, chest: 0.6 }),
    at(zF - BL * 0.02, withers, belly + H * 0.04, H * 0.15 * bw, { chest: 1 }),
    at(zF + BL * 0.1, withers - H * 0.02, shY - H * 0.04, H * 0.115 * bw, { chest: 1 }),
    sec(neckBase.clone().add(new THREE.Vector3(0, -H * 0.06, -H * 0.01)), H * 0.085 * bw, H * 0.09, H * 0.1, { chest: 0.6, neck1: 0.4 }),
    sec(neckBase.clone().addScaledVector(ndir, NL * 0.18), H * 0.072, H * 0.078, H * 0.095, { chest: 0.2, neck1: 0.8 }),
    sec(neckBase.clone().addScaledVector(ndir, NL * 0.5), H * 0.06, H * 0.07, H * 0.085, { neck1: 0.5, neck2: 0.5 }),
    sec(neckBase.clone().addScaledVector(ndir, NL * 0.85), H * 0.055, H * 0.06, H * 0.07, { neck2: 0.7, head: 0.3 }),
    sec(hp(0.05), H * 0.058, H * 0.065, H * 0.06, { head: 1 }),
    sec(hp(0.3), H * 0.052, H * 0.055, H * 0.05, { head: 1 }),
    sec(hp(0.65), H * 0.038, H * 0.04, H * 0.038, { head: 1 }),
    sec(hp(0.92), H * 0.034, H * 0.036, H * 0.034, { head: 1 }),
    sec(hp(1.0), H * 0.03, H * 0.03, H * 0.03, { head: 1 }),
  ];
  parts.push({ geo: sk(body, { front: [0, 1, 0], capStart: 1, capEnd: 1, capLen: 0.7 }), mat: hide(true) });

  // ---------- the legs ----------
  LD.forEach((g, i) => {
    const n = LN[i], par = g.front ? "chest" : "root", hip = "hip" + n, knee = "knee" + n, hock = "hock" + n, hoof = "hoof" + n;
    const y0 = g.Y, K = y0 - g.a, A = K - g.b, F = A - g.c, x = g.x, z = g.z, k = g.front ? 1 : 1.15;
    const L = (y, rx, f, b, w, xi) => sec([x * (xi || 1), y, z + (g.front ? 0.004 : -0.004) * s], rx * bw, f * bw, b * bw, w, 2.1);
    const secs = [
      L(y0 + H * 0.1, H * 0.03 * k, H * 0.07 * k, H * 0.07 * k, { [par]: 1 }, 0.55),
      L(y0 + H * 0.03, H * 0.045 * k, H * 0.08 * k, H * 0.075 * k, { [par]: 0.6, [hip]: 0.4 }, 0.8),
      L(y0 - g.a * 0.12, H * 0.055 * k, H * 0.07 * k, H * 0.065 * k, { [par]: 0.2, [hip]: 0.8 }),
      L(y0 - g.a * 0.45, H * 0.045 * k, H * 0.05 * k, H * 0.05 * k, { [hip]: 1 }),
      L(K + g.a * 0.12, H * 0.03, H * 0.034, H * 0.034, { [hip]: 0.8, [knee]: 0.2 }),
      L(K, H * 0.027, H * 0.03, H * 0.032, { [hip]: 0.5, [knee]: 0.5 }),
      L(K - g.b * 0.35, H * 0.022, H * 0.024, H * 0.026, { [knee]: 1 }),
      L(A + g.b * 0.08, H * 0.019, H * 0.02, H * 0.024, { [knee]: 0.9, [hock]: 0.1 }),
      L(A, H * 0.02, H * 0.022, H * 0.026, { [knee]: 0.5, [hock]: 0.5 }),
      L(A - g.c * 0.5, H * 0.014, H * 0.016, H * 0.017, { [hock]: 1 }),
      L(F + g.c * 0.06, H * 0.016, H * 0.018, H * 0.019, { [hock]: 0.7, [hoof]: 0.3 }),
      L(F, H * 0.017, H * 0.019, H * 0.019, { [hock]: 0.4, [hoof]: 0.6 }),
      L(F - g.hh * 0.45, H * 0.016, H * 0.018, H * 0.017, { [hoof]: 1 }),
    ];
    parts.push({ geo: sk(secs, { front: [0, 0, 1], capStart: 1 }), mat: hide(true) });
    // the hoof: dark keratin, a little wider at the ground
    const hs = (y, rx, f, b) => sec([x, y, z + H * 0.006], rx, f, b, {}, 2.6);
    const hg = U.sweep([hs(g.hh * 0.62, H * 0.018, H * 0.02, H * 0.018), hs(g.hh * 0.3, H * 0.022, H * 0.026, H * 0.02), hs(0.002, H * 0.025, H * 0.03, H * 0.021)],
      { seg: 14, steps: 2, rigid: true, front: [0, 0, 1], capEnd: 1, capLen: 0.2 });
    hg.translate(-x, -g.hh, -z);   // into the hoof bone's space (its origin at the fetlock)
    U.rigid(B[hoof], [{ geo: hg, mat: keratin }]);
  });

  // ---------- the tail ----------
  const tailSecs = ["tail1", "tail2", "tail3"].map((n, i) => sec(skel.abs[n], H * (0.035 - i * 0.01), H * (0.035 - i * 0.008), H * (0.035 - i * 0.008), { [n]: 1 }));
  tailSecs.unshift(sec([0, rumpTop - H * 0.02, zH - BL * 0.1], H * 0.04, H * 0.04, H * 0.04, { root: 1 }));
  tailSecs.push(sec([0, rumpTop - H * 0.32, zH - BL * 0.215], H * 0.018, H * 0.025, H * 0.018, { tail3: 1 }));
  parts.push({ geo: sk(tailSecs, { front: [0, 0, -1], capEnd: 1 }), mat: hide(true) });

  const { meshes } = U.skinned(group, skel, parts);

  // ---------- on the head: eyes, ears, horns ----------
  const head = B.head, hpos = skel.abs.head, local = (v) => v.clone().sub(hpos);
  const eyes = [], ears = [];
  [1, -1].forEach((sg) => {
    const ep = local(hp(0.22)).add(new THREE.Vector3(sg * H * 0.048, H * 0.03, 0));
    const e = new THREE.Mesh(new THREE.SphereGeometry(H * 0.011, 16, 12), eyeMat); e.position.copy(ep); head.add(e); eyes.push(e);
    // the lid ring around the eye, in the hide
    const lid = new THREE.Mesh(new THREE.TorusGeometry(H * 0.012, H * 0.004, 8, 18), hide(false)); lid.position.copy(ep); lid.rotation.y = sg * Math.PI / 2; head.add(lid);
    // an ear: a long cupped leaf
    const eg = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI, 0, Math.PI); eg.scale(H * 0.022, H * 0.075, H * 0.014); eg.translate(0, H * 0.07, 0);
    const ear = new THREE.Group(), outer = new THREE.Mesh(eg, hide(false)), inner = new THREE.Mesh(eg.clone().scale(0.8, 0.9, 0.6), innerEar);
    inner.position.z = H * 0.002; ear.add(outer, inner);
    ear.position.copy(local(hp(0.02)).add(new THREE.Vector3(sg * H * 0.04, H * 0.055, -H * 0.01)));
    ear.userData = { rx: -0.6, ry: sg * 0.9, rz: sg * -0.9 };
    ear.rotation.set(-0.6, sg * 0.9, sg * -0.9); head.add(ear); ears.push(ear);
    outer.castShadow = true;
    // a horn: swept from the brow back over the neck, twisting a little
    if (P.horns) {
      const len = H * [0, 0.09, 0.26, 0.42][P.horns], curl = [0, 0.1, 0.55, 1.1][P.horns], base = local(hp(0.06)).add(new THREE.Vector3(sg * H * 0.03, H * 0.06, 0));
      const pts = [], N = 7;
      for (let i = 0; i <= N; i++) {
        const t = i / N, ang = 0.5 + curl * t * 1.6;
        pts.push(sec(base.clone().add(new THREE.Vector3(sg * len * 0.18 * t, Math.cos(ang) * len * t * 0.9, -Math.sin(ang) * len * t)),
          H * 0.017 * (1 - 0.85 * t), H * 0.017 * (1 - 0.85 * t), H * 0.017 * (1 - 0.85 * t), {}, 2));
      }
      const hg = U.sweep(pts, { seg: 12, steps: 3, rigid: true, front: [0, 0, 1], capEnd: 1, capLen: 0.6 });
      const hm = new THREE.Mesh(hg, horn); hm.castShadow = true; head.add(hm);
    }
  });
  // nostrils: two dark dents at the muzzle's tip
  [1, -1].forEach((sg) => { const nm = new THREE.Mesh(new THREE.SphereGeometry(H * 0.006, 8, 6), eyeMat); nm.position.copy(local(hp(0.97)).add(new THREE.Vector3(sg * H * 0.014, H * 0.012, 0))); nm.scale.set(1, 0.6, 0.5); head.add(nm); });

  // ---------- the ridge: horn plates along the spine ----------
  if (P.ridge) {
    const tall = P.ridge === 2, n = tall ? 13 : 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), z = lerp(zH - BL * 0.02, zF + BL * 0.06, t);
      const bone = t < 0.3 ? B.root : t < 0.7 ? B.spine : B.chest;
      const top = lerp(rumpTop, withers, Math.pow(t, 0.8)) + H * 0.005;
      const h = H * (tall ? 0.05 + 0.04 * Math.sin(Math.PI * t) : 0.018 + 0.012 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * r());
      const g = new THREE.ConeGeometry(H * (tall ? 0.012 : 0.022), h, tall ? 5 : 4, 1); g.scale(tall ? 0.5 : 0.35, 1, 1); g.rotateX(tall ? -0.35 : -0.6);
      const m = new THREE.Mesh(g, horn); m.castShadow = true;
      let yAbs = 0, zAbs = 0; for (let b = bone; b; b = b.parent) if (b.isBone) { yAbs += b.position.y; zAbs += b.position.z; }
      m.position.set(0, top - yAbs + h * 0.35, z - zAbs); bone.add(m);
    }
  }

  const rig = { root: B.root, spine: B.spine, chest: B.chest, neck: [B.neck1, B.neck2], head: B.head, tail: [B.tail1, B.tail2, B.tail3], ears,
    legs: LD.map((g, i) => ({ hip: B["hip" + LN[i]], knee: B["knee" + LN[i]], hock: B["hock" + LN[i]], hoof: B["hoof" + LN[i]], a: g.a, b: g.b, c: g.c, hh: g.hh, bend: g.bend, front: g.front, zN: g.z })) };
  const dims = { H, legLen: (shY + hpY) / 2, drop: H * 0.06, s };
  return { group, rig, dims, mats, skeleton: skel, meshes, eyes, params: P };
}
const lerp = (a, b, t) => a + (b - a) * t;
})();
