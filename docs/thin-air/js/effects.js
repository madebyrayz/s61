// ─────────────────────────────────────────────────────────────────────────────
// effects.js — the system draws ON your drawing.
//
// Once a drawing is recognised, the system adds new lines to it in the same
// ink: water sprays out of a fire hydrant, ice cream drips, steam rises from a
// mug, flames flicker on a candle, a house's chimney smokes, music notes float
// off a guitar…
//
// Each effect is a tiny "particle system": little marks that are born at a spot
// ON your drawing (its top, its lower edge, its side…), move for a while
// (rise, fall, sway) and fade away. All positions are stored relative to the
// drawing (in units of its size), so the effects move and turn with it.
// ─────────────────────────────────────────────────────────────────────────────

import { project, drawLine } from './ink.js';

// ── which effects each category gets ─────────────────────────────────────────
const E = {
  fire_hydrant: ['spray'], garden_hose: ['spray'], whale: ['spout'], sink: ['drip'],
  ice_cream: ['drip'], popsicle: ['drip'], paint_can: ['drip'], paintbrush: ['drip'], lollipop: ['sparkle'],
  candle: ['flame', 'drip'], birthday_cake: ['flame'], matches: ['flame'], lighter: ['flame'],
  campfire: ['flame', 'smoke'], fireplace: ['flame', 'smoke'], lantern: ['flame', 'rays'],
  coffee_cup: ['steam'], mug: ['steam'], cup: ['steam'], teapot: ['steam'], hot_dog: ['steam'],
  pizza: ['steam'], steak: ['steam'], frying_pan: ['steam'], stove: ['steam'], oven: ['steam'],
  hot_tub: ['steam', 'bubbles'], bread: ['steam'], hamburger: ['steam'], cake: ['sparkle'],
  house: ['smoke'], barn: ['smoke'], castle: ['smoke'], train: ['smoke'], cannon: ['smoke'],
  car: ['exhaust'], bus: ['exhaust'], school_bus: ['exhaust'], truck: ['exhaust'], pickup_truck: ['exhaust'],
  police_car: ['exhaust', 'rays'], ambulance: ['exhaust', 'rays'], firetruck: ['exhaust', 'rays'],
  van: ['exhaust'], tractor: ['exhaust'], bulldozer: ['exhaust'], motorbike: ['exhaust'],
  light_bulb: ['rays'], floor_lamp: ['rays'], streetlight: ['rays'], flashlight: ['beam'],
  lighthouse: ['beam'], chandelier: ['rays'], sun: ['rays'], traffic_light: ['rays'],
  cloud: ['rain'], umbrella: ['rain'], rain: ['rain'], hurricane: ['rain'],
  guitar: ['notes'], piano: ['notes'], violin: ['notes'], cello: ['notes'], trumpet: ['notes'],
  saxophone: ['notes'], drums: ['notes'], radio: ['notes'], stereo: ['notes'], microphone: ['notes'],
  harp: ['notes'], clarinet: ['notes'], trombone: ['notes'], megaphone: ['notes'], headphones: ['notes'],
  bed: ['zzz'], pillow: ['zzz'], sleeping_bag: ['zzz'], moon: ['zzz'],
  diamond: ['sparkle'], crown: ['sparkle'], necklace: ['sparkle'], bracelet: ['sparkle'], star: ['sparkle'],
  wine_glass: ['sparkle'], sword: ['sparkle'], snowflake: ['sparkle'], hat: ['sparkle'], eyeglasses: ['sparkle'],
  fish: ['bubbles'], octopus: ['bubbles'], submarine: ['bubbles'], snorkel: ['bubbles'], pond: ['bubbles'],
  ocean: ['bubbles'], washing_machine: ['bubbles'], bathtub: ['bubbles'], sea_turtle: ['bubbles'], shark: ['bubbles'],
  telephone: ['ring'], cell_phone: ['ring'], alarm_clock: ['ring'],
  skull: ['smoke'], tornado: ['dust'], lightning: ['sparkle'],
};
export const effectsFor = (label) => E[label] || [];
export const HAS_EFFECT = Object.keys(E);

const rand = (a, b) => a + Math.random() * (b - a);

