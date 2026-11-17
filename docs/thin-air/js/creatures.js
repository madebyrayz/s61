// ─────────────────────────────────────────────────────────────────────────────
// creatures.js — drawings that come alive.
//
// Once the recognizer has named a drawing ("butterfly"), it becomes a CREATURE:
// your own lines, plus a little brain. Each brain is a tiny "agent": every
// frame it looks at the world (where is your head? your shoulders? your hand?),
// decides what it wants (a place to land, a face to sit on, to get away from
// your hand…) and steers towards it.
//
// The lines are never replaced by clip art. They are YOUR strokes, moved and
// bent in 3D: butterfly wings fold towards you, fish bodies wave, flowers sway.
// ─────────────────────────────────────────────────────────────────────────────

import { project, drawLine } from './ink.js';

// ── the cast ─────────────────────────────────────────────────────────────────
// Each category gets a behaviour (`b`) and a few settings.
//   fold 'x'  = wings on the left and right (seen from above: butterfly, bat)
//   fold 'up' = wings on top (seen from the side: bird, duck)
//   size      = how big it becomes when it settles, in px
//   perch     = favourite landing spots, in order of preference
const FLY = (o) => ({ b: 'flutter', size: 80, flap: 9, fold: 'up', turn: true, perch: ['head', 'lShoulder', 'rShoulder'], ...o });
const KINDS = {
  butterfly: FLY({ fold: 'x', turn: false, size: 70, flap: 11, perch: ['finger', 'lShoulder', 'rShoulder', 'head'] }),
  bat: FLY({ fold: 'x', turn: false, size: 85, flap: 14 }),
  angel: FLY({ fold: 'x', turn: false, size: 90, flap: 4, perch: ['head'] }),
  bird: FLY({}), owl: FLY({ perch: ['lShoulder', 'rShoulder', 'head'], flap: 7 }),
  parrot: FLY({ perch: ['lShoulder', 'rShoulder', 'finger'] }), duck: FLY({ flap: 10 }),
  swan: FLY({ size: 100, flap: 5 }), flamingo: FLY({ size: 100, flap: 5 }),
  dragon: FLY({ size: 140, flap: 4, perch: ['lShoulder', 'rShoulder'] }),
  bee: { b: 'buzz', size: 38 }, mosquito: { b: 'buzz', size: 34 },

  hat: { b: 'wear', at: 'head', w: 1.35 }, crown: { b: 'wear', at: 'head', w: 1.05 },
  headphones: { b: 'wear', at: 'ears', w: 1.3 }, eyeglasses: { b: 'wear', at: 'eyes', w: 2.6 },
  moustache: { b: 'wear', at: 'lip', w: 1.6 }, beard: { b: 'wear', at: 'chin', w: 1.0 },
  bowtie: { b: 'wear', at: 'neck', w: 1.7 }, necklace: { b: 'wear', at: 'neck', w: 0.9 },

  fish: { b: 'swim', size: 90 }, shark: { b: 'swim', size: 150 }, whale: { b: 'swim', size: 170 },
  dolphin: { b: 'swim', size: 120 }, sea_turtle: { b: 'swim', size: 100, slow: true },
  octopus: { b: 'swim', size: 100, pulse: true, slow: true },

  sun: { b: 'sky' }, star: { b: 'sky' }, moon: { b: 'sky' }, cloud: { b: 'sky' },
  rainbow: { b: 'sky' }, lightning: { b: 'sky' }, hot_air_balloon: { b: 'sky' },
  flying_saucer: { b: 'sky' }, airplane: { b: 'cruise' }, helicopter: { b: 'cruise' },

  flower: { b: 'grow' }, tree: { b: 'grow' }, palm_tree: { b: 'grow' }, house_plant: { b: 'grow' },
  cactus: { b: 'grow' }, grass: { b: 'grow' }, mushroom: { b: 'grow' },
  leaf: { b: 'fall' }, feather: { b: 'fall' }, snowflake: { b: 'fall' },

  snake: { b: 'crawl', size: 140 }, snail: { b: 'crawl', size: 70, slow: true },
  crab: { b: 'crawl', size: 80 }, ant: { b: 'crawl', size: 40 }, scorpion: { b: 'crawl', size: 80 },
  lobster: { b: 'crawl', size: 90 }, spider: { b: 'dangle', size: 60 },
};
export const FAVOURITES = Object.keys(KINDS);

