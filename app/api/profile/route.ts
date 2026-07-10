import {
  getIdentity,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";

type PracticeProfilePayload = {
  profile?: unknown;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

async function ensureSchema() {
  const d1 = getRequiredDatabase();
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS golf_practice_profiles (
        user_email TEXT PRIMARY KEY,
        display_name TEXT,
        profile_json TEXT NOT NULL,
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
      return Response.json({ mode: "guest", profile: null });
    }

    await ensureSchema();
    const row = await getRequiredDatabase()
      .prepare(
        "SELECT profile_json, updated_at FROM golf_practice_profiles WHERE user_email = ?",
      )
      .bind(identity.email)
      .first<{ profile_json: string; updated_at: string }>();

    return Response.json({
      mode: "user",
      user: identity,
      profile: row ? JSON.parse(row.profile_json) : null,
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
      return Response.json({ error: "Sign in to save your practice profile." }, { status: 401 });
    }

    const payload = (await request.json()) as PracticeProfilePayload;
    if (!payload.profile || typeof payload.profile !== "object" || Array.isArray(payload.profile)) {
      return Response.json({ error: "profile must be an object" }, { status: 400 });
    }

    await ensureSchema();
    await getRequiredDatabase()
      .prepare(
        `INSERT INTO golf_practice_profiles (
          user_email,
          display_name,
          profile_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_email) DO UPDATE SET
          display_name = excluded.display_name,
          profile_json = excluded.profile_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(identity.email, identity.displayName, JSON.stringify(payload.profile))
      .run();

    return Response.json({ ok: true, user: identity });
  } catch (error) {
    return responseFromError(error);
  }
}
