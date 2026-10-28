import * as acorn from '#acorn';

const PROLOGUE = 'const __guard=globalThis.__kitGuard;';
const GUARD = '__guard();'; // se il tempo è scaduto lancia e la scena si ferma

// Riga e colonna di un errore che viene dal modulo caricato da blob: o data:.
export function lineFromStack(stack) {
  if (typeof stack !== 'string') return null;
  for (const line of stack.split('\n')) {
    if (!line.includes('blob:') && !line.includes('data:text/javascript')) continue;
    const m = line.match(/:(\d+):(\d+)\)?\s*$/);
    if (m) return { line: Number(m[1]), column: Number(m[2]) };
  }
  return null;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (value && typeof value === 'object') walk(value, visit);
  }
}

function fail(message, node) {
  const err = new Error(message);
  err.line = node?.loc?.start?.line ?? 1;
  err.column = node?.loc?.start?.column ?? 0;
  err.phase = 'scena';
  throw err;
}

export function parseScene(src) {
  try {
    const ast = acorn.parse(src, {
      ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true,
    });
    return { ok: true, ast };
  } catch (err) {
    return {
      ok: false,
      error: {
        line: err.loc?.line ?? 1,
        column: err.loc?.column ?? 0,
        message: String(err.message ?? err),
      },
    };
  }
}

// Aggiunge la guardia all'inizio di ogni ciclo senza inserire a capo: i numeri di riga
// restano quelli scritti dallo studente.
function guardCode(src, ast) {
  const edits = [];
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression') {
      fail('Le scene non possono importare altri file.', node);
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
      if (node.callee.name === 'eval') fail('Le scene non possono usare eval.', node);
      if (node.callee.name === 'Function') fail('Le scene non possono usare Function.', node);
    }
    if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'Function') {
      fail('Le scene non possono usare Function.', node);
    }
    if (node.type !== 'ForStatement' && node.type !== 'WhileStatement' && node.type !== 'DoWhileStatement') return;
    const body = node.body;
    if (!body) return;
    if (body.type === 'BlockStatement') edits.push({ at: body.start + 1, text: GUARD });
    else edits.push({ at: body.start, text: `{${GUARD}` }, { at: body.end, text: '}' });
  });
  let out = src;
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  }
  return out;
}

function syntaxError(error) {
  const err = new Error(error.message);
  err.line = error.line;
  err.column = error.column;
  err.phase = 'sintassi';
  return err;
}

// Compila la scena in un modulo ES: sintassi, divieti, guardia dei cicli, modulo da Blob (browser)
// o data: URL (Node e test). La riga 1 resta la riga 1.
export async function compileScene(src, { url = globalThis.URL } = {}) {
  if (typeof src !== 'string') throw new Error('la scena deve essere un testo');
  const parsed = parseScene(src);
  if (!parsed.ok) throw syntaxError(parsed.error);
  const code = PROLOGUE + guardCode(src, parsed.ast);
  if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof url?.createObjectURL === 'function') {
    const href = url.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      return await import(/* webpackIgnore: true */ href);
    } catch (err) {
      // Node con un DOM finto (jsdom) non sa importare blob:; il browser sì.
      if (!/blob:|protocol ['"]?blob/i.test(String(err?.message ?? err))) throw err;
    } finally {
      url.revokeObjectURL?.(href);
    }
  }
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);
}

export { walk };
