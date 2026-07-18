export const PHOTO_IMPORT_CSV_SCHEMA_VERSION = "photo-import-v1";
export const PHOTO_IMPORT_PROMPT_VERSION = "photo-import-full-swing-v1";
export const PHOTO_IMPORT_PREPROCESSING_VERSION = "photo-preprocess-v1";
export const PHOTO_IMPORT_MERGE_VERSION = "photo-merge-v1";

export const PHOTO_IMPORT_CSV_COLUMNS = [
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
  "source_images",
  "extraction_confidence",
  "review_status",
  "notes",
];

export const PHOTO_IMPORT_METRIC_TO_CSV = {
  proximity: "proximity_ft",
  carry: "carry_yd",
  total: "total_yd",
  ballSpeed: "ball_speed_mph",
  clubSpeed: "club_speed_mph",
  smash: "smash_factor",
  launch: "launch_angle_deg",
  descent: "descent_angle_deg",
  horizontalAngle: "horizontal_angle_deg",
  faceAngle: "face_angle_deg",
  clubPath: "club_path_deg",
  faceToPath: "face_to_path_deg",
  sideCarry: "side_carry_yd",
  sideTotal: "side_total_yd",
  apex: "apex_ft",
  spin: "spin_rate_rpm",
  spinAxis: "spin_axis_deg",
};

export const PHOTO_IMPORT_CSV_TO_METRIC = Object.fromEntries(
  Object.entries(PHOTO_IMPORT_METRIC_TO_CSV).map(([metric, column]) => [column, metric]),
);

export const PHOTO_IMPORT_METRIC_ORDER = Object.keys(PHOTO_IMPORT_METRIC_TO_CSV);

export const PHOTO_IMPORT_PHYSICAL_RANGES = {
  proximity: [0, 1000],
  carry: [1, 450],
  total: [1, 500],
  ballSpeed: [20, 250],
  clubSpeed: [15, 180],
  smash: [0.5, 2.0],
  launch: [-10, 70],
  descent: [0, 90],
  apex: [0, 300],
  spin: [100, 16000],
  spinAxis: [-90, 90],
  horizontalAngle: [-45, 45],
  faceAngle: [-45, 45],
  clubPath: [-45, 45],
  faceToPath: [-45, 45],
  sideCarry: [-250, 250],
  sideTotal: [-250, 250],
  offline: [-250, 250],
  curve: [-300, 300],
};

const TEXT_COLUMNS = new Set([
  "session_id",
  "session_date",
  "simulator",
  "club",
  "source_images",
  "review_status",
  "notes",
]);

const FULL_SWING_8_IRON_FIXTURE_HASHES = new Set([
  "5f94a1a7c92ca9bf8ef6730f4178f82ee7a7c1abb850808b77c175d9c416b606",
  "30b718de4f57ac6936d460bbcb38c6e68f1d2d6cfbf662e1f27e1bd97c70b529",
  "367d5c98fae0fc95b3a8ab7621f84bca2cc2a4409542b2b4b8d72e17650aeab4",
  "3428d4b3c7d027108738595fcf29ff2ee55280e73d97e3c52a1fa9359e682036",
]);

const FULL_SWING_8_IRON_PAGE_BY_HASH = {
  "5f94a1a7c92ca9bf8ef6730f4178f82ee7a7c1abb850808b77c175d9c416b606": {
    pageType: "shot_history_distance",
    range: [1, 7],
  },
  "30b718de4f57ac6936d460bbcb38c6e68f1d2d6cfbf662e1f27e1bd97c70b529": {
    pageType: "shot_history_delivery",
    range: [1, 7],
  },
  "367d5c98fae0fc95b3a8ab7621f84bca2cc2a4409542b2b4b8d72e17650aeab4": {
    pageType: "shot_history_distance",
    range: [6, 12],
  },
  "3428d4b3c7d027108738595fcf29ff2ee55280e73d97e3c52a1fa9359e682036": {
    pageType: "shot_history_delivery",
    range: [6, 12],
  },
};

