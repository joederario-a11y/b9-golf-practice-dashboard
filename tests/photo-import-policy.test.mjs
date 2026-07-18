import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PHOTO_IMPORT_CSV_COLUMNS,
  calculatePhotoImportAverages,
  generateNormalizedPhotoImportCsv,
  mergeVisionPhotoImportResult,
  normalizedCsvDataRowCount,
  normalizeVisionExtractedCell,
  parseNormalizedPhotoImportCsv,
  parsePhotoImportDirectionalNumber,
} from "../lib/photo-import-policy.mjs";

function assertClose(actual, expected, tolerance = 0.11) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

function cell(value, confidence = 0.92) {
  if (value === null || value === undefined) return null;
  return {
    rawText: String(value),
    value: typeof value === "number" ? value : null,
    direction: /L$/i.test(String(value).trim()) ? "L" : /R$/i.test(String(value).trim()) ? "R" : null,
    confidence,
  };
}

function metrics(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, cell(value)]));
}

function page(fileName, pageType, rows, averageMetrics = {}) {
  return {
    fileName,
    pageType,
    visibleShotNumbers: rows.map((row) => row.shotNumber),
    containsAverageRow: Object.keys(averageMetrics).length > 0,
    averageMetrics: metrics(averageMetrics),
    rows: rows.map((row) => ({
      shotNumber: row.shotNumber,
      metrics: metrics(row.metrics),
    })),
    confidence: 0.94,
    warnings: [],
  };
}

const fullSwingDistanceRows = [
  [1, 46.9, 126.5, 146.2, 98.9, 83.4, 1.18, 48.6, 5203, "-2 L"],
  [2, 27.6, 158.4, 166.5, 112.7, 82.8, 1.36, 106.2, 7885, "-1 L"],
  [3, 23.9, 153.9, 152.2, 112.9, 81.6, 1.38, 107.6, 8007, "-2 L"],
  [4, 41.0, 159.2, 165.6, 114.7, 87.7, 1.31, 122.6, 8465, "0"],
  [5, 23.9, 155.9, 152.2, 116.1, 85.2, 1.36, 115.5, 8503, "-2 L"],
  [6, 18.0, 150.9, 161.4, 107.9, 85.5, 1.26, 87.3, 7231, "-3 L"],
  [7, 41.7, 160.7, 171.6, 112.5, 87.6, 1.28, 92.3, 6830, "-2 L"],
  [8, 50.6, 146.1, 156.1, 106.0, 87.0, 1.22, 86.8, 7423, "2 R"],
  [9, 72.5, 131.0, 139.9, 100.4, 86.6, 1.16, 80.5, 8442, "4 R"],
  [10, 45.3, 149.9, 158.1, 108.3, 90.0, 1.20, 99.6, 8061, "-4 L"],
  [11, 23.9, 156.4, 152.2, 116.8, 85.9, 1.36, 113.9, 8529, "-6 L"],
  [12, 23.9, 155.7, 152.2, 115.8, 85.8, 1.35, 118.3, 8406, "-4 L"],
];

const fullSwingDeliveryRows = [
  [1, 16.7, 33.1, "3.2 R", "2.6 R", "5.8 R", "3.2 L", "7.0 R", "7.9 R"],
  [2, 21.0, 48.1, "2.9 R", "2.3 R", "5.1 R", "2.8 L", "7.5 R", "7.8 R"],
  [3, 21.3, 46.3, "1.8 R", "1.2 R", "4.3 R", "3.1 L", "4.2 R", "2.6 R"],
  [4, 23.1, 51.1, "4.4 R", "4.0 R", "6.2 R", "2.2 L", "12.8 R", "13.3 R"],
  [5, 21.1, 47.6, "2.8 R", "2.1 R", "5.5 R", "3.4 L", "5.9 R", "2.6 R"],
  [6, 19.9, 44.4, "2.9 R", "2.3 R", "5.7 R", "3.5 L", "6.7 R", "7.0 R"],
  [7, 19.1, 44.4, "3.3 R", "2.7 R", "5.8 R", "3.2 L", "8.7 R", "9.1 R"],
  [8, 20.8, 44.9, "5.1 R", "4.9 R", "5.9 R", "1.0 L", "15.2 R", "16.4 R"],
  [9, 21.7, 45.7, "3.8 R", "3.8 R", "3.2 R", "0.6 R", "11.8 R", "12.9 R"],
  [10, 21.9, 47.7, "2.9 R", "2.0 R", "6.5 R", "4.5 L", "4.1 R", "4.1 R"],
  [11, 20.6, 47.2, "1.6 R", "0.5 R", "6.0 R", "5.5 L", "0.9 L", "0.4 R"],
  [12, 21.8, 48.2, "4.0 R", "3.0 R", "7.7 R", "4.7 L", "7.0 R", "2.6 R"],
];

