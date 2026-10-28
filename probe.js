import { lineFromStack } from './compile.js';

function fnFromFrame(frame) {
  const chrome = frame.match(/\bat\s+([^\s(]+)\s+\(/);
  if (chrome) return chrome[1];
  const at = frame.indexOf('@');
  if (at > 0) return frame.slice(0, at).trim() || null;
  const plain = frame.match(/\bat\s+([^\s(]+)\s*$/);
  return plain ? plain[1] : null;
}

function callerInfo() {
  const stack = new Error().stack;
  if (typeof stack !== 'string') return { line: null, column: null, fn: null };
  const blob = lineFromStack(stack);
  if (blob) {
    const frame = stack.split('\n').find((l) => (l.includes('blob:') || l.includes('data:text/javascript')) && /:(\d+):(\d+)\)?\s*$/.test(l));
    return { ...blob, fn: frame ? fnFromFrame(frame) : null };
  }
  for (const frame of stack.split('\n')) {
    if (!frame.trim().startsWith('at ') || frame.includes('probe.js')) continue;
    const m = frame.match(/:(\d+):(\d+)\)?\s*$/);
    if (m) return { line: Number(m[1]), column: Number(m[2]), fn: fnFromFrame(frame) };
  }
  return { line: null, column: null, fn: null };
}

function shown(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.slice(0, 80);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value?.levels)) {
    const l = value.levels;
    return l.length >= 4
      ? `rgba(${l[0]}, ${l[1]}, ${l[2]}, ${l[3]})`
      : `rgb(${l[0]}, ${l[1]}, ${l[2]})`;
  }
  try {
    return String(value).slice(0, 80);
  } catch {
    return '[valore]';
  }
}

// Registra che cosa la scena legge e che cosa osserva, con la riga del codice.
// `new Error().stack` costa: lo si legge al massimo `lineBudget` volte ogni
// `budgetWindowMs`, poi si riusa la riga già imparata per quello stesso nome.
export function createProbe({
  metrics = {}, now = Date.now, max = 200,
  lineBudget = 24, budgetWindowMs = 150, caller = callerInfo,
} = {}) {
  let reads = [];
  let observations = [];
  let version = 0;
  let spent = 0;
  let windowAt = -Infinity;
  const known = new Map();

  function where(key) {
    const t = now();
    if (t - windowAt >= budgetWindowMs) {
      windowAt = t;
      spent = 0;
    }
    if (spent >= lineBudget && known.has(key)) return known.get(key);
    spent++;
    const at = caller();
    if (at.line != null) known.set(key, at);
    return at;
  }

  const push = (list, item) => {
    list.push(item);
    if (list.length > max) list.shift();
  };

  function wrapData(data) {
    return {
      get(metric, sensor) {
        const agg = data.get(metric, sensor);
        const at = where(`dato:${metric}`);
        push(reads, {
          metric,
          sensor: sensor ?? null,
          line: at.line,
          column: at.column,
          fn: at.fn,
          value: agg?.value ?? null,
          norm: agg?.norm ?? null,
          stale: agg?.stale ?? null,
          at: now(),
        });
        version++;
        return agg;
      },
      list: () => data.list(),
    };
  }

  function osservA(name, value) {
    const at = where(`osserva:${name}`);
    push(observations, {
      name: String(name),
      value: shown(value),
      line: at.line,
      column: at.column,
      fn: at.fn,
      at: now(),
    });
    version++;
  }

  function sourceFor(observation) {
    let best = null;
    for (const read of reads) {
      if (read.line == null || observation.line == null || read.line > observation.line) continue;
      if (observation.fn && read.fn && observation.fn !== read.fn) continue;
      if (!best || read.line > best.line || (read.line === best.line && read.at >= best.at)) best = read;
    }
    return best ? {
      metric: best.metric, sensor: best.sensor, line: best.line, column: best.column,
      value: best.value, norm: best.norm, stale: best.stale, at: best.at,
    } : null;
  }

  return {
    wrapData,
    osservA,
    get version() { return version; },
    snapshot() {
      const seen = observations.map((o) => ({ ...o, source: sourceFor(o) }));
      const chain = seen.map((o) => {
        if (!o.source) return { metric: null, label: null, line: null, name: o.name, observed: o.value, text: `${o.name} = ${o.value}` };
        const label = metrics[o.source.metric]?.label ?? o.source.metric;
        return {
          metric: o.source.metric,
          label,
          value: o.source.value,
          norm: o.source.norm,
          line: o.source.line,
          name: o.name,
          observed: o.value,
          text: `${label} ${o.source.value} → norm ${o.source.norm} → riga ${o.source.line} → ${o.name}`,
        };
      });
      return { reads: reads.map((r) => ({ ...r })), observations: seen, chain };
    },
    reset() {
      reads = [];
      observations = [];
      // il codice è cambiato: le righe imparate non valgono più
      known.clear();
      spent = 0;
      windowAt = -Infinity;
      version++;
    },
  };
}
