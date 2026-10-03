/* =======================================================================
   SURFACEKIT — the ground of a planet, landing sites and bases
   =======================================================================
   A classic script (window.SurfaceKit) like the other kits; the surface
   lab (surface.html) uses it, the game reads the bases (their markers on
   the planets). Needs THREE and window.BodyKit. docs/surface.md.

   Scale: the ground is not to scale — a planet of BodyKit `size` 1 (one
   Earth radius) is 8 km in radius on the ground (M_PER_SIZE), ~50 km round,
   so half a planet is a few minutes away and a hop does the rest.

   The ground is a cube-sphere: six faces (FACES), each cut into T×T tiles
   of ~1.1 km; a tile is a GRID×GRID mesh whose heights and sea / ice come
   from BodyKit.planetTerrain (the planet's own GLSL, sampled on the GPU),
   so it is the same place the globe shows. Tiles load around the player
   and unload behind. Directions are the body's own frame (the globe's
   surfaceRoot): +Y the north pole, lat/lon from it.

   API
     createSurface(renderer, ref, values?) → surface (ref "groupId/bodyId",
                                        a planet group) or null
       .R                               radius in metres
       .root                            THREE.Group: the tiles (planet centre at 0)
       .material                        the ground's material (groundMaterial: two suns,
                                        ambient, haze, wet / snow cover, the craft's lamp)
       .update(dir, maxLoads)           load tiles around a unit direction
       .ensure(dir)                     load the tiles under dir right now
       .groundAt(dir)                   { r: radius in m, sea, ice, kind } or null (not loaded);
                                        kind: "water" (open), "lava", "ice" (frozen sea,
                                        an ice cap or sheet) or "ground"
       .meshes                          the loaded tiles (raycasting)
       .dispose()
     latLonToDir(lat, lon), dirToLatLon(dir), tangentFrame(dir) → { east, north }
     offsetDir(dir, eastM, northM, R)   a direction eastM/northM metres away
     greatCircle(a, b, R)               metres between two directions
     bases: load(), save(all), get(ref), put(ref, base), remove(ref)
       localStorage "roj-bases": { [ref]: { name, lat, lon, created,
         modules: [{ type, e, n, rot, start, dur }] } } (e/n: metres from the
         base's centre, east/north; start/dur: ms — progress from the clock)
     makeMarker(color, size)            a constant-size diamond sprite (globe markers)
   ======================================================================= */
