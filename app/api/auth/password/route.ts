import {
  createAuthSession,
  getIdentity,
  responseFromError,
  setUserPassword,
  verifyUserPassword,
} from "@/lib/server/platform";
import { completeAccountSetupForUser } from "@/lib/server/email-service";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  return "";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: unknown; password?: unknown };
    const email = text(payload.email, 254).toLowerCase();
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!isEmail(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!password) {
      return Response.json({ error: "Enter your password." }, { status: 400 });
    }

    const user = await verifyUserPassword(email, password);
    if (!user) {
      return Response.json({ error: "Email or password did not match an account." }, { status: 401 });
    }

    const session = await createAuthSession(user.id, { requestUrl: request.url });
    const response = Response.json({ ok: true, user });
    response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) {
      return Response.json({ error: "Sign in before setting a password." }, { status: 401 });
    }
    const payload = await request.json() as { password?: unknown };
    const password = typeof payload.password === "string" ? payload.password : "";
    const passwordError = validatePassword(password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    await setUserPassword(identity.id, password);
    await completeAccountSetupForUser(identity.id);
    return Response.json({
      ok: true,
      user: { ...identity, passwordResetRequired: false },
      publicMessage: "Your MAI Coach account is ready.",
    });
  } catch (error) {
    return responseFromError(error);
  }
}
