import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canStartCoachLessonUpload,
  canAttachCoachSessionData,
  chooseLessonVideoCompressionPlan,
  coachVideoDeliveryStatusLabel,
  COACH_LESSON_UPLOAD_FACTS,
  coachLessonUploadStatusLabel,
  filterCoachUploadMembers,
  formatLessonUploadFileSize,
  getCoachDashboardActionState,
  shouldPrepareLessonVideoCompression,
  shouldShowLessonUploadStallWarning,
} from "../lib/coach-video-upload-policy.mjs";

const members = [
  { id: "3", name: "Zane Reed", firstName: "Zane", lastName: "Reed", email: "zane@example.com" },
  { id: "1", name: "Aubryn Hill", firstName: "Aubryn", lastName: "Hill", email: "aubryn@example.com" },
  { id: "2", name: "Jack Johnson", firstName: "Jack", lastName: "Johnson", email: "jack.johnson@example.com" },
  { id: "4", name: "Inactive Player", firstName: "Inactive", lastName: "Player", email: "inactive@example.com", accountStatus: "inactive" },
];

test("coach upload member search matches name and email and sorts alphabetically", () => {
  assert.deepEqual(filterCoachUploadMembers(members, "").map((member) => member.name), [
    "Aubryn Hill",
    "Jack Johnson",
    "Zane Reed",
  ]);
  assert.deepEqual(filterCoachUploadMembers(members, "jack").map((member) => member.email), [
    "jack.johnson@example.com",
  ]);
  assert.deepEqual(filterCoachUploadMembers(members, "aubryn@example.com").map((member) => member.name), [
    "Aubryn Hill",
  ]);
});

test("coach upload requires an authenticated coach member selection and a selected video", () => {
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: true, saveState: "idle" }), true);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "", hasVideo: true, saveState: "idle" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: false, saveState: "idle" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: true, saveState: "saving" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: false, memberId: "member-1", hasVideo: true, saveState: "idle" }), false);
});

test("zero-member coach dashboard shows one primary Add Member path and no upload CTA", () => {
  assert.deepEqual(getCoachDashboardActionState({
    authenticated: true,
    devAuthEnabled: false,
    hasMembers: false,
    selectedMemberId: "",
  }), {
    canAddMember: true,
    canOpenUpload: false,
    canUseMemberTools: false,
    showCompactAddMember: false,
    showDevDemoPlayer: false,
    showMemberTools: false,
    showPrimaryAddMember: true,
    showUploadLessonVideo: false,
  });
});

test("coach dashboard with members exposes one compact add action and one upload entry", () => {
  assert.deepEqual(getCoachDashboardActionState({
    authenticated: true,
    devAuthEnabled: true,
    hasMembers: true,
    selectedMemberId: "member-1",
  }), {
    canAddMember: true,
    canOpenUpload: true,
    canUseMemberTools: true,
    showCompactAddMember: true,
    showDevDemoPlayer: false,
    showMemberTools: true,
    showPrimaryAddMember: false,
    showUploadLessonVideo: true,
  });
});

test("member-dependent coach tools stay visible but disabled until a member is selected", () => {
  const state = getCoachDashboardActionState({
    authenticated: true,
    hasMembers: true,
    selectedMemberId: "",
  });
  assert.equal(state.showMemberTools, true);
  assert.equal(state.canUseMemberTools, false);
});

test("coach dashboard source keeps profile photo controls in the rail and out of the middle dashboard", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal(pageSource.includes("<section className=\"coach-profile-photo-card\">"), false);
  assert.equal(pageSource.includes("<span>{viewerRole === \"admin\" ? \"Admin tools\""), false);
  assert.match(pageSource, /className=\{cls\("rail-account-status", accountMode\)\}/);
  assert.match(pageSource, /handleOwnProfilePhoto/);
  assert.match(pageSource, /removeOwnProfilePhoto/);
});

test("coach dashboard source has a single first-member card and upload panel opens from the upload CTA", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /coach-first-member-card/);
  assert.match(pageSource, /setShowUploadPanel\(true\)/);
  assert.match(pageSource, /shouldRenderUploadPanel/);
});

test("coach upload status labels are plain language and never raw technical codes", () => {
  assert.equal(coachLessonUploadStatusLabel("preparing_video"), "Preparing video");
  assert.equal(coachLessonUploadStatusLabel("compressing_video"), "Preparing video");
  assert.equal(coachLessonUploadStatusLabel("compression_failed"), "Compression failed");
  assert.equal(coachLessonUploadStatusLabel("uploading"), "Uploading video");
  assert.equal(coachLessonUploadStatusLabel("upload_complete"), "Upload complete");
  assert.equal(coachLessonUploadStatusLabel("upload_failed"), "Upload failed");
  assert.equal(coachLessonUploadStatusLabel("processing_audio"), "Processing video");
  assert.equal(coachLessonUploadStatusLabel("extracting_audio"), "Processing video");
  assert.equal(coachLessonUploadStatusLabel("creating_transcript"), "Creating transcript");
  assert.equal(coachLessonUploadStatusLabel("transcribing_coach_feedback"), "Processing video");
  assert.equal(coachLessonUploadStatusLabel("generating_recap"), "Creating lesson recap");
  assert.equal(coachLessonUploadStatusLabel("importing_session_data"), "Importing session data");
  assert.equal(coachLessonUploadStatusLabel("ready_for_review"), "Ready for review");
  assert.equal(coachLessonUploadStatusLabel("failed"), "Needs attention");
});

