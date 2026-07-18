export type ShotRecord = Record<string, unknown>;

export type MetricSummary = {
  count: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
  range: number | null;
  standardDeviation: number | null;
};

export type LeftRightTendency = {
  available: boolean;
  dominant: "left" | "right" | "balanced" | "unknown";
  leftCount: number;
  rightCount: number;
  centerCount: number;
  averageOffline: number | null;
};

export type PreviousSessionComparison = {
  available: boolean;
  carryDelta: number | null;
  offlineStandardDeviationDelta: number | null;
  summary: string;
};

export type SessionMetrics = {
  validShotCount: number;
  metricSummaries: Record<string, MetricSummary>;
  averageCarry: number | null;
  medianCarry: number | null;
  carryStandardDeviation: number | null;
  averageTotalDistance: number | null;
  averageClubSpeed: number | null;
  averageBallSpeed: number | null;
  averageSmashFactor: number | null;
  averageLaunchAngle: number | null;
  averageSpinRate: number | null;
  averageClubPath: number | null;
  averageFaceAngle: number | null;
  averageFaceToPath: number | null;
  averageOfflineDistance: number | null;
  leftRightTendency: LeftRightTendency;
  playableShotsPercentage: number | null;
  previousSessionComparison: PreviousSessionComparison;
};

export const metricFields = {
  carry: ["carry", "carryDistance", "carry_distance", "carryYards", "carry_yards"],
  totalDistance: ["total", "totalDistance", "total_distance", "totalYards", "total_yards"],
  clubSpeed: ["clubSpeed", "club_speed", "clubHeadSpeed", "club_head_speed"],
  ballSpeed: ["ballSpeed", "ball_speed"],
  smashFactor: ["smash", "smashFactor", "smash_factor"],
  launchAngle: ["launch", "launchAngle", "launch_angle"],
  spinRate: ["spin", "spinRate", "spin_rate"],
  clubPath: ["clubPath", "club_path"],
  faceAngle: ["faceAngle", "face_angle"],
  faceToPath: ["faceToPath", "face_to_path", "face-to-path"],
  offlineDistance: [
    "offline",
    "offlineDistance",
    "offline_distance",
    "side",
    "sideCarry",
    "side_carry",
    "sideTotal",
    "side_total",
  ],
} satisfies Record<string, string[]>;

const detectedMetricAliases = {
  carry: ["carry"],
  totalDistance: ["total"],
  clubSpeed: ["clubSpeed"],
  ballSpeed: ["ballSpeed"],
  smashFactor: ["smash"],
  launchAngle: ["launch"],
  spinRate: ["spin"],
  clubPath: ["clubPath"],
  faceAngle: ["faceAngle"],
  faceToPath: ["faceToPath"],
  offlineDistance: ["offline", "sideCarry", "sideTotal"],
} satisfies Record<keyof typeof metricFields, string[]>;

export function roundMetric(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function booleanFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function nestedMetricSource(shot: ShotRecord) {
  const candidates = [shot.metrics, shot.measurements, shot.detectedMetrics, shot.data];
  return candidates.find((candidate): candidate is Record<string, unknown> => {
    return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
  });
}

function normalizeMetricKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function detectedMetricSet(shot: ShotRecord) {
  if (!Array.isArray(shot.detectedMetrics)) {
    return null;
  }

  return new Set(
    shot.detectedMetrics
      .filter((value): value is string => typeof value === "string")
      .map(normalizeMetricKey),
  );
}

function isDetectedMetricAvailable(shot: ShotRecord, metricKey: keyof typeof metricFields) {
  const detected = detectedMetricSet(shot);
  if (!detected) {
    return true;
  }

  const candidates = [metricKey, ...metricFields[metricKey], ...detectedMetricAliases[metricKey]];
  return candidates.map(normalizeMetricKey).some((candidate) => detected.has(candidate));
}

export function numberFromValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replaceAll(",", "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (/\bL\b|left/i.test(normalized)) {
    return -Math.abs(parsed);
  }

  if (/\bR\b|right/i.test(normalized)) {
    return Math.abs(parsed);
  }

  return parsed;
}

