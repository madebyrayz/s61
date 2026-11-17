// ─────────────────────────────────────────────────────────────────────────────
// main.js — the conductor. Starts the camera, then runs one loop, ~60× a second:
//
//   1. SEE      ask vision.js for hands (with gestures) and people
//   2. PEN      turn gestures into pen actions, per person:
//                 ✊ fist        pen on / pen off (pen off = bring it to life)
//                 ☝️ point       draw from the index fingertip (while pen is on)
//                 ✌️ two fingers erase
//   3. LIVE     let every creature think and move (creatures.js + effects.js)
//   4. PAINT    clear the canvas and draw ink, creatures and the overlay
// ─────────────────────────────────────────────────────────────────────────────

import { sense, loadVision, updateVision } from './vision.js';
import { loadRecognizer, classify, setFavourites } from './recognize.js';
import { view, project, unproject, drawLine, style, tickBoil, inkColour } from './ink.js';
import { creatures, spawn, setLabel, updateCreatures, drawCreatures, removeLast, clearAll, remove, creatureAt, tickDying, eraseCreatures, FAVOURITES } from './creatures.js';
import { drawSight, updatePanel } from './sight.js';

const $ = (id) => document.getElementById(id);
const video = $('cam'), canvas = $('ink'), g = canvas.getContext('2d');

// ── canvas size ──────────────────────────────────────────────────────────────
// Retina screens have 2 pixels per CSS pixel; we cap at 1.5 to keep cool.
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
const ui = { sight: false, paused: false, parallax: false, erase: false };
let lastGuess = null;    // newest top-5 guesses (for the overlay)
let selected = null;     // drawing picked with the mouse (Delete removes it)
const chips = [];        // name labels that fade in after a drawing comes alive
const ERASER = 30;       // eraser radius in px

// Each PERSON has their own pen and their own unfinished drawing.
// Person 0 = "no body tracked" (e.g. only a hand in view) and the mouse.
const pens = {};
function penOf(personId) {
  return (pens[personId] ??= { on: false, strokes: [], live: {}, ci: 0, lastDraw: 0 });
}
// colour slot of a person (0 white, 1 coral, 2 sky …)
const slotOf = (personId) => sense.people.find((p) => p.id === personId)?.slot ?? 0;

// ── drawing primitives ───────────────────────────────────────────────────────
function strokeStart(pen, key, x, y, z) {
  const s = [];
  s.ci = pen.ci;
  pen.live[key] = s;
  strokeAdd(pen, key, x, y, z);
}
function strokeAdd(pen, key, x, y, z) {
  const s = pen.live[key];
  if (!s) return;
  const last = s[s.length - 1];
  const q = last && project(last);
  if (!last || Math.hypot(q.x - x, q.y - y) > 2.5) s.push(unproject(x, y, z));
  pen.lastDraw = performance.now();
}
function strokeEnd(pen, key) {
  const s = pen.live[key];
  if (!s) return;
  if (s.length >= 2) pen.strokes.push(s);
  delete pen.live[key];
}

// Finish: name the drawing and turn it into a creature.
function finish(pen) {
  for (const k in pen.live) strokeEnd(pen, k);
  if (!pen.strokes.length) return;
  const flat = pen.strokes.map((s) => s.map(project));    // what you see
  const guesses = classify(flat);
  lastGuess = guesses;
  const c = spawn(pen.strokes, guesses.length ? guesses : [{ label: 'doodle', p: 0 }], pen.ci);
  chips.push({ c, t: performance.now() });
  pen.strokes = [];
}

// Erase: rub out unfinished lines (anyone's) and living drawings.
function eraseAt(x, y, r = ERASER) {
  for (const pen of Object.values(pens)) {
    const out = [];
    for (const s of pen.strokes) {
      let run = [];
      run.ci = s.ci;
      for (const p of s) {
        const q = project(p);
        if (Math.hypot(q.x - x, q.y - y) < r) { if (run.length > 1) out.push(run); run = []; run.ci = s.ci; }
        else run.push(p);
      }
      if (run.length > 1) out.push(run);
    }
    pen.strokes = out;
  }
  eraseCreatures(x, y, r);
}

