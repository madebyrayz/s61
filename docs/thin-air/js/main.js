// ─────────────────────────────────────────────────────────────────────────────
// main.js — the conductor. Starts the camera, then runs one loop, ~60× a second:
//
//   1. SEE      ask vision.js where your hand and body are
//   2. DRAW     if you are pinching, add a point to the current line
//   3. NAME     if you stopped drawing a moment ago, ask recognize.js what it is
//   4. LIVE     let every creature think and move (creatures.js)
//   5. PAINT    clear the canvas and draw ink, creatures, and the AI overlay
// ─────────────────────────────────────────────────────────────────────────────

import { sense, loadVision, updateVision } from './vision.js';
import { loadRecognizer, classify, setFavourites } from './recognize.js';
import { view, project, unproject, drawLine, style, tickBoil } from './ink.js';
import { creatures, spawn, setLabel, updateCreatures, drawCreatures, removeLast, clearAll, FAVOURITES } from './creatures.js';
import { drawSight } from './sight.js';

const $ = (id) => document.getElementById(id);
const video = $('cam'), canvas = $('ink'), g = canvas.getContext('2d');

// ── canvas size ──────────────────────────────────────────────────────────────
// A retina screen has 2 real pixels per CSS pixel. We cap at 1.5 to keep the
// laptop cool; lines still look crisp.
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(1.5, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  view.W = W; view.H = H; view.f = Math.max(W, H) * 1.1;
}
addEventListener('resize', resize);
resize();

// ── app state ────────────────────────────────────────────────────────────────
const ui = { sight: false };
let pending = [];        // finished strokes waiting to be recognised (3D points)
let current = null;      // the stroke being drawn right now
let penUpAt = 0;         // when the pen was last lifted
let lastGuess = null;    // newest top-5 guesses (for the overlay)
const chips = [];        // little name labels that fade after a recognition
const WAIT = 1100;       // ms of no drawing before we "name" the drawing

// ── pen: shared by hand and mouse ────────────────────────────────────────────
function penDown(x, y, z) {
  current = [];
  penMove(x, y, z);
}
function penMove(x, y, z) {
  if (!current) return;
  const last = current[current.length - 1];
  const q = last && project(last);
  if (!last || Math.hypot(q.x - x, q.y - y) > 2.5) current.push(unproject(x, y, z));
}
function penUp() {
  if (!current) return;
  if (current.length >= 2) pending.push(current);
  current = null;
  penUpAt = performance.now();
}

// mouse / trackpad / pen tablet also draw (handy without a camera, too)
let mouse = null;
canvas.addEventListener('pointerdown', (e) => { mouse = { x: e.clientX, y: e.clientY, moved: 0 }; penDown(e.clientX, e.clientY, 0); });
canvas.addEventListener('pointermove', (e) => {
  if (!mouse) return;
  mouse.moved += Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
  mouse.x = e.clientX; mouse.y = e.clientY;
  penMove(e.clientX, e.clientY, 0);
});
addEventListener('pointerup', (e) => {
  if (!mouse) return;
  // a click (no drag) on a creature → cycle to the recognizer's next guess
  if (mouse.moved < 4) {
    current = null;
    const c = creatures.find((c) => c.box && e.clientX > c.box.x0 - 10 && e.clientX < c.box.x1 + 10 && e.clientY > c.box.y0 - 10 && e.clientY < c.box.y1 + 10);
    if (c) { setLabel(c, (c.gi + 1) % c.guesses.length); addChip(c); }
  } else penUp();
  mouse = null;
});

// ── naming: turn the waiting strokes into a creature ─────────────────────────
function nameDrawing() {
  const flat = pending.map((s) => s.map(project));   // what you see on screen
  const guesses = classify(flat);
  lastGuess = guesses;
  const c = spawn(pending, guesses.length ? guesses : [{ label: 'doodle', p: 0 }]);
  addChip(c);
  pending = [];
}
function addChip(c) { chips.push({ c, t: performance.now() }); }

// ── buttons & keys ───────────────────────────────────────────────────────────
function toggleSight() { ui.sight = !ui.sight; $('b-sight').classList.toggle('active', ui.sight); }
function togglePaper() {
  style.dark = !style.dark;
  document.body.classList.toggle('paper', style.dark);
  $('b-paper').classList.toggle('active', style.dark);
}
function undo() { if (pending.length) pending.pop(); else removeLast(); }
function clear() { pending = []; current = null; clearAll(); }
$('b-sight').onclick = toggleSight;
$('b-paper').onclick = togglePaper;
$('b-undo').onclick = undo;
$('b-clear').onclick = clear;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'v') toggleSight();
  if (k === 'p') togglePaper();
  if (k === 'z') undo();
  if (k === 'c') clear();
  if (k === 'h') document.body.classList.toggle('clean');
});

