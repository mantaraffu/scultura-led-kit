import { html, useEffect, useRef, useState } from '#preact';
import { COLUMNS, HEIGHT, panels } from '#shared/layout.js';

// Misure della scultura, da verificare in sito.
// Millimetri nella documentazione, metri nella scena 3D (1 unità = 1 m).
export const BASE_D_MM = 3000; // basamento cilindrico
export const BASE_H_MM = 750;
export const FACE_W_MM = 500; // faccia LED: 128×896 px su 500×3500 mm
export const FACE_H_MM = 3500;
export const FACE_TILT_DEG = 4; // la faccia si apre verso l'alto e guarda chi passa
export const FACE_BASE_DIST_MM = 750; // distanza dall'asse del centro faccia, in basso
export const COLUMN_DEPTH_MM = 350; // corpo bianco dietro la faccia, solo per capire i volumi

const DEG = Math.PI / 180;
const m = (mm) => mm / 1000;
const SEAM = 0.004; // 4 mm di stacco fra un pannello e l'altro, per vedere le giunzioni

// Dove sta la faccia i: l'angolo di `layout.faceAngles` è misurato in pianta da +X,
// in senso antiorario visti dall'alto. La faccia guarda fuori, lungo la sua diagonale.
export function facePlacement(layout, i) {
  if (!Number.isInteger(i) || i < 0 || i >= COLUMNS) throw new RangeError(`faccia ${i} inesistente (0–3)`);
  const angle = (layout.faceAngles[i] ?? 0) * DEG;
  const out = { x: Math.cos(angle), z: -Math.sin(angle) }; // verso fuori, in pianta
  const tilt = FACE_TILT_DEG * DEG;
  const height = m(FACE_H_MM);
  const rBottom = m(FACE_BASE_DIST_MM);
  const rTop = rBottom + height * Math.sin(tilt);
  const yBottom = m(BASE_H_MM);
  const yTop = yBottom + height * Math.cos(tilt);
  const bottom = { x: rBottom * out.x, y: yBottom, z: rBottom * out.z };
  const top = { x: rTop * out.x, y: yTop, z: rTop * out.z };
  return {
    angle,
    out,
    bottom,
    top,
    center: { x: (bottom.x + top.x) / 2, y: (bottom.y + top.y) / 2, z: (bottom.z + top.z) / 2 },
    size: { w: m(FACE_W_MM), h: height },
    // rotazione del pannello: prima gira in pianta, poi si inclina (ordine YXZ)
    rotation: { x: tilt, y: angle + Math.PI / 2, z: 0 },
  };
}

// La faccia i prende la colonna i della striscia: u da i/4 a (i+1)/4.
export function faceUv(i) {
  return { u0: i / COLUMNS, u1: (i + 1) / COLUMNS };
}

// I quattro pannelli veri di una colonna (tre da 128×256 e uno da 128×128), presi da
// `panels()` di shared/layout.js: così la vista 3D legge `smallPanel` come l'opera e si
// vedono le giunzioni dove sono davvero.
export function facePanels(layout, i) {
  const place = facePlacement(layout, i);
  const tilt = FACE_TILT_DEG * DEG;
  // direzione "in su" lungo la faccia inclinata
  const up = { x: place.out.x * Math.sin(tilt), y: Math.cos(tilt), z: place.out.z * Math.sin(tilt) };
  const { u0, u1 } = faceUv(i);
  return panels(layout).map((panel) => {
    const share = panel.h / HEIGHT;
    const height = place.size.h * share;
    // `panel.y` si conta dall'alto della colonna, la faccia si misura dal basso
    const fromBottom = place.size.h * (1 - (panel.y + panel.h / 2) / HEIGHT);
    return {
      small: panel.small,
      height,
      center: {
        x: place.bottom.x + up.x * fromBottom,
        y: place.bottom.y + up.y * fromBottom,
        z: place.bottom.z + up.z * fromBottom,
      },
      uv: { u0, u1, v0: 1 - (panel.y + panel.h) / HEIGHT, v1: 1 - panel.y / HEIGHT },
      rotation: place.rotation,
      width: place.size.w,
    };
  });
}

