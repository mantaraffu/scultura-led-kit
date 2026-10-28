// Cosa sentiamo: ogni faccia racconta a parole una grandezza misurata dai sensori.
// Nome comprensibile, valore, un giudizio ("aria pulita"), una frase che spiega, una barra
// da poco a molto e la tendenza dell'ultima mezz'ora. Ogni tanto le facce cambiano argomento.
const TOPICS = [
  {
    metric: 'temperature', title: 'TEMPERATURA', digits: 1, step: 0.3,
    words: ['fa freddo', 'fresco', 'mite', 'caldo', 'molto caldo'],
    text: 'Quanto è calda l\'aria attorno a questa scultura, adesso.',
  },
  {
    metric: 'humidity', title: 'UMIDITÀ', digits: 0, step: 2,
    words: ['aria secca', 'asciutta', 'normale', 'umida', 'molto umida'],
    text: 'Quanta acqua invisibile, in vapore, c\'è nell\'aria.',
  },
  {
    metric: 'co2', title: 'ANIDRIDE CARBONICA', digits: 0, step: 20,
    words: ['aria fresca', 'buona', 'un po\' viziata', 'viziata', 'molto viziata'],
    text: 'La CO2 la produciamo respirando e bruciando: dove ce n\'è tanta, l\'aria si cambia poco.',
  },
  {
    metric: 'pm10', title: 'POLVERI PM10', digits: 0, step: 2,
    words: ['aria pulita', 'buona', 'qualche polvere', 'polverosa', 'molto inquinata'],
    text: 'Particelle più piccole di un capello che restano sospese: traffico, riscaldamento, cantieri.',
  },
  {
    metric: 'pm2_5', title: 'POLVERI FINI', digits: 0, step: 2,
    words: ['aria pulita', 'buona', 'qualche polvere', 'polverosa', 'molto inquinata'],
    text: 'Le PM2.5 sono così piccole da arrivare in fondo ai polmoni.',
  },
  {
    metric: 'noise', title: 'RUMORE', digits: 0, step: 2,
    words: ['silenzio', 'quiete', 'voci', 'rumore', 'molto rumore'],
    text: 'Quanto è forte il suono qui intorno. Ogni 10 decibel in più, il doppio per le orecchie.',
  },
  {
    metric: 'wind_speed', title: 'VENTO', digits: 1, step: 0.5,
    words: ['aria ferma', 'brezza', 'vento', 'vento forte', 'burrasca'],
    text: 'Quanto corre l\'aria. Il vento porta via le polveri e cambia la temperatura percepita.',
  },
  {
    metric: 'people', title: 'PERSONE', digits: 0, step: 5,
    words: ['quasi nessuno', 'poche persone', 'un po\' di gente', 'affollato', 'molto affollato'],
    text: 'Quante persone passano vicino alla scultura, stimate dai sensori.',
  },
];
const HOLD_S = 14; // secondi prima di cambiare argomento
const MIN_MS = 60 * 1000;
const CHAR = 0.58; // larghezza media di un carattere, in proporzione alla dimensione
const CAPS = 1.2; // le maiuscole sono più larghe

const states = new WeakMap();

// Giudizio in parole dal valore normalizzato 0–1.
export function judgement(topic, norm) {
  return topic.words[Math.min(topic.words.length - 1, Math.floor(norm * topic.words.length))];
}

// Tendenza: media degli ultimi 10 minuti contro quella di 20–40 minuti prima.
export function trendOf(history, step) {
  if (!history || history.length < 2) return null;
  const newest = history[history.length - 1].ts;
  const mean = (from, to) => {
    const vs = history.filter((h) => h.ts > newest - from * MIN_MS && h.ts <= newest - to * MIN_MS).map((h) => h.value);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  };
  const now = mean(10, 0);
  const before = mean(40, 20);
  if (now === null || before === null) return null;
  if (now - before > step) return 'in aumento';
  if (before - now > step) return 'in calo';
  return 'stabile';
}

