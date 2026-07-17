import assert from "node:assert/strict";
import test from "node:test";

import {
  canReadApprovedVideoRecap,
  canReviewVideoRecap,
  lessonRecapJsonSchema,
  normalizeLessonRecapDraft,
  shouldRequestVideoRecapProcessing,
  transcriptLooksUsable,
} from "../lib/video-ai-recap-policy.mjs";

test("coach and admin can request video recap processing but members cannot", () => {
  assert.equal(shouldRequestVideoRecapProcessing({ role: "coach" }, undefined), true);
  assert.equal(shouldRequestVideoRecapProcessing({ role: "admin" }, true), true);
  assert.equal(shouldRequestVideoRecapProcessing({ role: "coach" }, false), false);
  assert.equal(shouldRequestVideoRecapProcessing({ role: "member" }, true), false);
});

test("recap review is limited to assigned coaches and admins", () => {
  const video = { coachId: "coach-1", memberId: "member-1" };
  assert.equal(canReviewVideoRecap({ id: "admin-1", role: "admin" }, video), true);
  assert.equal(canReviewVideoRecap({ id: "coach-1", role: "coach" }, video, []), false);
  assert.equal(canReviewVideoRecap({ id: "coach-1", role: "coach" }, video, ["member-1"]), true);
  assert.equal(canReviewVideoRecap({ id: "coach-2", role: "coach" }, video, ["member-1"]), true);
  assert.equal(canReviewVideoRecap({ id: "coach-3", role: "coach" }, video, []), false);
  assert.equal(canReviewVideoRecap({ id: "member-1", role: "member" }, video, []), false);
});

test("members can read only approved recap data on published videos", () => {
  assert.equal(
    canReadApprovedVideoRecap(
      { id: "member-1", role: "member" },
      { coachId: "coach-1", memberId: "member-1", publicationStatus: "Published" },
      [],
    ),
    true,
  );
  assert.equal(
    canReadApprovedVideoRecap(
      { id: "member-1", role: "member" },
      { coachId: "coach-1", memberId: "member-1", publicationStatus: "Draft" },
      [],
    ),
    false,
  );
  assert.equal(
    canReadApprovedVideoRecap(
      { id: "member-2", role: "member" },
      { coachId: "coach-1", memberId: "member-1", publicationStatus: "Published" },
      [],
    ),
    false,
  );
});

test("short or silent transcripts are treated as needing coach input", () => {
  assert.equal(transcriptLooksUsable(""), false);
  assert.equal(transcriptLooksUsable("Nice swing."), false);
  assert.equal(transcriptLooksUsable("We worked on club path, face angle, and a slower takeaway for better contact."), true);
});

test("draft normalization never invents missing coach feedback", () => {
  const draft = normalizeLessonRecapDraft({
    confidence: 1.4,
    lessonSummary: "",
    metricsMentioned: [{ metric: "club path", source: "model guess", value: "not supplied" }],
  });
  assert.equal(draft.lessonSummary, "");
  assert.equal(draft.confidence, 1);
  assert.deepEqual(draft.metricsMentioned, [{ metric: "club path", source: "transcript", value: "not supplied" }]);
  assert.equal(draft.nextSessionGoal, "");
});

test("structured recap schema requires only the simplified member-facing lesson fields", () => {
  assert.equal(lessonRecapJsonSchema.additionalProperties, false);
  assert.deepEqual(lessonRecapJsonSchema.required, [
    "lessonSummary",
    "mainFocus",
    "progressObserved",
    "practiceNext",
    "nextSessionGoal",
    "confidence",
    "needsCoachInput",
  ]);
  assert.equal(lessonRecapJsonSchema.properties.workedOn, undefined);
  assert.equal(lessonRecapJsonSchema.properties.keyIssue, undefined);
  assert.equal(lessonRecapJsonSchema.properties.memberFacingNotes, undefined);
});

test("draft normalization preserves absent timestamps instead of inventing them", () => {
  const draft = normalizeLessonRecapDraft({
    transcriptEvidence: [
      { excerpt: "Work the club path left of target.", field: "keyIssue" },
      { excerpt: "Start at two minutes.", field: "practiceAssignment", timestamp: "00:02:00" },
    ],
  });
  assert.deepEqual(draft.transcriptEvidence, [
    { excerpt: "Work the club path left of target.", field: "keyIssue", timestamp: null },
    { excerpt: "Start at two minutes.", field: "practiceAssignment", timestamp: "00:02:00" },
  ]);
});

test("simplified recap fields map back to current database-compatible fields", () => {
  const draft = normalizeLessonRecapDraft({
    confidence: 0.72,
    lessonSummary: "Worked on setup and takeaway.",
    mainFocus: "Keep the club from rolling inside.",
    progressObserved: "Contact moved closer to the center of the face.",
    practiceNext: "Three sets of headcover takeaway drills.",
    nextSessionGoal: "Check start line with the 7 iron.",
    needsCoachInput: false,
  });
  assert.equal(draft.lessonSummary, "Worked on setup and takeaway.");
  assert.equal(draft.workedOn, "Keep the club from rolling inside.");
  assert.equal(draft.keyIssue, "");
  assert.equal(draft.improvement, "Contact moved closer to the center of the face.");
  assert.equal(draft.practiceAssignment, "Three sets of headcover takeaway drills.");
  assert.equal(draft.recommendedDrill, "");
  assert.equal(draft.memberFacingNotes, "");
  assert.equal(draft.nextSessionGoal, "Check start line with the 7 iron.");
  assert.deepEqual(draft.progressObserved, ["Contact moved closer to the center of the face."]);
});

test("legacy recap fields remain readable in the simplified shape", () => {
  const draft = normalizeLessonRecapDraft({
    workedOn: "Takeaway structure",
    keyIssue: "Club rolling inside",
    improvement: "Start line tightened",
    practiceAssignment: "Twenty half-speed swings",
    recommendedDrill: "Headcover outside the hands drill",
  });
  assert.equal(draft.workedOn, "Takeaway structure\n\nClub rolling inside");
  assert.equal(draft.keyIssue, "Club rolling inside");
  assert.equal(draft.improvement, "Start line tightened");
  assert.equal(draft.practiceAssignment, "Twenty half-speed swings\n\nHeadcover outside the hands drill");
  assert.equal(draft.recommendedDrill, "Headcover outside the hands drill");
});
