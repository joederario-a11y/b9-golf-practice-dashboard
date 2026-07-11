import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";

export type UserRole = "admin" | "coach" | "member";

export type AuthIdentity = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  displayName: string;
};

export type PlatformEnvironment = {
  ADMIN_EMAILS?: string;
  APP_BASE_URL?: string;
  COACH_EMAILS?: string;
  DB?: D1Database;
  DEV_AUTH_ENABLED?: string;
  RESEND_API_KEY?: string;
  VIDEO_EMAIL_FROM?: string;
  VIDEO_STORAGE?: R2Bucket;
};

type UserRow = {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
};

type SessionUserRow = UserRow & {
  expires_at: string;
};

type PasswordRow = UserRow & {
  password_hash: string;
  password_salt: string;
  iterations: number;
};

export const AUTH_SESSION_COOKIE = "frg-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const LOGIN_TOKEN_TTL_SECONDS = 60 * 30;
const VIDEO_LINK_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_HASH_ITERATIONS = 180000;

export function getPlatformEnvironment() {
  return env as unknown as PlatformEnvironment;
}

export function getRequiredDatabase() {
  const database = getPlatformEnvironment().DB;
  if (!database) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return database;
}

export function getRequiredVideoStorage() {
  const bucket = getPlatformEnvironment().VIDEO_STORAGE;
  if (!bucket) {
    throw new Error("Private R2 binding `VIDEO_STORAGE` is unavailable.");
  }
  return bucket;
}

function emailList(value: string | undefined) {
  return value?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
}

export function roleForEmail(email: string, existingRole?: string | null): UserRole {
  const normalizedEmail = email.trim().toLowerCase();
  const runtime = getPlatformEnvironment();
  if (emailList(runtime.ADMIN_EMAILS).includes(normalizedEmail)) return "admin";
  if (emailList(runtime.COACH_EMAILS).includes(normalizedEmail)) return "coach";
  if (existingRole === "admin" || existingRole === "coach") return existingRole;
  return "member";
}