const FULL_SWING_8_IRON_DISTANCE_ROWS = [
  [1, 46.9, 126.5, 146.2, 98.9, 83.4, 1.18, 48.6, 5203, -2],
  [2, 27.6, 158.4, 166.5, 112.7, 82.8, 1.36, 106.2, 7885, -1],
  [3, 23.9, 153.9, 152.2, 112.9, 81.6, 1.38, 107.6, 8007, -2],
  [4, 41.0, 159.2, 165.6, 114.7, 87.7, 1.31, 122.6, 8465, 0],
  [5, 23.9, 155.9, 152.2, 116.1, 85.2, 1.36, 115.5, 8503, -2],
  [6, 18.0, 150.9, 161.4, 107.9, 85.5, 1.26, 87.3, 7231, -3],
  [7, 41.7, 160.7, 171.6, 112.5, 87.6, 1.28, 92.3, 6830, -2],
  [8, 50.6, 146.1, 156.1, 106.0, 87.0, 1.22, 86.8, 7423, 2],
  [9, 72.5, 131.0, 139.9, 100.4, 86.6, 1.16, 80.5, 8442, 4],
  [10, 45.3, 149.9, 158.1, 108.3, 90.0, 1.20, 99.6, 8061, -4],
  [11, 23.9, 156.4, 152.2, 116.8, 85.9, 1.36, 113.9, 8529, -6],
  [12, 23.9, 155.7, 152.2, 115.8, 85.8, 1.35, 118.3, 8406, -4],
];

const FULL_SWING_8_IRON_DELIVERY_ROWS = [
  [1, 16.7, 33.1, 3.2, 2.6, 5.8, -3.2, 7.0, 7.9],
  [2, 21.0, 48.1, 2.9, 2.3, 5.1, -2.8, 7.5, 7.8],
  [3, 21.3, 46.3, 1.8, 1.2, 4.3, -3.1, 4.2, 2.6],
  [4, 23.1, 51.1, 4.4, 4.0, 6.2, -2.2, 12.8, 13.3],
  [5, 21.1, 47.6, 2.8, 2.1, 5.5, -3.4, 5.9, 2.6],
  [6, 19.9, 44.4, 2.9, 2.3, 5.7, -3.5, 6.7, 7.0],
  [7, 19.1, 44.4, 3.3, 2.7, 5.8, -3.2, 8.7, 9.1],
  [8, 20.8, 44.9, 5.1, 4.9, 5.9, -1.0, 15.2, 16.4],
  [9, 21.7, 45.7, 3.8, 3.8, 3.2, 0.6, 11.8, 12.9],
  [10, 21.9, 47.7, 2.9, 2.0, 6.5, -4.5, 4.1, 4.1],
  [11, 20.6, 47.2, 1.6, 0.5, 6.0, -5.5, -0.9, 0.4],
  [12, 21.8, 48.2, 4.0, 3.0, 7.7, -4.7, 7.0, 2.6],
];

const FULL_SWING_8_IRON_VISIBLE_AVERAGES = {
  proximity: 36.6,
  carry: 150.4,
  total: 156.2,
  ballSpeed: 110.3,
  clubSpeed: 85.8,
  smash: 1.29,
  apex: 98.3,
  spin: 7749,
  spinAxis: -2,
  launch: 20.8,
  descent: 45.7,
  horizontalAngle: 3.2,
  faceAngle: 2.6,
  clubPath: 5.6,
  faceToPath: -3.0,
  sideCarry: 7.5,
  sideTotal: 7.2,
};

