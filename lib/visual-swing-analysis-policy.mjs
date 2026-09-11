export const VISUAL_ANALYSIS_VERSION = "mai-visual-swing-v2";
export const DEFAULT_VISUAL_ANALYSIS_MODEL = "gpt-4.1-mini";
export const MAX_AUTO_SWINGS_ANALYZED = 3;
export const MAX_FRAMES_PER_SWING = 12;
export const MAX_VISUAL_ANALYSIS_DURATION_SECONDS = 8 * 60;

export const VISUAL_ANALYSIS_STATUSES = [
  "not_requested",
  "queued",
  "detecting_swings",
  "extracting_frames",
  "analyzing_frames",
  "ready_for_coach_review",
  "ready_for_member",
  "needs_attention",
  "cancelled",
];

export const VISUAL_OBSERVATION_REVIEW_STATUSES = [
  "include_in_recap",
  "coach_only",
  "dismissed",
];

export const COACHING_INSTRUCTION_PRIORITY = [
  "coach_manual",
  "coach_audio",
  "coach_approved_ai_visual",
  "ai_visual",
  "generic_mai",
];

export const COACHING_EVIDENCE_PRIORITY = [
  "session_measured",
  "student_entered",
  "ai_visual",
  "coach_audio",
  "ai_inferred",
  "unknown",
];

export const PRACTICE_SOURCE_PRIORITY = [
  "active_coach_drill",
  "coach_approved_recap",
  "coach_approved_ai_visual",
  "session_measured",
  "self_guided_ai_visual",
  "generic_mai",
];

function rank(list, value) {
  const index = list.indexOf(value);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function role(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "member" || normalized === "user" || normalized === "student") return "member";
  if (normalized === "coach") return "coach";
  if (normalized === "admin") return "admin";
  return "";
}

