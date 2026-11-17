// ─────────────────────────────────────────────────────────────────────────────
// ink.js — lines that live in 3D space, drawn on a flat screen.
//
// Every point you draw has three numbers: x (left/right), y (up/down) and
// z (depth: how close to you it is). Push your hand towards the camera while
// drawing and the line comes out of the screen.
//
// To show a 3D point on a 2D screen we use PERSPECTIVE: things that are closer
// look bigger and move more when your head moves. That second part is called
// "head-coupled parallax": the body tracker knows where your head is, so when
// you lean left or right the drawings shift as if they really float in the air
// in front of you.
// ─────────────────────────────────────────────────────────────────────────────

// The virtual camera. W,H = screen size; f = "focal length" (how strong the
// perspective is); camX,camY = where your eye is, relative to the screen centre.
export const view = { W: 1, H: 1, f: 1200, camX: 0, camY: 0 };

// 3D point → screen point. `s` is how much bigger it looks (1 = on the screen
// plane, >1 = in front of it, <1 = behind it).
export function project(p) {
  const s = view.f / Math.max(80, view.f - p.z);
  const cx = view.W / 2 + view.camX, cy = view.H / 2 + view.camY;
  return { x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s, s };
}

// The reverse: "I see my finger HERE on screen, at depth z — where is that in
// 3D?" Used while drawing, so the line appears exactly under your finger.
export function unproject(x, y, z) {
  const s = view.f / Math.max(80, view.f - z);
  const cx = view.W / 2 + view.camX, cy = view.H / 2 + view.camY;
  return { x: cx + (x - cx) / s, y: cy + (y - cy) / s, z };
}

// ── ink style ────────────────────────────────────────────────────────────────
export const style = {
  dark: false,    // false = light ink (reads on any video), true = paper mode, dark ink
  width: 2.6,     // line thickness in px
};

// One ink colour per person (slot 0 = first person, 1 = second…).
// Each has a version for the camera (light) and for paper mode (dark).
const INKS = [
  { light: '#ffffff', dark: '#141414' },   // white / black
  { light: '#ff9b8a', dark: '#d2442f' },   // coral
  { light: '#8fd8ff', dark: '#1f7fbf' },   // sky
  { light: '#ffd27a', dark: '#b88400' },   // amber
  { light: '#c4b2ff', dark: '#6a4fd0' },   // lavender
];
export const inkColour = (ci = 0) => INKS[ci % INKS.length][style.dark ? 'dark' : 'light'];

// "Boil": hand-drawn animation re-traces every frame slightly differently, so
// lines shimmer. We fake it by nudging each point by a tiny amount that changes
// 10 times a second. Cheap, and makes the drawing feel alive.
let boilSeed = 0, boilT = 0;
export function tickBoil(now) { if (now - boilT > 100) { boilSeed = (boilSeed + 1) % 7; boilT = now; } }
const jitter = (i, k) => Math.sin(i * 12.9898 + boilSeed * 78.233 + k) * 0.6;

// Draw one projected stroke (a list of screen points {x,y,s}) as a smooth line.
// We draw it twice: a soft wide "shadow" underneath so the line reads on any
// background, then the ink itself on top.
export function drawLine(g, pts, alpha = 1, widthMul = 1, ci = 0) {
  if (pts.length < 2) return;
  let sAvg = 0;
  for (const p of pts) sAvg += p.s;
  sAvg /= pts.length;
  const w = style.width * widthMul * Math.min(2.2, sAvg);

  const path = new Path2D();
  const P = (i) => ({ x: pts[i].x + jitter(i, 0), y: pts[i].y + jitter(i, 3.1) });
  let a = P(0);
  path.moveTo(a.x, a.y);
  // curve through the midpoints → smooth, no corners
  for (let i = 1; i < pts.length - 1; i++) {
    const b = P(i), c = P(i + 1);
    path.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
  }
  const z = P(pts.length - 1);
  path.lineTo(z.x, z.y);

  g.globalAlpha = alpha * 0.35;
  g.strokeStyle = style.dark ? '#fff' : '#000';
  g.lineWidth = w + 3;
  g.stroke(path);
  g.globalAlpha = alpha;
  g.strokeStyle = inkColour(ci);
  g.lineWidth = w;
  g.stroke(path);
  g.globalAlpha = 1;
}
