// Removes the first occurrence of `item` from an array in place (without
// creating a new array) — used everywhere that would otherwise need
// `arr = arr.filter(x => x !== item)`, which doesn't work on an array
// imported from another module (you can't reassign someone else's binding,
// only mutate it).
export function removeItem(arr, item){
  const i = arr.indexOf(item);
  if(i !== -1) arr.splice(i, 1);
  return i !== -1;
}

// The same try/catch-guarded localStorage read/write was independently
// reimplemented in every small persisted module (net/identity.js,
// settings.js, i18n.js, drone/drone.js, admin/main.js, core/gameState.js —
// see docs/architecture.md's "Settings vs. identity vs. i18n" note on why those stay
// separate modules rather than being merged: they persist unrelated data,
// they just all need the same "don't throw in a private-browsing/storage-
// disabled tab" guard around the two calls that can actually throw).
// Callers still own their own key names, JSON parsing and defaults - this
// only dedupes the boilerplate around the storage access itself.
export function readStorage(key){
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}
export function writeStorage(key, value){
  try{ localStorage.setItem(key, value); }catch(e){ /* storage unavailable - ignore */ }
}

// Removes a mesh/group from the scene and disposes every geometry/material
// found by traversing it — the same few lines were previously duplicated
// (with the same subtle station-mesh-only material dedupe, since a
// many-submesh group like the station model can share one material across
// several children, and disposing it twice is a no-op but still wasteful
// busywork) across ships/swarm.js#disposeShip, world/blackholes.js's
// drone-consumed-by-blackhole cleanup and the ghost units in
// net/shipsBroadcast.js. `scene` is passed explicitly rather than imported
// from core/context.js so this stays a small, dependency-free helper
// callable from anywhere, same spirit as removeItem() above.
export function disposeMesh(scene, mesh){
  scene.remove(mesh);
  const seenMaterials = new Set();
  mesh.traverse(function(obj){
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material && !seenMaterials.has(obj.material)){
      seenMaterials.add(obj.material);
      obj.material.dispose();
    }
  });
}

// Every texture the game generates is a color texture (surfaces, glows,
// sprites, labels): with the renderer's sRGB output (scene/setup.js) it
// has to be marked sRGB too, or it would come out washed out.
export function sRGBTexture(tex){
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}
