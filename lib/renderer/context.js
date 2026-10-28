import { spaceSize, faceRect } from '../shared/layout.js';

// Il ctx che ricevono setup() e draw() delle scene (spec §6).
export function makeContext({ p, layout, space = 'strip', params = {}, brightness = 1 }) {
  const { width, height } = spaceSize(layout, space);
  return {
    space,
    width,
    height,
    params,
    brightness,
    time: 0,
    wrapX: (x) => ((x % width) + width) % width,
    // Le forme che attraversano un bordo ricompaiono dall'altro lato.
    wrap(fn) {
      for (const dx of [-width, 0, width]) {
        p.push();
        try {
          p.translate(dx, 0);
          fn(dx);
        } finally {
          p.pop();
        }
      }
    },
    column: (i) => faceRect(layout, space, i),
  };
}

// Parametri della scena: dichiarazione e valori validati, condivisi con il server.
export { resolveParams } from '../shared/params.js';
