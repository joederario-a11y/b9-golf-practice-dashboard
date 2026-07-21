import { getEmailConfigurationDiagnostic, sendTestEmail } from "@/lib/server/email-service";
import { getPlatformEnvironment, requireIdentity, responseFromError } from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireDevAdmin() {
  const runtime = getPlatformEnvironment();
  if (runtime.DEV_OPENAI_DIAGNOSTICS_ENABLED !== "true" && runtime.DEV_AUTH_ENABLED !== "true") {
    throw new Response("Dev diagnostics are disabled.", { status: 404 });
  }
  const identity = await requireIdentity();
  if (identity.role !== "admin") {
    throw new Response("Admin access is required.", { status: 403 });
  }
  return identity;
}

export async function GET() {
  try {
    await requireDevAdmin();
    return Response.json(getEmailConfigurationDiagnostic());
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireDevAdmin();
    const payload = await request.json().catch(() => ({})) as { toEmail?: unknown };
    const toEmail = text(payload.toEmail, 254).toLowerCase();
    if (!isEmail(toEmail)) {
      return Response.json({ error: "Enter a valid test recipient email." }, { status: 400 });
    }
    const result = await sendTestEmail({ toEmail });
    return Response.json({
      ok: result.success,
      status: result.success ? "sent" : "failed",
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      safeMessage: result.safeMessage,
    }, { status: result.success ? 200 : 503 });
  } catch (error) {
    return responseFromError(error);
  }
}
