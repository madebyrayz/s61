// ─────────────────────────────────────────────────────────────────────────────
// creatures.js — drawings that come alive.
//
// Once you finish a drawing (by turning the pen off) and the recognizer names it, it becomes a
// CREATURE: your own lines, plus a little brain and an effects layer.
//
//  • It lives WHERE YOU DREW IT. Your HAND never moves it: your hand only
//    draws. But it can notice PEOPLE: a dragon may land on someone's
//    shoulder, a hat goes onto the nearest head, glasses onto the nearest face.
//  • Its brain is a small behaviour (flutter, swim, sway, drive, bounce…) that
//    moves and bends your strokes in 3D: wings fold towards you, bodies wave.
//  • Its effects (effects.js) add new lines in your ink: water, drips, steam,
//    flames, smoke, notes, rain…
// ─────────────────────────────────────────────────────────────────────────────

import { project, drawLine } from './ink.js';
import { updateEffects, drawEffects, HAS_EFFECT } from './effects.js';

// ── the cast ─────────────────────────────────────────────────────────────────
//   fold 'x'  = wings on the left and right (seen from above: butterfly, bat)
//   fold 'up' = wings on top (seen from the side: bird, duck)
const FLY = (o) => ({ b: 'flutter', flap: 9, fold: 'up', turn: true, range: 1.6, perch: ['lShoulder', 'rShoulder', 'head'], ...o });
const DRIVE = { b: 'drive' };
const KINDS = {
  butterfly: FLY({ fold: 'x', turn: false, flap: 11 }), bat: FLY({ fold: 'x', turn: false, flap: 14 }),
  angel: FLY({ fold: 'x', turn: false, flap: 4, range: 0.5 }), mosquito: FLY({ fold: 'x', turn: false, flap: 30, range: 1 }),
  bee: FLY({ fold: 'x', turn: false, flap: 30, range: 1, perch: [] }),
  bird: FLY({ perch: ['head', 'lShoulder', 'rShoulder'] }),
  owl: FLY({ flap: 7 }), parrot: FLY({}), duck: FLY({ flap: 10 }),
  swan: FLY({ flap: 5 }), flamingo: FLY({ flap: 5 }), dragon: FLY({ flap: 4, range: 1.2 }),

  fish: { b: 'swim' }, shark: { b: 'swim' }, whale: { b: 'swim', slow: true }, dolphin: { b: 'swim' },
  sea_turtle: { b: 'swim', slow: true }, octopus: { b: 'swim', pulse: true, slow: true }, submarine: { b: 'swim', slow: true },

  airplane: { b: 'cruise' }, helicopter: { b: 'cruise' }, flying_saucer: { b: 'hover' }, hot_air_balloon: { b: 'hover' },
  cloud: { b: 'drift' }, sun: { b: 'spin', speed: 0.2 }, star: { b: 'twinkle' }, moon: { b: 'rock' }, lightning: { b: 'flicker' },

  flower: { b: 'grow' }, tree: { b: 'grow' }, palm_tree: { b: 'grow' }, house_plant: { b: 'grow' },
  cactus: { b: 'grow' }, grass: { b: 'grow' }, mushroom: { b: 'grow' }, broccoli: { b: 'grow' },
  leaf: { b: 'fall' }, feather: { b: 'fall' }, snowflake: { b: 'fall' },

  snake: { b: 'crawl' }, snail: { b: 'crawl', slow: true }, crab: { b: 'crawl' }, ant: { b: 'crawl' },
  scorpion: { b: 'crawl' }, lobster: { b: 'crawl' }, spider: { b: 'dangle' },
  cat: { b: 'breathe' }, dog: { b: 'wag' }, rabbit: { b: 'hop' }, frog: { b: 'hop' }, kangaroo: { b: 'hop' },

  car: DRIVE, bus: DRIVE, school_bus: DRIVE, truck: DRIVE, pickup_truck: DRIVE, police_car: DRIVE,
  ambulance: DRIVE, firetruck: DRIVE, van: DRIVE, tractor: DRIVE, bulldozer: DRIVE, motorbike: DRIVE,
  bicycle: DRIVE, train: DRIVE, sailboat: { b: 'bob' }, canoe: { b: 'bob' }, speedboat: DRIVE, cruise_ship: { b: 'bob' },

  basketball: { b: 'bounce' }, soccer_ball: { b: 'bounce' }, baseball: { b: 'bounce' }, hockey_puck: { b: 'bounce' },
  fan: { b: 'spin', speed: 6 }, ceiling_fan: { b: 'spin', speed: 6 }, wheel: { b: 'spin', speed: 2 },
  windmill: { b: 'spin', speed: 0.8 }, tornado: { b: 'spin', speed: 3 }, hurricane: { b: 'spin', speed: 2 },
  telephone: { b: 'shake' }, cell_phone: { b: 'shake' }, alarm_clock: { b: 'shake' },
  hat: { b: 'wear', at: 'head', w: 1.35 }, crown: { b: 'wear', at: 'head', w: 1.05 },
  eyeglasses: { b: 'wear', at: 'eyes', w: 2.6 }, moustache: { b: 'wear', at: 'lip', w: 1.6 },
  beard: { b: 'wear', at: 'chin', w: 1.0 }, bowtie: { b: 'wear', at: 'neck', w: 1.7 },
  headphones: { b: 'wear', at: 'ears', w: 1.3 }, smiley_face: { b: 'breathe' }, face: { b: 'breathe' }, heart: { b: 'breathe' },
};
// Categories with something special to do: the recognizer prefers these when unsure.
export const FAVOURITES = [...new Set([...Object.keys(KINDS), ...HAS_EFFECT])];

