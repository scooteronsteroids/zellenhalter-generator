import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { CELL_PRESETS, PRINTERS } from './cells.js';
import { DEFAULTS, derive } from './geometry.js';
import { make3MF, makeSTL, download, inSandbox } from './export.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'zellenhalter-settings-v2';
const PETG_DENSITY = 1.27; // g/cm³
const CHARGE_V = 4.2;      // Ladeschlussspannung je Zelle

// ================================================================ Zustand
const FIELD_IDS = ['cellD', 'cellLen', 'cellCap', 'cellI', 'cellW', 'cellV', 's', 'p', 'tol', 'wall',
  'border', 'height', 'lipT', 'lipW', 'chamfer', 'splitX', 'splitY'];
const P45B = CELL_PRESETS.find(c => c.id === 'p45b');
const INITIAL = {
  preset: 'p45b', printer: 'p1s', layout: DEFAULTS.layout, outline: DEFAULTS.outline,
  vents: DEFAULTS.vents, markers: DEFAULTS.markers,
  cellD: P45B.d, cellLen: P45B.len, cellCap: P45B.cap, cellI: P45B.i, cellW: P45B.w, cellV: P45B.v,
  s: 13, p: 4, tol: DEFAULTS.tol, wall: DEFAULTS.wall, border: DEFAULTS.border, height: DEFAULTS.height,
  lipT: DEFAULTS.lipT, lipW: DEFAULTS.lipW, chamfer: DEFAULTS.chamfer, splitX: 0, splitY: 0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const st = { ...INITIAL, ...JSON.parse(raw) };
      if (!CELL_PRESETS.some(c => c.id === st.preset)) st.preset = 'custom';
      if (!PRINTERS.some(p => p.id === st.printer)) st.printer = INITIAL.printer;
      return st;
    }
  } catch (e) { /* Speicher nicht verfügbar */ }
  return { ...INITIAL };
}
function saveState(st) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) { /* egal */ }
}
let state = loadState();

// ================================================================ Formular
const fmt = (v, d = 1) => Number.isFinite(v)
  ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';

const presetSel = $('preset');
{
  const groups = new Map();
  for (const c of CELL_PRESETS) {
    const key = c.fmt === 'manuell' ? 'Sonstiges' : c.fmt;
    if (!groups.has(key)) {
      const og = document.createElement('optgroup');
      og.label = key;
      groups.set(key, og);
      presetSel.appendChild(og);
    }
    groups.get(key).appendChild(new Option(c.fmt === 'manuell' || c.name.startsWith('Generisch') ? `${c.name}${c.fmt !== 'manuell' ? ' ' + c.fmt : ''}` : c.name, c.id));
  }
}
const printerSel = $('printer');
for (const p of PRINTERS) printerSel.add(new Option(p.name, p.id));

const VOLT_CHIPS = [[10, 36], [12, 44], [13, 48], [14, 52], [16, 60], [20, 72], [22, 84]];
for (const [s, v] of VOLT_CHIPS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = `${s}S · ${v} V`; b.dataset.s = s;
  b.title = `${s} Zellen in Reihe = ${v} V Nennspannung`;
  b.addEventListener('click', () => { $('s').value = s; onChange(); });
  $('voltChips').appendChild(b);
}

document.querySelectorAll('.stp').forEach(btn => btn.addEventListener('click', () => {
  const inp = $(btn.dataset.target);
  const v = (parseInt(inp.value, 10) || 0) + +btn.dataset.d;
  inp.value = Math.min(+inp.max, Math.max(+inp.min, v));
  onChange();
}));

