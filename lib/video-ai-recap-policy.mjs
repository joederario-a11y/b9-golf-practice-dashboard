export const VIDEO_RECAP_PROMPT_VERSION = "mai-video-recap-v1";
export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_VIDEO_RECAP_MODEL = "gpt-5.6-terra";
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
