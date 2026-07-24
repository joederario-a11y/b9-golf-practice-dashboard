import {
  canAccessVideo,
  canManageVideo,
  canUploadToMember,
  validateThumbnailFile,
  validateVideoFile,
} from "@/lib/video-policy.mjs";
import { videoOwnershipChangeError } from "@/lib/video-upload-safety.mjs";
import {
  ensureCoachFeedbackSchema,
  ensurePlatformSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  getRequiredVideoStorage,
  recordActivity,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import { sendVideoNotification } from "@/lib/server/video-email";
import {
  createVideoRecapProcessingJob,
  queueVideoRecapWorkflowAfterUpload,
} from "@/lib/server/video-ai-recap";
import {
  MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES,
  mediaProbeHasAudio,
  mediaProbeResultFromBytes,
} from "@/lib/video-media-processing-policy.mjs";

type VideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  uploaded_by_role: string;
  title: string;
  description: string;
  coach_notes: string;
  coach_private_notes: string;
  user_notes: string;
  video_type: string;
  focus_area: string | null;
  swing_type: string | null;
  club: string | null;
  tags_json: string;
  session_data_id: string | null;
  storage_path: string;
  thumbnail_storage_path: string | null;
  file_name: string;
  file_size: number;
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
  review_status: string;
  email_status: string;
  email_sent_at: string | null;
  email_failure_reason: string | null;
  is_viewed_by_member: number;
  viewed_at: string | null;
  lesson_summary: string;
  worked_on: string;
  key_issue: string;
  improvement: string;
  practice_assignment: string;
  recommended_drill: string;
  member_facing_notes: string;
  next_session_goal: string;
  created_at: string;
  updated_at: string;
  member_first_name: string;
  member_last_name: string;
  member_email: string;
  coach_first_name: string | null;
  coach_last_name: string | null;
};

type VideoPayload = Record<string, unknown>;

const VIDEO_SELECT = `
  SELECT
    videos.*,
    member.first_name AS member_first_name,
    member.last_name AS member_last_name,
    member.email AS member_email,
    coach.first_name AS coach_first_name,
    coach.last_name AS coach_last_name
  FROM lesson_videos AS videos
  JOIN users AS member ON member.id = videos.member_id
  LEFT JOIN users AS coach ON coach.id = videos.coach_id
`;