export const creatures = [];
let nextId = 1;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (a, b, k) => a + (b - a) * Math.min(1, k);

// ── birth ────────────────────────────────────────────────────────────────────
// strokes: 3D points from ink. guesses: [{label, p}, …]. ci: ink colour index.
export function spawn(strokes, guesses, ci = 0) {
  let n = 0, cx = 0, cy = 0, cz = 0;
  for (const s of strokes) for (const p of s) { cx += p.x; cy += p.y; cz += p.z; n++; }
  cx /= n; cy /= n; cz /= n;
  let R = 1;
  for (const s of strokes) for (const p of s) R = Math.max(R, Math.hypot(p.x - cx, p.y - cy));

  // Every point is stored RELATIVE to the centre, in units of the radius.
  // Moving or resizing is then just: position + point × size.
  const local = strokes.map((s) => s.map((p) => ({ x: (p.x - cx) / R, y: (p.y - cy) / R, z: (p.z - cz) / R })));
  const c = {
    id: nextId++, guesses, gi: 0, label: '', cfg: null, ci,
    local, bounds: null,
    home: { x: cx, y: cy, z: cz },                // where you drew it: it lives here
    pos: { x: cx, y: cy, z: cz }, vel: { x: 0, y: 0, z: 0 },
    size: R, drawn: R, yaw: 0, yawTo: 0, roll: 0, age: 0, phase: rand(0, 6.28),
    state: 'born', intent: 'waking up', box: null, alpha: 1,
  };
  measure(c);
  setLabel(c, 0);
  creatures.push(c);
  if (creatures.length > 16) creatures.shift();   // keep the scene light
  return c;
}

function measure(c) {
  const b = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (const s of c.local) for (const p of s) {
    b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
  }
  c.bounds = b;
}

// Change what the creature thinks it is (clicking a selected drawing cycles the guesses).
export function setLabel(c, gi) {
  c.gi = gi;
  c.label = c.guesses[gi]?.label || 'doodle';
  c.cfg = KINDS[c.label] || { b: 'stay' };
  c.state = 'born'; c.roll = 0; c.yaw = 0; c.yawTo = 0; c.fx = null;
  c.pos = { ...c.home }; c.vel = { x: 0, y: 0, z: 0 }; c.place = null; c.wearer = null; if (c.drawn) c.size = c.drawn;
}

