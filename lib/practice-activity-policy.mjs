export const PRACTICE_PROMPT_VERSION = "mai-practice-generator-v1";
export const PRACTICE_ACTIVITY_STATUSES = [
  "generated",
  "in_progress",
  "completed",
  "results_submitted",
  "cancelled",
  "superseded",
];
export const PRACTICE_RESULT_STATUSES = [
  "improved",
  "maintained",
  "needs_more_work",
  "insufficient_data",
];
export const ACTIVE_PRACTICE_STATUSES = new Set(["generated", "in_progress"]);

export const practiceActivityJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "activityType",
    "title",
    "focusArea",
    "reasonSelected",
    "coachConnection",
    "club",
    "equipment",
    "durationMinutes",
    "setup",
    "instructions",
    "attemptCount",
    "successTarget",
    "scoring",
    "feel",
    "commonMistake",
    "easierVersion",
    "harderVersion",
    "resultRequest",
    "resultFields",
    "nextStepLogic",
    "confidence",
    "sourceSummary",
  ],
  properties: {
    activityType: { type: "string", enum: ["drill", "challenge"] },
    title: { type: "string" },
    focusArea: { type: "string" },
    reasonSelected: { type: "string" },
    coachConnection: {
      type: "object",
      additionalProperties: false,
      required: ["connected", "coachName", "summary"],
      properties: {
        connected: { type: "boolean" },
        coachName: { type: ["string", "null"] },
        summary: { type: "string" },
      },
    },
    club: { type: "string" },
    equipment: { type: "array", items: { type: "string" } },
    durationMinutes: { type: "number", minimum: 1, maximum: 120 },
    setup: { type: "string" },
    instructions: { type: "array", items: { type: "string" } },
    attemptCount: { type: "number", minimum: 1, maximum: 300 },
    successTarget: { type: "string" },
    scoring: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "system", "targetScore", "stretchTarget"],
      properties: {
        enabled: { type: "boolean" },
        system: { type: "string" },
        targetScore: { type: ["number", "null"] },
        stretchTarget: { type: ["number", "null"] },
      },
    },
    feel: { type: "string" },
    commonMistake: { type: "string" },
    easierVersion: { type: "string" },
    harderVersion: { type: "string" },
    resultRequest: {
      type: "object",
      additionalProperties: false,
      required: ["shouldRequest", "reason", "preferredMethod"],
      properties: {
        shouldRequest: { type: "boolean" },
        reason: { type: "string" },
        preferredMethod: { type: "string", enum: ["manual", "score", "session_upload", "csv", "photo", "reflection"] },
      },
    },
    resultFields: { type: "array", items: { type: "string" } },
    nextStepLogic: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceSummary: { type: "string" },
  },
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value, fallback, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  return Math.min(max, Math.max(min, numeric));
}

