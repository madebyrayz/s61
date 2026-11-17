// ─────────────────────────────────────────────────────────────────────────────
// vision.js — the computer's eyes.
//
// Two small neural networks from Google's MediaPipe watch the webcam:
//   • HandLandmarker finds 21 points on your hand (wrist, knuckles, fingertips)
//   • PoseLandmarker finds 33 points on your body (nose, eyes, shoulders, …)
// Both run locally on your laptop's GPU. Nothing is uploaded anywhere.
//
// This file turns their raw answers into things the rest of the app can use:
//   sense.hand  → where your fingertip is on screen, and are you pinching?
//   sense.body  → "anchors": the top of your head, your shoulders, your eyes…
// ─────────────────────────────────────────────────────────────────────────────

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '../lib/vision_bundle.mjs';

// Everything other files read lives in this one object.
export const sense = {
  ready: false,
  hand: null,   // null when no hand is visible
  body: null,   // null when no person is visible
  fps: 0,
};

let handNet = null, poseNet = null;
let video = null;

// ── loading ──────────────────────────────────────────────────────────────────
// `onStep` lets main.js show "loading hand model…" while we wait.
export async function loadVision(videoEl, onStep = () => {}) {
  video = videoEl;
  onStep('loading vision runtime');
  const files = await FilesetResolver.forVisionTasks('lib/wasm');

  // Try the GPU first (fast, cool laptop). If the browser refuses, use the CPU.
  const make = async (Task, path, extra) => {
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await Task.createFromOptions(files, {
          baseOptions: { modelAssetPath: path, delegate },
          runningMode: 'VIDEO',
          ...extra,
        });
      } catch (e) { console.warn(path, delegate, 'failed', e); }
    }
    throw new Error('could not start ' + path);
  };

  onStep('loading hand model');
  handNet = await make(HandLandmarker, 'models/hand_landmarker.task', {
    numHands: 1,                     // one hand is enough, and twice as cheap
    minHandDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  onStep('loading body model');
  poseNet = await make(PoseLandmarker, 'models/pose_landmarker_lite.task', {
    numPoses: 1,
  });
  sense.ready = true;
}

// ── mapping camera coordinates to the screen ─────────────────────────────────
// MediaPipe answers in 0..1 "normalised" camera coordinates. The video fills
// the window like CSS `object-fit: cover` and is mirrored (like a selfie), so we
// do the same maths here to put each point exactly where you see it.
function mapper() {
  const W = innerWidth, H = innerHeight;
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const k = Math.max(W / vw, H / vh);           // cover: scale up to fill
  const dw = vw * k, dh = vh * k;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;   // centred, edges cropped
  return (p) => ({ x: ox + (1 - p.x) * dw, y: oy + p.y * dh, v: p.visibility ?? 1 });
}

// ── a small smoothing filter ─────────────────────────────────────────────────
// Tracking points jitter a little from frame to frame. The "One Euro filter"
// smooths a lot when you move slowly (steady lines) and little when you move
// fast (no lag). It is a standard trick in hand-tracking apps.
class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02) { this.min = minCutoff; this.beta = beta; this.x = null; this.dx = 0; }
  filter(x, dt) {
    if (this.x === null) { this.x = x; return x; }
    const a = (c) => 1 / (1 + 1 / (2 * Math.PI * c * dt));
    const dx = (x - this.x) / dt;
    this.dx += a(1) * (dx - this.dx);
    const cutoff = this.min + this.beta * Math.abs(this.dx);
    this.x += a(cutoff) * (x - this.x);
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}
const fx = new OneEuro(), fy = new OneEuro();

// ── the per-frame update ─────────────────────────────────────────────────────
let lastVideoTime = -1, lastRun = 0, frame = 0, fpsT = 0, fpsN = 0;
let pinching = false;
let palmRef = 0;            // your "usual" hand size, for depth
let depth = 0;              // smoothed depth of the hand
let prevCursor = null;
let missing = 0;            // frames since the hand was last seen

