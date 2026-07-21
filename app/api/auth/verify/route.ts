import {
  clearAuthSessionCookie,
  consumeLoginToken,
  getIdentity,
  invalidateUserSessions,
  responseFromError,
} from "@/lib/server/platform";
import { markAccountSetupInvitationExpired, markAccountSetupInvitationOpened } from "@/lib/server/email-service";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  let tokenForFailure = "";
  try {
    const payload = await request.json() as { token?: unknown };
    const token = text(payload.token, 200);
    tokenForFailure = token;
    if (!token) {
      return Response.json({ error: "Login token is required." }, { status: 400 });
    }
    const result = await consumeLoginToken(token, { requestUrl: request.url });
    if (result.purpose === "account_setup") {
      await markAccountSetupInvitationOpened(token, result.user.id);
    }
    const response = Response.json({
      ok: true,
      purpose: result.purpose,
      redirectPath: result.redirectPath,
      user: result.user,
    });
    response.headers.append("Set-Cookie", result.cookie);
    return response;
  } catch (error) {
    if (error instanceof Response && error.status === 410 && tokenForFailure) {
      await markAccountSetupInvitationExpired(tokenForFailure);
    }
    return responseFromError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getIdentity();
    if (identity) await invalidateUserSessions(identity.id);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", clearAuthSessionCookie({ requestUrl: request.url }));
    return response;
  } catch {
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", clearAuthSessionCookie({ requestUrl: request.url }));
    return response;
  }
}
