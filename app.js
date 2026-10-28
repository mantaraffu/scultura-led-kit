import { html, useState, useEffect, useRef } from '#preact';
import { resolveLayout } from '#shared/layout.js';
import { resolveParams } from '#shared/params.js';
import { createSim } from './sim.js';
import { createProbe } from './probe.js';
import { createStage } from './stage.js';
import { compileScene } from './compile.js';
import { translateError } from './errors.js';
import { staticChecks, verdict, usedMetrics } from './check.js';
import { createEditor } from './editor.js';
import { createPreview } from './preview.js';
import { ParamsPanel } from './panels/params.js';
import { DataPanel } from './panels/data.js';
import { TimePanel } from './panels/time.js';
import { FlatPanel } from './panels/flat.js';
import { View3dPanel } from './panels/view3d.js';
import { TEMPLATE_SOURCE } from './template.js';

const STORAGE_KEY = 'scultura-kit-scena';
// Testo fisso: il canale per consegnare la scena lo dice l'autore in aula, qui niente indirizzi.
const INVIO = 'Per inviarla: premi Salva, il file .js finisce nei tuoi scaricati. Consegnalo all\'autore come vi siete accordati in aula.';
const TABS = [['code', 'Codice'], ['view', 'Vista'], ['data', 'Dati']];
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export function slugify(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scena';
}

const emptySnapshot = { reads: [], observations: [], chain: [] };

// Le scene dell'opera che l'autore ha scelto di pubblicare: l'elenco e il codice
// stanno accanto al sito, in scene/.
async function leggiElenco() {
  const res = await fetch(new URL('./scene/elenco.json', import.meta.url));
  if (!res.ok) throw new Error('elenco non trovato');
  return res.json();
}

async function leggiScena(file) {
  const res = await fetch(new URL(`./scene/${file}`, import.meta.url));
  if (!res.ok) throw new Error(`scena non trovata: ${file}`);
  return res.text();
}

