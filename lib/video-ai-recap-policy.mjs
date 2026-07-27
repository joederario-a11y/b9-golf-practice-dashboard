export const VIDEO_RECAP_PROMPT_VERSION = "mai-video-recap-v1";
export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_VIDEO_RECAP_MODEL = "gpt-4.1-mini";
export const VIDEO_RECAP_PROCESSING_TYPE = "lesson_recap_voiceover";
export const VIDEO_RECAP_MIN_TRANSCRIPT_CHARS = 40;
export const ACTIVE_VIDEO_RECAP_JOB_STATUSES = new Set([
  "queued",
  "extracting_audio",
  "transcribing",
  "generating_recap",
]);
export const PUBLISHABLE_VIDEO_RECAP_DRAFT_STATUSES = new Set([
  "ready_for_review",
  "needs_coach_input",
]);

export const transcriptPromptVocabulary = [
  "club path",
  "face angle",
  "face-to-path",
  "attack angle",
  "smash factor",
  "ball speed",
  "club speed",
  "launch angle",
  "spin rate",
  "carry",
  "dispersion",
  "heel",
  "toe",
  "thin",
  "fat",
  "draw",
  "fade",
  "slice",
  "hook",
  "headcover drill",
  "alignment stick",
  "backswing",
  "downswing",
  "impact",
  "follow-through",
];

export const lessonRecapJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "lessonSummary",
    "mainFocus",
    "progressObserved",
    "practiceNext",
    "nextSessionGoal",
    "confidence",
    "needsCoachInput",
  ],
  properties: {
    lessonSummary: { type: "string" },
    mainFocus: { type: "string" },
    progressObserved: { type: "string" },
    practiceNext: { type: "string" },
    nextSessionGoal: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needsCoachInput: { type: "boolean" },
  },
};

export function canReviewVideoRecap(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  if (identity.role === "admin") return true;
  return identity.role === "coach" && assignedMemberIds.includes(video.memberId);
}

export function canReadApprovedVideoRecap(identity, video, assignedMemberIds = []) {
  if (canReviewVideoRecap(identity, video, assignedMemberIds)) return true;
  return identity?.role === "member" && identity.id === video?.memberId && video?.publicationStatus === "Published";
}

export function shouldRequestVideoRecapProcessing(identity, requested) {
  return (identity?.role === "coach" || identity?.role === "admin") && requested !== false;
}

function firstNameFromDisplayName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.split(/\s+/).filter(Boolean)[0] || "Member";
}

export function buildLessonPublishConfirmation(values) {
  const memberName = typeof values?.memberName === "string" && values.memberName.trim()
    ? values.memberName.trim()
    : "the member";
  const memberFirstName = firstNameFromDisplayName(memberName);
  const lessonTitle = typeof values?.lessonTitle === "string" && values.lessonTitle.trim()
    ? values.lessonTitle.trim()
    : "Lesson video";
  const hasRecap = values?.includedRecap === true;
  const hasSessionData = values?.includedSessionData === true;
  const title = hasRecap ? `Lesson sent to ${memberFirstName}` : `Video sent to ${memberFirstName}`;
  const body = hasRecap
    ? `${memberFirstName} can now view the video, your feedback, and the assigned practice from their account.`
    : `The lesson video was published to ${memberName} without Coach feedback. ${memberFirstName} can now watch it from their account.`;
  return {
    body,
    includedLabel: hasRecap ? "Video, Coach feedback, approved MAI observations, and assigned practice" : "Video only",
    lessonTitle,
    memberFirstName,
    memberName,
    sessionIncludedLabel: hasSessionData ? "Session data included" : "No session data attached",
    statusLabel: `Published to ${memberName}`,
    title,
  };
}

export function canSubmitLessonPublish(values) {
  if (values?.isSubmitting) return false;
  if (values?.draftStatus === "published") return false;
  return Boolean(values?.hasDraft) && PUBLISHABLE_VIDEO_RECAP_DRAFT_STATUSES.has(values?.draftStatus);
}

export function transcriptLooksUsable(transcriptText) {
  const text = typeof transcriptText === "string" ? transcriptText.trim() : "";
  if (text.length < VIDEO_RECAP_MIN_TRANSCRIPT_CHARS) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount >= 8;
}

export function emptyCoachInputDraft() {
  return {
    lessonSummary: "",
    workedOn: "",
    keyIssue: "",
    improvement: "",
    practiceAssignment: "",
    recommendedDrill: "",
    memberFacingNotes: "",
    nextSessionGoal: "",
    progressObserved: [],
    metricsMentioned: [],
    transcriptEvidence: [],
    confidence: 0,
    needsCoachInput: true,
  };
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function combineText(...values) {
  const unique = [];
  for (const value of values) {
    const next = text(value);
    if (next && !unique.includes(next)) unique.push(next);
  }
  return unique.join("\n\n");
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function normalizeLessonRecapDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyCoachInputDraft();
  }
  const record = value;
  const mainFocus = text(record.mainFocus) || combineText(record.workedOn, record.keyIssue);
  const progressObservedText = text(record.progressObserved) || text(record.improvement);
  const practiceNext = text(record.practiceNext) || combineText(record.practiceAssignment, record.recommendedDrill);
  const metricsMentioned = Array.isArray(record.metricsMentioned)
    ? record.metricsMentioned.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      return [{
        metric: text(item.metric),
        value: text(item.value),
        source: text(item.source) === "linked_session" ? "linked_session" : "transcript",
      }];
    }).filter((item) => item.metric && item.value)
    : [];
  const transcriptEvidence = Array.isArray(record.transcriptEvidence)
    ? record.transcriptEvidence.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const timestamp = text(item.timestamp);
      return [{
        excerpt: text(item.excerpt),
        field: text(item.field),
        ...(timestamp ? { timestamp } : { timestamp: null }),
      }];
    }).filter((item) => item.field && item.excerpt)
    : [];

  return {
    lessonSummary: text(record.lessonSummary),
    workedOn: mainFocus,
    keyIssue: text(record.mainFocus) ? "" : text(record.keyIssue),
    improvement: progressObservedText,
    practiceAssignment: practiceNext,
    recommendedDrill: text(record.practiceNext) ? "" : text(record.recommendedDrill),
    memberFacingNotes: "",
    nextSessionGoal: text(record.nextSessionGoal),
    progressObserved: stringArray(Array.isArray(record.progressObserved) ? record.progressObserved : progressObservedText ? [progressObservedText] : []),
    metricsMentioned,
    transcriptEvidence,
    confidence: clampConfidence(record.confidence),
    needsCoachInput: Boolean(record.needsCoachInput),
  };
}

export function buildTranscriptionPrompt() {
  return `Golf lesson voiceover. Preserve golf coaching language and recognize terms such as: ${transcriptPromptVocabulary.join(", ")}.`;
}

export function buildLessonRecapInput(context) {
  return [
    "Create coach-editable draft lesson recap fields from the transcript and supplied app context.",
    "The coach transcript is the primary source of truth.",
    "Do not invent progress, diagnoses, drills, or numerical metrics.",
    "Use linked session data only if it belongs to the same member.",
    "Return exactly: lessonSummary, mainFocus, progressObserved, practiceNext, nextSessionGoal, confidence, needsCoachInput.",
    "When absent, return an empty string for that field.",
    "If the transcript is too short, unclear, silent, or unrelated to golf coaching, set needsCoachInput=true and avoid filling misleading fields.",
    "Do not include coach-private notes or member-facing note fields.",
    "",
    JSON.stringify(context),
  ].join("\n");
}
