// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const [html, app, styles, readme, fixtureText, logo, favicon, appleTouchIcon] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("README.md", root), "utf8"),
  readFile(new URL("example.voronoi.json", root), "utf8"),
  readFile(new URL("assets/tessellart-logo.png", root)),
  readFile(new URL("assets/favicon-64.png", root)),
  readFile(new URL("assets/apple-touch-icon.png", root))
]);

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG", "brand asset must be a PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

assert.deepEqual(pngDimensions(logo), [768, 768], "README/header logo has unexpected dimensions");
assert.deepEqual(pngDimensions(favicon), [64, 64], "favicon has unexpected dimensions");
assert.deepEqual(pngDimensions(appleTouchIcon), [180, 180], "Apple touch icon has unexpected dimensions");
assert.match(html, /<img class="brand-mark" src="assets\/tessellart-logo\.png" alt=""/, "header needs the supplied logo");
assert.match(html, /rel="icon"[^>]+assets\/favicon-64\.png/, "page needs its favicon");
assert.match(html, /rel="apple-touch-icon"[^>]+assets\/apple-touch-icon\.png/, "page needs its Apple touch icon");
assert.match(readme, /assets\/tessellart-logo\.png/, "README needs the supplied logo");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(ids.length, new Set(ids).size, "index.html contains duplicate element IDs");

