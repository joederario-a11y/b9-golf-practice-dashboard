import OpenAI from "openai";

import {
  ACTIVE_VIDEO_RECAP_JOB_STATUSES,
  buildLessonRecapInput,
  buildTranscriptionPrompt,
  canReadApprovedVideoRecap,
  canReviewVideoRecap,
  DEFAULT_TRANSCRIPTION_MODEL,
  DEFAULT_VIDEO_RECAP_MODEL,
  emptyCoachInputDraft,
  lessonRecapJsonSchema,
  normalizeLessonRecapDraft,
  PUBLISHABLE_VIDEO_RECAP_DRAFT_STATUSES,
  shouldRequestVideoRecapProcessing,
  transcriptLooksUsable,
  VIDEO_RECAP_PROCESSING_TYPE,
  VIDEO_RECAP_PROMPT_VERSION,
} from "@/lib/video-ai-recap-policy.mjs";
import {
  canDirectTranscribeStoredMedia,
  MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES,
  mediaContainerFromMimeType,
  mediaProbeHasAudio,
  normalizeVideoProcessingSafeCode,
  transcriptionSizeLimitForMedia,
} from "@/lib/video-media-processing-policy.mjs";
import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import { sendVideoNotification } from "@/lib/server/video-email";
import {
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  ensureVideoAiProcessingSchema,
  getAssignedMemberIds,
  getOpenAIConfigurationIssue,
  getPlatformEnvironment,
  getRequiredDatabase,
  recordActivity,
  sanitizeOpenAIError,
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
  source_storage_path: string | null;
  source_file_name: string | null;
  source_file_size: number | null;
  source_mime_type: string | null;
  source_media_probe_json: string;
  playback_media_probe_json: string;
  duration: number;
  lesson_date: string | null;
  publication_status: string;
  upload_status: string;
  email_status: string;
  email_sent_at: string | null;
  email_failure_reason: string | null;
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
	  audio_deleted_at: string | null;
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

type AudioExtractionResult = {
  sourceAudioCodec?: string | null;
  sourceContainer?: string | null;
  sourceObjectKey?: string | null;
  paths: string[];
  source: "media_chunks" | "normalized_video_chunks" | "original_media";
  fallbackReason?: string;
};

type TranscriptionSegmentResult = {
  duration: number | null;
  model: string;
  segments: unknown[];
  text: string;
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
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
	  VIDEO_LESSON_RECAP_WORKFLOW?: {
	    create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
	    get(id: string): Promise<{ id: string; terminate(): Promise<void> }>;
	  };
  VIDEO_STORAGE: R2Bucket;
};

const MAX_TRANSCRIPTION_BYTES = MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES;
const MAX_MEDIA_AUDIO_CHUNK_SECONDS = 60;
const MAX_MEDIA_VIDEO_CHUNK_SECONDS = 10;
const MAX_MEDIA_AUDIO_TOTAL_SECONDS = 60 * 30;
const MEDIA_TRANSFORMATION_TIMEOUT_MS = 120_000;
const STALE_ACTIVE_JOB_MS = 15 * 60 * 1000;
const ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST = Array.from(ACTIVE_VIDEO_RECAP_JOB_STATUSES);
const SINGLE_ATTEMPT_WORKFLOW_STEP = {
  retries: {
    backoff: "constant" as const,
    delay: "1 second",
    limit: 1,
  },
  timeout: "3 minutes",
};

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

type StoredMediaProbe = {
  audioCodec?: string | null;
  audioTrackCount?: number | null;
  container?: string | null;
  durationSeconds?: number | null;
  mimeType?: string | null;
  objectKey?: string | null;
  objectSize?: number | null;
  videoCodec?: string | null;
  videoTrackCount?: number | null;
};

type VideoTranscriptionMediaSource = {
  audioCodec: string | null;
  container: string | null;
  fileName: string;
  label: "source" | "playback";
  mimeType: string;
  probe: StoredMediaProbe;
  storagePath: string;
};

function storedMediaProbe(value: string | null | undefined): StoredMediaProbe {
  const parsed = safeJson(value || "{}", {});
  return parsed && typeof parsed === "object" ? parsed as StoredMediaProbe : {};
}

function mediaProbeIsConclusive(probe: StoredMediaProbe) {
  return Boolean(probe.objectKey || probe.container || Number.isFinite(Number(probe.objectSize)) || Number.isFinite(Number(probe.audioTrackCount)));
}

function probeAudioCodec(probe: StoredMediaProbe) {
  return typeof probe.audioCodec === "string" && probe.audioCodec.trim() ? probe.audioCodec.trim() : null;
}

function probeContainer(probe: StoredMediaProbe, mimeType: string) {
  return typeof probe.container === "string" && probe.container.trim()
    ? probe.container.trim()
    : mediaContainerFromMimeType(mimeType) || null;
}

function videoWithTranscriptionSource(video: VideoRecapRow, source: VideoTranscriptionMediaSource): VideoRecapRow {
  return {
    ...video,
    file_name: source.fileName,
    mime_type: source.mimeType,
    storage_path: source.storagePath,
  };
}

function chooseVideoTranscriptionSource(video: VideoRecapRow): VideoTranscriptionMediaSource {
  const sourceStoragePath = text(video.source_storage_path, 600) || video.storage_path;
  const sourceMimeType = text(video.source_mime_type, 100) || video.mime_type;
  const sourceFileName = text(video.source_file_name, 180) || video.file_name;
  const sourceProbe = storedMediaProbe(video.source_media_probe_json);
  if (sourceStoragePath && (mediaProbeHasAudio(sourceProbe) || !mediaProbeIsConclusive(sourceProbe))) {
    return {
      audioCodec: probeAudioCodec(sourceProbe),
      container: probeContainer(sourceProbe, sourceMimeType),
      fileName: sourceFileName,
      label: "source",
      mimeType: sourceMimeType,
      probe: sourceProbe,
      storagePath: sourceStoragePath,
    };
  }

  const playbackProbe = storedMediaProbe(video.playback_media_probe_json);
  if (video.storage_path && mediaProbeHasAudio(playbackProbe)) {
    return {
      audioCodec: probeAudioCodec(playbackProbe),
      container: probeContainer(playbackProbe, video.mime_type),
      fileName: video.file_name,
      label: "playback",
      mimeType: video.mime_type,
      probe: playbackProbe,
      storagePath: video.storage_path,
    };
  }

  throw new RecapProcessingError("audio_track_missing", "The stored lesson video does not contain a detectable audio track.");
}

function displayName(row: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Unknown";
}

function combineRecapText(...values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map((value) => text(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .join("\n\n");
}

function jobError(error: unknown) {
  const message = error instanceof Error ? error.message : "Video AI processing failed.";
  const code = normalizeVideoProcessingSafeCode(error instanceof RecapProcessingError ? error.code : "processing_failed", message);
  const status = error instanceof RecapProcessingError ? error.status : "failed";
  return { code, message, status };
}

function systemActor(coachId?: string | null): AuthIdentity {
  return {
    displayName: "MAI Coach",
    email: "mai-caddy@system.local",
    firstName: "MAI",
    id: coachId ?? "system",
    lastName: "Caddy",
    passwordResetRequired: false,
    role: "coach",
  };
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

async function loadActiveJob(database: D1Database, videoId: string) {
  return database
    .prepare(
      `SELECT * FROM video_ai_processing_jobs
       WHERE video_id = ? AND processing_type = ? AND status IN (${ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST.map(() => "?").join(", ")})
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(videoId, VIDEO_RECAP_PROCESSING_TYPE, ...ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST)
    .first<ProcessingJobRow>();
}

async function coachRelationshipExists(database: D1Database, coachId: string | null, memberId: string) {
  if (!coachId) return false;
  const relationship = await database
    .prepare("SELECT id FROM coach_members WHERE member_id = ? AND coach_id = ?")
    .bind(memberId, coachId)
    .first<{ id: string }>();
  return Boolean(relationship);
}

async function assertCurrentCoachRelationship(database: D1Database, video: VideoRecapRow, status = 403) {
  if (!(await coachRelationshipExists(database, video.coach_id, video.member_id))) {
    throw new Response("The assigned coach is no longer connected to this member.", { status });
  }
}

async function assertWorkflowCanContinue(database: D1Database, jobId: string, video: VideoRecapRow) {
  const currentJob = await loadJob(database, jobId);
  if (!currentJob) throw new RecapProcessingError("invalid_processing_job", "The processing job no longer exists.");
  if (currentJob.status === "cancelled") {
    throw new RecapProcessingError("processing_cancelled", "The processing job was cancelled.", "cancelled");
  }
  if (currentJob.video_id !== video.id || currentJob.member_id !== video.member_id) {
    throw new RecapProcessingError("job_ownership_mismatch", "The processing job no longer matches the video ownership.");
  }
  if (!(await coachRelationshipExists(database, currentJob.coach_id, currentJob.member_id))) {
    throw new RecapProcessingError("coach_relationship_changed", "The coach is no longer assigned to this member.", "coach_relationship_changed");
  }
  return currentJob;
}

function assertDraftIsMutable(draft: DraftRow, action: string) {
  if (draft.status === "published") {
    throw new Response("Published and locked. Create a revision to make changes.", { status: 409 });
  }
  if (action === "approveAndPublish" && !PUBLISHABLE_VIDEO_RECAP_DRAFT_STATUSES.has(draft.status)) {
    throw new Response("Only drafts ready for review or needing coach input can be published.", { status: 409 });
  }
  if (["failed", "superseded"].includes(draft.status)) {
    throw new Response("This recap draft is closed. Create a revision before editing it.", { status: 409 });
  }
}

function assertRowsMatch(video: VideoRecapRow, draft?: DraftRow | null, transcript?: TranscriptRow | null, job?: ProcessingJobRow | null) {
  const rows = [draft, transcript, job].filter(Boolean) as Array<{ member_id: string; video_id: string }>;
  if (rows.some((row) => row.member_id !== video.member_id || row.video_id !== video.id)) {
    throw new Response("Recap ownership mismatch.", { status: 409 });
  }
  if (draft && transcript && draft.transcript_id !== transcript.id) {
    throw new Response("Transcript ownership mismatch.", { status: 409 });
  }
  if (draft && job && draft.processing_job_id !== job.id) {
    throw new Response("Processing job ownership mismatch.", { status: 409 });
  }
}

function transcriptionFileInfo(video: VideoRecapRow, storagePath: string) {
  if (storagePath.endsWith(".mp4")) return { name: "coach-video-clip.mp4", type: "video/mp4" };
  const sourceStoragePath = text(video.source_storage_path, 600) || video.storage_path;
  if (storagePath === sourceStoragePath) {
    const rawSourceMimeType = text(video.source_mime_type, 100) || text(video.mime_type, 100) || "video/mp4";
    const sourceMimeType = rawSourceMimeType.includes("quicktime") ? "video/mp4" : rawSourceMimeType;
    const sourceExtension = rawSourceMimeType.includes("quicktime") ? "mp4" : rawSourceMimeType.includes("webm") ? "webm" : "mp4";
    return {
      name: text(video.source_file_name, 180) || text(video.file_name, 180) || `coach-video.${sourceExtension}`,
      type: sourceMimeType,
    };
  }
  if (storagePath !== video.storage_path) return { name: "coach-voiceover.m4a", type: "audio/mp4" };
  const rawMimeType = text(video.mime_type, 100) || "video/mp4";
  const mimeType = rawMimeType.includes("quicktime") ? "video/mp4" : rawMimeType;
  const extension = rawMimeType.includes("quicktime") ? "mp4" : rawMimeType.includes("webm") ? "webm" : "mp4";
  return {
    name: text(video.file_name, 180) || `coach-video.${extension}`,
    type: mimeType,
  };
}

async function cleanupTemporaryAudio(env: RecapEnv, database: D1Database, jobOrId: ProcessingJobRow | string, actor?: AuthIdentity) {
  const job = typeof jobOrId === "string" ? await loadJob(database, jobOrId) : jobOrId;
  if (!job?.audio_storage_path) return false;
  const audioStoragePaths = job.audio_storage_path
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => path.startsWith("video-processing/"));
  if (!audioStoragePaths.length) return false;
  try {
    await Promise.all(audioStoragePaths.map((path) => env.VIDEO_STORAGE.delete(path)));
    await database
      .prepare("UPDATE video_ai_processing_jobs SET audio_storage_path = NULL, audio_deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(job.id)
      .run();
    await recordActivity({
      action: "temporary_audio_deleted",
      actor: actor ?? systemActor(job.coach_id),
      database,
      entityId: job.id,
      entityType: "video_ai_processing_job",
      memberId: job.member_id,
      metadata: { videoId: job.video_id },
      summary: "Temporary coach voiceover audio was deleted after processing.",
      targetUserId: job.member_id,
    });
    return true;
  } catch {
    await recordActivity({
      action: "temporary_audio_cleanup_failed",
      actor: actor ?? systemActor(job.coach_id),
      database,
      entityId: job.id,
      entityType: "video_ai_processing_job",
      memberId: job.member_id,
      metadata: { videoId: job.video_id },
      summary: "Temporary audio cleanup failed and should be retried.",
      targetUserId: job.member_id,
    });
    return false;
  }
}

async function recordProcessingEvent(database: D1Database, action: string, job: ProcessingJobRow, summary: string, metadata: Record<string, unknown> = {}) {
  await recordActivity({
    action,
    actor: systemActor(job.coach_id),
    database,
    entityId: job.id,
    entityType: "video_ai_processing_job",
    memberId: job.member_id,
    metadata: { processingVersion: job.processing_version, videoId: job.video_id, ...metadata },
    summary,
    targetUserId: job.member_id,
  });
}

function videoDurationChunks(video: VideoRecapRow, chunkSeconds: number) {
  const durationSeconds = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(Math.ceil(video.duration), MAX_MEDIA_AUDIO_TOTAL_SECONDS)
    : chunkSeconds;
  return {
    chunkCount: Math.max(1, Math.ceil(durationSeconds / chunkSeconds)),
    durationSeconds,
  };
}

function isQuickTimeVideo(video: VideoRecapRow) {
  return text(video.mime_type, 100).includes("quicktime");
}

async function deleteTemporaryPaths(env: RecapEnv, paths: string[]) {
  if (!paths.length) return;
  await Promise.all(paths.map((path) => env.VIDEO_STORAGE.delete(path).catch(() => undefined)));
}

async function mediaResponseWithTimeout(promise: Promise<Response>, code: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<Response>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new RecapProcessingError(code, "Cloudflare Media could not process this lesson video."));
        }, MEDIA_TRANSFORMATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function shouldPreferVideoChunkFallback(video: VideoRecapRow, sourceSize: number) {
  return !isQuickTimeVideo(video) && sourceSize > MAX_TRANSCRIPTION_BYTES * 20;
}

function canUseOriginalMediaFallback(video: VideoRecapRow, sourceSize: number, source: VideoTranscriptionMediaSource) {
  return canDirectTranscribeStoredMedia({
    hasAudio: mediaProbeHasAudio(source.probe) || !mediaProbeIsConclusive(source.probe),
    mimeType: video.mime_type,
    size: sourceSize,
  });
}

async function useOriginalMediaForTranscription(
  database: D1Database,
  job: ProcessingJobRow,
  video: VideoRecapRow,
  mediaSource: VideoTranscriptionMediaSource,
  source: string,
) {
  await markJob(database, job.id, {
    audioStoragePath: video.storage_path,
    status: "extracting_audio",
    step: "direct_media_fallback_ready_for_transcription",
  });
  await recordProcessingEvent(
    database,
    "direct_media_fallback_started",
    job,
    "Media audio extraction failed, so MAI Coach will transcribe the original uploaded source directly.",
    {
      source,
      sourceAudioCodec: mediaSource.audioCodec,
      sourceContainer: mediaSource.container,
      sourceType: mediaSource.label,
    },
  );
  return {
    fallbackReason: source,
    paths: [video.storage_path],
    source: "original_media",
    sourceAudioCodec: mediaSource.audioCodec,
    sourceContainer: mediaSource.container,
    sourceObjectKey: video.storage_path,
  } satisfies AudioExtractionResult;
}

function assertTemporaryAudioPath(video: VideoRecapRow, audioStoragePath: string) {
  const normalizedPath = text(audioStoragePath, 600);
  if (!normalizedPath.startsWith(`video-processing/${video.id}/audio/`)) {
    throw new Response("Audio repair path must point to private temporary audio for this video.", { status: 400 });
  }
  return normalizedPath;
}

async function loadCurrentTranscript(database: D1Database, video: VideoRecapRow) {
  return database
    .prepare(
      `SELECT * FROM video_transcripts
       WHERE video_id = ? AND member_id = ? AND is_current = 1
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(video.id, video.member_id)
    .first<TranscriptRow>();
}

async function cancelActiveProcessing(database: D1Database, identity: AuthIdentity, video: VideoRecapRow) {
  const job = await loadActiveJob(database, video.id);
  if (!job) return false;
  const runtime = getPlatformEnvironment() as RecapEnv;
  if (job.workflow_instance_id && runtime.VIDEO_LESSON_RECAP_WORKFLOW?.get) {
    const instance = await runtime.VIDEO_LESSON_RECAP_WORKFLOW.get(job.workflow_instance_id);
    await instance.terminate();
  }
  await cleanupTemporaryAudio(runtime, database, job, identity);
  await database
    .prepare(
      `UPDATE video_ai_processing_jobs
       SET status = 'cancelled',
           current_step = 'cancelled',
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN (${ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST.map(() => "?").join(", ")})`,
    )
    .bind(job.id, ...ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST)
    .run();
  await recordActivity({
    action: "processing_cancelled",
    actor: identity,
    database,
    entityId: job.id,
    entityType: "video_ai_processing_job",
    memberId: video.member_id,
    metadata: { videoId: video.id, workflowInstanceId: job.workflow_instance_id },
    summary: `${identity.displayName} cancelled MAI Coach voiceover processing.`,
    targetUserId: video.member_id,
  });
  return true;
}

async function regenerateRecapFromCurrentTranscript(database: D1Database, identity: AuthIdentity, video: VideoRecapRow, language: string) {
  const activeJob = await loadActiveJob(database, video.id);
  if (activeJob) throw new Response("MAI Coach processing is already active for this video.", { status: 409 });
  const transcript = await loadCurrentTranscript(database, video);
  if (!transcript) throw new Response("No saved transcript exists for this video yet.", { status: 404 });
  assertRowsMatch(video, null, transcript, null);
  const jobId = await createVideoRecapProcessingJob(database, identity, video.id, true, language);
  if (!jobId) throw new Response("MAI Coach processing could not be requested for this video.", { status: 409 });
  const job = await loadJob(database, jobId);
  if (!job) throw new Response("MAI Coach processing job could not be loaded.", { status: 500 });
  await markJob(database, job.id, { status: "generating_recap", step: "regenerating_recap_from_current_transcript" });
  await recordActivity({
    action: "processing_retried",
    actor: identity,
    database,
    entityId: job.id,
    entityType: "video_ai_processing_job",
    memberId: video.member_id,
    metadata: { retryType: "regenerate_from_transcript", transcriptId: transcript.id, videoId: video.id },
    summary: `${identity.displayName} requested a new MAI Coach recap from the saved transcript.`,
    targetUserId: video.member_id,
  });
  await generateRecapDraft(getPlatformEnvironment() as RecapEnv, database, job, video, {
    text: transcript.transcript_text,
    transcriptId: transcript.id,
  });
}

async function processExistingAudioForRecap(database: D1Database, identity: AuthIdentity, video: VideoRecapRow, language: string, audioStoragePath: string) {
  const runtime = getPlatformEnvironment() as RecapEnv;
  const normalizedAudioPath = assertTemporaryAudioPath(video, audioStoragePath);
  const activeJob = await loadActiveJob(database, video.id);
  if (activeJob) throw new Response("MAI Coach processing is already active for this video.", { status: 409 });
  const audioObject = await runtime.VIDEO_STORAGE.head(normalizedAudioPath);
  if (!audioObject) throw new Response("The extracted repair audio was not found in private storage.", { status: 404 });
  if (audioObject.size > MAX_TRANSCRIPTION_BYTES) {
    throw new Response("The extracted repair audio is too large for transcription.", { status: 413 });
  }
  const jobId = await createVideoRecapProcessingJob(database, identity, video.id, true, language);
  if (!jobId) throw new Response("MAI Coach processing could not be requested for this video.", { status: 409 });
  const job = await loadJob(database, jobId);
  if (!job) throw new Response("MAI Coach processing job could not be loaded.", { status: 500 });
  await markJob(database, job.id, {
    audioStoragePath: normalizedAudioPath,
    status: "transcribing",
    step: "using_preextracted_audio_for_retry",
  });
  await recordActivity({
    action: "processing_retried",
    actor: identity,
    database,
    entityId: job.id,
    entityType: "video_ai_processing_job",
    memberId: video.member_id,
    metadata: { retryType: "preextracted_audio", videoId: video.id },
    summary: `${identity.displayName} requested MAI Coach processing from pre-extracted private lesson audio.`,
    targetUserId: video.member_id,
  });
  const transcript = await transcribeAudio(runtime, database, job, video, {
    paths: [normalizedAudioPath],
    source: "media_chunks",
  });
  const draftId = await generateRecapDraft(runtime, database, job, video, transcript);
  await recordActivity({
    action: "recap_revision_created",
    actor: systemActor(job.coach_id),
    database,
    entityId: draftId,
    entityType: "video_lesson_recap_draft",
    memberId: video.member_id,
    metadata: { processingJobId: job.id, transcriptId: transcript.transcriptId, videoId: video.id },
    summary: "MAI Coach created a coach-review lesson recap draft.",
    targetUserId: video.member_id,
  });
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
        completed_at = CASE WHEN ? IN ('ready_for_review', 'failed', 'no_usable_audio', 'cancelled', 'coach_relationship_changed', 'published') THEN CURRENT_TIMESTAMP ELSE completed_at END,
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
  const processingCoachId = identity.role === "coach" ? identity.id : video.coach_id;
  if (!(await coachRelationshipExists(database, processingCoachId, video.member_id))) {
    throw new Response("A current assigned coach is required before AI processing can start.", { status: 403 });
  }
  const activeJob = await loadActiveJob(database, video.id);
  if (activeJob) return activeJob.id;
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
    .bind(jobId, video.id, video.member_id, processingCoachId, VIDEO_RECAP_PROCESSING_TYPE, processingVersion, language)
    .run();
  await recordActivity({
    action: "ai_processing_requested",
    actor: identity,
    database,
    entityId: jobId,
    entityType: "video_ai_processing_job",
    memberId: video.member_id,
    metadata: { coachId: processingCoachId, processingVersion, videoId: video.id },
    summary: `${identity.displayName} requested a MAI Coach lesson recap from coach voiceover.`,
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
       WHERE video_id = ? AND status IN (${ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST.map(() => "?").join(", ")})
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(video.id, ...ACTIVE_VIDEO_RECAP_JOB_STATUS_LIST)
    .first<ProcessingJobRow>();
  if (!job) return null;
  if (!(await coachRelationshipExists(database, job.coach_id, job.member_id))) {
    await markJob(database, job.id, {
      errorCode: "coach_relationship_changed",
      errorMessage: "The coach is no longer assigned to this member.",
      status: "coach_relationship_changed",
      step: "coach_relationship_changed",
    });
    return { jobId: job.id, queued: false };
  }
  if (job.workflow_instance_id) {
    return { jobId: job.id, queued: true, workflowInstanceId: job.workflow_instance_id };
  }

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
        coachId: job.coach_id,
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
      summary: `${identity.displayName} queued MAI Coach voiceover processing.`,
      targetUserId: video.member_id,
    });
    return { jobId: job.id, queued: true, workflowInstanceId: instance.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow could not be started.";
    const existing = await loadJob(database, job.id);
    if (existing?.workflow_instance_id) {
      return { jobId: job.id, queued: true, workflowInstanceId: existing.workflow_instance_id };
    }
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
  if (video.member_id !== params.memberId) {
    throw new RecapProcessingError("video_ownership_changed", "The video ownership changed during processing.");
  }
  if (video.storage_path !== params.storagePath) {
    throw new RecapProcessingError("storage_path_mismatch", "The stored video path does not match the processing request.");
  }
  if (video.upload_status !== "ready") {
    throw new RecapProcessingError("video_not_ready", "The video upload is not ready yet.");
  }
  if (!(await coachRelationshipExists(database, params.coachId, video.member_id))) {
    throw new RecapProcessingError("coach_relationship_changed", "The coach is no longer assigned to this member.", "coach_relationship_changed");
  }
  return { job, video };
}

async function normalizeVideoChunksForTranscription(
  env: RecapEnv,
  database: D1Database,
  job: ProcessingJobRow,
  video: VideoRecapRow,
  sourceSize: number,
) {
  const normalizedVideoPaths: string[] = [];
  try {
    const { chunkCount, durationSeconds } = videoDurationChunks(video, MAX_MEDIA_VIDEO_CHUNK_SECONDS);
    await recordProcessingEvent(
      database,
      "audio_extraction_fallback_video_chunks",
      job,
      "Media audio extraction failed, so MAI Coach will normalize short private video clips for transcription.",
      {
        chunks: chunkCount,
        sourceMimeType: text(video.mime_type, 100) || "unknown",
        sourceSize,
      },
    );
    for (let index = 0; index < chunkCount; index += 1) {
      await assertWorkflowCanContinue(database, job.id, video);
      const chunkSource = await env.VIDEO_STORAGE.get(video.storage_path);
      if (!chunkSource?.body) throw new RecapProcessingError("video_missing_from_r2", "The source video could not be found in private R2.");
      const startSeconds = index * MAX_MEDIA_VIDEO_CHUNK_SECONDS;
      const chunkDuration = Math.max(1, Math.min(MAX_MEDIA_VIDEO_CHUNK_SECONDS, durationSeconds - startSeconds));
      await markJob(database, job.id, {
        status: "extracting_audio",
        step: `normalizing_video_chunk_${index + 1}_of_${chunkCount}`,
      });
      const videoResponse = await mediaResponseWithTimeout(
        env.MEDIA!.input(chunkSource.body).output({
          audio: true,
          duration: `${chunkDuration}s`,
          mode: "video",
          time: `${startSeconds}s`,
        }).response(),
        "mp4_fallback_timeout",
      );
      if (!videoResponse.ok || !videoResponse.body) {
        throw new RecapProcessingError("cloudflare_normalization_failed", "Cloudflare Media could not normalize this video for transcription.");
      }
      const normalizedVideoPath = `video-processing/${video.id}/media/${job.id}-part-${index + 1}.mp4`;
      await env.VIDEO_STORAGE.put(normalizedVideoPath, videoResponse.body, {
        httpMetadata: { contentType: videoResponse.headers.get("content-type") || "video/mp4" },
        customMetadata: {
          coachId: job.coach_id,
          fallback: "video_chunk",
          jobId: job.id,
          memberId: video.member_id,
          part: String(index + 1),
          videoId: video.id,
        },
      });
      normalizedVideoPaths.push(normalizedVideoPath);
    }
    await markJob(database, job.id, {
      audioStoragePath: normalizedVideoPaths.join("\n"),
      status: "extracting_audio",
      step: "video_chunk_normalization_completed",
    });
    await recordProcessingEvent(
      database,
      "audio_extraction_fallback_video_completed",
      job,
      "MAI Coach created temporary MP4 clips for transcription after audio extraction failed.",
      { chunks: normalizedVideoPaths.length },
    );
    return {
      paths: normalizedVideoPaths,
      source: "normalized_video_chunks",
      sourceAudioCodec: "aac",
      sourceContainer: "mp4",
      sourceObjectKey: normalizedVideoPaths[0] ?? null,
    } satisfies AudioExtractionResult;
  } catch (error) {
    await deleteTemporaryPaths(env, normalizedVideoPaths);
    if (error instanceof RecapProcessingError) throw error;
    throw new RecapProcessingError("cloudflare_normalization_failed", "Cloudflare Media could not normalize this video for transcription.");
  }
}

async function extractAudio(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow) {
  await assertWorkflowCanContinue(database, job.id, video);
  await markJob(database, job.id, { status: "extracting_audio", step: "extracting_coach_audio" });
  await recordProcessingEvent(database, "audio_extraction_started", job, "MAI Coach started extracting coach voiceover audio.");
  const selectedSource = chooseVideoTranscriptionSource(video);
  const sourceVideo = videoWithTranscriptionSource(video, selectedSource);
  const object = await env.VIDEO_STORAGE.get(sourceVideo.storage_path);
  if (!object?.body) {
    throw new RecapProcessingError(
      selectedSource.label === "source" ? "source_object_missing" : "media_object_missing",
      "The selected lesson media could not be found in private storage.",
    );
  }
  await markJob(database, job.id, {
    status: "extracting_audio",
    step: `audio_source_confirmed_${selectedSource.label}`,
  });
  await recordProcessingEvent(
    database,
    "audio_source_confirmed",
    job,
    "MAI Coach confirmed the lesson media source for transcription.",
    {
      audioCodec: selectedSource.audioCodec,
      container: selectedSource.container,
      objectSize: object.size,
      sourceType: selectedSource.label,
    },
  );
  if (!env.MEDIA) {
    if (canUseOriginalMediaFallback(sourceVideo, object.size, selectedSource)) {
      return useOriginalMediaForTranscription(database, job, sourceVideo, selectedSource, "audio_extraction_failed");
    }
    throw new RecapProcessingError("audio_extraction_failed", "Cloudflare Media audio extraction is unavailable.");
  }
  const audioStoragePaths: string[] = [];
  try {
    if (shouldPreferVideoChunkFallback(sourceVideo, object.size)) {
      try {
        await markJob(database, job.id, { status: "extracting_audio", step: "using_video_chunk_fallback_for_quicktime" });
        return await normalizeVideoChunksForTranscription(env, database, job, sourceVideo, object.size);
      } catch (error) {
        if (canUseOriginalMediaFallback(sourceVideo, object.size, selectedSource)) {
          return useOriginalMediaForTranscription(database, job, sourceVideo, selectedSource, error instanceof RecapProcessingError ? error.code : "media_normalization_failed");
        }
        throw error;
      }
    }
    const { chunkCount, durationSeconds } = videoDurationChunks(sourceVideo, MAX_MEDIA_AUDIO_CHUNK_SECONDS);
    for (let index = 0; index < chunkCount; index += 1) {
      await assertWorkflowCanContinue(database, job.id, sourceVideo);
      const chunkSource = index === 0 ? object : await env.VIDEO_STORAGE.get(sourceVideo.storage_path);
      if (!chunkSource?.body) throw new RecapProcessingError("source_object_missing", "The source video could not be found in private R2.");
      const startSeconds = index * MAX_MEDIA_AUDIO_CHUNK_SECONDS;
      const chunkDuration = Math.max(1, Math.min(MAX_MEDIA_AUDIO_CHUNK_SECONDS, durationSeconds - startSeconds));
      await markJob(database, job.id, {
        status: "extracting_audio",
        step: `extracting_audio_chunk_${index + 1}_of_${chunkCount}`,
      });
      const audioResponse = await mediaResponseWithTimeout(
        env.MEDIA.input(chunkSource.body).output({
          mode: "audio",
          time: `${startSeconds}s`,
          duration: `${chunkDuration}s`,
          format: "m4a",
        }).response(),
        "audio_extraction_timeout",
      );
      if (!audioResponse.ok || !audioResponse.body) {
        throw new RecapProcessingError("cloudflare_normalization_failed", "Cloudflare Media could not prepare the audio from this video.");
      }
      const audioStoragePath = `video-processing/${video.id}/audio/${job.id}-part-${index + 1}.m4a`;
      await env.VIDEO_STORAGE.put(audioStoragePath, audioResponse.body, {
        httpMetadata: { contentType: audioResponse.headers.get("content-type") || "audio/mp4" },
        customMetadata: {
          coachId: job.coach_id,
          jobId: job.id,
          memberId: video.member_id,
          part: String(index + 1),
          videoId: video.id,
        },
      });
      audioStoragePaths.push(audioStoragePath);
    }
    await markJob(database, job.id, { audioStoragePath: audioStoragePaths.join("\n"), status: "extracting_audio", step: "audio_extraction_completed" });
    await recordProcessingEvent(database, "audio_extraction_completed", job, "MAI Coach extracted temporary coach voiceover audio.", { chunks: audioStoragePaths.length });
    return {
      paths: audioStoragePaths,
      source: "media_chunks",
      sourceAudioCodec: "aac",
      sourceContainer: "audio/mp4",
      sourceObjectKey: audioStoragePaths[0] ?? null,
    } satisfies AudioExtractionResult;
  } catch (error) {
    await deleteTemporaryPaths(env, audioStoragePaths);
    if (isQuickTimeVideo(sourceVideo)) {
      try {
        return await normalizeVideoChunksForTranscription(env, database, job, sourceVideo, object.size);
      } catch (fallbackError) {
        if (canUseOriginalMediaFallback(sourceVideo, object.size, selectedSource)) {
          return useOriginalMediaForTranscription(database, job, sourceVideo, selectedSource, fallbackError instanceof RecapProcessingError ? fallbackError.code : "media_normalization_failed");
        }
        throw fallbackError;
      }
    }
    if (canUseOriginalMediaFallback(sourceVideo, object.size, selectedSource)) {
      return useOriginalMediaForTranscription(database, job, sourceVideo, selectedSource, error instanceof RecapProcessingError ? error.code : "audio_extraction_failed");
    }
    return normalizeVideoChunksForTranscription(env, database, job, sourceVideo, object.size);
  }
}

async function transcribeAudioSegment(
  env: RecapEnv,
  video: VideoRecapRow,
  job: ProcessingJobRow,
  audioStoragePath: string,
): Promise<TranscriptionSegmentResult> {
  const configurationIssue = getOpenAIConfigurationIssue(env);
  if (configurationIssue) {
    throw new RecapProcessingError(configurationIssue.code, configurationIssue.publicMessage);
  }
  const audioObject = await env.VIDEO_STORAGE.get(audioStoragePath);
  if (!audioObject) throw new RecapProcessingError("audio_missing_from_r2", "Extracted audio could not be loaded.");
  const isOriginalMedia = audioStoragePath === video.storage_path;
  const sizeLimit = transcriptionSizeLimitForMedia({
    isOriginalMedia,
    mimeType: video.mime_type,
    size: audioObject.size,
  });
  if (audioObject.size > sizeLimit) {
    throw new RecapProcessingError("transcription_file_too_large", "The lesson media is too large for transcription.");
  }
  const model = env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
  const form = new FormData();
  const audioBytes = await audioObject.arrayBuffer();
  const fileInfo = transcriptionFileInfo(video, audioStoragePath);
  form.append("file", new File([audioBytes], fileInfo.name, { type: fileInfo.type }));
  form.append("model", model);
  form.append("language", job.requested_language || "en");
  form.append("prompt", buildTranscriptionPrompt());
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      body: form,
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY?.trim()}` },
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new RecapProcessingError(
      timedOut ? "transcription_timeout" : "transcription_request_failed",
      "MAI Coach transcription is temporarily unavailable.",
    );
  }
  const payload = await response.json().catch(() => ({})) as { text?: string; duration?: number; segments?: unknown; error?: { message?: string } };
  if (!response.ok) {
    const diagnostic = sanitizeOpenAIError({ status: response.status, error: payload.error ?? payload }, {
      endpoint: "audio/transcriptions",
      model,
      operation: "video_lesson_transcription",
    });
    console.warn("MAI Coach transcription diagnostic", {
      category: diagnostic.category,
      httpStatus: diagnostic.httpStatus,
      errorType: diagnostic.errorType,
      errorCode: diagnostic.errorCode,
      requestId: diagnostic.requestId,
      model: diagnostic.model,
    });
    const category = isOriginalMedia
      ? normalizeVideoProcessingSafeCode("direct_transcription_rejected", payload.error?.message)
      : normalizeVideoProcessingSafeCode(diagnostic.category || "transcription_failed", payload.error?.message);
    throw new RecapProcessingError(category, "MAI Coach transcription is temporarily unavailable.");
  }
  return {
    duration: Number.isFinite(payload.duration) ? Number(payload.duration) : null,
    model,
    segments: Array.isArray(payload.segments) ? payload.segments : [],
    text: text(payload.text, 120_000),
  };
}

async function transcribeAudio(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow, audio: AudioExtractionResult) {
  await assertWorkflowCanContinue(database, job.id, video);
  await markJob(database, job.id, { status: "transcribing", step: "transcribing_coach_feedback" });
  await recordProcessingEvent(database, "transcription_started", job, "MAI Coach started transcribing coach voiceover audio.", { chunks: audio.paths.length, source: audio.source });
  const transcriptionStartedAt = new Date().toISOString();
  const results: TranscriptionSegmentResult[] = [];
  for (const [index, audioStoragePath] of audio.paths.entries()) {
    await assertWorkflowCanContinue(database, job.id, video);
    await markJob(database, job.id, {
      status: "transcribing",
      step: audio.paths.length > 1 ? `transcribing_audio_chunk_${index + 1}_of_${audio.paths.length}` : "transcribing_coach_feedback",
    });
    results.push(await transcribeAudioSegment(env, video, job, audioStoragePath));
  }
  const transcriptText = text(results.map((result) => result.text).filter(Boolean).join("\n\n"), 120_000);
  if (!transcriptLooksUsable(transcriptText)) {
    throw new RecapProcessingError("transcript_empty", "MAI Coach could not detect enough coach voiceover in this video.", "no_usable_audio");
  }
  const segments = results.flatMap((result) => result.segments);
  const duration = results.reduce((total, result) => total + (Number.isFinite(result.duration) ? Number(result.duration) : 0), 0);
  const model = results[0]?.model || env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
  const transcriptId = crypto.randomUUID();
  await assertWorkflowCanContinue(database, job.id, video);
  await database.prepare("UPDATE video_transcripts SET is_current = 0, updated_at = CURRENT_TIMESTAMP WHERE video_id = ?")
    .bind(video.id)
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
	      job.coach_id,
      transcriptText,
      JSON.stringify(segments),
      job.requested_language || "en",
      model,
      duration > 0 ? duration : null,
      job.id,
      job.processing_version,
      JSON.stringify({
        audioDurationSeconds: duration > 0 ? duration : null,
        chunks: audio.paths.length,
        fallbackReason: audio.fallbackReason ?? null,
        source: "openai_audio_transcription",
        transcriptionSourceAudioCodec: audio.sourceAudioCodec ?? null,
        transcriptionSourceContainer: audio.sourceContainer ?? null,
        transcriptionSourceObjectKey: audio.sourceObjectKey ?? audio.paths[0] ?? null,
        transcriptCharacterCount: transcriptText.length,
        transcriptionCompletedAt: new Date().toISOString(),
        transcriptionModel: model,
        transcriptionStartedAt,
        transcriptionSource: audio.source,
        transcriptWordCount: transcriptText.split(/\s+/).filter(Boolean).length,
        usable: transcriptLooksUsable(transcriptText),
      }),
    )
    .run();
  await markJob(database, job.id, { status: "transcribing", step: "transcription_completed" });
  await recordProcessingEvent(database, "transcription_completed", job, "MAI Coach stored the coach voiceover transcript.", { transcriptId });
  await cleanupTemporaryAudio(env, database, job.id);
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
        lessonSummary: video.lesson_summary,
        mainFocus: combineRecapText(video.worked_on, video.key_issue),
        progressObserved: video.improvement,
        practiceNext: combineRecapText(video.practice_assignment, video.recommended_drill),
        nextSessionGoal: video.next_session_goal,
      },
    },
    linkedSession,
    transcript: transcriptText,
  };
}

async function generateRecapDraft(env: RecapEnv, database: D1Database, job: ProcessingJobRow, video: VideoRecapRow, transcript: { transcriptId: string; text: string }) {
  await assertWorkflowCanContinue(database, job.id, video);
  await markJob(database, job.id, { status: "generating_recap", step: "creating_mai_caddy_recap" });
  await recordProcessingEvent(database, "recap_generation_started", job, "MAI Coach started generating a coach-review lesson recap.");
  const model = env.OPENAI_ANALYSIS_MODEL || env.OPENAI_MODEL || DEFAULT_VIDEO_RECAP_MODEL;
  const normalizedDraft = transcriptLooksUsable(transcript.text)
    ? await (async () => {
      const configurationIssue = getOpenAIConfigurationIssue(env);
      if (configurationIssue) {
        throw new RecapProcessingError(configurationIssue.code, configurationIssue.publicMessage);
      }
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY?.trim(), timeout: 45000 });
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
      if (!outputText) throw new RecapProcessingError("empty_recap_response", "MAI Coach did not return a recap draft.");
      return normalizeLessonRecapDraft(JSON.parse(outputText) as unknown);
    })()
    : emptyCoachInputDraft();

  const status = normalizedDraft.needsCoachInput ? "needs_coach_input" : "ready_for_review";
  const draftId = crypto.randomUUID();
  await assertWorkflowCanContinue(database, job.id, video);
  await database.prepare("UPDATE video_lesson_recap_drafts SET is_current = 0, status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND status NOT IN ('approved', 'published')")
    .bind(video.id)
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
	      job.coach_id,
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
    status: "ready_for_review",
    step: status === "needs_coach_input" ? "needs_coach_review" : "ready_for_coach_review",
  });
  await recordProcessingEvent(database, "recap_generation_completed", job, "MAI Coach created a coach-review lesson recap draft.", { draftId, transcriptId: transcript.transcriptId });
  return draftId;
}

export async function runVideoLessonRecapWorkflow(env: RecapEnv, event: WorkflowEvent, step: WorkflowStep) {
  const params = event.payload ?? event.params;
  if (!params?.processingJobId || !params.videoId) throw new Error("Workflow payload is missing processing identifiers.");
  const database = env.DB;
  await prepareDatabase(database);
  try {
    const { job, video } = await step.do("Validate video and authorization", () => validateWorkflowInputs(database, params));
    const audioPath = await step.do("Extract coach audio", SINGLE_ATTEMPT_WORKFLOW_STEP, () => extractAudio(env, database, job, video));
    await step.do("Recheck processing authorization before transcription", () => assertWorkflowCanContinue(database, job.id, video));
    const transcript = await step.do("Transcribe coach feedback", SINGLE_ATTEMPT_WORKFLOW_STEP, () => transcribeAudio(env, database, job, video, audioPath));
    await step.do("Recheck processing authorization before recap generation", () => assertWorkflowCanContinue(database, job.id, video));
    const draftId = await step.do("Create MAI Coach recap draft", SINGLE_ATTEMPT_WORKFLOW_STEP, () => generateRecapDraft(env, database, job, video, transcript));
    await step.do("Record recap generation completed", async () => {
      await recordActivity({
            action: "recap_revision_created",
        actor: {
          displayName: "MAI Coach",
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
        summary: "MAI Coach created a coach-review lesson recap draft.",
        targetUserId: video.member_id,
      });
    });
  } catch (error) {
    const safe = jobError(error);
    await cleanupTemporaryAudio(env, database, params.processingJobId);
    await markJob(database, params.processingJobId, {
      errorCode: safe.code,
      errorMessage: safe.message,
      status: safe.status,
      step: safe.status === "no_usable_audio"
        ? "no_usable_audio_detected"
        : safe.status === "coach_relationship_changed"
          ? "coach_relationship_changed"
          : safe.status === "cancelled"
            ? "cancelled"
            : "failed",
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
    publishedAt: row.published_at,
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

function activeJobIsStale(row: ProcessingJobRow | null) {
  if (!row || !ACTIVE_VIDEO_RECAP_JOB_STATUSES.has(row.status)) return false;
  const updatedAt = new Date(row.updated_at).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_ACTIVE_JOB_MS;
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
    : canReview
      ? await loadCurrentTranscript(database, video)
      : null;
  if (draft || transcript || job) assertRowsMatch(video, draft ?? null, transcript ?? null, job ?? null);
  if (draft && draft.status !== "published" && identity.role === "coach" && !canReview) {
    throw new Response("You do not have access to this lesson recap.", { status: 403 });
  }

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
      emailStatus: video.email_status,
      emailSentAt: video.email_sent_at,
      emailFailureReason: video.email_failure_reason,
    },
  });
}

export async function updateVideoRecapState(identity: AuthIdentity, payload: Record<string, unknown>, request?: Request) {
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
  if (!draft && !["cancelProcessing", "processExistingAudio", "regenerateRecapFromTranscript", "retry", "retranscribeVideo"].includes(action)) {
    throw new Response("No AI recap draft exists yet.", { status: 404 });
  }
  const transcript = draft
    ? await database.prepare("SELECT * FROM video_transcripts WHERE id = ?").bind(draft.transcript_id).first<TranscriptRow>()
    : await loadCurrentTranscript(database, video);
  const draftJob = draft ? await loadJob(database, draft.processing_job_id) : null;
  if (draft || transcript || draftJob) assertRowsMatch(video, draft ?? null, transcript ?? null, draftJob ?? null);

  if (action === "saveDraft" && draft) {
    assertDraftIsMutable(draft, action);
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
      summary: `${identity.displayName} edited the MAI Coach lesson recap draft.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "editTranscript" && draft) {
    assertDraftIsMutable(draft, action);
    await database
      .prepare("UPDATE video_transcripts SET transcript_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND video_id = ? AND member_id = ?")
      .bind(text(payload.transcriptText, 120_000), draft.transcript_id, video.id, video.member_id)
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

  if (action === "approveAndPublish" && draft?.status === "published") {
    return readVideoRecapState(identity, video.id);
  }

  if (action === "approveAndPublish" && draft) {
    assertDraftIsMutable(draft, action);
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
	           WHERE id = ? AND member_id = ?`,
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
	        ),
      database
        .prepare("UPDATE video_ai_processing_jobs SET status = 'published', current_step = 'published', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(draft.processing_job_id),
    ]);
    await recordActivity({
      action: "recap_published",
      actor: identity,
      database,
      entityId: draft.id,
      entityType: "video_lesson_recap_draft",
      memberId: video.member_id,
      metadata: { processingJobId: draft.processing_job_id, videoId: video.id },
      summary: `${identity.displayName} approved and published a coach-reviewed MAI Coach recap.`,
      targetUserId: video.member_id,
    });

    if (request && payload.notifyMember !== false) {
      let notificationStatus = "Not sent";
      let emailSentAt: string | null = null;
      let emailFailureReason: string | null = null;
      try {
        const notification = await sendVideoNotification(
          request,
          identity,
          {
            email: video.member_email,
            firstName: video.member_first_name,
            lastName: video.member_last_name,
          },
          {
            id: video.id,
            memberId: video.member_id,
            title: video.title,
            lessonSummary: text(payload.lessonSummary),
            memberFacingNotes: text(payload.memberFacingNotes),
            practiceAssignment: text(payload.practiceAssignment),
          },
        );
        notificationStatus = notification.status;
        emailSentAt = notification.status === "Sent" ? new Date().toISOString() : null;
        emailFailureReason = "failureReason" in notification ? notification.failureReason : null;
      } catch {
        notificationStatus = "Failed";
        emailFailureReason = "notification_failed";
      }
      await database
        .prepare(
          `UPDATE lesson_videos SET
            email_status = ?, email_sent_at = ?, email_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND member_id = ?`,
        )
        .bind(notificationStatus, emailSentAt, emailFailureReason, video.id, video.member_id)
        .run();
    }
  }

  if (action === "cancel" && draft) {
    assertDraftIsMutable(draft, action);
    await database
      .prepare("UPDATE video_ai_processing_jobs SET status = 'cancelled', current_step = 'cancelled', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(draft.processing_job_id)
      .run();
  }

  if (action === "markIncorrect" && draft) {
    assertDraftIsMutable(draft, action);
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
      summary: `${identity.displayName} marked a MAI Coach recap draft as incorrect.`,
      targetUserId: video.member_id,
    });
  }

  if (action === "cancelProcessing") {
    await cancelActiveProcessing(database, identity, video);
  }

  if (action === "regenerateRecapFromTranscript") {
    await regenerateRecapFromCurrentTranscript(database, identity, video, text(payload.language, 12) || "en");
  }

  if (action === "processExistingAudio") {
    await processExistingAudioForRecap(
      database,
      identity,
      video,
      text(payload.language, 12) || "en",
      text(payload.audioStoragePath, 600),
    );
  }

  if (action === "retry" || action === "retranscribeVideo") {
    if (action === "retry" && transcript && draft && ["ready_for_review", "needs_coach_input", "approved", "published"].includes(draft.status)) {
      return readVideoRecapState(identity, video.id);
    }
    const activeJob = await loadActiveJob(database, video.id);
    if (activeJob) {
      if (!activeJobIsStale(activeJob)) return readVideoRecapState(identity, video.id);
      await markJob(database, activeJob.id, {
        errorCode: "stale_processing_retried",
        errorMessage: "Previous processing stopped before completion and was retried.",
        status: "failed",
        step: "retry_requeued_stale_job",
      });
    }
    const jobId = await createVideoRecapProcessingJob(database, identity, video.id, true, text(payload.language, 12) || "en");
    if (jobId) {
      const job = await loadJob(database, jobId);
      if (job) {
        await recordActivity({
          action: "processing_retried",
          actor: identity,
          database,
          entityId: job.id,
          entityType: "video_ai_processing_job",
          memberId: video.member_id,
          metadata: { retryType: "retranscribe_video", videoId: video.id },
          summary: `${identity.displayName} requested MAI Coach retranscription from the original video.`,
          targetUserId: video.member_id,
        });
        await recordActivity({
          action: "transcript_revision_created",
          actor: identity,
          database,
          entityId: job.id,
          entityType: "video_ai_processing_job",
          memberId: video.member_id,
          metadata: { videoId: video.id },
          summary: `${identity.displayName} started a new transcript revision for a lesson video.`,
          targetUserId: video.member_id,
        });
      }
      await queueVideoRecapWorkflowAfterUpload(database, identity, video.id);
    }
  }

  return readVideoRecapState(identity, video.id);
}