test("normalized photo CSV uses the user-facing column order", () => {
  assert.deepEqual(PHOTO_IMPORT_CSV_COLUMNS, [
    "session_id",
    "session_date",
    "simulator",
    "club",
    "shot_number",
    "proximity_ft",
    "carry_yd",
    "total_yd",
    "ball_speed_mph",
    "club_speed_mph",
    "smash_factor",
    "launch_angle_deg",
    "descent_angle_deg",
    "horizontal_angle_deg",
    "face_angle_deg",
    "club_path_deg",
    "face_to_path_deg",
    "side_carry_yd",
    "side_total_yd",
    "apex_ft",
    "spin_rate_rpm",
    "spin_axis_deg",
    "notes",
  ]);
});

function fullSwingDistanceRow(row) {
  const [shotNumber, proximity, carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis] = row;
  return { shotNumber, metrics: { proximity, carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis } };
}

function fullSwingDeliveryRow(row) {
  const [shotNumber, launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal] = row;
  return { shotNumber, metrics: { launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal } };
}

function fullSwingExtraction(fileNames = ["distance-a.jpg", "delivery-a.jpg", "distance-b.jpg", "delivery-b.jpg"]) {
  return {
    simulator: "Full Swing",
    club: "8 Iron",
    warnings: [],
    pages: [
      page(fileNames[0], "shot_history_distance", fullSwingDistanceRows.slice(0, 7).map(fullSwingDistanceRow), {
        proximity: 36.6,
        carry: 150.4,
        total: 156.2,
        ballSpeed: 110.3,
        clubSpeed: 85.8,
        smash: 1.29,
        apex: 98.3,
        spin: 7749,
        spinAxis: "-2 L",
      }),
      page(fileNames[1], "shot_history_delivery", fullSwingDeliveryRows.slice(0, 7).map(fullSwingDeliveryRow), {
        launch: 20.8,
        descent: 45.7,
        horizontalAngle: "3.2 R",
        faceAngle: "2.6 R",
        clubPath: "5.6 R",
        faceToPath: "3.0 L",
        sideCarry: "7.5 R",
        sideTotal: "7.2 R",
      }),
      page(fileNames[2], "shot_history_distance", fullSwingDistanceRows.slice(5).map(fullSwingDistanceRow), {}),
      page(fileNames[3], "shot_history_delivery", fullSwingDeliveryRows.slice(5).map(fullSwingDeliveryRow), {}),
    ],
  };
}

function mergeFullSwing(options = {}) {
  return mergeVisionPhotoImportResult(fullSwingExtraction(options.fileNames), {
    sessionId: "fixture-session",
    sessionDate: "2026-07-17",
    imageFileNames: options.fileNames,
    extractionModel: "test-vision-model",
  });
}

