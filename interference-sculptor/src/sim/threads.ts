/**
 * Spin threads: the brush.
 *
 * Each thread is a particle with a spin, an angle θ on its own Bloch circle.
 * It is born at the pen tip and carried by the wave the nearby pinholes send
 * out (de Broglie–Bohm: it follows the phase gradient ∇S of ψ, so it rides the
 * bright fringes and avoids the dark ones), while its heading twists about that
 * direction at the rate of its spin. The spins are Kuramoto oscillators:
 * θ̇ = ω + K Σ sin(θⱼ − θ) over the threads in the same cell, plus a pull
 * toward the local phase of ψ, so neighbours fall into step and their paths
 * braid into one bundle. Colour is θ through the palette.
 *
 * Every frame each thread draws the short segment it just travelled onto a
 * canvas that is never cleared, so the picture accumulates, grain by grain.
 */

import { SOFTEN, type Source, type Vec3 } from "./field";

export interface ThreadParams {
  /** Speed along the wave, in wavelengths per second. */
  flow: number;
  /** Kuramoto coupling K. */
  coupling: number;
  /** Threads born per second while the pen moves. */
  spawn: number;
  /** Seconds a thread lives. */
  life: number;
  /** Opacity of one segment; the picture is the sum of thousands. */
  trail: number;
  /** How far a thread may wander from where it was born, in world units. */
  spread: number;
  /** Keep spawning slowly along the strokes after the pen lifts. */
  grow: boolean;
  /** How much chance is mixed into each step: 0 is deterministic, 1 is a random walk. */
  wander: number;
  /** What a thread leaves behind each step. */
  mark: Mark;
  /** 0: fly straight out along the wave (rays from the strokes); 1: glide around the wavefront shells. */
  glide: number;
  /** Radius of the small circle each thread traces as it spins, in wavelengths. The loops in the strands. */
  loop: number;
}

export type Mark = "dots" | "dashes" | "line";

const MAX = 3000;
/** Colour bins for batching: every segment of one bin is stroked in one draw call. */
const BINS = 24;
const FADES = 3;
/** Segments remembered in 3D, so the picture can be redrawn from a new viewpoint. */
const MAX_SEG = 400_000;
/** Sources a thread listens to: the nearest few to its birthplace. */
const K = 12;
const CELL = 0.1;

type Pt = { x: number; y: number; z: number };

/** One step's mark into its colour path: a dot at the end, a dash on every third step, or the segment. */
function addMark(paths: (Path2D | null)[], slot: number, a: Pt, b: Pt, mark: Mark, n: number, size: number) {
  if (mark === "dashes" && n % 3 !== 0) return;
  const path = paths[slot] ?? (paths[slot] = new Path2D());
  if (mark === "dots") {
    const r = 0.8 * size;
    path.rect(b.x - r, b.y - r, r * 2, r * 2);
    return;
  }
  path.moveTo(a.x, a.y);
  path.lineTo(b.x, b.y);
}

interface Projector {
  (p: Vec3): { x: number; y: number; z: number };
}

export class Threads {
  count = 0;
  private pos = new Float32Array(MAX * 3);
  private prev = new Float32Array(MAX * 3);
  /** Where the pen of this thread was last frame: its position plus the spin loop. */
  private pen = new Float32Array(MAX * 3);
  private home = new Float32Array(MAX * 3);
  private head = new Float32Array(MAX * 3);
  private theta = new Float32Array(MAX);
  private omega = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  /** Each thread's own pace, 0.6–1.4, so a bundle is not a lock-step march. */
  private pace = new Float32Array(MAX);
  /** The thread's colour, 0–1 through the palette, fixed at birth: one hue per region of the drawing, like one colour per qubit. */
  private hue = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private near = new Int16Array(MAX * K);
  private next = 0;
  private cells = new Map<number, [number, number, number]>();
  private sources: Source[] = [];
  private lambda = 0.16;
  private carry = 0;
  /* The drawing so far, as 3D segments in a ring: 6 floats and a colour slot each. */
  private segs = new Float32Array(MAX_SEG * 6);
  private segSlot = new Uint8Array(MAX_SEG);
  private segN = 0;
  private segHead = 0;
  /** Seconds since the pen last moved. */
  private idle = 0;

