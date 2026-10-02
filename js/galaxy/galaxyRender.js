// The Milky Way seen from above, drawn by one fragment shader into its own
// canvas (its own WebGL context, not the game's renderer) — rendered only
// when the view changes. Units are kiloparsecs (1 kpc ≈ 3 262 light years),
// the Galactic Centre at the origin, the Sun's spot at (0, -8.2).
//
// The shape follows the usual picture of our galaxy: a central bar
// (half-length ~4 kpc, 27° to the Sun–centre line) and logarithmic spiral
// arms of pitch 12.5° — the two major arms (Scutum–Centaurus, Perseus)
// leave the bar's ends, two minor ones (Sagittarius–Carina, Norma–Outer)
// lie between them, and the short Orion Spur runs through the Sun's spot.
// What makes it look real:
//   - domain-warped noise breaks the arms into clumps and spurs;
//   - old stars (warm, the bulge, the bar, the smooth disk) vs young ones
//     (blue-white, only in the arms);
//   - dust lanes on the inner edge of every arm and along the bar's leading
//     edges, absorbing more blue than red (reddening), with ridged-noise
//     filaments;
//   - pink HII regions and blue clusters strung along the arms;
//   - resolved stars in three world-space layers that fade in with zoom
//     (no shimmer while zooming), coloured by temperature;
//   - globular clusters in the halo, a bloom around the core, filmic tone
//     mapping, a vignette and dithering against banding.
export const SUN_KPC = { x: 0, y: -8.2 };
export const LY_PER_KPC = 3262;

const VERT = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

