import OpenAI from "openai";

import {
  buildLessonRecapInput,
  buildTranscriptionPrompt,
  canReadApprovedVideoRecap,
  canReviewVideoRecap,
  DEFAULT_TRANSCRIPTION_MODEL,
  DEFAULT_VIDEO_RECAP_MODEL,
  emptyCoachInputDraft,
  lessonRecapJsonSchema,
  normalizeLessonRecapDraft,
  shouldRequestVideoRecapProcessing,
  transcriptLooksUsable,
  VIDEO_RECAP_PROCESSING_TYPE,
  VIDEO_RECAP_PROMPT_VERSION,
} from "@/lib/video-ai-recap-policy.mjs";
import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import {
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  ensureVideoAiProcessingSchema,
  getAssignedMemberIds,
  getPlatformEnvironment,
  getRequiredDatabase,
  recordActivity,
  type AuthIdentity,
} from "@/lib/server/platform";

export type VideoLessonRecapWorkflowParams = {
  coachId: string;
  language: string;
  memberId: string;
  processingJobId: string;
  storagePath: string;
  videoId: string;
  workflowRequestedAt: string;
};

type WorkflowStep = {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type WorkflowEvent = {
  payload?: VideoLessonRecapWorkflowParams;
  params?: VideoLessonRecapWorkflowParams;
};

type VideoRecapRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  uploaded_by_role: string;
  title: string;
  description: string;
  video_type: string;
  focus_area: string | null;
  swing_type: string | null;
  club: string | null;
  session_data_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  duration: number;
  lesson_date: string | null;
  publication_status: string;
  upload_status: string;
  lesson_summary: string;
  worked_on: string;
  key_issue: string;
  improvement: string;
  practice_assignment: string;
  recommended_drill: string;
  member_facing_notes: string;
  next_session_goal: string;
  member_first_name: string;
  member_last_name: string;
  member_email: string;
  member_skill_level: string | null;
  coach_first_name: string | null;
  coach_last_name: string | null;
  coach_email: string | null;
};

