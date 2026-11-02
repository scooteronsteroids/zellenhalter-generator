import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { CELL_PRESETS, PRINTERS } from './cells.js';
import { DEFAULTS, derive } from './geometry.js';
import { make3MF, makeSTL, download } from './export.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'zellenhalter-settings-v1';
const PETG_DENSITY = 1.27; // g/cm³

// ---------------------------------------------------------------- Zustand
const FIELD_IDS = ['cellD', 'cellLen', 'cellCap', 'cellI', 'cellW', 'cellV', 's', 'p', 'tol', 'wall',
  'border', 'height', 'lipT', 'lipW', 'chamfer', 'splitX', 'splitY'];
const INITIAL = {
  preset: 'p45b', printer: 'p1s', layout: DEFAULTS.layout, outline: DEFAULTS.outline,
  vents: DEFAULTS.vents, markers: DEFAULTS.markers,
  cellD: 21.7, cellLen: 70.2, cellCap: 4.5, cellI: 45, cellW: 70, cellV: 3.6,
  s: 13, p: 4, tol: DEFAULTS.tol, wall: DEFAULTS.wall, border: DEFAULTS.border, height: DEFAULTS.height,
  lipT: DEFAULTS.lipT, lipW: DEFAULTS.lipW, chamfer: DEFAULTS.chamfer, splitX: 0, splitY: 0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...INITIAL, ...JSON.parse(raw) };
  } catch (e) { /* Speicher nicht verfügbar */ }
  return { ...INITIAL };
}
function saveState(st) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) { /* egal */ }
}

let state = loadState();

// ---------------------------------------------------------------- UI aufbauen
const presetSel = $('preset');
for (const c of CELL_PRESETS) presetSel.add(new Option(c.name, c.id));
const printerSel = $('printer');
for (const p of PRINTERS) printerSel.add(new Option(p.name, p.id));

const VOLT_CHIPS = [[10, '36 V'], [13, '48 V'], [14, '52 V'], [16, '60 V'], [20, '72 V'], [22, '84 V']];
const chipBox = $('voltChips');
for (const [s, label] of VOLT_CHIPS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = `${s}S · ${label}`; b.dataset.s = s;
  b.addEventListener('click', () => { $('s').value = s; onChange(); });
  chipBox.appendChild(b);
}

function writeForm() {
  presetSel.value = state.preset;
  printerSel.value = state.printer;
  for (const id of FIELD_IDS) $(id).value = state[id] ?? '';
  document.querySelector(`input[name=layout][value=${state.layout}]`).checked = true;
  $('outline').value = state.outline;
  $('vents').checked = state.vents;
  $('markers').checked = state.markers;
  updatePresetNote();
}

function readForm() {
  const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
  const st = { ...state };
  st.preset = presetSel.value;
  st.printer = printerSel.value;
  for (const id of FIELD_IDS) st[id] = num(id);
  st.layout = document.querySelector('input[name=layout]:checked').value;
  st.outline = $('outline').value;
  st.vents = $('vents').checked;
  st.markers = $('markers').checked;
  return st;
}

function updatePresetNote() {
  const pr = CELL_PRESETS.find(c => c.id === state.preset);
  $('presetNote').textContent = pr?.note ? '⚠ ' + pr.note + '.' : '';
}

presetSel.addEventListener('change', () => {
  const pr = CELL_PRESETS.find(c => c.id === presetSel.value);
  if (pr && pr.id !== 'custom') {
    $('cellD').value = pr.d; $('cellLen').value = pr.len; $('cellCap').value = pr.cap;
    $('cellI').value = pr.i ?? ''; $('cellW').value = pr.w; $('cellV').value = pr.v;
  }
  onChange();
});
// Manuelle Änderung der Zellmaße -> "Eigene Zelle"
for (const id of ['cellD', 'cellLen']) {
  $(id).addEventListener('input', () => { presetSel.value = 'custom'; });
}
$('panel').addEventListener('input', (e) => { if (e.target !== presetSel) onChange(); });
$('panel').addEventListener('change', (e) => { if (e.target !== presetSel) onChange(); });
$('reset').addEventListener('click', () => { state = { ...INITIAL }; writeForm(); onChange(); });

