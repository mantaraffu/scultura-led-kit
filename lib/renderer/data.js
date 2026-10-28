import { aggregate, DAY_MS } from '../shared/aggregate.js';

// Copia locale delle letture per le scene: snapshot alla connessione, poi messaggi `reading`.
export function createData({ now = () => Date.now(), cacheMs = 1000 } = {}) {
  let metrics = {};
  let staleAfterMinutes = {};
  const rows = new Map(); // grandezza → letture con ts in ms
  const cache = new Map();
  let version = 0;

  function add(readings) {
    const oldest = now() - DAY_MS;
    for (const r of readings ?? []) {
      if (!r || !Object.hasOwn(metrics, r.metric)) continue;
      const ts = typeof r.ts === 'number' ? r.ts : Date.parse(r.ts);
      if (!Number.isFinite(ts) || !Number.isFinite(r.value) || ts < oldest) continue;
      if (!rows.has(r.metric)) rows.set(r.metric, []);
      rows.get(r.metric).push({ source: r.source, sensor: r.sensor, metric: r.metric, ts, value: r.value, trend: r.trend ?? null });
    }
    for (const [metric, list] of rows) rows.set(metric, list.filter((x) => x.ts >= oldest));
    version++;
  }

  return {
    load(snapshot) {
      metrics = snapshot?.metrics ?? {};
      staleAfterMinutes = snapshot?.staleAfterMinutes ?? {};
      rows.clear();
      add(snapshot?.readings);
    },
    add,
    get(metric, sensor) {
      if (!Object.hasOwn(metrics, metric)) return null;
      const t = now();
      const key = `${metric}|${sensor ?? ''}`;
      const hit = cache.get(key);
      if (hit && hit.version === version && t - hit.at < cacheMs) return hit.value;
      const oldest = t - DAY_MS;
      const list = (rows.get(metric) ?? []).filter((r) => r.ts >= oldest && (sensor === undefined || r.sensor === sensor));
      const value = aggregate(list, metrics[metric], { now: t, staleAfterMinutes });
      cache.set(key, { version, at: t, value });
      return value;
    },
    list() {
      const oldest = now() - DAY_MS;
      return [...rows.keys()].filter((m) => rows.get(m).some((r) => r.ts >= oldest)).sort();
    },
  };
}