const PLACE_NAMES = {
  head: 'head', lShoulder: 'left shoulder', rShoulder: 'right shoulder', finger: 'fingertip',
  ears: 'ears', eyes: 'eyes', lip: 'upper lip', chin: 'chin', neck: 'neck',
};

export const creatures = [];
let nextId = 1;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── birth ────────────────────────────────────────────────────────────────────
// strokes: 3D points from ink. guesses: [{label, p}, …] from the recognizer.
export function spawn(strokes, guesses) {
  // centre of the drawing, and its radius
  let n = 0, cx = 0, cy = 0, cz = 0;
  for (const s of strokes) for (const p of s) { cx += p.x; cy += p.y; cz += p.z; n++; }
  cx /= n; cy /= n; cz /= n;
  let R = 1;
  for (const s of strokes) for (const p of s) R = Math.max(R, Math.hypot(p.x - cx, p.y - cy));

  // store every point RELATIVE to the centre, in units of the radius
  // (so a point on the edge is ~1 away). Moving or resizing the creature is
  // then just: position + point × size.
  const local = strokes.map((s) => s.map((p) => ({ x: (p.x - cx) / R, y: (p.y - cy) / R, z: (p.z - cz) / R })));
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (const s of local) for (const p of s) {
    bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y);
  }

  const c = {
    id: nextId++, guesses, gi: 0, label: '', cfg: null,
    local, bounds,
    pos: { x: cx, y: cy, z: cz }, vel: { x: 0, y: 0, z: 0 },
    size: R, drawnSize: R,
    yaw: 0, yawTo: 0, roll: 0, age: 0, phase: rand(0, 6.28),
    state: 'born', timer: 0, goal: null, place: null, intent: 'waking up',
    box: null, alpha: 1,
  };
  setLabel(c, 0);
  creatures.push(c);
  if (creatures.length > 14) creatures.shift();   // keep the scene light
  return c;
}

// Change what the creature thinks it is (clicking a label cycles the guesses).
export function setLabel(c, gi) {
  c.gi = gi;
  c.label = c.guesses[gi]?.label || 'doodle';
  c.cfg = KINDS[c.label] || { b: 'float' };
  c.state = 'born'; c.timer = 0; c.place = null; c.goal = null; c.roll = 0; c.yawTo = 0;
}

export function removeLast() { creatures.pop(); }
// Delete one creature with a little "poof" (it shrinks and fades, see drawCreatures).
export function remove(c) { if (c && c.dying === undefined) c.dying = 0; }
// Which creature is under this screen point? (uses the box from the last frame)
export function creatureAt(x, y, pad = 14) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i], b = c.box;
    if (b && c.dying === undefined && x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) return c;
  }
  return null;
}
// Fade out deleted creatures, then forget them.
export function tickDying(dt) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    if (c.dying === undefined) continue;
    c.dying += dt;
    if (c.dying > 0.45) creatures.splice(i, 1);
  }
}
export function clearAll() { creatures.length = 0; }

// ── shared helpers ───────────────────────────────────────────────────────────
// steer: turn the velocity smoothly towards "go to (tx,ty,tz)". Arrives gently.
function steer(c, t, speed, dt, agility = 2.5) {
  const dx = t.x - c.pos.x, dy = t.y - c.pos.y, dz = (t.z ?? 0) - c.pos.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const sp = speed * Math.min(1, d / 120);                 // slow down near it
  const k = Math.min(1, dt * agility);
  c.vel.x += (dx / d * sp - c.vel.x) * k;
  c.vel.y += (dy / d * sp - c.vel.y) * k;
  c.vel.z += (dz / d * sp - c.vel.z) * k;
  return d;
}
function move(c, dt) { c.pos.x += c.vel.x * dt; c.pos.y += c.vel.y * dt; c.pos.z += c.vel.z * dt; }
const ease = (a, b, k) => a + (b - a) * k;
function randomSpot(W, H, zr = 150) {
  return { x: rand(W * 0.12, W * 0.88), y: rand(H * 0.12, H * 0.7), z: rand(-zr, zr) };
}
// How big is the person on screen? Used to size creatures that sit on you.
function bodyScale(A) {
  if (!A) return 1;
  return clamp((A.shoulderW || A.headW * 2.2) / 330, 0.45, 2.2);
}
// Is the hand moving fast close to this creature? (to startle it)
function scared(c, hand, radius = 120) {
  if (!hand) return false;
  const d = Math.hypot(hand.cursor.x - c.pos.x, hand.cursor.y - c.pos.y);
  return d < radius + c.size && hand.speed > 900;
}

