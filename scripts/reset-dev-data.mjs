#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_BRANCH = "dev";
const EXPECTED_WORKER = "mai-coach-dev";
const EXPECTED_D1 = "mai-coach-dev-db";
const EXPECTED_R2 = "mai-coach-video-storage-dev";
const EXPECTED_CONFIG = "wrangler.dev.jsonc";
const PASSWORD_HASH_ITERATIONS = 100000;

const USER_TABLES = [
  "auth_login_tokens",
  "auth_sessions",
  "coach_feedback",
  "coach_members",
  "coach_profile_images",
  "golf_practice_profiles",
  "golf_session_snapshots",
  "lesson_videos",
  "mai_caddy_session_analyses",
  "member_activity_log",
  "member_content_items",
  "member_invitations",
  "photo_import_jobs",
  "practice_activities",
  "practice_activity_results",
  "user_profile_images",
  "video_ai_processing_jobs",
  "video_email_notifications",
  "video_lesson_recap_drafts",
  "video_transcripts",
  "video_views",
];

const SYSTEM_TABLES = new Set(["_cf_KV", "d1_migrations", "sqlite_sequence", "users", "user_passwords"]);

const DELETE_ORDER = [
  "video_lesson_recap_drafts",
  "video_transcripts",
  "video_ai_processing_jobs",
  "video_views",
  "video_email_notifications",
  "coach_feedback",
  "lesson_videos",
  "practice_activity_results",
  "practice_activities",
  "member_activity_log",
  "member_content_items",
  "member_invitations",
  "coach_members",
  "mai_caddy_session_analyses",
  "photo_import_jobs",
  "golf_session_snapshots",
  "golf_practice_profiles",
  "coach_profile_images",
  "user_profile_images",
  "auth_sessions",
  "auth_login_tokens",
];

const R2_USER_PREFIXES = [
  "lesson-videos/",
  "photo-imports/",
  "user-profile-images/",
  "coach-profile-images/",
  "video-audio/",
  "lesson-audio/",
  "audio-extracts/",
  "csv-imports/",
  "session-imports/",
  "uploads/",
  "tmp/",
  "temp/",
];

