import { canAccessVideo, canManageVideo } from "@/lib/video-policy.mjs";
import { comparisonPairAllowed, normalizeComparison } from "@/lib/swing-comparison-policy.mjs";
import { getAssignedMemberIds, getRequiredDatabase, requireIdentity, responseFromError } from "@/lib/server/platform";
import { analyzeSwingComparison } from "@/lib/server/swing-comparison";

type Video = { id: string; memberId: string; coachId: string; publicationStatus: string; uploadStatus: string; uploadedAt: string; duration: number };
type Saved = { draft_json: string | null; published_json: string | null };
async function loadVideo(db: ReturnType<typeof getRequiredDatabase>, id: string) {
  const video = await db.prepare("SELECT id, member_id AS memberId, coach_id AS coachId, publication_status AS publicationStatus, upload_status AS uploadStatus, created_at AS uploadedAt, duration FROM lesson_videos WHERE id = ?").bind(id).first() as Video | null;
  if (!video) throw new Response("Lesson not found.", { status: 404 });
  return video;
}
async function context(videoId: string, write: boolean) {
  const identity = await requireIdentity();
  if (write && !["coach", "admin"].includes(identity.role)) throw new Response("Only a Coach can edit comparisons.", { status: 403 });
  const db = getRequiredDatabase();
  const assigned = await getAssignedMemberIds(identity, db);
  const video = await loadVideo(db, videoId);
  if (!(write ? canManageVideo : canAccessVideo)(identity, video, assigned)) throw new Response("This lesson is not available.", { status: 403 });
  await db.prepare("CREATE TABLE IF NOT EXISTS lesson_swing_comparisons (video_id TEXT PRIMARY KEY REFERENCES lesson_videos(id) ON DELETE CASCADE, draft_json TEXT, published_json TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  return { identity, db, assigned, video };
}
export async function GET(request: Request) {
  try {
    const { identity, db, assigned, video } = await context(new URL(request.url).searchParams.get("videoId") || "", false);
    const row = await db.prepare("SELECT draft_json, published_json FROM lesson_swing_comparisons WHERE video_id = ?").bind(video.id).first<Saved>();
    const student = identity.role === "member";
    const raw = student ? row?.published_json : row?.draft_json || row?.published_json;
    if (!raw) return Response.json({ comparison: null });
    const comparison = JSON.parse(raw);
    const previous = await loadVideo(db, comparison.previousVideoId).catch(error => {
      if (error instanceof Response && error.status === 404) return null;
      throw error;
    });
    if (!previous) return Response.json({ comparison: null });
    if (!comparisonPairAllowed(video, previous) || !canAccessVideo(identity, previous, assigned)) return Response.json({ comparison: null });
    return Response.json({ comparison, published: Boolean(row?.published_json) });
  } catch (error) { return responseFromError(error); }
}

async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Response("A comparison is required.", { status: 400 });
  let size = 0; let text = ""; const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10_000_000) { await reader.cancel(); throw new Response("The selected frames are too large.", { status: 413 }); }
      text += decoder.decode(value, { stream: true });
    }
    const result = JSON.parse(text + decoder.decode());
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch (error) { if (error instanceof Response) throw error; throw new Response("Invalid comparison request.", { status: 400 }); }
  finally { reader.releaseLock(); }
}

export async function PATCH(request: Request) {
  try {
    // Authenticate before reading image payloads.
    const identity = await requireIdentity();
    if (!["coach", "admin"].includes(identity.role)) throw new Response("Only a Coach can edit comparisons.", { status: 403 });
    const body = await boundedJson(request);
    const { db, video, assigned } = await context(String(body.videoId || ""), true);
    if (body.action === "unpublish") {
      await db.prepare("UPDATE lesson_swing_comparisons SET published_json = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE video_id = ?").bind(identity.id, video.id).run();
      return Response.json({ ok: true });
    }
    const row = await db.prepare("SELECT draft_json, published_json FROM lesson_swing_comparisons WHERE video_id = ?").bind(video.id).first<Saved>();
    const publishingSaved = body.action === "publishWithLesson";
    const input = (publishingSaved ? JSON.parse(row?.draft_json || "null") : body.comparison) as Record<string, unknown> | null;
    if (publishingSaved && !input?.includeWithLesson) return Response.json({ ok: true });
    const previousId = body.action === "analyze" ? body.previousVideoId : input?.previousVideoId;
    const previous = await loadVideo(db, String(previousId || ""));
    if (!canAccessVideo(identity, previous, assigned) || !comparisonPairAllowed(video, previous)) throw new Response("Choose an older lesson for the same Student.", { status: 403 });
    if (body.action === "analyze") return Response.json(await analyzeSwingComparison(body, video.duration, previous.duration, request.signal));
    if (!["save", "publish", "publishWithLesson"].includes(String(body.action))) throw new Response("Unknown comparison action.", { status: 400 });
    let comparison;
    try { comparison = normalizeComparison(input, video.duration, previous.duration); }
    catch (error) { throw new Response(error instanceof Error ? error.message : "Invalid comparison", { status: 400 }); }
    const publish = body.action !== "save";
    if (publish && (video.publicationStatus !== "Published" || previous.publicationStatus !== "Published")) throw new Response("Publish both lessons before sharing this comparison.", { status: 409 });
    const json = JSON.stringify(comparison);
    await db.prepare(`INSERT INTO lesson_swing_comparisons (video_id, draft_json, published_json, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET draft_json = excluded.draft_json,
      published_json = CASE WHEN ? THEN excluded.published_json ELSE lesson_swing_comparisons.published_json END,
      updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`).bind(video.id, json, publish ? json : null, identity.id, publish ? 1 : 0).run();
    return Response.json({ comparison, published: publish || Boolean(row?.published_json) });
  } catch (error) { return responseFromError(error); }
}
