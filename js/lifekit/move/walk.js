/* LifeKit — moving on land (js/lifekit/move/walk.js): a biped's gaits.
   Loaded after lifekit.js. docs/life.md.

   A creature using it gives a rig: { pelvis, spine, chest, neck, head,
   upperArm[2], forearm[2], hand[2], thigh[2], shin[2], foot[2] } (bones;
   index 0 left, 1 right) and dims: { thigh, shin, ankle, heel, ball,
   pelvisY, hipY, armA, s } (metres, radians).

   Every gait gives a POSE (plain numbers, no bones), so poses can be mixed
   and layered before they touch the skeleton:
     - the base: stand, T-pose, and moving — walk and run blended by speed
       (a walk turns into a jog, then a run, as the speed rises);
     - changing the base fades over ~0.35 s instead of jumping;
     - LAYERS added on top of any base, each with a weight 0..1 (the idea of
       additive animation): sneak, sad, angry, nod, shake (the head), wave,
       look (around);
     - then the pelvis height from the legs (the lower foot touches the
       ground) and the feet level — so a crouch lowers the body by itself.
   The legs swing on a sine; the knee bends in the swing (and gives as the
   heel lands); the foot stays level in the stance, rolls off the toes,
   lifts them in the swing. The cycle's length comes from how far the
   stance foot travels, so the feet don't slide at the chosen speed. */
