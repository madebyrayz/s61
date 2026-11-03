// CAVE: a line-drawing physics puzzle about dimensions.
//
// The world is three sheets of paper stacked one behind the other.
//   2D (flat):  you look straight at the stack. Everything is squashed together,
//               so every line touches every other line.
//   3D (deep):  press Space and the camera swings round. Now the sheets have depth,
//               and things on different sheets slide straight through each other.
// Anything you draw becomes a real object with weight (physics by matter.js).
// Get the ink ball to the little door.
//
// p5.js draws everything; matter.js only does the physics math.

const { Engine, Bodies, Body, Composite } = Matter;

// ===== 1. WORLD SIZE & LOOK =====
const W = 1000, H = 600;           // world size (the paper), in world units
const GAP = 150;                   // distance between paper sheets in 3D
const LAYERS = 3;
const INK = [20, 20, 22];          // ink colour
const PAPER = [243, 242, 238];     // paper colour
const LAYER_ALPHA = [1, 0.5, 0.26];// back sheets are paler: in Flatland, depth shows as fading
const THICK = 7;                   // how thick a drawn line is, for physics
const ALL = 0x0008;                // collision group for things that exist on every sheet

// ===== 2. LEVELS =====
// Each level: ball start, goal, ink allowed, and static lines [layer or 'all', points...]
const LEVELS = [
  {
    name: 'one · a line is a thing',
    hint: 'draw lines (in 2D or 3D) &nbsp;·&nbsp; <b>space</b> 2D ↔ 3D &nbsp;·&nbsp; <b>shift-drag</b> / two-finger swipe to spin, pinch to zoom, <b>v</b> reset view &nbsp;·&nbsp; <b>enter</b> lets the ball go &nbsp;·&nbsp; <b>r</b> restart &nbsp;·&nbsp; <b>z</b> undo',
    ball: [50, 172, 0], goal: [905, 324], ink: 6000, start3D: false,
    statics: [
      ['all', [0, 170], [300, 300]],
      ['all', [640, 300], [760, 300], [1000, 340]],
    ],
  },
  {
    name: 'two · depth',
    hint: 'a wall on another sheet blocks you only when the world is flat &nbsp;·&nbsp; <b>space</b> 2D ↔ 3D',
    ball: [70, 164, 0], goal: [905, 500], ink: 6000, start3D: false,
    statics: [
      ['all', [0, 150], [520, 420], [1000, 520]],
      [1, [560, 260], [560, 520]],
    ],
  },
  {
    name: 'three · flatten in time',
    hint: 'go deep to slip through the wall, then flatten to land on the far sheet',
    ball: [60, 110, 0], goal: [920, 407], ink: 6000, start3D: false,
    statics: [
      ['all', [0, 110], [600, 330]],
      [1, [400, 120], [400, 330]],
      [2, [560, 410], [1000, 410]],
    ],
  },
  {
    name: 'four · your own depth',
    hint: 'build a bridge, then find the dimension where the hanging wall is not there &nbsp;·&nbsp; <b>1 2 3</b> pick the sheet you draw on',
    ball: [36, 56, 0], goal: [900, 217], ink: 6000, start3D: false,
    statics: [
      ['all', [0, 60], [230, 186], [290, 190]],
      [1, [470, 0], [470, 172]],
      ['all', [630, 190], [700, 190], [1000, 230]],
    ],
  },
];

// ===== 3. STATE =====
let engine, ball, ballLayer, goal;
let statics = [];       // { body, layer, pts }
let drawn = [];         // { body, layer, local }  local = stroke points relative to the body
let level = 0, inkLeft = 0, released = false, won = 0;
let mode3D = false;     // what the player asked for
let m = 0;              // smooth 0 (2D) → 1 (3D) used by the camera
let drawLayer = 0;      // which sheet new lines go on
let stroke_ = null;     // the line being drawn right now
let S = 1;              // world → screen scale
let yaw3 = -0.62, pitch3 = 0.32, zoom = 1;   // the 3D camera, which you can spin around
let orbiting = false;

// ===== 4. SETUP =====
function setup() {
  createCanvas(windowWidth, windowHeight);
  document.oncontextmenu = () => false;   // so right-drag can spin the camera
  pixelDensity(min(2, displayDensity()));
  fitScale();
  loadLevel(0);
}

function fitScale() { S = min(width / (W + 140), height / (H + 200)); }
function windowResized() { resizeCanvas(windowWidth, windowHeight); fitScale(); }

