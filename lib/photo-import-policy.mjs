import { normalizeLaunchMonitorClubName } from "./launch-monitor-import-policy.mjs";

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
  "notes",
]);

export const PHOTO_IMPORT_PAGE_TYPES = [
  "shot_history_distance",
  "shot_history_delivery",
  "unknown",
];

const PHOTO_IMPORT_METRIC_ALIASES = {
  proximity: ["proximity", "prox", "proximityft", "proximityfeet", "distancefrompin"],
  carry: ["carry", "carryyd", "carryyards", "carrydistance", "carrydistanceyd", "carrydistanceyards"],
  total: ["total", "totalyd", "totalyards", "totaldistance", "totaldistanceyd", "totaldistanceyards"],
  ballSpeed: ["ballspeed", "ballspeedmph"],
  clubSpeed: ["clubspeed", "clubspeedmph"],
  smash: ["smash", "smashfactor"],
  launch: ["launch", "launchangle", "launchangledeg"],
  descent: ["descent", "descentangle", "descentangledeg", "landingangle"],
  horizontalAngle: ["horizontalangle", "horizangle", "launchdirection", "launchdir"],
  faceAngle: ["faceangle", "face", "faceangledeg"],
  clubPath: ["clubpath", "path", "clubpathdeg"],
  faceToPath: ["facetopath", "facepath", "f2p", "facetopathdeg"],
  sideCarry: ["sidecarry", "sidecarryyd", "sidecarryyards"],
  sideTotal: ["sidetotal", "sidetotalyd", "sidetotalyards"],
  apex: ["apex", "height", "apexft", "heightft", "maxheight", "apexheight", "apexheightft"],
  spin: ["spin", "spinrate", "spinrpm", "spinraterpm"],
  spinAxis: ["spinaxis", "axis", "spinaxisdeg"],
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
  return normalizeLaunchMonitorClubName(value);
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
    metricSources: {},
    rawSourceData: input.rawSourceData,
    reviewStatus: input.reviewStatus || "approved",
  };

  for (const metric of PHOTO_IMPORT_METRIC_ORDER) {
    const value = finiteNumber(metrics[metric]);
    if (value === undefined) continue;
    if (!metricIsInPhysicalRange(metric, value)) {
      shot.reviewStatus = "needs_review";
    }
    shot[metric] = metric === "spin" ? Math.round(value) : roundPhotoImportValue(value, metric === "smash" ? 2 : 1);
    shot.metricSources[metric] = {
      kind: "measured",
      confidence: Number.isFinite(input.confidence) ? input.confidence : 0.85,
      method: "Read from uploaded launch-monitor photo or normalized CSV.",
      originalColumn: input.originalColumns?.[metric],
    };
    detectedMetrics.push(metric);
  }

  const offline = shot.sideTotal ?? shot.sideCarry;
  if (Number.isFinite(offline)) {
    shot.offline = offline;
    shot.metricSources.offline = {
      kind: "derived",
      confidence: Number.isFinite(shot.sideTotal) ? 0.96 : 0.92,
      method: Number.isFinite(shot.sideTotal)
        ? "Copied from Side Total for dashboard dispersion."
        : "Copied from Side Carry for dashboard dispersion.",
      inputMetrics: [Number.isFinite(shot.sideTotal) ? "sideTotal" : "sideCarry"],
    };
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
    const originalColumns = {};
    const rawSourceData = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex]?.trim() ?? ""]));

    for (const [column, metric] of Object.entries(PHOTO_IMPORT_CSV_TO_METRIC)) {
      const aliases = [
        column,
        column.replace(/_/g, " "),
        metric,
        metric.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
        ...(PHOTO_IMPORT_METRIC_ALIASES[metric] ?? []),
      ];
      const matchedHeader = headers.find((header) => aliases.some((alias) => normalizeDataLabel(alias) === normalizeDataLabel(header)));
      const value = finiteNumber(cellFor(cells, headers, aliases));
      if (value !== undefined) {
        metrics[metric] = value;
        originalColumns[metric] = matchedHeader ?? column;
      }
    }

    if (!Object.keys(metrics).length) return [];
    return createPhotoImportShot({
      id: `csv-${Date.now()}-${index}`,
      shotNumber: shotNumber ?? index + 1,
      club,
      metrics,
      originalColumns,
      rawSourceData,
      sourceImages,
      confidence: finiteNumber(cellFor(cells, headers, ["extraction_confidence", "confidence"])),
      reviewStatus: cellFor(cells, headers, ["review_status", "review status"]) || "approved",
    });
  });
}