window.SurfaceKit = (function () {
"use strict";
const BK = window.BodyKit;
const M_PER_SIZE = 8000, TILE_TARGET = 1100, GRID = 65;
const DETAIL_WAVE = 140;                        // metres: the fine roughness' wavelength
const FACES = [
  { axis: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { axis: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { axis: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { axis: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { axis: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { axis: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
].map((f) => ({ axis: new THREE.Vector3(...f.axis), u: new THREE.Vector3(...f.u), v: new THREE.Vector3(...f.v) }));
const Q = Math.PI / 4;

// ---------- the cube-sphere (equal-angle) ----------
function faceOf(d) {
  let best = 0, bd = -2;
  for (let i = 0; i < 6; i++) { const k = d.dot(FACES[i].axis); if (k > bd) { bd = k; best = i; } }
  return best;
}
function dirToFaceUV(d, out) {
  const f = faceOf(d), F = FACES[f], a = d.dot(F.axis);
  out.f = f; out.x = Math.atan(d.dot(F.u) / a) / Q; out.y = Math.atan(d.dot(F.v) / a) / Q;
  return out;
}
function faceUVToDir(f, x, y, out) {
  const F = FACES[f];
  return out.copy(F.axis).addScaledVector(F.u, Math.tan(x * Q)).addScaledVector(F.v, Math.tan(y * Q)).normalize();
}

// ---------- directions, lat / lon ----------
function latLonToDir(lat, lon, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(lat), b = THREE.MathUtils.degToRad(lon);
  return out.set(Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b));
}
function dirToLatLon(d) {
  return { lat: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, d.y)))), lon: THREE.MathUtils.radToDeg(Math.atan2(d.z, d.x)) };
}
const POLE = new THREE.Vector3(0, 1, 0), ALT = new THREE.Vector3(1, 0, 0);
function tangentFrame(d) {
  const east = new THREE.Vector3().crossVectors(Math.abs(d.y) > 0.999 ? ALT : POLE, d).normalize();
  const north = new THREE.Vector3().crossVectors(d, east).normalize();
  return { east, north };
}
function offsetDir(d, e, n, R, out = new THREE.Vector3()) {
  const { east, north } = tangentFrame(d);
  return out.copy(d).multiplyScalar(R).addScaledVector(east, e).addScaledVector(north, n).normalize();
}
function greatCircle(a, b, R) { return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * R; }

// ---------- the surface ----------
function createSurface(renderer, ref, values) {
  const [gid, bid] = ref.split("/");
  const terrain = BK.planetTerrain(gid, bid, values);
  if (!terrain) return null;
  const v = terrain.values;
  const R = Math.max(0.15, v.size) * M_PER_SIZE;
  const T = Math.max(2, Math.ceil((Math.PI / 2 * R) / TILE_TARGET));
  const reliefM = v.mountains * R;                 // metres per unit of the planet's height
  const detailM = 2.5 + 4 * Math.max(v.airless || 0, v.rust || 0, v.lava || 0);
  const material = groundMaterial(terrain, R);
  const root = new THREE.Group();
  const tiles = new Map(), meshes = [];
  const uv = { f: 0, x: 0, y: 0 }, tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const seaWorld = v.sea > -0.599 && !(v.airless >= 0.5);

  // the ground's radius at a sample: sea / lava / frozen sea flat at R, land lifted
  function radiusOf(h, det, sea) {
    if (sea && seaWorld) return R;
    return R + Math.max(h - v.sea, 0) * reliefM + det * detailM;
  }

  function buildTile(f, i, j) {
    const n = GRID + 2, step = 2 / T / (GRID - 1);
    const uv0x = -1 + 2 * i / T - step, uv0y = -1 + 2 * j / T - step;
    const s = terrain.sample(renderer, FACES[f], uv0x, uv0y, step, n, R / DETAIL_WAVE);
    // positions with a 1-sample border (for normals), radii and flags
    const P = new Float32Array(n * n * 3), rad = new Float32Array(GRID * GRID), sea = new Uint8Array(GRID * GRID), ice = new Uint8Array(GRID * GRID);
    const dirs = new Float32Array(GRID * GRID * 3), hs = new Float32Array(GRID * GRID);
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const k = b * n + a;
      faceUVToDir(f, uv0x + a * step, uv0y + b * step, tmpA);
      const r = radiusOf(s.h[k], s.d[k], s.sea[k]);
      P[k * 3] = tmpA.x * r; P[k * 3 + 1] = tmpA.y * r; P[k * 3 + 2] = tmpA.z * r;
      if (a > 0 && b > 0 && a <= GRID && b <= GRID) {
        const q = (b - 1) * GRID + (a - 1);
        rad[q] = r; sea[q] = s.sea[k] && seaWorld ? 1 : 0; ice[q] = s.ice[k]; hs[q] = s.h[k];
        dirs[q * 3] = tmpA.x; dirs[q * 3 + 1] = tmpA.y; dirs[q * 3 + 2] = tmpA.z;
      }
    }
    // the tile's centre, the mesh around it (precision)
    const c = (GRID >> 1) + 1, ck = (c * n + c) * 3;
    const center = new THREE.Vector3(P[ck], P[ck + 1], P[ck + 2]);
    const pos = new Float32Array(GRID * GRID * 3), nor = new Float32Array(GRID * GRID * 3);
    const at = (a, b, o) => o.set(P[(b * n + a) * 3], P[(b * n + a) * 3 + 1], P[(b * n + a) * 3 + 2]);
    const dx = new THREE.Vector3(), dy = new THREE.Vector3(), nn = new THREE.Vector3(), p0 = new THREE.Vector3();
    for (let b = 1; b <= GRID; b++) for (let a = 1; a <= GRID; a++) {
      const q = (b - 1) * GRID + (a - 1);
      at(a, b, p0);
      pos[q * 3] = p0.x - center.x; pos[q * 3 + 1] = p0.y - center.y; pos[q * 3 + 2] = p0.z - center.z;
      dx.subVectors(at(a + 1, b, tmpA), at(a - 1, b, tmpB));
      dy.subVectors(at(a, b + 1, tmpA), at(a, b - 1, tmpB));
      nn.crossVectors(dx, dy).normalize();
      if (nn.dot(p0) < 0) nn.negate();
      nor[q * 3] = nn.x; nor[q * 3 + 1] = nn.y; nor[q * 3 + 2] = nn.z;
    }
    const idx = [];
    for (let b = 0; b < GRID - 1; b++) for (let a = 0; a < GRID - 1; a++) {
      const q = b * GRID + a;
      idx.push(q, q + 1, q + GRID, q + 1, q + GRID + 1, q + GRID);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
    g.setAttribute("aH", new THREE.BufferAttribute(hs, 1));
    g.setIndex(idx);
    // winding: the first triangle's normal must point out
    tmpA.fromArray(pos, 0); tmpB.fromArray(pos, 3); const c3 = new THREE.Vector3().fromArray(pos, GRID * 3);
    const tn = new THREE.Vector3().crossVectors(tmpB.sub(tmpA), c3.sub(tmpA));
    if (tn.dot(center) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); }
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.copy(center);
    mesh.receiveShadow = true;
    mesh.userData.tile = true;
    return { f, i, j, mesh, rad, sea, ice, uv0x: uv0x + step, uv0y: uv0y + step, step };
  }

  const key = (f, i, j) => f * 1e6 + i * 1000 + j;
  function tileOf(d) {
    dirToFaceUV(d, uv);
    const i = Math.min(T - 1, Math.max(0, Math.floor((uv.x + 1) / 2 * T))), j = Math.min(T - 1, Math.max(0, Math.floor((uv.y + 1) / 2 * T)));
    return { f: uv.f, i, j, k: key(uv.f, i, j), x: uv.x, y: uv.y };
  }
  function load(t) {
    if (tiles.has(t.k)) return tiles.get(t.k);
    const tile = buildTile(t.f, t.i, t.j);
    tiles.set(t.k, tile); root.add(tile.mesh); meshes.push(tile.mesh);
    return tile;
  }
  function unload(k) {
    const tile = tiles.get(k); if (!tile) return;
    root.remove(tile.mesh); tile.mesh.geometry.dispose();
    meshes.splice(meshes.indexOf(tile.mesh), 1); tiles.delete(k);
  }
  const tileAngle = Math.PI / 2 / T, RING = 2;
  const nd = new THREE.Vector3();
  // the tiles within RING tiles of d, nearest first. Sampled every third of a
  // tile: towards a face's edges and corners the tiles are narrower than
  // tileAngle, and a whole-tile step would jump right over one.
  const SUB = 3;
  function wanted(d) {
    const { east, north } = tangentFrame(d), out = new Map(), st = tileAngle / SUB;
    for (let a = -RING * SUB; a <= RING * SUB; a++) for (let b = -RING * SUB; b <= RING * SUB; b++) {
      nd.copy(d).addScaledVector(east, a * st).addScaledVector(north, b * st).normalize();
      const t = tileOf(nd), dist = a * a + b * b;
      const had = out.get(t.k);
      if (!had) out.set(t.k, Object.assign(t, { dist })); else if (dist < had.dist) had.dist = dist;
    }
    return [...out.values()].sort((x, y) => x.dist - y.dist);
  }
  return {
    R, T, root, material, meshes, values: v, reliefM,
    update(d, maxLoads = 1) {
      const want = wanted(d);
      let loads = 0;
      for (const t of want) { if (!tiles.has(t.k)) { if (loads++ >= maxLoads) break; load(t); } }
      const keep = new Set(want.map((t) => t.k));
      if (tiles.size > want.length + 12) for (const k of [...tiles.keys()]) if (!keep.has(k)) unload(k);
    },
    ensure(d) { load(tileOf(d)); },
    groundAt(d) {
      const t = tileOf(d), tile = tiles.get(t.k);
      if (!tile) return null;
      const fx = (t.x - tile.uv0x) / tile.step, fy = (t.y - tile.uv0y) / tile.step;
      const a = Math.max(0, Math.min(GRID - 1.001, fx)), b = Math.max(0, Math.min(GRID - 1.001, fy));
      const a0 = Math.floor(a), b0 = Math.floor(b), ta = a - a0, tb = b - b0, q = b0 * GRID + a0;
      const r = (tile.rad[q] * (1 - ta) + tile.rad[q + 1] * ta) * (1 - tb) + (tile.rad[q + GRID] * (1 - ta) + tile.rad[q + GRID + 1] * ta) * tb;
      const n = Math.round(b) * GRID + Math.round(a), isSea = !!tile.sea[n], isIce = !!tile.ice[n];
      // what's underfoot: a lava world's "sea" is lava, a frozen world's is ice
      const kind = isSea ? ((v.lava || 0) >= 0.5 ? "lava" : (v.frozen || 0) >= 0.5 || isIce ? "ice" : "water") : isIce ? "ice" : "ground";
      return { r, sea: isSea, ice: isIce, kind };
    },
    loadedCount: () => tiles.size,
    dispose() { for (const k of [...tiles.keys()]) unload(k); material.dispose(); terrain.dispose(); },
  };
}

// ---------- the ground's material ----------
// The planet's own colours (BodyKit's planetSurface(), the globe's GLSL) lit
// the surface's way: up to two suns (uSunDir0/1, uSunCol0/1 — colour ×
// strength, black when set), an ambient colour (sky + starlight), haze in the
// sky's colour, weather (uWet darkens and polishes the ground, uSnow covers
// what's level enough) and a lamp (a cone from uLampPos along uLampDir).
// The sky / weather code sets these every frame.
const GROUND_FRAG = `
uniform vec3 uSunDir0, uSunDir1, uSunCol0, uSunCol1, uAmbient, uFogColor, uLampPos, uLampDir;
uniform float uFog, uGrainFreq, uWet, uSnow, uLamp;
varying vec3 vDir; varying float vH; varying vec3 vNormalW; varying vec3 vWorldPos;
void main(){
  vec3 p = normalize(vDir);
  vec3 col, emit; float water, ice;
  planetSurface(p, vH, col, emit, water, ice);
  // close up: grain and pebbles (the globe's colour is a whole region's)
  float g = snoise(p * uGrainFreq) * 0.5 + snoise(p * uGrainFreq * 3.7) * 0.25;
  col *= 1.0 + g * 0.12 * (1.0 - water);
  vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorldPos);
  // snow settles on level ground first, never on open water or lava
  float level = dot(N, p);
  float snow = uSnow * smoothstep(0.80, 0.95, level + g * 0.08) * (1.0 - water * (1.0 - ice)) * (1.0 - uLava * 0.9);
  col = mix(col, vec3(0.9, 0.93, 0.98), snow);
  emit *= 1.0 - snow;
  float wet = uWet * (1.0 - snow) * (1.0 - water);
  col *= 1.0 - wet * 0.38;
  float shine = max(water * (1.0 - ice) * (1.0 - uLava), wet * 0.7);
  vec3 lit = col * uAmbient + emit;
  vec3 L0 = normalize(uSunDir0), L1 = normalize(uSunDir1);
  lit += col * uSunCol0 * max(dot(N, L0), 0.0) * 1.1 + uSunCol0 * shine * pow(max(dot(N, normalize(L0 + V)), 0.0), 60.0) * 0.8;
  lit += col * uSunCol1 * max(dot(N, L1), 0.0) * 1.1 + uSunCol1 * shine * pow(max(dot(N, normalize(L1 + V)), 0.0), 60.0) * 0.8;
  // the lamp: a soft cone, fading with distance
  vec3 toL = uLampPos - vWorldPos; float dl = length(toL); toL /= dl;
  float cone = smoothstep(0.80, 0.95, dot(-toL, normalize(uLampDir)));
  lit += col * vec3(1.0, 0.94, 0.82) * uLamp * cone * max(dot(N, toL), 0.0) / (1.0 + dl * dl * 0.0004);
  float dist = length(cameraPosition - vWorldPos);
  lit = mix(lit, uFogColor, 1.0 - exp(-dist * uFog));
  gl_FragColor = vec4(lit, 1.0);
}`;
const GROUND_VERT = `
attribute vec3 aDir; attribute float aH;
varying vec3 vDir; varying float vH; varying vec3 vNormalW; varying vec3 vWorldPos;
void main(){
  vDir = aDir; vH = aH;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
function groundMaterial(terrain, R) {
  const v3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) }), col = (c) => ({ value: new THREE.Color(c) });
  const U = Object.assign({}, terrain.U, {
    uSunDir0: v3(0, 1, 0), uSunDir1: v3(0, 1, 0), uSunCol0: col(0xffffff), uSunCol1: col(0x000000),
    uAmbient: col(0x0d0f14), uFogColor: col(0x000000), uFog: { value: 0 }, uGrainFreq: { value: R / 6 },
    uWet: { value: 0 }, uSnow: { value: 0 }, uLamp: { value: 0 }, uLampPos: v3(0, 0, 0), uLampDir: v3(0, 0, 1),
  });
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: GROUND_VERT,
    fragmentShader: BK.GLSL_NOISE + BK.GLSL_BODY + BK.GLSL_PLANET + BK.GLSL_PLANET_SURFACE + GROUND_FRAG });
}

// ---------- bases (this browser only for now) ----------
const KEY = "roj-bases";
const bases = {
  load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } },
  save(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ } },
  get(ref) { return bases.load()[ref] || null; },
  put(ref, base) { const all = bases.load(); all[ref] = base; bases.save(all); },
  remove(ref) { const all = bases.load(); delete all[ref]; bases.save(all); },
};

// ---------- a marker: a diamond of constant screen size ----------
function makeMarker(color = 0xf8bb56, size = 0.035) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(0.4, "rgba(255,255,255,0.25)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.beginPath(); g.moveTo(32, 12); g.lineTo(46, 32); g.lineTo(32, 52); g.lineTo(18, 32); g.closePath();
  g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.6)"; g.stroke();
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, depthTest: true, depthWrite: false, transparent: true, sizeAttenuation: false }));
  s.scale.setScalar(size); s.renderOrder = 5;
  return s;
}

return { M_PER_SIZE, createSurface, latLonToDir, dirToLatLon, tangentFrame, offsetDir, greatCircle, bases, makeMarker,
         _faces: { dirToFaceUV, faceUVToDir } };
})();
