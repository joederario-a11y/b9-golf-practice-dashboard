import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canReadVisualAnalysis,
  canRequestVisualAnalysis,
  canReviewVisualAnalysis,
  choosePracticeSource,
  defaultReviewStatusForObservation,
  measuredMetricsRemainAuthoritative,
  normalizeVisualSwingAnalysis,
  shouldRequestVisualAnalysisProcessing,
  sortEvidenceItems,
  sortInstructionalEvidence,
  visibleVisualFindingsForMember,
  visualAnalysisEligibility,
  visualAnalysisInitialVisibility,
} from "../lib/visual-swing-analysis-policy.mjs";

test("coach manual feedback outranks audio and visual instructional sources", () => {
  const ordered = sortInstructionalEvidence([
    { source: "ai_visual", approvedByCoach: true, createdAt: "2026-07-03T00:00:00Z" },
    { source: "coach_audio", createdAt: "2026-07-02T00:00:00Z" },
    { source: "coach_manual", createdAt: "2026-07-01T00:00:00Z" },
    { source: "ai_visual", approvedByCoach: false, createdAt: "2026-07-04T00:00:00Z" },
  ]);

  assert.deepEqual(ordered.map((item) => item.source), [
    "coach_manual",
    "coach_audio",
    "ai_visual",
    "ai_visual",
  ]);
  assert.equal(ordered[2].approvedByCoach, true);
});

test("measured session data is authoritative evidence and cannot be overwritten by visual estimates", () => {
  const evidence = sortEvidenceItems([
    { source: "ai_visual", confidence: 0.94 },
    { source: "session_measured", confidence: 0.55 },
    { source: "ai_inferred", confidence: 1 },
  ]);

  assert.equal(evidence[0].source, "session_measured");
  assert.deepEqual(
    measuredMetricsRemainAuthoritative(
      { clubPath: -1.2, launch: 18.9 },
      { clubPath: 3.4, launch: 22, posture: "balanced" },
    ),
    { clubPath: -1.2, launch: 18.9, posture: "balanced" },
  );
});

test("coach-uploaded visual analysis remains private until coach approval", () => {
  const video = {
    coachId: "coach-1",
    memberId: "member-1",
    publicationStatus: "Published",
    uploadStatus: "ready",
    uploadedByRole: "coach",
  };
  const analysis = { status: "ready_for_coach_review" };

  assert.equal(canRequestVisualAnalysis({ id: "coach-1", role: "coach" }, video, ["member-1"]), true);
  assert.equal(canReviewVisualAnalysis({ id: "coach-1", role: "coach" }, video, ["member-1"]), true);
  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, video, analysis, []), false);
  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, video, { status: "ready_for_member" }, []), true);
});

test("member visual access requires a published ready parent lesson", () => {
  const baseVideo = {
    coachId: "coach-1",
    memberId: "member-1",
    publicationStatus: "Published",
    uploadStatus: "ready",
    uploadedByRole: "coach",
  };
  const analysis = { status: "ready_for_member" };

  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, baseVideo, analysis, []), true);
  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, { ...baseVideo, publicationStatus: "Archived" }, analysis, []), false);
  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, { ...baseVideo, publicationStatus: "Draft" }, analysis, []), false);
  assert.equal(canReadVisualAnalysis({ id: "member-1", role: "member" }, { ...baseVideo, uploadStatus: "pending" }, analysis, []), false);
});

test("self-guided member analysis is member-visible and defaults to included findings", () => {
  const video = {
    memberId: "member-1",
    uploadedByRole: "member",
  };

  assert.equal(shouldRequestVisualAnalysisProcessing({ role: "member" }, undefined), true);
  assert.equal(canRequestVisualAnalysis({ id: "member-1", role: "member" }, video, []), true);
  assert.equal(visualAnalysisInitialVisibility({ role: "member" }, false), "ready_for_member");
  assert.equal(defaultReviewStatusForObservation({}, false), "include_in_recap");
});