// All the landing spots that exist right now (only if the person is visible).
function spots(world) {
  const out = {};
  const A = world.anchors;
  if (A) {
    out.head = A.head;
    if (A.lShoulder) { out.lShoulder = A.lShoulder; out.rShoulder = A.rShoulder; }
  }
  const h = world.hands.find((h) => h.indexUp);
  if (h) out.finger = { x: h.tip.x, y: h.tip.y - 6 };
  return out;
}

// ── behaviours ───────────────────────────────────────────────────────────────
// Each function runs every frame for one creature. dt = seconds since last frame.
const B = {};

// FLUTTER — butterflies and birds: wander, pick a free spot on you, land,
// rest with slow wingbeats, take off if you move suddenly.
B.flutter = (c, dt, w) => {
  const cfg = c.cfg, S = spots(w);
  const scale = bodyScale(w.anchors);
  c.timer -= dt;

  if (c.state === 'born') { c.state = 'wander'; c.timer = rand(1.2, 2.2); c.goal = null; }

  if (c.state === 'wander' || c.state === 'flee') {
    c.size = ease(c.size, cfg.size * scale * 1.2, dt * 0.8);
    if (!c.goal || Math.hypot(c.goal.x - c.pos.x, c.goal.y - c.pos.y) < 60) c.goal = randomSpot(w.W, w.H);
    steer(c, c.goal, c.state === 'flee' ? 520 : 220, dt, 1.8);
    c.intent = c.state === 'flee' ? 'startled, flying off' : 'wandering';
    if (c.timer <= 0) {
      // look for a free landing spot, in order of preference
      const free = cfg.perch.find((p) => S[p] && !w.taken.has(p));
      if (free) { c.state = 'seek'; c.place = free; w.taken.add(free); }
      else c.timer = 1;
    }
  } else if (c.state === 'seek' || c.state === 'perch') {
    const spot = S[c.place];
    if (!spot) { c.state = 'wander'; c.place = null; c.timer = 2; }
    else {
      c.size = ease(c.size, cfg.size * scale, dt * 2);
      const name = PLACE_NAMES[c.place];
      if (c.state === 'seek') {
        // aim so the bottom of the creature touches the spot
        const t = { x: spot.x, y: spot.y - c.bounds.maxY * c.size * 0.8, z: 0 };
        const d = steer(c, t, 380, dt, 3);
        c.intent = '→ ' + name;
        if (d < 14) { c.state = 'perch'; c.timer = rand(7, 14); }
      } else {
        // sitting: glue to the spot (follow it smoothly as you move)
        const t = { x: spot.x, y: spot.y - c.bounds.maxY * c.size * 0.8, z: 0 };
        const prev = { ...c.pos };
        c.pos.x = ease(c.pos.x, t.x, Math.min(1, dt * 14));
        c.pos.y = ease(c.pos.y, t.y, Math.min(1, dt * 14));
        c.pos.z = ease(c.pos.z, 0, dt * 4);
        c.vel.x = (c.pos.x - prev.x) / dt; c.vel.y = 0; c.vel.z = 0;
        c.intent = 'resting on your ' + name;
        const jolt = Math.abs(c.vel.x) > 1400;
        if (jolt || scared(c, w.hand, 60) || c.timer <= 0) {
          c.state = 'flee'; c.goal = null; c.timer = rand(3, 5); c.place = null;
          c.vel.y = -300;
        }
      }
    }
  }
  if (c.state !== 'perch') move(c, dt);
  if (c.state === 'wander' && scared(c, w.hand)) { c.state = 'flee'; c.goal = null; c.timer = 3; }

  // wings: fast while flying, slow lazy open-close while resting
  const resting = c.state === 'perch';
  c.flapSpeed = ease(c.flapSpeed ?? cfg.flap, resting ? 2.2 : cfg.flap, dt * 4);
  c.flapAmp = ease(c.flapAmp ?? 1, resting ? 0.6 : 1.05, dt * 3);
  if (cfg.turn) { if (c.vel.x > 30) c.yawTo = 0; else if (c.vel.x < -30) c.yawTo = Math.PI; }
  else c.roll = ease(c.roll, clamp(c.vel.x * 0.0012, -0.5, 0.5), dt * 3);
  if (!resting) c.pos.y += Math.sin(c.age * c.flapSpeed * 0.5) * 0.6; // bob with the beat
};

