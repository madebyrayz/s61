/**
 * Every word the interface says, in one place. Same shape as the week-1
 * Subdivision Sculptor: a label, what it does, what you will see, and a value
 * worth trying.
 */

export interface Explainer {
  /** The name shown on the control. */
  label: string;
  /** What it does to the physics. */
  what: string;
  /** What changes on screen. */
  see: string;
  /** A value worth trying. */
  hint?: string;
  /** The symbol, when there is one. */
  paper?: string;
}

export interface SectionCopy {
  title: string;
  intro: string;
}

export const PRIMER = {
  title: "Intro",
  body: [
    "Every stroke is a slit cut into empty space. Each point on it sends out a spherical wave, like a stone dropped in water, but in 3D.",
    "Where two waves arrive in step they add up and get brighter. Where one arrives at a crest and the other at a trough, they cancel. That is the double-slit experiment.",
    "The GPU adds up every wave at every point of a 3D grid, then shoots a ray through each pixel and turns what it finds into a shape. Two short slits give nested hyperbolic sheets. Nobody drew those: they fall out of the rule.",
  ],
};

export const PANEL = {
  title: "Interference Sculptor",
  subtitle: "Drawing with Young's double slit, in three dimensions",
  hide: "Hide",
  show: "Controls",
};

export const GENERATIONS = {
  label: "Generations",
  blurb:
    "Huygens' principle says every point a wave reaches becomes a new source. Each generation takes the brightest points of the field and makes them sources too, then sums everything again: the rule running on its own output.",
  countNote: (from: number, to: number, gens: number) =>
    `${from.toLocaleString()} sources on your strokes, ${to.toLocaleString()} after ${gens} ${gens === 1 ? "generation" : "generations"}.`,
  playLabel: "Play",
  stopLabel: "Stop",
};

export const SECTIONS: Record<string, SectionCopy> = {
  presets: {
    title: "Presets",
    intro: "Textbook apertures to start from. Pick one, then draw on top of it.",
  },
  pen: {
    title: "Pen",
    intro:
      "You draw on a plane through the centre that faces you. Orbit to draw at a new angle, or slide the plane nearer or further.",
  },
  physics: {
    title: "Physics",
    intro: "What the waves do between your strokes and the picture.",
  },
  shape: {
    title: "Shape",
    intro:
      "How the field, a number at every point, becomes something you can see. Fringe visibility is 1 where every wave arrives in step and 0 where they cancel.",
  },
  colour: {
    title: "Colour",
    intro: "Colour is a second reading of the same field, mapped through a cosine palette.",
  },
  view: {
    title: "View",
    intro: "Drag with the right button (or shift) to orbit, scroll to zoom.",
  },
};

