// The renderer outputs sRGB with filmic tone mapping (scene/setup.js), like
// the ship and body labs. That treats a material's color as linear light,
// while the game's own colors were picked for the old plain output — left
// as they are they'd all come out washed out (teal ships nearly white).
// So every game material and light gets its colors converted sRGB ->
// linear once, the first time it's seen: the same hues as before, now with
// tone mapping and reflections. Runs every frame but only touches what's
// new (a WeakSet remembers the rest), so objects spawned later — comets,
// ghosts, effects — are covered too. ShipKit models (userData.shipkit)
// are skipped: they're authored for this pipeline already, like the labs.
// Vertex colors (particles) are handled where they're written;
// custom ShaderMaterials output their color untouched and need nothing.
const done = new WeakSet();

function fixColor(c){ if(c && c.isColor) c.convertSRGBToLinear(); }

function fixMaterial(m){
  if(done.has(m)) return;
  done.add(m);
  fixColor(m.color);
  fixColor(m.emissive);
}

function walk(o){
  if(o.userData.shipkit) return;
  if(o.isLight && !done.has(o)){
    done.add(o);
    fixColor(o.color);
    fixColor(o.groundColor);
  }
  const m = o.material;
  if(m){
    if(Array.isArray(m)) m.forEach(fixMaterial);
    else fixMaterial(m);
  }
  for(let i = 0; i < o.children.length; i++) walk(o.children[i]);
}

export function manageSceneColors(scene){
  if(scene.fog && !done.has(scene.fog)){ done.add(scene.fog); fixColor(scene.fog.color); }
  walk(scene);
}
