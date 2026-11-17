// ─────────────────────────────────────────────────────────────────────────────
// sight.js — "what the AI sees". Toggle with the eye button or the V key.
//
// Two parts:
//  • drawn on the camera: hand skeletons with their gesture, body points,
//    the spots creatures can land on, and for each drawing its name,
//    confidence and what it is doing right now
//  • a glass card (top right): tracking status, the tiny 28×28 picture the
//    recognizer actually looked at, and its top five guesses
// ─────────────────────────────────────────────────────────────────────────────

import { recognizerCanvas } from './recognize.js';
import { inkColour } from './ink.js';

const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const BODY_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [7, 2], [2, 5], [5, 8]];
const BODY_DOTS = [0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const GESTURE = { fist: '✊ fist', point: '☝️ point', peace: '✌️ erase', thumb: '👍 finish', open: '🖐 open' };

const C = { line: 'rgba(150, 220, 255, 0.8)', dim: 'rgba(150, 220, 255, 0.32)', text: 'rgba(240, 248, 255, 0.95)', warm: 'rgba(255, 216, 140, 0.95)' };
const FONT = '500 10.5px "SF Mono", ui-monospace, Menlo, monospace';

// a small rounded label
function tag(g, text, x, y, color = C.text, align = 'left') {
  g.font = FONT;
  const w = g.measureText(text).width;
  const bx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  g.fillStyle = 'rgba(12, 14, 18, 0.62)';
  g.beginPath(); g.roundRect(bx - 6, y - 11, w + 12, 17, 6); g.fill();
  g.fillStyle = color; g.textAlign = 'left';
  g.fillText(text, bx, y + 1);
}
function cross(g, p, r = 5) {
  g.beginPath(); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r); g.stroke();
}
function brackets(g, b, pad = 8) {
  const x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
  const L = Math.min(12, (x1 - x0) / 3, (y1 - y0) / 3);
  g.beginPath();
  g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0);
  g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L);
  g.moveTo(x1, y1 - L); g.lineTo(x1, y1); g.lineTo(x1 - L, y1);
  g.moveTo(x0 + L, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - L);
  g.stroke();
}

export function drawSight(g, { sense, creatures, pendingBoxes }) {
  g.save();
  g.lineWidth = 1;

  // ── people: skeleton dots, landing spots, colour ──
  for (const person of sense.people) {
    const P = person.pts, col = inkColour(person.slot);
    g.strokeStyle = C.dim;
    g.beginPath();
    for (const [a, b] of BODY_BONES) if (P[a].v > 0.5 && P[b].v > 0.5) { g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); }
    g.stroke();
    g.fillStyle = C.line;
    for (const i of BODY_DOTS) if (P[i].v > 0.5) { g.beginPath(); g.arc(P[i].x, P[i].y, 2, 0, 7); g.fill(); }
    const A = person.anchors;
    if (A) {
      g.strokeStyle = C.warm;
      for (const [name, p] of [['head', A.head], ['L shoulder', A.lShoulder], ['R shoulder', A.rShoulder]]) if (p) { cross(g, p); tag(g, name, p.x + 9, p.y - 7, C.warm); }
      tag(g, `person ${person.slot + 1}`, A.head.x, A.head.y - 26, col, 'center');
    }
  }

  // ── hands: skeleton + gesture ──
  for (const h of sense.hands) {
    g.strokeStyle = C.line;
    g.beginPath();
    for (const [a, b] of HAND_BONES) { g.moveTo(h.pts[a].x, h.pts[a].y); g.lineTo(h.pts[b].x, h.pts[b].y); }
    g.stroke();
    g.fillStyle = C.text;
    for (const p of h.pts) { g.beginPath(); g.arc(p.x, p.y, 1.6, 0, 7); g.fill(); }
    const pen = h.pen ? (h.pen.on ? 'pen on' : 'pen off') : '';
    tag(g, `${GESTURE[h.shape]} · ${pen}`, h.pts[0].x, h.pts[0].y + 26, C.text, 'center');
  }

  // ── drawings: name, confidence, what it's doing ──
  for (const c of creatures) {
    if (!c.box || !isFinite(c.box.x0)) continue;
    g.strokeStyle = C.line;
    brackets(g, c.box);
    const p = c.guesses[c.gi]?.p ?? 0;
    tag(g, `${c.label.replace(/_/g, ' ')}  ${(p * 100).toFixed(0)}%`, c.box.x0 - 8, c.box.y0 - 18);
    tag(g, c.intent, c.box.x0 - 8, c.box.y1 + 24, C.warm);
  }
  // ── unfinished drawings ──
  for (const { box, pen } of pendingBoxes) {
    g.setLineDash([3, 4]); g.strokeStyle = C.dim; brackets(g, box, 12); g.setLineDash([]);
    tag(g, pen.on ? 'drawing · 👍 to finish' : 'paused · ✊ to resume · 👍 to finish', box.x0 - 12, box.y0 - 20, C.dim);
  }
  g.restore();
}

// ── the glass card (HTML, updated a few times a second) ──────────────────────
const $ = (id) => document.getElementById(id);
let lastPanel = 0, shownGuess = null;
const preview = $('sp-input')?.getContext('2d');

export function updatePanel(now, { sense, lastGuess, show }) {
  if (!show || now - lastPanel < 200) return;
  lastPanel = now;
  $('sp-status').innerHTML =
    `<span><i class="${sense.hands.length ? 'on' : ''}"></i>${sense.hands.length} hand${sense.hands.length === 1 ? '' : 's'}</span>` +
    `<span><i class="${sense.people.length ? 'on' : ''}"></i>${sense.people.length} ${sense.people.length === 1 ? 'person' : 'people'}</span>` +
    `<span>${sense.fps} fps</span>`;
  if (lastGuess && lastGuess !== shownGuess) {
    shownGuess = lastGuess;
    preview.imageSmoothingEnabled = false;
    preview.clearRect(0, 0, 112, 112);
    preview.drawImage(recognizerCanvas, 0, 0, 112, 112);
    $('sp-guesses').innerHTML = lastGuess.map((r, i) =>
      `<li class="${i ? '' : 'top'}"><span>${r.label.replace(/_/g, ' ')}</span><b style="--p:${Math.max(0.02, r.p)}"></b><em>${(r.p * 100).toFixed(0)}%</em></li>`).join('');
  }
}
