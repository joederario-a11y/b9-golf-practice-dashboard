export const LAUNCH_MONITOR_IMPORT_SCHEMA_VERSION = "launch-monitor-import-v1";
export const LAUNCH_MONITOR_MAPPING_PROFILE_VERSION = "launch-monitor-mapper-v1";

export const CANONICAL_SHOT_METRICS = [
  "proximity",
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "apex",
  "spin",
  "spinAxis",
  "launch",
  "descent",
  "horizontalAngle",
  "attackAngle",
  "clubPath",
  "faceAngle",
  "faceToPath",
  "sideCarry",
  "sideTotal",
  "offline",
  "curve",
  "swingPlane",
];

export const DEFAULT_IMPORT_CLUB_ORDER = [
  "Driver",
  "3-Wood",
  "5-Wood",
  "7-Wood",
  "Hybrid",
  "2-Iron",
  "3-Iron",
  "4-Iron",
  "5-Iron",
  "6-Iron",
  "7-Iron",
  "8-Iron",
  "9-Iron",
  "PW",
  "GW",
  "SW",
  "56° Wedge",
  "LW",
  "Putter",
  "Other / Unknown",
];

export const UNKNOWN_IMPORT_CLUB = "Unknown Club";

export const LAUNCH_MONITOR_PROFILES = [
  {
    id: "full-swing",
    label: "Full Swing",
    signatures: ["session_id", "shot_id", "carry_distance_yd", "total_distance_yd"],
  },
  {
    id: "trackman",
    label: "TrackMan",
    signatures: ["club_speed", "ball_speed", "launch_angle", "spin_rate"],
  },
  {
    id: "foresight-gcquad",
    label: "Foresight / GCQuad",
    signatures: ["carry_distance", "offline", "side_angle", "azimuth"],
  },
  {
    id: "bushnell-launch-pro",
    label: "Bushnell Launch Pro",
    signatures: ["launch_pro", "ball_speed", "club_path"],
  },
  {
    id: "flightscope",
    label: "FlightScope",
    signatures: ["mevo", "flightscope", "horizontal_launch_angle"],
  },
  {
    id: "skytrak",
    label: "SkyTrak",
    signatures: ["back_spin", "side_spin", "launch_angle"],
  },
  {
    id: "uneekor",
    label: "Uneekor",
    signatures: ["side_total", "back_spin", "club_path"],
  },
  {
    id: "garmin",
    label: "Garmin",
    signatures: ["r10", "carry_distance", "club_speed"],
  },
  {
    id: "rapsodo",
    label: "Rapsodo",
    signatures: ["rapsodo", "launch_direction", "carry_distance"],
  },
];

const METRIC_ALIASES = {
  carry: [
    "carry",
    "carry_distance",
    "carry_distance_yd",
    "carry_distance_yards",
    "carry_yd",
    "carry_yards",
    "carrydistance",
    "carrydistanceyd",
    "carryDistance",
    "carryDistanceYards",
    "flight_distance",
    "flight_yd",
  ],
  total: [
    "total",
    "total_distance",
    "total_distance_yd",
    "total_distance_yards",
    "total_yd",
    "total_yards",
    "totaldistance",
    "totaldistanceyd",
    "totalDistance",
    "totalDistanceYards",
    "rollout_total",
  ],
  ballSpeed: [
    "ball_speed",
    "ball_speed_mph",
    "ball_velocity",
    "ball_velocity_mph",
    "ballSpeed",
    "ballSpeedMph",
    "bs",
  ],
  clubSpeed: [
    "club_speed",
    "club_speed_mph",
    "clubhead_speed",
    "club_head_speed",
    "clubSpeed",
    "clubSpeedMph",
    "chs",
  ],
  smash: ["smash", "smash_factor", "smashFactor", "efficiency"],
  launch: [
    "launch",
    "launch_angle",
    "launch_angle_deg",
    "launchAngle",
    "vertical_launch",
    "vertical_launch_angle",
  ],
  descent: [
    "descent",
    "descent_angle",
    "descent_angle_deg",
    "landing_angle",
    "land_angle",
  ],
  spin: [
    "spin",
    "spin_rate",
    "spin_rate_rpm",
    "spinRate",
    "back_spin",
    "backspin",
    "total_spin",
  ],
  spinAxis: ["spin_axis", "spin_axis_deg", "spinAxis", "axis", "axis_deg"],
  apex: [
    "apex",
    "apex_height",
    "apex_height_ft",
    "apex_ft",
    "height",
    "height_ft",
    "max_height",
    "peak_height",
  ],
  attackAngle: [
    "attack_angle",
    "attack_angle_deg",
    "angle_of_attack",
    "aoa",
    "attackAngle",
  ],
  clubPath: ["club_path", "club_path_deg", "path", "path_deg", "clubPath"],
  faceAngle: ["face_angle", "face_angle_deg", "face", "face_deg", "faceAngle"],
  faceToPath: [
    "face_to_path",
    "face_to_path_deg",
    "face-to-path",
    "facepath",
    "f2p",
    "faceToPath",
  ],
  horizontalAngle: [
    "horizontal_angle",
    "horizontal_angle_deg",
    "horiz_angle",
    "launch_direction",
    "launch_direction_deg",
    "launch_dir",
    "azimuth",
    "side_angle",
  ],
  sideCarry: [
    "side_carry",
    "side_carry_yd",
    "side_carry_yards",
    "sideCarry",
  ],
  sideTotal: [
    "side_total",
    "side_total_yd",
    "side_total_yards",
    "sideTotal",
  ],
  offline: [
    "offline",
    "offline_distance",
    "distance_offline",
    "from_pin",
    "lateral",
    "lateral_distance",
  ],
  proximity: [
    "proximity",
    "proximity_ft",
    "proximity_feet",
    "distance_to_pin",
    "distance_from_pin",
  ],
  curve: ["curve", "curve_ft", "curve_feet", "curve_yd", "curve_yards"],
  swingPlane: ["swing_plane", "swing_plane_deg", "plane", "plane_angle"],
};