(function () {
"use strict";
const LK = window.LifeKit;
const D = Math.PI / 180, TAU = Math.PI * 2;
const GAITS = {
  idle: { speed: 0 },
  walk: { speed: 1.4, hip: 24 * D, knee: 58 * D, load: 10 * D, arm: 16 * D, elbow: [12 * D, 14 * D], lean: 2 * D, yaw: 4 * D, drop: 2.5 * D, toeOff: 22 * D, heel: 10 * D, flight: 0 },
  run: { speed: 3.6, hip: 38 * D, knee: 105 * D, load: 22 * D, arm: 34 * D, elbow: [80 * D, 20 * D], lean: 9 * D, yaw: 7 * D, drop: 4 * D, toeOff: 30 * D, heel: 6 * D, flight: 0.045 },
  tpose: { speed: 0 },
};
const LAYERS = ["sneak", "sad", "angry", "nod", "shake", "wave", "look"];
const FADE = 0.35;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// a bump on the cycle (wraps around): 1 at c, falling off over w
function bump(q, c, w) { let d = q - c; d -= Math.round(d); return Math.exp(-(d * d) / (w * w)); }
// walk and run mixed: the gait's numbers at a speed
function locoParams(speed) {
  const k = smooth((speed - 2.0) / 1.4), W = GAITS.walk, R = GAITS.run, out = {};
  for (const key in W) out[key] = Array.isArray(W[key]) ? W[key].map((v, i) => v + (R[key][i] - v) * k) : W[key] + (R[key] - W[key]) * k;
  out.speed = W.speed + (R.speed - W.speed) * k;
  return out;
}

// one leg at its own phase q: hip (forward +), knee flex, foot pitch (toes up +)
function legAngles(g, q, ampK) {
  const hip = g.hip * ampK * Math.sin(TAU * q);
  const w = q < 0.3 ? q + 1 : q;                       // the swing: q from 0.7 to 1.28
  let knee = w > 0.7 && w < 1.28 ? g.knee * Math.sin(Math.PI * (w - 0.7) / 0.58) : 0;
  knee += g.load * (q > 0.25 && q < 0.55 ? Math.sin(Math.PI * (q - 0.25) / 0.3) : 0);
  knee = Math.max(0, knee) * Math.min(1.2, ampK);
  const pitch = g.heel * bump(q, 0.25, 0.06) - g.toeOff * bump(q, 0.7, 0.07) + 0.5 * g.heel * bump(q, 0.98, 0.12);
  return { hip, knee, pitch };
}
// how far below the hip the sole reaches, and how far forward the ankle is
function reach(dims, a) {
  const t = a.hip, s = a.hip - a.knee;
  const drop = dims.thigh * Math.cos(t) + dims.shin * Math.cos(s);
  const fwd = dims.thigh * Math.sin(t) + dims.shin * Math.sin(s);
  const P = a.pitch;
  const sole = dims.ankle * Math.cos(P) + (P > 0 ? dims.heel : dims.ball) * Math.abs(Math.sin(P));
  return { drop: drop + sole, fwd };
}
// the cycle's length at a speed: the stance foot's travel from landing to lift-off
function period(c, g, speed) {
  const ampK = Math.max(0.55, Math.min(1.3, speed / g.speed));
  const a = reach(c.dims, legAngles(g, 0.25, ampK)), b = reach(c.dims, legAngles(g, 0.7, ampK));
  const travel = Math.max(0.05, a.fwd - b.fwd);
  return { T: travel / Math.max(0.05, speed) / 0.45, ampK };   // the stance: ~45% of the cycle
}

// ---------- poses ----------
const v3 = () => [0, 0, 0];
function pose() {
  return { pelvis: v3(), pelvisX: 0, spine: v3(), chest: v3(), neck: v3(), head: v3(),
    upperArm: [v3(), v3()], forearm: [v3(), v3()], hand: [v3(), v3()],
    legs: [{ hip: 0, knee: 0, pitch: 0 }, { hip: 0, knee: 0, pitch: 0 }], flight: 0, armSwing: 1 };
}
// a + (b − a)·w, every number
function mix(a, b, w) {
  if (w <= 0) return a; if (w >= 1) return b;
  const m = (x, y) => (Array.isArray(x) ? x.map((v, i) => m(v, y[i])) : typeof x === "object" ? Object.fromEntries(Object.keys(x).map((k) => [k, m(x[k], y[k])])) : x + (y - x) * w);
  return m(a, b);
}
function standPose(c, t) {
  const p = pose(), sway = Math.sin(t * 0.45), breathe = Math.sin(t * 1.7);
  p.pelvisX = sway * 0.012 * c.dims.s;
  p.pelvis[2] = -sway * 0.012; p.spine[2] = sway * 0.01; p.chest[0] = -0.012 * breathe;
  p.neck[1] = Math.sin(t * 0.21) * 0.18 + Math.sin(t * 0.07) * 0.1; p.head[0] = Math.sin(t * 0.17) * 0.04;
  for (let i = 0; i < 2; i++) {
    p.upperArm[i][0] = 0.03 * Math.sin(t * 0.5 + i); p.forearm[i][0] = -0.12;
    const relax = Math.max(0, (i ? -1 : 1) * sway) * 0.07;              // the leg not taking the weight
    p.legs[i] = { hip: relax * 0.4, knee: relax, pitch: 0 };
  }
  return p;
}
function tPose(c) {
  const p = pose();
  p.upperArm[0][2] = c.dims.armA; p.upperArm[1][2] = -c.dims.armA;
  return p;
}
function movePose(c, phase, t, speed) {
  const g = locoParams(speed), { ampK } = period(c, g, speed), p = pose(), breathe = Math.sin(t * 1.7);
  p.legs = [legAngles(g, phase, ampK), legAngles(g, (phase + 0.5) % 1, ampK)];
  p.flight = g.flight * c.dims.s * Math.max(0, Math.sin(TAU * 2 * (phase - 0.05)));
  const s = Math.sin(TAU * phase);
  p.pelvis[1] = -g.yaw * s; p.pelvis[2] = g.drop * Math.sin(TAU * phase + 0.4) * 0.6;
  p.spine[0] = g.lean;
  p.chest[1] = g.yaw * 1.4 * s; p.chest[0] = -0.01 * breathe;
  p.neck[1] = -g.yaw * 0.4 * s; p.head[0] = -g.lean * 0.8;
  for (let i = 0; i < 2; i++) {
    const fwd = -g.arm * ampK * Math.sin(TAU * ((phase + i * 0.5) % 1));
    p.upperArm[i][0] = -fwd; p.upperArm[i][2] = (i ? -1 : 1) * 0.04;
    p.forearm[i][0] = -(g.elbow[0] + g.elbow[1] * Math.max(0, fwd / (g.arm || 1)));
  }
  return p;
}

// ---------- layers: added on top, each with its weight ----------
function addLayers(c, p, L, t) {
  const w = (k) => Math.max(0, Math.min(1, L[k] || 0));
  const side = [1, -1];
  let k = w("sneak");
  if (k) {
    // a crouch: knees and hips bent (the pelvis drops by itself), leaning in, arms ready
    p.legs.forEach((l) => { l.hip += 20 * D * k; l.knee += 42 * D * k; });
    p.spine[0] += 16 * D * k; p.chest[0] += 4 * D * k; p.neck[0] -= 12 * D * k; p.head[0] -= 6 * D * k;
    for (let i = 0; i < 2; i++) { p.upperArm[i][0] -= 14 * D * k; p.forearm[i][0] -= 35 * D * k; }
    p.armSwing *= 1 - 0.5 * k;
  }
  k = w("sad");
  if (k) {
    p.chest[0] += 9 * D * k; p.neck[0] += 10 * D * k; p.head[0] += 16 * D * k;
    for (let i = 0; i < 2; i++) p.upperArm[i][2] -= side[i] * 3 * D * k;
    p.armSwing *= 1 - 0.6 * k;
  }
  k = w("angry");
  if (k) {
    p.chest[0] -= 4 * D * k; p.neck[0] += 7 * D * k; p.head[0] += 4 * D * k;
    for (let i = 0; i < 2; i++) { p.upperArm[i][2] += side[i] * 7 * D * k; p.forearm[i][0] -= 28 * D * k; }
  }
  k = w("nod");
  if (k) p.head[0] += (0.06 + 0.16 * Math.sin(t * TAU * 1.5)) * k;
  k = w("shake");
  if (k) p.neck[1] += 0.38 * Math.sin(t * TAU * 1.8) * k;
  k = w("look");
  if (k) { p.neck[1] += (0.55 * Math.sin(t * 0.55) + 0.15 * Math.sin(t * 1.7)) * k; p.head[0] += -0.08 * Math.max(0, Math.sin(t * 0.31)) * k; }
  k = w("wave");
  if (k) {
    // the right arm up, the forearm waving in the body's plane
    p.upperArm[1][2] += -150 * D * k; p.upperArm[1][0] *= 1 - k;
    p.forearm[1][2] = (-28 * D + 0.45 * Math.sin(t * 9)) * k; p.forearm[1][0] *= 1 - k;
    p.hand[1][2] = 0.15 * Math.sin(t * 9 - 0.6) * k;
  }
  // a damped swing (sad, sneaking): scale the arms' forward swing
  if (p.armSwing < 1) for (let i = 0; i < 2; i++) p.upperArm[i][0] *= p.armSwing;
}

// ---------- the pose onto the skeleton ----------
function apply(c, p) {
  const r = c.rig, dims = c.dims, set = (b, e) => b.rotation.set(e[0], e[1], e[2]);
  set(r.pelvis, p.pelvis); set(r.spine, p.spine); set(r.chest, p.chest); set(r.neck, p.neck); set(r.head, p.head);
  for (let i = 0; i < 2; i++) {
    set(r.upperArm[i], p.upperArm[i]); set(r.forearm[i], p.forearm[i]); set(r.hand[i], p.hand[i]);
    const a = p.legs[i];
    r.thigh[i].rotation.set(-a.hip, 0, 0);
    r.shin[i].rotation.set(a.knee, 0, 0);
    // the foot: its pitch in the world = −(sum of the x rotations down the chain)
    r.foot[i].rotation.set(-a.pitch + a.hip - a.knee - p.pelvis[0], 0, 0);
  }
  // the pelvis: as high as the lower foot allows (+ a flight when running)
  const rL = reach(dims, p.legs[0]), rR = reach(dims, p.legs[1]);
  r.pelvis.position.copy(r.pelvis.userData.rest);
  r.pelvis.position.x += p.pelvisX;
  r.pelvis.position.y = Math.max(rL.drop, rR.drop) + (dims.pelvisY - dims.hipY) + p.flight;
}

// state: { gait: idle | walk | run | tpose, speed, layers: { sneak, … } }
function animate(c, t, dt, state) {
  const gait = state.gait || "idle", want = state.speed != null ? state.speed : (GAITS[gait] || GAITS.walk).speed;
  // the speed changes like a body's: 4 m/s² at most (a walk speeds up into a run)
  if (c.spd == null) c.spd = want;
  c.spd += Math.max(-4 * dt, Math.min(4 * dt, want - c.spd));
  const speed = c.spd;
  const target = gait === "walk" || gait === "run" ? "move" : gait === "tpose" ? "tpose" : "stand";
  // the base's weights fade toward the chosen one
  const W = c.gaitW || (c.gaitW = { stand: target === "stand" ? 1 : 0, move: target === "move" ? 1 : 0, tpose: target === "tpose" ? 1 : 0 });
  for (const k in W) W[k] += ((k === target ? 1 : 0) - W[k]) * Math.min(1, dt / FADE * 2.2);
  const sum = W.stand + W.move + W.tpose || 1;
  // the phase runs while moving (at the period of the speed's walk–run mix)
  let T = 0;
  if (W.move > 0.001) {
    const g = locoParams(Math.max(0.3, speed));
    T = period(c, g, Math.max(0.3, speed)).T;
    c.phase = ((c.phase || 0) + dt / T) % 1;
  }
  // three poses by their weights: (stand·ws + move·wm) / (ws + wm), then the T-pose's share on top
  const ws = W.stand / sum, wm = W.move / sum, wt = W.tpose / sum;
  let p = standPose(c, t);
  if (wm > 0.001) p = mix(p, movePose(c, c.phase || 0, t, Math.max(0.3, speed)), wm / Math.max(1e-6, ws + wm));
  if (wt > 0.001) p = mix(p, tPose(c), wt);
  addLayers(c, p, state.layers || {}, t);
  apply(c, p);
  return { period: T, weights: W };
}

LK.registerMove("walk", { medium: "land", GAITS, LAYERS, animate, period });
})();
