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
}

const MAX = 3000;
/** Colour bins for batching: every segment of one bin is stroked in one draw call. */
const BINS = 24;
const FADES = 3;
/** Sources a thread listens to: the nearest few to its birthplace. */
const K = 12;
const CELL = 0.1;

interface Projector {
  (p: Vec3): { x: number; y: number; z: number };
}

export class Threads {
  count = 0;
  private pos = new Float32Array(MAX * 3);
  private prev = new Float32Array(MAX * 3);
  private home = new Float32Array(MAX * 3);
  private head = new Float32Array(MAX * 3);
  private theta = new Float32Array(MAX);
  private omega = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private near = new Int16Array(MAX * K);
  private next = 0;
  private cells = new Map<number, [number, number, number]>();
  private sources: Source[] = [];
  private lambda = 0.16;
  private carry = 0;
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

  /** Birth n threads at p, heading roughly along dir, in step with the wave there. */
  spawn(p: Vec3, dir: Vec3 | null, n: number, life: number) {
    for (let m = 0; m < n; m++) {
      const i = this.count < MAX ? this.count++ : this.next++ % MAX;
      const j = (Math.random() - 0.5) * 0.03, k = (Math.random() - 0.5) * 0.03, l = (Math.random() - 0.5) * 0.03;
      const x = p[0] + j, y = p[1] + k, z = p[2] + l;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
      this.home.set([p[0], p[1], p[2]], i * 3);
      const d: Vec3 = dir ?? [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      const L = Math.hypot(d[0], d[1], d[2]) || 1;
      this.head.set([d[0] / L, d[1] / L, d[2] / L], i * 3);
      this.theta[i] = Math.random() * Math.PI * 2;
      this.omega[i] = (Math.random() - 0.5) * 0.8;
      this.age[i] = 0;
      this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.pickNear(i);
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
  ) {
    dt = Math.min(dt, 0.05);
    const λ = this.lambda;
    if (pen) {
      this.idle = 0;
      const d: Vec3 = [pen.to[0] - pen.from[0], pen.to[1] - pen.from[1], pen.to[2] - pen.from[2]];
      this.carry += prm.spawn * dt * 60;
      const n = Math.floor(this.carry);
      this.carry -= n;
      for (let m = 0; m < n; m++) {
        const t = Math.random();
        this.spawn([pen.from[0] + d[0] * t, pen.from[1] + d[1] * t, pen.from[2] + d[2] * t], d, 1, prm.life);
      }
    } else if (prm.grow && strokePoints.length) {
      // Growth after the pen lifts slows down over time (half-life ~20 s), so an
      // untouched drawing settles and stops costing the machine anything.
      this.idle += dt;
      this.carry += prm.spawn * dt * 6 * Math.pow(0.5, this.idle / 20);
      const n = Math.floor(this.carry);
      this.carry -= n;
      for (let m = 0; m < n; m++) {
        // Born along the strokes, heading along the stroke, like the pen did.
        const j = Math.floor(Math.random() * strokePoints.length);
        const a = strokePoints[Math.max(0, j - 1)], b = strokePoints[Math.min(strokePoints.length - 1, j + 1)];
        const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const L = Math.hypot(d[0], d[1], d[2]);
        this.spawn(strokePoints[j], L > 1e-6 && L < 0.2 ? d : null, 1, prm.life);
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
          for (const a of [this.pos, this.prev, this.home, this.head]) a.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.theta[i] = this.theta[last]; this.omega[i] = this.omega[last]; this.age[i] = this.age[last]; this.life[i] = this.life[last];
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
      hx -= ax * along * 0.85; hy -= ay * along * 0.85; hz -= az * along * 0.85;
      // Rodrigues rotation of h about a by angle dθ·dt·1.5.
      const ang = dθ * dt * 1.5, cs = Math.cos(ang), sn = Math.sin(ang);
      const adh = ax * hx + ay * hy + az * hz;
      const cx = ay * hz - az * hy, cy = az * hx - ax * hz, cz = ax * hy - ay * hx;
      hx = hx * cs + cx * sn + ax * adh * (1 - cs);
      hy = hy * cs + cy * sn + ay * adh * (1 - cs);
      hz = hz * cs + cz * sn + az * adh * (1 - cs);
      // A leash back to the birthplace, so the brush stays a brush.
      const bx = this.home[o] - x, by = this.home[o + 1] - y, bz = this.home[o + 2] - z;
      const bd = Math.hypot(bx, by, bz);
      if (bd > prm.spread) {
        const pull = (bd - prm.spread) / prm.spread;
        hx += (bx / bd) * pull; hy += (by / bd) * pull; hz += (bz / bd) * pull;
      }
      const hl = Math.hypot(hx, hy, hz) || 1;
      hx /= hl; hy /= hl; hz /= hl;
      this.head[o] = hx; this.head[o + 1] = hy; this.head[o + 2] = hz;

      // Slower in the dark fringes: |ψ| gates the speed, which is what bunches the threads.
      const amp = Math.hypot(re, im);
      const speed = prm.flow * λ * (0.25 + 0.75 * Math.min(1, amp * 0.6));
      this.prev[o] = x; this.prev[o + 1] = y; this.prev[o + 2] = z;
      this.pos[o] = x + hx * speed * dt;
      this.pos[o + 1] = y + hy * speed * dt;
      this.pos[o + 2] = z + hz * speed * dt;

      // Draw.
      const a = project([this.prev[o], this.prev[o + 1], this.prev[o + 2]]);
      const b = project([this.pos[o], this.pos[o + 1], this.pos[o + 2]]);
      if (a.z <= 0.05 || b.z <= 0.05) continue;
      const fade = Math.min(1, this.age[i] * 2) * Math.min(1, (this.life[i] - this.age[i]) * 0.7);
      const bin = Math.min(BINS - 1, Math.floor(((θ / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * BINS));
      const f = Math.min(FADES - 1, Math.floor(fade * FADES));
      const slot = bin * FADES + f;
      const path = paths[slot] ?? (paths[slot] = new Path2D());
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
    this.cells = nextCells;

    ctx.lineCap = "round";
    ctx.lineWidth = 0.7 * dpr;
    const k = paper ? 0.55 : 1.0;
    for (let slot = 0; slot < paths.length; slot++) {
      const path = paths[slot];
      if (!path) continue;
      const bin = Math.floor(slot / FADES), f = slot % FADES;
      const col = palette((bin + 0.5) / BINS);
      ctx.strokeStyle = `rgba(${(col[0] * 255 * k) | 0},${(col[1] * 255 * k) | 0},${(col[2] * 255 * k) | 0},${alpha * ((f + 0.5) / FADES)})`;
      ctx.stroke(path);
    }
  }
}