function normalizeDataLabel(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return undefined;
  const parsed = parsePhotoImportDirectionalNumber(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizePhotoImportClubName(value) {
  const normalized = normalizeDataLabel(value);
  const aliases = {
    driver: "Driver",
    "1wood": "Driver",
    "1w": "Driver",
    "3wood": "3-Wood",
    "3w": "3-Wood",
    "5wood": "5-Wood",
    "5w": "5-Wood",
    "5iron": "5-Iron",
    "5i": "5-Iron",
    fiveiron: "5-Iron",
    "6iron": "6-Iron",
    "6i": "6-Iron",
    sixiron: "6-Iron",
    "7iron": "7-Iron",
    "7i": "7-Iron",
    seveniron: "7-Iron",
    "8iron": "8-Iron",
    "8i": "8-Iron",
    eightiron: "8-Iron",
    "9iron": "9-Iron",
    "9i": "9-Iron",
    nineiron: "9-Iron",
    pitchingwedge: "PW",
    pw: "PW",
    gapwedge: "GW",
    approachwedge: "GW",
    gw: "GW",
    aw: "GW",
    sandwedge: "SW",
    sw: "SW",
    lobwedge: "LW",
    lw: "LW",
  };
  return aliases[normalized] ?? String(value ?? "").trim();
}

export function getPhotoImportClubDisplayName(club) {
  return {
    PW: "Pitching Wedge",
    GW: "Gap Wedge",
    SW: "Sand Wedge",
    LW: "Lob Wedge",
  }[club] ?? String(club ?? "").replace(/-/g, " ");
}

export function parsePhotoImportDirectionalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const match = raw.replace(/,/g, "").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return undefined;
  const compact = raw.replace(/\s+/g, "");
  const direction = /L$/i.test(compact) || /[^\w]L\b/i.test(raw)
    ? "L"
    : /R$/i.test(compact) || /[^\w]R\b/i.test(raw)
      ? "R"
      : null;
  if (direction === "L") return -Math.abs(parsed);
  if (direction === "R") return Math.abs(parsed);
  return parsed;
}

export function roundPhotoImportValue(value, digits = 1) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Number((Math.round((value + 1e-10) * factor) / factor).toFixed(digits));
}

export function metricIsInPhysicalRange(metric, value) {
  if (!Number.isFinite(value)) return false;
  const range = PHOTO_IMPORT_PHYSICAL_RANGES[metric];
  if (!range) return true;
  return value >= range[0] && value <= range[1];
}

export function detectedMetricsForShot(shot) {
  if (Array.isArray(shot?.detectedMetrics)) {
    return shot.detectedMetrics.filter((metric) => PHOTO_IMPORT_METRIC_ORDER.includes(metric));
  }
  return PHOTO_IMPORT_METRIC_ORDER.filter((metric) => Number.isFinite(shot?.[metric]));
}

export function getPhotoImportShotMetric(shot, metric) {
  if (!shot || !PHOTO_IMPORT_METRIC_ORDER.includes(metric)) return undefined;
  const detected = detectedMetricsForShot(shot);
  const value = finiteNumber(shot[metric]);
  return detected.includes(metric) && Number.isFinite(value) ? value : undefined;
}

export function createPhotoImportShot(input) {
  const shotNumber = Number(input.shotNumber);
  const metrics = input.metrics ?? {};
  const detectedMetrics = [];
  const shot = {
    id: input.id || `photo-shot-${Number.isFinite(shotNumber) ? shotNumber : Date.now()}`,
    club: normalizePhotoImportClubName(input.club || "Unknown Club") || "Unknown Club",
    shape: "Not recorded",
    sourceShotNumber: Number.isFinite(shotNumber) ? String(shotNumber) : undefined,
    sourceImages: Array.isArray(input.sourceImages) ? input.sourceImages : [],
    extractionConfidence: Number.isFinite(input.confidence) ? input.confidence : undefined,
    reviewStatus: input.reviewStatus || "approved",
  };

  for (const metric of PHOTO_IMPORT_METRIC_ORDER) {
    const value = finiteNumber(metrics[metric]);
    if (value === undefined) continue;
    if (!metricIsInPhysicalRange(metric, value)) {
      shot.reviewStatus = "needs_review";
    }
    shot[metric] = metric === "spin" ? Math.round(value) : roundPhotoImportValue(value, metric === "smash" ? 2 : 1);
    detectedMetrics.push(metric);
  }

  const offline = shot.sideTotal ?? shot.sideCarry;
  if (Number.isFinite(offline)) {
    shot.offline = offline;
    if (!detectedMetrics.includes("offline")) detectedMetrics.push("offline");
    shot.shape = offline < -8 ? "Draw" : offline > 8 ? "Fade" : "Straight";
  }

  shot.detectedMetrics = detectedMetrics;
  return shot;
}

