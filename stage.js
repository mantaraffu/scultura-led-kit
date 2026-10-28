import { makeContext } from '#renderer/context.js';
import { resolveLayout, spaceSize } from '#shared/layout.js';
import { resolveParams } from '#shared/params.js';
import { translateError } from './errors.js';

// Un fotogramma può durare al massimo due secondi: conta il tempo, non i giri.
// Una scena che tocca ogni pixel fa mezzo milione di giri ed è lecita; un ciclo
// che non finisce si riconosce perché il tempo scade.
export const TURN_LIMIT_MS = 2000;
const CHECK_EVERY = 4096; // guardare l'orologio a ogni giro costerebbe più del ciclo

export function createGuard({ now = () => (globalThis.performance?.now?.() ?? Date.now()), limitMs = TURN_LIMIT_MS } = {}) {
  let count = 0;
  let deadline = Infinity;
  return {
    begin() {
      count = 0;
      deadline = now() + limitMs;
    },
    guard() {
      count++;
      if (count % CHECK_EVERY !== 0) return false;
      if (now() > deadline) {
        deadline = Infinity;
        throw new Error('un ciclo gira da troppo tempo');
      }
      return false;
    },
  };
}

const sceneGuard = createGuard();
globalThis.__kitGuard ??= sceneGuard.guard;

// Una sola istanza p5 alla volta. La scena può fermarsi per un errore, ma la pagina resta viva.
export function createStage({
  container, p5Class, p5Factory, layout = resolveLayout({}), getData = () => ({ get: () => null, list: () => [] }),
  onError, onFrame, metrics = {}, now = () => performance.now(), translate = translateError,
} = {}) {
  let p = null;
  let scene = null;
  let ctx = null;
  let source = '';
  let started = 0;
  let frames = 0;
  let stopped = false;
  let errorState = null;
  let values = {};

  const api = {
    run,
    stop,
    setParams,
    stats,
    error: () => errorState,
  };

  function stats() {
    let fps = 0;
    try {
      const value = Number(p?.frameRate?.());
      if (Number.isFinite(value)) fps = value;
    } catch {
      fps = 0;
    }
    return { fps, frames, running: !!p && !stopped && !errorState, since: started };
  }

  function fail(err) {
    if (errorState) return;
    stopped = true;
    errorState = translate(err, { metrics, source });
    try {
      p?.noLoop?.();
    } catch {
      // la scena è già ferma
    }
    onError?.(errorState);
  }

  function applyParams(next = values) {
    values = { ...values, ...(next ?? {}) };
    if (!ctx) return;
    const resolved = resolveParams(scene?.params, values);
    for (const key of Object.keys(ctx.params)) delete ctx.params[key];
    Object.assign(ctx.params, resolved);
  }

  function setParams(next = {}) {
    applyParams(next);
  }

  function stop() {
    stopped = true;
    try {
      p?.remove?.();
    } catch {
      // niente da rimuovere
    }
    p = null;
    ctx = null;
  }

  function run(nextScene, { source: nextSource = '' } = {}) {
    stop();
    scene = nextScene?.default ?? nextScene;
    source = nextSource;
    errorState = null;
    stopped = false;
    frames = 0;
    started = now();
    if (!scene || typeof scene !== 'object') {
      fail(Object.assign(new Error('La scena non si è caricata.'), { line: 1 }));
      return false;
    }
    if (typeof scene.draw !== 'function') {
      fail(Object.assign(new Error('Manca draw(p, ctx, data): senza, la scena non disegna niente.'), { line: 1 }));
      return false;
    }
    const space = scene.space === 'panorama' ? 'panorama' : 'strip';
    const size = spaceSize(layout, space);
    try {
      p = (p5Factory ?? ((sketch) => new p5Class(sketch, container)))((sk) => {
        sk.setup = () => {
          sceneGuard.begin();
          if (errorState) return;
          try {
            sk.pixelDensity(1);
            const canvas = sk.createCanvas(size.width, size.height);
            canvas?.parent?.(container);
            sk.frameRate(60);
            ctx = makeContext({ p: sk, layout, space, params: {} });
            applyParams(values);
            scene.setup?.(sk, ctx);
          } catch (err) {
            fail(err);
          }
        };
        sk.draw = () => {
          sceneGuard.begin();
          if (errorState || stopped) return;
          try {
            ctx.time = (now() - started) / 1000;
            scene.draw(sk, ctx, getData());
            frames++;
            onFrame?.(stats());
          } catch (err) {
            fail(err);
          }
        };
      });
    } catch (err) {
      fail(err);
      return false;
    }
    return true;
  }

  return api;
}
