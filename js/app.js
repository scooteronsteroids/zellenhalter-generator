import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { PRINTERS, cellLabel } from './cells.js';
import { DEFAULTS, derive, effectiveLip, stripSegments, stripsEnabled, stripThickness } from './geometry.js';
import { make3MF, makeSTL, download, inSandbox } from './export.js';
import { allCells, getCell, saveCell, deleteCell, onCellsChange, initCellStore, storageInfo } from './cellstore.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'zellenhalter-settings-v3';
const PETG_DENSITY = 1.27; // g/cm³
const CHARGE_V = 4.2;      // Ladeschluss je Zelle

// ================================================================ Zustand
const NUM_FIELDS = ['s', 'p', 'nickel', 'copper', 'stripW', 'tol', 'height', 'wall', 'border', 'lipT', 'lipW', 'chamfer', 'splitX', 'splitY'];
const INITIAL = {
  cellId: 'p45b', printer: 'p1s', s: 13, p: 4,
  nickel: DEFAULTS.nickel, copper: DEFAULTS.copper, stripW: DEFAULTS.stripW,
  layout: DEFAULTS.layout, outline: DEFAULTS.outline, corners: DEFAULTS.corners, vents: DEFAULTS.vents, markers: DEFAULTS.markers,
  tol: DEFAULTS.tol, height: DEFAULTS.height, wall: DEFAULTS.wall, border: DEFAULTS.border,
  lipT: DEFAULTS.lipT, lipW: DEFAULTS.lipW, chamfer: DEFAULTS.chamfer, splitX: 0, splitY: 0,
};
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...INITIAL, ...JSON.parse(raw) };
  } catch (e) { /* Speicher nicht verfügbar */ }
  return { ...INITIAL };
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* egal */ }
}
let state = loadState();

const fmt = (v, d = 1) => Number.isFinite(v)
  ? v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
const has = (x) => Number.isFinite(x) && x > 0;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function currentCell() {
  return getCell(state.cellId) || getCell('p45b');
}

// ================================================================ Formular
const printerSel = $('printer');
for (const p of PRINTERS) printerSel.add(new Option(p.name, p.id));

for (const [s, v] of [[10, 36], [13, 48], [14, 52], [16, 60], [20, 72]]) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = `${v} V`; b.dataset.s = s;
  b.title = `${s}S = ${v} V Nennspannung`;
  b.addEventListener('click', () => { $('s').value = s; onChange(); });
  $('voltChips').appendChild(b);
}
document.querySelectorAll('.stp').forEach(btn => btn.addEventListener('click', () => {
  const inp = $(btn.dataset.target);
  inp.value = Math.min(+inp.max, Math.max(+inp.min, (parseInt(inp.value, 10) || 0) + +btn.dataset.d));
  onChange();
}));

function writeForm() {
  printerSel.value = state.printer;
  for (const id of NUM_FIELDS) $(id).value = state[id] ?? '';
  document.querySelector(`input[name=layout][value=${state.layout === 'hex' ? 'hex' : 'grid'}]`).checked = true;
  document.querySelector(`input[name=corners][value=${state.corners === 'sharp' ? 'sharp' : 'round'}]`).checked = true;
  $('outline').value = state.outline;
  $('vents').checked = state.vents;
  $('markers').checked = state.markers;
}
function readForm() {
  const st = { ...state };
  st.printer = printerSel.value;
  for (const id of NUM_FIELDS) { const v = parseFloat($(id).value); st[id] = Number.isFinite(v) ? v : null; }
  st.layout = document.querySelector('input[name=layout]:checked').value;
  st.corners = document.querySelector('input[name=corners]:checked').value;
  st.outline = $('outline').value;
  st.vents = $('vents').checked;
  st.markers = $('markers').checked;
  return st;
}
$('panel').addEventListener('input', onChange);
$('panel').addEventListener('change', (e) => { if (e.target.type !== 'number') onChange(); });
$('reset').addEventListener('click', () => { state = { ...INITIAL, cellId: state.cellId }; writeForm(); onChange(); });

