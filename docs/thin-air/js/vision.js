// ─────────────────────────────────────────────────────────────────────────────
// vision.js — the computer's eyes.
//
// Two small neural networks from Google's MediaPipe watch the webcam:
//   • HandLandmarker finds 21 points on each hand (wrist, knuckles, fingertips)
//   • PoseLandmarker finds 33 points on each body (nose, eyes, shoulders, …)
// Both run locally on your laptop's GPU. Nothing is uploaded anywhere.
//
// This file turns their raw answers into things the rest of the app can use:
//   sense.people → every person in view, with "anchors" (top of head, eyes,
//                  shoulders…) and a stable id, so each person gets a colour
//   sense.hands  → every hand: which person it belongs to, its GESTURE
//                  (fist, point, thumbs up, two fingers, open) and its fingertip
// ─────────────────────────────────────────────────────────────────────────────

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '../lib/vision_bundle.mjs';

export const MAX_PEOPLE = 3;

// Everything other files read lives in this one object.
export const sense = {
  ready: false,
  hands: [],    // [{ id, person, shape, held, cursor, z, pts, … }]
  people: [],   // [{ id, slot, pts, anchors }]
  fps: 0,
};

let handNet = null, poseNet = null;
let video = null;

// ── loading ──────────────────────────────────────────────────────────────────
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
    numHands: MAX_PEOPLE * 2,
    minHandDetectionConfidence: 0.6,   // a bit stricter = fewer phantom hands
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  onStep('loading body model');
  poseNet = await make(PoseLandmarker, 'models/pose_landmarker_lite.task', {
    numPoses: MAX_PEOPLE,
  });
  sense.ready = true;
}

// ── mapping camera coordinates to the screen ─────────────────────────────────
// MediaPipe answers in 0..1 camera coordinates. The video fills the window like
// CSS `object-fit: cover` and is mirrored (like a selfie), so we do the same
// maths here to put each point exactly where you see it.
function mapper() {
  const W = innerWidth, H = innerHeight;
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const k = Math.max(W / vw, H / vh);
  const dw = vw * k, dh = vh * k;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  return (p) => ({ x: ox + (1 - p.x) * dw, y: oy + p.y * dh, v: p.visibility ?? 1 });
}

// ── a small smoothing filter ─────────────────────────────────────────────────
// The "One Euro filter" smooths a lot when you move slowly (steady lines) and
// little when you move fast (no lag). A standard trick in hand tracking.
class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.015) { this.min = minCutoff; this.beta = beta; this.x = null; this.dx = 0; }
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

// ── reading a gesture from the hand's 3D shape ───────────────────────────────
// MediaPipe also gives "world" landmarks: the hand in real 3D (metres), centred
// on the hand. Using 3D means a finger pointing AT the camera still counts as
// straight, which the flat picture can't tell.
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const cos = (a, b) => (a.x * b.x + a.y * b.y + a.z * b.z) / (len(a) * len(b) || 1);
const d3 = (a, b) => len(sub(a, b));

// How straight is a finger? 1 = perfectly straight, below 0 = curled back.
// joints: [knuckle, middle joint, top joint, tip]
function straightness(w, [m, p, d, t]) {
  return Math.min(cos(sub(w[p], w[m]), sub(w[d], w[p])), cos(sub(w[d], w[p]), sub(w[t], w[d])));
}
const FINGERS = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

// Returns one of: 'fist' 'point' 'peace' 'thumb' 'open'
function readShape(w, pts) {
  const out = {}, curl = {};
  for (const [name, j] of Object.entries(FINGERS)) {
    const s = straightness(w, j);
    // straight AND reaching away from the wrist
    out[name] = s > 0.8 && d3(w[j[3]], w[0]) > d3(w[j[1]], w[0]) * 1.15;
    curl[name] = s < 0.45 || d3(w[j[3]], w[0]) < d3(w[j[1]], w[0]);
  }
  const palm = d3(w[0], w[9]);
  const thumbStraight = straightness(w, [1, 2, 3, 4]) > 0.75;
  const thumbOut = thumbStraight && d3(w[4], w[5]) > palm * 0.75;
  // "up" on screen: the thumb tip clearly above its base
  const thumbUp = thumbOut && (pts[2].y - pts[4].y) > Math.abs(pts[2].x - pts[4].x) * 0.8;
  const folded = curl.index && curl.middle && curl.ring && curl.pinky;

  if (folded && thumbUp) return 'thumb';
  if (folded) return 'fist';
  if (out.index && out.middle && curl.ring && curl.pinky) return 'peace';
  if (out.index && curl.middle && curl.ring && curl.pinky) return 'point';
  return 'open';
}