export function App({
  metrics: metricsProp = null, initialSource = TEMPLATE_SOURCE, layout: layoutProp = null,
  simFactory = createSim, stageFactory = createStage, compile = compileScene, editorFactory = createEditor,
  storage = globalThis.localStorage ?? null, delayMs = 250, tickMs = 500, autoSaveMs = 2000,
  checkMs = 5000, checkStepMs = 1000, now = Date.now,
  scenes: scenesProp = null, fetchScene = leggiScena,
} = {}) {
  const [metrics, setMetrics] = useState(metricsProp);
  const [source, setSource] = useState(initialSource);
  const [scene, setScene] = useState(null);
  const [params, setParams] = useState({});
  const [sim, setSim] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [restore, setRestore] = useState(null);
  const [tab, setTab] = useState('code');
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [clockNow, setClockNow] = useState(() => now());
  const [tick, setTick] = useState(0);
  const [stats, setStats] = useState({ fps: 0, frames: 0, running: false });
  const [checkResult, setCheckResult] = useState(null);
  const [layout] = useState(() => layoutProp ?? resolveLayout({}));
  const [preview, setPreview] = useState(null);
  const [view, setView] = useState('3d');
  const [scenes, setScenes] = useState(scenesProp ?? []);
  const [showScenes, setShowScenes] = useState(false);

  const editorHost = useRef(null);
  const stageHost = useRef(null);
  const fileInput = useRef(null);
  const editorRef = useRef(null);
  const stageRef = useRef(null);
  const simRef = useRef(null);
  const probeRef = useRef(null);
  const lastStats = useRef(0);
  const modRef = useRef(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const notify = (text, isError = false) => setNotice({ text, error: isError });
  const space = scene?.space === 'panorama' ? 'panorama' : 'strip';

  useEffect(() => {
    if (!metrics) {
      let off = false;
      fetch(new URL('./lib/metrics.json', import.meta.url))
        .then((res) => { if (!res.ok) throw new Error('metrics.json non trovato'); return res.json(); })
        .then((m) => { if (!off) setMetrics(m); })
        .catch((err) => { if (!off) setError({ text: `Non riesco a leggere le grandezze: ${err.message}`, line: null }); });
      return () => { off = true; };
    }
    return undefined;
  }, [metrics]);

  useEffect(() => {
    if (!metrics) return undefined;
    let off = false;
    Promise.resolve(simFactory({ metrics })).then((created) => {
      if (off) {
        created?.close?.();
        return;
      }
      simRef.current = created;
      probeRef.current = createProbe({ metrics });
      setSim(created);
      setReady(true);
    }, (err) => { if (!off) setError({ text: `Dati non disponibili: ${err.message}`, line: null }); });
    return () => {
      off = true;
      simRef.current?.close?.();
      simRef.current = null;
    };
  }, [metrics, simFactory]);

  useEffect(() => {
    if (scenesProp) return undefined;
    let off = false;
    // Se non ci sono scene pubblicate il file non c'è: non è un errore, è un kit senza esempi.
    leggiElenco().then(
      (elenco) => { if (!off && Array.isArray(elenco)) setScenes(elenco); },
      () => {},
    );
    return () => { off = true; };
  }, [scenesProp]);

  useEffect(() => {
    if (!storage) return;
    try {
      const saved = storage.getItem(STORAGE_KEY);
      if (saved && saved.trim() && saved !== initialSource) setRestore(saved);
    } catch {
      // navigazione privata: si continua senza ripristino
    }
  }, []);

  useEffect(() => {
    if (!editorHost.current) return undefined;
    const ed = editorFactory({ container: editorHost.current, value: initialSource, onChange: setSource });
    editorRef.current = ed;
    return () => {
      editorRef.current = null;
      ed.destroy();
    };
  }, []);

  useEffect(() => {
    if (!ready || !sim || !stageHost.current) return undefined;
    const wrapped = probeRef.current.wrapData(sim.data);
    globalThis.osserva = (name, value) => probeRef.current.osservA(name, value);
    const stage = stageFactory({
      container: stageHost.current,
      p5Class: globalThis.p5,
      layout,
      getData: () => wrapped,
      onError: setError,
      onFrame: (s) => {
        const t = Date.now();
        if (t - lastStats.current >= 500) { lastStats.current = t; setStats(s); }
      },
      metrics,
      now: () => globalThis.performance?.now?.() ?? now(),
    });
    stageRef.current = stage;
    return () => {
      stage.stop();
      stageRef.current = null;
    };
  }, [ready, sim, metrics, stageFactory, layout]);

  useEffect(() => {
    if (!ready) return undefined;
    let off = false;
    const timer = setTimeout(async () => {
      try {
        probeRef.current?.reset();
        const mod = await compile(source);
        if (off) return;
        modRef.current = mod;
        const next = mod.default ?? mod;
        setScene(next);
        setError(null);
        setCheckResult(null);
        setParams((prev) => resolveParams(next.params, prev));
        stageRef.current?.run(mod, { source });
      } catch (err) {
        if (off) return;
        setError(translateError(err, { metrics }));
        stageRef.current?.stop();
      }
    }, delayMs);
    return () => { off = true; clearTimeout(timer); };
  }, [source, ready, compile, delayMs, metrics]);

  useEffect(() => {
    stageRef.current?.setParams(params);
  }, [params]);

  // Una composizione sola della striscia 512×896 per fotogramma: la guardano i
  // ritagli delle facce e la vista 3D. Cambia con lo spazio della scena.
  useEffect(() => {
    if (!ready || !stageHost.current) return undefined;
    const made = createPreview({
      layout,
      space,
      getSource: () => stageHost.current?.querySelector('canvas') ?? null,
    });
    setPreview(made);
    return () => {
      made.stop();
      setPreview(null);
    };
  }, [ready, space, layout]);

  // Si disegna solo quando la vista si vede davvero: su PC sempre, sul telefono
  // quando è aperta la scheda Vista, mai con la pagina in secondo piano.
  useEffect(() => {
    if (!preview) return undefined;
    const doc = globalThis.document;
    const wide = globalThis.matchMedia?.('(min-width: 900px)') ?? null;
    const apply = () => {
      const visible = (wide?.matches ?? true) || tab === 'view';
      if (visible && !doc?.hidden) preview.start();
      else preview.stop();
    };
    apply();
    wide?.addEventListener?.('change', apply);
    doc?.addEventListener?.('visibilitychange', apply);
    return () => {
      wide?.removeEventListener?.('change', apply);
      doc?.removeEventListener?.('visibilitychange', apply);
      preview.stop();
    };
  }, [preview, tab]);

  useEffect(() => {
    if (!sim) return undefined;
    const id = setInterval(() => {
      sim.tick().catch(() => {});
      setClockNow(sim.clock.now());
      setTick((n) => n + 1);
    }, tickMs);
    return () => clearInterval(id);
  }, [sim, tickMs]);

  useEffect(() => {
    if (!sim) return;
    if (paused) sim.clock.pause();
    else sim.clock.resume();
    sim.clock.setSpeed(speed);
    setClockNow(sim.clock.now());
  }, [sim, speed, paused]);

  useEffect(() => {
    if (!storage) return undefined;
    const id = setInterval(() => {
      try {
        storage.setItem(STORAGE_KEY, sourceRef.current);
      } catch {
        // memoria piena o navigazione privata
      }
    }, autoSaveMs);
    return () => clearInterval(id);
  }, [storage, autoSaveMs]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice]);

  const useTemplate = () => {
    editorRef.current?.setValue(TEMPLATE_SOURCE);
    setSource(TEMPLATE_SOURCE);
    setError(null);
    setCheckResult(null);
    notify('Nuova scena dal modello');
  };

  const openScene = (scene) => {
    setShowScenes(false);
    Promise.resolve(fetchScene(scene.file)).then((text) => {
      editorRef.current?.setValue(text);
      setSource(text);
      setError(null);
      setCheckResult(null);
      notify(`Aperta «${scene.name}»: cambiala pure, il file dell'opera resta com'è`);
    }, (err) => notify(`Non riesco ad aprire «${scene.name}»: ${err.message}`, true));
  };

  const openFile = (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    Promise.resolve(file.text()).then((text) => {
      editorRef.current?.setValue(text);
      setSource(text);
      setError(null);
      setCheckResult(null);
      notify(`Aperto ${file.name}`);
    }, (err) => notify(`Non riesco ad aprire il file: ${err.message}`, true));
    event.target.value = '';
  };

  const saveFile = () => {
    const text = sourceRef.current;
    const name = `${slugify(scene?.name)}.js`;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Scaricato ${name}`);
    } catch (err) {
      notify(`Non riesco a salvare: ${err.message}`, true);
    }
  };

  const restoreSaved = () => {
    const text = restore;
    setRestore(null);
    if (!text) return;
    editorRef.current?.setValue(text);
    setSource(text);
    notify('Lavoro precedente ripristinato');
  };

  const ignoreSaved = () => setRestore(null);

  const copyMetric = (metric) => {
    editorRef.current?.insert(`const ${metric} = data.get('${metric}');\n`);
    notify(`Aggiunto data.get('${metric}') al codice`);
  };

  const override = (metric, patch) => {
    try {
      simRef.current?.setOverride(metric, patch);
      setTick((n) => n + 1);
    } catch (err) {
      notify(err.message, true);
    }
  };

  const clearOverride = (metric) => {
    simRef.current?.clearOverride(metric);
    setTick((n) => n + 1);
  };

  const restartScene = () => {
    if (modRef.current) stageRef.current?.run(modRef.current, { source: sourceRef.current });
  };

  const runCheck = async () => {
    if (!scene || !sim || !stageRef.current) {
      notify('Prima aspetta che la scena sia caricata.', true);
      return;
    }
    const staticProblems = staticChecks({ scene, source, metrics });
    const errors = staticProblems.filter((c) => c.level === 'error');
    const warnings = staticProblems.filter((c) => c.level === 'warn');
    if (errors.length) {
      const result = verdict({ errors, fps: 0, warnings });
      setCheckResult(result);
      notify(result.text, true);
      return;
    }
    const used = new Set([...usedMetrics(scene), ...(probeRef.current?.snapshot().reads ?? []).map((r) => r.metric)]);
    const previous = { speed, paused, overrides: sim.overrides() };
    const runtime = [];
    // Se la scena si è rotta la fermiamo lì, annotiamo in quale prova, e la facciamo
    // ripartire: così anche le prove dopo dicono qualcosa.
    const grab = (quando) => {
      const broken = stageRef.current?.error();
      if (!broken) return;
      runtime.push({ quando, text: broken.text, line: broken.line ?? null });
      restartScene();
    };
    let fps = 0;
    try {
      sim.clock.setSpeed(60);
      sim.clock.resume();
      if (stageRef.current.error()) restartScene();
      const before = stageRef.current.stats().frames;
      const t0 = Date.now();
      await sleep(checkMs);
      const seconds = Math.max(0.001, (Date.now() - t0) / 1000);
      const after = stageRef.current.stats();
      fps = checkMs > 0 ? (after.frames - before) / seconds : (after.fps || 60);
      grab('mentre girava');
      for (const metric of used) {
        if (!metrics[metric]) continue;
        const nome = metrics[metric]?.label ?? metric;
        sim.setOverride(metric, { missing: true });
        await sleep(checkStepMs);
        grab(`senza il dato ${nome}`);
        sim.setOverride(metric, { missing: false, stale: true });
        await sleep(checkStepMs);
        grab(`col dato ${nome} vecchio`);
        sim.clearOverride(metric);
      }
    } finally {
      for (const key of Object.keys(sim.overrides())) sim.clearOverride(key);
      for (const [key, patch] of Object.entries(previous.overrides)) sim.setOverride(key, patch);
      sim.clock.setSpeed(previous.speed);
      if (previous.paused) sim.clock.pause();
      else sim.clock.resume();
      setSpeed(previous.speed);
      setPaused(previous.paused);
      setTick((n) => n + 1);
      if (stageRef.current?.error()) restartScene();
      setError(null);
    }
    const result = verdict({ errors, fps, warnings, runtime });
    setCheckResult(result);
    notify(result.text, !result.ready);
  };

  const snapshot = probeRef.current?.snapshot() ?? emptySnapshot;
  const overrides = sim?.overrides?.() ?? {};

  return html`<div class="kit">
    <header class="kit-head">
      <div>
        <h1>Kit delle scene</h1>
        <p class="muted small">Dati simulati, niente collegamenti: prova la scena come starà sulla scultura.</p>
      </div>
      <div class="row wrap">
        <button onClick=${useTemplate}>Nuova scena</button>
        ${scenes.length ? html`<button aria-expanded=${showScenes ? 'true' : 'false'}
          onClick=${() => setShowScenes((v) => !v)}>Scene dell'opera</button>` : null}
        <button onClick=${() => fileInput.current?.click()}>Apri</button>
        <input ref=${fileInput} type="file" accept=".js,text/javascript" hidden onChange=${openFile} />
        <button onClick=${saveFile}>Salva</button>
        <button class="primary" disabled=${!ready} onClick=${runCheck}>Controlla la scena</button>
      </div>
    </header>

    ${showScenes && scenes.length ? html`<div class="alert scene-list" role="dialog" aria-label="Scene dell'opera">
      <div>
        <p class="muted small">Le scene che girano sulla scultura. Aprine una per vedere come è fatta: quello che modifichi qui resta qui.</p>
        <ul class="scelta">${scenes.map((s) => html`<li key=${s.file}>
          <button class="ghost" onClick=${() => openScene(s)}>
            <strong>${s.name}</strong>
            <span class="muted small">${s.space === 'panorama' ? 'tutto il giro' : 'quattro facce'}${s.metrics?.length ? ` · ${s.metrics.join(', ')}` : ''}</span>
          </button>
        </li>`)}</ul>
      </div>
    </div>` : null}
    ${restore ? html`<div class="alert warn" role="status">
      <span>C'è un lavoro salvato in questo browser. Vuoi riprenderlo?</span>
      <span class="row"><button class="ghost" onClick=${ignoreSaved}>Ignora</button><button class="primary" onClick=${restoreSaved}>Ripristina</button></span>
    </div>` : null}
    ${error ? html`<div class="alert danger" role="alert">
      <span>${error.text}${error.line ? ` — riga ${error.line}` : ''}</span>
    </div>` : null}
    ${notice ? html`<div class=${`toast${notice.error ? ' error' : ''}`} role="status">${notice.text}</div>` : null}
    ${checkResult ? html`<div class=${`alert ${checkResult.ready ? 'ok' : 'warn'}`} role="status">
      <div><strong>${checkResult.text}</strong>
        ${checkResult.problems.length ? html`<ul class="problems">${checkResult.problems.map((p, i) => html`<li key=${i}>${p.text}${p.line ? ` (riga ${p.line})` : ''}</li>`)}</ul>` : null}
        <p class="muted small">${INVIO}</p>
      </div>
    </div>` : null}

    <nav class="kit-tabs" aria-label="Sezioni">
      ${TABS.map(([id, label]) => html`<button key=${id} aria-current=${id === tab ? 'page' : null} onClick=${() => setTab(id)}>${label}</button>`)}
    </nav>

    <main class="kit-main">
      <section class="kit-code" hidden=${tab !== 'code'}>
        <div class="row between"><h2>Codice</h2><span class="muted small">${stats.fps ? `${Math.round(stats.fps)} fps` : ''}</span></div>
        <div class="editor-host" ref=${editorHost}></div>
        <p class="muted small">Scrivi una scena p5: <code>draw(p, ctx, data)</code>. Osserva un valore con <code>osserva('nome', valore)</code>.</p>
      </section>

      <section class="kit-view" hidden=${tab !== 'view'}>
        <div class="row between"><h2>Vista</h2><span class="muted small">${space === 'panorama' ? 'tutto il giro' : 'quattro facce'} · ×${speed}${paused ? ' · in pausa' : ''}</span></div>
        <div class="segmented view-switch" role="group" aria-label="Come guardare la scena">
          ${[['3d', 'Sulla scultura'], ['flat', 'Tela piatta']].map(([id, label]) => html`<button key=${id}
            aria-pressed=${view === id ? 'true' : 'false'} onClick=${() => setView(id)}>${label}</button>`)}
        </div>
        <div class=${`view-slot${view === '3d' ? '' : ' off'}`}>
          <${View3dPanel} preview=${preview} layout=${layout} active=${view === '3d' && tab === 'view'} />
        </div>
        <div class=${`view-slot${view === 'flat' ? '' : ' off'}`}>
          <${FlatPanel} space=${space} layout=${layout} containerRef=${stageHost} preview=${preview} />
        </div>
        <div class="card"><${TimePanel} now=${clockNow} speed=${speed} paused=${paused}
          onSpeed=${setSpeed} onPause=${setPaused} /></div>
        <div class="card"><h2>Parametri</h2>
          <${ParamsPanel} params=${scene?.params} values=${params}
            onChange=${(key, value) => setParams((p) => ({ ...p, [key]: value }))} /></div>
      </section>

      <section class="kit-data" hidden=${tab !== 'data'}>
        <div class="row between"><h2>Dati</h2><span class="muted small" data-tick=${tick}>simulati</span></div>
        <${DataPanel} metrics=${metrics ?? {}} data=${sim?.data ?? null} overrides=${overrides}
          snapshot=${snapshot} onOverride=${override} onClear=${clearOverride} onCopy=${copyMetric} />
      </section>
    </main>

    <footer class="kit-foot muted small">
      Kit delle scene — codice libero (MIT). Le librerie incluse (p5, three.js, CodeMirror,
      acorn, htm) restano dei loro autori: <a href="./vendor/LICENZE.md">elenco e licenze</a>.
    </footer>
  </div>`;
}
