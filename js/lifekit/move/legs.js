/* LifeKit — any number of legs (js/lifekit/move/legs.js): the creature
   editor's walker (designs from design.js). Loaded after lifekit.js.

   Legs come in mirrored pairs, front to back. The steps run as a wave from
   the back pair to the front one on each side, the two sides half a cycle
   apart: one pair is a biped's walk, two a walk (or a trot when running),
   three an insect's tripod-like ripple, more a millipede's wave. Each foot
   is planted while on the ground (it moves back at the body's speed, never
   sliding) and arcs forward in the air; the legs reach their feet by
   2-bone IK (the knee forward or back, as designed), the foot kept level.
   The spine sways in a travelling wave — gently with legs, strongly
   without them (a glider moves by it alone). Layers: look (the head
   around), low (the body crouched). */
(function () {
"use strict";
const LK = window.LifeKit, TAU = Math.PI * 2;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const GAITS = { idle: { speed: 0 }, walk: { speed: 1.0, duty: 0.62, lift: 0.14 }, run: { speed: 2.6, duty: 0.42, lift: 0.2 } };
const LAYERS = ["look", "low"];

function ik(a, b, tz, ty, bend) {
  let d = Math.hypot(tz, ty);
  d = Math.min(d, (a + b) * 0.9995); d = Math.max(d, Math.abs(a - b) + 1e-4);
  const al = Math.atan2(tz, -ty), be = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const p1 = al + bend * be, kz = a * Math.sin(p1), ky = -a * Math.cos(p1);
  return [p1, Math.atan2(tz - kz, -(ty - ky))];
}
const _v = new THREE.Vector3();
// the pose the editor shows: everything at rest (the legs straight, as built)
function rest(c) { c.skeleton.bones.forEach((b) => { b.rotation.set(0, 0, 0); b.position.copy(b.userData.rest); }); }

function animate(c, t, dt, st) {
  const r = c.rig, D = c.dims, gait = st.gait === "run" ? "run" : st.gait === "walk" ? "walk" : "idle";
  const S = c.ls || (c.ls = { phase: 0, m: 0, spd: 0, duty: GAITS.walk.duty, lift: GAITS.walk.lift });
  const moving = gait !== "idle", G = GAITS[moving ? gait : "walk"], k = Math.min(1, dt * 2.5);
  S.m += ((moving ? 1 : 0) - S.m) * Math.min(1, dt * 3);
  S.duty = lerp(S.duty, G.duty, k); S.lift = lerp(S.lift, G.lift, k);
  const want = moving ? (st.speed != null ? st.speed : G.speed) : 0;
  S.spd += Math.max(-3 * dt, Math.min(3 * dt, want - S.spd));
  const spd = Math.max(0.2, S.spd), LL = D.legLen, stride = LL * Math.min(1.4, 0.5 + 0.25 * spd);
  const T = Math.max(0.3, stride / (spd * (D.pairs ? S.duty : 1)));
  S.phase = (S.phase + dt / T) % 1;
  const p = S.phase, Ly = st.layers || {}, low = Ly.low || 0, look = Ly.look || 0;
  const L = stride * S.m;

  // ---------- the body: a travelling sway along the spine ----------
  const sway = (D.pairs ? 0.06 : 0.32) * (D.pairs ? S.m : 0.25 + 0.75 * S.m);
  r.root.position.copy(r.root.userData.rest);
  r.root.position.y -= LL * 0.12 * low + LL * 0.012 * S.m * (0.5 + 0.5 * Math.cos(2 * TAU * p));
  r.root.rotation.set(0, 0, 0);
  r.center.rotation.set(0, sway * Math.sin(TAU * p), 0);
  r.fronts.forEach((b, i) => {
    const last = i === r.fronts.length - 1;
    b.rotation.set(last ? 0.03 * Math.sin(t * 0.3) : 0, sway * Math.sin(TAU * p - (i + 1) * 0.8) * (last ? -0.6 : 1) + (last ? look * 0.7 * Math.sin(t * 0.5) + (1 - S.m) * 0.15 * Math.sin(t * 0.21) : 0), 0);
  });
  r.backs.forEach((b, i) => b.rotation.set(0, sway * 1.3 * Math.sin(TAU * p + (i + 1) * 0.8) + 0.05 * Math.sin(t * 1.1 + i), 0));

  // ---------- the legs ----------
  c.group.updateMatrixWorld(true);
  const pairs = Math.max(1, D.pairs);
  r.legs.forEach((g) => {
    g.hip.getWorldPosition(_v); c.group.worldToLocal(_v);
    // the wave: back pairs first; the sides half a cycle apart
    const ord = D.order[g.pair], off = (pairs > 1 ? (pairs - 1 - ord) / pairs : 0) * (pairs === 2 && gait === "run" ? 1 : 0.5) + (g.sg > 0 ? 0 : 0.5);
    const q = ((p + off) % 1 + 1) % 1, Dt = S.duty;
    let fz, fy;
    if (q < Dt) { fz = g.zN + L * (0.5 - q / Dt); fy = 0; }
    else { const s = (q - Dt) / (1 - Dt); fz = g.zN + L * (-0.5 + smooth(s)); fy = S.lift * LL * Math.sin(Math.PI * s) * S.m; }
    const [p1, p2] = ik(g.a, g.b, fz - _v.z, fy + g.hh - _v.y, g.bend);
    let P = 0; for (let b = g.hip.parent; b && b.isBone; b = b.parent) P += b.rotation.x;
    g.hip.rotation.set(-p1 - P, 0, 0);
    g.knee.rotation.set(-(p2 - p1), 0, 0);
    g.foot.rotation.set(p2, 0, 0);                                     // level: undo the leg's pitch
  });
  return { period: T };
}

LK.registerMove("legs", { medium: "land", GAITS, LAYERS, animate, rest });
})();
