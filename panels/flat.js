import { html, useEffect, useRef } from '#preact';
import { COL_W, STRIP_W, HEIGHT, faceRect } from '#shared/layout.js';
import { drawColumn } from '../preview.js';

// I quattro ritagli: quello che finisce davvero su ogni faccia della scultura,
// copiato dalla striscia composta in `kit/preview.js`.
function Crops({ preview }) {
  const hosts = [useRef(null), useRef(null), useRef(null), useRef(null)];
  useEffect(() => {
    if (!preview) return undefined;
    const tele = hosts.map((h) => h.current).filter(Boolean);
    const contesti = tele.map((c) => {
      c.width = COL_W;
      c.height = HEIGHT;
      return c.getContext?.('2d') ?? null;
    });
    return preview.subscribe((strip) => {
      contesti.forEach((g, i) => drawColumn(g, strip, i));
    });
  }, [preview]);

  return html`<div class="crops">
    ${[0, 1, 2, 3].map((i) => html`<figure class="crop" key=${i}>
      <canvas ref=${hosts[i]} width=${COL_W} height=${HEIGHT}></canvas>
      <figcaption>Faccia ${i + 1} <small>${COL_W}×${HEIGHT} come la vede l'opera</small></figcaption>
    </figure>`)}
  </div>`;
}

export function FlatPanel({ space = 'strip', layout, containerRef, preview = null }) {
  const width = space === 'panorama' ? layout.panoramaWidth : STRIP_W;
  const faces = [0, 1, 2, 3].map((i) => {
    const rect = faceRect(layout, space, i);
    return { i, left: (rect.x / width) * 100, width: (rect.w / width) * 100 };
  });
  // La scatola tiene le proporzioni vere dello spazio (512×896 oppure 2304×896):
  // così la tela non si schiaccia e i riquadri delle facce cadono dove devono.
  const box = `aspect-ratio: ${width} / ${HEIGHT}; width: min(100%, calc(58vh * ${width} / ${HEIGHT}))`;
  return html`<div class="flat">
    <div class="stage-box" style=${box}>
      <div class="stage-wrap" ref=${containerRef} aria-label="Tela della scena"></div>
      <div class=${`flat-overlay ${space}`} aria-hidden="true">
        ${faces.map((f) => html`<div key=${f.i} class="face" style=${`left:${f.left}%;width:${f.width}%`}>
          <span>Faccia ${f.i + 1}</span>
        </div>`)}
      </div>
    </div>
    <p class="muted small">${space === 'panorama'
      ? 'Tutto il giro; i riquadri sono le quattro finestre che finiscono sulle facce.'
      : 'Le quattro facce una accanto all\'altra, come le manda l\'opera.'}</p>
    ${space === 'panorama' ? html`<${Crops} preview=${preview} />` : null}
  </div>`;
}
