import {
  ensureUserDataOwnershipSchema,
  getIdentity,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";
import { sanitizeSessionList } from "@/lib/session-data-policy.mjs";

type SessionPayload = {
  sessions?: unknown;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function parseStoredSessionsJson(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const identity = await getIdentity();
    if (!identity) {
      return Response.json({ mode: "guest", sessions: [] });
    }

    const database = getRequiredDatabase();
    await ensureUserDataOwnershipSchema(database);
    const row = await database
      .prepare(
        "SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?",
      )
      .bind(identity.id)
      .first<{ sessions_json: string; updated_at: string }>();
    const rawSessions = parseStoredSessionsJson(row?.sessions_json);
    const sessions = sanitizeSessionList(rawSessions);
    if (row && JSON.stringify(sessions) !== row.sessions_json) {
      await database
        .prepare(
          `UPDATE golf_session_snapshots
           SET sessions_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
        )
        .bind(JSON.stringify(sessions), identity.id)
        .run();
    }

    return Response.json({
      mode: "user",
      user: identity,
      sessions,
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

    const sessions = sanitizeSessionList(payload.sessions);
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
        .bind(identity.email, identity.displayName, JSON.stringify(sessions), identity.id)
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
        .bind(identity.email, identity.id, identity.displayName, JSON.stringify(sessions))
        .run();
    }

    return Response.json({ ok: true, user: identity, sessions, sanitized: sessions.length !== payload.sessions.length });
  } catch (error) {
    return responseFromError(error);
  }
}
