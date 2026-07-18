import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import {
  AUTH_SESSION_COOKIE_NAME,
  buildAuthSessionCookie,
  buildClearAuthSessionCookie,
} from "@/lib/auth-session-policy.mjs";

export type UserRole = "admin" | "coach" | "member";

export type AuthIdentity = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  displayName: string;
  passwordResetRequired: boolean;
};

export type PlatformEnvironment = {
  ADMIN_EMAILS?: string;
  APP_BASE_URL?: string;
  COACH_EMAILS?: string;
  DB?: D1Database;
  DEV_AUTH_ENABLED?: string;
  DEV_OPENAI_DIAGNOSTICS_ENABLED?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  MEDIA?: {
    input(stream: ReadableStream): {
      transform(options?: Record<string, unknown>): {
        output(options: Record<string, unknown>): {
          response(): Promise<Response>;
          media(): Promise<ReadableStream>;
          contentType(): Promise<string>;
        };
      };
      output(options: Record<string, unknown>): {
        response(): Promise<Response>;
        media(): Promise<ReadableStream>;
        contentType(): Promise<string>;
      };
    };
  };
  VIDEO_LESSON_RECAP_WORKFLOW?: {
    create(options?: { id?: string; params?: unknown }): Promise<{ id: string; status(): Promise<unknown> }>;
    get(id: string): Promise<{ id: string; terminate(): Promise<void> }>;
  };
  VIDEO_EMAIL_FROM?: string;
  VIDEO_STORAGE?: R2Bucket;
};

type UserRow = {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status?: string | null;
  password_reset_required?: number | boolean | null;
};

type SessionUserRow = UserRow & {
  expires_at: string;
};

type PasswordRow = UserRow & {
  password_hash: string;
  password_salt: string;
  iterations: number;
};

export const AUTH_SESSION_COOKIE = AUTH_SESSION_COOKIE_NAME;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const LOGIN_TOKEN_TTL_SECONDS = 60 * 30;
const VIDEO_LINK_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_HASH_ITERATIONS = 100000;

export function getPlatformEnvironment() {
  return env as unknown as PlatformEnvironment;
}

export type SafeOpenAIDiagnostic = {
  category: string;
  publicMessage: string;
  httpStatus: number | null;
  errorType: string | null;
  errorCode: string | null;
  requestId: string | null;
  model: string | null;
  endpoint: string;
  operation: string;
};

function stringField(value: unknown, maxLength = 140) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sanitizeOpenAIError(
  error: unknown,
  context: {
    endpoint: string;
    model?: string | null;
    operation?: string;
  },
): SafeOpenAIDiagnostic {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nestedError = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  const status = numberField(record.status) ?? numberField(record.statusCode) ?? numberField(nestedError.status);
  const errorType = stringField(record.type) ?? stringField(nestedError.type);
  const errorCode = stringField(record.code) ?? stringField(nestedError.code);
  const requestId = stringField(record.request_id)
    ?? stringField(record.requestId)
    ?? stringField(record["x-request-id"])
    ?? stringField(nestedError.request_id);
  const message = [
    error instanceof Error ? error.message : stringField(record.message, 500) ?? "",
    stringField(nestedError.message, 500) ?? "",
  ].join(" ");
  let category = "openai_request_failed";

  if (/api.?key|unauthorized|authentication/i.test(message) || status === 401) category = "invalid_api_key";
  else if (/quota|billing|insufficient_quota/i.test(message) || errorCode === "insufficient_quota") category = "insufficient_quota";
  else if (/model.*not.*found|does not exist|unknown model/i.test(message) || errorCode === "model_not_found") category = "model_not_found";
  else if (/access.*model|not have access|permission/i.test(message) || status === 403) category = "model_access_denied";
  else if (/structured|schema|json_schema|validation/i.test(message)) category = "schema_validation_failed";
  else if (/image|input_image|unsupported.*input/i.test(message)) category = "unsupported_image_input";
  else if (/payload|too large|maximum context|context length|tokens/i.test(message) || status === 413) category = "payload_too_large";
  else if (/timeout|timed out|abort/i.test(message) || status === 408 || status === 504) category = "timeout";
  else if (/rate.?limit/i.test(message) || status === 429) category = "rate_limit";
  else if (/invalid request|bad request/i.test(message) || status === 400) category = "invalid_request";
  else if (/empty.*response/i.test(message)) category = "empty_response";

  return {
    category,
    publicMessage: "MAI Coach could not complete the OpenAI request. The dev diagnostic contains the sanitized reason.",
    httpStatus: status,
    errorType,
    errorCode,
    requestId,
    model: stringField(context.model) ?? null,
    endpoint: context.endpoint,
    operation: context.operation ?? "openai_request",
  };
}

