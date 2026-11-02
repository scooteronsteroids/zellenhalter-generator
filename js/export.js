// Export als 3MF (Bambu Studio / OrcaSlicer / PrusaSlicer) und binäres STL.
import { zipSync, strToU8 } from '../vendor/fflate.js';

function centered(piece) {
  // Teil auf eigenen Mittelpunkt verschieben, Unterseite auf Z = 0
  const { min, max } = piece.bounds;
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = min[2];
  const pos = piece.positions;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    out[i] = pos[i] - cx; out[i + 1] = pos[i + 1] - cy; out[i + 2] = pos[i + 2] - cz;
  }
  return { positions: out, indices: piece.indices,
           w: max[0] - min[0], d: max[1] - min[1] };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v) => (Math.round(v * 1e5) / 1e5).toString();

/** 3MF mit allen übergebenen Teilen als einzelne Objekte. */
export function make3MF(pieces, { bedW = 256, bedD = 256, title = 'Zellenhalter' } = {}) {
  const parts = pieces.map(p => ({ ...centered(p), name: p.name }));

  // einfache Reihen-Anordnung (Bambu Studio: danach ggf. "Anordnen" drücken)
  const gap = 6;
  let x = gap, y = gap, rowH = 0;
  const placements = parts.map(p => {
    if (x + p.w > bedW && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
    const pl = [x + p.w / 2, y + p.d / 2];
    x += p.w + gap; rowH = Math.max(rowH, p.d);
    return pl;
  });

  const chunks = [];
  chunks.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  chunks.push('<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
  chunks.push(`<metadata name="Title">${esc(title)}</metadata>\n`);
  chunks.push('<metadata name="Application">Zellenhalter-Generator</metadata>\n');
  chunks.push('<resources>\n');
  parts.forEach((p, k) => {
    chunks.push(`<object id="${k + 1}" name="${esc(p.name)}" type="model"><mesh><vertices>\n`);
    const P = p.positions;
    let buf = [];
    for (let i = 0; i < P.length; i += 3) {
      buf.push(`<vertex x="${f(P[i])}" y="${f(P[i + 1])}" z="${f(P[i + 2])}"/>`);
      if (buf.length > 4096) { chunks.push(buf.join('\n')); buf = []; }
    }
    chunks.push(buf.join('\n'));
    chunks.push('\n</vertices><triangles>\n');
    const I = p.indices;
    buf = [];
    for (let i = 0; i < I.length; i += 3) {
      buf.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`);
      if (buf.length > 4096) { chunks.push(buf.join('\n')); buf = []; }
    }
    chunks.push(buf.join('\n'));
    chunks.push('\n</triangles></mesh></object>\n');
  });
  chunks.push('</resources>\n<build>\n');
  parts.forEach((p, k) => {
    const [tx, ty] = placements[k];
    chunks.push(`<item objectid="${k + 1}" transform="1 0 0 0 1 0 0 0 1 ${f(tx)} ${f(ty)} 0"/>\n`);
  });
  chunks.push('</build>\n</model>\n');

  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    '</Relationships>';

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(chunks.join('')),
  }, { level: 6 });
}

/** Binäres STL eines Teils. */
export function makeSTL(piece) {
  const { positions: P, indices: I } = centered(piece);
  const nTri = I.length / 3;
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  const header = 'Zellenhalter-Generator ' + piece.name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '-');
  for (let i = 0; i < Math.min(80, header.length); i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, nTri, true);
  let o = 84;
  for (let t = 0; t < nTri; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const idx of [a, b, c]) {
      dv.setFloat32(o, P[idx], true); dv.setFloat32(o + 4, P[idx + 1], true); dv.setFloat32(o + 8, P[idx + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

// Auf claude.ai läuft die Seite in einer abgesicherten Umgebung: Downloads gehen dort
// nur über die "downloads"-Freigabe, und .3mf/.stl sind nicht erlaubt -> als ZIP verpacken.
let downloadsCap;
async function getDownloadsCap() {
  if (downloadsCap !== undefined) return downloadsCap;
  try {
    downloadsCap = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
  } catch (e) { downloadsCap = null; }
  return downloadsCap;
}

/**
 * Bietet eine Datei zum Speichern an.
 * @returns 'saved' | 'zipped' | 'declined'
 */
export async function download(data, filename, mime) {
  const cap = await getDownloadsCap();
  if (cap) {
    const zipName = filename.replace(/\.[^.]+$/, '') + '.zip';
    const zip = zipSync({ [filename]: data }, { level: filename.endsWith('.3mf') ? 0 : 6 });
    try {
      await cap.save({ filename: zipName, data: new Blob([zip]) });
      return 'zipped';
    } catch (err) {
      if (err && err.code === 'declined') return 'declined';
      throw new Error(err && err.message ? err.message : 'Speichern nicht möglich');
    }
  }
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
