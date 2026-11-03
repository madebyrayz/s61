// CAVE: a line-drawing physics puzzle about dimensions.
//
// The world is three sheets of paper stacked one behind the other.
//   2D (flat):  you look straight at the stack. Everything is squashed together,
//               so everything touches everything. What you draw is flat: it lives on one sheet.
//   3D (deep):  press Tab and the camera swings round. Now the sheets have depth,
//               and things only touch things on the same sheet. What you draw is solid:
//               it goes through every sheet (a line becomes a wall, a square a cube).
// Get the ink ball to the little door.
//
// p5.js draws everything; matter.js does the physics.

const { Engine, Bodies, Body, Composite } = Matter;

// ===== 1. WORLD SIZE & LOOK =====
const W = 1000, H = 600;           // world size (the paper)
const GAP = 150;                   // distance between paper sheets in 3D
const LAYERS = 3;
const ALL = 0b111;                 // "on every sheet"
const INK = [20, 20, 22];
const PAPER = [243, 242, 238];
const LAYER_ALPHA = [1, 0.5, 0.28];// back sheets are paler: in Flatland, depth shows as fading
const THICK = 7;                   // thickness of a line, for physics
const BALL_R = 15;

// ===== 2. LEVELS =====
// Obstacle kinds:
//   line    { pts }               a line
//   peg     { x, y, r }           a point (through several sheets it becomes a rod)
//   ring    { x, y, r }           a hollow circle
//   plate   { x, y, w, h, angle } a flat square face (x, y = top-left; angle tilts it)
//   cube    { x, y, w, h }        a box through several sheets
//   spinner { x, y, len, speed }  a line turning around its middle
// "on" says which sheets: a list like [0] or [1, 2], or 'all'.
const LEVELS = [
  {
    name: 'one · drop',
    hint: 'draw to guide the ball &nbsp;·&nbsp; <b>space</b> drop the ball &nbsp;·&nbsp; <b>tab</b> 2D ↔ 3D &nbsp;·&nbsp; in 3D: <b>wasd qe</b> move, scroll zoom, <b>v</b> reset &nbsp;·&nbsp; <b>r</b> restart &nbsp;·&nbsp; <b>z</b> undo',
    ball: [70, 20, 0], goal: [840, 470],
    things: [
      { kind: 'line', on: 'all', pts: [[20, 70], [220, 170]] },
      ...pegGrid(230, 210, 6, 3, 62, 58),
      { kind: 'ring', on: [1], x: 640, y: 250, r: 44 },
      { kind: 'line', on: 'all', pts: [[760, 470], [1000, 470], [1000, 380]] },
      { kind: 'cube', on: 'all', x: 760, y: 470, w: 46, h: 130 },
    ],
  },
  {
    name: 'two · depth',
    hint: 'a square on another sheet only blocks you when the world is flat',
    ball: [60, 10, 0], goal: [880, 440],
    things: [
      { kind: 'line', on: 'all', pts: [[0, 80], [250, 200], [560, 360], [1000, 470], [1000, 380]] },
      { kind: 'plate', on: [1], x: 380, y: 140, w: 40, h: 150 },
      { kind: 'spinner', on: [2], x: 700, y: 330, len: 170, speed: 0.025 },
      { kind: 'peg', on: [0], x: 520, y: 200, r: 6 },
      { kind: 'peg', on: [1], x: 600, y: 240, r: 6 },
    ],
  },
  {
    name: 'three · faces',
    hint: 'flat squares on different sheets make stairs only in 2D &nbsp;·&nbsp; the door is the other way',
    ball: [566, 10, 0], goal: [150, 560],
    things: [
      { kind: 'cube', on: 'all', x: 440, y: 110, w: 120, h: 70 },
      { kind: 'plate', on: [0], x: 600, y: 250, w: 110, h: 18, angle: 0.2 },
      { kind: 'plate', on: [1], x: 720, y: 320, w: 110, h: 18, angle: 0.2 },
      { kind: 'plate', on: [2], x: 840, y: 390, w: 110, h: 18, angle: 0.2 },
      { kind: 'ring', on: [1], x: 330, y: 330, r: 52 },
      ...pegGrid(120, 260, 3, 2, 60, 60),
      { kind: 'line', on: 'all', pts: [[0, 460], [0, 560], [300, 560]] },
      { kind: 'line', on: 'all', pts: [[1000, 250], [1004, 360], [992, 420], [965, 455], [930, 472]] },
    ],
  },
  {
    name: 'four · flatten in time',
    hint: 'go deep to slip through the wall, then flatten to land on the far sheet',
    ball: [60, 10, 0], goal: [900, 410],
    things: [
      { kind: 'line', on: 'all', pts: [[0, 100], [600, 330]] },
      { kind: 'line', on: [1], pts: [[400, 100], [400, 300]] },
      { kind: 'line', on: [2], pts: [[560, 410], [1000, 410]] },
      { kind: 'cube', on: [1, 2], x: 960, y: 330, w: 40, h: 80 },
      { kind: 'ring', on: [0], x: 760, y: 200, r: 36 },
    ],
  },
  {
    name: 'five · your own depth',
    hint: 'build across the gap, then find the dimension where the hanging wall is not there &nbsp;·&nbsp; <b>1 2 3</b> pick a sheet',
    ball: [36, 0, 0], goal: [900, 217],
    things: [
      { kind: 'line', on: 'all', pts: [[0, 60], [230, 186], [290, 190]] },
      { kind: 'line', on: [1], pts: [[470, 0], [470, 172]] },
      { kind: 'line', on: 'all', pts: [[630, 190], [700, 190], [1000, 230], [1000, 150]] },
      { kind: 'spinner', on: [2], x: 560, y: 300, len: 200, speed: -0.02 },
      { kind: 'ring', on: [0], x: 460, y: 420, r: 60 },
      ...pegGrid(330, 300, 3, 2, 50, 70),
    ],
  },
];

