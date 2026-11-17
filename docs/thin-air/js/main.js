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
import { creatures, spawn, setLabel, updateCreatures, drawCreatures, removeLast, clearAll, remove, creatureAt, tickDying, FAVOURITES } from './creatures.js';
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
const ui = { sight: false, paused: false };
let pending = [];        // finished strokes waiting to be recognised (3D points)
const pens = {};         // strokes being drawn right now, one per pen: { mouse: [...], left: [...], right: [...] }
let penUpAt = 0;         // when a pen was last lifted
let lastGuess = null;    // newest top-5 guesses (for the overlay)
let selected = null;     // creature picked with the mouse (Delete removes it)
const chips = [];        // little name labels that fade after a recognition
const WAIT = 1100;       // ms of no drawing before we "name" the drawing
const drawing = () => Object.keys(pens).length > 0;

// ── pens: the mouse and each hand are separate pens ──────────────────────────
function penDown(id, x, y, z) {
  pens[id] = [];
  penMove(id, x, y, z);
}
function penMove(id, x, y, z) {
  const stroke = pens[id];
  if (!stroke) return;
  const last = stroke[stroke.length - 1];
  const q = last && project(last);
  if (!last || Math.hypot(q.x - x, q.y - y) > 2.5) stroke.push(unproject(x, y, z));
}
function penUp(id) {
  const stroke = pens[id];
  if (!stroke) return;
  if (stroke.length >= 2) pending.push(stroke);
  delete pens[id];
  penUpAt = performance.now();
}

// mouse / trackpad / pen tablet also draw (handy without a camera, too)
let mouse = null;
canvas.addEventListener('pointerdown', (e) => { mouse = { x: e.clientX, y: e.clientY, moved: 0 }; penDown('mouse', e.clientX, e.clientY, 0); });
canvas.addEventListener('pointermove', (e) => {
  if (!mouse) return;
  mouse.moved += Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
  mouse.x = e.clientX; mouse.y = e.clientY;
  penMove('mouse', e.clientX, e.clientY, 0);
});
addEventListener('pointerup', (e) => {
  if (!mouse) return;
  if (mouse.moved < 4) {
    // a click (no drag): select a drawing. Click it again → the AI's next guess.
    delete pens.mouse;
    const c = creatureAt(e.clientX, e.clientY);
    if (c && c === selected) { setLabel(c, (c.gi + 1) % c.guesses.length); addChip(c); }
    select(c);
  } else penUp('mouse');
  mouse = null;
});
function select(c) {
  if (selected) selected.selected = false;
  selected = c;
  if (c) c.selected = true;
}

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
function togglePause() {
  ui.paused = !ui.paused;
  $('b-play').classList.toggle('paused', ui.paused);
  document.body.classList.toggle('is-paused', ui.paused);
  $('b-play').title = ui.paused ? 'Play (Space)' : 'Pause (Space)';
}
function undo() { if (pending.length) pending.pop(); else removeLast(); }
function clear() { pending = []; for (const k in pens) delete pens[k]; clearAll(); selected = null; }
function deleteSelected() { if (selected) { remove(selected); selected = null; } }
$('b-sight').onclick = toggleSight;
$('b-paper').onclick = togglePaper;
$('b-play').onclick = togglePause;
$('b-undo').onclick = undo;
$('b-clear').onclick = clear;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePause(); }
  if (k === 'v') toggleSight();
  if (k === 'p') togglePaper();
  if (k === 'z') undo();
  if (k === 'c') clear();
  if (k === 'delete' || k === 'backspace') deleteSelected();
  if (k === 'escape') select(null);
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
const fistTimers = {};
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 1. SEE
  updateVision(now);
  const hands = sense.hands;
  const A = sense.body && sense.body.anchors;

  // head-coupled parallax: the virtual eye follows your real eyes
  const tx = A ? (A.eyes.x - W / 2) * 0.6 : 0, ty = A ? (A.eyes.y - H * 0.4) * 0.4 : 0;
  view.camX += (tx - view.camX) * Math.min(1, dt * 3);
  view.camY += (ty - view.camY) * Math.min(1, dt * 3);

  // 2. DRAW with each hand: pinch = pen down, open = pen up
  for (const h of hands) {
    if (h.pinch) {
      if (!pens[h.key]) penDown(h.key, h.cursor.x, h.cursor.y, h.z);
      else penMove(h.key, h.cursor.x, h.cursor.y, h.z);
    } else penUp(h.key);
  }
  // a hand that vanished mid-stroke ends its stroke
  for (const id in pens) if (id !== 'mouse' && !hands.some((h) => h.key === id)) penUp(id);

  // DELETE with a fist: hold a fist over a drawing for a moment
  for (const h of hands) {
    const t = (fistTimers[h.key] ??= { c: null, time: 0, done: false });
    if (!h.fist) t.done = false;              // open the hand to delete another one
    const c = h.fist && !t.done ? creatureAt(h.centre.x, h.centre.y, 30) : null;
    if (c && c === t.c) { t.time += dt; if (t.time > 0.35) { remove(c); t.c = null; t.time = 0; t.done = true; } }
    else { t.c = c; t.time = 0; }
    h.fistOn = t.c; h.fistProgress = t.time / 0.35;
  }

  // 3. NAME the drawing once you've paused
  if (pending.length && !drawing() && now - penUpAt > WAIT) nameDrawing();

  // 4. LIVE (unless paused)
  tickDying(dt);
  if (!ui.paused) {
    updateCreatures(dt, { W, H, anchors: A, hands });
    tickBoil(now);
  }

  // 5. PAINT
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.lineCap = g.lineJoin = 'round';

  drawCreatures(g);

  // strokes not yet named: slightly breathing while the AI "watches"
  const waitingAlpha = 0.75 + 0.25 * Math.sin(now / 160);
  const live = Object.values(pens);
  let box = null;
  for (const s of [...pending, ...live]) {
    const pts = s.map(project);
    drawLine(g, pts, live.includes(s) ? 1 : waitingAlpha);
    for (const p of pts) {
      box = box || { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x);
      box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y);
    }
  }

  // hand cursors: a ring when hovering, a dot when drawing (bigger = closer),
  // and a filling circle when a fist is deleting something
  const ink = style.dark ? 'rgba(20,20,20,0.8)' : 'rgba(255,255,255,0.9)';
  for (const h of hands) {
    g.strokeStyle = g.fillStyle = ink;
    g.lineWidth = 1.5;
    if (h.fistOn) {
      g.strokeStyle = 'rgba(255,120,110,0.95)';
      g.beginPath(); g.arc(h.centre.x, h.centre.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, h.fistProgress)); g.stroke();
      continue;
    }
    const r = 7 * (view.f / (view.f - h.z));
    g.beginPath(); g.arc(h.cursor.x, h.cursor.y, h.pinch ? 3.5 : r, 0, 7);
    h.pinch ? g.fill() : g.stroke();
  }

  // the selected drawing gets a dashed frame
  if (selected && selected.box && creatures.includes(selected)) {
    const b = selected.box;
    g.setLineDash([4, 5]); g.strokeStyle = ink; g.lineWidth = 1;
    g.strokeRect(b.x0 - 12, b.y0 - 12, b.x1 - b.x0 + 24, b.y1 - b.y0 + 24);
    g.setLineDash([]);
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
      pending: { box, waiting: drawing() },
    });
  }
}
requestAnimationFrame(loop);

// handy for experimenting in the browser console: window.thinAir
window.thinAir = { sense, creatures, view, spawn, classify };
