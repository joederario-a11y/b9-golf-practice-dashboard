import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDefaultPracticeActivity,
  buildPracticeSourceSummary,
  canAccessPracticeActivity,
  evaluatePracticeResult,
  getPracticeSourceMode,
  isActivePracticeStatus,
  normalizePracticeActivityOutput,
} from "../lib/practice-activity-policy.mjs";

test("normalizes a strict generated drill without coach-private data", () => {
  const activity = normalizePracticeActivityOutput({
    activityType: "drill",
    title: "Face-Control Gate Drill",
    focusArea: "Face control",
    reasonSelected: "Zac's approved lesson recap called out face control.",
    coachConnection: {
      connected: true,
      coachName: "Zac Malone",
      summary: "Keep start line tighter with the driver.",
    },
    club: "Driver",
    equipment: ["Alignment stick"],
    durationMinutes: 15,
    setup: "Set a start-line gate.",
    instructions: ["Make five rehearsals.", "Hit ten scored shots."],
    attemptCount: 10,
    successTarget: "8 of 10 start inside the gate.",
    scoring: {
      enabled: false,
      system: "Track successful reps.",
      targetScore: null,
      stretchTarget: null,
    },
    feel: "Quiet face through impact.",
    commonMistake: "Full-speed swings too soon.",
    easierVersion: "Use half speed.",
    harderVersion: "Alternate targets.",
    resultRequest: {
      shouldRequest: true,
      reason: "The result controls the next progression.",
      preferredMethod: "manual",
    },
    resultFields: ["attempts", "successful_attempts"],
    nextStepLogic: "Progress after two successful attempts.",
    confidence: 0.8,
    sourceSummary: "Coach-approved lesson feedback and user data.",
  }, "drill");

  assert.equal(activity.activityType, "drill");
  assert.equal(activity.coachConnection.coachName, "Zac Malone");
  assert.equal(activity.resultRequest.preferredMethod, "manual");
});

test("fallback drill and challenge are different and challenge is measurable", () => {
  const drill = buildDefaultPracticeActivity({
    activityType: "drill",
    focusArea: "Face control",
    context: {
      player: { skillLevel: "mid-handicap" },
      coachFeedback: {
        coachName: "Zac Malone",
        recommendedDrill: "Start-line gate work",
      },
    },
  });
  const challenge = buildDefaultPracticeActivity({
    activityType: "challenge",
    focusArea: "Face control",
    context: {
      player: { skillLevel: "mid-handicap" },
      coachFeedback: {
        coachName: "Zac Malone",
        recommendedDrill: "Start-line gate work",
      },
    },
  });

  assert.equal(drill.activityType, "drill");
  assert.equal(challenge.activityType, "challenge");
  assert.equal(drill.scoring.enabled, false);
  assert.equal(challenge.scoring.enabled, true);
  assert.equal(challenge.resultRequest.preferredMethod, "score");
});

test("profile-only fallback is stable for the same seed and rotates with a different seed", () => {
  const context = {
    player: {
      goals: ["Wedge control", "Contact quality"],
      frustrations: ["Inconsistent contact"],
      path: "Beginner",
      skillLevel: "beginner",
    },
    seed: "member-1:profile-v1:2026-07-17",
  };
  const first = buildDefaultPracticeActivity({ activityType: "drill", focusArea: "Surprise me", context });
  const second = buildDefaultPracticeActivity({ activityType: "drill", focusArea: "Surprise me", context });
  const rotated = buildDefaultPracticeActivity({
    activityType: "drill",
    focusArea: "Surprise me",
    context: { ...context, seed: "member-1:profile-v1:2026-07-24" },
  });

  assert.equal(first.title, second.title);
  assert.equal(first.sourceMode, "profile_fallback");
  assert.match(first.sourceSummary, /Starter plan based on your golfer profile/);
  assert.notEqual(first.title, rotated.title);
});

test("practice source hierarchy prefers active coach feedback and merges session evidence", () => {
  const coachAndSession = {
    coachFeedback: {
      coachName: "Zac Malone",
      status: "active",
      summary: "Low point control is the priority.",
    },
    shotDataQuality: {
      confidence: "usable",
      shotCount: 14,
      clubCounts: [{ club: "7-Iron", shots: 14 }],
    },
  };

  assert.equal(getPracticeSourceMode(coachAndSession), "coach_and_session");
  assert.match(buildPracticeSourceSummary("coach_and_session", coachAndSession), /Zac Malone/);

  assert.equal(getPracticeSourceMode({
    ...coachAndSession,
    coachFeedback: { ...coachAndSession.coachFeedback, status: "resolved" },
  }), "session_data");
});

test("result evaluation never claims improvement without measurable evidence", () => {
  const reflectionOnly = evaluatePracticeResult({ notes: "It felt better." });
  assert.equal(reflectionOnly.progressStatus, "insufficient_data");
  assert.match(reflectionOnly.evidence[0], /Only a user reflection/);

  const improvedScore = evaluatePracticeResult({ score: 8, previousScore: 6 });
  assert.equal(improvedScore.progressStatus, "improved");
  assert.match(improvedScore.evidence[0], /6 to 8/);
});

test("practice authorization is member-owned and coach-assignment aware", () => {
  const activity = { userId: "joe" };
  assert.equal(canAccessPracticeActivity({ id: "joe", role: "member" }, activity), true);
  assert.equal(canAccessPracticeActivity({ id: "sam", role: "member" }, activity), false);
  assert.equal(canAccessPracticeActivity({ id: "admin", role: "admin" }, activity), true);
  assert.equal(canAccessPracticeActivity({ id: "zac", role: "coach" }, activity, ["joe"]), true);
  assert.equal(canAccessPracticeActivity({ id: "zac", role: "coach" }, activity, ["sam"]), false);
});

test("active practice statuses are limited to generated and in progress", () => {
  assert.equal(isActivePracticeStatus("generated"), true);
  assert.equal(isActivePracticeStatus("in_progress"), true);
  assert.equal(isActivePracticeStatus("results_submitted"), false);
  assert.equal(isActivePracticeStatus("superseded"), false);
});
