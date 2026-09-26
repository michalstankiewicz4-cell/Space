import { gfxDetail, gfxQuality, onGraphicsChange } from "../scene/graphics.js";
import { COMET_ACTIVITY_DISTANCE } from "../config.js";

// Every body's look comes from BodyKit (js/bodykit/bodykit.js, the body
// lab's bodies — the same file bodies.html loads): a fixed orbit slot
// shows its own lab body (BodyKit.GAME_BODIES), a kind that comes and
// goes shows the lab body for that kind (BodyKit.GAME_KINDS: comets).
// Retune a body in the lab and the game follows. The body lights itself
// from the Sun at the origin, spins at its lab rate and shows damage as
// glowing cracks (setDamage); world/bodies.js and world/blackholes.js keep
// the invisible pick sphere, the scorch marks and the game logic around
// it. Geometry detail and noise octaves follow Setup -> Graphics.
const all = new Set();
let animT = 0;

// Which lab body a game body is: its fixed slot's, else its kind's.
export function bodyLookRef(slot, kind){
  const ref = (slot != null && BodyKit.GAME_BODIES[slot]) || BodyKit.GAME_KINDS[kind];
  if(!ref) throw new Error("No BodyKit body for slot " + slot + " / kind " + kind);
  return ref;
}

// A comet's activity (coma, tail length): stronger nearer the Sun.
export function cometActivity(distanceFromSun){
  return Math.max(0.3, Math.min(1.5, COMET_ACTIVITY_DISTANCE / Math.max(distanceFromSun, 1)));
}

export function makeBodyLook(ref, radius){
  const look = {
    root: new THREE.Group(), body: null, damage: 0,
    // passed to BodyKit's update() every frame (a comet: velocity, activity)
    opts: {},
    // things that turn with the surface (scorch marks), in units of the radius
    attached: [],
    build: function(){
      look.body = BodyKit.buildBody(ref.groupId, ref.bodyId, { detail: gfxDetail() * 0.5, values: { damage: look.damage } });
      look.body.setRadius(radius);
      look.body.setOctaves(BodyKit.QUALITY_OCTAVES[gfxQuality()]);
      look.attached.forEach(function(o){ look.body.surfaceRoot.add(o); });
      look.root.add(look.body.group);
    },
    attach: function(o){ look.attached.push(o); look.body.surfaceRoot.add(o); },
    setDamage: function(x){ look.damage = x; look.body.setDamage(x); },
    // rad/s (the info panel shows it)
    spinRate: function(){ return look.body.values.spin * BodyKit.SPIN_RAD_PER_UNIT; },
    dispose: function(){ BodyKit.disposeBody(look.body); all.delete(look); }
  };
  look.build();
  all.add(look);
  return look;
}

// Every frame: time for the animated layers, spin, sun direction, tails.
export function updateBodyLooks(dt){
  animT += dt;
  all.forEach(function(l){ l.body.update(animT, dt, l.opts); });
}

onGraphicsChange(function(before){
  const rebuild = before.detail !== gfxDetail();
  all.forEach(function(l){
    if(rebuild){
      // the attached decals survive: taken out before the old body is freed
      l.attached.forEach(function(o){ l.body.surfaceRoot.remove(o); });
      BodyKit.disposeBody(l.body);
      l.build();
    } else {
      l.body.setOctaves(BodyKit.QUALITY_OCTAVES[gfxQuality()]);
    }
  });
});