// ---------------------------------------------------------------- Optionen für die Geometrie
function clampInt(v, lo, hi, def) {
  if (!Number.isFinite(v)) return def;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
function geometryOptions(st) {
  const pr = PRINTERS.find(p => p.id === st.printer) || PRINTERS[2];
  const n = (v, def, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  const height = n(st.height, DEFAULTS.height, 3, 40);
  return {
    s: clampInt(st.s, 1, 40, 13),
    p: clampInt(st.p, 1, 30, 4),
    cellD: n(st.cellD, 21.7, 8, 60),
    cellLen: n(st.cellLen, 70, 20, 200),
    tol: n(st.tol, DEFAULTS.tol, 0, 2),
    layout: st.layout,
    wall: n(st.wall, DEFAULTS.wall, 0.4, 10),
    border: n(st.border, DEFAULTS.border, 1, 20),
    height,
    lipT: n(st.lipT, DEFAULTS.lipT, 0.6, Math.max(0.6, height - 1.5)),
    lipW: n(st.lipW, DEFAULTS.lipW, 0.5, 8),
    outline: st.outline,
    chamfer: n(st.chamfer, DEFAULTS.chamfer, 0, 3),
    vents: st.vents,
    markers: st.markers,
    splitX: clampInt(st.splitX, 0, 30, 0),
    splitY: clampInt(st.splitY, 0, 40, 0),
    bedW: pr.w, bedD: pr.d,
  };
}

// ---------------------------------------------------------------- Worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map();
worker.onmessage = (ev) => {
  const { id } = ev.data;
  const cb = pending.get(id);
  if (cb) { pending.delete(id); cb(ev.data); }
};
worker.onerror = (e) => setStatus('Fehler beim Laden der Geometrie-Engine: ' + (e.message || e), 'err');
function compute(options) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, (msg) => msg.ok ? resolve(msg.result) : reject(new Error(msg.error)));
    worker.postMessage({ id, options });
  });
}

// ---------------------------------------------------------------- 3D-Ansicht
const wrap = $('canvasWrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
wrap.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(250, -350, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(200, -300, 500);
scene.add(sun);
const sun2 = new THREE.DirectionalLight(0xffffff, 0.6);
sun2.position.set(-300, 200, 200);
scene.add(sun2);

const grid = new THREE.GridHelper(1000, 100, 0x8a94a6, 0xb8c0cc);
grid.rotation.x = Math.PI / 2;
grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);

const content = new THREE.Group();
scene.add(content);

const MAT_A = new THREE.MeshStandardMaterial({ color: 0x1fa971, roughness: 0.55, metalness: 0.05, flatShading: true });
const MAT_B = new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.55, metalness: 0.05, flatShading: true });
const MAT_CELL = new THREE.MeshStandardMaterial({ color: 0x8f5bd6, roughness: 0.4, metalness: 0.1 });
const MAT_PLUS = new THREE.MeshStandardMaterial({ color: 0xd93b3b, roughness: 0.4 });
const MAT_MINUS = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.6 });
const MAT_BED = new THREE.MeshBasicMaterial({ color: 0x0a9e5c, transparent: true, opacity: 0.08, side: THREE.DoubleSide });

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);
resize();
(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
})();

function clearContent() {
  for (const child of [...content.children]) {
    content.remove(child);
    child.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

function pieceGeometry(piece) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));
  geo.setIndex(new THREE.BufferAttribute(piece.indices, 1));
  return geo;
}

let lastResult = null;
let lastOptions = null;
let needFit = true;

function currentView() { return document.querySelector('input[name=view]:checked').value; }