const FRAG = `
precision highp float;
uniform vec2 uRes;      // canvas size, device px
uniform vec2 uCenter;   // kpc at the canvas centre
uniform float uScale;   // kpc per device px
uniform float uDpr;     // device px per CSS px (star sizes)
#define PI 3.14159265
#define TAU 6.28318531
const float K = 0.2217;      // tan(12.5°): the arms' pitch
const float SINP = 0.2164;   // sin(12.5°)

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 6; i++){ s += a * noise(p); p = M * p; a *= 0.5; } return s; }
float ridged(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ float n = 1.0 - abs(noise(p) * 2.0 - 1.0); s += a * n * n; p = M * p; a *= 0.5; } return s; }

// One logarithmic arm: starts at radius r0, angle th0, fades out by rEnd.
float arm(float r, float th, float th0, float r0, float w, float rEnd){
  float ta = th0 + log(max(r, 0.01) / r0) / K;
  float d = mod(th - ta + PI, TAU) - PI;
  float dist = abs(d) * r * SINP;              // distance across the arm
  return exp(-dist * dist / (w * w)) * smoothstep(r0 * 0.8, r0 * 1.12, r) * (1.0 - smoothstep(rEnd * 0.7, rEnd, r));
}
// The Orion Spur: a short arm segment through the Sun's spot.
float spur(float r, float th, float w){
  float ta = -1.5708 + log(max(r, 0.01) / 8.25) / 0.176;   // pitch ~10°
  float d = mod(th - ta + PI, TAU) - PI;
  float dist = abs(d) * r * 0.17;
  float along = mod(th + 1.5708 - 0.05 + PI, TAU) - PI;   // angle from the Sun's side
  return exp(-dist * dist / (w * w)) * exp(-along * along / 0.09);
}
float arms(vec2 q, float w){
  float r = length(q), th = atan(q.y, q.x);
  return arm(r, th, 1.0996, 4.6, w, 16.5)            // Perseus (the bar's far end, 63°)
       + arm(r, th, -2.0420, 4.6, w, 18.0)           // Scutum–Centaurus (the near end, -117°)
       + 0.62 * arm(r, th, 2.9496, 4.6, w * 0.85, 12.5)   // Sagittarius–Carina
       + 0.55 * arm(r, th, -0.1920, 4.6, w * 0.85, 16.0)  // Norma–Outer
       + 0.45 * spur(r, th, w * 0.75);
}

// Resolved stars of one world-space layer (cell size in kpc), faded in once
// the cells are big enough on screen.
vec3 starLayer(vec2 p, float cell, float dens){
  float cellPx = cell / uScale / uDpr;
  float fade = smoothstep(5.0, 14.0, cellPx);
  if(fade <= 0.0) return vec3(0.0);
  vec2 c = floor(p / cell);
  if(hash(c + 1.3) > dens) return vec3(0.0);
  vec2 sp = (c + 0.15 + 0.7 * vec2(hash(c), hash(c + 3.1))) * cell;
  float d = length(p - sp) / uScale / uDpr;        // CSS px from the star
  float b = pow(hash(c + 7.7), 5.0);
  float rad = 0.55 + 1.5 * b;
  float s = exp(-d * d / (rad * rad)) * (0.25 + 3.0 * b);
  vec3 tint = mix(vec3(1.0, 0.72, 0.48), vec3(0.72, 0.82, 1.0), hash(c + 9.2));
  return tint * s * fade;
}

// Soft blobs (HII regions, star clusters): at most one per cell, where the
// arms are; ragged edges from noise. size in kpc.
float blobs(vec2 p, float cell, float prob, float size, float seed){
  vec2 c = floor(p / cell);
  if(hash(c + seed) > prob) return 0.0;
  vec2 bp = (c + 0.3 + 0.4 * vec2(hash(c + seed + 1.7), hash(c + seed + 4.3))) * cell;
  float rad = size * (0.5 + hash(c + seed + 8.1));
  vec2 d = (p - bp) / rad;
  float rag = 0.65 + 0.7 * noise(p / rad * 1.3 + seed);
  return exp(-dot(d, d) * 1.6 / rag) * (0.5 + hash(c + seed + 2.9));
}

void main(){
  vec2 px = gl_FragCoord.xy - uRes * 0.5;
  vec2 p = uCenter + px * uScale;
  float r = length(p);

  // clumpy arms: the position is warped by noise first
  vec2 w = vec2(fbm(p * 0.32 + 1.7), fbm(p * 0.32 + 8.3)) - 0.5;
  vec2 w2 = vec2(fbm(p * 1.1 + 4.4), fbm(p * 1.1 + 9.9)) - 0.5;
  vec2 q = p + w * 1.9 + w2 * 0.45;                  // big bends + feathery edges
  float armCore = arms(q, 0.5);
  float armWide = arms(p + w * 0.9, 2.1);
  float clump = fbm(p * 1.25 + 3.1);
  float env = exp(-r / 7.5);

  // old stars: bulge, bar, smooth disk
  float bulge = exp(-r * r / 0.45) + 0.18 * exp(-r / 1.0);
  vec2 b = mat2(0.4540, -0.8910, 0.8910, 0.4540) * p;   // into the bar's frame (63°)
  float bar = exp(-(pow(abs(b.x) / 4.2, 3.0) + pow(abs(b.y) / 1.05, 2.2)));
  float disk = exp(-r / 3.3) * (1.0 - smoothstep(12.0, 18.0, r));
  float diskFaint = exp(-r / 6.0) * (1.0 - smoothstep(15.0, 23.0, r));

  vec3 col = vec3(1.0, 0.80, 0.56) * (bulge * 3.0 + bar * 2.4);
  col += vec3(0.95, 0.84, 0.70) * disk * 0.6 + vec3(0.55, 0.60, 0.78) * diskFaint * 0.08;

  // young stars: blue-white, only in the arms
  float armTex = armCore * (0.12 + 2.6 * pow(clump, 2.4));
  // unresolved stars: sub-pixel texture far out, faded once real stars resolve
  float grain = (pow(noise(p * 38.0), 5.0) + 0.6 * pow(noise(p * 90.0 + 3.0), 6.0)) * smoothstep(0.004, 0.016, uScale * uDpr);
  col += vec3(0.56, 0.73, 1.0) * armTex * env * (2.1 + 5.0 * grain);
  col += vec3(0.40, 0.52, 0.90) * armWide * env * 0.42;

  // dust: inner edges of the arms + the bar's leading edges, filamentary
  float dust = arms(q * 1.07, 0.34) * (0.35 + ridged(p * 2.2));
  float lane = exp(-pow((b.y - 0.75 * sign(b.x)) / 0.22, 2.0)) * smoothstep(4.4, 1.6, abs(b.x)) * smoothstep(1.0, 2.0, abs(b.x));
  dust += lane * 0.6;
  dust *= smoothstep(0.3, 0.62, fbm(p * 0.8 + 20.0)) * 1.7;   // patchy, not an outline
  dust *= (0.55 + 0.8 * ridged(p * 3.1 + 7.0)) * (1.0 - smoothstep(9.0, 17.0, r));
  col *= exp(-dust * vec3(1.5, 1.95, 2.6));          // blue goes first: reddening

  // star-forming knots (HII, pink) and young clusters (blue) along the arms
  float onArm = clamp(armCore, 0.0, 1.0) * env;
  col += vec3(1.0, 0.32, 0.52) * (1.4 * blobs(p, 0.8, onArm * 0.8, 0.13, 21.0) + blobs(p, 0.32, onArm * 0.9, 0.05, 1.0) + blobs(p, 0.11, onArm * 0.8, 0.02, 7.0)) * onArm * 3.0;
  col += vec3(0.72, 0.86, 1.0) * blobs(p, 0.2, onArm * 0.7, 0.025, 13.0) * onArm * 2.2;

  // resolved stars, denser where the galaxy is bright
  float dens = clamp(disk * 0.7 + armCore * 0.6 + diskFaint * 0.25 + 0.015, 0.0, 0.95);
  col += starLayer(p, 0.9, dens * 0.35 + 0.02) * 0.45;
  col += starLayer(p, 0.28, dens) * 0.7;
  col += starLayer(p, 0.09, dens) * 0.55;
  col += starLayer(p, 0.03, dens) * 0.45;

  // globular clusters in the halo
  vec2 gc = floor(p / 2.4);
  if(hash(gc + 5.5) < 0.11 && length((gc + 0.5) * 2.4) < 19.0 && length((gc + 0.5) * 2.4 - vec2(0.0, -8.2)) > 2.0){
    vec2 gp = (gc + 0.3 + 0.4 * vec2(hash(gc + 2.2), hash(gc + 6.6))) * 2.4;
    col += vec3(1.0, 0.85, 0.65) * exp(-dot(p - gp, p - gp) / 0.006) * 1.4;
  }

  // bloom around the core, a faint halo, the sky
  col += vec3(1.0, 0.78, 0.5) * exp(-r * r / 4.0) * 0.25;
  col += vec3(0.25, 0.3, 0.5) * exp(-r / 9.0) * 0.05;
  col += vec3(0.004, 0.006, 0.014);

  col = 1.0 - exp(-col * 1.3);                      // filmic-ish tone mapping
  col = pow(col, vec3(0.85));
  float v = length(px / uRes);
  col *= 1.0 - 0.45 * v * v;                         // vignette
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;      // dithering
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// view: { cx, cy (kpc at the centre), kpcPerPx (per layout px of the canvas) }
export function createGalaxyRenderer(canvas){
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if(!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one full-screen triangle
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  ["uRes", "uCenter", "uScale", "uDpr"].forEach(function(n){ u[n] = gl.getUniformLocation(prog, n); });

  return {
    render: function(view){
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
      if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform2f(u.uCenter, view.cx, view.cy);
      // kpcPerPx is per layout px; the canvas may sit in a CSS-scaled box
      const layoutW = canvas.clientWidth || rect.width;
      gl.uniform1f(u.uScale, view.kpcPerPx * layoutW / w);
      gl.uniform1f(u.uDpr, w / layoutW);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