function loadLevel(i) {
  level = (i + LEVELS.length) % LEVELS.length;
  const L = LEVELS[level];
  engine = Engine.create();
  engine.gravity.y = 1;
  statics = []; drawn = []; stroke_ = null;
  released = false; won = 0; inkLeft = L.ink;
  mode3D = L.start3D; drawLayer = 0;

  for (const s of L.statics) {
    const layer = s[0], pts = s.slice(1);
    const body = lineBody(pts, true);
    setLayer(body, layer);
    statics.push({ body, layer, pts });
    Composite.add(engine.world, body);
  }
  ballLayer = L.ball[2];
  ball = Bodies.circle(L.ball[0], L.ball[1], 15, { restitution: 0.1, friction: 0.05, frictionAir: 0.0004, density: 0.002 });
  Body.setStatic(ball, true);           // held still until you press enter
  setLayer(ball, ballLayer);
  Composite.add(engine.world, ball);
  goal = { x: L.goal[0], y: L.goal[1] };
  updateFilters();

  select('#title').html(L.name);
  select('#hint').html(L.hint);
}

// Turn a list of points into one physics body made of thin rectangles.
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
  if (parts.length === 1) return parts[0];
  return Body.create({ parts, isStatic, friction: 0.8, frictionStatic: 1, restitution: 0.05 });
}

// matter.js underestimates how hard a long, thin compound line is to spin,
// so long lines flip like paper. Give it the real "rotational weight" (moment of inertia):
// every bit of line counts more the further it is from the centre.
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

// ===== 5. THE DIMENSION RULE (collision filters) =====
// Each sheet has its own "category" bit. In 3D a body only collides with its own sheet
// (plus things that exist on all sheets). In 2D it collides with everything.
function setLayer(body, layer) { body.plugin.layer = layer; }

function updateFilters() {
  const bodies = Composite.allBodies(engine.world);
  for (const b of bodies) {
    const layer = b.plugin.layer;
    const cat = layer === 'all' ? ALL : 1 << layer;
    const mask = (mode3D && layer !== 'all') ? (cat | ALL) : 0xffff;
    for (const p of b.parts) { p.collisionFilter.category = cat; p.collisionFilter.mask = mask; }
  }
}

// ===== 6. DRAW LOOP =====
function draw() {
  background(...PAPER);
  m = lerp(m, mode3D ? 1 : 0, 0.08);          // ease the camera between 2D and 3D
  if (abs(m - (mode3D ? 1 : 0)) < 0.001) m = mode3D ? 1 : 0;

  Engine.update(engine, 1000 / 60);

  // fell off the paper: put the ball back
  if (ball.position.y > H + 250 || ball.position.x < -200 || ball.position.x > W + 200) resetBall();

  // reached the door?
  if (!won && dist(ball.position.x, ball.position.y, goal.x, goal.y - 22) < 34) won = 1;
  if (won) { won++; if (won > 90) loadLevel(level + 1); }

  // painter's order: the sheet furthest from the camera first, the nearest last
  // (this changes as you spin around, so we measure each sheet's distance every frame)
  const order = [...Array(LAYERS).keys()].sort((a, b) => P(W / 2, H / 2, b * GAP).depth - P(W / 2, H / 2, a * GAP).depth);
  for (const layer of order) drawSheet(layer);
  drawGoal();
  drawInkBar();
}

