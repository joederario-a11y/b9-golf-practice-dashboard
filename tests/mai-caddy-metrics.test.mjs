import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ts from "typescript";

async function importMetricsModule() {
  const source = await readFile(new URL("../lib/server/mai-caddy-metrics.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(transpiled.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const metrics = await importMetricsModule();

test("summarizes averages, median, range, and standard deviation", () => {
  const summary = metrics.summarizeValues([100, 110, 120]);

  assert.equal(summary.count, 3);
  assert.equal(summary.average, 110);
  assert.equal(summary.median, 110);
  assert.equal(summary.minimum, 100);
  assert.equal(summary.maximum, 120);
  assert.equal(summary.range, 20);
  assert.equal(summary.standardDeviation, 8.2);
});

test("does not convert missing measurements into zero", () => {
  const result = metrics.calculateSessionMetrics([
    { carry: "N/A", ballSpeed: 120 },
    { totalDistance: 190 },
    { carry: null },
  ]);

  assert.equal(result.averageCarry, null);
  assert.equal(result.metricSummaries.carry.count, 0);
  assert.equal(result.averageBallSpeed, 120);
});

test("does not treat app fallback zeroes as measured values when detectedMetrics omits them", () => {
  const result = metrics.calculateSessionMetrics([
    { carry: 150, ballSpeed: 112, spin: 0, detectedMetrics: ["carry", "ballSpeed"] },
    { carry: 154, ballSpeed: 115, spin: 0, detectedMetrics: ["carry", "ballSpeed"] },
  ]);

  assert.equal(result.averageCarry, 152);
  assert.equal(result.averageSpinRate, null);
  assert.equal(result.metricSummaries.spinRate.count, 0);
});

test("handles empty shot arrays", () => {
  const result = metrics.calculateSessionMetrics([]);

  assert.equal(result.validShotCount, 0);
  assert.equal(result.averageCarry, null);
  assert.equal(result.leftRightTendency.available, false);
  assert.equal(result.playableShotsPercentage, null);
});

test("calculates left and right tendency from signed and directional values", () => {
  const result = metrics.calculateSessionMetrics([
    { offline: "10 R" },
    { sideTotal: "7.5 R" },
    { offline: "0.4 L" },
    { sideCarry: "2.5 R" },
  ]);

  assert.equal(result.leftRightTendency.available, true);
  assert.equal(result.leftRightTendency.dominant, "right");
  assert.equal(result.leftRightTendency.rightCount, 3);
  assert.equal(result.leftRightTendency.leftCount, 0);
  assert.equal(result.leftRightTendency.centerCount, 1);
});

test("compares against a previous comparable session", () => {
  const result = metrics.calculateSessionMetrics(
    [
      { carry: 150, offline: -5 },
      { carry: 160, offline: 5 },
      { carry: 170, offline: 15 },
    ],
    [
      { carry: 140, offline: -10 },
      { carry: 150, offline: 10 },
      { carry: 160, offline: 20 },
    ],
  );

  assert.equal(result.previousSessionComparison.available, true);
  assert.equal(result.previousSessionComparison.carryDelta, 10);
  assert.equal(result.previousSessionComparison.offlineStandardDeviationDelta, -4.3);
});

test("excludes deleted, invalid, warm-up, and outlier shots", () => {
  const result = metrics.calculateSessionMetrics([
    { carry: 100 },
    { carry: 110, isWarmup: true },
    { carry: 120, valid: false },
    { carry: 130, deleted_at: "2026-07-16T00:00:00Z" },
    { carry: 300, isOutlier: true },
    { carry: 140 },
  ]);

  assert.equal(result.validShotCount, 2);
  assert.equal(result.averageCarry, 120);
});