// a grid of points, each on a different sheet
function pegGrid(x0, y0, cols, rows, dx, dy) {
  const out = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      out.push({ kind: 'peg', on: [(i + j) % 3], x: x0 + i * dx + (j % 2) * dx / 2, y: y0 + j * dy, r: 6 });
  return out;
}

// ===== 3. STATE =====
let engine, ball, ballLayer, goal;
let things = [];        // every obstacle and drawn shape: { kind, body, mask, local, r, w, h, spin, drawn }
let level = 0, inkLeft = 0, won = 0, released = false;
let mode3D = false, m = 0;          // m eases 0 (2D) → 1 (3D)
let drawLayer = 0;
let tool = 'line';                  // line, circle, plane, point
let fixed = true;                   // drawn shapes stay put (true) or fall (false)
let unlimitedInk = true;
let draft = null;                   // the shape being drawn right now
let S = 1;
// the 3D camera: which way it faces, how close, and where it is looking (you can fly it)
const yaw3 = -0.62, pitch3 = 0.32;   // the fixed 3D angle
let zoom = 1, tx = 0, ty = 0, tz = 0;

// tool names: flat in 2D, solid in 3D
const TOOL_NAMES = {
  line: ['line', 'wall'], circle: ['circle', 'cylinder'], plane: ['square', 'cube'], point: ['point', 'rod'],
};

// ===== 4. SETUP =====
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(2, displayDensity()));
  fitScale();
  buildToolbar();
  loadLevel(0);
}

function fitScale() { S = min(width / (W + 140), height / (H + 220)); }
function windowResized() { resizeCanvas(windowWidth, windowHeight); fitScale(); }

const maskOf = on => on === 'all' ? ALL : on.reduce((a, l) => a | (1 << l), 0);
const layersOf = mask => [0, 1, 2].filter(l => mask & (1 << l));

function loadLevel(i) {
  level = (i + LEVELS.length) % LEVELS.length;
  const L = LEVELS[level];
  engine = Engine.create();
  things = []; draft = null;
  won = 0; released = false; inkLeft = 3000;
  for (const t of L.things) addThing(t.kind, t, maskOf(t.on), true, false);
  ballLayer = L.ball[2];
  ball = Bodies.circle(L.ball[0], L.ball[1], BALL_R, { restitution: 0.15, friction: 0.05, frictionAir: 0.0004, density: 0.002 });
  ball.plugin.mask = 1 << ballLayer;
  Body.setStatic(ball, true);           // held until you press space
  Composite.add(engine.world, ball);
  goal = { x: L.goal[0], y: L.goal[1] };
  updateFilters();
  select('#title').html(L.name);
  select('#hint').html(L.hint);
  updateToolbar();
}

