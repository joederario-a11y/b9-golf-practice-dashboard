export const VIDEO_RECAP_PROMPT_VERSION = "mai-video-recap-v1";
export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_VIDEO_RECAP_MODEL = "gpt-5.6-terra";
export const VIDEO_RECAP_PROCESSING_TYPE = "lesson_recap_voiceover";
export const VIDEO_RECAP_MIN_TRANSCRIPT_CHARS = 40;

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
    "workedOn",
    "keyIssue",
    "improvement",
    "practiceAssignment",
    "recommendedDrill",
    "memberFacingNotes",
    "nextSessionGoal",
    "progressObserved",
    "metricsMentioned",
    "transcriptEvidence",
    "confidence",
    "needsCoachInput",
  ],
  properties: {
    lessonSummary: { type: "string" },
    workedOn: { type: "string" },
    keyIssue: { type: "string" },
    improvement: { type: "string" },
    practiceAssignment: { type: "string" },
    recommendedDrill: { type: "string" },
    memberFacingNotes: { type: "string" },
    nextSessionGoal: { type: "string" },
    progressObserved: { type: "array", items: { type: "string" } },
    metricsMentioned: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "value", "source"],
        properties: {
          metric: { type: "string" },
          value: { type: "string" },
          source: { type: "string", enum: ["transcript", "linked_session"] },
        },
      },
    },
    transcriptEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "excerpt", "timestamp"],
        properties: {
          field: { type: "string" },
          excerpt: { type: "string" },
          timestamp: { type: "string" },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needsCoachInput: { type: "boolean" },
  },
};

export function canReviewVideoRecap(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  if (identity.role === "admin") return true;
  return identity.role === "coach" && (
    video.coachId === identity.id || assignedMemberIds.includes(video.memberId)
  );
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
    lessonSummary: "Not specified by coach",
    workedOn: "Not specified by coach",
    keyIssue: "Not specified by coach",
    improvement: "Not specified by coach",
    practiceAssignment: "Not specified by coach",
    recommendedDrill: "Not specified by coach",
    memberFacingNotes: "Not specified by coach",
    nextSessionGoal: "Not specified by coach",
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
      return [{
        excerpt: text(item.excerpt),
        field: text(item.field),
        timestamp: text(item.timestamp),
      }];
    }).filter((item) => item.field && item.excerpt)
    : [];

  return {
    lessonSummary: text(record.lessonSummary, "Not specified by coach") || "Not specified by coach",
    workedOn: text(record.workedOn, "Not specified by coach") || "Not specified by coach",
    keyIssue: text(record.keyIssue, "Not specified by coach") || "Not specified by coach",
    improvement: text(record.improvement, "Not specified by coach") || "Not specified by coach",
    practiceAssignment: text(record.practiceAssignment, "Not specified by coach") || "Not specified by coach",
    recommendedDrill: text(record.recommendedDrill, "Not specified by coach") || "Not specified by coach",
    memberFacingNotes: text(record.memberFacingNotes, "Not specified by coach") || "Not specified by coach",
    nextSessionGoal: text(record.nextSessionGoal, "Not specified by coach") || "Not specified by coach",
    progressObserved: stringArray(record.progressObserved),
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
    "When absent, return an empty string, empty array, or 'Not specified by coach'.",
    "If the transcript is too short, unclear, silent, or unrelated to golf coaching, set needsCoachInput=true and avoid filling misleading fields.",
    "",
    JSON.stringify(context),
  ].join("\n");
}