export function getEmailFromAddress() {
  const runtime = getPlatformEnvironment();
  return runtime.VIDEO_EMAIL_FROM || runtime.RESEND_FROM || "";
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

function parseCookieHeader(value: string | null) {
  const parsed = new Map<string, string>();
  if (!value) return parsed;
  for (const part of value.split(";")) {
    const [rawName, ...rawValueParts] = part.split("=");
    const name = rawName?.trim();
    if (!name) continue;
    const rawValue = rawValueParts.join("=").trim();
    try {
      parsed.set(name, decodeURIComponent(rawValue));
    } catch {
      parsed.set(name, rawValue);
    }
  }
  return parsed;
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

async function ensureUsersAccountStatusColumn(database: D1Database) {
  const columns = await database.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const hasAccountStatus = columns.results.some((column) => column.name === "account_status");
  if (hasAccountStatus) return;

  try {
    await database
      .prepare("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'")
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column")) throw error;
  }
}

async function ensureColumn(database: D1Database, tableName: string, columnName: string, definition: string) {
  const columns = await database.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  const hasColumn = columns.results.some((column) => column.name === columnName);
  if (hasColumn) return;

  try {
    await database.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column")) throw error;
  }
}

export async function ensureUserDataOwnershipSchema(database = getRequiredDatabase()) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS golf_session_snapshots (
        user_email TEXT PRIMARY KEY,
        user_id TEXT,
        display_name TEXT,
        sessions_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS golf_practice_profiles (
        user_email TEXT PRIMARY KEY,
        user_id TEXT,
        display_name TEXT,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
  ]);
  await ensureColumn(database, "golf_session_snapshots", "user_id", "TEXT");
  await ensureColumn(database, "golf_practice_profiles", "user_id", "TEXT");
  await database.batch([
    database.prepare(
      `UPDATE golf_session_snapshots
       SET user_id = (
         SELECT users.id FROM users
         WHERE LOWER(users.email) = LOWER(golf_session_snapshots.user_email)
       )
       WHERE user_id IS NULL`,
    ),
    database.prepare(
      `UPDATE golf_practice_profiles
       SET user_id = (
         SELECT users.id FROM users
         WHERE LOWER(users.email) = LOWER(golf_practice_profiles.user_email)
       )
       WHERE user_id IS NULL`,
    ),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS golf_session_snapshots_user_id_unique ON golf_session_snapshots(user_id) WHERE user_id IS NOT NULL"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_profiles_user_id_unique ON golf_practice_profiles(user_id) WHERE user_id IS NOT NULL"),
  ]);
}

