import {
  clearAuthSessionCookie,
  consumeLoginToken,
  responseFromError,
} from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { token?: unknown };
    const token = text(payload.token, 200);
    if (!token) {
      return Response.json({ error: "Login token is required." }, { status: 400 });
    }
    const result = await consumeLoginToken(token);
    const response = Response.json({
      ok: true,
      redirectPath: result.redirectPath,
      user: result.user,
    });
    response.headers.append("Set-Cookie", result.cookie);
    return response;
  } catch (error) {
    return responseFromError(error);
  }
}

export async function DELETE() {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", clearAuthSessionCookie());
  return response;
}
