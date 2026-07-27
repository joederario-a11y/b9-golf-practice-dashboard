import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCoachTrainingAidAction,
  buildChallengeTrainingAidRecommendation,
  buildTrainingAidRecommendation,
  detectSwingTendencies,
  visibleTrainingAidRecommendation,
} from "../lib/training-aid-policy.mjs";

const coachedConnectionContext = {
  coachFeedback: {
    coachName: "Joey D",
    summary: "Low point control is the priority. The player is hitting behind the ball.",
  },
  sourceMode: "coach_feedback",
};

test("coach-prescribed aid evidence outranks an unrelated AI suggestion", () => {
  const recommendation = buildTrainingAidRecommendation({
    activity: {
      focusArea: "Low-point control",
      sourceMode: "coach_feedback",
    },
    context: coachedConnectionContext,
    requestedTrainingAid: {
      aidId: "hanger-drill",
      approvalState: "draft",
      confidence: "moderate",
      source: "ai",
    },
  });

  assert.equal(recommendation.aidId, "towel-behind-ball");
  assert.equal(recommendation.source, "coach");
  assert.equal(recommendation.approvalState, "approved");
  assert.equal(visibleTrainingAidRecommendation(recommendation, { role: "member" })?.aidId, "towel-behind-ball");
});

test("supported swing tendencies map to the expected training aids", () => {
  const cases = [
    ["trail elbow is flying away from the body", "trail-armpit-towel"],
    ["heel contact showed up on the face tape", "contact-spray"],
    ["alignment and start line were inconsistent", "alignment-sticks"],
    ["lead wrist and face control need awareness", "hanger-drill"],
    ["early extension and hip depth were the issue", "chair-wall-drill"],
    ["balance breaks and the finish is unstable", "staggered-stance-balance"],
  ];

  for (const [summary, expectedAidId] of cases) {
    const recommendation = buildTrainingAidRecommendation({
      activity: { focusArea: summary, sourceMode: "coach_feedback" },
      context: { coachFeedback: { summary }, sourceMode: "coach_feedback" },
    });
    assert.equal(recommendation.aidId, expectedAidId, summary);
  }
});

test("independent member receives clearly labeled AI aid only when session evidence supports it", () => {
  const recommendation = buildTrainingAidRecommendation({
    activity: {
      focusArea: "Start-line variability",
      reasonSelected: "Measured shots missed the start line.",
      sourceMode: "session_data",
      title: "Start-Line Gate",
    },
    context: {
      latestAnalysis: {
        analysis: {
          summary: "Measured session analysis identified start-line variability.",
        },
      },
      sourceMode: "session_data",
    },
  });

  assert.equal(recommendation.aidId, "alignment-sticks");
  assert.equal(recommendation.source, "ai");
  assert.equal(recommendation.studentVisible, true);
  assert.equal(visibleTrainingAidRecommendation(recommendation, { role: "member" })?.source, "ai");
});

test("no specialized aid is returned when evidence is insufficient or unrelated", () => {
  const noAid = buildTrainingAidRecommendation({
    activity: {
      focusArea: "Club speed",
      reasonSelected: "Smash factor was low.",
      sourceMode: "session_data",
    },
    context: {
      latestAnalysis: {
        calculatedMetrics: { smashFactor: 1.31, ballSpeed: 117 },
      },
      sourceMode: "session_data",
    },
  });

  assert.equal(noAid.aidId, "none");
  assert.equal(noAid.name, "No training aid needed");
  assert.equal(visibleTrainingAidRecommendation(noAid, { role: "member" }), null);
});

