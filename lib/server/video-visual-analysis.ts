import OpenAI from "openai";

import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import {
  DEFAULT_VISUAL_ANALYSIS_MODEL,
  VISUAL_ANALYSIS_VERSION,
  canReadVisualAnalysis,
  canRequestVisualAnalysis,
  canReviewVisualAnalysis,
  normalizeVisualSwingAnalysis,
  shouldRequestVisualAnalysisProcessing,
  visibleVisualFindingsForMember,
  visualAnalysisEligibility,
  visualAnalysisInitialVisibility,
} from "@/lib/visual-swing-analysis-policy.mjs";
import {
  ensureCoachFeedbackSchema,
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  ensureVideoAiProcessingSchema,
  ensureVideoVisualAnalysisSchema,
  getAssignedMemberIds,
  getOpenAIConfigurationIssue,
  getPlatformEnvironment,
  getRequiredDatabase,
  getRequiredVideoStorage,
  recordActivity,
  sanitizeOpenAIError,
  type AuthIdentity,
} from "@/lib/server/platform";
import { loadVideoForRecap } from "@/lib/server/video-ai-recap";

type VideoVisualAnalysisRow = {
  id: string;
  video_id: string;
  member_id: string;
  coach_id: string | null;
  requested_by_user_id: string;
  requested_by_role: "coach" | "member" | "admin";
  analysis_version: string;
  media_hash: string;
  status: string;
  selected_swing_id: string | null;
  camera_view: string | null;
  handedness: string | null;
  club: string | null;
  overall_confidence: number | null;
  structured_result_json: string;
  swing_count_detected: number;
  frames_analyzed: number;
  model: string | null;
  prompt_version: string;
  published_to_member_at: string | null;
  safe_error_code: string | null;
  safe_error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type VisualFrameRow = {
  id: string;
  analysis_id: string;
  video_id: string;
  member_id: string;
  swing_id: string;
  phase: string;
  timestamp_seconds: number | null;
  storage_path: string | null;
  thumbnail_storage_path: string | null;
  source: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

type ObservationReviewRow = {
  observation_id: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type CoachContext = {
  audioFeedback: string;
  lessonSummary: string;
  mainFocus: string;
  manualFeedback: string;
};

const VISUAL_ANALYSIS_MEMBER_UNAVAILABLE_MESSAGE = "MAI visual analysis is temporarily unavailable. Your video is saved.";

const visualAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "selectedSwingId",
    "view",
    "handedness",
    "club",
    "overallConfidence",
    "strengths",
    "observations",
    "priority",
    "suggestedDrill",
    "unableToDetermine",
  ],
  properties: {
    selectedSwingId: { type: "string" },
    view: { type: "string", enum: ["face_on", "down_the_line", "front_three_quarter", "rear_three_quarter", "unknown"] },
    handedness: { type: "string", enum: ["right", "left", "unknown"] },
    club: { type: ["string", "null"] },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    strengths: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "explanation", "phase", "confidence", "evidenceFrameIds", "classification"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          phase: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceFrameIds: { type: "array", items: { type: "string" } },
          classification: { type: "string", enum: ["observed", "likely_tendency", "supported_by_session_data", "mentioned_by_coach", "unable_to_determine"] },
        },
      },
    },
    observations: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "explanation", "phase", "confidence", "evidenceFrameIds", "classification"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          phase: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceFrameIds: { type: "array", items: { type: "string" } },
          classification: { type: "string", enum: ["observed", "likely_tendency", "supported_by_session_data", "mentioned_by_coach", "unable_to_determine"] },
        },
      },
    },
    priority: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["title", "explanation", "confidence", "evidenceFrameIds"],
      properties: {
        title: { type: "string" },
        explanation: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidenceFrameIds: { type: "array", items: { type: "string" } },
      },
    },
    suggestedDrill: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["title", "why", "instructions", "goal"],
      properties: {
        title: { type: "string" },
        why: { type: "string" },
        instructions: { type: "array", items: { type: "string" } },
        goal: { type: ["string", "null"] },
      },
    },
    unableToDetermine: { type: "array", items: { type: "string" } },
  },
};