function splitName(displayName: string, email: string) {
  const safeName = displayName.trim() || email.split("@")[0] || "Member";
  const parts = safeName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Member",
    lastName: parts.slice(1).join(" "),
  };
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function makeAuthSessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS) {
  const appBaseUrl = getPlatformEnvironment().APP_BASE_URL ?? "";
  const secure = !appBaseUrl.startsWith("http://localhost") && !appBaseUrl.startsWith("http://127.0.0.1");
  return `${AUTH_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearAuthSessionCookie() {
  const appBaseUrl = getPlatformEnvironment().APP_BASE_URL ?? "";
  const secure = !appBaseUrl.startsWith("http://localhost") && !appBaseUrl.startsWith("http://127.0.0.1");
  return `${AUTH_SESSION_COOKIE}=; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=0`;
}

function identityFromUser(row: UserRow): AuthIdentity {
  return {
    id: row.id,
    email: row.email,
    role: roleForEmail(row.email, row.role),
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: [row.first_name, row.last_name].filter(Boolean).join(" "),
  };
}

export async function ensurePlatformSchema(database = getRequiredDatabase()) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'member',
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        skill_level TEXT,
        notes TEXT,
        invite_status TEXT NOT NULL DEFAULT 'pending',
        invited_at TEXT,
        last_login_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS coach_members (
        id TEXT PRIMARY KEY,
        coach_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(coach_id, member_id)
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS member_invitations (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        coach_id TEXT,
        email_to TEXT NOT NULL,
        invite_token TEXT NOT NULL UNIQUE,
        invite_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_id TEXT,
        failure_reason TEXT,
        expires_at TEXT,
        accepted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS lesson_videos (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        coach_id TEXT,
        uploaded_by_role TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        coach_notes TEXT NOT NULL DEFAULT '',
        coach_private_notes TEXT NOT NULL DEFAULT '',
        user_notes TEXT NOT NULL DEFAULT '',
        video_type TEXT NOT NULL DEFAULT 'Lesson Recap',
        focus_area TEXT,
        swing_type TEXT,
        club TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        session_data_id TEXT,
        storage_path TEXT NOT NULL,
        thumbnail_storage_path TEXT,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        lesson_date TEXT,
        publication_status TEXT NOT NULL DEFAULT 'Draft',
        upload_status TEXT NOT NULL DEFAULT 'pending',
        review_status TEXT NOT NULL DEFAULT 'New',
        email_status TEXT NOT NULL DEFAULT 'Not sent',
        email_sent_at TEXT,
        email_failure_reason TEXT,
        is_viewed_by_member INTEGER NOT NULL DEFAULT 0,
        viewed_at TEXT,
        lesson_summary TEXT NOT NULL DEFAULT '',
        worked_on TEXT NOT NULL DEFAULT '',
        key_issue TEXT NOT NULL DEFAULT '',
        improvement TEXT NOT NULL DEFAULT '',
        practice_assignment TEXT NOT NULL DEFAULT '',
        recommended_drill TEXT NOT NULL DEFAULT '',
        member_facing_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS video_views (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS video_email_notifications (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        email_to TEXT NOT NULL,
        email_subject TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_id TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS auth_login_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        user_id TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        purpose TEXT NOT NULL,
        redirect_path TEXT,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS user_passwords (
        user_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS coach_members_member_idx ON coach_members(member_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_invitations_member_idx ON member_invitations(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_videos_member_idx ON lesson_videos(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_videos_coach_idx ON lesson_videos(coach_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_views_video_idx ON video_views(video_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_email_notifications_video_idx ON video_email_notifications(video_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS auth_login_tokens_email_idx ON auth_login_tokens(email, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at)"),
  ]);
}

export function identityForUser(row: UserRow): AuthIdentity {
  return identityFromUser(row);
}

export async function upsertUserForEmail(values: {
  email: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}) {
  const email = values.email.trim().toLowerCase();
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const existing = await database
    .prepare("SELECT id, role, first_name, last_name, email FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  const name = splitName([values.firstName, values.lastName].filter(Boolean).join(" "), email);
  const role = values.role ?? roleForEmail(email, existing?.role);
  const id = existing?.id ?? crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO users (
        id, role, first_name, last_name, email, invite_status, last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        role = excluded.role,
        first_name = CASE WHEN excluded.first_name = 'Member' THEN users.first_name ELSE excluded.first_name END,
        last_name = CASE WHEN excluded.last_name = '' THEN users.last_name ELSE excluded.last_name END,
        invite_status = 'accepted',
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(id, role, name.firstName, name.lastName, email)
    .run();

  return {
    id,
    email,
    role,
    first_name: existing?.first_name ?? name.firstName,
    last_name: existing?.last_name ?? name.lastName,
  } satisfies UserRow;
}

export async function createAuthSession(userId: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const token = randomToken();
  const expiresAt = addSeconds(SESSION_TTL_SECONDS);
  await database
    .prepare(
      `INSERT INTO auth_sessions (
        id, user_id, token_hash, expires_at, created_at, last_seen_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(crypto.randomUUID(), userId, await hashToken(token), expiresAt)
    .run();
  return {
    cookie: makeAuthSessionCookie(token),
    expiresAt,
    token,
  };
}

export async function setUserPassword(userId: string, password: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  await database
    .prepare(
      `INSERT INTO user_passwords (
        user_id, password_hash, password_salt, iterations, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        iterations = excluded.iterations,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, bytesToBase64(hash), bytesToBase64(salt), PASSWORD_HASH_ITERATIONS)
    .run();
}

export async function verifyUserPassword(email: string, password: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const row = await database
    .prepare(
      `SELECT
        users.id, users.role, users.first_name, users.last_name, users.email,
        user_passwords.password_hash, user_passwords.password_salt, user_passwords.iterations
      FROM users
      JOIN user_passwords ON user_passwords.user_id = users.id
      WHERE users.email = ?`,
    )
    .bind(email.trim().toLowerCase())
    .first<PasswordRow>();

  if (!row) return null;
  const expected = base64ToBytes(row.password_hash);
  const actual = await derivePasswordHash(password, base64ToBytes(row.password_salt), row.iterations);
  if (!constantTimeEqual(actual, expected)) return null;
  return identityFromUser(row);
}

export async function createLoginToken(values: {
  email: string;
  userId?: string | null;
  purpose: "login" | "password_reset" | "video";
  redirectPath?: string;
  ttlSeconds?: number;
}) {
  const token = randomToken();
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  await database
    .prepare(
      `INSERT INTO auth_login_tokens (
        id, email, user_id, token_hash, purpose, redirect_path, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      values.email.trim().toLowerCase(),
      values.userId ?? null,
      await hashToken(token),
      values.purpose,
      values.redirectPath ?? null,
      addSeconds(values.ttlSeconds ?? (values.purpose === "video" ? VIDEO_LINK_TOKEN_TTL_SECONDS : LOGIN_TOKEN_TTL_SECONDS)),
    )
    .run();
  return token;
}

export async function consumeLoginToken(token: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const tokenHash = await hashToken(token);
  const loginToken = await database
    .prepare(
      `SELECT id, email, user_id, purpose, expires_at, used_at, redirect_path
       FROM auth_login_tokens WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      id: string;
      email: string;
      user_id: string | null;
      purpose: string;
      expires_at: string;
      used_at: string | null;
      redirect_path: string | null;
    }>();
  if (!loginToken || loginToken.used_at) {
    throw new Response("This login link is invalid or has already been used.", { status: 401 });
  }
  if (new Date(loginToken.expires_at).getTime() < Date.now()) {
    throw new Response("This login link has expired.", { status: 410 });
  }

  const user = loginToken.user_id
    ? await database
        .prepare("SELECT id, role, first_name, last_name, email FROM users WHERE id = ?")
        .bind(loginToken.user_id)
        .first<UserRow>()
    : await upsertUserForEmail({ email: loginToken.email });
  if (!user) {
    throw new Response("This login link no longer matches an account.", { status: 404 });
  }

  await database
    .prepare("UPDATE auth_login_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(loginToken.id)
    .run();
  const session = await createAuthSession(user.id);
  return {
    cookie: session.cookie,
    purpose: loginToken.purpose,
    redirectPath: loginToken.redirect_path,
    user: identityFromUser(user),
  };
}

export async function getIdentity(): Promise<AuthIdentity | null> {
  const runtime = getPlatformEnvironment();
  const requestHeaders = await headers();
  let email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  let displayName = "";

  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  if (encodedName) {
    displayName =
      requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
        ? decodeURIComponent(encodedName)
        : encodedName;
  }

  if (!email && runtime.DEV_AUTH_ENABLED === "true") {
    const cookieStore = await cookies();
    email = cookieStore.get("frg-dev-user")?.value.trim().toLowerCase() ?? "";
  }
  if (!email) {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? "";
    if (sessionToken) {
      const database = getRequiredDatabase();
      await ensurePlatformSchema(database);
      const sessionUser = await database
        .prepare(
          `SELECT
            users.id, users.role, users.first_name, users.last_name, users.email,
            auth_sessions.expires_at
          FROM auth_sessions
          JOIN users ON users.id = auth_sessions.user_id
          WHERE auth_sessions.token_hash = ?`,
        )
        .bind(await hashToken(sessionToken))
        .first<SessionUserRow>();
      if (sessionUser && new Date(sessionUser.expires_at).getTime() > Date.now()) {
        await database.batch([
          database.prepare("UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?").bind(await hashToken(sessionToken)),
          database.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sessionUser.id),
        ]);
        return identityFromUser(sessionUser);
      }
    }
  }
  if (!email) return null;

  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const existing = await database
    .prepare("SELECT id, role, first_name, last_name, email FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  const headerRole = requestHeaders.get("oai-authenticated-user-role")?.toLowerCase();
  const role: UserRole = headerRole === "admin" || headerRole === "coach"
    ? headerRole
    : roleForEmail(email, existing?.role);
  const name = splitName(displayName || [existing?.first_name, existing?.last_name].filter(Boolean).join(" "), email);
  const id = existing?.id ?? crypto.randomUUID();

  await database
    .prepare(
      `INSERT INTO users (
        id, role, first_name, last_name, email, invite_status, last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        role = excluded.role,
        first_name = CASE WHEN excluded.first_name = 'Member' THEN users.first_name ELSE excluded.first_name END,
        last_name = CASE WHEN excluded.last_name = '' THEN users.last_name ELSE excluded.last_name END,
        invite_status = 'accepted',
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(id, role, name.firstName, name.lastName, email)
    .run();

  if (existing?.id) {
    await database
      .prepare(
        `UPDATE member_invitations
         SET status = 'accepted', accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
         WHERE member_id = ? AND status IN ('pending', 'sent')`,
      )
      .bind(existing.id)
      .run();
  }

  return {
    id,
    email,
    role,
    firstName: name.firstName,
    lastName: name.lastName,
    displayName: [name.firstName, name.lastName].filter(Boolean).join(" "),
  };
}

export async function requireIdentity() {
  const identity = await getIdentity();
  if (!identity) {
    throw new Response("Authentication required.", { status: 401 });
  }
  return identity;
}

export async function getAssignedMemberIds(identity: AuthIdentity, database = getRequiredDatabase()) {
  if (identity.role === "admin") {
    const result = await database.prepare("SELECT id FROM users WHERE role = 'member'").all<{ id: string }>();
    return result.results.map((row) => row.id);
  }
  if (identity.role === "member") return [identity.id];
  const result = await database
    .prepare("SELECT member_id FROM coach_members WHERE coach_id = ?")
    .bind(identity.id)
    .all<{ member_id: string }>();
  return result.results.map((row) => row.member_id);
}

export function responseFromError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return Response.json({ error: message }, { status: 500 });
}