export const CONTROLS = {
  tool: {
    label: "Tool",
    what: "Draw cuts a slit where you drag. Orbit turns the view instead, for touch screens or when you want to look without drawing.",
    see: "With Draw on, a dashed square shows the plane your pen is on.",
  },
  handSetsLambda: {
    label: "Hand sets wavelength",
    what: "The speed of your stroke chooses its wavelength: slow and calm gives long waves, fast gives short ones.",
    see: "Slow strokes make wide, soft fringes. Fast ones make fine, dense ones.",
    paper: "λ ∝ 1 / v",
  },
  lambda: {
    label: "Wavelength",
    what: "The distance from one crest to the next, in the units of the floor grid (one square is 0.5). Used for every new stroke when the hand is not setting it.",
    see: "Shorter waves make more fringes, packed closer together.",
    hint: "0.12 for fine detail, 0.24 for a few large forms.",
    paper: "λ",
  },
  depth: {
    label: "Drawing depth",
    what: "Moves the drawing plane toward you or away from you, through the centre.",
    see: "The dashed square slides. Strokes land at that depth.",
  },
  spacing: {
    label: "Pinhole spacing",
    what: "Each stroke is cut as a row of pinholes. This is the gap between them, in wavelengths. Below half a wavelength the row behaves as one continuous slit.",
    see: "A continuous slit sends light out as a flat fan. Spread the pinholes and the row also throws cones of light along its own direction, one per diffraction order.",
    hint: "Try 1.2 on a long straight stroke.",
    paper: "cos θ = mλ / d",
  },
  whichPath: {
    label: "Which-path marker",
    what: "Tags every stroke, as if a detector could tell which slit each photon came through. Tagged waves no longer interfere with each other; their intensities just add.",
    see: "The fringes between strokes disappear. Turn it off again and they come back: a quantum eraser.",
    paper: "Σ|ψ|² vs |Σψ|²",
  },
  render: {
    label: "Render",
    what: "Surface cuts the field at one level and shades it as a solid. Volume treats it as glowing fog. Wavefronts draws the surfaces where the phase is zero, one per wavelength.",
    see: "Surface reads as sculpture, Volume as light, Wavefronts as the waves themselves.",
  },
  threshold: {
    label: "Level",
    what: "Which fringe visibility counts as inside the shape.",
    see: "Higher keeps only the brightest fringes, as thin sheets. Lower fattens them until they merge.",
    hint: "0.5 to 0.7 for clean sheets.",
  },
  reach: {
    label: "Reach",
    what: "How weak a wave can get and still make shape. Far from the strokes, waves spread out and fade.",
    see: "Lower values let the shapes reach far out into space before they fade; higher keeps them close to the strokes.",
  },
  density: {
    label: "Density",
    what: "How much each fringe glows (Volume) or how opaque each wavefront is (Wavefronts).",
    see: "Higher is brighter and more solid; lower lets you see inside.",
  },
  exposure: {
    label: "Exposure",
    what: "Multiplies the intensity before it is mapped to shape.",
    see: "Like opening a camera's aperture: faint regions join in.",
  },
  colorBy: {
    label: "Colour by",
    what: "Phase colours each point by where the wave is in its cycle, so the colours repeat once per wavelength. Fringe colours by how strongly the waves agree. Height colours bottom to top.",
    see: "Phase shows the rhythm of the wave; Fringe shows its strength.",
  },
  palette: {
    label: "Palette",
    what: "A cosine palette (Inigo Quilez): colour = a + b·cos(2π(c·t + d)). It wraps around smoothly, like phase.",
    see: "The colours change; the shape does not.",
  },
  background: {
    label: "Ground",
    what: "Dark lets the field glow. Paper turns it into ink that absorbs light.",
    see: "On paper, Volume reads like a watercolour.",
  },
  quality: {
    label: "Preview resolution",
    what: "How finely the field is computed while you work: Draft 64³, Normal 96³, Fine 128³ points. Save image ignores this and always renders at 176³ and twice the screen size.",
    see: "Draft keeps the fan quiet; Fine is smoother and slower to update. The picture you save is the same either way.",
  },
  showStrokes: {
    label: "Show strokes",
    what: "Draws your slits, and the sources each generation added, as thin lines and rings.",
    see: "Off leaves only the field.",
  },
  showGrid: {
    label: "Floor grid",
    what: "A faint grid below the field, half a unit per square, so you can keep track of up and of scale while you orbit.",
    see: "The field has no edge; the grid is only a guide.",
  },
  autoRotate: {
    label: "Auto-rotate",
    what: "Turns the view slowly when you are not touching it.",
    see: "The view drifts.",
  },
} satisfies Record<string, Explainer>;

export const ACTIONS = {
  undo: { label: "Undo", hint: "Remove the last stroke (⌘Z)" },
  clear: { label: "Clear", hint: "Remove every stroke" },
  reset: { label: "Reset", hint: "Back to the double slit and default settings" },
  capture: { label: "Save image", hint: "Download the view as a PNG" },
};

export const FOOTER_HINT = "Drag to draw a slit · right-drag or shift-drag to orbit · scroll to zoom";
export const BAKING = "Computing the field…";
