# tessellart

**A quiet little studio for weighted Voronoi figures after the serious geometry is done.**

tessellart is a local, browser-based editor for polishing weighted Voronoi treemaps after their geometry has been calculated by the companion Python adaptation of [`WeightedTreemaps`](https://github.com/m-jahn/WeightedTreemaps). The tessellation does the mathematics; tessellart gives the polygons room to breathe.

> [!IMPORTANT]
> ## Looking for the original R tools?
>
> **[Explore WeightedTreemaps](https://github.com/m-jahn/WeightedTreemaps)** — the upstream R package for calculating and drawing nested, additively weighted Voronoi and sunburst treemaps.
>
> **[Open ShinyTreemaps](https://m-jahn.shinyapps.io/ShinyTreemaps/)** · **[View its source](https://github.com/m-jahn/ShinyTreemaps)** — Michael Jahn's full R/Shiny interface for uploading data, choosing hierarchy columns, calculating Voronoi or sunburst treemaps, and customizing their generation and appearance.

This repository is a downstream **styling editor**, not a replacement for the upstream projects. It opens portable Voronoi geometry saved as `.voronoi.json`, then lets you refine the figure without rerunning the expensive tessellation. The geometry remains locked while labels, borders, colors, legend, canvas, and export settings stay editable—the cells keep their area; they just get a better outfit.

## Origin story

The scientifically unverified version is that the creator's M1 seemed mildly allergic to RStudio—and she was tired of switching laptops just to finish one figure. At some point, changing computers became more work than changing the plot. So the **Voronoi portion only** crossed the bridge to Python, and tessellart was born to give the resulting cells calmer labels, tidier borders, and the occasional tasteful costume change. Sunbursts remain happily upstream. No diagnosis of Apple hardware is implied. :3

## What this release does

tessellart directly opens `.voronoi.json` from the companion Python adaptation and JSON previously saved by the editor. The static browser app **does not calculate or alter Voronoi cells** and does not bundle CGAL. Geometry is produced beforehand by our Voronoi-only Python adaptation of the upstream `WeightedTreemaps` code and method; tessellart visualizes and styles that result.

Direct import of an R `voronoiResult`, `.rds`, or `.RData` file is not part of this release. That bridge can be evaluated later without changing the editor's purpose. PNG and SVG are export formats, not editable geometry inputs. The portable input contract is documented in [`docs/JSON_FORMAT.md`](docs/JSON_FORMAT.md).

## What you can edit

- Level-wide and per-cell label wording, visibility, font size, weight, color, wrapping, line spacing, letter spacing, and position.
- Independent automatic label maximization for each cell, plus a separate fit-inside-cell filter.
- A centered Level 1 border and a second category-colored rim clipped to the inside of the same polygons.
- Border widths and colors for each hierarchy level, visual cell gaps, figure title, background, and working-area dimensions.
- Legend title, title size, label size, category wording, visibility, order, position, and reserved width.
- Optional canvas growth so larger or wrapped legend text does not cover the treemap.
- Editable JSON projects, clean SVG masters, and scaled PNG exports.

Preview zoom scales the complete canvas—including strokes and gaps—so the proportions seen at 41% match the exported figure rather than leaving borders visually stuck at their 100% width.

## Current polishing defaults

- **Level 1:** labels hidden; 21 px centered border; 21 px visible category-colored inside rim.
- **Level 2:** labels shown; independently maximized automatically; extra fit-inside-cell filter off.
- **Level 3:** labels hidden.
- **Cells:** 0 px visual gap.
- **Legend:** 26 px labels; 450 px reserved width; editable title; grow-canvas option on.

Previously saved editor projects retain their saved settings. These defaults are applied to fresh Python exports.

## Run locally

There is no install or build step. Extract the folder, open Terminal in it, and run:

```bash
python3 -m http.server 8006
```

Then open <http://localhost:8006>. Stop the server with `Control-C`.

On macOS, you can instead double-click `start_mac.command`. If it lost its executable bit while being downloaded or uploaded, run `chmod +x start_mac.command` once. If Gatekeeper blocks it the first time, right-click the file, choose **Open**, and confirm. On Windows, double-click `start_windows.bat` or run:

```powershell
py -m http.server 8006
```

Do not open `index.html` through `file://`; browsers normally prevent it from loading the bundled example JSON. The local Python server avoids that restriction. Editing and export have no backend, analytics, login, CDN, Node, Streamlit, or internet dependency; only the optional upstream links leave your local page.

## Typical workflow

1. Start the local server; a small synthetic demonstration opens automatically.
2. Select **Open project** to load a `.json` or `.voronoi.json` produced by the Python adaptation.
3. Adjust global level styles, borders, title, legend, background, and canvas.
4. Click a cell or visible label for individual edits; drag labels directly on the figure.
5. Choose **Save JSON** to preserve an editable project.
6. Export **SVG** for a publication master or **PNG** for a raster copy.

## Put the source on GitHub

The ZIP is repository-ready. After extracting it, create an empty GitHub repository and upload the **contents** of the `tessellart` folder so that `index.html` and this `README.md` sit at the repository root. Alternatively:

```bash
git init
git add .
git commit -m "Add tessellart"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPOSITORY.git
git push -u origin main
```

Uploading the source does not host or run a backend. The same `python3 -m http.server 8006` command remains the intended local workflow.

## Upstream work, references, and related treemap tools

This project owes its geometry foundation to [`WeightedTreemaps`](https://github.com/m-jahn/WeightedTreemaps), by Michael Jahn, David Leslie, Ahmadou Dicko, Eric Dunipace, and Paul Murrell. The upstream package is distributed under GPL-3 and uses CGAL through `RcppCGAL` for its weighted Voronoi tessellation.

The following references and alternatives are the ones identified by the upstream project:

- Paul Murrell's foundational [Voronoi treemap functions and report](https://www.stat.auckland.ac.nz/~paul/Reports/VoronoiTreemap/voronoiTreeMap.html), on which the upstream tessellation work is based.
- David Leslie's [Java-based Voronoi treemap implementation wrapped in R](https://github.com/dlesl/voronoi_treemap_rJava).
- [`voronoiTreemap`](https://github.com/uRosConf/voronoiTreemap), a JavaScript-based R package for drawing simpler treemaps in a browser; the upstream notes that it is not intended for maps containing hundreds of cells.
- The University of Greifswald's web-based [Bionic Visualization treemap generator](https://bionic-vis.biologie.uni-greifswald.de/).

For the upstream graphical interface and its broader set of options—including sunburst treemaps—use [ShinyTreemaps](https://github.com/m-jahn/ShinyTreemaps) or [launch its hosted app](https://m-jahn.shinyapps.io/ShinyTreemaps/).

## Attribution and license

This downstream project is not affiliated with or endorsed by the authors of `WeightedTreemaps`, `ShinyTreemaps`, CGAL, or the related projects above.

tessellart is distributed under **GNU GPL version 3 only** (`GPL-3.0-only`) to remain compatible with the upstream `WeightedTreemaps` licensing. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the complete terms and acknowledgements.

Copyright © 2026 tessellart contributors.

## Repository files

- `index.html` — application page
- `styles.css` — interface design
- `app.js` — import, editing, rendering, and export logic
- `example.voronoi.json` — small synthetic three-level editing fixture
- `start_mac.command` — optional macOS launcher
- `start_windows.bat` — optional Windows launcher
- `docs/JSON_FORMAT.md` — portable input contract for the Python exporter
- `THIRD_PARTY_NOTICES.md` — upstream acknowledgements and related work
- `LICENSE` — GNU GPL version 3
