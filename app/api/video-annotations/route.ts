import {
  canManageVideoAnnotations,
  canViewVideoAnnotations,
  normalizeVideoAnnotationList,
} from "@/lib/video-annotation-policy.mjs";
import {
  ensureVideoAnnotationSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  getRequiredVideoStorage,
  recordActivity,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";

type AnnotationVideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  publication_status: string;
  upload_status: string;
  storage_path: string;
  file_name: string;
};

type AnnotationSetRow = {
  id: string;
  video_id: string;
  member_id: string;
  coach_id: string;
  version: number;
  status: string;
  created_by_user_id: string;
  published_by_user_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AnnotationRow = {
  id: string;
  annotation_set_id: string;
  video_id: string;
  type: string;
  start_time_ms: number;
  end_time_ms: number;
  geometry_json: string;
  normalized_coordinates: number;
  color: string;
  stroke_width: number;
  text: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type AnnotationExportRow = {
  id: string;
  annotation_set_id: string;
  video_id: string;
  member_id: string;
  coach_id: string;
  requested_by_user_id: string;
  status: string;
  storage_path: string | null;
  source_storage_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeJson(value: string | null | undefined, fallback: unknown) {
  try {
    return value ? JSON.parse(value) as unknown : fallback;
  } catch {
    return fallback;
  }
}

function videoForPolicy(video: AnnotationVideoRow) {
  return {
    coachId: video.coach_id ?? undefined,
    memberId: video.member_id,
    publicationStatus: video.publication_status,
    uploadStatus: video.upload_status,
  };
}

function serializeAnnotation(row: AnnotationRow) {
  return {
    id: row.id,
    annotationSetId: row.annotation_set_id,
    color: row.color,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    deletedAt: row.deleted_at,
    endTimeMs: Number(row.end_time_ms),
    geometry: safeJson(row.geometry_json, {}),
    normalizedCoordinates: Boolean(row.normalized_coordinates),
    startTimeMs: Number(row.start_time_ms),
    strokeWidth: Number(row.stroke_width),
    text: row.text ?? "",
    type: row.type,
    updatedAt: row.updated_at,
    videoId: row.video_id,
  };
}

function serializeSet(row: AnnotationSetRow | null, annotations: AnnotationRow[] = []) {
  if (!row) return null;
  return {
    id: row.id,
    videoId: row.video_id,
    memberId: row.member_id,
    coachId: row.coach_id,
    version: Number(row.version),
    status: row.status,
    createdByUserId: row.created_by_user_id,
    publishedByUserId: row.published_by_user_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    annotations: annotations.filter((item) => !item.deleted_at).map(serializeAnnotation),
  };
}

function serializeExport(row: AnnotationExportRow) {
  return {
    id: row.id,
    annotationSetId: row.annotation_set_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    sourceStoragePath: row.source_storage_path,
    status: row.status,
    storagePath: row.storage_path,
    updatedAt: row.updated_at,
    videoId: row.video_id,
  };
}

async function getVideo(database: D1Database, videoId: string) {
  return database
    .prepare(
      `SELECT id, member_id, coach_id, publication_status, upload_status, storage_path, file_name
       FROM lesson_videos
       WHERE id = ?`,
    )
    .bind(videoId)
    .first<AnnotationVideoRow>();
}

async function requireAnnotationVideo(database: D1Database, videoId: string) {
  const video = await getVideo(database, videoId);
  if (!video) throw new Response("Video not found.", { status: 404 });
  return video;
}

async function authorizeVideo(database: D1Database, video: AnnotationVideoRow, mode: "read" | "manage", requestedStatus = "published") {
  const identity = await requireIdentity();
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  const policyVideo = videoForPolicy(video);
  const allowed = mode === "manage"
    ? canManageVideoAnnotations(identity, policyVideo, assignedMemberIds)
    : canViewVideoAnnotations(identity, policyVideo, assignedMemberIds, requestedStatus);
  if (!allowed) throw new Response("You do not have permission to use these markups.", { status: 403 });
  return { assignedMemberIds, identity };
}

async function loadSet(database: D1Database, videoId: string, status: "draft" | "published", coachId?: string) {
  const where = status === "draft"
    ? "video_id = ? AND status = 'draft' AND coach_id = ?"
    : "video_id = ? AND status = 'published'";
  const row = status === "draft"
    ? await database.prepare(`SELECT * FROM video_annotation_sets WHERE ${where} ORDER BY updated_at DESC LIMIT 1`).bind(videoId, coachId).first<AnnotationSetRow>()
    : await database.prepare(`SELECT * FROM video_annotation_sets WHERE ${where} ORDER BY updated_at DESC LIMIT 1`).bind(videoId).first<AnnotationSetRow>();
  if (!row) return { annotations: [] as AnnotationRow[], set: null as AnnotationSetRow | null };
  const annotations = await database
    .prepare("SELECT * FROM video_annotations WHERE annotation_set_id = ? ORDER BY start_time_ms ASC, created_at ASC")
    .bind(row.id)
    .all<AnnotationRow>();
  return { annotations: annotations.results ?? [], set: row };
}

async function nextVersion(database: D1Database, videoId: string) {
  const row = await database
    .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM video_annotation_sets WHERE video_id = ?")
    .bind(videoId)
    .first<{ version: number }>();
  return Number(row?.version ?? 1);
}

async function ensureDraftSet(database: D1Database, video: AnnotationVideoRow, coachId: string, createdByUserId: string) {
  const existing = await loadSet(database, video.id, "draft", coachId);
  if (existing.set) return existing.set;
  const setId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO video_annotation_sets (
        id, video_id, member_id, coach_id, version, status, created_by_user_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(setId, video.id, video.member_id, coachId, await nextVersion(database, video.id), createdByUserId)
    .run();
  const created = await database.prepare("SELECT * FROM video_annotation_sets WHERE id = ?").bind(setId).first<AnnotationSetRow>();
  if (!created) throw new Response("The markups draft could not be created.", { status: 500 });
  return created;
}

async function loadExports(database: D1Database, videoId: string) {
  const result = await database
    .prepare("SELECT * FROM video_annotation_exports WHERE video_id = ? ORDER BY created_at DESC LIMIT 10")
    .bind(videoId)
    .all<AnnotationExportRow>();
  return (result.results ?? []).map(serializeExport);
}

async function annotationResponse(database: D1Database, video: AnnotationVideoRow, identityRole: string, identityId: string) {
  const published = await loadSet(database, video.id, "published");
  const draft = identityRole === "coach" || identityRole === "admin"
    ? await loadSet(database, video.id, "draft", identityId)
    : { annotations: [] as AnnotationRow[], set: null as AnnotationSetRow | null };
  return Response.json({
    draft: serializeSet(draft.set, draft.annotations),
    exports: identityRole === "member" ? [] : await loadExports(database, video.id),
    published: serializeSet(published.set, published.annotations),
  });
}

export async function GET(request: Request) {
  try {
    const database = getRequiredDatabase();
    await ensureVideoAnnotationSchema(database);
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    const video = await requireAnnotationVideo(database, videoId);
    const { identity } = await authorizeVideo(database, video, "read", "published");
    return annotationResponse(database, video, identity.role, identity.id);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const database = getRequiredDatabase();
    await ensureVideoAnnotationSchema(database);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const videoId = text(payload.videoId, 120);
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    const video = await requireAnnotationVideo(database, videoId);
    const { identity } = await authorizeVideo(database, video, "manage");
    const draft = await ensureDraftSet(database, video, identity.id, identity.id);
    const annotations = normalizeVideoAnnotationList(payload.annotations, Number(payload.currentTimeMs ?? 0));

    await database.prepare("DELETE FROM video_annotations WHERE annotation_set_id = ?").bind(draft.id).run();
    for (const annotation of annotations) {
      await database
        .prepare(
          `INSERT INTO video_annotations (
            id, annotation_set_id, video_id, type, start_time_ms, end_time_ms,
            geometry_json, normalized_coordinates, color, stroke_width, text,
            created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
          annotation.id,
          draft.id,
          video.id,
          annotation.type,
          annotation.startTimeMs,
          annotation.endTimeMs,
          JSON.stringify(annotation.geometry),
          annotation.color,
          annotation.strokeWidth,
          annotation.text || null,
          identity.id,
        )
        .run();
    }
    await database
      .prepare("UPDATE video_annotation_sets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(draft.id)
      .run();
    await recordActivity({
      action: "video_markups_saved",
      actor: identity,
      database,
      entityId: video.id,
      entityType: "video",
      memberId: video.member_id,
      metadata: { annotationCount: annotations.length, annotationSetId: draft.id },
      summary: `${identity.displayName} saved coach markups.`,
      targetUserId: video.member_id,
    });
    return annotationResponse(database, video, identity.role, identity.id);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const database = getRequiredDatabase();
    await ensureVideoAnnotationSchema(database);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const videoId = text(payload.videoId, 120);
    const action = text(payload.action, 40);
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    const video = await requireAnnotationVideo(database, videoId);
    const { identity } = await authorizeVideo(database, video, "manage");

    if (action === "publish") {
      const draft = await loadSet(database, video.id, "draft", identity.id);
      if (!draft.set) return Response.json({ error: "Save markups before publishing." }, { status: 409 });
      await database.batch([
        database.prepare("UPDATE video_annotation_sets SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND status = 'published'").bind(video.id),
        database
          .prepare(
            `UPDATE video_annotation_sets
             SET status = 'published', published_by_user_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(identity.id, draft.set.id),
      ]);
      await recordActivity({
        action: "video_markups_published",
        actor: identity,
        database,
        entityId: video.id,
        entityType: "video",
        memberId: video.member_id,
        metadata: { annotationSetId: draft.set.id, version: draft.set.version },
        summary: `${identity.displayName} published lesson markups.`,
        targetUserId: video.member_id,
      });
      return annotationResponse(database, video, identity.role, identity.id);
    }

    if (action === "removeAllPublished") {
      await database
        .prepare("UPDATE video_annotation_sets SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE video_id = ? AND status = 'published'")
        .bind(video.id)
        .run();
      await recordActivity({
        action: "video_markups_removed",
        actor: identity,
        database,
        entityId: video.id,
        entityType: "video",
        memberId: video.member_id,
        metadata: {},
        summary: `${identity.displayName} removed published visual markups.`,
        targetUserId: video.member_id,
      });
      return annotationResponse(database, video, identity.role, identity.id);
    }

    if (action === "exportAnnotatedCopy") {
      const selectedSet = text(payload.annotationSetId, 120);
      const published = selectedSet
        ? await database.prepare("SELECT * FROM video_annotation_sets WHERE id = ? AND video_id = ?").bind(selectedSet, video.id).first<AnnotationSetRow>()
        : (await loadSet(database, video.id, "published")).set;
      if (!published || published.status === "draft") {
        return Response.json({ error: "Publish markups before exporting an annotated copy." }, { status: 409 });
      }
      const exportId = crypto.randomUUID();
      const storagePath = `lesson-videos/${video.member_id}/${video.id}/annotated-exports/${exportId}/video`;
      const bucket = getRequiredVideoStorage();
      const original = await bucket.get(video.storage_path);
      if (!original?.body) {
        await database
          .prepare(
            `INSERT INTO video_annotation_exports (
              id, annotation_set_id, video_id, member_id, coach_id, requested_by_user_id,
              status, source_storage_path, error_code, error_message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, 'source_missing', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          )
          .bind(exportId, published.id, video.id, video.member_id, published.coach_id, identity.id, video.storage_path, "The original video could not be read.")
          .run();
        return annotationResponse(database, video, identity.role, identity.id);
      }
      const stored = await bucket.put(storagePath, original.body, {
        customMetadata: {
          annotationSetId: published.id,
          exportType: "non_destructive_annotation_copy",
          originalVideoId: video.id,
          requestedBy: identity.id,
        },
        httpMetadata: { contentType: original.httpMetadata?.contentType ?? "video/mp4" },
      });
      await database
        .prepare(
          `INSERT INTO video_annotation_exports (
            id, annotation_set_id, video_id, member_id, coach_id, requested_by_user_id,
            status, storage_path, source_storage_path, created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(exportId, published.id, video.id, video.member_id, published.coach_id, identity.id, storagePath, video.storage_path)
        .run();
      await recordActivity({
        action: "video_markups_exported",
        actor: identity,
        database,
        entityId: video.id,
        entityType: "video",
        memberId: video.member_id,
        metadata: { annotationSetId: published.id, exportId, size: stored.size },
        summary: `${identity.displayName} created a separate annotated-copy export.`,
        targetUserId: video.member_id,
      });
      return annotationResponse(database, video, identity.role, identity.id);
    }

    return Response.json({ error: "Unsupported annotation action." }, { status: 400 });
  } catch (error) {
    return responseFromError(error);
  }
}
