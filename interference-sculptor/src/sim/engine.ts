import { BAKE_FS, FULLSCREEN_VS, MARCH_FS } from "./shaders";
import {
  MAX_SOURCES,
  SOFTEN,
  byGroup,
  fieldScale,
  grow,
  strokeLength,
  strokeSources,
  type Source,
  type Stroke,
  type Vec3,
} from "./field";
import { PALETTES, type ViewParams } from "@/params";

/** Grid size while a stroke is still being drawn: coarse, so it keeps up with the hand. */
const LIVE_N = 40;
/** Grid used only for Save image. */
export const CAPTURE_N = 176;
/** Bake work allowed per frame, in (voxels × sources). */
const BUDGET = 2e7;

export interface FieldSpec {
  strokes: Stroke[];
  whichPath: boolean;
  /** Gap between pinholes on a stroke, in wavelengths. */
  spacing: number;
  generations: number;
  quality: number;
}

export interface EngineEvents {
  /** A finished stroke, ready to join the drawing. */
  onStroke: (s: Stroke) => void;
  /** Source count after each generation, for the ladder. */
  onCounts: (counts: number[]) => void;
  /** True while a bake is still filling in. */
  onBaking: (b: boolean) => void;
}

interface Volume {
  tex: WebGLTexture;
  n: number;
}

interface Bake {
  vol: Volume;
  layer: number;
  count: number;
  invScale: number;
  live: boolean;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name;
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** How far from the centre a stroke may land. The field has no edge, but the grid is finest near the middle. */
const clampReach = (v: number) => Math.max(-2.5, Math.min(2.5, v));

/**
 * Owns the WebGL2 context, the camera and the pen. React tells it what to show
 * (view params) and what to compute (the field spec); it tells React when a
 * stroke is finished.
 */
export class Engine {
  private gl: WebGL2RenderingContext;
  private ctx: CanvasRenderingContext2D;
  private bake: ReturnType<typeof compile>;
  private march: ReturnType<typeof compile>;
  private srcTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private fmt: number;
  private live: Volume;
  private vols = new Map<number, Volume[]>();
  private front: Volume | null = null;
  private job: Bake | null = null;
  private raf = 0;
  private dirty = true;
  private frame = 0;

  /* camera */
  yaw = 0.75;
  pitch = 0.32;
  dist = 5.6;
  private fov = (38 * Math.PI) / 180;

  /* state from React */
  private view!: ViewParams;
  private spec: FieldSpec = { strokes: [], whichPath: false, spacing: 0.42, generations: 0, quality: 128 };
  private sources: Source[] = [];
  /** Shortest wavelength in the drawing; the renderer fades out detail the grid cannot hold. */
  private lambda = 0.16;