test("generic vision merge recovers Full Swing 8-Iron content without hashes", () => {
  const result = mergeFullSwing();

  assert.equal(result.extractionProvider, "openai-vision");
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

test("renamed and reordered extraction pages still recover the same session", () => {
  const extraction = fullSwingExtraction(["cropped-delivery-two.jpg", "recompressed-distance-one.jpg", "screen-shot-delivery-one.jpg", "renamed-distance-two.jpg"]);
  extraction.pages = [extraction.pages[3], extraction.pages[1], extraction.pages[0], extraction.pages[2]];
  const result = mergeVisionPhotoImportResult(extraction, {
    sessionId: "modified-hash-session",
    sessionDate: "2026-07-17",
    imageFileNames: extraction.pages.map((pageData) => pageData.fileName),
  });
  const byShot = new Map(result.shots.map((shot) => [Number(shot.sourceShotNumber), shot]));

  assert.equal(result.summary.uniqueShotCount, 12);
  assert.equal(byShot.get(6).carry, 150.9);
  assert.equal(byShot.get(6).faceToPath, -3.5);
  assert.ok(byShot.get(12).sourceImages.includes("renamed-distance-two.jpg"));
});

test("fixture values are preserved through generic merge and CSV output", () => {
  const result = mergeFullSwing();
  const byShot = new Map(result.shots.map((shot) => [Number(shot.sourceShotNumber), shot]));
  const averages = calculatePhotoImportAverages(result.shots);

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
  assert.equal(averages.carry, 150.4);
  assert.equal(averages.total, 156.2);
  assertClose(averages.ballSpeed, 110.3);
  assert.equal(averages.clubSpeed, 85.8);
  assert.equal(averages.smash, 1.29);
  assert.equal(averages.launch, 20.8);
  assert.equal(averages.descent, 45.7);
  assert.equal(result.csvText.split("\n")[0], PHOTO_IMPORT_CSV_COLUMNS.join(","));
  assert.equal(normalizedCsvDataRowCount(result.csvText), 12);
  assert.equal(result.csvText.includes("AVG"), false);
  assert.equal(result.csvText.includes("undefined"), false);
  assert.equal(result.csvText.includes("null"), false);
  assert.equal(result.csvText.includes("NaN"), false);
});

test("normalized CSV round trip preserves shot count and signed metrics", () => {
  const result = mergeFullSwing();
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

test("a second Full Swing session with another club does not leak fixture data", () => {
  const sandWedgeDistanceRows = [
    [41, 181.9, 193.8, 120.2, 91.5, 1.31, 104.9, 4401, "8 R"],
    [42, 166.8, 183.9, 112.7, 83.7, 1.35, 77.6, 3777, "8 L"],
    [43, 202.6, 218.5, 127.1, 92.9, 1.37, 104.2, 2304, "3 L"],
    [44, 179.4, 193.7, 118.6, 86.4, 1.37, 93.6, 4111, "5 L"],
    [45, 161.2, 179.1, 109.9, 84.4, 1.30, 73.5, 3673, "4 R"],
    [46, 164.6, 183.6, 112.1, 84.7, 1.32, 71.7, 3590, "8 L"],
    [47, 181.2, 198.0, 120.5, 88.4, 1.36, 80.7, 3595, "0"],
  ];
  const sandWedgeDeliveryRows = [
    [41, 20.4, 44.3, "0.4 L", "0.2 R", "2.7 L", "2.8 R", "10.6 R", "11.9 R"],
    [42, 18.8, 38.2, "5.8 L", "7.1 L", "0.4 L", "6.7 L", "18.9 L", "21.7 L"],
    [43, 20.1, 41.2, "5.8 L", "6.5 L", "2.8 L", "3.8 L", "17.6 L", "19.3 L"],
    [44, 19.4, 41.7, "4.3 L", "5.2 L", "0.4 L", "4.8 L", "12.6 L", "14.0 L"],
    [45, 18.7, 37.3, "0.2 R", "0.3 R", "0.3 L", "0.5 R", "6.1 R", "7.2 R"],
    [46, 18.0, 36.4, "5.5 L", "6.8 L", "0.1 L", "6.7 L", "17.6 L", "20.6 L"],
    [47, 17.0, 37.9, "3.7 L", "4.1 L", "2.1 L", "2.1 L", "7.6 L", "8.4 L"],
  ];
  const extraction = {
    simulator: "Full Swing",
    club: "Sand Wedge",
    warnings: [],
    pages: [
      page("IMG_0483-distance.jpg", "shot_history_distance", sandWedgeDistanceRows.map(([shotNumber, carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis]) => ({
        shotNumber,
        metrics: { carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis },
      })), { carry: 176.8, total: 193.1 }),
      page("IMG_0484-delivery.jpg", "shot_history_delivery", sandWedgeDeliveryRows.map(([shotNumber, launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal]) => ({
        shotNumber,
        metrics: { launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal },
      })), { launch: 18.9, descent: 39.6 }),
    ],
  };
  const result = mergeVisionPhotoImportResult(extraction, {
    sessionId: "sand-wedge-session",
    sessionDate: "2026-07-17",
  });
  const byShot = new Map(result.shots.map((shot) => [Number(shot.sourceShotNumber), shot]));

  assert.equal(result.club, "SW");
  assert.equal(result.summary.uniqueShotCount, 7);
  assert.deepEqual(result.summary.shotNumbers, [41, 42, 43, 44, 45, 46, 47]);
  assert.equal(byShot.get(41).carry, 181.9);
  assert.equal(byShot.get(42).sideTotal, -21.7);
  assert.equal(byShot.get(45).clubPath, -0.3);
  assert.equal(result.shots.some((shot) => shot.sourceShotNumber === "1"), false);
  assert.equal(normalizedCsvDataRowCount(result.csvText), 7);
});

test("random images with fixture-like filenames do not create an 8-Iron session", () => {
  const result = mergeVisionPhotoImportResult({
    simulator: "Unknown",
    club: null,
    warnings: ["No table detected."],
    pages: [
      page("Library - 1 of 4.jpeg", "unknown", [], {}),
      page("Library - 2 of 4.jpeg", "unknown", [], {}),
    ],
  }, { sessionId: "negative", sessionDate: "2026-07-17" });

  assert.equal(result.summary.uniqueShotCount, 0);
  assert.notEqual(result.club, "8-Iron");
  assert.equal(result.blockingIssues.includes("No readable shot rows were found in the uploaded photos."), true);
});

test("direction parser and extracted cells keep left values signed negative", () => {
  assert.equal(parsePhotoImportDirectionalNumber("3.2 R"), 3.2);
  assert.equal(parsePhotoImportDirectionalNumber("3.0 L"), -3);
  assert.equal(parsePhotoImportDirectionalNumber("-0.9 L"), -0.9);
  assert.equal(parsePhotoImportDirectionalNumber("-2L"), -2);
  assert.equal(parsePhotoImportDirectionalNumber("0R"), 0);
  assert.equal(normalizeVisionExtractedCell({ rawText: "2.8 L", value: 2.8, direction: "L", confidence: 0.9 }).value, -2.8);
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