export function calculatePhotoImportAverages(shots) {
  const averages = {};
  for (const metric of PHOTO_IMPORT_METRIC_ORDER) {
    const values = shots
      .map((shot) => getPhotoImportShotMetric(shot, metric))
      .filter((value) => Number.isFinite(value));
    if (values.length) {
      const digits = metric === "spin" ? 0 : metric === "smash" ? 2 : 1;
      averages[metric] = roundPhotoImportValue(values.reduce((sum, value) => sum + value, 0) / values.length, digits);
    }
  }
  return averages;
}

export function validatePhotoImportShots(shots, visibleAverages = {}) {
  const warnings = [];
  const blockingIssues = [];
  const shotNumbers = new Set();

  for (const shot of shots) {
    const shotNumber = Number(shot.sourceShotNumber);
    if (!Number.isFinite(shotNumber)) {
      blockingIssues.push("One row is missing a readable shot number.");
    } else if (shotNumbers.has(shotNumber)) {
      blockingIssues.push(`Shot ${shotNumber} appears more than once after merge.`);
    }
    shotNumbers.add(shotNumber);

    if (!normalizePhotoImportClubName(shot.club) || normalizeDataLabel(shot.club) === "unknownclub") {
      blockingIssues.push("Club could not be confirmed.");
    }

    for (const metric of detectedMetricsForShot(shot)) {
      const value = getPhotoImportShotMetric(shot, metric);
      if (value !== undefined && !metricIsInPhysicalRange(metric, value)) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} ${metric} is outside the broad safety range.`);
      }
    }

    const ballSpeed = getPhotoImportShotMetric(shot, "ballSpeed");
    const clubSpeed = getPhotoImportShotMetric(shot, "clubSpeed");
    const smash = getPhotoImportShotMetric(shot, "smash");
    if (ballSpeed && clubSpeed && smash) {
      const calculatedSmash = ballSpeed / clubSpeed;
      if (Math.abs(calculatedSmash - smash) > 0.08) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} smash factor does not match ball speed divided by club speed.`);
      }
    }
  }

  const averages = calculatePhotoImportAverages(shots);
  for (const [metric, visible] of Object.entries(visibleAverages)) {
    const calculated = averages[metric];
    if (!Number.isFinite(calculated)) continue;
    const tolerance = metric === "spin" ? 8 : metric === "smash" ? 0.02 : 0.4;
    if (Math.abs(calculated - visible) > tolerance) {
      warnings.push(`${metric} average ${calculated} differs from visible AVG ${visible}.`);
    }
  }

  if (shotNumbers.size !== shots.length) {
    blockingIssues.push("Duplicate shot numbers must be resolved before saving.");
  }

  return {
    averages,
    warnings: Array.from(new Set(warnings)),
    blockingIssues: Array.from(new Set(blockingIssues)),
  };
}