export function metricValue(shot: ShotRecord, fieldNames: string[], metricKey?: keyof typeof metricFields) {
  if (metricKey && !isDetectedMetricAvailable(shot, metricKey)) {
    return null;
  }

  const source = nestedMetricSource(shot);

  for (const fieldName of fieldNames) {
    const direct = numberFromValue(shot[fieldName]);
    if (direct !== null) {
      return direct;
    }

    const nested = source ? numberFromValue(source[fieldName]) : null;
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

export function isUsableShot(shot: ShotRecord) {
  const deletedFlag =
    booleanFlag(shot.deleted) ??
    booleanFlag(shot.isDeleted) ??
    booleanFlag(shot.is_deleted) ??
    null;
  const invalidFlag = booleanFlag(shot.invalid) ?? booleanFlag(shot.isInvalid) ?? null;
  const validFlag = booleanFlag(shot.valid) ?? booleanFlag(shot.isValid) ?? booleanFlag(shot.is_valid) ?? null;
  const warmUpFlag =
    booleanFlag(shot.warmup) ??
    booleanFlag(shot.warmUp) ??
    booleanFlag(shot.isWarmup) ??
    booleanFlag(shot.is_warmup) ??
    null;
  const outlierFlag =
    booleanFlag(shot.outlier) ??
    booleanFlag(shot.isOutlier) ??
    booleanFlag(shot.is_outlier) ??
    booleanFlag(shot.excludeFromAnalysis) ??
    booleanFlag(shot.exclude_from_analysis) ??
    null;
  const deleted = deletedFlag === true || Boolean(shot.deleted_at ?? shot.deletedAt);
  const invalid = invalidFlag === true || validFlag === false;
  const warmUp = warmUpFlag === true || String(shot.type ?? shot.category ?? "").toLowerCase().includes("warm");
  const outlier = outlierFlag === true;

  return !deleted && !invalid && !warmUp && !outlier;
}

export function valuesForMetric(shots: ShotRecord[], metricKey: keyof typeof metricFields) {
  return shots.flatMap((shot) => {
    const value = metricValue(shot, metricFields[metricKey], metricKey);
    return value === null ? [] : [value];
  });
}

export function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return null;
  }

  const mean = average(values);
  if (mean === null) {
    return null;
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function summarizeValues(values: number[], digits = 1): MetricSummary {
  if (!values.length) {
    return {
      count: 0,
      average: null,
      median: null,
      minimum: null,
      maximum: null,
      range: null,
      standardDeviation: null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = average(values);
  const middle = median(values);
  const sd = standardDeviation(values);

  return {
    count: values.length,
    average: mean === null ? null : roundMetric(mean, digits),
    median: middle === null ? null : roundMetric(middle, digits),
    minimum: roundMetric(min, digits),
    maximum: roundMetric(max, digits),
    range: roundMetric(max - min, digits),
    standardDeviation: sd === null ? null : roundMetric(sd, digits),
  };
}

export function summarizeMetric(shots: ShotRecord[], metricKey: keyof typeof metricFields) {
  return summarizeValues(valuesForMetric(shots, metricKey), metricKey === "smashFactor" ? 2 : 1);
}

export function calculateLeftRightTendency(shots: ShotRecord[]): LeftRightTendency {
  const offlineValues = valuesForMetric(shots, "offlineDistance");
  const leftCount = offlineValues.filter((value) => value < -1).length;
  const rightCount = offlineValues.filter((value) => value > 1).length;
  const centerCount = offlineValues.length - leftCount - rightCount;
  const averageOffline = average(offlineValues);

  if (!offlineValues.length) {
    return {
      available: false,
      dominant: "unknown",
      leftCount: 0,
      rightCount: 0,
      centerCount: 0,
      averageOffline: null,
    };
  }

  let dominant: LeftRightTendency["dominant"] = "balanced";
  if (leftCount > rightCount && leftCount >= offlineValues.length * 0.5) {
    dominant = "left";
  } else if (rightCount > leftCount && rightCount >= offlineValues.length * 0.5) {
    dominant = "right";
  }

  return {
    available: true,
    dominant,
    leftCount,
    rightCount,
    centerCount,
    averageOffline: averageOffline === null ? null : roundMetric(averageOffline, 1),
  };
}

export function calculatePlayablePercentage(shots: ShotRecord[]) {
  const offlineValues = valuesForMetric(shots, "offlineDistance");
  if (offlineValues.length < 3) {
    return null;
  }

  const playable = offlineValues.filter((value) => Math.abs(value) <= 25).length;
  return roundMetric((playable / offlineValues.length) * 100, 1);
}

export function compareWithPreviousSession(currentShots: ShotRecord[], previousShots: ShotRecord[] = []): PreviousSessionComparison {
  const previousValidShots = previousShots.filter(isUsableShot);

  if (!previousValidShots.length) {
    return {
      available: false,
      carryDelta: null,
      offlineStandardDeviationDelta: null,
      summary: "No comparable previous session was available.",
    };
  }

  const currentCarry = summarizeMetric(currentShots, "carry");
  const previousCarry = summarizeMetric(previousValidShots, "carry");
  const currentOffline = summarizeMetric(currentShots, "offlineDistance");
  const previousOffline = summarizeMetric(previousValidShots, "offlineDistance");
  const carryDelta =
    currentCarry.average === null || previousCarry.average === null
      ? null
      : roundMetric(currentCarry.average - previousCarry.average, 1);
  const offlineStandardDeviationDelta =
    currentOffline.standardDeviation === null || previousOffline.standardDeviation === null
      ? null
      : roundMetric(currentOffline.standardDeviation - previousOffline.standardDeviation, 1);

  return {
    available: carryDelta !== null || offlineStandardDeviationDelta !== null,
    carryDelta,
    offlineStandardDeviationDelta,
    summary:
      carryDelta === null && offlineStandardDeviationDelta === null
        ? "Comparable sessions exist, but they do not share enough matching measurements."
        : "Compared with the most recent same-club session.",
  };
}

export function calculateSessionMetrics(shots: ShotRecord[], previousComparableShots: ShotRecord[] = []): SessionMetrics {
  const validShots = shots.filter(isUsableShot);
  const metricSummaries = Object.keys(metricFields).reduce<Record<string, MetricSummary>>((summaries, metricKey) => {
    summaries[metricKey] = summarizeMetric(validShots, metricKey as keyof typeof metricFields);
    return summaries;
  }, {});

  return {
    validShotCount: validShots.length,
    metricSummaries,
    averageCarry: metricSummaries.carry.average,
    medianCarry: metricSummaries.carry.median,
    carryStandardDeviation: metricSummaries.carry.standardDeviation,
    averageTotalDistance: metricSummaries.totalDistance.average,
    averageClubSpeed: metricSummaries.clubSpeed.average,
    averageBallSpeed: metricSummaries.ballSpeed.average,
    averageSmashFactor: metricSummaries.smashFactor.average,
    averageLaunchAngle: metricSummaries.launchAngle.average,
    averageSpinRate: metricSummaries.spinRate.average,
    averageClubPath: metricSummaries.clubPath.average,
    averageFaceAngle: metricSummaries.faceAngle.average,
    averageFaceToPath: metricSummaries.faceToPath.average,
    averageOfflineDistance: metricSummaries.offlineDistance.average,
    leftRightTendency: calculateLeftRightTendency(validShots),
    playableShotsPercentage: calculatePlayablePercentage(validShots),
    previousSessionComparison: compareWithPreviousSession(validShots, previousComparableShots),
  };
}
