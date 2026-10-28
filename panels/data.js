import { html } from '#preact';

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

export function sparkline(history = []) {
  const points = history
    .filter((r) => Number.isFinite(r?.value))
    .sort((a, b) => a.ts - b.ts);
  if (points.length < 2) return '';
  const values = points.map((r) => r.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    min -= 1;
    max += 1;
  }
  return points.map((r, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = 22 - ((r.value - min) / (max - min)) * 20;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function Used({ snapshot }) {
  const used = new Map();
  for (const read of snapshot?.reads ?? []) {
    if (!used.has(read.metric)) used.set(read.metric, new Set());
    if (read.line != null) used.get(read.metric).add(read.line);
  }
  const rows = [...used.entries()];
  const latest = new Map();
  for (const item of snapshot?.chain ?? []) latest.set(`${item.name}|${item.line}`, item);
  const chain = [...latest.values()];
  return html`<div class="used">
    <h3>Grandezze usate dalla scena</h3>
    ${rows.length === 0 ? html`<p class="muted small">La scena non ha ancora letto dati.</p>` : html`<ul class="used-list">
      ${rows.map(([metric, lines]) => html`<li key=${metric}><code>${metric}</code>
        <span class="muted">${lines.size ? `riga ${[...lines].sort((a, b) => a - b).join(', ')}` : 'riga non disponibile'}</span></li>`)}
    </ul>`}
    ${chain.length ? html`<h3>Variabili osservate</h3>
      <ul class="chain">${chain.map((c, i) => html`<li key=${`${c.name}-${i}`}>
        <strong>${c.name}</strong> = <span>${String(c.observed)}</span>
        <span class="muted">${c.text}</span>
      </li>`)}</ul>` : null}
  </div>`;
}

function MetricRow({ name, def, agg, override, onOverride, onClear, onCopy }) {
  const value = agg?.value;
  const norm = Math.max(0, Math.min(1, Number(agg?.norm ?? 0)));
  const stale = override?.stale === true || agg?.stale === true;
  const missing = override?.missing === true;
  const label = def.label ?? name;
  const id = `data-${name}`;
  const history = agg?.history ?? [];
  return html`<article class=${`metric${missing ? ' missing' : ''}${stale ? ' stale' : ''}`} data-metric=${name}>
    <div class="row between">
      <div><strong>${label}</strong> <code>${name}</code></div>
      <div class="value">${missing ? 'dato mancante' : formatNumber(value)} <span class="muted">${def.unit ?? ''}</span></div>
    </div>
    <div class="bar" aria-hidden="true"><span style=${`width:${missing ? 0 : norm * 100}%`}></span></div>
    <div class="ticks"><span>${formatNumber(def.min)}</span><span>norm ${formatNumber(norm)}</span><span>${formatNumber(def.max)}</span></div>
    ${history.length > 1 ? html`<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points=${sparkline(history)} />
    </svg>` : null}
    <div class="metric-meta muted small">
      ${stale ? html`<span class="badge warn">vecchio${agg?.ageMinutes != null ? ` · ${agg.ageMinutes} min` : ''}</span>` : null}
      ${agg?.trend ? html`<span>Tendenza: ${agg.trend}</span>` : null}
      ${override ? html`<span class="badge">ritocco a mano</span>` : null}
    </div>
    <label class="slider-label" for=${id}>Valore a mano</label>
    <input id=${id} aria-label=${`Valore di ${label}`} type="range" min=${def.min ?? 0} max=${def.max ?? 1}
      step=${def.step ?? 'any'} value=${missing ? def.min ?? 0 : (value ?? def.min ?? 0)}
      disabled=${missing} onInput=${(e) => onOverride(name, { value: Number(e.target.value) })} />
    <div class="row wrap">
      <label class="toggle"><input type="checkbox" role="switch" checked=${stale}
        aria-label=${`Dato vecchio per ${label}`}
        onChange=${(e) => onOverride(name, { stale: e.target.checked })} /><span>dato vecchio</span></label>
      <label class="toggle"><input type="checkbox" role="switch" checked=${missing}
        aria-label=${`Dato mancante per ${label}`}
        onChange=${(e) => onOverride(name, { missing: e.target.checked })} /><span>dato mancante</span></label>
      <button class="ghost" onClick=${() => onCopy(name)}>copia nel codice</button>
      ${override ? html`<button class="link" onClick=${() => onClear(name)}>togli il ritocco</button>` : null}
    </div>
  </article>`;
}

export function DataPanel({
  metrics = {}, data = null, overrides = {}, snapshot = { reads: [], observations: [], chain: [] },
  onOverride = () => {}, onClear = () => {}, onCopy = () => {},
}) {
  const entries = Object.entries(metrics);
  return html`<div class="data-panel">
    <${Used} snapshot=${snapshot} />
    ${!data ? html`<p class="muted">Dati in caricamento…</p>` : entries.map(([name, def]) => html`<${MetricRow}
      key=${name} name=${name} def=${def} agg=${data.get(name)} override=${overrides[name]}
      onOverride=${onOverride} onClear=${onClear} onCopy=${onCopy} />`)}
  </div>`;
}