function clampConfidence(value, fallback = 0.65) {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function directionFromRaw(rawText, explicitDirection) {
  const normalized = String(explicitDirection ?? "").trim().toUpperCase();
  if (normalized === "L" || normalized === "R") return normalized;
  const raw = String(rawText ?? "").trim();
  const compact = raw.replace(/\s+/g, "");
  if (/L$/i.test(compact) || /[^\w]L\b/i.test(raw)) return "L";
  if (/R$/i.test(compact) || /[^\w]R\b/i.test(raw)) return "R";
  return null;
}

export function normalizeVisionMetricName(value) {
  const normalized = normalizeDataLabel(value);
  for (const [metric, aliases] of Object.entries(PHOTO_IMPORT_METRIC_ALIASES)) {
    if (normalizeDataLabel(metric) === normalized || aliases.includes(normalized)) return metric;
  }
  return "";
}

export function normalizeVisionExtractedCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") {
    const parsed = finiteNumber(value);
    return {
      rawText: String(value),
      value: parsed ?? null,
      direction: directionFromRaw(value, null),
      confidence: Number.isFinite(parsed) ? 0.7 : 0.35,
    };
  }
  if (typeof value !== "object") return null;

  const rawText = typeof value.rawText === "string"
    ? value.rawText.trim()
    : typeof value.text === "string"
      ? value.text.trim()
      : typeof value.raw === "string"
        ? value.raw.trim()
        : "";
  const direction = directionFromRaw(rawText, value.direction);
  const directValue = typeof value.value === "number" && Number.isFinite(value.value)
    ? value.value
    : finiteNumber(value.value);
  const parsed = directValue ?? finiteNumber(rawText);
  const signedValue = parsed === undefined
    ? null
    : direction === "L"
      ? -Math.abs(parsed)
      : direction === "R"
        ? Math.abs(parsed)
        : parsed;

  return {
    rawText,
    value: signedValue,
    direction,
    confidence: clampConfidence(value.confidence, signedValue === null ? 0.35 : 0.65),
  };
}

function normalizeVisionMetricRecord(record) {
  const metrics = {};
  if (!record || typeof record !== "object") return metrics;
  for (const [rawMetric, rawCell] of Object.entries(record)) {
    const metric = normalizeVisionMetricName(rawMetric);
    if (!metric) continue;
    metrics[metric] = normalizeVisionExtractedCell(rawCell);
  }
  return metrics;
}

function shotNumberFromValue(value) {
  const parsed = finiteNumber(value);
  return parsed === undefined ? null : Math.round(parsed);
}

function normalizeSimulatorName(value) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeDataLabel(raw);
  if (!normalized) return "Unknown";
  if (normalized.includes("fullswing")) return "Full Swing";
  if (normalized.includes("trackman")) return "TrackMan";
  if (normalized.includes("foresight")) return "Foresight";
  if (normalized.includes("skytrak")) return "SkyTrak";
  return raw;
}

function classifyPageType(page) {
  const value = String(page?.pageType ?? "").trim();
  if (PHOTO_IMPORT_PAGE_TYPES.includes(value)) return value;
  const rows = Array.isArray(page?.rows) ? page.rows : [];
  const metricNames = rows.flatMap((row) => row && typeof row === "object" && row.metrics
    ? Object.keys(row.metrics).map(normalizeVisionMetricName)
    : []);
  const deliveryCount = metricNames.filter((metric) =>
    ["launch", "descent", "horizontalAngle", "faceAngle", "clubPath", "faceToPath", "sideCarry", "sideTotal"].includes(metric),
  ).length;
  const distanceCount = metricNames.filter((metric) =>
    ["proximity", "carry", "total", "ballSpeed", "clubSpeed", "smash", "apex", "spin", "spinAxis"].includes(metric),
  ).length;
  if (deliveryCount > distanceCount) return "shot_history_delivery";
  if (distanceCount > 0) return "shot_history_distance";
  return "unknown";
}

