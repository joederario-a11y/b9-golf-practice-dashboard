import { requireIdentity, responseFromError } from "@/lib/server/platform";
import { readVideoVisualAnalysisState, updateVideoVisualAnalysisState } from "@/lib/server/video-visual-analysis";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    return readVideoVisualAnalysisState(identity, videoId);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
    return updateVideoVisualAnalysisState(identity, payload);
  } catch (error) {
    return responseFromError(error);
  }
}