// ===== 5. MAKING THINGS (a physics body + what we need to draw it) =====
function addThing(kind, d, mask, isStatic, drawn) {
  const opts = { isStatic, friction: 0.8, frictionStatic: 1, restitution: 0.1 };
  let body;
  const t = { kind, mask, drawn };
  if (kind === 'line' || kind === 'ring') {
    const pts = kind === 'ring' ? circlePts(d.x, d.y, d.r, 28) : d.pts;
    body = lineBody(pts, isStatic);
    t.local = pts.map(([x, y]) => [x - body.position.x, y - body.position.y]);
    if (!isStatic) fixInertia(body, pts);
  } else if (kind === 'peg' || kind === 'circle') {
    body = Bodies.circle(d.x, d.y, d.r, opts);
    t.r = d.r;
  } else if (kind === 'plate' || kind === 'cube') {
    body = Bodies.rectangle(d.x + d.w / 2, d.y + d.h / 2, d.w, d.h, { ...opts, angle: d.angle || 0 });
    t.w = d.w; t.h = d.h;
  } else if (kind === 'spinner') {
    body = Bodies.rectangle(d.x, d.y, d.len, THICK, opts);
    t.local = [[-d.len / 2, 0], [d.len / 2, 0]];
    t.spin = d.speed;
  }
  if (!isStatic && kind !== 'line' && kind !== 'ring') Body.setDensity(body, 0.0015);
  body.plugin.mask = mask;
  t.body = body;
  things.push(t);
  Composite.add(engine.world, body);
  return t;
}

function circlePts(x, y, r, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([x + cos(i / n * TWO_PI) * r, y + sin(i / n * TWO_PI) * r]);
  return pts;
}

// A list of points → one body made of thin rectangles.
function lineBody(pts, isStatic) {
  const parts = [];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const len = dist(x1, y1, x2, y2);
    if (len < 0.5) continue;
    parts.push(Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, len + THICK, THICK, {
      angle: atan2(y2 - y1, x2 - x1), isStatic, friction: 0.8, frictionStatic: 1,
    }));
  }
  const body = parts.length === 1 ? parts[0] : Body.create({ parts, isStatic, friction: 0.8, frictionStatic: 1, restitution: 0.05 });
  if (!isStatic) Body.setDensity(body, 0.0015);
  return body;
}

// matter.js underestimates how hard a long thin line is to spin, so give it the real value.
function fixInertia(body, pts) {
  let total = 0, I = 0;
  const c = body.position;
  for (let i = 1; i < pts.length; i++) total += dist(...pts[i - 1], ...pts[i]);
  for (let i = 1; i < pts.length; i++) {
    const len = dist(...pts[i - 1], ...pts[i]), mass = body.mass * len / total;
    const mx = (pts[i - 1][0] + pts[i][0]) / 2 - c.x, my = (pts[i - 1][1] + pts[i][1]) / 2 - c.y;
    I += mass * (len * len / 12 + mx * mx + my * my);
  }
  if (I > 0) Body.setInertia(body, I);
}

// ===== 6. THE DIMENSION RULE =====
// Each sheet is one bit. In 3D two things touch only if they share a sheet.
// In 2D everything touches everything.
function updateFilters() {
  for (const b of Composite.allBodies(engine.world)) {
    const cat = b.plugin.mask;
    for (const p of b.parts) {
      p.collisionFilter.category = cat;
      p.collisionFilter.mask = mode3D ? cat : 0xffff;
    }
  }
}

// ===== 7. DRAW LOOP =====
function draw() {
  background(...PAPER);
  m = lerp(m, mode3D ? 1 : 0, 0.08);
  if (abs(m - (mode3D ? 1 : 0)) < 0.001) m = mode3D ? 1 : 0;
  flyCamera();

  for (const t of things) if (t.spin) Body.setAngle(t.body, t.body.angle + t.spin, true);
  Engine.update(engine, 1000 / 60);

  if (ball.position.y > H + 250 || ball.position.x < -200 || ball.position.x > W + 200) resetBall();
  if (!won && dist(ball.position.x, ball.position.y, goal.x, goal.y - 22) < 34) won = 1;
  if (won) { won++; if (won > 90) loadLevel(level + 1); }

  // furthest sheet first, nearest last (this changes as you turn the camera)
  const order = [0, 1, 2].sort((a, b) => P(W / 2, H / 2, b * GAP).depth - P(W / 2, H / 2, a * GAP).depth);
  for (const layer of order) drawSheet(layer);
  for (const t of things) if (layersOf(t.mask).length > 1) drawThing(t);   // solid things, through sheets
  drawGoal();
  drawDraft();
}

