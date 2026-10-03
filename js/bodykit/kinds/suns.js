/* =======================================================================
   BODYKIT · SUNS — one kind of body (see js/bodykit/bodykit.js and
   docs/bodies.md). A classic script loaded after bodykit.js (and after the
   kinds it uses): it registers its builder(s) in BodyKit's KINDS, which
   the groups' table names, and builds with BodyKit's shared blocks.
   ======================================================================= */
(function () {
"use strict";
const { GLSL_BODY, GLSL_NOISE, GLSL_SPHERE_VERTEX, KINDS, blackbody, bodyUniforms, makeBillboard, makeBodyHandle } = BodyKit._;

// =====================================================================
// SUNS
// A star's surface (granulation, sunspots, faculae, limb darkening, color
// from its temperature) and a corona billboard (glow, streamers,
// prominences). Self-lit: the light direction isn't used.
// =====================================================================
const GLSL_SUN = `
uniform vec3 uColor;
uniform float uGran, uSpots, uActivity, uBright, uCorona;
float sunTime(){ return uTime * (0.04 + uActivity * 0.2); }
`;

function sunSurfaceMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: GLSL_SPHERE_VERTEX,
    fragmentShader: GLSL_NOISE + GLSL_BODY + GLSL_SUN + `
      varying vec3 vDir; varying vec3 vWorldPos; varying vec3 vNormalW;
      void main(){
        vec3 p = normalize(vDir);
        float tt = sunTime();
        // granulation: convection cells boiling slowly, plus supergranulation
        float g1 = 1.0 - abs(snoise(p * 34.0 + uSeed + vec3(0.0, tt, 0.0)));
        float g2 = snoise(p * 80.0 + uSeed.zyx - vec3(tt * 1.3));
        float gran = mix(1.0, 0.7 + 0.3 * g1 + 0.08 * g2, uGran);
        float large = fbm(p * 3.0 + uSeed + vec3(tt * 0.3), uOctaves, 0.5);
        // sunspots in two activity belts: dark umbra inside a penumbra
        float belt = smoothstep(0.05, 0.18, abs(p.y)) * (1.0 - smoothstep(0.42, 0.58, abs(p.y)));
        float sn = fbm(p * 4.5 + uSeed.yzx + vec3(tt * 0.08), 4, 0.5) * 0.5 + 0.5;
        float thr = 0.78 - uSpots * 0.2;
        float on = step(0.001, uSpots) * belt;
        float pen = smoothstep(thr, thr + 0.03, sn) * on;
        float umb = smoothstep(thr + 0.05, thr + 0.08, sn) * on;
        // limb darkening (and a redder limb): the disk's edge is cooler
        vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorldPos);
        float mu = clamp(dot(N, V), 0.0, 1.0);
        vec3 col = uColor * uBright * 1.3 * gran * (1.0 + large * 0.12);   // bright: the center goes white
        col *= 0.35 + 0.65 * pow(mu, 0.45);
        col = mix(col, col * vec3(1.0, 0.6, 0.3), pow(1.0 - mu, 1.5) * 0.8);   // cooler, orange limb
        col *= (1.0 - pen * 0.45) * (1.0 - umb * 0.75);
        // faculae: bright patches around the spots, seen near the limb
        float fac = smoothstep(thr - 0.08, thr, sn) * (1.0 - pen) * on * (1.0 - mu);
        col += uColor * fac * 0.5;
        // damage: dark, cooling fissures glowing white-hot inside
        float crack = crackAt(p);
        col = mix(col, col * 0.3, crack * 0.7) + vec3(1.0, 0.95, 0.85) * crack * uDamage * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

const SUN_CORONA_FRAGMENT = GLSL_SUN + `
  void main(){
    float r = length(vQ);
    float a = atan(vQ.y, vQ.x);
    float tt = sunTime();
    vec3 d = vec3(cos(a), sin(a), 0.0);
    // streamers: noise along the angle, drifting outward
    float s1 = snoise(d * 2.2 + vec3(0.0, 0.0, r * 0.5 - tt) + uSeed) * 0.5 + 0.5;
    float s2 = snoise(d * 7.0 + vec3(0.0, 0.0, r * 1.3 - tt * 1.7) + uSeed.zxy) * 0.5 + 0.5;
    float x = max(r - 1.0, 0.0);
    float inner = exp(-x * 9.0);                                          // bright rim above the surface
    float outer = uCorona * (0.45 + s1 * 0.8 + s2 * 0.35) * exp(-x / (0.25 + uCorona * 1.2));
    float halo = 0.3 * uCorona / (1.0 + x * x * 5.0);                    // wide soft glow
    // prominences: bright loops standing on the limb
    float pr = smoothstep(0.62, 0.9, snoise(vec3(d.xy * 5.0, tt * 0.4) + uSeed.yxz) * 0.5 + 0.5);
    float prom = pr * uActivity * exp(-x * 7.0) * smoothstep(0.98, 1.02, r) * (0.6 + s2 * 0.8);
    float fade = 1.0 - smoothstep(uHalfSize * 0.7, uHalfSize, r);        // no hard quad edge
    vec3 col = mix(uColor, vec3(1.0), 0.35) * (inner * 0.9 + outer * 0.8 + halo)
             + vec3(1.0, 0.45, 0.25) * prom * 1.4;
    gl_FragColor = vec4(col * uBright * fade, 1.0);
  }`;

const SPECTRAL = [[30000, "O"], [10000, "B"], [7500, "A"], [6000, "F"], [5200, "G"], [3700, "K"], [0, "M"]];

function buildSun(values, detail) {
  const v = { ...values };
  const U = Object.assign(bodyUniforms(v), {
    uColor: { value: new THREE.Color() }, uGran: { value: 0 }, uSpots: { value: 0 },
    uActivity: { value: 0 }, uBright: { value: 1 }, uCorona: { value: 0 },
  });
  const seg = (n, min) => Math.max(min, Math.round(n * detail));
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, seg(160, 16), seg(80, 8)), sunSurfaceMaterial(U));
  spin.add(surface);
  const corona = makeBillboard(U, 4, SUN_CORONA_FRAGMENT);
  group.add(corona);
  return makeBodyHandle({
    v, U, group, spin, pickMesh: surface,
    apply() {
      blackbody(v.temperature, U.uColor.value);
      U.uGran.value = v.granulation; U.uSpots.value = v.spots; U.uActivity.value = v.activity;
      U.uBright.value = v.brightness; U.uCorona.value = v.corona;
      corona.material.uniforms.uHalfSize.value = 1.3 + v.corona * 5;
    },
    layers: { atmosphere: { objects: [corona] } },
    describe() {
      const cls = SPECTRAL.find((s) => v.temperature >= s[0])[1];
      const lum = v.size * v.size * Math.pow(v.temperature / 5778, 4);
      return [["Temperature", Math.round(v.temperature).toLocaleString("en-US") + " K"],
              ["Spectral class", cls], ["Luminosity (Sun = 1)", lum < 10 ? lum.toFixed(2) : Math.round(lum).toLocaleString("en-US")]];
    },
  });
}

KINDS.sun = buildSun;
Object.assign(BodyKit, { GLSL_SUN });
})();