  /* pen */
  private drawing: { pts: Vec3[]; speed: number; last: number; samples: number } | null = null;
  private orbiting: { x: number; y: number } | null = null;
  private hover: Vec3 | null = null;
  private lastLive = 0;
  private lastInteract = 0;

  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private events: EngineEvents;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, events: EngineEvents) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.events = events;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.ctx = overlay.getContext("2d")!;
    const float = gl.getExtension("EXT_color_buffer_float");
    this.fmt = float ? gl.RGBA16F : gl.RGBA8;
    this.bake = compile(gl, FULLSCREEN_VS, BAKE_FS);
    this.march = compile(gl, FULLSCREEN_VS, MARCH_FS);
    this.fbo = gl.createFramebuffer()!;
    this.srcTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 1024, 2);
    gl.bindVertexArray(gl.createVertexArray());
    this.live = this.makeVolume(LIVE_N);
    this.bindInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  /* ------------------------------------------------------------------ */
  /* What React controls                                                */
  /* ------------------------------------------------------------------ */

  setView(v: ViewParams) {
    this.view = v;
    this.dirty = true;
  }

  setField(spec: FieldSpec) {
    this.spec = spec;
    const base = strokeSources(spec.strokes, spec.whichPath, spec.spacing);
    const all = grow(base, spec.generations);
    const counts = [base.length];
    for (let g = 1; g <= spec.generations; g++) counts.push(all.filter((s) => s.gen <= g).length);
    this.events.onCounts(counts);
    this.sources = all;
    this.lambda = spec.strokes.length ? Math.min(...spec.strokes.map((s) => s.lambda)) : 0.16;
    this.startBake(all, spec.quality, false);
  }

  /**
   * A PNG of the view at full quality: the field is re-baked at `n` and the
   * frame rendered at `scale` times the screen size, in one go, then the
   * preview volume and size come back. The high-resolution volume is freed
   * afterwards, so it costs memory only while the file is being made.
   */
  async capture(n = CAPTURE_N, scale = 2): Promise<Blob | null> {
    const gl = this.gl;
    const prevFront = this.front, prevJob = this.job;
    const W = this.canvas.width, H = this.canvas.height;
    let hi: Volume | null = null;
    if (this.sources.length) {
      hi = this.makeVolume(n);
      const { count, invScale } = this.upload(this.sources);
      this.job = { vol: hi, layer: 0, count, invScale, live: true };
      while (this.job) this.stepBake();
      this.front = hi;
    }
    this.canvas.width = W * scale;
    this.canvas.height = H * scale;
    this.overlay.width = W * scale;
    this.overlay.height = H * scale;
    this.render();
    const out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const c = out.getContext("2d")!;
    c.drawImage(this.canvas, 0, 0);
    c.drawImage(this.overlay, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
    this.canvas.width = W;
    this.canvas.height = H;
    this.overlay.width = W;
    this.overlay.height = H;
    this.front = prevFront;
    this.job = prevJob;
    if (hi) gl.deleteTexture(hi.tex);
    this.dirty = true;
    return blob;
  }

  /* ------------------------------------------------------------------ */
  /* Baking                                                             */
  /* ------------------------------------------------------------------ */

  private makeVolume(n: number): Volume {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, this.fmt, n, n, n);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    return { tex, n };
  }

  /** Two volumes per size, so a bake never writes into the one on screen. Other sizes are freed. */
  private backVolume(n: number) {
    for (const [size, pair] of this.vols) {
      if (size === n || pair.includes(this.front!)) continue;
      for (const v of pair) this.gl.deleteTexture(v.tex);
      this.vols.delete(size);
    }
    let pair = this.vols.get(n);
    if (!pair) {
      pair = [this.makeVolume(n), this.makeVolume(n)];
      this.vols.set(n, pair);
    }
    return pair[0] === this.front ? pair[1] : pair[0];
  }

  private upload(src: Source[]) {
    const sorted = byGroup(src);
    const data = new Float32Array(1024 * 2 * 4);
    sorted.forEach((s, i) => {
      data.set([s.p[0], s.p[1], s.p[2], s.amp], i * 4);
      data.set([s.k, s.phase, s.group, 0], (1024 + i) * 4);
    });
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, 2, gl.RGBA, gl.FLOAT, data);
    return { count: Math.min(sorted.length, MAX_SOURCES), invScale: 1 / fieldScale(sorted) };
  }

  private startBake(src: Source[], n: number, live: boolean) {
    if (!src.length) {
      this.job = null;
      this.front = null;
      this.events.onBaking(false);
      this.dirty = true;
      return;
    }
    if (live && this.job && !this.job.live) this.events.onBaking(false);
    const { count, invScale } = this.upload(src);
    this.job = { vol: live ? this.live : this.backVolume(n), layer: 0, count, invScale, live };
    if (!live) this.events.onBaking(true);
  }

  private stepBake() {
    const job = this.job;
    if (!job) return;
    const gl = this.gl;
    const n = job.vol.n;
    const perLayer = n * n * Math.max(job.count, 1);
    const layers = job.live ? n : Math.max(1, Math.min(n, Math.floor(BUDGET / perLayer)));
    const { p, loc } = this.bake;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform1i(loc.uSrc, 0);
    gl.uniform1i(loc.uCount, job.count);
    gl.uniform1f(loc.uN, n);
    gl.uniform1f(loc.uInvScale, job.invScale);
    gl.uniform1f(loc.uSoften, SOFTEN);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, n, n);
    gl.disable(gl.BLEND);
    for (let i = 0; i < layers && job.layer < n; i++, job.layer++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, job.vol.tex, 0, job.layer);
      gl.uniform1f(loc.uZ, ((job.layer + 0.5) / n) * 2 - 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (job.layer >= n) {
      this.front = job.vol;
      this.job = null;
      if (!job.live) this.events.onBaking(false);
      this.dirty = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                             */
  /* ------------------------------------------------------------------ */

  private basis() {
    const cp = Math.cos(this.pitch);
    const eye: Vec3 = [this.dist * cp * Math.sin(this.yaw), this.dist * Math.sin(this.pitch), this.dist * cp * Math.cos(this.yaw)];
    const fwd = norm([-eye[0], -eye[1], -eye[2]]);
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return { eye, fwd, right, up };
  }

  private aspect() {
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  /** The point under the cursor on the drawing plane: through the centre, offset by depth, facing the camera. */
  private onPlane(clientX: number, clientY: number): Vec3 {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = 1 - ((clientY - r.top) / r.height) * 2;
    const { eye, fwd, right, up } = this.basis();
    const t = Math.tan(this.fov / 2);
    const rd = norm([
      fwd[0] + x * t * this.aspect() * right[0] + y * t * up[0],
      fwd[1] + x * t * this.aspect() * right[1] + y * t * up[1],
      fwd[2] + x * t * this.aspect() * right[2] + y * t * up[2],
    ]);
    const d = this.view?.depth ?? 0;
    const p0: Vec3 = [fwd[0] * d, fwd[1] * d, fwd[2] * d];
    const s = dot(sub(p0, eye), fwd) / dot(rd, fwd);
    return [clampReach(eye[0] + rd[0] * s), clampReach(eye[1] + rd[1] * s), clampReach(eye[2] + rd[2] * s)];
  }

  private project(p: Vec3, b = this.basis()) {
    const v = sub(p, b.eye);
    const z = dot(v, b.fwd);
    const t = Math.tan(this.fov / 2);
    const x = dot(v, b.right) / (z * t * this.aspect());
    const y = dot(v, b.up) / (z * t);
    const W = this.overlay.width, H = this.overlay.height;
    return { x: ((x + 1) / 2) * W, y: ((1 - y) / 2) * H, z };
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                              */
  /* ------------------------------------------------------------------ */

  private unbind?: () => void;

  private bindInput() {
    const c = this.overlay;
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      this.lastInteract = performance.now();
      const orbit = e.button === 2 || e.button === 1 || e.shiftKey || this.view?.tool === "orbit";
      if (orbit) {
        this.orbiting = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      const p = this.onPlane(e.clientX, e.clientY);
      this.drawing = { pts: [p], speed: 0, last: performance.now(), samples: 0 };
    };
    const move = (e: PointerEvent) => {
      this.lastInteract = performance.now();
      if (this.orbiting) {
        const dx = e.clientX - this.orbiting.x, dy = e.clientY - this.orbiting.y;
        this.orbiting = { x: e.clientX, y: e.clientY };
        this.yaw -= dx * 0.008;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.008));
        this.dirty = true;
        return;
      }
      const p = this.onPlane(e.clientX, e.clientY);
      this.hover = p;
      this.dirty = true;
      const d = this.drawing;
      if (!d) return;
      const last = d.pts[d.pts.length - 1];
      const step = Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]);
      if (step < 0.01) return;
      const now = performance.now();
      const v = step / Math.max(1, now - d.last) * 1000;
      d.speed = (d.speed * d.samples + v) / (d.samples + 1);
      d.samples++;
      d.last = now;
      d.pts.push(p);
      if (now - this.lastLive > 70) {
        this.lastLive = now;
        this.liveBake();
      }
    };
    const up = (e: PointerEvent) => {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.orbiting = null;
      const d = this.drawing;
      this.drawing = null;
      if (!d) return;
      this.events.onStroke({ points: d.pts, lambda: this.strokeLambda(d) });
    };
    const leave = () => {
      this.hover = null;
      this.dirty = true;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.dist = Math.max(1.2, Math.min(14, this.dist * Math.exp(e.deltaY * 0.001)));
      this.lastInteract = performance.now();
      this.dirty = true;
    };
    const menu = (e: Event) => e.preventDefault();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("contextmenu", menu);
    this.unbind = () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("contextmenu", menu);
    };
  }

  /** A slow hand draws a long wavelength, a fast hand a short one. */
  private strokeLambda(d: { speed: number; pts: Vec3[] }) {
    if (!this.view?.handSetsLambda || d.pts.length < 3 || strokeLength(d.pts) < 0.05) return this.view?.lambda ?? 0.16;
    const t = Math.min(1, Math.max(0, (d.speed - 0.4) / 2.6));
    return 0.26 - t * 0.15;
  }

  private liveBake() {
    const d = this.drawing;
    if (!d) return;
    const strokes = [...this.spec.strokes, { points: d.pts, lambda: this.strokeLambda(d) }];
    this.startBake(strokeSources(strokes, this.spec.whichPath, this.spec.spacing), LIVE_N, true);
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                              */
  /* ------------------------------------------------------------------ */

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.resize();
    this.stepBake();
    const idle = performance.now() - this.lastInteract > 1500;
    if (this.view?.autoRotate && idle && !this.drawing) {
      this.yaw += 0.0025;
      this.dirty = true;
    }
    if (this.dirty) this.render();
  };

  private resize() {
    // Rendered at 1× regardless of the display: the raymarch costs a full shader per pixel.
    const dpr = 1;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.overlay.width = w;
      this.overlay.height = h;
      this.dirty = true;
    }
  }

  render() {
    this.dirty = false;
    this.frame++;
    const gl = this.gl, v = this.view;
    if (!v) return;
    const b = this.basis();
    const pal = PALETTES[v.palette];
    const paper = v.background === "paper";
    const bg: Vec3 = paper ? [0.949, 0.937, 0.91] : [0.039, 0.039, 0.043];
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.front) {
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else {
      const { p, loc } = this.march;
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, this.front.tex);
      gl.uniform1i(loc.uVol, 0);
      gl.uniform2f(loc.uRes, this.canvas.width, this.canvas.height);
      gl.uniform3fv(loc.uEye, b.eye);
      gl.uniform3fv(loc.uFwd, b.fwd);
      gl.uniform3fv(loc.uRight, b.right);
      gl.uniform3fv(loc.uUp, b.up);
      gl.uniform1f(loc.uTan, Math.tan(this.fov / 2));
      gl.uniform1f(loc.uAspect, this.aspect());
      gl.uniform1i(loc.uMode, v.render === "volume" ? 0 : v.render === "surface" ? 1 : 2);
      gl.uniform1i(loc.uColorBy, v.colorBy === "phase" ? 0 : v.colorBy === "fringe" ? 1 : 2);
      gl.uniform3fv(loc.uPa, pal[0]);
      gl.uniform3fv(loc.uPb, pal[1]);
      gl.uniform3fv(loc.uPc, pal[2]);
      gl.uniform3fv(loc.uPd, pal[3]);
      gl.uniform1f(loc.uThreshold, v.threshold);
      gl.uniform1f(loc.uDensity, v.density);
      gl.uniform1f(loc.uExposure, v.exposure);
      gl.uniform1f(loc.uReach, v.reach);
      gl.uniform1f(loc.uN, this.front.n);
      gl.uniform1f(loc.uPaper, paper ? 1 : 0);
      gl.uniform3fv(loc.uBg, bg);
      gl.uniform1f(loc.uFrame, this.frame % 64);
      gl.uniform1f(loc.uLambda, this.lambda);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.drawOverlay(b, paper);
  }

  private drawOverlay(b: ReturnType<Engine["basis"]>, paper: boolean) {
    const c = this.ctx, v = this.view;
    const W = this.overlay.width, H = this.overlay.height;
    const dpr = W / Math.max(1, this.overlay.getBoundingClientRect().width);
    c.clearRect(0, 0, W, H);
    const ink = paper ? "20,20,22" : "236,236,240";
    const line = (a: Vec3, z: Vec3) => {
      const p = this.project(a, b), q = this.project(z, b);
      c.moveTo(p.x, p.y);
      c.lineTo(q.x, q.y);
    };

    // A floor grid under the field, for a sense of up and of scale, fading toward its rim.
    if (v.showGrid) {
      const y = -1.1, R = 3, step = 0.5;
      c.lineWidth = dpr;
      for (let i = -R; i <= R + 1e-6; i += step) {
        for (const axis of [0, 1]) {
          const a: Vec3 = axis ? [i, y, -R] : [-R, y, i];
          const z: Vec3 = axis ? [i, y, R] : [R, y, i];
          const p = this.project(a, b), q = this.project(z, b);
          if (p.z <= 0.05 || q.z <= 0.05) continue;
          const g = c.createLinearGradient(p.x, p.y, q.x, q.y);
          const edge = Math.max(0, 1 - Math.abs(i) / (R + step));
          const k = 0.11 * edge;
          g.addColorStop(0, `rgba(${ink},0)`);
          g.addColorStop(0.5, `rgba(${ink},${k})`);
          g.addColorStop(1, `rgba(${ink},0)`);
          c.strokeStyle = g;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(q.x, q.y);
          c.stroke();
        }
      }
    }

    // The drawing plane, while the pen is over it.
    if (v.tool === "draw" && (this.hover || this.drawing)) {
      const d = v.depth, k = 0.9;
      const ctr: Vec3 = [b.fwd[0] * d, b.fwd[1] * d, b.fwd[2] * d];
      const corner = (sx: number, sy: number): Vec3 => [
        ctr[0] + (b.right[0] * sx + b.up[0] * sy) * k,
        ctr[1] + (b.right[1] * sx + b.up[1] * sy) * k,
        ctr[2] + (b.right[2] * sx + b.up[2] * sy) * k,
      ];
      c.strokeStyle = `rgba(${ink},0.16)`;
      c.setLineDash([3 * dpr, 5 * dpr]);
      c.beginPath();
      line(corner(-1, -1), corner(1, -1));
      line(corner(1, -1), corner(1, 1));
      line(corner(1, 1), corner(-1, 1));
      line(corner(-1, 1), corner(-1, -1));
      c.stroke();
      c.setLineDash([]);
      if (this.hover && !this.drawing) {
        const h = this.project(this.hover, b);
        c.fillStyle = `rgba(${ink},0.7)`;
        c.beginPath();
        c.arc(h.x, h.y, 2.2 * dpr, 0, Math.PI * 2);
        c.fill();
      }
    }

    const strokes = this.drawing ? [...this.spec.strokes, { points: this.drawing.pts, lambda: 0 }] : this.spec.strokes;
    if (v.showStrokes || this.drawing) {
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const s of strokes) {
        const pts = s.points.map((p) => this.project(p, b));
        c.strokeStyle = `rgba(${ink},0.85)`;
        c.lineWidth = 1.4 * dpr;
        if (pts.length === 1) {
          c.beginPath();
          c.arc(pts[0].x, pts[0].y, 2.5 * dpr, 0, Math.PI * 2);
          c.stroke();
          continue;
        }
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.stroke();
      }
    }
    if (v.showStrokes && !this.drawing) {
      c.strokeStyle = `rgba(${ink},0.6)`;
      c.lineWidth = dpr;
      for (const s of this.sources) {
        if (!s.gen) continue;
        const p = this.project(s.p, b);
        c.beginPath();
        c.arc(p.x, p.y, (1.5 + 2.5 / s.gen) * dpr, 0, Math.PI * 2);
        c.stroke();
      }
    }
  }
}