// ================================================================ Optionen für die Geometrie
function geometryOptions(st) {
  const pr = PRINTERS.find(p => p.id === st.printer) || PRINTERS[2];
  const cell = currentCell();
  const n = (v, def, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  const int = (v, def, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def;
  const height = n(st.height, DEFAULTS.height, 3, 40);
  return {
    s: int(st.s, 13, 1, 40), p: int(st.p, 4, 1, 30),
    cellD: n(+cell.d, 21.7, 8, 60), cellLen: n(+cell.len, 70, 20, 200),
    nickel: n(st.nickel, 0, 0, 3), copper: n(st.copper, 0, 0, 3), stripW: n(st.stripW, 0, 0, 20),
    tol: n(st.tol, DEFAULTS.tol, 0, 2),
    layout: st.layout === 'hex' ? 'hex' : 'grid',
    wall: n(st.wall, DEFAULTS.wall, 0.4, 10),
    border: n(st.border, DEFAULTS.border, 1, 20),
    height,
    lipT: n(st.lipT, DEFAULTS.lipT, 0.6, Math.max(0.6, height - 1.5)),
    lipW: n(st.lipW, DEFAULTS.lipW, 0.5, 8),
    outline: st.outline === 'rect' ? 'rect' : 'contour',
    corners: st.corners === 'sharp' ? 'sharp' : 'round',
    chamfer: n(st.chamfer, DEFAULTS.chamfer, 0, 3),
    vents: !!st.vents, markers: !!st.markers,
    splitX: int(st.splitX, 0, 0, 30), splitY: int(st.splitY, 0, 0, 40),
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
worker.onerror = (e) => setStatus('Geometrie-Engine nicht geladen. Seite neu laden. (' + (e.message || 'Worker-Fehler') + ')', 'err');
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
wrap.prepend(renderer.domElement);
const scene = new THREE.Scene();
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}
const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.95;
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(180, -260, 420);
scene.add(key);
const rim = new THREE.DirectionalLight(0x59d6ff, 0.9);
rim.position.set(-300, 260, 120);
scene.add(rim);

const grid = new THREE.GridHelper(2000, 100, 0x1d4a66, 0x13222f);
grid.rotation.x = Math.PI / 2;
grid.position.z = -1.6;
grid.material.transparent = true; grid.material.opacity = 0.7;
scene.add(grid);

const content = new THREE.Group();
scene.add(content);

const COL = { A: 0x5fb4ff, B: 0xa58cff, cell: 0x1c2a3c, pos: 0xff5a4e, neg: 0xc9d1d9, ni: 0xc4ccd4, cu: 0xe0884f };
const mat = (color, rough, metal, flat = false) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat });
const MAT = {
  A: mat(COL.A, 0.5, 0.05, true), B: mat(COL.B, 0.5, 0.05, true),
  cell: mat(COL.cell, 0.35, 0.3), pos: mat(COL.pos, 0.35, 0.2), neg: mat(COL.neg, 0.25, 0.85),
  ni: mat(COL.ni, 0.3, 0.9), cu: mat(COL.cu, 0.3, 0.85),
  bed: mat(0x10161d, 0.85, 0.2),
};
const MAT_BED_EDGE = new THREE.LineBasicMaterial({ color: 0x2c6f96 });

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
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, d, 1.5), MAT.bed);
  plate.position.z = -0.8;
  plate.userData.noFit = true;
  content.add(plate);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), MAT_BED_EDGE);
  edge.position.z = 0.02;
  edge.userData.noFit = true;
  content.add(edge);
}
// Streifen als flache Quader (eine Instanz je Abschnitt)
function addStrips(segs, w, z0, t, material) {
  if (!segs.length || t <= 0) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geo, material, segs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  segs.forEach((sg, k) => {
    const dx = sg.b.x - sg.a.x, dy = sg.b.y - sg.a.y;
    const len = Math.hypot(dx, dy) + w;
    q.setFromAxisAngle(zAxis, Math.atan2(dy, dx));
    m.compose(new THREE.Vector3((sg.a.x + sg.b.x) / 2, (sg.a.y + sg.b.y) / 2, z0 + t / 2), q, new THREE.Vector3(len, w, t));
    im.setMatrixAt(k, m);
  });
  content.add(im);
}

let lastResult = null, lastOptions = null, needFit = true;
const currentView = () => document.querySelector('input[name=view]:checked').value;
const sw = (c, label) => `<span><i style="background:#${c.toString(16).padStart(6, '0')}"></i>${label}</span>`;

