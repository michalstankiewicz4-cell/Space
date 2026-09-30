import { gfxSmoothLines, gfxLineWidth, onGraphicsChange } from "./graphics.js";

// Lines for orbits, comet paths and trajectories, in one of two looks
// (Setup -> Graphics -> Smooth lines):
//   smooth — Three.js's fat lines (vendor/three-r128-examples: Line2 +
//            LineMaterial): triangle strips, anti-aliased, any width in
//            pixels (gfxLineWidth)
//   plain  — THREE.Line: WebGL's own 1-pixel lines, aliased (the old look)
// Callers describe a material once ({ color, opacity, depthTest }) and get
// a line object; when the setting changes every caller rebuilds (onChange).
// LineMaterial needs the size of what it's drawn into — setLineResolution()
// runs before each render pass (scene/viewRect.js).
const smoothMats = new Set();
const resolution = new THREE.Vector2(1, 1);

export function smoothLinesAvailable(){ return !!(THREE.Line2 && THREE.LineMaterial && THREE.LineGeometry); }
export function useSmoothLines(){ return gfxSmoothLines() && smoothLinesAvailable(); }

// spec: { color, opacity, depthTest (default true), depthWrite (default false) }
export function makeLineMaterial(spec){
  const common = { color: spec.color, transparent: true, opacity: spec.opacity == null ? 1 : spec.opacity,
    depthTest: spec.depthTest !== false, depthWrite: !!spec.depthWrite };
  if(useSmoothLines()){
    const m = new THREE.LineMaterial(Object.assign(common, { linewidth: gfxLineWidth() }));
    m.toneMapped = spec.toneMapped !== false;
    m.resolution.copy(resolution);
    smoothMats.add(m);
    return m;
  }
  const m = new THREE.LineBasicMaterial(Object.assign(common, { fog: false }));
  m.toneMapped = spec.toneMapped !== false;
  return m;
}

// points: THREE.Vector3[]; material from makeLineMaterial (same mode).
export function makeLine(points, material){
  if(material.isLineMaterial){
    const flat = new Float32Array(points.length * 3);
    points.forEach(function(p, i){ flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.z; });
    const geo = new THREE.LineGeometry();
    geo.setPositions(flat);
    const line = new THREE.Line2(geo, material);
    line.computeLineDistances();
    return line;
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

// Drawing-buffer size of the current render pass, in pixels.
export function setLineResolution(w, h){
  resolution.set(w, h);
  smoothMats.forEach(function(m){ m.resolution.set(w, h); });
}

export function disposeLineMaterial(m){ smoothMats.delete(m); m.dispose(); }

// The mode or width changed: fn() rebuilds that caller's lines.
export function onLinesChange(fn){
  onGraphicsChange(function(before){
    if(before.smoothLines !== gfxSmoothLines()) fn();
    else if(before.lineWidth !== gfxLineWidth()) smoothMats.forEach(function(m){ m.linewidth = gfxLineWidth(); });
  });
}
