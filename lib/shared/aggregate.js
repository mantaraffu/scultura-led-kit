// Funzioni pure: le usano il server e il renderer (nel browser), quindi niente import di Node.

export const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

export function normalize(value, { min, max }) {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

// ts può essere in ms o una stringa ISO (gli snapshot e i messaggi `reading` portano ISO).
const toMs = (ts) => (typeof ts === 'number' ? ts : Date.parse(ts));

export function aggregate(rows, def, { now, staleAfterMinutes = {} }) {
  if (rows.length === 0) return null;

  // Righe con ts in ms, ordinate per ts crescente: l'ordine di ingresso non conta.
  const sorted = rows.map((r) => ({ ...r, ts: toMs(r.ts) })).sort((a, b) => a.ts - b.ts);

  // Ultima lettura per fonte×sensore = quella con ts massimo.
  const latest = new Map();
  for (const r of sorted) latest.set(`${r.source}|${r.sensor}`, r);

  const isStale = (r) => now - r.ts > (staleAfterMinutes[r.source] ?? 30) * MIN_MS;
  const all = [...latest.values()];
  const fresh = all.filter((r) => !isStale(r));
  const used = fresh.length > 0 ? fresh : all;

  const value = used.reduce((sum, r) => sum + r.value, 0) / used.length;
  const newest = Math.max(...used.map((r) => r.ts));
  const lastWithTrend = sorted.findLast((r) => r.trend);

  return {
    value,
    norm: normalize(value, def),
    unit: def.unit,
    stale: fresh.length === 0,
    ageMinutes: Math.round((now - newest) / MIN_MS),
    trend: lastWithTrend ? lastWithTrend.trend : null,
    history: sorted.map((r) => ({ ts: r.ts, value: r.value, sensor: r.sensor })),
  };
}