const referencedIds = [...app.matchAll(/byId\("([^"]+)"\)/g)].map((match) => match[1]);
const missing = [...new Set(referencedIds)].filter((id) => !ids.includes(id));
assert.deepEqual(missing, [], `app.js references missing IDs: ${missing.join(", ")}`);

const fixture = JSON.parse(fixtureText);
assert.ok(Array.isArray(fixture.cells) && fixture.cells.length > 0, "fixture needs cells");
const cellIds = fixture.cells.map((cell) => cell.id);
assert.equal(cellIds.length, new Set(cellIds).size, "fixture cell IDs must be unique");
assert.deepEqual([...new Set(fixture.cells.map((cell) => cell.level))].sort(), [1, 2, 3]);

function polygonArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

function polygonPerimeter(points) {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    perimeter += Math.hypot(next[0] - current[0], next[1] - current[1]);
  }
  return perimeter;
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastAgainstWhite(hex) {
  return 1.05 / (relativeLuminance(hex) + .05);
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cross(first, second, third) {
  return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
}

function pointOnSegment(point, first, second, epsilon = .05) {
  const segmentLength = Math.hypot(second[0] - first[0], second[1] - first[1]);
  if (Math.abs(cross(first, second, point)) > epsilon * Math.max(1, segmentLength)) return false;
  return point[0] >= Math.min(first[0], second[0]) - epsilon &&
    point[0] <= Math.max(first[0], second[0]) + epsilon &&
    point[1] >= Math.min(first[1], second[1]) - epsilon &&
    point[1] <= Math.max(first[1], second[1]) + epsilon;
}

function pointRelation(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const first = polygon[current];
    const second = polygon[previous];
    if (pointOnSegment(point, first, second)) return "boundary";
    const intersects = (first[1] > point[1]) !== (second[1] > point[1]) &&
      point[0] < ((second[0] - first[0]) * (point[1] - first[1])) / ((second[1] - first[1]) || 1e-12) + first[0];
    if (intersects) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

function edgesProperlyCross(firstA, firstB, secondA, secondB) {
  const epsilon = .05;
  const firstLength = Math.max(1e-12, Math.hypot(firstB[0] - firstA[0], firstB[1] - firstA[1]));
  const secondLength = Math.max(1e-12, Math.hypot(secondB[0] - secondA[0], secondB[1] - secondA[1]));
  const firstDistances = [cross(firstA, firstB, secondA) / firstLength, cross(firstA, firstB, secondB) / firstLength];
  const secondDistances = [cross(secondA, secondB, firstA) / secondLength, cross(secondA, secondB, firstB) / secondLength];
  return firstDistances[0] * firstDistances[1] < 0 && secondDistances[0] * secondDistances[1] < 0 &&
    firstDistances.every((distance) => Math.abs(distance) > epsilon) && secondDistances.every((distance) => Math.abs(distance) > epsilon);
}

function polygonsHaveInteriorOverlap(first, second) {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (edgesProperlyCross(first[firstIndex], first[(firstIndex + 1) % first.length], second[secondIndex], second[(secondIndex + 1) % second.length])) return true;
    }
  }
  return first.some((point) => pointRelation(point, second) === "inside") ||
    second.some((point) => pointRelation(point, first) === "inside");
}

for (const cell of fixture.cells) {
  assert.ok(Array.isArray(cell.polygon) && cell.polygon.length >= 3, `${cell.id} needs a polygon`);
  assert.ok(cell.polygon.every((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)), `${cell.id} has an invalid point`);
  assert.ok(polygonArea(cell.polygon) > 100, `${cell.id} is too small or degenerate`);
  assert.notEqual(pointRelation(cell.label.anchor, cell.polygon), "outside", `${cell.id} label anchor lies outside its cell`);
}

assert.equal(fixture.generator.name, "synthetic-apollonius-tree-of-life-demo", "the bundled project must remain the curved Tree of Life demo");
assert.equal(fixture.project.title, "A Tiny Tree of Life", "the bundled project needs its approved title");
assert.equal(fixture.canvas.legendTitle, "ORGANISM GROUPS", "the bundled project needs its organism legend title");
assert.match(fixture.source.description, /not a complete phylogeny/, "selected organism groups need an explicit scope note");
assert.match(fixture.source.description, /do not encode abundance, diversity, age, or evolutionary distance/, "synthetic areas need an explicit biological disclaimer");
assert.equal(fixture.source?.silhouette?.kind, "heart", "fixture needs a canonical heart silhouette");
assert.notEqual(fixture.canvas.preserveAspectRatio, "none", "the heart must retain its proportions");

const silhouette = fixture.source.silhouette.polygon;
assert.ok(Array.isArray(silhouette) && silhouette.length >= 48, "heart outline needs enough points for smooth lobes");
const byCellId = new Map(fixture.cells.map((cell) => [cell.id, cell]));
for (const parent of fixture.cells.filter((cell) => cell.level < 3)) {
  const children = fixture.cells.filter((cell) => cell.parentId === parent.id);
  assert.ok(children.length >= 2 && children.length <= 6, `${parent.id} needs an organic 2–6 child partition`);
  for (const child of children) {
    assert.equal(child.level, parent.level + 1, `${child.id} skips a hierarchy level`);
    assert.ok(child.polygon.every((point) => pointRelation(point, parent.polygon) !== "outside"), `${child.id} escapes ${parent.id}`);
  }
  for (let first = 0; first < children.length; first += 1) {
    for (let second = first + 1; second < children.length; second += 1) {
      assert.equal(polygonsHaveInteriorOverlap(children[first].polygon, children[second].polygon), false, `${parent.id} children overlap`);
    }
  }
  const childArea = children.reduce((sum, child) => sum + polygonArea(child.polygon), 0);
  const tolerance = Math.max(50, polygonArea(parent.polygon) * 1e-4);
  assert.ok(Math.abs(childArea - polygonArea(parent.polygon)) <= tolerance, `${parent.id} children leave a gap`);
}

for (const cell of fixture.cells.filter((candidate) => candidate.parentId !== null)) {
  assert.ok(byCellId.has(cell.parentId), `${cell.id} references a missing parent`);
}

const roots = fixture.cells.filter((cell) => cell.level === 1);
assert.equal(roots.length, 5, "heart demo should match the five-color logo palette");
assert.deepEqual(roots.map((cell) => cell.categoryColor), ["#DB6254", "#7AB6B9", "#9EAE77", "#F6CA79", "#C39DD6"], "heart demo must preserve the supplied logo palette");
const expectedRootShares = new Map([
  ["Bacteria", .255], ["Archaea", .253], ["Plants", .163], ["Fungi", .195], ["Animals", .134]
]);
for (const rootCell of roots) {
  assert.ok(Math.abs(rootCell.value / 100 - expectedRootShares.get(rootCell.name)) < .02, `${rootCell.name} no longer resembles the logo proportions`);
}
assert.equal(fixture.cells.filter((cell) => cell.level === 2).length, 21, "heart demo needs varied Level 2 branching");
assert.equal(fixture.cells.filter((cell) => cell.level === 3).length, 67, "heart demo needs a useful field of leaf cells");
const themeNames = fixture.cells.filter((cell) => cell.level === 2).map((cell) => cell.name);
assert.ok(["Actinobacteria", "Methanogens", "Flowering plants", "Ascomycetes", "Arthropods"].every((name) => themeNames.includes(name)), "Tree of Life demo needs its five organism branches");
assert.ok(["Corynebacterium glutamicum", "Neomoorella thermoacetica", "Escherichia coli", "Saccharomyces cerevisiae", "Arabidopsis thaliana", "Drosophila melanogaster"].every((name) => fixture.cells.some((cell) => cell.level === 3 && cell.name === name)), "Tree of Life demo is missing representative organisms");
assert.doesNotMatch(fixtureText, /Conducting wave|Pacemaker cue|Repeating Motifs|Sanded Plane|Soft|Bold Contrast/, "discarded demo labels remain in the Tree of Life fixture");
const visibleLabelBackdrops = fixture.cells.filter((cell) => cell.level === 3);
assert.ok(Math.min(...visibleLabelBackdrops.map((cell) => contrastAgainstWhite(cell.fill))) >= 4.5, "deep demo fills no longer keep white Level 2 labels readable");
for (const rootCell of roots) {
  assert.ok(rootCell.polygon.every((point) => pointRelation(point, silhouette) !== "outside"), `${rootCell.id} escapes the heart`);
}
for (let first = 0; first < roots.length; first += 1) {
  for (let second = first + 1; second < roots.length; second += 1) {
    assert.equal(polygonsHaveInteriorOverlap(roots[first].polygon, roots[second].polygon), false, `${roots[first].id} overlaps ${roots[second].id}`);
  }
}
const silhouetteArea = polygonArea(silhouette);
const rootsArea = roots.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0);
assert.ok(Math.abs(rootsArea - silhouetteArea) <= Math.max(50, silhouetteArea * 1e-4), "Level 1 regions do not fill the heart");