// In 3D: WASD slides the camera around, Q/E down/up. It never turns: the 3D angle stays fixed.
function flyCamera() {
  if (!mode3D) return;
  const sp = 7, fx = sin(yaw3), fz = cos(yaw3), rx = cos(yaw3), rz = -sin(yaw3);
  if (keyIsDown(87)) { tx += fx * sp; tz += fz * sp; }     // W: forward
  if (keyIsDown(83)) { tx -= fx * sp; tz -= fz * sp; }     // S: back
  if (keyIsDown(68)) { tx += rx * sp; tz += rz * sp; }     // D: right
  if (keyIsDown(65)) { tx -= rx * sp; tz -= rz * sp; }     // A: left
  if (keyIsDown(69)) ty -= sp;                             // E: up
  if (keyIsDown(81)) ty += sp;                             // Q: down
}

function drawSheet(layer) {
  const z = layer * GAP;
  if (m > 0.01) {
    const c = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => P(x, y, z));
    noStroke(); fill(...PAPER, 150 * m);
    quad(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
    const active = layer === drawLayer;
    stroke(...INK, (active ? 150 : 60) * m); strokeWeight(active ? 1.6 : 1); noFill();
    for (let i = 0; i < 4; i++) wobbleLine([c[i], c[(i + 1) % 4]], 0.6);
  }
  for (const t of things) if (t.mask === (1 << layer)) drawThing(t);
  if (ballLayer === layer) drawBall(z, LAYER_ALPHA[layer]);
}

// where a point of a thing is now (it may have moved or turned)
function placed(t, x, y) {
  const a = t.body.angle, p = t.body.position;
  return [p.x + x * cos(a) - y * sin(a), p.y + x * sin(a) + y * cos(a)];
}

function drawThing(t) {
  const ls = layersOf(t.mask);
  const front = ls[0], back = ls[ls.length - 1], solid = ls.length > 1;
  const a = LAYER_ALPHA[front];
  const sideA = l => l === front ? a : 0.35 * m;            // other sheets only show in 3D
  const at = (x, y, l) => { const [wx, wy] = placed(t, x, y); return P(wx, wy, l * GAP); };

  if (t.kind === 'cube' || t.kind === 'plate') {
    const cs = [[-t.w / 2, -t.h / 2], [t.w / 2, -t.h / 2], [t.w / 2, t.h / 2], [-t.w / 2, t.h / 2]];
    if (solid) {   // a box from the front sheet to the back sheet
      const b = cs.map(([x, y]) => at(x, y, back)), f = cs.map(([x, y]) => at(x, y, front));
      inkPath([...b, b[0]], LAYER_ALPHA[back] * m + a * (1 - m), 1.6);
      for (let i = 0; i < 4; i++) inkPath([f[i], b[i]], 0.6 * m, 1.4);
    }
    const f = cs.map(([x, y]) => at(x, y, front));
    hatch(t, front, a * 0.45);
    inkPath([...f, f[0]], a, 2.2);
    return;
  }
  if (t.kind === 'peg') {
    for (const l of ls) {
      const c = at(0, 0, l), al = sideA(l);
      if (al < 0.01) continue;
      noStroke(); fill(...INK, 255 * al); circle(c.x, c.y, t.r * 2 * c.k * S + 1); noFill();
    }
    if (solid) inkPath([at(0, 0, front), at(0, 0, back)], 0.6 * m, 2.4);   // a rod
    return;
  }
  if (t.kind === 'circle') {
    for (const l of ls) {
      const al = sideA(l), n = 30, pts = [];
      for (let i = 0; i <= n; i++) pts.push(at(cos(i / n * TWO_PI) * t.r, sin(i / n * TWO_PI) * t.r, l));
      inkPath(pts, al, 2.2);
      inkPath([at(0, 0, l), at(t.r, 0, l)], al * 0.6, 1);   // a spoke, so you can see it roll
    }
    if (solid) for (let i = 0; i < 4; i++) {               // a cylinder
      const x = cos(i * HALF_PI) * t.r, y = sin(i * HALF_PI) * t.r;
      inkPath([at(x, y, front), at(x, y, back)], 0.4 * m, 1);
    }
    return;
  }
  // line, ring, spinner: drawn on each of its sheets, joined through the depth in 3D
  for (const l of ls) inkPath(t.local.map(([x, y]) => at(x, y, l)), sideA(l), 2.4);
  if (solid) {
    const step = max(1, floor(t.local.length / 8));
    for (let i = 0; i < t.local.length; i += step) {
      const [x, y] = t.local[i];
      inkPath([at(x, y, front), at(x, y, back)], 0.35 * m, 1);
    }
    const [x, y] = t.local[t.local.length - 1];
    inkPath([at(x, y, front), at(x, y, back)], 0.35 * m, 1);
  }
}