const FIELD_ALIASES = {
  club: ["club", "club_name", "clubName"],
  shotNumber: ["shot", "shot_number", "shot_no", "shot_id", "shotId", "shotNumber"],
  sessionId: ["session_id", "session", "sessionId", "session_guid", "session_uuid"],
  timestamp: ["timestamp", "time", "created_at", "shot_time", "date_time"],
};

const METRIC_LABELS = {
  proximity: "Proximity",
  carry: "Carry",
  total: "Total",
  ballSpeed: "Ball speed",
  clubSpeed: "Club speed",
  smash: "Smash factor",
  apex: "Apex",
  spin: "Spin rate",
  spinAxis: "Spin axis",
  launch: "Launch angle",
  descent: "Descent angle",
  horizontalAngle: "Launch direction",
  attackAngle: "Attack angle",
  clubPath: "Club path",
  faceAngle: "Face angle",
  faceToPath: "Face to path",
  sideCarry: "Side carry",
  sideTotal: "Side total",
  offline: "Offline",
  curve: "Curve",
  swingPlane: "Swing plane",
};

export const COLUMN_MAPPING_TARGETS = [
  { value: "ignore", label: "Ignore" },
  { value: "club", label: "Club" },
  { value: "shotNumber", label: "Shot number" },
  { value: "sessionId", label: "Session ID" },
  { value: "timestamp", label: "Timestamp" },
  ...CANONICAL_SHOT_METRICS.map((metric) => ({ value: metric, label: METRIC_LABELS[metric] ?? metric })),
];

const PHYSICAL_RANGES = {
  proximity: [0, 1000],
  carry: [1, 450],
  total: [1, 500],
  ballSpeed: [20, 250],
  clubSpeed: [15, 180],
  smash: [0.5, 2],
  apex: [0, 300],
  spin: [100, 16000],
  spinAxis: [-90, 90],
  launch: [-10, 70],
  descent: [0, 90],
  horizontalAngle: [-45, 45],
  attackAngle: [-20, 20],
  clubPath: [-45, 45],
  faceAngle: [-45, 45],
  faceToPath: [-45, 45],
  sideCarry: [-250, 250],
  sideTotal: [-250, 250],
  offline: [-250, 250],
  curve: [-300, 300],
  swingPlane: [20, 80],
};

const TEXT_UNITS = new Set(["deg", "degree", "degrees", "rpm", "factor"]);

export function normalizeImportHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[°º]/g, "deg")
    .replace(/[%]/g, " percent ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function compactHeader(value) {
  return normalizeImportHeader(value).replace(/_/g, "");
}

function headerForms(value) {
  const normalized = normalizeImportHeader(value);
  const tokens = normalized.split("_").filter(Boolean);
  const forms = new Set([normalized, tokens.join("")]);
  const unitlessTokens = [...tokens];
  while (unitlessTokens.length && isUnitToken(unitlessTokens.at(-1))) {
    unitlessTokens.pop();
    if (unitlessTokens.length) {
      forms.add(unitlessTokens.join("_"));
      forms.add(unitlessTokens.join(""));
    }
  }
  return forms;
}

function aliasMatchesHeader(alias, header) {
  const aliasForms = headerForms(alias);
  const headerCandidateForms = headerForms(header);
  return [...aliasForms].some((form) => headerCandidateForms.has(form));
}

function isUnitToken(value) {
  return [
    "yd",
    "yds",
    "yard",
    "yards",
    "m",
    "meter",
    "meters",
    "metre",
    "metres",
    "ft",
    "feet",
    "mph",
    "kph",
    "kmh",
    "mps",
    "rpm",
    "deg",
    "degree",
    "degrees",
  ].includes(value);
}