const branchCounts = fixture.cells
  .filter((cell) => cell.level < 3)
  .map((parent) => fixture.cells.filter((cell) => cell.parentId === parent.id).length);
assert.ok(new Set(branchCounts).size >= 4, "the hierarchy became mechanically uniform");
const childAreaVariation = fixture.cells
  .filter((cell) => cell.level < 3)
  .map((parent) => {
    const areas = fixture.cells.filter((cell) => cell.parentId === parent.id).map((cell) => polygonArea(cell.polygon));
    const mean = areas.reduce((sum, area) => sum + area, 0) / areas.length;
    const variance = areas.reduce((sum, area) => sum + (area - mean) ** 2, 0) / areas.length;
    return Math.sqrt(variance) / mean;
  });
assert.ok(median(childAreaVariation) > .42, "child areas are too even to resemble weighted Voronoi cells");
const levelTwo = fixture.cells.filter((cell) => cell.level === 2);
const levelThree = fixture.cells.filter((cell) => cell.level === 3);
assert.ok(median(levelTwo.map((cell) => cell.polygon.length)) >= 24, "Level 2 boundaries lost their sampled curves");
assert.ok(median(levelThree.map((cell) => cell.polygon.length)) >= 20, "Level 3 boundaries lost their sampled curves");
assert.ok(median(levelTwo.map((cell) => 4 * Math.PI * polygonArea(cell.polygon) / polygonPerimeter(cell.polygon) ** 2)) > .6, "Level 2 cells became too slice-like");

const xs = silhouette.map((point) => point[0]);
const ys = silhouette.map((point) => point[1]);
const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
const width = bounds.maxX - bounds.minX;
const height = bounds.maxY - bounds.minY;
const centerX = (bounds.minX + bounds.maxX) / 2;
const tip = silhouette.reduce((lowest, point) => point[1] > lowest[1] ? point : lowest);
const notchY = Math.min(...silhouette.filter((point) => Math.abs(point[0] - centerX) < width * .015).map((point) => point[1]));
assert.ok(width / height > .9 && width / height < 1.35, "heart silhouette has implausible proportions");
assert.ok(silhouetteArea / (width * height) > .55 && silhouetteArea / (width * height) < .9, "heart silhouette became a rectangle or a line");
assert.ok(Math.abs(tip[0] - centerX) < width * .03, "heart tip is not centered");
assert.ok(notchY > bounds.minY + height * .15, "heart has lost its center notch");
assert.equal(pointRelation([centerX - width * .23, bounds.minY + height * .18], silhouette), "inside", "left heart lobe is missing");
assert.equal(pointRelation([centerX + width * .23, bounds.minY + height * .18], silhouette), "inside", "right heart lobe is missing");
assert.equal(pointRelation([centerX, bounds.minY + height * .45], silhouette), "inside", "heart center is hollow");
assert.equal(pointRelation([centerX, bounds.maxY - height * .18], silhouette), "inside", "heart lower body is missing");

const instrumentedApp = app.replace(
  /\n  start\(\);\n}\(\)\);\s*$/,
  "\n  globalThis.__layoutSmoke = { largestFittingLabel, boxInsidePolygon };\n}());\n"
);
assert.notEqual(instrumentedApp, app, "label-layout smoke hook could not be installed");
const measurement = {
  font: "",
  measureText(text) {
    const match = this.font.match(/([0-9.]+)px/);
    const size = match ? Number(match[1]) : 10;
    return { width: String(text).length * size * .54 };
  }
};
const browserlessContext = {
  document: { createElement: () => ({ getContext: () => measurement }) }
};
vm.createContext(browserlessContext);
vm.runInContext(instrumentedApp, browserlessContext);
const layoutApi = browserlessContext.__layoutSmoke;
const autoStyle = {
  fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 400, letterSpacing: 0,
  lineHeight: 1.15, borderWidth: 0, autoSize: true, autoFit: false,
  autoSizeMin: 14, autoSizeMax: 120, autoSizeMaxLines: 4, fitPadding: 5
};
const identityLayout = { transform: (point) => point };
const testCell = (text, polygon, anchor) => ({ polygon, label: { text, anchor, offset: [0, 0] } });