// BUZZ — bees: orbit around your head (or your hand), passing in front and behind.
B.buzz = (c, dt, w) => {
  const A = w.anchors;
  const centre = A ? A.eyes : w.hand ? w.hand.cursor : { x: w.W / 2, y: w.H * 0.4 };
  const r = A ? A.headW * 0.95 : 140;
  c.size = ease(c.size, c.cfg.size * bodyScale(A), dt);
  c.orbit = (c.orbit ?? c.phase) + dt * (2.4 + Math.sin(c.age * 1.3) * 0.8);
  const t = {
    x: centre.x + Math.cos(c.orbit) * r + Math.sin(c.age * 7) * 8,
    y: centre.y + Math.sin(c.orbit * 2) * r * 0.35 + Math.cos(c.age * 9) * 6,
    z: Math.sin(c.orbit) * r * 1.4,          // swings in front of / behind you
  };
  steer(c, t, 600, dt, 6); move(c, dt);
  c.flapSpeed = 40; c.flapAmp = 0.5;
  c.roll = clamp(c.vel.x * 0.001, -0.4, 0.4);
  c.intent = A ? 'buzzing around your head' : w.hand ? 'buzzing around your hand' : 'looking for someone';
};

// WEAR — hats, glasses, moustaches: fly onto your face and stay there,
// following your head, its size and its tilt.
B.wear = (c, dt, w) => {
  const A = w.anchors;
  if (!A) {
    c.pos.y += Math.sin(c.age * 2) * 0.3;
    c.intent = 'looking for a face';
    return;
  }
  const { up, headW, eyeDist } = A;
  const down = { x: -up.x, y: -up.y };
  const width = c.bounds.maxX - c.bounds.minX || 1;
  const cfg = c.cfg;
  let anchor, targetW, offset = 0;    // offset: along "up", in local units × size
  switch (cfg.at) {
    case 'head': anchor = A.head; targetW = headW * cfg.w; offset = c.bounds.maxY * 0.8; break;
    case 'ears': anchor = { x: A.eyes.x + up.x * headW * 0.3, y: A.eyes.y + up.y * headW * 0.3 }; targetW = headW * cfg.w; break;
    case 'eyes': anchor = A.eyes; targetW = eyeDist * cfg.w; break;
    case 'lip': anchor = A.lip; targetW = eyeDist * cfg.w; break;
    case 'chin': anchor = { x: A.lip.x + down.x * headW * 0.35, y: A.lip.y + down.y * headW * 0.35 }; targetW = headW * cfg.w; break;
    default: anchor = A.neck; targetW = eyeDist * cfg.w * (c.label === 'necklace' ? 2.4 : 1);
  }
  const size = targetW / width;
  const t = { x: anchor.x + up.x * offset * size, y: anchor.y + up.y * offset * size, z: 0 };
  const d = Math.hypot(t.x - c.pos.x, t.y - c.pos.y);
  const k = Math.min(1, dt * (c.state === 'worn' ? 18 : 3.5));
  c.pos.x = ease(c.pos.x, t.x, k); c.pos.y = ease(c.pos.y, t.y, k); c.pos.z = ease(c.pos.z, 0, k);
  c.size = ease(c.size, size, k);
  c.roll = ease(c.roll, A.tilt, k);
  if (d < 10) c.state = 'worn';
  c.intent = (c.state === 'worn' ? 'worn on your ' : '→ your ') + PLACE_NAMES[cfg.at];
};

// SWIM — fish: cruise through the air like an aquarium, flee from your hand.
B.swim = (c, dt, w) => {
  c.size = ease(c.size, c.cfg.size, dt * 0.6);
  if (!c.goal || Math.hypot(c.goal.x - c.pos.x, c.goal.y - c.pos.y) < 80) c.goal = randomSpot(w.W, w.H, 200);
  let speed = c.cfg.slow ? 70 : 140;
  c.intent = 'swimming';
  const h = w.hand;
  if (h) {
    const dx = c.pos.x - h.cursor.x, dy = c.pos.y - h.cursor.y, d = Math.hypot(dx, dy);
    if (d < 170 + c.size * 0.5) {               // too close: dart away
      c.goal = { x: clamp(c.pos.x + dx / d * 300, 40, w.W - 40), y: clamp(c.pos.y + dy / d * 300, 40, w.H - 40), z: c.pos.z };
      speed = 420; c.intent = 'escaping your hand';
    }
  }
  steer(c, c.goal, speed, dt, 1.2); move(c, dt);
  if (c.vel.x > 20) c.yawTo = 0; else if (c.vel.x < -20) c.yawTo = Math.PI;
  c.swimRate = ease(c.swimRate ?? 4, 3 + Math.hypot(c.vel.x, c.vel.y) / 40, dt * 3);
};