function detectDelimiter(text) {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const delimiters = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of delimiters) {
    let quoted = false;
    let count = 0;
    for (let index = 0; index < sample.length; index += 1) {
      const character = sample[index];
      const nextCharacter = sample[index + 1];
      if (character === '"' && quoted && nextCharacter === '"') {
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        count += 1;
      }
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimitedRows(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    const nextCharacter = cleanText[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
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

export function normalizeLaunchMonitorClubName(value) {
  const raw = String(value ?? "").trim();
  const normalized = compactHeader(raw);
  const aliases = {
    driver: "Driver",
    "1wood": "Driver",
    "1w": "Driver",
    threewood: "3-Wood",
    "3wood": "3-Wood",
    "3w": "3-Wood",
    fivewood: "5-Wood",
    "5wood": "5-Wood",
    "5w": "5-Wood",
    sevenwood: "7-Wood",
    "7wood": "7-Wood",
    "7w": "7-Wood",
    hybrid: "Hybrid",
    rescue: "Hybrid",
    "2hybrid": "Hybrid",
    "3hybrid": "Hybrid",
    drivingiron: "Driving Iron",
    twoiron: "2-Iron",
    "2iron": "2-Iron",
    "2i": "2-Iron",
    threeiron: "3-Iron",
    "3iron": "3-Iron",
    "3i": "3-Iron",
    fouriron: "4-Iron",
    "4iron": "4-Iron",
    "4i": "4-Iron",
    fiveiron: "5-Iron",
    "5iron": "5-Iron",
    "5i": "5-Iron",
    sixiron: "6-Iron",
    "6iron": "6-Iron",
    "6i": "6-Iron",
    seveniron: "7-Iron",
    "7iron": "7-Iron",
    "7i": "7-Iron",
    eightiron: "8-Iron",
    "8iron": "8-Iron",
    "8i": "8-Iron",
    nineiron: "9-Iron",
    "9iron": "9-Iron",
    "9i": "9-Iron",
    pitchingwedge: "PW",
    "46wedge": "PW",
    pw: "PW",
    gapwedge: "GW",
    approachwedge: "GW",
    "50wedge": "GW",
    "52wedge": "GW",
    gw: "GW",
    aw: "GW",
    sandwedge: "SW",
    sw: "SW",
    "54wedge": "SW",
    "56wedge": "56° Wedge",
    lobwedge: "LW",
    "58wedge": "LW",
    "60wedge": "LW",
    lw: "LW",
    putter: "Putter",
    pt: "Putter",
    unknown: UNKNOWN_IMPORT_CLUB,
    unknownclub: UNKNOWN_IMPORT_CLUB,
    other: UNKNOWN_IMPORT_CLUB,
    otherunknown: UNKNOWN_IMPORT_CLUB,
    unknownother: UNKNOWN_IMPORT_CLUB,
    na: UNKNOWN_IMPORT_CLUB,
    n: UNKNOWN_IMPORT_CLUB,
    none: UNKNOWN_IMPORT_CLUB,
  };
  const degreeWedge = raw.match(/\b(4[6-9]|5[0-9]|6[0-4])\s*(?:°|deg(?:ree)?s?)?\s*(?:wedge|wdg)?\b/i);
  if (degreeWedge) return `${degreeWedge[1]}° Wedge`;
  return aliases[normalized] ?? (raw || UNKNOWN_IMPORT_CLUB);
}

export function getLaunchMonitorClubDisplayName(club) {
  return {
    PW: "Pitching Wedge",
    GW: "Gap Wedge",
    SW: "Sand Wedge",
    LW: "Lob Wedge",
  }[club] ?? String(club ?? "");
}

export function isUnknownLaunchMonitorClubName(value) {
  return compactHeader(normalizeLaunchMonitorClubName(value)) === "unknownclub";
}

export function isLaunchMonitorSummaryRowLabel(value) {
  const normalized = normalizeImportHeader(value);
  const compact = normalized.replace(/_/g, "");
  return ["avg", "average", "mean", "summary"].includes(compact);
}

function roundValue(value, digits = 1) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Number((Math.round((value + 1e-10) * factor) / factor).toFixed(digits));
}

function metricDigits(metric) {
  if (metric === "spin") return 0;
  if (metric === "smash") return 2;
  return 1;
}

function finiteDirectionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw || /^n\/?a$/i.test(raw) || /^null$/i.test(raw)) return undefined;
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

function shotOrdinal(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  const matches = String(value ?? "").match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return fallback;
  const parsed = Number(matches.at(-1));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unitForColumn(metric, sourceColumn) {
  const normalized = normalizeImportHeader(sourceColumn);
  const tokens = normalized.split("_");
  const compact = tokens.join("");
  if (/(kph|kmh|kilometersperhour|kilometresperhour)$/.test(compact)) return "kph";
  if (/(mps|meterspersecond|metrespersecond)$/.test(compact)) return "mps";
  if (/(mph|milesperhour)$/.test(compact)) return "mph";
  if (/(rpm)$/.test(compact)) return "rpm";
  if (/(deg|degree|degrees)$/.test(compact)) return "deg";
  if (/(ft|feet)$/.test(compact)) return "ft";
  if (/(yd|yds|yard|yards)$/.test(compact)) return "yd";
  if (/(meter|meters|metre|metres)$/.test(compact)) return "m";
  if (/(^|_)m$/.test(normalized)) return "m";
  if (metric === "proximity" || metric === "apex") return "ft";
  if (["carry", "total", "sideCarry", "sideTotal", "offline"].includes(metric)) return "yd";
  if (["ballSpeed", "clubSpeed"].includes(metric)) return "mph";
  if (["launch", "descent", "spinAxis", "horizontalAngle", "attackAngle", "clubPath", "faceAngle", "faceToPath", "swingPlane"].includes(metric)) return "deg";
  if (metric === "spin") return "rpm";
  return "";
}

function canonicalUnitForMetric(metric) {
  if (metric === "proximity" || metric === "apex" || metric === "curve") return "ft";
  if (["carry", "total", "sideCarry", "sideTotal", "offline"].includes(metric)) return "yd";
  if (["ballSpeed", "clubSpeed"].includes(metric)) return "mph";
  if (metric === "spin") return "rpm";
  if (["smash"].includes(metric)) return "";
  return "deg";
}

function convertUnit(value, metric, sourceUnit) {
  const canonicalUnit = canonicalUnitForMetric(metric);
  if (!sourceUnit || sourceUnit === canonicalUnit || TEXT_UNITS.has(sourceUnit) && sourceUnit === canonicalUnit) {
    return { value, sourceUnit: sourceUnit || canonicalUnit, targetUnit: canonicalUnit, converted: false };
  }
  if (["carry", "total", "sideCarry", "sideTotal", "offline"].includes(metric)) {
    if (sourceUnit === "m") return { value: value * 1.0936133, sourceUnit, targetUnit: "yd", converted: true };
    if (sourceUnit === "ft") return { value: value / 3, sourceUnit, targetUnit: "yd", converted: true };
  }
  if (["apex", "proximity", "curve"].includes(metric)) {
    if (sourceUnit === "m") return { value: value * 3.28084, sourceUnit, targetUnit: "ft", converted: true };
    if (sourceUnit === "yd") return { value: value * 3, sourceUnit, targetUnit: "ft", converted: true };
  }
  if (["ballSpeed", "clubSpeed"].includes(metric)) {
    if (sourceUnit === "kph") return { value: value * 0.621371, sourceUnit, targetUnit: "mph", converted: true };
    if (sourceUnit === "mps") return { value: value * 2.236936, sourceUnit, targetUnit: "mph", converted: true };
  }
  return { value, sourceUnit, targetUnit: canonicalUnit, converted: false };
}

function sourceFor(kind, confidence, method, inputMetrics = [], originalColumn) {
  const source = { kind, confidence };
  if (method) source.method = method;
  if (inputMetrics.length) source.inputMetrics = inputMetrics;
  if (originalColumn) source.originalColumn = originalColumn;
  return source;
}

function setMetric(shot, metric, value, source) {
  if (!Number.isFinite(value)) return false;
  const rounded = metric === "spin" ? Math.round(value) : roundValue(value, metricDigits(metric));
  shot[metric] = rounded;
  shot.metricSources[metric] = source;
  if (!shot.detectedMetrics.includes(metric)) shot.detectedMetrics.push(metric);
  return true;
}

function hasMetric(shot, metric) {
  return Number.isFinite(shot?.[metric]) && shot.detectedMetrics?.includes(metric);
}

function buildMapping(headers, columnOverrides = {}) {
  const mappings = [];
  const usedMetrics = new Set();
  const mappedHeaderIndexes = new Set();

  const allAliases = {
    ...FIELD_ALIASES,
    ...METRIC_ALIASES,
  };

  headers.forEach((sourceColumn, index) => {
    const normalized = normalizeImportHeader(sourceColumn);
    const override = columnOverrides[sourceColumn] || columnOverrides[normalized];
    if (override === "ignore") {
      mappings.push({
        sourceColumn,
        sourceIndex: index,
        target: "ignore",
        targetLabel: "Ignored",
        kind: "ignored",
        confidence: 1,
      });
      mappedHeaderIndexes.add(index);
      return;
    }
    if (override && FIELD_ALIASES[override]) {
      mappings.push({
        sourceColumn,
        sourceIndex: index,
        target: override,
        targetLabel: override,
        kind: "field",
        confidence: 0.95,
        override: true,
      });
      mappedHeaderIndexes.add(index);
      return;
    }
    if (override && CANONICAL_SHOT_METRICS.includes(override)) {
      const sourceUnit = unitForColumn(override, sourceColumn);
      const targetUnit = canonicalUnitForMetric(override);
      mappings.push({
        sourceColumn,
        sourceIndex: index,
        target: override,
        targetLabel: METRIC_LABELS[override] ?? override,
        kind: "metric",
        sourceUnit,
        targetUnit,
        confidence: 0.95,
        override: true,
      });
      usedMetrics.add(override);
      mappedHeaderIndexes.add(index);
      return;
    }
    const isFieldColumn = Object.entries(FIELD_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => aliasMatchesHeader(alias, normalized)),
    );
    if (isFieldColumn) {
      mappings.push({
        sourceColumn,
        sourceIndex: index,
        target: isFieldColumn[0],
        targetLabel: isFieldColumn[0],
        kind: "field",
        confidence: 1,
      });
      mappedHeaderIndexes.add(index);
      return;
    }

    const metricEntry = CANONICAL_SHOT_METRICS
      .filter((metric) => allAliases[metric])
      .find((metric) => {
        if (usedMetrics.has(metric)) return false;
        return allAliases[metric].some((alias) => aliasMatchesHeader(alias, normalized));
      });

    if (metricEntry) {
      const sourceUnit = unitForColumn(metricEntry, sourceColumn);
      const targetUnit = canonicalUnitForMetric(metricEntry);
      mappings.push({
        sourceColumn,
        sourceIndex: index,
        target: metricEntry,
        targetLabel: METRIC_LABELS[metricEntry] ?? metricEntry,
        kind: "metric",
        sourceUnit,
        targetUnit,
        confidence: 1,
      });
      usedMetrics.add(metricEntry);
      mappedHeaderIndexes.add(index);
    }
  });

  return {
    mappings,
    unmappedColumns: headers
      .map((sourceColumn, sourceIndex) => ({ sourceColumn, sourceIndex }))
      .filter((column) => !mappedHeaderIndexes.has(column.sourceIndex)),
  };
}

function detectLaunchMonitor(headers, rows) {
  const normalizedHeaders = new Set(headers.flatMap((header) => [...headerForms(header)]));
  const matched = LAUNCH_MONITOR_PROFILES.find((profile) =>
    profile.signatures.filter((signature) => normalizedHeaders.has(normalizeImportHeader(signature)) || normalizedHeaders.has(compactHeader(signature))).length >= 2,
  );
  if (matched) return matched.label;
  const joined = `${headers.join(" ")} ${rows.slice(0, 3).flat().join(" ")}`.toLowerCase();
  const textMatched = LAUNCH_MONITOR_PROFILES.find((profile) => joined.includes(profile.id.replace(/-/g, " ")));
  return textMatched?.label ?? "Launch Monitor CSV";
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function deriveMetrics(shots, warnings) {
  for (const shot of shots) {
    if (!hasMetric(shot, "smash") && hasMetric(shot, "ballSpeed") && hasMetric(shot, "clubSpeed") && shot.clubSpeed > 0) {
      setMetric(
        shot,
        "smash",
        shot.ballSpeed / shot.clubSpeed,
        sourceFor("derived", 0.98, "Calculated as Ball Speed ÷ Club Speed.", ["ballSpeed", "clubSpeed"]),
      );
    }
    if (!hasMetric(shot, "ballSpeed") && hasMetric(shot, "clubSpeed") && hasMetric(shot, "smash")) {
      setMetric(
        shot,
        "ballSpeed",
        shot.clubSpeed * shot.smash,
        sourceFor("derived", 0.95, "Calculated as Club Speed × Smash Factor.", ["clubSpeed", "smash"]),
      );
    }
    if (!hasMetric(shot, "clubSpeed") && hasMetric(shot, "ballSpeed") && hasMetric(shot, "smash") && shot.smash > 0) {
      setMetric(
        shot,
        "clubSpeed",
        shot.ballSpeed / shot.smash,
        sourceFor("derived", 0.95, "Calculated as Ball Speed ÷ Smash Factor.", ["ballSpeed", "smash"]),
      );
    }
    if (!hasMetric(shot, "faceToPath") && hasMetric(shot, "faceAngle") && hasMetric(shot, "clubPath")) {
      setMetric(
        shot,
        "faceToPath",
        shot.faceAngle - shot.clubPath,
        sourceFor("derived", 0.98, "Calculated as Face Angle minus Club Path.", ["faceAngle", "clubPath"]),
      );
    }
    if (hasMetric(shot, "smash") && hasMetric(shot, "ballSpeed") && hasMetric(shot, "clubSpeed") && shot.clubSpeed > 0) {
      const calculated = shot.ballSpeed / shot.clubSpeed;
      if (Math.abs(calculated - shot.smash) > 0.08) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} smash factor does not match ball speed divided by club speed.`);
      }
    }
    if (hasMetric(shot, "faceToPath") && hasMetric(shot, "faceAngle") && hasMetric(shot, "clubPath")) {
      const calculated = shot.faceAngle - shot.clubPath;
      if (Math.abs(calculated - shot.faceToPath) > 0.6) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} face-to-path does not match face angle minus club path.`);
      }
    }
  }
}

