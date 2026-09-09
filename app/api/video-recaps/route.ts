import { requireIdentity, responseFromError } from "@/lib/server/platform";
import { readVideoRecapState, updateVideoRecapState } from "@/lib/server/video-ai-recap";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const videoId = new URL(request.url).searchParams.get("videoId")?.trim() || "";
    if (!videoId) {
      return Response.json({ error: "videoId is required." }, { status: 400 });
    }
    return await readVideoRecapState(identity, videoId);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
    return await updateVideoRecapState(identity, payload, request);
  } catch (error) {
    return responseFromError(error);
  }
}
