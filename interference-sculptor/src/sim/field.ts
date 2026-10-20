/**
 * The physics, on the CPU side: strokes become point sources, and the scalar
 * wave they send out is summed at any point in space.
 *
 *   ψ(x) = Σ a · e^{i(k r + φ)} / r        (one spherical wave per source)
 *   I(x) = Σ_groups |ψ_group(x)|²          (Born rule; groups add incoherently)
 *
 * Sources in the same group are coherent: their amplitudes add before squaring,
 * so they interfere. When which-path information exists, each stroke is its own
 * group and the fringes between strokes disappear. The GPU bakes the same sum
 * into a 3D texture (see shaders.ts); this copy finds the bright points that seed
 * the next generation, and the scale the renderer normalises by.
 */

export type Vec3 = [number, number, number];

export interface Stroke {
  points: Vec3[];
  /** Wavelength in world units (the cube is 2 across). */
  lambda: number;
}

export interface Source {
  p: Vec3;
  amp: number;
  k: number;
  phase: number;
  group: number;
  /** 0 for points on a stroke, g for a point added in generation g. */
  gen: number;
}

/** Softening, so the field stays finite at a source. Matches the bake shader. */
export const SOFTEN = 0.04;
export const MAX_SOURCES = 900;

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function strokeLength(pts: Vec3[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** n points evenly spaced along a polyline. */
export function resample(pts: Vec3[], n: number): Vec3[] {
  if (pts.length < 2 || n < 2) return [pts[0]];
  const L = strokeLength(pts);
  const out: Vec3[] = [];
  let seg = 0, segStart = 0;
  for (let i = 0; i < n; i++) {
    const target = (L * i) / (n - 1);
    while (seg < pts.length - 2 && segStart + dist(pts[seg], pts[seg + 1]) < target) {
      segStart += dist(pts[seg], pts[seg + 1]);
      seg++;
    }
    const a = pts[seg], b = pts[seg + 1];
    const d = dist(a, b) || 1;
    const t = Math.min(1, Math.max(0, (target - segStart) / d));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/**
 * Every stroke becomes a row of coherent pinholes, `spacing` wavelengths apart.
 * Under half a wavelength it acts as one continuous slit and sends light out in
 * a flat fan; wider apart, each row also throws cones of light along itself
 * (grating orders, at cos θ = mλ/d).
 */
export function strokeSources(strokes: Stroke[], whichPath: boolean, spacing = 0.42): Source[] {
  const out: Source[] = [];
  strokes.forEach((s, i) => {
    const L = strokeLength(s.points);
    const n = Math.max(1, Math.min(60, Math.round(L / Math.max(0.018, s.lambda * spacing)) + 1));
    const pts = n === 1 ? [s.points[0]] : resample(s.points, n);
    const amp = 1 / Math.sqrt(pts.length);
    for (const p of pts) out.push({ p, amp, k: (2 * Math.PI) / s.lambda, phase: 0, group: whichPath ? i + 1 : 0, gen: 0 });
  });
  return out;
}

/** Intensity and the coherent sum (for phase) at one point. */
export function evalField(src: Source[], x: Vec3) {
  let I = 0, g = src.length ? src[0].group : 0, ar = 0, ai = 0, tr = 0, ti = 0;
  for (const s of src) {
    if (s.group !== g) { I += ar * ar + ai * ai; ar = ai = 0; g = s.group; }
    const r = dist(x, s.p), ph = s.k * r + s.phase, m = s.amp / (r + SOFTEN);
    const re = m * Math.cos(ph), im = m * Math.sin(ph);
    ar += re; ai += im; tr += re; ti += im;
  }
  I += ar * ar + ai * ai;
  return { I, re: tr, im: ti };
}

/** Sources sorted by group, which the bake shader relies on. */
export const byGroup = (src: Source[]) => [...src].sort((a, b) => a.group - b.group).slice(0, MAX_SOURCES);

/** A fixed cloud of probe points, so the normalisation does not flicker between bakes. */
const PROBES: Vec3[] = (() => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 1.9 - 0.95;
  return Array.from({ length: 2400 }, () => [rnd(), rnd(), rnd()] as Vec3);
})();

/** The intensity the renderer calls 1: a high percentile, so a few hot spots near sources do not set the scale. */
export function fieldScale(src: Source[]) {
  if (!src.length) return 1;
  const v = PROBES.map((p) => evalField(src, p).I).sort((a, b) => a - b);
  return Math.max(1e-6, v[Math.floor(v.length * 0.985)]);
}

/**
 * Huygens' rule applied to its own output: the brightest points of generation
 * g become the sources of generation g + 1. Each new source starts in phase with
 * the field it was found in, and is weaker than its parent.
 */
export function grow(base: Source[], generations: number, perGen = 10): Source[] {
  let all = [...base];
  if (!base.length || generations <= 0) return all;
  const kMean = base.reduce((a, s) => a + s.k, 0) / base.length;
  const ampMean = base.reduce((a, s) => a + s.amp, 0) / base.length;
  const G = 26, lo = -0.92, step = (2 * 0.92) / (G - 1);
  for (let g = 1; g <= generations; g++) {
    const sorted = byGroup(all);
    const I = new Float32Array(G * G * G), P = new Float32Array(G * G * G);
    for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const f = evalField(sorted, [lo + x * step, lo + y * step, lo + z * step]);
      const j = (z * G + y) * G + x;
      I[j] = f.I; P[j] = Math.atan2(f.im, f.re);
    }
    const cand: [number, number, number, number, number][] = [];
    for (let z = 1; z < G - 1; z++) for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
      const j = (z * G + y) * G + x, v = I[j];
      let peak = true;
      for (let dz = -1; dz <= 1 && peak; dz++) for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy || dz) && I[j + (dz * G + dy) * G + dx] >= v) { peak = false; break; }
      }
      if (peak) cand.push([v, lo + x * step, lo + y * step, lo + z * step, P[j]]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    let added = 0;
    for (const [, x, y, z, ph] of cand) {
      if (added >= perGen) break;
      const p: Vec3 = [x, y, z];
      if (all.some((s) => dist(s.p, p) < 0.16)) continue;
      all.push({ p, amp: ampMean * 0.9 * Math.pow(0.7, g - 1), k: kMean, phase: -ph, group: 0, gen: g });
      added++;
    }
    all = all.slice(0, MAX_SOURCES);
  }
  return all;
}
