import assert from "node:assert/strict";
import test from "node:test";

import {
  canShowVideoInLibrary,
  lessonProcessingProgress,
  lessonProcessingStatus,
  lessonProcessingSteps,
  transcriptProof,
  videoLibraryVisibleCount,
} from "../lib/video-processing-status-policy.mjs";

const ownerId = "member-liam";

test("legacy insufficient-speech errors do not look stuck extracting audio", () => {
  for (const job of [
    { status: "failed", currentStep: "failed", errorCode: "processing_failed", errorMessage: "MAI Coach could not detect enough coach voiceover in this video." },
    { status: "no_usable_audio", currentStep: "no_usable_audio_detected", errorCode: "transcript_empty" },
  ]) {
    const input = { job, video: { uploadStatus: "ready" } };
    assert.equal(lessonProcessingStatus(input).safeFailureCode, "no_usable_audio");
    assert.equal(lessonProcessingSteps(input).find(step => step.key === "audio").state, "done");
    assert.doesNotMatch(lessonProcessingProgress(input).currentLabel, /Extracting audio/);
  }
});

test("coach-facing libraries show assigned draft and pending processing videos", () => {
  const video = {
    ownerId,
    publicationStatus: "Draft",
    uploadStatus: "pending",
    visibility: "Admin only",
  };

  assert.equal(canShowVideoInLibrary(video, ownerId, "coach"), true);
  assert.equal(canShowVideoInLibrary(video, ownerId, "admin"), true);
  assert.equal(canShowVideoInLibrary(video, ownerId, "user"), false);
});

test("library counts use the same visibility policy as video cards", () => {
  const videos = [
    { ownerId, publicationStatus: "Draft", uploadStatus: "pending", visibility: "Admin only" },
    { ownerId: "other-member", publicationStatus: "Published", uploadStatus: "ready", visibility: "Coach + User" },
  ];

  assert.equal(videoLibraryVisibleCount(videos, ownerId, "coach"), 1);
  assert.equal(videoLibraryVisibleCount(videos, ownerId, "user"), 0);
});

test("pending upload with waiting job does not claim video was uploaded", () => {
  const status = lessonProcessingStatus({
    job: { status: "queued", currentStep: "waiting_for_video_upload", updatedAt: "2026-07-24T10:46:00Z" },
    video: { ownerId, uploadStatus: "pending", updatedAt: "2026-07-24T10:46:00Z" },
  });

  assert.equal(status.code, "uploading");
  assert.equal(status.title, "Video upload is still completing");
  assert.match(status.explanation, /not confirmed/);
});

test("stored queued video shows uploaded then waits for processing", () => {
  const status = lessonProcessingStatus({
    job: { status: "queued", currentStep: "queued_for_transcription", updatedAt: "2026-07-24T10:48:00Z" },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  });
  const steps = lessonProcessingSteps({
    job: { status: "queued", currentStep: "queued_for_transcription", updatedAt: "2026-07-24T10:48:00Z" },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  });

  assert.equal(status.code, "queued");
  assert.equal(status.title, "Video uploaded");
  assert.equal(status.explanation, "Your lesson is waiting to be processed.");
  assert.deepEqual(steps.map((step) => [step.key, step.state]), [
    ["video", "done"],
    ["audio", "active"],
    ["transcript", "pending"],
    ["recap", "pending"],
  ]);
  assert.deepEqual(lessonProcessingProgress({
    job: { status: "queued", currentStep: "queued_for_transcription", updatedAt: "2026-07-24T10:48:00Z" },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  }), {
    completedCount: 1,
    currentLabel: "Extracting audio",
    percent: 25,
    state: "active",
    stepNumber: 2,
    totalSteps: 4,
  });
});