export async function ensureMaiCaddyAnalysisSchema(database = getRequiredDatabase()) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS mai_caddy_session_analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing'
          CHECK (status IN ('processing', 'completed', 'failed', 'insufficient_data')),
        analysis_json TEXT NOT NULL DEFAULT '{}',
        calculated_metrics_json TEXT NOT NULL DEFAULT '{}',
        analysis_source TEXT NOT NULL DEFAULT 'openai',
        model TEXT,
        prompt_version TEXT NOT NULL DEFAULT 'mai-caddy-v1',
        error_code TEXT,
        error_message TEXT,
        is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS mai_caddy_session_analyses_user_idx ON mai_caddy_session_analyses(user_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS mai_caddy_session_analyses_session_idx ON mai_caddy_session_analyses(session_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS mai_caddy_session_analyses_user_session_idx ON mai_caddy_session_analyses(user_id, session_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS mai_caddy_session_analyses_current_idx ON mai_caddy_session_analyses(user_id, session_id, is_current)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS mai_caddy_session_analyses_one_current_unique
       ON mai_caddy_session_analyses(user_id, session_id)
       WHERE is_current = 1`,
    ),
  ]);
  await ensureColumn(database, "mai_caddy_session_analyses", "analysis_source", "TEXT NOT NULL DEFAULT 'openai'");
}

export async function ensurePracticeActivitySchema(database = getRequiredDatabase()) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS practice_activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        generated_by TEXT NOT NULL,
        activity_type TEXT NOT NULL CHECK (activity_type IN ('drill', 'challenge')),
        focus_area TEXT NOT NULL,
        title TEXT NOT NULL,
        reason_selected TEXT NOT NULL DEFAULT '',
        instructions_json TEXT NOT NULL DEFAULT '{}',
        club TEXT,
        duration_minutes INTEGER,
        attempt_count INTEGER,
        target_json TEXT NOT NULL DEFAULT '{}',
        scoring_json TEXT NOT NULL DEFAULT '{}',
        source_context_json TEXT NOT NULL DEFAULT '{}',
        coach_id TEXT,
        coach_assignment_id TEXT,
        coach_feedback_source_id TEXT,
        related_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'generated'
          CHECK (status IN ('generated', 'in_progress', 'completed', 'results_submitted', 'cancelled', 'superseded')),
        model TEXT,
        prompt_version TEXT NOT NULL DEFAULT 'mai-practice-generator-v1',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS practice_activity_results (
        id TEXT PRIMARY KEY,
        practice_activity_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        related_session_id TEXT,
        submission_type TEXT NOT NULL
          CHECK (submission_type IN ('session_upload', 'csv', 'photo', 'manual', 'score', 'reflection')),
        score REAL,
        attempts INTEGER,
        successful_attempts INTEGER,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        result_notes TEXT NOT NULL DEFAULT '',
        user_reflection TEXT NOT NULL DEFAULT '',
        media_reference_json TEXT NOT NULL DEFAULT '{}',
        progress_status TEXT NOT NULL DEFAULT 'insufficient_data'
          CHECK (progress_status IN ('improved', 'maintained', 'needs_more_work', 'insufficient_data')),
        progress_evidence_json TEXT NOT NULL DEFAULT '[]',
        next_recommendation_json TEXT NOT NULL DEFAULT '{}',
        shared_with_coach INTEGER NOT NULL DEFAULT 0 CHECK (shared_with_coach IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (practice_activity_id) REFERENCES practice_activities(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activities_user_idx ON practice_activities(user_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activities_generated_by_idx ON practice_activities(generated_by, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activities_coach_idx ON practice_activities(coach_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activities_session_idx ON practice_activities(related_session_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activity_results_activity_idx ON practice_activity_results(practice_activity_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS practice_activity_results_user_idx ON practice_activity_results(user_id, created_at)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS practice_activities_one_active_focus_unique
       ON practice_activities(user_id, activity_type, focus_area)
       WHERE status IN ('generated', 'in_progress')`,
    ),
  ]);
}