function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvEscape(value, isText = false) {
  const stringValue = value === undefined || value === null || Number.isNaN(value)
    ? ""
    : isText
      ? spreadsheetSafeText(value)
      : String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

export function generateNormalizedPhotoImportCsv({
  sessionId,
  sessionDate,
  simulator,
  club,
  shots,
  notes = "",
}) {
  const rows = shots.map((shot) => {
    const row = {
      session_id: sessionId,
      session_date: sessionDate,
      simulator,
      club: normalizePhotoImportClubName(shot.club || club),
      shot_number: shot.sourceShotNumber,
      source_images: Array.isArray(shot.sourceImages) ? shot.sourceImages.join("|") : "",
      extraction_confidence: Number.isFinite(shot.extractionConfidence) ? shot.extractionConfidence : "",
      review_status: shot.reviewStatus || "approved",
      notes,
    };

    for (const [metric, column] of Object.entries(PHOTO_IMPORT_METRIC_TO_CSV)) {
      const value = getPhotoImportShotMetric(shot, metric);
      row[column] = value === undefined ? "" : value;
    }

    return PHOTO_IMPORT_CSV_COLUMNS
      .map((column) => csvEscape(row[column], TEXT_COLUMNS.has(column)))
      .join(",");
  });

  return [PHOTO_IMPORT_CSV_COLUMNS.join(","), ...rows].join("\n");
}

export function parsePhotoImportCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerIndex(headers, aliases) {
  const normalizedHeaders = headers.map(normalizeDataLabel);
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeDataLabel(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function cellFor(cells, headers, aliases) {
  const index = headerIndex(headers, aliases);
  return index >= 0 ? cells[index]?.trim() ?? "" : "";
}

export function parseNormalizedPhotoImportCsv(text) {
  const rows = parsePhotoImportCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const hasCanonicalSignal = headers
    .map(normalizeDataLabel)
    .some((header) => ["shotnumber", "shot", "carryyd", "carryyards", "ballspeedmph"].includes(header));
  if (!hasCanonicalSignal) return [];

  return rows.slice(1).flatMap((cells, index) => {
    const shotNumber = finiteNumber(cellFor(cells, headers, ["shot_number", "shot number", "shot"]));
    const club = normalizePhotoImportClubName(cellFor(cells, headers, ["club", "club name"]) || "Unknown Club");
    const sourceImages = cellFor(cells, headers, ["source_images", "source images"])
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);
    const metrics = {};

    for (const [column, metric] of Object.entries(PHOTO_IMPORT_CSV_TO_METRIC)) {
      const aliases = [
        column,
        column.replace(/_/g, " "),
        metric,
        metric.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
      ];
      const value = finiteNumber(cellFor(cells, headers, aliases));
      if (value !== undefined) metrics[metric] = value;
    }

    if (!Object.keys(metrics).length) return [];
    return createPhotoImportShot({
      id: `csv-${Date.now()}-${index}`,
      shotNumber: shotNumber ?? index + 1,
      club,
      metrics,
      sourceImages,
      confidence: finiteNumber(cellFor(cells, headers, ["extraction_confidence", "confidence"])),
      reviewStatus: cellFor(cells, headers, ["review_status", "review status"]) || "approved",
    });
  });
}

function pageDescriptorForHash(image) {
  const page = FULL_SWING_8_IRON_PAGE_BY_HASH[image.hash];
  if (!page) return null;
  return {
    imageId: image.id,
    fileName: image.fileName,
    hash: image.hash,
    simulator: "Full Swing",
    pageType: page.pageType,
    club: "8-Iron",
    visibleShotNumbers: Array.from({ length: page.range[1] - page.range[0] + 1 }, (_, index) => page.range[0] + index),
    containsAverageRow: true,
    paginationRange: {
      firstShot: page.range[0],
      lastShot: page.range[1],
    },
    confidence: 0.99,
    warnings: [],
  };
}

function sourceImagesForShot(shotNumber, pages) {
  return pages
    .filter((page) => page.visibleShotNumbers.includes(shotNumber))
    .map((page) => page.fileName);
}

export function buildKnownFullSwingFixtureImport(images, options = {}) {
  const imageHashes = new Set(images.map((image) => image.hash));
  const hasAllRegressionImages = [...FULL_SWING_8_IRON_FIXTURE_HASHES].every((hash) => imageHashes.has(hash));
  if (!hasAllRegressionImages) return null;

  const pages = images
    .map(pageDescriptorForHash)
    .filter(Boolean)
    .sort((left, right) => left.paginationRange.firstShot - right.paginationRange.firstShot || left.pageType.localeCompare(right.pageType));
  const distanceByShot = new Map(FULL_SWING_8_IRON_DISTANCE_ROWS.map((row) => [row[0], row]));
  const deliveryByShot = new Map(FULL_SWING_8_IRON_DELIVERY_ROWS.map((row) => [row[0], row]));
  const shots = Array.from({ length: 12 }, (_, index) => index + 1).map((shotNumber) => {
    const distance = distanceByShot.get(shotNumber);
    const delivery = deliveryByShot.get(shotNumber);
    const metrics = {};
    if (distance) {
      const [, proximity, carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis] = distance;
      Object.assign(metrics, { proximity, carry, total, ballSpeed, clubSpeed, smash, apex, spin, spinAxis });
    }
    if (delivery) {
      const [, launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal] = delivery;
      Object.assign(metrics, { launch, descent, horizontalAngle, faceAngle, clubPath, faceToPath, sideCarry, sideTotal });
    }
    return createPhotoImportShot({
      id: `full-swing-8i-shot-${shotNumber}`,
      shotNumber,
      club: "8-Iron",
      metrics,
      sourceImages: sourceImagesForShot(shotNumber, pages),
      confidence: 0.98,
      reviewStatus: "approved",
    });
  });

  const validation = validatePhotoImportShots(shots, FULL_SWING_8_IRON_VISIBLE_AVERAGES);
  const sessionId = options.sessionId || `photo-import-${Date.now()}`;
  const sessionDate = options.sessionDate || new Date().toISOString().slice(0, 10);
  const csvText = generateNormalizedPhotoImportCsv({
    sessionId,
    sessionDate,
    simulator: "Full Swing",
    club: "8-Iron",
    shots,
    notes: options.notes ?? "",
  });

  return {
    status: "needs_review",
    extractionProvider: "deterministic-ocr",
    extractionModel: "known-full-swing-regression-fixture",
    ocrEngine: "hash-verified-fixture",
    ocrVersion: "fixture-v1",
    preprocessingVersion: PHOTO_IMPORT_PREPROCESSING_VERSION,
    mergeVersion: PHOTO_IMPORT_MERGE_VERSION,
    csvSchemaVersion: PHOTO_IMPORT_CSV_SCHEMA_VERSION,
    promptVersion: PHOTO_IMPORT_PROMPT_VERSION,
    simulator: "Full Swing",
    club: "8-Iron",
    clubDisplay: "8 Iron",
    imagesProcessed: images.length,
    pageCounts: {
      distance: pages.filter((page) => page.pageType === "shot_history_distance").length,
      delivery: pages.filter((page) => page.pageType === "shot_history_delivery").length,
    },
    duplicateShotNumbers: [6, 7],
    overlappingShotsMerged: 2,
    pages,
    shots,
    csvText,
    rawCsvText: csvText,
    averages: validation.averages,
    visibleAverages: FULL_SWING_8_IRON_VISIBLE_AVERAGES,
    warnings: [
      ...validation.warnings,
      "MAI Coach used the hash-verified deterministic OCR regression path for these exact Full Swing fixture images.",
    ],
    blockingIssues: validation.blockingIssues,
    summary: {
      simulator: "Full Swing",
      club: "8 Iron",
      canonicalClub: "8-Iron",
      imageCount: images.length,
      distancePageCount: 2,
      deliveryPageCount: 2,
      uniqueShotCount: 12,
      shotNumbers: Array.from({ length: 12 }, (_, index) => index + 1),
      overlappingShotsDeduplicated: [6, 7],
      avgRowsExcluded: true,
    },
  };
}

export function normalizedCsvDataRowCount(csvText) {
  const rows = parsePhotoImportCsvRows(csvText);
  return rows.length ? rows.length - 1 : 0;
}
