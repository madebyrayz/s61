// ─────────────────────────────────────────────────────────────────────────────
// recognize.js — "what did I just draw?"
//
// We use DoodleNet: a small neural network trained on Google's "Quick, Draw!"
// dataset (millions of 20-second doodles in 345 categories). It runs 100%
// locally in the browser through TensorFlow.js. No internet, no API key.
//
// How it works, in three steps:
//   1. take the strokes you drew (lists of x,y points)
//   2. paint them, white on black, into a tiny 28×28 pixel picture
//      (that is the format the network was trained on)
//   3. hand the picture to the network; it answers with 345 probabilities,
//      one per category. The biggest one is its best guess.
// ─────────────────────────────────────────────────────────────────────────────

// `tf` is a global variable created by lib/tf.min.js (loaded in index.html).
const tf = window.tf;

let model = null;       // the neural network, once loaded
let labels = [];        // the 345 category names, in the same order as outputs

// A small off-screen canvas we paint the 28×28 picture into.
const SIZE = 28;
const pad = document.createElement('canvas');
pad.width = pad.height = SIZE;
const g = pad.getContext('2d', { willReadFrequently: true });

// Load the network (≈2 MB) and the label list. `async` means this function
// can wait for files to download without freezing the page.
let loading = null;
export function loadRecognizer() {
  // only download once, however many times this is called
  return (loading ??= load());
}
async function load() {
  const [m, txt] = await Promise.all([
    tf.loadLayersModel('models/doodlenet/model.json'),
    fetch('models/doodlenet/class_names.txt').then((r) => r.text()),
  ]);
  model = m;
  labels = txt.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  // Run it once on an empty picture so the first real guess is fast.
  tf.tidy(() => model.predict(tf.zeros([1, SIZE, SIZE, 1])));
  return labels.length;
}

export const recognizerReady = () => !!model;

// The categories that have a behaviour in creatures.js. When one of these is
// close to the top guess we prefer it, because it makes the scene more alive.
let favourites = new Set();
export function setFavourites(list) { favourites = new Set(list); }

// strokes: array of strokes; each stroke is an array of {x, y} screen points.
// Returns the top guesses: [{ label, p }, …] sorted best first.
export function classify(strokes) {
  if (!model) return [];

  // ── 1. find the bounding box of all the points ──
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0, h = y1 - y0;
  const box = Math.max(w, h, 1);
  // scale so the longest side fills the picture, leaving a 2 px margin
  const k = (SIZE - 4) / box;
  const ox = (SIZE - w * k) / 2, oy = (SIZE - h * k) / 2;

  // ── 2. paint white lines on black ──
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = '#fff';
  g.lineWidth = 1.4;
  g.lineCap = g.lineJoin = 'round';
  for (const s of strokes) {
    g.beginPath();
    s.forEach((p, i) => {
      const X = ox + (p.x - x0) * k, Y = oy + (p.y - y0) * k;
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.stroke();
  }

  // ── 3. ask the network ──
  const probs = tf.tidy(() => {
    const img = tf.browser.fromPixels(pad, 1).toFloat().div(255); // 0..1
    return model.predict(img.expandDims(0)).dataSync();          // 345 numbers
  });

  // sort categories by probability, keep the top 5
  const ranked = Array.from(probs, (p, i) => ({ label: labels[i], p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 5);

  // Prefer a "favourite" if it is at least 15% as likely as the winner (and not tiny).
  const fav = ranked.find((r) => favourites.has(r.label));
  if (fav && fav !== ranked[0] && fav.p >= ranked[0].p * 0.15 && fav.p > 0.06) {
    ranked.splice(ranked.indexOf(fav), 1);
    ranked.unshift(fav);
  }
  return ranked;
}

// For the "what the AI sees" panel: the tiny picture the network looked at.
export const recognizerCanvas = pad;