// SKY — sun, stars, clouds, moon: rise to the top of the frame and do their thing.
B.sky = (c, dt, w) => {
  if (c.state === 'born') { c.state = 'rise'; c.goal = { x: clamp(c.pos.x, w.W * 0.1, w.W * 0.9), y: rand(w.H * 0.1, w.H * 0.22), z: -120 }; }
  const L = c.label;
  if (L === 'cloud') c.goal.x += dt * 18 * (c.phase > 3 ? 1 : -1);   // drift with the wind
  if (L === 'hot_air_balloon') c.goal.y = w.H * 0.18 + Math.sin(c.age * 0.4) * 40;
  if (c.goal.x > w.W + 100) c.goal.x = c.pos.x = -100;
  if (c.goal.x < -100) c.goal.x = c.pos.x = w.W + 100;
  steer(c, c.goal, 160, dt, 1.5); move(c, dt);
  c.size = ease(c.size, Math.min(c.drawnSize, 120), dt * 0.5);
  if (L === 'sun') c.roll += dt * 0.25;
  if (L === 'star') { c.yaw += dt * 0.9; c.yawTo = c.yaw; c.alpha = 0.75 + 0.25 * Math.sin(c.age * 5 + c.phase); }
  if (L === 'moon') c.roll = Math.sin(c.age * 0.7) * 0.25;
  if (L === 'flying_saucer') { c.yaw += dt * 1.5; c.yawTo = c.yaw; c.pos.y += Math.sin(c.age * 2) * 0.4; }
  if (L === 'lightning') c.alpha = Math.random() < 0.08 ? 0.15 : 1;
  c.intent = { sun: 'shining', star: 'twinkling', cloud: 'drifting', moon: 'rocking', lightning: 'crackling' }[L] || 'floating up';
};

// CRUISE — planes: fly across the top of the frame, loop around.
B.cruise = (c, dt, w) => {
  if (c.state === 'born') { c.state = 'fly'; c.dir = c.pos.x < w.W / 2 ? 1 : -1; }
  c.size = ease(c.size, 90, dt * 0.5);
  const t = { x: c.pos.x + c.dir * 200, y: w.H * 0.2 + Math.sin(c.age * 0.6) * 50, z: Math.sin(c.age * 0.3) * 200 };
  steer(c, t, 200, dt, 1); move(c, dt);
  if (c.pos.x > w.W + 150) c.pos.x = -150;
  if (c.pos.x < -150) c.pos.x = w.W + 150;
  c.yawTo = c.dir > 0 ? 0 : Math.PI;
  c.roll = Math.sin(c.age * 0.6) * 0.12;
  c.intent = 'flying a lap';
};

// GROW — flowers, trees: stay where you drew them and sway; wave your hand
// past them fast and the "wind" makes them sway harder.
B.grow = (c, dt, w) => {
  c.wind = ease(c.wind ?? 0.05, 0.05, dt * 0.6);
  const h = w.hand;
  if (h && Math.hypot(h.cursor.x - c.pos.x, h.cursor.y - c.pos.y) < c.size * 2 && h.speed > 500) {
    c.wind = Math.min(0.45, c.wind + h.speed * 0.00005);
    c.intent = 'blowing in your wind';
  } else c.intent = 'swaying';
  c.grow = Math.min(1, (c.grow ?? 0.7) + dt * 0.4);
};

