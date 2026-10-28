import { lineFromStack } from './compile.js';

// Nomi p5 più comuni: servono per i suggerimenti quando lo studente sbaglia a scrivere.
export const P5_NAMES = [
  'background', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'strokeCap', 'strokeJoin',
  'rect', 'ellipse', 'circle', 'line', 'point', 'triangle', 'quad', 'arc', 'text', 'textSize',
  'textAlign', 'textFont', 'textWidth', 'textStyle', 'map', 'lerp', 'lerpColor', 'color', 'red',
  'green', 'blue', 'alpha', 'random', 'randomSeed', 'noise', 'noiseSeed', 'sin', 'cos', 'tan',
  'sqrt', 'abs', 'min', 'max', 'floor', 'ceil', 'round', 'dist', 'constrain', 'angleMode',
  'colorMode', 'rectMode', 'ellipseMode', 'push', 'pop', 'translate', 'rotate', 'scale', 'image',
  'tint', 'noTint', 'createGraphics', 'createVector', 'beginShape', 'endShape', 'vertex',
  'curveVertex', 'bezierVertex', 'frameRate', 'pixelDensity', 'noLoop', 'loop', 'redraw',
  'blendMode', 'imageMode', 'save', 'frameCount', 'width', 'height',
];

const CTX_NAMES = ['time', 'width', 'height', 'params', 'brightness', 'space', 'wrapX', 'wrap', 'column'];
const DATA_NAMES = ['get', 'list'];
const EXTRA_NAMES = ['data', 'ctx', 'p', 'osserva', 'setup', 'draw', 'colore', 'const', 'let', 'if', 'for', 'while'];

export function distance(a, b) {
  const s = String(a);
  const t = String(b);
  const d = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(
        d[j] + 1,
        d[j - 1] + 1,
        prev + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return d[t.length];
}

// Sotto i tre caratteri non si suggerisce niente: "x" somiglia a mezzo mondo
// ("forse volevi p?") e il consiglio sarebbe solo rumore.
export function suggest(name, names, { minLength = 3 } = {}) {
  const word = String(name ?? '');
  if (word.length < minLength) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of names ?? []) {
    const d = distance(word, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= 2 && bestDistance < word.length ? best : null;
}

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

export function translateError(err, { p5Names = P5_NAMES, metrics = [] } = {}) {
  const raw = oneLine(err?.message ?? err);
  const at = Number.isInteger(err?.line)
    ? { line: err.line, column: Number.isInteger(err?.column) ? err.column : null }
    : lineFromStack(err?.stack);
  const line = at?.line ?? null;
  const column = at?.column ?? null;
  const known = [...p5Names, ...CTX_NAMES, ...DATA_NAMES, ...EXTRA_NAMES,
    ...(Array.isArray(metrics) ? metrics : Object.keys(metrics ?? {}))];
  const reply = (text, suggestion = null) => ({ text, line, column, suggestion, raw });

  if (/gira da troppo tempo|ciclo infinito|__guard|too many iterations|loop guard/i.test(raw)) {
    return reply('Un ciclo gira da più di 2 secondi e la scena si è fermata: controlla la condizione del for/while, oppure fai meno giri.');
  }
  const notDefined = raw.match(/(?:^|\s)([A-Za-z_$][\w$]*) is not defined/)
    ?? raw.match(/Can't find variable:\s*([A-Za-z_$][\w$]*)/);
  if (notDefined) {
    const name = notDefined[1];
    const fix = suggest(name, known);
    return reply(fix
      ? `${name} non esiste. Forse volevi ${fix}?`
      : `${name} non esiste. Controlla di averlo scritto giusto.`, fix);
  }
  const p5Missing = raw.match(/(?:^|\s)p\.([A-Za-z_$][\w$]*) is not a function/);
  if (p5Missing) {
    const name = p5Missing[1];
    const fix = suggest(name, p5Names);
    return reply(fix
      ? `p5 non ha una funzione ${name}. Forse volevi ${fix}?`
      : `p5 non ha una funzione ${name}. Controlla il nome.`, fix);
  }
  const nullRead = raw.match(/Cannot read propert(?:y|ies) of (null|undefined) \(reading '([^']+)'\)/);
  if (nullRead) {
    return reply(`Il dato non c'è (è ${nullRead[1]}): controlla con if (dato) prima di usarlo.`);
  }
  if (/Unexpected end of input/i.test(raw)) {
    return reply('Manca una parentesi } o ) di chiusura.');
  }
  if (/Unexpected token|missing \) after argument list|Unexpected identifier|Invalid or unexpected token/i.test(raw)) {
    return reply('Qui c\'è un simbolo che non torna: controlla parentesi, virgole e virgolette.');
  }
  if (/Assignment to constant variable/i.test(raw)) {
    return reply('Hai cambiato una const: usa let se deve cambiare.');
  }
  if (/Le scene non possono importare/i.test(raw)) {
    return reply('Le scene non possono importare altri file: metti tutto in un file solo.');
  }
  if (/Le scene non possono usare eval/i.test(raw)) {
    return reply('Le scene non possono usare eval.');
  }
  if (/Le scene non possono usare Function/i.test(raw)) {
    return reply('Le scene non possono usare Function.');
  }
  if (/is not a function/i.test(raw)) {
    return reply('Stai chiamando qualcosa che non è una funzione: controlla il nome e le parentesi.');
  }
  return reply(`Errore: ${raw || 'la scena non si è caricata.'}`);
}