function feedbackArray(...values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map((value) => optionalText(value, 1000) ?? "")
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

async function upsertStructuredCoachFeedback(database: D1Database, video: VideoRow, payload: VideoPayload) {
  if (!video.coach_id) return;
  await ensureCoachFeedbackSchema(database);
  const lessonSummary = optionalText(payload.lessonSummary, 4000) ?? video.lesson_summary;
  const workedOn = optionalText(payload.workedOn, 4000) ?? video.worked_on;
  const keyIssue = optionalText(payload.keyIssue, 4000) ?? video.key_issue;
  const improvement = optionalText(payload.improvement, 4000) ?? video.improvement;
  const practiceAssignment = optionalText(payload.practiceAssignment, 4000) ?? video.practice_assignment;
  const recommendedDrill = optionalText(payload.recommendedDrill, 4000) ?? video.recommended_drill;
  const memberFacingNotes = optionalText(payload.memberFacingNotes, 4000) ?? video.member_facing_notes;
  const nextSessionGoal = optionalText(payload.nextSessionGoal, 4000) ?? video.next_session_goal;
  const coachNotes = optionalText(payload.coachNotes, 4000) ?? video.coach_notes;
  const priority = workedOn || keyIssue || video.focus_area || video.title;
  const id = `feedback-${video.id}`;

  await database
    .prepare(
      `INSERT INTO coach_feedback (
        id, golfer_id, coach_id, lesson_id, session_id, status, priority,
        observations_json, prescribed_drills_json, swing_feels_json,
        success_targets_json, raw_notes, source_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, 'lesson_video', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        golfer_id = excluded.golfer_id,
        coach_id = excluded.coach_id,
        lesson_id = excluded.lesson_id,
        session_id = excluded.session_id,
        status = 'active',
        priority = excluded.priority,
        observations_json = excluded.observations_json,
        prescribed_drills_json = excluded.prescribed_drills_json,
        swing_feels_json = excluded.swing_feels_json,
        success_targets_json = excluded.success_targets_json,
        raw_notes = excluded.raw_notes,
        source_type = excluded.source_type,
        updated_at = CURRENT_TIMESTAMP,
        resolved_at = NULL,
        archived_at = NULL`,
    )
    .bind(
      id,
      video.member_id,
      video.coach_id,
      video.id,
      optionalText(payload.sessionId, 120) ?? video.session_data_id,
      priority,
      JSON.stringify(feedbackArray(lessonSummary, workedOn, keyIssue, improvement, memberFacingNotes)),
      JSON.stringify(feedbackArray(practiceAssignment, recommendedDrill)),
      JSON.stringify([]),
      JSON.stringify(feedbackArray(nextSessionGoal)),
      feedbackArray(coachNotes, memberFacingNotes).join("\n\n") || null,
    )
    .run();
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
}

function defaultVideoTitleFromDate(...values: unknown[]) {
  const source = values
    .map((value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "")
    .find(Boolean);
  const date = source ? new Date(source) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(safeDate);
}

const HIDDEN_TEST_VIDEO_CLAUSE = "LOWER(COALESCE(videos.video_type, '')) NOT IN ('system_test', 'system test')";
const MEDIA_PROBE_EDGE_BYTES = 4 * 1024 * 1024;
const LESSON_VIDEO_MULTIPART_PART_SIZE = 20 * 1024 * 1024;
const LESSON_VIDEO_MULTIPART_PART_TOLERANCE_BYTES = 1024 * 1024;
const LESSON_VIDEO_MULTIPART_MAX_PARTS = 10_000;
const TRANSCRIPTION_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

type R2MultipartUploadedPartLike = {
  etag: string;
  partNumber: number;
};

type R2MultipartUploadLike = {
  abort(): Promise<void>;
  complete(parts: R2MultipartUploadedPartLike[]): Promise<R2Object>;
  uploadId: string;
  uploadPart(partNumber: number, value: Parameters<R2Bucket["put"]>[1]): Promise<R2MultipartUploadedPartLike>;
};

type R2MultipartBucketLike = R2Bucket & {
  createMultipartUpload(key: string, options?: Parameters<R2Bucket["put"]>[2]): Promise<R2MultipartUploadLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
};

type VideoUploadAsset = "thumbnail" | "transcription-audio" | "video";

function safeJson(value: string | null | undefined, fallback: unknown) {
  try {
    return value ? JSON.parse(value) as unknown : fallback;
  } catch {
    return fallback;
  }
}

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

async function probeStoredMediaObject(bucket: R2Bucket, values: {
  durationSeconds: number;
  mimeType: string;
  objectKey: string;
  objectSize: number;
}) {
  const bytes = await readR2ProbeSample(bucket, values.objectKey, values.objectSize);
  return mediaProbeResultFromBytes(bytes, {
    durationSeconds: values.durationSeconds,
    mimeType: values.mimeType,
    objectKey: values.objectKey,
    objectSize: values.objectSize,
  });
}

async function finalizeStoredVideoUpload(values: {
  bucket: R2Bucket;
  database: D1Database;
  fileName: string;
  identity: Awaited<ReturnType<typeof requireIdentity>>;
  mimeType: string;
  storagePath: string;
  storedSize: number;
  video: VideoRow;
}) {
  const mediaProbe = await probeStoredMediaObject(values.bucket, {
    durationSeconds: values.video.duration,
    mimeType: values.mimeType,
    objectKey: values.storagePath,
    objectSize: values.storedSize,
  });
  const mediaProbeJson = stringifyJson(mediaProbe);
  await values.database
    .prepare(
      `UPDATE lesson_videos SET
        file_name = ?, file_size = ?, mime_type = ?,
        source_storage_path = ?, source_file_name = ?, source_file_size = ?, source_mime_type = ?,
        source_media_probe_json = ?, playback_media_probe_json = ?,
        upload_status = 'ready',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(
      values.fileName,
      values.storedSize,
      values.mimeType,
      values.storagePath,
      values.fileName,
      values.storedSize,
      values.mimeType,
      mediaProbeJson,
      mediaProbeJson,
      values.video.id,
    )
    .run();
  await recordActivity({
    action: "video_uploaded",
    actor: values.identity,
    database: values.database,
    entityId: values.video.id,
    entityType: "video",
    memberId: values.video.member_id,
    metadata: {
      audioCodec: mediaProbe.audioCodec ?? null,
      audioTrackCount: mediaProbe.audioTrackCount,
      container: mediaProbe.container,
      fileName: values.fileName,
      hasAudio: mediaProbeHasAudio(mediaProbe),
      mimeType: values.mimeType,
      size: values.storedSize,
      videoCodec: mediaProbe.videoCodec ?? null,
    },
    summary: `${values.identity.displayName} uploaded ${values.fileName}.`,
    targetUserId: values.video.member_id,
  });
  let aiProcessing: unknown = null;
  try {
    aiProcessing = await queueVideoRecapWorkflowAfterUpload(values.database, values.identity, values.video.id);
  } catch {
    aiProcessing = { queued: false };
  }
  return { aiProcessing, mediaProbe };
}

function requireMultipartBucket(bucket: R2Bucket) {
  const maybeMultipartBucket = bucket as Partial<R2MultipartBucketLike>;
  if (
    typeof maybeMultipartBucket.createMultipartUpload !== "function" ||
    typeof maybeMultipartBucket.resumeMultipartUpload !== "function"
  ) {
    throw new Response("Large video uploads are not available in this environment.", { status: 501 });
  }
  return bucket as R2MultipartBucketLike;
}

function parseMultipartPartNumber(value: string | null) {
  const partNumber = Number(value);
  return Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= LESSON_VIDEO_MULTIPART_MAX_PARTS
    ? partNumber
    : null;
}

function parseUploadedParts(value: unknown) {
  if (!Array.isArray(value)) return null;
  const parts = value
    .map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const partNumber = Number(record.partNumber);
      const etag = typeof record.etag === "string" ? record.etag.trim() : "";
      return Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= LESSON_VIDEO_MULTIPART_MAX_PARTS && etag
        ? { etag, partNumber }
        : null;
    })
    .filter((item): item is R2MultipartUploadedPartLike => Boolean(item))
    .sort((a, b) => a.partNumber - b.partNumber);
  if (!parts.length || parts.length !== value.length) return null;
  const seen = new Set<number>();
  for (const part of parts) {
    if (seen.has(part.partNumber)) return null;
    seen.add(part.partNumber);
  }
  return parts;
}

async function handleMultipartVideoUpload(values: {
  bucket: R2Bucket;
  database: D1Database;
  declaredSize: number;
  fileName: string;
  identity: Awaited<ReturnType<typeof requireIdentity>>;
  mimeType: string;
  request: Request;
  url: URL;
  video: VideoRow;
}) {
  const action = values.url.searchParams.get("multipart")?.trim().toLowerCase();
  const bucket = requireMultipartBucket(values.bucket);
  const storagePath = values.video.storage_path;
  const validationError = validateVideoFile(values.mimeType, values.declaredSize);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  if (action === "init") {
    const upload = await bucket.createMultipartUpload(storagePath, {
      httpMetadata: { contentType: values.mimeType },
      customMetadata: {
        fileName: values.fileName,
        memberId: values.video.member_id,
        uploadedBy: values.identity.id,
      },
    });
    return Response.json({
      ok: true,
      multipart: true,
      uploadId: upload.uploadId,
      partSize: LESSON_VIDEO_MULTIPART_PART_SIZE,
    });
  }

  const uploadId = values.url.searchParams.get("uploadId")?.trim() || "";
  if (!uploadId) {
    return Response.json({ error: "Multipart uploadId is required." }, { status: 400 });
  }
  const upload = bucket.resumeMultipartUpload(storagePath, uploadId);

  if (action === "abort") {
    await upload.abort();
    return Response.json({ ok: true, multipart: true, aborted: true });
  }

  if (action === "part") {
    const partNumber = parseMultipartPartNumber(values.url.searchParams.get("partNumber"));
    if (!partNumber) {
      return Response.json({ error: "A valid multipart partNumber is required." }, { status: 400 });
    }
    if (!values.request.body) {
      return Response.json({ error: "The upload part body is empty." }, { status: 400 });
    }
    const partLength = Number(values.request.headers.get("content-length") || 0);
    if (
      Number.isFinite(partLength) &&
      partLength > LESSON_VIDEO_MULTIPART_PART_SIZE + LESSON_VIDEO_MULTIPART_PART_TOLERANCE_BYTES
    ) {
      return Response.json({ error: "Upload part is too large." }, { status: 400 });
    }
    const part = await upload.uploadPart(partNumber, values.request.body);
    return Response.json({ ok: true, multipart: true, part });
  }

  if (action === "complete") {
    const payload = await values.request.json().catch(() => ({})) as { parts?: unknown };
    const parts = parseUploadedParts(payload.parts);
    if (!parts) {
      return Response.json({ error: "Valid uploaded parts are required." }, { status: 400 });
    }
    const stored = await upload.complete(parts);
    const actualValidationError = validateVideoFile(values.mimeType, stored.size);
    if (actualValidationError) {
      await values.bucket.delete(storagePath);
      return Response.json({ error: actualValidationError }, { status: 400 });
    }
    const finalized = await finalizeStoredVideoUpload({
      bucket: values.bucket,
      database: values.database,
      fileName: values.fileName,
      identity: values.identity,
      mimeType: values.mimeType,
      storagePath,
      storedSize: stored.size,
      video: values.video,
    });
    return Response.json({
      ok: true,
      aiProcessing: finalized.aiProcessing,
      asset: "video",
      mediaProbe: finalized.mediaProbe,
      multipart: true,
      size: stored.size,
    });
  }

  return Response.json({ error: "Unsupported multipart upload action." }, { status: 400 });
}

async function handleTranscriptionAudioUpload(values: {
  bucket: R2Bucket;
  database: D1Database;
  declaredSize: number;
  fileName: string;
  identity: Awaited<ReturnType<typeof requireIdentity>>;
  mimeType: string;
  request: Request;
  video: VideoRow;
}) {
  const validationError = validateTranscriptionAudioFile(values.mimeType, values.declaredSize);
  if (validationError) {
    return Response.json({ error: validationError }, { status: validationError.includes("too large") ? 413 : 400 });
  }
  if (!values.request.body) {
    return Response.json({ error: "The transcription audio upload body is empty." }, { status: 400 });
  }

  const extension = transcriptionAudioExtension(values.mimeType, values.fileName);
  const storagePath = `video-processing/${values.video.id}/audio/source-sidecar-${crypto.randomUUID()}.${extension}`;
  const stored = await values.bucket.put(storagePath, values.request.body, {
    httpMetadata: { contentType: values.mimeType },
    customMetadata: {
      coachId: values.video.coach_id ?? "",
      fileName: values.fileName,
      memberId: values.video.member_id,
      source: "browser_audio_sidecar",
      uploadedBy: values.identity.id,
      videoId: values.video.id,
    },
  });
  const actualValidationError = validateTranscriptionAudioFile(values.mimeType, stored.size);
  if (actualValidationError) {
    await values.bucket.delete(storagePath);
    return Response.json({ error: actualValidationError }, { status: actualValidationError.includes("too large") ? 413 : 400 });
  }

  await values.database
    .prepare(
      `UPDATE video_ai_processing_jobs
       SET audio_storage_path = ?,
           current_step = 'audio_sidecar_uploaded',
           updated_at = CURRENT_TIMESTAMP
       WHERE video_id = ?
         AND processing_type = 'lesson_recap_voiceover'
         AND status IN ('queued', 'extracting_audio', 'transcribing', 'generating_recap')`,
    )
    .bind(storagePath, values.video.id)
    .run();

  await recordActivity({
    action: "video_audio_sidecar_uploaded",
    actor: values.identity,
    database: values.database,
    entityId: values.video.id,
    entityType: "video",
    memberId: values.video.member_id,
    metadata: {
      audioStoragePath: storagePath,
      mimeType: values.mimeType,
      size: stored.size,
    },
    summary: `${values.identity.displayName} prepared private lesson audio for MAI Coach transcription.`,
    targetUserId: values.video.member_id,
  });

  return Response.json({
    asset: "transcription-audio",
    audioStoragePath: storagePath,
    ok: true,
    size: stored.size,
  });
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseVideoUploadAsset(value: string | null): VideoUploadAsset {
  if (value === "thumbnail") return "thumbnail";
  if (value === "transcription-audio") return "transcription-audio";
  return "video";
}

function transcriptionAudioExtension(mimeType: string, fileName: string) {
  const normalizedFileName = fileName.toLowerCase();
  if (normalizedFileName.endsWith(".m4a")) return "m4a";
  if (normalizedFileName.endsWith(".mp3")) return "mp3";
  if (normalizedFileName.endsWith(".wav")) return "wav";
  if (normalizedFileName.endsWith(".ogg")) return "ogg";
  if (normalizedFileName.endsWith(".webm")) return "webm";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}

function validateTranscriptionAudioFile(mimeType: string, declaredSize: number) {
  if (!TRANSCRIPTION_AUDIO_MIME_TYPES.has(mimeType)) {
    return "Upload a supported private audio file for MAI Coach transcription.";
  }
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return "The transcription audio file is empty.";
  }
  if (declaredSize > MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES) {
    return "The transcription audio file is too large.";
  }
  return "";
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function uploadedByLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "coach") return "Coach";
  return "User";
}

function serializeVideo(row: VideoRow, viewerRole?: string) {
  return {
    id: row.id,
    ownerId: row.member_id,
    memberName: [row.member_first_name, row.member_last_name].filter(Boolean).join(" "),
    memberEmail: row.member_email,
    coachId: row.coach_id ?? undefined,
    coachName: [row.coach_first_name, row.coach_last_name].filter(Boolean).join(" ") || undefined,
    title: row.title,
    description: row.description,
    uploadedAt: row.created_at,
    updatedAt: row.updated_at,
    uploadedBy: uploadedByLabel(row.uploaded_by_role),
    uploadedByRole: row.uploaded_by_role,
    type: row.video_type,
    tags: parseTags(row.tags_json),
    sessionId: row.session_data_id ?? undefined,
    club: row.club ?? undefined,
    swingType: row.swing_type ?? undefined,
    focusArea: row.focus_area ?? undefined,
    visibility: row.publication_status === "Draft" ? "Admin only" : "Coach + User",
    duration: Number(row.duration || 0),
    status: row.review_status,
    coachNotes: row.coach_notes,
    coachNotesPrivate: false,
    coachPrivateNotes: viewerRole === "member" ? "" : row.coach_private_notes,
    userNotes: viewerRole === "member" ? row.user_notes : "",
    fileName: row.file_name,
    fileSize: Number(row.file_size),
    mimeType: row.mime_type,
    sourceFileName: row.source_file_name ?? row.file_name,
    sourceFileSize: Number(row.source_file_size ?? row.file_size),
    sourceMimeType: row.source_mime_type ?? row.mime_type,
    sourceMediaProbe: safeJson(row.source_media_probe_json, {}),
    playbackMediaProbe: safeJson(row.playback_media_probe_json, {}),
    lessonDate: row.lesson_date ?? undefined,
    publicationStatus: row.publication_status,
    uploadStatus: row.upload_status,
    isViewedByMember: Boolean(row.is_viewed_by_member),
    viewedAt: row.viewed_at ?? undefined,
    emailStatus: row.email_status,
    emailSentAt: row.email_sent_at ?? undefined,
    emailFailureReason: row.email_failure_reason ?? undefined,
    lessonSummary: row.lesson_summary,
    workedOn: row.worked_on,
    keyIssue: row.key_issue,
    improvement: row.improvement,
    practiceAssignment: row.practice_assignment,
    recommendedDrill: row.recommended_drill,
    memberFacingNotes: row.member_facing_notes,
    nextSessionGoal: row.next_session_goal,
    objectUrl: `/api/videos/media?videoId=${encodeURIComponent(row.id)}`,
    thumbnailObjectUrl: row.thumbnail_storage_path
      ? `/api/videos/media?videoId=${encodeURIComponent(row.id)}&asset=thumbnail`
      : undefined,
  };
}

async function getVideo(database: D1Database, videoId: string) {
  return database
    .prepare(`${VIDEO_SELECT} WHERE videos.id = ?`)
    .bind(videoId)
    .first<VideoRow>();
}

async function requireVideoAccess(videoId: string, mode: "read" | "manage") {
  const identity = await requireIdentity();
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const video = await getVideo(database, videoId);
  if (!video) throw new Response("Video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  const allowed = mode === "manage"
    ? canManageVideo(identity, {
        memberId: video.member_id,
        coachId: video.coach_id,
        uploadedByRole: video.uploaded_by_role,
      }, assignedMemberIds)
    : canAccessVideo(identity, {
        memberId: video.member_id,
        coachId: video.coach_id,
        publicationStatus: video.publication_status,
      }, assignedMemberIds);
  if (!allowed) throw new Response("You do not have access to this video.", { status: 403 });
  return { assignedMemberIds, database, identity, video };
}

async function coachAssignedToMember(database: D1Database, coachId: string, memberId: string) {
  const relationship = await database
    .prepare("SELECT id FROM coach_members WHERE coach_id = ? AND member_id = ?")
    .bind(coachId, memberId)
    .first<{ id: string }>();
  return Boolean(relationship);
}

async function selectedCoachForUpload(database: D1Database, identityRole: string, payload: VideoPayload, memberId: string, wantsAi: boolean) {
  if (identityRole === "member") {
    return { aiDisabledReason: "Members cannot generate coach voiceover recaps.", coachId: null as string | null };
  }
  if (identityRole === "coach") {
    return { aiDisabledReason: "", coachId: text(payload.coachId, 80) || null };
  }
  const requestedCoachId = text(payload.coachId, 80);
  if (!requestedCoachId) {
    return {
      aiDisabledReason: wantsAi ? "Choose an assigned coach before generating a MAI Coach voiceover recap." : "",
      coachId: null as string | null,
    };
  }
  const coach = await database
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'coach'")
    .bind(requestedCoachId)
    .first<{ id: string }>();
  if (!coach) {
    return {
      aiDisabledReason: wantsAi ? "The selected coach is not a coach account, so AI recap generation was disabled." : "",
      coachId: null as string | null,
    };
  }
  if (!(await coachAssignedToMember(database, requestedCoachId, memberId))) {
    return {
      aiDisabledReason: wantsAi ? "The selected coach is not currently assigned to this member, so AI recap generation was disabled." : "",
      coachId: null as string | null,
    };
  }
  return { aiDisabledReason: "", coachId: requestedCoachId };
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    const url = new URL(request.url);
    const requestedMemberId = url.searchParams.get("memberId")?.trim() || "";
    const includeTests = identity.role === "admin" && url.searchParams.get("includeTests") === "1";
    if (requestedMemberId && !canUploadToMember(identity, requestedMemberId, assignedMemberIds)) {
      return Response.json({ error: "You do not have access to that member." }, { status: 403 });
    }

    let query = VIDEO_SELECT;
    const bindings: string[] = [];
    if (identity.role === "member") {
      query += " WHERE videos.member_id = ? AND videos.publication_status = 'Published' AND videos.upload_status = 'ready'";
      bindings.push(identity.id);
    } else if (identity.role === "coach") {
      query += ` WHERE (
        videos.coach_id = ? OR videos.member_id IN (
          SELECT member_id FROM coach_members WHERE coach_id = ?
        )
      )`;
      bindings.push(identity.id, identity.id);
      if (requestedMemberId) {
        query += " AND videos.member_id = ?";
        bindings.push(requestedMemberId);
      }
    } else if (requestedMemberId) {
      query += " WHERE videos.member_id = ?";
      bindings.push(requestedMemberId);
    }
    if (!includeTests) {
      query += query.includes(" WHERE ") ? ` AND ${HIDDEN_TEST_VIDEO_CLAUSE}` : ` WHERE ${HIDDEN_TEST_VIDEO_CLAUSE}`;
    }
    query += " ORDER BY videos.created_at DESC";
    const statement = database.prepare(query);
    const result = bindings.length
      ? await statement.bind(...bindings).all<VideoRow>()
      : await statement.all<VideoRow>();
    return Response.json({ videos: result.results.map((row) => serializeVideo(row, identity.role)) });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const payload = await request.json() as VideoPayload;
    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    const memberId = identity.role === "member" ? identity.id : text(payload.memberId, 80);
    if (!memberId || !canUploadToMember(identity, memberId, assignedMemberIds)) {
      return Response.json({ error: "Choose a member assigned to your account." }, { status: 403 });
    }
    const member = await database
      .prepare("SELECT id FROM users WHERE id = ? AND role = 'member'")
      .bind(memberId)
      .first<{ id: string }>();
    if (!member) {
      return Response.json({ error: "Member not found." }, { status: 404 });
    }

    const lessonDate = text(payload.lessonDate, 20) || null;
    const title = text(payload.title, 120) || defaultVideoTitleFromDate(payload.mediaCapturedAt, lessonDate, new Date().toISOString());
    const fileName = text(payload.fileName, 255);
    const mimeType = text(payload.mimeType, 100).toLowerCase();
    const fileSize = Number(payload.fileSize);
    const validationError = validateVideoFile(mimeType, fileSize);
    if (!fileName) {
      return Response.json({ error: "Video file name is required." }, { status: 400 });
    }
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const videoId = crypto.randomUUID();
    const storagePath = `lesson-videos/${memberId}/${videoId}/video`;
    const wantsAiRecap = payload.generateAiRecap !== false && identity.role !== "member";
    const coachSelection = await selectedCoachForUpload(database, identity.role, payload, memberId, wantsAiRecap);
    const coachId = identity.role === "coach" ? identity.id : coachSelection.coachId;
    if (identity.role === "coach" && !(await coachAssignedToMember(database, identity.id, memberId))) {
      return Response.json({ error: "You must be assigned to this member before uploading a coach video." }, { status: 403 });
    }
    const publicationStatus = text(payload.publicationStatus, 20) === "Published" ? "Published" : "Draft";
    await database
      .prepare(
        `INSERT INTO lesson_videos (
          id, member_id, coach_id, uploaded_by_role, title, description,
          coach_notes, coach_private_notes, user_notes, video_type, focus_area,
          swing_type, club, tags_json, session_data_id, storage_path,
          thumbnail_storage_path, file_name, file_size, mime_type,
          source_storage_path, source_file_name, source_file_size, source_mime_type,
          source_media_probe_json, playback_media_probe_json, duration,
          lesson_date, publication_status, upload_status, review_status,
          email_status, is_viewed_by_member, lesson_summary, worked_on,
          key_issue, improvement, practice_assignment, recommended_drill,
          member_facing_notes, next_session_goal, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?,
          ?, ?, ?, '{}', '{}', ?, ?, ?, 'pending', 'New', 'Not sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`,
      )
      .bind(
        videoId,
        memberId,
        coachId,
        identity.role,
        title,
        text(payload.description, 4000),
        text(payload.coachPrivateNotes, 4000),
        text(payload.videoType, 80) || (identity.role === "member" ? "User Upload" : "Lesson Recap"),
        text(payload.focusArea, 80) || null,
        text(payload.swingType, 80) || null,
        text(payload.club, 80) || null,
        JSON.stringify(stringList(payload.tags)),
        text(payload.sessionId, 120) || null,
        storagePath,
        fileName,
        fileSize,
        mimeType,
        storagePath,
        fileName,
        fileSize,
        mimeType,
        Math.max(0, Math.round(Number(payload.duration) || 0)),
        lessonDate,
        publicationStatus,
        identity.role === "member" ? 1 : 0,
        text(payload.lessonSummary, 4000),
        text(payload.workedOn, 4000),
        text(payload.keyIssue, 4000),
        text(payload.improvement, 4000),
        text(payload.practiceAssignment, 4000),
        text(payload.recommendedDrill, 4000),
        text(payload.memberFacingNotes, 4000),
        text(payload.nextSessionGoal, 4000),
      )
      .run();

    let aiProcessingDisabledReason = coachSelection.aiDisabledReason;
    if (coachId && wantsAiRecap && !aiProcessingDisabledReason) {
      await createVideoRecapProcessingJob(
        database,
        identity,
        videoId,
        payload.generateAiRecap,
        text(payload.processingLanguage, 12) || "en",
      );
    } else if (!aiProcessingDisabledReason && wantsAiRecap && !coachId) {
      aiProcessingDisabledReason = "AI recap generation was disabled because no assigned coach was selected.";
    }

    const row = await getVideo(database, videoId);
    return Response.json({
      aiProcessingDisabledReason: aiProcessingDisabledReason || undefined,
      video: row ? serializeVideo(row, identity.role) : null,
    }, { status: 201 });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    const videoId = url.searchParams.get("videoId")?.trim() || "";
    const asset = parseVideoUploadAsset(url.searchParams.get("asset"));
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    const { database, identity, video } = await requireVideoAccess(videoId, "manage");
    const multipartAction = url.searchParams.get("multipart")?.trim().toLowerCase() || "";
    const rawMimeType = multipartAction
      ? request.headers.get("x-file-mime-type") || request.headers.get("content-type") || ""
      : request.headers.get("content-type") || "";
    const mimeType = rawMimeType.split(";")[0].trim().toLowerCase();
    const fileName = decodeURIComponent(request.headers.get("x-file-name") || video.file_name);
    const declaredSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length"));
    const bucket = getRequiredVideoStorage();
    if (asset === "video" && multipartAction) {
      return handleMultipartVideoUpload({
        bucket,
        database,
        declaredSize,
        fileName,
        identity,
        mimeType,
        request,
        url,
        video,
      });
    }
    if (asset === "transcription-audio") {
      return handleTranscriptionAudioUpload({
        bucket,
        database,
        declaredSize,
        fileName,
        identity,
        mimeType,
        request,
        video,
      });
    }
    const validationError = asset === "thumbnail"
      ? validateThumbnailFile(mimeType, declaredSize)
      : validateVideoFile(mimeType, declaredSize);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    if (!request.body) {
      return Response.json({ error: "The upload body is empty." }, { status: 400 });
    }

    const storagePath = asset === "thumbnail"
      ? `lesson-videos/${video.member_id}/${video.id}/thumbnail`
      : video.storage_path;
    const stored = await bucket.put(storagePath, request.body, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        fileName,
        memberId: video.member_id,
        uploadedBy: identity.id,
      },
    });
    const actualValidationError = asset === "thumbnail"
      ? validateThumbnailFile(mimeType, stored.size)
      : validateVideoFile(mimeType, stored.size);
    if (actualValidationError) {
      await bucket.delete(storagePath);
      return Response.json({ error: actualValidationError }, { status: 400 });
    }

    let aiProcessing: unknown = null;
    if (asset === "thumbnail") {
      await database
        .prepare("UPDATE lesson_videos SET thumbnail_storage_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(storagePath, video.id)
        .run();
    } else {
      const finalized = await finalizeStoredVideoUpload({
        bucket,
        database,
        fileName,
        identity,
        mimeType,
        storagePath,
        storedSize: stored.size,
        video,
      });
      aiProcessing = finalized.aiProcessing;
    }
    return Response.json({ ok: true, aiProcessing, asset, size: stored.size });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as VideoPayload;
    const videoId = text(payload.videoId, 80);
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    const { database, identity, video } = await requireVideoAccess(videoId, "read");
    if (payload.action === "viewed") {
      if (identity.role !== "member" || identity.id !== video.member_id || video.publication_status !== "Published") {
        return Response.json({ error: "Only the assigned member can record this view." }, { status: 403 });
      }
      const viewedAt = new Date().toISOString();
      await database.batch([
        database
          .prepare("UPDATE lesson_videos SET is_viewed_by_member = 1, viewed_at = ?, review_status = 'Reviewed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(viewedAt, video.id),
        database
          .prepare("INSERT INTO video_views (id, video_id, member_id, viewed_at) VALUES (?, ?, ?, ?)")
          .bind(crypto.randomUUID(), video.id, identity.id, viewedAt),
      ]);
      const updated = await getVideo(database, video.id);
      return Response.json({ video: updated ? serializeVideo(updated, identity.role) : null });
    }

    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    if (!canManageVideo(identity, {
      memberId: video.member_id,
      coachId: video.coach_id,
      uploadedByRole: video.uploaded_by_role,
    }, assignedMemberIds)) {
      return Response.json({ error: "You cannot edit this video." }, { status: 403 });
    }

    if (identity.role === "member") {
      await database
        .prepare("UPDATE lesson_videos SET user_notes = ?, review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(
          optionalText(payload.userNotes, 4000) ?? video.user_notes,
          optionalText(payload.reviewStatus, 40) ?? video.review_status,
          video.id,
        )
        .run();
    } else {
      const publicationStatus = optionalText(payload.publicationStatus, 20) ?? video.publication_status;
      if (publicationStatus === "Published" && video.upload_status !== "ready") {
        return Response.json({ error: "Finish uploading the video file before publishing." }, { status: 409 });
      }
      const requestedMemberId = optionalText(payload.memberId, 80);
      const ownershipError = videoOwnershipChangeError(video.member_id, requestedMemberId);
      if (ownershipError) {
        return Response.json({
          error: ownershipError,
        }, { status: 409 });
      }
      await database
        .prepare(
          `UPDATE lesson_videos SET
            title = ?, description = ?, coach_notes = ?, coach_private_notes = ?,
            video_type = ?, focus_area = ?, swing_type = ?, club = ?, tags_json = ?,
            session_data_id = ?, duration = ?, lesson_date = ?, publication_status = ?,
            review_status = ?, lesson_summary = ?, worked_on = ?, key_issue = ?,
            improvement = ?, practice_assignment = ?, recommended_drill = ?,
            member_facing_notes = ?, next_session_goal = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        )
        .bind(
          optionalText(payload.title, 120) ?? video.title,
          optionalText(payload.description, 4000) ?? video.description,
          optionalText(payload.coachNotes, 4000) ?? video.coach_notes,
          optionalText(payload.coachPrivateNotes, 4000) ?? video.coach_private_notes,
          optionalText(payload.videoType, 80) ?? video.video_type,
          payload.focusArea === null ? null : optionalText(payload.focusArea, 80) ?? video.focus_area,
          payload.swingType === null ? null : optionalText(payload.swingType, 80) ?? video.swing_type,
          payload.club === null ? null : optionalText(payload.club, 80) ?? video.club,
          Array.isArray(payload.tags) ? JSON.stringify(stringList(payload.tags)) : video.tags_json,
          payload.sessionId === null ? null : optionalText(payload.sessionId, 120) ?? video.session_data_id,
          typeof payload.duration === "number" ? Math.max(0, Math.round(payload.duration)) : video.duration,
          payload.lessonDate === null ? null : optionalText(payload.lessonDate, 20) ?? video.lesson_date,
          publicationStatus,
          optionalText(payload.reviewStatus, 40) ?? video.review_status,
          optionalText(payload.lessonSummary, 4000) ?? video.lesson_summary,
          optionalText(payload.workedOn, 4000) ?? video.worked_on,
          optionalText(payload.keyIssue, 4000) ?? video.key_issue,
          optionalText(payload.improvement, 4000) ?? video.improvement,
          optionalText(payload.practiceAssignment, 4000) ?? video.practice_assignment,
          optionalText(payload.recommendedDrill, 4000) ?? video.recommended_drill,
          optionalText(payload.memberFacingNotes, 4000) ?? video.member_facing_notes,
          optionalText(payload.nextSessionGoal, 4000) ?? video.next_session_goal,
          video.id,
        )
        .run();

      if (publicationStatus === "Published") {
        await upsertStructuredCoachFeedback(database, video, payload);
        await recordActivity({
          action: "feedback_submitted",
          actor: identity,
          database,
          entityId: video.id,
          entityType: "video",
          memberId: video.member_id,
          metadata: { publicationStatus },
          summary: `${identity.displayName} published coach feedback for a lesson video.`,
          targetUserId: video.member_id,
        });
      }

      if (publicationStatus === "Published" && payload.notifyMember === true) {
        const notificationVideo = await getVideo(database, video.id);
        if (!notificationVideo) {
          return Response.json({ error: "The video could not be reloaded for notification." }, { status: 500 });
        }
        const notification = await sendVideoNotification(
          request,
          identity,
          {
            email: notificationVideo.member_email,
            firstName: notificationVideo.member_first_name,
            lastName: notificationVideo.member_last_name,
          },
          {
            id: notificationVideo.id,
            memberId: notificationVideo.member_id,
            title: notificationVideo.title,
            memberFacingNotes: notificationVideo.member_facing_notes,
            practiceAssignment: notificationVideo.practice_assignment,
            lessonSummary: notificationVideo.lesson_summary,
          },
        );
        await database
          .prepare(
            `UPDATE lesson_videos SET
              email_status = ?, email_sent_at = ?, email_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          )
          .bind(
            notification.status,
            notification.status === "Sent" ? new Date().toISOString() : null,
            "failureReason" in notification ? notification.failureReason : null,
            video.id,
          )
          .run();
      }
    }

    const updated = await getVideo(database, video.id);
    return Response.json({ video: updated ? serializeVideo(updated, identity.role) : null });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    const { database, video } = await requireVideoAccess(videoId, "manage");
    const aiAssets = await database
      .prepare("SELECT audio_storage_path FROM video_ai_processing_jobs WHERE video_id = ? AND audio_storage_path IS NOT NULL")
      .bind(video.id)
      .all<{ audio_storage_path: string }>();
    const bucket = getRequiredVideoStorage();
    const keys = Array.from(new Set([
      video.storage_path,
      video.source_storage_path,
      video.thumbnail_storage_path,
      ...(aiAssets.results ?? []).flatMap((asset) => asset.audio_storage_path.split("\n")),
    ].filter((key): key is string => Boolean(key))));
    if (keys.length) await bucket.delete(keys);
    await database.batch([
      database.prepare("DELETE FROM video_views WHERE video_id = ?").bind(video.id),
      database.prepare("DELETE FROM video_email_notifications WHERE video_id = ?").bind(video.id),
      database.prepare("DELETE FROM video_lesson_recap_drafts WHERE video_id = ?").bind(video.id),
      database.prepare("DELETE FROM video_transcripts WHERE video_id = ?").bind(video.id),
      database.prepare("DELETE FROM video_ai_processing_jobs WHERE video_id = ?").bind(video.id),
      database.prepare("DELETE FROM lesson_videos WHERE id = ?").bind(video.id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return responseFromError(error);
  }
}
