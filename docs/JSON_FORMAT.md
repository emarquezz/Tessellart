# JSON input format

tessellart opens portable JSON exported by `weighted-treemaps-python` and JSON saved by the editor itself. It does not directly open R S4 objects, `.rds`, `.RData`, PNG, or SVG files.

## Minimum structure

The only required top-level field is a non-empty `cells` array. Every cell needs a unique `id`, a hierarchy `level`, a name or path, and a polygon with at least three finite `[x, y]` points.

```json
{
  "name": "My treemap",
  "cells": [
    {
      "id": "category-a",
      "parentId": null,
      "level": 1,
      "name": "Category A",
      "path": ["Category A"],
      "polygon": [[0, 0], [500, 0], [500, 500], [0, 500]],
      "categoryColor": "#5cb7d3",
      "fill": "#5cb7d3",
      "label": {
        "anchor": [250, 250],
        "visible": true
      }
    }
  ]
}
```

## Cell fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Recommended | Unique stable identifier. If omitted, the editor creates one. |
| `parentId` | Recommended | Parent cell ID, or `null` for Level 1. |
| `level` | Yes | Positive integer hierarchy level. |
| `name` | Yes | Original cell name. |
| `path` | Recommended | Ordered hierarchy names from Level 1 to this cell. |
| `polygon` or `points` | Yes | Array of at least three numeric `[x, y]` points. |
| `value` | Optional | Numeric source value shown in the cell tooltip. |
| `categoryColor` | Recommended | Six-digit CSS hex color inherited from Level 1. |
| `fill` | Recommended | Six-digit CSS hex fill for this cell. |
| `label.anchor` | Optional | Preferred label anchor in geometry coordinates. The polygon centroid is the fallback. |

Optional top-level `canvas`, `style`, `geometryBounds`, and `hierarchy` metadata from the Python exporter are understood. A JSON saved by the editor also contains `levels` and all polishing choices for a lossless editing round trip.

The browser never changes polygon coordinates or values. It stores presentation changes separately and uses SVG's y-down coordinate system exactly as provided by the Python exporter.
