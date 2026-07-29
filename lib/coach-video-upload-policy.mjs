export function normalizeCoachUploadSearch(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function filterCoachUploadMembers(members, search) {
  const normalizedSearch = normalizeCoachUploadSearch(search);
  return [...(Array.isArray(members) ? members : [])]
    .filter((member) => {
      if ((member.accountStatus ?? "active") === "inactive") return false;
      if (!normalizedSearch) return true;
      return [member.name, member.email].some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedSearch),
      );
    })
    .sort((a, b) => {
      const lastNameCompare = String(a.lastName ?? "").localeCompare(String(b.lastName ?? ""));
      if (lastNameCompare) return lastNameCompare;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export function canStartCoachLessonUpload(values) {
  return Boolean(
    values?.authenticated &&
      values?.memberId &&
      values?.hasVideo &&
      values?.saveState !== "saving",
  );
}

export function getCoachDashboardActionState(values = {}) {
  const hasMembers = Boolean(values.hasMembers);
  const authenticated = Boolean(values.authenticated);
  return {
    canAddMember: authenticated,
    canUseMemberTools: Boolean(authenticated && hasMembers && values.selectedMemberId),
    canOpenUpload: Boolean(authenticated && hasMembers),
    showCompactAddMember: hasMembers,
    showMemberTools: hasMembers,
    showPrimaryAddMember: !hasMembers,
    showUploadLessonVideo: hasMembers,
    showDevDemoPlayer: Boolean(values.devAuthEnabled && !hasMembers),
  };
}

export function coachLessonUploadStatusLabel(status) {
  if (status === "preparing_video") return "Preparing video";
  if (status === "compressing_video") return "Preparing video";
  if (status === "compression_complete") return "Preparing video";
  if (status === "compression_failed") return "Compression failed";
  if (status === "preparing_audio") return "Preparing audio";
  if (status === "uploading") return "Uploading video";
  if (status === "upload_complete") return "Upload complete";
  if (status === "upload_failed") return "Upload failed";
  if (status === "queued") return "Processing video";
  if (status === "processing_audio") return "Processing video";
  if (status === "extracting_audio") return "Processing video";
  if (status === "creating_transcript") return "Creating transcript";
  if (status === "transcribing") return "Processing video";
  if (status === "transcribing_coach_feedback") return "Processing video";
  if (status === "generating_recap") return "Creating lesson recap";
  if (status === "importing_session_data") return "Importing session data";
  if (status === "ready_for_review") return "Ready for review";
  if (status === "published") return "Published to member";
  if (status === "failed") return "Needs attention";
  if (status === "no_usable_audio") return "Needs attention";
  if (status === "ready") return "Ready for review";
  return "Needs attention";
}

export const LESSON_VIDEO_COMPRESSION_MIN_BYTES = 50 * 1024 * 1024;
export const LESSON_VIDEO_LARGE_FILE_BYTES = 150 * 1024 * 1024;
export const LESSON_VIDEO_LONG_DURATION_SECONDS = 10 * 60;
export const LESSON_VIDEO_COMPRESSION_MAX_BYTES = 500 * 1024 * 1024;
export const LESSON_VIDEO_COMPRESSION_TIMEOUT_MS = 10 * 60 * 1000;
export const LESSON_VIDEO_AUDIO_SIDECAR_MIN_BYTES = 100 * 1024 * 1024;
export const LESSON_VIDEO_AUDIO_PRESERVATION_ERROR = "We could not preserve this video’s audio during optimization.";
export const LESSON_VIDEO_WEBM_AUDIO_COMPATIBILITY_ERROR = "This browser can only optimize this lesson as WebM, which may not play audio reliably for every member.";

export function shouldPrepareLessonVideoCompression(values = {}) {
  const fileSize = Number(values.fileSize ?? 0);
  const width = Number(values.width ?? 0);
  const height = Number(values.height ?? 0);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  return Boolean(
    fileSize > LESSON_VIDEO_COMPRESSION_MIN_BYTES ||
      shortEdge > 1080 ||
      longEdge > 1920,
  );
}

export function chooseLessonVideoCompressionPlan(values = {}) {
  const fileSize = Number(values.fileSize ?? 0);
  const duration = Number(values.duration ?? 0);
  const width = Number(values.width ?? 0);
  const height = Number(values.height ?? 0);
  const deviceMemory = Number(values.deviceMemory ?? 0);
  const lowMemoryLargeFile = Number.isFinite(deviceMemory) &&
    deviceMemory > 0 &&
    deviceMemory <= 2 &&
    fileSize >= LESSON_VIDEO_LARGE_FILE_BYTES;
  const exceedsBrowserCompressionLimit = fileSize > LESSON_VIDEO_COMPRESSION_MAX_BYTES;
  const use720p =
    fileSize >= LESSON_VIDEO_LARGE_FILE_BYTES ||
    duration >= LESSON_VIDEO_LONG_DURATION_SECONDS;
  const maxShortEdge = use720p ? 720 : 1080;
  const maxLongEdge = use720p ? 1280 : 1920;
  const videoBitsPerSecond = use720p ? 2_500_000 : 3_800_000;
  const audioBitsPerSecond = use720p ? 96_000 : 128_000;
  const shouldCompress = shouldPrepareLessonVideoCompression({ fileSize, width, height }) &&
    !exceedsBrowserCompressionLimit &&
    !lowMemoryLargeFile;
  return {
    audioBitsPerSecond,
    maxLongEdge,
    maxShortEdge,
    safeMaxBytes: LESSON_VIDEO_COMPRESSION_MAX_BYTES,
    shouldCompress,
    skipReason: exceedsBrowserCompressionLimit
      ? "File exceeds the safe browser compression size."
      : lowMemoryLargeFile
        ? "Large video on a low-memory device."
        : "",
    targetLabel: use720p ? "720p" : "1080p",
    timeoutMs: LESSON_VIDEO_COMPRESSION_TIMEOUT_MS,
    videoBitsPerSecond,
  };
}

export function validateLessonVideoAudioPreservation(values = {}) {
  const sourceHasAudio = values.sourceHasAudio;
  const outputHasAudio = values.outputHasAudio;
  const outputContainer = String(values.outputContainer ?? "").toLowerCase();

  if (sourceHasAudio === true && outputHasAudio !== true) {
    return LESSON_VIDEO_AUDIO_PRESERVATION_ERROR;
  }
  if (sourceHasAudio === true && outputContainer === "webm") {
    return LESSON_VIDEO_WEBM_AUDIO_COMPATIBILITY_ERROR;
  }
  return "";
}

export function shouldPrepareLessonVideoAudioSidecar(values = {}) {
  const fileSize = Number(values.fileSize ?? 0);
  const mimeType = String(values.mimeType ?? "").toLowerCase();
  const hasAudio = values.hasAudio !== false;
  const canBrowserDecodeCommonPhoneVideo =
    mimeType.includes("quicktime") ||
    mimeType.includes("mp4") ||
    mimeType.includes("m4v");
  return Boolean(
    hasAudio &&
      canBrowserDecodeCommonPhoneVideo &&
      Number.isFinite(fileSize) &&
      fileSize > LESSON_VIDEO_AUDIO_SIDECAR_MIN_BYTES,
  );
}

export const COACH_LESSON_UPLOAD_FACTS = [
  "Smash factor is ball speed divided by club speed, so centered contact often beats extra effort.",
  "Launch angle and spin work together; one number rarely tells the whole carry-distance story.",
  "A tight side-carry pattern can matter more than one perfect distance number.",
  "Club path helps explain start line and curvature when paired with face angle.",
  "A lesson recap is most useful when the video and measured session data point at the same priority.",
  "Consistent practice notes make the next session easier to compare against the last one.",
];

export function formatLessonUploadFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "NA";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const display = Number.isInteger(size) || size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1);
  return `${display} ${units[index]}`;
}

