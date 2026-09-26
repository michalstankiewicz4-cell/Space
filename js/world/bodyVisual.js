import { gfxDetail, gfxQuality, onGraphicsChange } from "../scene/graphics.js";

// A fixed planet's look from BodyKit (js/bodykit/bodykit.js, the body
// lab's bodies — the same file bodies.html loads): each orbit slot that
// has a lab body (BodyKit.GAME_BODIES) shows exactly that body, sized to
// the slot's radius. Retune a planet in the lab and the game follows.
// The body lights itself from the Sun at the origin, spins at its lab
// rate and shows damage as glowing cracks (setDamage); world/bodies.js
// keeps the invisible pick sphere, the scorch marks and the game logic
// around it. Geometry detail and noise octaves follow Setup -> Graphics.
const all = new Set();
let animT = 0;

export function hasBodyLook(slot){
  return slot != null && !!BodyKit.GAME_BODIES[slot];
}

export function makeBodyLook(slot, radius){
  const ref = BodyKit.GAME_BODIES[slot];
  const look = {
    root: new THREE.Group(), body: null, damage: 0,
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
    dispose: function(){ BodyKit.disposeBody(look.body); all.delete(look); }
  };
  look.build();
  all.add(look);
  return look;
}

// Every frame: time for the animated layers (clouds, lava), spin, sun direction.
export function updateBodyLooks(dt){
  animT += dt;
  all.forEach(function(l){ l.body.update(animT, dt); });
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
