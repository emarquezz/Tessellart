// SPDX-License-Identifier: GPL-3.0-only
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var HISTORY_LIMIT = 40;
  var project = null;
  var baseline = null;
  var past = [];
  var future = [];
  var previewBase = null;
  var selectedCellId = null;
  var activeLevel = 1;
  var zoom = 0.5;
  var dragState = null;

  function byId(id) { return document.getElementById(id); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function setStatus(message, error) {
    byId("status").textContent = message;
    document.querySelector(".status-dot").style.background = error ? "#bb3b4a" : "#6f9e75";
  }
  function safeFilename(value) {
    var cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || "voronoi-treemap";
  }
  function asPoint(value) {
    if (!Array.isArray(value) || value.length < 2) return null;
    var x = Number(value[0]);
    var y = Number(value[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }
  function hexToRgb(value) {
    var normalized = String(value || "").trim().replace(/^#/, "");
    if (normalized.length === 3) normalized = normalized.split("").map(function (part) { return part + part; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
  }
  function rgbToHex(rgb) {
    return "#" + rgb.map(function (channel) { return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"); }).join("");
  }
  function validHex(value, fallback) {
    return hexToRgb(value) ? String(value).toLowerCase() : fallback;
  }
  function resolveFillColor(overlay, base) {
    var baseValue = validHex(base, "#94a3b8");
    if (typeof overlay !== "string" || !overlay.trim()) return baseValue;
    if (hexToRgb(overlay)) return validHex(overlay, baseValue);
    var match = overlay.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!match) return baseValue;
    var background = hexToRgb(baseValue) || [148, 163, 184];
    var foreground = [Number(match[1]), Number(match[2]), Number(match[3])];
    var alpha = match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1);
    return rgbToHex([
      foreground[0] * alpha + background[0] * (1 - alpha),
      foreground[1] * alpha + background[1] * (1 - alpha),
      foreground[2] * alpha + background[2] * (1 - alpha)
    ]);
  }

  var levelDefaults = {
    "1": { fontSize: 25, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, color: "#ffffff", lineHeight: 1.05, letterSpacing: 0, wrapWidth: 185, borderWidth: 21, borderMode: "background", borderColor: "#ffffff", innerBorderVisible: true, innerBorderWidth: 21, labelsVisible: false, autoFit: false, autoSize: false, autoSizeMin: 5, autoSizeMax: 120, autoSizeMaxLines: 4, fitPadding: 5 },
    "2": { fontSize: 17, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, color: "#111827", lineHeight: 1.08, letterSpacing: 0, wrapWidth: 145, borderWidth: 4, borderMode: "cell", borderColor: "#ffffff", innerBorderVisible: false, innerBorderWidth: 0, labelsVisible: true, autoFit: false, autoSize: true, autoSizeMin: 5, autoSizeMax: 120, autoSizeMaxLines: 4, fitPadding: 5 },
    "3": { fontSize: 12, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 500, color: "#111827", lineHeight: 1.1, letterSpacing: 0, wrapWidth: 96, borderWidth: 1.4, borderMode: "background", borderColor: "#ffffff", innerBorderVisible: false, innerBorderWidth: 0, labelsVisible: false, autoFit: true, autoSize: false, autoSizeMin: 5, autoSizeMax: 96, autoSizeMaxLines: 4, fitPadding: 5 }
  };
  var canvasDefaults = { width: 1400, height: 980, background: "#f7f4ed", padding: 44, cellGap: 0, title: "Voronoi treemap", titleVisible: true, titleSize: 34, titleColor: "#25313b", legendVisible: true, legendPosition: "right", legendSize: 450, legendFontSize: 26, legendTitle: "LEVEL 1", legendTitleVisible: true, legendTitleSize: 25, legendOrder: [], legendGrowCanvas: true };

  function calculateBounds(cells) {
    var minimumX = Infinity; var minimumY = Infinity; var maximumX = -Infinity; var maximumY = -Infinity;
    cells.forEach(function (cell) {
      cell.polygon.forEach(function (point) {
        minimumX = Math.min(minimumX, point[0]); minimumY = Math.min(minimumY, point[1]);
        maximumX = Math.max(maximumX, point[0]); maximumY = Math.max(maximumY, point[1]);
      });
    });
    return Number.isFinite(minimumX) ? { minX: minimumX, minY: minimumY, maxX: maximumX, maxY: maximumY } : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== "object") throw new Error("The project file is not a JSON object.");
    if (!Array.isArray(raw.cells) || !raw.cells.length) throw new Error("The project does not contain any treemap cells.");
    if (raw.cells.length > 10000) throw new Error("This local editor currently accepts at most 10,000 cells per project.");

    var labelsByCell = new Map();
    if (Array.isArray(raw.labels)) {
      raw.labels.forEach(function (label) {
        if (label && typeof label === "object" && label.cellId !== undefined) labelsByCell.set(String(label.cellId), label);
      });
    }
    var seenIds = new Set();
    var cells = raw.cells.map(function (source, index) {
      if (!source || typeof source !== "object") throw new Error("Cell " + (index + 1) + " is invalid.");
      var polygonInput = source.polygon || source.points;
      if (!Array.isArray(polygonInput)) throw new Error("Cell " + (index + 1) + " has no polygon.");
      var polygon = polygonInput.map(asPoint).filter(Boolean);
      if (polygon.length < 3) throw new Error("Cell " + (index + 1) + " has fewer than three valid polygon points.");
      var path = Array.isArray(source.path) ? source.path.map(String) : [String(source.name || ("Cell " + (index + 1)))];
      var name = String(source.name || path[path.length - 1] || ("Cell " + (index + 1)));
      var id = String(source.id || ("cell-" + (index + 1)));
      if (seenIds.has(id)) throw new Error("The project contains a duplicate cell ID: " + id);
      seenIds.add(id);
      var labelSource = source.label && typeof source.label === "object" ? source.label : (labelsByCell.get(id) || {});
      var overrides = labelSource.overrides && typeof labelSource.overrides === "object" ? labelSource.overrides : {};
      var categoryColor = validHex(source.categoryColor || source.category_color || source.color, "#94a3b8");
      var legendSource = source.legend && typeof source.legend === "object" ? source.legend : {};
      var legendLabelSource = legendSource.text;
      if (legendLabelSource === undefined) legendLabelSource = source.legendLabel === undefined ? source.legend_label : source.legendLabel;
      return {
        id: id,
        parentId: source.parentId === undefined || source.parentId === null ? null : String(source.parentId),
        level: Math.max(1, Math.round(finite(source.level, path.length || 1))),
        name: name,
        path: path,
        value: source.value === undefined ? null : finite(source.value, 0),
        polygon: polygon,
        categoryColor: categoryColor,
        fill: resolveFillColor(source.fill || source.fillColor || source.color, categoryColor),
        legend: {
          text: legendLabelSource === null ? "" : String(legendLabelSource === undefined ? name : legendLabelSource),
          visible: legendSource.visible === undefined ? true : Boolean(legendSource.visible)
        },
        label: {
          text: String(labelSource.text === undefined ? name : labelSource.text),
          anchor: asPoint(labelSource.anchor || labelSource.position || source.anchor || source.site),
          offset: asPoint(labelSource.offset) || [0, 0],
          visible: labelSource.visible === undefined ? true : Boolean(labelSource.visible),
          fontSize: overrides.fontSize === undefined ? (labelSource.fontSize == null ? null : finite(labelSource.fontSize, 12)) : (overrides.fontSize === null ? null : finite(overrides.fontSize, 12)),
          color: overrides.color === undefined ? (labelSource.color === undefined ? null : validHex(labelSource.color, null)) : validHex(overrides.color, null),
          fontWeight: overrides.fontWeight === undefined ? (labelSource.fontWeight == null ? null : finite(labelSource.fontWeight, 500)) : (overrides.fontWeight === null ? null : finite(overrides.fontWeight, 500)),
          locked: Boolean(labelSource.locked)
        }
      };
    });

    var maxLevel = Math.max.apply(null, cells.map(function (cell) { return cell.level; }));
    var hasEditorLevelSettings = Boolean(raw.levels && !Array.isArray(raw.levels) && typeof raw.levels === "object");
    var rawLevels = hasEditorLevelSettings ? raw.levels : {};
    var exporterStyle = raw.style && typeof raw.style === "object" ? raw.style : {};
    var exporterLevels = Array.isArray(exporterStyle.levels) ? exporterStyle.levels : [];
    var levels = {};
    for (var level = 1; level <= maxLevel; level += 1) {
      var key = String(level);
      var fallback = clone(levelDefaults[String(Math.min(level, 3))] || levelDefaults["3"]);
      var direct = rawLevels[key] && typeof rawLevels[key] === "object" ? rawLevels[key] : {};
      var exported = exporterLevels.find(function (item) { return item && Number(item.level) === level; });
      var labelStyle = exported && exported.label && typeof exported.label === "object" ? exported.label : {};
      var borderStyle = exported && exported.border && typeof exported.border === "object" ? exported.border : {};
      var borderMode = String(borderStyle.colorMode || "");
      var fromExporter = exported ? {
        fontSize: finite(labelStyle.fontSize, fallback.fontSize),
        fontFamily: String(labelStyle.fontFamily || fallback.fontFamily),
        fontWeight: finite(labelStyle.fontWeight, fallback.fontWeight),
        color: validHex(labelStyle.color, fallback.color),
        lineHeight: finite(labelStyle.lineHeight, fallback.lineHeight),
        letterSpacing: finite(labelStyle.letterSpacing, fallback.letterSpacing),
        borderWidth: borderStyle.visible === false ? 0 : finite(borderStyle.width, fallback.borderWidth),
        borderMode: borderMode === "cell" || borderMode === "category" ? "cell" : "custom",
        borderColor: validHex(borderStyle.color, fallback.borderColor),
        labelsVisible: labelStyle.visible === undefined ? fallback.labelsVisible : Boolean(labelStyle.visible),
        autoFit: labelStyle.autoFit === undefined ? true : Boolean(labelStyle.autoFit)
      } : {};
      levels[key] = Object.assign({}, fallback, fromExporter, direct);
      levels[key].color = validHex(levels[key].color, fallback.color);
      levels[key].borderColor = validHex(levels[key].borderColor, fallback.borderColor);
      if (["cell", "custom", "background"].indexOf(levels[key].borderMode) < 0) levels[key].borderMode = "custom";
    }

    // A fresh Python export carries renderer style hints. The polisher starts
    // those files with this editing preset. A JSON saved by this editor has a
    // direct `levels` object, so every saved choice takes precedence instead.
    if (!hasEditorLevelSettings) {
      if (levels["1"]) {
        levels["1"].borderWidth = 21;
        levels["1"].innerBorderVisible = true;
        levels["1"].innerBorderWidth = 21;
      }
      if (levels["2"]) {
        levels["2"].labelsVisible = true;
        levels["2"].autoFit = false;
        levels["2"].autoSize = true;
      }
      if (levels["3"]) levels["3"].labelsVisible = false;
    }

    var rawCanvas = raw.canvas && typeof raw.canvas === "object" ? raw.canvas : {};
    var titleStyle = exporterStyle.title && typeof exporterStyle.title === "object" ? exporterStyle.title : {};
    var legendStyle = exporterStyle.legend && typeof exporterStyle.legend === "object" ? exporterStyle.legend : {};
    var legendTitleStyle = legendStyle.title && typeof legendStyle.title === "object" ? legendStyle.title : {};
    var rawProject = raw.project && typeof raw.project === "object" ? raw.project : {};
    var rawHierarchy = raw.hierarchy && typeof raw.hierarchy === "object" ? raw.hierarchy : {};
    var width = Math.max(320, Math.round(finite(rawCanvas.width, canvasDefaults.width)));
    var height = Math.max(240, Math.round(finite(rawCanvas.height, canvasDefaults.height)));
    // Legend dimensions are editor workspace choices, not geometry hints.
    // Explicit editor canvas fields win; fresh imports get the editor preset.
    var legendSizeSource = rawCanvas.legendSize === undefined ? canvasDefaults.legendSize : rawCanvas.legendSize;
    var resolvedLegendSize = finite(legendSizeSource, canvasDefaults.legendSize);
    if (resolvedLegendSize > 0 && resolvedLegendSize <= 1) resolvedLegendSize *= width;
    var resolvedLegendFontSize = clamp(finite(rawCanvas.legendFontSize, canvasDefaults.legendFontSize), 8, 80);
    var exportedLegendSize = finite(legendStyle.size, 0);
    if (exportedLegendSize > 0 && exportedLegendSize <= 1) exportedLegendSize *= width;
    if (!hasEditorLevelSettings && rawCanvas.legendSize === undefined && canvasDefaults.legendGrowCanvas && legendStyle.visible !== false && rawCanvas.legendVisible !== false && exportedLegendSize > 0 && resolvedLegendSize > exportedLegendSize) {
      width += Math.round(resolvedLegendSize - exportedLegendSize);
    }
    var exportedLegendTitle = typeof legendStyle.title === "string" || typeof legendStyle.title === "number" ? legendStyle.title : undefined;
    var resolvedLegendTitleSource = rawCanvas.legendTitle === undefined ? (legendTitleStyle.text === undefined ? (exportedLegendTitle === undefined ? canvasDefaults.legendTitle : exportedLegendTitle) : legendTitleStyle.text) : rawCanvas.legendTitle;
    var resolvedLegendTitle = resolvedLegendTitleSource === null ? "" : String(resolvedLegendTitleSource);
    var rootIds = cells.filter(function (cell) { return cell.level === 1; }).map(function (cell) { return cell.id; });
    var rootIdSet = new Set(rootIds);
    var orderSeen = new Set();
    var legendOrderSource = Array.isArray(rawCanvas.legendOrder) ? rawCanvas.legendOrder : (Array.isArray(legendStyle.order) ? legendStyle.order : (Array.isArray(rawHierarchy.rootIds) ? rawHierarchy.rootIds : []));
    var legendOrder = legendOrderSource.map(String).filter(function (id) {
      if (!rootIdSet.has(id) || orderSeen.has(id)) return false;
      orderSeen.add(id); return true;
    });
    rootIds.forEach(function (id) { if (!orderSeen.has(id)) { orderSeen.add(id); legendOrder.push(id); } });
    var canvas = Object.assign({}, canvasDefaults, rawCanvas, {
      width: width,
      height: height,
      background: validHex(rawCanvas.background, canvasDefaults.background),
      padding: Math.max(0, finite(rawCanvas.padding, canvasDefaults.padding)),
      cellGap: Math.max(0, finite(rawCanvas.cellGap, canvasDefaults.cellGap)),
      title: String(titleStyle.text === undefined ? (rawProject.title || rawCanvas.title || canvasDefaults.title) : titleStyle.text),
      titleVisible: titleStyle.visible === undefined ? (rawCanvas.titleVisible === undefined ? canvasDefaults.titleVisible : Boolean(rawCanvas.titleVisible)) : Boolean(titleStyle.visible),
      titleSize: finite(titleStyle.fontSize, finite(rawCanvas.titleSize, canvasDefaults.titleSize)),
      titleColor: validHex(titleStyle.color || rawCanvas.titleColor, canvasDefaults.titleColor),
      legendVisible: legendStyle.visible === undefined ? (rawCanvas.legendVisible === undefined ? canvasDefaults.legendVisible : Boolean(rawCanvas.legendVisible)) : Boolean(legendStyle.visible),
      legendPosition: String(legendStyle.position || rawCanvas.legendPosition) === "left" ? "left" : "right",
      legendSize: Math.max(110, resolvedLegendSize),
      legendFontSize: resolvedLegendFontSize,
      legendTitle: resolvedLegendTitle,
      legendTitleVisible: rawCanvas.legendTitleVisible === undefined ? (legendTitleStyle.visible === undefined ? canvasDefaults.legendTitleVisible : Boolean(legendTitleStyle.visible)) : Boolean(rawCanvas.legendTitleVisible),
      legendTitleSize: clamp(finite(rawCanvas.legendTitleSize, finite(legendTitleStyle.fontSize, finite(legendStyle.titleFontSize, Math.max(11, resolvedLegendFontSize * .95)))), 8, 72),
      legendOrder: legendOrder,
      legendGrowCanvas: rawCanvas.legendGrowCanvas === undefined ? canvasDefaults.legendGrowCanvas : Boolean(rawCanvas.legendGrowCanvas)
    });

    var viewBox = Array.isArray(rawCanvas.viewBox) ? rawCanvas.viewBox.map(Number) : null;
    var calculated = calculateBounds(cells);
    var supplied = raw.geometryBounds || raw.geometry_bounds;
    var bounds = supplied && typeof supplied === "object" ? supplied : (viewBox && viewBox.length >= 4 && viewBox.every(Number.isFinite) ? { minX: viewBox[0], minY: viewBox[1], maxX: viewBox[0] + viewBox[2], maxY: viewBox[1] + viewBox[3] } : {});
    var geometryBounds = {
      minX: finite(bounds.minX === undefined ? bounds.min_x : bounds.minX, calculated.minX),
      minY: finite(bounds.minY === undefined ? bounds.min_y : bounds.minY, calculated.minY),
      maxX: finite(bounds.maxX === undefined ? bounds.max_x : bounds.maxX, calculated.maxX),
      maxY: finite(bounds.maxY === undefined ? bounds.max_y : bounds.maxY, calculated.maxY)
    };

    return {
      schema: "weighted-treemaps-editor",
      schemaVersion: 1,
      name: String(raw.name || rawProject.name || "Untitled treemap"),
      geometryFit: String(rawCanvas.preserveAspectRatio || raw.geometryFit || "") === "none" || raw.geometryFit === "stretch" ? "stretch" : "contain",
      geometryBounds: geometryBounds,
      source: raw.source || { generator: raw.generator || null, layout: raw.layout || null },
      cells: cells,
      levels: levels,
      canvas: canvas
    };
  }

  function polygonArea(points) {
    var area = 0;
    for (var index = 0; index < points.length; index += 1) {
      var current = points[index]; var next = points[(index + 1) % points.length];
      area += current[0] * next[1] - next[0] * current[1];
    }
    return Math.abs(area) / 2;
  }
  function polygonCentroid(points) {
    var twiceArea = 0; var x = 0; var y = 0;
    for (var index = 0; index < points.length; index += 1) {
      var current = points[index]; var next = points[(index + 1) % points.length];
      var cross = current[0] * next[1] - next[0] * current[1];
      twiceArea += cross; x += (current[0] + next[0]) * cross; y += (current[1] + next[1]) * cross;
    }
    if (Math.abs(twiceArea) < 1e-9) {
      return [points.reduce(function (sum, point) { return sum + point[0]; }, 0) / points.length, points.reduce(function (sum, point) { return sum + point[1]; }, 0) / points.length];
    }
    return [x / (3 * twiceArea), y / (3 * twiceArea)];
  }
  function pointInPolygon(point, polygon) {
    var inside = false;
    for (var current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
      var first = polygon[current]; var second = polygon[previous];
      var intersects = (first[1] > point[1]) !== (second[1] > point[1]) && point[0] < ((second[0] - first[0]) * (point[1] - first[1])) / ((second[1] - first[1]) || 1e-12) + first[0];
      if (intersects) inside = !inside;
    }
    return inside;
  }
  function boxesOverlap(first, second, padding) {
    padding = padding === undefined ? 3 : padding;
    return !(first.right + padding < second.left || first.left - padding > second.right || first.bottom + padding < second.top || first.top - padding > second.bottom);
  }
  var measurementContext = null;
  function lineWidth(text, fontSize, style) {
    if (!measurementContext) measurementContext = document.createElement("canvas").getContext("2d");
    var spacing = Math.max(0, String(text).length - 1) * style.letterSpacing;
    if (!measurementContext) return String(text).length * fontSize * .54 + spacing;
    measurementContext.font = (style.fontWeight || 400) + " " + fontSize + "px " + style.fontFamily;
    return measurementContext.measureText(String(text)).width + spacing;
  }
  function wrapLabel(text, width, fontSize) {
    var maximumCharacters = Math.max(4, Math.floor(width / Math.max(fontSize * .56, 1)));
    return String(text).split(/\r?\n/).reduce(function (all, explicitLine) {
      var words = explicitLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { all.push(""); return all; }
      var lines = []; var current = "";
      words.forEach(function (word) {
        var candidate = current ? current + " " + word : word;
        if (candidate.length <= maximumCharacters || !current) current = candidate;
        else { lines.push(current); current = word; }
      });
      if (current) lines.push(current);
      return all.concat(lines);
    }, []);
  }
  function wrapLabelMeasured(text, width, fontSize, style) {
    var explicitLines = String(text).split(/\r?\n/);
    if (explicitLines.length > 1) return explicitLines.map(function (line) { return line.trim(); });
    return explicitLines.reduce(function (all, explicitLine) {
      var words = explicitLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { all.push(""); return all; }
      var lines = []; var current = "";
      words.forEach(function (word) {
        var candidate = current ? current + " " + word : word;
        if (!current || lineWidth(candidate, fontSize, style) <= width) current = candidate;
        else { lines.push(current); current = word; }
      });
      if (current) lines.push(current);
      return all.concat(lines);
    }, []);
  }

  function wrapLegendText(text, width, fontSize, style) {
    return String(text).split(/\r?\n/).reduce(function (all, explicitLine) {
      return all.concat(wrapLabelMeasured(explicitLine, width, fontSize, style));
    }, []);
  }

  function getLayout() {
    var canvas = project.canvas; var bounds = project.geometryBounds;
    var titleSpace = canvas.titleVisible && canvas.title ? canvas.titleSize * 1.75 : 0;
    var maximumLegendWidth = Math.max(80, canvas.width - canvas.padding * 2 - 120);
    var legendWidth = canvas.legendVisible ? Math.min(canvas.legendSize, maximumLegendWidth) : 0;
    var legendSpace = canvas.legendVisible ? legendWidth + 28 : 0;
    var plotX = canvas.padding + (canvas.legendVisible && canvas.legendPosition === "left" ? legendSpace : 0);
    var plotY = canvas.padding + titleSpace;
    var plotWidth = Math.max(10, canvas.width - canvas.padding * 2 - legendSpace);
    var plotHeight = Math.max(10, canvas.height - canvas.padding * 2 - titleSpace);
    var geometryWidth = Math.max(1e-9, bounds.maxX - bounds.minX);
    var geometryHeight = Math.max(1e-9, bounds.maxY - bounds.minY);
    var commonScale = Math.min(plotWidth / geometryWidth, plotHeight / geometryHeight);
    var scaleX = project.geometryFit === "stretch" ? plotWidth / geometryWidth : commonScale;
    var scaleY = project.geometryFit === "stretch" ? plotHeight / geometryHeight : commonScale;
    var drawnWidth = geometryWidth * scaleX; var drawnHeight = geometryHeight * scaleY;
    var tx = plotX + (plotWidth - drawnWidth) / 2 - bounds.minX * scaleX;
    var ty = plotY + (plotHeight - drawnHeight) / 2 - bounds.minY * scaleY;
    return {
      plotX: plotX, plotY: plotY, plotWidth: plotWidth, plotHeight: plotHeight,
      scaleX: scaleX, scaleY: scaleY, tx: tx, ty: ty,
      legendX: canvas.legendPosition === "right" ? canvas.width - canvas.padding - legendWidth : canvas.padding,
      legendWidth: legendWidth,
      transform: function (point) { return [tx + point[0] * scaleX, ty + point[1] * scaleY]; }
    };
  }

  function legendCellsInOrder() {
    var roots = project.cells.filter(function (cell) { return cell.level === 1; });
    var byCellId = new Map(roots.map(function (cell) { return [cell.id, cell]; }));
    var included = new Set();
    var ordered = [];
    (project.canvas.legendOrder || []).forEach(function (id) {
      var cell = byCellId.get(String(id));
      if (cell && !included.has(cell.id)) { included.add(cell.id); ordered.push(cell); }
    });
    roots.forEach(function (cell) { if (!included.has(cell.id)) ordered.push(cell); });
    return ordered;
  }

  function getLegendMetrics(layout) {
    var canvas = project.canvas;
    var fontSize = canvas.legendFontSize;
    var titleSize = canvas.legendTitleSize;
    var swatchSize = clamp(fontSize * 1.45, 18, 38);
    var textX = swatchSize + 10;
    var lineStep = fontSize * 1.15;
    var titleLineStep = titleSize * 1.15;
    var rowGap = Math.max(8, fontSize * .25);
    var textStyle = { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 600, letterSpacing: 0 };
    var titleStyle = { fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, letterSpacing: 0 };
    var roots = legendCellsInOrder().filter(function (cell) { return cell.legend.visible; });
    var showTitle = canvas.legendTitleVisible && Boolean(String(canvas.legendTitle).trim());
    var titleLines = showTitle ? wrapLegendText(canvas.legendTitle, Math.max(20, layout.legendWidth), titleSize, titleStyle) : [];
    var titleHeight = titleLines.length ? titleSize + (titleLines.length - 1) * titleLineStep : 0;
    var titleGap = titleLines.length && roots.length ? Math.max(10, fontSize * .35) : 0;
    var cursorY = titleHeight + titleGap;
    var entries = roots.map(function (cell, index) {
      var lines = wrapLegendText(cell.legend.text, Math.max(20, layout.legendWidth - textX), fontSize, textStyle);
      var textHeight = fontSize + Math.max(0, lines.length - 1) * lineStep;
      var height = Math.max(swatchSize, textHeight);
      var entry = { cell: cell, lines: lines, y: cursorY, height: height };
      cursorY += height + (index < roots.length - 1 ? rowGap : 0);
      return entry;
    });
    return {
      fontSize: fontSize,
      titleSize: titleSize,
      titleLines: titleLines,
      titleLineStep: titleLineStep,
      swatchSize: swatchSize,
      textX: textX,
      lineStep: lineStep,
      textStyle: textStyle,
      titleStyle: titleStyle,
      entries: entries,
      requiredHeight: cursorY
    };
  }

  function growCanvasToFitLegend() {
    if (!project || !project.canvas.legendVisible || !project.canvas.legendGrowCanvas) return;
    var layout = getLayout();
    var metrics = getLegendMetrics(layout);
    var requiredHeight = Math.ceil(layout.plotY + 10 + metrics.requiredHeight + project.canvas.padding);
    if (requiredHeight > project.canvas.height) project.canvas.height = requiredHeight;
  }

  function svgElement(name, attributes, text) {
    var element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      if (attributes[key] !== null && attributes[key] !== undefined) element.setAttribute(key, String(attributes[key]));
    });
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function polygonPoints(points) { return points.map(function (point) { return point[0] + "," + point[1]; }).join(" "); }
  function borderStroke(cell, style) {
    if (style.borderMode === "cell") return cell.fill;
    if (style.borderMode === "background") return project.canvas.background;
    return style.borderColor;
  }
  function canvasPolygonBounds(polygon) {
    return {
      minX: Math.min.apply(null, polygon.map(function (point) { return point[0]; })),
      minY: Math.min.apply(null, polygon.map(function (point) { return point[1]; })),
      maxX: Math.max.apply(null, polygon.map(function (point) { return point[0]; })),
      maxY: Math.max.apply(null, polygon.map(function (point) { return point[1]; }))
    };
  }
  function cross(first, second, third) {
    return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
  }
  function edgesProperlyCross(firstA, firstB, secondA, secondB) {
    var epsilon = 1e-7;
    var firstSideA = cross(firstA, firstB, secondA); var firstSideB = cross(firstA, firstB, secondB);
    var secondSideA = cross(secondA, secondB, firstA); var secondSideB = cross(secondA, secondB, firstB);
    return firstSideA * firstSideB < -epsilon && secondSideA * secondSideB < -epsilon;
  }
  function boxInsidePolygon(box, polygon) {
    var corners = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]];
    var rectangleEdges = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
    for (var edgeIndex = 0; edgeIndex < rectangleEdges.length; edgeIndex += 1) {
      for (var polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
        if (edgesProperlyCross(rectangleEdges[edgeIndex][0], rectangleEdges[edgeIndex][1], polygon[polygonIndex], polygon[(polygonIndex + 1) % polygon.length])) return false;
      }
    }
    var samples = 10;
    for (var index = 0; index <= samples; index += 1) {
      var ratio = index / samples;
      var x = box.left + (box.right - box.left) * ratio;
      var y = box.top + (box.bottom - box.top) * ratio;
      if (!pointInPolygon([x, box.top], polygon) || !pointInPolygon([x, box.bottom], polygon) || !pointInPolygon([box.left, y], polygon) || !pointInPolygon([box.right, y], polygon)) return false;
    }
    return pointInPolygon([(box.left + box.right) / 2, (box.top + box.bottom) / 2], polygon);
  }
  function makeLabelLayout(cell, style, layout, fontSize, wrapWidth, measuredWrapping) {
    var anchor = layout.transform(cell.label.anchor || polygonCentroid(cell.polygon));
    var x = anchor[0] + cell.label.offset[0]; var y = anchor[1] + cell.label.offset[1];
    var lines = measuredWrapping ? wrapLabelMeasured(cell.label.text, wrapWidth, fontSize, style) : wrapLabel(cell.label.text, wrapWidth, fontSize);
    var width = Math.max.apply(null, lines.map(function (line) { return lineWidth(line, fontSize, style); }).concat([1]));
    var height = Math.max(1, lines.length) * fontSize * style.lineHeight;
    var safety = Math.max(2, fontSize * .045) + (style.autoSize ? finite(style.fitPadding, 5) : 0);
    return {
      x: x,
      y: y,
      fontSize: fontSize,
      lines: lines,
      box: { left: x - width / 2 - safety, right: x + width / 2 + safety, top: y - height / 2 - safety, bottom: y + height / 2 + safety }
    };
  }
  function largestFittingLabel(cell, style, layout) {
    var polygon = cell.polygon.map(layout.transform);
    var bounds = canvasPolygonBounds(polygon);
    var borderPadding = Math.max(4, style.borderWidth * .75);
    var availableWidth = Math.max(8, bounds.maxX - bounds.minX - borderPadding * 2);
    var minimum = Math.max(3, finite(style.autoSizeMin, 5));
    var maximum = Math.max(minimum, finite(style.autoSizeMax, 120));
    var best = null; var low = minimum; var high = maximum;
    for (var iteration = 0; iteration < 12; iteration += 1) {
      var candidateSize = (low + high) / 2;
      var candidate = makeLabelLayout(cell, style, layout, candidateSize, availableWidth, true);
      if (candidate.lines.length <= finite(style.autoSizeMaxLines, 4) && boxInsidePolygon(candidate.box, polygon)) { best = candidate; low = candidateSize; }
      else high = candidateSize;
    }
    if (!best) {
      var minimumCandidate = makeLabelLayout(cell, style, layout, minimum, availableWidth, true);
      if (minimumCandidate.lines.length <= finite(style.autoSizeMaxLines, 4) && boxInsidePolygon(minimumCandidate.box, polygon)) best = minimumCandidate;
    }
    if (best) best.fontSize = Math.round(best.fontSize * 10) / 10;
    return best;
  }
  function labelLayout(cell, style, layout) {
    var effectiveStyle = Object.assign({}, style, { fontWeight: cell.label.fontWeight === null ? style.fontWeight : cell.label.fontWeight });
    if (effectiveStyle.autoSize && cell.label.fontSize === null) return largestFittingLabel(cell, effectiveStyle, layout);
    var fontSize = cell.label.fontSize === null ? effectiveStyle.fontSize : cell.label.fontSize;
    return makeLabelLayout(cell, effectiveStyle, layout, fontSize, effectiveStyle.wrapWidth, false);
  }
  function visibleLabelLayouts(layout) {
    var accepted = [];
    var visible = new Map();
    project.cells.filter(function (cell) {
      var style = project.levels[String(cell.level)];
      return cell.level !== 1 && style && style.labelsVisible && cell.label.visible && Boolean(cell.label.text);
    }).sort(function (first, second) { return first.level - second.level || polygonArea(second.polygon) - polygonArea(first.polygon); }).forEach(function (cell) {
      var style = project.levels[String(cell.level)];
      var resolved = labelLayout(cell, style, layout);
      if (!resolved) return;
      if (style.autoFit && !cell.label.locked) {
        var canvasPolygon = cell.polygon.map(layout.transform);
        if (!boxInsidePolygon(resolved.box, canvasPolygon)) return;
        if (accepted.some(function (other) { return boxesOverlap(resolved.box, other); })) return;
      }
      accepted.push(resolved.box); visible.set(cell.id, resolved);
    });
    return visible;
  }

  function renderSvg() {
    if (!project) return;
    var svg = byId("treemap");
    var canvas = project.canvas;
    var layout = getLayout();
    var maxLevel = Math.max.apply(null, project.cells.map(function (cell) { return cell.level; }));
    var labelLayouts = visibleLabelLayouts(layout);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 " + canvas.width + " " + canvas.height);
    svg.setAttribute("width", canvas.width);
    svg.setAttribute("height", canvas.height);
    svg.style.width = (canvas.width * zoom) + "px";
    svg.style.height = (canvas.height * zoom) + "px";
    byId("canvas-stage").style.width = (canvas.width * zoom + 56) + "px";
    byId("canvas-stage").style.height = (canvas.height * zoom + 56) + "px";

    svg.appendChild(svgElement("title", { id: "svg-title" }, canvas.title || project.name));
    svg.appendChild(svgElement("desc", { id: "svg-description" }, "Editable hierarchical weighted Voronoi treemap with " + project.cells.length + " calculated cells."));
    // Keep the live DOM light; serializeSvg() injects the complete editable
    // project only when the user exports a standalone SVG.
    svg.appendChild(svgElement("metadata", { "data-schema": "weighted-treemaps-editor" }, ""));
    svg.appendChild(svgElement("rect", { width: "100%", height: "100%", fill: canvas.background }));

    if (canvas.titleVisible && canvas.title) {
      svg.appendChild(svgElement("text", { x: canvas.width / 2, y: canvas.padding + canvas.titleSize, "text-anchor": "middle", "font-family": "Arial, Helvetica, sans-serif", "font-size": canvas.titleSize, "font-weight": 700, fill: canvas.titleColor }, canvas.title));
    }

    // Render polygons directly in final canvas coordinates. The root SVG can
    // then scale the entire preview—fills, gaps, and both border strokes—as a
    // single unit while exports retain their configured canvas-pixel widths.
    var canvasPolygonPoints = new Map();
    project.cells.forEach(function (cell) {
      canvasPolygonPoints.set(cell.id, polygonPoints(cell.polygon.map(function (point) { return layout.transform(point); })));
    });

    var fillGroup = svgElement("g", { "data-layer": "fills" });
    project.cells.filter(function (cell) { return cell.level === maxLevel; }).forEach(function (cell) {
      var polygon = svgElement("polygon", { points: canvasPolygonPoints.get(cell.id), fill: cell.fill, stroke: canvas.background, "stroke-width": canvas.cellGap * 2, "stroke-linejoin": "round", "data-cell-id": cell.id, class: "cell-fill" });
      polygon.appendChild(svgElement("title", {}, cell.path.join(" › ") + (cell.value === null ? "" : " · " + cell.value)));
      polygon.addEventListener("click", function (event) { event.stopPropagation(); selectCell(cell.id); });
      fillGroup.appendChild(polygon);
    });
    svg.appendChild(fillGroup);

    var borderDefinitions = svgElement("defs", { "data-layer": "border-clips" });
    var borderGroup = svgElement("g", { "data-layer": "borders" });
    project.cells.slice().sort(function (first, second) { return second.level - first.level; }).forEach(function (cell, borderIndex) {
      var style = project.levels[String(cell.level)];
      var points = canvasPolygonPoints.get(cell.id);
      if (style.innerBorderVisible && style.innerBorderWidth > 0) {
        var clipId = "inner-rim-clip-" + borderIndex;
        var clip = svgElement("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
        clip.appendChild(svgElement("polygon", { points: points }));
        borderDefinitions.appendChild(clip);
        borderGroup.appendChild(svgElement("polygon", {
          points: points,
          fill: "none",
          stroke: validHex(cell.categoryColor, cell.fill),
          "stroke-width": style.borderWidth + style.innerBorderWidth * 2,
          "stroke-linejoin": "round",
          "clip-path": "url(#" + clipId + ")",
          "pointer-events": "none",
          "data-border-role": "inside-category-rim"
        }));
      }
      var polygon = svgElement("polygon", { points: points, fill: "none", stroke: borderStroke(cell, style), "stroke-width": style.borderWidth, "stroke-linejoin": "round", "pointer-events": "stroke", "data-cell-id": cell.id, class: "cell-border" });
      polygon.addEventListener("click", function (event) { event.stopPropagation(); selectCell(cell.id); });
      borderGroup.appendChild(polygon);
    });
    svg.appendChild(borderDefinitions);
    svg.appendChild(borderGroup);

    var labelGroup = svgElement("g", { "data-layer": "labels" });
    project.cells.slice().sort(function (first, second) { return second.level - first.level; }).forEach(function (cell) {
      var resolved = labelLayouts.get(cell.id);
      if (!resolved) return;
      var style = project.levels[String(cell.level)];
      var x = resolved.x; var y = resolved.y;
      var fontSize = resolved.fontSize;
      var lines = resolved.lines;
      var lineStep = fontSize * style.lineHeight;
      var firstDy = -((lines.length - 1) * lineStep) / 2;
      var text = svgElement("text", { x: x, y: y, "text-anchor": "middle", "dominant-baseline": "central", "font-family": style.fontFamily, "font-size": fontSize, "font-weight": cell.label.fontWeight === null ? style.fontWeight : cell.label.fontWeight, "letter-spacing": style.letterSpacing, fill: cell.label.color || style.color, "paint-order": "stroke", stroke: cell.level === 1 ? "rgba(0,0,0,0.16)" : "none", "stroke-width": cell.level === 1 ? 1.2 : 0, class: "cell-label" + (dragState && dragState.cellId === cell.id ? " dragging" : ""), "data-cell-id": cell.id });
      lines.forEach(function (line, index) { text.appendChild(svgElement("tspan", { x: x, dy: index === 0 ? firstDy : lineStep }, line)); });
      text.addEventListener("click", function (event) { event.stopPropagation(); selectCell(cell.id); });
      text.addEventListener("pointerdown", function (event) { startLabelDrag(event, cell.id); });
      labelGroup.appendChild(text);
    });
    svg.appendChild(labelGroup);

    if (canvas.legendVisible) {
      var legendMetrics = getLegendMetrics(layout);
      var legendClipId = "legend-column-clip";
      var legendDefinitions = svgElement("defs", { "data-layer": "legend-clip" });
      var legendClip = svgElement("clipPath", { id: legendClipId, clipPathUnits: "userSpaceOnUse" });
      legendClip.appendChild(svgElement("rect", { x: 0, y: 0, width: layout.legendWidth, height: Math.max(0, canvas.height - layout.plotY - canvas.padding - 10) }));
      legendDefinitions.appendChild(legendClip);
      svg.appendChild(legendDefinitions);
      var legend = svgElement("g", { "data-layer": "legend", transform: "translate(" + layout.legendX + " " + (layout.plotY + 10) + ")", "clip-path": "url(#" + legendClipId + ")" });
      if (legendMetrics.titleLines.length) {
        var legendTitle = svgElement("text", { x: 0, y: 0, "dominant-baseline": "hanging", "font-family": legendMetrics.titleStyle.fontFamily, "font-size": legendMetrics.titleSize, "font-weight": legendMetrics.titleStyle.fontWeight, fill: canvas.titleColor });
        legendMetrics.titleLines.forEach(function (line, lineIndex) { legendTitle.appendChild(svgElement("tspan", { x: 0, y: lineIndex * legendMetrics.titleLineStep }, line)); });
        legend.appendChild(legendTitle);
      }
      legendMetrics.entries.forEach(function (entry) {
        var group = svgElement("g", { transform: "translate(0 " + entry.y + ")", class: "legend-entry" + (selectedCellId === entry.cell.id ? " selected" : ""), "data-cell-id": entry.cell.id });
        group.appendChild(svgElement("rect", { y: (entry.height - legendMetrics.swatchSize) / 2, width: legendMetrics.swatchSize, height: legendMetrics.swatchSize, rx: Math.min(7, legendMetrics.swatchSize * .22), fill: entry.cell.fill }));
        var firstDy = -((entry.lines.length - 1) * legendMetrics.lineStep) / 2;
        var text = svgElement("text", { x: legendMetrics.textX, y: entry.height / 2, "dominant-baseline": "central", "font-family": legendMetrics.textStyle.fontFamily, "font-size": legendMetrics.fontSize, "font-weight": legendMetrics.textStyle.fontWeight, fill: canvas.titleColor });
        entry.lines.forEach(function (line, lineIndex) { text.appendChild(svgElement("tspan", { x: legendMetrics.textX, dy: lineIndex === 0 ? firstDy : legendMetrics.lineStep }, line)); });
        group.appendChild(text);
        group.addEventListener("click", function (event) { event.stopPropagation(); selectCell(entry.cell.id); });
        legend.appendChild(group);
      });
      svg.appendChild(legend);
    }

    var selected = selectedCell();
    if (selected) {
      var selection = svgElement("g", { "data-editor-only": "true" });
      selection.appendChild(svgElement("polygon", { points: canvasPolygonPoints.get(selected.id), fill: "none", stroke: "#111827", "stroke-width": 2.5, "stroke-dasharray": "7 5", "pointer-events": "none" }));
      svg.appendChild(selection);
    }
  }

  function renderTabs() {
    var tabs = byId("level-tabs");
    while (tabs.firstChild) tabs.removeChild(tabs.firstChild);
    var maxLevel = Math.max.apply(null, project.cells.map(function (cell) { return cell.level; }));
    if (activeLevel > maxLevel) activeLevel = 1;
    for (var level = 1; level <= maxLevel; level += 1) {
      (function (levelNumber) {
        var button = document.createElement("button");
        button.type = "button"; button.className = "tab" + (levelNumber === activeLevel ? " active" : "");
        button.textContent = "Level " + levelNumber; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(levelNumber === activeLevel));
        button.addEventListener("click", function () { activeLevel = levelNumber; renderAll(); });
        tabs.appendChild(button);
      }(level));
    }
  }
  function selectedCell() { return project ? (project.cells.find(function (cell) { return cell.id === selectedCellId; }) || null) : null; }
  function selectCell(id) { selectedCellId = id; renderSvg(); renderSelection(); }
  function setControlValue(id, value, output, suffix) {
    var input = byId(id); if (!input) return;
    input.value = value;
    if (output) byId(output).textContent = Number(value).toFixed(Number(value) % 1 ? 2 : 0) + (suffix || "");
  }
  function syncControls() {
    if (!project) return;
    var style = project.levels[String(activeLevel)];
    var levelOne = activeLevel === 1;
    byId("level-one-legend-note").hidden = !levelOne;
    byId("level-label-controls").hidden = levelOne;
    byId("labels-visible").checked = style.labelsVisible;
    byId("auto-fit").checked = style.autoFit;
    byId("auto-size").checked = style.autoSize;
    byId("manual-font-size-row").hidden = style.autoSize;
    byId("auto-size-row").hidden = !style.autoSize;
    byId("level-count").textContent = project.cells.filter(function (cell) { return cell.level === activeLevel; }).length + " calculated cells";
    setControlValue("font-size", style.fontSize, "font-size-output", " px");
    setControlValue("auto-size-max", style.autoSizeMax, "auto-size-max-output", " px");
    byId("font-weight").value = String(style.fontWeight);
    byId("text-color").value = validHex(style.color, "#111827"); byId("text-color-code").textContent = byId("text-color").value.toUpperCase();
    setControlValue("line-height", style.lineHeight, "line-height-output", "×");
    setControlValue("letter-spacing", style.letterSpacing, "letter-spacing-output", " px");
    setControlValue("wrap-width", style.wrapWidth, "wrap-width-output", " px");
    setControlValue("border-width", style.borderWidth, "border-width-output", " px");
    byId("border-mode").value = style.borderMode;
    byId("border-color").value = validHex(style.borderColor, "#ffffff"); byId("border-color-code").textContent = byId("border-color").value.toUpperCase();
    byId("custom-border-row").hidden = style.borderMode !== "custom";
    byId("level-one-inner-border-controls").hidden = activeLevel !== 1;
    byId("inner-border-visible").checked = style.innerBorderVisible;
    setControlValue("inner-border-width", style.innerBorderWidth, "inner-border-width-output", " px");
    byId("inner-border-width-row").hidden = !style.innerBorderVisible;
    byId("figure-title").value = project.canvas.title;
    byId("title-visible").checked = project.canvas.titleVisible;
    setControlValue("title-size", project.canvas.titleSize, "title-size-output", " px");
    byId("background-color").value = validHex(project.canvas.background, "#ffffff"); byId("background-color-code").textContent = byId("background-color").value.toUpperCase();
    setControlValue("cell-gap", project.canvas.cellGap, "cell-gap-output", " px");
    byId("legend-visible").checked = project.canvas.legendVisible;
    byId("legend-position").value = project.canvas.legendPosition;
    byId("legend-settings").hidden = !project.canvas.legendVisible;
    byId("legend-title").value = project.canvas.legendTitle;
    byId("legend-title-visible").checked = project.canvas.legendTitleVisible;
    byId("legend-title-size-row").hidden = !project.canvas.legendTitleVisible;
    setControlValue("legend-title-size", project.canvas.legendTitleSize, "legend-title-size-output", " px");
    setControlValue("legend-font-size", project.canvas.legendFontSize, "legend-font-size-output", " px");
    setControlValue("legend-width", project.canvas.legendSize, "legend-width-output", " px");
    byId("legend-grow-canvas").checked = project.canvas.legendGrowCanvas;
    byId("canvas-width").value = project.canvas.width;
    byId("canvas-height").value = project.canvas.height;
    byId("project-name").textContent = project.name;
    var maxLevel = Math.max.apply(null, project.cells.map(function (cell) { return cell.level; }));
    byId("project-stats").textContent = project.cells.length + " cells · " + maxLevel + " levels";
    byId("zoom").value = zoom; byId("zoom-output").textContent = Math.round(zoom * 100) + "%";
    byId("undo").disabled = !past.length; byId("redo").disabled = !future.length;
  }
  function renderSelection() {
    var cell = selectedCell();
    byId("selection-empty").hidden = Boolean(cell);
    byId("selection-editor").hidden = !cell;
    if (!cell) return;
    var style = project.levels[String(cell.level)];
    byId("selected-name").textContent = cell.name;
    byId("selected-path").textContent = cell.path.join(" › ");
    byId("selected-fill").value = validHex(cell.fill, "#94a3b8"); byId("selected-fill-code").textContent = byId("selected-fill").value.toUpperCase();
    var levelOne = cell.level === 1;
    byId("selection-level-one-note").hidden = !levelOne;
    byId("selected-legend-controls").hidden = !levelOne;
    byId("selected-label-controls").hidden = levelOne;
    if (levelOne) {
      var orderedRoots = legendCellsInOrder();
      var legendIndex = orderedRoots.findIndex(function (candidate) { return candidate.id === cell.id; });
      byId("selected-legend-label").value = cell.legend.text;
      byId("selected-legend-visible").checked = cell.legend.visible;
      byId("selected-legend-position").textContent = (legendIndex + 1) + " of " + orderedRoots.length;
      byId("legend-move-up").disabled = legendIndex <= 0;
      byId("legend-move-down").disabled = legendIndex < 0 || legendIndex >= orderedRoots.length - 1;
      return;
    }
    byId("selected-label").value = cell.label.text;
    byId("selected-visible").checked = cell.label.visible;
    var resolved = labelLayout(cell, style, getLayout());
    var fontSize = cell.label.fontSize === null ? (resolved ? resolved.fontSize : style.autoSizeMin) : cell.label.fontSize;
    setControlValue("selected-font-size", fontSize, "selected-font-size-output", " px");
    byId("selected-text-color").value = validHex(cell.label.color || style.color, "#111827"); byId("selected-text-color-code").textContent = byId("selected-text-color").value.toUpperCase();
    byId("selected-offset").textContent = "x " + cell.label.offset[0].toFixed(1) + " · y " + cell.label.offset[1].toFixed(1);
  }

  function moveSelectedLegendCell(direction) {
    var cell = selectedCell();
    if (!cell || cell.level !== 1) return;
    var orderedRoots = legendCellsInOrder();
    var currentIndex = orderedRoots.findIndex(function (candidate) { return candidate.id === cell.id; });
    var targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedRoots.length) return;
    var order = orderedRoots.map(function (candidate) { return candidate.id; });
    var displaced = order[targetIndex]; order[targetIndex] = order[currentIndex]; order[currentIndex] = displaced;
    commitMutation(function () { project.canvas.legendOrder = order; });
    setStatus("Moved “" + cell.legend.text.replace(/\s+/g, " ").trim() + "” to legend position " + (targetIndex + 1) + ".");
  }

  function renderAll() { if (!project) return; renderTabs(); syncControls(); renderSvg(); renderSelection(); }

  function ensurePreview() { if (!previewBase) previewBase = clone(project); }
  function finishPreview() {
    if (!previewBase) return;
    past.push(previewBase); if (past.length > HISTORY_LIMIT) past.shift();
    future = []; previewBase = null; syncControls();
  }
  function commitMutation(change) {
    if (!project) return;
    finishPreview();
    past.push(clone(project)); if (past.length > HISTORY_LIMIT) past.shift();
    future = []; change(); renderAll();
  }
  function undo() {
    finishPreview(); if (!past.length) return;
    future.unshift(clone(project)); if (future.length > HISTORY_LIMIT) future.pop();
    project = past.pop(); selectedCellId = selectedCell() ? selectedCellId : null; renderAll(); setStatus("Undid the last appearance change.");
  }
  function redo() {
    finishPreview(); if (!future.length) return;
    past.push(clone(project)); if (past.length > HISTORY_LIMIT) past.shift();
    project = future.shift(); selectedCellId = selectedCell() ? selectedCellId : null; renderAll(); setStatus("Redid the appearance change.");
  }
  function previewMutation(change) { ensurePreview(); change(); renderAll(); }

  function bindRange(id, readValue, applyValue, outputId, suffix) {
    var input = byId(id);
    input.addEventListener("input", function () { previewMutation(function () { applyValue(Number(input.value)); }); if (outputId) byId(outputId).textContent = Number(input.value).toFixed(Number(input.value) % 1 ? 2 : 0) + (suffix || ""); });
    input.addEventListener("change", finishPreview);
  }
  function bindColor(id, applyValue, codeId) {
    var input = byId(id);
    input.addEventListener("input", function () { previewMutation(function () { applyValue(input.value); }); byId(codeId).textContent = input.value.toUpperCase(); });
    input.addEventListener("change", finishPreview);
  }
  function bindText(id, applyValue) {
    var input = byId(id);
    input.addEventListener("input", function () { previewMutation(function () { applyValue(input.value); }); });
    input.addEventListener("change", finishPreview); input.addEventListener("blur", finishPreview);
  }

  function svgPoint(event) {
    var svg = byId("treemap"); var matrix = svg.getScreenCTM();
    if (!matrix) return [event.clientX, event.clientY];
    var point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    var transformed = point.matrixTransform(matrix.inverse()); return [transformed.x, transformed.y];
  }
  function startLabelDrag(event, cellId) {
    event.preventDefault(); event.stopPropagation(); finishPreview();
    var cell = project.cells.find(function (candidate) { return candidate.id === cellId; }); if (!cell) return;
    selectedCellId = cellId;
    dragState = { cellId: cellId, pointerId: event.pointerId, start: svgPoint(event), originalOffset: cell.label.offset.slice(), before: clone(project) };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (ignore) { /* window listeners are the fallback */ }
    renderSelection();
  }
  function moveLabelDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault(); var point = svgPoint(event);
    var cell = project.cells.find(function (candidate) { return candidate.id === dragState.cellId; }); if (!cell) return;
    cell.label.offset = [dragState.originalOffset[0] + point[0] - dragState.start[0], dragState.originalOffset[1] + point[1] - dragState.start[1]];
    cell.label.locked = true; renderSvg(); renderSelection();
  }
  function endLabelDrag(event) {
    if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
    past.push(dragState.before); if (past.length > HISTORY_LIMIT) past.shift(); future = []; dragState = null; renderAll();
    setStatus("Label position updated. Polygon geometry was not changed.");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob); var anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.style.display = "none"; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function serializeSvg() {
    var source = byId("treemap"); var copy = source.cloneNode(true);
    Array.prototype.slice.call(copy.querySelectorAll("[data-editor-only='true']")).forEach(function (node) { node.remove(); });
    copy.setAttribute("xmlns", SVG_NS); copy.setAttribute("width", project.canvas.width); copy.setAttribute("height", project.canvas.height); copy.removeAttribute("style");
    var metadata = copy.querySelector("metadata[data-schema='weighted-treemaps-editor']"); if (metadata) metadata.textContent = JSON.stringify(project);
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + new XMLSerializer().serializeToString(copy);
  }
  function saveProject() {
    finishPreview(); downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), safeFilename(project.name) + ".voronoi.json");
    setStatus("Saved an editable project. It can be reopened without Python or CGAL.");
  }
  function exportSvg() {
    try { downloadBlob(new Blob([serializeSvg()], { type: "image/svg+xml;charset=utf-8" }), safeFilename(project.name) + ".svg"); setStatus("Exported a clean standalone SVG."); }
    catch (error) { setStatus(error.message || "SVG export failed.", true); }
  }
  function withTimeout(promise, milliseconds, message) {
    return Promise.race([promise, new Promise(function (_, reject) { window.setTimeout(function () { reject(new Error(message)); }, milliseconds); })]);
  }
  async function exportPng() {
    var button = byId("export-png"); button.disabled = true; button.textContent = "Exporting…";
    var url = null;
    try {
      if (document.fonts && document.fonts.ready) await withTimeout(document.fonts.ready, 2000, "Font loading took too long; please try SVG export.");
      var scale = Number(byId("png-scale").value); var width = Math.round(project.canvas.width * scale); var height = Math.round(project.canvas.height * scale);
      if (width * height > 100000000) throw new Error("That PNG is too large for a reliable browser export. Choose a smaller scale or use SVG.");
      url = URL.createObjectURL(new Blob([serializeSvg()], { type: "image/svg+xml;charset=utf-8" }));
      var image = new Image();
      await withTimeout(new Promise(function (resolve, reject) { image.onload = resolve; image.onerror = function () { reject(new Error("The browser could not rasterize the SVG.")); }; image.src = url; }), 15000, "PNG rasterizing took too long. Choose a smaller scale or use SVG.");
      var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      var context = canvas.getContext("2d"); if (!context) throw new Error("Canvas export is unavailable in this browser.");
      context.drawImage(image, 0, 0, width, height);
      var blob = await withTimeout(new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); }), 15000, "PNG encoding took too long. Choose a smaller scale or use SVG.");
      if (!blob) throw new Error("PNG encoding failed.");
      downloadBlob(blob, safeFilename(project.name) + "-" + width + "x" + height + ".png"); setStatus("Exported PNG at " + width + " × " + height + " pixels.");
    } catch (error) { setStatus(error.message || "PNG export failed.", true); }
    finally { if (url) window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500); button.disabled = false; button.textContent = "Export PNG"; }
  }

  function fileText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result)); }; reader.onerror = reject; reader.readAsText(file); });
  }
  async function openFile(file) {
    try {
      var raw = JSON.parse(await fileText(file)); var loaded = normalizeProject(raw);
      project = loaded; growCanvasToFitLegend(); baseline = clone(project); past = []; future = []; previewBase = null; selectedCellId = null; activeLevel = 1;
      renderAll(); fitView(); setStatus("Opened " + file.name + ". Geometry stays locked while you polish the figure.");
    } catch (error) { setStatus(error.message || "The project could not be opened.", true); }
  }
  function fitView() {
    if (!project) return; var workspace = byId("workspace");
    var availableWidth = Math.max(workspace.clientWidth - 72, 200); var availableHeight = Math.max(workspace.clientHeight - 72, 200);
    zoom = clamp(Math.min(availableWidth / project.canvas.width, availableHeight / project.canvas.height), .15, 1.25);
    syncControls(); renderSvg(); workspace.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  function bindUi() {
    byId("open-project").addEventListener("click", function () { byId("project-file").click(); });
    byId("project-file").addEventListener("change", function () { var file = this.files && this.files[0]; if (file) openFile(file); this.value = ""; });
    byId("save-project").addEventListener("click", saveProject); byId("export-svg").addEventListener("click", exportSvg); byId("export-png").addEventListener("click", exportPng);
    byId("undo").addEventListener("click", undo); byId("redo").addEventListener("click", redo);
    byId("reset-project").addEventListener("click", function () { if (!baseline) return; commitMutation(function () { project = clone(baseline); selectedCellId = null; activeLevel = 1; }); setStatus("Restored the styling from the project you opened."); });

    byId("labels-visible").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.levels[String(activeLevel)].labelsVisible = value; }); });
    byId("auto-fit").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.levels[String(activeLevel)].autoFit = value; }); });
    byId("auto-size").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.levels[String(activeLevel)].autoSize = value; }); });
    bindRange("font-size", null, function (value) { project.levels[String(activeLevel)].fontSize = value; }, "font-size-output", " px");
    bindRange("auto-size-max", null, function (value) { project.levels[String(activeLevel)].autoSizeMax = value; }, "auto-size-max-output", " px");
    byId("font-weight").addEventListener("change", function () { var value = Number(this.value); commitMutation(function () { project.levels[String(activeLevel)].fontWeight = value; }); });
    bindColor("text-color", function (value) { project.levels[String(activeLevel)].color = value; }, "text-color-code");
    bindRange("line-height", null, function (value) { project.levels[String(activeLevel)].lineHeight = value; }, "line-height-output", "×");
    bindRange("letter-spacing", null, function (value) { project.levels[String(activeLevel)].letterSpacing = value; }, "letter-spacing-output", " px");
    bindRange("wrap-width", null, function (value) { project.levels[String(activeLevel)].wrapWidth = value; }, "wrap-width-output", " px");
    bindRange("border-width", null, function (value) { project.levels[String(activeLevel)].borderWidth = value; }, "border-width-output", " px");
    byId("border-mode").addEventListener("change", function () { var value = this.value; commitMutation(function () { project.levels[String(activeLevel)].borderMode = value; }); });
    bindColor("border-color", function (value) { project.levels[String(activeLevel)].borderColor = value; }, "border-color-code");
    byId("inner-border-visible").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.levels[String(activeLevel)].innerBorderVisible = value; }); });
    bindRange("inner-border-width", null, function (value) { project.levels[String(activeLevel)].innerBorderWidth = value; }, "inner-border-width-output", " px");

    bindText("figure-title", function (value) { project.canvas.title = value; });
    byId("title-visible").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.canvas.titleVisible = value; growCanvasToFitLegend(); }); });
    bindRange("title-size", null, function (value) { project.canvas.titleSize = value; growCanvasToFitLegend(); }, "title-size-output", " px");
    bindColor("background-color", function (value) { project.canvas.background = value; }, "background-color-code");
    bindRange("cell-gap", null, function (value) { project.canvas.cellGap = value; }, "cell-gap-output", " px");
    byId("legend-visible").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.canvas.legendVisible = value; growCanvasToFitLegend(); }); });
    byId("legend-position").addEventListener("change", function () { var value = this.value; commitMutation(function () { project.canvas.legendPosition = value; }); });
    bindText("legend-title", function (value) { project.canvas.legendTitle = value; growCanvasToFitLegend(); });
    byId("legend-title-visible").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.canvas.legendTitleVisible = value; growCanvasToFitLegend(); }); });
    bindRange("legend-title-size", null, function (value) { project.canvas.legendTitleSize = value; growCanvasToFitLegend(); }, "legend-title-size-output", " px");
    bindRange("legend-font-size", null, function (value) { project.canvas.legendFontSize = value; growCanvasToFitLegend(); }, "legend-font-size-output", " px");
    bindRange("legend-width", null, function (value) {
      var previous = project.canvas.legendSize;
      if (project.canvas.legendGrowCanvas) project.canvas.width = Math.max(320, Math.round(project.canvas.width + value - previous));
      project.canvas.legendSize = value;
      growCanvasToFitLegend();
    }, "legend-width-output", " px");
    byId("legend-width").addEventListener("change", fitView);
    byId("legend-grow-canvas").addEventListener("change", function () { var value = this.checked; commitMutation(function () { project.canvas.legendGrowCanvas = value; growCanvasToFitLegend(); }); });
    ["canvas-width", "canvas-height"].forEach(function (id) { byId(id).addEventListener("change", function () { var width = Math.max(320, Math.round(finite(byId("canvas-width").value, project.canvas.width))); var height = Math.max(240, Math.round(finite(byId("canvas-height").value, project.canvas.height))); commitMutation(function () { project.canvas.width = width; project.canvas.height = height; growCanvasToFitLegend(); }); fitView(); }); });

    bindText("selected-label", function (value) { var cell = selectedCell(); if (cell) cell.label.text = value; });
    bindText("selected-legend-label", function (value) { var cell = selectedCell(); if (cell && cell.level === 1) { cell.legend.text = value; growCanvasToFitLegend(); } });
    byId("selected-legend-visible").addEventListener("change", function () { var value = this.checked; var id = selectedCellId; commitMutation(function () { var cell = project.cells.find(function (candidate) { return candidate.id === id; }); if (cell && cell.level === 1) { cell.legend.visible = value; growCanvasToFitLegend(); } }); });
    byId("legend-move-up").addEventListener("click", function () { moveSelectedLegendCell(-1); });
    byId("legend-move-down").addEventListener("click", function () { moveSelectedLegendCell(1); });
    byId("reset-legend-label").addEventListener("click", function () { var id = selectedCellId; commitMutation(function () { var cell = project.cells.find(function (candidate) { return candidate.id === id; }); if (cell && cell.level === 1) { cell.legend.text = cell.name; cell.legend.visible = true; growCanvasToFitLegend(); } }); });
    byId("selected-visible").addEventListener("change", function () { var value = this.checked; var id = selectedCellId; commitMutation(function () { var cell = project.cells.find(function (candidate) { return candidate.id === id; }); if (cell) cell.label.visible = value; }); });
    bindColor("selected-fill", function (value) { var cell = selectedCell(); if (cell) cell.fill = value; }, "selected-fill-code");
    bindRange("selected-font-size", null, function (value) { var cell = selectedCell(); if (cell) cell.label.fontSize = value; }, "selected-font-size-output", " px");
    bindColor("selected-text-color", function (value) { var cell = selectedCell(); if (cell) cell.label.color = value; }, "selected-text-color-code");
    byId("reset-label").addEventListener("click", function () { var id = selectedCellId; commitMutation(function () { var cell = project.cells.find(function (candidate) { return candidate.id === id; }); if (cell) cell.label = { text: cell.name, anchor: cell.label.anchor, offset: [0, 0], visible: true, fontSize: null, color: null, fontWeight: null, locked: false }; }); });

    byId("zoom").addEventListener("input", function () { zoom = Number(this.value); byId("zoom-output").textContent = Math.round(zoom * 100) + "%"; renderSvg(); });
    byId("zoom-out").addEventListener("click", function () { zoom = clamp(zoom - .1, .15, 2.5); syncControls(); renderSvg(); });
    byId("zoom-in").addEventListener("click", function () { zoom = clamp(zoom + .1, .15, 2.5); syncControls(); renderSvg(); });
    byId("zoom-fit").addEventListener("click", fitView);
    byId("treemap").addEventListener("pointerdown", function (event) { if (event.target === event.currentTarget) { selectedCellId = null; renderSvg(); renderSelection(); } });
    window.addEventListener("pointermove", moveLabelDrag, { passive: false }); window.addEventListener("pointerup", endLabelDrag); window.addEventListener("pointercancel", endLabelDrag); window.addEventListener("blur", endLabelDrag);
    window.addEventListener("keydown", function (event) { var command = event.metaKey || event.ctrlKey; if (!command || event.key.toLowerCase() !== "z") return; event.preventDefault(); if (event.shiftKey) redo(); else undo(); });
    var workspace = byId("workspace");
    workspace.addEventListener("dragover", function (event) { event.preventDefault(); workspace.classList.add("drag-over"); });
    workspace.addEventListener("dragleave", function () { workspace.classList.remove("drag-over"); });
    workspace.addEventListener("drop", function (event) { event.preventDefault(); workspace.classList.remove("drag-over"); var file = event.dataTransfer.files && event.dataTransfer.files[0]; if (file) openFile(file); });
    window.addEventListener("resize", function () { if (project) fitView(); });
  }

  async function start() {
    bindUi();
    try {
      var response = await withTimeout(fetch("./example.voronoi.json", { cache: "no-store" }), 10000, "The bundled example took too long to load.");
      if (!response.ok) throw new Error("The bundled example could not be loaded (HTTP " + response.status + ").");
      project = normalizeProject(await response.json()); growCanvasToFitLegend(); baseline = clone(project); renderAll(); window.setTimeout(fitView, 30);
      var counts = [1, 2, 3].map(function (level) { return project.cells.filter(function (cell) { return cell.level === level; }).length; });
      setStatus("Synthetic example loaded — " + project.cells.length + " cells (levels: " + counts.join(" / ") + ").");
    } catch (error) {
      setStatus((error.message || "Startup failed.") + " Run this folder with: python3 -m http.server 8006", true);
    }
  }

  start();
}());
