// Zell-Presets. Maße/Werte sind typische Datenblattwerte – bitte immer mit dem
// Datenblatt der eigenen Zellen vergleichen und ggf. anpassen.
// d = Durchmesser (mm, eher Maximalwert), len = Länge (mm), cap = Kapazität (Ah),
// i = max. Dauerstrom (A), w = Gewicht (g), v = Nennspannung (V)

export const CELL_PRESETS = [
  { id: 'jp40',   name: 'Ampace JP40',         fmt: '21700', d: 21.4, len: 70.5, cap: 4.0, i: 45, w: 68, v: 3.6, note: 'Datenblatt: 45 A dauerhaft, 70 A nur mit Temperaturabschaltung' },
  { id: 'p45b',   name: 'Molicel P45B',        fmt: '21700', d: 21.7, len: 70.2, cap: 4.5, i: 45, w: 70, v: 3.6 },
  { id: 'p50b',   name: 'Molicel P50B',        fmt: '21700', d: 21.7, len: 70.2, cap: 5.0, i: 60, w: 72, v: 3.6 },
  { id: 'p42a',   name: 'Molicel P42A',        fmt: '21700', d: 21.7, len: 70.2, cap: 4.2, i: 45, w: 70, v: 3.6 },
  { id: 'x50g',   name: 'Tenpower 50XG',       fmt: '21700', d: 21.5, len: 70.5, cap: 5.0, i: 40, w: 71, v: 3.6, note: 'Oft „10Power X50G“ geschrieben. 40 A dauerhaft, 90 A nur mit Temperaturabschaltung (75 °C)' },
  { id: 'x60g',   name: 'Tenpower 60XG',       fmt: '21700', d: 21.7, len: 70.5, cap: 6.0, i: 60, w: 72, v: 3.6, note: 'Oft „10Power X60G“ geschrieben. 60 A laut Händlerangabe, unabhängige Tests nennen eher 40 A' },
  { id: 's40t',   name: 'Samsung 40T',         fmt: '21700', d: 21.7, len: 70.2, cap: 4.0, i: 35, w: 67, v: 3.6 },
  { id: 's50s',   name: 'Samsung 50S',         fmt: '21700', d: 21.7, len: 70.2, cap: 5.0, i: 25, w: 72, v: 3.6 },
  { id: 'g21700', name: 'Generische Zelle',    fmt: '21700', d: 21.7, len: 70.0, cap: 4.0, i: 30, w: 70, v: 3.6 },
  { id: 'g18650', name: 'Generische Zelle',    fmt: '18650', d: 18.6, len: 65.0, cap: 3.0, i: 20, w: 47, v: 3.6 },
  { id: 'g26650', name: 'Generische Zelle',    fmt: '26650', d: 26.5, len: 65.5, cap: 5.0, i: 20, w: 90, v: 3.6 },
  { id: 'custom', name: 'Eigene Zelle',        fmt: 'manuell', d: 21.7, len: 70.0, cap: 4.0, i: 30, w: 70, v: 3.6 },
];

// Bambu Lab Drucker – nutzbarer Bauraum in mm (X × Y)
export const PRINTERS = [
  { id: 'a1mini', name: 'Bambu Lab A1 mini (180 × 180)', w: 180, d: 180 },
  { id: 'a1',     name: 'Bambu Lab A1 (256 × 256)',      w: 256, d: 256 },
  { id: 'p1s',    name: 'Bambu Lab P1P / P1S / P2S (256 × 256)', w: 256, d: 256 },
  { id: 'x1c',    name: 'Bambu Lab X1C / X1E (256 × 256)', w: 256, d: 256 },
  { id: 'h2s',    name: 'Bambu Lab H2S (340 × 320)',     w: 340, d: 320 },
  { id: 'h2d',    name: 'Bambu Lab H2D (325 × 320, eine Düse)', w: 325, d: 320 },
];
