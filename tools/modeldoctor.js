/* =======================================================================
   MODEL DOCTOR — finds the repeating mistakes in procedural models
   =======================================================================
   A classic script (window.ModelDoctor), a tool: the doctor page
   (tools/doctor.html) and scripts use it on any THREE object — every kit's
   models (ShipKit, BaseKit, VehicleKit, MarineKit). Examine a model built
   WITHOUT merging, so each problem points at a part.

   It looks only at solid meshes: visible, opaque materials (standard,
   physical, lambert, phong, basic). Glows, plumes, sprites, particles,
   lines and instanced copies are left out.

   The checks (each finding: { check, severity, parts, detail, meshes }):
     nan        positions that aren't numbers — broken maths        error
     inverted   a closed shape built inside-out (its faces point in,
                the outside culled away)                             error
     zfight     two parts' faces in the same plane, overlapping —
                they flicker against each other                      warning
     floating   a part that touches nothing of the rest of the model warning
     hidden     a part entirely inside another one — drawn for
                nothing                                              info
     speck      a part too small to ever be seen — a draw call for
                nothing                                              info
     sliver     long, thin triangles that shade badly (needles)      info

   Part names: the nearest ancestor with userData.part (ShipKit's partsOf,
   the ship lab's PART NAMES), else the object's name, else its geometry
   type. docs/doctor.md has the why and the next checks.

   API
     ModelDoctor.examine(root, opts?) → { findings, stats }
       opts: { tolerance } (fraction of the model's size, default 0.004)
     ModelDoctor.CHECKS            the checks' ids, in order
   ======================================================================= */
