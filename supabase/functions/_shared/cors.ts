const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

function configuredOrigins() {
  const origins = new Set(localOrigins);
  const appBaseUrl = Deno.env.get("APP_BASE_URL")?.trim();
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";

  if (appBaseUrl) {
    origins.add(appBaseUrl.replace(/\/$/, ""));
  }

  for (const origin of allowedOrigins.split(",")) {
    const normalized = origin.trim().replace(/\/$/, "");
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const allowed = configuredOrigins();
  const allowOrigin = origin && allowed.has(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