function estimateCarryAndTotal(shots) {
  const rolloutsByClub = new Map();
  for (const shot of shots) {
    const carrySource = shot.metricSources.carry;
    const totalSource = shot.metricSources.total;
    if (
      hasMetric(shot, "carry") &&
      hasMetric(shot, "total") &&
      carrySource?.kind === "measured" &&
      totalSource?.kind === "measured" &&
      shot.total >= shot.carry
    ) {
      rolloutsByClub.set(shot.club, [...(rolloutsByClub.get(shot.club) ?? []), shot.total - shot.carry]);
    }
  }

  for (const shot of shots) {
    const measuredRollouts = rolloutsByClub.get(shot.club) ?? [];
    if (measuredRollouts.length < 5) continue;
    const rollout = median(measuredRollouts);
    if (!Number.isFinite(rollout)) continue;

    if (hasMetric(shot, "carry") && !hasMetric(shot, "total") && shot.metricSources.carry?.kind === "measured") {
      setMetric(
        shot,
        "total",
        shot.carry + rollout,
        sourceFor(
          "estimated",
          0.82,
          "Estimated as Carry plus median measured rollout for the same club in this import.",
          ["carry"],
        ),
      );
    }
    if (hasMetric(shot, "total") && !hasMetric(shot, "carry") && shot.metricSources.total?.kind === "measured") {
      setMetric(
        shot,
        "carry",
        shot.total - rollout,
        sourceFor(
          "estimated",
          0.78,
          "Estimated as Total minus median measured rollout for the same club in this import.",
          ["total"],
        ),
      );
    }
  }
}

