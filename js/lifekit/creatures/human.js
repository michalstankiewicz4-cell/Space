/* LifeKit — the human (js/lifekit/creatures/human.js). Loaded after
   lifekit.js and move/walk.js. docs/life.md.

   Lore: there are no living humans in the game's world — this model is
   for the Wiki, holograms, statues, remains, and a base for androids and
   biomechanical forms (IDEAS.md, "Life forms").

   Built to real proportions (about 7.5 heads tall): a skeleton of 19
   bones; the torso, the neck, the arms and the legs swept and skinned
   (they bend at the joints); the head (sculpted from a sphere: jaw, brow,
   eye sockets, nose, lips, chin), the eyes, the ears, the hands (a palm,
   four fingers, a thumb) and the feet rigid on their bones. Clothed by
   default (a flight suit, boots, a belt); "Mannequin" shows the bare
   shape — smooth, no anatomy beyond it. */
(function () {
"use strict";
const LK = window.LifeKit, U = LK.util;
const D = Math.PI / 180;
const TONES = [["Very light", "#f1cfb1"], ["Light", "#e3b38d"], ["Medium", "#c58c63"], ["Olive", "#a8784e"], ["Brown", "#835537"], ["Dark", "#563524"]];
const HAIRS = [["Black", "#17110d"], ["Dark brown", "#3a2416"], ["Brown", "#6a4226"], ["Auburn", "#843d1f"], ["Blond", "#c7a066"], ["Grey", "#a09a93"]];
const EYES = [["Brown", "#5b3a1d"], ["Hazel", "#7b6234"], ["Green", "#4c7748"], ["Blue", "#4a74a6"], ["Grey", "#7a858e"]];
const SUITS = [["Station blue", "#34465f"], ["Graphite", "#3a3d42"], ["Rust", "#7a4a32"], ["Sand", "#a89272"], ["Survey white", "#d9dbd6"]];
const pct = (v) => Math.round(v * 100) + "%";

const PARAMS = () => [
    { key: "height", name: "Height", min: 1.5, max: 2.05, step: 0.01, value: 1.75, fmt: (v) => v.toFixed(2) + " m" },
    { key: "build", name: "Build (slim → heavy)", min: 0, max: 1, step: 0.01, value: 0.4, fmt: pct },
    { key: "frame", name: "Frame (hips → shoulders)", min: 0, max: 1, step: 0.01, value: 0.6, fmt: pct },
    { key: "tone", name: "Skin", choices: TONES.map((x) => x[0]), value: 2 },
    { key: "hair", name: "Hair", choices: ["Short", "Buzz cut", "Ponytail", "None"], value: 0 },
    { key: "hairColor", name: "Hair colour", choices: HAIRS.map((x) => x[0]), value: 1 },
    { key: "eyes", name: "Eyes", choices: EYES.map((x) => x[0]), value: 0 },
    { key: "outfit", name: "Outfit", choices: ["Flight suit", "Mannequin"], value: 0 },
    { key: "suit", name: "Suit colour", choices: SUITS.map((x) => x[0]), value: 0 },
    { key: "style", name: "Style", choices: ["Smooth", "Low-poly"], value: 0 },
    { key: "seed", name: "Face", seed: true, value: 1 },
];
LK.register({
  id: "human", name: "Human", group: "Animals", media: ["land"], moves: ["walk"],
  blurb: "The makers. Gone from this world — kept in records, holograms, statues. Real proportions; walks, runs, stands.",
  params: PARAMS(),
  build: (P, o) => build(P, o, null),
});
// the second human: the same body, the head and the neck shaped after a
// low-poly bust (js/lifekit/data/bust-head.js, CC BY 4.0 — credited)
LK.register({
  id: "humanBust", name: "Human II", group: "Animals", media: ["land"], moves: ["walk"],
  blurb: "The same body; the head and the neck shaped after a low-poly bust. " + ((LK.data && LK.data.bustHead && LK.data.bustHead.credit) || ""),
  params: PARAMS().map((q) => (q.key === "style" ? Object.assign(q, { value: 1 }) : q))
    .concat([{ key: "headMode", name: "Head", choices: ["The bust's own (1:1)", "Fitted to our grid"], value: 0 }]),
  build: (P, o) => build(P, o, "bust"),
});

function build(P, opts, variant) {
  const det = opts.detail || 1;
  const H = P.height, s = H / 1.75, sh = Math.pow(s, 0.45);          // tall people: relatively smaller heads
  const bw = 0.86 + 0.42 * P.build, belly = Math.max(0, P.build - 0.45) * 0.07;
  const shW = 0.9 + 0.2 * P.frame, hipW = 1.1 - 0.2 * P.frame, chestF = 1.04 - 0.08 * P.frame;
  const r = U.rng(P.seed * 7 + 3);
  const F = { w: 0.94 + r() * 0.12 + (P.frame - 0.5) * 0.06, jaw: 0.7 + r() * 0.6 + (P.frame - 0.5) * 0.4, nose: 0.8 + r() * 0.45, noseW: 0.85 + r() * 0.35,
    chin: 0.6 + r() * 0.8, cheek: 0.6 + r() * 0.8, brow: 0.7 + r() * 0.6 + (P.frame - 0.5) * 0.5, lips: 0.8 + r() * 0.5,
    eyeW: 0.92 + r() * 0.16, mouthW: 0.9 + r() * 0.2 };
  const suit = P.outfit === 0;
  const tone = TONES[P.tone][1], hairHex = HAIRS[P.hairColor][1], irisHex = EYES[P.eyes][1], suitHex = SUITS[P.suit][1];
  // the low-poly style: faceted materials, few sides on the limbs, a decimated head
  const lp = P.style === 1;
  const mats = U.materials({ flat: lp });
  const seg = lp ? 7 : Math.max(10, Math.round(22 * det)), steps = lp ? 1 : Math.max(2, Math.round(3 * det));

  // ---------- the skeleton (rest: standing, arms a little out — an A-pose) ----------
  const armA = (9 + 6 * P.build) * D;            // the arms' angle from the body at rest
  const shX = 0.165 * shW * s, shY = 0.79 * H;
  const hipX = 0.086 * hipW * s * Math.sqrt(bw), hipY = 0.53 * H, kneeY = 0.285 * H, ankleY = 0.046 * H;
  const Lu = 0.186 * H, Lf = 0.146 * H, Lh = 0.108 * H;
  const spec = [
    { name: "pelvis", at: [0, 0.55 * H, 0] },
    { name: "spine", parent: "pelvis", at: [0, 0.62 * H, -0.005 * s] },
    { name: "chest", parent: "spine", at: [0, 0.71 * H, -0.01 * s] },
    { name: "neck", parent: "chest", at: [0, 0.832 * H, -0.012 * s] },
    { name: "head", parent: "neck", at: [0, 0.872 * H, 0.0] },
  ];
  const arm = [], leg = [];
  [1, -1].forEach((sg, i) => {
    const L = i === 0 ? "L" : "R", dir = [sg * Math.sin(armA), -Math.cos(armA), 0];
    const J = [sg * shX, shY, -0.01 * s], E = J.map((v, k) => v + dir[k] * Lu), W = E.map((v, k) => v + dir[k] * Lf);
    spec.push({ name: "clavicle" + L, parent: "chest", at: [sg * 0.03 * s, shY, -0.005 * s] },
      { name: "upperArm" + L, parent: "clavicle" + L, at: J }, { name: "forearm" + L, parent: "upperArm" + L, at: E }, { name: "hand" + L, parent: "forearm" + L, at: W },
      { name: "thigh" + L, parent: "pelvis", at: [sg * hipX, hipY, 0] }, { name: "shin" + L, parent: "thigh" + L, at: [sg * hipX * 0.92, kneeY, 0.008 * s] },
      { name: "foot" + L, parent: "shin" + L, at: [sg * hipX * 0.86, ankleY, -0.012 * s] });
    arm.push({ sg, L, dir, J, E, W }); leg.push({ sg, L });
  });
  const skel = U.skeleton(spec), B = skel.byName;
  const group = new THREE.Group(); group.name = "human";
  group.add(skel.root);
  const parts = [];                          // skinned { geo, mat }
  const body = (hex) => (suit ? mats.cloth(hex || suitHex, true) : mats.skin(tone, true));
  const sk = (secs, o) => U.sweep(secs, Object.assign({ seg, steps, bones: skel.index }, o));
  const at = (y, rx, f, b, w, z, n) => ({ p: [0, y * H, (z || 0) * s], rx: rx * s, f: f * s, b: b * s, w, n: n || 2.3 });

  // ---------- the torso ----------
  const torso = [
    at(0.502, 0.035, 0.03, 0.05, { pelvis: 1 }, -0.012),
    at(0.522, 0.14 * hipW * bw, 0.06 * bw, 0.108 * bw, { pelvis: 1 }, -0.01),
    at(0.545, 0.158 * hipW * bw, 0.074 * bw, 0.112 * bw, { pelvis: 1 }, -0.008),
    at(0.585, 0.148 * (0.6 * hipW + 0.4) * bw, 0.088 * bw + belly, 0.092 * bw, { pelvis: 0.6, spine: 0.4 }, -0.004),
    at(0.625, 0.13 * (0.92 + 0.1 * P.frame) * bw, 0.086 * bw + belly * 1.2, 0.08 * bw, { spine: 1 }),
    at(0.675, 0.14 * bw, 0.093 * bw + belly * 0.7, 0.084 * bw, { spine: 0.5, chest: 0.5 }, 0.002),
    at(0.725, 0.152 * shW * bw, 0.104 * chestF * bw, 0.09 * bw, { chest: 1 }, 0.006),
    at(0.77, 0.163 * shW * Math.sqrt(bw), 0.096 * chestF * bw, 0.088 * bw, { chest: 1 }, 0.004),
    at(0.8, 0.17 * shW, 0.074, 0.08, { chest: 1 }, -0.004, 2.7),
    at(0.818, 0.13 * shW, 0.056, 0.07, { chest: 0.85, neck: 0.15 }, -0.008, 2.4),
    at(0.842, 0.072, 0.052, 0.06, { chest: 0.5, neck: 0.5 }, -0.01),
  ];
  parts.push({ geo: sk(torso, { capStart: 1, capLen: 0.6 }), mat: body() });
  // the neck, into the head
  const bust = variant === "bust" ? bustFit(P.style === 1) : null;
  const neck = bust ? bustNeck(bust, H, sh, bw) : [
    at(0.822, 0.064 * Math.sqrt(bw), 0.054, 0.06, { chest: 0.6, neck: 0.4 }, -0.01),
    at(0.85, 0.062 * Math.sqrt(bw), 0.052, 0.058, { neck: 1 }, -0.006),
    at(0.878, 0.06, 0.05, 0.056, { neck: 0.4, head: 0.6 }, 0.0),
    at(0.9, 0.05, 0.042, 0.05, { head: 1 }, 0.006),
  ];
  parts.push({ geo: sk(neck, {}), mat: mats.skin(tone, true) });
  if (suit) {
    // the belt and the collar: rings matched to the torso, on the same bones
    const ring = (y0, y1, base, k, w, hex, rough) => parts.push({ geo: sk([at(y0, base.rx / s * k, base.f / s * k, base.b / s * k, w, base.p[2] / s), at(y1, base.rx / s * k, base.f / s * k, base.b / s * k, w, base.p[2] / s)], { steps: 1 }), mat: rough ? mats.cloth(hex, true, rough) : mats.rubber(hex, true) });
    ring(0.574, 0.596, torso[3], 1.1, { pelvis: 0.6, spine: 0.4 }, "#2a2622");
    ring(0.828, 0.845, neck[0], 1.2, { chest: 0.5, neck: 0.5 }, suitHex, 0.7);
  }

  // ---------- the arms ----------
  arm.forEach(({ sg, L, dir, J }) => {
    const pt = (d, rx, f, b, w) => ({ p: J.map((v, k) => v + dir[k] * d), rx: rx * s * Math.pow(bw, 0.85), f: f * s * Math.pow(bw, 0.85), b: b * s * Math.pow(bw, 0.85), w, n: 2.1 });
    const ua = "upperArm" + L, fa = "forearm" + L, hd = "hand" + L;
    const lu = Lu / s, lf = Lf / s;
    const secs = [
      pt(-0.025 * s, 0.044, 0.047, 0.05, { [ua]: 1 }),
      pt(0.025 * s, 0.05, 0.053, 0.053, { [ua]: 1 }),
      pt(0.09 * s, 0.046, 0.049, 0.047, { [ua]: 1 }),
      pt(0.17 * s, 0.042, 0.048, 0.042, { [ua]: 1 }),
      pt((lu - 0.035) * s, 0.037, 0.037, 0.039, { [ua]: 0.9, [fa]: 0.1 }),
      pt(lu * s, 0.035, 0.034, 0.037, { [ua]: 0.5, [fa]: 0.5 }),
      pt((lu + 0.04) * s, 0.04, 0.04, 0.038, { [fa]: 1 }),
      pt((lu + 0.09) * s, 0.038, 0.036, 0.034, { [fa]: 1 }),
      pt((lu + lf - 0.045) * s, 0.029, 0.023, 0.022, { [fa]: 1 }),
      pt((lu + lf) * s, 0.027, 0.02, 0.02, { [fa]: 0.5, [hd]: 0.5 }),
      pt((lu + lf + 0.018) * s, 0.026, 0.019, 0.019, { [hd]: 1 }),
    ];
    parts.push({ geo: sk(secs, { capStart: 1 }), mat: body() });
    if (suit) parts.push({ geo: sk([secs[8], secs[9]].map((q) => Object.assign({}, q, { rx: q.rx * 1.14, f: q.f * 1.22, b: q.b * 1.22 })), { steps: 1 }), mat: mats.cloth(suitHex, true, 0.7) });
    hand(B[hd], sg, s, armA, mats.skin(tone, false), seg);
  });

  // ---------- the legs ----------
  leg.forEach(({ sg, L }) => {
    const th = "thigh" + L, sn = "shin" + L, ft = "foot" + L;
    const xAt = (y) => sg * U.lerp(hipX * 0.86, hipX, Math.min(1, Math.max(0, (y * H - ankleY) / (hipY - ankleY))));
    const lg = (y, rx, f, b, w, z) => ({ p: [xAt(y), y * H, (z || 0) * s], rx: rx * s * bw, f: f * s * bw, b: b * s * bw, w, n: 2.15 });
    const secs = [
      lg(0.575, 0.085, 0.088, 0.098, { [th]: 1 }, -0.01),
      lg(0.515, 0.09, 0.09, 0.098, { [th]: 1 }, -0.004),
      lg(0.46, 0.076, 0.08, 0.079, { [th]: 1 }),
      lg(0.4, 0.065, 0.068, 0.064, { [th]: 1 }),
      lg(0.335, 0.054, 0.056, 0.051, { [th]: 0.95, [sn]: 0.05 }, 0.004),
      lg(0.292, 0.05, 0.053, 0.047, { [th]: 0.5, [sn]: 0.5 }, 0.008),
      lg(0.255, 0.048, 0.046, 0.052, { [sn]: 1 }, 0.006),
      lg(0.205, 0.051, 0.04, 0.064, { [sn]: 1 }, 0.004),
      lg(0.155, 0.045, 0.035, 0.054, { [sn]: 1 }),
      lg(0.105, 0.034, 0.03, 0.034, { [sn]: 1 }, -0.004),
      lg(0.07, 0.028, 0.028, 0.03, { [sn]: 0.5, [ft]: 0.5 }, -0.008),
      lg(0.045, 0.028, 0.03, 0.03, { [ft]: 1 }, -0.01),
    ];
    parts.push({ geo: sk(secs, { capStart: 1 }), mat: body() });
    foot(B[ft], B[sn], sg, s, ankleY, suit, mats, tone, seg, L);
  });

  const { meshes } = U.skinned(group, skel, parts);

  // ---------- the head ----------
  const face = head(B.head, H, s, sh, F, P, mats, tone, hairHex, irisHex, det, bust);

  const rig = { pelvis: B.pelvis, spine: B.spine, chest: B.chest, neck: B.neck, head: B.head,
    upperArm: [B.upperArmL, B.upperArmR], forearm: [B.forearmL, B.forearmR], hand: [B.handL, B.handR],
    thigh: [B.thighL, B.thighR], shin: [B.shinL, B.shinR], foot: [B.footL, B.footR] };
  const dims = { s, H, thigh: hipY - kneeY, shin: kneeY - ankleY, ankle: ankleY, heel: 0.05 * s, ball: 0.13 * s,
    pelvisY: 0.55 * H, hipY, armA: Math.PI / 2 - armA };
  return { group, rig, dims, mats, skeleton: skel, meshes, face };
}

// ---------- the hand: a palm, four fingers, a thumb — rigid on the hand bone ----------
// Built pointing down (−Y), the palm facing the body, then turned to the arm's angle.
function hand(bone, sg, s, armA, mat, seg) {
  const sw = (secs, o) => U.sweep(secs, Object.assign({ seg: seg < 10 ? 5 : Math.max(8, Math.round(seg * 0.55)), steps: seg < 10 ? 1 : 2, rigid: true, front: [0, 0, 1] }, o));
  const geos = [];
  const pc = (y, th, w, z) => ({ p: [-sg * 0.002 * s, y * s, (z || 0) * s], rx: th * s, f: w * s, b: w * s, n: 2.6 });
  geos.push(sw([pc(0.01, 0.017, 0.028, 0), pc(-0.025, 0.019, 0.04, 0.002), pc(-0.065, 0.018, 0.045, 0.002), pc(-0.09, 0.015, 0.043, 0.002)], { capEnd: 1, capLen: 0.4 }));
  // fingers: from the knuckles, curling a little toward the palm (−sg X)
  [[0.03, 0.086, 0.0092], [0.01, 0.096, 0.0095], [-0.011, 0.089, 0.009], [-0.03, 0.071, 0.008]].forEach(([z, len, rad], k) => {
    const pts = []; let p = [0, -0.085 * s, z * s], ang = 0;
    const segs = [0.45, 0.3, 0.25], bend = [8, 16, 12].map((b) => (b + k * 2) * Math.PI / 180);
    pts.push(p.slice());
    segs.forEach((f, i) => { ang += bend[i]; p = [p[0] - sg * Math.sin(ang) * len * f * s, p[1] - Math.cos(ang) * len * f * s, p[2]]; pts.push(p.slice()); });
    const secs = pts.map((q, i) => ({ p: q, rx: rad * s * (1 - i * 0.07), f: rad * s * (1 - i * 0.07), b: rad * s * (1 - i * 0.07) }));
    geos.push(sw(secs, { capEnd: 1, front: [-sg, 0, 0] }));
  });
  // the thumb: from the palm's front edge, down, forward and in
  const t0 = [-sg * 0.01 * s, -0.022 * s, 0.03 * s], dir = new THREE.Vector3(-sg * 0.35, -0.75, 0.55).normalize();
  const tp = [0, 0.4, 0.75, 1].map((f) => [t0[0] + dir.x * f * 0.066 * s, t0[1] + dir.y * f * 0.066 * s, t0[2] + dir.z * f * 0.066 * s]);
  geos.push(sw(tp.map((q, i) => ({ p: q, rx: (0.0125 - i * 0.0012) * s, f: (0.0115 - i * 0.001) * s, b: (0.0115 - i * 0.001) * s })), { capEnd: 1, front: [-sg, 0, 0] }));
  const g = new THREE.Group(); g.rotation.z = sg * armA; bone.add(g);
  U.rigid(g, geos.map((geo) => ({ geo, mat })));
}

// ---------- the foot (or a boot): heel to toes along +Z, rigid on the foot bone ----------
function foot(bone, shinBone, sg, s, ankleY, suit, mats, tone, seg, L) {
  const k = suit ? 1.09 : 1, mat = suit ? mats.rubber("#24211f", false) : mats.skin(tone, false);
  const fp = (z, y, rx, up, dn) => ({ p: [sg * 0.004 * s, y * s, z * s], rx: rx * s * k, f: up * s * k, b: dn * s * (suit ? 1 : 1), n: 2.4 });
  const secs = [fp(-0.05, -0.035, 0.029, 0.035, 0.045), fp(-0.015, -0.03, 0.032, 0.046, 0.05), fp(0.035, -0.046, 0.039, 0.034, 0.035),
    fp(0.09, -0.06, 0.045, 0.022, 0.022), fp(0.13, -0.066, 0.043, 0.016, 0.017), fp(0.162, -0.068, 0.035, 0.013, 0.013)];
  const geo = U.sweep(secs, { seg: Math.max(10, Math.round(seg * 0.7)), steps: 2, rigid: true, front: [0, 1, 0], capStart: 1, capEnd: 1, capLen: 0.8 });
  U.rigid(bone, [{ geo, mat }]);
  if (suit) {
    // the boot's shaft around the ankle, on the shin
    const ax = bone.position.x, ay = bone.position.y, az = bone.position.z;
    const sh = (dy, rx, f, b) => ({ p: [ax, ay + dy * s, az], rx: rx * s, f: f * s, b: b * s, n: 2.2 });
    const shaft = U.sweep([sh(-0.03, 0.036, 0.036, 0.038), sh(0.02, 0.035, 0.034, 0.036), sh(0.075, 0.042, 0.036, 0.05)], { seg: Math.max(10, Math.round(seg * 0.7)), steps: 2, rigid: true });
    U.rigid(shinBone, [{ geo: shaft, mat }]);
  }
}

// ---------- the head: LifeKit's face (parts/face.js), placed and sized ----------
function head(bone, H, s, sh, F, P, mats, tone, hairHex, irisHex, det, bust) {
  const hg = new THREE.Group();
  // the head's centre: its top at the creature's height
  const top = H - 0.116 * sh;
  hg.position.set(0, 0, 0.012 * sh);
  let yAbs = 0; for (let b = bone; b; b = b.parent) if (b.isBone) yAbs += b.position.y;
  hg.position.y = top - yAbs;
  hg.scale.setScalar(sh);
  hg.rotation.x = bust ? 0 : 0.13;           // our sculpt: the face a little down (the bust stands upright already)
  bone.add(hg);
  const face = LK.face.build(Object.assign({ F, tone, hair: P.hair, hairHex, irisHex, mats, detail: det, lowpoly: P.style === 1 ? 760 : 0 },
    bust ? { baseFn: bust.shape, features: 0, layout: bust.layout, earX: bust.earX, F: Object.assign({}, F, { lips: P.headMode === 0 ? 0 : 0.45 }),
      // 1:1: the bust's own triangles (finer on their planes), its ears, no lip bulge of ours
      mesh: P.headMode === 0 ? { V: bust.V, T: bustHeadTris(bust), s: 11 } : null, ears: P.headMode === 0 ? false : true } : {}));
  hg.add(face.group);
  return face;
}

// ---------- the bust: its surface as our head's shape ----------
// The bust (LifeKit.data.bustHead) in its own units → metres, its crown at
// our head's crown, its face and back centred like ours. For every
// direction from the head's centre: the nearest crossing of its surface (a
// ray against its triangles) — a field of radii our grid samples. Below the
// jaw the head's underside is cut flat (the neck takes over there). Smooth
// style: the field is averaged a little (no facets); low-poly: kept flat.
const BUST = { top: 0.625, chin: -0.43, k: 0.218 / (0.625 + 0.43), cz: -0.0075, under: -0.11 };
BUST.cy = BUST.top - 0.113 / BUST.k;
const bustLocal = ([x, y, z]) => [x * BUST.k, (y - BUST.cy) * BUST.k, (z - BUST.cz) * BUST.k];
function bustTris() {
  const D = LK.data.bustHead, V = D.v.map(bustLocal), T = D.t;
  return { V, T };
}
function rayHit(V, T, dx, dy, dz) {
  let best = Infinity;
  for (let i = 0; i < T.length; i += 3) {
    const a = V[T[i]], b = V[T[i + 1]], c = V[T[i + 2]];
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, tx = -a[0], ty = -a[1], tz = -a[2], u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-5 && t < best) best = t;
  }
  return best;
}
const bustCache = {};
function bustFit(lowpoly) {
  const key = lowpoly ? "lp" : "smooth";
  if (bustCache[key]) return bustCache[key];
  const { V, T } = bustTris(), NA = 128, NB = 72, R = new Float32Array((NA + 1) * (NB + 1));
  for (let ib = 0; ib <= NB; ib++) {
    const lat = -Math.PI / 2 + Math.PI * ib / NB;
    for (let ia = 0; ia <= NA; ia++) {
      const lon = -Math.PI + 2 * Math.PI * ia / NA;
      const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
      let t = rayHit(V, T, dx, dy, dz);
      if (!isFinite(t)) t = 0.1;
      if (dy < 0 && dy * t < BUST.under) t = BUST.under / dy;          // the flat underside, inside the neck
      R[ib * (NA + 1) + ia] = t;
    }
  }
  if (!lowpoly) {
    // a gentle average: the facets melt, the features stay
    for (let pass = 0; pass < 3; pass++) {
      const S = R.slice();
      for (let ib = 1; ib < NB; ib++) for (let ia = 0; ia <= NA; ia++) {
        const l = (ia + NA - 1) % NA, r = (ia + 1) % NA, i = ib * (NA + 1);
        R[i + ia] = (S[i + ia] * 4 + S[i + l] + S[i + r] + S[i - NA - 1 + ia] + S[i + NA + 1 + ia]) / 8;
      }
    }
  }
  const shape = (d) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, d.y))), lon = Math.atan2(d.x, d.z);
    const fb = (lat + Math.PI / 2) / Math.PI * NB, fa = (lon + Math.PI) / (2 * Math.PI) * NA;
    const ib = Math.min(NB - 1, Math.floor(fb)), ia = Math.min(NA - 1, Math.floor(fa)), tb = fb - ib, ta = fa - ia;
    const g = (b, a) => R[b * (NA + 1) + a];
    const r = (g(ib, ia) * (1 - ta) + g(ib, ia + 1) * ta) * (1 - tb) + (g(ib + 1, ia) * (1 - ta) + g(ib + 1, ia + 1) * ta) * tb;
    return { x: d.x * r, y: d.y * r, z: d.z * r };
  };
  // where its eyes and mouth are (measured on the bust), and its ears' side
  const loc = (y) => (y - BUST.cy) * BUST.k;
  const layout = { ex: 0.17 * BUST.k, ey: loc(0.09), my: loc(-0.286), mw: 0.025, gap: 0.0005, teethBack: 0.011 };
  const side = shape(new THREE.Vector3(1, 0, -0.1).normalize());
  return (bustCache[key] = { shape, layout, earX: side.x - 0.004, V, T });
}
// the bust's own triangles above where its neck widens into the shoulders
// (below that our neck carries on, and the bust's base is left out)
function bustHeadTris(bust) {
  const cut = (-0.52 - BUST.cy) * BUST.k, V = bust.V, T = bust.T, out = [];
  for (let i = 0; i < T.length; i += 3) if ((V[T[i]][1] + V[T[i + 1]][1] + V[T[i + 2]][1]) / 3 >= cut) out.push(T[i], T[i + 1], T[i + 2]);
  return out;
}
// the bust's neck: slices of its surface at a few heights → our neck's
// sections (skinned, so it still bends), placed where the head puts them
function bustNeck(bust, H, sh, bw) {
  const top = H - 0.116 * sh, out = [];
  const slice = (Y) => {
    let xmax = 0, zmin = Infinity, zmax = -Infinity;
    const { V, T } = bust;
    for (let i = 0; i < T.length; i += 3) {
      const p = [V[T[i]], V[T[i + 1]], V[T[i + 2]]];
      for (let k = 0; k < 3; k++) {
        const a = p[k], b = p[(k + 1) % 3];
        if ((a[1] - Y) * (b[1] - Y) > 0 || a[1] === b[1]) continue;
        const t = (Y - a[1]) / (b[1] - a[1]), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        xmax = Math.max(xmax, Math.abs(x)); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
      }
    }
    return { xmax, zmin, zmax };
  };
  // the join with the torso, then the bust's neck up into the head
  out.push({ p: [0, 0.822 * H, -0.01], rx: 0.064 * Math.sqrt(bw), f: 0.054, b: 0.06, w: { chest: 0.6, neck: 0.4 }, n: 2.3 });
  // (the bust's neck runs from under the chin, y −0.45, to where it widens
  // into the shoulders, −0.55: only that stretch is a neck)
  [-0.535, -0.5, -0.465].forEach((yb, i, all) => {
    const sl = slice(BUST.k * (yb - BUST.cy)), zc = (sl.zmin + sl.zmax) / 2;
    const y = top + sh * ((yb - BUST.cy) * BUST.k), z = 0.012 * sh + sh * zc;
    const f = i / (all.length - 1);
    out.push({ p: [0, y, z], rx: sh * sl.xmax * (1 + 0.04 * (bw - 1)), f: sh * (sl.zmax - zc), b: sh * (zc - sl.zmin), n: 2.2,
      w: f < 0.34 ? { neck: 0.8, chest: 0.2 } : f < 0.67 ? { neck: 0.7, head: 0.3 } : { neck: 0.3, head: 0.7 } });
  });
  // and on up inside the head, a little narrower: no open rim under the chin
  const lastS = out[out.length - 1];
  out.push({ p: [0, lastS.p[1] + 0.045 * sh, lastS.p[2] + 0.004 * sh], rx: lastS.rx * 0.8, f: lastS.f * 0.75, b: lastS.b * 0.8, n: 2.2, w: { head: 1 } });
  // keep the sections in order of height (the torso join below the first slice)
  out.sort((a, b) => a.p[1] - b.p[1]);
  return out;
}
})();