window.ModelDoctor = (function () {
"use strict";
const CHECKS = ["nan", "inverted", "zfight", "floating", "hidden", "speck", "sliver"];
const SEVERITY = { nan: "error", inverted: "error", zfight: "warning", floating: "warning", hidden: "info", speck: "info", sliver: "info" };
const CLOSED = new Set(["BoxGeometry", "SphereGeometry", "IcosahedronGeometry", "OctahedronGeometry", "DodecahedronGeometry",
  "TetrahedronGeometry", "TorusGeometry", "TorusKnotGeometry", "ExtrudeGeometry", "CapsuleGeometry"]);
const SOLID_MATS = ["isMeshStandardMaterial", "isMeshPhysicalMaterial", "isMeshLambertMaterial", "isMeshPhongMaterial", "isMeshBasicMaterial"];

const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();

function visibleInTree(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function isSolid(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !visibleInTree(o)) return false;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  return mats.every((m) => m && m.visible !== false && SOLID_MATS.some((k) => m[k]) && !(m.transparent && m.opacity < 0.95)
    && m.blending !== THREE.AdditiveBlending);
}
// a readable name: the part (ShipKit), else the object's name, else the
// geometry, a running number and the material's colour (kits without names)
function partName(o, i) {
  for (let p = o; p; p = p.parent) if (p.userData && p.userData.part) return p.name;
  if (o.name) return o.name;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return (o.geometry && o.geometry.type || "mesh").replace("Geometry", "").toLowerCase() + " #" + i + (m && m.color ? " " + "#" + m.color.getHexString() : "");
}
function closedShape(g) {
  if (!CLOSED.has(g.type)) return g.type === "CylinderGeometry" && g.parameters && !g.parameters.openEnded && (g.parameters.thetaLength == null || g.parameters.thetaLength >= Math.PI * 2 - 1e-6);
  const p = g.parameters || {};
  if (g.type === "SphereGeometry") return (p.phiLength == null || p.phiLength >= Math.PI * 2 - 1e-6) && (p.thetaLength == null || p.thetaLength >= Math.PI - 1e-6);
  if (g.type === "TorusGeometry") return p.arc == null || p.arc >= Math.PI * 2 - 1e-6;
  return true;
}

// world-space triangles of one mesh, and its box
function collect(o, i) {
  const g = o.geometry, pos = g.attributes.position;
  if (!pos) return null;
  const idx = g.index ? g.index.array : null, count = idx ? idx.length : pos.count;
  const W = new Float32Array(pos.count * 3), box = new THREE.Box3();
  let nan = false;
  for (let i = 0; i < pos.count; i++) {
    v0.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    if (!isFinite(v0.x) || !isFinite(v0.y) || !isFinite(v0.z)) { nan = true; continue; }
    W[i * 3] = v0.x; W[i * 3 + 1] = v0.y; W[i * 3 + 2] = v0.z; box.expandByPoint(v0);
  }
  return { o, g, W, idx, tris: Math.floor(count / 3), box, nan, name: partName(o, i) };
}
function triVerts(m, t, a, b, c) {
  const i0 = m.idx ? m.idx[t * 3] : t * 3, i1 = m.idx ? m.idx[t * 3 + 1] : t * 3 + 1, i2 = m.idx ? m.idx[t * 3 + 2] : t * 3 + 2;
  a.fromArray(m.W, i0 * 3); b.fromArray(m.W, i1 * 3); c.fromArray(m.W, i2 * 3);
}

// signed volume in the geometry's own space (three.js itself corrects
// mirrored objects, so the world matrix doesn't count)
function signedVolume(g) {
  const pos = g.attributes.position, idx = g.index ? g.index.array : null, count = idx ? idx.length : pos.count;
  let vol = 0;
  for (let k = 0; k < count; k += 3) {
    v0.fromBufferAttribute(pos, idx ? idx[k] : k); v1.fromBufferAttribute(pos, idx ? idx[k + 1] : k + 1); v2.fromBufferAttribute(pos, idx ? idx[k + 2] : k + 2);
    vol += v0.dot(e1.crossVectors(v1, v2)) / 6;
  }
  return vol;
}

// 2D triangles overlap (separating axes), each shrunk a little so that
// faces only sharing an edge don't count
function overlap2D(A, B) {
  const shrink = (T) => { const cx = (T[0] + T[2] + T[4]) / 3, cy = (T[1] + T[3] + T[5]) / 3; return T.map((v, i) => (i % 2 ? cy : cx) + (v - (i % 2 ? cy : cx)) * 0.9); };
  const a = shrink(A), b = shrink(B);
  for (const T of [a, b]) for (let i = 0; i < 3; i++) {
    const x1 = T[i * 2], y1 = T[i * 2 + 1], x2 = T[((i + 1) % 3) * 2], y2 = T[((i + 1) % 3) * 2 + 1];
    const nx = y1 - y2, ny = x2 - x1;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (let k = 0; k < 3; k++) { const pa = a[k * 2] * nx + a[k * 2 + 1] * ny; aMin = Math.min(aMin, pa); aMax = Math.max(aMax, pa);
      const pb = b[k * 2] * nx + b[k * 2 + 1] * ny; bMin = Math.min(bMin, pb); bMax = Math.max(bMax, pb); }
    if (aMax <= bMin || bMax <= aMin) return false;
  }
  return true;
}

function examine(root, opts = {}) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (isSolid(o)) { const m = collect(o, meshes.length); if (m && m.tris) meshes.push(m); } });
  const findings = [];
  const add = (check, list, detail) => findings.push({ check, severity: SEVERITY[check], parts: [...new Set(list.map((m) => m.name))], detail, meshes: list.map((m) => m.o) });
  const all = new THREE.Box3(); meshes.forEach((m) => all.union(m.box));
  const L = all.isEmpty() ? 1 : all.getSize(v0).length();
  const tol = (opts.tolerance || 0.004) * L;

  // nan
  meshes.filter((m) => m.nan).forEach((m) => add("nan", [m], "positions that aren't numbers"));

  // inverted: a closed shape with negative volume, drawn one-sided
  meshes.forEach((m) => {
    const mats = Array.isArray(m.o.material) ? m.o.material : [m.o.material];
    if (!closedShape(m.g) || mats.some((x) => x.side === THREE.DoubleSide)) return;
    const vol = signedVolume(m.g);
    if (vol < 0 && m.g.type !== "ExtrudeGeometry") add("inverted", [m], "built inside-out (volume " + vol.toExponential(1) + ")");
    else if (vol < 0) add("inverted", [m], "extrusion wound the wrong way (the shape's points go clockwise)");
  });

  // zfight: faces of different parts in the same plane, overlapping
  const eps = 0.0006 * L, buckets = new Map(), qn = 120;
  const keyOf = (nx, ny, nz, d) => Math.round(nx * qn) + "," + Math.round(ny * qn) + "," + Math.round(nz * qn) + "," + Math.round(d / eps);
  meshes.forEach((m, mi) => {
    const mats = Array.isArray(m.o.material) ? m.o.material : [m.o.material];
    if (mats.some((x) => x.polygonOffset)) return;                          // already offset on purpose (decals)
    for (let t = 0; t < m.tris; t++) {
      triVerts(m, t, v0, v1, v2);
      n.crossVectors(e1.subVectors(v1, v0), e2.subVectors(v2, v0));
      const area2 = n.length(); if (area2 < 1e-12 * L * L) continue;
      n.divideScalar(area2);
      const d = n.dot(v0), k = keyOf(n.x, n.y, n.z, d);
      let b = buckets.get(k); if (!b) buckets.set(k, b = []);
      if (b.length < 600) b.push({ mi, t, nx: n.x, ny: n.y, nz: n.z });
    }
  });
  const pairs = new Map(), A = [0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0], ax = new THREE.Vector3(), ay = new THREE.Vector3(), nn = new THREE.Vector3();
  const flat = (m, t, out) => { triVerts(m, t, v0, v1, v2); [v0, v1, v2].forEach((p, i) => { out[i * 2] = p.dot(ax); out[i * 2 + 1] = p.dot(ay); }); };
  buckets.forEach((b) => {
    if (b.length < 2) return;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const p = b[i], q = b[j];
      if (p.mi === q.mi) continue;
      // the same material without a texture paints identical pixels: the
      // fight can't be seen (e.g. a track's links overlapping)
      const ma = meshes[p.mi].o.material, mb = meshes[q.mi].o.material;
      if (ma === mb && !ma.map) continue;
      const key = Math.min(p.mi, q.mi) + ":" + Math.max(p.mi, q.mi);
      if ((pairs.get(key) || 0) > 50) continue;
      nn.set(p.nx, p.ny, p.nz);
      ax.set(1, 0, 0); if (Math.abs(nn.x) > 0.9) ax.set(0, 1, 0);
      ax.sub(e1.copy(nn).multiplyScalar(ax.dot(nn))).normalize(); ay.crossVectors(nn, ax);
      flat(meshes[p.mi], p.t, A); flat(meshes[q.mi], q.t, B);
      if (overlap2D(A, B)) pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  });
  pairs.forEach((count, key) => {
    const [a, b] = key.split(":").map(Number);
    add("zfight", [meshes[a], meshes[b]], count + (count > 50 ? "+" : "") + " overlapping faces in one plane");
  });

  // floating: parts whose boxes (grown by the tolerance) reach nothing of the main body
  const grown = meshes.map((m) => m.box.clone().expandByScalar(tol));
  const comp = meshes.map((_, i) => i), find = (i) => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) if (grown[i].intersectsBox(grown[j])) comp[find(i)] = find(j);
  const groups = new Map();
  meshes.forEach((m, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(m); });
  const sorted = [...groups.values()].sort((x, y) => y.reduce((s, m) => s + m.tris, 0) - x.reduce((s, m) => s + m.tris, 0));
  sorted.slice(1).forEach((g) => {
    let gap = Infinity;
    const gb = new THREE.Box3(); g.forEach((m) => gb.union(m.box));
    sorted[0].forEach((m) => { gap = Math.min(gap, gb.distanceToPoint(m.box.clampPoint(gb.getCenter(v0), v1))); });
    add("floating", g, "touches nothing of the main body (gap ≈ " + (gap / L * 100).toFixed(1) + " % of the model)");
  });

  // hidden: every sampled vertex inside another closed part
  const ray = new THREE.Raycaster(), dir = new THREE.Vector3(0.577, 0.577, 0.577);
  const inside = (p, other) => {
    const mats = Array.isArray(other.o.material) ? other.o.material : [other.o.material], sides = mats.map((x) => x.side);
    mats.forEach((x) => { x.side = THREE.DoubleSide; });
    ray.set(p, dir); const hits = ray.intersectObject(other.o, false).length;
    mats.forEach((x, i) => { x.side = sides[i]; });
    return hits % 2 === 1;
  };
  meshes.forEach((m) => {
    for (const other of meshes) {
      if (other === m || !closedShape(other.g) || !other.box.containsBox(m.box)) continue;
      const nv = m.W.length / 3, step = Math.max(1, Math.floor(nv / 16));
      let all = true;
      for (let i = 0; i < nv && all; i += step) { v0.fromArray(m.W, i * 3); if (!inside(v0.clone(), other)) all = false; }
      if (all) { add("hidden", [m, other], "entirely inside " + other.name); break; }
    }
  });

  // speck: too small to be seen
  meshes.forEach((m) => { const s = m.box.getSize(v0).length(); if (s < 0.003 * L) add("speck", [m], "size " + (s / L * 100).toFixed(2) + " % of the model"); });

  // sliver: needle triangles (area tiny against the longest edge), not zero-area ones (a cone's tip: harmless)
  meshes.forEach((m) => {
    let bad = 0;
    for (let t = 0; t < m.tris; t++) {
      triVerts(m, t, v0, v1, v2);
      const area = n.crossVectors(e1.subVectors(v1, v0), e2.subVectors(v2, v0)).length() / 2;
      const longest = Math.max(v0.distanceToSquared(v1), v1.distanceToSquared(v2), v2.distanceToSquared(v0));
      if (area > 1e-10 * L * L && area / longest < 0.002) bad++;
    }
    if (bad > Math.max(4, m.tris * 0.05)) add("sliver", [m], bad + " of " + m.tris + " triangles are needles");
  });

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check));
  return { findings, stats: { meshes: meshes.length, triangles: meshes.reduce((s, m) => s + m.tris, 0), size: L } };
}

return { examine, CHECKS, SEVERITY };
})();
