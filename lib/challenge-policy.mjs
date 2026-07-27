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
  carryMax: 185,
  carryMin: 165,
  offlineMaxAbs: 10,
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
    return { reason: "wrong_club", qualified: false, usable: false };
  }
  if (missing.length) {
    return { missingMetrics: missing, reason: "missing_metrics", qualified: false, usable: false };
  }
  if (estimated.length) {
    return { estimatedMetrics: estimated, reason: "estimated_metric", qualified: false, usable: false };
  }
  if (carryMin === null || carryMax === null || offlineMaxAbs === null) {
    return { reason: "invalid_criteria", qualified: false, usable: false };
  }

  const carryInWindow = carry >= carryMin && carry <= carryMax;
  const offlineInWindow = Math.abs(offline) <= offlineMaxAbs;
  return {
    carry,
    carryInWindow,
    offline,
    offlineInWindow,
    qualified: carryInWindow && offlineInWindow,
    reason: carryInWindow && offlineInWindow ? "qualified" : "outside_window",
    usable: true,
  };
}

export function evaluateChallengeAttempt({
  completedAt = new Date().toISOString(),
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
  const clubShots = sessionShots.filter((shot) => isChallengeClubShot(shot, template.club));
  const evaluations = clubShots.map((shot) => ({
    id: text(shot?.id),
    shotNumber: finiteNumber(shot?.shotNumber),
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
  const result = {
    challengeType: template.challengeType,
    club: template.club,
    completedAt,
    criteria: parseChallengeCriteria(template.criteriaJson),
    currentSuccessCount,
    measuredShotCount,
    qualifiedShotIds: shotIds,
    requiredShotCount,
    requiredSuccessCount,
    sessionId: text(session?.id) || null,
    startedAt,
    status,
    totalClubShots: clubShots.length,
    unavailableShotCount,
    unqualifiedMeasuredShotCount: measuredShotCount - currentSuccessCount,
  };

  return {
    currentSuccessCount,
    requiredSuccessCount,
    result,
    resultJson: JSON.stringify(result),
    shotIdsJson: JSON.stringify(shotIds),
    status,
  };
}
