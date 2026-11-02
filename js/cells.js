// © 2026 ScootersOnSteroids – Zellenhalter. Alle Rechte vorbehalten.
// Kopieren, Verändern oder Weiterverbreiten ohne schriftliche Erlaubnis ist untersagt. Siehe LICENSE.
// Zell-Presets. Werte nach Hersteller-Datenblättern bzw. NKON-Angaben (Stand Nov. 2026).
// Bitte immer mit dem Datenblatt der eigenen Zellen abgleichen.
// name  = ausgeschriebener Name, short = Kurzname (Anzeige: "name (short)")
// d = Durchmesser (mm, eher Maximalwert), len = Länge (mm), cap = Kapazität (Ah),
// i = max. Dauerstrom (A, null = unbekannt), w = Gewicht (g), v = Nennspannung (V)
// nkon = bei NKON erhältlich

const C21 = { fmt: '21700', d: 21.7, len: 70.5, v: 3.6 };
const C18 = { fmt: '18650', d: 18.6, len: 65.2, v: 3.6 };

export const CELL_PRESETS = [
  // ---------------- 21700 · Hochstrom ----------------
  { ...C21, id: 'jp40',  name: 'Ampace INR21700-JP40',    short: 'JP40',  d: 21.4, cap: 4.0,  i: 45,  w: 68, nkon: true,
    note: 'Datenblatt: 45 A dauerhaft. NKON nennt 70 A, das gilt nur mit Temperaturabschaltung' },
  { ...C21, id: 'p45b',  name: 'Molicel INR21700-P45B',   short: 'P45B',  cap: 4.5,  i: 45,  w: 70, nkon: true },
  { ...C21, id: 'p50b',  name: 'Molicel INR21700-P50B',   short: 'P50B',  cap: 5.0,  i: 50,  w: 70, nkon: true,
    note: 'NKON nennt 50 A, andere Händler 60 A (mit Temperaturgrenze)' },
  { ...C21, id: 'p42a',  name: 'Molicel INR21700-P42A',   short: 'P42A',  cap: 4.2,  i: 45,  w: 70, nkon: true },
  { ...C21, id: 'p60b',  name: 'Molicel INR21700-P60B',   short: 'P60B',  cap: 6.0,  i: null, w: 75,
    note: 'Neue Zelle: Dauerstrom bitte aus dem Molicel-Datenblatt eintragen' },
  { ...C21, id: 'm50a',  name: 'Molicel INR21700-M50A',   short: 'M50A',  cap: 4.8,  i: 15,  w: 69, nkon: true },
  { ...C21, id: 's40t',  name: 'Samsung INR21700-40T',    short: '40T',   cap: 4.0,  i: 35,  w: 67, nkon: true },
  { ...C21, id: 's30t',  name: 'Samsung INR21700-30T',    short: '30T',   cap: 3.0,  i: 35,  w: 67 },
  { ...C21, id: 's50s',  name: 'Samsung INR21700-50S',    short: '50S',   cap: 5.0,  i: 25,  w: 70, nkon: true,
    note: 'Samsung-Datenblatt: 25 A dauerhaft. NKON nennt 35 A' },
  { ...C21, id: 's50e',  name: 'Samsung INR21700-50E',    short: '50E',   cap: 4.9,  i: 9.8, w: 69, nkon: true },
  { ...C21, id: 's58e',  name: 'Samsung INR21700-58E',    short: '58E',   cap: 5.33, i: 10.7, w: 70, nkon: true },
  { ...C21, id: 'm50lt', name: 'LG INR21700-M50LT',       short: 'M50LT', cap: 4.93, i: 14.4, w: 69, nkon: true },
  { ...C21, id: 'm58t',  name: 'LG INR21700-M58T',        short: 'M58T',  cap: 5.57, i: 12.5, w: 71, nkon: true },
  { ...C21, id: 'e40pl', name: 'EVE INR21700-40PL',       short: '40PL',  cap: 4.0,  i: 70,  w: 67, nkon: true },
  { ...C21, id: 'e40p',  name: 'EVE INR21700-40P',        short: '40P',   cap: 4.0,  i: 50,  w: 67, nkon: true },
  { ...C21, id: 'e50pl', name: 'EVE INR21700-50PL',       short: '50PL',  cap: 5.0,  i: null, w: 70, nkon: true,
    note: 'NKON verkauft sie als B-Ware und nennt 125 A. Dauerstrom bitte aus dem Datenblatt eintragen' },
  { ...C21, id: 'e50e',  name: 'EVE INR21700-50E',        short: 'EVE 50E', cap: 5.0, i: 15, w: 70, nkon: true },
  { ...C21, id: 'd50e',  name: 'DMEGC INR21700-50E',      short: 'DMEGC 50E', cap: 5.0, i: 15, w: 70, nkon: true },
  { ...C21, id: 'x50g',  name: 'Tenpower INR21700-50XG',  short: '50XG',  d: 21.5, cap: 5.0, i: 40, w: 71, nkon: true,
    note: 'Oft „10Power X50G“ geschrieben. 40 A dauerhaft, 90 A nur mit Temperaturabschaltung (75 °C)' },
  { ...C21, id: 'x60g',  name: 'Tenpower INR21700-60XG',  short: '60XG',  cap: 6.0,  i: 60,  w: 72, nkon: true,
    note: 'Oft „10Power X60G“ geschrieben. 60 A laut Händlerangabe, unabhängige Tests nennen eher 40 A' },
  { ...C21, id: 't40tg', name: 'Tenpower INR21700-40TG',  short: '40TG',  cap: 4.0,  i: 35,  w: 68 },

  // ---------------- 18650 ----------------
  { ...C18, id: 'p28a',  name: 'Molicel INR18650-P28A',   short: 'P28A',  cap: 2.8,  i: 35,  w: 45, nkon: true },
  { ...C18, id: 'p30b',  name: 'Molicel INR18650-P30B',   short: 'P30B',  cap: 3.0,  i: 30,  w: 46, nkon: true },
  { ...C18, id: 'p26a',  name: 'Molicel INR18650-P26A',   short: 'P26A',  cap: 2.6,  i: 35,  w: 45, nkon: true },
  { ...C18, id: 'm35a',  name: 'Molicel INR18650-M35A',   short: 'M35A',  cap: 3.5,  i: 10,  w: 48 },
  { ...C18, id: 's35e',  name: 'Samsung INR18650-35E',    short: '35E',   cap: 3.4,  i: 8,   w: 50, nkon: true },
  { ...C18, id: 's30q',  name: 'Samsung INR18650-30Q',    short: '30Q',   cap: 3.0,  i: 15,  w: 45, nkon: true },
  { ...C18, id: 's25r',  name: 'Samsung INR18650-25R',    short: '25R',   cap: 2.5,  i: 20,  w: 45, nkon: true },
  { ...C18, id: 'mj1',   name: 'LG INR18650-MJ1',         short: 'MJ1',   cap: 3.5,  i: 10,  w: 49, nkon: true },
  { ...C18, id: 'hg2',   name: 'LG INR18650-HG2',         short: 'HG2',   cap: 3.0,  i: 20,  w: 47 },
  { ...C18, id: 'vtc6',  name: 'Murata US18650VTC6',      short: 'VTC6',  cap: 3.0,  i: 30,  w: 46, nkon: true,
    note: 'Früher Sony. NKON nennt 3120 mAh' },
  { ...C18, id: 'vtc5a', name: 'Murata US18650VTC5A',     short: 'VTC5A', cap: 2.6,  i: 35,  w: 47, nkon: true },
  { ...C18, id: 'ga',    name: 'Panasonic NCR18650GA',    short: 'GA',    cap: 3.45, i: 10,  w: 48, nkon: true,
    note: 'Bei NKON unter dem Namen Sanyo gelistet' },

  // ---------------- Generisch ----------------
  { ...C21, id: 'g21700', name: 'Generische 21700', short: '', len: 70.0, cap: 4.0, i: 30, w: 70 },
  { ...C18, id: 'g18650', name: 'Generische 18650', short: '', len: 65.0, cap: 3.0, i: 20, w: 47 },
  { id: 'g26650', name: 'Generische 26650', short: '', fmt: '26650', d: 26.5, len: 65.5, cap: 5.0, i: 20, w: 90, v: 3.6 },
];

/** Anzeigename: ausgeschriebener Name mit Kurzname in Klammern */
export function cellLabel(c) {
  return c.short ? `${c.name} (${c.short})` : c.name;
}

// Bambu Lab Drucker – nutzbarer Bauraum in mm (X × Y)
export const PRINTERS = [
  { id: 'a1mini', name: 'Bambu Lab A1 mini (180 × 180)', w: 180, d: 180 },
  { id: 'a1',     name: 'Bambu Lab A1 (256 × 256)',      w: 256, d: 256 },
  { id: 'p1s',    name: 'Bambu Lab P1P / P1S / P2S (256 × 256)', w: 256, d: 256 },
  { id: 'x1c',    name: 'Bambu Lab X1C / X1E (256 × 256)', w: 256, d: 256 },
  { id: 'h2s',    name: 'Bambu Lab H2S (340 × 320)',     w: 340, d: 320 },
  { id: 'h2d',    name: 'Bambu Lab H2D (325 × 320, eine Düse)', w: 325, d: 320 },
];