function render() {
  clearContent();
  if (!lastResult) return;
  const view = currentView();
  const r = lastResult, o = r.options;
  const nx = r.split.nx, ny = r.split.ny;

  if (view === 'A' || view === 'B') {
    const gap = 10;
    for (const pc of r.pieces.filter(p => p.side === view)) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), MAT[view]);
      const a = pc.index % nx, b = Math.floor(pc.index / nx);
      const sx = view === 'B' ? -1 : 1; // B ist gespiegelt
      mesh.position.set(sx * (a - (nx - 1) / 2) * gap, (b - (ny - 1) / 2) * gap, 0);
      content.add(mesh);
    }
    if (nx * ny === 1) addBed(o.bedW, o.bedD);
    $('legend').innerHTML = (view === 'A' ? sw(COL.A, 'Halter A · unten') : sw(COL.B, 'Halter B · oben, gespiegelt gedruckt'))
      + `<span>${nx * ny === 1 ? 'auf dem Druckbett, Lippe unten' : `${nx * ny} Teile`}</span>`;
  } else {
    const d = derive(o);
    const lipT = r.lipT, zTop = lipT + o.cellLen + lipT;
    for (const pc of r.pieces) {
      const mesh = new THREE.Mesh(pieceGeometry(pc), MAT[pc.side]);
      // B wurde an X gespiegelt gedruckt -> 180° um die Y-Achse drehen
      if (pc.side === 'B') { mesh.scale.set(-1, 1, -1); mesh.position.z = zTop; }
      content.add(mesh);
    }
    const rC = o.cellD / 2;
    const bodyGeo = new THREE.CylinderGeometry(rC, rC, o.cellLen - 1.2, 40).rotateX(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(rC * 0.96, rC * 0.96, 0.6, 40).rotateX(Math.PI / 2);
    const nubGeo = new THREE.CylinderGeometry(rC * 0.34, rC * 0.34, 0.8, 24).rotateX(Math.PI / 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, MAT.cell, d.cells.length);
    const plusUp = [], minusUp = [];
    const m = new THREE.Matrix4();
    d.cells.forEach((c, k) => {
      m.makeTranslation(c.x, c.y, lipT + o.cellLen / 2);
      bodies.setMatrixAt(k, m);
      (c.j % 2 === 0 ? minusUp : plusUp).push(c); // gerade Reihen: Plus zeigt nach unten in A
    });
    content.add(bodies);
    const zT = lipT + o.cellLen - 0.3, zB = lipT + 0.3;
    const caps = (list, z, mt, geo) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mt, list.length);
      list.forEach((c, k) => { m.makeTranslation(c.x, c.y, z); im.setMatrixAt(k, m); });
      content.add(im);
    };
    caps(plusUp, zT, MAT.pos, capGeo); caps(minusUp, zT, MAT.neg, capGeo);
    caps(minusUp, zB, MAT.pos, capGeo); caps(plusUp, zB, MAT.neg, capGeo);
    if (stripsEnabled(o)) {
      // Nickel liegt auf dem Pol, Kupfer darüber; unten bei A nach unten, oben bei B nach oben
      const w = o.stripW;
      const segA = stripSegments(o, d, 'A'), segB = stripSegments(o, d, 'B');
      addStrips(segA, w, lipT - o.nickel, o.nickel, MAT.ni);
      addStrips(segA, w, lipT - o.nickel - o.copper, o.copper, MAT.cu);
      addStrips(segB, w, zTop - lipT, o.nickel, MAT.ni);
      addStrips(segB, w, zTop - lipT + o.nickel, o.copper, MAT.cu);
    } else {
      caps(plusUp, zT + 0.6, MAT.pos, nubGeo);
    }
    $('legend').innerHTML = sw(COL.A, 'Halter A') + sw(COL.B, 'Halter B') + sw(COL.pos, 'Pluspol') + sw(COL.neg, 'Minuspol')
      + (stripsEnabled(o) ? sw(COL.ni, 'Nickel') + (o.copper > 0 ? sw(COL.cu, 'Kupfer') : '') : '');
  }
  if (needFit) { fitView(); needFit = false; }
}