export function coachVideoDeliveryStatusLabel(video = {}) {
  const uploadStatus = String(video.uploadStatus ?? "").toLowerCase();
  const publicationStatus = String(video.publicationStatus ?? "").toLowerCase();
  const reviewStatus = String(video.status ?? "").toLowerCase();
  if (uploadStatus && uploadStatus !== "ready") return "Uploading";
  if (reviewStatus.includes("attention") || reviewStatus.includes("failed")) return "Needs attention";
  if (publicationStatus === "published") return "Published to member";
  return "Ready for review";
}

export function coachLessonUploadMode(values = {}) {
  return values.hasUploadedLesson ? "quick" : "guided";
}

export function coachLessonMaiAssistanceSummary(values = {}) {
  const selected = [];
  if (values.audio) selected.push("audio");
  if (values.visual) selected.push("swing review");
  if (values.practice) selected.push("practice suggestion");
  if (values.sessionData) selected.push("session data");
  if (!selected.length) return "Off";
  if (selected.length === 1) return selected[0];
  if (selected.length === 2) return `${selected[0]} and ${selected[1]}`;
  return `${selected.slice(0, -1).join(", ")}, and ${selected.at(-1)}`;
}

export function studentFollowUpCanSubmit(values = {}) {
  return Boolean(
    values.isStudent &&
      values.isPublished &&
      (
        String(values.note ?? "").trim() ||
        values.hasVideo ||
        values.hasSessionData
      ),
  );
}

export function canUploadFromMemberVideoLibrary(values = {}) {
  const role = String(values.viewerRole ?? "").toLowerCase();
  return Boolean(values.authenticated && (role === "admin" || role === "coach"));
}

export function shouldAutoNotifyOnLibraryPublish(values = {}) {
  const role = String(values.viewerRole ?? "").toLowerCase();
  if (role === "admin") return false;
  const publicationStatus = String(values.currentPublicationStatus ?? "").toLowerCase();
  const emailStatus = String(values.emailStatus ?? "").toLowerCase();
  return publicationStatus !== "published" || emailStatus !== "sent";
}

export function shouldShowLessonUploadStallWarning(values = {}) {
  const isUploading = values.saveState === "saving" && values.stage === "uploading";
  const lastProgressAt = Number(values.lastProgressAt);
  const now = Number(values.now ?? Date.now());
  const thresholdMs = Number(values.thresholdMs ?? 30000);
  return Boolean(isUploading && Number.isFinite(lastProgressAt) && now - lastProgressAt >= thresholdMs);
}

export function canAttachCoachSessionData(values = {}) {
  if (values.mode === "none") return true;
  if (values.mode === "existing") return Boolean(values.selectedSessionId);
  if (values.mode === "upload") return Number(values.fileCount ?? 0) > 0;
  return false;
}