function validateShots(shots, warnings, blockingIssues) {
  const shotNumbersByClub = new Map();
  const sourceIds = new Set();

  for (const shot of shots) {
    const numberKey = `${shot.club}:${shot.sourceShotNumber ?? ""}`;
    if (shot.sourceShotNumber) {
      if (shotNumbersByClub.has(numberKey)) warnings.push(`Duplicate shot number ${shot.sourceShotNumber} for ${getLaunchMonitorClubDisplayName(shot.club)}.`);
      shotNumbersByClub.set(numberKey, true);
    }
    if (shot.rawSourceData?.shot_id) {
      const sourceId = String(shot.rawSourceData.shot_id);
      if (sourceIds.has(sourceId)) warnings.push(`Duplicate source shot ID ${sourceId}.`);
      sourceIds.add(sourceId);
    }

    for (const metric of CANONICAL_SHOT_METRICS) {
      if (!hasMetric(shot, metric)) continue;
      const range = PHYSICAL_RANGES[metric];
      if (range && (shot[metric] < range[0] || shot[metric] > range[1])) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} ${METRIC_LABELS[metric] ?? metric} is outside the broad safety range.`);
      }
      if (shot[metric] === 0 && !["offline", "sideCarry", "sideTotal", "horizontalAngle", "faceAngle", "clubPath", "faceToPath", "spinAxis", "attackAngle"].includes(metric)) {
        warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} has a suspicious zero for ${METRIC_LABELS[metric] ?? metric}.`);
      }
    }

    if (hasMetric(shot, "carry") && hasMetric(shot, "total") && shot.total < shot.carry - 2) {
      warnings.push(`Shot ${shot.sourceShotNumber ?? "?"} total distance is below carry distance.`);
    }

    if (!shot.club || isUnknownLaunchMonitorClubName(shot.club)) {
      warnings.push("One or more rows are missing a club. You can choose one during review or save as Unknown Club.");
    }
  }
}