function render() {
  clearContent();
  if (!lastResult) return;
  const view = currentView();
  const r = lastResult;
  const o = r.options;
  const nx = r.split.nx;
  const gap = 8; // Abstand zwischen Teilen in der Druckteil-Ansicht

  if (view === 'A' || view === 'B') {
    for (const pc of r.pieces.filter(p => p.side === view)) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), view === 'A' ? MAT_A : MAT_B);
      const a = pc.index % nx, b = Math.floor(pc.index / nx);
      const sx = view === 'B' ? -1 : 1; // B ist gespiegelt
      mesh.position.set(sx * (a - (nx - 1) / 2) * gap, (b - (r.split.ny - 1) / 2) * gap, 0);
      content.add(mesh);
    }
    // Druckbett zum Größenvergleich (nur wenn der Halter am Stück gedruckt wird)
    if (r.split.nx * r.split.ny === 1) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(o.bedW, o.bedD), MAT_BED);
      bed.position.z = -0.05;
      bed.userData.noFit = true;
      content.add(bed);
    }
    $('legend').textContent = view === 'A'
      ? 'Halter A (unten) · Druckansicht, Lippe liegt auf dem Druckbett. Grüne Fläche = Druckbett.'
      : 'Halter B (oben) · gespiegelt gedruckt, wird beim Zusammenbau umgedreht aufgesetzt.';
  } else {
    // Zusammenbau
    const d = derive(o);
    const lipT = r.lipT;
    const zTop = lipT + o.cellLen + lipT;
    for (const pc of r.pieces) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), pc.side === 'A' ? MAT_A : MAT_B);
      if (pc.side === 'B') { mesh.scale.set(-1, 1, -1); mesh.position.z = zTop; }
      content.add(mesh);
    }
    const n = d.cells.length;
    const bodyGeo = new THREE.CylinderGeometry(o.cellD / 2, o.cellD / 2, o.cellLen - 1.2, 32);
    bodyGeo.rotateX(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(o.cellD / 2 * 0.95, o.cellD / 2 * 0.95, 0.6, 32);
    capGeo.rotateX(Math.PI / 2);
    const nubGeo = new THREE.CylinderGeometry(o.cellD * 0.17, o.cellD * 0.17, 1.2, 20);
    nubGeo.rotateX(Math.PI / 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, MAT_CELL, n);
    const capsTopPlus = [], capsTopMinus = [];
    const m = new THREE.Matrix4();
    d.cells.forEach((c, k) => {
      m.makeTranslation(c.x, c.y, lipT + o.cellLen / 2);
      bodies.setMatrixAt(k, m);
      // gerade Reihen: + zeigt nach unten in Halter A
      (c.j % 2 === 0 ? capsTopMinus : capsTopPlus).push(c);
    });
    content.add(bodies);
    const zCapTop = lipT + o.cellLen - 0.3, zCapBot = lipT + 0.3;
    const addCaps = (list, z, mat, geo) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((c, k) => { m.makeTranslation(c.x, c.y, z); im.setMatrixAt(k, m); });
      content.add(im);
    };
    addCaps(capsTopPlus, zCapTop, MAT_PLUS, capGeo);
    addCaps(capsTopPlus, zCapTop + 0.6, MAT_PLUS, nubGeo);
    addCaps(capsTopMinus, zCapTop, MAT_MINUS, capGeo);
    addCaps(capsTopMinus, zCapBot, MAT_PLUS, capGeo);
    addCaps(capsTopPlus, zCapBot, MAT_MINUS, capGeo);
    $('legend').textContent = 'Zusammenbau: Halter A (grün) unten, Halter B (blau) oben. Rote Kappe = Pluspol, graue Kappe = Minuspol.';
  }

  if (needFit) { fitView(); needFit = false; }
}

function fitView() {
  const box = new THREE.Box3();
  for (const child of content.children) if (!child.userData.noFit) box.expandByObject(child);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = size.length() / 2;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9;
  const dir = new THREE.Vector3(0.45, -0.75, 0.75).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(0.5, dist / 100); camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

$('fit').addEventListener('click', fitView);
document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => { needFit = true; render(); }));

