import { analyzeStoredSession, getStoredSessionAnalysis } from "@/lib/server/session-analysis";
import { requireIdentity, responseFromError } from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as { sessionId?: unknown };
    const sessionId = text(payload.sessionId, 160);

    if (!sessionId) {
      return Response.json({ error: "Choose a saved session to analyze." }, { status: 400 });
    }

    return analyzeStoredSession(identity, sessionId);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const url = new URL(request.url);
    const sessionId = text(url.searchParams.get("sessionId"), 160);

    if (!sessionId) {
      return Response.json({ error: "Choose a saved session to review." }, { status: 400 });
    }

    return getStoredSessionAnalysis(identity, sessionId);
  } catch (error) {
    return responseFromError(error);
  }
}
