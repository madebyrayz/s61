import type { Stroke, Vec3 } from "@/sim/field";
import type { Mark, ThreadParams } from "@/sim/threads";
export type { Mark };

export type Tool = "draw" | "orbit";
export type RenderMode = "threads" | "surface" | "volume" | "fronts";
export type ColorBy = "phase" | "fringe" | "height";
export type PaletteName = "spectral" | "iridescent" | "monet" | "ember" | "glacier" | "ink";
export type Background = "dark" | "paper";

/** Everything that changes the picture but not the physics, so it never triggers a bake. */
export interface ViewParams extends ThreadParams {
  tool: Tool;
  lambda: number;
  handSetsLambda: boolean;
  depth: number;
  render: RenderMode;
  colorBy: ColorBy;
  palette: PaletteName;
  background: Background;
  threshold: number;
  density: number;
  exposure: number;
  reach: number;
  showStrokes: boolean;
  showGrid: boolean;
  autoRotate: boolean;
}

export interface Params extends ViewParams {
  whichPath: boolean;
  spacing: number;
  quality: number;
}

/** Preview grids for the field modes: draft, normal, fine. Save image always uses the capture grid in engine.ts. */
export const QUALITIES = [64, 96, 128];
export const QUALITY_LABELS = ["Draft", "Normal", "Fine"];

export const DEFAULTS: Params = {
  tool: "draw",
  lambda: 0.16,
  handSetsLambda: true,
  depth: 0,
  render: "volume",
  colorBy: "phase",
  palette: "monet",
  background: "dark",
  threshold: 0.55,
  density: 0.6,
  exposure: 1,
  reach: 0.08,
  showStrokes: false,
  showGrid: false,
  autoRotate: false,
  whichPath: false,
  spacing: 0.42,
  quality: 96,
  flow: 2.2,
  coupling: 1.4,
  spawn: 5,
  life: 12,
  trail: 0.14,
  spread: 1.6,
  grow: true,
  wander: 0.02,
  mark: "line",
  glide: 0.1,
  loop: 0.07,
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Inigo Quilez's cosine palettes: colour(t) = a + b·cos(2π(c·t + d)).
 * Four vectors give a smooth, periodic ramp, which suits phase (it wraps too).
 */
export const PALETTES: Record<PaletteName, [Vec3, Vec3, Vec3, Vec3]> = {
  spectral: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0.0, 0.33, 0.67]],
  iridescent: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 1], [0.0, 0.1, 0.2]],
  monet: [[0.66, 0.67, 0.68], [0.26, 0.22, 0.24], [1, 1, 1], [0.62, 0.12, 0.32]],
  ember: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 1, 0.5], [0.8, 0.9, 0.3]],
  glacier: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [1, 0.7, 0.4], [0.0, 0.15, 0.2]],
  ink: [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]],
};

/** The palette as a function, for the threads. */
export function paletteFn(name: PaletteName) {
  const [a, b, c, d] = PALETTES[name];
  return (t: number): [number, number, number] => [
    Math.min(1, Math.max(0, a[0] + b[0] * Math.cos(2 * Math.PI * (c[0] * t + d[0])))),
    Math.min(1, Math.max(0, a[1] + b[1] * Math.cos(2 * Math.PI * (c[1] * t + d[1])))),
    Math.min(1, Math.max(0, a[2] + b[2] * Math.cos(2 * Math.PI * (c[2] * t + d[2])))),
  ];
}

/* ---------------------------------------------------------------------- */
/* Thread styles: how the brush grows, as a switch along the bottom       */
/* ---------------------------------------------------------------------- */

export interface ThreadStyle {
  name: string;
  note: string;
  values: Pick<ThreadParams, "flow" | "coupling" | "spawn" | "life" | "trail" | "spread" | "wander" | "glide" | "loop">;
}

