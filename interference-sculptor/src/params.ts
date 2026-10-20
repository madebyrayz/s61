import type { Stroke, Vec3 } from "@/sim/field";

export type Tool = "draw" | "orbit";
export type RenderMode = "volume" | "surface" | "fronts";
export type ColorBy = "phase" | "fringe" | "height";
export type PaletteName = "spectral" | "iridescent" | "monet" | "ember" | "glacier" | "ink";
export type Background = "dark" | "paper";

/** Everything that changes the picture but not the physics, so it never triggers a bake. */
export interface ViewParams {
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
  generations: number;
  quality: number;
}

export const MAX_GENERATIONS = 3;
export const QUALITIES = [112, 144, 176];

export const DEFAULTS: Params = {
  tool: "draw",
  lambda: 0.16,
  handSetsLambda: true,
  depth: 0,
  render: "surface",
  colorBy: "phase",
  palette: "spectral",
  background: "dark",
  threshold: 0.55,
  density: 0.6,
  exposure: 1,
  reach: 0.08,
  showStrokes: true,
  showGrid: true,
  autoRotate: true,
  whichPath: false,
  spacing: 0.42,
  generations: 0,
  quality: 144,
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
    name: "Double slit",
    note: "Young's experiment: two short parallel slits. The bright fringes are hyperbolic sheets fanning out from between them.",
    strokes: [
      { points: line([-0.14, -0.3, -0.55], [-0.14, 0.3, -0.55]), lambda: 0.16 },
      { points: line([0.14, -0.3, -0.55], [0.14, 0.3, -0.55]), lambda: 0.16 },
    ],
    values: { render: "surface", threshold: 0.55, colorBy: "phase", palette: "iridescent" },
  },
  {
    name: "Two pinholes",
    note: "Two points. Each fringe is a hyperboloid of revolution around the line joining them, nested like shells.",
    strokes: [
      { points: [[-0.22, 0, 0]], lambda: 0.14 },
      { points: [[0.22, 0, 0]], lambda: 0.14 },
    ],
    values: { render: "surface", threshold: 0.7, colorBy: "phase", palette: "iridescent" },
  },
  {
    name: "Ring",
    note: "A circular slit. Every point on its axis is the same distance from the whole ring, so the waves add there into a bright needle of light.",
    strokes: [{ points: circle(0.32, 0), lambda: 0.15 }],
    values: { render: "volume", threshold: 0.5, density: 0.25, colorBy: "phase", palette: "monet" },
  },
  {
    name: "Grating",
    note: "Five parallel slits. More slits make the bright orders narrower and sharper, which is how a spectrometer works.",
    strokes: [-0.24, -0.12, 0, 0.12, 0.24].map((x) => ({
      points: line([x, -0.35, -0.6], [x, 0.35, -0.6]),
      lambda: 0.15,
    })),
    values: { render: "surface", threshold: 0.5, colorBy: "phase", palette: "glacier" },
  },
  {
    name: "Helix",
    note: "A slit wound into a spiral. The pattern twists with it.",
    strokes: [{ points: helix(0.3, 2, 0.9), lambda: 0.17 }],
    values: { render: "fronts", threshold: 0.4, density: 0.6, colorBy: "phase", palette: "ember" },
  },
  {
    name: "Pinhole",
    note: "A single point: spherical wavefronts, one wavelength apart. Nothing to interfere with, until you draw a second.",
    strokes: [{ points: [[0, 0, 0]], lambda: 0.18 }],
    values: { render: "fronts", threshold: 0.2, density: 0.5, colorBy: "height", palette: "ink" },
  },
];
