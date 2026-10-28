import { html } from '#preact';
import { normalizeParams } from '#shared/params.js';

const roundStep = (min, max) => (max > min ? 10 ** Math.floor(Math.log10((max - min) / 100)) : 'any');
const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Number(Number(v).toFixed(2))));

export function ParamControl({ name, def, value, onChange }) {
  const id = `param-${name}`;
  const label = html`<label for=${id}>${def.label}</label>`;
  if (def.type === 'number' && def.min !== null && def.max !== null) {
    const step = def.step ?? roundStep(def.min, def.max);
    return html`<div class="param">${label}
      <div class="row">
        <input id=${id} type="range" min=${def.min} max=${def.max} step=${step} value=${value}
          onInput=${(e) => onChange(Number(e.target.value))} />
        <output for=${id}>${fmt(value)}${def.unit ? ` ${def.unit}` : ''}</output>
      </div>
    </div>`;
  }
  if (def.type === 'number') {
    return html`<div class="param">${label}
      <input id=${id} type="number" step=${def.step ?? 'any'} value=${value} onChange=${(e) => onChange(Number(e.target.value))} />
    </div>`;
  }
  if (def.type === 'color') {
    return html`<div class="param">${label}<input id=${id} type="color" value=${value} onInput=${(e) => onChange(e.target.value)} /></div>`;
  }
  if (def.type === 'boolean') {
    return html`<div class="param">
      <label class="toggle"><input id=${id} type="checkbox" role="switch" checked=${value} onChange=${(e) => onChange(e.target.checked)} /><span>${def.label}</span></label>
    </div>`;
  }
  if (def.type === 'choice') {
    return html`<div class="param">${label}
      <select id=${id} onChange=${(e) => onChange(e.target.value)}>
        ${def.options.map((o) => html`<option value=${o} selected=${o === value}>${o}</option>`)}
      </select>
    </div>`;
  }
  return html`<div class="param">${label}<input id=${id} type="text" value=${value} onChange=${(e) => onChange(e.target.value)} /></div>`;
}

export function ParamsPanel({ params, values = {}, onChange = () => {} }) {
  const defs = normalizeParams(params);
  const keys = Object.keys(defs);
  if (keys.length === 0) return html`<p class="muted">Questa scena non ha parametri regolabili.</p>`;
  return html`<div class="params">${keys.map((key) => html`<${ParamControl}
    key=${key} name=${key} def=${defs[key]} value=${values[key] ?? defs[key].default}
    onChange=${(v) => onChange(key, v)} />`)}</div>`;
}
