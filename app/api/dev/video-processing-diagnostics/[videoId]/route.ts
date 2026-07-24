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

type RouteContext = {
  params: Promise<{ videoId: string }> | { videoId: string };
};

type DiagnosticVideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  uploaded_by_role: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
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
          mime_type, publication_status, upload_status, created_at, updated_at
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
        .prepare("SELECT transcript_text, created_at, duration_seconds FROM video_transcripts WHERE video_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
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
    const transcriptCharacterCount = transcript?.transcript_text?.length ?? 0;
    const audioStarted = stepReached(job ?? null, [/extract/, /audio/, /transcrib/, /recap/]);
    const transcriptionStarted = stepReached(job ?? null, [/transcrib/, /recap/]);

    return Response.json({
      videoId: video.id,
      memberId: video.member_id,
      coachId: video.coach_id,
      r2ObjectExists: Boolean(r2Head),
      expectedSize: Number(video.file_size ?? 0),
      actualSize: r2Head?.size ?? null,
      mimeType: video.mime_type,
      uploadStatus: video.upload_status === "ready" && r2Head ? "stored" : video.upload_status,
      publicationStatus: video.publication_status,
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
