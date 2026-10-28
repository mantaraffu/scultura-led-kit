// Correnti: filamenti d'aria che girano attorno alla scultura.
// Il vento vero li spinge di lato (ogni faccia sente la parte di vento che la sfiora),
// l'aria calda li fa salire, l'umidità li rende più fitti, la qualità dell'aria ne cambia il colore.
const MAX = 4800; // su tutto il giro: sulle facce se ne vede circa un quinto
const BUCKETS = 4;

const states = new WeakMap();

function read(data, metric, fallback) {
  const m = data.get(metric);
  if (!m) return fallback;
  return m.stale ? m.norm * 0.5 + fallback * 0.5 : m.norm;
}

const lerp = (a, b, t) => a + (b - a) * t;

// Rumore a valori su una griglia, interpolato: un campo di correnti che cambia piano.
function hash(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z, period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const fz = fade(z - zi);
  const px = (v) => ((v % period) + period) % period; // si ripete in orizzontale: il giro si chiude
  let out = 0;
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        out += w * hash(px(xi + dx), yi + dy, zi + dz);
      }
    }
  }
  return out;
}

// Vento tangente alla scultura nel punto x: la componente che scorre lungo la superficie.
export function tangential(x, width, speed, dirNorm) {
  const around = (x / width) * Math.PI * 2;
  const from = dirNorm * Math.PI * 2;
  return Math.sin(around - from) * speed;
}

function create(width, height) {
  return {
    x: new Float32Array(MAX).map(() => Math.random() * width),
    y: new Float32Array(MAX).map(() => Math.random() * height),
    px: new Float32Array(MAX),
    py: new Float32Array(MAX),
    life: new Float32Array(MAX).map(() => Math.random() * 400),
    active: 0,
    last: null,
    smooth: { wind: 0.2, dir: 0.25, temp: 0.5, hum: 0.5, aqi: 0.2 },
  };
}

function respawn(s, i, width, height) {
  s.x[i] = Math.random() * width;
  s.y[i] = Math.random() * height;
  s.px[i] = s.x[i];
  s.py[i] = s.y[i];
  s.life[i] = 200 + Math.random() * 400;
}

export default {
  name: 'Correnti',
  author: 'scultura-led',
  space: 'panorama',
  metrics: ['wind_speed', 'wind_dir', 'temperature', 'humidity', 'aqi'],
  params: {
    flow: { type: 'number', label: 'Velocità delle correnti', min: 0.2, max: 3, step: 0.1, default: 1 },
    trail: { type: 'number', label: 'Scia', min: 0.5, max: 0.98, step: 0.01, default: 0.9 },
    curl: { type: 'number', label: 'Vortici', min: 0, max: 2, step: 0.1, default: 1 },
  },

  setup(p, ctx) {
    states.set(ctx, create(ctx.width, ctx.height));
    p.background(0);
  },

  draw(p, ctx, data) {
    const W = ctx.width;
    const H = ctx.height;
    let s = states.get(ctx);
    if (!s) {
      s = create(W, H);
      states.set(ctx, s);
    }
    const dt = Math.min(1 / 20, Math.max(0, s.last === null ? 1 / 60 : ctx.time - s.last)) * 60;
    s.last = ctx.time;

    const sm = s.smooth;
    const ease = 1 - Math.pow(0.99, dt);
    sm.wind = lerp(sm.wind, read(data, 'wind_speed', 0.2), ease);
    // La direzione è un angolo: si insegue per la via più corta.
    let dd = read(data, 'wind_dir', 0.25) - sm.dir;
    dd -= Math.round(dd);
    sm.dir = (sm.dir + dd * ease + 1) % 1;
    sm.temp = lerp(sm.temp, read(data, 'temperature', 0.5), ease);
    sm.hum = lerp(sm.hum, read(data, 'humidity', 0.5), ease);
    sm.aqi = lerp(sm.aqi, read(data, 'aqi', 0.2), ease);

    const target = Math.round(MAX * (0.3 + 0.7 * sm.hum));
    while (s.active < target) respawn(s, s.active++, W, H);
    if (s.active > target) s.active = Math.max(target, s.active - 6);

    const flow = ctx.params.flow;
    const lift = -(sm.temp - 0.35) * 0.9; // l'aria calda sale, quella fredda scende piano
    const scale = 1 / 180;
    const period = Math.round(W * scale);
    const z = ctx.time * 0.05;

    p.noStroke();
    p.fill(0, 255 * (1 - ctx.params.trail));
    p.rect(0, 0, W, H);

    const buckets = Array.from({ length: BUCKETS }, () => []);
    for (let i = 0; i < s.active; i++) {
      const x = s.x[i];
      const y = s.y[i];
      const a = noise3(x * scale, y * scale, z, period) * Math.PI * 4;
      const vx = (Math.cos(a) * ctx.params.curl * 0.8 + tangential(x, W, 1 + sm.wind * 6, sm.dir)) * flow;
      const vy = (Math.sin(a) * ctx.params.curl * 0.8 + lift) * flow;
      s.px[i] = x;
      s.py[i] = y;
      s.x[i] = x + vx * dt;
      s.y[i] = y + vy * dt;
      s.life[i] -= dt;
      const wrapped = s.x[i] < 0 || s.x[i] >= W;
      if (wrapped) {
        s.x[i] = ctx.wrapX(s.x[i]);
        s.px[i] = s.x[i];
      }
      if (s.life[i] <= 0 || s.y[i] < -10 || s.y[i] > H + 10) {
        respawn(s, i, W, H);
        continue;
      }
      const speed = Math.hypot(vx, vy);
      buckets[Math.min(BUCKETS - 1, Math.floor(speed / 1.5))].push(i);
    }

    // Colore: azzurro con aria buona, ambra con aria cattiva; le correnti veloci più chiare.
    const good = [90, 190, 255];
    const bad = [255, 150, 40];
    const base = good.map((c, k) => lerp(c, bad[k], sm.aqi));
    p.strokeWeight(2);
    buckets.forEach((list, b) => {
      if (list.length === 0) return;
      const light = 0.55 + (0.45 * b) / (BUCKETS - 1);
      p.stroke(base[0] * light, base[1] * light, base[2] * light);
      for (const i of list) p.line(s.px[i], s.py[i], s.x[i], s.y[i]);
    });
    p.noStroke();
  },
};
