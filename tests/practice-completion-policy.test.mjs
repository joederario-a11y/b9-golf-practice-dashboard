import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPracticeProgress,
  coachReviewStatusForOutcome,
  evaluatePracticeOutcome,
  mapOutcomeToProgressStatus,
  nextActionVisibility,
  normalizePracticeAssignment,
} from "../lib/practice-completion-policy.mjs";

function shot(id, club, carry, offline, overrides = {}) {
  return {
    id,
    club,
    carry,
    offline,
    metricSources: {
      carry: { kind: "measured" },
      offline: { kind: "measured" },
    },
    ...overrides,
  };
}

const baseActivity = {
  activityType: "drill",
  attemptCount: 8,
  club: "7-Iron",
  durationMinutes: 18,
  focusArea: "7-Iron distance control",
  id: "practice-1",
  instructions: {
    coachConnection: { connected: false },
    sourceMode: "session_data",
    trainingAid: { aidId: "alignment-sticks", name: "Alignment sticks" },
  },
  reasonSelected: "Carry variation was the clearest opportunity.",
  status: "in_progress",
  title: "7-Iron Window Ladder",
  userId: "member-1",
};

test("normalizes existing practice activity as the canonical assignment", () => {
  const assignment = normalizePracticeAssignment(baseActivity);

  assert.equal(assignment.id, "practice-1");
  assert.equal(assignment.memberId, "member-1");
  assert.equal(assignment.source, "ai");
  assert.equal(assignment.assignedShotCount, 8);
  assert.equal(assignment.estimatedMinutes, 18);
});

test("shot, set, time, and member-confirmed progress labels stay explicit", () => {
  assert.equal(buildPracticeProgress({ activity: baseActivity, attempt: { completedShotCount: 5 } }).label, "5 of 8 shots completed");
  assert.equal(buildPracticeProgress({ activity: baseActivity, attempt: { completedSetCount: 2 } }).label, "2 sets completed");
  assert.equal(buildPracticeProgress({ activity: baseActivity, attempt: { completedMinutes: 12 } }).label, "12 of 18 minutes completed");
  assert.equal(buildPracticeProgress({ activity: baseActivity, attempt: { status: "completed" } }).sourceLabel, "Member recorded");
});

test("same-club measured session can produce an improved outcome without using other clubs", () => {
  const outcome = evaluatePracticeOutcome({
    activity: baseActivity,
    attempt: {
      completedAmount: "yes",
      completedShotCount: 8,
      memberConfidenceRating: 4,
      memberDifficultyRating: 0,
    },
    linkedSession: {
      id: "session-1",
      shots: [
        shot("1", "7-Iron", 150, 12),
        shot("2", "7-Iron", 162, -10),
        shot("3", "7-Iron", 148, 9),
        shot("4", "7-Iron", 160, -11),
        shot("5", "7-Iron", 153, 5),
        shot("6", "7-Iron", 154, -4),
        shot("7", "7-Iron", 152, 3),
        shot("8", "7-Iron", 155, -2),
        shot("driver", "Driver", 220, 35),
      ],
    },
  });

  assert.equal(outcome.classification, "improved");
  assert.equal(outcome.measurementSource, "measured_from_session_data");
  assert.equal(outcome.recommendedNextAction, "progress");
  assert.equal(mapOutcomeToProgressStatus(outcome), "improved");
  assert.ok(outcome.evidence.some((item) => item.source === "measured" && item.label === "Carry variation"));
});

test("coach wording with an alternate club option still matches the measured club", () => {
  const outcome = evaluatePracticeOutcome({
    activity: {
      ...baseActivity,
      club: "7-iron (or preferred mid-iron)",
    },
    attempt: {
      completedAmount: "yes",
      completedShotCount: 8,
      memberConfidenceRating: 4,
    },
    linkedSession: {
      id: "session-coach-club-wording",
      shots: [
        shot("1", "7-Iron", 150, 12),
        shot("2", "7-Iron", 162, -10),
        shot("3", "7-Iron", 148, 9),
        shot("4", "7-Iron", 160, -11),
        shot("5", "7-Iron", 153, 5),
        shot("6", "7-Iron", 154, -4),
        shot("7", "7-Iron", 152, 3),
        shot("8", "7-Iron", 155, -2),
      ],
    },
  });

  assert.equal(outcome.measurementSource, "measured_from_session_data");
  assert.equal(outcome.classification, "improved");
});

