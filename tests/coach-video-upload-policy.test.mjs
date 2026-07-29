import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canStartCoachLessonUpload,
  canAttachCoachSessionData,
  chooseLessonVideoCompressionPlan,
  coachLessonMaiAssistanceSummary,
  coachLessonUploadMode,
  coachVideoDeliveryStatusLabel,
  COACH_LESSON_UPLOAD_FACTS,
  coachLessonUploadStatusLabel,
  filterCoachUploadMembers,
  formatLessonUploadFileSize,
  getCoachDashboardActionState,
  LESSON_VIDEO_AUDIO_PRESERVATION_ERROR,
  LESSON_VIDEO_WEBM_AUDIO_COMPATIBILITY_ERROR,
  shouldPrepareLessonVideoAudioSidecar,
  shouldPrepareLessonVideoCompression,
  shouldShowLessonUploadStallWarning,
  studentFollowUpCanSubmit,
  validateLessonVideoAudioPreservation,
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

test("coach lesson upload mode separates first upload from returning quick upload", () => {
  assert.equal(coachLessonUploadMode({ hasUploadedLesson: false }), "guided");
  assert.equal(coachLessonUploadMode({ hasUploadedLesson: true }), "quick");
});

test("MAI assistance summary stays plain-language and only lists selected support", () => {
  assert.equal(coachLessonMaiAssistanceSummary({ audio: true, visual: true, practice: true, sessionData: false }), "audio, swing review, and practice suggestion");
  assert.equal(coachLessonMaiAssistanceSummary({ audio: false, visual: false, practice: false, sessionData: false }), "Off");
  assert.equal(coachLessonMaiAssistanceSummary({ audio: true, sessionData: true }), "audio and session data");
});

test("student follow-up requires the assigned Student, a published lesson, and content", () => {
  assert.equal(studentFollowUpCanSubmit({ isStudent: true, isPublished: true, note: "I tried the drill." }), true);
  assert.equal(studentFollowUpCanSubmit({ isStudent: true, isPublished: true, hasVideo: true }), true);
  assert.equal(studentFollowUpCanSubmit({ isStudent: true, isPublished: true, hasSessionData: true }), true);
  assert.equal(studentFollowUpCanSubmit({ isStudent: false, isPublished: true, note: "Coach text" }), false);
  assert.equal(studentFollowUpCanSubmit({ isStudent: true, isPublished: false, note: "Draft" }), false);
  assert.equal(studentFollowUpCanSubmit({ isStudent: true, isPublished: true, note: "" }), false);
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

test("coach lesson upload source includes guided first upload and returning quick upload paths", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /Send your first lesson/);
  assert.match(pageSource, /Who is this lesson for\?/);
  assert.match(pageSource, /Add the lesson video/);
  assert.match(pageSource, /Would you like MAI Coach to help prepare the lesson\?/);
  assert.match(pageSource, /Yes — Prepare a Draft for Me/);
  assert.match(pageSource, /No — I’ll Add the Feedback Myself/);
  assert.match(pageSource, /You remain in control of everything the Student sees\./);
  assert.match(pageSource, /Customize MAI Assistance/);
  assert.match(pageSource, /Use Guided Upload/);
  assert.match(pageSource, /MAI Assistance: On/);
  assert.match(pageSource, /Upload Lesson/);
  assert.match(pageSource, /Review Lesson/);
  assert.match(pageSource, /Upload Another Lesson/);
  assert.match(pageSource, /Return to Coach Dashboard/);
});

test("student lesson follow-up is member-only and connected to the lesson activity stream", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const videoApiSource = await readFile(new URL("../app/api/videos/route.ts", import.meta.url), "utf8");
  assert.match(pageSource, /Send Follow-Up to Coach/);
  assert.match(pageSource, /Send an update to \$\{coachName\}/);
  assert.match(pageSource, /sendStudentLessonFollowUp/);
  assert.match(videoApiSource, /studentFollowUp/);
  assert.match(videoApiSource, /identity\.role !== "member"/);
  assert.match(videoApiSource, /video\.publication_status !== "Published"/);
  assert.match(videoApiSource, /student_follow_up_sent/);
  assert.match(videoApiSource, /targetUserId: video\.coach_id/);
});

