// ─────────────────────────────────────────────────────────────────────────────
// sight.js — "what the AI sees". Toggle with the eye button or the V key.
//
// Draws, on top of the camera, everything the machine is perceiving and
// thinking: the hand skeleton, the body points, the spots creatures can land on,
// what each drawing was recognised as (with confidence), what each creature is
// trying to do, and the tiny 28×28 picture the recognizer actually looked at.
// ─────────────────────────────────────────────────────────────────────────────

import { recognizerCanvas } from './recognize.js';

// Which hand points connect to which (bones of the hand skeleton).
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const BODY_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [7, 2], [2, 5], [5, 8]];
const BODY_DOTS = [0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const C = { line: 'rgba(140, 220, 255, 0.85)', dim: 'rgba(140, 220, 255, 0.35)', text: 'rgba(235, 248, 255, 0.95)', warm: 'rgba(255, 214, 120, 0.95)' };
const FONT = '500 11px "SF Mono", ui-monospace, Menlo, monospace';

function tag(g, text, x, y, color = C.text, align = 'left') {
  g.font = FONT;
  g.textAlign = align;
  const w = g.measureText(text).width;
  const bx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  g.fillStyle = 'rgba(10, 14, 18, 0.55)';
  g.beginPath(); g.roundRect(bx - 5, y - 11, w + 10, 16, 4); g.fill();
  g.fillStyle = color;
  g.fillText(text, x, y + 1);
}

function cross(g, p, r = 6) {
  g.beginPath();
  g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y);
  g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r);
  g.stroke();
}

// corner brackets around a box, like a camera's face-detect frame
function brackets(g, b, pad = 8) {
  const x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
  const L = Math.min(14, (x1 - x0) / 3, (y1 - y0) / 3);
  g.beginPath();
  g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0);
  g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L);
  g.moveTo(x1, y1 - L); g.lineTo(x1, y1); g.lineTo(x1 - L, y1);
  g.moveTo(x0 + L, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - L);
  g.stroke();
}

export function drawSight(g, { sense, creatures, pending, lastGuess, W, H }) {
  g.save();
  g.lineWidth = 1;

  // ── body ──
  const body = sense.body;
  if (body) {
    const P = body.pts;
    g.strokeStyle = C.dim;
    g.beginPath();
    for (const [a, b] of BODY_BONES) if (P[a].v > 0.5 && P[b].v > 0.5) { g.moveTo(P[a].x, P[a].y); g.lineTo(P[b].x, P[b].y); }
    g.stroke();
    g.fillStyle = C.line;
    for (const i of BODY_DOTS) if (P[i].v > 0.5) { g.beginPath(); g.arc(P[i].x, P[i].y, 2.2, 0, 7); g.fill(); }
    const A = body.anchors;
    if (A) {
      g.strokeStyle = C.warm;
      const spots = [['head', A.head], ['eyes', A.eyes], ['L shoulder', A.lShoulder], ['R shoulder', A.rShoulder]];
      for (const [name, p] of spots) if (p) { cross(g, p); tag(g, name, p.x + 9, p.y - 6, C.warm); }
    }
  }

  // ── hand ──
  const h = sense.hand;
  if (h) {
    g.strokeStyle = C.line;
    g.beginPath();
    for (const [a, b] of HAND_BONES) { g.moveTo(h.pts[a].x, h.pts[a].y); g.lineTo(h.pts[b].x, h.pts[b].y); }
    g.stroke();
    g.fillStyle = C.text;
    for (const p of h.pts) { g.beginPath(); g.arc(p.x, p.y, 1.8, 0, 7); g.fill(); }
    const state = h.pinch ? 'pinch · drawing' : h.indexUp ? 'pointing · perch' : 'open';
    tag(g, `${state}  gap ${h.gap.toFixed(2)}  z ${h.z.toFixed(0)}`, h.pts[0].x, h.pts[0].y + 24, C.text, 'center');
  }

  // ── creatures: label, confidence, intention ──
  for (const c of creatures) {
    if (!c.box || !isFinite(c.box.x0)) continue;
    g.strokeStyle = C.line;
    brackets(g, c.box);
    const p = c.guesses[c.gi]?.p ?? 0;
    tag(g, `${c.label.replace(/_/g, ' ')} ${(p * 100).toFixed(0)}%`, c.box.x0 - 8, c.box.y0 - 16);
    tag(g, c.intent, c.box.x0 - 8, c.box.y1 + 24, C.warm);
  }

  // ── pending drawing ──
  if (pending.box) {
    g.setLineDash([3, 4]); g.strokeStyle = C.dim; brackets(g, pending.box, 12); g.setLineDash([]);
    tag(g, pending.waiting ? 'watching…' : 'thinking…', pending.box.x0 - 12, pending.box.y0 - 20, C.dim);
  }

  // ── panel: the recognizer's view + top guesses ──
  const px = W - 172, py = 64;
  g.fillStyle = 'rgba(10, 14, 18, 0.5)';
  g.beginPath(); g.roundRect(px, py, 156, 196, 10); g.fill();
  g.imageSmoothingEnabled = false;
  g.drawImage(recognizerCanvas, px + 12, py + 12, 84, 84);
  g.imageSmoothingEnabled = true;
  g.font = FONT; g.textAlign = 'left'; g.fillStyle = C.dim;
  g.fillText('model input', px + 104, py + 22);
  g.fillText('28 × 28', px + 104, py + 38);
  (lastGuess || []).slice(0, 5).forEach((r, i) => {
    const y = py + 118 + i * 16;
    g.fillStyle = i ? C.dim : C.text;
    g.fillText(r.label.replace(/_/g, ' '), px + 12, y);
    g.fillStyle = 'rgba(140, 220, 255, 0.5)';
    g.fillRect(px + 100, y - 7, 44 * r.p, 5);
  });

  // ── status line ──
  const dot = (on) => (on ? '●' : '○');
  tag(g, `hand ${dot(h)}   body ${dot(body)}   ${sense.fps} fps`, W - 16, 40, C.text, 'right');
  g.restore();
}