function parseArgs(argv) {
  const args = {
    execute: false,
    preserveEmail: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") args.execute = true;
    else if (arg === "--preserve-email") args.preserveEmail = argv[++index] ?? "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function help() {
  console.log(`Usage:
  npm run reset:dev-data -- --preserve-email joe.derario@thebackninegolf.com
  npm run reset:dev-data -- --preserve-email joe.derario@thebackninegolf.com --execute

Dry-run is the default. Execute mode prompts for the preserved admin password without echoing it.`);
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function gitOutput(args) {
  return run("git", args).trim();
}

function parseJsonc(text) {
  return JSON.parse(
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1"),
  );
}

function readConfig() {
  return parseJsonc(fs.readFileSync(EXPECTED_CONFIG, "utf8"));
}

function assertDevTargets(config, preserveEmail) {
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== EXPECTED_BRANCH) throw new Error(`Refusing reset: branch is ${branch}, expected ${EXPECTED_BRANCH}.`);
  if (config.name !== EXPECTED_WORKER) throw new Error(`Refusing reset: Worker is ${config.name}, expected ${EXPECTED_WORKER}.`);
  const d1 = config.d1_databases?.find((database) => database.binding === "DB");
  if (d1?.database_name !== EXPECTED_D1) throw new Error(`Refusing reset: D1 is ${d1?.database_name}, expected ${EXPECTED_D1}.`);
  const r2 = config.r2_buckets?.find((bucket) => bucket.binding === "VIDEO_STORAGE");
  if (r2?.bucket_name !== EXPECTED_R2) throw new Error(`Refusing reset: R2 is ${r2?.bucket_name}, expected ${EXPECTED_R2}.`);
  if (!String(config.vars?.APP_BASE_URL ?? "").includes("mai-coach-dev")) {
    throw new Error("Refusing reset: APP_BASE_URL does not look like the Dev Worker URL.");
  }
  if (!preserveEmail) throw new Error("Refusing reset: --preserve-email is required.");
  return { branch, d1Name: d1.database_name, r2Name: r2.bucket_name, workerName: config.name };
}

function extractWranglerJson(output) {
  const marker = output.indexOf("[\n");
  if (marker === -1) throw new Error(`Could not parse Wrangler JSON output:\n${output.slice(0, 1000)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = marker; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(output.slice(marker, index + 1));
    }
  }
  throw new Error(`Could not find end of Wrangler JSON output:\n${output.slice(marker, marker + 1000)}`);
}

function d1(command) {
  const output = run("npx", ["wrangler", "d1", "execute", EXPECTED_D1, "--remote", "--config", EXPECTED_CONFIG, "--command", command]);
  return extractWranglerJson(output);
}

function d1File(filePath) {
  const output = run("npx", ["wrangler", "d1", "execute", EXPECTED_D1, "--remote", "--config", EXPECTED_CONFIG, "--file", filePath]);
  return extractWranglerJson(output);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function createBackup() {
  const backupPath = `/tmp/mai-coach-dev-before-reset-${timestamp()}.sql`;
  run("npx", [
    "wrangler",
    "d1",
    "export",
    EXPECTED_D1,
    "--remote",
    "--config",
    EXPECTED_CONFIG,
    "--output",
    backupPath,
    "--skip-confirmation",
  ]);
  const stats = fs.statSync(backupPath);
  if (!stats.isFile() || stats.size <= 0) throw new Error("D1 backup did not create a non-empty file.");
  return { path: backupPath, bytes: stats.size };
}

function firstResult(json, index = 0) {
  return json[index]?.results?.[0] ?? null;
}

function rows(json, index = 0) {
  return json[index]?.results ?? [];
}

function getAdmin(normalizedEmail) {
  const json = d1(`
    SELECT users.id, lower(trim(users.email)) AS normalized_email, users.role,
      COALESCE(users.account_status, 'active') AS account_status,
      COALESCE(users.password_reset_required, 0) AS password_reset_required,
      CASE WHEN user_passwords.user_id IS NULL THEN 0 ELSE 1 END AS password_record_exists
    FROM users
    LEFT JOIN user_passwords ON user_passwords.user_id = users.id
    WHERE lower(trim(users.email)) = ${sqlString(normalizedEmail)};
  `);
  return firstResult(json);
}

function getTableNames() {
  return rows(d1("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")).map((row) => row.name);
}

function countKnownRows() {
  const command = [
    "SELECT COUNT(*) AS users FROM users;",
    "SELECT COUNT(*) AS admin_users FROM users WHERE role = 'admin';",
    "SELECT COUNT(*) AS non_admin_users FROM users WHERE role <> 'admin';",
    "SELECT COUNT(*) AS password_records FROM user_passwords;",
    ...USER_TABLES.map((table) => `SELECT COUNT(*) AS ${table} FROM ${table};`),
    `SELECT COUNT(*) AS demo_records FROM users
      WHERE lower(email) LIKE '%demo%' OR lower(email) LIKE '%sample%' OR lower(email) LIKE '%smoke%' OR lower(email) LIKE '%test%' OR id LIKE 'demo-%';`,
    `SELECT COUNT(*) AS duplicate_normalized_emails FROM (
      SELECT lower(trim(email)) AS normalized_email FROM users GROUP BY lower(trim(email)) HAVING COUNT(*) > 1
    );`,
    "PRAGMA foreign_key_check;",
  ].join("\n");
  const json = d1(command);
  const counts = {};
  json.forEach((result) => {
    const row = result.results?.[0];
    if (!row) return;
    const [key, value] = Object.entries(row)[0] ?? [];
    if (key) counts[key] = value;
  });
  counts.foreign_key_violations = json.at(-1)?.results?.length ?? 0;
  return counts;
}

function countShots() {
  const json = d1("SELECT sessions_json FROM golf_session_snapshots;");
  let shotCount = 0;
  for (const row of rows(json)) {
    try {
      const parsed = JSON.parse(row.sessions_json || "[]");
      if (Array.isArray(parsed)) {
        for (const session of parsed) {
          if (Array.isArray(session?.shots)) shotCount += session.shots.length;
        }
      }
    } catch {
      // Leave unreadable snapshot data counted as sessions only.
    }
  }
  return shotCount;
}

function readWranglerAuthConfig() {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Library/Preferences/.wrangler/config/default.toml"),
    path.join(home, ".config/.wrangler/config/default.toml"),
    path.join(home, ".wrangler/config/default.toml"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const token = text.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    if (token) return { token, path: candidate };
  }
  return { token: process.env.CLOUDFLARE_API_TOKEN ?? "", path: "CLOUDFLARE_API_TOKEN" };
}

function getAccountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const output = run("npx", ["wrangler", "whoami"]);
  const match = output.match(/\b[0-9a-f]{32}\b/i);
  if (!match) throw new Error("Could not determine Cloudflare account ID from Wrangler.");
  return match[0];
}

async function cfFetch(accountId, token, resource, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${resource}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "wrangler/4.92.0",
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    run("npx", ["wrangler", "whoami"]);
  }
  return response;
}

async function listR2Objects(accountId, bucketName) {
  let { token } = readWranglerAuthConfig();
  if (!token) {
    run("npx", ["wrangler", "whoami"]);
    token = readWranglerAuthConfig().token;
  }
  if (!token) throw new Error("Could not read an authenticated Wrangler token for R2 cleanup.");
  const allObjects = [];
  const perPage = 1000;
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ per_page: String(perPage) });
    if (cursor) params.set("cursor", cursor);
    const response = await cfFetch(accountId, token, `/r2/buckets/${bucketName}/objects?${params.toString()}`);
    if (!response.ok) throw new Error(`Could not list R2 objects: ${response.status} ${response.statusText}`);
    const json = await response.json();
    if (!json.success) throw new Error("Cloudflare API did not accept the R2 object listing request.");
    const pageObjects = Array.isArray(json.result) ? json.result : [];
    allObjects.push(...pageObjects);
    const nextCursor = json.result_info?.cursor ?? json.result_info?.next_cursor ?? json.cursor ?? "";
    if (!nextCursor || pageObjects.length < perPage) break;
    cursor = nextCursor;
  }
  return allObjects;
}

function isUserGeneratedObject(object) {
  const key = object?.key ?? "";
  const metadata = object?.custom_metadata ?? {};
  return R2_USER_PREFIXES.some((prefix) => key.startsWith(prefix))
    || Boolean(metadata.memberId || metadata.uploadedBy || metadata.userId || metadata.coachId);
}

async function deleteR2Objects(accountId, bucketName, objects) {
  let { token } = readWranglerAuthConfig();
  if (!token) throw new Error("Could not read an authenticated Wrangler token for R2 cleanup.");
  let deleted = 0;
  for (const object of objects) {
    const key = object.key;
    const response = await cfFetch(
      accountId,
      token,
      `/r2/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Could not delete R2 object ${key}: ${response.status} ${response.statusText}`);
    }
    deleted += 1;
  }
  return deleted;
}

async function readPasswordFromTerminal() {
  if (!process.stdin.isTTY) {
    const input = await new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => resolve(data));
    });
    const [password, confirmPassword] = String(input).split(/\r?\n/);
    return { password: password ?? "", confirmPassword: confirmPassword ?? "" };
  }
  const readHiddenLine = (prompt) => new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (buffer) => {
      for (const character of buffer.toString("utf8")) {
        if (character === "\u0003") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdout.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    stdin.on("data", onData);
  });
  const password = await readHiddenLine("Preserved admin password: ");
  const confirmPassword = await readHiddenLine("Confirm preserved admin password: ");
  process.stdin.pause();
  return { password, confirmPassword };
}

function makePasswordRecord(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, "sha256");
  return {
    hash: hash.toString("base64"),
    salt: salt.toString("base64"),
    iterations: PASSWORD_HASH_ITERATIONS,
  };
}

function resetSql(admin, passwordRecord) {
  const adminId = sqlString(admin.id);
  const adminEmail = sqlString(admin.normalized_email);
  return `
${DELETE_ORDER.map((table) => `DELETE FROM ${table};`).join("\n")}
DELETE FROM user_passwords WHERE user_id <> ${adminId};
DELETE FROM users WHERE id <> ${adminId};
UPDATE users SET
  role = 'admin',
  email = ${adminEmail},
  account_status = 'active',
  invite_status = 'accepted',
  password_reset_required = 0,
  phone = NULL,
  skill_level = NULL,
  notes = NULL,
  created_by = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ${adminId};
INSERT INTO user_passwords (
  user_id, password_hash, password_salt, iterations, created_at, updated_at
) VALUES (
  ${adminId},
  ${sqlString(passwordRecord.hash)},
  ${sqlString(passwordRecord.salt)},
  ${passwordRecord.iterations},
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(user_id) DO UPDATE SET
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  iterations = excluded.iterations,
  updated_at = CURRENT_TIMESTAMP;
`;
}

function writeTempSql(sql) {
  const filePath = path.join(os.tmpdir(), `mai-coach-dev-reset-${timestamp()}.sql`);
  fs.writeFileSync(filePath, sql, { mode: 0o600 });
  return filePath;
}

function printCounts(label, counts, shotCount, r2Count) {
  console.log(`\n${label}`);
  console.log(`Users: ${counts.users ?? 0}`);
  console.log(`Admin users: ${counts.admin_users ?? 0}`);
  console.log(`Non-admin users: ${counts.non_admin_users ?? 0}`);
  console.log(`Sessions: ${counts.golf_session_snapshots ?? 0}`);
  console.log(`Shots: ${shotCount}`);
  console.log(`Videos: ${counts.lesson_videos ?? 0}`);
  console.log(`Transcripts: ${counts.video_transcripts ?? 0}`);
  console.log(`Lesson recaps: ${counts.video_lesson_recap_drafts ?? 0}`);
  console.log(`Imports: ${counts.photo_import_jobs ?? 0}`);
  console.log(`Practice plans: ${counts.practice_activities ?? 0}`);
  console.log(`Relationships: ${counts.coach_members ?? 0}`);
  console.log(`Invitations: ${counts.member_invitations ?? 0}`);
  console.log(`Auth sessions: ${counts.auth_sessions ?? 0}`);
  console.log(`Demo/test user records: ${counts.demo_records ?? 0}`);
  console.log(`Foreign-key violations: ${counts.foreign_key_violations ?? 0}`);
  console.log(`Duplicate normalized emails: ${counts.duplicate_normalized_emails ?? 0}`);
  console.log(`R2 user-generated objects: ${r2Count}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const preserveEmail = normalizeEmail(args.preserveEmail);
  const config = readConfig();
  const targets = assertDevTargets(config, preserveEmail);
  const admin = getAdmin(preserveEmail);
  if (!admin) throw new Error(`Refusing reset: exact preserved admin ${preserveEmail} is missing.`);
  if (admin.normalized_email !== preserveEmail) throw new Error("Refusing reset: normalized admin email mismatch.");

  const tableNames = getTableNames();
  const unexpectedTables = tableNames.filter((table) => !SYSTEM_TABLES.has(table) && !USER_TABLES.includes(table));
  if (unexpectedTables.length) {
    throw new Error(`Refusing reset: unclassified user-data tables found: ${unexpectedTables.join(", ")}`);
  }

  const accountId = getAccountId();
  const r2Objects = await listR2Objects(accountId, targets.r2Name);
  const r2UserObjects = r2Objects.filter(isUserGeneratedObject);
  const r2UnknownObjects = r2Objects.filter((object) => !isUserGeneratedObject(object));

  const beforeCounts = countKnownRows();
  const beforeShots = countShots();
  printCounts("Dry-run / before reset", beforeCounts, beforeShots, r2UserObjects.length);
  console.log(`Users to delete: ${Math.max(0, Number(beforeCounts.users ?? 0) - 1)}`);
  console.log(`User-generated R2 objects to delete: ${r2UserObjects.length}`);
  if (r2UnknownObjects.length) {
    console.log(`Unknown R2 objects left untouched: ${r2UnknownObjects.length}`);
  }

  if (Number(beforeCounts.users ?? 0) < 1 || preserveEmail !== admin.normalized_email) {
    throw new Error("Refusing reset: preserved admin would not remain.");
  }

  if (!args.execute) {
    console.log("\nDry-run only. Add --execute to delete Dev data.");
    return;
  }

  const backup = createBackup();
  console.log(`\nBackup created: ${backup.path} (${backup.bytes} bytes)`);

  const { password, confirmPassword } = await readPasswordFromTerminal();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password !== confirmPassword) throw new Error("Password confirmation did not match.");
  const passwordRecord = makePasswordRecord(password);

  const sqlPath = writeTempSql(resetSql(admin, passwordRecord));
  try {
    d1File(sqlPath);
  } finally {
    fs.rmSync(sqlPath, { force: true });
  }

  const deletedR2Objects = await deleteR2Objects(accountId, targets.r2Name, r2UserObjects);
  const afterObjects = await listR2Objects(accountId, targets.r2Name);
  const afterUserObjects = afterObjects.filter(isUserGeneratedObject);
  const afterCounts = countKnownRows();
  const afterShots = countShots();
  printCounts("After reset", afterCounts, afterShots, afterUserObjects.length);

  const finalAdmin = getAdmin(preserveEmail);
  if (!finalAdmin || finalAdmin.id !== admin.id) throw new Error("Preserved admin ID changed or disappeared.");
  if (Number(afterCounts.users ?? 0) !== 1) throw new Error("Reset incomplete: user count is not 1.");
  if (Number(afterCounts.admin_users ?? 0) !== 1) throw new Error("Reset incomplete: admin user count is not 1.");
  if (Number(afterCounts.non_admin_users ?? 0) !== 0) throw new Error("Reset incomplete: non-admin users remain.");
  if (afterUserObjects.length !== 0) throw new Error("Reset incomplete: user-generated R2 objects remain.");
  if (Number(afterCounts.foreign_key_violations ?? 0) !== 0) throw new Error("Reset incomplete: foreign-key violations remain.");
  if (Number(afterCounts.duplicate_normalized_emails ?? 0) !== 0) throw new Error("Reset incomplete: duplicate normalized emails remain.");

  const report = {
    preservedEmail: preserveEmail,
    preservedUserId: admin.id,
    backup,
    usersDeleted: Math.max(0, Number(beforeCounts.users ?? 0) - Number(afterCounts.users ?? 0)),
    sessionsDeleted: Number(beforeCounts.golf_session_snapshots ?? 0),
    shotsDeleted: beforeShots,
    videosDeleted: Number(beforeCounts.lesson_videos ?? 0),
    r2ObjectsDeleted: deletedR2Objects,
    beforeCounts,
    afterCounts,
    afterR2UserObjectCount: afterUserObjects.length,
    worker: targets.workerName,
    d1: targets.d1Name,
    r2: targets.r2Name,
  };
  const reportPath = `/tmp/mai-coach-dev-reset-report-${timestamp()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReset report: ${reportPath}`);
  console.log("Dev data reset complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
