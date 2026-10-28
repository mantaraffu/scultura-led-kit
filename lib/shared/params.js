// Parametri delle scene (spec del pannello §3.1): dichiarazione normalizzata e valori validati.
// Usato dal renderer (valori passati alla scena) e dal server (catalogo, playlist, prova dal vivo).
const COLOR = /^#[0-9a-f]{6}$/i;
const TYPES = new Set(['number', 'color', 'boolean', 'choice', 'text']);
const finite = (v) => (Number.isFinite(v) ? v : null);

function typeOf(def) {
  if (TYPES.has(def.type)) return def.type;
  const d = def.default;
  if (typeof d === 'boolean') return 'boolean';
  if (typeof d === 'string') return COLOR.test(d) ? 'color' : Array.isArray(def.options) ? 'choice' : 'text';
  return 'number';
}

const clamp = (v, def) => Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, v));

function normalizeOne(key, def) {
  const type = typeOf(def);
  const label = typeof def.label === 'string' && def.label.trim() !== '' ? def.label.slice(0, 60) : key;
  if (type === 'number') {
    const min = finite(def.min);
    const max = finite(def.max);
    if (min !== null && max !== null && min > max) return null;
    const step = Number.isFinite(def.step) && def.step > 0 ? def.step : null;
    const unit = typeof def.unit === 'string' ? def.unit.slice(0, 10) : null;
    const n = { type, label, min, max, step, unit };
    n.default = clamp(Number.isFinite(def.default) ? def.default : (min ?? 0), n);
    return n;
  }
  if (type === 'boolean') return { type, label, default: def.default === true };
  if (type === 'color') return { type, label, default: COLOR.test(def.default ?? '') ? def.default.toLowerCase() : '#ffffff' };
  if (type === 'choice') {
    const options = Array.isArray(def.options) ? def.options.filter((o) => typeof o === 'string').slice(0, 50) : [];
    if (options.length === 0) return null;
    return { type, label, options, default: options.includes(def.default) ? def.default : options[0] };
  }
  return { type, label, default: typeof def.default === 'string' ? def.default.slice(0, 200) : '' };
}

export function normalizeParams(defs) {
  const out = {};
  if (typeof defs !== 'object' || defs === null || Array.isArray(defs)) return out;
  for (const [key, def] of Object.entries(defs)) {
    if (typeof def !== 'object' || def === null || Array.isArray(def)) continue;
    const n = normalizeOne(key, def);
    if (n) out[key] = n;
  }
  return out;
}

function valueOf(def, v) {
  switch (def.type) {
    case 'number': {
      if (!Number.isFinite(v)) return def.default;
      let x = clamp(v, def);
      if (def.step) {
        const base = def.min ?? 0;
        x = clamp(Number((base + Math.round((x - base) / def.step) * def.step).toFixed(10)), def);
      }
      return x;
    }
    case 'boolean': return typeof v === 'boolean' ? v : def.default;
    case 'color': return typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : def.default;
    case 'choice': return def.options.includes(v) ? v : def.default;
    default: return typeof v === 'string' ? v.slice(0, 200) : def.default;
  }
}

// Valori per la scena: validati secondo la dichiarazione; chiavi sconosciute scartate; mancanti = default.
export function resolveParams(defs = {}, values = {}) {
  const out = {};
  for (const [key, def] of Object.entries(normalizeParams(defs))) out[key] = valueOf(def, values?.[key]);
  return out;
}