// ── mouse / trackpad: always "pen on"; ✨ button or Enter finishes ────────────
let mouse = null;
canvas.addEventListener('pointerdown', (e) => {
  mouse = { x: e.clientX, y: e.clientY, moved: 0 };
  if (ui.erase) eraseAt(e.clientX, e.clientY);
  else { const pen = penOf(0); pen.ci = 0; strokeStart(pen, 'mouse', e.clientX, e.clientY, 0); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!mouse) return;
  mouse.moved += Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (ui.erase) eraseAt(e.clientX, e.clientY);
  else strokeAdd(penOf(0), 'mouse', e.clientX, e.clientY, 0);
});
addEventListener('pointerup', (e) => {
  if (!mouse) return;
  const pen = penOf(0);
  if (mouse.moved < 4 && !ui.erase) {
    // a click: select a drawing; click it again → the AI's next guess
    delete pen.live.mouse;
    const c = creatureAt(e.clientX, e.clientY);
    if (c && c === selected) { setLabel(c, (c.gi + 1) % c.guesses.length); chips.push({ c, t: performance.now() }); }
    select(c);
  } else strokeEnd(pen, 'mouse');
  mouse = null;
});
function select(c) {
  if (selected) selected.selected = false;
  selected = c;
  if (c) c.selected = true;
}

// ── buttons & keys ───────────────────────────────────────────────────────────
const toggle = (key, id, cls) => { ui[key] = !ui[key]; $(id).classList.toggle('active', ui[key]); if (cls) document.body.classList.toggle(cls, ui[key]); };
function toggleSight() { toggle('sight', 'b-sight', 'sight-on'); }
function togglePaper() { style.dark = !style.dark; document.body.classList.toggle('paper', style.dark); $('b-paper').classList.toggle('active', style.dark); }
function togglePause() {
  ui.paused = !ui.paused;
  $('b-play').classList.toggle('paused', ui.paused);
  document.body.classList.toggle('is-paused', ui.paused);
}
function toggleErase() { toggle('erase', 'b-erase', 'erasing'); }
function finishAll() { for (const pen of Object.values(pens)) finish(pen); }
function undo() {
  const pen = Object.values(pens).filter((p) => p.strokes.length).sort((a, b) => b.lastDraw - a.lastDraw)[0];
  if (pen) pen.strokes.pop(); else removeLast();
}
function clear() { for (const k in pens) delete pens[k]; clearAll(); selected = null; }
$('b-sight').onclick = toggleSight;
$('b-paper').onclick = togglePaper;
$('b-play').onclick = togglePause;
$('b-erase').onclick = toggleErase;
$('b-finish').onclick = finishAll;
$('b-undo').onclick = undo;
$('b-clear').onclick = clear;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePause(); }
  if (k === 'enter') finishAll();
  if (k === 'v') toggleSight();
  if (k === 'p') togglePaper();
  if (k === 'e') toggleErase();
  if (k === 'd') ui.parallax = !ui.parallax;
  if (k === 'z') undo();
  if (k === 'c') clear();
  if (k === 'delete' || k === 'backspace') { if (selected) { remove(selected); selected = null; } }
  if (k === 'escape') select(null);
  if (k === 'h') document.body.classList.toggle('clean');
});

// ── start ────────────────────────────────────────────────────────────────────
$('go').onclick = async () => {
  const btn = $('go'), status = $('status');
  btn.disabled = true;
  try {
    status.textContent = 'asking for the camera…';
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false,
    });
    await video.play();
    await Promise.all([loadVision(video, (s) => (status.textContent = s + '…')), loadRecognizer()]);
  } catch (err) {
    console.error(err);
    status.textContent = 'Camera or models unavailable (' + (err.message || err.name) + '). You can still draw with the mouse.';
    setTimeout(() => $('start').classList.add('gone'), 2600);
    showUI();
    return;
  }
  $('start').classList.add('gone');
  showUI();
};
function showUI() { document.body.classList.add('running'); }
setFavourites(FAVOURITES);
loadRecognizer().catch((e) => console.warn('recognizer', e));