// light lines across a flat face, so a square reads as a surface
function hatch(t, l, al) {
  if (al < 0.01) return;
  stroke(...INK, 255 * al); strokeWeight(0.8);
  for (let y = -t.h / 2 + 5; y < t.h / 2; y += 7) {
    const p = P(...placed(t, -t.w / 2, y), l * GAP), q = P(...placed(t, t.w / 2, y), l * GAP);
    line(p.x, p.y, q.x, q.y);
  }
}

function drawBall(z, a) {
  const c = P(ball.position.x, ball.position.y, z);
  const r = BALL_R * c.k * S;
  stroke(...INK, 255 * a); strokeWeight(2.2); noFill();
  beginShape();
  for (let i = 0; i <= 22; i++) {
    const t = (i / 22) * TWO_PI, w = 1 + 0.06 * (noise(i * 0.7, boil()) - 0.5);
    vertex(c.x + cos(t) * r * w, c.y + sin(t) * r * w);
  }
  endShape();
  strokeWeight(3.2);
  point(c.x + cos(ball.angle - 0.6) * r * 0.45, c.y + sin(ball.angle - 0.6) * r * 0.45);
}

function drawGoal() {
  const pulse = won ? min(1, won / 30) : 0;
  for (let l = LAYERS - 1; l >= 0; l--) {
    const z = l * GAP, a = l === 0 ? 1 : 0.3 * m;
    if (a <= 0.01) continue;
    const g = (x, y) => P(goal.x + x, goal.y + y, z);
    inkPath([g(-20, 0), g(-20, -54), g(20, -54), g(20, 0)], a, 2);
    if (pulse > 0) {
      const open = 20 - 34 * pulse;
      inkPath([g(-20, 0), g(open, -4), g(open, -50), g(-20, -54)], a, 1.4);
    } else {
      stroke(...INK, 255 * a); strokeWeight(3.5);
      const k = g(12, -26); point(k.x, k.y);
    }
  }
}

// preview of what you are drawing (in 3D, also its shadow on the back sheet)
function drawDraft() {
  if (!draft) return;
  const zs = mode3D ? [0, (LAYERS - 1) * GAP] : [drawLayer * GAP];
  for (const z of zs) {
    const a = (z === zs[0] ? 0.8 : 0.35);
    const Pz = ([x, y]) => P(x, y, z);
    if (draft.tool === 'line') { inkPath(draft.pts.map(Pz), a, 2.2); continue; }
    const [x0, y0] = draft.a, [x1, y1] = draft.b;
    if (draft.tool === 'circle') { inkPath(circlePts(x0, y0, dist(x0, y0, x1, y1), 30).map(Pz), a, 2); continue; }
    inkPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(Pz), a, 2);
  }
}

// ===== 8. CAMERA =====
// In 2D the camera looks straight at the sheets. In 3D it looks from a fixed angle (yaw, pitch), and can
// zoom, and slide (tx, ty, tz move the point it looks at).
function P(x, y, z) {
  const yaw = yaw3 * m, pitch = pitch3 * m, D = 1500;
  const qx = x - W / 2 - tx * m, qy = y - H / 2 - ty * m, qz = z - GAP - tz * m;
  const x1 = qx * cos(yaw) - qz * sin(yaw);
  const z1 = qx * sin(yaw) + qz * cos(yaw);
  const y2 = qy * cos(pitch) - z1 * sin(pitch);
  const z2 = qy * sin(pitch) + z1 * cos(pitch);
  const k = lerp(1, zoom * D / max(D + z2, 40), m);   // max(): don't blow up things behind the camera
  return { x: width / 2 + x1 * k * S, y: height / 2 + 20 + y2 * k * S, k, depth: z2 };
}

