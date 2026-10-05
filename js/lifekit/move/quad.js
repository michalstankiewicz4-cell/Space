/* LifeKit — four legs on land (js/lifekit/move/quad.js): a quadruped's
   gaits. Loaded after lifekit.js. docs/life.md, "Four legs".

   A creature using it gives a rig:
     { root, spine, chest, neck: [..], head, tail: [..], ears: [..],
       legs: [{ hip, knee, hock, hoof, a, b, c, hh, bend, front }] }
   (hip → knee: a, knee → hock / carpus: b, → fetlock: c, the hoof's
   height: hh; bend +1: the knee points forward (a hind stifle), −1: back
   (a front elbow)) and dims: { H, legLen, drop }.

   Every foot has its own phase in the cycle — the walk is a lateral
   sequence (left hind, left fore, right hind, right fore, a quarter
   apart), the trot diagonal pairs; the offsets and the duty factor (the
   share of the cycle a foot is on the ground) glide from one to the
   other, so the gait changes without a jump. A foot on the ground moves
   back at the body's speed (so it never slides); in the air it arcs
   forward. The legs reach their feet by inverse kinematics: the hoof and
   the cannon bone are set by the phase, the upper two bones solved from
   the hip to the hock (the law of cosines), the knee bending its own way.
   Layers on top: graze, alert, look. */