function fitView() {
  const box = new THREE.Box3();
  for (const child of content.children) if (!child.userData.noFit) box.expandByObject(child);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = size.length() / 2;
  const fov = THREE.MathUtils.degToRad(camera.fov / 2);
  const dist = Math.max(radius / Math.sin(fov), radius / Math.sin(Math.atan(Math.tan(fov) * camera.aspect))) * 0.8;
  camera.position.copy(center).addScaledVector(new THREE.Vector3(0.45, -0.78, 0.78).normalize(), dist);
  camera.near = Math.max(0.5, dist / 100); camera.far = dist * 30;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}
$('fit').addEventListener('click', fitView);
document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => { needFit = true; render(); }));

// ================================================================ Querschnitt
function drawSection(o) {
  const d = derive(o);
  const H = o.height, lipT = effectiveLip(o);
  const ch = (o.chamfer > 0 && o.wall > 0.45) ? Math.min(o.chamfer, H - lipT - 0.4, Math.max(0, (o.wall - 0.4) / 2)) : 0;
  const R = d.R, L = d.lipR, b = o.border, wr = o.wall / 2;
  const above = Math.min(6, H * 0.6);
  const W = 320, Hh = 150, padL = 44, padR = 16, padT = 26, padB = 30;
  const k = Math.min((W - padL - padR) / (R + b + R + wr), (Hh - padT - padB) / (H + above));
  const x0 = padL + (R + b) * k, yb = Hh - padB;
  const X = (x) => (x0 + x * k).toFixed(1), Y = (z) => (yb - z * k).toFixed(1);
  const poly = (pts) => pts.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ');
  const left = [[-R - b, 0], [-L, 0], [-L, lipT], [-R, lipT], [-R, H - ch], [-R - ch, H], [-R - b, H]];
  const right = [[R + wr, 0], [L, 0], [L, lipT], [R, lipT], [R, H - ch], [R + ch, H], [R + wr, H]];
  const rc = o.cellD / 2;
  const t = (x, y, s, a = 'middle') => `<text class="sx-txt" x="${x}" y="${y}" text-anchor="${a}">${s}</text>`;
  const arrow = (xa, xb, y) => `<path class="sx-dim" d="M${xa},${y} H${xb} M${xa},${y - 3} v6 M${xb},${y - 3} v6"/>`;
  let strip = '';
  if (stripsEnabled(o)) {
    const hw = Math.min(o.stripW / 2, rc);
    const ni = Math.max(o.nickel * k, 1), cu = o.copper > 0 ? Math.max(o.copper * k, 1) : 0;
    strip = `<rect class="sx-ni" x="${X(-hw)}" y="${(+Y(lipT)).toFixed(1)}" width="${(2 * hw * k).toFixed(1)}" height="${ni.toFixed(1)}"/>`
      + (cu ? `<rect class="sx-cu" x="${X(-hw)}" y="${(+Y(lipT) + ni).toFixed(1)}" width="${(2 * hw * k).toFixed(1)}" height="${cu.toFixed(1)}"/>` : '');
  }
  $('sectionSvg').innerHTML = [
    `<line class="sx-axis" x1="${X(0)}" y1="${padT - 14}" x2="${X(0)}" y2="${yb + 6}"/>`,
    `<rect class="sx-cell" x="${X(-rc)}" y="${Y(H + above)}" width="${(2 * rc * k).toFixed(1)}" height="${((H + above - lipT) * k).toFixed(1)}"/>`,
    `<polygon class="sx-mat" points="${poly(left)}"/>`, `<polygon class="sx-mat" points="${poly(right)}"/>`,
    strip,
    arrow(+X(-R), +X(R), padT - 12), t(X(0), padT - 16, `Bohrung Ø ${fmt(d.holeD, 2)}`),
    arrow(+X(-L), +X(L), yb + 12), t(X(0), yb + 25, `Lippe Ø ${fmt(2 * L, 1)}`),
    `<path class="sx-dim" d="M${padL - 16},${Y(0)} V${Y(H)} M${padL - 19},${Y(0)} h6 M${padL - 19},${Y(H)} h6"/>`,
    t(padL - 22, (+Y(H) + +Y(0)) / 2 + 3, fmt(H, 1), 'end'),
    t(+X(R + wr) + 4, +Y(lipT / 2) + 3, fmt(lipT, 2), 'start'),
  ].join('');
}