function writeForm() {
  presetSel.value = state.preset;
  printerSel.value = state.printer;
  for (const id of FIELD_IDS) $(id).value = state[id] ?? '';
  document.querySelector(`input[name=layout][value=${state.layout}]`).checked = true;
  $('outline').value = state.outline;
  $('vents').checked = state.vents;
  $('markers').checked = state.markers;
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

presetSel.addEventListener('change', () => {
  const pr = CELL_PRESETS.find(c => c.id === presetSel.value);
  if (pr && pr.id !== 'custom') {
    $('cellD').value = pr.d; $('cellLen').value = pr.len; $('cellCap').value = pr.cap;
    $('cellI').value = pr.i ?? ''; $('cellW').value = pr.w; $('cellV').value = pr.v;
  } else {
    $('cellDetails').open = true;
  }
  onChange();
});
// Manuelle Änderung der Zellmaße -> "Eigene Zelle"
for (const id of ['cellD', 'cellLen']) $(id).addEventListener('input', () => { presetSel.value = 'custom'; });
$('panel').addEventListener('input', (e) => { if (e.target !== presetSel) onChange(); });
$('panel').addEventListener('change', (e) => { if (e.target !== presetSel && e.target.type !== 'number') onChange(); });
$('reset').addEventListener('click', () => { state = { ...INITIAL }; writeForm(); onChange(); });

// ================================================================ Optionen für die Geometrie
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
    layout: st.layout === 'hex' ? 'hex' : 'grid',
    wall: n(st.wall, DEFAULTS.wall, 0.4, 10),
    border: n(st.border, DEFAULTS.border, 1, 20),
    height,
    lipT: n(st.lipT, DEFAULTS.lipT, 0.6, Math.max(0.6, height - 1.5)),
    lipW: n(st.lipW, DEFAULTS.lipW, 0.5, 8),
    outline: st.outline === 'rect' ? 'rect' : 'contour',
    chamfer: n(st.chamfer, DEFAULTS.chamfer, 0, 3),
    vents: !!st.vents,
    markers: !!st.markers,
    splitX: clampInt(st.splitX, 0, 30, 0),
    splitY: clampInt(st.splitY, 0, 40, 0),
    bedW: pr.w, bedD: pr.d,
  };
}

// ================================================================ Worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map();
worker.onmessage = (ev) => {
  const cb = pending.get(ev.data.id);
  if (cb) { pending.delete(ev.data.id); cb(ev.data); }
};
worker.onerror = (e) => setStatus('Die Geometrie-Engine konnte nicht geladen werden. Seite neu laden. (' + (e.message || 'Worker-Fehler') + ')', 'err');
function compute(options) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, (msg) => msg.ok ? resolve(msg.result) : reject(new Error(msg.error)));
    worker.postMessage({ id, options });
  });
}

// ================================================================ 3D-Ansicht
const wrap = $('canvasWrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
wrap.prepend(renderer.domElement);
const scene = new THREE.Scene();
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}
const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(250, -350, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.95;

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(180, -260, 420);
scene.add(key);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

const grid = new THREE.GridHelper(2000, 200);
grid.rotation.x = Math.PI / 2;
grid.material.transparent = true;
grid.material.opacity = 0.5;
grid.position.z = -0.3;
scene.add(grid);
function applyThemeToScene() {
  const cs = getComputedStyle(document.documentElement);
  const line = new THREE.Color(cs.getPropertyValue('--line').trim() || '#d5dbe1');
  grid.material.color = line;
  grid.material.vertexColors = false;
  grid.material.needsUpdate = true;
}
applyThemeToScene();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeToScene);
new MutationObserver(applyThemeToScene).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const content = new THREE.Group();
scene.add(content);

const COL_A = 0x3459d6, COL_B = 0xe28a2b;
const MAT_A = new THREE.MeshStandardMaterial({ color: COL_A, roughness: 0.62, metalness: 0.0, flatShading: true });
const MAT_B = new THREE.MeshStandardMaterial({ color: COL_B, roughness: 0.62, metalness: 0.0, flatShading: true });
const MAT_CELL = new THREE.MeshStandardMaterial({ color: 0x2f8f7a, roughness: 0.35, metalness: 0.05 });
const MAT_PLUS = new THREE.MeshStandardMaterial({ color: 0xd2362c, roughness: 0.35, metalness: 0.2 });
const MAT_MINUS = new THREE.MeshStandardMaterial({ color: 0xc3c9cf, roughness: 0.25, metalness: 0.85 });
const MAT_BED = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.9, metalness: 0.1 });
const MAT_BED_EDGE = new THREE.LineBasicMaterial({ color: 0x8a94a3 });

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(wrap);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

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
function addBed(w, d) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, d, 1.5), MAT_BED);
  plate.position.z = -0.8;
  plate.userData.noFit = true;
  content.add(plate);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), MAT_BED_EDGE);
  edge.position.z = 0.01;
  edge.userData.noFit = true;
  content.add(edge);
}

