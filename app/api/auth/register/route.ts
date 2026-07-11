import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  ensurePlatformSchema,
  getRequiredDatabase,
  responseFromError,
  roleForEmail,
  type UserRole,
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
      accountType?: unknown;
      email?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      redirectPath?: unknown;
    };
    const accountType = text(payload.accountType, 20).toLowerCase();
    const email = text(payload.email, 254).toLowerCase();
    const firstName = text(payload.firstName, 80);
    const lastName = text(payload.lastName, 80);
    const redirectPath = text(payload.redirectPath, 300) || "/?tab=videos";

    if (accountType !== "coach" && accountType !== "player") {
      return Response.json({ error: "Choose Coach or Player." }, { status: 400 });
    }
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

    const staffRole = roleForEmail(email, existing?.role);
    const requestedRole: UserRole = accountType === "coach" ? "coach" : "member";
    const role = staffRole === "admin" || staffRole === "coach" ? staffRole : requestedRole;

    if (!existing || existing.role === "member" || existing.role === "coach") {
      await upsertUserForEmail({
        email,
        firstName,
        lastName,
        role,
      });
    }

    const result = await requestLoginEmail(request, email, redirectPath, {
      accountType: accountType === "coach" ? "coach" : "player",
      purpose: "registration",
    });
    const status = result.status === "Failed" ? 503 : existing ? 200 : 201;
    return Response.json(
      {
        ...result,
        registered: !existing,
      },
      { status },
    );
  } catch (error) {
    return responseFromError(error);
  }
}
