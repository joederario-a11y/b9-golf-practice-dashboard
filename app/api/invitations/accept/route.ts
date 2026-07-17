import {
  createAuthSession,
  ensurePlatformSchema,
  getIdentity,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

type InvitationRow = {
  id: string;
  member_id: string;
  email_to: string;
  status: string;
  expires_at: string | null;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    const payload = await request.json() as { token?: unknown };
    const token = text(payload.token, 120);
    if (!token) {
      return Response.json({ error: "Invitation token is required." }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const invite = await database
      .prepare(
        `SELECT id, member_id, email_to, status, expires_at
         FROM member_invitations
         WHERE invite_token = ?`,
      )
      .bind(token)
      .first<InvitationRow>();
    if (!invite) {
      return Response.json({ error: "Invitation not found." }, { status: 404 });
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return Response.json({ error: "This invitation has expired." }, { status: 410 });
    }
    if (identity && (invite.email_to.toLowerCase() !== identity.email || invite.member_id !== identity.id)) {
      return Response.json({ error: "This invitation belongs to a different account." }, { status: 403 });
    }
    if (!identity && invite.status === "accepted") {
      return Response.json({ error: "This invitation has already been accepted. Request a fresh login link." }, { status: 409 });
    }

    await database.batch([
      database
        .prepare(
          `UPDATE member_invitations
           SET status = 'accepted', accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
           WHERE id = ?`,
        )
        .bind(invite.id),
      database
        .prepare("UPDATE users SET invite_status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(invite.member_id),
    ]);

    const response = Response.json({ ok: true });
    if (!identity) {
      const session = await createAuthSession(invite.member_id, { requestUrl: request.url });
      response.headers.append("Set-Cookie", session.cookie);
    }
    return response;
  } catch (error) {
    return responseFromError(error);
  }
}
