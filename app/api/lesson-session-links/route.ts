import { canAccessVideo } from "@/lib/video-policy.mjs";
import {
  ensurePlatformSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import {
  loadLessonSessionLinksForVideos,
  removeLessonSessionLink,
  saveStoredSessionForMember,
  setPrimaryLessonSessionLink,
  upsertLessonSessionLink,
} from "@/lib/server/lesson-session-links";

type VideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  uploaded_by_role: string;
  publication_status: string;
  lesson_summary: string;
  worked_on: string;
  key_issue: string;
  improvement: string;
  practice_assignment: string;
  recommended_drill: string;
  member_facing_notes: string;
  next_session_goal: string;
};

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function getVideo(database: D1Database, videoId: string) {
  return database
    .prepare(
      `SELECT
        id, member_id, coach_id, uploaded_by_role, publication_status,
        lesson_summary, worked_on, key_issue, improvement, practice_assignment,
        recommended_drill, member_facing_notes, next_session_goal
       FROM lesson_videos
       WHERE id = ?`,
    )
    .bind(videoId)
    .first<VideoRow>();
}

async function getMember(database: D1Database, memberId: string) {
  return database
    .prepare("SELECT id, first_name, last_name, email FROM users WHERE id = ? AND role = 'member'")
    .bind(memberId)
    .first<MemberRow>();
}

function sessionSourceType(payload: Record<string, unknown>) {
  const sourceType = text(payload.sourceType, 40);
  if (sourceType) return sourceType;
  const submissionType = text(payload.submissionType, 40).toLowerCase();
  if (submissionType.includes("photo")) return "photo_upload";
  if (submissionType.includes("csv")) return "csv_upload";
  if (submissionType.includes("manual")) return "manual_entry";
  return "existing_session";
}

async function requireVideoForLinkAction(database: D1Database, videoId: string) {
  const identity = await requireIdentity();
  await ensurePlatformSchema(database);
  const video = await getVideo(database, videoId);
  if (!video) throw new Response("Lesson video not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  if (!canAccessVideo(identity, {
    coachId: video.coach_id,
    memberId: video.member_id,
    publicationStatus: video.publication_status,
  }, assignedMemberIds)) {
    throw new Response("You do not have access to this lesson.", { status: 403 });
  }
  return { assignedMemberIds, identity, video };
}

export async function GET(request: Request) {
  try {
    const database = getRequiredDatabase();
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    await requireVideoForLinkAction(database, videoId);
    const links = await loadLessonSessionLinksForVideos(database, [videoId]);
    return Response.json({ links: links.get(videoId) ?? [] });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const database = getRequiredDatabase();
    const payload = await request.json() as Record<string, unknown>;
    const videoId = text(payload.videoId, 80);
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    const { assignedMemberIds, identity, video } = await requireVideoForLinkAction(database, videoId);

    let sessionId = text(payload.sessionId, 180);
    if (!sessionId && payload.session && typeof payload.session === "object") {
      const member = await getMember(database, video.member_id);
      if (!member) throw new Response("Student account not found.", { status: 404 });
      const savedSession = await saveStoredSessionForMember(database, member, payload.session);
      sessionId = savedSession.id;
    }
    if (!sessionId) return Response.json({ error: "Choose or upload session data first." }, { status: 400 });

    const result = await upsertLessonSessionLink({
      assignedMemberIds,
      database,
      identity,
      isPrimary: payload.isPrimary === true,
      sessionId,
      sourceType: sessionSourceType(payload),
      video,
    });
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const database = getRequiredDatabase();
    const payload = await request.json() as Record<string, unknown>;
    const videoId = text(payload.videoId, 80);
    const linkId = text(payload.linkId, 80);
    if (!videoId || !linkId) return Response.json({ error: "videoId and linkId are required." }, { status: 400 });
    const { assignedMemberIds, identity, video } = await requireVideoForLinkAction(database, videoId);
    const result = await setPrimaryLessonSessionLink({ assignedMemberIds, database, identity, linkId, video });
    return Response.json(result);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const database = getRequiredDatabase();
    const url = new URL(request.url);
    const videoId = url.searchParams.get("videoId")?.trim() || "";
    const linkId = url.searchParams.get("linkId")?.trim() || "";
    if (!videoId || !linkId) return Response.json({ error: "videoId and linkId are required." }, { status: 400 });
    const { assignedMemberIds, identity, video } = await requireVideoForLinkAction(database, videoId);
    const result = await removeLessonSessionLink({ assignedMemberIds, database, identity, linkId, video });
    return Response.json(result);
  } catch (error) {
    return responseFromError(error);
  }
}
