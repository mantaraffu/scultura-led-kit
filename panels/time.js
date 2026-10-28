import { html } from '#preact';

export function formatClock(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function TimePanel({ now, speed = 1, paused = false, onSpeed = () => {}, onPause = () => {} }) {
  return html`<div class="time-panel">
    <div class="row between">
      <span>Orologio dati</span>
      <strong>${formatClock(now)}</strong>
    </div>
    <div class="segmented" role="group" aria-label="Velocità dei dati">
      <button aria-pressed=${paused ? 'true' : 'false'} onClick=${() => onPause(!paused)}>${paused ? 'Riprendi' : 'Pausa'}</button>
      ${[1, 10, 60].map((n) => html`<button key=${n} aria-pressed=${!paused && speed === n ? 'true' : 'false'}
        onClick=${() => { onPause(false); onSpeed(n); }}>×${n}</button>`)}
    </div>
    <p class="muted small">La velocità cambia i dati, non le animazioni: ctx.time resta in secondi reali.</p>
  </div>`;
}
