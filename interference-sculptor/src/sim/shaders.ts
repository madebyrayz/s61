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
 * 2. MARCH: a ray per pixel through all of space, reading the texture.
 *    Three ways to turn the numbers into a picture: emission–absorption volume,
 *    an isosurface found by stepping and bisecting, or the wavefronts
 *    (surfaces of constant phase) as stacked translucent shells.
 *
 * The field has no box. The texture is warped so that it covers every point:
 * texture coordinate u ∈ (-1, 1) maps to world p = W·u / √(1 − u²) on each
 * axis. Near the strokes voxels are small; far away they grow, which suits a
 * field whose fringes spread out with distance. The picture fades
 * into the background as the waves weaken, out to FADE_END, instead of
 * stopping at a wall.
 */

/** World units per texture unit at the centre. */
export const WARP = 1.6;
/** Distance where the field has faded out completely. Inside the texture's reach (≈ √(N/2)). */
export const FADE_START = 1.6;
export const FADE_END = 3.6;

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
uniform vec3 uCenter;   // the field is baked around this point
out vec4 o;

void main() {
  vec3 u = vec3(gl_FragCoord.xy / uN * 2.0 - 1.0, uZ);
  vec3 p = uCenter + ${WARP.toFixed(3)} * u / sqrt(1.0 - u * u);
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
uniform float uStepMul;   // > 1 while the view is moving: longer steps, fewer samples
uniform float uLambda;
uniform vec3 uCenter;     // middle of the strokes: the field is centred here
uniform float uSpread;    // how far the strokes reach from it    // shortest wavelength in the drawing, to know when the grid can no longer resolve it
out vec4 o;

const float TAU = 6.28318530718;
const float WARP = ${WARP.toFixed(3)};
const float FADE_START = ${FADE_START.toFixed(3)};
const float FADE_END = ${FADE_END.toFixed(3)};
vec3 pal(float t) { return uPa + uPb * cos(TAU * (uPc * t + uPd)); }
/* Per-pixel start offset for the march. Fixed per pixel (not per frame), so a re-render never shimmers. */
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/* World ↔ texture. jac is du/dp per axis: how many texture units one world unit spans there. */
vec3 toU(vec3 p) { vec3 q = (p - uCenter) / WARP; return q / sqrt(1.0 + q * q); }
vec3 jac(vec3 p) { vec3 q = (p - uCenter) / WARP; vec3 s = 1.0 + q * q; return 1.0 / (WARP * s * sqrt(s)); }
/* World distance per step along rd, so each step crosses about 0.8 of a voxel wherever it is. */
float stepAt0(vec3 p, vec3 rd) { return (1.6 / uN) / length(jac(p) * rd); }
/* 1 where a voxel is small enough to resolve a wavelength, 0 where it is not. */
float resolved(vec3 p) {
  vec3 j = jac(p);
  float vox = (2.0 / uN) / min(j.x, min(j.y, j.z));
  return 1.0 - smoothstep(0.3 * uLambda, 0.6 * uLambda, vox);
}
float stepAt(vec3 p, vec3 rd) { return stepAt0(p, rd) * uStepMul; }

vec4 S(vec3 p) { return texture(uVol, toU(p) * 0.5 + 0.5); }
float intensity(vec4 s) { return s.r / max(1.0 - s.r, 1e-3); }
float phaseOf(vec4 s) { return atan(s.b - 0.5, s.g - 0.5); }
float fade(vec3 p) { return 1.0 - smoothstep(FADE_START + uSpread, FADE_END + uSpread, length(p - uCenter)); }
/* The shape field: fringe visibility, faded out where the waves are too weak to matter. */
float F(vec4 s, vec3 p) { return s.a * (1.0 - exp(-intensity(s) * uExposure / uReach)) * fade(p); }
float Fp(vec3 p) { return F(S(p), p); }

/* Central differences, one voxel wide on each axis, in world units. */
vec3 gradF(vec3 p) {
  vec3 h = (1.2 / uN) / jac(p);
  return vec3(
    (Fp(p + vec3(h.x, 0, 0)) - Fp(p - vec3(h.x, 0, 0))) / h.x,
    (Fp(p + vec3(0, h.y, 0)) - Fp(p - vec3(0, h.y, 0))) / h.y,
    (Fp(p + vec3(0, 0, h.z)) - Fp(p - vec3(0, 0, h.z))) / h.z);
}
vec3 gradIm(vec3 p) {
  vec3 h = (1.2 / uN) / jac(p);
  return vec3(
    (S(p + vec3(h.x, 0, 0)).b - S(p - vec3(h.x, 0, 0)).b) / h.x,
    (S(p + vec3(0, h.y, 0)).b - S(p - vec3(0, h.y, 0)).b) / h.y,
    (S(p + vec3(0, 0, h.z)).b - S(p - vec3(0, 0, h.z)).b) / h.z);
}

float colorT(vec4 s, vec3 p) {
  if (uColorBy == 0) return phaseOf(s) / TAU + 0.5;
  if (uColorBy == 1) return F(s, p);
  return clamp(p.y * 0.5 + 0.5, 0.0, 1.0);
}
/* Where the grid is too coarse to follow the phase, its bands blur to the palette's average, uPa. */
vec3 colorAt(vec4 s, vec3 p) {
  vec3 c = pal(colorT(s, p));
  return uColorBy == 0 ? mix(uPa, c, resolved(p)) : c;
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

  /* The field lives inside a sphere of radius FADE_END; march the part of the ray inside it. */
  vec3 oc = ro - uCenter;
  float R = FADE_END + uSpread;
  float b = dot(oc, rd), c = dot(oc, oc) - R * R;
  float disc = b * b - c;
  if (disc <= 0.0) { o = vec4(bg, 1.0); return; }
  float tn = max(-b - sqrt(disc), 0.05);
  float tf = -b + sqrt(disc);
  if (tf <= tn) { o = vec4(bg, 1.0); return; }

  float jit = hash(gl_FragCoord.xy);
  vec3 L = normalize(vec3(0.45, 0.8, 0.35));

  if (uMode == 0) {
    /* Emission–absorption. On the dark ground the field glows; on paper it is ink. */
    vec3 C = vec3(0.0), T = vec3(1.0);
    float t = tn + stepAt(ro + rd * tn, rd) * jit;
    for (int i = 0; i < 700; i++) {
      if (t > tf) break;
      vec3 p = ro + rd * t;
      float dt = stepAt(p, rd);
      vec4 s = S(p);
      float f = F(s, p);
      float d = uDensity * 14.0 * smoothstep(uThreshold - 0.12, uThreshold + 0.12, f) * f;
      if (d > 1e-4) {
        vec3 col = colorAt(s, p);
        if (uPaper > 0.5) {
          T *= exp(-d * dt * (1.15 - col) * 1.6);
        } else {
          float a = 1.0 - exp(-d * dt);
          C += T * a * col * 1.1;
          T *= 1.0 - a;
        }
        if (max(T.r, max(T.g, T.b)) < 0.02) break;
      }
      t += dt;
    }
    vec3 col = uPaper > 0.5 ? bg * T : C + bg * T;
    if (uPaper < 0.5) col = 1.0 - exp(-col * 1.1);
    o = vec4(col, 1.0);
    return;
  }

  if (uMode == 1) {
    /* Isosurface F = threshold, found by stepping until F crosses it and bisecting. */
    float t = tn + stepAt(ro + rd * tn, rd) * jit, prevT = tn;
    for (int i = 0; i < 900; i++) {
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
        vec3 base = colorAt(s, p);
        vec3 col = base * (0.16 + 0.78 * dif + 0.12 * back) * ao + spec * 0.35 + fres * (uPaper > 0.5 ? -0.15 : 0.25) * base;
        o = vec4(col, 1.0);
        return;
      }
      prevT = t;
      t += stepAt(p, rd);
    }
    o = vec4(bg, 1.0);
    return;
  }

  /* Wavefronts: wherever the phase passes through 0, lay down a thin shell,
     as opaque as the wave is strong there. Dark fringes punch holes through. */
  vec3 C = vec3(0.0);
  float T = 1.0;
  float t = tn + stepAt(ro + rd * tn, rd) * jit;
  vec4 sp = S(ro + rd * t);
  float prevIm = sp.b - 0.5;
  for (int i = 0; i < 900; i++) {
    t += stepAt(ro + rd * t, rd);
    if (t > tf) break;
    vec3 p = ro + rd * t;
    vec4 s = S(p);
    float im = s.b - 0.5;
    if (prevIm < 0.0 && im >= 0.0 && s.g > 0.5) {
      float f = F(s, p);
      float strength = (1.0 - exp(-intensity(s) * uExposure / uReach)) * fade(p) * resolved(p);
      float a = uDensity * strength * smoothstep(uThreshold - 0.2, uThreshold + 0.1, s.a);
      if (a > 0.002) {
        vec3 base = pal(uColorBy == 0 ? f : colorT(s, p));
        vec3 n = normalize(gradIm(p) + 1e-6);
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
