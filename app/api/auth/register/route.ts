import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  createAuthSession,
  ensurePlatformSchema,
  getRequiredDatabase,
  identityForUser,
  responseFromError,
  roleForEmail,
  setUserPassword,
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
      password?: unknown;
      redirectPath?: unknown;
    };
    const accountType = text(payload.accountType, 20).toLowerCase();
    const email = text(payload.email, 254).toLowerCase();
    const firstName = text(payload.firstName, 80);
    const lastName = text(payload.lastName, 80);
    const password = typeof payload.password === "string" ? payload.password : "";
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
    if (password.length < 8) {
      return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const existing = await database
      .prepare("SELECT id, role FROM users WHERE LOWER(email) = ?")
      .bind(email)
      .first<{ id: string; role: string }>();
    if (existing) {
      return Response.json(
        {
          error: "That email already has an account. Sign in or use password reset.",
          publicMessage: "That email already has an account. Sign in or use password reset.",
        },
        { status: 409 },
      );
    }

    const staffRole = roleForEmail(email, existing?.role);
    const requestedRole: UserRole = accountType === "coach" ? "coach" : "member";
    const role = staffRole === "admin" || staffRole === "coach" ? staffRole : requestedRole;

    const user = await upsertUserForEmail({
      email,
      firstName,
      lastName,
      role,
    });
    await setUserPassword(user.id, password);

    const result = await requestLoginEmail(request, email, redirectPath, {
      accountType: accountType === "coach" ? "coach" : "player",
      purpose: "registration",
    });
    const session = await createAuthSession(user.id, { requestUrl: request.url });
    const response = Response.json({
      ...result,
      emailStatus: result.status,
      registered: true,
      user: identityForUser(user),
    }, { status: 201 });
    response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    return responseFromError(error);
  }
}