  setSources(src: Source[], lambda: number) {
    this.sources = src;
    this.lambda = lambda;
    // Re-point every living thread at the sources nearest its home.
    for (let i = 0; i < this.count; i++) this.pickNear(i);
  }

  clear() {
    this.idle = 0;
    this.segN = 0;
    this.segHead = 0;
    this.count = 0;
    this.next = 0;
    this.cells.clear();
  }

  private pickNear(i: number) {
    const hx = this.home[i * 3], hy = this.home[i * 3 + 1], hz = this.home[i * 3 + 2];
    const src = this.sources;
    const idx = src.map((s, j) => [Math.hypot(s.p[0] - hx, s.p[1] - hy, s.p[2] - hz), j] as const).sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < K; k++) this.near[i * K + k] = k < idx.length ? idx[k][1] : -1;
  }

  /**
   * Birth n threads at p as one fan: headings spread ±fan radians about dir,
   * all in one plane, so the bundle flies out as a sheet.
   */
  spawn(p: Vec3, dir: Vec3 | null, n: number, life: number, fan = 0.6) {
    const d: Vec3 = dir ?? [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    const dx = d[0] / L, dy = d[1] / L, dz = d[2] / L;
    // A direction across d, random: the plane of the fan.
    const rx = Math.random() - 0.5, ry = Math.random() - 0.5, rz = Math.random() - 0.5;
    const rd = rx * dx + ry * dy + rz * dz;
    let ux = rx - dx * rd, uy = ry - dy * rd, uz = rz - dz * rd;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    for (let m = 0; m < n; m++) {
      const i = this.count < MAX ? this.count++ : this.next++ % MAX;
      const j = (Math.random() - 0.5) * 0.02, k = (Math.random() - 0.5) * 0.02, l = (Math.random() - 0.5) * 0.02;
      const x = p[0] + j, y = p[1] + k, z = p[2] + l;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
      this.pen.set([x, y, z], i * 3);
      this.home.set([p[0], p[1], p[2]], i * 3);
      const φ = n > 1 ? (m / (n - 1) - 0.5) * 2 * fan : 0;
      const c = Math.cos(φ), sn = Math.sin(φ);
      this.head.set([dx * c + ux * sn, dy * c + uy * sn, dz * c + uz * sn], i * 3);
      this.theta[i] = Math.random() * Math.PI * 2;
      this.omega[i] = (Math.random() - 0.5) * 0.8;
      this.pace[i] = 0.6 + Math.random() * 0.8;
      this.age[i] = 0;
      this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.pickNear(i);
      // Colour from the nearest pinhole: threads born in one place share a hue, so a bundle reads as one sheet.
      const q = Math.max(0, this.near[i * K]);
      this.hue[i] = (Math.floor(q / 5) * 0.23 + Math.floor(q / 5) * 0.11 * 0.37) % 1;
    }
  }

  /** ψ and ∇S at p from the thread's own sources. */
  private wave(i: number, x: number, y: number, z: number, out: Float32Array) {
    let re = 0, im = 0, gx = 0, gy = 0, gz = 0;
    for (let k = 0; k < K; k++) {
      const j = this.near[i * K + k];
      if (j < 0) break;
      const s = this.sources[j];
      const dx = x - s.p[0], dy = y - s.p[1], dz = z - s.p[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const ph = s.k * r + s.phase, m = s.amp / (r + SOFTEN);
      const c = Math.cos(ph), sn = Math.sin(ph);
      re += m * c; im += m * sn;
      // d/dx of the phase k·r, weighted by amplitude: the direction each wave pushes.
      gx += m * dx / r; gy += m * dy / r; gz += m * dz / r;
    }
    out[0] = re; out[1] = im; out[2] = gx; out[3] = gy; out[4] = gz;
  }

  private tmp = new Float32Array(5);

  /**
   * One frame. Spawns along the pen path when it moved, otherwise (if growing)
   * along the finished strokes; advances every thread; draws its segment.
   */
  step(
    dt: number,
    prm: ThreadParams,
    pen: { from: Vec3; to: Vec3 } | null,
    strokePoints: Vec3[],
    ctx: CanvasRenderingContext2D,
    project: Projector,
    palette: (t: number) => [number, number, number],
    paper: boolean,
    dpr: number,
    zoom = 1,
  ) {
    dt = Math.min(dt, 0.05);
    const λ = this.lambda;
    if (pen) {
      this.idle = 0;
      const d: Vec3 = [pen.to[0] - pen.from[0], pen.to[1] - pen.from[1], pen.to[2] - pen.from[2]];
      this.carry += prm.spawn * dt * 60;
      // Born in fans of 6 along the pen path, heading the way the pen moves.
      while (this.carry >= 6) {
        this.carry -= 6;
        const t = Math.random();
        this.spawn([pen.from[0] + d[0] * t, pen.from[1] + d[1] * t, pen.from[2] + d[2] * t], d, 6, prm.life, 0.5);
      }
    } else if (prm.grow && strokePoints.length) {
      // Growth after the pen lifts slows down over time (half-life ~20 s), so an
      // untouched drawing settles and stops costing the machine anything.
      this.idle += dt;
      this.carry += prm.spawn * dt * 6 * Math.pow(0.5, this.idle / 20);
      // Bursts: a whole fan from one point of a stroke at a time, so the growth composes itself in sheets.
      while (this.carry >= 10) {
        this.carry -= 10;
        const j = Math.floor(Math.random() * strokePoints.length);
        this.spawn(strokePoints[j], null, 10, prm.life, 0.9);
      }
    }
    if (!this.count) return;

    // Mean spin per cell, from last frame, for the coupling.
    const cells = this.cells;
    const key = (x: number, y: number, z: number) => ((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791)) | 0;
    const nextCells = new Map<number, [number, number, number]>();
    const w = this.tmp;
    const alpha = prm.trail;
    // Segments are gathered into BINS × FADES paths and stroked at the end, so a
    // frame costs a few dozen draw calls instead of one per thread.
    const paths: (Path2D | null)[] = new Array(BINS * FADES).fill(null);

    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) {
        // Recycle: move the last live thread into this slot.
        const last = --this.count;
        if (last !== i) {
          for (const a of [this.pos, this.prev, this.pen, this.home, this.head]) a.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.theta[i] = this.theta[last]; this.omega[i] = this.omega[last]; this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.pace[i] = this.pace[last]; this.hue[i] = this.hue[last];
          this.near.copyWithin(i * K, last * K, last * K + K);
          i--;
        }
        continue;
      }
      const o = i * 3;
      const x = this.pos[o], y = this.pos[o + 1], z = this.pos[o + 2];
      this.wave(i, x, y, z, w);
      const [re, im, gx, gy, gz] = w;
      const phase = Math.atan2(im, re);
      const g = Math.hypot(gx, gy, gz) || 1;

      // Spin: own rate, the cell's mean spin, and the wave's phase.
      const c = cells.get(key(x, y, z));
      let dθ = this.omega[i];
      if (c && c[2] > 1) {
        const R = Math.hypot(c[0], c[1]) / c[2], Φ = Math.atan2(c[1], c[0]);
        dθ += prm.coupling * 2.5 * R * Math.sin(Φ - this.theta[i]);
      }
      dθ += prm.coupling * 0.8 * Math.sin(phase - this.theta[i]);
      this.theta[i] += dθ * dt;
      const θ = this.theta[i];
      const cell = key(x, y, z);
      const acc = nextCells.get(cell);
      if (acc) { acc[0] += Math.cos(θ); acc[1] += Math.sin(θ); acc[2]++; } else nextCells.set(cell, [Math.cos(θ), Math.sin(θ), 1]);

      // Heading: the thread glides over the wavefront shells (the part of its heading
      // across the wave direction a is kept, the part along a is mostly removed, so it
      // circles the sources instead of fanning out from them), then the spin turns it
      // about a. With the speed gate below, that keeps it inside one bright fringe.
      const ax = gx / g, ay = gy / g, az = gz / g;
      let hx = this.head[o], hy = this.head[o + 1], hz = this.head[o + 2];
      const along = hx * ax + hy * ay + hz * az;
      // glide 1: keep only the part across the wave (circle the sources).
      // glide 0: lean into the wave direction (fly out from the strokes in straight rays).
      const gl = prm.glide;
      hx -= ax * along * gl; hy -= ay * along * gl; hz -= az * along * gl;
      const lean = (1 - gl) * 0.03;
      hx += ax * lean; hy += ay * lean; hz += az * lean;
      // Rodrigues rotation of h about a by the spin, only as much as the thread glides (rays stay straight).
      const ang = dθ * dt * 1.5 * gl, cs = Math.cos(ang), sn = Math.sin(ang);
      const adh = ax * hx + ay * hy + az * hz;
      const cx = ay * hz - az * hy, cy = az * hx - ax * hz, cz = ax * hy - ay * hx;
      hx = hx * cs + cx * sn + ax * adh * (1 - cs);
      hy = hy * cs + cy * sn + ay * adh * (1 - cs);
      hz = hz * cs + cz * sn + az * adh * (1 - cs);
      // A leash back to the birthplace, so the brush stays a brush.
      const bx = this.home[o] - x, by = this.home[o + 1] - y, bz = this.home[o + 2] - z;
      const bd = Math.hypot(bx, by, bz);
      if (bd > prm.spread) {
        if (gl < 0.5) {
          // A ray that has flown its distance ends; turning back would curl the sheet.
          this.age[i] = this.life[i];
        } else {
          const pull = (bd - prm.spread) / prm.spread;
          hx += (bx / bd) * pull; hy += (by / bd) * pull; hz += (bz / bd) * pull;
        }
      }
      // Chance: a nudge in a random direction each step, as much as `wander` allows.
      if (prm.wander > 0) {
        const wj = prm.wander * 0.9;
        hx += (Math.random() - 0.5) * wj; hy += (Math.random() - 0.5) * wj; hz += (Math.random() - 0.5) * wj;
      }
      const hl = Math.hypot(hx, hy, hz) || 1;
      hx /= hl; hy /= hl; hz /= hl;
      this.head[o] = hx; this.head[o + 1] = hy; this.head[o + 2] = hz;

      // Slower in the dark fringes: |ψ| gates the speed, which is what bunches the threads.
      const amp = Math.hypot(re, im);
      const speed = prm.flow * λ * (0.25 + 0.75 * Math.min(1, amp * 0.6)) * (1 + (this.pace[i] - 1) * prm.wander);
      this.prev[o] = x; this.prev[o + 1] = y; this.prev[o + 2] = z;
      this.pos[o] = x + hx * speed * dt;
      this.pos[o + 1] = y + hy * speed * dt;
      this.pos[o + 2] = z + hz * speed * dt;

      // The pen of the thread: its position plus a small circle traced by the spin,
      // in the plane across the heading. That circle is the loop in each strand.
      const px0 = this.pen[o], py0 = this.pen[o + 1], pz0 = this.pen[o + 2];
      let px = this.pos[o], py = this.pos[o + 1], pz = this.pos[o + 2];
      if (prm.loop > 0) {
        // Two directions across h.
        const upx = Math.abs(hy) < 0.9 ? 0 : 1, upy = Math.abs(hy) < 0.9 ? 1 : 0;
        let n1x = upy * hz, n1y = upx * hz * -1, n1z = upx * hy - upy * hx;
        const n1l = Math.hypot(n1x, n1y, n1z) || 1;
        n1x /= n1l; n1y /= n1l; n1z /= n1l;
        const n2x = hy * n1z - hz * n1y, n2y = hz * n1x - hx * n1z, n2z = hx * n1y - hy * n1x;
        const r = prm.loop * λ, cθ = Math.cos(θ * 7) * r, sθ = Math.sin(θ * 7) * r;
        px += n1x * cθ + n2x * sθ; py += n1y * cθ + n2y * sθ; pz += n1z * cθ + n2z * sθ;
      }
      this.pen[o] = px; this.pen[o + 1] = py; this.pen[o + 2] = pz;
      if (this.age[i] < dt * 1.5) continue; // first frame: no segment yet
      const a = project([px0, py0, pz0]);
      const b = project([px, py, pz]);
      if (a.z <= 0.05 || b.z <= 0.05) continue;
      const fade = Math.min(1, this.age[i] * 2) * Math.min(1, (this.life[i] - this.age[i]) * 0.7);
      const bin = Math.min(BINS - 1, Math.floor(((this.hue[i] % 1) + 1) % 1 * BINS));
      const f = Math.min(FADES - 1, Math.floor(fade * FADES));
      const slot = bin * FADES + f;
      const h = this.segHead;
      addMark(paths, slot, a, b, prm.mark, h, Threads.markSize(dpr, zoom));
      // Remember it in 3D.
      this.segs.set([px0, py0, pz0, px, py, pz], h * 6);
      this.segSlot[h] = slot;
      this.segHead = (h + 1) % MAX_SEG;
      if (this.segN < MAX_SEG) this.segN++;
    }
    this.cells = nextCells;
    this.strokePaths(ctx, paths, alpha, palette, paper, dpr, prm.mark, zoom);
  }

  /** Marks grow with the zoom, so a strand stays a strand when you come close. */
  static markSize(dpr: number, zoom: number) {
    return dpr * Math.min(4, Math.max(0.6, 0.7 * Math.sqrt(zoom)));
  }

  private strokePaths(ctx: CanvasRenderingContext2D, paths: (Path2D | null)[], alpha: number, palette: (t: number) => [number, number, number], paper: boolean, dpr: number, mark: Mark, zoom: number) {
    ctx.lineCap = "round";
    ctx.lineWidth = Threads.markSize(dpr, zoom);
    const k = paper ? 0.55 : 1.0;
    // Dots are small, so they carry more ink each than a line would.
    const a = mark === "dots" ? Math.min(1, alpha * 2.2) : alpha;
    for (let slot = 0; slot < paths.length; slot++) {
      const path = paths[slot];
      if (!path) continue;
      const bin = Math.floor(slot / FADES), f = slot % FADES;
      const col = palette((bin + 0.5) / BINS);
      const css = `rgba(${(col[0] * 255 * k) | 0},${(col[1] * 255 * k) | 0},${(col[2] * 255 * k) | 0},${a * ((f + 0.5) / FADES)})`;
      if (mark === "dots") {
        ctx.fillStyle = css;
        ctx.fill(path);
      } else {
        ctx.strokeStyle = css;
        ctx.stroke(path);
      }
    }
  }

  /**
   * Redraw everything remembered from the current viewpoint, onto a cleared
   * canvas. `stride` > 1 draws every n-th segment, for a quick picture while
   * the view is still moving.
   */
  replay(
    ctx: CanvasRenderingContext2D,
    project: Projector,
    alpha: number,
    palette: (t: number) => [number, number, number],
    paper: boolean,
    dpr: number,
    mark: Mark,
    stride = 1,
    zoom = 1,
  ) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!this.segN) return;
    const paths: (Path2D | null)[] = new Array(BINS * FADES).fill(null);
    const segs = this.segs;
    const start = this.segN < MAX_SEG ? 0 : this.segHead;
    for (let m = 0; m < this.segN; m += stride) {
      const i = (start + m) % MAX_SEG, o = i * 6;
      const a = project([segs[o], segs[o + 1], segs[o + 2]]);
      const b = project([segs[o + 3], segs[o + 4], segs[o + 5]]);
      if (a.z <= 0.05 || b.z <= 0.05) continue;
      addMark(paths, this.segSlot[i], a, b, mark, i, Threads.markSize(dpr, zoom));
    }
    // Thinned replays get proportionally heavier ink, so the picture keeps its weight.
    this.strokePaths(ctx, paths, Math.min(1, alpha * Math.sqrt(stride)), palette, paper, dpr, mark, zoom);
  }
}
