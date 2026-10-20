/**
 * GLSL for the two GPU passes.
 *
 * 1. BAKE: sums every spherical wave at every voxel of an N³ grid and writes
 *    the result into a 3D texture, one layer per draw. This is the "compute
 *    shader on a Texture3D" pattern, done with a fragment shader because
 *    WebGL2 has no compute stage.
 *
 *      r  intensity I / (1 + I), with I normalised so the field's 98.5th percentile is 1
 *      g  ½ + ½ cos φ         (phase of the coherent sum)
 *      b  ½ + ½ sin φ
 *      a  R / (1 + R), where R = |Σψ|² / Σ|ψᵢ|² is the coherent intensity over
 *         what the same waves would give if they could not interfere. R = 1
 *         (a = ½) means no net interference; above is a bright fringe, below a
 *         dark one. The 1/r falloff cancels in the ratio, so the pattern reads
 *         the same near the strokes and far from them.
 *
 * 2. MARCH: a ray per pixel through the box [-1, 1]³, reading the texture.
 *    Three ways to turn the numbers into a picture: emission–absorption volume,
 *    an isosurface found by stepping and bisecting, or the wavefronts
 *    (surfaces of constant phase) as stacked translucent shells.
 */

export const FULLSCREEN_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BAKE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uSrc;   // row 0: x, y, z, amp   row 1: k, phase, group, 0
uniform int uCount;
uniform float uN;
uniform float uZ;
uniform float uInvScale;
uniform float uSoften;
out vec4 o;