// ── finding spots on the drawing ─────────────────────────────────────────────
// All in local units: the drawing's centre is (0,0), its edge is ~1 away.
function spotsOf(c) {
  const pts = c.local.flat();
  const b = c.bounds, h = b.maxY - b.minY || 1, w = b.maxX - b.minX || 1;
  // topmost point, and the top points across the width (a candle on a cake…)
  let top = pts[0];
  for (const p of pts) if (p.y < top.y) top = p;
  // the side "nozzle": the furthest-right point in the middle band of height
  let side = null;
  for (const p of pts) if (p.y > b.minY + h * 0.2 && p.y < b.minY + h * 0.75 && (!side || p.x > side.x)) side = p;
  // the lower edge of the top part: where ice cream drips from. For each of 7
  // columns, the lowest point in the upper 60% of the drawing.
  const lips = [];
  for (let i = 0; i < 7; i++) {
    const x0 = b.minX + (w * i) / 7, x1 = b.minX + (w * (i + 1)) / 7;
    let best = null;
    for (const p of pts) if (p.x >= x0 && p.x < x1 && p.y < b.minY + h * 0.6 && (!best || p.y > best.y)) best = p;
    if (best) lips.push(best);
  }
  // the top edge across the width (where steam rises from)
  const rim = [];
  for (let i = 1; i < 4; i++) {
    const x0 = b.minX + (w * i) / 4 - w * 0.1, x1 = x0 + w * 0.2;
    let best = null;
    for (const p of pts) if (p.x >= x0 && p.x < x1 && (!best || p.y < best.y)) best = p;
    if (best) rim.push(best);
  }
  return { top, side: side || { x: b.maxX, y: 0 }, lips: lips.length ? lips : [top], rim: rim.length ? rim : [top],
    low: { x: b.minX + w * 0.05, y: b.maxY - h * 0.15 }, b, h, w };
}

