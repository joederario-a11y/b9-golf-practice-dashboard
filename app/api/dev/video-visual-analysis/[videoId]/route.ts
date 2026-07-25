import {
  getPlatformEnvironment,
  requireIdentity,
  responseFromError,
} from "@/lib/server/platform";
import { readVideoVisualAnalysisState } from "@/lib/server/video-visual-analysis";

type RouteContext = {
  params: Promise<{ videoId: string }> | { videoId: string };
};

function devDiagnosticsEnabled(request: Request) {
  const runtime = getPlatformEnvironment();
  const host = new URL(request.url).host;
  return runtime.DEV_OPENAI_DIAGNOSTICS_ENABLED === "true" && host.includes("mai-coach-dev");
}

async function paramsFromContext(context: RouteContext) {
  return Promise.resolve(context.params);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    if (!devDiagnosticsEnabled(request)) {
      return Response.json({ error: "Dev diagnostics are disabled." }, { status: 404 });
    }
    const identity = await requireIdentity();
    if (identity.role !== "admin") {
      return Response.json({ error: "Admin access is required." }, { status: 403 });
    }
    const { videoId } = await paramsFromContext(context);
    const response = await readVideoVisualAnalysisState(identity, videoId);
    const payload = await response.json() as Record<string, unknown>;
    const analysis = payload.analysis && typeof payload.analysis === "object"
      ? payload.analysis as Record<string, unknown>
      : null;
    const structured = analysis?.structuredResult && typeof analysis.structuredResult === "object"
      ? analysis.structuredResult as Record<string, unknown>
      : {};
    return Response.json({
      cameraView: analysis?.cameraView ?? null,
      coachFeedbackPresent: Boolean(structured && JSON.stringify(structured).includes("coach")),
      eligible: Boolean((payload.eligibility as { eligible?: unknown } | undefined)?.eligible),
      frameCount: analysis?.frameCount ?? 0,
      handedness: analysis?.handedness ?? null,
      overallConfidence: analysis?.overallConfidence ?? null,
      publishedToMember: Boolean(analysis?.publishedToMemberAt),
      safeErrorCode: analysis?.safeErrorCode ?? null,
      selectedSwingId: analysis?.selectedSwingId ?? null,
      sessionDataPresent: Boolean(payload.video && typeof payload.video === "object"),
      status: analysis?.status ?? "not_requested",
      swingCountDetected: analysis?.swingCountDetected ?? 0,
      videoId,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
