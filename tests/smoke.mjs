// SPDX-License-Identifier: GPL-3.0-only
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, app, fixtureText] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("example.voronoi.json", root), "utf8")
]);

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
for (const cell of fixture.cells) {
  assert.ok(Array.isArray(cell.polygon) && cell.polygon.length >= 3, `${cell.id} needs a polygon`);
  assert.ok(cell.polygon.every((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)), `${cell.id} has an invalid point`);
}

console.log(`Smoke checks passed: ${ids.length} controls, ${fixture.cells.length} synthetic cells.`);