test("existing completed analyses and ineligible videos are excluded from new processing", () => {
  const readyVideo = {
    duration: 45,
    objectUrl: "https://example.test/video.mp4",
    publicationStatus: "Published",
    uploadStatus: "ready",
    videoType: "Lesson Recap",
  };

  assert.equal(visualAnalysisEligibility(readyVideo, null).eligible, true);
  assert.equal(visualAnalysisEligibility(readyVideo, { status: "analyzing_frames" }).safeErrorCode, "analysis_already_processing");
  assert.equal(visualAnalysisEligibility(readyVideo, { status: "ready_for_member" }).safeErrorCode, "analysis_already_completed");
  assert.equal(visualAnalysisEligibility({ ...readyVideo, videoType: "Educational" }, null).safeErrorCode, "excluded_video_type");
  assert.equal(visualAnalysisEligibility({ ...readyVideo, duration: 0 }, null).safeErrorCode, "duration_missing");
});

test("normalization limits visual findings and flags uncertain context", () => {
  const analysis = normalizeVisualSwingAnalysis({
    handedness: "not sure",
    observations: [
      { title: "Observation 1", confidence: 0.8 },
      { title: "Observation 2", confidence: 0.7 },
      { title: "Observation 3", confidence: 0.6 },
      { title: "Observation 4", confidence: 0.5 },
    ],
    strengths: [
      { title: "Strength 1", confidence: 0.8 },
      { title: "Strength 2", confidence: 0.7 },
      { title: "Strength 3", confidence: 0.6 },
    ],
    unableToDetermine: ["Handedness"],
    view: "side",
  }, { coachLed: true, videoId: "video-1" });

  assert.equal(analysis.handedness, "unknown");
  assert.equal(analysis.view, "unknown");
  assert.equal(analysis.observations.length, 3);
  assert.equal(analysis.strengths.length, 2);
  assert.equal(analysis.observations[0].reviewStatus, "coach_only");
  assert.deepEqual(analysis.unableToDetermine, ["Handedness"]);
});

test("only coach-approved visual findings are visible in coached member recap", () => {
  const visible = visibleVisualFindingsForMember({
    structuredResult: {
      observations: [
        { title: "Include", reviewStatus: "include_in_recap" },
        { title: "Private", reviewStatus: "coach_only" },
      ],
      priority: { title: "Dismissed", reviewStatus: "dismissed" },
      strengths: [{ title: "Strength", reviewStatus: "include_in_recap" }],
    },
  });

  assert.deepEqual(visible.observations.map((item) => item.title), ["Include"]);
  assert.equal(visible.priority, null);
  assert.deepEqual(visible.strengths.map((item) => item.title), ["Strength"]);
});

test("active coach drill outranks visual and generic practice sources", () => {
  const selected = choosePracticeSource([
    { source: "self_guided_ai_visual", title: "AI drill" },
    { source: "active_coach_drill", title: "Coach drill" },
    { source: "session_measured", title: "Session drill" },
  ]);

  assert.equal(selected.title, "Coach drill");
});

test("server pipeline preserves video upload while retrying visual analysis only", async () => {
  const source = await readFile(new URL("../lib/server/video-visual-analysis.ts", import.meta.url), "utf8");

  assert.match(source, /processPendingVideoVisualAnalysisAfterUpload/);
  assert.match(source, /thumbnail_storage_path/);
  assert.match(source, /representative_frame_unavailable/);
  assert.match(source, /media_hash = \?/);
  assert.match(source, /action === "retry"/);
});

test("visual publication requires a valid published parent lesson and archive retires member delivery", async () => {
  const visualSource = await readFile(new URL("../lib/server/video-visual-analysis.ts", import.meta.url), "utf8");
  const videoRouteSource = await readFile(new URL("../app/api/videos/route.ts", import.meta.url), "utf8");

  assert.match(visualSource, /video\.upload_status !== "ready" \|\| video\.publication_status !== "Published"/);
  assert.match(visualSource, /retireMemberVisibleVisualAnalysisForLesson/);
  assert.match(visualSource, /status = 'ready_for_coach_review'/);
  assert.match(visualSource, /published_to_member_at = NULL/);
  assert.match(videoRouteSource, /retireMemberVisibleVisualAnalysisForLesson/);
  assert.match(videoRouteSource, /publicationStatus !== "Published"/);
});