export function normalizeVisionPhotoImportResult(raw, options = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Vision extraction result must be an object.");
  }

  const imageFileNames = Array.isArray(options.imageFileNames) ? options.imageFileNames : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((warning) => typeof warning === "string") : [];
  const pages = (Array.isArray(raw.pages) ? raw.pages : []).map((page, index) => {
    const rows = (Array.isArray(page?.rows) ? page.rows : []).map((row) => ({
      shotNumber: shotNumberFromValue(row?.shotNumber),
      metrics: normalizeVisionMetricRecord(row?.metrics),
    }));
    const visibleShotNumbers = Array.from(new Set([
      ...(Array.isArray(page?.visibleShotNumbers) ? page.visibleShotNumbers.map(shotNumberFromValue) : []),
      ...rows.map((row) => row.shotNumber),
    ].filter((shotNumber) => Number.isFinite(shotNumber)))).sort((left, right) => left - right);

    return {
      fileName: String(page?.fileName || imageFileNames[index] || `image-${index + 1}`).trim(),
      pageType: classifyPageType(page),
      visibleShotNumbers,
      containsAverageRow: Boolean(page?.containsAverageRow),
      averageMetrics: normalizeVisionMetricRecord(page?.averageMetrics),
      rows,
      confidence: clampConfidence(page?.confidence, 0.65),
      warnings: Array.isArray(page?.warnings) ? page.warnings.filter((warning) => typeof warning === "string") : [],
    };
  });

  return {
    simulator: normalizeSimulatorName(raw.simulator),
    club: raw.club === null || raw.club === undefined ? null : normalizePhotoImportClubName(raw.club),
    pages,
    warnings,
  };
}

function conflictTolerance(metric) {
  if (metric === "spin") return 30;
  if (metric === "smash") return 0.04;
  return 0.6;
}

function averageCellValue(cell) {
  return cell && Number.isFinite(cell.value) ? cell.value : undefined;
}

