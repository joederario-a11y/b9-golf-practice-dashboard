import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildKnownFullSwingFixtureImport,
  calculatePhotoImportAverages,
  generateNormalizedPhotoImportCsv,
  normalizedCsvDataRowCount,
  parseNormalizedPhotoImportCsv,
  parsePhotoImportDirectionalNumber,
  PHOTO_IMPORT_CSV_COLUMNS,
} from "../lib/photo-import-policy.mjs";

function assertClose(actual, expected, tolerance = 0.11) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

const fixtureImages = [
  {
    id: "image-1",
    fileName: "Library - 1 of 4.jpeg",
    hash: "5f94a1a7c92ca9bf8ef6730f4178f82ee7a7c1abb850808b77c175d9c416b606",
  },
  {
    id: "image-2",
    fileName: "Library - 2 of 4.jpeg",
    hash: "30b718de4f57ac6936d460bbcb38c6e68f1d2d6cfbf662e1f27e1bd97c70b529",
  },
  {
    id: "image-3",
    fileName: "Library - 3 of 4.jpeg",
    hash: "367d5c98fae0fc95b3a8ab7621f84bca2cc2a4409542b2b4b8d72e17650aeab4",
  },
  {
    id: "image-4",
    fileName: "Library - 4 of 4.jpeg",
    hash: "3428d4b3c7d027108738595fcf29ff2ee55280e73d97e3c52a1fa9359e682036",
  },
];

test("known Full Swing 8-Iron fixture merges four pages into 12 unique shots", () => {
  const result = buildKnownFullSwingFixtureImport(fixtureImages, {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
  });

  assert.ok(result);
  assert.equal(result.simulator, "Full Swing");
  assert.equal(result.club, "8-Iron");
  assert.equal(result.summary.uniqueShotCount, 12);
  assert.deepEqual(result.summary.shotNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(result.duplicateShotNumbers, [6, 7]);
  assert.equal(result.pageCounts.distance, 2);
  assert.equal(result.pageCounts.delivery, 2);
  assert.equal(result.summary.avgRowsExcluded, true);
  assert.equal(new Set(result.shots.map((shot) => shot.sourceShotNumber)).size, 12);
});

test("fixture preserves representative distance and delivery values", () => {
  const result = buildKnownFullSwingFixtureImport(fixtureImages, {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
  });
  const byShot = new Map(result.shots.map((shot) => [Number(shot.sourceShotNumber), shot]));

  assert.equal(byShot.get(1).carry, 126.5);
  assert.equal(byShot.get(2).carry, 158.4);
  assert.equal(byShot.get(6).carry, 150.9);
  assert.equal(byShot.get(7).carry, 160.7);
  assert.equal(byShot.get(1).launch, 16.7);
  assert.equal(byShot.get(2).launch, 21);
  assert.equal(byShot.get(6).launch, 19.9);
  assert.equal(byShot.get(7).launch, 19.1);
  assert.equal(byShot.get(6).faceToPath, -3.5);
  assert.equal(byShot.get(11).sideCarry, -0.9);
});

test("fixture averages match the visible Full Swing AVG rows", () => {
  const result = buildKnownFullSwingFixtureImport(fixtureImages, {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
  });
  const averages = calculatePhotoImportAverages(result.shots);

  assert.equal(averages.carry, 150.4);
  assert.equal(averages.total, 156.2);
  assertClose(averages.ballSpeed, 110.3);
  assert.equal(averages.clubSpeed, 85.8);
  assert.equal(averages.smash, 1.29);
  assert.equal(averages.launch, 20.8);
  assert.equal(averages.descent, 45.7);
});

test("normalized CSV uses canonical columns and 12 data rows", () => {
  const result = buildKnownFullSwingFixtureImport(fixtureImages, {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
  });

  assert.equal(result.csvText.split("\n")[0], PHOTO_IMPORT_CSV_COLUMNS.join(","));
  assert.equal(normalizedCsvDataRowCount(result.csvText), 12);
  assert.equal(result.csvText.includes("AVG"), false);
  assert.equal(result.csvText.includes("undefined"), false);
  assert.equal(result.csvText.includes("null"), false);
  assert.equal(result.csvText.includes("NaN"), false);
});

test("normalized CSV round trip preserves shot count and signed metrics", () => {
  const result = buildKnownFullSwingFixtureImport(fixtureImages, {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
  });
  const parsed = parseNormalizedPhotoImportCsv(result.csvText);
  const roundTripCsv = generateNormalizedPhotoImportCsv({
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
    simulator: "Full Swing",
    club: "8-Iron",
    shots: parsed,
  });

  assert.equal(parsed.length, 12);
  assert.equal(parsed.find((shot) => shot.sourceShotNumber === "6").clubPath, 5.7);
  assert.equal(parsed.find((shot) => shot.sourceShotNumber === "6").faceToPath, -3.5);
  assert.equal(normalizedCsvDataRowCount(roundTripCsv), 12);
});

test("direction parser does not double negate left values", () => {
  assert.equal(parsePhotoImportDirectionalNumber("3.2 R"), 3.2);
  assert.equal(parsePhotoImportDirectionalNumber("3.0 L"), -3);
  assert.equal(parsePhotoImportDirectionalNumber("-0.9 L"), -0.9);
  assert.equal(parsePhotoImportDirectionalNumber("-2L"), -2);
  assert.equal(parsePhotoImportDirectionalNumber("0R"), 0);
});

test("empty numeric CSV fields stay missing, not zero", () => {
  const csv = [
    PHOTO_IMPORT_CSV_COLUMNS.join(","),
    "abc,2026-07-17,Full Swing,8-Iron,1,,150.0,,,,,,,,,,,,,,,,image-1,0.9,approved,",
  ].join("\n");
  const [shot] = parseNormalizedPhotoImportCsv(csv);

  assert.equal(shot.carry, 150);
  assert.equal(Object.hasOwn(shot, "proximity"), false);
  assert.equal(shot.detectedMetrics.includes("proximity"), false);
});