function csvEscape(value, isText = false) {
  const text = value === undefined || value === null || Number.isNaN(value) ? "" : String(value);
  const safe = isText && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function generateCanonicalLaunchMonitorCsv({ sessionId, sessionDate, simulator, shots, notes = "" }) {
  const columns = [
    "session_id",
    "session_date",
    "simulator",
    "club",
    "shot_number",
    ...CANONICAL_SHOT_METRICS.map((metric) => `${metric}_${canonicalUnitForMetric(metric) || "value"}`),
    "metric_sources_json",
    "notes",
  ];
  const rows = shots.map((shot) => {
    const values = {
      session_id: sessionId,
      session_date: sessionDate,
      simulator,
      club: shot.club,
      shot_number: shot.sourceShotNumber ?? "",
      metric_sources_json: JSON.stringify(shot.metricSources ?? {}),
      notes,
    };
    for (const metric of CANONICAL_SHOT_METRICS) {
      values[`${metric}_${canonicalUnitForMetric(metric) || "value"}`] = hasMetric(shot, metric) ? shot[metric] : "";
    }
    return columns.map((column) => csvEscape(values[column], ["session_id", "session_date", "simulator", "club", "shot_number", "notes", "metric_sources_json"].includes(column))).join(",");
  });
  return [columns.join(","), ...rows].join("\n");
}

export function summarizeMetricSourceKinds(shots) {
  const summary = { measured: 0, derived: 0, estimated: 0, manual: 0 };
  for (const shot of shots) {
    for (const source of Object.values(shot.metricSources ?? {})) {
      if (summary[source?.kind] !== undefined) summary[source.kind] += 1;
    }
  }
  return summary;
}

export function parseLaunchMonitorCsv(text, options = {}) {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) {
    return {
      shots: [],
      metadata: {
        mappingProfileVersion: LAUNCH_MONITOR_MAPPING_PROFILE_VERSION,
        warnings: ["No CSV rows were found."],
        blockingIssues: [],
      },
    };
  }

  const headers = rows[0].map((header) => String(header ?? "").replace(/^\uFEFF/, "").trim());
  const delimiter = detectDelimiter(text);
  const { mappings, unmappedColumns } = buildMapping(headers, options.columnOverrides ?? {});
  const metricMappings = mappings.filter((mapping) => mapping.kind === "metric");
  const fieldMappings = mappings.filter((mapping) => mapping.kind === "field");
  const warnings = [];
  const blockingIssues = [];
  const unitConversions = [];
  const summaryRows = [];
  const importId = `csv-import-${Date.now()}`;
  const simulator = options.simulator || detectLaunchMonitor(headers, rows);

  if (!metricMappings.length) {
    blockingIssues.push("No shot metric columns could be mapped automatically.");
  }

  const fieldMappingFor = (target) => fieldMappings.find((mapping) => mapping.target === target);
  const cellValue = (cells, mapping) => mapping ? cells[mapping.sourceIndex]?.trim() ?? "" : "";
  const sessionMapping = fieldMappingFor("sessionId");
  const shotNumberMapping = fieldMappingFor("shotNumber");
  const timestampMapping = fieldMappingFor("timestamp");
  const clubMapping = fieldMappingFor("club");

  const shots = rows.slice(1).flatMap((cells, rowIndex) => {
    const rawSourceData = {};
    headers.forEach((header, index) => {
      rawSourceData[header] = cells[index]?.trim() ?? "";
    });

    const summaryLabel = cellValue(cells, shotNumberMapping) || cells.find((cell) => String(cell ?? "").trim()) || "";
    if (isLaunchMonitorSummaryRowLabel(summaryLabel)) {
      summaryRows.push(rawSourceData);
      return [];
    }

    const unmappedFields = {};
    unmappedColumns.forEach((column) => {
      const value = cells[column.sourceIndex]?.trim() ?? "";
      if (value) unmappedFields[column.sourceColumn] = value;
    });

    const club = normalizeLaunchMonitorClubName(cellValue(cells, clubMapping) || UNKNOWN_IMPORT_CLUB);
    const sourceShotNumber = cellValue(cells, shotNumberMapping) || String(rowIndex + 1);
    const sessionId = cellValue(cells, sessionMapping) || options.sessionId || importId;
    const timestamp = cellValue(cells, timestampMapping) || null;
    const shot = {
      id: `csv-${sessionId}-${sourceShotNumber}-${rowIndex}`.replace(/[^a-z0-9_.:-]/gi, "-"),
      sessionId,
      shotNumber: shotOrdinal(sourceShotNumber, rowIndex + 1),
      timestamp,
      club,
      shape: "Not recorded",
      sourceShotNumber,
      detectedMetrics: [],
      metricSources: {},
      rawSourceData,
      unmappedFields,
      reviewStatus: "approved",
      mappingProfileVersion: LAUNCH_MONITOR_MAPPING_PROFILE_VERSION,
      sourceFileName: options.sourceFileName,
    };

    for (const mapping of metricMappings) {
      const rawValue = cellValue(cells, mapping);
      const parsed = finiteDirectionalNumber(rawValue);
      if (parsed === undefined) continue;
      const converted = convertUnit(parsed, mapping.target, mapping.sourceUnit);
      if (converted.converted) {
        unitConversions.push({
          sourceColumn: mapping.sourceColumn,
          metric: mapping.target,
          sourceUnit: converted.sourceUnit,
          targetUnit: converted.targetUnit,
        });
      }
      setMetric(
        shot,
        mapping.target,
        converted.value,
        sourceFor(
          "measured",
          converted.converted ? 0.98 : 1,
          converted.converted
            ? `Measured from ${mapping.sourceColumn} and converted from ${converted.sourceUnit} to ${converted.targetUnit}.`
            : `Measured directly from ${mapping.sourceColumn}.`,
          [],
          mapping.sourceColumn,
        ),
      );
    }

    if (!shot.detectedMetrics.length) return [];
    if (hasMetric(shot, "sideTotal")) {
      setMetric(shot, "offline", shot.sideTotal, sourceFor("derived", 0.96, "Copied from Side Total for dashboard dispersion.", ["sideTotal"]));
    } else if (hasMetric(shot, "sideCarry")) {
      setMetric(shot, "offline", shot.sideCarry, sourceFor("derived", 0.92, "Copied from Side Carry for dashboard dispersion.", ["sideCarry"]));
    }
    if (hasMetric(shot, "offline")) {
      shot.shape = shot.offline < -8 ? "Draw" : shot.offline > 8 ? "Fade" : "Straight";
    }
    return [shot];
  });

  deriveMetrics(shots, warnings);
  estimateCarryAndTotal(shots);
  validateShots(shots, warnings, blockingIssues);

  const sessionIds = Array.from(new Set(shots.map((shot) => shot.sessionId).filter(Boolean)));
  const clubs = Array.from(new Set(shots.map((shot) => shot.club))).sort((a, b) => clubOrderIndex(a) - clubOrderIndex(b));
  const sourceCounts = summarizeMetricSourceKinds(shots);
  const measuredMetrics = uniqueMetricsBySource(shots, "measured");
  const derivedMetrics = uniqueMetricsBySource(shots, "derived");
  const estimatedMetrics = uniqueMetricsBySource(shots, "estimated");
  const mappedColumns = mappings.map((mapping) => ({
    sourceColumn: mapping.sourceColumn,
    mapsTo: mapping.target,
    targetLabel: mapping.targetLabel,
    kind: mapping.kind,
    sourceUnit: mapping.sourceUnit,
    targetUnit: mapping.targetUnit,
  }));
  const missingMetrics = CANONICAL_SHOT_METRICS.filter((metric) => !shots.some((shot) => hasMetric(shot, metric)));
  const capturedAt = inferSessionDate(shots);

  return {
    shots,
    metadata: {
      capturedAt,
      csvSchemaVersion: LAUNCH_MONITOR_IMPORT_SCHEMA_VERSION,
      delimiter,
      mappingProfileVersion: LAUNCH_MONITOR_MAPPING_PROFILE_VERSION,
      sourceFileName: options.sourceFileName,
      sourceHeaders: headers,
      sourceRowCount: rows.length - 1,
      rowsDetected: shots.length,
      summaryRowsExcluded: summaryRows.length,
      summaryRows,
      sessionId: sessionIds[0] ?? null,
      sessionIds,
      simulator,
      clubs,
      clubCount: clubs.length,
      mappedColumns,
      unmappedColumns: unmappedColumns.map((column) => column.sourceColumn),
      columnOverrides: options.columnOverrides ?? {},
      measuredMetrics,
      derivedMetrics,
      estimatedMetrics,
      missingMetrics,
      sourceCounts,
      unitConversions: Array.from(new Map(unitConversions.map((item) => [`${item.sourceColumn}:${item.metric}`, item])).values()),
      warnings: Array.from(new Set(warnings)),
      blockingIssues: Array.from(new Set(blockingIssues)),
      importedAt: new Date().toISOString(),
    },
  };
}

