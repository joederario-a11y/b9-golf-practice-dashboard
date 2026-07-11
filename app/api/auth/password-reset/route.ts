import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  ensurePlatformSchema,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: unknown };
    const email = text(payload.email, 254).toLowerCase();
    if (!isEmail(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    await ensurePlatformSchema(getRequiredDatabase());
    const result = await requestLoginEmail(request, email, "/?tab=videos&resetPassword=1", {
      purpose: "password_reset",
    });

    if (result.status === "Not found") {
      return Response.json({
        status: "Requested",
        publicMessage: "If that email has an account, a password reset link will arrive shortly.",
      });
    }

    const status = result.status === "Failed" ? 503 : 200;
    return Response.json(result, { status });
  } catch (error) {
    return responseFromError(error);
  }
}
