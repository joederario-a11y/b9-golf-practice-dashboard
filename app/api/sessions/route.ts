import {
  ensureUserDataOwnershipSchema,
  getIdentity,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

type SessionPayload = {
  sessions?: unknown;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET() {
  try {
    const identity = await getIdentity();
    if (!identity) {
      return Response.json({ mode: "guest", sessions: [] });
    }

    const database = getRequiredDatabase();
    await ensureUserDataOwnershipSchema(database);
    const row = await getRequiredDatabase()
      .prepare(
        "SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?",
      )
      .bind(identity.id)
      .first<{ sessions_json: string; updated_at: string }>();

    return Response.json({
      mode: "user",
      user: identity,
      sessions: row ? JSON.parse(row.sessions_json) : [],
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) {
      return Response.json({ error: "Sign in to save sessions." }, { status: 401 });
    }

    const payload = (await request.json()) as SessionPayload;
    if (!Array.isArray(payload.sessions)) {
      return Response.json({ error: "sessions must be an array" }, { status: 400 });
    }

    const database = getRequiredDatabase();
    await ensureUserDataOwnershipSchema(database);
    const existing = await database
      .prepare("SELECT user_id FROM golf_session_snapshots WHERE user_id = ?")
      .bind(identity.id)
      .first<{ user_id: string }>();
    if (existing) {
      await database
        .prepare(
          `UPDATE golf_session_snapshots
           SET user_email = ?, display_name = ?, sessions_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
        )
        .bind(identity.email, identity.displayName, JSON.stringify(payload.sessions), identity.id)
        .run();
    } else {
      await database
        .prepare(
          `INSERT INTO golf_session_snapshots (
            user_email,
            user_id,
            display_name,
            sessions_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_email) DO UPDATE SET
            user_id = excluded.user_id,
            display_name = excluded.display_name,
            sessions_json = excluded.sessions_json,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(identity.email, identity.id, identity.displayName, JSON.stringify(payload.sessions))
        .run();
    }

    return Response.json({ ok: true, user: identity });
  } catch (error) {
    return responseFromError(error);
  }
}
