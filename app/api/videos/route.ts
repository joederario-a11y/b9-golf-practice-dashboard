import {
  canAccessVideo,
  canManageVideo,
  canUploadToMember,
  validateThumbnailFile,
  validateVideoFile,
} from "@/lib/video-policy.mjs";
import {
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

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : undefined;
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

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    const requestedMemberId = new URL(request.url).searchParams.get("memberId")?.trim() || "";
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

    const title = text(payload.title, 120);
    const fileName = text(payload.fileName, 255);
    const mimeType = text(payload.mimeType, 100).toLowerCase();
    const fileSize = Number(payload.fileSize);
    const validationError = validateVideoFile(mimeType, fileSize);
    if (!title || !fileName) {
      return Response.json({ error: "Video title and file name are required." }, { status: 400 });
    }
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const videoId = crypto.randomUUID();
    const storagePath = `lesson-videos/${memberId}/${videoId}/video`;
    const coachId = identity.role === "member" ? null : identity.id;
    const publicationStatus = text(payload.publicationStatus, 20) === "Published" ? "Published" : "Draft";
    await database
      .prepare(
        `INSERT INTO lesson_videos (
          id, member_id, coach_id, uploaded_by_role, title, description,
          coach_notes, coach_private_notes, user_notes, video_type, focus_area,
          swing_type, club, tags_json, session_data_id, storage_path,
          thumbnail_storage_path, file_name, file_size, mime_type, duration,
          lesson_date, publication_status, upload_status, review_status,
          email_status, is_viewed_by_member, lesson_summary, worked_on,
          key_issue, improvement, practice_assignment, recommended_drill,
          member_facing_notes, next_session_goal, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?,
          ?, ?, 'pending', 'New', 'Not sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
        Math.max(0, Math.round(Number(payload.duration) || 0)),
        text(payload.lessonDate, 20) || null,
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

    if (coachId && payload.generateAiRecap !== false) {
      await createVideoRecapProcessingJob(
        database,
        identity,
        videoId,
        payload.generateAiRecap,
        text(payload.processingLanguage, 12) || "en",
      );
    }

    const row = await getVideo(database, videoId);
    return Response.json({ video: row ? serializeVideo(row, identity.role) : null }, { status: 201 });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const url = new URL(request.url);
    const videoId = url.searchParams.get("videoId")?.trim() || "";
    const asset = url.searchParams.get("asset") === "thumbnail" ? "thumbnail" : "video";
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    const { database, identity, video } = await requireVideoAccess(videoId, "manage");
    const mimeType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const fileName = decodeURIComponent(request.headers.get("x-file-name") || video.file_name);
    const declaredSize = Number(request.headers.get("x-file-size") || request.headers.get("content-length"));
    const validationError = asset === "thumbnail"
      ? validateThumbnailFile(mimeType, declaredSize)
      : validateVideoFile(mimeType, declaredSize);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    if (!request.body) {
      return Response.json({ error: "The upload body is empty." }, { status: 400 });
    }

    const bucket = getRequiredVideoStorage();
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
      await database
        .prepare(
          `UPDATE lesson_videos SET
            file_name = ?, file_size = ?, mime_type = ?, upload_status = 'ready',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        )
        .bind(fileName, stored.size, mimeType, video.id)
        .run();
      await recordActivity({
        action: "video_uploaded",
        actor: identity,
        database,
        entityId: video.id,
        entityType: "video",
        memberId: video.member_id,
        metadata: { fileName, size: stored.size, mimeType },
        summary: `${identity.displayName} uploaded ${fileName}.`,
        targetUserId: video.member_id,
      });
      try {
        aiProcessing = await queueVideoRecapWorkflowAfterUpload(database, identity, video.id);
      } catch {
        aiProcessing = { queued: false };
      }
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
      const nextMemberId = identity.role === "admin"
        ? optionalText(payload.memberId, 80) ?? video.member_id
        : video.member_id;
      if (nextMemberId !== video.member_id) {
        const nextMember = await database
          .prepare("SELECT id FROM users WHERE id = ? AND role = 'member'")
          .bind(nextMemberId)
          .first<{ id: string }>();
        if (!nextMember) {
          return Response.json({ error: "The reassigned member does not exist." }, { status: 400 });
        }
      }
      await database
        .prepare(
          `UPDATE lesson_videos SET
            member_id = ?, title = ?, description = ?, coach_notes = ?, coach_private_notes = ?,
            video_type = ?, focus_area = ?, swing_type = ?, club = ?, tags_json = ?,
            session_data_id = ?, duration = ?, lesson_date = ?, publication_status = ?,
            review_status = ?, lesson_summary = ?, worked_on = ?, key_issue = ?,
            improvement = ?, practice_assignment = ?, recommended_drill = ?,
            member_facing_notes = ?, next_session_goal = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        )
        .bind(
          nextMemberId,
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
        await recordActivity({
          action: "feedback_submitted",
          actor: identity,
          database,
          entityId: video.id,
          entityType: "video",
          memberId: nextMemberId,
          metadata: { publicationStatus },
          summary: `${identity.displayName} published coach feedback for a lesson video.`,
          targetUserId: nextMemberId,
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
    const keys = [
      video.storage_path,
      video.thumbnail_storage_path,
      ...(aiAssets.results ?? []).map((asset) => asset.audio_storage_path),
    ].filter((key): key is string => Boolean(key));
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