// FALL — leaves, feathers, snow: drift down; land on your shoulders if you're
// under them, otherwise settle at the bottom.
B.fall = (c, dt, w) => {
  c.size = ease(c.size, Math.min(c.drawnSize, 60), dt);
  if (c.state === 'born') c.state = 'fall';
  const A = w.anchors;
  if (c.state === 'fall') {
    c.pos.x += Math.sin(c.age * 1.6 + c.phase) * 60 * dt;
    c.pos.y += 45 * dt;
    c.yaw = Math.sin(c.age * 1.1) * 1.2; c.yawTo = c.yaw;
    c.roll = Math.sin(c.age * 1.6 + c.phase) * 0.5;
    c.pos.z = ease(c.pos.z, 0, dt * 0.5);
    c.intent = 'falling';
    if (A && A.lShoulder) {
      const x0 = Math.min(A.lShoulder.x, A.rShoulder.x), x1 = Math.max(A.lShoulder.x, A.rShoulder.x);
      const yLine = (A.lShoulder.y + A.rShoulder.y) / 2;
      if (c.pos.x > x0 && c.pos.x < x1 && Math.abs(c.pos.y - yLine) < 12) {
        c.state = 'rest'; c.restOn = c.pos.x < (x0 + x1) / 2 ? 'a' : 'b'; c.restU = (c.pos.x - x0) / (x1 - x0);
      }
    }
    if (c.pos.y > w.H - 20) { c.state = 'ground'; }
  } else if (c.state === 'rest') {
    if (!A || !A.lShoulder) { c.state = 'fall'; return; }
    const x0 = Math.min(A.lShoulder.x, A.rShoulder.x), x1 = Math.max(A.lShoulder.x, A.rShoulder.x);
    c.pos.x = ease(c.pos.x, x0 + (x1 - x0) * c.restU, dt * 10);
    c.pos.y = ease(c.pos.y, (A.lShoulder.y + A.rShoulder.y) / 2, dt * 10);
    c.roll = ease(c.roll, 0, dt * 3); c.yaw = ease(c.yaw, 0, dt * 3); c.yawTo = c.yaw;
    c.intent = 'landed on your shoulders';
    if (scared(c, w.hand, 40)) { c.state = 'fall'; c.pos.y += 15; }
  } else {
    c.roll = ease(c.roll, 0, dt * 2); c.intent = 'resting on the ground';
    if (scared(c, w.hand, 60)) { c.state = 'fall'; c.pos.y = rand(30, 120); }
  }
};

// CRAWL — snakes, snails, crabs: drop to the bottom and walk along it.
B.crawl = (c, dt, w) => {
  c.size = ease(c.size, c.cfg.size, dt);
  if (c.state === 'born') { c.state = 'drop'; c.dir = Math.random() < 0.5 ? -1 : 1; }
  const floor = w.H - c.bounds.maxY * c.size - 12;
  if (c.state === 'drop') {
    c.vel.y += 900 * dt; c.pos.y += c.vel.y * dt; c.pos.z = ease(c.pos.z, 0, dt * 3);
    c.intent = 'dropping';
    if (c.pos.y >= floor) { c.pos.y = floor; c.vel.y = 0; c.state = 'walk'; }
  } else {
    c.pos.y = floor;
    c.pos.x += c.dir * (c.cfg.slow ? 18 : 60) * dt;
    if (c.pos.x > w.W - c.size) c.dir = -1;
    if (c.pos.x < c.size) c.dir = 1;
    c.yawTo = c.dir > 0 ? 0 : Math.PI;
    c.intent = 'crawling along the floor';
  }
};

// DANGLE — spiders: hang on a thread from the top; climb up when your hand comes near.
B.dangle = (c, dt, w) => {
  c.size = ease(c.size, c.cfg.size, dt);
  if (c.state === 'born') { c.state = 'hang'; c.anchorX = c.pos.x; c.rest = clamp(c.pos.y, 120, w.H * 0.6); }
  const h = w.hand;
  const near = h && Math.hypot(h.cursor.x - c.pos.x, h.cursor.y - c.pos.y) < 180;
  const ty = near ? 40 : c.rest + Math.sin(c.age * 0.9) * 30;
  c.pos.y = ease(c.pos.y, ty, dt * (near ? 4 : 1));
  c.pos.x = c.anchorX + Math.sin(c.age * 1.2) * 12;
  c.pos.z = ease(c.pos.z, 0, dt);
  c.roll = Math.sin(c.age * 1.2) * 0.1;
  c.thread = true;
  c.intent = near ? 'climbing away from your hand' : 'dangling';
};

// FLOAT — everything else (the recognizer knows 345 things!): hover where it
// was drawn and slowly turn, so you can see it is really in 3D.
B.float = (c, dt, w) => {
  c.pos.y += Math.sin(c.age * 1.1 + c.phase) * 0.25;
  c.yaw = Math.sin(c.age * 0.5 + c.phase) * 0.7; c.yawTo = c.yaw;
  c.intent = 'floating';
  if (scared(c, w.hand, 40)) { c.vel.x += (c.pos.x - w.hand.cursor.x) * 0.5; }
  c.pos.x += c.vel.x * dt; c.vel.x *= 0.95;
};

