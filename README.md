<p align="center">
  <img src="assets/tessellart-logo.png" alt="Tessellart logo" width="160">
</p>

<h1 align="center">tessellart</h1>

<p align="center"><strong>A small browser studio for personalizing weighted Voronoi figures.</strong></p>

<p align="center"><strong><a href="https://emarquezz.github.io/Tessellart/">Open tessellart →</a></strong></p>

tessellart opens weighted Voronoi geometry saved as `.voronoi.json` and lets you refine the figure without recalculating its cells. Labels, borders, colors, legend, canvas, and export settings remain editable while the geometry stays locked.

> [!IMPORTANT]
> ## Create geometry with VoroNest
>
> <p align="center">
>   <a href="https://github.com/emarquezz/VoroNest">
>     <img src="assets/voronest-logo.png" alt="Create a treemap with VoroNest" width="128"><br>
>     <strong>Open VoroNest on GitHub →</strong>
>   </a>
> </p>
>
> **VoroNest generates the geometry. Tessellart personalizes the exported figure.**
>
> Use [`VoroNest`](https://github.com/emarquezz/VoroNest) from Python or Jupyter to calculate a hierarchical weighted Voronoi treemap and export its editable `.voronoi.json` project.

> [!IMPORTANT]
> ## Looking for the original R tools?
>
> **[Explore WeightedTreemaps](https://github.com/m-jahn/WeightedTreemaps)** — the upstream R package for calculating and drawing nested, additively weighted Voronoi and sunburst treemaps.
>
> **[Open ShinyTreemaps](https://m-jahn.shinyapps.io/ShinyTreemaps/)** · **[View its source](https://github.com/m-jahn/ShinyTreemaps)** — Michael Jahn's R/Shiny interface for data upload, treemap generation, and styling.

## Origin story

My M1 Mac and RStudio never quite got along, and I was tired of switching laptops to finish a figure. So I adapted only the Voronoi workflow to Python and made tessellart to personalize the resulting figures. Sunbursts stayed in R. :3

## What tessellart does

[`VoroNest`](https://github.com/emarquezz/VoroNest) calculates the Voronoi geometry; tessellart visualizes and styles its `.voronoi.json` output. The portable format is documented in [`docs/JSON_FORMAT.md`](docs/JSON_FORMAT.md).

A heart-shaped **Tiny Tree of Life** project opens automatically, so you can try the editing controls before loading your own figure. It is a friendly sampler of selected organism groups, not a complete phylogeny. Its names are real examples, while its values and cell areas are synthetic and do not encode abundance, diversity, age, or evolutionary distance.

You can adjust:

- Level-wide and individual label text, visibility, size, weight, color, wrapping, spacing, and position.
- Automatic label maximization and fit filtering.
- Centered hierarchy borders, an additional category-colored inside rim, and visual cell gaps.
- Figure title, background, canvas dimensions, and preview zoom.
- Legend title, label size, category wording, visibility, order, position, and reserved space.
- Editable JSON projects, standalone SVG, and scaled PNG exports.

Preview zoom scales the complete canvas, including text, borders, and gaps, so its proportions match the exported figure.

## Run locally

Serve the folder locally:

```bash
python3 -m http.server 8006
```

Then open <http://localhost:8006>. Serve the folder rather than opening `index.html` directly, because browsers may block the bundled example when using `file://`.

You can also use `start_mac.command` on macOS or `start_windows.bat` on Windows.

## Typical workflow

1. Open tessellart and load a `.json` or `.voronoi.json` project.
2. Adjust level styles, borders, title, legend, background, and canvas.
3. Select a cell for individual edits; drag a visible label directly on the figure.
4. Use **Save JSON** to preserve an editable project.
5. Export **SVG** for a publication master or **PNG** for a raster copy.

## Upstream work and related tools

This project owes its geometry foundation to [`WeightedTreemaps`](https://github.com/m-jahn/WeightedTreemaps), by Michael Jahn and contributors. The upstream package is distributed under GPL-3 and uses CGAL through `RcppCGAL` for its weighted Voronoi tessellation.

The upstream project credits and points to:

- Paul Murrell's foundational [Voronoi treemap functions and report](https://www.stat.auckland.ac.nz/~paul/Reports/VoronoiTreemap/voronoiTreeMap.html).
- David Leslie's [Java-based Voronoi treemap implementation wrapped in R](https://github.com/dlesl/voronoi_treemap_rJava).
- [`voronoiTreemap`](https://github.com/uRosConf/voronoiTreemap), a JavaScript-based R package for simpler browser treemaps.
- The University of Greifswald's [Bionic Visualization treemap generator](https://bionic-vis.biologie.uni-greifswald.de/).

For the upstream graphical interface and its broader options, including sunburst treemaps, use [ShinyTreemaps](https://github.com/m-jahn/ShinyTreemaps) or [launch its hosted app](https://m-jahn.shinyapps.io/ShinyTreemaps/).

## Attribution and license

tessellart is a downstream project and is not affiliated with or endorsed by the authors of `WeightedTreemaps`, `ShinyTreemaps`, CGAL, or the related projects above.

tessellart is distributed under **GNU GPL version 3 only** (`GPL-3.0-only`) to remain compatible with the upstream `WeightedTreemaps` licensing. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the complete terms and acknowledgements.

Copyright © 2026 tessellart contributors.

## Repository files

- `index.html` — application page
- `styles.css` — interface design
- `app.js` — import, editing, rendering, and export logic
- `example.voronoi.json` — synthetic three-level Tiny Tree of Life fixture
- `docs/JSON_FORMAT.md` — portable input contract
- `THIRD_PARTY_NOTICES.md` — upstream acknowledgements and related work
- `LICENSE` — GNU GPL version 3