// screen → world on the sheet you are drawing on (Newton's method in 3D)
function toWorld(sx, sy) {
  let x = (sx - width / 2) / S + W / 2, y = (sy - height / 2 - 20) / S + H / 2;
  if (m < 0.001) return [x, y];
  const z = (mode3D ? 0 : drawLayer) * GAP, e = 0.5;
  for (let it = 0; it < 10; it++) {
    const p = P(x, y, z), px = P(x + e, y, z), py = P(x, y + e, z);
    const a = (px.x - p.x) / e, b = (py.x - p.x) / e, c = (px.y - p.y) / e, d = (py.y - p.y) / e;
    const det = a * d - b * c; if (abs(det) < 1e-9) break;
    const rx = sx - p.x, ry = sy - p.y;
    x += (d * rx - b * ry) / det; y += (-c * rx + a * ry) / det;
  }
  return [x, y];
}

// ===== 9. HAND-DRAWN LINES =====
function boil() { return floor(frameCount / 6) * 3.1; }

function inkPath(pts, a, w) {
  if (a <= 0.01 || pts.length < 2) return;
  stroke(...INK, 255 * a); strokeWeight(w); noFill();
  wobbleLine(pts, 1.1);
}

function wobbleLine(pts, amp) {
  beginShape();
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const n = min(40, max(1, floor(dist(p.x, p.y, q.x, q.y) / 24)));
    for (let j = 0; j < n; j++) {
      const t = j / n, x = lerp(p.x, q.x, t), y = lerp(p.y, q.y, t);
      vertex(x + (noise(x * 0.02, y * 0.02, boil()) - 0.5) * 2 * amp,
             y + (noise(y * 0.02, x * 0.02, boil() + 9) - 0.5) * 2 * amp);
    }
  }
  const e = pts[pts.length - 1];
  vertex(e.x, e.y);
  endShape();
}

// ===== 10. INPUT =====
function mousePressed(e) {
  if (e && e.target && e.target.tagName !== 'CANVAS') return;   // clicks on the toolbar
  if (abs(m - (mode3D ? 1 : 0)) > 0.02) return;                  // not while the camera swings
  if (!unlimitedInk && inkLeft <= 0) return;
  const p = toWorld(mouseX, mouseY);
  if (tool === 'point') { makeDrawn('peg', { x: p[0], y: p[1], r: 6 }, 12); return; }
  draft = tool === 'line' ? { tool, pts: [p] } : { tool, a: p, b: p };
}

function mouseDragged() {
  if (!draft) return;
  const p = toWorld(mouseX, mouseY);
  if (draft.tool === 'line') {
    const last = draft.pts[draft.pts.length - 1];
    if (dist(p[0], p[1], last[0], last[1]) > 9) draft.pts.push(p);
  } else draft.b = p;
}

function mouseReleased() {
  if (!draft) return;
  const d = draft; draft = null;
  if (d.tool === 'line') {
    if (d.pts.length < 2) return;
    let len = 0; for (let i = 1; i < d.pts.length; i++) len += dist(...d.pts[i - 1], ...d.pts[i]);
    return makeDrawn('line', { pts: d.pts }, len);
  }
  const [x0, y0] = d.a, [x1, y1] = d.b;
  if (d.tool === 'circle') {
    const r = dist(x0, y0, x1, y1);
    if (r > 6) makeDrawn('circle', { x: x0, y: y0, r }, TWO_PI * r);
    return;
  }
  const w = abs(x1 - x0), h = abs(y1 - y0);
  if (w < 6 || h < 6) return;
  makeDrawn(mode3D ? 'cube' : 'plate', { x: min(x0, x1), y: min(y0, y1), w, h }, 2 * (w + h));
}