test("low-confidence coached AI suggestions remain private for coach review", () => {
  const recommendation = buildTrainingAidRecommendation({
    activity: {
      focusArea: "Face control",
      reasonSelected: "Profile-only face-control drill.",
      sourceMode: "coach_feedback",
      title: "Face control drill",
    },
    context: {
      coachFeedback: {
        coachName: "Joey D",
        summary: "Practice calmly today.",
      },
      sourceMode: "coach_feedback",
    },
    requestedTrainingAid: {
      aidId: "hanger-drill",
      approvalState: "draft",
      confidence: "low",
      source: "ai",
    },
  });

  assert.equal(recommendation.studentVisible, false);
  assert.equal(visibleTrainingAidRecommendation(recommendation, { role: "member" }), null);
  assert.ok(visibleTrainingAidRecommendation(recommendation, { role: "coach" }));
});

test("coach can approve, modify, remove, and reject a training aid", () => {
  const draft = {
    aidId: "alignment-sticks",
    approvalState: "draft",
    confidence: "moderate",
    evidence: [],
    name: "Alignment sticks",
    noEquipmentAlternative: "Use a target line.",
    safetyNotes: [],
    setupSteps: ["Use lead/trail references."],
    source: "ai",
    studentVisible: false,
    whyItFits: "Start-line work.",
  };

  const approved = applyCoachTrainingAidAction(draft, "approve");
  assert.equal(approved.approvalState, "approved");
  assert.equal(approved.studentVisible, true);

  const modified = applyCoachTrainingAidAction(approved, "modify", { aidId: "contact-spray" });
  assert.equal(modified.aidId, "contact-spray");
  assert.equal(modified.approvalState, "modified");
  assert.equal(modified.source, "coach");

  const removed = applyCoachTrainingAidAction(modified, "remove");
  assert.equal(removed.approvalState, "removed");
  assert.equal(removed.aidId, "none");

  const rejected = applyCoachTrainingAidAction(draft, "reject");
  assert.equal(rejected.approvalState, "rejected");
  assert.equal(rejected.studentVisible, false);
});

test("coach edits persist after regeneration policy runs again", () => {
  const existingCoachEdit = applyCoachTrainingAidAction({
    aidId: "alignment-sticks",
    approvalState: "draft",
    confidence: "moderate",
    name: "Alignment sticks",
    source: "ai",
    studentVisible: false,
  }, "modify", { aidId: "contact-spray" });
  const recommendation = buildTrainingAidRecommendation({
    activity: { focusArea: "Low point", sourceMode: "coach_feedback" },
    context: coachedConnectionContext,
    existingTrainingAid: existingCoachEdit,
  });

  assert.equal(recommendation.aidId, "contact-spray");
  assert.equal(recommendation.approvalState, "modified");
  assert.equal(recommendation.source, "coach");
});

test("balance aid setup remains handedness-aware", () => {
  const recommendation = buildTrainingAidRecommendation({
    activity: { focusArea: "Balance", sourceMode: "coach_feedback" },
    context: { coachFeedback: { summary: "Balance breaks and the finish is unstable." }, sourceMode: "coach_feedback" },
  });
  const setup = recommendation.setupSteps.join(" ");

  assert.equal(recommendation.aidId, "staggered-stance-balance");
  assert.match(setup, /trail foot/);
  assert.doesNotMatch(setup, /\bright foot\b|\bleft foot\b/i);
});

test("detects supported evidence sources without using unsupported visual guesses", () => {
  const evidence = detectSwingTendencies({
    latestAnalysis: { calculatedMetrics: { carry: 150, smash: 1.31 } },
    sourceMode: "session_data",
  }, {
    focusArea: "Club speed",
    sourceMode: "session_data",
  });

  assert.equal(evidence.some((item) => item.tendency === "early_extension"), false);
  assert.equal(evidence.some((item) => item.tendency === "wrist_condition"), false);
});

test("challenge completion can surface a supported aid without changing scoring", () => {
  const recommendation = buildChallengeTrainingAidRecommendation({
    shotResults: [
      { status: "outside_target_window" },
      { status: "qualified" },
    ],
  });

  assert.equal(recommendation.aidId, "alignment-sticks");
  assert.match(recommendation.whyItFits, /Alignment|Start-line|target window/i);
});
