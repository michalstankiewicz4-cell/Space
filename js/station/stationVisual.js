import { ctx } from "../core/context.js";
import { gfxDetail, gfxParticles, onGraphicsChange } from "../scene/graphics.js";
import { STATION_MODEL_LENGTH, STATION_START_DAMAGE } from "../config.js";

// The space station's look: ShipKit's ST-04 HAVEN (js/shipkit/shipkit.js,
// the ship lab's model — a spinning habitat ring, the greenhouse dome, the
// solar truss, a torn ring segment), shared by the player's own station
// (station/station.js) and other players' (net/shipsBroadcast.js). Never
// tinted (the user's call, as for ships): another player's station gets a
// name label instead. Built with merged static meshes, effects in the
// scene; STATION_MODEL_LENGTH world units along its truss. It starts as a
// ruin (STATION_START_DAMAGE, the story) — repairs will lower it. One per player,
// so there's no distance LOD; a geometry-detail change rebuilds it.
const all = new Set();
let animT = 0;

// opts: { remote: true } for another player's station (lower detail, no particles)
export function makeStationVisual(opts){
  const remote = !!(opts && opts.remote);
  const v = {
    root: new THREE.Group(), model: null, holder: null, remote: remote,
    // 0..1; kept across rebuilds (the model's ruin and smoke follow it)
    damage: STATION_START_DAMAGE,
    build: function(){
      const detail = remote ? Math.min(gfxDetail(), 1) * 0.5 : gfxDetail() * 0.7;
      v.model = ShipKit.buildShipModel("haven", { detail: Math.max(0.2, detail), merge: true, fxRoot: ctx.scene });
      v.holder = ShipKit.makeGameHolder(v.model, STATION_MODEL_LENGTH);
      v.root.add(v.holder);
      v.model.setDamage(v.damage);
    },
    setDamage: function(d){ v.damage = d; if(v.model) v.model.setDamage(d); },
    dropModel: function(){
      if(!v.model) return;
      v.root.remove(v.holder);
      ShipKit.disposeShipModel(v.model);
      v.model = v.holder = null;
    },
    // model actions ("scan", "offline"), see ShipKit.STANDARD_ACTIONS
    act: function(id, on){ if(v.model) v.model.act(id, on); },
    dispose: function(){ v.dropModel(); all.delete(v); }
  };
  v.build();
  all.add(v);
  return v;
}

// Every frame: the ring turns, lights blink, the dish sweeps.
export function updateStationVisuals(dt){
  animT += dt;
  all.forEach(function(v){
    if(v.model) v.model.update(animT, dt, { particles: gfxParticles() && !v.remote });
  });
}

onGraphicsChange(function(before){
  if(before.detail === gfxDetail()) return;
  all.forEach(function(v){ v.dropModel(); v.build(); });
});