// ================================================================ Anzeigen
function renderCell() {
  const c = currentCell();
  $('cpName').textContent = cellLabel(c);
  $('cpSpec').textContent = [c.fmt, `Ø ${fmt(+c.d, 1)}`, has(+c.cap) ? `${fmt(+c.cap, 1)} Ah` : null, has(+c.i) ? `${fmt(+c.i, 0)} A` : null]
    .filter(Boolean).join(' · ');
  $('cellNote').hidden = !c.note;
  $('cellNote').textContent = c.note ? c.note + '.' : '';
}

function renderPack(o) {
  const c = currentCell();
  const v = has(+c.v) ? +c.v : 3.6, cap = +c.cap, I = +c.i, w = +c.w;
  const n = o.s * o.p;
  $('plConf').textContent = `${o.s}S${o.p}P`;
  $('plSub').textContent = `${n} Zellen · ${cellLabel(c)}`;
  const stat = (k, val, unit) => `<div><dt>${k}</dt><dd>${val}<small>${unit}</small></dd></div>`;
  $('plStats').innerHTML = [
    stat('Spannung', fmt(o.s * v), 'V'),
    stat('Voll', fmt(o.s * CHARGE_V), 'V'),
    stat('Kapazität', has(cap) ? fmt(o.p * cap) : '–', 'Ah'),
    stat('Energie', has(cap) ? fmt(n * v * cap, 0) : '–', 'Wh'),
    stat('Strom', has(I) ? fmt(o.p * I, 0) : '–', 'A'),
    stat('Leistung', has(I) ? fmt(o.p * I * o.s * v / 1000, 1) : '–', 'kW'),
    stat('Gewicht', has(w) ? fmt(n * w / 1000, 2) : '–', 'kg'),
  ].join('');
  document.querySelectorAll('#voltChips button').forEach(b => b.classList.toggle('on', +b.dataset.s === o.s));
}

function renderStrips(o) {
  const d = derive(o);
  if (!stripsEnabled(o)) {
    $('stripInfo').innerHTML = 'Ohne Kanäle. Für Kanäle Stärke und Breite eintragen.';
    return;
  }
  const t = stripThickness(o), lip = effectiveLip(o), recess = lip - t;
  const parts = [`Kanäle <b>${fmt(o.stripW + DEFAULTS.stripGap, 1)} mm</b> breit, <b>${fmt(lip, 2)} mm</b> tief`];
  parts.push(recess < 0.01 ? 'Streifen liegen bündig' : `Streifen liegen ${fmt(recess, 2)} mm versenkt`);
  let txt = parts.join(' · ') + '.';
  if (o.stripW + DEFAULTS.stripGap > d.rowPitch - 4) txt += ' Achtung: so breite Streifen lassen kaum Halt zwischen den Reihen.';
  if (o.stripW > d.lipR * 2) txt += ' Streifen breiter als die Lippenöffnung: die Zellen werden kaum noch gehalten.';
  $('stripInfo').innerHTML = txt;
}

function renderHolder(o, r) {
  const hints = [];
  if (o.layout === 'hex' && o.vents) hints.push('Im Wabenmuster ist kein Platz für Lüftungslöcher.');
  if (r && r.chamferEff < o.chamfer - 1e-6) hints.push(`Fase auf ${fmt(r.chamferEff, 1)} mm begrenzt, damit Wand bleibt.`);
  if (o.wall < 0.8) hints.push('Wände unter 0,8 mm sind mit 0,4-mm-Düse kaum druckbar.');
  $('holderHint').textContent = hints.join(' ');
  drawSection(o);
  if (!r) return;
  const d = derive(o);
  const nPieces = r.split.nx * r.split.ny;
  const volAll = r.pieces.reduce((s, p) => s + p.volume, 0);
  const dims = r.pieces.filter(p => p.side === 'A').map(p => [p.bounds.max[0] - p.bounds.min[0], p.bounds.max[1] - p.bounds.min[1]]);
  const big = dims.reduce((a, b) => (a[0] * a[1] >= b[0] * b[1] ? a : b));
  const items = [
    ['Akkublock', `${fmt(r.size[0], 0)} × ${fmt(r.size[1], 0)} × ${fmt(o.cellLen + 2 * r.lipT, 0)} mm`],
    ['Teile je Halter', nPieces === 1 ? '1 · am Stück' : `${nPieces} · größtes ${fmt(big[0], 0)} × ${fmt(big[1], 0)}`, !r.split.allFit],
    ['Bohrung', `Ø ${fmt(d.holeD, 2)} mm`],
    ['Filament A+B', `≈ ${fmt(volAll / 1000 * PETG_DENSITY, 0)} g PETG`],
  ];
  $('holderInfo').innerHTML = items.map(([k, v, w]) => `<div><dt>${k}</dt><dd class="${w ? 'warn' : ''}">${v}</dd></div>`).join('');
}

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