test("unrequested audio analysis does not look stuck on extraction", () => {
  const status = lessonProcessingStatus({
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-08-09T16:12:00Z" },
  });
  const progress = lessonProcessingProgress({
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-08-09T16:12:00Z" },
  });

  assert.equal(status.code, "stored");
  assert.equal(status.title, "Video uploaded");
  assert.equal(progress.percent, 0);
  assert.equal(progress.currentLabel, "Audio analysis not started");
  assert.equal(progress.state, "pending");
});

test("transcript proof appears before recap draft completion", () => {
  const status = lessonProcessingStatus({
    job: { status: "transcribing", currentStep: "transcription_completed", updatedAt: "2026-07-24T10:52:00Z" },
    transcript: {
      createdAt: "2026-07-24T10:52:00Z",
      text: "Keep the face stable and rehearse the takeaway before speed work.",
    },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  });
  const steps = lessonProcessingSteps({
    job: { status: "transcribing", currentStep: "transcription_completed", updatedAt: "2026-07-24T10:52:00Z" },
    transcript: { text: "Keep the face stable and rehearse the takeaway before speed work." },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  });

  assert.equal(status.title, "Transcript created");
  assert.equal(steps.find((step) => step.key === "transcript")?.state, "done");
  assert.equal(steps.find((step) => step.key === "recap")?.state, "pending");
  assert.equal(lessonProcessingProgress({
    job: { status: "transcribing", currentStep: "transcription_completed", updatedAt: "2026-07-24T10:52:00Z" },
    transcript: { text: "Keep the face stable and rehearse the takeaway before speed work." },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  }).percent, 75);
  assert.match(transcriptProof({ durationSeconds: 131, text: "Keep the face stable and rehearse the takeaway before speed work." }), /11 words captured from 2:11/);
});

test("failed transcription can be retried without changing upload visibility", () => {
  const status = lessonProcessingStatus({
    job: {
      errorCode: "transcription_request_failed",
      status: "failed",
      currentStep: "transcribing_coach_feedback",
      updatedAt: "2026-07-24T10:58:00Z",
    },
    video: { ownerId, uploadStatus: "ready", updatedAt: "2026-07-24T10:47:00Z" },
  });
  const steps = lessonProcessingSteps({
    job: {
      errorCode: "transcription_request_failed",
      status: "failed",
      currentStep: "transcribing_coach_feedback",
    },
    video: { ownerId, uploadStatus: "ready" },
  });

  assert.equal(status.code, "needs_attention");
  assert.equal(status.safeFailureCode, "transcription_request_failed");
  assert.equal(steps.find((step) => step.key === "transcript")?.state, "attention");
  assert.equal(canShowVideoInLibrary({ ownerId, publicationStatus: "Draft", uploadStatus: "ready", visibility: "Admin only" }, ownerId, "coach"), true);
});

test("reviewable draft outranks stale failed processing attempts", () => {
  const status = lessonProcessingStatus({
    draft: {
      status: "ready_for_review",
      updatedAt: "2026-07-29T23:51:39Z",
    },
    job: {
      errorCode: "transcription_failed",
      status: "failed",
      currentStep: "failed",
      updatedAt: "2026-07-29T23:27:36Z",
    },
    transcript: {
      createdAt: "2026-07-29T23:51:35Z",
      text: "Coach reviewed the student's motion and gave clear next steps for head stability through impact.",
    },
    video: { ownerId, uploadStatus: "ready" },
  });

  assert.equal(status.code, "ready_for_review");
  assert.equal(status.title, "Lesson recap ready");
  assert.equal(status.safeFailureCode, null);
});

test("audio-stage failures explain retry without another upload", () => {
  const status = lessonProcessingStatus({
    job: {
      errorCode: "cloudflare_normalization_failed",
      status: "failed",
      currentStep: "extracting_audio",
    },
    video: { ownerId, uploadStatus: "ready" },
  });

  assert.equal(status.title, "Audio processing needs attention");
  assert.match(status.explanation, /Retry processing without uploading it again/);
  assert.equal(status.safeFailureCode, "cloudflare_normalization_failed");
});