function lower(value) {
  return text(value).toLowerCase();
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback = 0) {
  const number = finiteNumber(value, fallback);
  if (number === null) return fallback;
  return Math.max(0, Math.min(1, number));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEvidenceFrameIds(value) {
  return safeArray(value)
    .map((item) => text(item).slice(0, 120))
    .filter(Boolean)
    .slice(0, MAX_FRAMES_PER_SWING);
}

export function instructionPriority(source, approvedByCoach = false) {
  if (source === "ai_visual" && approvedByCoach) return rank(COACHING_INSTRUCTION_PRIORITY, "coach_approved_ai_visual");
  return rank(COACHING_INSTRUCTION_PRIORITY, source);
}

export function evidencePriority(source) {
  return rank(COACHING_EVIDENCE_PRIORITY, source);
}

export function sortInstructionalEvidence(items = []) {
  return [...items].sort((a, b) => {
    const byPriority = instructionPriority(a?.source, a?.approvedByCoach === true) - instructionPriority(b?.source, b?.approvedByCoach === true);
    if (byPriority) return byPriority;
    return new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime();
  });
}

export function sortEvidenceItems(items = []) {
  return [...items].sort((a, b) => {
    const byPriority = evidencePriority(a?.source) - evidencePriority(b?.source);
    if (byPriority) return byPriority;
    return clamp01(b?.confidence, 0) - clamp01(a?.confidence, 0);
  });
}

export function measuredMetricsRemainAuthoritative(measured = {}, visual = {}) {
  return {
    ...visual,
    ...measured,
  };
}

export function practiceSourcePriority(source) {
  return rank(PRACTICE_SOURCE_PRIORITY, source);
}

export function choosePracticeSource(sources = []) {
  return [...sources]
    .filter((source) => source && typeof source === "object")
    .sort((a, b) => practiceSourcePriority(a.source) - practiceSourcePriority(b.source))[0] ?? null;
}

export function shouldRequestVisualAnalysisProcessing(identity, requested, options = {}) {
  const userRole = role(identity?.role);
  return (userRole === "coach" || userRole === "admin") && requested === true;
}

export function canRequestVisualAnalysis(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  const userRole = role(identity.role);
  const memberId = video.memberId ?? video.member_id;
  const coachId = video.coachId ?? video.coach_id;
  if (userRole === "admin") return true;
  return userRole === "coach" && (coachId === identity.id || assignedMemberIds.includes(memberId));
}

export function canReviewVisualAnalysis(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  const userRole = role(identity.role);
  const memberId = video.memberId ?? video.member_id;
  const coachId = video.coachId ?? video.coach_id;
  if (userRole === "admin") return true;
  return userRole === "coach" && (coachId === identity.id || assignedMemberIds.includes(memberId));
}

export function canReadVisualAnalysis(identity, video, analysis, assignedMemberIds = []) {
  if (canReviewVisualAnalysis(identity, video, assignedMemberIds)) return true;
  const memberId = video?.memberId ?? video?.member_id;
  const publicationStatus = lower(video?.publicationStatus ?? video?.publication_status);
  const uploadStatus = lower(video?.uploadStatus ?? video?.upload_status);
  const status = analysis?.status;
  return role(identity?.role) === "member" &&
    identity?.id === memberId &&
    publicationStatus === "published" &&
    uploadStatus === "ready" &&
    (status === "ready_for_member" || Boolean(analysis?.selfGuidedVisible));
}

export function isEducationalOrSystemTestVideo(video = {}) {
  const type = lower(video.videoType ?? video.video_type ?? video.type);
  return type === "system_test" ||
    type === "system test" ||
    type === "educational" ||
    type === "system-test" ||
    type.includes("education");
}

export function visualAnalysisEligibility(video = {}, activeOrCurrentAnalysis = null) {
  if (!video) return { eligible: false, safeErrorCode: "video_missing", safeMessage: "Video not found." };
  const uploadStatus = lower(video.uploadStatus ?? video.upload_status);
  const publicationStatus = lower(video.publicationStatus ?? video.publication_status);
  const duration = finiteNumber(video.duration ?? video.duration_seconds, 0) ?? 0;
  const hasSource = Boolean(text(video.storagePath ?? video.storage_path ?? video.objectUrl) || text(video.sourceStoragePath ?? video.source_storage_path));
  const status = lower(activeOrCurrentAnalysis?.status);
  if (isEducationalOrSystemTestVideo(video)) {
    return { eligible: false, safeErrorCode: "excluded_video_type", safeMessage: "Educational and system-test videos are excluded from swing analysis." };
  }
  if (publicationStatus === "archived" || publicationStatus === "deleted") {
    return { eligible: false, safeErrorCode: "video_archived_or_deleted", safeMessage: "Archived or deleted videos cannot be analyzed." };
  }
  if (uploadStatus !== "ready") {
    return { eligible: false, safeErrorCode: "video_not_ready", safeMessage: "Finish uploading the video before starting swing analysis." };
  }
  if (!hasSource) {
    return { eligible: false, safeErrorCode: "video_source_missing", safeMessage: "The playable video source is missing." };
  }
  if (!duration || duration <= 0) {
    return { eligible: false, safeErrorCode: "duration_missing", safeMessage: "Video duration is required before swing analysis can run." };
  }
  if (duration > MAX_VISUAL_ANALYSIS_DURATION_SECONDS) {
    return { eligible: false, safeErrorCode: "duration_too_long", safeMessage: "Choose a shorter swing clip for visual analysis." };
  }
  if (["queued", "detecting_swings", "extracting_frames", "analyzing_frames"].includes(status)) {
    return { eligible: false, safeErrorCode: "analysis_already_processing", safeMessage: "MAI Coach is already analyzing this video." };
  }
  if (["ready_for_coach_review", "ready_for_member"].includes(status)) {
    return { eligible: false, safeErrorCode: "analysis_already_completed", safeMessage: "This video already has a current swing analysis." };
  }
  return { eligible: true, safeErrorCode: null, safeMessage: "" };
}

export function visualAnalysisInitialVisibility(identity, hasCoachRelationship) {
  return "ready_for_coach_review";
}

export function visualSwingFrameTimes(duration, start = 0, length = 3) {
  if (![duration, start, length].every(Number.isFinite) || duration <= 0 || start < 0 || start >= duration || length < 1 || length > 6) {
    throw new Error("Choose a swing start within the video and a length from 1 to 6 seconds.");
  }
  const end = Math.min(duration - 0.01, start + length);
  if (end - start < 0.5) throw new Error("Choose at least half a second of swing footage.");
  return Array.from({ length: MAX_FRAMES_PER_SWING }, (_, index) => start + (end - start) * index / (MAX_FRAMES_PER_SWING - 1));
}

export function validateVisualSwingFrames(value, duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("A valid video duration is required.");
  if (!Array.isArray(value) || value.length < 4 || value.length > MAX_FRAMES_PER_SWING) throw new Error("Provide 4 to 12 swing frames.");
  let previous = -1;
  return value.map((frame, index) => {
    const timestampSeconds = frame?.timestampSeconds;
    const base64 = frame?.base64;
    if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0 || timestampSeconds >= duration || timestampSeconds <= previous) throw new Error("Swing frames must be in video time order.");
    if (timestampSeconds - value[0].timestampSeconds > 6.01) throw new Error("Select a swing segment of no more than 6 seconds.");
    if (typeof base64 !== "string" || base64.length > 400000 || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("Provide JPEG swing frames smaller than 300 KB each.");
    previous = timestampSeconds;
    return { id: `frame-${index + 1}`, base64, contentType: "image/jpeg", timestampSeconds };
  });
}

export function sourceComparisonForObservation(observation = {}, coachContext = {}) {
  const comparison = lower(observation.sourceComparison);
  if (comparison) return comparison;
  const title = lower(observation.title);
  const explanation = lower(observation.explanation);
  const coachText = [
    coachContext.manualFeedback,
    coachContext.audioFeedback,
    coachContext.lessonSummary,
    coachContext.mainFocus,
  ].map(lower).filter(Boolean).join(" ");
  if (!coachText) return "directly_visible";
  if (title && coachText.includes(title)) return "matches_coach_feedback";
  if (explanation && explanation.split(/\s+/).some((word) => word.length > 5 && coachText.includes(word))) {
    return "matches_coach_feedback";
  }
  return "needs_coach_review";
}

export function defaultReviewStatusForObservation(observation = {}, coachLed = true) {
  if (!coachLed) return "include_in_recap";
  const comparison = lower(observation.sourceComparison);
  if (comparison.includes("conflict")) return "coach_only";
  return "coach_only";
}

export function normalizeVisualSwingAnalysis(value, context = {}) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const selectedSwingId = text(record.selectedSwingId) || "swing-1";
  const rawView = lower(record.view ?? record.cameraView);
  const view = ["face_on", "down_the_line", "front_three_quarter", "rear_three_quarter", "unknown"].includes(rawView)
    ? rawView
    : "unknown";
  const rawHandedness = lower(record.handedness);
  const handedness = ["right", "left", "unknown"].includes(rawHandedness) ? rawHandedness : "unknown";
  const confidence = clamp01(record.overallConfidence ?? record.confidence, context.fallbackConfidence ?? 0.35);
  const coachContext = context.coachContext ?? {};
  const coachLed = context.coachLed !== false;
  const normalizeFinding = (item, index, type) => {
    const sourceComparison = sourceComparisonForObservation(item, coachContext);
    const title = text(item?.title).slice(0, 120) || (type === "strength" ? "Visible strength" : `Observation ${index + 1}`);
    return {
      classification: text(item?.classification) || (type === "strength" ? "observed" : "likely_tendency"),
      confidence: clamp01(item?.confidence, confidence),
      evidenceFrameIds: normalizeEvidenceFrameIds(item?.evidenceFrameIds),
      explanation: text(item?.explanation).slice(0, 500),
      phase: text(item?.phase).slice(0, 80) || "visible swing",
      reviewStatus: text(item?.reviewStatus) || defaultReviewStatusForObservation({ ...item, sourceComparison }, coachLed),
      sourceComparison,
      title,
    };
  };
  const strengths = safeArray(record.strengths).slice(0, 2).map((item, index) => normalizeFinding(item, index, "strength"));
  const observations = safeArray(record.observations).slice(0, 3).map((item, index) => normalizeFinding(item, index, "observation"));
  const priority = record.priority && typeof record.priority === "object"
    ? normalizeFinding(record.priority, 0, "priority")
    : null;
  const drill = record.suggestedDrill && typeof record.suggestedDrill === "object"
    ? {
        goal: text(record.suggestedDrill.goal).slice(0, 240) || null,
        instructions: safeArray(record.suggestedDrill.instructions).map((item) => text(item).slice(0, 240)).filter(Boolean).slice(0, 4),
        title: text(record.suggestedDrill.title).slice(0, 120),
        why: text(record.suggestedDrill.why).slice(0, 400),
      }
    : null;

  return {
    club: text(record.club ?? context.club).slice(0, 80) || null,
    handedness,
    observations,
    overallConfidence: confidence,
    priority,
    selectedSwingId,
    strengths,
    suggestedDrill: drill?.title ? drill : null,
    unableToDetermine: safeArray(record.unableToDetermine).map((item) => text(item).slice(0, 180)).filter(Boolean).slice(0, 8),
    videoId: text(record.videoId ?? context.videoId).slice(0, 120),
    view,
  };
}

export function visibleVisualFindingsForMember(analysis = {}) {
  const structured = analysis.structuredResult ?? analysis;
  const strengths = safeArray(structured.strengths).filter((item) => item.reviewStatus === "include_in_recap");
  const observations = safeArray(structured.observations).filter((item) => item.reviewStatus === "include_in_recap");
  const priority = structured.priority?.reviewStatus === "include_in_recap" ? structured.priority : null;
  const suggestedDrill = structured.suggestedDrill?.reviewStatus === "include_in_recap" ? structured.suggestedDrill : null;
  return {
    ...structured,
    observations,
    priority,
    strengths,
    suggestedDrill,
  };
}