(function () {
"use strict";
const LK = window.LifeKit, TAU = Math.PI * 2;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
// per leg (in rig.legs' order: LF, RF, LH, RH) the phase offsets and the duty factor
const GAITS = {
  idle: { speed: 0 },
  walk: { speed: 1.4, off: [0.25, 0.75, 0, 0.5], duty: 0.68, lift: 0.1, bob: 0.008 },
  run: { speed: 3.6, off: [0.5, 1.0, 0, 0.5], duty: 0.45, lift: 0.17, bob: 0.022 },   // a trot
};
const LAYERS = ["graze", "alert", "look"];

// 2-bone IK in the leg's plane: hip (0, 0) → target (z, y); returns the two forward angles
function ik(a, b, tz, ty, bend) {
  let d = Math.hypot(tz, ty);
  d = Math.min(d, (a + b) * 0.9995); d = Math.max(d, Math.abs(a - b) + 1e-4);
  const al = Math.atan2(tz, -ty), be = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const p1 = al + bend * be;
  const kz = a * Math.sin(p1), ky = -a * Math.cos(p1);
  return [p1, Math.atan2(tz - kz, -(ty - ky))];
}

const _v = new THREE.Vector3();
function animate(c, t, dt, st) {
  const r = c.rig, D = c.dims, gait = st.gait === "run" ? "run" : st.gait === "walk" ? "walk" : "idle";
  const S = c.q || (c.q = { phase: 0, m: 0, spd: 0, off: GAITS.walk.off.slice(), duty: GAITS.walk.duty, lift: GAITS.walk.lift, bob: GAITS.walk.bob });
  // the motion's amount eases in and out; the gait's numbers glide
  const moving = gait !== "idle";
  S.m += ((moving ? 1 : 0) - S.m) * Math.min(1, dt * 3);
  const G = GAITS[moving ? gait : "walk"], k = Math.min(1, dt * 2.5);
  for (let i = 0; i < 4; i++) S.off[i] = lerp(S.off[i], G.off[i], k);
  S.duty = lerp(S.duty, G.duty, k); S.lift = lerp(S.lift, G.lift, k); S.bob = lerp(S.bob, G.bob, k);
  const want = moving ? (st.speed != null ? st.speed : G.speed) : 0;
  S.spd += Math.max(-4 * dt, Math.min(4 * dt, want - S.spd));
  const spd = Math.max(0.25, S.spd), L = D.legLen * Math.min(1.3, 0.45 + 0.18 * spd) * S.m;
  const T = Math.max(0.35, (D.legLen * Math.min(1.3, 0.45 + 0.18 * spd)) / (spd * S.duty));
  S.phase = (S.phase + dt / T) % 1;
  const p = S.phase, breathe = Math.sin(t * 1.6);

  // ---------- the body ----------
  const Ly = st.layers || {};
  const graze = Ly.graze || 0, alert = Ly.alert || 0, look = Ly.look || 0;
  r.root.position.copy(r.root.userData.rest);
  r.root.position.y -= D.drop + D.H * S.bob * S.m * (gait === "run" ? Math.abs(Math.sin(TAU * p)) : 0.5 + 0.5 * Math.cos(2 * TAU * p));
  r.root.position.y -= D.H * 0.01 * graze;
  r.root.rotation.set(0, 0, 0.012 * Math.sin(TAU * p) * S.m);
  r.spine.rotation.set(0, 0.03 * Math.sin(TAU * p) * S.m, 0);
  r.chest.rotation.set(-0.008 * breathe, -0.02 * Math.sin(TAU * p) * S.m, 0);
  // the neck: a nod with every step when walking; graze lowers it, alert raises it
  const nod = S.m * (gait === "run" ? 0.03 : 0.07) * Math.cos(2 * TAU * p + 0.6);
  const idleLook = (1 - S.m) * (Math.sin(t * 0.23) * 0.25 + Math.sin(t * 0.07) * 0.15);
  r.neck[0].rotation.set(0.75 * graze - 0.25 * alert + nod, (idleLook + look * 0.6 * Math.sin(t * 0.5)) * 0.6, 0);
  r.neck[1].rotation.set(0.55 * graze - 0.15 * alert + nod * 0.5, (idleLook + look * 0.6 * Math.sin(t * 0.5)) * 0.4, 0);
  r.head.rotation.set(-0.35 * graze * 0.6 + 0.2 * alert - nod * 0.8 + 0.04 * Math.sin(t * 0.17), 0, 0);
  r.tail.forEach((b, i) => b.rotation.set(0.05 + 0.04 * i * Math.sin(t * 0.9 + i) * (1 - 0.5 * S.m), 0.18 * Math.sin(t * 1.3 - i * 0.6) * (0.4 + 0.6 * S.m), 0));
  // the ears: a flick now and then, forward when alert
  const flick = Math.max(0, Math.sin(t * 0.7)) ** 30;
  r.ears.forEach((e, i) => { e.rotation.set(e.userData.rx - 0.5 * alert + 0.4 * flick * (i ? 1 : 0), e.userData.ry, e.userData.rz + (i ? -1 : 1) * 0.25 * alert); });

  // ---------- the legs ----------
  c.group.updateMatrixWorld(true);
  r.legs.forEach((g, i) => {
    // where the hip is now, in the creature's own space
    g.hip.getWorldPosition(_v); c.group.worldToLocal(_v);
    const q = (p + S.off[i]) % 1, Dt = S.duty;
    let fz, fy, phi3, phi4;
    const zN = g.zN;
    if (q < Dt) {
      const u = q / Dt;
      fz = zN + L * (0.5 - u); fy = 0;
      phi3 = lerp(0.12, -0.22, u) * S.m + (1 - S.m) * 0.04;
      phi4 = lerp(0.35, 0.05, u) * S.m + (1 - S.m) * 0.3;
    } else {
      const s = (q - Dt) / (1 - Dt), e = smooth(s);
      fz = zN + L * (-0.5 + e); fy = S.lift * D.legLen * Math.sin(Math.PI * s) * S.m;
      phi3 = lerp(-0.22, 0.12, e) - 0.9 * Math.sin(Math.PI * s) * S.m * (g.front ? 1 : 0.7);
      phi4 = lerp(0.05, 0.35, e) - 1.0 * Math.sin(Math.PI * s) * S.m;
    }
    // the fetlock above the ground point, the hock above the fetlock
    const Fy = fy + g.hh * Math.cos(phi4), Fz = fz - g.hh * Math.sin(phi4);
    const Hz = Fz - g.c * Math.sin(phi3), Hy = Fy + g.c * Math.cos(phi3);
    const [p1, p2] = ik(g.a, g.b, Hz - _v.z, Hy - _v.y, g.bend);
    let P = 0; for (let b = g.hip.parent; b && b.isBone; b = b.parent) P += b.rotation.x;
    g.hip.rotation.set(-p1 - P, 0, 0);
    g.knee.rotation.set(-(p2 - p1), 0, 0);
    g.hock.rotation.set(-(phi3 - p2), 0, 0);
    g.hoof.rotation.set(-(phi4 - phi3), 0, 0);
  });
  return { period: T };
}

LK.registerMove("quad", { medium: "land", GAITS, LAYERS, animate });
})();
