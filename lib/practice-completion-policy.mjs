export const PRACTICE_ASSIGNMENT_STATUSES = [
  "assigned",
  "active",
  "completed",
  "needs_review",
  "replaced",
  "cancelled",
  "archived",
];

export const PRACTICE_ATTEMPT_STATUSES = [
  "active",
  "completed",
  "abandoned",
  "needs_review",
];

export const PRACTICE_OUTCOME_CLASSIFICATIONS = [
  "improved",
  "stable",
  "mixed",
  "declined",
  "completed_without_measurement",
  "insufficient_data",
];

export const PRACTICE_NEXT_ACTIONS = [
  "repeat",
  "progress",
  "modify",
  "replace",
  "complete",
];

const MIN_MEASURED_SHOTS_FOR_EVALUATION = 6;

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

function measuredMetric(shot, metric) {
  const value = finiteNumber(shot?.[metric]);
  if (value === null) return null;
  if (!metricSourceIsMeasured(shot, metric) || sourceKind(shot, metric) === "estimated") return null;
  return value;
}

function isExcludedShot(shot) {
  if (!isRecord(shot)) return true;
  const rowLabel = text(shot.sourceShotNumber || shot.shotNumber || shot.rowLabel).toLowerCase();
  const reviewStatus = text(shot.reviewStatus).toLowerCase();
  return Boolean(shot.deleted || shot.isDeleted || shot.deletedAt || shot.isAverage || shot.isSummary) ||
    rowLabel === "avg" ||
    rowLabel === "average" ||
    reviewStatus === "deleted" ||
    reviewStatus === "excluded";
}

function hasCoachConnection(activity = {}) {
  const instructions = isRecord(activity.instructions)
    ? activity.instructions
    : isRecord(activity.instructions_json)
      ? activity.instructions_json
      : {};
  const connection = isRecord(instructions.coachConnection) ? instructions.coachConnection : {};
  const sourceMode = text(instructions.sourceMode).toLowerCase();
  return Boolean(activity.coachId || activity.coach_id) ||
    connection.connected === true ||
    sourceMode === "coach_feedback" ||
    sourceMode === "coach_and_session";
}

function assignmentSource(activity = {}) {
  if (activity.activityType === "challenge" || activity.activity_type === "challenge") return "challenge";
  if (hasCoachConnection(activity)) {
    const mode = text(activity.instructions?.sourceMode).toLowerCase();
    return mode === "coach_and_session" ? "coach_approved_ai" : "coach";
  }
  return text(activity.generatedBy || activity.generated_by) === text(activity.userId || activity.user_id)
    ? "ai"
    : "ai";
}

export function normalizePracticeAssignment(activity = {}) {
  const instructions = isRecord(activity.instructions) ? activity.instructions : {};
  const target = isRecord(activity.target) ? activity.target : {};
  return {
    id: text(activity.id),
    memberId: text(activity.userId || activity.user_id),
    coachId: text(activity.coachId || activity.coach_id) || null,
    drillId: text(activity.drillId || activity.drill_id) || null,
    challengeId: text(activity.challengeId || activity.challenge_id) || null,
    source: assignmentSource(activity),
    title: text(activity.title, "Practice assignment"),
    practicePriority: text(activity.focusArea || activity.focus_area || activity.reasonSelected || activity.reason_selected, "Improve one priority"),
    assignedShotCount: finiteNumber(activity.attemptCount || activity.attempt_count),
    assignedSetCount: null,
    estimatedMinutes: finiteNumber(activity.durationMinutes || activity.duration_minutes),
    successCriteriaJson: JSON.stringify(target.successTarget ? { successTarget: target.successTarget } : target),
    trainingAidJson: JSON.stringify(instructions.trainingAid ?? null),
    status: activity.status === "in_progress" ? "active" : activity.status === "results_submitted" ? "needs_review" : activity.status || "assigned",
    assignedAt: text(activity.createdAt || activity.created_at),
    startedAt: text(activity.startedAt || activity.started_at) || null,
    completedAt: text(activity.completedAt || activity.completed_at) || null,
    createdFromRecommendationId: text(activity.coachFeedbackSourceId || activity.coach_feedback_source_id) || null,
    version: finiteNumber(activity.version) ?? 1,
  };
}