// One paper sheet with everything that lives on it.
function drawSheet(layer) {
  const z = layer * GAP;
  const a = LAYER_ALPHA[layer];
  // the sheet itself, only visible as paper in 3D
  if (m > 0.01) {
    const c = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => P(x, y, z));
    noStroke(); fill(...PAPER, 150 * m);
    quad(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
    const active = layer === drawLayer && LEVELS[level].ink > 0;
    stroke(...INK, (active ? 150 : 60) * m); strokeWeight(active ? 1.6 : 1); noFill();
    for (let i = 0; i < 4; i++) wobbleLine([c[i], c[(i + 1) % 4]], 0.6);
  }
  // static lines: 'all' lines are drawn on every sheet
  for (const s of statics) {
    if (s.layer === layer || (s.layer === 'all' && layer === 0)) {
      if (s.layer === 'all') {
        // a ground that exists on every sheet: draw it as a ribbon through the depth
        for (let l = LAYERS - 1; l >= 0; l--) inkPath(s.pts.map(([x, y]) => P(x, y, l * GAP)), l === 0 ? 1 : 0.35 * m, 2.4);
        for (const [x, y] of s.pts) inkPath([P(x, y, 0), P(x, y, (LAYERS - 1) * GAP)], 0.35 * m, 1);
      } else {
        inkPath(s.pts.map(([x, y]) => P(x, y, z)), a, 2.4);
      }
    }
  }
  // lines you drew
  for (const d of drawn) {
    if (d.layer !== layer) continue;
    const pos = d.body.position, ang = d.body.angle;
    const pts = d.local.map(([x, y]) => {
      const rx = x * cos(ang) - y * sin(ang), ry = x * sin(ang) + y * cos(ang);
      return P(pos.x + rx, pos.y + ry, z);
    });
    inkPath(pts, a, 2.2);
  }
  // the line being drawn
  if (stroke_ && drawLayer === layer) inkPath(stroke_.map(([x, y]) => P(x, y, z)), a * 0.8, 2.2);
  // the ball
  if (ballLayer === layer) drawBall(z, a);
}

function drawBall(z, a) {
  const c = P(ball.position.x, ball.position.y, z);
  const r = 15 * c.k * S;
  stroke(...INK, 255 * a); strokeWeight(2.2); noFill();
  const n = 22, ang = ball.angle;
  beginShape();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TWO_PI;
    const w = 1 + 0.06 * (noise(i * 0.7, boil()) - 0.5);
    vertex(c.x + cos(t) * r * w, c.y + sin(t) * r * w);
  }
  endShape();
  // a little eye that shows it rolling
  strokeWeight(3.2);
  point(c.x + cos(ang - 0.6) * r * 0.45, c.y + sin(ang - 0.6) * r * 0.45);
}

// The door: drawn on every sheet, since you can reach it in any dimension.
function drawGoal() {
  const pulse = won ? min(1, won / 30) : 0;
  for (let l = LAYERS - 1; l >= 0; l--) {
    const z = l * GAP, a = l === 0 ? 1 : 0.3 * m;
    if (a <= 0.01) continue;
    const g = (x, y) => P(goal.x + x, goal.y + y, z);
    inkPath([g(-20, 0), g(-20, -54), g(20, -54), g(20, 0)], a, 2);
    if (pulse > 0) {           // the door swings open when you win
      const open = 20 - 34 * pulse;
      inkPath([g(-20, 0), g(open, -4), g(open, -50), g(-20, -54)], a, 1.4);
    } else {
      stroke(...INK, 255 * a); strokeWeight(3.5);
      const k = g(12, -26); point(k.x, k.y);
    }
  }
}

function drawInkBar() {
  const L = LEVELS[level];
  if (!L.ink) return;
  const full = 160, left = full * (inkLeft / L.ink);
  stroke(...INK, 40); strokeWeight(2);
  line(width / 2 - full / 2, 48, width / 2 + full / 2, 48);
  stroke(...INK, 200);
  line(width / 2 - full / 2, 48, width / 2 - full / 2 + left, 48);
  // which sheet you are drawing on: three little marks, the active one dark
  for (let i = 0; i < LAYERS; i++) {
    stroke(...INK, i === drawLayer ? 220 : 50); strokeWeight(i === drawLayer ? 3 : 1.5);
    const x = width / 2 + full / 2 + 22 + i * 12;
    line(x, 42, x, 54);
  }
}

// ===== 7. CAMERA: world (x, y, z) → screen =====
// In 2D the camera looks straight at the sheets (z is ignored).
// In 3D it swings round and tilts down, so z (depth) appears.
function P(x, y, z) {
  const yaw = yaw3 * m, pitch = pitch3 * m, D = 1500;
  const qx = x - W / 2, qy = y - H / 2, qz = z - GAP;
  const x1 = qx * cos(yaw) - qz * sin(yaw);
  const z1 = qx * sin(yaw) + qz * cos(yaw);
  const y2 = qy * cos(pitch) - z1 * sin(pitch);
  const z2 = qy * sin(pitch) + z1 * cos(pitch);
  const k = lerp(1, zoom * D / (D + z2), m);
  return { x: width / 2 + x1 * k * S, y: height / 2 + 10 + y2 * k * S, k, depth: z2 };
}

