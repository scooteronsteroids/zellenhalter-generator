# Zellenhalter ScootersOnSteroids

Webseite zum Erzeugen von 3D-druckbaren **Zellenhaltern für E-Scooter-Akkus**
(21700 / 18650 / 26650). Konfiguration in **S (Reihe)** und **P (parallel)**,
Export als **3MF** (Bambu Studio, OrcaSlicer, PrusaSlicer) oder STL.

## Funktionen

- **Zellen-Datenbank** mit über 30 bekannten Zellen (21700 und 18650 von Molicel, Samsung, LG,
  EVE, Ampace, Tenpower, Murata, Panasonic, DMEGC …), voller Name mit Kurzname in Klammern,
  NKON-Zellen markiert, Suche und Filter, dazu eigene Zellen anlegen, bearbeiten,
  löschen – eigene Zellen werden gespeichert (Browser, auf claude.ai im Konto)
- S und P einstellen, Akkudaten auf einen Blick: Spannung, Kapazität, Wh, Strom, Leistung, Gewicht
- **Nickel/Kupfer**: Stärke und Breite der Verbinder eingeben – der Halter bekommt auf der
  Außenseite Kanäle entlang jeder Parallelgruppe und für die Serienverbindung
  (A: Reihen 0+1, 2+3 … / B: 1+2, 3+4 …). Die Kanäle reichen bis auf die Zellpole, die Lippe
  wird mindestens so dick wie Nickel + Kupfer, damit nichts übersteht
- Halter A (unten) und B (oben, gespiegelt), automatische Teilung passend zum Bambu-Lab-Druckbett
- 3D-Vorschau inkl. Akku mit Zellen, Polarität und Verbindern
- Erweitert: Raster/Wabe, Spiel, Höhe, Wand, Rand, Lippe, Fase, Lüftungslöcher, +/−-Markierung
- Export als 3MF (alle Teile, nur A, nur B), einzelne STL, Passungstest 2 × 2
- Alle Meshes sind wasserdicht/manifold (CSG mit [manifold-3d](https://github.com/elalish/manifold))

## Benutzen

Die Seite ist rein statisch, es gibt keinen Server-Code. Wegen ES-Modulen und
Web-Worker muss sie über HTTP ausgeliefert werden (nicht per Doppelklick als Datei):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Oder per **GitHub Pages**: Repository → Settings → Pages → „Deploy from a branch“ →
Branch `claude/escooter-battery-holder-3d-izu9jz`, Ordner `/ (root)` → Save. Danach ist die Seite unter
`https://scooteronsteroids.github.io/zellenhalter-generator/` erreichbar.

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
| `js/cellstore.js` | Zellen-Datenbank (eigene Zellen speichern) |
| `vendor/` | three.js 0.170, manifold-3d 3.2.1, fflate 0.8.2 (lokal, keine CDN nötig) |

Schriften (Chakra Petch, IBM Plex Sans, JetBrains Mono) kommen von Google Fonts; ohne Internet
wird automatisch eine Systemschrift verwendet.

## Lizenz

© 2026 ScootersOnSteroids. **Alle Rechte vorbehalten.** Dieses Projekt ist **keine** Open-Source-Software.
Die Webseite darf zum Erzeugen von Zellenhaltern für den eigenen Gebrauch genutzt werden. Kopieren,
Verändern, erneutes Veröffentlichen oder gewerbliche Nutzung des Codes ist ohne schriftliche Erlaubnis
untersagt. Details in [`LICENSE`](LICENSE). Fremdbibliotheken siehe [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