export function removeLast() { creatures.pop(); }
export function clearAll() { creatures.length = 0; }
export function remove(c) { if (c && c.dying === undefined) c.dying = 0; }
export function creatureAt(x, y, pad = 14) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i], b = c.box;
    if (b && c.dying === undefined && x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) return c;
  }
  return null;
}
export function tickDying(dt) {
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    if (c.dying === undefined) continue;
    c.dying += dt;
    if (c.dying > 0.45) creatures.splice(i, 1);
  }
}

// ERASER: rub out every point within radius r of (x,y). Lines are cut where
// they're rubbed; a creature with no lines left disappears.
export function eraseCreatures(x, y, r) {
  for (const c of creatures) {
    if (!c.proj || c.dying !== undefined) continue;
    let changed = false;
    const out = [];
    c.local.forEach((s, si) => {
      const P = c.proj[si];
      let run = [];
      s.forEach((p, i) => {
        if (P[i] && Math.hypot(P[i].x - x, P[i].y - y) < r) { changed = true; if (run.length > 1) out.push(run); run = []; }
        else run.push(p);
      });
      if (run.length > 1) out.push(run);
    });
    if (changed) {
      c.local = out;
      c.proj = null;
      if (!out.length) remove(c); else { measure(c); c.fx = null; }
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function steer(c, t, speed, dt, agility = 2.5) {
  const dx = t.x - c.pos.x, dy = t.y - c.pos.y, dz = (t.z ?? 0) - c.pos.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const sp = speed * Math.min(1, d / 80);
  const k = Math.min(1, dt * agility);
  c.vel.x += (dx / d * sp - c.vel.x) * k;
  c.vel.y += (dy / d * sp - c.vel.y) * k;
  c.vel.z += (dz / d * sp - c.vel.z) * k;
  return d;
}
function move(c, dt) { c.pos.x += c.vel.x * dt; c.pos.y += c.vel.y * dt; c.pos.z += c.vel.z * dt; }
// a random point near home (within `range` × its size)
function nearHome(c, range, zr = 1) {
  const R = c.size * range;
  return { x: c.home.x + rand(-R, R), y: c.home.y + rand(-R, R) * 0.6, z: c.home.z + rand(-R, R) * zr };
}
const faceVel = (c, min = 20) => { if (c.vel.x > min) c.yawTo = 0; else if (c.vel.x < -min) c.yawTo = Math.PI; };

// ── behaviours ───────────────────────────────────────────────────────────────
// Each runs every frame for one creature. dt = seconds since the last frame.
// W,H = screen size. None of them look at your hand or body.
const B = {};

// STAY: anything without a special behaviour. Stays put; breathes; its effects
// (if any) do the talking. A gentle turn now and then shows it's 3D.
B.stay = (c, dt) => {
  c.yaw = Math.sin(c.age * 0.45 + c.phase) * 0.18; c.yawTo = c.yaw;
  c.breath = 1 + Math.sin(c.age * 1.6 + c.phase) * 0.012;
  c.intent = c.fx ? 'animating' : 'resting';
};

// FLUTTER: butterflies, birds, dragons. Fly loops around where you drew them
// (in 3D); after a while, look for a free shoulder or head on the nearest
// person, land there, rest and ride along; later fly off again.
B.flutter = (c, dt, w) => {
  const cfg = c.cfg;
  c.timer = (c.timer ?? 0) - dt;
  if (c.state === 'born') { c.state = 'fly'; c.timer = rand(2, 4); }
  if (c.state === 'fly') {
    if (!c.goal || Math.hypot(c.goal.x - c.pos.x, c.goal.y - c.pos.y) < c.size * 0.4) c.goal = nearHome(c, cfg.range);
    steer(c, c.goal, c.size * 2.2, dt, 1.6); move(c, dt);
    c.intent = 'fluttering around';
    c.size = ease(c.size, c.drawn, dt);
    if (c.timer <= 0) {
      const spot = freeSpot(c, w);
      if (spot) { c.state = 'seek'; c.place = spot; w.taken.add(spot.key); }
      else c.timer = rand(2, 4);
    }
  } else if (c.state === 'flee') {
    // dash away from where the hand was, wings racing, then calm down
    const dx = c.pos.x - c.fleeFrom.x, dy = c.pos.y - c.fleeFrom.y, d = Math.hypot(dx, dy) || 1;
    steer(c, { x: c.pos.x + dx / d * 200, y: c.pos.y + dy / d * 200 - 60, z: c.pos.z + 80 }, Math.max(380, c.size * 5), dt, 4); move(c, dt);
    c.size = ease(c.size, c.drawn, dt);
    c.intent = 'startled, flying off';
    if (c.timer <= 0) { c.state = 'fly'; c.timer = rand(3, 6); c.goal = null; }
  } else if (c.state === 'seek' || c.state === 'perch') {
    const A = w.people.find((p) => p.id === c.place.person)?.anchors;
    const at = A && A[c.place.name];
    if (!at) { c.state = 'fly'; c.timer = rand(3, 5); c.place = null; }
    else {
      // shrink to sit nicely on a person of that size
      const fit = (A.shoulderW || A.headW * 2.2) * 0.32 / Math.max(0.5, c.bounds.maxX - c.bounds.minX);
      c.size = ease(c.size, Math.min(c.drawn, fit), dt * 2);
      const t = { x: at.x, y: at.y - c.bounds.maxY * c.size * 0.8, z: 0 };
      const name = PLACES[c.place.name];
      if (c.state === 'seek') {
        const d = steer(c, t, Math.max(260, c.size * 4), dt, 3); move(c, dt);
        c.intent = '→ ' + name;
        if (d < 12) { c.state = 'perch'; c.timer = rand(8, 16); }
      } else {
        c.pos.x = ease(c.pos.x, t.x, dt * 14); c.pos.y = ease(c.pos.y, t.y, dt * 14); c.pos.z = ease(c.pos.z, 0, dt * 4);
        c.vel.x = c.vel.y = c.vel.z = 0;
        c.intent = 'sitting on ' + name;
        if (c.timer <= 0) { c.state = 'fly'; c.timer = rand(5, 9); c.goal = null; c.place = null; c.vel.y = -c.size * 3; }
      }
    }
  }
  const resting = c.state === 'perch';
  c.flapSpeed = ease(c.flapSpeed ?? cfg.flap, resting ? 2 : c.state === 'flee' ? cfg.flap * 1.8 : cfg.flap, dt * 4);
  c.flapAmp = ease(c.flapAmp ?? 1, resting ? 0.55 : 1.05, dt * 3);
  if (cfg.turn) faceVel(c, 15);
  else c.roll = ease(c.roll, clamp(c.vel.x / (c.size * 6), -0.45, 0.45), dt * 3);
};

const PLACES = { head: 'a head', lShoulder: 'a left shoulder', rShoulder: 'a right shoulder', eyes: 'a face', lip: 'a face', chin: 'a chin', neck: 'a neck', ears: 'a head' };
// The free landing spot on the person nearest to this creature's home.
function freeSpot(c, w) {
  const people = w.people.filter((p) => p.anchors)
    .sort((a, b) => Math.hypot(a.anchors.eyes.x - c.home.x, a.anchors.eyes.y - c.home.y) - Math.hypot(b.anchors.eyes.x - c.home.x, b.anchors.eyes.y - c.home.y));
  for (const p of people) for (const name of c.cfg.perch || []) {
    const key = p.id + ':' + name;
    if (p.anchors[name] && !w.taken.has(key)) return { person: p.id, name, key };
  }
  return null;
}

// WEAR: hats, glasses, moustaches fly onto the nearest face and stay there,
// following its position, size and tilt. Nobody around → wait where drawn.
B.wear = (c, dt, w) => {
  const people = w.people.filter((p) => p.anchors);
  let P = people.find((p) => p.id === c.wearer);
  if (!P && people.length) {
    P = people.sort((a, b) => Math.hypot(a.anchors.eyes.x - c.home.x, a.anchors.eyes.y - c.home.y) - Math.hypot(b.anchors.eyes.x - c.home.x, b.anchors.eyes.y - c.home.y))[0];
    c.wearer = P.id;
  }
  if (!P) {
    c.pos.x = ease(c.pos.x, c.home.x, dt * 2); c.pos.y = ease(c.pos.y, c.home.y, dt * 2);
    c.size = ease(c.size, c.drawn, dt * 2); c.roll = ease(c.roll, 0, dt * 2);
    c.intent = 'waiting for a face'; c.state = 'born';
    return;
  }
  const A = P.anchors, { up, headW, eyeDist } = A, down = { x: -up.x, y: -up.y };
  const width = c.bounds.maxX - c.bounds.minX || 1, cfg = c.cfg;
  let anchor, targetW, offset = 0;
  switch (cfg.at) {
    case 'head': anchor = A.head; targetW = headW * cfg.w; offset = c.bounds.maxY * 0.8; break;
    case 'ears': anchor = { x: A.eyes.x + up.x * headW * 0.3, y: A.eyes.y + up.y * headW * 0.3 }; targetW = headW * cfg.w; break;
    case 'eyes': anchor = A.eyes; targetW = eyeDist * cfg.w; break;
    case 'lip': anchor = A.lip; targetW = eyeDist * cfg.w; break;
    case 'chin': anchor = { x: A.lip.x + down.x * headW * 0.35, y: A.lip.y + down.y * headW * 0.35 }; targetW = headW * cfg.w; break;
    default: anchor = A.neck; targetW = eyeDist * cfg.w;
  }
  const size = targetW / width;
  const t = { x: anchor.x + up.x * offset * size, y: anchor.y + up.y * offset * size };
  const k = dt * (c.state === 'worn' ? 18 : 3.5);
  c.pos.x = ease(c.pos.x, t.x, k); c.pos.y = ease(c.pos.y, t.y, k); c.pos.z = ease(c.pos.z, 0, k);
  c.size = ease(c.size, size, k); c.roll = ease(c.roll, A.tilt, k);
  if (Math.hypot(t.x - c.pos.x, t.y - c.pos.y) < 10) c.state = 'worn';
  c.intent = (c.state === 'worn' ? 'worn on ' : '→ ') + PLACES[cfg.at];
};

// SWIM: fish. Swim slow laps around home, turning around in 3D.
B.swim = (c, dt) => {
  if (!c.goal || Math.hypot(c.goal.x - c.pos.x, c.goal.y - c.pos.y) < c.size * 0.5) c.goal = nearHome(c, 2.2, 0.8);
  if (c.dart > 0) {
    // dart away from the hand for a moment, then swim on
    c.dart -= dt;
    const dx = c.pos.x - c.fleeFrom.x, dy = c.pos.y - c.fleeFrom.y, d = Math.hypot(dx, dy) || 1;
    c.goal = { x: c.pos.x + dx / d * c.size * 2, y: c.pos.y + dy / d * c.size * 2, z: c.pos.z };
    steer(c, c.goal, c.size * 4, dt, 4); move(c, dt);
    c.intent = 'startled, darting away';
    if (c.dart <= 0) c.goal = nearHome(c, 2.2, 0.8);
  } else steer(c, c.goal, c.size * (c.cfg.slow ? 0.6 : 1.1), dt, 1.1), move(c, dt);
  faceVel(c);
  c.swimRate = ease(c.swimRate ?? 4, 3 + Math.hypot(c.vel.x, c.vel.y) / (c.size * 0.4), dt * 3);
  if (!(c.dart > 0)) c.intent = 'swimming';
};

// CRUISE: planes fly a big flat oval through the scene.
B.cruise = (c, dt) => {
  const a = c.age * 0.35 + c.phase, R = Math.min(view().W * 0.3, c.size * 5);
  c.pos.x = c.home.x + Math.cos(a) * R;
  c.pos.y = c.home.y + Math.sin(a * 2) * c.size * 0.4;
  c.pos.z = c.home.z + Math.sin(a) * R * 0.8;          // the far side of the oval is behind
  c.yawTo = c.yaw = Math.sin(a) > 0 ? Math.PI : 0;
  c.roll = Math.cos(a * 2) * 0.1;
  c.intent = 'flying laps';
};
B.hover = (c) => { c.pos.y = c.home.y + Math.sin(c.age * 1.2) * c.size * 0.12; c.yaw = c.yawTo = c.age * 0.8; c.intent = 'hovering'; };
B.drift = (c, dt) => { c.pos.x += dt * c.size * 0.15; if (c.pos.x > c.home.x + c.size * 2) c.pos.x = c.home.x - c.size * 2; c.intent = 'drifting'; };
B.spin = (c, dt) => { c.roll += dt * c.cfg.speed; c.intent = 'spinning'; };
B.twinkle = (c, dt) => { c.yaw += dt * 0.9; c.yawTo = c.yaw; c.alpha = 0.7 + 0.3 * Math.sin(c.age * 5 + c.phase); c.intent = 'twinkling'; };
B.rock = (c) => { c.roll = Math.sin(c.age * 0.7) * 0.25; c.intent = 'rocking'; };
B.flicker = (c) => { c.alpha = Math.random() < 0.08 ? 0.15 : 1; c.intent = 'crackling'; };

// GROW: plants sway around their base and "bloom" up when they come alive.
B.grow = (c, dt) => { c.grow = Math.min(1, (c.grow ?? 0.6) + dt * 0.5); c.intent = 'swaying'; };

// FALL: leaves drift down from where you drew them, then start again.
B.fall = (c, dt) => {
  c.pos.y += c.size * 0.5 * dt;
  c.pos.x = c.home.x + Math.sin(c.age * 1.6 + c.phase) * c.size * 0.6;
  c.yaw = c.yawTo = Math.sin(c.age * 1.1) * 1.2;
  c.roll = Math.sin(c.age * 1.6 + c.phase) * 0.5;
  const fallen = c.pos.y - c.home.y;
  c.alpha = clamp(1.4 - fallen / (c.size * 4), 0, 1);
  if (fallen > c.size * 5) c.pos.y = c.home.y - c.size * 0.5;
  c.intent = 'falling';
};

// CRAWL: walk back and forth along the line it was drawn on.
B.crawl = (c, dt) => {
  c.dir = c.dir || 1;
  c.pos.x += c.dir * c.size * (c.cfg.slow ? 0.15 : 0.5) * dt;
  if (Math.abs(c.pos.x - c.home.x) > c.size * 2) c.dir *= -1;
  c.yawTo = c.dir > 0 ? 0 : Math.PI;
  c.intent = 'crawling';
};
B.drive = (c, dt) => {
  c.dir = c.dir || 1;
  c.pos.x += c.dir * c.size * 0.9 * dt;
  c.pos.y = c.home.y + Math.abs(Math.sin(c.age * 9)) * -1.5;     // little road bumps
  if (Math.abs(c.pos.x - c.home.x) > c.size * 2.5) c.dir *= -1;
  c.yawTo = c.dir > 0 ? 0 : Math.PI;
  c.intent = 'driving';
};
B.bob = (c) => { c.pos.y = c.home.y + Math.sin(c.age * 1.4) * c.size * 0.06; c.roll = Math.sin(c.age * 1.4 + 0.8) * 0.08; c.intent = 'bobbing'; };

// DANGLE: spiders hang on a silk thread from the top of the screen and bob.
B.dangle = (c) => { c.pos.y = c.home.y + Math.sin(c.age * 0.9) * c.size * 0.4; c.roll = Math.sin(c.age * 1.2) * 0.1; c.thread = true; c.intent = 'dangling'; };

// BOUNCE: balls bounce, squashing a little when they land (home = the floor).
B.bounce = (c) => {
  const t = (c.age * 1.6) % 1, hgt = c.size * 1.6;
  c.pos.y = c.home.y - 4 * t * (1 - t) * hgt;
  c.squash = t < 0.06 || t > 0.94 ? 0.85 : 1;
  c.roll += 0.03;
  c.intent = 'bouncing';
};
B.hop = (c, dt) => {
  const t = (c.age * 0.8) % 1, jump = t < 0.4 ? Math.sin((t / 0.4) * Math.PI) : 0;
  c.dir = c.dir || 1;
  if (jump > 0) c.pos.x += c.dir * c.size * 0.9 * dt;
  if (Math.abs(c.pos.x - c.home.x) > c.size * 1.5) c.dir *= -1;
  c.pos.y = c.home.y - jump * c.size * 0.6;
  c.yawTo = c.dir > 0 ? 0 : Math.PI;
  c.intent = 'hopping';
};
B.shake = (c) => { const ring = Math.sin(c.age * 2) > 0.3; c.roll = ring ? Math.sin(c.age * 60) * 0.06 : 0; c.intent = ring ? 'ringing' : 'waiting'; };
B.breathe = (c) => { c.breath = 1 + Math.sin(c.age * 2) * 0.03; c.intent = 'breathing'; };
B.wag = (c) => { c.breath = 1 + Math.sin(c.age * 2.2) * 0.02; c.roll = Math.sin(c.age * 8) * 0.03; c.intent = 'wagging'; };
B.wiggle = (c) => { c.wig = Math.sin(c.age * 6) * 0.06; c.intent = 'wiggling'; };

let viewRef = { W: 1, H: 1 };
const handPrev = {};

// ── reactions ────────────────────────────────────────────────────────────────
// A hand sweeping FAST past a drawing startles it. The hand never pushes it:
// the drawing reacts in its own way (flinch, jump, fly off, dart) and then
// calms down and goes back to what it was doing, where it was.
function reactTo(c, dt, w) {
  c.calm = Math.max(0, (c.calm || 0) - dt);
  c.startle = Math.max(0, (c.startle || 0) - dt / 1.2);
  if (c.calm > 0 || !c.box) return;
  for (const h of w.hands || []) {
    const b = c.box, m = 50;
    const near = h.cursor.x > b.x0 - m && h.cursor.x < b.x1 + m && h.cursor.y > b.y0 - m && h.cursor.y < b.y1 + m;
    if (near && h.speed > 1100 && h.shape !== 'point') {
      c.startle = 1; c.calm = 3;
      c.fleeFrom = { ...h.cursor };
      if (c.cfg.b === 'flutter') { c.state = 'flee'; c.timer = rand(1.5, 2.5); c.place = null; }
      if (c.cfg.b === 'swim') c.dart = 1;
      return;
    }
  }
}
const view = () => viewRef;

// ── per-frame update for everyone ────────────────────────────────────────────
export function updateCreatures(dt, world) {
  viewRef = world;
  // hand speeds (for startle reactions)
  for (const h of world.hands || []) {
    const prev = handPrev[h.id];
    h.speed = prev ? Math.hypot(h.cursor.x - prev.x, h.cursor.y - prev.y) / Math.max(dt, 1e-3) : 0;
    handPrev[h.id] = { ...h.cursor };
  }
  world.taken = new Set(creatures.filter((c) => c.place && (c.state === 'seek' || c.state === 'perch')).map((c) => c.place.key));
  for (const c of creatures) {
    if (c.dying !== undefined) continue;
    c.age += dt;
    reactTo(c, dt, world);
    (B[c.cfg.b] || B.stay)(c, dt, world);
    if (c.startle > 0.2 && c.cfg.b !== 'flutter' && c.cfg.b !== 'swim') c.intent = 'startled!';
    let dy = c.yawTo - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += dy * Math.min(1, dt * 4);
    updateEffects(c, dt);
  }
}

// ── shape: bend your strokes according to the behaviour ──────────────────────
function deform(c, p) {
  let { x, y, z } = p;
  const cfg = c.cfg, t = c.age;
  if (cfg.b === 'flutter') {
    // fold the wings towards you, like a book opening and closing
    const th = (0.5 + 0.5 * Math.sin(t * (c.flapSpeed || 9) + c.phase)) * (c.flapAmp || 1) * 1.1;
    if (cfg.fold === 'x') { z += Math.abs(x) * Math.sin(th); x *= Math.cos(th); }
    else if (y < 0) { z += -y * Math.sin(th); y *= Math.cos(th); }
  } else if (cfg.b === 'swim') {
    if (cfg.pulse) { const k = Math.sin(t * 3); y *= 1 + 0.12 * k; x *= 1 - 0.06 * k; }
    else y += Math.sin(x * 3 - t * (c.swimRate || 4)) * 0.09 * (0.3 + Math.abs(x));
  } else if (cfg.b === 'crawl') {
    y += Math.sin(x * 5 - t * 6) * 0.05;
  } else if (cfg.b === 'grow') {
    const base = c.bounds.maxY, hgt = base - c.bounds.minY || 1;
    const u = (base - y) / hgt;
    const a = Math.sin(t * 1.3 + c.phase) * 0.06 + Math.sin(t * 2.9) * 0.02;
    x += u * u * a * hgt;
    y = base - (base - y) * (c.grow ?? 1);
  } else if (cfg.b === 'wiggle') {
    y += Math.sin(x * 4) * (c.wig || 0) * Math.abs(x);
  }
  if (c.breath) { x *= c.breath; y *= c.breath; }
  if (c.squash && c.squash !== 1) { y = (y - c.bounds.maxY) * c.squash + c.bounds.maxY; x *= 2 - c.squash; }
  return { x, y, z };
}

// local point → 3D world point: scale, tilt (roll), turn (yaw), place.
function place(c, q) {
  // startle: a quick jump and a shiver that fade out (not for flyers/swimmers,
  // who react by moving instead)
  const st = c.cfg.b === 'flutter' || c.cfg.b === 'swim' ? 0 : (c.startle || 0);
  const pop = 1 + st * 0.12 * Math.sin(st * Math.PI);
  let x = q.x * c.size * pop, y = q.y * c.size * pop, z = (q.z || 0) * c.size;
  const roll = c.roll + st * Math.sin(c.age * 45) * 0.12;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const jump = -Math.sin(st * Math.PI) * c.size * 0.35;
  return { x: c.pos.x + x, y: c.pos.y + y + jump, z: c.pos.z + z };
}

// ── drawing ──────────────────────────────────────────────────────────────────
export function drawCreatures(g) {
  for (const c of creatures) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const born = Math.max(0, 1 - c.age / 0.6);          // a soft flash at birth
    const d = c.dying === undefined ? 0 : c.dying / 0.45;
    const keep = c.size;
    c.size = keep * (1 - d * 0.6);
    const alpha = c.alpha * (1 - d);
    c.proj = c.local.map((s) => {
      const pts = s.map((p) => {
        const q = project(place(c, deform(c, p)));
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        return q;
      });
      drawLine(g, pts, alpha, 1 + born * 1.5 + (c.selected ? 0.8 : 0), c.ci);
      return pts;
    });
    drawEffects(g, c, (p) => place(c, p), alpha);
    if (c.thread && isFinite(y0)) {
      g.globalAlpha = 0.5 * alpha; g.lineWidth = 1; g.strokeStyle = '#fff';
      g.beginPath(); g.moveTo((x0 + x1) / 2, 0); g.lineTo((x0 + x1) / 2, y0); g.stroke(); g.globalAlpha = 1;
    }
    c.size = keep;
    c.box = { x0, y0, x1, y1 };
  }
}
