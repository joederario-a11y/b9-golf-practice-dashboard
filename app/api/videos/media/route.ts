import { canAccessVideo } from "@/lib/video-policy.mjs";
import {
  ensurePlatformSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  getRequiredVideoStorage,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";

type MediaVideoRow = {
  id: string;
  member_id: string;
  coach_id: string | null;
  publication_status: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  mime_type: string;
};

function parseRange(value: string | null, size: number) {
  if (!value?.startsWith("bytes=")) return null;
  const [startText, endText] = value.slice(6).split("-", 2);
  const start = startText ? Number(startText) : 0;
  const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end, length: end - start + 1 };
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const url = new URL(request.url);
    const videoId = url.searchParams.get("videoId")?.trim() || "";
    const asset = url.searchParams.get("asset") === "thumbnail" ? "thumbnail" : "video";
    if (!videoId) return Response.json({ error: "videoId is required." }, { status: 400 });
    const video = await database
      .prepare(
        `SELECT id, member_id, coach_id, publication_status, storage_path,
          thumbnail_storage_path, mime_type
        FROM lesson_videos WHERE id = ?`,
      )
      .bind(videoId)
      .first<MediaVideoRow>();
    if (!video) return Response.json({ error: "Video not found." }, { status: 404 });
    const assignedMemberIds = await getAssignedMemberIds(identity, database);
    if (!canAccessVideo(identity, {
      memberId: video.member_id,
      coachId: video.coach_id,
      publicationStatus: video.publication_status,
    }, assignedMemberIds)) {
      return Response.json({ error: "You do not have access to this video." }, { status: 403 });
    }

    const storagePath = asset === "thumbnail" ? video.thumbnail_storage_path : video.storage_path;
    if (!storagePath) return Response.json({ error: "Media not found." }, { status: 404 });
    const bucket = getRequiredVideoStorage();
    const head = await bucket.head(storagePath);
    if (!head) return Response.json({ error: "Media not found." }, { status: 404 });
    const range = asset === "video" ? parseRange(request.headers.get("range"), head.size) : null;
    const object = range
      ? await bucket.get(storagePath, { range: { offset: range.start, length: range.length } })
      : await bucket.get(storagePath);
    if (!object) return Response.json({ error: "Media not found." }, { status: 404 });

    const responseHeaders = new Headers();
    object.writeHttpMetadata(responseHeaders);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("ETag", object.httpEtag);
    if (!responseHeaders.has("Content-Type")) {
      responseHeaders.set("Content-Type", asset === "thumbnail" ? "image/jpeg" : video.mime_type);
    }
    if (range) {
      responseHeaders.set("Content-Length", String(range.length));
      responseHeaders.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
    } else {
      responseHeaders.set("Content-Length", String(head.size));
    }
    return new Response(object.body, {
      headers: responseHeaders,
      status: range ? 206 : 200,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
