// Sedimenti: forme geometriche cadono dall'alto e si depositano sul fondo di ogni faccia.
// Ogni faccia è una grandezza: più è alto il valore, più forme cadono. Gli strati più vecchi
// si scuriscono; quando il deposito è alto, lo strato più basso si dissolve e tutto scende.
const CELL = 16; // lato di una cella del deposito (8 per faccia)
const FACES = [
  { metric: 'pm10', shape: 'square', color: [222, 172, 92] },
  { metric: 'pm2_5', shape: 'circle', color: [214, 98, 64] },
  { metric: 'co2', shape: 'triangle', color: [118, 156, 198] },
  { metric: 'noise', shape: 'diamond', color: [196, 116, 214] },
];
const MAX_FALLING = 40; // per faccia
const FILL = 0.62; // oltre questa altezza lo strato più basso si dissolve
const SLIDE_S = 1.2; // durata della discesa dopo la dissoluzione
const RUSH = 0.85; // oltre questa altezza si dissolve senza aspettare la fine della discesa

const states = new WeakMap();

// Deposito di una faccia: colonne di celle impilate dal basso, forme in caduta, strato che si dissolve.
export function createBed(subs, rows) {
  return { subs, rows, stacks: Array.from({ length: subs }, () => []), falling: [], dissolving: null, slide: 0, spawn: 0 };
}

// Avanza di dt secondi. rate = forme al secondo; size = 0–1 (grandezza delle forme). Restituisce il letto.
export function stepBed(bed, dt, rate, size, random = Math.random) {
  bed.spawn += rate * dt;
  while (bed.spawn >= 1 && bed.falling.length < MAX_FALLING) {
    bed.spawn -= 1;
    bed.falling.push({ sub: Math.floor(random() * bed.subs), y: -CELL * (1 + random() * 3), vy: 40 + random() * 40, size, spin: random() * Math.PI });
  }
  if (bed.falling.length >= MAX_FALLING) bed.spawn = 0;

  const floor = bed.rows * CELL;
  bed.falling = bed.falling.filter((f) => {
    f.vy += 260 * dt;
    f.y += f.vy * dt;
    f.spin += dt * 2;
    const stack = bed.stacks[f.sub];
    const top = floor - (stack.length + 1) * CELL;
    if (f.y < top) return true;
    if (stack.length < bed.rows) stack.push({ size: f.size, spin: f.spin, age: 0 }); // colonna piena: la forma si perde
    return false;
  });

  for (const stack of bed.stacks) for (const c of stack) c.age += dt;
  // Se si sta scendendo di più strati insieme, si scende più in fretta.
  bed.slide = Math.min(0, bed.slide + (CELL / SLIDE_S) * Math.max(1, -bed.slide / CELL) * dt);
  if (bed.dissolving) {
    bed.dissolving.alpha -= dt / SLIDE_S;
    if (bed.dissolving.alpha <= 0) bed.dissolving = null;
  }

  // Compattazione: si toglie lo strato più basso e il resto scende di una cella.
  // Di norma uno strato alla volta; se il deposito sale troppo in fretta, anche durante la discesa.
  const highest = Math.max(...bed.stacks.map((s) => s.length));
  if ((highest >= bed.rows * FILL && bed.slide === 0) || (highest >= bed.rows * RUSH && bed.slide > -2 * CELL)) {
    bed.dissolving = { cells: bed.stacks.map((s) => s[0] ?? null), alpha: 1 };
    for (const stack of bed.stacks) stack.shift();
    bed.slide -= CELL;
  }
  return bed;
}

function read(data, metric, fallback) {
  const m = data.get(metric);
  if (!m) return { norm: fallback, stale: true };
  return { norm: m.norm, stale: m.stale };
}

function shape(p, kind, cx, cy, r, spin) {
  if (kind === 'circle') return p.circle(cx, cy, r * 2);
  if (kind === 'square') return p.rect(cx - r, cy - r, r * 2, r * 2);
  if (kind === 'triangle') {
    const a = spin;
    return p.triangle(
      cx + r * Math.cos(a), cy + r * Math.sin(a),
      cx + r * Math.cos(a + 2.094), cy + r * Math.sin(a + 2.094),
      cx + r * Math.cos(a + 4.189), cy + r * Math.sin(a + 4.189),
    );
  }
  return p.quad(cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy);
}

export default {
  name: 'Sedimenti',
  author: 'scultura-led',
  space: 'strip',
  metrics: FACES.map((f) => f.metric),
  params: {
    speed: { type: 'number', label: 'Quante forme cadono', min: 0.2, max: 2, step: 0.1, default: 1 },
    age: { type: 'number', label: 'Quanto si scuriscono gli strati', min: 0, max: 1, step: 0.05, default: 0.6 },
  },

  setup(p, ctx) {
    p.noStroke();
    states.set(ctx, { beds: FACES.map(() => createBed(Math.floor(ctx.column(0).w / CELL), Math.floor(ctx.height / CELL))), last: null });
  },

  draw(p, ctx, data) {
    let s = states.get(ctx);
    if (!s) {
      s = { beds: FACES.map(() => createBed(Math.floor(ctx.column(0).w / CELL), Math.floor(ctx.height / CELL))), last: null };
      states.set(ctx, s);
    }
    const dt = Math.min(0.05, Math.max(0, s.last === null ? 1 / 60 : ctx.time - s.last));
    s.last = ctx.time;

    p.background(0);
    p.noStroke();
    FACES.forEach((face, i) => {
      const bed = s.beds[i];
      const m = read(data, face.metric, 0.2);
      stepBed(bed, dt, ctx.params.speed * (0.25 + 4 * m.norm), 0.55 + 0.45 * m.norm);
      const col = ctx.column(i);
      const color = m.stale ? [120, 120, 120] : face.color;
      const floor = bed.rows * CELL;

      // Deposito: celle più profonde (più vecchie) più scure.
      bed.stacks.forEach((stack, sub) => {
        stack.forEach((c, k) => {
          const depth = 1 - ctx.params.age * Math.min(1, k / (bed.rows * FILL));
          p.fill(color[0] * depth, color[1] * depth, color[2] * depth);
          const cy = floor - (k + 0.5) * CELL + bed.slide;
          shape(p, face.shape, col.x + (sub + 0.5) * CELL, cy, (CELL / 2 - 1) * c.size, c.spin);
        });
      });

      // Strato che si dissolve sul fondo.
      if (bed.dissolving) {
        bed.dissolving.cells.forEach((c, sub) => {
          if (!c) return;
          p.fill(color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, 255 * bed.dissolving.alpha);
          shape(p, face.shape, col.x + (sub + 0.5) * CELL, floor - CELL / 2 + CELL + bed.slide, (CELL / 2 - 1) * c.size, c.spin);
        });
      }

      // Forme in caduta, luminose.
      p.fill(Math.min(255, color[0] + 40), Math.min(255, color[1] + 40), Math.min(255, color[2] + 40));
      for (const f of bed.falling) shape(p, face.shape, col.x + (f.sub + 0.5) * CELL, f.y, (CELL / 2 - 1) * f.size, f.spin);
    });
  },
};