// ================================================================ Neu berechnen
let timer = null, latestRequested = 0;

function onChange() {
  state = readForm();
  saveState();
  const o = geometryOptions(state);
  renderCell();
  renderPack(o);
  renderStrips(o);
  renderHolder(o, null);
  clearTimeout(timer);
  timer = setTimeout(() => regenerate(o), 280);
}

async function regenerate(o) {
  const my = ++latestRequested;
  $('busy').hidden = false;
  setStatus('Berechne Modell …', 'busy-s');
  setButtons(false);
  try {
    const same = lastOptions && lastOptions.s === o.s && lastOptions.p === o.p && lastOptions.layout === o.layout && lastOptions.bedW === o.bedW;
    const r = await compute(o);
    if (my !== latestRequested) return;
    lastResult = r; lastOptions = o;
    if (!same) needFit = true;
    render();
    renderHolder(o, r);
    const nPieces = r.split.nx * r.split.ny;
    if (!r.split.allFit) setStatus(`Ein Teil ist größer als das Druckbett (${o.bedW} × ${o.bedD} mm). Teilung unter „Erweitert“ erhöhen.`, 'warn');
    else setStatus(`${o.s}S${o.p}P · ${nPieces === 1 ? 'passt am Stück' : `${nPieces} Teile je Halter`} · ${fmt(r.ms / 1000, 1)} s`);
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
function setButtons(on) { for (const id of ['dlAll', 'dlA', 'dlB', 'dlTest']) $(id).disabled = !on; }

// ================================================================ Export
function baseName(o) {
  const c = currentCell();
  const cell = (c.short || c.name).replace(/[^\wäöüÄÖÜß.-]+/g, '-').replace(/^-|-$/g, '');
  return `Zellenhalter_${o.s}S${o.p}P_${cell}`;
}
function buildStlList(r) {
  const box = $('stlList');
  box.innerHTML = '';
  for (const pc of r.pieces) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = pc.name + '.stl';
    b.addEventListener('click', () => saveFile(makeSTL(pc), `${baseName(r.options)}_${pc.name.replace(/[^\wäöüÄÖÜß]+/g, '_')}.stl`, 'model/stl'));
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
  saveFile(make3MF(lastResult.pieces.filter(filter), { bedW: o.bedW, bedD: o.bedD, title: `Zellenhalter ${o.s}S${o.p}P` }),
    `${baseName(o)}${suffix}.3mf`, 'model/3mf');
}
$('dlAll').addEventListener('click', () => export3MF(() => true, ''));
$('dlA').addEventListener('click', () => export3MF(p => p.side === 'A', '_A'));
$('dlB').addEventListener('click', () => export3MF(p => p.side === 'B', '_B'));
$('dlTest').addEventListener('click', async () => {
  const o = { ...geometryOptions(state), s: 2, p: 2, splitX: 0, splitY: 0 };
  setStatus('Berechne Passungstest …', 'busy-s');
  try {
    const r = await compute(o);
    await saveFile(make3MF(r.pieces.filter(p => p.side === 'A'), { bedW: o.bedW, bedD: o.bedD, title: 'Passungstest 2x2' }),
      `Passungstest_2x2_Spiel-${o.tol}mm.3mf`, 'model/3mf');
  } catch (err) {
    setStatus('Passungstest fehlgeschlagen: ' + err.message.split('\n')[0], 'err');
  }
});

// ================================================================ Zellen-Datenbank
const dlg = $('db');
let armedDelete = null;

function openDb() {
  renderDb();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeDb() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
$('openDb').addEventListener('click', openDb);
$('cellPick').addEventListener('click', openDb);
$('dbClose').addEventListener('click', closeDb);
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDb(); });

function useCell(id) {
  state.cellId = id;
  saveState();
  closeDb();
  onChange();
}

let dbFilter = 'all';
function renderDb() {
  const q = $('dbSearch').value.trim().toLowerCase();
  const cells = allCells().filter(c => {
    if (dbFilter === 'own' && c.builtin) return false;
    if (dbFilter === 'nkon' && !c.nkon) return false;
    if (dbFilter === '21700' || dbFilter === '18650') { if (c.fmt !== dbFilter) return false; }
    return !q || cellLabel(c).toLowerCase().includes(q);
  });
  const n = (v, d) => has(+v) ? fmt(+v, d) : '–';
  $('dbBody').innerHTML = cells.length ? cells.map(c => `
    <tr data-id="${esc(c.id)}" class="${c.id === state.cellId ? 'sel' : ''}">
      <td class="nm">${esc(c.name)}${c.short ? ` <span class="short">(${esc(c.short)})</span>` : ''}${c.builtin ? '' : '<span class="own">EIGENE</span>'}${c.nkon ? '<span class="nkon">NKON</span>' : ''}</td>
      <td>${esc(c.fmt)}</td>
      <td class="r">${n(c.d, 2)}</td><td class="r">${n(c.len, 1)}</td><td class="r">${n(c.cap, 2)}</td>
      <td class="r">${n(c.i, 0)}</td><td class="r">${n(c.w, 0)}</td>
      <td class="acts">${c.builtin
        ? `<button type="button" data-act="copy">Kopieren</button>`
        : `<button type="button" data-act="edit">Bearbeiten</button><button type="button" data-act="del">${armedDelete === c.id ? 'Wirklich?' : 'Löschen'}</button>`}</td>
    </tr>`).join('') : `<tr class="empty"><td colspan="8">Keine Zelle gefunden. Unten kannst du sie selbst anlegen.</td></tr>`;
  $('dbInfo').textContent = `${allCells().length} Zellen · Zeile anklicken, um sie zu verwenden. Eigene Zellen werden ${storageInfo() === 'konto' ? 'in deinem Konto' : 'in diesem Browser'} gespeichert.`;
  document.querySelectorAll('#dbFilters button').forEach(b => b.classList.toggle('on', b.dataset.f === dbFilter));
}
$('dbSearch').addEventListener('input', renderDb);
$('dbFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  dbFilter = b.dataset.f;
  renderDb();
});

