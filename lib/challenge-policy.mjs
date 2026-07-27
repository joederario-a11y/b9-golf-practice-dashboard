export const CHALLENGE_TYPES = [
  "carry_window",
  "offline_window",
  "combined_precision",
];

export const MEMBER_CHALLENGE_SOURCES = [
  "coach",
  "coach_approved_ai",
  "mai",
];

export const MEMBER_CHALLENGE_STATUSES = [
  "assigned",
  "active",
  "completed",
  "failed",
  "expired",
  "cancelled",
];

export const SEVEN_IRON_PRECISION_CRITERIA = Object.freeze({
  carryMax: 155,
  carryMin: 145,
  offlineMaxAbs: 8,
});

export const SEVEN_IRON_PRECISION_TEMPLATE = Object.freeze({
  active: true,
  challengeType: "combined_precision",
  club: "7-Iron",
  criteriaJson: JSON.stringify(SEVEN_IRON_PRECISION_CRITERIA),
  description: "Hit 5 qualifying 7-Iron shots with carry in the window and offline inside the target.",
  id: "seven-iron-precision-v1",
  requiredShotCount: 5,
  successShotCount: 5,
  title: "7-Iron Precision",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClub(value) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function metricSourceIsMeasured(shot, metric) {
  const kind = sourceKind(shot, metric);
  if (
    metric === "offline" &&
    kind === "derived" &&
    Array.isArray(shot?.metricSources?.offline?.inputMetrics) &&
    shot.metricSources.offline.inputMetrics.includes("sideTotal") &&
    sourceKind(shot, "sideTotal") === "measured"
  ) {
    return true;
  }
  return !kind || kind === "measured" || kind === "manual";
}

function sourceKind(shot, metric) {
  const source = isRecord(shot?.metricSources) ? shot.metricSources[metric] : null;
  return text(source?.kind).toLowerCase();
}

function isEstimatedMetric(shot, metric) {
  return sourceKind(shot, metric) === "estimated";
}

export function parseChallengeCriteria(value) {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isChallengeClubShot(shot, club) {
  if (!isRecord(shot)) return false;
  if (!club) return true;
  return normalizeClub(shot.club) === normalizeClub(club);
}

export function challengeShotId(shot, fallbackIndex = 0) {
  return text(shot?.id) ||
    text(shot?.sourceShotNumber) ||
    text(shot?.shotNumber) ||
    `shot-${fallbackIndex + 1}`;
}

export function isChallengeExcludedShot(shot) {
  if (!isRecord(shot)) return true;
  const rowLabel = text(shot.sourceShotNumber || shot.shotNumber || shot.rowLabel).toLowerCase();
  const reviewStatus = text(shot.reviewStatus).toLowerCase();
  return Boolean(shot.deleted || shot.isDeleted || shot.deletedAt || shot.isAverage || shot.isSummary) ||
    rowLabel === "avg" ||
    rowLabel === "average" ||
    reviewStatus === "deleted" ||
    reviewStatus === "excluded";
}

export function evaluateShotForChallenge(shot, template = SEVEN_IRON_PRECISION_TEMPLATE) {
  const criteria = parseChallengeCriteria(template.criteriaJson);
  const carry = finiteNumber(shot?.carry);
  const offline = finiteNumber(shot?.offline);
  const carryMin = finiteNumber(criteria.carryMin);
  const carryMax = finiteNumber(criteria.carryMax);
  const offlineMaxAbs = finiteNumber(criteria.offlineMaxAbs);
  const missing = [
    ...(carry === null ? ["carry"] : []),
    ...(offline === null ? ["offline"] : []),
  ];
  const estimated = [
    ...(isEstimatedMetric(shot, "carry") ? ["carry"] : []),
    ...(isEstimatedMetric(shot, "offline") ? ["offline"] : []),
  ];

  if (!isChallengeClubShot(shot, template.club)) {
    return {
      reason: "wrong_club",
      status: "wrong_club",
      statusLabel: "Wrong club",
      qualified: false,
      usable: false,
    };
  }
  if (missing.length) {
    return {
      missingMetrics: missing,
      reason: "missing_required_data",
      status: "not_evaluable",
      statusLabel: "Missing required data",
      qualified: false,
      usable: false,
    };
  }
  const unmeasured = [
    ...(!metricSourceIsMeasured(shot, "carry") || estimated.includes("carry") ? ["carry"] : []),
    ...(!metricSourceIsMeasured(shot, "offline") || estimated.includes("offline") ? ["offline"] : []),
  ];
  if (unmeasured.length) {
    return {
      estimatedMetrics: unmeasured,
      reason: "estimated_metric",
      status: "not_evaluable",
      statusLabel: "Missing required data",
      qualified: false,
      usable: false,
    };
  }
  if (carryMin === null || carryMax === null || offlineMaxAbs === null) {
    return {
      reason: "invalid_criteria",
      status: "not_evaluable",
      statusLabel: "Missing required data",
      qualified: false,
      usable: false,
    };
  }

  const carryInWindow = carry >= carryMin && carry <= carryMax;
  const offlineInWindow = Math.abs(offline) <= offlineMaxAbs;
  const reason = carryInWindow && offlineInWindow
    ? "qualified"
    : !carryInWindow
      ? "outside_carry_window"
      : "outside_target_window";
  return {
    carry,
    carryInWindow,
    offline,
    offlineInWindow,
    qualified: carryInWindow && offlineInWindow,
    reason,
    status: reason,
    statusLabel: reason === "qualified"
      ? "Qualified"
      : reason === "outside_carry_window"
        ? "Outside carry window"
        : "Outside target window",
    usable: true,
  };
}

export function sessionHasEligibleChallengeShots(session, template = SEVEN_IRON_PRECISION_TEMPLATE) {
  const shots = Array.isArray(session?.shots) ? session.shots : [];
  return shots.some((shot) => {
    if (isChallengeExcludedShot(shot) || !isChallengeClubShot(shot, template.club)) return false;
    const evaluation = evaluateShotForChallenge(shot, template);
    return evaluation.usable;
  });
}

export function evaluateChallengeAttempt({
  completedAt = new Date().toISOString(),
  existingShotIds = [],
  session = null,
  shots = [],
  startedAt = new Date().toISOString(),
  template = SEVEN_IRON_PRECISION_TEMPLATE,
} = {}) {
  const sessionShots = Array.isArray(shots) && shots.length
    ? shots
    : Array.isArray(session?.shots)
      ? session.shots
      : [];
  const seenShotIds = new Set(Array.isArray(existingShotIds) ? existingShotIds.map((id) => text(id)).filter(Boolean) : []);
  const evaluatedIds = new Set();
  const uniqueShots = [];
  sessionShots.forEach((shot, index) => {
    if (isChallengeExcludedShot(shot)) return;
    const id = challengeShotId(shot, index);
    if (!id || evaluatedIds.has(id) || seenShotIds.has(id)) return;
    evaluatedIds.add(id);
    uniqueShots.push({ id, index, shot });
  });
  const evaluations = uniqueShots.map(({ id, index, shot }) => ({
    club: text(shot?.club),
    id,
    shotNumber: finiteNumber(shot?.shotNumber),
    sourceShotNumber: text(shot?.sourceShotNumber) || text(shot?.shotNumber) || String(index + 1),
    ...evaluateShotForChallenge(shot, template),
  }));
  const measuredShotCount = evaluations.filter((item) => item.usable).length;
  const qualifiedShots = evaluations.filter((item) => item.qualified);
  const unavailableShotCount = evaluations.filter((item) => !item.usable).length;
  const currentSuccessCount = qualifiedShots.length;
  const requiredSuccessCount = Number(template.successShotCount) || 5;
  const requiredShotCount = Number(template.requiredShotCount) || requiredSuccessCount;
  const status = currentSuccessCount >= requiredSuccessCount ? "completed" : "active";
  const shotIds = qualifiedShots.map((item) => item.id).filter(Boolean);
  const evaluatedShotIds = evaluations.map((item) => item.id).filter(Boolean);
  const qualifyingCarries = qualifiedShots.map((item) => item.carry).filter((value) => Number.isFinite(value));
  const qualifyingOffline = qualifiedShots.map((item) => Math.abs(item.offline)).filter((value) => Number.isFinite(value));
  const average = (values) => values.length
    ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
    : null;
  const biggestWin = currentSuccessCount
    ? `${currentSuccessCount} measured ${template.club} ${currentSuccessCount === 1 ? "shot finished" : "shots finished"} inside both the carry and offline windows.`
    : "No measured shot has qualified yet.";
  const result = {
    averageQualifyingCarry: average(qualifyingCarries),
    averageQualifyingOffline: average(qualifyingOffline),
    biggestWin,
    challengeType: template.challengeType,
    club: template.club,
    completedAt: status === "completed" ? completedAt : null,
    criteria: parseChallengeCriteria(template.criteriaJson),
    currentSuccessCount,
    evaluatedAt: completedAt,
    evaluatedShotIds,
    measuredShotCount,
    nextStep: "Repeat this challenge once more before narrowing the target window.",
    qualifiedShotIds: shotIds,
    requiredShotCount,
    requiredSuccessCount,
    sessionId: text(session?.id) || null,
    shotResults: evaluations.map((item) => ({
      carry: Number.isFinite(item.carry) ? item.carry : null,
      club: item.club || null,
      id: item.id,
      offline: Number.isFinite(item.offline) ? item.offline : null,
      qualified: Boolean(item.qualified),
      reason: item.reason,
      shotNumber: item.sourceShotNumber || (item.shotNumber ? String(item.shotNumber) : item.id),
      status: item.status,
      statusLabel: item.statusLabel,
    })),
    startedAt,
    status,
    totalAttemptedShotCount: evaluations.length,
    totalClubShots: evaluations.filter((item) => isChallengeClubShot({ club: item.club }, template.club)).length,
    unavailableShotCount,
    unqualifiedMeasuredShotCount: measuredShotCount - currentSuccessCount,
  };

  return {
    currentSuccessCount,
    evaluatedShotIds,
    requiredSuccessCount,
    result,
    resultJson: JSON.stringify(result),
    shotIdsJson: JSON.stringify(evaluatedShotIds),
    status,
  };
}