test("estimated metrics are not treated as measured evidence", () => {
  const estimated = { metricSources: { carry: { kind: "estimated" }, offline: { kind: "estimated" } } };
  const outcome = evaluatePracticeOutcome({
    activity: baseActivity,
    attempt: { completedAmount: "yes", completedShotCount: 8 },
    linkedSession: {
      id: "session-2",
      shots: Array.from({ length: 8 }, (_, index) => shot(String(index), "7-Iron", 150 + index, index - 4, estimated)),
    },
  });

  assert.equal(outcome.classification, "completed_without_measurement");
  assert.equal(outcome.measurementSource, "member_recorded");
  assert.equal(outcome.evidence.some((item) => item.source === "measured"), false);
});

test("small samples do not claim improvement", () => {
  const outcome = evaluatePracticeOutcome({
    activity: baseActivity,
    attempt: { completedAmount: "yes", completedShotCount: 3 },
    linkedSession: {
      id: "session-3",
      shots: [
        shot("1", "7-Iron", 160, 14),
        shot("2", "7-Iron", 150, -12),
        shot("3", "7-Iron", 154, 3),
      ],
    },
  });

  assert.equal(outcome.classification, "insufficient_data");
  assert.match(outcome.remainingOpportunity, /not enough valid same-club measured shots/i);
  assert.equal(outcome.recommendedNextAction, "repeat");
});

test("member-only completion is factual and does not fabricate improvement", () => {
  const outcome = evaluatePracticeOutcome({
    activity: baseActivity,
    attempt: {
      completedAmount: "yes",
      completedSetCount: 3,
      memberNotes: "It felt cleaner.",
    },
  });

  assert.equal(outcome.classification, "completed_without_measurement");
  assert.equal(outcome.measurementSource, "member_recorded");
  assert.doesNotMatch(outcome.biggestWin, /improved/i);
});

test("difficulty and training-aid friction recommend modify instead of progress", () => {
  const hard = evaluatePracticeOutcome({
    activity: baseActivity,
    attempt: {
      completedAmount: "yes",
      completedShotCount: 8,
      memberConfidenceRating: 1,
      memberDifficultyRating: 1,
      trainingAidHelpfulness: 1,
    },
  });

  assert.equal(hard.recommendedNextAction, "modify");
  assert.match(hard.recommendedReason, /adjusted/i);
});

test("coach-led outcomes remain pending until Coach review", () => {
  const coachedActivity = {
    ...baseActivity,
    coachId: "coach-1",
    instructions: {
      ...baseActivity.instructions,
      coachConnection: { connected: true, coachName: "Joey D" },
      sourceMode: "coach_feedback",
    },
  };
  const outcome = evaluatePracticeOutcome({
    activity: coachedActivity,
    attempt: { completedAmount: "yes", completedShotCount: 8 },
  });

  assert.equal(coachReviewStatusForOutcome(coachedActivity, outcome), "pending");
  assert.equal(nextActionVisibility(coachedActivity, outcome).memberVisible, false);
  assert.equal(nextActionVisibility(baseActivity, outcome).label, "AI-generated practice recommendation");
});

test("practice completion schema and API expose attempts, idempotency, and same-member session guards", () => {
  const platform = readFileSync(new URL("../lib/server/platform.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/server/practice-activities.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/practice/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/practice/[practiceAssignmentId]/page.tsx", import.meta.url), "utf8");

  assert.match(platform, /CREATE TABLE IF NOT EXISTS practice_attempts/);
  assert.match(platform, /practice_attempts_one_active_unique/);
  assert.match(platform, /practice_activity_results_one_per_attempt_unique/);
  assert.match(server, /Only this member's saved sessions can be attached/);
  assert.match(server, /recordPracticeAttemptActivityOnce/);
  assert.match(server, /coach_review_requested/);
  assert.match(api, /activityId/);
  assert.match(page, /Complete Practice/);
  assert.match(page, /Attach New Session/);
  assert.match(page, /Upload Session Photos/);
});