// Viste rapide: la macchina guarda sempre il centro della scultura a mezza altezza.
export function quickViews(layout) {
  const angles = layout.faceAngles;
  const between = (angles[0] + angles[1]) / 2;
  const far = 7.5;
  const eye = (deg, y, distance = far) => ({
    x: Math.cos(deg * DEG) * distance,
    y,
    z: -Math.sin(deg * DEG) * distance,
  });
  const inPiedi = { x: 0, y: 1, z: 0 };
  return [
    { id: 'between', label: 'Tra due bracci', position: eye(between, 2.4), target: { x: 0, y: 2.2, z: 0 }, up: inPiedi },
    { id: 'diagonal', label: 'Lungo una diagonale', position: eye(angles[0], 2.4), target: { x: 0, y: 2.2, z: 0 }, up: inPiedi },
    // Dall'alto l'alto dello schermo è il nord della pianta: le colonne si vedono a X, come in pianta.
    { id: 'top', label: 'Dall\'alto', position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: -1 } },
  ];
}

export function webglAvailable(doc = globalThis.document) {
  try {
    const probe = doc.createElement('canvas');
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

export const NO_WEBGL = 'Questo browser non riesce a disegnare in 3D: resta la tela piatta, che mostra le stesse cose.';

// Scultura in miniatura con la striscia della scena applicata sulle quattro facce.
// La texture è la tela composta da `kit/preview.js`: un disegno solo per fotogramma,
// condiviso con i ritagli della tela piatta.
export async function createView3d({
  container,
  preview,
  layout,
  doc = globalThis.document,
  loadThree = () => import('#three'),
  loadControls = () => import('#three/controls'),
  view = 'between',
} = {}) {
  if (!container) throw new Error('vista 3D: manca il contenitore');
  if (!webglAvailable(doc)) return { ok: false, reason: NO_WEBGL, dispose() {} };

  const THREE = await loadThree();
  const { OrbitControls } = await loadControls();

  const size = () => ({
    width: Math.max(1, container.clientWidth || 640),
    height: Math.max(1, container.clientHeight || 480),
  });
  const first = size();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.setSize(first.width, first.height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-label', 'Scultura in tre dimensioni');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0f12);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(4, 8, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, first.width / first.height, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 30;
  controls.maxPolarAngle = 85 * DEG; // non si va sotto il pavimento
  controls.enablePan = false;

  const dispose = [];

  // Basamento e pavimento.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(m(BASE_D_MM) / 2, m(BASE_D_MM) / 2, m(BASE_H_MM), 64),
    new THREE.MeshLambertMaterial({ color: 0x15171b }),
  );
  base.position.y = m(BASE_H_MM) / 2;
  scene.add(base);
  dispose.push(base.geometry, base.material);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 64),
    new THREE.MeshLambertMaterial({ color: 0x191b20 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  dispose.push(floor.geometry, floor.material);

  // La striscia della scena diventa la texture delle facce.
  const texture = new THREE.CanvasTexture(preview.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  dispose.push(texture);

  const columnBody = new THREE.MeshLambertMaterial({ color: 0xf4f2ee }); // rivestimento composito chiaro
  const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  dispose.push(columnBody, faceMaterial);

  for (let i = 0; i < COLUMNS; i++) {
    const place = facePlacement(layout, i);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(place.size.w * 0.9, place.size.h, m(COLUMN_DEPTH_MM)),
      columnBody,
    );
    body.position.set(
      place.center.x - place.out.x * m(COLUMN_DEPTH_MM) * 0.6,
      place.center.y,
      place.center.z - place.out.z * m(COLUMN_DEPTH_MM) * 0.6,
    );
    body.rotation.set(place.rotation.x, place.rotation.y, 0, 'YXZ');
    scene.add(body);
    dispose.push(body.geometry);

    // Un rettangolo per pannello: le giunzioni si vedono dove sono davvero.
    for (const panel of facePanels(layout, i)) {
      const geometry = new THREE.PlaneGeometry(panel.width, panel.height - SEAM);
      const uv = geometry.attributes.uv;
      for (let v = 0; v < uv.count; v++) {
        uv.setXY(
          v,
          panel.uv.u0 + uv.getX(v) * (panel.uv.u1 - panel.uv.u0),
          panel.uv.v0 + uv.getY(v) * (panel.uv.v1 - panel.uv.v0),
        );
      }
      uv.needsUpdate = true;
      const face = new THREE.Mesh(geometry, faceMaterial);
      face.position.set(panel.center.x, panel.center.y, panel.center.z);
      face.rotation.set(panel.rotation.x, panel.rotation.y, 0, 'YXZ');
      scene.add(face);
      dispose.push(geometry);
    }
  }

  function look(id) {
    const viste = quickViews(layout);
    const wanted = viste.find((v) => v.id === id) ?? viste[0];
    const up = wanted.up ?? { x: 0, y: 1, z: 0 };
    camera.up.set(up.x, up.y, up.z);
    camera.position.set(wanted.position.x, wanted.position.y, wanted.position.z);
    controls.target.set(wanted.target.x, wanted.target.y, wanted.target.z);
    controls.update();
    renderer.render(scene, camera);
    return wanted.id;
  }
  look(view);

  function resize() {
    const { width, height } = size();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  // Si disegna quando l'anteprima ha un fotogramma nuovo: al massimo 30 volte al secondo,
  // e niente del tutto quando la scheda Vista non è aperta.
  const unsubscribe = preview.subscribe(() => {
    texture.needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
  });

  let observer = null;
  if (typeof globalThis.ResizeObserver === 'function') {
    observer = new globalThis.ResizeObserver(() => resize());
    observer.observe(container);
  }

  renderer.render(scene, camera);

  return {
    ok: true,
    look,
    resize,
    views: quickViews(layout),
    dispose() {
      unsubscribe();
      observer?.disconnect();
      controls.dispose();
      for (const thing of dispose) thing.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// Riquadro della vista 3D: tiene la scultura, le viste rapide e, se il browser non
// sa fare 3D, una frase al posto di un errore.
export function View3dPanel({ preview = null, layout, create = createView3d, active = true }) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const [state, setState] = useState({ loading: true, ok: false, reason: null, views: [] });

  useEffect(() => {
    if (!host.current || !preview) return undefined;
    let off = false;
    Promise.resolve(create({ container: host.current, preview, layout })).then((view) => {
      if (off) {
        view?.dispose?.();
        return;
      }
      viewRef.current = view;
      setState({ loading: false, ok: view.ok === true, reason: view.reason ?? null, views: view.views ?? [] });
    }, (err) => {
      if (!off) setState({ loading: false, ok: false, reason: `Non riesco ad aprire la vista in 3D: ${err.message}`, views: [] });
    });
    return () => {
      off = true;
      viewRef.current?.dispose?.();
      viewRef.current = null;
    };
  }, [preview, layout, create]);

  // Tornando sulla vista 3D la finestra può avere un'altra misura.
  useEffect(() => {
    if (active) viewRef.current?.resize?.();
  }, [active]);

  return html`<div class="view3d">
    <div class="view3d-host" ref=${host}></div>
    ${state.loading ? html`<p class="muted small">Preparo la scultura…</p>` : null}
    ${!state.loading && !state.ok ? html`<p class="muted small">${state.reason}</p>` : null}
    ${state.views.length ? html`<div class="segmented" role="group" aria-label="Viste rapide">
      ${state.views.map((v) => html`<button key=${v.id} class="ghost" onClick=${() => viewRef.current?.look(v.id)}>${v.label}</button>`)}
    </div>` : null}
    <p class="muted small">Gira con il dito o con il mouse. Le facce sono quelle vere: 500 × 3500 mm, inclinate di 4°.</p>
  </div>`;
}
