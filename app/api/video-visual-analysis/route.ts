import { requireIdentity, responseFromError } from "@/lib/server/platform";
import { readVideoVisualAnalysisState, updateVideoVisualAnalysisState } from "@/lib/server/video-visual-analysis";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    return await readVideoVisualAnalysisState(identity, videoId);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity();
    if (identity.role !== "coach" && identity.role !== "admin") {
      return Response.json({ error: "Swing review is available in Coach mode only." }, { status: 403 });
    }
    const body = await request.text();
    if (body.length > 5_000_000) return Response.json({ error: "Swing frames are too large." }, { status: 413 });
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid body");
    } catch {
      return Response.json({ error: "Provide a valid swing review request." }, { status: 400 });
    }
    return await updateVideoVisualAnalysisState(identity, payload);
  } catch (error) {
    return responseFromError(error);
  }
}
