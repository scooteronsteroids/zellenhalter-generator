// Geometrie-Erzeugung für Zellenhalter mit manifold-3d (robuste CSG, garantiert
// wasserdichte/manifold Meshes – ideal für Slicer wie Bambu Studio).
//
// Koordinaten: X = Richtung der Parallelgruppe (P Zellen pro Reihe),
//              Y = Richtung der Serienschaltung (S Reihen),
//              Z = Höhe. Der Halter liegt mit dem Rand (Lippe) auf dem Druckbett.

const SQRT3 = Math.sqrt(3);

export const DEFAULTS = {
  s: 13,            // Zellen in Reihe (S)
  p: 4,             // Zellen parallel (P)
  cellD: 21.7,      // Zelldurchmesser
  cellLen: 70.2,    // Zelllänge (nur für Vorschau/Zusammenbau)
  tol: 0.3,         // Spiel auf den Durchmesser
  layout: 'grid',   // 'grid' | 'hex'
  wall: 1.2,        // Wandstärke zwischen zwei Zellen
  border: 3,        // Außenrand
  height: 10,       // Gesamthöhe des Halters
  lipT: 1.6,        // Stärke der Lippe (unten)
  lipW: 2.0,        // radiale Überdeckung der Lippe (wie weit sie über die Zelle ragt)
  outline: 'contour', // 'contour' | 'rect'
  chamfer: 0.6,     // Einführfase oben
  vents: true,      // Lüftungs-/Gewichtslöcher zwischen den Zellen
  markers: true,    // +/- Polaritätsmarkierung an jeder Reihe
  segments: 48,     // Kreisauflösung (48 Segmente = < 0,03 mm Abweichung bei 21700)
  splitX: 0,        // 0 = automatisch
  splitY: 0,
  bedW: 256,
  bedD: 256,
  bedMargin: 4,
};

