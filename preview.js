import { sourceCopies, COL_W, COLUMNS, STRIP_W, HEIGHT } from '#shared/layout.js';

// La striscia 512×896 che l'opera manda alle colonne, composta dalla tela della scena
// con le stesse copie del renderer (`sourceCopies`): in `strip` è una copia sola,
// in `panorama` sono le quattro finestre, quella a cavallo del bordo spezzata in due.
// Tutto quello che guarda la scena (ritagli delle facce, vista 3D) legge di qui,
// così c'è una composizione sola e un disegno solo per fotogramma.

export const FRAME_MS = 1000 / 30; // la vista non serve più veloce di così

export function createPreview({
  layout,
  space = 'strip',
  getSource = () => null,
  makeCanvas = () => globalThis.document.createElement('canvas'),
  now = () => (globalThis.performance?.now?.() ?? Date.now()),
  raf = (fn) => globalThis.requestAnimationFrame(fn),
  cancel = (id) => globalThis.cancelAnimationFrame(id),
  frameMs = FRAME_MS,
} = {}) {
  const canvas = makeCanvas();
  canvas.width = STRIP_W;
  canvas.height = HEIGHT;
  const g = canvas.getContext?.('2d') ?? null;
  const copies = sourceCopies(layout, space);
  const listeners = new Set();
  let id = null;
  let running = false;
  let last = -Infinity;
  let frames = 0;

  function draw() {
    const source = getSource();
    if (g && source?.width) {
      for (const c of copies) {
        g.drawImage(source, c.sx, 0, c.w, HEIGHT, c.dx, 0, c.w, HEIGHT);
      }
      frames++;
    }
    for (const fn of [...listeners]) {
      try {
        fn(canvas);
      } catch {
        // una vista che si rompe non ferma le altre né la pagina
      }
    }
  }

  function loop() {
    if (!running) return;
    id = raf(loop);
    const t = now();
    if (t - last < frameMs) return;
    last = t;
    draw();
  }

  return {
    canvas,
    space,
    columns: COLUMNS,
    columnWidth: COL_W,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start() {
      if (running) return;
      running = true;
      last = -Infinity;
      id = raf(loop);
    },
    stop() {
      running = false;
      if (id != null) cancel(id);
      id = null;
    },
    draw,
    get running() { return running; },
    get frames() { return frames; },
  };
}

// Ritaglio della faccia i dentro la striscia: le colonne stanno una accanto all'altra.
export function columnRect(i) {
  return { x: i * COL_W, y: 0, w: COL_W, h: HEIGHT };
}

// Copia la colonna i della striscia su una tela da 128×896: è quello che vede quella faccia.
export function drawColumn(g, strip, i) {
  if (!g || !strip) return false;
  const r = columnRect(i);
  g.drawImage(strip, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return true;
}