type ProcessingJobRow = {
  id: string;
  video_id: string;
  member_id: string;
  coach_id: string;
  processing_type: string;
  processing_version: number;
  requested_language: string;
  status: string;
  current_step: string;
  attempt_count: number;
  workflow_instance_id: string | null;
  audio_storage_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type TranscriptRow = {
  id: string;
  video_id: string;
  member_id: string;
  coach_id: string;
  transcript_text: string;
  segments_json: string;
  language: string;
  model: string;
  duration_seconds: number | null;
  processing_job_id: string;
  processing_version: number;
  quality_json: string;
  is_current: number | boolean;
  created_at: string;
  updated_at: string;
};

type DraftRow = {
  id: string;
  video_id: string;
  transcript_id: string;
  member_id: string;
  coach_id: string;
  processing_job_id: string;
  processing_version: number;
  lesson_summary: string;
  worked_on: string;
  key_issue: string;
  improvement: string;
  practice_assignment: string;
  recommended_drill: string;
  member_facing_notes: string;
  next_session_goal: string;
  progress_observed_json: string;
  metrics_mentioned_json: string;
  transcript_evidence_json: string;
  confidence: number;
  model: string | null;
  prompt_version: string;
  status: string;
  is_current: number | boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type RecapEnv = {
  DB: D1Database;
  MEDIA?: {
    input(stream: ReadableStream): {
      output(options: Record<string, unknown>): {
        response(): Promise<Response>;
      };
    };
  };
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  VIDEO_LESSON_RECAP_WORKFLOW?: {
    create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
  };
  VIDEO_STORAGE: R2Bucket;
};

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

function text(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function displayName(row: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Unknown";
}

function jobError(error: unknown) {
  const message = error instanceof Error ? error.message : "Video AI processing failed.";
  const code = error instanceof RecapProcessingError ? error.code : "processing_failed";
  const status = error instanceof RecapProcessingError ? error.status : "failed";
  return { code, message, status };
}

class RecapProcessingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = "failed",
  ) {
    super(message);
  }
}

async function prepareDatabase(database: D1Database) {
  await ensurePlatformSchema(database);
  await ensureUserDataOwnershipSchema(database);
  await ensureVideoAiProcessingSchema(database);
}

export async function loadVideoForRecap(database: D1Database, videoId: string) {
  return database
    .prepare(
      `SELECT
         videos.*,
         COALESCE(videos.next_session_goal, '') AS next_session_goal,
         member.first_name AS member_first_name,
         member.last_name AS member_last_name,
         member.email AS member_email,
         member.skill_level AS member_skill_level,
         coach.first_name AS coach_first_name,
         coach.last_name AS coach_last_name,
         coach.email AS coach_email
       FROM lesson_videos AS videos
       JOIN users AS member ON member.id = videos.member_id
       LEFT JOIN users AS coach ON coach.id = videos.coach_id
       WHERE videos.id = ?`,
    )
    .bind(videoId)
    .first<VideoRecapRow>();
}

async function loadJob(database: D1Database, jobId: string) {
  return database
    .prepare("SELECT * FROM video_ai_processing_jobs WHERE id = ?")
    .bind(jobId)
    .first<ProcessingJobRow>();
}

async function markJob(database: D1Database, jobId: string, values: {
  audioStoragePath?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  status: string;
  step: string;
}) {
  await database
    .prepare(
      `UPDATE video_ai_processing_jobs SET
        status = ?,
        current_step = ?,
        audio_storage_path = COALESCE(?, audio_storage_path),
        error_code = ?,
        error_message = ?,
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
        completed_at = CASE WHEN ? IN ('ready_for_review', 'failed', 'no_usable_audio', 'cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      values.status,
      values.step,
      values.audioStoragePath ?? null,
      values.errorCode ?? null,
      values.errorMessage ?? null,
      values.status,
      jobId,
    )
    .run();
}

export async function createVideoRecapProcessingJob(database: D1Database, identity: AuthIdentity, videoId: string, requested: unknown, language = "en") {
  await prepareDatabase(database);
  const video = await loadVideoForRecap(database, videoId);
  if (!video) return null;
  if (!video.coach_id || !shouldRequestVideoRecapProcessing(identity, requested)) return null;
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  if (!canReviewVideoRecap(identity, { coachId: video.coach_id, memberId: video.member_id }, assignedMemberIds)) {
    throw new Response("You cannot request AI processing for this video.", { status: 403 });
  }
  const versionRow = await database
    .prepare(
      `SELECT COALESCE(MAX(processing_version), 0) + 1 AS next_version
       FROM video_ai_processing_jobs
       WHERE video_id = ? AND processing_type = ?`,
    )
    .bind(video.id, VIDEO_RECAP_PROCESSING_TYPE)
    .first<{ next_version: number }>();
  const processingVersion = Number(versionRow?.next_version ?? 1);
  const jobId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO video_ai_processing_jobs (
        id, video_id, member_id, coach_id, processing_type, processing_version,
        requested_language, status, current_step, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'waiting_for_video_upload', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(jobId, video.id, video.member_id, video.coach_id, VIDEO_RECAP_PROCESSING_TYPE, processingVersion, language)
    .run();
  await recordActivity({
    action: "ai_processing_requested",
    actor: identity,
    database,
    entityId: jobId,
    entityType: "video_ai_processing_job",
    memberId: video.member_id,
    metadata: { coachId: video.coach_id, processingVersion, videoId: video.id },
    summary: `${identity.displayName} requested a MAI Caddy lesson recap from coach voiceover.`,
    targetUserId: video.member_id,
  });
  return jobId;
}

export async function queueVideoRecapWorkflowAfterUpload(database: D1Database, identity: AuthIdentity, videoId: string) {
  await prepareDatabase(database);
  const video = await loadVideoForRecap(database, videoId);
  if (!video || !video.coach_id || video.upload_status !== "ready") return null;
  const job = await database
    .prepare(
      `SELECT * FROM video_ai_processing_jobs
       WHERE video_id = ? AND status = 'queued'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(video.id)
    .first<ProcessingJobRow>();
  if (!job) return null;

  const runtime = getPlatformEnvironment();
  const workflow = runtime.VIDEO_LESSON_RECAP_WORKFLOW;
  await database
    .prepare(
      `UPDATE video_ai_processing_jobs
       SET current_step = 'queued_for_transcription',
           attempt_count = attempt_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(job.id)
    .run();

  if (!workflow) {
    await markJob(database, job.id, {
      errorCode: "workflow_binding_missing",
      errorMessage: "Cloudflare Workflow binding VIDEO_LESSON_RECAP_WORKFLOW is not configured.",
      status: "failed",
      step: "failed",
    });
    return { jobId: job.id, queued: false };
  }

  const instanceId = `video-recap-${job.id}`.slice(0, 100);
  try {
    const instance = await workflow.create({
      id: instanceId,
      params: {
        coachId: video.coach_id,
        language: job.requested_language || "en",
        memberId: video.member_id,
        processingJobId: job.id,
        storagePath: video.storage_path,
        videoId: video.id,
        workflowRequestedAt: new Date().toISOString(),
      } satisfies VideoLessonRecapWorkflowParams,
    });
    await database
      .prepare("UPDATE video_ai_processing_jobs SET workflow_instance_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(instance.id, job.id)
      .run();
    await recordActivity({
      action: "ai_processing_queued",
      actor: identity,
      database,
      entityId: job.id,
      entityType: "video_ai_processing_job",
      memberId: video.member_id,
      metadata: { workflowInstanceId: instance.id, videoId: video.id },
      summary: `${identity.displayName} queued MAI Caddy voiceover processing.`,
      targetUserId: video.member_id,
    });
    return { jobId: job.id, queued: true, workflowInstanceId: instance.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow could not be started.";
    await markJob(database, job.id, {
      errorCode: "workflow_start_failed",
      errorMessage: message,
      status: "failed",
      step: "failed",
    });
    return { jobId: job.id, queued: false };
  }
}

async function validateWorkflowInputs(database: D1Database, params: VideoLessonRecapWorkflowParams) {
  const job = await loadJob(database, params.processingJobId);
  if (!job || job.video_id !== params.videoId || job.member_id !== params.memberId || job.coach_id !== params.coachId) {
    throw new RecapProcessingError("invalid_processing_job", "The processing job no longer matches the requested video.");
  }
  const video = await loadVideoForRecap(database, params.videoId);
  if (!video) throw new RecapProcessingError("video_not_found", "The lesson video no longer exists.");
  if (video.member_id !== params.memberId || video.coach_id !== params.coachId) {
    throw new RecapProcessingError("video_ownership_changed", "The video ownership changed during processing.");
  }
  if (video.storage_path !== params.storagePath) {
    throw new RecapProcessingError("storage_path_mismatch", "The stored video path does not match the processing request.");
  }
  if (video.upload_status !== "ready") {
    throw new RecapProcessingError("video_not_ready", "The video upload is not ready yet.");
  }
  const relationship = await database
    .prepare("SELECT id FROM coach_members WHERE member_id = ? AND coach_id = ?")
    .bind(video.member_id, video.coach_id)
    .first<{ id: string }>();
  if (!relationship) {
    throw new RecapProcessingError("coach_relationship_changed", "The coach is no longer assigned to this member.");
  }
  return { job, video };
}

async function extractAudio(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow) {
  await markJob(database, job.id, { status: "extracting_audio", step: "extracting_coach_audio" });
  if (!env.MEDIA) throw new RecapProcessingError("media_binding_missing", "Cloudflare Media binding MEDIA is not configured.");
  const object = await env.VIDEO_STORAGE.get(video.storage_path);
  if (!object?.body) throw new RecapProcessingError("video_missing_from_r2", "The source video could not be found in private R2.");
  try {
    const audioResponse = await env.MEDIA.input(object.body).output({ mode: "audio", time: "0s" }).response();
    if (!audioResponse.ok || !audioResponse.body) {
      throw new RecapProcessingError("audio_extraction_failed", "No usable audio track could be extracted from this video.", "no_usable_audio");
    }
    const audioStoragePath = `video-processing/${video.id}/audio/${job.id}.m4a`;
    await env.VIDEO_STORAGE.put(audioStoragePath, audioResponse.body, {
      httpMetadata: { contentType: audioResponse.headers.get("content-type") || "audio/mp4" },
      customMetadata: {
        coachId: video.coach_id ?? "",
        jobId: job.id,
        memberId: video.member_id,
        videoId: video.id,
      },
    });
    await markJob(database, job.id, { audioStoragePath, status: "extracting_audio", step: "audio_extraction_completed" });
    return audioStoragePath;
  } catch (error) {
    if (error instanceof RecapProcessingError) throw error;
    throw new RecapProcessingError("audio_extraction_failed", "Audio extraction failed for this video.");
  }
}

async function transcribeAudio(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow, audioStoragePath: string) {
  await markJob(database, job.id, { status: "transcribing", step: "transcribing_coach_feedback" });
  if (!env.OPENAI_API_KEY) {
    throw new RecapProcessingError("openai_api_key_missing", "OPENAI_API_KEY is not configured for transcription.");
  }
  const audioObject = await env.VIDEO_STORAGE.get(audioStoragePath);
  if (!audioObject) throw new RecapProcessingError("audio_missing_from_r2", "Extracted audio could not be loaded.");
  if (audioObject.size > MAX_TRANSCRIPTION_BYTES) {
    throw new RecapProcessingError("audio_too_large", "The extracted audio is too large for the transcription endpoint.");
  }
  const model = env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
  const form = new FormData();
  const audioBytes = await audioObject.arrayBuffer();
  form.append("file", new File([audioBytes], "coach-voiceover.m4a", { type: "audio/mp4" }));
  form.append("model", model);
  form.append("language", job.requested_language || "en");
  form.append("prompt", buildTranscriptionPrompt());
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    body: form,
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; duration?: number; segments?: unknown; error?: { message?: string } };
  if (!response.ok) {
    throw new RecapProcessingError("transcription_failed", payload.error?.message || "OpenAI transcription failed.");
  }
  const transcriptText = text(payload.text, 120_000);
  const transcriptId = crypto.randomUUID();
  await database.prepare("UPDATE video_transcripts SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND processing_version = ?")
    .bind(video.id, job.processing_version)
    .run();
  await database
    .prepare(
      `INSERT INTO video_transcripts (
        id, video_id, member_id, coach_id, transcript_text, segments_json,
        language, model, duration_seconds, processing_job_id, processing_version,
        quality_json, is_current, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      transcriptId,
      video.id,
      video.member_id,
      video.coach_id,
      transcriptText,
      JSON.stringify(Array.isArray(payload.segments) ? payload.segments : []),
      job.requested_language || "en",
      model,
      Number.isFinite(payload.duration) ? Number(payload.duration) : null,
      job.id,
      job.processing_version,
      JSON.stringify({ usable: transcriptLooksUsable(transcriptText), source: "openai_audio_transcription" }),
    )
    .run();
  await markJob(database, job.id, { status: "transcribing", step: "transcription_completed" });
  return { model, text: transcriptText, transcriptId };
}

async function loadLinkedSessionContext(database: D1Database, video: VideoRecapRow) {
  if (!video.session_data_id) return null;
  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(video.member_id)
    .first<{ sessions_json: string }>();
  if (!row) return null;
  const sessions = safeJson(row.sessions_json, []);
  return Array.isArray(sessions)
    ? sessions.find((session) => session && typeof session === "object" && "id" in session && session.id === video.session_data_id) ?? null
    : null;
}

async function buildRecapContext(database: D1Database, video: VideoRecapRow, transcriptText: string) {
  const linkedSession = await loadLinkedSessionContext(database, video);
  return {
    coach: {
      id: video.coach_id,
      name: displayName({ first_name: video.coach_first_name, last_name: video.coach_last_name, email: video.coach_email }),
    },
    member: {
      id: video.member_id,
      name: displayName({ first_name: video.member_first_name, last_name: video.member_last_name, email: video.member_email }),
      skillLevel: video.member_skill_level || "Not specified",
    },
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      lessonDate: video.lesson_date,
      club: video.club,
      focusArea: video.focus_area,
      swingType: video.swing_type,
      videoType: video.video_type,
      existingFields: {
        improvement: video.improvement,
        keyIssue: video.key_issue,
        lessonSummary: video.lesson_summary,
        memberFacingNotes: video.member_facing_notes,
        practiceAssignment: video.practice_assignment,
        recommendedDrill: video.recommended_drill,
        workedOn: video.worked_on,
      },
    },
    linkedSession,
    transcript: transcriptText,
  };
}

async function generateRecapDraft(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow, transcript: { transcriptId: string; text: string }) {
  await markJob(database, job.id, { status: "generating_recap", step: "creating_mai_caddy_recap" });
  const model = env.OPENAI_MODEL || DEFAULT_VIDEO_RECAP_MODEL;
  const normalizedDraft = transcriptLooksUsable(transcript.text)
    ? await (async () => {
      if (!env.OPENAI_API_KEY) {
        throw new RecapProcessingError("openai_api_key_missing", "OPENAI_API_KEY is not configured for MAI Caddy recap generation.");
      }
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45000 });
      const context = await buildRecapContext(database, video, transcript.text);
      const response = await client.responses.create({
        input: buildLessonRecapInput(context),
        instructions: MAI_CADDY_CORE_INSTRUCTIONS,
        max_output_tokens: 2600,
        model,
        safety_identifier: video.id,
        store: false,
        text: {
          format: {
            name: "mai_caddy_video_lesson_recap",
            schema: lessonRecapJsonSchema,
            strict: true,
            type: "json_schema",
          },
          verbosity: "medium",
        },
      });
      const outputText = response.output_text?.trim();
      if (!outputText) throw new RecapProcessingError("empty_recap_response", "MAI Caddy did not return a recap draft.");
      return normalizeLessonRecapDraft(JSON.parse(outputText) as unknown);
    })()
    : emptyCoachInputDraft();

  const status = normalizedDraft.needsCoachInput ? "needs_coach_input" : "ready_for_review";
  const draftId = crypto.randomUUID();
  await database.prepare("UPDATE video_lesson_recap_drafts SET is_current = 0, status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND processing_version = ? AND status NOT IN ('approved', 'published')")
    .bind(video.id, job.processing_version)
    .run();
  await database
    .prepare(
      `INSERT INTO video_lesson_recap_drafts (
        id, video_id, transcript_id, member_id, coach_id, processing_job_id,
        processing_version, lesson_summary, worked_on, key_issue, improvement,
        practice_assignment, recommended_drill, member_facing_notes, next_session_goal,
        progress_observed_json, metrics_mentioned_json, transcript_evidence_json,
        confidence, model, prompt_version, status, is_current, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      draftId,
      video.id,
      transcript.transcriptId,
      video.member_id,
      video.coach_id,
      job.id,
      job.processing_version,
      normalizedDraft.lessonSummary,
      normalizedDraft.workedOn,
      normalizedDraft.keyIssue,
      normalizedDraft.improvement,
      normalizedDraft.practiceAssignment,
      normalizedDraft.recommendedDrill,
      normalizedDraft.memberFacingNotes,
      normalizedDraft.nextSessionGoal,
      JSON.stringify(normalizedDraft.progressObserved),
      JSON.stringify(normalizedDraft.metricsMentioned),
      JSON.stringify(normalizedDraft.transcriptEvidence),
      normalizedDraft.confidence,
      model,
      VIDEO_RECAP_PROMPT_VERSION,
      status,
    )
    .run();
  await markJob(database, job.id, {
    status: status === "needs_coach_input" ? "no_usable_audio" : "ready_for_review",
    step: status === "needs_coach_input" ? "no_usable_audio_detected" : "ready_for_coach_review",
  });
  return draftId;
}

export async function runVideoLessonRecapWorkflow(env: RecapEnv, event: WorkflowEvent, step: WorkflowStep) {
  const params = event.payload ?? event.params;
  if (!params?.processingJobId || !params.videoId) throw new Error("Workflow payload is missing processing identifiers.");
  const database = env.DB;
  await prepareDatabase(database);
  try {
    const { job, video } = await step.do("Validate video and authorization", () => validateWorkflowInputs(database, params));
    const audioPath = await step.do("Extract coach audio", () => extractAudio(env, database, job, video));
    const transcript = await step.do("Transcribe coach feedback", () => transcribeAudio(env, database, job, video, audioPath));
    const draftId = await step.do("Create MAI Caddy recap draft", () => generateRecapDraft(env, database, job, video, transcript));
    await step.do("Record recap generation completed", async () => {
      await recordActivity({
        action: "recap_generation_completed",
        actor: {
          displayName: "MAI Caddy",
          email: "mai-caddy@system.local",
          firstName: "MAI",
          id: video.coach_id ?? "system",
          lastName: "Caddy",
          passwordResetRequired: false,
          role: "coach",
        },
        database,
        entityId: draftId,
        entityType: "video_lesson_recap_draft",
        memberId: video.member_id,
        metadata: { processingJobId: job.id, transcriptId: transcript.transcriptId, videoId: video.id },
        summary: "MAI Caddy created a coach-review lesson recap draft.",
        targetUserId: video.member_id,
      });
    });
  } catch (error) {
    const safe = jobError(error);
    await markJob(database, params.processingJobId, {
      errorCode: safe.code,
      errorMessage: safe.message,
      status: safe.status,
      step: safe.status === "no_usable_audio" ? "no_usable_audio_detected" : "failed",
    });
    throw error;
  }
}

function serializeDraft(row: DraftRow | null) {
  if (!row) return null;
  return {
    confidence: Number(row.confidence ?? 0),
    createdAt: row.created_at,
    id: row.id,
    improvement: row.improvement,
    keyIssue: row.key_issue,
    lessonSummary: row.lesson_summary,
    memberFacingNotes: row.member_facing_notes,
    metricsMentioned: safeJson(row.metrics_mentioned_json, []),
    nextSessionGoal: row.next_session_goal,
    practiceAssignment: row.practice_assignment,
    progressObserved: safeJson(row.progress_observed_json, []),
    recommendedDrill: row.recommended_drill,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    status: row.status,
    transcriptEvidence: safeJson(row.transcript_evidence_json, []),
    updatedAt: row.updated_at,
    workedOn: row.worked_on,
  };
}

function serializeTranscript(row: TranscriptRow | null, includeText: boolean) {
  if (!row) return null;
  return {
    createdAt: row.created_at,
    durationSeconds: row.duration_seconds,
    id: row.id,
    language: row.language,
    model: row.model,
    quality: safeJson(row.quality_json, {}),
    segments: safeJson(row.segments_json, []),
    text: includeText ? row.transcript_text : "",
  };
}

function serializeJob(row: ProcessingJobRow | null) {
  if (!row) return null;
  return {
    completedAt: row.completed_at,
    currentStep: row.current_step,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    id: row.id,
    processingVersion: Number(row.processing_version ?? 1),
    status: row.status,
    updatedAt: row.updated_at,
    workflowInstanceId: row.workflow_instance_id,
  };
}

export async function readVideoRecapState(identity: AuthIdentity, videoId: string) {
  const database = getRequiredDatabase();
  await prepareDatabase(database);
  const video = await loadVideoForRecap(database, videoId);
  if (!video) throw new Response("Video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  const canReview = canReviewVideoRecap(identity, { coachId: video.coach_id, memberId: video.member_id }, assignedMemberIds);
  const canReadApproved = canReadApprovedVideoRecap(identity, {
    coachId: video.coach_id,
    memberId: video.member_id,
    publicationStatus: video.publication_status,
  }, assignedMemberIds);
  if (!canReadApproved) throw new Response("You do not have access to this lesson recap.", { status: 403 });
  const job = await database
    .prepare("SELECT * FROM video_ai_processing_jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(video.id)
    .first<ProcessingJobRow>();
  const draftVisibility = canReview
    ? ""
    : "AND status = 'published'";
  const draft = await database
    .prepare(`SELECT * FROM video_lesson_recap_drafts WHERE video_id = ? AND is_current = 1 ${draftVisibility} ORDER BY created_at DESC LIMIT 1`)
    .bind(video.id)
    .first<DraftRow>();
  const transcript = draft
    ? await database.prepare("SELECT * FROM video_transcripts WHERE id = ?").bind(draft.transcript_id).first<TranscriptRow>()
    : null;

  return Response.json({
    canReview,
    draft: serializeDraft(draft ?? null),
    job: serializeJob(job ?? null),
    transcript: serializeTranscript(transcript ?? null, canReview || draft?.status === "published"),
    video: {
      coachId: video.coach_id,
      coachName: displayName({ first_name: video.coach_first_name, last_name: video.coach_last_name, email: video.coach_email }),
      id: video.id,
      memberId: video.member_id,
      memberName: displayName({ first_name: video.member_first_name, last_name: video.member_last_name, email: video.member_email }),
      objectUrl: `/api/videos/media?videoId=${encodeURIComponent(video.id)}`,
      sessionId: video.session_data_id,
      title: video.title,
    },
  });
}

export async function updateVideoRecapState(identity: AuthIdentity, payload: Record<string, unknown>) {
  const database = getRequiredDatabase();
  await prepareDatabase(database);
  const videoId = text(payload.videoId, 80);
  const action = text(payload.action, 40);
  if (!videoId) throw new Response("videoId is required.", { status: 400 });
  const video = await loadVideoForRecap(database, videoId);
  if (!video) throw new Response("Video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  if (!canReviewVideoRecap(identity, { coachId: video.coach_id, memberId: video.member_id }, assignedMemberIds)) {
    throw new Response("You cannot edit this lesson recap.", { status: 403 });
  }
  const draft = await database
    .prepare("SELECT * FROM video_lesson_recap_drafts WHERE video_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
    .bind(video.id)
    .first<DraftRow>();
  if (!draft && action !== "retry") throw new Response("No AI recap draft exists yet.", { status: 404 });

  if (action === "saveDraft" && draft) {
    await database
      .prepare(
        `UPDATE video_lesson_recap_drafts SET
          lesson_summary = ?, worked_on = ?, key_issue = ?, improvement = ?,
          practice_assignment = ?, recommended_drill = ?, member_facing_notes = ?,
          next_session_goal = ?, status = 'ready_for_review', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        text(payload.lessonSummary),
        text(payload.workedOn),
        text(payload.keyIssue),
        text(payload.improvement),
        text(payload.practiceAssignment),
        text(payload.recommendedDrill),
        text(payload.memberFacingNotes),
        text(payload.nextSessionGoal),
        draft.id,
      )
      .run();
    await recordActivity({
      action: "coach_edited_recap",
      actor: identity,
      database,
      entityId: draft.id,
      entityType: "video_lesson_recap_draft",
      memberId: video.member_id,
      metadata: { videoId: video.id },
      summary: `${identity.displayName} edited the MAI Caddy lesson recap draft.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "editTranscript" && draft) {
    await database
      .prepare("UPDATE video_transcripts SET transcript_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(text(payload.transcriptText, 120_000), draft.transcript_id)
      .run();
    await recordActivity({
      action: "coach_edited_transcript",
      actor: identity,
      database,
      entityId: draft.transcript_id,
      entityType: "video_transcript",
      memberId: video.member_id,
      metadata: { videoId: video.id },
      summary: `${identity.displayName} edited a coach voiceover transcript.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "approveAndPublish" && draft) {
    if (video.upload_status !== "ready") throw new Response("Finish uploading the video before publishing the recap.", { status: 409 });
    const now = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          `UPDATE video_lesson_recap_drafts SET
            lesson_summary = ?, worked_on = ?, key_issue = ?, improvement = ?,
            practice_assignment = ?, recommended_drill = ?, member_facing_notes = ?,
            next_session_goal = ?, status = 'published', reviewed_by = ?, reviewed_at = ?,
            published_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          text(payload.lessonSummary),
          text(payload.workedOn),
          text(payload.keyIssue),
          text(payload.improvement),
          text(payload.practiceAssignment),
          text(payload.recommendedDrill),
          text(payload.memberFacingNotes),
          text(payload.nextSessionGoal),
          identity.id,
          now,
          now,
          draft.id,
        ),
      database
        .prepare(
          `UPDATE lesson_videos SET
            lesson_summary = ?, worked_on = ?, key_issue = ?, improvement = ?,
            practice_assignment = ?, recommended_drill = ?, member_facing_notes = ?,
            next_session_goal = ?, publication_status = 'Published', review_status = 'Coach Feedback',
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND member_id = ? AND coach_id = ?`,
        )
        .bind(
          text(payload.lessonSummary),
          text(payload.workedOn),
          text(payload.keyIssue),
          text(payload.improvement),
          text(payload.practiceAssignment),
          text(payload.recommendedDrill),
          text(payload.memberFacingNotes),
          text(payload.nextSessionGoal),
          video.id,
          video.member_id,
          video.coach_id,
        ),
      database
        .prepare("UPDATE video_ai_processing_jobs SET status = 'published', current_step = 'published', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(draft.processing_job_id),
    ]);
    await recordActivity({
      action: "coach_published_recap",
      actor: identity,
      database,
      entityId: draft.id,
      entityType: "video_lesson_recap_draft",
      memberId: video.member_id,
      metadata: { processingJobId: draft.processing_job_id, videoId: video.id },
      summary: `${identity.displayName} approved and published a coach-reviewed MAI Caddy recap.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "cancel" && draft) {
    await database
      .prepare("UPDATE video_ai_processing_jobs SET status = 'cancelled', current_step = 'cancelled', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(draft.processing_job_id)
      .run();
  }

  if (action === "markIncorrect" && draft) {
    await database.batch([
      database
        .prepare("UPDATE video_lesson_recap_drafts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(draft.id),
      database
        .prepare(
          `UPDATE video_ai_processing_jobs SET
            status = 'failed',
            current_step = 'coach_marked_incorrect',
            error_code = 'coach_marked_incorrect',
            error_message = 'Coach marked the generated lesson recap as incorrect.',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(draft.processing_job_id),
    ]);
    await recordActivity({
      action: "coach_marked_recap_incorrect",
      actor: identity,
      database,
      entityId: draft.id,
      entityType: "video_lesson_recap_draft",
      memberId: video.member_id,
      metadata: { videoId: video.id },
      summary: `${identity.displayName} marked a MAI Caddy recap draft as incorrect.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "retry") {
    await createVideoRecapProcessingJob(database, identity, video.id, true, text(payload.language, 12) || "en");
    await queueVideoRecapWorkflowAfterUpload(database, identity, video.id);
  }

  return readVideoRecapState(identity, video.id);
}
