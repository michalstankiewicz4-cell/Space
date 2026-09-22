import { ctx } from "../core/context.js";

// Dev Tools debug visualization (see ui/devTools.js) — a small wireframe
// marker at every PointLight's world position: the two fixed scene lights
// (scene/setup.js exposes them as ctx.sceneLights.sun/.rim) plus one per
// currently-live sun body (each sun gets its own PointLight child of its
// own mesh — see world/bodies.js#materializePlanet). There's no
// DirectionalLight/HemisphereLight anywhere in this game, so every light
// worth marking is an omnidirectional point — no direction arrows needed.
let markers = [];
let enabled = false;

// Radius 0.6 works fine for the two fixed lights (nothing else out there
// to hide behind), but a sun body's own mesh is much bigger than that —
// a fixed-size marker sitting exactly at its position would render
// entirely inside the opaque sun and never be seen. Passing the sun's own
// radius sizes the marker as a wireframe shell just outside its surface
// instead, reading as a highlight around the sun rather than vanishing.
function makeMarker(radius){
  const geo = new THREE.SphereGeometry(radius, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, wireframe: true });
  return new THREE.Mesh(geo, mat);
}

function disposeMarker(m){
  ctx.scene.remove(m);
  m.geometry.dispose();
  m.material.dispose();
}

export function setLightMarkersVisible(val){
  enabled = val;
  if(!enabled){
    markers.forEach(disposeMarker);
    markers = [];
  }
}

export function updateLightMarkers(){
  if(!enabled) return;
  const suns = ctx.planets.filter(function(p){ return p.kind === "sun" && !p.dying; });
  const wanted = (ctx.sceneLights ? 2 : 0) + suns.length;

  while(markers.length < wanted){ const m = makeMarker(0.6); ctx.scene.add(m); markers.push(m); }
  while(markers.length > wanted){ disposeMarker(markers.pop()); }

  let i = 0;
  if(ctx.sceneLights){
    markers[i].position.copy(ctx.sceneLights.sun.position);
    markers[i].scale.setScalar(1);
    i++;
    markers[i].position.copy(ctx.sceneLights.rim.position);
    markers[i].scale.setScalar(1);
    i++;
  }
  suns.forEach(function(p){
    markers[i].position.copy(p.mesh.position);
    markers[i].scale.setScalar((p.radius * 1.15) / 0.6);
    i++;
  });
}