export const THREAD_STYLES: ThreadStyle[] = [
  {
    name: "Burst",
    note: "Rays fly straight out from your line along the wave, each spinning in a small loop, and bundle into fans and sheets.",
    values: { flow: 2.2, coupling: 1.4, spawn: 5, life: 12, trail: 0.14, spread: 1.6, wander: 0.02, glide: 0.1, loop: 0.07 },
  },
  {
    name: "Sprout",
    note: "Short threads that hug the pen: the line thickens into a fur of fringes.",
    values: { flow: 0.9, coupling: 1, spawn: 8, life: 6, trail: 0.08, spread: 0.3, wander: 0.5, glide: 0.85, loop: 0.1 },
  },
  {
    name: "Drift",
    note: "Long, loose threads that ride the waves far out from the strokes.",
    values: { flow: 1.6, coupling: 0.5, spawn: 4, life: 12, trail: 0.05, spread: 0.9, wander: 0.7, glide: 0.6, loop: 0.3 },
  },
  {
    name: "Weave",
    note: "Strongly coupled spins: the threads lock into one rhythm and braid into bundles.",
    values: { flow: 1.2, coupling: 2.2, spawn: 6, life: 9, trail: 0.07, spread: 0.55, wander: 0.35, glide: 0.85, loop: 0.15 },
  },
];

/* ---------------------------------------------------------------------- */
/* Presets: strokes plus the view that shows them best                    */
/* ---------------------------------------------------------------------- */

const line = (a: Vec3, b: Vec3, n = 12): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as Vec3;
  });
const circle = (r: number, z: number, n = 64): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a), z] as Vec3;
  });
const helix = (r: number, turns: number, h: number, n = 120): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), a = t * turns * Math.PI * 2;
    return [r * Math.cos(a), (t - 0.5) * h, r * Math.sin(a)] as Vec3;
  });

export interface Preset {
  name: string;
  note: string;
  strokes: Stroke[];
  values: Partial<Params>;
}

export const PRESETS: Preset[] = [
  {
    name: "Blank",
    note: "Empty space. Draw, and the waves glow around your line.",
    strokes: [],
    values: { render: "volume", threshold: 0.5, density: 0.25, colorBy: "phase", background: "dark", palette: "monet" },
  },
  {
    name: "Double slit",
    note: "Young's experiment: two short parallel slits. The bright fringes glow between them.",
    strokes: [
      { points: line([-0.14, -0.3, -0.55], [-0.14, 0.3, -0.55]), lambda: 0.16 },
      { points: line([0.14, -0.3, -0.55], [0.14, 0.3, -0.55]), lambda: 0.16 },
    ],
    values: { render: "volume", threshold: 0.5, density: 0.25, colorBy: "phase", background: "dark", palette: "monet" },
  },
  {
    name: "Two pinholes",
    note: "Two points, as a solid: each fringe is a hyperboloid of revolution around the line joining them, nested like shells.",
    strokes: [
      { points: [[-0.22, 0, 0]], lambda: 0.14 },
      { points: [[0.22, 0, 0]], lambda: 0.14 },
    ],
    values: { render: "surface", threshold: 0.55, colorBy: "phase", palette: "iridescent", background: "dark" },
  },
  {
    name: "Ring",
    note: "A circular slit, as glowing volume. Every point on its axis is the same distance from the whole ring, so the waves add there into a bright needle of light.",
    strokes: [{ points: circle(0.32, 0), lambda: 0.15 }],
    values: { render: "volume", threshold: 0.5, density: 0.25, colorBy: "phase", palette: "monet", background: "dark" },
  },
  {
    name: "Helix",
    note: "A slit wound into a spiral, as wavefronts. The pattern twists with it.",
    strokes: [{ points: helix(0.3, 2, 0.9), lambda: 0.17 }],
    values: { render: "fronts", threshold: 0.4, density: 0.6, colorBy: "phase", palette: "ember", background: "dark" },
  },
];