export function derive(o) {
  const holeD = o.cellD + o.tol;
  const R = holeD / 2;
  const pitch = holeD + o.wall;
  const rowPitch = o.layout === 'hex' ? pitch * SQRT3 / 2 : pitch;
  const lipR = Math.max(1, R - o.lipW);
  const markerExtra = o.markers ? 5 : 0;

  // Zellmittelpunkte
  const cells = [];
  for (let j = 0; j < o.s; j++) {
    for (let i = 0; i < o.p; i++) {
      const x = i * pitch + (o.layout === 'hex' && j % 2 ? pitch / 2 : 0);
      const y = j * rowPitch;
      cells.push({ i, j, x, y });
    }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (const c of cells) { c.x -= cx; c.y -= cy; }

  return { holeD, R, pitch, rowPitch, lipR, markerExtra, cells,
           spanX: maxX - minX, spanY: maxY - minY };
}

// Zelle (i,j) inkl. "Geister"-Zellen außerhalb des Rasters (für die Teilung)
function latticeCenter(o, d, i, j) {
  const x0 = d.cells[0].x, y0 = d.cells[0].y; // Zelle (0,0)
  const odd = ((j % 2) + 2) % 2 === 1;
  return {
    x: x0 + i * d.pitch + (o.layout === 'hex' && odd ? d.pitch / 2 : 0),
    y: y0 + j * d.rowPitch,
  };
}

function latticePolygon(o, d, x, y, eps) {
  if (o.layout === 'hex') {
    // Voronoi-Zelle eines Hexgitters: spitzes Sechseck, Inkreisradius = pitch/2
    const r = d.pitch / SQRT3 + eps * 2;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + k * Math.PI / 3;
      pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
    return pts;
  }
  const hx = d.pitch / 2 + eps, hy = d.rowPitch / 2 + eps;
  return [[x - hx, y - hy], [x + hx, y - hy], [x + hx, y + hy], [x - hx, y + hy]];
}

function evenSplit(n, parts) {
  const res = [];
  let start = 0;
  for (let k = 0; k < parts; k++) {
    const cnt = Math.floor(n / parts) + (k < n % parts ? 1 : 0);
    res.push([start, start + cnt - 1]);
    start += cnt;
  }
  return res;
}

// Schätzt die Größe jedes Teils für eine Teilung nx × ny
function estimatePieces(o, d, nx, ny) {
  const cols = evenSplit(o.p, nx), rows = evenSplit(o.s, ny);
  const outer = d.R + o.border;
  const xMinAll = Math.min(...d.cells.map(c => c.x)) - outer - d.markerExtra;
  const xMaxAll = Math.max(...d.cells.map(c => c.x)) + outer + d.markerExtra;
  const yMinAll = Math.min(...d.cells.map(c => c.y)) - outer;
  const yMaxAll = Math.max(...d.cells.map(c => c.y)) + outer;
  const halfY = o.layout === 'hex' ? d.pitch / SQRT3 : d.rowPitch / 2;
  const sizes = [];
  for (const [r0, r1] of rows) for (const [c0, c1] of cols) {
    const cs = d.cells.filter(c => c.i >= c0 && c.i <= c1 && c.j >= r0 && c.j <= r1);
    let x0 = Math.min(...cs.map(c => c.x)) - d.pitch / 2;
    let x1 = Math.max(...cs.map(c => c.x)) + d.pitch / 2;
    let y0 = Math.min(...cs.map(c => c.y)) - halfY;
    let y1 = Math.max(...cs.map(c => c.y)) + halfY;
    if (c0 === 0) x0 = xMinAll;
    if (c1 === o.p - 1) x1 = xMaxAll;
    if (r0 === 0) y0 = yMinAll;
    if (r1 === o.s - 1) y1 = yMaxAll;
    sizes.push([x1 - x0, y1 - y0]);
  }
  return { cols, rows, sizes };
}

function fits(size, bw, bd) {
  const [w, h] = size;
  return (w <= bw && h <= bd) || (h <= bw && w <= bd);
}

export function chooseSplit(o, d) {
  const bw = o.bedW - 2 * o.bedMargin, bd = o.bedD - 2 * o.bedMargin;
  if (o.splitX > 0 || o.splitY > 0) {
    const nx = Math.min(Math.max(1, o.splitX || 1), o.p);
    const ny = Math.min(Math.max(1, o.splitY || 1), o.s);
    const est = estimatePieces(o, d, nx, ny);
    return { nx, ny, ...est, auto: false, allFit: est.sizes.every(s => fits(s, bw, bd)) };
  }
  let best = null;
  for (let nx = 1; nx <= o.p; nx++) {
    for (let ny = 1; ny <= o.s; ny++) {
      const est = estimatePieces(o, d, nx, ny);
      if (!est.sizes.every(s => fits(s, bw, bd))) continue;
      const n = nx * ny;
      const maxDim = Math.max(...est.sizes.flat());
      // weniger Teile zuerst; bei Gleichstand lieber Schnitte zwischen Serienreihen
      // (ny), weil dort ohnehin Nickelstreifen-Lücken sind
      const score = n * 1e6 + nx * 1e3 + maxDim;
      if (!best || score < best.score) best = { nx, ny, ...est, score };
    }
  }
  if (!best) {
    const est = estimatePieces(o, d, o.p, o.s);
    return { nx: o.p, ny: o.s, ...est, auto: true, allFit: false };
  }
  return { ...best, auto: true, allFit: true };
}

// Polaritätszeichen als 2D-Querschnitt
function signShape(CS, plus, size, x, y) {
  const w = Math.max(0.8, size * 0.22);
  let s = CS.square([size, w], true);
  if (plus) s = CS.union(s, CS.square([w, size], true));
  return s.translate([x, y]);
}

/**
 * Baut den Halter.
 * @param wasm  initialisiertes manifold-Modul
 * @param o     Optionen
 * @returns { pieces: [{name, side, mesh, bounds}], info }
 */
export function buildHolders(wasm, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { CrossSection: CS, Manifold: M } = wasm;
  const garbage = [];
  const g = (x) => { garbage.push(x); return x; };

  try {
    const d = derive(o);
    const seg = o.segments;
    const outer = d.R + o.border;
    const H = o.height;
    const lipT = Math.min(o.lipT, H - 1);

    // ---------- Außenkontur ----------
    const circles = [];
    const rowsFirst = new Map();
    const rowsLast = new Map();
    for (const c of d.cells) {
      circles.push(g(CS.circle(outer, seg).translate([c.x, c.y])));
      if (!rowsFirst.has(c.j) || c.x < rowsFirst.get(c.j).x) rowsFirst.set(c.j, c);
      if (!rowsLast.has(c.j) || c.x > rowsLast.get(c.j).x) rowsLast.set(c.j, c);
    }
    // Platz für Markierungen links und rechts (rechts für die gespiegelte Seite B)
    if (d.markerExtra > 0) {
      for (const c of rowsFirst.values())
        circles.push(g(CS.circle(outer, seg).translate([c.x - d.markerExtra, c.y])));
      for (const c of rowsLast.values())
        circles.push(g(CS.circle(outer, seg).translate([c.x + d.markerExtra, c.y])));
    }
    let outline;
    if (o.outline === 'rect') {
      const all = g(CS.union(circles));
      const b = all.bounds();
      const corner = Math.min(4, outer);
      const w = b.max[0] - b.min[0] - 2 * corner, h = b.max[1] - b.min[1] - 2 * corner;
      outline = g(g(CS.square([w, h], true)
        .translate([(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2]))
        .offset(corner, 'Round', 2, seg));
    } else {
      const k = d.pitch;
      outline = g(g(g(CS.union(circles)).offset(k, 'Round', 2, seg)).offset(-k, 'Round', 2, seg));
    }

    // ---------- Grundkörper ----------
    const body = g(outline.extrude(H));

    // ---------- Schneidwerkzeuge (Zellbohrungen, Lippe, Fase, Lüftung) ----------
    const holes = [], lipHoles = [];
    for (const c of d.cells) {
      holes.push(g(CS.circle(d.R, seg).translate([c.x, c.y])));
      lipHoles.push(g(CS.circle(d.lipR, seg).translate([c.x, c.y])));
    }
    const cutters = [];
    cutters.push(g(g(g(CS.union(holes)).extrude(H - lipT + 1)).translate([0, 0, lipT])));
    cutters.push(g(g(g(CS.union(lipHoles)).extrude(H + 2)).translate([0, 0, -1])));
    if (o.chamfer > 0) {
      const ch = Math.min(o.chamfer, H - lipT - 0.4);
      // Kegel überlappen sich nicht -> compose statt teurer Boolean-Vereinigung
      const cone = g(M.cylinder(ch + 0.5, d.R, d.R + ch + 0.5, seg));
      cutters.push(g(M.compose(d.cells.map(c => g(cone.translate([c.x, c.y, H - ch]))))));
    }
    let ventR = 0;
    if (o.vents) {
      const vents = [];
      if (o.layout === 'grid') {
        ventR = (d.pitch * Math.SQRT2) / 2 - d.R - Math.max(o.wall, 1.2);
        if (ventR >= 1.5) {
          for (const c of d.cells) {
            if (c.i < o.p - 1 && c.j < o.s - 1)
              vents.push(g(CS.circle(ventR, 32).translate([c.x + d.pitch / 2, c.y + d.rowPitch / 2])));
          }
        }
      } else {
        // Dreieckslücken im Wabenmuster
        ventR = d.pitch / SQRT3 - d.R - Math.max(o.wall, 1.2);
        if (ventR >= 1.2) {
          const byIJ = new Map(d.cells.map(c => [c.i + ',' + c.j, c]));
          for (const c of d.cells) {
            const right = byIJ.get((c.i + 1) + ',' + c.j);
            if (!right) continue;
            const off = c.j % 2 ? 1 : 0; // ungerade Reihen sind nach rechts versetzt
            for (const dj of [-1, 1]) {
              const up = byIJ.get((c.i + off) + ',' + (c.j + dj));
              if (!up) continue;
              if (dj === -1 && c.j - 1 < 0) continue;
              const vx = (c.x + right.x + up.x) / 3, vy = (c.y + right.y + up.y) / 3;
              vents.push(g(CS.circle(ventR, 24).translate([vx, vy])));
            }
          }
        } else ventR = 0;
      }
      if (vents.length) cutters.push(g(g(g(CS.union(vents)).extrude(H + 2)).translate([0, 0, -1])));
      else ventR = 0;
    }
    const cutAll = g(M.union(cutters));
    const base = g(body.subtract(cutAll));

    // ---------- Polaritätsmarkierung (oben eingraviert) ----------
    // Seite A: Zeichen zeigt, welcher Pol in Halter A nach unten zeigt.
    // Seite B (oberer Halter, gespiegelt gedruckt): umgekehrte Polarität.
    const markerDepth = 0.6;
    function withMarkers(solid, invert) {
      if (!o.markers) return solid;
      const size = Math.min(6, o.border + d.markerExtra - 1.5);
      if (size < 2) return solid;
      const shapes = [];
      for (const c of rowsFirst.values()) {
        const plus = (c.j % 2 === 0) !== invert;
        // Seite B wird später an X gespiegelt -> Zeichen rechts setzen, landet dann links
        const x = invert
          ? rowsLast.get(c.j).x + d.R + (o.border + d.markerExtra) / 2
          : c.x - d.R - (o.border + d.markerExtra) / 2;
        shapes.push(g(signShape(CS, plus, size, x, c.y)));
      }
      const eng = g(g(g(CS.union(shapes)).extrude(markerDepth + 1)).translate([0, 0, H - markerDepth]));
      return g(solid.subtract(eng));
    }
    const fullA = withMarkers(base, false);
    const fullB = withMarkers(base, true);

    // ---------- Teilung für den Bauraum ----------
    const split = chooseSplit(o, d);
    const nPieces = split.nx * split.ny;
    const pieceIndex = (i, j) => {
      const ci = Math.min(Math.max(i, 0), o.p - 1);
      const cj = Math.min(Math.max(j, 0), o.s - 1);
      const a = split.cols.findIndex(([c0, c1]) => ci >= c0 && ci <= c1);
      const b = split.rows.findIndex(([r0, r1]) => cj >= r0 && cj <= r1);
      return b * split.nx + a;
    };
    let territories = null;
    if (nPieces > 1) {
      const ring = Math.ceil((outer + d.markerExtra + 2) / Math.min(d.pitch, d.rowPitch)) + 2;
      const polys = Array.from({ length: nPieces }, () => []);
      for (let j = -ring; j < o.s + ring; j++) {
        for (let i = -ring - 1; i < o.p + ring + 1; i++) {
          const { x, y } = latticeCenter(o, d, i, j);
          polys[pieceIndex(i, j)].push(latticePolygon(o, d, x, y, 0.001));
        }
      }
      territories = [];
      const taken = [];
      for (let k = 0; k < nPieces; k++) {
        let t = g(CS.union(polys[k].map(p => g(new CS([p])))));
        if (taken.length) t = g(t.subtract(g(CS.union(taken))));
        taken.push(t);
        territories.push(g(g(t.extrude(H + 4)).translate([0, 0, -2])));
      }
    }

    const pieces = [];
    for (const [side, full] of [['A', fullA], ['B', fullB]]) {
      for (let k = 0; k < nPieces; k++) {
        let solid = territories ? g(full.intersect(territories[k])) : full;
        if (side === 'B') solid = g(solid.mirror([1, 0, 0]));
        if (solid.isEmpty()) continue;
        const mesh = solid.getMesh();
        const b = solid.boundingBox();
        const a = k % split.nx, bb = Math.floor(k / split.nx);
        const name = nPieces > 1
          ? `Halter ${side} – Teil ${k + 1} (Spalte ${a + 1}, Reihe ${bb + 1})`
          : `Halter ${side}`;
        pieces.push({
          name, side, index: k,
          positions: Float32Array.from(extractPositions(mesh)),
          indices: Uint32Array.from(mesh.triVerts),
          bounds: { min: [...b.min], max: [...b.max] },
          volume: solid.volume(),
        });
      }
    }

    const bounds = fullA.boundingBox();
    return {
      pieces,
      derived: d,
      split: { nx: split.nx, ny: split.ny, auto: split.auto !== false, allFit: split.allFit },
      size: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], H],
      ventR,
      lipT,
      options: o,
    };
  } finally {
    for (const x of garbage) { try { x.delete(); } catch (e) { /* bereits freigegeben */ } }
  }
}

function extractPositions(mesh) {
  const n = mesh.numProp;
  const vp = mesh.vertProperties;
  if (n === 3) return vp;
  const count = vp.length / n;
  const out = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    out[v * 3] = vp[v * n]; out[v * 3 + 1] = vp[v * n + 1]; out[v * 3 + 2] = vp[v * n + 2];
  }
  return out;
}
