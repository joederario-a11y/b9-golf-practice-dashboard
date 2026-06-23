import { env } from "cloudflare:workers";
import { headers } from "next/headers";

type SessionPayload = {
  sessions?: unknown;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function getIdentity() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const displayName =
    encodedName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedName)
      : email;

  return email ? { email, displayName } : null;
}

async function ensureSchema() {
  const d1 = env.DB;
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS golf_session_snapshots (
        user_email TEXT PRIMARY KEY,
        display_name TEXT,
        sessions_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();
}

export async function GET() {
  try {
    const identity = await getIdentity();
    if (!identity) {
      return Response.json({ mode: "guest", sessions: [] });
    }

    await ensureSchema();
    const row = await env.DB
      .prepare(
        "SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_email = ?",
      )
      .bind(identity.email)
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

    await ensureSchema();
    await env.DB
      .prepare(
        `INSERT INTO golf_session_snapshots (
          user_email,
          display_name,
          sessions_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_email) DO UPDATE SET
          display_name = excluded.display_name,
          sessions_json = excluded.sessions_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(identity.email, identity.displayName, JSON.stringify(payload.sessions))
      .run();

    return Response.json({ ok: true, user: identity });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