void main() {
  vec3 p = vec3(gl_FragCoord.xy / uN * 2.0 - 1.0, uZ);
  float I = 0.0, ar = 0.0, ai = 0.0, tr = 0.0, ti = 0.0, m2 = 0.0;
  float g = -1.0;
  for (int i = 0; i < uCount; i++) {
    vec4 a = texelFetch(uSrc, ivec2(i, 0), 0);
    vec4 b = texelFetch(uSrc, ivec2(i, 1), 0);
    if (b.z != g) { I += ar * ar + ai * ai; ar = 0.0; ai = 0.0; g = b.z; }
    float r = length(p - a.xyz);
    float ph = b.x * r + b.y;
    float m = a.w / (r + uSoften);
    float re = m * cos(ph), im = m * sin(ph);
    ar += re; ai += im; tr += re; ti += im; m2 += m * m;
  }
  I += ar * ar + ai * ai;
  float R = I / max(m2, 1e-12);
  float In = I * uInvScale;
  float mag = max(length(vec2(tr, ti)), 1e-12);
  o = vec4(In / (1.0 + In), 0.5 + 0.5 * tr / mag, 0.5 + 0.5 * ti / mag, R / (1.0 + R));
}`;

export const MARCH_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uVol;
uniform vec2 uRes;
uniform vec3 uEye, uFwd, uRight, uUp;
uniform float uTan, uAspect;
uniform int uMode;        // 0 volume, 1 surface, 2 wavefronts
uniform int uColorBy;     // 0 phase, 1 fringe, 2 height
uniform vec3 uPa, uPb, uPc, uPd;
uniform float uThreshold; // the level that counts as "inside"
uniform float uDensity;
uniform float uExposure;
uniform float uReach;     // how far from the strokes shapes extend
uniform float uN;         // grid size, for the step length
uniform float uPaper;     // 1 on the light background
uniform vec3 uBg;
uniform float uFrame;
out vec4 o;

const float TAU = 6.28318530718;
vec3 pal(float t) { return uPa + uPb * cos(TAU * (uPc * t + uPd)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }

vec4 S(vec3 p) { return texture(uVol, p * 0.5 + 0.5); }
float intensity(vec4 s) { return s.r / max(1.0 - s.r, 1e-3); }
float phaseOf(vec4 s) { return atan(s.b - 0.5, s.g - 0.5); }
/* The shape field: fringe visibility, faded out where the waves are too weak to matter. */
float F(vec4 s) { return s.a * (1.0 - exp(-intensity(s) * uExposure / uReach)); }
float Fp(vec3 p) { return F(S(p)); }

vec3 gradF(vec3 p) {
  float e = 1.2 / uN;
  return vec3(
    Fp(p + vec3(e, 0, 0)) - Fp(p - vec3(e, 0, 0)),
    Fp(p + vec3(0, e, 0)) - Fp(p - vec3(0, e, 0)),
    Fp(p + vec3(0, 0, e)) - Fp(p - vec3(0, 0, e)));
}

float colorT(vec4 s, vec3 p) {
  if (uColorBy == 0) return phaseOf(s) / TAU + 0.5;
  if (uColorBy == 1) return F(s);
  return p.y * 0.5 + 0.5;
}

vec3 background(vec2 uv) {
  float v = 1.0 - 0.18 * dot(uv, uv);
  return uBg * mix(1.0, v, 1.0 - uPaper * 0.6);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uv.x * uTan * uAspect * uRight + uv.y * uTan * uUp);
  vec3 ro = uEye;
  vec3 bg = background(uv);

  vec3 inv = 1.0 / rd;
  vec3 t0 = (-1.0 - ro) * inv, t1 = (1.0 - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf <= max(tn, 0.0)) { o = vec4(bg, 1.0); return; }
  tn = max(tn, 0.0) + 1e-4;

  float dt = 1.6 / uN;
  float jit = hash(gl_FragCoord.xy);
  vec3 L = normalize(vec3(0.45, 0.8, 0.35));

  if (uMode == 0) {
    /* Emission–absorption. On the dark ground the field glows; on paper it is ink. */
    vec3 C = vec3(0.0), T = vec3(1.0);
    float t = tn + dt * jit;
    for (int i = 0; i < 600; i++) {
      if (t > tf) break;
      vec3 p = ro + rd * t;
      vec4 s = S(p);
      float f = F(s);
      float d = uDensity * 14.0 * smoothstep(uThreshold - 0.12, uThreshold + 0.12, f) * f;
      if (d > 1e-4) {
        vec3 col = pal(colorT(s, p));
        if (uPaper > 0.5) {
          T *= exp(-d * dt * (1.15 - col) * 1.6);
        } else {
          float a = 1.0 - exp(-d * dt);
          C += T * a * col * 1.1;
          T *= 1.0 - a;
        }
        if (max(T.r, max(T.g, T.b)) < 0.01) break;
      }
      t += dt;
    }
    vec3 col = uPaper > 0.5 ? bg * T : C + bg * T;
    if (uPaper < 0.5) col = 1.0 - exp(-col * 1.1);
    o = vec4(col, 1.0);
    return;
  }

  if (uMode == 1) {
    /* Isosurface F = threshold. A ray that enters the box already inside shows the cut face. */
    vec4 s0 = S(ro + rd * tn);
    if (F(s0) > uThreshold) {
      vec3 p = ro + rd * tn;
      vec3 q = abs(p);
      vec3 n = q.x > q.y && q.x > q.z ? vec3(sign(p.x), 0, 0) : q.y > q.z ? vec3(0, sign(p.y), 0) : vec3(0, 0, sign(p.z));
      vec3 base = pal(colorT(s0, p));
      float shade = 0.55 + 0.35 * max(dot(n, L), 0.0);
      float stripe = 0.85 + 0.15 * smoothstep(0.0, 0.08, F(s0) - uThreshold);
      o = vec4(mix(bg, base * shade * stripe, 0.96), 1.0);
      return;
    }
    float t = tn + dt * jit, prevT = tn, prevF = F(s0);
    for (int i = 0; i < 600; i++) {
      if (t > tf) break;
      vec3 p = ro + rd * t;
      float f = Fp(p);
      if (f > uThreshold) {
        float a = prevT, b = t;
        for (int k = 0; k < 6; k++) {
          float m = 0.5 * (a + b);
          if (Fp(ro + rd * m) > uThreshold) b = m; else a = m;
        }
        p = ro + rd * b;
        vec4 s = S(p);
        vec3 n = -normalize(gradF(p) + 1e-6);
        float dif = max(dot(n, L), 0.0);
        float back = max(dot(n, -L), 0.0);
        float ao = clamp(0.35 + 0.65 * (1.0 - (Fp(p + n * 0.06) - uThreshold) * 2.5), 0.0, 1.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 h = normalize(L - rd);
        float spec = pow(max(dot(n, h), 0.0), 48.0);
        vec3 base = pal(colorT(s, p));
        vec3 col = base * (0.16 + 0.78 * dif + 0.12 * back) * ao + spec * 0.35 + fres * (uPaper > 0.5 ? -0.15 : 0.25) * base;
        o = vec4(col, 1.0);
        return;
      }
      prevT = t; prevF = f;
      t += dt;
    }
    o = vec4(bg, 1.0);
    return;
  }

  /* Wavefronts: wherever the phase passes through 0, lay down a thin shell,
     as opaque as the wave is strong there. Dark fringes punch holes through. */
  vec3 C = vec3(0.0);
  float T = 1.0;
  float t = tn + dt * jit;
  vec4 sp = S(ro + rd * t);
  float prevIm = sp.b - 0.5;
  for (int i = 0; i < 600; i++) {
    t += dt;
    if (t > tf) break;
    vec3 p = ro + rd * t;
    vec4 s = S(p);
    float im = s.b - 0.5;
    if (prevIm < 0.0 && im >= 0.0 && s.g > 0.5) {
      float f = F(s);
      float strength = 1.0 - exp(-intensity(s) * uExposure / uReach);
      float a = uDensity * strength * smoothstep(uThreshold - 0.2, uThreshold + 0.1, s.a);
      if (a > 0.002) {
        vec3 base = pal(uColorBy == 0 ? f : colorT(s, p));
        vec3 g = vec3(
          S(p + vec3(dt, 0, 0)).b - S(p - vec3(dt, 0, 0)).b,
          S(p + vec3(0, dt, 0)).b - S(p - vec3(0, dt, 0)).b,
          S(p + vec3(0, 0, dt)).b - S(p - vec3(0, 0, dt)).b);
        vec3 n = normalize(g + 1e-6);
        float facing = abs(dot(n, rd));
        float rim = pow(1.0 - facing, 2.0);
        float dif = 0.55 + 0.45 * abs(dot(n, L));
        vec3 col = base * dif + rim * 0.25;
        float aa = clamp(a * (0.35 + 0.65 * rim), 0.0, 1.0);
        C += T * aa * col;
        T *= 1.0 - aa;
        if (T < 0.01) break;
      }
    }
    prevIm = im;
  }
  o = vec4(C + bg * T, 1.0);
}`;
