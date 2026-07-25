import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const sessionAnalysisRouteSource = await readFile(new URL("../app/api/session-analysis/route.ts", import.meta.url), "utf8");

test("import front door prioritizes multi-photo upload before CSV and manual entry", () => {
  const importFrontDoorStart = pageSource.indexOf("import-mode-grid import-primary-paths");
  const importFrontDoorSource = pageSource.slice(importFrontDoorStart);
  const photoIndex = importFrontDoorSource.indexOf("Upload Photos");
  const csvIndex = importFrontDoorSource.indexOf("Upload CSV instead");
  const manualIndex = importFrontDoorSource.indexOf("Enter Manually");

  assert.ok(importFrontDoorStart > -1, "import front door exists");
  assert.ok(photoIndex > -1, "photo import entry exists");
  assert.ok(csvIndex > photoIndex, "CSV follows photo import");
  assert.ok(manualIndex > csvIndex, "manual entry follows CSV");
  assert.match(pageSource, /Upload photos of your session/);
  assert.match(pageSource, /Choose Photos/);
  assert.match(pageSource, /Add more photos/);
  assert.match(pageSource, /JPG, JPEG, PNG, HEIC, HEIF, WebP/);
  assert.match(pageSource, /multiple/);
  assert.match(pageSource, /Remove/);
  assert.match(pageSource, /Clear all/);
  assert.match(pageSource, /View source file/);
  assert.match(pageSource, /View import details/);
  assert.match(pageSource, /Advanced column mapping/);
  assert.match(pageSource, /compact-disclosure/);
  assert.match(pageSource, /Club used/);
  assert.match(pageSource, /function ClubSelector/);
  assert.match(pageSource, /Clear club/);
  assert.match(pageSource, /Apply to all shots/);
  assert.match(pageSource, /Edit session/);
  assert.match(pageSource, /Save session edits/);
  assert.match(pageSource, /session-edit-shot-row/);
  assert.match(pageSource, /importMode === "photo"/);
  assert.match(pageSource, /importMode === "file"/);
  assert.match(pageSource, /No complete shot rows found/);
  assert.match(pageSource, /Needs review/);
  assert.doesNotMatch(pageSource, />Unreadable</);
  assert.doesNotMatch(pageSource, /<details className="mapping-review-panel" open>/);
  assert.doesNotMatch(pageSource, /Load sample CSV rows/);
  assert.doesNotMatch(pageSource, /Upload CSV or Photos/);
});

test("saved session edits can invalidate current MAI analysis", () => {
  assert.match(pageSource, /method: "DELETE"/);
  assert.match(pageSource, /\/api\/session-analysis/);
  assert.match(sessionAnalysisRouteSource, /export async function DELETE/);
  assert.match(sessionAnalysisRouteSource, /invalidateStoredSessionAnalyses/);
});
