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
  mediaContainerFromMimeType,
  mediaProbeHasAudio,
  mediaProbeResultFromBytes,
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
  source_storage_path: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  source_file_name: string | null;
  source_file_size: number | null;
  source_mime_type: string | null;
  source_media_probe_json: string;
  playback_media_probe_json: string;
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

const MEDIA_PROBE_EDGE_BYTES = 4 * 1024 * 1024;

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

async function readR2ProbeSample(bucket: R2Bucket, objectKey: string, objectSize: number) {
  const safeSize = Number.isFinite(objectSize) && objectSize > 0 ? objectSize : 0;
  if (!safeSize || safeSize <= MEDIA_PROBE_EDGE_BYTES * 2) {
    const object = await bucket.get(objectKey);
    return object ? new Uint8Array(await object.arrayBuffer()) : new Uint8Array();
  }
  const [head, tail] = await Promise.all([
    bucket.get(objectKey, { range: { offset: 0, length: MEDIA_PROBE_EDGE_BYTES } }),
    bucket.get(objectKey, { range: { offset: Math.max(0, safeSize - MEDIA_PROBE_EDGE_BYTES), length: MEDIA_PROBE_EDGE_BYTES } }),
  ]);
  return concatBytes(
    head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array(),
    tail ? new Uint8Array(await tail.arrayBuffer()) : new Uint8Array(),
  );
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

async function probeStoredMedia(bucket: R2Bucket, values: {
  durationSeconds: number;
  mimeType: string;
  objectKey: string;
  objectSize: number;
}) {
  try {
    const bytes = await readR2ProbeSample(bucket, values.objectKey, values.objectSize);
    return mediaProbeResultFromBytes(bytes, {
      durationSeconds: values.durationSeconds,
      mimeType: values.mimeType,
      objectKey: values.objectKey,
      objectSize: values.objectSize,
    });
  } catch {
    return {
      audioCodec: undefined,
      audioTrackCount: 0,
      container: mediaContainerFromMimeType(values.mimeType),
      durationSeconds: Number.isFinite(Number(values.durationSeconds)) && Number(values.durationSeconds) > 0 ? Number(values.durationSeconds) : null,
      mimeType: values.mimeType,
      objectKey: values.objectKey,
      objectSize: values.objectSize,
      videoCodec: undefined,
      videoTrackCount: 0,
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
        `SELECT id, member_id, coach_id, uploaded_by_role, storage_path, source_storage_path, file_size,
          file_name, source_file_name, mime_type, source_mime_type, source_file_size,
          source_media_probe_json, playback_media_probe_json,
          duration, publication_status, upload_status, created_at, updated_at
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
    const playbackHead = await bucket.head(video.storage_path);
    const sourceStoragePath = video.source_storage_path || video.storage_path;
    const sourceMimeType = video.source_mime_type || video.mime_type;
    const sourceHead = sourceStoragePath ? await bucket.head(sourceStoragePath) : null;
    const sourceProbe = sourceHead
      ? await probeStoredMedia(bucket, {
        durationSeconds: video.duration,
        mimeType: sourceMimeType,
        objectKey: sourceStoragePath,
        objectSize: sourceHead.size,
      })
      : safeJson(video.source_media_probe_json);
    const playbackProbe = playbackHead
      ? await probeStoredMedia(bucket, {
        durationSeconds: video.duration,
        mimeType: video.mime_type,
        objectKey: video.storage_path,
        objectSize: playbackHead.size,
      })
      : safeJson(video.playback_media_probe_json);
    const originalMovObjectExists = sourceHead
      ? true
      : (await Promise.all(likelyOriginalObjectKeys(video).map((key) => bucket.head(key).catch(() => null)))).some(Boolean);
    const transcriptCharacterCount = transcript?.transcript_text?.length ?? 0;
    const transcriptQuality = safeJson(transcript?.quality_json);
    const audioStarted = stepReached(job ?? null, [/extract/, /audio/, /transcrib/, /recap/]);
    const transcriptionStarted = stepReached(job ?? null, [/transcrib/, /recap/]);
    const currentStep = job?.current_step ?? "";
    const jobErrorText = `${job?.error_code ?? ""} ${job?.error_message ?? ""} ${currentStep}`.toLowerCase();
    const directFallbackSucceeded = transcriptQuality.transcriptionSource === "original_media";
    const selectedTranscriptionSource = transcriptQuality.transcriptionSourceObjectKey
      ? transcriptQuality.transcriptionSourceObjectKey === sourceStoragePath ? "source" : "derived_or_audio"
      : mediaProbeHasAudio(sourceProbe)
        ? "source"
        : mediaProbeHasAudio(playbackProbe)
          ? "playback"
          : null;

    return Response.json({
      videoId: video.id,
      memberId: video.member_id,
      coachId: video.coach_id,
      sourceObjectExists: Boolean(sourceHead),
      sourceObjectSize: sourceHead?.size ?? null,
      sourceContainer: sourceProbe?.container || mediaContainerFromMimeType(sourceMimeType) || null,
      sourceVideoCodec: sourceProbe?.videoCodec ?? null,
      sourceVideoTrackCount: sourceProbe?.videoTrackCount ?? null,
      sourceAudioTrackCount: sourceProbe?.audioTrackCount ?? null,
      sourceAudioCodec: sourceProbe?.audioCodec ?? null,
      sourceMimeType,
      playbackObjectExists: Boolean(playbackHead),
      playbackObjectSize: playbackHead?.size ?? null,
      playbackContainer: playbackProbe?.container || mediaContainerFromMimeType(video.mime_type) || null,
      playbackVideoCodec: playbackProbe?.videoCodec ?? null,
      playbackVideoTrackCount: playbackProbe?.videoTrackCount ?? null,
      playbackAudioTrackCount: playbackProbe?.audioTrackCount ?? null,
      playbackAudioCodec: playbackProbe?.audioCodec ?? null,
      selectedTranscriptionSource,
      objectExists: Boolean(playbackHead),
      objectSize: playbackHead?.size ?? null,
      storagePath: video.storage_path,
      originalUploadedFilename: video.file_name.replace(/-optimized\.webm$/i, ".mov"),
      storedFilename: video.file_name,
      storedMimeType: video.mime_type,
      container: playbackProbe?.container || mediaContainerFromMimeType(video.mime_type) || null,
      videoCodec: playbackProbe?.videoCodec ?? null,
      audioTrackPresent: mediaProbeHasAudio(playbackProbe),
      audioCodec: playbackProbe?.audioCodec ?? null,
      durationSeconds: playbackProbe?.durationSeconds ?? sourceProbe?.durationSeconds ?? (video.duration || null),
      originalMovObjectExists,
      optimizedWebmExists: Boolean(playbackHead && mediaContainerFromMimeType(video.mime_type) === "webm"),
      r2ObjectExists: Boolean(playbackHead),
      expectedSize: Number(video.file_size ?? 0),
      actualSize: playbackHead?.size ?? null,
      mimeType: video.mime_type,
      uploadStatus: video.upload_status === "ready" && playbackHead ? "stored" : video.upload_status,
      publicationStatus: video.publication_status,
      processingStage: job?.current_step ?? "not_queued",
      cloudflareNormalizationAttempted: jobErrorText.includes("cloudflare") || jobErrorText.includes("audio") || jobErrorText.includes("normaliz"),
      cloudflareNormalizationSucceeded: Boolean(job?.audio_storage_path && String(job.audio_storage_path).startsWith("video-processing/")),
      directMediaFallbackAttempted: currentStep.includes("direct_media") || transcriptQuality.transcriptionSource === "original_media",
      directMediaFallbackSucceeded: directFallbackSucceeded,
      transcriptionSourceObjectKey: transcriptQuality.transcriptionSourceObjectKey ?? null,
      transcriptionSourceContainer: transcriptQuality.transcriptionSourceContainer ?? null,
      transcriptionSourceAudioCodec: transcriptQuality.transcriptionSourceAudioCodec ?? null,
      transcriptionStartedAtQuality: transcriptQuality.transcriptionStartedAt ?? null,
      transcriptionCompletedAtQuality: transcriptQuality.transcriptionCompletedAt ?? null,
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