// ── the loop ─────────────────────────────────────────────────────────────────
let last = performance.now();
const handState = {};    // per hand: has its current gesture already fired?
const ripples = [];      // expanding rings: feedback when a gesture fires

// The pill at the top: a short message whenever the pen changes state.
let pillTimer = 0;
function showPill(text, ci) {
  const el = $('pill');
  el.textContent = text;
  el.style.setProperty('--ink', inkColour(ci));
  el.classList.add('on');
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 1. SEE
  updateVision(now);
  const hands = sense.hands;

  // depth parallax (D key): the virtual eye follows the first face
  const A = ui.parallax && sense.people[0]?.anchors;
  const tx = A ? (A.eyes.x - W / 2) * 0.6 : 0, ty = A ? (A.eyes.y - H * 0.4) * 0.4 : 0;
  view.camX += (tx - view.camX) * Math.min(1, dt * 3);
  view.camY += (ty - view.camY) * Math.min(1, dt * 3);

  // 2. PEN — gestures → actions, for each hand
  for (const h of hands) {
    const pen = penOf(h.person);
    pen.ci = slotOf(h.person);
    const st = (handState[h.id] ??= { shape: null, fired: false });
    if (st.shape !== h.shape) { st.shape = h.shape; st.fired = false; }

    // ✊ held a moment: pen on — or pen off, which brings the drawing to life
    if (h.shape === 'fist' && !st.fired && h.held > 0.3) {
      st.fired = true;
      strokeEnd(pen, h.id);
      pen.on = !pen.on;
      let text = '✎  Pen on · point ☝️ to draw';
      if (!pen.on) {
        const had = pen.strokes.length > 0;
        finish(pen);
        text = had ? '✨  Pen off · bringing it to life' : 'Pen off';
      }
      ripples.push({ x: h.centre.x, y: h.centre.y, t: now, ci: pen.ci, on: pen.on, big: !pen.on });
      showPill(text, pen.ci);
    }
    // ☝️ with the pen on: draw. Any other shape lifts the pen.
    if (h.shape === 'point' && pen.on) {
      if (!pen.live[h.id]) strokeStart(pen, h.id, h.cursor.x, h.cursor.y, h.z);
      else strokeAdd(pen, h.id, h.cursor.x, h.cursor.y, h.z);
    } else strokeEnd(pen, h.id);
    // ✌️ erase
    if (h.shape === 'peace') eraseAt(h.cursor.x, h.cursor.y);
    h.pen = pen;
  }
  // a hand that left the picture ends its line
  for (const pen of Object.values(pens)) for (const k in pen.live) if (k !== 'mouse' && !hands.some((h) => String(h.id) === k)) strokeEnd(pen, k);

  // 3. LIVE
  tickDying(dt);
  if (!ui.paused) {
    updateCreatures(dt, { W, H, people: sense.people, hands });
    tickBoil(now);
  }

  // 4. PAINT
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.lineCap = g.lineJoin = 'round';

  drawCreatures(g);

  // unfinished drawings: breathing gently until the pen goes off
  const pendingBoxes = [];
  for (const pen of Object.values(pens)) {
    const liveStrokes = Object.values(pen.live);
    const all = [...pen.strokes, ...liveStrokes];
    if (!all.length) continue;
    let box = null;
    for (const s of all) {
      const pts = s.map(project);
      drawLine(g, pts, liveStrokes.includes(s) ? 1 : 0.8 + 0.15 * Math.sin(now / 300), 1, s.ci ?? pen.ci);
      for (const p of pts) {
        box = box || { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x);
        box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y);
      }
    }
    pendingBoxes.push({ box, pen });
  }

  // gesture ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i], k = (now - r.t) / 600;
    if (k > 1) { ripples.splice(i, 1); continue; }
    g.strokeStyle = inkColour(r.ci); g.lineWidth = 2 * (1 - k);
    g.globalAlpha = 1 - k;
    g.beginPath(); g.arc(r.x, r.y, 18 + k * (r.big ? 90 : 50), 0, 7); g.stroke();
    if (!r.on) { g.beginPath(); g.moveTo(r.x - 10, r.y - 10); g.lineTo(r.x + 10, r.y + 10); g.stroke(); }
    g.globalAlpha = 1;
  }

  // hand cursors in each person's colour
  for (const h of hands) if (h.pen) drawCursor(h);

  // the selected drawing gets a dashed frame
  if (selected && selected.box && creatures.includes(selected)) {
    const b = selected.box;
    g.setLineDash([4, 5]); g.strokeStyle = inkColour(selected.ci); g.lineWidth = 1;
    g.strokeRect(b.x0 - 12, b.y0 - 12, b.x1 - b.x0 + 24, b.y1 - b.y0 + 24);
    g.setLineDash([]);
  }

  drawChips(now);
  if (ui.sight) drawSight(g, { sense, creatures, pendingBoxes });
  updatePanel(now, { sense, lastGuess, show: ui.sight });
}

