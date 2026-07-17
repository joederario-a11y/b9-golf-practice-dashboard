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
  assert.equal(canReviewVideoRecap({ id: "coach-1", role: "coach" }, video, []), true);
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
  assert.equal(draft.lessonSummary, "Not specified by coach");
  assert.equal(draft.confidence, 1);
  assert.deepEqual(draft.metricsMentioned, [{ metric: "club path", source: "transcript", value: "not supplied" }]);
  assert.equal(draft.nextSessionGoal, "Not specified by coach");
});

test("structured recap schema requires publishable lesson fields", () => {
  assert.equal(lessonRecapJsonSchema.additionalProperties, false);
  assert.ok(lessonRecapJsonSchema.required.includes("lessonSummary"));
  assert.ok(lessonRecapJsonSchema.required.includes("nextSessionGoal"));
  assert.ok(lessonRecapJsonSchema.required.includes("needsCoachInput"));
});