$('dbBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr || !tr.dataset.id) return;
  const id = tr.dataset.id;
  const act = e.target.closest('button')?.dataset.act;
  const c = getCell(id);
  if (!c) return;
  if (act === 'copy' || act === 'edit') {
    fillForm(c, act === 'edit');
    return;
  }
  if (act === 'del') {
    if (armedDelete === id) {
      armedDelete = null;
      deleteCell(id);
      if (state.cellId === id) { state.cellId = 'p45b'; onChange(); }
    } else {
      armedDelete = id;
      renderDb();
    }
    return;
  }
  useCell(id);
});

function fillForm(c, editing) {
  $('cfId').value = editing ? c.id : '';
  $('cfName').value = editing ? c.name : `${cellLabel(c)} – eigene`;
  $('cfD').value = c.d ?? ''; $('cfLen').value = c.len ?? ''; $('cfCap').value = c.cap ?? '';
  $('cfI').value = c.i ?? ''; $('cfW').value = c.w ?? ''; $('cfV').value = c.v ?? 3.6;
  $('cfTitle').textContent = editing ? `„${c.name}“ bearbeiten` : 'Neue Zelle anlegen';
  $('cfName').focus();
}
function clearForm() {
  $('cellForm').reset();
  $('cfId').value = '';
  $('cfV').value = 3.6;
  $('cfTitle').textContent = 'Neue Zelle anlegen';
}
$('cfReset').addEventListener('click', clearForm);
$('cellForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (id) => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : null; };
  const id = saveCell({
    id: $('cfId').value || undefined, name: $('cfName').value.trim(),
    d: v('cfD'), len: v('cfLen'), cap: v('cfCap'), i: v('cfI'), w: v('cfW'), v: v('cfV'),
  });
  clearForm();
  useCell(id);
});

onCellsChange(() => { if (dlg.open) renderDb(); renderCell(); });

// ================================================================ Start
writeForm();
clearForm();
onChange();
initCellStore();
inSandbox().then(z => { $('zipHint').hidden = !z; });