function stringArray(value, fallback = []) {
  const array = Array.isArray(value) ? value : fallback;
  return array
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeCoachConnection(value) {
  const record = isRecord(value) ? value : {};
  const connected = record.connected === true;
  const coachName = text(record.coachName);
  return {
    connected: connected && Boolean(coachName || text(record.summary)),
    coachName: coachName || null,
    summary: text(record.summary, connected ? "Coach-approved feedback was considered." : "No current coach-approved feedback was available."),
  };
}

function normalizeScoring(value, activityType) {
  const record = isRecord(value) ? value : {};
  const enabled = activityType === "challenge" ? record.enabled !== false : record.enabled === true;
  return {
    enabled,
    system: text(record.system, enabled ? "1 point for each successful attempt." : "Track successful reps and notes."),
    targetScore: record.targetScore === null ? null : number(record.targetScore, enabled ? 8 : null, { min: 0, max: 999 }),
    stretchTarget: record.stretchTarget === null ? null : number(record.stretchTarget, enabled ? 10 : null, { min: 0, max: 999 }),
  };
}

function normalizeResultRequest(value, activityType) {
  const record = isRecord(value) ? value : {};
  const preferred = text(record.preferredMethod, activityType === "challenge" ? "score" : "manual");
  const allowed = new Set(["manual", "score", "session_upload", "csv", "photo", "reflection"]);
  return {
    shouldRequest: record.shouldRequest !== false,
    reason: text(record.reason, activityType === "challenge" ? "This challenge is measurable and can be compared next time." : "A short result helps MAI Coach choose the next progression."),
    preferredMethod: allowed.has(preferred) ? preferred : "manual",
  };
}

export function normalizePracticeActivityOutput(value, requestedActivityType = "drill") {
  if (!isRecord(value)) {
    throw new Error("MAI Coach did not return a structured practice activity.");
  }
  const activityType = text(value.activityType, requestedActivityType) === "challenge" ? "challenge" : "drill";
  if (requestedActivityType && activityType !== requestedActivityType) {
    throw new Error("MAI Coach returned the wrong practice activity type.");
  }
  const title = text(value.title);
  const focusArea = text(value.focusArea);
  const reasonSelected = text(value.reasonSelected);
  const setup = text(value.setup);
  const instructions = stringArray(value.instructions);
  const successTarget = text(value.successTarget);
  if (!title || !focusArea || !reasonSelected || !setup || !instructions.length || !successTarget) {
    throw new Error("MAI Coach returned an incomplete practice activity.");
  }
  return {
    activityType,
    title,
    focusArea,
    reasonSelected,
    coachConnection: normalizeCoachConnection(value.coachConnection),
    club: text(value.club, "Any club"),
    equipment: stringArray(value.equipment, ["No training aids"]),
    durationMinutes: number(value.durationMinutes, activityType === "challenge" ? 20 : 15, { min: 1, max: 120 }),
    setup,
    instructions,
    attemptCount: number(value.attemptCount, activityType === "challenge" ? 10 : 20, { min: 1, max: 300 }),
    successTarget,
    scoring: normalizeScoring(value.scoring, activityType),
    feel: text(value.feel, "Balanced tempo and committed target."),
    commonMistake: text(value.commonMistake, "Changing more than one thing at a time."),
    easierVersion: text(value.easierVersion, "Reduce speed and widen the target window."),
    harderVersion: text(value.harderVersion, "Add target changes or tighten the scoring window."),
    resultRequest: normalizeResultRequest(value.resultRequest, activityType),
    resultFields: stringArray(value.resultFields, activityType === "challenge" ? ["score", "attempts", "successful_attempts"] : ["attempts", "successful_attempts", "reflection"]),
    nextStepLogic: text(value.nextStepLogic, "Progress only after the target is met with supporting results."),
    confidence: number(value.confidence, 0.55, { min: 0, max: 1 }),
    sourceSummary: text(value.sourceSummary, "Generated from the available user-owned profile, session, and coach-approved context."),
    sourceMode: text(value.sourceMode),
  };
}

function focusToClub(focusArea, fallbackClub) {
  const focus = focusArea.toLowerCase();
  if (focus.includes("driver") || focus.includes("distance")) return "Driver";
  if (focus.includes("wedge") || focus.includes("short")) return "Wedge";
  if (focus.includes("putt")) return "Putter";
  if (focus.includes("iron")) return "7-iron";
  return fallbackClub || "Primary club";
}

function coachConnectionFromContext(context = {}) {
  const coach = isRecord(context.coachFeedback) ? context.coachFeedback : {};
  const coachName = text(coach.coachName);
  const summary = text(coach.summary || coach.practiceAssignment || coach.recommendedDrill);
  return {
    connected: Boolean(summary),
    coachName: coachName || null,
    summary: summary || "No current coach-approved feedback was available.",
  };
}

function hasActiveCoachFeedback(context = {}) {
  const coach = isRecord(context.coachFeedback) ? context.coachFeedback : {};
  const status = text(coach.status, "active").toLowerCase();
  return status !== "resolved" && status !== "archived" && Boolean(text(coach.summary || coach.practiceAssignment || coach.recommendedDrill));
}

function hasUsableSessionEvidence(context = {}) {
  const quality = isRecord(context.shotDataQuality) ? context.shotDataQuality : {};
  const summary = isRecord(context.sessionSummary) ? context.sessionSummary : {};
  const confidence = text(quality.confidence);
  const usableShotCount = number(quality.shotCount, number(summary.usableShotCount, number(summary.shotCount, 0), { min: 0 }), { min: 0 });
  return confidence === "usable" || confidence === "provisional" || usableShotCount >= 5;
}

function hasLessonNotes(context = {}) {
  const analysis = isRecord(context.latestAnalysis) ? context.latestAnalysis : {};
  const lessonNotes = isRecord(context.lessonNotes) ? context.lessonNotes : {};
  return Boolean(text(analysis.completedAt) || text(lessonNotes.summary) || stringArray(lessonNotes.prescribedDrills).length);
}

export function getPracticeSourceMode(context = {}) {
  const coach = hasActiveCoachFeedback(context);
  const session = hasUsableSessionEvidence(context);
  if (coach && session) return "coach_and_session";
  if (coach) return "coach_feedback";
  if (hasLessonNotes(context)) return "lesson_notes";
  if (session) return "session_data";
  return "profile_fallback";
}

export function buildPracticeSourceSummary(sourceMode, context = {}) {
  const coach = coachConnectionFromContext(context);
  const quality = isRecord(context.shotDataQuality) ? context.shotDataQuality : {};
  const clubCounts = Array.isArray(quality.clubCounts) ? quality.clubCounts : [];
  const topClub = clubCounts.slice().sort((left, right) => number(right.shots, 0) - number(left.shots, 0))[0];

  if (sourceMode === "coach_and_session") {
    return `Based on ${coach.coachName || "your coach"}'s active feedback plus ${number(quality.shotCount, 0)} usable stored shots${topClub?.club ? `, led by ${topClub.club}` : ""}.`;
  }
  if (sourceMode === "coach_feedback") {
    return `Based on active coach feedback from ${coach.coachName || "your coach"}. No launch-monitor diagnosis was added.`;
  }
  if (sourceMode === "lesson_notes") {
    return "Based on saved MAI lesson notes and approved recap context.";
  }
  if (sourceMode === "session_data") {
    return `Based on ${number(quality.shotCount, 0)} usable user-owned shot records${topClub?.club ? `, led by ${topClub.club}` : ""}.`;
  }
  return "Starter plan based on your golfer profile. No launch-monitor data or coach diagnosis was assumed.";
}

function hashSeed(seed = "") {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const PROFILE_STARTER_PLANS = [
  {
    key: "center-contact",
    focusArea: "Contact quality",
    club: "7-iron",
    goals: ["Ball striking", "Contact quality", "Inconsistent contact", "Fat shots", "Thin shots"],
    beginnerSafe: true,
    juniorSafe: true,
    title: "Center Contact Ladder",
    setup: "Use a mid-iron, tee the ball barely above the turf, and choose one center target.",
    instructions: [
      "Make five slow rehearsals brushing the same spot on the mat.",
      "Hit three sets of five balls at 70 percent speed.",
      "After each set, write down how many felt centered.",
      "Only add speed when at least three balls in a set feel centered.",
    ],
    successTarget: "Finish one set with at least 3 of 5 centered-contact swings.",
    measurement: "Centered-contact count and carry spread.",
    feel: "Brush the same spot after the ball with quiet balance.",
  },
  {
    key: "start-line",
    focusArea: "Face angle",
    club: "7-iron",
    goals: ["Face angle", "Driver accuracy", "Shot shape", "Slicing", "Hooking", "Confidence"],
    beginnerSafe: true,
    juniorSafe: true,
    title: "Start-Line Gate",
    setup: "Place two alignment sticks or visual targets a few yards in front of the ball to make a wide gate.",
    instructions: [
      "Pick a start line before every ball.",
      "Hit 10 half-speed shots through the gate.",
      "Score one point when the ball starts inside the gate.",
      "Keep the same target for all 10 shots.",
    ],
    successTarget: "Score 7 of 10 starts inside the gate.",
    measurement: "Start-line score.",
    feel: "Clubface looking at the target longer through impact.",
  },
  {
    key: "wedge-window",
    focusArea: "Wedge control",
    club: "Wedge",
    goals: ["Wedge control", "Short game", "Track distances", "Poor wedge distance control"],
    beginnerSafe: true,
    juniorSafe: true,
    title: "Three-Window Wedge Map",
    setup: "Choose one wedge and three comfortable swing lengths: waist-high, chest-high, and full finish.",
    instructions: [
      "Hit five balls with the shortest swing and record the carry window.",
      "Hit five balls with the middle swing and record the carry window.",
      "Hit five balls with the longest swing and record the carry window.",
      "Circle the swing length with the tightest spread.",
    ],
    successTarget: "Create three carry windows and identify the tightest one.",
    measurement: "Carry window by swing length.",
    feel: "Same tempo, different finish length.",
  },
  {
    key: "tempo-balance",
    focusArea: "Tempo",
    club: "Any club",
    goals: ["Tempo", "I just want to get better", "Confidence", "Solo practice", "Quick drills"],
    beginnerSafe: true,
    juniorSafe: true,
    title: "Hold-the-Finish Tempo Set",
    setup: "Choose a comfortable club and one target. Keep the swing at a speed where you can hold your finish.",
    instructions: [
      "Make one rehearsal counting one-two on the backswing and three on the finish.",
      "Hit 12 balls while holding the finish until the ball lands.",
      "Restart the count if balance breaks.",
      "Record how many finishes you held cleanly.",
    ],
    successTarget: "Hold 9 of 12 finishes without stepping out.",
    measurement: "Balanced finishes out of 12.",
    feel: "Smooth count, stable finish, eyes on the target.",
  },
];

function profileTextBuckets(profile = {}) {
  return [
    text(profile.skillLevel),
    text(profile.handicap),
    text(profile.path),
    ...stringArray(profile.goals),
    ...stringArray(profile.frustrations),
    ...stringArray(profile.practiceStyle),
    ...stringArray(profile.simulatorGoals),
    ...stringArray(profile.experienceStyle),
    text(profile.coachNotes),
  ].join(" ").toLowerCase();
}

function selectProfileStarterPlan({ activityType, focusArea, profile, seed }) {
  const buckets = profileTextBuckets(profile);
  const isJunior = buckets.includes("junior") || text(profile.path).toLowerCase() === "junior";
  const isBeginner = buckets.includes("beginner") || buckets.includes("new") || buckets.includes("casual");
  const focus = text(focusArea).toLowerCase();
  const weighted = [];

  for (const plan of PROFILE_STARTER_PLANS) {
    if (isJunior && !plan.juniorSafe) continue;
    if (isBeginner && !plan.beginnerSafe) continue;
    let weight = 1;
    if (focus && plan.focusArea.toLowerCase().includes(focus)) weight += 2;
    for (const goal of plan.goals) {
      if (buckets.includes(goal.toLowerCase())) weight += 2;
      if (focus && goal.toLowerCase().includes(focus)) weight += 1;
    }
    for (let index = 0; index < weight; index += 1) weighted.push(plan);
  }

  const choices = weighted.length ? weighted : PROFILE_STARTER_PLANS;
  const offset = activityType === "challenge" ? 17 : 0;
  return choices[(hashSeed(`${seed}:${activityType}:${focusArea}`) + offset) % choices.length];
}

export function buildDefaultPracticeActivity({
  activityType = "drill",
  focusArea = "Better contact",
  context = {},
} = {}) {
  const safeType = activityType === "challenge" ? "challenge" : "drill";
  const priority = isRecord(context.priority) ? context.priority : {};
  const profile = isRecord(context.player) ? context.player : isRecord(context.profile) ? context.profile : {};
  const sourceMode = getPracticeSourceMode(context);
  const sourceSummary = buildPracticeSourceSummary(sourceMode, context);
  const starterPlan = sourceMode === "profile_fallback"
    ? selectProfileStarterPlan({ activityType: safeType, focusArea, profile, seed: text(context.seed, new Date().toISOString().slice(0, 10)) })
    : null;
  const coachConnection = coachConnectionFromContext(context);
  const focus = text(focusArea, text(priority.focusArea, starterPlan?.focusArea ?? "Better contact"));
  const club = starterPlan?.club ?? focusToClub(focus, text(priority.club));
  const skillLevel = text(profile.skillLevel, "developing player");
  const coachReason = sourceMode === "coach_and_session"
    ? `${coachConnection.coachName || "Your coach"} has active feedback and your stored shot data gives MAI Coach a measurable checkpoint.`
    : sourceMode === "coach_feedback"
      ? `${coachConnection.coachName || "Your coach"} has active feedback connected to this focus.`
      : sourceMode === "session_data"
        ? "MAI Coach found usable user-owned session data and is keeping the recommendation tied to measured results."
        : sourceMode === "lesson_notes"
          ? "MAI Coach found saved lesson notes and is using those before generic practice ideas."
          : "MAI Coach did not find usable session data or active coach feedback, so this is a starter plan based only on your golfer profile.";

  if (safeType === "challenge") {
    return normalizePracticeActivityOutput({
      activityType: "challenge",
      title: starterPlan ? `${starterPlan.title} Challenge` : `${focus} Score Challenge`,
      focusArea: focus,
      reasonSelected: `${coachReason} This challenge gives your ${skillLevel} practice a measurable target instead of another generic range session.`,
      coachConnection,
      club,
      equipment: starterPlan ? ["Target line", "Scorecard"] : ["Launch monitor or shot result screen", "Target line"],
      durationMinutes: 20,
      setup: starterPlan?.setup ?? `Pick one target and hit all attempts with ${club}. Record whether each attempt meets the target window.`,
      instructions: starterPlan?.instructions ?? [
        "Make three rehearsal swings with a clear start line.",
        "Hit 10 scored shots at normal practice speed.",
        "Give yourself one point each time the shot meets the success target.",
        "Write down what happened on the misses before generating the next activity.",
      ],
      attemptCount: 10,
      successTarget: starterPlan?.successTarget ?? (focus.toLowerCase().includes("face")
        ? "Score at least 7 of 10 shots with the ball starting on the intended side of the target line."
        : "Score at least 7 of 10 shots inside your selected target window."),
      scoring: {
        enabled: true,
        system: "1 point for each successful shot, plus 1 bonus point for a best-of-set result.",
        targetScore: 7,
        stretchTarget: 9,
      },
      feel: starterPlan?.feel ?? "Committed start line, balanced finish, and no last-second steering.",
      commonMistake: "Changing the target window after a miss instead of scoring the attempt honestly.",
      easierVersion: "Use 7 attempts and make the target window wider.",
      harderVersion: "Keep the same target but require two successful shots in a row to finish.",
      resultRequest: {
        shouldRequest: true,
        reason: "A score lets MAI Coach compare this attempt with your next one.",
        preferredMethod: "score",
      },
      resultFields: ["score", "attempts", "successful_attempts", "club", "notes"],
      nextStepLogic: "If you meet the target, progress to a tighter window. If not, repeat once or switch to a supporting drill.",
      confidence: sourceMode === "profile_fallback" ? 0.46 : coachConnection.connected ? 0.78 : 0.62,
      sourceMode,
      sourceSummary,
    }, "challenge");
  }

  return normalizePracticeActivityOutput({
    activityType: "drill",
    title: starterPlan?.title ?? (focus.toLowerCase().includes("face") ? "Face-Control Gate Drill" : `${focus} Calibration Drill`),
    focusArea: focus,
    reasonSelected: `${coachReason} This drill builds a repeatable feel before asking you to prove it with a score.`,
    coachConnection,
    club,
    equipment: starterPlan ? ["Alignment stick or visual target", "Scorecard"] : ["Alignment stick", "Headcover or towel"],
    durationMinutes: 15,
    setup: starterPlan?.setup ?? `Set a simple gate around the intended start line and use ${club}. Keep the first reps slow enough to notice the face and strike.`,
    instructions: starterPlan?.instructions ?? [
      "Make five slow rehearsals while naming the target out loud.",
      "Hit 10 shots at 70 percent speed and hold the finish.",
      "After each shot, record whether contact and start line matched the intention.",
      "Stop if the same miss appears three times in a row and switch to the easier version.",
    ],
    attemptCount: 15,
    successTarget: starterPlan?.successTarget ?? "Complete at least 8 of 10 scored reps with the intended start line or contact feel.",
    scoring: {
      enabled: false,
      system: "Track successful reps and one feel note.",
      targetScore: null,
      stretchTarget: null,
    },
    feel: starterPlan?.feel ?? "Quiet face through impact, centered strike, and a finish you can hold.",
    commonMistake: "Swinging full speed before the feel is repeatable.",
    easierVersion: "Use half swings and a wider gate.",
    harderVersion: "Alternate targets every three balls while keeping the same feel.",
    resultRequest: {
      shouldRequest: true,
      reason: "A short manual result is enough to decide whether to repeat or progress.",
      preferredMethod: "manual",
    },
    resultFields: ["attempts", "successful_attempts", "club", "reflection"],
    nextStepLogic: "Progress to a challenge after the target is met twice or when uploaded data confirms the pattern improved.",
    confidence: sourceMode === "profile_fallback" ? 0.46 : coachConnection.connected ? 0.78 : 0.6,
    sourceMode,
    sourceSummary,
  }, "drill");
}

export function evaluatePracticeResult({ score, attempts, successfulAttempts, previousScore, notes } = {}) {
  const numericScore = score === "" || score === null || score === undefined ? null : number(score, null, { min: 0, max: 999 });
  const numericAttempts = attempts === "" || attempts === null || attempts === undefined ? null : number(attempts, null, { min: 0, max: 999 });
  const numericSuccesses = successfulAttempts === "" || successfulAttempts === null || successfulAttempts === undefined
    ? null
    : number(successfulAttempts, null, { min: 0, max: 999 });
  const previous = previousScore === "" || previousScore === null || previousScore === undefined ? null : number(previousScore, null, { min: 0, max: 999 });
  const hasNotes = Boolean(text(notes));
  const hasSuccessRate = numericAttempts !== null && numericAttempts > 0 && numericSuccesses !== null;
  const hasScore = numericScore !== null;

  if (!hasScore && !hasSuccessRate && !hasNotes) {
    return {
      progressStatus: "insufficient_data",
      evidence: ["No measured score, attempts, or reflection was submitted."],
      nextRecommendation: "Enter a score, successful attempts, or a short note so MAI Coach can choose the next step responsibly.",
    };
  }

  if (hasScore && previous !== null && numericScore > previous) {
    return {
      progressStatus: "improved",
      evidence: [`Score improved from ${previous} to ${numericScore}.`],
      nextRecommendation: "Repeat once more to confirm the improvement, then progress the target.",
    };
  }

  if (hasSuccessRate) {
    const rate = numericSuccesses / numericAttempts;
    if (rate >= 0.7) {
      return {
        progressStatus: "improved",
        evidence: [`${numericSuccesses} of ${numericAttempts} attempts met the target.`],
        nextRecommendation: "Progress the activity by tightening the window or adding target changes.",
      };
    }
    if (rate >= 0.45) {
      return {
        progressStatus: "maintained",
        evidence: [`${numericSuccesses} of ${numericAttempts} attempts met the target.`],
        nextRecommendation: "Repeat the same activity once more before making it harder.",
      };
    }
    return {
      progressStatus: "needs_more_work",
      evidence: [`${numericSuccesses} of ${numericAttempts} attempts met the target.`],
      nextRecommendation: "Use the easier version and slow the pace until the pattern stabilizes.",
    };
  }

  return {
    progressStatus: "insufficient_data",
    evidence: hasNotes ? ["Only a user reflection was submitted, so improvement is not claimed yet."] : ["Submitted result was not measurable."],
    nextRecommendation: "Keep the note, then add a score or upload a session result next time.",
  };
}

export function canAccessPracticeActivity(identity, activity, assignedMemberIds = []) {
  if (!identity || !activity) return false;
  if (identity.role === "admin") return true;
  if (identity.role === "member") return identity.id === activity.userId || identity.id === activity.user_id;
  const memberId = activity.userId || activity.user_id;
  return identity.role === "coach" && assignedMemberIds.includes(memberId);
}

export function isActivePracticeStatus(status) {
  return ACTIVE_PRACTICE_STATUSES.has(status);
}