// 2D: the shape lives on the chosen sheet. 3D: it goes through every sheet.
function makeDrawn(kind, d, ink) {
  if (!unlimitedInk) { if (inkLeft < ink) return; inkLeft -= ink; }
  addThing(kind, d, mode3D ? ALL : 1 << drawLayer, fixed, true);
  updateFilters();
  updateToolbar();
}

function mouseWheel(e) {
  if (!mode3D) return;
  zoom = constrain(zoom * exp(-e.delta * 0.004), 0.4, 3);   // scroll / pinch zooms in 3D
  return false;
}

const TOOL_KEYS = { l: 'line', o: 'circle', b: 'plane', '.': 'point' };

function keyPressed() {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (keyCode === TAB) { mode3D = !mode3D; updateFilters(); updateToolbar(); return false; }
  if (key === ' ' || keyCode === ENTER) { releaseBall(); return false; }
  if (TOOL_KEYS[k]) tool = TOOL_KEYS[k];
  if (k === 'g') fixed = !fixed;
  if (k === 'i') unlimitedInk = !unlimitedInk;
  if (k === 'v') { zoom = 1; tx = ty = tz = 0; }
  if (k === 'r') loadLevel(level);
  if (k === 'n') loadLevel(level + 1);
  if (k === 'p') loadLevel(level - 1);
  if (k === 'z') {
    for (let i = things.length - 1; i >= 0; i--) if (things[i].drawn) {
      Composite.remove(engine.world, things[i].body); things.splice(i, 1); break;
    }
  }
  if (key === '1' || key === '2' || key === '3') drawLayer = int(key) - 1;
  updateToolbar();
}

function releaseBall() {
  if (released) return;
  Body.setStatic(ball, false);
  updateFilters();
  released = true;
}

function resetBall() {
  const L = LEVELS[level];
  Body.setPosition(ball, { x: L.ball[0], y: L.ball[1] });
  Body.setVelocity(ball, { x: 0, y: 0 });
  Body.setAngularVelocity(ball, 0);
  Body.setStatic(ball, true);
  updateFilters();
  released = false;
}

// ===== 11. TOOLBAR (top of the page; click it or use the keys) =====
function buildToolbar() {
  select('#tools').html(`
    <span data-tool="line"></span>
    <span data-tool="circle"></span>
    <span data-tool="plane"></span>
    <span data-tool="point"></span>
    <em>·</em>
    <span data-sheet="0">1</span><span data-sheet="1">2</span><span data-sheet="2">3</span>
    <em>·</em>
    <span data-toggle="fixed"></span>
    <span data-toggle="ink"></span>
    <span data-toggle="dim"></span>`);
  select('#tools').elt.addEventListener('mousedown', e => {
    const s = e.target.closest('span'); if (!s) return;
    if (s.dataset.tool) tool = s.dataset.tool;
    if (s.dataset.sheet) drawLayer = +s.dataset.sheet;
    if (s.dataset.toggle === 'fixed') fixed = !fixed;
    if (s.dataset.toggle === 'ink') unlimitedInk = !unlimitedInk;
    if (s.dataset.toggle === 'dim') { mode3D = !mode3D; updateFilters(); }
    updateToolbar();
  });
}

function updateToolbar() {
  const keys = { line: 'L', circle: 'O', plane: 'B', point: '.' };
  for (const s of document.querySelectorAll('#tools span')) {
    if (s.dataset.tool) {
      s.innerHTML = TOOL_NAMES[s.dataset.tool][mode3D ? 1 : 0] + ' <i>' + keys[s.dataset.tool] + '</i>';
      s.classList.toggle('on', s.dataset.tool === tool);
    }
    if (s.dataset.sheet !== undefined) {
      s.classList.toggle('on', +s.dataset.sheet === drawLayer);
      s.classList.toggle('off', mode3D);     // in 3D you draw through every sheet
    }
    if (s.dataset.toggle === 'fixed') s.innerHTML = (fixed ? 'fixed' : 'falls') + ' <i>G</i>';
    if (s.dataset.toggle === 'ink') s.innerHTML = (unlimitedInk ? 'ink ∞' : 'ink ' + floor(inkLeft)) + ' <i>I</i>';
    if (s.dataset.toggle === 'dim') s.innerHTML = (mode3D ? '3D' : '2D') + ' <i>tab</i>';
  }
}