function inferSessionDate(shots) {
  const firstTimestamp = shots.find((shot) => shot.timestamp)?.timestamp;
  if (!firstTimestamp) return undefined;
  const parsed = new Date(firstTimestamp);
  if (Number.isNaN(parsed.valueOf())) return String(firstTimestamp).slice(0, 10) || undefined;
  return parsed.toISOString().slice(0, 10);
}

function uniqueMetricsBySource(shots, kind) {
  const metrics = new Set();
  for (const shot of shots) {
    for (const [metric, source] of Object.entries(shot.metricSources ?? {})) {
      if (source?.kind === kind) metrics.add(metric);
    }
  }
  return CANONICAL_SHOT_METRICS.filter((metric) => metrics.has(metric));
}

function clubOrderIndex(club, clubOrder = DEFAULT_IMPORT_CLUB_ORDER) {
  const index = clubOrder.indexOf(club);
  return index >= 0 ? index : clubOrder.length + String(club).localeCompare("");
}

export function chooseClubForImportedSession(shots, previousSelectedClub = "", clubOrder = DEFAULT_IMPORT_CLUB_ORDER) {
  const importedClubs = Array.from(new Set((shots ?? []).map((shot) => shot.club).filter(Boolean)));
  if (!importedClubs.length) return previousSelectedClub || "Driver";
  if (previousSelectedClub && importedClubs.includes(previousSelectedClub)) return previousSelectedClub;
  return importedClubs.sort((a, b) => {
    const aIndex = clubOrder.indexOf(a);
    const bIndex = clubOrder.indexOf(b);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.localeCompare(b);
  })[0];
}
