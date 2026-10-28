import { createSimulator } from '#sim';
import { createData } from '#renderer/data.js';
import { normalize, DAY_MS } from '#shared/aggregate.js';

export const SENSORS = ['SIM1', 'SIM2'];
export const STEP_MS = 10 * 60 * 1000;
export const MANUAL_AGE_MINUTES = 45;

// Orologio virtuale: il tempo dei dati può correre più veloce, le animazioni no.
export function createClock({ now = () => Date.now(), speed = 1, paused = false } = {}) {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('velocità non valida');
  let real = now();
  let virtual = real;
  let rate = speed;
  let stopped = paused === true;
  const sync = () => {
    const r = now();
    if (!stopped) virtual += (r - real) * rate;
    real = r;
  };
  return {
    get speed() { return rate; },
    get paused() { return stopped; },
    now() {
      sync();
      return virtual;
    },
    setSpeed(value) {
      if (value !== 1 && value !== 10 && value !== 60) throw new Error('velocità: 1, 10 o 60');
      sync();
      rate = value;
    },
    pause() {
      sync();
      stopped = true;
    },
    resume() {
      sync();
      stopped = false;
    },
    advanceVirtual(ms) {
      if (!Number.isFinite(ms) || ms <= 0) throw new Error('avanzamento non valido');
      sync();
      virtual += ms;
    },
  };
}

const copyAggregate = (agg) => (agg ? { ...agg, history: Array.isArray(agg.history) ? agg.history.slice() : [] } : null);

// Ritocchi e copie difensive: le scene non devono poter modificare i dati veri.
function manualData({ metrics, data }) {
  const overrides = new Map();

  function withOverride(metric, agg) {
    const patch = overrides.get(metric);
    if (!patch) return copyAggregate(agg);
    if (patch.missing) return null;
    const base = copyAggregate(agg) ?? {
      value: 0, norm: 0, unit: metrics[metric]?.unit ?? '', stale: false, ageMinutes: 0, trend: null, history: [],
    };
    if (Number.isFinite(patch.value)) {
      base.value = patch.value;
      base.norm = normalize(patch.value, metrics[metric]);
    }
    if (patch.stale === true) {
      base.stale = true;
      base.ageMinutes = MANUAL_AGE_MINUTES;
    } else if (patch.stale === false && agg) {
      base.stale = agg.stale;
      base.ageMinutes = agg.ageMinutes;
    }
    return base;
  }

  return {
    data: {
      get(metric, sensor) {
        if (!Object.hasOwn(metrics, metric)) return null;
        return withOverride(metric, data.get(metric, sensor));
      },
      list: () => Object.keys(metrics).sort(),
    },
    setOverride(metric, patch = {}) {
      if (!Object.hasOwn(metrics, metric)) throw new Error(`grandezza sconosciuta: ${metric}`);
      if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('ritocco non valido');
      const next = { ...(overrides.get(metric) ?? {}) };
      for (const key of ['value', 'stale', 'missing']) {
        if (patch[key] !== undefined) next[key] = patch[key];
      }
      if (next.value !== undefined && !Number.isFinite(next.value)) throw new Error('valore non valido');
      overrides.set(metric, next);
    },
    clearOverride(metric) {
      overrides.delete(metric);
    },
    overrides: () => Object.fromEntries([...overrides].map(([k, v]) => [k, { ...v }])),
  };
}

// Dati simulati nel browser con lo stesso ciclo giorno/notte del server. Orologio e ritocchi
// sono separati dal `data` dell'opera: le scene vedono sempre copie.
export async function createSim({
  metrics, clock = createClock(), random = Math.random, sensors = SENSORS,
  simulator = createSimulator, historyMs = DAY_MS,
} = {}) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('metrics mancante');
  const data = createData({ now: () => clock.now() });
  const end = clock.now();
  const start = end - historyMs;
  let at = start;
  const source = simulator({ metrics, sensors, random, now: () => at });
  const first = [];
  for (at = start; at <= end; at += STEP_MS) first.push(...(await source.poll()));
  data.load({ metrics, staleAfterMinutes: {}, readings: first });
  let nextAt = end + STEP_MS;

  async function tick() {
    let added = false;
    const now = clock.now();
    while (nextAt <= now) {
      at = nextAt;
      data.add(await source.poll());
      nextAt += STEP_MS;
      added = true;
    }
    return added;
  }

  return { ...manualData({ metrics, data }), clock, tick };
}

function defaultServerUrl() {
  const loc = globalThis.location;
  if (!loc?.host) return '/ws';
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}

// Stessa interfaccia di createSim, ma le letture arrivano dal server (`/ws` senza ruolo):
// snapshot alla connessione, poi messaggi `reading`. I ritocchi restano locali al browser.
export async function createServerSim({
  metrics, clock = createClock(), url = defaultServerUrl(),
  WebSocketClass = globalThis.WebSocket,
} = {}) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('metrics mancante');
  if (typeof WebSocketClass !== 'function') throw new Error('WebSocket non disponibile');
  const data = createData({ now: () => clock.now() });
  const manual = manualData({ metrics, data });
  const socket = new WebSocketClass(url);
  const listen = (type, fn) => {
    if (typeof socket.addEventListener === 'function') socket.addEventListener(type, fn);
    else socket[`on${type}`] = fn;
  };
  listen('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event?.data ?? event);
    } catch {
      return;
    }
    if (msg?.type === 'snapshot') {
      data.load({ metrics: msg.metrics ?? metrics, staleAfterMinutes: msg.staleAfterMinutes, readings: msg.readings });
    } else if (msg?.type === 'reading') {
      data.add(msg.readings);
    }
  });
  return {
    ...manual,
    clock,
    tick: async () => false,
    close() {
      try { socket.close(); } catch { /* era già chiusa */ }
    },
  };
}
