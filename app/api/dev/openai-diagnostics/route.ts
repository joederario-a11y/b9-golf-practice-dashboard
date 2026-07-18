import {
  getPlatformEnvironment,
  requireIdentity,
  responseFromError,
  sanitizeOpenAIError,
} from "@/lib/server/platform";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function devDiagnosticsEnabled(request: Request) {
  const runtime = getPlatformEnvironment();
  const host = new URL(request.url).host;
  return runtime.DEV_OPENAI_DIAGNOSTICS_ENABLED === "true" && host.includes("mai-coach-dev");
}

async function openAIJson(path: string, init: RequestInit = {}) {
  const runtime = getPlatformEnvironment();
  if (!runtime.OPENAI_API_KEY) {
    throw Object.assign(new Error("OPENAI_API_KEY is not configured."), { status: 503, code: "missing_api_key" });
  }
  const response = await fetch(`${OPENAI_API_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const requestId = response.headers.get("x-request-id");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? (body as { error?: unknown }).error : body;
    throw Object.assign(new Error("OpenAI request failed."), {
      status: response.status,
      request_id: requestId,
      error,
    });
  }
  return { body, requestId };
}

function modelIdsFromResponse(body: unknown) {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) return [];
  return (body as { data: Array<{ id?: unknown }> }).data
    .map((model) => typeof model.id === "string" ? model.id : "")
    .filter(Boolean)
    .sort();
}

async function smoke(name: string, model: string | undefined, body: Record<string, unknown>) {
  if (!model) {
    return {
      name,
      ok: false,
      model: null,
      diagnostic: {
        category: "model_not_configured",
        publicMessage: "No model was configured for this smoke test.",
        httpStatus: null,
        errorType: null,
        errorCode: null,
        requestId: null,
        model: null,
        endpoint: "responses",
        operation: name,
      },
    };
  }
  try {
    const result = await openAIJson("/responses", {
      method: "POST",
      body: JSON.stringify({
        model,
        store: false,
        ...body,
      }),
    });
    return {
      name,
      ok: true,
      model,
      requestId: result.requestId,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      model,
      diagnostic: sanitizeOpenAIError(error, {
        endpoint: "responses",
        model,
        operation: name,
      }),
    };
  }
}

export async function GET(request: Request) {
  try {
    if (!devDiagnosticsEnabled(request)) {
      return Response.json({ error: "OpenAI diagnostics are disabled." }, { status: 404 });
    }
    const identity = await requireIdentity();
    if (identity.role !== "admin") {
      return Response.json({ error: "Admin access is required for dev OpenAI diagnostics." }, { status: 403 });
    }

    const runtime = getPlatformEnvironment();
    const analysisModel = runtime.OPENAI_ANALYSIS_MODEL || runtime.OPENAI_MODEL;
    const visionModel = runtime.OPENAI_VISION_MODEL || runtime.OPENAI_ANALYSIS_MODEL || runtime.OPENAI_MODEL;
    const list = await openAIJson("/models").catch((error) => ({
      error: sanitizeOpenAIError(error, {
        endpoint: "models",
        model: null,
        operation: "models_list",
      }),
    }));
    if ("error" in list) {
      return Response.json({
        ok: false,
        endpoint: "/v1/models",
        configured: {
          analysisModel,
          visionModel,
          transcriptionModel: runtime.OPENAI_TRANSCRIPTION_MODEL || null,
          legacyModel: runtime.OPENAI_MODEL || null,
        },
        modelIds: [],
        smokeTests: [],
        diagnostic: list.error,
      }, { status: list.error.httpStatus ?? 502 });
    }
    const modelIds = modelIdsFromResponse(list.body);
    const runSmoke = new URL(request.url).searchParams.get("smoke") === "1";
    const smokeTests = runSmoke
      ? [
          await smoke("text_responses", analysisModel, {
            input: "Reply with the word ready.",
            max_output_tokens: 20,
          }),
          await smoke("image_input", visionModel, {
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "What color is this one-pixel test image? Answer briefly." },
                  { type: "input_image", image_url: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}` },
                ],
              },
            ],
            max_output_tokens: 40,
          }),
          await smoke("strict_structured_output", analysisModel, {
            input: "Return a tiny readiness object.",
            text: {
              format: {
                type: "json_schema",
                name: "diagnostic_ready",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["ready"],
                  properties: {
                    ready: { type: "boolean" },
                  },
                },
              },
            },
            max_output_tokens: 80,
          }),
        ]
      : [];

    return Response.json({
      ok: true,
      endpoint: "/v1/models",
      requestId: list.requestId,
      configured: {
        analysisModel,
        visionModel,
        transcriptionModel: runtime.OPENAI_TRANSCRIPTION_MODEL || null,
        legacyModel: runtime.OPENAI_MODEL || null,
      },
      modelIds,
      smokeTests,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