test("coach lesson upload source exposes browser video compression and recovery controls", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /prepareLessonVideoForUpload/);
  assert.match(pageSource, /MediaRecorder/);
  assert.match(pageSource, /AbortController/);
  assert.match(pageSource, /Cancel compression/);
  assert.match(pageSource, /Cancel upload/);
  assert.match(pageSource, /Upload original file/);
  assert.match(pageSource, /compression_failed/);
  assert.match(pageSource, /MP4 browser compression unavailable/);
  assert.match(pageSource, /Video preparation timed out/);
  assert.doesNotMatch(pageSource, /video\/webm;codecs/);
});

test("lesson video compression starts for large files or footage above 1080p", () => {
  assert.equal(shouldPrepareLessonVideoCompression({
    fileSize: 49 * 1024 * 1024,
    height: 1080,
    width: 1920,
  }), false);
  assert.equal(shouldPrepareLessonVideoCompression({
    fileSize: 178 * 1024 * 1024,
    height: 1080,
    width: 1920,
  }), true);
  assert.equal(shouldPrepareLessonVideoCompression({
    fileSize: 20 * 1024 * 1024,
    height: 2160,
    width: 3840,
  }), true);
});

test("lesson video compression plan uses 1080p normally and 720p for especially large or long clips", () => {
  assert.deepEqual(chooseLessonVideoCompressionPlan({
    duration: 300,
    fileSize: 80 * 1024 * 1024,
    height: 2160,
    width: 3840,
  }), {
    audioBitsPerSecond: 128000,
    maxLongEdge: 1920,
    maxShortEdge: 1080,
    safeMaxBytes: 524288000,
    shouldCompress: true,
    skipReason: "",
    targetLabel: "1080p",
    timeoutMs: 600000,
    videoBitsPerSecond: 3800000,
  });
  assert.deepEqual(chooseLessonVideoCompressionPlan({
    duration: 300,
    fileSize: 178 * 1024 * 1024,
    height: 2160,
    width: 3840,
  }), {
    audioBitsPerSecond: 96000,
    maxLongEdge: 1280,
    maxShortEdge: 720,
    safeMaxBytes: 524288000,
    shouldCompress: true,
    skipReason: "",
    targetLabel: "720p",
    timeoutMs: 600000,
    videoBitsPerSecond: 2500000,
  });
  assert.equal(chooseLessonVideoCompressionPlan({
    duration: 660,
    fileSize: 80 * 1024 * 1024,
    height: 1080,
    width: 1920,
  }).targetLabel, "720p");
  assert.equal(chooseLessonVideoCompressionPlan({
    duration: 300,
    fileSize: 600 * 1024 * 1024,
    height: 2160,
    width: 3840,
  }).shouldCompress, false);
  assert.equal(chooseLessonVideoCompressionPlan({
    deviceMemory: 2,
    duration: 300,
    fileSize: 178 * 1024 * 1024,
    height: 2160,
    width: 3840,
  }).skipReason, "Large video on a low-memory device.");
});

test("coach upload facts are local curated facts, not generated status replacements", () => {
  assert.ok(COACH_LESSON_UPLOAD_FACTS.length >= 5);
  assert.ok(COACH_LESSON_UPLOAD_FACTS.every((fact) => typeof fact === "string" && fact.length > 24));
});

test("lesson upload file sizes are shown in readable units", () => {
  assert.equal(formatLessonUploadFileSize(0), "NA");
  assert.equal(formatLessonUploadFileSize(1024), "1 KB");
  assert.equal(formatLessonUploadFileSize(2.5 * 1024 * 1024), "2.5 MB");
});

test("coach upload stall warning only appears during an inactive file transfer", () => {
  assert.equal(shouldShowLessonUploadStallWarning({
    saveState: "saving",
    stage: "uploading",
    lastProgressAt: 1000,
    now: 27000,
    thresholdMs: 25000,
  }), true);
  assert.equal(shouldShowLessonUploadStallWarning({
    saveState: "saving",
    stage: "upload_complete",
    lastProgressAt: 1000,
    now: 27000,
    thresholdMs: 25000,
  }), false);
});

test("coach session data attachment validates the selected option", () => {
  assert.equal(canAttachCoachSessionData({ mode: "none" }), true);
  assert.equal(canAttachCoachSessionData({ mode: "existing", selectedSessionId: "" }), false);
  assert.equal(canAttachCoachSessionData({ mode: "existing", selectedSessionId: "session-1" }), true);
  assert.equal(canAttachCoachSessionData({ mode: "upload", fileCount: 0 }), false);
  assert.equal(canAttachCoachSessionData({ mode: "upload", fileCount: 2 }), true);
});

test("coach upload delivery status derives from persistent video fields", () => {
  assert.equal(coachVideoDeliveryStatusLabel({ uploadStatus: "pending", publicationStatus: "Draft" }), "Uploading");
  assert.equal(coachVideoDeliveryStatusLabel({ uploadStatus: "ready", publicationStatus: "Draft" }), "Ready for review");
  assert.equal(coachVideoDeliveryStatusLabel({ uploadStatus: "ready", publicationStatus: "Published" }), "Published to member");
  assert.equal(coachVideoDeliveryStatusLabel({ uploadStatus: "ready", status: "Needs Attention" }), "Needs attention");
});
