import { canManageVideo } from "@/lib/video-policy.mjs";
import {
  ensurePlatformSchema,
  getAssignedMemberIds,
  getPlatformEnvironment,
  getRequiredDatabase,
  getRequiredVideoStorage,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import {
  inferCodecProbeFromBytes,
  mediaContainerFromMimeType,
} from "@/lib/video-media-processing-policy.mjs";

type RouteContext = {
  params: Promise<{ videoId: string }> | { videoId: string };
};

type DiagnosticVideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  uploaded_by_role: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  duration: number;
  publication_status: string;
  upload_status: string;
  created_at: string;
  updated_at: string;
};

type DiagnosticJobRow = {
  id: string;
  status: string;
  current_step: string;
  workflow_instance_id: string | null;
  audio_storage_path: string | null;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type DiagnosticTranscriptRow = {
  transcript_text: string;
  created_at: string;
  duration_seconds: number | null;
  model: string;
  quality_json: string;
};

type DiagnosticDraftRow = {
  status: string;
  created_at: string;
  updated_at: string;
};

function devDiagnosticsEnabled(request: Request) {
  const runtime = getPlatformEnvironment();
  const host = new URL(request.url).host;
  return runtime.DEV_OPENAI_DIAGNOSTICS_ENABLED === "true" && host.includes("mai-coach-dev");
}

function stepReached(job: DiagnosticJobRow | null, patterns: RegExp[]) {
  const value = `${job?.status ?? ""} ${job?.current_step ?? ""}`.toLowerCase();
  return patterns.some((pattern) => pattern.test(value));
}

function safeJson(value: string | null | undefined) {
  try {
    return value ? JSON.parse(value) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function likelyOriginalObjectKeys(video: DiagnosticVideoRow) {
  const directory = video.storage_path.split("/").slice(0, -1).join("/");
  if (!directory) return [];
  const originalFromOptimized = video.file_name.replace(/-optimized\.webm$/i, ".mov");
  return Array.from(new Set([
    `${directory}/original`,
    `${directory}/source`,
    `${directory}/${originalFromOptimized}`,
    `${directory}/${originalFromOptimized.replace(/\.mov$/i, ".mp4")}`,
  ]));
}

async function probeStoredMedia(bucket: R2Bucket, video: DiagnosticVideoRow) {
  try {
    const object = await bucket.get(video.storage_path, { range: { offset: 0, length: 1024 * 1024 } });
    const bytes = object ? new Uint8Array(await object.arrayBuffer()) : null;
    return inferCodecProbeFromBytes(bytes, video.mime_type, video.duration);
  } catch {
    return {
      audioCodec: undefined,
      container: mediaContainerFromMimeType(video.mime_type),
      durationSeconds: Number.isFinite(Number(video.duration)) && Number(video.duration) > 0 ? Number(video.duration) : null,
      hasAudio: false,
      hasVideo: false,
      videoCodec: undefined,
    };
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    if (!devDiagnosticsEnabled(request)) {
      return Response.json({ error: "Video processing diagnostics are disabled." }, { status: 404 });
    }
    const identity = await requireIdentity();
    if (identity.role === "member") {
      return Response.json({ error: "Coach or admin access is required." }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const videoId = params.videoId?.trim() || "";
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const video = await database
      .prepare(
        `SELECT id, member_id, coach_id, uploaded_by_role, storage_path, file_size,
          file_name, mime_type, duration, publication_status, upload_status, created_at, updated_at
         FROM lesson_videos
         WHERE id = ?`,
      )
      .bind(videoId)
      .first<DiagnosticVideoRow>();
    if (!video) return Response.json({ error: "Video not found." }, { status: 404 });

    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    if (!canManageVideo(identity, {
      coachId: video.coach_id,
      memberId: video.member_id,
      uploadedByRole: video.uploaded_by_role,
    }, assignedMemberIds)) {
      return Response.json({ error: "You do not have access to this video diagnostic." }, { status: 403 });
    }

    const [job, transcript, draft, relationship] = await Promise.all([
      database
        .prepare("SELECT id, status, current_step, workflow_instance_id, audio_storage_path, error_code, started_at, completed_at, updated_at FROM video_ai_processing_jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 1")
        .bind(video.id)
        .first<DiagnosticJobRow>(),
      database
        .prepare("SELECT transcript_text, created_at, duration_seconds, model, quality_json FROM video_transcripts WHERE video_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
        .bind(video.id)
        .first<DiagnosticTranscriptRow>(),
      database
        .prepare("SELECT status, created_at, updated_at FROM video_lesson_recap_drafts WHERE video_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
        .bind(video.id)
        .first<DiagnosticDraftRow>(),
      video.coach_id
        ? database
          .prepare("SELECT id FROM coach_members WHERE coach_id = ? AND member_id = ?")
          .bind(video.coach_id, video.member_id)
          .first<{ id: string }>()
        : Promise.resolve(null),
    ]);

    const bucket = getRequiredVideoStorage();
    const r2Head = await bucket.head(video.storage_path);
    const probe = r2Head ? await probeStoredMedia(bucket, video) : null;
    const originalMovObjectExists = r2Head
      ? (await Promise.all(likelyOriginalObjectKeys(video).map((key) => bucket.head(key).catch(() => null)))).some(Boolean)
      : false;
    const transcriptCharacterCount = transcript?.transcript_text?.length ?? 0;
    const transcriptQuality = safeJson(transcript?.quality_json);
    const audioStarted = stepReached(job ?? null, [/extract/, /audio/, /transcrib/, /recap/]);
    const transcriptionStarted = stepReached(job ?? null, [/transcrib/, /recap/]);
    const currentStep = job?.current_step ?? "";
    const jobErrorText = `${job?.error_code ?? ""} ${job?.error_message ?? ""} ${currentStep}`.toLowerCase();
    const directFallbackSucceeded = transcriptQuality.transcriptionSource === "original_media";

    return Response.json({
      videoId: video.id,
      memberId: video.member_id,
      coachId: video.coach_id,
      objectExists: Boolean(r2Head),
      objectSize: r2Head?.size ?? null,
      storagePath: video.storage_path,
      originalUploadedFilename: video.file_name.replace(/-optimized\.webm$/i, ".mov"),
      storedFilename: video.file_name,
      storedMimeType: video.mime_type,
      container: probe?.container || mediaContainerFromMimeType(video.mime_type) || null,
      videoCodec: probe?.videoCodec ?? null,
      audioTrackPresent: probe?.hasAudio ?? null,
      audioCodec: probe?.audioCodec ?? null,
      durationSeconds: probe?.durationSeconds ?? (video.duration || null),
      originalMovObjectExists,
      optimizedWebmExists: Boolean(r2Head && mediaContainerFromMimeType(video.mime_type) === "webm"),
      r2ObjectExists: Boolean(r2Head),
      expectedSize: Number(video.file_size ?? 0),
      actualSize: r2Head?.size ?? null,
      mimeType: video.mime_type,
      uploadStatus: video.upload_status === "ready" && r2Head ? "stored" : video.upload_status,
      publicationStatus: video.publication_status,
      processingStage: job?.current_step ?? "not_queued",
      cloudflareNormalizationAttempted: jobErrorText.includes("cloudflare") || jobErrorText.includes("audio") || jobErrorText.includes("normaliz"),
      cloudflareNormalizationSucceeded: Boolean(job?.audio_storage_path && String(job.audio_storage_path).startsWith("video-processing/")),
      directMediaFallbackAttempted: currentStep.includes("direct_media") || transcriptQuality.transcriptionSource === "original_media",
      directMediaFallbackSucceeded: directFallbackSucceeded,
      transcriptionModel: transcript?.model ?? null,
      transcriptWordCount: transcript?.transcript_text ? transcript.transcript_text.split(/\s+/).filter(Boolean).length : 0,
      processingStatus: job?.status ?? "not_queued",
      processingStep: job?.current_step ?? "not_queued",
      workflowJobId: job?.id ?? null,
      workflowIdPresent: Boolean(job?.workflow_instance_id),
      audioExtractionStartedAt: audioStarted ? job?.started_at ?? job?.updated_at ?? null : null,
      audioExtractionCompletedAt: job?.audio_storage_path ? job.updated_at : null,
      transcriptionStartedAt: transcriptionStarted ? job?.started_at ?? job?.updated_at ?? null : null,
      transcriptionCompletedAt: transcript?.created_at ?? null,
      transcriptCharacterCount,
      transcriptDurationSeconds: transcript?.duration_seconds ?? null,
      recapStatus: draft?.status ?? (job?.status === "generating_recap" ? "generating" : "pending"),
      recapUpdatedAt: draft?.updated_at ?? null,
      memberRelationshipExists: Boolean(relationship),
      lastUpdatedAt: draft?.updated_at ?? transcript?.created_at ?? job?.updated_at ?? video.updated_at,
      safeErrorCode: job?.error_code ?? null,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