function text(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeJson(value: string | null | undefined, fallback: unknown) {
  try {
    return value ? JSON.parse(value) as unknown : fallback;
  } catch {
    return fallback;
  }
}

function displayName(row: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Unknown";
}

async function prepareDatabase(database: D1Database) {
  await ensurePlatformSchema(database);
  await ensureUserDataOwnershipSchema(database);
  await ensureVideoAiProcessingSchema(database);
  await ensureCoachFeedbackSchema(database);
  await ensureVideoVisualAnalysisSchema(database);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mediaHashForVideo(video: Record<string, unknown>) {
  return sha256Hex([
    video.id,
    video.source_storage_path || video.storage_path,
    video.source_file_size || video.file_size,
    video.source_mime_type || video.mime_type,
    video.duration,
  ].join("|"));
}

async function loadLatestVisualAnalysis(database: D1Database, videoId: string) {
  return database
    .prepare("SELECT * FROM video_visual_analyses WHERE video_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(videoId)
    .first<VideoVisualAnalysisRow>();
}

async function loadVisualFrames(database: D1Database, analysisId: string) {
  const result = await database
    .prepare("SELECT * FROM video_visual_analysis_frames WHERE analysis_id = ? ORDER BY timestamp_seconds, created_at")
    .bind(analysisId)
    .all<VisualFrameRow>();
  return result.results ?? [];
}

async function loadObservationReviews(database: D1Database, analysisId: string) {
  const result = await database
    .prepare("SELECT observation_id, review_status, reviewed_at, reviewed_by FROM video_visual_observation_reviews WHERE analysis_id = ?")
    .bind(analysisId)
    .all<ObservationReviewRow>();
  return new Map((result.results ?? []).map((row) => [row.observation_id, row]));
}

async function loadCoachRelationshipCount(database: D1Database, memberId: string) {
  const row = await database
    .prepare("SELECT COUNT(*) AS count FROM coach_members WHERE member_id = ?")
    .bind(memberId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function loadCoachContext(database: D1Database, video: Record<string, unknown>): Promise<CoachContext> {
  const transcript = await database
    .prepare("SELECT transcript_text FROM video_transcripts WHERE video_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
    .bind(video.id)
    .first<{ transcript_text: string }>();
  const feedback = await database
    .prepare("SELECT raw_notes, observations_json, prescribed_drills_json FROM coach_feedback WHERE lesson_id = ? ORDER BY updated_at DESC LIMIT 1")
    .bind(video.id)
    .first<{ raw_notes: string | null; observations_json: string; prescribed_drills_json: string }>();
  const observations = Array.isArray(safeJson(feedback?.observations_json, []))
    ? (safeJson(feedback?.observations_json, []) as unknown[]).join(" ")
    : "";
  return {
    audioFeedback: text(transcript?.transcript_text, 8000),
    lessonSummary: text(video.lesson_summary, 4000),
    mainFocus: [text(video.worked_on), text(video.key_issue)].filter(Boolean).join(" "),
    manualFeedback: [text(video.coach_notes), text(feedback?.raw_notes), observations].filter(Boolean).join(" "),
  };
}

async function loadLinkedSessionSummary(database: D1Database, video: Record<string, unknown>) {
  const sessionId = text(video.session_data_id, 120);
  if (!sessionId) return null;
  const snapshot = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(video.member_id)
    .first<{ sessions_json: string }>();
  const sessions = safeJson(snapshot?.sessions_json, []);
  if (!Array.isArray(sessions)) return null;
  const session = sessions.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === sessionId) as Record<string, unknown> | undefined;
  if (!session) return null;
  const shots = Array.isArray(session.shots) ? session.shots : [];
  return {
    club: text(session.clubLabel ?? session.club ?? video.club, 80),
    date: text(session.date, 40),
    id: sessionId,
    shotCount: shots.length,
    source: text(session.source, 80),
    title: text(session.title, 120),
  };
}

function applyReviewStatuses(structuredResult: unknown, reviews: Map<string, ObservationReviewRow>, coachLed: boolean) {
  const result = normalizeVisualSwingAnalysis(structuredResult, { coachLed });
  const apply = (item: Record<string, unknown>, id: string) => {
    const review = reviews.get(id);
    return {
      ...item,
      id,
      reviewedAt: review?.reviewed_at ?? null,
      reviewStatus: review?.review_status ?? item.reviewStatus ?? (coachLed ? "coach_only" : "include_in_recap"),
    };
  };
  return {
    ...result,
    priority: result.priority ? apply(result.priority, "priority") : null,
    strengths: result.strengths.map((item, index) => apply(item, `strength-${index + 1}`)),
    observations: result.observations.map((item, index) => apply(item, `observation-${index + 1}`)),
  };
}

function serializeAnalysis(row: VideoVisualAnalysisRow | null, frames: VisualFrameRow[], reviews: Map<string, ObservationReviewRow>, options: {
  coachLed: boolean;
  includeCoachOnly: boolean;
}) {
  if (!row) return null;
  const structuredResult = applyReviewStatuses(safeJson(row.structured_result_json, {}), reviews, options.coachLed);
  const visibleResult = options.includeCoachOnly ? structuredResult : visibleVisualFindingsForMember(structuredResult);
  return {
    analysisVersion: row.analysis_version,
    cameraView: row.camera_view,
    club: row.club,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    frameCount: frames.length,
    frames: frames.map((frame) => ({
      id: frame.id,
      phase: frame.phase,
      source: frame.source,
      swingId: frame.swing_id,
      timestampSeconds: frame.timestamp_seconds,
    })),
    framesAnalyzed: Number(row.frames_analyzed ?? 0),
    handedness: row.handedness,
    id: row.id,
    mediaHash: row.media_hash,
    model: row.model,
    overallConfidence: row.overall_confidence,
    promptVersion: row.prompt_version,
    publishedToMemberAt: row.published_to_member_at,
    requestedByRole: row.requested_by_role,
    safeErrorCode: row.safe_error_code,
    safeErrorMessage: row.safe_error_message,
    selectedSwingId: row.selected_swing_id,
    status: row.status,
    structuredResult: visibleResult,
    swingCountDetected: Number(row.swing_count_detected ?? 0),
    updatedAt: row.updated_at,
  };
}

async function fetchThumbnailFrame(database: D1Database, video: Record<string, unknown>, analysisId: string) {
  const thumbnailPath = text(video.thumbnail_storage_path, 600);
  if (!thumbnailPath) return { frame: null, reason: "representative_frame_unavailable" };
  const bucket = getRequiredVideoStorage();
  const object = await bucket.get(thumbnailPath);
  if (!object) return { frame: null, reason: "representative_frame_missing" };
  const contentType = object.httpMetadata?.contentType || "image/jpeg";
  if (!contentType.startsWith("image/")) return { frame: null, reason: "representative_frame_unsupported" };
  const bytes = await object.arrayBuffer();
  const id = crypto.randomUUID();
  await database
    .prepare("DELETE FROM video_visual_analysis_frames WHERE analysis_id = ?")
    .bind(analysisId)
    .run();
  await database
    .prepare(
      `INSERT INTO video_visual_analysis_frames (
        id, analysis_id, video_id, member_id, swing_id, phase, timestamp_seconds,
        storage_path, thumbnail_storage_path, source, width, height, created_at
      ) VALUES (?, ?, ?, ?, 'swing-1', 'representative', NULL, ?, ?, 'stored_thumbnail', NULL, NULL, CURRENT_TIMESTAMP)`,
    )
    .bind(id, analysisId, video.id, video.member_id, thumbnailPath, thumbnailPath)
    .run();
  const base64 = arrayBufferToBase64(bytes);
  return {
    frame: {
      base64,
      contentType,
      id,
      path: thumbnailPath,
    },
    reason: null,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function buildVisualAnalysisPrompt(values: {
  coachContext: CoachContext;
  linkedSession: unknown;
  memberName: string;
  selfGuided: boolean;
  video: Record<string, unknown>;
}) {
  return [
    "Analyze the single supplied representative golf-swing frame and application context.",
    "Do not claim to analyze positions that are not visible in the frame.",
    "Do not invent exact body angles or measured values.",
    "Coach feedback leads. MAI visual analysis supports it.",
    values.selfGuided
      ? "This golfer is self-guided, so label feedback as AI-generated and keep it focused."
      : "This is a coach-led lesson. Flag any disagreement with coach feedback for coach review and do not override coach feedback.",
    "Use measured session data only as evidence. Never overwrite measured metrics with visual estimates.",
    "Return one or two strengths, no more than three observations, one priority, and one drill.",
    "",
    JSON.stringify({
      coachContext: values.coachContext,
      linkedSession: values.linkedSession,
      memberName: values.memberName,
      video: {
        club: values.video.club,
        duration: values.video.duration,
        focusArea: values.video.focus_area,
        lessonDate: values.video.lesson_date,
        swingType: values.video.swing_type,
        title: values.video.title,
      },
    }),
  ].join("\n");
}

async function callOpenAIVisualAnalysis(values: {
  coachContext: CoachContext;
  frame: { base64: string; contentType: string; id: string };
  linkedSession: unknown;
  memberName: string;
  selfGuided: boolean;
  video: Record<string, unknown>;
}) {
  const runtime = getPlatformEnvironment();
  const model = runtime.OPENAI_VISION_MODEL || runtime.OPENAI_ANALYSIS_MODEL || runtime.OPENAI_MODEL || DEFAULT_VISUAL_ANALYSIS_MODEL;
  const configurationIssue = getOpenAIConfigurationIssue(runtime);
  if (configurationIssue) {
    throw Object.assign(new Error(configurationIssue.publicMessage), {
      code: configurationIssue.code,
      status: configurationIssue.statusCode,
    });
  }
  const client = new OpenAI({ apiKey: runtime.OPENAI_API_KEY?.trim(), timeout: 45000 });
  const response = await client.responses.create({
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildVisualAnalysisPrompt(values) },
          {
            type: "input_image",
            image_url: `data:${values.frame.contentType};base64,${values.frame.base64}`,
            detail: "low",
          },
        ],
      },
    ] as never,
    instructions: MAI_CADDY_CORE_INSTRUCTIONS,
    max_output_tokens: 2200,
    model,
    safety_identifier: text(values.video.id, 120),
    store: false,
    text: {
      format: {
        name: "mai_video_visual_swing_analysis",
        schema: visualAnalysisJsonSchema,
        strict: true,
        type: "json_schema",
      },
      verbosity: "medium",
    },
  });
  const outputText = response.output_text?.trim();
  if (!outputText) throw Object.assign(new Error("MAI Coach did not return a visual analysis."), { code: "empty_visual_response", status: 502 });
  return {
    model,
    result: JSON.parse(outputText) as unknown,
  };
}

async function upsertObservationReviewDefaults(database: D1Database, analysis: VideoVisualAnalysisRow, structuredResult: ReturnType<typeof normalizeVisualSwingAnalysis>, coachLed: boolean) {
  const now = new Date().toISOString();
  const rows = [
    ...structuredResult.strengths.map((_, index) => ({ id: `strength-${index + 1}`, status: coachLed ? "coach_only" : "include_in_recap" })),
    ...structuredResult.observations.map((item, index) => ({
      id: `observation-${index + 1}`,
      status: item.sourceComparison?.includes("conflict") ? "coach_only" : coachLed ? "coach_only" : "include_in_recap",
    })),
    ...(structuredResult.priority ? [{ id: "priority", status: coachLed ? "coach_only" : "include_in_recap" }] : []),
  ];
  if (!rows.length) return;
  await database.batch(rows.map((row) => database
    .prepare(
      `INSERT INTO video_visual_observation_reviews (
        id, analysis_id, observation_id, video_id, member_id, coach_id, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(analysis_id, observation_id) DO UPDATE SET
        review_status = video_visual_observation_reviews.review_status,
        updated_at = video_visual_observation_reviews.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      analysis.id,
      row.id,
      analysis.video_id,
      analysis.member_id,
      analysis.coach_id,
      row.status,
      now,
      now,
    )));
}

async function markNeedsAttention(database: D1Database, analysisId: string, safeErrorCode: string, safeErrorMessage: string, model: string | null = null) {
  await database
    .prepare(
      `UPDATE video_visual_analyses SET
        status = 'needs_attention',
        safe_error_code = ?,
        safe_error_message = ?,
        model = COALESCE(?, model),
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(safeErrorCode, safeErrorMessage, model, analysisId)
    .run();
}

async function processVisualAnalysis(database: D1Database, identity: AuthIdentity, video: Record<string, unknown>, analysis: VideoVisualAnalysisRow) {
  await database
    .prepare("UPDATE video_visual_analyses SET status = 'detecting_swings', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(analysis.id)
    .run();

  const coachLed = await loadCoachRelationshipCount(database, text(video.member_id, 120)) > 0;
  const selfGuided = !coachLed && identity.role === "member";
  const frameResult = await fetchThumbnailFrame(database, video, analysis.id);
  if (!frameResult.frame) {
    await markNeedsAttention(
      database,
      analysis.id,
      frameResult.reason ?? "representative_frame_unavailable",
      "MAI Coach needs a representative swing frame before visual analysis can run. Use Retry Swing Analysis after a thumbnail or frame is available.",
    );
    return;
  }

  await database
    .prepare("UPDATE video_visual_analyses SET status = 'analyzing_frames', swing_count_detected = 1, frames_analyzed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(analysis.id)
    .run();

  const modelFallback = getPlatformEnvironment().OPENAI_VISION_MODEL || getPlatformEnvironment().OPENAI_ANALYSIS_MODEL || getPlatformEnvironment().OPENAI_MODEL || DEFAULT_VISUAL_ANALYSIS_MODEL;
  try {
    const coachContext = await loadCoachContext(database, video);
    const linkedSession = await loadLinkedSessionSummary(database, video);
    const response = await callOpenAIVisualAnalysis({
      coachContext,
      frame: frameResult.frame,
      linkedSession,
      memberName: displayName({
        email: text(video.member_email),
        first_name: text(video.member_first_name),
        last_name: text(video.member_last_name),
      }),
      selfGuided,
      video,
    });
    const normalized = normalizeVisualSwingAnalysis(response.result, {
      coachContext,
      coachLed,
      club: video.club,
      videoId: video.id,
    });
    const status = visualAnalysisInitialVisibility(identity, coachLed);
    await database
      .prepare(
        `UPDATE video_visual_analyses SET
          status = ?,
          selected_swing_id = ?,
          camera_view = ?,
          handedness = ?,
          club = ?,
          overall_confidence = ?,
          structured_result_json = ?,
          swing_count_detected = 1,
          frames_analyzed = 1,
          model = ?,
          prompt_version = ?,
          published_to_member_at = CASE WHEN ? = 'ready_for_member' THEN CURRENT_TIMESTAMP ELSE published_to_member_at END,
          safe_error_code = NULL,
          safe_error_message = NULL,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      )
      .bind(
        status,
        normalized.selectedSwingId,
        normalized.view,
        normalized.handedness,
        normalized.club,
        normalized.overallConfidence,
        JSON.stringify(normalized),
        response.model,
        VISUAL_ANALYSIS_VERSION,
        status,
        analysis.id,
      )
      .run();
    const updated = await database.prepare("SELECT * FROM video_visual_analyses WHERE id = ?").bind(analysis.id).first<VideoVisualAnalysisRow>();
    if (updated) await upsertObservationReviewDefaults(database, updated, normalized, coachLed);
    await recordActivity({
      action: "video_visual_analysis_completed",
      actor: identity,
      database,
      entityId: analysis.id,
      entityType: "video_visual_analysis",
      memberId: text(video.member_id),
      metadata: {
        analysisVersion: VISUAL_ANALYSIS_VERSION,
        framesAnalyzed: 1,
        model: response.model,
        videoId: video.id,
      },
      summary: "MAI Coach prepared visual swing observations for review.",
      targetUserId: text(video.member_id),
    });
  } catch (error) {
    const diagnostic = sanitizeOpenAIError(error, {
      endpoint: "responses.create",
      model: modelFallback,
      operation: "video_visual_analysis",
    });
    await markNeedsAttention(
      database,
      analysis.id,
      diagnostic.category || "visual_analysis_failed",
      VISUAL_ANALYSIS_MEMBER_UNAVAILABLE_MESSAGE,
      diagnostic.model,
    );
  }
}

async function createOrLoadAnalysis(database: D1Database, identity: AuthIdentity, video: Record<string, unknown>, mediaHash: string) {
  const existing = await database
    .prepare("SELECT * FROM video_visual_analyses WHERE video_id = ? AND media_hash = ? AND analysis_version = ? ORDER BY created_at DESC LIMIT 1")
    .bind(video.id, mediaHash, VISUAL_ANALYSIS_VERSION)
    .first<VideoVisualAnalysisRow>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO video_visual_analyses (
        id, video_id, member_id, coach_id, requested_by_user_id, requested_by_role,
        analysis_version, media_hash, status, prompt_version, structured_result_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      id,
      video.id,
      video.member_id,
      video.coach_id,
      identity.id,
      identity.role,
      VISUAL_ANALYSIS_VERSION,
      mediaHash,
      VISUAL_ANALYSIS_VERSION,
    )
    .run();
  const row = await database.prepare("SELECT * FROM video_visual_analyses WHERE id = ?").bind(id).first<VideoVisualAnalysisRow>();
  if (!row) throw new Response("Visual analysis could not be created.", { status: 500 });
  return row;
}

async function upsertPendingUploadAnalysis(database: D1Database, identity: AuthIdentity, videoId: string, memberId: string, coachId: string | null) {
  const mediaHash = `pending:${videoId}`;
  const existing = await database
    .prepare("SELECT id FROM video_visual_analyses WHERE video_id = ? AND media_hash = ? AND analysis_version = ?")
    .bind(videoId, mediaHash, VISUAL_ANALYSIS_VERSION)
    .first<{ id: string }>();
  if (existing) return;
  await database
    .prepare(
      `INSERT INTO video_visual_analyses (
        id, video_id, member_id, coach_id, requested_by_user_id, requested_by_role,
        analysis_version, media_hash, status, prompt_version, structured_result_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      videoId,
      memberId,
      coachId,
      identity.id,
      identity.role,
      VISUAL_ANALYSIS_VERSION,
      mediaHash,
      VISUAL_ANALYSIS_VERSION,
    )
    .run();
}

export async function queueVideoVisualAnalysisRequest(database: D1Database, identity: AuthIdentity, values: {
  coachId: string | null;
  memberId: string;
  requested?: unknown;
  videoId: string;
}) {
  await ensureVideoVisualAnalysisSchema(database);
  if (!shouldRequestVisualAnalysisProcessing(identity, values.requested, {
    defaultEnabledInDev: getPlatformEnvironment().DEV_AUTH_ENABLED === "true",
  })) {
    return { queued: false, reason: "not_requested" };
  }
  await upsertPendingUploadAnalysis(database, identity, values.videoId, values.memberId, values.coachId);
  return { queued: true, reason: "queued_for_upload" };
}

export async function processPendingVideoVisualAnalysisAfterUpload(database: D1Database, identity: AuthIdentity, videoId: string) {
  await prepareDatabase(database);
  const pending = await database
    .prepare("SELECT * FROM video_visual_analyses WHERE video_id = ? AND media_hash = ? AND analysis_version = ? ORDER BY created_at DESC LIMIT 1")
    .bind(videoId, `pending:${videoId}`, VISUAL_ANALYSIS_VERSION)
    .first<VideoVisualAnalysisRow>();
  const video = await loadVideoForRecap(database, videoId) as unknown as Record<string, unknown> | null;
  if (!video) return { queued: false, reason: "video_missing" };
  if (!pending) {
    const latest = await loadLatestVisualAnalysis(database, videoId);
    if (
      latest?.status === "needs_attention" &&
      text(latest.safe_error_code, 120).startsWith("representative_frame") &&
      text(video.thumbnail_storage_path, 600)
    ) {
      await processVisualAnalysis(database, identity, video, latest);
      return { queued: true, reason: "retried_after_frame_available" };
    }
    return { queued: false, reason: "not_requested" };
  }
  const mediaHash = await mediaHashForVideo(video);
  await database
    .prepare("UPDATE video_visual_analyses SET media_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(mediaHash, pending.id)
    .run();
  const updated = await database.prepare("SELECT * FROM video_visual_analyses WHERE id = ?").bind(pending.id).first<VideoVisualAnalysisRow>();
  if (!updated) return { queued: false, reason: "analysis_missing" };
  const eligibility = visualAnalysisEligibility(video, null);
  if (!eligibility.eligible) {
    await markNeedsAttention(database, updated.id, eligibility.safeErrorCode ?? "not_eligible", eligibility.safeMessage);
    return { queued: false, reason: eligibility.safeErrorCode };
  }
  await processVisualAnalysis(database, identity, video, updated);
  return { queued: true, reason: "processed" };
}

export async function readVideoVisualAnalysisState(identity: AuthIdentity, videoId: string) {
  const database = getRequiredDatabase();
  await prepareDatabase(database);
  const video = await loadVideoForRecap(database, videoId) as unknown as Record<string, unknown> | null;
  if (!video) throw new Response("Video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  const coachLed = await loadCoachRelationshipCount(database, text(video.member_id, 120)) > 0;
  let latest = await loadLatestVisualAnalysis(database, videoId);
  if (latest && !canReadVisualAnalysis(identity, {
    coachId: video.coach_id,
    memberId: video.member_id,
  }, {
    selfGuidedVisible: latest.requested_by_role === "member" && !coachLed,
    status: latest.status,
  }, assignedMemberIds)) {
    const memberOwnsVideo = identity.role === "member" && identity.id === text(video.member_id, 120);
    if (!memberOwnsVideo) {
      throw new Response("You do not have access to this visual analysis.", { status: 403 });
    }
    latest = null;
  }
  if (!latest && !canRequestVisualAnalysis(identity, {
    coachId: video.coach_id,
    memberId: video.member_id,
    uploadedByRole: video.uploaded_by_role,
  }, assignedMemberIds)) {
    throw new Response("You do not have access to this visual analysis.", { status: 403 });
  }
  const canReview = canReviewVisualAnalysis(identity, { coachId: video.coach_id, memberId: video.member_id }, assignedMemberIds);
  const frames = latest ? await loadVisualFrames(database, latest.id) : [];
  const reviews = latest ? await loadObservationReviews(database, latest.id) : new Map<string, ObservationReviewRow>();
  const eligibility = visualAnalysisEligibility(video, latest);
  return Response.json({
    analysis: serializeAnalysis(latest ?? null, frames, reviews, {
      coachLed,
      includeCoachOnly: canReview || (!coachLed && latest?.requested_by_role === "member" && identity.id === latest.member_id),
    }),
    canRequest: canRequestVisualAnalysis(identity, {
      coachId: video.coach_id,
      memberId: video.member_id,
      uploadedByRole: video.uploaded_by_role,
    }, assignedMemberIds),
    canReview,
    coachLed,
    eligibility,
    hierarchy: coachLed
      ? ["Coach Feedback", "Measured Session Data", "MAI Visual Swing Analysis"]
      : ["MAI Visual Swing Analysis", "Session Data", "Personalized Practice"],
    sourcePriority: {
      evidence: ["Measured Session Data", "User-confirmed Session Metadata", "Direct Visual Observations", "Coach-described Observations", "AI Inference"],
      instructional: ["Coach manual feedback", "Coach audio feedback", "Coach-approved MAI visual observations", "MAI visual analysis", "Generic MAI recommendations"],
    },
    video: {
      id: video.id,
      memberId: video.member_id,
      title: video.title,
    },
  });
}

export async function updateVideoVisualAnalysisState(identity: AuthIdentity, payload: Record<string, unknown>) {
  const database = getRequiredDatabase();
  await prepareDatabase(database);
  const action = text(payload.action, 40);
  const videoId = text(payload.videoId, 120);
  if (!videoId) throw new Response("videoId is required.", { status: 400 });
  const video = await loadVideoForRecap(database, videoId) as unknown as Record<string, unknown> | null;
  if (!video) throw new Response("Video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  const reviewAllowed = canReviewVisualAnalysis(identity, { coachId: video.coach_id, memberId: video.member_id }, assignedMemberIds);

  if (action === "request" || action === "retry") {
    if (!canRequestVisualAnalysis(identity, {
      coachId: video.coach_id,
      memberId: video.member_id,
      uploadedByRole: video.uploaded_by_role,
    }, assignedMemberIds)) {
      throw new Response("You cannot analyze this video.", { status: 403 });
    }
    const latest = await loadLatestVisualAnalysis(database, videoId);
    const eligibility = visualAnalysisEligibility(video, action === "retry" ? null : latest);
    if (!eligibility.eligible && action !== "retry") {
      throw new Response(eligibility.safeMessage, { status: eligibility.safeErrorCode === "analysis_already_completed" ? 409 : 400 });
    }
    const mediaHash = await mediaHashForVideo(video);
    const analysis = await createOrLoadAnalysis(database, identity, video, mediaHash);
    if (["queued", "needs_attention", "cancelled"].includes(analysis.status) || action === "retry") {
      await processVisualAnalysis(database, identity, video, analysis);
    }
    return readVideoVisualAnalysisState(identity, videoId);
  }

  if (action === "reviewObservation") {
    if (!reviewAllowed) throw new Response("Only the assigned coach or admin can review visual observations.", { status: 403 });
    const analysisId = text(payload.analysisId, 120);
    const observationId = text(payload.observationId, 120);
    const reviewStatus = text(payload.reviewStatus, 40);
    if (!analysisId || !observationId) throw new Response("analysisId and observationId are required.", { status: 400 });
    if (!["include_in_recap", "coach_only", "dismissed"].includes(reviewStatus)) {
      throw new Response("Choose a valid review status.", { status: 400 });
    }
    const analysis = await database.prepare("SELECT * FROM video_visual_analyses WHERE id = ? AND video_id = ?").bind(analysisId, videoId).first<VideoVisualAnalysisRow>();
    if (!analysis) throw new Response("Visual analysis not found.", { status: 404 });
    const now = new Date().toISOString();
    await database
      .prepare(
        `INSERT INTO video_visual_observation_reviews (
          id, analysis_id, observation_id, video_id, member_id, coach_id, review_status, reviewed_by, reviewed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(analysis_id, observation_id) DO UPDATE SET
          review_status = excluded.review_status,
          reviewed_by = excluded.reviewed_by,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at`,
      )
      .bind(crypto.randomUUID(), analysisId, observationId, videoId, video.member_id, video.coach_id, reviewStatus, identity.id, now, now, now)
      .run();
    await recordActivity({
      action: "video_visual_observation_reviewed",
      actor: identity,
      database,
      entityId: analysisId,
      entityType: "video_visual_analysis",
      memberId: text(video.member_id),
      metadata: { observationId, reviewStatus, videoId },
      summary: `${identity.displayName} reviewed a MAI visual swing observation.`,
      targetUserId: text(video.member_id),
    });
    return readVideoVisualAnalysisState(identity, videoId);
  }

  if (action === "publishApproved") {
    if (!reviewAllowed) throw new Response("Only the assigned coach or admin can publish visual observations.", { status: 403 });
    const latest = await loadLatestVisualAnalysis(database, videoId);
    if (!latest) throw new Response("Visual analysis not found.", { status: 404 });
    await database
      .prepare("UPDATE video_visual_analyses SET status = 'ready_for_member', published_to_member_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(latest.id)
      .run();
    await recordActivity({
      action: "video_visual_analysis_published",
      actor: identity,
      database,
      entityId: latest.id,
      entityType: "video_visual_analysis",
      memberId: text(video.member_id),
      metadata: { videoId },
      summary: `${identity.displayName} published approved MAI visual swing observations.`,
      targetUserId: text(video.member_id),
    });
    return readVideoVisualAnalysisState(identity, videoId);
  }

  if (action === "cancel") {
    if (!reviewAllowed) throw new Response("Only the assigned coach or admin can cancel visual analysis.", { status: 403 });
    const latest = await loadLatestVisualAnalysis(database, videoId);
    if (!latest) throw new Response("Visual analysis not found.", { status: 404 });
    await database
      .prepare("UPDATE video_visual_analyses SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(latest.id)
      .run();
    return readVideoVisualAnalysisState(identity, videoId);
  }

  throw new Response("Unsupported visual-analysis action.", { status: 400 });
}