export function mergeVisionPhotoImportResult(extraction, options = {}) {
  const normalized = normalizeVisionPhotoImportResult(extraction, {
    imageFileNames: options.imageFileNames,
  });
  const sessionId = options.sessionId || `photo-import-${Date.now()}`;
  const sessionDate = options.sessionDate || new Date().toISOString().slice(0, 10);
  const simulator = normalizeSimulatorName(normalized.simulator);
  const club = normalizePhotoImportClubName(options.club || normalized.club || "Unknown Club") || "Unknown Club";
  const warnings = [...normalized.warnings];
  const shotStates = new Map();
  const duplicateCandidatesByPageType = new Map();
  const visibleAverageCells = {};

  for (const page of normalized.pages) {
    for (const warning of page.warnings) warnings.push(`${page.fileName}: ${warning}`);
    for (const [metric, cell] of Object.entries(page.averageMetrics)) {
      const value = averageCellValue(cell);
      if (value === undefined) continue;
      const existing = visibleAverageCells[metric];
      if (!existing || cell.confidence >= existing.confidence) {
        visibleAverageCells[metric] = cell;
      }
    }

    for (const row of page.rows) {
      if (!Number.isFinite(row.shotNumber)) continue;
      const duplicateKey = `${page.pageType}:${row.shotNumber}`;
      duplicateCandidatesByPageType.set(duplicateKey, (duplicateCandidatesByPageType.get(duplicateKey) ?? 0) + 1);
      const stateKey = `${club}:${row.shotNumber}`;
      const state = shotStates.get(stateKey) ?? {
        shotNumber: row.shotNumber,
        metrics: {},
        confidenceByMetric: {},
        sourceImages: new Set(),
        reviewStatus: "approved",
      };
      state.sourceImages.add(page.fileName);

      for (const [metric, cell] of Object.entries(row.metrics)) {
        if (!cell || !Number.isFinite(cell.value) || !metricIsInPhysicalRange(metric, cell.value)) continue;
        const existingValue = state.metrics[metric];
        const existingConfidence = state.confidenceByMetric[metric] ?? -1;
        if (Number.isFinite(existingValue) && Math.abs(existingValue - cell.value) > conflictTolerance(metric)) {
          warnings.push(`Shot ${row.shotNumber} ${metric} conflicts across photos (${existingValue} vs ${cell.value}).`);
          state.reviewStatus = "needs_review";
        }
        if (!Number.isFinite(existingValue) || cell.confidence >= existingConfidence) {
          state.metrics[metric] = cell.value;
          state.confidenceByMetric[metric] = cell.confidence;
        }
      }

      shotStates.set(stateKey, state);
    }
  }

  const shots = [...shotStates.values()]
    .sort((left, right) => left.shotNumber - right.shotNumber)
    .map((state) => {
      const confidenceValues = Object.values(state.confidenceByMetric).filter((value) => Number.isFinite(value));
      const confidence = confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : 0.5;
      return createPhotoImportShot({
        id: `${sessionId}-shot-${state.shotNumber}`,
        shotNumber: state.shotNumber,
        club,
        metrics: state.metrics,
        sourceImages: [...state.sourceImages],
        confidence,
        reviewStatus: state.reviewStatus,
      });
    });
  const visibleAverages = Object.fromEntries(
    Object.entries(visibleAverageCells)
      .map(([metric, cell]) => [metric, averageCellValue(cell)])
      .filter(([, value]) => Number.isFinite(value)),
  );
  const validation = validatePhotoImportShots(shots, visibleAverages);
  const duplicateShotNumbers = Array.from(new Set([...duplicateCandidatesByPageType.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => Number(key.split(":")[1]))
    .filter((value) => Number.isFinite(value))))
    .sort((left, right) => left - right);
  const csvText = generateNormalizedPhotoImportCsv({
    sessionId,
    sessionDate,
    simulator,
    club,
    shots,
    notes: options.notes ?? "",
  });
  const pageCounts = {
    distance: normalized.pages.filter((page) => page.pageType === "shot_history_distance").length,
    delivery: normalized.pages.filter((page) => page.pageType === "shot_history_delivery").length,
  };
  const blockingIssues = [...validation.blockingIssues];
  if (!shots.length) blockingIssues.push("No readable shot rows were found in the uploaded photos.");
  if (normalizeDataLabel(club) === "unknownclub") blockingIssues.push("Club could not be confirmed.");

  return {
    status: shots.length ? "needs_review" : "partial",
    extractionProvider: options.extractionProvider || "openai-vision",
    extractionModel: options.extractionModel || "",
    ocrEngine: options.ocrEngine || "not-run",
    ocrVersion: options.ocrVersion || "not-run",
    preprocessingVersion: PHOTO_IMPORT_PREPROCESSING_VERSION,
    mergeVersion: PHOTO_IMPORT_MERGE_VERSION,
    csvSchemaVersion: PHOTO_IMPORT_CSV_SCHEMA_VERSION,
    promptVersion: PHOTO_IMPORT_PROMPT_VERSION,
    simulator,
    club,
    clubDisplay: getPhotoImportClubDisplayName(club),
    imagesProcessed: Array.isArray(options.imageFileNames) ? options.imageFileNames.length : normalized.pages.length,
    pageCounts,
    duplicateShotNumbers,
    overlappingShotsMerged: duplicateShotNumbers.length,
    pages: normalized.pages,
    shots,
    csvText,
    rawCsvText: csvText,
    averages: validation.averages,
    visibleAverages,
    warnings: Array.from(new Set([...warnings, ...validation.warnings])),
    blockingIssues: Array.from(new Set(blockingIssues)),
    summary: {
      simulator,
      club: getPhotoImportClubDisplayName(club),
      canonicalClub: club,
      imageCount: Array.isArray(options.imageFileNames) ? options.imageFileNames.length : normalized.pages.length,
      distancePageCount: pageCounts.distance,
      deliveryPageCount: pageCounts.delivery,
      uniqueShotCount: shots.length,
      shotNumbers: shots.map((shot) => Number(shot.sourceShotNumber)).filter((value) => Number.isFinite(value)),
      overlappingShotsDeduplicated: duplicateShotNumbers,
      avgRowsExcluded: normalized.pages.some((page) => page.containsAverageRow),
    },
  };
}

export function normalizedCsvDataRowCount(csvText) {
  const rows = parsePhotoImportCsvRows(csvText);
  return rows.length ? rows.length - 1 : 0;
}
