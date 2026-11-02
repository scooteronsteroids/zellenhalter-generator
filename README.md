# Zellenhalter-Generator

Webseite zum Erzeugen von 3D-druckbaren **Zellenhaltern für E-Scooter-Akkus**
(21700 / 18650 / 26650). Konfiguration in **S (Reihe)** und **P (parallel)**,
Export als **3MF** (Bambu Studio, OrcaSlicer, PrusaSlicer) oder STL.

## Funktionen

- Zell-Presets: Ampace JP40, Molicel P45B / P50B / P42A, Tenpower 50XG / 60XG
  (oft „10Power X50G/X60G“ geschrieben), Samsung 40T / 50S, generische 18650 / 21700 / 26650 – oder eigene Maße
- Beliebige S/P-Konfiguration, Schnellwahl 36 V … 84 V
- Anordnung **Raster** oder **Wabe** (versetzt, kompakter)
- Lippe unten (Zelle fällt nicht durch, Mitte frei zum Punktschweißen),
  Einführfase, Lüftungs-/Gewichtslöcher, eingravierte **+/−** Polaritätsmarkierung
- **Halter A** (unten) und **Halter B** (oben, gespiegelt) werden automatisch erzeugt
- Druckerauswahl Bambu Lab A1 mini, A1, P1P/P1S/P2S, X1C/X1E, H2S, H2D –
  zu große Halter werden **automatisch entlang der Zellzwischenräume geteilt**
- 3D-Vorschau inkl. Zusammenbau-Ansicht mit Zellen und Polarität
- Akkudaten: Spannung, Kapazität, Wh, max. Strom/Leistung, Gewicht, Filamentbedarf
- Passungstest (2 × 2) zum Ausprobieren des Spiels mit echten Zellen
- Alle Meshes sind wasserdicht/manifold (CSG mit [manifold-3d](https://github.com/elalish/manifold))

## Benutzen

Die Seite ist rein statisch, es gibt keinen Server-Code. Wegen ES-Modulen und
Web-Worker muss sie über HTTP ausgeliefert werden (nicht per Doppelklick als Datei):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Oder per **GitHub Pages**: Repository → Settings → Pages → Branch auswählen → fertig.

## Druckhinweise

- Mit der Lippe nach unten drucken (so wie exportiert) – keine Stützen nötig
- PETG, ASA oder PC verwenden (PLA wird im warmen Akku weich)
- In Bambu Studio nach dem Import ggf. „Alle Objekte anordnen“ (Taste `A`) drücken;
  passen nicht alle Teile auf eine Platte, einzeln (3MF nur A / nur B) exportieren
- Erst den Passungstest drucken, dann „Spiel auf Ø“ anpassen (typisch 0,2–0,5 mm)

> ⚠️ Lithium-Akkus können bei fehlerhaftem Aufbau brennen. Nur mit passendem BMS,
> geeigneten Nickelstreifen und fachgerechtem Punktschweißen aufbauen. Zelldaten
> (insbesondere den Dauerstrom) immer mit dem Datenblatt abgleichen.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css` | Oberfläche |
| `js/app.js` | UI, 3D-Vorschau (three.js), Downloads |
| `js/geometry.js` | Geometrie des Halters (manifold-3d), Teilung fürs Druckbett |
| `js/worker.js` | Berechnung im Hintergrund (Web Worker) |
| `js/export.js` | 3MF- und STL-Export |
| `js/cells.js` | Zell- und Drucker-Presets |
| `vendor/` | three.js 0.170, manifold-3d 3.2.1, fflate 0.8.2 (lokal, keine CDN nötig) |

Schriften (Barlow Condensed, IBM Plex) kommen von Google Fonts; ohne Internet
wird automatisch eine Systemschrift verwendet.