// A capo per parole, stimando la larghezza dei caratteri (textWidth non serve: la stima basta).
export function wrapText(text, size, width) {
  const perLine = Math.max(1, Math.floor(width / (size * CHAR)));
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function format(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

// Righe di testo a capo dall'alto; restituisce la y sotto l'ultima riga.
export function fitSize(text, size, width, caps = false) {
  const longest = Math.max(1, ...text.split(' ').map((word) => word.length));
  return Math.min(size, width / (longest * CHAR * (caps ? CAPS : 1)));
}

function lines(p, text, x, y, w, base, { caps = false, leading = 1.3 } = {}) {
  const size = fitSize(text, base, w, caps); // una parola troppo lunga rimpicciolisce il blocco
  p.textSize(size);
  for (const line of wrapText(text, size * (caps ? CAPS : 1), w)) {
    p.text(line, x, y);
    y += size * leading;
  }
  return y;
}

// Una faccia è alta e stretta: ogni blocco ha il suo posto fisso, così il testo non salta.
function face(p, col, topic, m, reveal, colors) {
  const pad = 8;
  const x = col.x + pad;
  const w = col.w - pad * 2;
  const at = (y) => col.y + y;
  const hue = colors.ink;

  p.textAlign(p.LEFT, p.TOP);
  p.fill(colors.dim);
  lines(p, 'MISURIAMO', x, at(50), w, 13, { caps: true });
  p.fill(hue);
  lines(p, topic.title, x, at(74), w, 18, { caps: true, leading: 1.15 });

  if (!m) {
    p.fill(colors.dim);
    lines(p, 'in attesa dei dati dei sensori…', x, at(220), w, 16);
    return;
  }

  // Valore grande, unità sotto.
  const value = format(m.value, topic.digits);
  const big = Math.min(64, w / (value.length * 0.6));
  p.fill(m.stale ? colors.dim : colors.bright);
  p.textSize(big);
  p.text(value, x, at(200));
  p.fill(colors.dim);
  lines(p, m.unit, x, at(200) + big + 8, w, 16);

  // Giudizio.
  p.fill(hue);
  lines(p, judgement(topic, m.norm), x, at(340), w, 24, { leading: 1.1 });

  // Barra poco → molto.
  p.noStroke();
  p.fill(colors.track);
  p.rect(x, at(440), w, 8);
  p.fill(hue);
  p.rect(x, at(440), Math.max(2, w * m.norm), 8);
  p.fill(colors.dim);
  p.textSize(12);
  p.text('poco', x, at(456));
  p.textAlign(p.RIGHT, p.TOP);
  p.text('molto', x + w, at(456));
  p.textAlign(p.LEFT, p.TOP);

  // Frase che spiega, scritta poco alla volta.
  p.fill(colors.body);
  lines(p, topic.text.slice(0, Math.floor(topic.text.length * reveal)), x, at(510), w, 16);

  const trend = trendOf(m.history, topic.step);
  if (trend) {
    p.fill(colors.dim);
    lines(p, 'ULTIMA MEZZ\'ORA', x, at(770), w, 12, { caps: true });
    p.fill(hue);
    lines(p, `${trend === 'in aumento' ? '↑' : trend === 'in calo' ? '↓' : '→'} ${trend}`, x, at(790), w, 20);
  }
  if (m.stale) {
    p.fill(colors.dim);
    lines(p, `dato di ${m.ageMinutes} minuti fa`, x, at(840), w, 12);
  }
}

export default {
  name: 'Cosa sentiamo',
  author: 'scultura-led',
  space: 'strip',
  metrics: TOPICS.map((t) => t.metric),
  params: {
    hold: { type: 'number', label: 'Secondi per argomento', min: 6, max: 60, step: 1, default: HOLD_S },
    typing: { type: 'boolean', label: 'Frase scritta lettera per lettera', default: true },
  },

  setup(p, ctx) {
    p.noStroke();
    states.set(ctx, {});
  },

  draw(p, ctx, data) {
    p.background(0);
    p.noStroke();
    const hold = ctx.params.hold;
    const round = Math.floor(ctx.time / hold);
    const into = ctx.time - round * hold;
    // Le facce cambiano a turno, mezzo secondo l'una dall'altra.
    for (let i = 0; i < 4; i++) {
      const local = into - i * 0.5;
      const r = local < 0 ? round - 1 : round;
      const since = local < 0 ? local + hold : local;
      const topic = TOPICS[(((i + r * 4) % TOPICS.length) + TOPICS.length) % TOPICS.length];
      const m = data.get(topic.metric);
      const reveal = ctx.params.typing ? Math.min(1, since / 4) : 1;
      // Dissolvenza in entrata e in uscita del testo.
      const fade = Math.min(1, since / 0.6, (hold - since) / 0.6);
      const k = Math.max(0, fade);
      const level = (v) => Math.round(v * k);
      const ink = m && !m.stale ? [255, 190, 90] : [150, 150, 150];
      face(p, ctx.column(i), topic, m, reveal, {
        ink: ink.map(level), dim: level(130), bright: level(255), body: level(200), track: level(40),
      });
    }
  },
};
