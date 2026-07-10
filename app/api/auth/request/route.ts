import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  ensurePlatformSchema,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: unknown; redirectPath?: unknown };
    const email = text(payload.email, 254).toLowerCase();
    const redirectPath = text(payload.redirectPath, 300) || "/?tab=videos";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    await ensurePlatformSchema(getRequiredDatabase());
    const result = await requestLoginEmail(request, email, redirectPath);
    const status = result.status === "Failed" ? 503 : 200;
    return Response.json(result, { status });
  } catch (error) {
    return responseFromError(error);
  }
}
