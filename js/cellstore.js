// © 2026 ScootersOnSteroids – Zellenhalter. Alle Rechte vorbehalten.
// Kopieren, Verändern oder Weiterverbreiten ohne schriftliche Erlaubnis ist untersagt. Siehe LICENSE.
// Zell-Datenbank: eingebaute Presets + eigene Zellen.
// Eigene Zellen werden im Browser gespeichert (localStorage) und – wenn die Seite
// auf claude.ai läuft – zusätzlich privat im Konto des Betrachters.
import { CELL_PRESETS } from './cells.js';

const LS_KEY = 'zellenhalter-cells-v1';
let own = [];
const listeners = new Set();
let remote = null;          // { ref } wenn Konto-Speicher verfügbar
let writing = Promise.resolve();

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(validCell) : [];
  } catch (e) { return []; }
}
function writeLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(own)); } catch (e) { /* nicht verfügbar */ }
}
function validCell(c) {
  return c && typeof c.id === 'string' && typeof c.name === 'string' && Number.isFinite(+c.d) && +c.d > 0;
}
function emit() { for (const fn of listeners) fn(); }

export function formatOf(d) {
  if (Math.abs(d - 18.6) < 0.8) return '18650';
  if (Math.abs(d - 21.5) < 0.8) return '21700';
  if (Math.abs(d - 26.4) < 1) return '26650';
  if (Math.abs(d - 46) < 1.5) return '4680';
  return `Ø ${String(d).replace('.', ',')}`;
}

export function allCells() {
  return [
    ...CELL_PRESETS.filter(c => c.id !== 'custom').map(c => ({ ...c, builtin: true })),
    ...own.map(c => ({ ...c, fmt: formatOf(+c.d), builtin: false })),
  ];
}
export function getCell(id) { return allCells().find(c => c.id === id) || null; }
export function onCellsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function storageInfo() { return remote ? 'konto' : 'browser'; }

function persist() {
  writeLocal();
  if (remote) {
    const data = { cells: own.map(c => ({ ...c })) };
    // eine Schreiboperation nach der anderen
    writing = writing.then(() => remote.ref.set(data)).catch(err => console.warn('Zellen konnten nicht im Konto gespeichert werden', err));
  }
  emit();
}

export function saveCell(cell) {
  const clean = {
    id: cell.id && own.some(c => c.id === cell.id) ? cell.id : 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(cell.name || 'Eigene Zelle').slice(0, 60),
    d: +cell.d, len: +cell.len,
    cap: Number.isFinite(+cell.cap) ? +cell.cap : null,
    i: Number.isFinite(+cell.i) && cell.i !== '' && cell.i !== null ? +cell.i : null,
    w: Number.isFinite(+cell.w) ? +cell.w : null,
    v: Number.isFinite(+cell.v) && +cell.v > 0 ? +cell.v : 3.6,
  };
  const k = own.findIndex(c => c.id === clean.id);
  if (k >= 0) own[k] = clean; else own.push(clean);
  persist();
  return clean.id;
}

export function deleteCell(id) {
  own = own.filter(c => c.id !== id);
  persist();
}

export async function initCellStore() {
  own = readLocal();
  emit();
  // Konto-Speicher nur auf claude.ai
  try {
    if (!(window.claude && window.claude.use)) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    const ref = db.doc(`data/users/${uid}/cells`);
    const snap = await Promise.race([ref.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    remote = { ref };
    const stored = snap.exists && Array.isArray(snap.data().cells) ? snap.data().cells.filter(validCell) : [];
    // zusammenführen: Konto gewinnt, lokale Zellen ohne Gegenstück kommen dazu
    const ids = new Set(stored.map(c => c.id));
    const merged = [...stored, ...own.filter(c => !ids.has(c.id))];
    const changed = merged.length !== stored.length;
    own = merged;
    writeLocal();
    if (changed) persist(); else emit();
  } catch (e) {
    remote = null; // dann eben nur im Browser
  }
}