// ---------------------------------------------------------------- Infos
const fmt = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';

function renderInfo(st, o, r) {
  const sN = o.s, pN = o.p;
  const v = Number.isFinite(st.cellV) ? st.cellV : 3.6;
  const cap = st.cellCap, I = st.cellI, w = st.cellW;
  const rows = [
    ['Konfiguration', `${sN}S${pN}P · ${sN * pN} Zellen`],
    ['Nennspannung', `${fmt(sN * v)} V`],
    ['Ladeschluss (4,2 V)', `${fmt(sN * 4.2)} V`],
    ['Kapazität', Number.isFinite(cap) ? `${fmt(pN * cap)} Ah` : '–'],
    ['Energie', Number.isFinite(cap) ? `${fmt(sN * pN * v * cap, 0)} Wh` : '–'],
    ['Max. Dauerstrom', Number.isFinite(I) ? `${fmt(pN * I, 0)} A` : '–'],
    ['Max. Leistung', Number.isFinite(I) ? `${fmt(pN * I * sN * v / 1000, 1)} kW` : '–'],
    ['Zellgewicht', Number.isFinite(w) ? `${fmt(sN * pN * w / 1000, 2)} kg` : '–'],
  ];
  $('packInfo').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');

  const d = derive(o);
  $('lipInfo').textContent = `Ø ${fmt(d.lipR * 2)} mm`;

  if (!r) { $('holderInfo').innerHTML = ''; return; }
  const volA = r.pieces.filter(p => p.side === 'A').reduce((s, p) => s + p.volume, 0);
  const volAll = r.pieces.reduce((s, p) => s + p.volume, 0);
  const nPieces = r.split.nx * r.split.ny;
  const maxW = Math.max(...r.pieces.map(p => p.bounds.max[0] - p.bounds.min[0]));
  const maxD = Math.max(...r.pieces.map(p => p.bounds.max[1] - p.bounds.min[1]));
  const pr = PRINTERS.find(p => p.id === st.printer) || PRINTERS[2];
  const fitsBed = (Math.max(maxW, maxD) <= Math.max(pr.w, pr.d) && Math.min(maxW, maxD) <= Math.min(pr.w, pr.d));
  const hRows = [
    ['Außenmaß (gesamt)', `${fmt(r.size[0])} × ${fmt(r.size[1])} × ${fmt(r.size[2])} mm`],
    ['Zellbohrung', `Ø ${fmt(d.holeD, 2)} mm`],
    ['Zellabstand (Mitte)', `${fmt(d.pitch, 2)} mm`],
    ['Akkublock (ohne Strips)', `${fmt(r.size[0])} × ${fmt(r.size[1])} × ${fmt(o.cellLen + 2 * r.lipT)} mm`],
    ['Teile pro Halter', nPieces === 1 ? '1 (am Stück)' : `${nPieces} (${r.split.nx} × ${r.split.ny})`],
    ['Größtes Teil', `${fmt(maxW)} × ${fmt(maxD)} mm`, !fitsBed],
    ['Filament (PETG, 100 %)', `≈ ${fmt(volAll / 1000 * PETG_DENSITY, 0)} g (A: ${fmt(volA / 1000 * PETG_DENSITY, 0)} g)`],
  ];
  $('holderInfo').innerHTML = hRows.map(([k, val, warn]) => `<dt>${k}</dt><dd class="${warn ? 'warn' : ''}">${val}</dd>`).join('');
}

// ---------------------------------------------------------------- Status
function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

// ---------------------------------------------------------------- Neu berechnen
let timer = null;
let latestRequested = 0;

function onChange() {
  state = readForm();
  saveState(state);
  updatePresetNote();
  document.querySelectorAll('#voltChips button').forEach(b => b.classList.toggle('on', +b.dataset.s === state.s));
  const o = geometryOptions(state);
  renderInfo(state, o, null);
  clearTimeout(timer);
  timer = setTimeout(() => regenerate(o), 300);
}

