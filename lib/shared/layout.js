// Geometria della scultura: funzioni pure usate da server e renderer (niente import di Node).

export const COLUMNS = 4;
export const COL_W = 128;
export const HEIGHT = 896;
export const STRIP_W = COLUMNS * COL_W;

const defaults = () => ({
  columnOrder: [0, 1, 2, 3],
  smallPanel: 'top',
  origin: { x: 0, y: 0 },
  faceAngles: [45, 135, 225, 315],
  panoramaWidth: 2304,
});

const mod = (x, m) => ((x % m) + m) % m;

const isPermutation = (a) => Array.isArray(a) && a.length === COLUMNS
  && a.every(Number.isInteger) && [...a].sort().join() === '0,1,2,3';

export function resolveLayout(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('layout: deve essere un oggetto');
  const base = defaults();
  const layout = { ...base, ...raw, origin: { ...base.origin, ...(raw.origin ?? {}) } };
  if (!isPermutation(layout.columnOrder)) throw new Error('layout: columnOrder deve contenere 0, 1, 2, 3 una volta ciascuno');
  if (layout.smallPanel !== 'top' && layout.smallPanel !== 'bottom') throw new Error('layout: smallPanel deve essere "top" o "bottom"');
  const { x, y } = layout.origin;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error('layout: origin deve avere x e y interi ≥ 0');
  if (!Array.isArray(layout.faceAngles) || layout.faceAngles.length !== COLUMNS || !layout.faceAngles.every(Number.isFinite)) {
    throw new Error('layout: faceAngles deve contenere 4 numeri');
  }
  if (!Number.isInteger(layout.panoramaWidth) || layout.panoramaWidth < STRIP_W) {
    throw new Error(`layout: panoramaWidth deve essere un intero ≥ ${STRIP_W}`);
  }
  return layout;
}

export function spaceSize(layout, space) {
  return { width: space === 'panorama' ? layout.panoramaWidth : STRIP_W, height: HEIGHT };
}

export function faceRect(layout, space, i) {
  if (!Number.isInteger(i) || i < 0 || i >= COLUMNS) throw new RangeError(`faccia ${i} inesistente (0–3)`);
  const angle = layout.faceAngles[i];
  if (space !== 'panorama') return { x: i * COL_W, y: 0, w: COL_W, h: HEIGHT, angle };
  const W = layout.panoramaWidth;
  const x = mod(Math.round((mod(angle, 360) / 360) * W - COL_W / 2), W);
  return { x, y: 0, w: COL_W, h: HEIGHT, angle };
}

// Copie dallo spazio della scena alla striscia 512×896; una finestra a cavallo del bordo diventa due copie.
export function sourceCopies(layout, space) {
  if (space !== 'panorama') return [{ sx: 0, dx: 0, w: STRIP_W }];
  const W = layout.panoramaWidth;
  const out = [];
  for (let i = 0; i < COLUMNS; i++) {
    const { x } = faceRect(layout, 'panorama', i);
    const first = Math.min(COL_W, W - x);
    out.push({ sx: x, dx: i * COL_W, w: first });
    if (first < COL_W) out.push({ sx: 0, dx: i * COL_W + first, w: COL_W - first });
  }
  return out;
}

// Dalla striscia (facce nell'ordine attorno alla scultura) alle regioni HDMI delle colonne.
export function outputCopies(layout) {
  return layout.columnOrder.map((region, i) => ({ sx: i * COL_W, dx: region * COL_W, w: COL_W }));
}

// Pannelli di una colonna dall'alto in basso: 3 da 128×256 e uno da 128×128.
export function panels(layout) {
  const sizes = layout.smallPanel === 'top' ? [128, 256, 256, 256] : [256, 256, 256, 128];
  let y = 0;
  return sizes.map((h) => {
    const panel = { y, h, small: h === 128 };
    y += h;
    return panel;
  });
}
