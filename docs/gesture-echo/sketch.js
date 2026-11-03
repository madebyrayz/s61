// GESTURE ECHO
// Draw a stroke and let go. The page remembers HOW you drew it (speed and pauses
// included) and replays it forever, copied around the centre like clock hands.
// Each new stroke becomes another echo with its own length, so the loops drift
// in and out of step with each other, like musicians playing the same phrase.
//
// p5.js works like Processing: setup() runs once, draw() runs ~60 times a second.
// The big difference is the language: JavaScript instead of Java.
//   let x = 5;        makes a variable (no "int" / "float" needed)
//   [ ]               is a list (Processing's ArrayList)
//   { x: 1, y: 2 }    is a little object with named parts (like a PVector)


// ===== 1. SETTINGS (change these numbers to change the look) =====

let copies = 6;            // how many copies go around the centre
let mirror = false;        // also draw each copy flipped, like a kaleidoscope
const TAIL = 46;           // how many points long the bright comet tail is
const MAX_ECHOES = 6;      // keep at most this many gestures; the oldest is forgotten
const MAX_POINTS = 900;    // longest gesture, in frames (900 = 15 seconds)


// ===== 2. MEMORY =====

let echoes = [];           // every finished gesture lives in this list
let recording = null;      // the gesture being drawn right now (null = not drawing)


// ===== 3. SETUP (runs once) =====

function setup() {
  createCanvas(windowWidth, windowHeight);  // fill the whole browser window
  pixelDensity(min(2, displayDensity()));   // sharp on retina screens, but never heavier than 2x
  noFill();                                 // we only draw lines, never filled shapes
  strokeCap(ROUND);
}


// ===== 4. DRAW (runs every frame) =====

function draw() {
  background(6, 6, 7);                      // wipe to near-black; everything is redrawn from memory
  translate(width / 2, height / 2);         // (0, 0) is now the centre of the window

  // 4a. RECORD: while the mouse is down, add one point per frame.
  //     Standing still still adds points, so pauses become part of the rhythm.
  if (recording && recording.points.length < MAX_POINTS) {
    recording.points.push({ x: mouseX - width / 2, y: mouseY - height / 2 });
    recording.head = recording.points.length - 1;   // the tip follows your pen
  }

  // 4b. PLAY: every finished echo moves its playhead forward and slowly turns.
  for (let e of echoes) {
    e.head = (e.head + 1) % e.points.length;  // % wraps back to 0 at the end: that is the loop
    e.angle += e.spin;                        // a tiny turn each frame, different for each echo
    e.age = min(1, e.age + 0.02);             // fade in gently after you let go
  }

  // 4c. DRAW every echo, plus the one being recorded.
  for (let e of echoes) drawEcho(e, e.age);
  if (recording) drawEcho(recording, 1);
}


// Draw one gesture: its faint ghost, its bright tail and its tip, in every copy.
function drawEcho(e, brightness) {
  const pts = e.points;
  if (pts.length < 2) return;

  const sides = mirror ? [1, -1] : [1];       // with mirror on, draw a normal and a flipped version

  for (let c = 0; c < copies; c++) {
    for (let flip of sides) {
      push();                                 // save position and rotation (like pushMatrix)
      rotate(e.angle + (TWO_PI / copies) * c);
      scale(flip, 1);                         // flip = -1 mirrors left/right

      // The ghost: the whole gesture, very dim, always there.
      stroke(255, 16 * brightness);
      strokeWeight(1);
      beginShape();
      for (let p of pts) vertex(p.x, p.y);
      endShape();

      // The comet tail: the last few points behind the playhead, fading out.
      strokeWeight(1.6);
      for (let k = 0; k < TAIL; k++) {
        const i = e.head - k;
        if (i < 1) break;                     // no tail before the first point
        const a = pts[i], b = pts[i - 1];
        const t = 1 - k / TAIL;               // 1 at the tip, 0 at the end of the tail
        stroke(255, 230 * t * t * brightness);// t * t makes the fade softer
        line(a.x, a.y, b.x, b.y);
      }

      // The tip: a small bright dot where the playhead is.
      const tip = pts[e.head];
      stroke(255, 255 * brightness);
      strokeWeight(4);
      point(tip.x, tip.y);

      pop();                                  // back to the saved position for the next copy
    }
  }
}


// ===== 5. MOUSE =====

function mousePressed() {
  // Start a new, empty gesture. It is aligned with your pen (angle 0) while you draw.
  recording = { points: [], head: 0, angle: 0, spin: 0, age: 1 };
  hideHint();
}

function mouseReleased() {
  if (!recording) return;
  if (recording.points.length > 4) {
    // Give it its own very slow turning speed, so the echoes drift apart over time.
    recording.spin = random(-1, 1) * 0.0012;
    echoes.push(recording);
    if (echoes.length > MAX_ECHOES) echoes.shift();   // forget the oldest one
  }
  recording = null;
}


// ===== 6. KEYS =====

function keyPressed() {
  if (key === '+' || key === '=') copies = min(copies + 1, 24);
  if (key === '-' || key === '_') copies = max(copies - 1, 1);
  if (key === 'm' || key === 'M') mirror = !mirror;          // ! flips true <-> false
  if (key === 'c' || key === 'C') echoes = [];
  if (key === 's' || key === 'S') saveCanvas('gesture-echo', 'png');
  if (key === 'h' || key === 'H') document.getElementById('hint').classList.toggle('hidden');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);  // the drawing is measured from the centre, so it stays put
}


// The hint at the bottom fades away a few seconds after your first stroke.
let hintTimer = null;
function hideHint() {
  if (hintTimer) return;
  hintTimer = setTimeout(() => document.getElementById('hint').classList.add('hidden'), 4000);
}