// A gesture only "counts" once it has been seen for a few frames in a row.
// That stops one bad frame from switching your pen on or off.
const CONFIRM = { fist: 4, thumb: 5, peace: 3, point: 2, open: 2 };

// ── tracking: which hand is which, which person is which ─────────────────────
// MediaPipe doesn't promise the same order every frame, so we match each new
// detection to the nearest one from the previous frame.
let handTracks = [];      // [{ id, wrist, missing, … }]
let personTracks = [];    // [{ id, slot, nose, missing, smooth }]
let nextHandId = 1, nextPersonId = 1;

function match(tracks, items, posOf, maxDist) {
  const used = new Set(), pairs = [];
  for (const it of items) {
    let best = null, bd = maxDist;
    for (const t of tracks) {
      if (used.has(t)) continue;
      const d = Math.hypot(t.pos.x - posOf(it).x, t.pos.y - posOf(it).y);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) used.add(best);
    pairs.push([it, best]);
  }
  return pairs;
}

// ── the per-frame update ─────────────────────────────────────────────────────
let lastVideoTime = -1, lastRun = 0, frame = 0, fpsT = 0, fpsN = 0;

export function updateVision(now) {
  if (!sense.ready || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime || now - lastRun < 30) return;
  const dt = Math.min(0.1, (now - lastRun) / 1000) || 1 / 30;
  lastVideoTime = video.currentTime;
  lastRun = now;
  frame++;
  fpsN++;
  if (now - fpsT > 1000) { sense.fps = fpsN; fpsN = 0; fpsT = now; }
  const map = mapper();
  const W = innerWidth;

  // BODIES: every second frame (they move slowly; this halves the cost)
  if (frame % 2 === 0) {
    const p = poseNet.detectForVideo(video, now);
    const bodies = (p.landmarks || []).map((lm) => lm.map(map));
    for (const [pts, t] of match(personTracks, bodies, (b) => b[0], W * 0.25)) {
      let track = t;
      if (!track) {
        // give the newcomer the lowest free colour slot
        const taken = new Set(personTracks.map((q) => q.slot));
        let slot = 0; while (taken.has(slot)) slot++;
        track = { id: nextPersonId++, slot, smooth: pts.map((q) => ({ ...q })) };
        personTracks.push(track);
      }
      track.missing = 0; track.seen = frame;
      pts.forEach((q, i) => { const s = track.smooth[i]; s.x += (q.x - s.x) * 0.5; s.y += (q.y - s.y) * 0.5; s.v = q.v; });
      track.pos = track.smooth[0];
    }
    personTracks = personTracks.filter((t) => t.seen === frame || ++t.missing < 8);
    sense.people = personTracks.map((t) => ({ id: t.id, slot: t.slot, pts: t.smooth, anchors: anchorsOf(t.smooth) }));
  }

  // HANDS: every frame (they drive the pens, so they must be responsive)
  const h = handNet.detectForVideo(video, now);
  const found = (h.landmarks || []).map((lm, i) => ({ pts: lm.map(map), world: h.worldLandmarks?.[i] }));
  for (const [det, t] of match(handTracks, found, (d) => d.pts[0], W * 0.18)) {
    let track = t;
    if (!track) {
      track = { id: nextHandId++, fx: new OneEuro(), fy: new OneEuro(), raw: 'open', rawN: 0, shape: 'open', held: 0, depth: 0, palmRef: 0 };
      handTracks.push(track);
    }
    track.missing = 0; track.seen = frame;
    track.pos = det.pts[0];
    track.last = readHand(track, det, dt);
  }
  handTracks = handTracks.filter((t) => t.seen === frame || ++t.missing < 5);
  sense.hands = handTracks.filter((t) => t.last).map((t) => t.last);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function readHand(t, { pts, world }, dt) {
  const palm = dist(pts[0], pts[9]);
  const raw = world ? readShape(world, pts) : 'open';

  // confirm a new gesture only after it's been stable for a few frames
  if (raw === t.raw) t.rawN++; else { t.raw = raw; t.rawN = 1; }
  if (t.raw !== t.shape && t.rawN >= CONFIRM[t.raw]) { t.shape = t.raw; t.held = 0; }
  t.held += dt;

  // the pen tip: the index fingertip (for ✌️ the point between the two tips)
  const tip = t.shape === 'peace'
    ? { x: (pts[8].x + pts[12].x) / 2, y: (pts[8].y + pts[12].y) / 2 }
    : pts[8];
  const cursor = { x: t.fx.filter(tip.x, dt), y: t.fy.filter(tip.y, dt) };

  // depth: a hand nearer the camera looks bigger than "usual" → z > 0
  t.palmRef = t.palmRef ? t.palmRef + (palm - t.palmRef) * 0.01 : palm;
  const zTarget = Math.max(-160, Math.min(160, (palm / t.palmRef - 1) * 500));
  t.depth += (zTarget - t.depth) * 0.1;

  return {
    id: t.id, person: ownerOf(pts[0]), pts, palm, cursor, z: t.depth,
    shape: t.shape, raw, held: t.held, centre: pts[9],
  };
}

// Which person does this hand belong to? The one whose wrist (pose points 15,
// 16) is closest; if no wrist is visible, the closest face. 0 = nobody tracked.
function ownerOf(wrist) {
  let best = null, bd = Infinity;
  for (const p of sense.people) {
    for (const i of [15, 16]) {
      const q = p.pts[i];
      if (q.v < 0.3) continue;
      const d = dist(q, wrist);
      if (d < bd) { bd = d; best = p; }
    }
  }
  if (!best) for (const p of sense.people) { const d = dist(p.pts[0], wrist); if (d < bd) { bd = d; best = p; } }
  return best ? best.id : 0;
}

// ── body anchors: the spots creatures can sit on ─────────────────────────────
// Pose landmark numbers: 0 nose · 2 left eye · 5 right eye · 7 left ear ·
// 8 right ear · 9,10 mouth corners · 11 left shoulder · 12 right shoulder ·
// 15,16 wrists. ("left" = the person's own left.)
function anchorsOf(P) {
  const seen = (i) => P[i].v > 0.5;
  if (!seen(0) || !seen(2) || !seen(5)) return null;
  const [eA, eB] = P[2].x < P[5].x ? [P[2], P[5]] : [P[5], P[2]];   // screen-left first
  const tilt = Math.atan2(eB.y - eA.y, eB.x - eA.x);
  const up = { x: Math.sin(tilt), y: -Math.cos(tilt) };              // "above my head"
  const eyes = { x: (eA.x + eB.x) / 2, y: (eA.y + eB.y) / 2 };
  const eyeDist = dist(eA, eB);
  const headW = seen(7) && seen(8) ? dist(P[7], P[8]) : eyeDist * 2.3;
  const mouth = { x: (P[9].x + P[10].x) / 2, y: (P[9].y + P[10].y) / 2 };
  const along = (p, d) => ({ x: p.x + up.x * d, y: p.y + up.y * d });
  const a = {
    tilt, up, eyes, eyeDist, headW,
    head: along(eyes, headW * 0.78),
    nose: P[0],
    lip: { x: (P[0].x + mouth.x) / 2, y: (P[0].y + mouth.y) / 2 },
    neck: along(mouth, -headW * 0.55),
  };
  if (seen(11) && seen(12)) {
    const sw = dist(P[11], P[12]);
    a.shoulderW = sw;
    a.lShoulder = { x: P[11].x, y: P[11].y - sw * 0.06 };
    a.rShoulder = { x: P[12].x, y: P[12].y - sw * 0.06 };
  }
  return a;
}
