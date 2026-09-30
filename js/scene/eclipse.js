import { ctx } from "../core/context.js";
import { SOLAR_BODY_BY_SLOT } from "../world/solarSystem.js";
import { gfxEclipses } from "./graphics.js";

// Eclipses (Setup -> Graphics): a planet between the Sun and a ship, the
// drone or a station puts it in shadow — ships orbiting the planet they're
// eating spend half of every lap on its night side. No shadow maps: the
// Sun is a sphere at the origin and every body a sphere, so each lit
// fragment works out analytically how much of the Sun's disc the bodies
// cover as seen from it (angular sizes and separation: a full shadow in
// the umbra, a soft edge — the penumbra — around it, a small body in front
// of the Sun only dims it). That factor scales the direct light, and the
// environment reflections down to 30 % (ShipKit models get most of their
// light from the environment map — without this a ship in the shadow
// barely changed). Emissive parts (windows, engines) stay lit.
// How it gets into the shaders: every lit built-in material (standard,
// physical, phong, lambert — ShipKit's included) gets an onBeforeCompile
// the first time it's seen, which adds a world-position varying and the
// test, all reading one shared set of uniforms updated here each frame.
// It needs a recompile of each material once, so main.js runs the patching before
// the start-up shader compile. The bodies themselves are BodyKit shaders
// and don't take part (eclipses between planets are rare in this system).
const MAX_OCC = 12;
const U = {
  uEclOcc: { value: [] },      // xyz: centre, w: radius
  uEclCount: { value: 0 },
  uEclSunR: { value: 1 }
};
for(let i = 0; i < MAX_OCC; i++) U.uEclOcc.value.push(new THREE.Vector4());

const VERT_HEAD = "varying vec3 vEclWorld;\n";
const VERT_BODY = `
#ifdef USE_INSTANCING
  vEclWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vEclWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;
const FRAG_HEAD = `
#define ECL_AMBIENT 0.3
varying vec3 vEclWorld;
uniform vec4 uEclOcc[${MAX_OCC}];
uniform int uEclCount;
uniform float uEclSunR;
float eclipseLight(vec3 p){
  float Ls = length(p);
  if(Ls < 1e-3) return 1.0;
  vec3 d = -p / Ls;                       // toward the Sun (at the origin)
  float aSun = uEclSunR / Ls;              // the Sun's angular radius from here
  float lit = 1.0;
  for(int i = 0; i < ${MAX_OCC}; i++){
    if(i >= uEclCount) break;
    vec3 c = uEclOcc[i].xyz - p;
    float t = dot(c, d);
    if(t <= uEclOcc[i].w * 0.5 || t >= Ls) continue;   // behind us (or we're on it), or beyond the Sun
    float sep = length(c - d * t) / t;     // angular distance between the body's and the Sun's centres
    float aOcc = uEclOcc[i].w / t;
    float cover = min(1.0, (aOcc * aOcc) / (aSun * aSun));   // how much of the Sun it can hide at most
    lit *= 1.0 - cover * (1.0 - smoothstep(abs(aOcc - aSun), aOcc + aSun, sep));
  }
  return lit;
}
`;

function inject(shader){
  shader.uniforms.uEclOcc = U.uEclOcc;
  shader.uniforms.uEclCount = U.uEclCount;
  shader.uniforms.uEclSunR = U.uEclSunR;
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace("#include <aomap_fragment>",
    "{ float ecl = eclipseLight(vEclWorld); float amb = mix(ECL_AMBIENT, 1.0, ecl);\n" +
    "  reflectedLight.directDiffuse *= ecl; reflectedLight.directSpecular *= ecl;\n" +
    "  reflectedLight.indirectDiffuse *= amb; reflectedLight.indirectSpecular *= amb; }\n#include <aomap_fragment>");
}

const done = new WeakSet();
// Called with every mesh material each frame (scene/colorManagement.js's
// walk, main.js); patches each one once.
export function patchEclipseMaterial(m){
  if(done.has(m)) return;
  done.add(m);
  if(!(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) || m.isShaderMaterial) return;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = function(shader, renderer){
    if(prev) prev.call(this, shader, renderer);
    inject(shader);
  };
  // the program cache tells shaders apart by this key — keep whatever the
  // material's own hook was part of it
  m.customProgramCacheKey = function(){ return prevKey + "|eclipse1"; };
  m.needsUpdate = true;
}

// Every frame, before rendering: the bodies' positions for the test.
export function updateEclipses(){
  U.uEclSunR.value = SOLAR_BODY_BY_SLOT[0].radius;
  let n = 0;
  if(gfxEclipses()){
    for(let i = 0; i < ctx.planets.length && n < MAX_OCC; i++){
      const b = ctx.planets[i];
      if(b.kind === "sun" || !b.mesh || b.dying) continue;
      U.uEclOcc.value[n++].set(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.radius);
    }
  }
  U.uEclCount.value = n;
}