test("coach upload status labels are plain language and never raw technical codes", () => {
  assert.equal(coachLessonUploadStatusLabel("preparing_video"), "Preparing video");
  assert.equal(coachLessonUploadStatusLabel("compressing_video"), "Preparing video");
  assert.equal(coachLessonUploadStatusLabel("compression_failed"), "Compression failed");
  assert.equal(coachLessonUploadStatusLabel("preparing_audio"), "Preparing audio");
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

test("large common phone videos prepare a private audio sidecar for transcription", () => {
  assert.equal(shouldPrepareLessonVideoAudioSidecar({
    fileSize: 178 * 1024 * 1024,
    hasAudio: true,
    mimeType: "video/quicktime",
  }), true);
  assert.equal(shouldPrepareLessonVideoAudioSidecar({
    fileSize: 178 * 1024 * 1024,
    hasAudio: null,
    mimeType: "video/quicktime",
  }), true);
  assert.equal(shouldPrepareLessonVideoAudioSidecar({
    fileSize: 178 * 1024 * 1024,
    hasAudio: false,
    mimeType: "video/quicktime",
  }), false);
  assert.equal(shouldPrepareLessonVideoAudioSidecar({
    fileSize: 20 * 1024 * 1024,
    hasAudio: true,
    mimeType: "video/mp4",
  }), false);
  assert.equal(shouldPrepareLessonVideoAudioSidecar({
    fileSize: 178 * 1024 * 1024,
    hasAudio: true,
    mimeType: "video/webm",
  }), false);
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
  assert.match(pageSource, /video\/webm;codecs=vp9,opus/);
  assert.match(pageSource, /video\/mp4;codecs=avc1\.42E01E,mp4a\.40\.2/);
  assert.match(pageSource, /lessonVideoOutputFileName/);
  assert.match(pageSource, /validatePreparedLessonVideo/);
  assert.match(pageSource, /validateLessonVideoAudioPreservation/);
  assert.match(pageSource, /captureVideoElementStream/);
  assert.match(pageSource, /getAudioTracks/);
  assert.match(pageSource, /createMediaStreamDestination/);
  assert.match(pageSource, /LESSON_VIDEO_AUDIO_PRESERVATION_ERROR/);
  assert.match(pageSource, /video\.muted = false/);
  assert.match(pageSource, /waitForVideoFrameData/);
  assert.match(pageSource, /canvas\.captureStream\(30\)/);
  assert.match(pageSource, /Development upload diagnostics/);
  assert.match(pageSource, /Video preparation timed out/);
  assert.match(pageSource, /Optimization provided little size reduction\. You can retry compression or upload the original video\./);
  assert.match(pageSource, /The optimized video could not be verified\. You can retry compression or upload the original video\./);
});

test("coach lesson upload preserves the selected source video for storage and transcription", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /const shouldCompressVideo = false/);
  assert.match(pageSource, /Original video will be uploaded unchanged so lesson audio is preserved for playback and transcription\./);
  assert.match(pageSource, /forceOriginal: options\.skipCompression \|\| !shouldCompressVideo/);
  assert.match(pageSource, /prepareLessonAudioSidecarForUpload/);
  assert.match(pageSource, /"transcription-audio"/);
  assert.match(pageSource, /uploadVideoAsset\(\s*pendingVideoId,\s*audioSidecar,\s*"transcription-audio"/);
  assert.match(pageSource, /Original video will still upload unchanged for playback/);
});

test("large coach lesson uploads use multipart chunks without creating another lesson record", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /LESSON_VIDEO_MULTIPART_UPLOAD_THRESHOLD_BYTES = 50 \* 1024 \* 1024/);
  assert.match(pageSource, /multipart=init/);
  assert.match(pageSource, /multipart=part/);
  assert.match(pageSource, /multipart=complete/);
  assert.match(pageSource, /multipart=abort/);
  assert.match(pageSource, /file\.slice\(offset, end\)/);
  assert.match(pageSource, /uploadMultipartVideoAsset\(videoId, file, onProgress, signal\)/);
  assert.doesNotMatch(pageSource, /createVideoRecord\(metadata, uploadFile\)[\s\S]+createVideoRecord\(metadata, uploadFile\)/);
});

test("failed lesson retry can prepare private audio from the stored playable video", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /prepareLessonAudioSidecarFromSource/);
  assert.match(pageSource, /shouldPrepareStoredLessonAudioSidecar\(video\)/);
  assert.match(pageSource, /asset: VideoUploadAsset/);
  assert.match(pageSource, /action: "processExistingAudio"/);
  assert.match(pageSource, /Audio summary was added to the Coach Feedback fields/);
});

test("server accepts private transcription audio without replacing the source video", async () => {
  const routeSource = await readFile(new URL("../app/api/videos/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /parseVideoUploadAsset/);
  assert.match(routeSource, /transcription-audio/);
  assert.match(routeSource, /handleTranscriptionAudioUpload/);
  assert.match(routeSource, /video-processing\/\$\{values\.video\.id\}\/audio\/source-sidecar/);
  assert.match(routeSource, /current_step = 'audio_sidecar_uploaded'/);
  assert.match(routeSource, /finalizeStoredVideoUpload/);
});

test("lesson video audio preservation rejects silent optimized output when source had audio", () => {
  assert.equal(validateLessonVideoAudioPreservation({
    outputContainer: "mp4",
    outputHasAudio: false,
    sourceHasAudio: true,
  }), LESSON_VIDEO_AUDIO_PRESERVATION_ERROR);
  assert.equal(validateLessonVideoAudioPreservation({
    outputContainer: "mp4",
    outputHasAudio: null,
    sourceHasAudio: true,
  }), LESSON_VIDEO_AUDIO_PRESERVATION_ERROR);
});

test("lesson video audio preservation allows video-only sources and original fallback", () => {
  assert.equal(validateLessonVideoAudioPreservation({
    outputContainer: "mp4",
    outputHasAudio: false,
    sourceHasAudio: false,
  }), "");
  assert.equal(validateLessonVideoAudioPreservation({
    outputContainer: "original",
    outputHasAudio: true,
    sourceHasAudio: true,
  }), "");
});

test("lesson video audio preservation blocks WebM optimized lessons for member compatibility", () => {
  assert.equal(validateLessonVideoAudioPreservation({
    outputContainer: "webm",
    outputHasAudio: true,
    sourceHasAudio: true,
  }), LESSON_VIDEO_WEBM_AUDIO_COMPATIBILITY_ERROR);
});

test("member lesson player exposes controls and does not default to permanently muted", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /function LessonVideoPlayer/);
  assert.match(pageSource, /controls/);
  assert.match(pageSource, /event\.currentTarget\.muted = false/);
  assert.match(pageSource, /This video is muted\./);
  assert.doesNotMatch(pageSource, /<LessonVideoPlayer[^>]+muted/);
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
    now: 31000,
  }), true);
  assert.equal(shouldShowLessonUploadStallWarning({
    saveState: "saving",
    stage: "uploading",
    lastProgressAt: 1000,
    now: 27000,
  }), false);
  assert.equal(shouldShowLessonUploadStallWarning({
    saveState: "saving",
    stage: "upload_complete",
    lastProgressAt: 1000,
    now: 27000,
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
