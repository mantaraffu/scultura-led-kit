import { normalizeParams } from '#shared/params.js';
import { parseScene, walk } from './compile.js';
import { suggest } from './errors.js';

const SPACES = new Set(['strip', 'panorama']);

const asScene = (scene) => (scene && typeof scene === 'object' && 'default' in scene ? scene.default : scene) ?? {};
const lineOf = (source, re) => {
  if (typeof source !== 'string') return null;
  const m = source.match(re);
  return m?.index == null ? null : source.slice(0, m.index).split('\n').length;
};
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const metricLine = (source, metric) => lineOf(source, new RegExp(`['"\`]${escapeRe(metric)}['"\`]`));

function quoted(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value?.cooked ?? null;
  return null;
}

export function usedMetrics(scene) {
  const s = asScene(scene);
  if (!Array.isArray(s.metrics)) return [];
  return [...new Set(s.metrics.filter((m) => typeof m === 'string' && m.trim() !== '').map((m) => m.trim()))];
}

// Controlli sul modulo già caricato e sul testo: avvisi e errori con la riga del codice.
export function staticChecks({ scene, source = '', metrics = {}, p5Names = [] } = {}) {
  const s = asScene(scene);
  const out = [];
  const add = (level, text, line = null) => out.push({ level, text, line });

  if (typeof s.name !== 'string' || s.name.trim() === '') {
    add('error', 'Manca il nome della scena: aggiungi name: "..." all\'inizio.', lineOf(source, /\bname\s*:/) ?? 1);
  }
  if (typeof s.draw !== 'function') {
    add('error', 'Manca draw(p, ctx, data): senza, la scena non disegna niente.', lineOf(source, /\bdraw\s*\(/) ?? 1);
  }
  if (!SPACES.has(s.space)) {
    add('warn', 'Manca space: usa "strip" (una faccia) oppure "panorama" (tutto il giro).', lineOf(source, /\bspace\s*:/) ?? 1);
  }

  const declared = s.params;
  const normalized = normalizeParams(declared);
  if (declared !== undefined && (typeof declared !== 'object' || declared === null || Array.isArray(declared))) {
    add('warn', 'params deve essere un oggetto con i parametri della scena.', lineOf(source, /\bparams\s*:/) ?? 1);
  } else if (declared) {
    for (const [key, def] of Object.entries(declared)) {
      const line = lineOf(source, new RegExp(`\\b${escapeRe(key)}\\s*:`));
      if (!def || typeof def !== 'object' || Array.isArray(def)) {
        add('warn', `Il parametro "${key}" non è una dichiarazione valida.`, line);
        continue;
      }
      if (!Object.hasOwn(def, 'default')) {
        add('warn', `Il parametro "${key}" non ha un default: aggiungi default: ...`, line);
      }
      if (!normalized[key]) {
        add('warn', `Il parametro "${key}" non è valido: controlla tipo, min/max e default.`, line);
      }
    }
  }

  const known = metrics && typeof metrics === 'object' ? Object.keys(metrics) : [];
  if (s.metrics !== undefined && !Array.isArray(s.metrics)) {
    add('warn', 'metrics deve essere un elenco di grandezze.', lineOf(source, /\bmetrics\s*:/) ?? 1);
  } else {
    for (const metric of usedMetrics(s)) {
      if (!known.includes(metric)) {
        const fix = suggest(metric, known);
        add('error', fix
          ? `La grandezza "${metric}" non esiste: forse "${fix}"?`
          : `La grandezza "${metric}" non esiste.`, metricLine(source, metric));
      }
    }
  }

  const parsed = typeof source === 'string' && source ? parseScene(source) : null;
  const ast = parsed?.ok ? parsed.ast : null;
  const seenGets = new Set();
  if (ast) {
    walk(ast, (node) => {
      if (node.type === 'Identifier' && (node.name === 'frameCount' || node.name === 'millis')) {
        add('warn', `Non usare ${node.name} per il tempo: usa ctx.time (in secondi).`, node.loc?.start?.line ?? null);
      }
      if (node.type === 'CallExpression'
        && ((node.callee?.type === 'Identifier' && node.callee.name === 'createCanvas')
          || (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier'
            && node.callee.property.name === 'createCanvas'))) {
        add('warn', 'Non serve createCanvas: la tela la crea il kit (512×896 oppure panorama).', node.loc?.start?.line ?? null);
      }
      const callee = node.callee;
      if (node.type !== 'CallExpression' || callee?.type !== 'MemberExpression'
        || callee.object?.type !== 'Identifier' || callee.object.name !== 'data'
        || callee.property?.type !== 'Identifier' || callee.property.name !== 'get') return;
      const metric = quoted(node.arguments?.[0]);
      if (!metric || known.includes(metric)) return;
      const line = node.loc?.start?.line ?? null;
      const key = `${metric}:${line}`;
      if (seenGets.has(key)) return;
      seenGets.add(key);
      const fix = suggest(metric, known);
      add('error', fix
        ? `data.get("${metric}") non esiste: forse "${fix}"?`
        : `data.get("${metric}") non esiste: controlla il nome della grandezza.`, line);
    });
  }

  return out;
}

// `runtime`: le rotture viste mentre la scena girava davvero, ognuna con la prova
// che l'ha fatta scoppiare ("senza il dato PM10"). Senza queste, una scena che si
// rompe appena un sensore sparisce risulterebbe "pronta da inviare".
export function verdict({ errors = [], fps = null, warnings = [], runtime = [] } = {}) {
  const errs = [...errors];
  const warns = [...warnings];
  const breaks = runtime.map((r) => ({
    level: 'error',
    text: `La scena si è fermata ${r.quando}: ${r.text}`,
    line: r.line ?? null,
  }));
  const problems = [...errs, ...breaks, ...warns];
  const fpsValue = Number(fps);
  const slow = Number.isFinite(fpsValue) && fpsValue < 30;
  if (slow) {
    problems.push({ level: 'error', text: `La scena va troppo piano: ${Math.round(fpsValue)} fps (servono almeno 30).`, line: null });
  }
  const ready = errs.length === 0 && breaks.length === 0 && !slow && warns.length === 0;
  let text = 'Pronta da inviare.';
  if (!ready) {
    const parts = [];
    const totErrors = errs.length + breaks.length;
    if (totErrors) parts.push(`${totErrors} ${totErrors === 1 ? 'errore' : 'errori'}`);
    if (slow) parts.push(`velocità ${Math.round(fpsValue)} fps`);
    if (warns.length) parts.push(`${warns.length} ${warns.length === 1 ? 'avviso' : 'avvisi'}`);
    text = `Da correggere: ${parts.join(', ')}.`;
  }
  return { ready, text, problems };
}