let lastResult = null;
let lastOptions = null;
let needFit = true;
const currentView = () => document.querySelector('input[name=view]:checked').value;
const sw = (c) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`;

function render() {
  clearContent();
  if (!lastResult) return;
  const view = currentView();
  const r = lastResult;
  const o = r.options;
  const nx = r.split.nx, ny = r.split.ny;
  const gap = 10; // Abstand zwischen Teilen in der Druckansicht

  if (view === 'A' || view === 'B') {
    for (const pc of r.pieces.filter(p => p.side === view)) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), view === 'A' ? MAT_A : MAT_B);
      const a = pc.index % nx, b = Math.floor(pc.index / nx);
      const sx = view === 'B' ? -1 : 1; // B ist gespiegelt
      mesh.position.set(sx * (a - (nx - 1) / 2) * gap, (b - (ny - 1) / 2) * gap, 0);
      content.add(mesh);
    }
    if (nx * ny === 1) addBed(o.bedW, o.bedD);
    $('legend').innerHTML = view === 'A'
      ? `${sw(COL_A)}Halter A (unten) · so wie er gedruckt wird${nx * ny === 1 ? ' · dunkle Fläche = Druckbett' : ` · ${nx * ny} Teile`}`
      : `${sw(COL_B)}Halter B (oben) · gespiegelt, wird beim Zusammenbau umgedreht`;
  } else {
    const d = derive(o);
    const lipT = r.lipT;
    const zTop = lipT + o.cellLen + lipT;
    for (const pc of r.pieces) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), pc.side === 'A' ? MAT_A : MAT_B);
      // B wurde an X gespiegelt gedruckt -> 180° um die Y-Achse drehen
      if (pc.side === 'B') { mesh.scale.set(-1, 1, -1); mesh.position.z = zTop; }
      content.add(mesh);
    }
    const n = d.cells.length;
    const rC = o.cellD / 2;
    const bodyGeo = new THREE.CylinderGeometry(rC, rC, o.cellLen - 1.2, 40);
    bodyGeo.rotateX(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(rC * 0.96, rC * 0.96, 0.6, 40);
    capGeo.rotateX(Math.PI / 2);
    const nubGeo = new THREE.CylinderGeometry(rC * 0.34, rC * 0.34, 1.0, 24);
    nubGeo.rotateX(Math.PI / 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, MAT_CELL, n);
    const plusUp = [], minusUp = [];
    const m = new THREE.Matrix4();
    d.cells.forEach((c, k) => {
      m.makeTranslation(c.x, c.y, lipT + o.cellLen / 2);
      bodies.setMatrixAt(k, m);
      // gerade Reihen: Pluspol zeigt nach unten in Halter A
      (c.j % 2 === 0 ? minusUp : plusUp).push(c);
    });
    content.add(bodies);
    const zTopCap = lipT + o.cellLen - 0.3, zBotCap = lipT + 0.3;
    const addCaps = (list, z, mat, geo) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((c, k) => { m.makeTranslation(c.x, c.y, z); im.setMatrixAt(k, m); });
      content.add(im);
    };
    addCaps(plusUp, zTopCap, MAT_PLUS, capGeo);
    addCaps(plusUp, zTopCap + 0.6, MAT_PLUS, nubGeo);
    addCaps(minusUp, zTopCap, MAT_MINUS, capGeo);
    addCaps(minusUp, zBotCap, MAT_PLUS, capGeo);
    addCaps(plusUp, zBotCap, MAT_MINUS, capGeo);
    $('legend').innerHTML = `${sw(COL_A)}Halter A ${sw(COL_B)}Halter B ${sw(0xd2362c)}Pluspol ${sw(0xc3c9cf)}Minuspol`;
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
  const fov = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitH = radius / Math.sin(fov);
  const fitW = radius / Math.sin(Math.atan(Math.tan(fov) * camera.aspect));
  const dist = Math.max(fitH, fitW) * 0.82;
  const dir = new THREE.Vector3(0.42, -0.78, 0.82).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(0.5, dist / 100); camera.far = dist * 30;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}
$('fit').addEventListener('click', fitView);
document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => { needFit = true; render(); }));

// ================================================================ Querschnitt-Zeichnung
function drawSection(o) {
  const d = derive(o);
  const H = o.height, lipT = Math.min(o.lipT, H - 1);
  const ch = (o.chamfer > 0 && o.wall > 0.45) ? Math.min(o.chamfer, H - lipT - 0.4, Math.max(0, (o.wall - 0.4) / 2)) : 0;
  const R = d.R, L = d.lipR, b = o.border, wr = o.wall / 2;
  const above = Math.min(6, H * 0.6); // Zelle ragt oben heraus
  const W = 320, Hh = 150, padL = 44, padR = 16, padT = 26, padB = 30;
  const k = Math.min((W - padL - padR) / (R + b + R + wr), (Hh - padT - padB) / (H + above));
  const x0 = padL + (R + b) * k;              // Zellachse
  const yb = Hh - padB;                        // Unterseite (Druckbett)
  const X = (x) => (x0 + x * k).toFixed(1);
  const Y = (z) => (yb - z * k).toFixed(1);
  const left = [[-R - b, 0], [-L, 0], [-L, lipT], [-R, lipT], [-R, H - ch], [-R - ch, H], [-R - b, H]];
  const right = [[R + wr, 0], [L, 0], [L, lipT], [R, lipT], [R, H - ch], [R + ch, H], [R + wr, H]];
  const poly = (pts) => pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ');
  const rc = o.cellD / 2;
  const t = (x, y, s, anchor = 'middle') => `<text class="sx-txt" x="${x}" y="${y}" text-anchor="${anchor}">${s}</text>`;
  const arrow = (xa, xb, y) => `<path class="sx-dim" d="M${xa},${y} H${xb} M${xa},${y - 3} v6 M${xb},${y - 3} v6"/>`;
  $('sectionSvg').innerHTML = [
    `<line class="sx-axis" x1="${X(0)}" y1="${padT - 14}" x2="${X(0)}" y2="${yb + 6}"/>`,
    `<rect class="sx-cell" x="${X(-rc)}" y="${Y(H + above)}" width="${(2 * rc * k).toFixed(1)}" height="${((H + above - lipT) * k).toFixed(1)}"/>`,
    `<polygon class="sx-mat" points="${poly(left)}"/>`,
    `<polygon class="sx-mat" points="${poly(right)}"/>`,
    arrow(+X(-R), +X(R), padT - 12),
    t(X(0), padT - 16, `Bohrung Ø ${fmt(d.holeD, 2)}`),
    arrow(+X(-L), +X(L), yb + 12),
    t(X(0), yb + 25, `Lippe Ø ${fmt(2 * L, 1)}`),
    `<path class="sx-dim" d="M${padL - 16},${Y(0)} V${Y(H)} M${padL - 19},${Y(0)} h6 M${padL - 19},${Y(H)} h6"/>`,
    t(padL - 22, (+Y(H) + +Y(0)) / 2 + 3, fmt(H, 1), 'end'),
    t(+X(R + wr) + 4, +Y(lipT / 2) + 3, `${fmt(lipT, 1)}`, 'start'),
  ].join('');
}

// ================================================================ Anzeigen
function cellLabel() {
  const pr = CELL_PRESETS.find(c => c.id === state.preset);
  if (!pr || pr.id === 'custom') return `Eigene Zelle Ø ${fmt(state.cellD, 1)} mm`;
  return pr.name.startsWith('Generisch') ? `${pr.fmt}-Zelle` : pr.name;
}

function renderPack(st, o) {
  const v = Number.isFinite(st.cellV) ? st.cellV : 3.6;
  const cap = st.cellCap, I = st.cellI, w = st.cellW;
  const n = o.s * o.p;
  $('plConf').textContent = `${o.s}S${o.p}P`;
  $('plSub').textContent = `${n} Zellen · ${cellLabel()}`;
  const stat = (k, val, unit) => `<div><dt>${k}</dt><dd>${val}<small>${unit}</small></dd></div>`;
  const has = (x) => Number.isFinite(x) && x > 0;
  $('plStats').innerHTML = [
    stat('Spannung', fmt(o.s * v), 'V'),
    stat('Voll geladen', fmt(o.s * CHARGE_V), 'V'),
    stat('Kapazität', has(cap) ? fmt(o.p * cap) : '–', 'Ah'),
    stat('Energie', has(cap) ? fmt(n * v * cap, 0) : '–', 'Wh'),
    stat('Dauerstrom', has(I) ? fmt(o.p * I, 0) : '–', 'A'),
    stat('Leistung', has(I) ? fmt(o.p * I * o.s * v / 1000, 1) : '–', 'kW'),
    stat('Zellgewicht', has(w) ? fmt(n * w / 1000, 2) : '–', 'kg'),
  ].join('');

  const pr = CELL_PRESETS.find(c => c.id === st.preset);
  const note = pr && pr.note;
  $('presetNote').hidden = !note;
  $('presetNote').textContent = note ? note + '.' : '';
  $('cellSum').textContent = `Ø ${fmt(o.cellD, 2)} mm · ${fmt(o.cellLen, 1)} mm · ${has(cap) ? fmt(cap, 1) + ' Ah' : '– Ah'} · ${has(I) ? fmt(I, 0) + ' A' : '– A'} · ${has(w) ? fmt(w, 0) + ' g' : '– g'}`;
  document.querySelectorAll('#voltChips button').forEach(b => b.classList.toggle('on', +b.dataset.s === o.s));
}

function renderHolder(st, o, r) {
  const d = derive(o);
  const hints = [];
  if (o.layout === 'hex' && o.vents) hints.push('Im Wabenmuster ist zwischen den Zellen zu wenig Platz für Lüftungslöcher.');
  if (o.markers && o.border < 2) hints.push('Für die +/− Markierung wird der Rand an den Reihenenden automatisch verbreitert.');
  if (r && r.chamferEff < o.chamfer - 1e-6) hints.push(`Die Fase wurde auf ${fmt(r.chamferEff, 1)} mm reduziert, damit oben zwischen den Zellen noch Wand bleibt.`);
  if (o.wall < 0.8) hints.push('Wände unter 0,8 mm sind mit einer 0,4-mm-Düse kaum druckbar.');
  $('holderHint').textContent = hints.join(' ');

  if (!r) return;
  const nPieces = r.split.nx * r.split.ny;
  const volAll = r.pieces.reduce((s, p) => s + p.volume, 0);
  const dims = r.pieces.filter(p => p.side === 'A').map(p => [p.bounds.max[0] - p.bounds.min[0], p.bounds.max[1] - p.bounds.min[1]]);
  const big = dims.reduce((a, b) => (a[0] * a[1] >= b[0] * b[1] ? a : b));
  const rows = [
    ['Außenmaß', `${fmt(r.size[0])} × ${fmt(r.size[1])} × ${fmt(r.size[2])} mm`],
    ['Akkublock (ohne Strips)', `${fmt(r.size[0])} × ${fmt(r.size[1])} × ${fmt(o.cellLen + 2 * r.lipT)} mm`],
    ['Zellbohrung / Lippe', `Ø ${fmt(d.holeD, 2)} / Ø ${fmt(d.lipR * 2, 1)} mm`],
    ['Zellabstand Mitte–Mitte', `${fmt(d.pitch, 2)} mm`],
    ['Teile je Halter', nPieces === 1 ? '1 · am Stück' : `${nPieces} · ${r.split.nx} × ${r.split.ny}`],
    ['Größtes Teil', `${fmt(big[0])} × ${fmt(big[1])} mm`, !r.split.allFit],
    ['Filament A + B (PETG)', `≈ ${fmt(volAll / 1000 * PETG_DENSITY, 0)} g bei 100 %`],
  ];
  $('holderInfo').innerHTML = rows.map(([k, val, warn]) => `<dt>${k}</dt><dd class="${warn ? 'warn' : ''}">${val}</dd>`).join('');
}

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

// ================================================================ Neu berechnen
let timer = null;
let latestRequested = 0;

function onChange() {
  state = readForm();
  saveState(state);
  const o = geometryOptions(state);
  renderPack(state, o);
  drawSection(o);
  renderHolder(state, o, null);
  clearTimeout(timer);
  timer = setTimeout(() => regenerate(o), 280);
}

async function regenerate(o) {
  const my = ++latestRequested;
  $('busy').hidden = false;
  setStatus('Berechne Modell …', 'busy-s');
  setButtons(false);
  try {
    const sameShape = lastOptions && lastOptions.s === o.s && lastOptions.p === o.p &&
      lastOptions.layout === o.layout && lastOptions.bedW === o.bedW;
    const r = await compute(o);
    if (my !== latestRequested) return; // veraltet
    lastResult = r; lastOptions = o;
    if (!sameShape) needFit = true;
    render();
    renderHolder(state, o, r);
    const nPieces = r.split.nx * r.split.ny;
    if (!r.split.allFit) {
      setStatus(`Mindestens ein Teil ist größer als das Druckbett (${o.bedW} × ${o.bedD} mm). Teilung erhöhen oder größeren Drucker wählen.`, 'warn');
    } else {
      setStatus(`${o.s}S${o.p}P · ${nPieces === 1 ? 'passt am Stück aufs Bett' : `${nPieces} Teile je Halter`} · ${fmt(r.ms / 1000, 1)} s`);
    }
    buildStlList(r);
    setButtons(true);
  } catch (err) {
    if (my !== latestRequested) return;
    console.error(err);
    setStatus('Berechnung fehlgeschlagen: ' + err.message.split('\n')[0], 'err');
  } finally {
    if (my === latestRequested) $('busy').hidden = true;
  }
}

function setButtons(on) {
  for (const id of ['dlAll', 'dlA', 'dlB', 'dlTest']) $(id).disabled = !on;
}

// ================================================================ Export
function baseName(o) {
  const pr = CELL_PRESETS.find(c => c.id === state.preset);
  const cell = pr && pr.id !== 'custom'
    ? (pr.name.startsWith('Generisch') ? pr.fmt : pr.name.replace(/\s+/g, '-'))
    : `${o.cellD}mm`;
  return `Zellenhalter_${o.s}S${o.p}P_${cell}_${o.layout === 'hex' ? 'Wabe' : 'Raster'}`;
}

function buildStlList(r) {
  const box = $('stlList');
  box.innerHTML = '';
  for (const pc of r.pieces) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = pc.name + '.stl';
    b.addEventListener('click', () => {
      const fn = `${baseName(r.options)}_${pc.name.replace(/[^\wäöüÄÖÜß]+/g, '_')}.stl`;
      saveFile(makeSTL(pc), fn, 'model/stl');
    });
    box.appendChild(b);
  }
}

async function saveFile(data, filename, mime) {
  try {
    const res = await download(data, filename, mime);
    if (res === 'zipped') setStatus(`Als ZIP gespeichert: ${filename}`);
    else if (res === 'declined') setStatus('Speichern abgebrochen.');
    else setStatus(`Heruntergeladen: ${filename}`);
  } catch (err) {
    setStatus('Speichern nicht möglich: ' + err.message, 'err');
  }
}

function export3MF(filter, suffix) {
  if (!lastResult) return;
  const o = lastResult.options;
  const data = make3MF(lastResult.pieces.filter(filter), { bedW: o.bedW, bedD: o.bedD, title: `Zellenhalter ${o.s}S${o.p}P` });
  saveFile(data, `${baseName(o)}${suffix}.3mf`, 'model/3mf');
}
$('dlAll').addEventListener('click', () => export3MF(() => true, ''));
$('dlA').addEventListener('click', () => export3MF(p => p.side === 'A', '_A'));
$('dlB').addEventListener('click', () => export3MF(p => p.side === 'B', '_B'));
$('dlTest').addEventListener('click', async () => {
  const o = { ...geometryOptions(state), s: 2, p: 2, splitX: 0, splitY: 0 };
  setStatus('Berechne Passungstest …', 'busy-s');
  try {
    const r = await compute(o);
    const data = make3MF(r.pieces.filter(p => p.side === 'A'), { bedW: o.bedW, bedD: o.bedD, title: 'Passungstest 2x2' });
    await saveFile(data, `Passungstest_2x2_Spiel-${o.tol}mm.3mf`, 'model/3mf');
  } catch (err) {
    setStatus('Passungstest fehlgeschlagen: ' + err.message.split('\n')[0], 'err');
  }
});

// ================================================================ Start
writeForm();
onChange();
inSandbox().then(z => { $('zipHint').hidden = !z; });
