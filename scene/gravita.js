// Gravità: particelle che cadono e vengono catturate da quattro pozzi di attrazione.
// Le persone presenti decidono quante sono, le polveri sottili quanto i pozzi le trattengono,
// la pressione quanto pesano, il vento le spinge di lato, la temperatura ne decide il colore.
const MAX = 1600;
const BUCKETS = 6; // colori per velocità: un fill per gruppo invece che per particella

const states = new WeakMap();

// Lettura di una grandezza: norm 0–1 (o il valore di riserva se manca); i dati vecchi pesano meno.
function read(data, metric, fallback) {
  const m = data.get(metric);
  if (!m) return fallback;
  return m.stale ? m.norm * 0.5 + fallback * 0.5 : m.norm;
}

const lerp = (a, b, t) => a + (b - a) * t;

function create(width, height) {
  return {
    x: new Float32Array(MAX).map(() => Math.random() * width),
    y: new Float32Array(MAX).map(() => Math.random() * height),
    vx: new Float32Array(MAX),
    vy: new Float32Array(MAX),
    active: 0,
    last: null,
    smooth: { people: 0.5, pm: 0.5, wind: 0, dir: 0, temp: 0.5, press: 0.5 },
  };
}

function respawn(s, i, width) {
  s.x[i] = Math.random() * width;
  s.y[i] = -Math.random() * 60;
  s.vx[i] = (Math.random() - 0.5) * 0.5;
  s.vy[i] = Math.random() * 0.5;
}

export default {
  name: 'Gravità',
  author: 'scultura-led',
  space: 'strip',
  metrics: ['people', 'pm10', 'wind_speed', 'wind_dir', 'temperature', 'pressure'],
  params: {
    density: { type: 'number', label: 'Quantità di particelle', min: 0.2, max: 1, step: 0.05, default: 0.6 },
    trail: { type: 'number', label: 'Scia', min: 0, max: 0.95, step: 0.05, default: 0.82 },
    pull: { type: 'number', label: 'Forza dei pozzi', min: 0, max: 2, step: 0.1, default: 1 },
  },

  setup(p, ctx) {
    states.set(ctx, create(ctx.width, ctx.height));
    p.noStroke();
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

    // I valori dei sensori cambiano lentamente: si inseguono con dolcezza.
    const sm = s.smooth;
    const ease = 1 - Math.pow(0.99, dt);
    sm.people = lerp(sm.people, read(data, 'people', 0.4), ease);
    sm.pm = lerp(sm.pm, read(data, 'pm10', 0.3), ease);
    sm.wind = lerp(sm.wind, read(data, 'wind_speed', 0.2), ease);
    sm.dir = lerp(sm.dir, read(data, 'wind_dir', 0.25), ease);
    sm.temp = lerp(sm.temp, read(data, 'temperature', 0.5), ease);
    sm.press = lerp(sm.press, read(data, 'pressure', 0.5), ease);

    const target = Math.round(MAX * ctx.params.density * (0.35 + 0.65 * sm.people));
    while (s.active < target) respawn(s, s.active++, W);
    if (s.active > target) s.active = Math.max(target, s.active - 4); // si diradano piano

    const gravity = 0.012 + 0.03 * sm.press;
    const windX = Math.cos(sm.dir * Math.PI * 2) * sm.wind * 0.12;
    const strength = ctx.params.pull * (0.25 + 1.1 * sm.pm);
    const t = ctx.time;

    // Quattro pozzi, uno per faccia, che vagano lentamente.
    const wells = [0, 1, 2, 3].map((i) => ({
      x: i * (W / 4) + W / 8 + Math.sin(t * 0.13 + i * 1.9) * (W / 12),
      y: H * (0.32 + 0.36 * (0.5 + 0.5 * Math.sin(t * 0.071 + i * 1.7))),
    }));

    // Scia: si scurisce il fotogramma precedente invece di cancellarlo.
    p.noStroke();
    p.fill(0, 255 * (1 - ctx.params.trail));
    p.rect(0, 0, W, H);

    const buckets = Array.from({ length: BUCKETS }, () => []);
    for (let i = 0; i < s.active; i++) {
      let ax = windX;
      let ay = gravity;
      for (const w of wells) {
        // Distanza più corta anche attraverso il bordo: la striscia gira attorno alla scultura.
        let dx = w.x - s.x[i];
        if (dx > W / 2) dx -= W;
        else if (dx < -W / 2) dx += W;
        const dy = w.y - s.y[i];
        const d2 = dx * dx + dy * dy + 900;
        const f = Math.min(0.6, (strength * 420) / d2);
        const d = Math.sqrt(d2);
        ax += (dx / d) * f - (dy / d) * f * 0.6; // attrazione più un giro attorno al pozzo
        ay += (dy / d) * f + (dx / d) * f * 0.6;
      }
      s.vx[i] = (s.vx[i] + ax * dt) * Math.pow(0.985, dt);
      s.vy[i] = (s.vy[i] + ay * dt) * Math.pow(0.985, dt);
      s.x[i] = ctx.wrapX(s.x[i] + s.vx[i] * dt);
      s.y[i] += s.vy[i] * dt;
      if (s.y[i] > H + 4 || s.y[i] < -200) respawn(s, i, W);
      const speed = Math.hypot(s.vx[i], s.vy[i]);
      buckets[Math.min(BUCKETS - 1, Math.floor(speed * 1.6))].push(i);
    }

    // Colore dalla temperatura: blu freddo → arancio caldo; più veloci, più chiare.
    const cold = [60, 140, 255];
    const warm = [255, 120, 30];
    const base = cold.map((c, k) => lerp(c, warm[k], sm.temp));
    buckets.forEach((list, b) => {
      if (list.length === 0) return;
      const light = 0.45 + (0.55 * b) / (BUCKETS - 1);
      p.fill(base[0] * light + 60 * (b / BUCKETS), base[1] * light + 40 * (b / BUCKETS), base[2] * light + 30 * (b / BUCKETS));
      for (const i of list) p.rect(s.x[i] - 1.5, s.y[i] - 1.5, 3, 3);
    });

    // Il cuore dei pozzi: un piccolo bagliore che pulsa.
    for (const w of wells) {
      const r = 6 + 4 * Math.sin(t * 2 + w.x);
      p.fill(base[0], base[1], base[2], 90);
      p.circle(w.x, w.y, r * 2);
    }
  },
};