// ── start ────────────────────────────────────────────────────────────────────
$('go').onclick = async () => {
  const btn = $('go'), status = $('status');
  btn.disabled = true;
  try {
    status.textContent = 'asking for the camera…';
    // 960×540 is plenty for tracking and keeps the GPU cool
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false,
    });
    await video.play();
    await Promise.all([
      loadVision(video, (s) => (status.textContent = s + '…')),
      loadRecognizer(),
    ]);
  } catch (err) {
    console.error(err);
    status.textContent = 'Camera or models unavailable (' + (err.message || err.name) + '). You can still draw with the mouse.';
    loadRecognizer().catch(() => {});
    setTimeout(() => $('start').classList.add('gone'), 2600);
    showUI();
    return;
  }
  $('start').classList.add('gone');
  showUI();
};
function showUI() {
  $('dock').classList.add('on');
  $('hint').classList.add('on');
  setTimeout(() => $('hint').classList.remove('on'), 9000);
}
setFavourites(FAVOURITES);
// load the small recognizer straight away, so mouse drawing works before the camera
loadRecognizer().catch((e) => console.warn('recognizer', e));

// ── the loop ─────────────────────────────────────────────────────────────────
let last = performance.now();
let handWasPinching = false;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 1. SEE
  updateVision(now);
  const hand = sense.hand;
  const A = sense.body && sense.body.anchors;

  // head-coupled parallax: the virtual eye follows your real eyes
  const tx = A ? (A.eyes.x - W / 2) * 0.6 : 0, ty = A ? (A.eyes.y - H * 0.4) * 0.4 : 0;
  view.camX += (tx - view.camX) * Math.min(1, dt * 3);
  view.camY += (ty - view.camY) * Math.min(1, dt * 3);

  // 2. DRAW with the hand: pinch = pen down
  if (hand && hand.pinch) {
    if (!handWasPinching) penDown(hand.cursor.x, hand.cursor.y, hand.z);
    else penMove(hand.cursor.x, hand.cursor.y, hand.z);
  } else if (handWasPinching) penUp();
  handWasPinching = !!(hand && hand.pinch);

  // 3. NAME the drawing once you've paused
  if (pending.length && !current && now - penUpAt > WAIT) nameDrawing();

  // 4. LIVE
  updateCreatures(dt, { W, H, anchors: A, hand });

  // 5. PAINT
  tickBoil(now);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.lineCap = g.lineJoin = 'round';

  drawCreatures(g);

  // strokes not yet named: slightly breathing while the AI "watches"
  const waitingAlpha = 0.75 + 0.25 * Math.sin(now / 160);
  let box = null;
  for (const s of [...pending, ...(current ? [current] : [])]) {
    const pts = s.map(project);
    drawLine(g, pts, s === current ? 1 : waitingAlpha);
    for (const p of pts) {
      box = box || { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x);
      box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y);
    }
  }

  // the hand cursor: a ring when hovering, a dot when drawing; bigger = closer
  if (hand) {
    const r = 7 * (view.f / (view.f - hand.z));
    g.strokeStyle = style.dark ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.9)';
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(hand.cursor.x, hand.cursor.y, hand.pinch ? 3.5 : r, 0, 7);
    hand.pinch ? g.fill() : g.stroke();
  }

  // name chips that fade (always on, even when Sight is off)
  for (let i = chips.length - 1; i >= 0; i--) {
    const { c, t } = chips[i];
    const age = (now - t) / 1000;
    if (age > 2.6 || !creatures.includes(c)) { chips.splice(i, 1); continue; }
    if (ui.sight || !c.box) continue;
    const a = Math.min(1, age * 4) * Math.min(1, (2.6 - age) * 2);
    g.globalAlpha = a;
    g.font = '500 13px Inter, ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    const label = c.label.replace(/_/g, ' ');
    const x = (c.box.x0 + c.box.x1) / 2, y = c.box.y0 - 14 - age * 6;
    const w = g.measureText(label).width + 20;
    g.fillStyle = style.dark ? 'rgba(255,255,255,0.75)' : 'rgba(20,22,26,0.5)';
    g.beginPath(); g.roundRect(x - w / 2, y - 15, w, 22, 11); g.fill();
    g.fillStyle = style.dark ? '#111' : '#fff';
    g.fillText(label, x, y + 1);
    g.globalAlpha = 1;
  }

  // what the AI sees
  if (ui.sight) {
    drawSight(g, {
      sense, creatures, lastGuess, W, H,
      pending: { box: pending.length || current ? box : null, waiting: !!current },
    });
  }
}
requestAnimationFrame(loop);

// handy for experimenting in the browser console: window.thinAir
window.thinAir = { sense, creatures, view, spawn, classify };