// screen → world, on the sheet you are drawing on.
// In 2D this is simple. In 3D we "search" for the point on that sheet whose projection
// lands under the mouse (Newton's method: guess, see how far off, correct, repeat).
function toWorld(sx, sy) {
  let x = (sx - width / 2) / S + W / 2, y = (sy - height / 2 - 10) / S + H / 2;
  if (m < 0.001) return [x, y];
  const z = drawLayer * GAP, e = 0.5;
  for (let it = 0; it < 8; it++) {
    const p = P(x, y, z), px = P(x + e, y, z), py = P(x, y + e, z);
    const a = (px.x - p.x) / e, b = (py.x - p.x) / e, c = (px.y - p.y) / e, d = (py.y - p.y) / e;
    const det = a * d - b * c; if (abs(det) < 1e-9) break;
    const rx = sx - p.x, ry = sy - p.y;
    x += (d * rx - b * ry) / det; y += (-c * rx + a * ry) / det;
  }
  return [x, y];
}

// ===== 8. HAND-DRAWN LINES =====
// Lines "boil" a little, like hand-drawn animation: the wobble changes every few frames.
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
    const n = max(1, floor(dist(p.x, p.y, q.x, q.y) / 24));
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

// ===== 9. INPUT =====
function mousePressed() {
  // shift + drag, or right-drag, spins the camera around (in 3D)
  if (keyIsDown(SHIFT) || mouseButton === RIGHT) {
    if (!mode3D) { mode3D = true; updateFilters(); }   // spinning only makes sense in 3D
    orbiting = true; return;
  }
  if (abs(m - (mode3D ? 1 : 0)) > 0.02 || inkLeft <= 0) return;   // not while the camera is turning
  stroke_ = [toWorld(mouseX, mouseY)];
}

function mouseDragged() {
  if (orbiting) {
    yaw3 -= movedX * 0.008;
    pitch3 = constrain(pitch3 + movedY * 0.006, -1.3, 1.3);
    return;
  }
  if (!stroke_) return;
  const p = toWorld(mouseX, mouseY), last = stroke_[stroke_.length - 1];
  const d = dist(p[0], p[1], last[0], last[1]);
  if (d > 9 && inkLeft - d > 0) { stroke_.push(p); inkLeft -= d; }
}

function mouseReleased() {
  orbiting = false;
  if (!stroke_) return;
  if (stroke_.length >= 2) {
    const body = lineBody(stroke_, false);
    Body.setDensity(body, 0.0015);
    fixInertia(body, stroke_);
    setLayer(body, drawLayer);
    // remember the stroke relative to the body's centre, so we can redraw it as it moves
    const c = body.position;
    const local = stroke_.map(([x, y]) => [x - c.x, y - c.y]);
    drawn.push({ body, layer: drawLayer, local, ink: 0 });
    Composite.add(engine.world, body);
    updateFilters();
  }
  stroke_ = null;
}

// Trackpad: two-finger swipe spins the camera, pinch zooms (in 3D).
function mouseWheel(e) {
  if (!mode3D) return;
  if (e.ctrlKey) zoom = constrain(zoom * exp(-e.delta * 0.01), 0.4, 3);
  else { yaw3 -= e.deltaX * 0.004; pitch3 = constrain(pitch3 + e.deltaY * 0.003, -1.3, 1.3); }
  return false;
}

function keyPressed() {
  if (key === 'v' || key === 'V') { yaw3 = -0.62; pitch3 = 0.32; zoom = 1; }
  if (key === ' ') { mode3D = !mode3D; updateFilters(); return false; }
  if (keyCode === ENTER) { if (!released) { Body.setStatic(ball, false); setLayer(ball, ballLayer); updateFilters(); released = true; } }
  if (key === 'r' || key === 'R') loadLevel(level);
  if (key === 'n' || key === 'N') loadLevel(level + 1);
  if (key === 'p' || key === 'P') loadLevel(level - 1);
  if (key === 'z' || key === 'Z') {
    const d = drawn.pop();
    if (d) Composite.remove(engine.world, d.body);
  }
  if (key === '1' || key === '2' || key === '3') drawLayer = int(key) - 1;
}

function resetBall() {
  const L = LEVELS[level];
  Body.setPosition(ball, { x: L.ball[0], y: L.ball[1] });
  Body.setVelocity(ball, { x: 0, y: 0 });
  Body.setAngularVelocity(ball, 0);
  Body.setStatic(ball, true);
  setLayer(ball, ballLayer);
  updateFilters();
  released = false;
}
