// © 2026 ScootersOnSteroids – Zellenhalter. Alle Rechte vorbehalten.
// Kopieren, Verändern oder Weiterverbreiten ohne schriftliche Erlaubnis ist untersagt. Siehe LICENSE.
// Web-Worker: rechnet die Geometrie im Hintergrund, damit die Oberfläche flüssig bleibt.
import Module from '../vendor/manifold/manifold.js';
import { buildHolders } from './geometry.js';

const ready = (async () => {
  const wasm = await Module();
  wasm.setup();
  return wasm;
})();

self.onmessage = async (ev) => {
  const { id, options } = ev.data;
  try {
    const wasm = await ready;
    const t0 = performance.now();
    const result = buildHolders(wasm, options);
    result.ms = performance.now() - t0;
    delete result.derived.cells; // wird im Hauptthread neu berechnet
    const transfer = [];
    for (const p of result.pieces) transfer.push(p.positions.buffer, p.indices.buffer);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack || err) });
  }
};
