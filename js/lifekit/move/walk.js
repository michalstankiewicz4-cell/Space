/* LifeKit — moving on land (js/lifekit/move/walk.js): a biped's gaits.
   Loaded after lifekit.js. docs/life.md.

   A creature using it gives a rig: { pelvis, spine, chest, neck, head,
   upperArm[2], forearm[2], hand[2], thigh[2], shin[2], foot[2] } (bones;
   index 0 left, 1 right) and dims: { thigh, shin, ankle, heel, ball,
   pelvisY, hipY } (metres).

   Gaits: idle (breathing, a slow shift of weight), walk, run, tpose. The
   legs swing on a sine; the knee bends in the swing (and a little as the
   heel lands); the foot is kept level in the stance, rolls off the toes,
   lifts them in the swing. The pelvis height comes from the legs
   themselves: the lower foot always touches the ground. The cycle's
   length comes from how far the stance foot travels, so the feet don't
   slide on the ground at the chosen speed. */
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
// a bump on the cycle (wraps around): 1 at c, falling off over w
function bump(q, c, w) { let d = q - c; d -= Math.round(d); return Math.exp(-(d * d) / (w * w)); }

// one leg at its own phase q: hip (forward +), knee flex, foot pitch (toes up +)
function legAngles(g, q, ampK) {
  const hip = g.hip * ampK * Math.sin(TAU * q);
  // the swing (the hip moving forward): q from 0.7 to 1.25
  const w = q < 0.3 ? q + 1 : q;
  let knee = w > 0.7 && w < 1.28 ? g.knee * Math.sin(Math.PI * (w - 0.7) / 0.58) : 0;
  knee += g.load * (q > 0.25 && q < 0.55 ? Math.sin(Math.PI * (q - 0.25) / 0.3) : 0);   // the heel lands: a give
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

function setLeg(r, i, a, pelvisX) {
  r.thigh[i].rotation.set(-a.hip, 0, 0);
  r.shin[i].rotation.set(a.knee, 0, 0);
  // the foot: its pitch in the world = −(sum of the x rotations down the chain)
  r.foot[i].rotation.set(-a.pitch + a.hip - a.knee - pelvisX, 0, 0);
}

function animate(c, t, dt, state) {
  const r = c.rig, dims = c.dims, gaitId = state.gait || "idle", g = GAITS[gaitId] || GAITS.idle;
  const side = [1, -1];
  // the arms' rest: the A-pose they were built in (rotation 0)
  for (let i = 0; i < 2; i++) { r.upperArm[i].rotation.set(0, 0, 0); r.forearm[i].rotation.set(0, 0, 0); r.hand[i].rotation.set(0, 0, 0); }
  r.pelvis.rotation.set(0, 0, 0); r.spine.rotation.set(0, 0, 0); r.chest.rotation.set(0, 0, 0); r.neck.rotation.set(0, 0, 0); r.head.rotation.set(0, 0, 0);
  r.pelvis.position.copy(r.pelvis.userData.rest);
  const breathe = Math.sin(t * 1.7);

  if (gaitId === "tpose" || gaitId === "idle") {
    for (let i = 0; i < 2; i++) setLeg(r, i, { hip: 0, knee: 0, pitch: 0 }, 0);
    if (gaitId === "tpose") {
      for (let i = 0; i < 2; i++) r.upperArm[i].rotation.z = side[i] * c.dims.armA;
      return { period: 0 };
    }
    // idle: breathing, the weight drifting from foot to foot, a look around
    const sway = Math.sin(t * 0.45);
    r.pelvis.position.x += sway * 0.012 * c.dims.s;
    r.pelvis.rotation.z = -sway * 0.012;
    r.spine.rotation.z = sway * 0.01;
    r.chest.rotation.x = -0.012 * breathe;
    r.neck.rotation.y = Math.sin(t * 0.21) * 0.18 + Math.sin(t * 0.07) * 0.1;
    r.head.rotation.x = Math.sin(t * 0.17) * 0.04;
    for (let i = 0; i < 2; i++) {
      r.upperArm[i].rotation.x = 0.03 * Math.sin(t * 0.5 + i);
      r.forearm[i].rotation.x = -0.12;
      // the legs: the one taking the weight straight, the other relaxed
      const relax = Math.max(0, side[i] * sway) * 0.07;
      setLeg(r, i, { hip: relax * 0.4, knee: relax, pitch: 0 }, r.pelvis.rotation.x);
    }
    r.pelvis.position.y = r.pelvis.userData.rest.y - 0.004 * c.dims.s;
    return { period: 0 };
  }

  // walking or running: the phase runs with the chosen speed
  const speed = state.speed != null ? state.speed : g.speed;
  const { T, ampK } = period(c, g, speed);
  c.phase = (c.phase + dt / T) % 1;
  const p = c.phase;
  const legs = [legAngles(g, p, ampK), legAngles(g, (p + 0.5) % 1, ampK)];
  const pelvisX = 0;
  for (let i = 0; i < 2; i++) setLeg(r, i, legs[i], pelvisX);
  // the pelvis: as high as the lower foot allows (+ a flight when running)
  const rL = reach(dims, legs[0]), rR = reach(dims, legs[1]);
  const flight = g.flight * c.dims.s * Math.max(0, Math.sin(TAU * 2 * (p - 0.05)));
  r.pelvis.position.y = Math.max(rL.drop, rR.drop) + (dims.pelvisY - dims.hipY) + flight;
  // the body: the pelvis turns with the forward leg, the chest against it
  const s = Math.sin(TAU * p);
  r.pelvis.rotation.y = -g.yaw * s;
  r.pelvis.rotation.z = g.drop * Math.sin(TAU * p + 0.4) * 0.6;
  r.spine.rotation.x = g.lean;
  r.chest.rotation.y = g.yaw * 1.4 * s;
  r.chest.rotation.x = -0.01 * breathe;
  r.neck.rotation.y = -g.yaw * 0.4 * s;
  r.head.rotation.x = -g.lean * 0.8;
  // the arms: each against its own leg
  for (let i = 0; i < 2; i++) {
    const fwd = -g.arm * ampK * Math.sin(TAU * ((p + i * 0.5) % 1));
    r.upperArm[i].rotation.x = -fwd;
    r.upperArm[i].rotation.z = side[i] * 0.04;
    r.forearm[i].rotation.x = -(g.elbow[0] + g.elbow[1] * Math.max(0, fwd / (g.arm || 1)));
  }
  return { period: T };
}

LK.registerMove("walk", { medium: "land", GAITS, animate, period });
})();