// Cursor: hollow ring = pen off · dot = pen on · dashed circle = eraser ·
// a ring filling up = a fist being held
function drawCursor(h) {
  const col = inkColour(h.pen.ci);
  g.strokeStyle = g.fillStyle = col;
  g.lineWidth = 1.5;
  const { x, y } = h.cursor;
  if (h.shape === 'peace') {
    g.setLineDash([3, 4]); g.beginPath(); g.arc(x, y, ERASER, 0, 7); g.stroke(); g.setLineDash([]);
    drawTag('erasing', x, y + ERASER + 16, col);
    return;
  }
  if (h.shape === 'fist') {
    const k = Math.min(1, h.held / 0.3), c = h.centre;
    g.globalAlpha = 0.3; g.beginPath(); g.arc(c.x, c.y, 18, 0, 7); g.stroke(); g.globalAlpha = 1;
    g.beginPath(); g.arc(c.x, c.y, 18, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
    const label = k < 1 ? (h.pen.on ? 'pen off…' : 'pen on…') : (h.pen.on ? 'pen on' : 'pen off');
    drawTag(label, c.x, c.y + 38, col);
    return;
  }
  if (h.pen.on) {
    // pen on: a solid dot on the fingertip; while pointing (= drawing) it has
    // a soft halo; otherwise a ring says "pen is up, point to draw"
    g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    if (h.shape === 'point') { g.globalAlpha = 0.25; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.globalAlpha = 1; }
    else { g.globalAlpha = 0.6; g.setLineDash([2, 3]); g.beginPath(); g.arc(x, y, 11, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; drawTag('pen up', x, y + 28, col); }
  } else {
    g.globalAlpha = 0.7; g.beginPath(); g.arc(x, y, 8, 0, 7); g.stroke(); g.globalAlpha = 1;
  }
}

function drawTag(text, x, y, col) {
  g.font = '500 11px Inter, ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  const w = g.measureText(text).width + 14;
  g.fillStyle = style.dark ? 'rgba(255,255,255,0.75)' : 'rgba(16,18,22,0.55)';
  g.beginPath(); g.roundRect(x - w / 2, y - 12, w, 18, 9); g.fill();
  g.fillStyle = style.dark ? '#111' : col;
  g.fillText(text, x, y + 1);
}

// name chips that fade after a drawing comes alive (when Sight is off)
function drawChips(now) {
  for (let i = chips.length - 1; i >= 0; i--) {
    const { c, t } = chips[i];
    const age = (now - t) / 1000;
    if (age > 2.6 || !creatures.includes(c)) { chips.splice(i, 1); continue; }
    if (ui.sight || !c.box || !isFinite(c.box.x0)) continue;
    g.globalAlpha = Math.min(1, age * 4) * Math.min(1, (2.6 - age) * 2);
    drawTag(c.label.replace(/_/g, ' '), (c.box.x0 + c.box.x1) / 2, c.box.y0 - 16 - age * 6, inkColour(c.ci));
    g.globalAlpha = 1;
  }
}

requestAnimationFrame(loop);

// handy for experimenting in the browser console: window.thinAir
window.thinAir = { sense, creatures, view, spawn, classify, pens, finishAll };