export async function ensureCoachFeedbackSchema(database = getRequiredDatabase()) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS coach_feedback (
        id TEXT PRIMARY KEY,
        golfer_id TEXT NOT NULL,
        coach_id TEXT NOT NULL,
        lesson_id TEXT,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'resolved', 'archived')),
        priority TEXT NOT NULL DEFAULT '',
        observations_json TEXT NOT NULL DEFAULT '[]',
        prescribed_drills_json TEXT NOT NULL DEFAULT '[]',
        swing_feels_json TEXT NOT NULL DEFAULT '[]',
        success_targets_json TEXT NOT NULL DEFAULT '[]',
        raw_notes TEXT,
        source_type TEXT NOT NULL DEFAULT 'lesson_video',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        archived_at TEXT,
        FOREIGN KEY (golfer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (lesson_id) REFERENCES lesson_videos(id) ON DELETE CASCADE
      )`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS coach_feedback_golfer_status_idx ON coach_feedback(golfer_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS coach_feedback_coach_idx ON coach_feedback(coach_id, created_at)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS coach_feedback_lesson_unique
       ON coach_feedback(lesson_id)
       WHERE lesson_id IS NOT NULL`,
    ),
  ]);
}

export async function ensureVideoAiProcessingSchema(database = getRequiredDatabase()) {
  await ensureColumn(database, "lesson_videos", "next_session_goal", "TEXT NOT NULL DEFAULT ''");
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS video_ai_processing_jobs (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        coach_id TEXT NOT NULL,
        processing_type TEXT NOT NULL DEFAULT 'lesson_recap_voiceover',
        processing_version INTEGER NOT NULL DEFAULT 1,
        requested_language TEXT NOT NULL DEFAULT 'en',
        status TEXT NOT NULL DEFAULT 'queued',
        current_step TEXT NOT NULL DEFAULT 'queued_for_transcription',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        workflow_instance_id TEXT,
        audio_storage_path TEXT,
        audio_deleted_at TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES lesson_videos(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS video_transcripts (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        coach_id TEXT NOT NULL,
        transcript_text TEXT NOT NULL DEFAULT '',
        segments_json TEXT NOT NULL DEFAULT '[]',
        language TEXT NOT NULL DEFAULT 'en',
        model TEXT NOT NULL,
        duration_seconds REAL,
        processing_job_id TEXT NOT NULL,
        processing_version INTEGER NOT NULL DEFAULT 1,
        quality_json TEXT NOT NULL DEFAULT '{}',
        is_current INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES lesson_videos(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (processing_job_id) REFERENCES video_ai_processing_jobs(id) ON DELETE CASCADE,
        CHECK (is_current IN (0, 1))
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS video_lesson_recap_drafts (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        transcript_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        coach_id TEXT NOT NULL,
        processing_job_id TEXT NOT NULL,
        processing_version INTEGER NOT NULL DEFAULT 1,
        lesson_summary TEXT NOT NULL DEFAULT '',
        worked_on TEXT NOT NULL DEFAULT '',
        key_issue TEXT NOT NULL DEFAULT '',
        improvement TEXT NOT NULL DEFAULT '',
        practice_assignment TEXT NOT NULL DEFAULT '',
        recommended_drill TEXT NOT NULL DEFAULT '',
        member_facing_notes TEXT NOT NULL DEFAULT '',
        next_session_goal TEXT NOT NULL DEFAULT '',
        progress_observed_json TEXT NOT NULL DEFAULT '[]',
        metrics_mentioned_json TEXT NOT NULL DEFAULT '[]',
        transcript_evidence_json TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0,
        model TEXT,
        prompt_version TEXT NOT NULL DEFAULT 'mai-video-recap-v1',
        status TEXT NOT NULL DEFAULT 'generating',
        is_current INTEGER NOT NULL DEFAULT 1,
        reviewed_by TEXT,
        reviewed_at TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES lesson_videos(id) ON DELETE CASCADE,
        FOREIGN KEY (transcript_id) REFERENCES video_transcripts(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (processing_job_id) REFERENCES video_ai_processing_jobs(id) ON DELETE CASCADE,
        CHECK (is_current IN (0, 1)),
        CHECK (confidence >= 0 AND confidence <= 1)
      )`,
    ),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS video_ai_processing_jobs_version_unique ON video_ai_processing_jobs(video_id, processing_type, processing_version)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_ai_processing_jobs_video_idx ON video_ai_processing_jobs(video_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_ai_processing_jobs_member_idx ON video_ai_processing_jobs(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_ai_processing_jobs_status_idx ON video_ai_processing_jobs(status, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_transcripts_video_idx ON video_transcripts(video_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_transcripts_job_idx ON video_transcripts(processing_job_id)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS video_transcripts_current_unique
       ON video_transcripts(video_id, processing_version)
       WHERE is_current = 1`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS video_lesson_recap_drafts_video_idx ON video_lesson_recap_drafts(video_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_lesson_recap_drafts_status_idx ON video_lesson_recap_drafts(status, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_lesson_recap_drafts_job_idx ON video_lesson_recap_drafts(processing_job_id)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS video_lesson_recap_drafts_current_unique
       ON video_lesson_recap_drafts(video_id, processing_version)
       WHERE is_current = 1`,
    ),
  ]);
  await ensureColumn(database, "video_ai_processing_jobs", "audio_deleted_at", "TEXT");
  await database
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS video_ai_processing_jobs_one_active_unique
       ON video_ai_processing_jobs(video_id, processing_type)
       WHERE status IN ('queued', 'extracting_audio', 'transcribing', 'generating_recap')`,
    )
    .run();
}

type AuthSessionCookieOptions = {
  maxAgeSeconds?: number;
  requestUrl?: string;
  secure?: boolean;
};

function cookieOptionsWithRuntime(options: AuthSessionCookieOptions = {}) {
  return {
    appBaseUrl: getPlatformEnvironment().APP_BASE_URL ?? "",
    maxAgeSeconds: options.maxAgeSeconds ?? SESSION_TTL_SECONDS,
    name: AUTH_SESSION_COOKIE,
    requestUrl: options.requestUrl,
    secure: options.secure,
  };
}

export function makeAuthSessionCookie(
  token: string,
  options: number | AuthSessionCookieOptions = {},
) {
  const normalizedOptions = typeof options === "number" ? { maxAgeSeconds: options } : options;
  return buildAuthSessionCookie({
    ...cookieOptionsWithRuntime(normalizedOptions),
    token,
  });
}

export function clearAuthSessionCookie(options: AuthSessionCookieOptions = {}) {
  return buildClearAuthSessionCookie(cookieOptionsWithRuntime(options));
}

function identityFromUser(row: UserRow): AuthIdentity {
  return {
    id: row.id,
    email: row.email,
    role: roleForEmail(row.email, row.role),
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: [row.first_name, row.last_name].filter(Boolean).join(" "),
    passwordResetRequired: row.password_reset_required === 1 || row.password_reset_required === true,
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
        account_status TEXT NOT NULL DEFAULT 'active',
        password_reset_required INTEGER NOT NULL DEFAULT 0,
        invite_status TEXT NOT NULL DEFAULT 'pending',
        invited_at TEXT,
        last_login_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS member_content_items (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        content_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'active',
        session_data_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS member_activity_log (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_role TEXT NOT NULL,
        member_id TEXT,
        target_user_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      `CREATE TABLE IF NOT EXISTS coach_profile_images (
        id TEXT PRIMARY KEY,
        coach_user_id TEXT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE,
        original_file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (coach_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CHECK (is_current IN (0, 1))
      )`,
    ),
    database.prepare(
      `CREATE TABLE IF NOT EXISTS user_profile_images (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE,
        original_file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CHECK (is_current IN (0, 1))
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
        next_session_goal TEXT NOT NULL DEFAULT '',
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
    database.prepare("CREATE INDEX IF NOT EXISTS coach_profile_images_coach_idx ON coach_profile_images(coach_user_id, created_at)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS coach_profile_images_current_unique
       ON coach_profile_images(coach_user_id)
       WHERE is_current = 1`,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO user_profile_images (
         id, user_id, storage_path, original_file_name, mime_type, file_size,
         is_current, created_by, created_at, updated_at
       )
       SELECT
         id, coach_user_id, storage_path, original_file_name, mime_type, file_size,
         is_current, created_by, created_at, updated_at
       FROM coach_profile_images`,
    ),
    database.prepare("CREATE INDEX IF NOT EXISTS user_profile_images_user_idx ON user_profile_images(user_id, created_at)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS user_profile_images_current_unique
       ON user_profile_images(user_id)
       WHERE is_current = 1`,
    ),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_profile_images_storage_unique ON user_profile_images(storage_path)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_invitations_member_idx ON member_invitations(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_videos_member_idx ON lesson_videos(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_videos_coach_idx ON lesson_videos(coach_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_content_member_idx ON member_content_items(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_content_created_by_idx ON member_content_items(created_by, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_activity_member_idx ON member_activity_log(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_activity_actor_idx ON member_activity_log(actor_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS member_activity_target_idx ON member_activity_log(target_user_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_views_video_idx ON video_views(video_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS video_email_notifications_video_idx ON video_email_notifications(video_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS auth_login_tokens_email_idx ON auth_login_tokens(email, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at)"),
  ]);
  await ensureUsersAccountStatusColumn(database);
  await ensureColumn(database, "users", "password_reset_required", "INTEGER NOT NULL DEFAULT 0");
  await ensureVideoAiProcessingSchema(database);
  await ensurePracticeActivitySchema(database);
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

export async function createAuthSession(userId: string, options: AuthSessionCookieOptions = {}) {
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
    cookie: makeAuthSessionCookie(token, options),
    expiresAt,
    token,
  };
}

export async function setUserPassword(
  userId: string,
  password: string,
  options: { temporary?: boolean } = {},
) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  await database.batch([
    database
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
      .bind(userId, bytesToBase64(hash), bytesToBase64(salt), PASSWORD_HASH_ITERATIONS),
    database
      .prepare("UPDATE users SET password_reset_required = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(options.temporary ? 1 : 0, userId),
  ]);
}

export async function invalidateUserSessions(
  userId: string,
  options: { preserveCurrentSession?: boolean } = {},
) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  let currentTokenHash = "";
  if (options.preserveCurrentSession) {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? "";
    if (sessionToken) currentTokenHash = await hashToken(sessionToken);
  }
  const result = currentTokenHash
    ? await database
        .prepare("DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?")
        .bind(userId, currentTokenHash)
        .run()
    : await database
        .prepare("DELETE FROM auth_sessions WHERE user_id = ?")
        .bind(userId)
        .run();
  return Number(result.meta?.changes ?? 0);
}

export async function verifyUserPassword(email: string, password: string) {
  const database = getRequiredDatabase();
  await ensurePlatformSchema(database);
  const row = await database
    .prepare(
      `SELECT
        users.id, users.role, users.first_name, users.last_name, users.email,
        COALESCE(users.account_status, 'active') AS account_status,
        COALESCE(users.password_reset_required, 0) AS password_reset_required,
        user_passwords.password_hash, user_passwords.password_salt, user_passwords.iterations
      FROM users
      JOIN user_passwords ON user_passwords.user_id = users.id
      WHERE users.email = ?`,
    )
    .bind(email.trim().toLowerCase())
    .first<PasswordRow>();

  if (!row) return null;
  if (row.account_status === "inactive") return null;
  if (row.iterations > PASSWORD_HASH_ITERATIONS) return null;
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

export async function consumeLoginToken(token: string, options: AuthSessionCookieOptions = {}) {
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
        .prepare("SELECT id, role, first_name, last_name, email, COALESCE(password_reset_required, 0) AS password_reset_required FROM users WHERE id = ?")
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
  const session = await createAuthSession(user.id, options);
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
            COALESCE(users.account_status, 'active') AS account_status,
            COALESCE(users.password_reset_required, 0) AS password_reset_required,
            auth_sessions.expires_at
          FROM auth_sessions
          JOIN users ON users.id = auth_sessions.user_id
          WHERE auth_sessions.token_hash = ?`,
        )
        .bind(await hashToken(sessionToken))
        .first<SessionUserRow>();
      if (sessionUser && sessionUser.account_status !== "inactive" && new Date(sessionUser.expires_at).getTime() > Date.now()) {
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
    .prepare("SELECT id, role, first_name, last_name, email, COALESCE(account_status, 'active') AS account_status, COALESCE(password_reset_required, 0) AS password_reset_required FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  const headerRole = requestHeaders.get("oai-authenticated-user-role")?.toLowerCase();
  if (existing?.account_status === "inactive") return null;

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
    passwordResetRequired: existing?.password_reset_required === 1 || existing?.password_reset_required === true,
  };
}

export async function getIdentityFromRequest(request: Request): Promise<AuthIdentity | null> {
  const runtime = getPlatformEnvironment();
  const requestHeaders = request.headers;
  const requestCookies = parseCookieHeader(requestHeaders.get("cookie"));
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
    email = requestCookies.get("frg-dev-user")?.trim().toLowerCase() ?? "";
  }
  if (!email) {
    const sessionToken = requestCookies.get(AUTH_SESSION_COOKIE) ?? "";
    if (sessionToken) {
      const database = getRequiredDatabase();
      await ensurePlatformSchema(database);
      const tokenHash = await hashToken(sessionToken);
      const sessionUser = await database
        .prepare(
          `SELECT
            users.id, users.role, users.first_name, users.last_name, users.email,
            COALESCE(users.account_status, 'active') AS account_status,
            COALESCE(users.password_reset_required, 0) AS password_reset_required,
            auth_sessions.expires_at
          FROM auth_sessions
          JOIN users ON users.id = auth_sessions.user_id
          WHERE auth_sessions.token_hash = ?`,
        )
        .bind(tokenHash)
        .first<SessionUserRow>();
      if (sessionUser && sessionUser.account_status !== "inactive" && new Date(sessionUser.expires_at).getTime() > Date.now()) {
        await database.batch([
          database.prepare("UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?").bind(tokenHash),
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
    .prepare("SELECT id, role, first_name, last_name, email, COALESCE(account_status, 'active') AS account_status, COALESCE(password_reset_required, 0) AS password_reset_required FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  const headerRole = requestHeaders.get("oai-authenticated-user-role")?.toLowerCase();
  if (existing?.account_status === "inactive") return null;

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
    passwordResetRequired: existing?.password_reset_required === 1 || existing?.password_reset_required === true,
  };
}

export async function requireIdentity() {
  const identity = await getIdentity();
  if (!identity) {
    throw new Response("Authentication required.", { status: 401 });
  }
  return identity;
}

export async function requireIdentityFromRequest(request: Request) {
  const identity = await getIdentityFromRequest(request);
  if (!identity) {
    throw new Response("Authentication required.", { status: 401 });
  }
  return identity;
}

export async function recordActivity(values: {
  action: string;
  actor?: AuthIdentity | null;
  database?: D1Database;
  entityId?: string | null;
  entityType: string;
  memberId?: string | null;
  metadata?: Record<string, unknown>;
  summary: string;
  targetUserId?: string | null;
}) {
  const database = values.database ?? getRequiredDatabase();
  await ensurePlatformSchema(database);
  await database
    .prepare(
      `INSERT INTO member_activity_log (
        id, actor_id, actor_role, member_id, target_user_id, entity_type,
        entity_id, action, summary, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      values.actor?.id ?? null,
      values.actor?.role ?? "system",
      values.memberId ?? null,
      values.targetUserId ?? null,
      values.entityType,
      values.entityId ?? null,
      values.action,
      values.summary,
      JSON.stringify(values.metadata ?? {}),
    )
    .run();
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