export function updateVision(now) {
  if (!sense.ready || video.readyState < 2) return;
  // only run when the camera has a NEW picture, and at most ~30 times a second
  if (video.currentTime === lastVideoTime || now - lastRun < 30) return;
  const dt = Math.min(0.1, (now - lastRun) / 1000) || 1 / 30;
  lastVideoTime = video.currentTime;
  lastRun = now;
  frame++;
  fpsN++;
  if (now - fpsT > 1000) { sense.fps = fpsN; fpsN = 0; fpsT = now; }

  const map = mapper();

  // HAND: every frame (it drives the pen, so it must be responsive)
  const h = handNet.detectForVideo(video, now);
  if (h.landmarks && h.landmarks.length) {
    missing = 0;
    readHand(h.landmarks[0].map(map), dt);
  } else if (++missing > 3) {        // forgive a few dropped frames mid-stroke
    sense.hand = null; pinching = false; fx.reset(); fy.reset(); prevCursor = null;
  }

  // BODY: every second frame (it moves slowly; this halves the cost)
  if (frame % 2 === 0) {
    const p = poseNet.detectForVideo(video, now);
    if (p.landmarks && p.landmarks.length) readBody(p.landmarks[0].map(map));
    else sense.body = null;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Hand landmark numbers (MediaPipe's numbering):
//   0 wrist · 4 thumb tip · 8 index tip · 6 index middle joint · 9 middle knuckle
//   12 middle tip · 16 ring tip · 20 pinky tip
function readHand(pts, dt) {
  const palm = dist(pts[0], pts[9]);          // wrist → middle knuckle, in px
  const gap = dist(pts[4], pts[8]) / palm;    // thumb tip ↔ index tip, relative

  // Pinch with "hysteresis": closing below 0.32 starts a stroke, but you have
  // to open past 0.5 to stop. Otherwise the pen would flicker on and off.
  if (!pinching && gap < 0.32) pinching = true;
  else if (pinching && gap > 0.5) pinching = false;

  // The pen tip: halfway between thumb and index tips (where the pinch is).
  const raw = { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
  const cursor = { x: fx.filter(raw.x, dt), y: fy.filter(raw.y, dt) };

  // Depth: a hand closer to the camera looks bigger. We compare the palm size
  // with a slowly-updated "usual" size: bigger than usual → nearer (z > 0).
  palmRef = palmRef ? palmRef + (palm - palmRef) * 0.01 : palm;
  const zTarget = Math.max(-350, Math.min(350, (palm / palmRef - 1) * 900));
  depth += (zTarget - depth) * 0.15;

  // Is the index finger pointing up (tip far from wrist, others folded)?
  // A butterfly may land on it.
  const ext = (tip, mid) => dist(pts[tip], pts[0]) > dist(pts[mid], pts[0]) * 1.15;
  const indexUp = ext(8, 6) && !ext(12, 10) && !pinching;

  const speed = prevCursor ? dist(cursor, prevCursor) / dt : 0;
  prevCursor = cursor;

  sense.hand = {
    pts, palm, pinch: pinching, gap, cursor, z: depth, indexUp, speed,
    tip: pts[8],
  };
}

// Pose landmark numbers: 0 nose · 2 left eye · 5 right eye · 7 left ear ·
// 8 right ear · 9,10 mouth corners · 11 left shoulder · 12 right shoulder ·
// 13,14 elbows · 15,16 wrists. ("left" = YOUR left.)
let smooth = null;
function readBody(pts) {
  // Smooth every point a little so creatures sitting on you don't shake.
  if (!smooth) smooth = pts.map((p) => ({ ...p }));
  pts.forEach((p, i) => {
    const s = smooth[i];
    s.x += (p.x - s.x) * 0.5; s.y += (p.y - s.y) * 0.5; s.v = p.v;
  });
  const P = smooth;
  const seen = (i) => P[i].v > 0.5;
  if (!seen(0) || !seen(2) || !seen(5)) { sense.body = { pts: P, anchors: null }; return; }

  // Head direction: the line between the eyes tells us how the head is tilted.
  const [eA, eB] = P[2].x < P[5].x ? [P[2], P[5]] : [P[5], P[2]]; // screen-left first
  const tilt = Math.atan2(eB.y - eA.y, eB.x - eA.x);
  const up = { x: Math.sin(tilt), y: -Math.cos(tilt) };            // "above my head"
  const eyes = { x: (eA.x + eB.x) / 2, y: (eA.y + eB.y) / 2 };
  const eyeDist = dist(eA, eB);
  const headW = seen(7) && seen(8) ? dist(P[7], P[8]) : eyeDist * 2.3;
  const mouth = { x: (P[9].x + P[10].x) / 2, y: (P[9].y + P[10].y) / 2 };
  const along = (p, d) => ({ x: p.x + up.x * d, y: p.y + up.y * d });

  const a = {
    tilt, up, eyes, eyeDist, headW,
    head: along(eyes, headW * 0.78),                 // top of the head
    nose: P[0],
    lip: { x: (P[0].x + mouth.x) / 2, y: (P[0].y + mouth.y) / 2 }, // moustache spot
    neck: along(mouth, -headW * 0.55),
  };
  if (seen(11) && seen(12)) {
    const sw = dist(P[11], P[12]);
    a.shoulderW = sw;
    a.lShoulder = { x: P[11].x, y: P[11].y - sw * 0.06 };   // sit on top
    a.rShoulder = { x: P[12].x, y: P[12].y - sw * 0.06 };
  }
  sense.body = { pts: P, anchors: a };
}