function shotMatchesClub(shot, club) {
  if (!club || normalizeClub(club) === "anyclub" || normalizeClub(club) === "primaryclub") return true;
  return normalizeClub(shot?.club) === normalizeClub(club);
}

function validPracticeShots(session, club) {
  const shots = Array.isArray(session?.shots) ? session.shots : [];
  return shots.filter((shot) => !isExcludedShot(shot) && shotMatchesClub(shot, club));
}

function stats(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  const average = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const variance = clean.reduce((sum, value) => sum + ((value - average) ** 2), 0) / clean.length;
  return {
    average,
    count: clean.length,
    max,
    min,
    range: max - min,
    standardDeviation: Math.sqrt(variance),
  };
}

function comparison(before, after, lowerIsBetter = true, threshold = 0.08) {
  if (!before || !after || before.count < 3 || after.count < 3) return "insufficient";
  const beforeValue = before.average;
  const afterValue = after.average;
  const delta = afterValue - beforeValue;
  const meaningful = Math.max(0.75, Math.abs(beforeValue) * threshold);
  if (Math.abs(delta) < meaningful) return "stable";
  if (lowerIsBetter) return delta < 0 ? "improved" : "declined";
  return delta > 0 ? "improved" : "declined";
}

function splitMeasuredStats(shots, metric, transform = (value) => value) {
  const values = shots
    .map((shot) => measuredMetric(shot, metric))
    .filter((value) => value !== null)
    .map(transform);
  if (values.length < MIN_MEASURED_SHOTS_FOR_EVALUATION) return null;
  const midpoint = Math.floor(values.length / 2);
  const before = stats(values.slice(0, midpoint));
  const after = stats(values.slice(midpoint));
  if (!before || !after || before.count < 3 || after.count < 3) return null;
  return { before, after, valueCount: values.length };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function memberCompletionEvidence(attempt = {}) {
  const completedAmount = text(attempt.completedAmount || attempt.member_completed_amount);
  const completedShots = finiteNumber(attempt.completedShotCount || attempt.completed_shot_count);
  const completedSets = finiteNumber(attempt.completedSetCount || attempt.completed_set_count);
  const completedMinutes = finiteNumber(attempt.completedMinutes || attempt.completed_minutes);
  const details = [
    completedSets ? `${completedSets} set${completedSets === 1 ? "" : "s"}` : "",
    completedShots ? `${completedShots} shot${completedShots === 1 ? "" : "s"}` : "",
    completedMinutes ? `${completedMinutes} minute${completedMinutes === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  return {
    label: completedAmount === "partial" ? "Practice partially completed" : "Practice completed",
    before: null,
    after: completedShots ?? completedSets ?? completedMinutes,
    unit: completedShots ? "shots" : completedSets ? "sets" : completedMinutes ? "minutes" : null,
    source: "member_reported",
    details: details || (completedAmount === "partial" ? "Partial completion recorded by the member." : "Completion recorded by the member."),
  };
}

function completionNextAction({ attempt = {}, classification, hasMeasuredEvidence }) {
  const difficulty = finiteNumber(attempt.memberDifficultyRating ?? attempt.member_difficulty_rating);
  const confidence = finiteNumber(attempt.memberConfidenceRating ?? attempt.member_confidence_rating);
  const helpfulness = finiteNumber(attempt.trainingAidHelpfulness ?? attempt.training_aid_helpfulness);
  const amount = text(attempt.completedAmount || attempt.member_completed_amount || "yes");

  if (amount === "partial" || difficulty === 1 || (confidence !== null && confidence <= 2) || (helpfulness !== null && helpfulness <= 2)) {
    return {
      recommendedNextAction: "modify",
      recommendedReason: "The member reported friction with the drill, confidence, volume, or training aid, so the next step should be adjusted rather than made harder.",
    };
  }
  if (!hasMeasuredEvidence || classification === "completed_without_measurement" || classification === "insufficient_data") {
    return {
      recommendedNextAction: "repeat",
      recommendedReason: "The practice was recorded, but there is not enough measured evidence to progress responsibly.",
    };
  }
  if (classification === "improved" && (confidence === null || confidence >= 3)) {
    return {
      recommendedNextAction: "progress",
      recommendedReason: "Measured results improved across enough valid same-club shots and the member did not report low confidence.",
    };
  }
  if (classification === "declined") {
    return {
      recommendedNextAction: "replace",
      recommendedReason: "Measured results moved the wrong way across valid same-club shots, so this assignment needs Coach or MAI review before repeating.",
    };
  }
  return {
    recommendedNextAction: "repeat",
    recommendedReason: "The result was stable or mixed, so repeating once more is safer than progressing immediately.",
  };
}

export function evaluatePracticeOutcome({
  activity = {},
  attempt = {},
  linkedSession = null,
} = {}) {
  const club = text(activity.club || activity.club_name || activity.focusClub, "");
  const shots = linkedSession ? validPracticeShots(linkedSession, club) : [];
  const evidence = [memberCompletionEvidence(attempt)];
  const completedAmount = text(attempt.completedAmount || attempt.member_completed_amount || "yes");

  if (linkedSession && shots.length < MIN_MEASURED_SHOTS_FOR_EVALUATION) {
    const next = completionNextAction({ attempt, classification: "insufficient_data", hasMeasuredEvidence: false });
    return {
      classification: "insufficient_data",
      biggestWin: completedAmount === "partial"
        ? "You saved a partial practice result."
        : "You saved the practice result.",
      remainingOpportunity: "There are not enough valid same-club measured shots to evaluate the drill yet.",
      evidence,
      confidence: 0.25,
      ...next,
      measurementSource: "member_recorded",
      coachReviewRequired: hasCoachConnection(activity),
    };
  }

  const comparisons = [];
  const carryRange = splitMeasuredStats(shots, "carry", (value) => value);
  if (carryRange) {
    const before = { ...carryRange.before, average: carryRange.before.range };
    const after = { ...carryRange.after, average: carryRange.after.range };
    comparisons.push({ label: "Carry variation", unit: "yd", before, after, result: comparison(before, after, true, 0.08) });
  }
  const offline = splitMeasuredStats(shots, "offline", (value) => Math.abs(value));
  if (offline) {
    comparisons.push({ label: "Average offline", unit: "yd", before: offline.before, after: offline.after, result: comparison(offline.before, offline.after, true, 0.08) });
  }
  const smash = splitMeasuredStats(shots, "smash", (value) => value);
  if (smash) {
    const before = { ...smash.before, average: smash.before.standardDeviation };
    const after = { ...smash.after, average: smash.after.standardDeviation };
    comparisons.push({ label: "Smash consistency", unit: "", before, after, result: comparison(before, after, true, 0.08) });
  }

  const measuredComparisons = comparisons.filter((item) => item.result !== "insufficient");
  for (const item of measuredComparisons) {
    evidence.push({
      label: item.label,
      before: round(item.before.average),
      after: round(item.after.average),
      unit: item.unit,
      source: "measured",
    });
  }

  if (!measuredComparisons.length) {
    const next = completionNextAction({ attempt, classification: "completed_without_measurement", hasMeasuredEvidence: false });
    return {
      classification: "completed_without_measurement",
      biggestWin: completedAmount === "partial"
        ? "You recorded a partial practice attempt."
        : "You completed the assigned practice.",
      remainingOpportunity: linkedSession
        ? "The linked session did not contain enough measured same-club metrics for a valid outcome comparison."
        : "Add session data next time to measure the result.",
      evidence,
      confidence: 0.35,
      ...next,
      measurementSource: "member_recorded",
      coachReviewRequired: hasCoachConnection(activity),
    };
  }

  const improved = measuredComparisons.filter((item) => item.result === "improved").length;
  const declined = measuredComparisons.filter((item) => item.result === "declined").length;
  const stable = measuredComparisons.filter((item) => item.result === "stable").length;
  const classification = improved > 0 && declined > 0
    ? "mixed"
    : improved > 0
      ? "improved"
      : declined > 0
        ? "declined"
        : stable > 0
          ? "stable"
          : "insufficient_data";
  const winEvidence = measuredComparisons.find((item) => item.result === "improved") ?? measuredComparisons[0];
  const opportunityEvidence = measuredComparisons.find((item) => item.result === "declined") ??
    (classification === "stable" ? measuredComparisons[0] : null);
  const next = completionNextAction({ attempt, classification, hasMeasuredEvidence: true });

  return {
    classification,
    biggestWin: classification === "improved"
      ? `${winEvidence.label} improved from ${round(winEvidence.before.average)}${winEvidence.unit ? ` ${winEvidence.unit}` : ""} to ${round(winEvidence.after.average)}${winEvidence.unit ? ` ${winEvidence.unit}` : ""}.`
      : classification === "declined"
        ? "You completed the practice and created a measured checkpoint."
        : "You completed the practice and saved a measured result.",
    remainingOpportunity: opportunityEvidence
      ? `${opportunityEvidence.label} still needs attention based on the linked session.`
      : null,
    evidence,
    confidence: measuredComparisons.length >= 2 ? 0.72 : 0.58,
    ...next,
    measurementSource: "measured_from_session_data",
    coachReviewRequired: hasCoachConnection(activity),
    baselinePolicy: "earlier_portion_of_same_linked_session",
  };
}

export function mapOutcomeToProgressStatus(outcome = {}) {
  if (outcome.classification === "improved") return "improved";
  if (outcome.classification === "declined") return "needs_more_work";
  if (outcome.classification === "stable" || outcome.classification === "mixed" || outcome.classification === "completed_without_measurement") {
    return "maintained";
  }
  return "insufficient_data";
}

export function progressSourceLabel(outcome = {}) {
  return outcome.measurementSource === "measured_from_session_data"
    ? "Measured from session data"
    : "Member recorded";
}

export function buildPracticeProgress({ activity = {}, attempt = {}, outcome = null } = {}) {
  const completedShots = finiteNumber(attempt.completedShotCount ?? attempt.completed_shot_count);
  const completedSets = finiteNumber(attempt.completedSetCount ?? attempt.completed_set_count);
  const completedMinutes = finiteNumber(attempt.completedMinutes ?? attempt.completed_minutes);
  const assignedShots = finiteNumber(activity.attemptCount ?? activity.attempt_count);
  const assignedMinutes = finiteNumber(activity.durationMinutes ?? activity.duration_minutes);
  if (completedShots !== null) {
    return {
      mode: "shot",
      label: assignedShots ? `${completedShots} of ${assignedShots} shots completed` : `${completedShots} shots completed`,
      sourceLabel: progressSourceLabel(outcome ?? {}),
    };
  }
  if (completedSets !== null) {
    return {
      mode: "set",
      label: `${completedSets} set${completedSets === 1 ? "" : "s"} completed`,
      sourceLabel: progressSourceLabel(outcome ?? {}),
    };
  }
  if (completedMinutes !== null) {
    return {
      mode: "time",
      label: assignedMinutes ? `${completedMinutes} of ${assignedMinutes} minutes completed` : `${completedMinutes} minutes completed`,
      sourceLabel: progressSourceLabel(outcome ?? {}),
    };
  }
  return {
    mode: "member_confirmed",
    label: attempt.status === "completed" ? "Practice completed" : "Ready to start",
    sourceLabel: progressSourceLabel(outcome ?? {}),
  };
}

export function coachReviewStatusForOutcome(activity = {}, outcome = {}) {
  if (!hasCoachConnection(activity)) return "not_required";
  if (outcome.coachReview?.status) return outcome.coachReview.status;
  return outcome.classification ? "pending" : "not_started";
}

export function nextActionVisibility(activity = {}, outcome = {}) {
  if (hasCoachConnection(activity)) {
    return {
      label: "Coach review pending",
      memberVisible: false,
      source: "coach_review_required",
    };
  }
  return {
    label: "AI-generated practice recommendation",
    memberVisible: true,
    source: "mai",
  };
}

export function practiceEventActionForOutcome(outcome = {}) {
  if (outcome.classification === "improved") return "practice_outcome_improved";
  if (outcome.classification === "stable" || outcome.classification === "mixed") return "practice_outcome_stable";
  if (outcome.classification === "declined") return "practice_outcome_declined";
  return "practice_outcome_insufficient_data";
}