const diamond = [[0, 70], [100, 0], [200, 70], [100, 140]];
const reflowed = layoutApi.largestFittingLabel(testCell("Other carbon fixation\npathways", diamond, [100, 70]), autoStyle, identityLayout);
assert.ok(reflowed, "auto-size discarded a label that fits after reflowing its imported line break");
assert.ok(reflowed.lines.length >= 3 && reflowed.lines.length <= 4, "long labels should explore compact three- or four-line wraps");
assert.equal(Array.from(reflowed.lines).join(" "), "Other carbon fixation pathways", "auto-size changed the label words or order");
assert.ok(reflowed.fontSize >= 14, "auto-size fell below the readable minimum");
assert.equal(layoutApi.boxInsidePolygon(reflowed.box, diamond), true, "reflowed label does not actually fit its polygon");

const twoWord = layoutApi.largestFittingLabel(testCell("Methane metabolism", [[0, 0], [100, 0], [100, 80], [0, 80]], [50, 40]), autoStyle, identityLayout);
assert.deepEqual(Array.from(twoWord.lines), ["Methane", "metabolism"], "two-word labels should be allowed to split across two lines");
assert.ok(twoWord.fontSize > 14, "two-line wrapping did not improve the two-word label size");

const tinyCell = testCell("Tiny label", [[0, 0], [30, 0], [30, 22], [0, 22]], [15, 11]);
const retainedTiny = layoutApi.largestFittingLabel(tinyCell, autoStyle, identityLayout);
assert.ok(retainedTiny && retainedTiny.fontSize === 14, "fit-off auto-size should retain an impossible label at the readable minimum");
assert.equal(layoutApi.largestFittingLabel(tinyCell, { ...autoStyle, autoFit: true }, identityLayout), null, "fit-on auto-size should still hide an impossible label");

assert.equal((app.match(/autoSizeMin: 14/g) || []).length, 3, "automatic labels need a readable minimum size at every level");
assert.match(app, /function balancedWrapForLineCount\(/, "automatic labels need multi-line partition search");
assert.match(app, /function automaticWrapCandidates\(/, "automatic labels need to reflow imported line breaks when a better wrap fits");
assert.match(app, /if \(!best && !style\.autoFit && fallback\)/, "automatic labels must remain visible when fit filtering is disabled");
assert.match(app, /titleSize: 30, titleColor:/, "new projects need a 30 px figure title");
assert.equal(fixture.style.title.fontSize, 30, "the bundled example needs a 30 px figure title");
assert.match(app, /borderWidth: 14, borderMode: "custom", borderColor: "#ffffff", innerBorderVisible: true, innerBorderWidth: 21/, "Level 1 needs a 14 px white center line and 21 px category rim");
assert.match(app, /"2": \{ fontSize: 18,[^\n]+fontWeight: 400, color: "#ffffff"[^\n]+borderWidth: 4, borderMode: "custom", borderColor: "#000000"/, "Level 2 defaults no longer match the COG project");
assert.match(app, /"3": \{ fontSize: 12,[^\n]+fontWeight: 400, color: "#000000"[^\n]+borderWidth: 2, borderMode: "custom", borderColor: "#000000"/, "Level 3 defaults no longer match the COG project");
assert.deepEqual(fixture.style.levels.map((entry) => [entry.level, entry.label.color, entry.border.color, entry.border.width]), [
  [1, "#000000", "#ffffff", 14],
  [2, "#ffffff", "#000000", 4],
  [3, "#000000", "#000000", 2]
], "heart demo needs explicit editor styling");
assert.match(app, /titleBaseline/, "legend titles need an explicit positive baseline");
assert.doesNotMatch(app, /dominant-baseline\": \"hanging/, "legend title must not rely on an export-sensitive hanging baseline");
assert.doesNotMatch(styles, /font-size:\s*(?:8|9|10)px/, "regular interface text must not use 8–10 px fonts");
assert.doesNotMatch(readme, /Current polishing defaults|Put the source on GitHub|No diagnosis of Apple hardware/, "README still contains private setup notes or discarded copy");

console.log(`Smoke checks passed: ${ids.length} controls, ${fixture.cells.length} synthetic cells.`);