// ── per-frame update: spawn, move and age the marks ──────────────────────────
// c.fx = { spots, parts: [...] }. A "part" has a kind, a position, a velocity,
// an age and a lifetime.
export function updateEffects(c, dt) {
  const kinds = effectsFor(c.label);
  if (!kinds.length) { c.fx = null; return; }
  if (!c.fx || c.fx.label !== c.label) c.fx = { label: c.label, spots: spotsOf(c), parts: [], acc: {} };
  const fx = c.fx, S = fx.spots, P = fx.parts;
  // startled drawings get excited: their effects run up to 3× faster for a moment
  const every = (key, sec) => { fx.acc[key] = (fx.acc[key] || 0) + dt * (1 + 2 * (c.startle || 0)); if (fx.acc[key] > sec) { fx.acc[key] = 0; return true; } return false; };

  for (const k of kinds) {
    if (k === 'spray' && every(k, 0.03))
      P.push({ k: 'drop', x: S.side.x + 0.05, y: S.side.y, vx: rand(1.6, 2.2), vy: rand(-1.1, -0.6), life: 1.4 });
    if (k === 'spout' && every(k, 0.04))
      P.push({ k: 'drop', x: S.top.x + rand(-0.03, 0.03), y: S.top.y - 0.05, vx: rand(-0.5, 0.5), vy: rand(-2.6, -2), life: 1.3 });
    if (k === 'drip' && every(k, 0.9)) {
      const at = S.lips[Math.floor(Math.random() * S.lips.length)];
      P.push({ k: 'drip', x: at.x, y: at.y, ox: at.x, oy: at.y, len: 0, vy: 0, life: 4, max: rand(0.12, 0.3) });
    }
    if (k === 'steam' && every(k, 0.7)) {
      const at = S.rim[Math.floor(Math.random() * S.rim.length)];
      P.push({ k: 'steam', x: at.x, y: at.y - 0.08, life: 2.6, seed: rand(0, 6) });
    }
    if (k === 'smoke' && every(k, 0.45))
      P.push({ k: 'puff', x: S.top.x, y: S.top.y - 0.05, vx: rand(0.05, 0.2), vy: -0.35, r: 0.05, life: 3 });
    if (k === 'exhaust' && every(k, 0.35))
      P.push({ k: 'puff', x: S.b.minX - 0.05, y: S.low.y, vx: -0.35, vy: -0.1, r: 0.04, life: 1.8 });
    if (k === 'flame' && !P.some((q) => q.k === 'flame'))
      P.push({ k: 'flame', x: S.top.x, y: S.top.y - 0.02, life: Infinity });
    if ((k === 'rays' || k === 'beam') && !P.some((q) => q.k === k))
      P.push({ k, x: 0, y: 0, life: Infinity });
    if (k === 'rain' && every(k, 0.05))
      P.push({ k: 'rain', x: rand(S.b.minX, S.b.maxX), y: c.label === 'umbrella' ? S.b.minY - 1.2 : S.b.maxY, vy: 2.2, life: c.label === 'umbrella' ? 0.5 : 0.9 });
    if (k === 'notes' && every(k, 0.8))
      P.push({ k: 'note', x: S.top.x + rand(-0.2, 0.3), y: S.top.y, vy: -0.35, life: 3, seed: rand(0, 6) });
    if (k === 'zzz' && every(k, 1.1))
      P.push({ k: 'z', x: S.b.maxX * 0.6, y: S.b.minY, vy: -0.25, life: 3, seed: rand(0, 6) });
    if (k === 'sparkle' && every(k, 0.35))
      P.push({ k: 'spark', x: rand(S.b.minX - 0.2, S.b.maxX + 0.2), y: rand(S.b.minY - 0.2, S.b.maxY + 0.1), life: 0.8 });
    if (k === 'bubbles' && every(k, 0.6))
      P.push({ k: 'bubble', x: S.top.x + rand(-0.15, 0.15), y: S.top.y - 0.05, vy: -0.4, r: rand(0.025, 0.06), life: 2.5, seed: rand(0, 6) });
    if (k === 'ring' && !P.some((q) => q.k === 'ring')) P.push({ k: 'ring', x: 0, y: 0, life: Infinity });
    if (k === 'dust' && every(k, 0.1))
      P.push({ k: 'dust', a: rand(0, 6.28), r: rand(0.3, 1.1), y: rand(S.b.minY, S.b.maxY), life: 1.5 });
  }

  for (let i = P.length - 1; i >= 0; i--) {
    const q = P[i];
    q.age = (q.age || 0) + dt;
    if (q.age > q.life) { P.splice(i, 1); continue; }
    if (q.k === 'drop') { q.vy += 3.2 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    if (q.k === 'drip') {
      // a drip grows slowly, then the drop lets go and falls
      if (q.len < q.max) q.len += dt * 0.08;
      else { q.vy += 2.5 * dt; q.y += q.vy * dt; if (q.y > S.b.maxY + 0.8) q.age = q.life; }
    }
    if (q.k === 'puff') { q.x += q.vx * dt; q.y += q.vy * dt; q.r += dt * 0.07; }
    if (q.k === 'rain') q.y += q.vy * dt;
    if (q.k === 'note' || q.k === 'z' || q.k === 'bubble') { q.y += q.vy * dt; q.x += Math.sin(q.age * 2.5 + q.seed) * 0.15 * dt; }
    if (q.k === 'dust') q.a += dt * 4;
  }
}

// ── drawing the marks ────────────────────────────────────────────────────────
// `place(p)` turns a local point into a 3D world point (provided by creatures.js).
export function drawEffects(g, c, place, alpha) {
  if (!c.fx) return;
  const t = c.age, ci = c.ci;
  const P = (x, y) => project(place({ x, y, z: 0 }));
  const line = (pts, a = 0.8, w = 0.7) => drawLine(g, pts, a * alpha, w, ci);
  const circle = (x, y, r, a, n = 14) => line(Array.from({ length: n + 1 }, (_, i) => P(x + Math.cos(i / n * 6.283) * r, y + Math.sin(i / n * 6.283) * r)), a);
  const fade = (q) => Math.min(1, q.age * 4) * Math.min(1, (q.life - q.age) * 2);

  for (const q of c.fx.parts) {
    switch (q.k) {
      case 'drop': line([P(q.x, q.y), P(q.x - q.vx * 0.04, q.y - q.vy * 0.04)], fade(q), 0.8); break;
      case 'drip':
        if (q.len < q.max) line([P(q.ox, q.oy), P(q.ox, q.oy + q.len)], 0.9, 0.9);
        else circle(q.x, q.y + q.len, 0.025, fade(q), 8);
        break;
      case 'steam': {
        const k = q.age / q.life, pts = [];
        for (let i = 0; i < 9; i++) {
          const u = i / 8, y = q.y - (k * 0.6 + u * 0.35);
          pts.push(P(q.x + Math.sin(u * 5 + q.age * 3 + q.seed) * 0.05, y));
        }
        line(pts, Math.sin(k * Math.PI) * 0.7);
        break;
      }
      case 'puff': circle(q.x, q.y, q.r, fade(q) * 0.7); break;
      case 'flame': {
        // a teardrop that flickers
        const hgt = 0.28 + Math.sin(t * 13) * 0.04 + Math.sin(t * 29) * 0.02, wd = 0.09;
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const yy = -Math.cos(a) * 0.5 - 0.5;     // 0 (base) … -1 (tip)
          const xx = Math.sin(a) * wd * (1 + yy) * (1.2 + Math.sin(t * 17 + i) * 0.08);
          pts.push(P(q.x + xx + Math.sin(t * 9) * 0.02 * -yy, q.y + yy * hgt));
        }
        line(pts, 0.95, 0.9);
        break;
      }
      case 'rays': {
        const R = Math.max(c.bounds.maxX, -c.bounds.minX, c.bounds.maxY, -c.bounds.minY);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * 0.15, pulse = 0.12 + 0.08 * Math.sin(t * 3 + i);
          line([P(Math.cos(a) * (R + 0.12), Math.sin(a) * (R + 0.12)), P(Math.cos(a) * (R + 0.12 + pulse), Math.sin(a) * (R + 0.12 + pulse))], 0.75);
        }
        break;
      }
      case 'beam': {
        const sw = c.label === 'lighthouse' ? Math.sin(t * 0.8) * 0.9 : 0;
        const ox = c.label === 'lighthouse' ? c.fx.spots.top.x : c.fx.spots.side.x, oy = c.label === 'lighthouse' ? c.fx.spots.top.y + 0.1 : c.fx.spots.side.y;
        const dir = c.label === 'lighthouse' ? sw : 0;
        for (const s of [-1, 1]) line([P(ox, oy), P(ox + Math.cos(dir + s * 0.25) * 1.6, oy + Math.sin(dir + s * 0.25) * 1.6)], 0.5 + 0.2 * Math.sin(t * 2));
        break;
      }
      case 'rain': line([P(q.x, q.y), P(q.x - 0.02, q.y + 0.1)], fade(q) * 0.8); break;
      case 'note': {
        // ♪ : a small head and a stem
        const a = fade(q);
        circle(q.x, q.y, 0.035, a, 8);
        line([P(q.x + 0.035, q.y), P(q.x + 0.035, q.y - 0.16), P(q.x + 0.1, q.y - 0.12)], a);
        break;
      }
      case 'z': {
        const s = 0.06 + q.age * 0.02, a = fade(q);
        line([P(q.x - s, q.y - s), P(q.x + s, q.y - s), P(q.x - s, q.y + s), P(q.x + s, q.y + s)], a);
        break;
      }
      case 'spark': {
        const s = Math.sin((q.age / q.life) * Math.PI) * 0.07;
        line([P(q.x - s, q.y), P(q.x + s, q.y)], 0.9); line([P(q.x, q.y - s), P(q.x, q.y + s)], 0.9);
        break;
      }
      case 'bubble': circle(q.x, q.y, q.r, fade(q) * 0.8, 10); break;
      case 'ring': {
        // little "ring ring" arcs on both sides, in bursts
        if (Math.sin(t * 2) < 0.3) break;
        const b = c.bounds;
        for (const s of [-1, 1]) for (let j = 1; j <= 2; j++) {
          const cx = s > 0 ? b.maxX + 0.05 : b.minX - 0.05, r = 0.12 * j, pts = [];
          for (let i = 0; i <= 8; i++) { const a = -0.7 + (i / 8) * 1.4; pts.push(P(cx + s * Math.cos(a) * r, Math.sin(a) * r)); }
          line(pts, 0.8);
        }
        break;
      }
      case 'dust': line([P(Math.cos(q.a) * q.r, q.y), P(Math.cos(q.a + 0.3) * q.r, q.y)], fade(q) * 0.6); break;
    }
  }
}