// ── per-frame update for everyone ────────────────────────────────────────────
export function updateCreatures(dt, world) {
  // which landing spots are already taken?
  world.taken = new Set(creatures.map((c) => (c.state === 'seek' || c.state === 'perch') && c.place).filter(Boolean));
  for (const c of creatures) {
    // each creature pays attention to the hand nearest to it
    world.hand = null;
    let best = Infinity;
    for (const h of world.hands) {
      const d = Math.hypot(h.cursor.x - c.pos.x, h.cursor.y - c.pos.y);
      if (d < best) { best = d; world.hand = h; }
    }
    if (c.dying !== undefined) continue;     // being deleted: just fade out
    c.age += dt;
    (B[c.cfg.b] || B.float)(c, dt, world);
    // turn around smoothly in 3D (yaw = rotation around the vertical axis)
    let dy = c.yawTo - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += dy * Math.min(1, dt * 4);
  }
}

// ── shape: bend your strokes according to the behaviour ──────────────────────
function deform(c, p) {
  let { x, y, z } = p;
  const cfg = c.cfg, t = c.age;
  if (cfg.b === 'flutter' || cfg.b === 'buzz') {
    // fold the wings towards the viewer, like a book opening and closing
    const th = (0.5 + 0.5 * Math.sin(t * (c.flapSpeed || 9) + c.phase)) * (c.flapAmp || 1) * 1.1;
    if (cfg.fold === 'x' || cfg.b === 'buzz') { z += Math.abs(x) * Math.sin(th); x *= Math.cos(th); }
    else if (y < 0) { z += -y * Math.sin(th); y *= Math.cos(th); }
  } else if (cfg.b === 'swim') {
    // a wave travels down the body
    if (cfg.pulse) { const k = Math.sin(t * 3); y *= 1 + 0.12 * k; x *= 1 - 0.06 * k; }
    else y += Math.sin(x * 3 - t * (c.swimRate || 4)) * 0.09 * (0.3 + Math.abs(x));
  } else if (cfg.b === 'crawl') {
    y += Math.sin(x * 5 - t * 6) * 0.05;
  } else if (cfg.b === 'grow') {
    // bend around the base: the higher a point, the more it sways
    const base = c.bounds.maxY, hgt = base - c.bounds.minY || 1;
    const u = (base - y) / hgt;
    const a = Math.sin(t * 1.3 + c.phase) * (c.wind || 0.05) + Math.sin(t * 2.9) * 0.02;
    x += u * u * a * hgt;
    const g = c.grow ?? 1;              // little "bloom" when it comes alive
    y = base - (base - y) * g;
  }
  return { x, y, z };
}

// local point → 3D world point: bend, scale, tilt (roll), turn (yaw), place.
function toWorld(c, p) {
  const q = deform(c, p);
  let x = q.x * c.size, y = q.y * c.size, z = q.z * c.size;
  const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return { x: c.pos.x + x, y: c.pos.y + y, z: c.pos.z + z };
}

// ── drawing ──────────────────────────────────────────────────────────────────
export function drawCreatures(g) {
  for (const c of creatures) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // a soft "flash" in the first moment of life
    const born = Math.max(0, 1 - c.age / 0.6);
    // deleting: shrink and fade for 0.45 s
    const d = c.dying === undefined ? 0 : c.dying / 0.45;
    const keepSize = c.size;
    c.size = keepSize * (1 - d * 0.6);
    const alpha = c.alpha * (1 - d);
    for (const s of c.local) {
      const pts = s.map((p) => {
        const q = project(toWorld(c, p));
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        return q;
      });
      drawLine(g, pts, alpha, 1 + born * 1.5 + (c.selected ? 0.8 : 0));
    }
    c.size = keepSize;
    if (c.thread) {              // the spider's silk
      const top = project({ x: c.pos.x, y: 0, z: c.pos.z });
      g.globalAlpha = 0.6; g.lineWidth = 1; g.strokeStyle = '#fff';
      g.beginPath(); g.moveTo(top.x, 0); g.lineTo((x0 + x1) / 2, y0); g.stroke(); g.globalAlpha = 1;
    }
    c.box = { x0, y0, x1, y1 };  // remembered for the "what the AI sees" overlay
  }
}
