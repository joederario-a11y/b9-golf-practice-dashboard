import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  ensurePlatformSchema,
  getRequiredDatabase,
  responseFromError,
  roleForEmail,
  upsertUserForEmail,
} from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      email?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      redirectPath?: unknown;
    };
    const email = text(payload.email, 254).toLowerCase();
    const firstName = text(payload.firstName, 80);
    const lastName = text(payload.lastName, 80);
    const redirectPath = text(payload.redirectPath, 300) || "/?tab=videos";

    if (!isEmail(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return Response.json({ error: "First and last name are required." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const existing = await database
      .prepare("SELECT id, role FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; role: string }>();

    if (!existing || existing.role === "member") {
      await upsertUserForEmail({
        email,
        firstName,
        lastName,
        role: roleForEmail(email, existing?.role),
      });
    }

    const result = await requestLoginEmail(request, email, redirectPath);
    const status = result.status === "Failed" ? 503 : existing ? 200 : 201;
    return Response.json(
      {
        ...result,
        registered: !existing,
        publicMessage:
          result.status === "Sent"
            ? "Account created. Check your email for your secure login link."
            : result.publicMessage,
      },
      { status },
    );
  } catch (error) {
    return responseFromError(error);
  }
}