async function regenerate(o) {
  const my = ++latestRequested;
  $('busy').hidden = false;
  setButtons(false);
  try {
    const sameShape = lastOptions && lastOptions.s === o.s && lastOptions.p === o.p && lastOptions.layout === o.layout;
    const r = await compute(o);
    if (my !== latestRequested) return; // veraltet
    r.derived = derive(o);
    lastResult = r; lastOptions = o;
    if (!sameShape) needFit = true;
    render();
    renderInfo(state, o, r);
    const nPieces = r.split.nx * r.split.ny;
    if (!r.split.allFit) {
      setStatus(`Achtung: Mindestens ein Teil passt nicht auf das Druckbett (${o.bedW} × ${o.bedD} mm). Teilung erhöhen oder größeren Drucker wählen.`, 'warn');
    } else {
      setStatus(`Fertig in ${fmt(r.ms / 1000, 1)} s · ${nPieces === 1 ? 'Halter passt am Stück aufs Bett' : `je Halter ${nPieces} Teile`} · ${o.s}S${o.p}P`);
    }
    buildStlList(r);
    setButtons(true);
  } catch (err) {
    if (my !== latestRequested) return;
    console.error(err);
    setStatus('Fehler bei der Berechnung: ' + err.message.split('\n')[0], 'err');
  } finally {
    if (my === latestRequested) $('busy').hidden = true;
  }
}

function setButtons(on) {
  for (const id of ['dlAll', 'dlA', 'dlB', 'dlTest']) $(id).disabled = !on;
}

function baseName(o) {
  const pr = CELL_PRESETS.find(c => c.id === state.preset);
  const cell = pr && pr.id !== 'custom' ? pr.name.split(' (')[0].replace(/\s+/g, '-') : `${o.cellD}mm`;
  return `Zellenhalter_${o.s}S${o.p}P_${cell}_${o.layout === 'hex' ? 'Wabe' : 'Raster'}`;
}

function buildStlList(r) {
  const box = $('stlList');
  box.innerHTML = '';
  for (const pc of r.pieces) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '⬇ ' + pc.name + '.stl';
    b.addEventListener('click', () => {
      const fn = `${baseName(r.options)}_${pc.name.replace(/[^\wäöüÄÖÜß]+/g, '_')}.stl`;
      download(makeSTL(pc), fn, 'model/stl');
    });
    box.appendChild(b);
  }
}

function export3MF(filter, suffix) {
  if (!lastResult) return;
  const o = lastResult.options;
  const pieces = lastResult.pieces.filter(filter);
  const data = make3MF(pieces, { bedW: o.bedW, bedD: o.bedD, title: `Zellenhalter ${o.s}S${o.p}P` });
  download(data, `${baseName(o)}${suffix}.3mf`, 'model/3mf');
}
$('dlAll').addEventListener('click', () => export3MF(() => true, ''));
$('dlA').addEventListener('click', () => export3MF(p => p.side === 'A', '_A'));
$('dlB').addEventListener('click', () => export3MF(p => p.side === 'B', '_B'));
$('dlTest').addEventListener('click', async () => {
  const o = { ...geometryOptions(state), s: 2, p: 2, splitX: 0, splitY: 0 };
  setStatus('Berechne Passungstest …');
  try {
    const r = await compute(o);
    const data = make3MF(r.pieces.filter(p => p.side === 'A'), { bedW: o.bedW, bedD: o.bedD, title: 'Passungstest 2x2' });
    download(data, `Passungstest_2x2_Spiel-${o.tol}mm.3mf`, 'model/3mf');
    setStatus('Passungstest heruntergeladen.');
  } catch (err) {
    setStatus('Fehler: ' + err.message.split('\n')[0], 'err');
  }
});

// ---------------------------------------------------------------- Start
writeForm();
onChange();
