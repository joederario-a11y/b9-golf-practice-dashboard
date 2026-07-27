import { cancelAccountSetupInvitations, createAccountSetupInvitation } from "@/lib/server/email-service";
import {
  adminCreateUserGuard,
  buildCoachReconciliationCandidates,
  deriveSetupStatus,
  finalActiveAdminChangeGuard,
  normalizeEmail,
  safeAccountStatus,
  safeInviteStatus,
  safeRole,
  singleCoachAssignmentGuard,
  validatePasswordConfirmation,
} from "@/lib/admin-user-policy.mjs";
import { sanitizeSession, sanitizeSessionList } from "@/lib/session-data-policy.mjs";
import { upsertLessonSessionLink } from "@/lib/server/lesson-session-links";
import {
  ensurePlatformSchema,
  ensureCoachFeedbackSchema,
  ensureMaiCaddyAnalysisSchema,
  ensureUserDataOwnershipSchema,
  ensureVideoVisualAnalysisSchema,
  getAssignedMemberIds,
  getPlatformEnvironment,
  getRequiredDatabase,
  invalidateUserSessions,
  recordActivity,
  requireIdentity,
  responseFromError,
  setUserPassword,
  type AuthIdentity,
  type UserRole,
} from "@/lib/server/platform";

type UserRow = {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  skill_level: string | null;
  notes: string | null;
  account_status: string;
  invite_status: string;
  invited_at: string | null;
  last_login_at: string | null;
  password_reset_required: number | boolean;
  password_user_id: string | null;
  created_at: string;
  updated_at: string;
  assigned_coach_ids: string | null;
  assigned_coach_names: string | null;
  profile_image_id: string | null;
  profile_image_updated_at: string | null;
  video_count: number;
  last_video_at: string | null;
  sessions_json: string | null;
};

type ActivityRow = {
  id: string;
  actor_id: string | null;
  actor_role: string;
  member_id: string | null;
  target_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  metadata_json: string;
  created_at: string;
};

type ContentRow = {
  id: string;
  member_id: string;
  created_by: string;
  content_type: string;
  title: string;
  body: string;
  visibility: string;
  status: string;
  session_data_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
};

type AssignedCoachRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  skill_level: string | null;
  image_id: string | null;
  image_updated_at: string | null;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const next = text(value, maxLength);
  return next || null;
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function coachPhotoUrl(userId: string, imageId?: string | null, version?: string | null) {
  if (!imageId) return "";
  const params = new URLSearchParams({ imageId, userId });
  if (version) params.set("v", version);
  return `/api/coach-photo?${params.toString()}`;
}

function displayName(row: { first_name: string; last_name: string; email?: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "User";
}

function parseJsonArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("no such table");
}

async function optionalRows<T>(database: D1Database, query: string, ...bindings: unknown[]) {
  try {
    const statement = database.prepare(query);
    const result = bindings.length ? await statement.bind(...bindings).all<T>() : await statement.all<T>();
    return result.results ?? [];
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function optionalRun(database: D1Database, query: string, ...bindings: unknown[]) {
  try {
    const statement = database.prepare(query);
    await (bindings.length ? statement.bind(...bindings) : statement).run();
  } catch (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

async function countRows(database: D1Database, query: string, ...bindings: unknown[]) {
  const statement = database.prepare(query);
  const row = bindings.length
    ? await statement.bind(...bindings).first<{ count: number }>()
    : await statement.first<{ count: number }>();
  return Number(row?.count ?? 0);
}

function serializeUser(row: UserRow) {
  const coachIds = row.assigned_coach_ids?.split(",").filter(Boolean) ?? [];
  const coachNames = row.assigned_coach_names?.split(",").filter(Boolean) ?? [];
  const sessions = parseJsonArray(row.sessions_json);
  const user = {
    id: row.id,
    name: displayName(row),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    phone: row.phone ?? "",
    skillLevel: row.skill_level ?? "",
    notes: row.notes ?? "",
    accountStatus: row.account_status || "active",
    inviteStatus: row.invite_status,
    invitedAt: row.invited_at,
    lastLoginAt: row.last_login_at,
    passwordConfigured: Boolean(row.password_user_id),
    passwordResetRequired: row.password_reset_required === 1 || row.password_reset_required === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedCoachIds: coachIds,
    assignedCoachId: coachIds[0] ?? "",
    assignedCoachNames: coachNames,
    assignedCoachName: coachNames[0] ?? "",
    profileImageUrl: coachPhotoUrl(row.id, row.profile_image_id, row.profile_image_updated_at),
    videoCount: Number(row.video_count ?? 0),
    sessionCount: sessions.length,
    lastVideoAt: row.last_video_at,
  };
  return {
    ...user,
    setupStatus: deriveSetupStatus(user),
  };
}

function serializeActivity(row: ActivityRow) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    memberId: row.member_id,
    targetUserId: row.target_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    summary: row.summary,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
  };
}

function serializeContent(row: ContentRow) {
  return {
    id: row.id,
    memberId: row.member_id,
    createdBy: row.created_by,
    creatorName: row.creator_name ?? "Staff",
    contentType: row.content_type,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    status: row.status,
    sessionId: row.session_data_id,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAssignedCoach(row: AssignedCoachRow) {
  return {
    id: row.id,
    name: displayName(row),
    email: row.email,
    title: row.skill_level ?? "Coach",
    profileImageUrl: coachPhotoUrl(row.id, row.image_id, row.image_updated_at),
  };
}

async function requireStaff() {
  const identity = await requireIdentity();
  if (identity.role === "member") {
    throw new Response("Coach or admin access is required.", { status: 403 });
  }
  return identity;
}

async function memberIsVisible(identity: AuthIdentity, memberId: string, database: D1Database) {
  if (identity.role === "admin") return true;
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  return assignedMemberIds.includes(memberId);
}

async function getUser(database: D1Database, userId: string) {
  return database
    .prepare(
      `SELECT
        id, role, first_name, last_name, email, phone, skill_level, notes,
        COALESCE(account_status, 'active') AS account_status,
        invite_status, invited_at, last_login_at, created_at, updated_at
      FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      role: UserRole;
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
      skill_level: string | null;
      notes: string | null;
      account_status: string;
      invite_status: string;
      invited_at: string | null;
      last_login_at: string | null;
      created_at: string;
      updated_at: string;
    }>();
}

async function listUsers(database: D1Database, identity: AuthIdentity) {
  const baseQuery = `
    SELECT
      users.id,
      users.role,
      users.first_name,
      users.last_name,
      users.email,
      users.phone,
      users.skill_level,
      users.notes,
      COALESCE(users.account_status, 'active') AS account_status,
      users.invite_status,
      users.invited_at,
      users.last_login_at,
      COALESCE(users.password_reset_required, 0) AS password_reset_required,
      user_passwords.user_id AS password_user_id,
      users.created_at,
      users.updated_at,
      GROUP_CONCAT(DISTINCT assigned_coach.id) AS assigned_coach_ids,
      GROUP_CONCAT(DISTINCT TRIM(assigned_coach.first_name || ' ' || assigned_coach.last_name)) AS assigned_coach_names,
      profile_image.id AS profile_image_id,
      profile_image.updated_at AS profile_image_updated_at,
      COUNT(DISTINCT lesson_videos.id) AS video_count,
      MAX(lesson_videos.created_at) AS last_video_at,
      golf_session_snapshots.sessions_json AS sessions_json
    FROM users
    LEFT JOIN coach_members ON coach_members.member_id = users.id
    LEFT JOIN users AS assigned_coach ON assigned_coach.id = coach_members.coach_id
    LEFT JOIN user_passwords ON user_passwords.user_id = users.id
    LEFT JOIN user_profile_images AS profile_image
      ON profile_image.user_id = users.id AND profile_image.is_current = 1
    LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
      AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
    LEFT JOIN golf_session_snapshots ON golf_session_snapshots.user_id = users.id
  `;

  const where = identity.role === "admin"
    ? ""
    : "WHERE users.role = 'member' AND coach_members.coach_id = ?";
  const query = `${baseQuery} ${where} GROUP BY users.id ORDER BY users.created_at DESC`;
  const result = identity.role === "admin"
    ? await database.prepare(query).all<UserRow>()
    : await database.prepare(query).bind(identity.id).all<UserRow>();
  return result.results.map(serializeUser);
}

async function recentActivity(database: D1Database, identity: AuthIdentity, memberId?: string) {
  const bindings: string[] = [];
  let query = "SELECT * FROM member_activity_log";
  if (memberId) {
    query += " WHERE member_id = ? OR target_user_id = ?";
    bindings.push(memberId, memberId);
  } else if (identity.role === "coach") {
    query += ` WHERE member_id IN (SELECT member_id FROM coach_members WHERE coach_id = ?)
      OR actor_id = ?`;
    bindings.push(identity.id, identity.id);
  }
  query += " ORDER BY created_at DESC LIMIT 30";
  const statement = database.prepare(query);
  const result = bindings.length
    ? await statement.bind(...bindings).all<ActivityRow>()
    : await statement.all<ActivityRow>();
  return result.results.map(serializeActivity);
}

async function listCoaches(database: D1Database) {
  const result = await database
    .prepare(
      `SELECT
        users.id, users.role, users.first_name, users.last_name, users.email,
        users.phone, users.skill_level, users.notes,
        COALESCE(users.account_status, 'active') AS account_status,
        users.invite_status, users.invited_at, users.last_login_at,
        COALESCE(users.password_reset_required, 0) AS password_reset_required,
        user_passwords.user_id AS password_user_id,
        users.created_at,
        users.updated_at,
        NULL AS assigned_coach_ids,
        NULL AS assigned_coach_names,
        profile_image.id AS profile_image_id,
        profile_image.updated_at AS profile_image_updated_at,
        0 AS video_count,
        NULL AS last_video_at,
        NULL AS sessions_json
      FROM users
      LEFT JOIN user_passwords ON user_passwords.user_id = users.id
      LEFT JOIN user_profile_images AS profile_image
        ON profile_image.user_id = users.id AND profile_image.is_current = 1
      WHERE role = 'coach' ORDER BY last_name, first_name`,
    )
    .all<UserRow>();
  return result.results.map(serializeUser);
}

async function dashboard(database: D1Database, identity: AuthIdentity) {
  const users = await listUsers(database, identity);
  const members = users.filter((user) => user.role === "member");
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const videosUploaded = members.reduce((sum, user) => sum + user.videoCount, 0);
  const sessionsAdded = members.reduce((sum, user) => sum + user.sessionCount, 0);
  const feedbackRows = identity.role === "admin"
    ? await database
        .prepare("SELECT COUNT(*) AS count FROM lesson_videos WHERE publication_status = 'Published' AND review_status IN ('New', 'Coach Feedback') AND LOWER(COALESCE(video_type, '')) NOT IN ('system_test', 'system test')")
        .first<{ count: number }>()
    : await database
        .prepare(
          `SELECT COUNT(*) AS count FROM lesson_videos
           WHERE publication_status = 'Published'
             AND review_status IN ('New', 'Coach Feedback')
             AND LOWER(COALESCE(video_type, '')) NOT IN ('system_test', 'system test')
             AND member_id IN (SELECT member_id FROM coach_members WHERE coach_id = ?)`,
        )
        .bind(identity.id)
        .first<{ count: number }>();

  const allCoaches = identity.role === "admin" ? await listCoaches(database) : [];
  return {
    summary: {
      totalMembers: members.length,
      totalCoaches: identity.role === "admin" ? allCoaches.length : 1,
      activeMembers: members.filter((user) => user.accountStatus !== "inactive").length,
      membersAddedThisMonth: members.filter((user) => user.createdAt.startsWith(monthKey)).length,
      videosUploaded,
      sessionsAdded,
      coachFeedbackAwaitingReview: Number(feedbackRows?.count ?? 0),
    },
    quickActions: identity.role === "admin"
      ? ["Add member", "Add coach", "Add admin", "Upload video", "Add session", "Assign coach", "Send invitation"]
      : ["Add member", "Upload video", "Add session", "Add feedback", "Assign drill"],
    users,
    coaches: allCoaches,
    recentActivity: await recentActivity(database, identity),
  };
}

async function memberDetail(database: D1Database, identity: AuthIdentity, memberId: string) {
  if (!memberId) throw new Response("memberId is required.", { status: 400 });
  if (identity.role !== "admin" && identity.id !== memberId && !(await memberIsVisible(identity, memberId, database))) {
    throw new Response("You do not have access to that member.", { status: 403 });
  }
  const users = await listUsers(database, identity);
  const member = users.find((user) => user.id === memberId);
  if (!member) throw new Response("User not found.", { status: 404 });

  const sessionRow = await database
    .prepare("SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?")
    .bind(member.id)
    .first<{ sessions_json: string; updated_at: string }>();
  const videos = await database
    .prepare(
      `SELECT
         lesson_videos.id,
         lesson_videos.title,
         lesson_videos.publication_status,
         lesson_videos.upload_status,
         lesson_videos.review_status,
         lesson_videos.created_at,
         lesson_videos.updated_at,
         lesson_videos.lesson_date,
         lesson_videos.member_facing_notes,
         lesson_videos.coach_id,
         lesson_videos.uploaded_by_role,
         TRIM(coach.first_name || ' ' || coach.last_name) AS coach_name
       FROM lesson_videos
       LEFT JOIN users AS coach ON coach.id = lesson_videos.coach_id
       WHERE lesson_videos.member_id = ?
         AND LOWER(COALESCE(lesson_videos.video_type, '')) NOT IN ('system_test', 'system test')
       ORDER BY lesson_videos.created_at DESC LIMIT 30`,
    )
    .bind(memberId)
    .all<{
      id: string;
      title: string;
      publication_status: string;
      upload_status: string;
      review_status: string;
      created_at: string;
      updated_at: string;
      lesson_date: string | null;
      member_facing_notes: string;
      coach_id: string | null;
      uploaded_by_role: string;
      coach_name: string | null;
    }>();
  const assignedCoaches = member.role === "member"
    ? await database
        .prepare(
          `SELECT
            users.id,
            users.first_name,
            users.last_name,
            users.email,
            users.skill_level,
            profile_image.id AS image_id,
            profile_image.updated_at AS image_updated_at
           FROM coach_members
           JOIN users ON users.id = coach_members.coach_id
           LEFT JOIN user_profile_images AS profile_image
             ON profile_image.user_id = users.id AND profile_image.is_current = 1
           WHERE coach_members.member_id = ?
           ORDER BY users.last_name, users.first_name`,
        )
        .bind(memberId)
        .all<AssignedCoachRow>()
    : { results: [] as AssignedCoachRow[] };
  const content = await database
    .prepare(
      `SELECT
        member_content_items.*,
        TRIM(users.first_name || ' ' || users.last_name) AS creator_name
       FROM member_content_items
       LEFT JOIN users ON users.id = member_content_items.created_by
       WHERE member_content_items.member_id = ?
       ORDER BY member_content_items.created_at DESC`,
    )
    .bind(memberId)
    .all<ContentRow>();

  return {
    member,
    assignedCoaches: assignedCoaches.results.map(serializeAssignedCoach),
    sessions: parseJsonArray(sessionRow?.sessions_json ?? null),
    sessionsUpdatedAt: sessionRow?.updated_at ?? null,
    videos: videos.results.map((video) => ({
      id: video.id,
      title: video.title,
      publicationStatus: video.publication_status,
      uploadStatus: video.upload_status,
      reviewStatus: video.review_status,
      createdAt: video.created_at,
      updatedAt: video.updated_at,
      lessonDate: video.lesson_date,
      memberFacingNotes: video.member_facing_notes,
      coachId: video.coach_id,
      coachName: video.coach_name,
      uploadedByRole: video.uploaded_by_role,
    })),
    content: content.results.map(serializeContent),
    activity: await recentActivity(database, identity, memberId),
  };
}

async function createUser(request: Request, database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const role = safeRole(text(payload.role, 20), "member") as UserRole;
  const firstName = text(payload.firstName, 80);
  const lastName = text(payload.lastName, 80);
  const email = normalizeEmail(payload.email);
  if (!firstName || !lastName || !isEmail(email)) {
    throw new Response("First name, last name, and a valid email are required.", { status: 400 });
  }
  const phone = nullableText(payload.phone, 40);
  const skillLevel = nullableText(payload.skillLevel, 80);
  const notes = nullableText(payload.notes, 2000);
  const accountStatus = safeAccountStatus(text(payload.accountStatus, 20), "active");
  const inviteStatus = safeInviteStatus(text(payload.inviteStatus, 20), "pending");
  const existing = await database
    .prepare("SELECT id, email, role FROM users WHERE LOWER(email) = ?")
    .bind(email)
    .first<{ id: string; email: string; role: UserRole }>();
  const guard = adminCreateUserGuard(identity.role, existing);
  if (guard) throw new Response(guard.message, { status: guard.status });
  const userId = crypto.randomUUID();

  await database
    .prepare(
      `INSERT INTO users (
        id, role, first_name, last_name, email, phone, skill_level, notes,
        account_status, invite_status, invited_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(userId, role, firstName, lastName, email, phone, skillLevel, notes, accountStatus, inviteStatus, identity.id)
    .run();

  if (role === "member") {
    const coachId = identity.role === "coach" ? identity.id : text(payload.coachId, 80);
    if (coachId) {
      await assignCoach(database, identity, userId, coachId, false);
      await recordActivity({
        action: identity.role === "coach" ? "coach_added_student" : "coach_assigned",
        actor: identity,
        database,
        entityId: `${coachId}:${userId}`,
        entityType: "coach_assignment",
        memberId: userId,
        metadata: { coachId },
        summary: `${identity.displayName} added ${firstName} ${lastName} to ${identity.role === "coach" ? "their roster" : "a coach roster"}.`,
        targetUserId: userId,
      });
    }
  }

  const invite = await createAccountSetupInvitation({
    actor: identity,
    coachId: role === "member" ? (identity.role === "coach" ? identity.id : text(payload.coachId, 80)) : null,
    request,
    user: {
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      invite_status: inviteStatus,
    },
  });
  await recordActivity({
    action: "user_created",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user",
    memberId: role === "member" ? userId : null,
    summary: `${identity.displayName} created ${firstName} ${lastName} as ${role}.`,
    targetUserId: userId,
  });
  return { userId, invite };
}

async function assignCoach(
  database: D1Database,
  identity: AuthIdentity,
  memberId: string,
  coachId: string,
  shouldRecord = true,
) {
  if (identity.role !== "admin" && identity.id !== coachId) {
    throw new Response("Only admins can reassign members to another coach.", { status: 403 });
  }
  const member = await getUser(database, memberId);
  if (!member || member.role !== "member") throw new Response("Member not found.", { status: 404 });
  const coach = await getUser(database, coachId);
  if (!coach || coach.role !== "coach") throw new Response("Coach not found.", { status: 404 });
  const oldAssignments = await database
    .prepare("SELECT coach_id FROM coach_members WHERE member_id = ?")
    .bind(memberId)
    .all<{ coach_id: string }>();
  const oldCoachIds = oldAssignments.results.map((row) => row.coach_id);
  const guard = singleCoachAssignmentGuard({
    coachId,
    existingCoachIds: oldCoachIds,
    identityId: identity.id,
    identityRole: identity.role,
  });
  if (!guard.allowed) throw new Response(guard.message, { status: guard.status });

  if (identity.role === "admin") {
    const removedCoachIds = oldCoachIds.filter((oldCoachId) => oldCoachId !== coachId);
    if (removedCoachIds.length) {
      await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(memberId).run();
      for (const removedCoachId of removedCoachIds) {
        await recordActivity({
          action: "coach_removed",
          actor: identity,
          database,
          entityId: `${removedCoachId}:${memberId}`,
          entityType: "coach_assignment",
          memberId,
          metadata: { coachId: removedCoachId },
          summary: `${identity.displayName} removed a coach assignment for ${displayName(member)}.`,
          targetUserId: memberId,
        });
      }
    }
  }
  const assignmentId = crypto.randomUUID();
  if (!oldCoachIds.includes(coachId) || (identity.role === "admin" && oldCoachIds.length > 1)) {
    await database
      .prepare(
        `INSERT INTO coach_members (id, coach_id, member_id, created_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(coach_id, member_id) DO NOTHING`,
      )
      .bind(assignmentId, coachId, memberId)
      .run();
  }
  if (shouldRecord) {
    const alreadyAssigned = oldCoachIds.includes(coachId);
    await recordActivity({
      action: alreadyAssigned ? "coach_assignment_confirmed" : oldCoachIds.length ? "coach_changed" : "coach_assigned",
      actor: identity,
      database,
      entityId: assignmentId,
      entityType: "coach_assignment",
      memberId,
      metadata: { coachId },
      summary: alreadyAssigned
        ? `${displayName(member)} is already assigned to ${displayName(coach)}.`
        : `${identity.displayName} assigned ${displayName(member)} to ${displayName(coach)}.`,
      targetUserId: memberId,
    });
  }
}

async function removeCoachAssignment(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can remove coach assignments.", { status: 403 });
  const memberId = text(payload.memberId, 80);
  const coachId = text(payload.coachId, 80);
  if (!memberId || !coachId) throw new Response("memberId and coachId are required.", { status: 400 });
  const member = await getUser(database, memberId);
  const coach = await getUser(database, coachId);
  if (!member || member.role !== "member") throw new Response("Member not found.", { status: 404 });
  if (!coach || coach.role !== "coach") throw new Response("Coach not found.", { status: 404 });
  const result = await database
    .prepare("DELETE FROM coach_members WHERE member_id = ? AND coach_id = ?")
    .bind(memberId, coachId)
    .run();
  if (Number(result.meta?.changes ?? 0) > 0) {
    await recordActivity({
      action: "coach_removed",
      actor: identity,
      database,
      entityId: `${coachId}:${memberId}`,
      entityType: "coach_assignment",
      memberId,
      metadata: { coachId },
      summary: `${identity.displayName} removed ${displayName(coach)} from ${displayName(member)}.`,
      targetUserId: memberId,
    });
  }
}

async function adminSetPassword(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can set passwords.", { status: 403 });
  const userId = text(payload.userId, 80);
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
  const forcePasswordChange = payload.forcePasswordChange === true;
  if (!userId) throw new Response("userId is required.", { status: 400 });
  const target = await getUser(database, userId);
  if (!target) throw new Response("User not found.", { status: 404 });
  const passwordError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError) throw new Response(passwordError, { status: 400 });
  const existingPassword = await database
    .prepare("SELECT user_id FROM user_passwords WHERE user_id = ?")
    .bind(userId)
    .first<{ user_id: string }>();

  await setUserPassword(userId, password, { temporary: forcePasswordChange });
  const invalidatedSessions = await invalidateUserSessions(userId, {
    preserveCurrentSession: userId === identity.id,
  });
  await database
    .prepare(
      `UPDATE users SET
        account_status = 'active',
        invite_status = 'accepted',
        password_reset_required = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(forcePasswordChange ? 1 : 0, userId)
    .run();
  await recordActivity({
    action: existingPassword ? "password_reset" : "password_set",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user_password",
    memberId: target.role === "member" ? userId : null,
    metadata: { forcePasswordChange, sessionsInvalidated: invalidatedSessions },
    summary: `${identity.displayName} ${existingPassword ? "reset" : "set"} a password for ${displayName(target)}.`,
    targetUserId: userId,
  });
  if (invalidatedSessions > 0) {
    await recordActivity({
      action: "sessions_invalidated",
      actor: identity,
      database,
      entityId: userId,
      entityType: "auth_session",
      memberId: target.role === "member" ? userId : null,
      metadata: { count: invalidatedSessions },
      summary: `${identity.displayName} invalidated ${invalidatedSessions} existing login sessions for ${displayName(target)}.`,
      targetUserId: userId,
    });
  }
}

async function updateUser(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can edit user accounts.", { status: 403 });
  const userId = text(payload.userId, 80);
  if (!userId) throw new Response("userId is required.", { status: 400 });
  const existing = await getUser(database, userId);
  if (!existing) throw new Response("User not found.", { status: 404 });
  const safeNextRole = safeRole(text(payload.role, 20) || existing.role, existing.role) as UserRole;
  const accountStatus = safeAccountStatus(text(payload.accountStatus, 20) || existing.account_status, existing.account_status);
  const inviteStatus = safeInviteStatus(text(payload.inviteStatus, 20) || existing.invite_status, existing.invite_status);
  const firstName = text(payload.firstName, 80);
  const lastName = text(payload.lastName, 80);
  const email = normalizeEmail(payload.email || existing.email);
  if (!firstName || !lastName || !isEmail(email)) {
    throw new Response("First name, last name, and a valid email are required.", { status: 400 });
  }
  const duplicateEmail = await database
    .prepare("SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?")
    .bind(email, userId)
    .first<{ id: string }>();
  if (duplicateEmail) {
    throw new Response("That email is already used by another account.", { status: 409 });
  }
  const activeAdmins = await database
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND COALESCE(account_status, 'active') <> 'inactive'")
    .first<{ count: number }>();
  const finalAdminGuard = finalActiveAdminChangeGuard({
    activeAdminCount: Number(activeAdmins?.count ?? 0),
    existingAccountStatus: existing.account_status,
    existingRole: existing.role,
    nextAccountStatus: accountStatus,
    nextRole: safeNextRole,
  });
  if (finalAdminGuard) throw new Response(finalAdminGuard.message, { status: finalAdminGuard.status });

  await database
    .prepare(
      `UPDATE users SET
        role = ?,
        first_name = ?,
        last_name = ?,
        email = ?,
        phone = ?,
        skill_level = ?,
        notes = ?,
        account_status = ?,
        invite_status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(
      safeNextRole,
      firstName,
      lastName,
      email,
      nullableText(payload.phone, 40),
      nullableText(payload.skillLevel, 80),
      nullableText(payload.notes, 2000),
      accountStatus,
      inviteStatus,
      userId,
    )
    .run();

  if (safeNextRole === "member") {
    const coachId = text(payload.coachId, 80);
    if (coachId) {
      await assignCoach(database, identity, userId, coachId);
    } else {
      const previous = await database
        .prepare("SELECT coach_id FROM coach_members WHERE member_id = ?")
        .bind(userId)
        .all<{ coach_id: string }>();
      await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(userId).run();
      for (const row of previous.results) {
        await recordActivity({
          action: "coach_removed",
          actor: identity,
          database,
          entityId: `${row.coach_id}:${userId}`,
          entityType: "coach_assignment",
          memberId: userId,
          metadata: { coachId: row.coach_id },
          summary: `${identity.displayName} removed a coach assignment for ${firstName} ${lastName}.`,
          targetUserId: userId,
        });
      }
    }
  }
  if (safeNextRole !== "member") {
    await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(userId).run();
  }
  if (existing.role === "coach" && safeNextRole !== "coach") {
    await database.prepare("DELETE FROM coach_members WHERE coach_id = ?").bind(userId).run();
  }
  if (accountStatus === "inactive") {
    await invalidateUserSessions(userId, { preserveCurrentSession: userId === identity.id });
  }

  const changes: Record<string, unknown> = {};
  if (existing.email.toLowerCase() !== email) changes.emailChanged = true;
  if (existing.role !== safeNextRole) changes.roleChanged = { from: existing.role, to: safeNextRole };
  if (existing.account_status !== accountStatus) changes.accountStatusChanged = { from: existing.account_status, to: accountStatus };
  if (existing.invite_status !== inviteStatus) changes.inviteStatusChanged = { from: existing.invite_status, to: inviteStatus };
  await recordActivity({
    action: "user_updated",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user",
    memberId: safeNextRole === "member" ? userId : null,
    metadata: changes,
    summary: `${identity.displayName} updated ${firstName} ${lastName}.`,
    targetUserId: userId,
  });
  if (changes.emailChanged) {
    await recordActivity({
      action: "email_changed",
      actor: identity,
      database,
      entityId: userId,
      entityType: "user",
      memberId: safeNextRole === "member" ? userId : null,
      summary: `${identity.displayName} changed the email for ${firstName} ${lastName}.`,
      targetUserId: userId,
    });
  }
  if (changes.roleChanged) {
    await recordActivity({
      action: "role_changed",
      actor: identity,
      database,
      entityId: userId,
      entityType: "user",
      memberId: safeNextRole === "member" ? userId : null,
      metadata: changes.roleChanged as Record<string, unknown>,
      summary: `${identity.displayName} changed ${firstName} ${lastName} to ${safeNextRole}.`,
      targetUserId: userId,
    });
  }
  if (changes.accountStatusChanged) {
    await recordActivity({
      action: "account_status_changed",
      actor: identity,
      database,
      entityId: userId,
      entityType: "user",
      memberId: safeNextRole === "member" ? userId : null,
      metadata: changes.accountStatusChanged as Record<string, unknown>,
      summary: `${identity.displayName} marked ${firstName} ${lastName} ${accountStatus}.`,
      targetUserId: userId,
    });
  }
}

async function addContent(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const memberId = text(payload.memberId, 80);
  if (!memberId) throw new Response("memberId is required.", { status: 400 });
  if (!(await memberIsVisible(identity, memberId, database))) {
    throw new Response("You do not have access to that member.", { status: 403 });
  }
  const title = text(payload.title, 160);
  const body = text(payload.body, 5000);
  const contentType = text(payload.contentType, 40) || "coach_note";
  if (!title || !body) throw new Response("Title and note are required.", { status: 400 });
  const contentId = crypto.randomUUID();
  const visibility = text(payload.visibility, 20) === "coach" ? "coach" : "member";
  await database
    .prepare(
      `INSERT INTO member_content_items (
        id, member_id, created_by, content_type, title, body, visibility,
        status, session_data_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      contentId,
      memberId,
      identity.id,
      contentType,
      title,
      body,
      visibility,
      nullableText(payload.sessionId, 120),
      JSON.stringify({ source: "staff_workspace" }),
    )
    .run();
  await recordActivity({
    action: "content_added",
    actor: identity,
    database,
    entityId: contentId,
    entityType: "content",
    memberId,
    metadata: { contentType, visibility },
    summary: `${identity.displayName} added ${title}.`,
    targetUserId: memberId,
  });
  return { contentId };
}

async function addSession(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const memberId = text(payload.memberId, 80);
  if (!memberId) throw new Response("memberId is required.", { status: 400 });
  if (!(await memberIsVisible(identity, memberId, database))) {
    throw new Response("You do not have access to that member.", { status: 403 });
  }
  const member = await getUser(database, memberId);
  if (!member || member.role !== "member") throw new Response("Member not found.", { status: 404 });
  const title = text(payload.title, 140) || "Coach-entered session";
  const date = text(payload.date, 20) || new Date().toISOString().slice(0, 10);
  const club = text(payload.club, 40) || "SW";
  const note = text(payload.note, 1000);
  const drill = text(payload.recommendedDrill, 1000);
  const sessionId = `staff-session-${crypto.randomUUID()}`;
  const shot = {
    id: `${sessionId}-shot-1`,
    club,
    carry: numberOrNull(payload.carry),
    total: numberOrNull(payload.total),
    ballSpeed: numberOrNull(payload.ballSpeed),
    clubSpeed: numberOrNull(payload.clubSpeed),
    smash: numberOrNull(payload.smash),
    launch: numberOrNull(payload.launch),
    spin: numberOrNull(payload.spin),
    offline: numberOrNull(payload.dispersion),
    shape: text(payload.shape, 40) || "NA",
  };
  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(member.id)
    .first<{ sessions_json: string }>();
  const sessions = parseJsonArray(row?.sessions_json ?? null);
  const nextSession = {
    id: sessionId,
    title,
    date,
    source: "Coach entry",
    focus: note || drill || "Coach-entered session data",
    location: "Back Nine Woodstock",
    shots: [shot],
  };
  const sanitizedSession = sanitizeSession(nextSession);
  if (!sanitizedSession) {
    throw new Response("Add a club plus at least one usable launch-monitor metric before saving this session.", { status: 400 });
  }
  const nextSessions = sanitizeSessionList([sanitizedSession, ...sessions]).slice(0, 80);
  await database
    .prepare(
      row
        ? `UPDATE golf_session_snapshots
           SET user_email = ?, display_name = ?, sessions_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`
        : `INSERT INTO golf_session_snapshots (
            user_email, user_id, display_name, sessions_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_email) DO UPDATE SET
            user_id = excluded.user_id,
            display_name = excluded.display_name,
            sessions_json = excluded.sessions_json,
            updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      ...(row
        ? [member.email, displayName(member), JSON.stringify(nextSessions), member.id]
        : [member.email, member.id, displayName(member), JSON.stringify(nextSessions)]
      ),
    )
    .run();
  await recordActivity({
    action: "session_added",
    actor: identity,
    database,
    entityId: sessionId,
    entityType: "session",
    memberId,
    metadata: { club, date },
    summary: `${identity.displayName} added ${title}.`,
    targetUserId: memberId,
  });
  if (drill) {
    await addContent(database, identity, {
      memberId,
      contentType: "drill",
      title: `${club} follow-up drill`,
      body: drill,
      sessionId,
    });
  }
  return { session: nextSession };
}

async function importSession(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const memberId = text(payload.memberId, 80);
  if (!memberId) throw new Response("memberId is required.", { status: 400 });
  if (!(await memberIsVisible(identity, memberId, database))) {
    throw new Response("You do not have access to that member.", { status: 403 });
  }
  const member = await getUser(database, memberId);
  if (!member || member.role !== "member") throw new Response("Member not found.", { status: 404 });
  const rawSession = payload.session;
  if (!rawSession || typeof rawSession !== "object" || Array.isArray(rawSession)) {
    throw new Response("A parsed session is required.", { status: 400 });
  }
  const sanitizedSession = sanitizeSession(rawSession);
  if (!sanitizedSession) {
    throw new Response("The session data did not include usable launch-monitor metrics.", { status: 400 });
  }
  const sessionId = text((sanitizedSession as { id?: unknown }).id, 120) || `coach-import-${crypto.randomUUID()}`;
  const sessionToSave = { ...sanitizedSession, id: sessionId };
  const videoId = text(payload.videoId, 80);
  if (videoId) {
    const video = await database
      .prepare(
        `SELECT
          id, member_id, coach_id, uploaded_by_role, publication_status,
          lesson_summary, worked_on, key_issue, improvement, practice_assignment,
          recommended_drill, member_facing_notes, next_session_goal
         FROM lesson_videos WHERE id = ?`,
      )
      .bind(videoId)
      .first<{
        id: string;
        member_id: string;
        coach_id: string | null;
        uploaded_by_role: string;
        publication_status: string;
        lesson_summary: string;
        worked_on: string;
        key_issue: string;
        improvement: string;
        practice_assignment: string;
        recommended_drill: string;
        member_facing_notes: string;
        next_session_goal: string;
      }>();
    if (!video) throw new Response("Video not found.", { status: 404 });
    if (video.member_id !== memberId) {
      throw new Response("Session data and video must belong to the same member.", { status: 409 });
    }
    if (identity.role === "coach" && video.coach_id !== identity.id) {
      throw new Response("Only the uploading coach can attach session data to this video.", { status: 403 });
    }
  }

  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(member.id)
    .first<{ sessions_json: string }>();
  const existingSessions = parseJsonArray(row?.sessions_json ?? null);
  const nextSessions = sanitizeSessionList([
    sessionToSave,
    ...existingSessions.filter((session) => (session as { id?: string }).id !== sessionId),
  ]).slice(0, 80);
  await database
    .prepare(
      row
        ? `UPDATE golf_session_snapshots
           SET user_email = ?, display_name = ?, sessions_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`
        : `INSERT INTO golf_session_snapshots (
            user_email, user_id, display_name, sessions_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_email) DO UPDATE SET
            user_id = excluded.user_id,
            display_name = excluded.display_name,
            sessions_json = excluded.sessions_json,
            updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      ...(row
        ? [member.email, displayName(member), JSON.stringify(nextSessions), member.id]
        : [member.email, member.id, displayName(member), JSON.stringify(nextSessions)]
      ),
    )
    .run();

  if (videoId) {
    await database
      .prepare("UPDATE lesson_videos SET session_data_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(sessionId, videoId)
      .run();
    const video = await database
      .prepare(
        `SELECT
          id, member_id, coach_id, uploaded_by_role, publication_status,
          lesson_summary, worked_on, key_issue, improvement, practice_assignment,
          recommended_drill, member_facing_notes, next_session_goal
         FROM lesson_videos WHERE id = ?`,
      )
      .bind(videoId)
      .first<{
        id: string;
        member_id: string;
        coach_id: string | null;
        uploaded_by_role: string;
        publication_status: string;
        lesson_summary: string;
        worked_on: string;
        key_issue: string;
        improvement: string;
        practice_assignment: string;
        recommended_drill: string;
        member_facing_notes: string;
        next_session_goal: string;
      }>();
    if (video) {
      await upsertLessonSessionLink({
        assignedMemberIds: await getAssignedMemberIds(identity, database),
        database,
        identity,
        isPrimary: true,
        sessionId,
        sourceType: text(payload.source, 80).toLowerCase().includes("photo")
          ? "photo_upload"
          : text(payload.source, 80).toLowerCase().includes("manual")
            ? "manual_entry"
            : text(payload.source, 80).toLowerCase().includes("csv")
              ? "csv_upload"
              : "coach_lesson_upload",
        video,
      });
    }
  }

  await recordActivity({
    action: videoId ? "lesson_session_data_imported" : "session_imported",
    actor: identity,
    database,
    entityId: sessionId,
    entityType: "session",
    memberId,
    metadata: {
      source: text(payload.source, 80) || "Coach lesson upload",
      videoId: videoId || null,
      shotCount: Array.isArray((sessionToSave as { shots?: unknown }).shots) ? (sessionToSave as { shots: unknown[] }).shots.length : 0,
    },
    summary: `${identity.displayName} imported session data for ${displayName(member)}.`,
    targetUserId: memberId,
  });

  return { session: sessionToSave, videoId: videoId || null };
}

async function reconcileCoachAssignments(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can reconcile coach assignments.", { status: 403 });
  const apply = payload.apply === true;
  const result = await database
    .prepare(
      `SELECT
         member.id AS member_id,
         member.first_name AS member_first_name,
         member.last_name AS member_last_name,
         member.email AS member_email,
         coach.id AS coach_id,
         coach.first_name AS coach_first_name,
         coach.last_name AS coach_last_name,
         coach.email AS coach_email,
         COUNT(lesson_videos.id) AS video_count,
         MIN(lesson_videos.title) AS video_title,
         MIN(lesson_videos.upload_status) AS upload_status,
         MIN(lesson_videos.publication_status) AS publication_status
       FROM lesson_videos
       JOIN users AS member ON member.id = lesson_videos.member_id
       JOIN users AS coach ON coach.id = lesson_videos.coach_id
       WHERE lesson_videos.coach_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM coach_members
           WHERE coach_members.member_id = lesson_videos.member_id
             AND coach_members.coach_id = lesson_videos.coach_id
         )
       GROUP BY member.id, coach.id
       ORDER BY member.last_name, member.first_name`,
    )
    .all<{
      member_id: string;
      member_first_name: string;
      member_last_name: string;
      member_email: string;
      coach_id: string;
      coach_first_name: string;
      coach_last_name: string;
      coach_email: string;
      video_count: number;
      video_title: string;
      upload_status: string;
      publication_status: string;
    }>();

  const existing = await database
    .prepare(
      `SELECT
         coach_members.member_id,
         coach.id AS coach_id,
         coach.first_name AS coach_first_name,
         coach.last_name AS coach_last_name,
         coach.email AS coach_email
       FROM coach_members
       JOIN users AS coach ON coach.id = coach_members.coach_id`,
    )
    .all<{
      member_id: string;
      coach_id: string;
      coach_first_name: string;
      coach_last_name: string;
      coach_email: string;
    }>();
  const candidates = buildCoachReconciliationCandidates(result.results, existing.results);

  let repaired = 0;
  if (apply) {
    for (const candidate of candidates.filter((item) => item.repairable && item.suggestedCoachId)) {
      const insert = await database
        .prepare(
          `INSERT INTO coach_members (id, coach_id, member_id, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(coach_id, member_id) DO NOTHING`,
        )
        .bind(crypto.randomUUID(), candidate.suggestedCoachId, candidate.memberId)
        .run();
      if (Number(insert.meta?.changes ?? 0) > 0) {
        repaired += 1;
        await recordActivity({
          action: "relationship_reconciled",
          actor: identity,
          database,
          entityId: `${candidate.suggestedCoachId}:${candidate.memberId}`,
          entityType: "coach_assignment",
          memberId: candidate.memberId,
          metadata: { coachId: candidate.suggestedCoachId, source: "unambiguous_video_history" },
          summary: `${identity.displayName} reconciled ${candidate.memberName}'s coach assignment.`,
          targetUserId: candidate.memberId,
        });
      }
    }
  }

  return { candidates, repaired };
}

async function deleteUser(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can delete users.", { status: 403 });
  const userId = text(payload.userId, 80);
  if (!userId) throw new Response("userId is required.", { status: 400 });
  if (userId === identity.id) {
    throw new Response("You cannot delete your own admin account while signed in.", { status: 409 });
  }

  const target = await getUser(database, userId);
  if (!target) throw new Response("User not found.", { status: 404 });
  const targetEmail = target.email.toLowerCase();

  const activeAdmins = await countRows(
    database,
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND COALESCE(account_status, 'active') <> 'inactive'",
  );
  const finalAdminGuard = finalActiveAdminChangeGuard({
    activeAdminCount: activeAdmins,
    existingAccountStatus: target.account_status,
    existingRole: target.role,
    nextAccountStatus: "inactive",
    nextRole: "member",
  });
  if (finalAdminGuard) throw new Response(finalAdminGuard.message, { status: finalAdminGuard.status });

  await ensureMaiCaddyAnalysisSchema(database);
  await ensureCoachFeedbackSchema(database);
  await ensureVideoVisualAnalysisSchema(database);

  const addStorageKey = (keys: Set<string>, value: unknown) => {
    if (typeof value !== "string") return;
    for (const key of value.split("\n").map((item) => item.trim()).filter(Boolean)) {
      keys.add(key);
    }
  };
  const storageKeys = new Set<string>();
  const ownedVideoAssets = await database
    .prepare(
      `SELECT storage_path, source_storage_path, thumbnail_storage_path
       FROM lesson_videos
       WHERE member_id = ?`,
    )
    .bind(userId)
    .all<{ storage_path: string | null; source_storage_path: string | null; thumbnail_storage_path: string | null }>();
  for (const asset of ownedVideoAssets.results ?? []) {
    addStorageKey(storageKeys, asset.storage_path);
    addStorageKey(storageKeys, asset.source_storage_path);
    addStorageKey(storageKeys, asset.thumbnail_storage_path);
  }

  const generatedAssets = await database
    .prepare(
      `SELECT audio_storage_path
       FROM video_ai_processing_jobs
       WHERE audio_storage_path IS NOT NULL
         AND (
           member_id = ? OR coach_id = ?
           OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
         )`,
    )
    .bind(userId, userId, userId)
    .all<{ audio_storage_path: string | null }>();
  for (const asset of generatedAssets.results ?? []) addStorageKey(storageKeys, asset.audio_storage_path);

  const visualAssets = await database
    .prepare(
      `SELECT storage_path, thumbnail_storage_path
       FROM video_visual_analysis_frames
       WHERE member_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR analysis_id IN (
            SELECT id FROM video_visual_analyses
            WHERE member_id = ? OR requested_by_user_id = ?
          )`,
    )
    .bind(userId, userId, userId, userId)
    .all<{ storage_path: string | null; thumbnail_storage_path: string | null }>();
  for (const asset of visualAssets.results ?? []) {
    addStorageKey(storageKeys, asset.storage_path);
    addStorageKey(storageKeys, asset.thumbnail_storage_path);
  }

  const annotationAssets = await database
    .prepare(
      `SELECT storage_path, source_storage_path
       FROM video_annotation_exports
       WHERE member_id = ? OR coach_id = ? OR requested_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    )
    .bind(userId, userId, userId, userId)
    .all<{ storage_path: string | null; source_storage_path: string | null }>();
  for (const asset of annotationAssets.results ?? []) {
    addStorageKey(storageKeys, asset.storage_path);
    addStorageKey(storageKeys, asset.source_storage_path);
  }

  const profileAssets = await database
    .prepare(
      `SELECT storage_path FROM user_profile_images WHERE user_id = ?
       UNION
       SELECT storage_path FROM coach_profile_images WHERE coach_user_id = ?`,
    )
    .bind(userId, userId)
    .all<{ storage_path: string | null }>();
  for (const asset of profileAssets.results ?? []) addStorageKey(storageKeys, asset.storage_path);

  const photoImportAssets = await optionalRows<{ source_paths_json: string | null }>(
    database,
    "SELECT source_paths_json FROM photo_import_jobs WHERE user_id = ?",
    userId,
  );
  for (const asset of photoImportAssets) {
    for (const key of parseJsonArray(asset.source_paths_json ?? null)) addStorageKey(storageKeys, key);
  }

  const bucket = getPlatformEnvironment().VIDEO_STORAGE;
  if (bucket && storageKeys.size) await bucket.delete(Array.from(storageKeys));

  await recordActivity({
    action: "user_deleted",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user",
    memberId: target.role === "member" ? userId : null,
    metadata: { deletedRole: target.role, deletedEmail: target.email, deletedStorageObjects: storageKeys.size },
    summary: `${identity.displayName} deleted ${displayName(target)} from user management.`,
    targetUserId: userId,
  });

  await optionalRun(database, "DELETE FROM photo_import_jobs WHERE user_id = ?", userId);

  await database.batch([
    database.prepare(
      `DELETE FROM video_annotation_exports
       WHERE member_id = ? OR coach_id = ? OR requested_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_annotations
       WHERE created_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR annotation_set_id IN (
            SELECT id FROM video_annotation_sets
            WHERE member_id = ? OR coach_id = ? OR created_by_user_id = ? OR published_by_user_id = ?
               OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          )`,
    ).bind(userId, userId, userId, userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_annotation_sets
       WHERE member_id = ? OR coach_id = ? OR created_by_user_id = ? OR published_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_visual_observation_reviews
       WHERE member_id = ? OR reviewed_by = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR analysis_id IN (
            SELECT id FROM video_visual_analyses
            WHERE member_id = ? OR requested_by_user_id = ?
          )`,
    ).bind(userId, userId, userId, userId, userId),
    database.prepare(
      `UPDATE video_visual_observation_reviews
       SET coach_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE coach_id = ?`,
    ).bind(userId),
    database.prepare(
      `DELETE FROM video_visual_analysis_frames
       WHERE member_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR analysis_id IN (
            SELECT id FROM video_visual_analyses
            WHERE member_id = ? OR requested_by_user_id = ?
          )`,
    ).bind(userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_visual_analyses
       WHERE member_id = ? OR requested_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId),
    database.prepare(
      `UPDATE video_visual_analyses
       SET coach_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE coach_id = ?`,
    ).bind(userId),
    database.prepare(
      `DELETE FROM video_lesson_recap_drafts
       WHERE member_id = ? OR coach_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR processing_job_id IN (
            SELECT id FROM video_ai_processing_jobs
            WHERE member_id = ? OR coach_id = ?
               OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          )`,
    ).bind(userId, userId, userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_transcripts
       WHERE member_id = ? OR coach_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          OR processing_job_id IN (
            SELECT id FROM video_ai_processing_jobs
            WHERE member_id = ? OR coach_id = ?
               OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)
          )`,
    ).bind(userId, userId, userId, userId, userId, userId),
    database.prepare(
      `DELETE FROM video_ai_processing_jobs
       WHERE member_id = ? OR coach_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId),
    database.prepare(
      `DELETE FROM coach_feedback
       WHERE golfer_id = ? OR coach_id = ?
          OR lesson_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId),
    database.prepare(
      `DELETE FROM practice_activity_results
       WHERE user_id = ?
          OR practice_activity_id IN (
            SELECT id FROM practice_activities
            WHERE user_id = ? OR generated_by = ? OR coach_id = ?
          )`,
    ).bind(userId, userId, userId, userId),
    database.prepare("DELETE FROM practice_activities WHERE user_id = ? OR generated_by = ? OR coach_id = ?").bind(userId, userId, userId),
    database.prepare("DELETE FROM mai_caddy_session_analyses WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM auth_login_tokens WHERE user_id = ? OR LOWER(email) = ?").bind(userId, targetEmail),
    database.prepare("DELETE FROM user_passwords WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM coach_members WHERE coach_id = ? OR member_id = ?").bind(userId, userId),
    database.prepare("DELETE FROM member_invitations WHERE member_id = ? OR coach_id = ?").bind(userId, userId),
    database.prepare("DELETE FROM member_content_items WHERE member_id = ? OR created_by = ?").bind(userId, userId),
    database.prepare(
      `DELETE FROM video_email_notifications
       WHERE member_id = ? OR requested_by = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId),
    database.prepare(
      `DELETE FROM video_views
       WHERE member_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId),
    database.prepare(
      `DELETE FROM lesson_session_links
       WHERE member_id = ? OR attached_by_user_id = ?
          OR video_id IN (SELECT id FROM lesson_videos WHERE member_id = ?)`,
    ).bind(userId, userId, userId),
    database.prepare("DELETE FROM lesson_videos WHERE member_id = ?").bind(userId),
    database.prepare("UPDATE lesson_videos SET coach_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE coach_id = ?").bind(userId),
    database.prepare("UPDATE lesson_session_links SET coach_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE coach_id = ?").bind(userId),
    database.prepare("DELETE FROM golf_practice_profiles WHERE user_id = ? OR LOWER(user_email) = ?").bind(userId, targetEmail),
    database.prepare("DELETE FROM golf_session_snapshots WHERE user_id = ? OR LOWER(user_email) = ?").bind(userId, targetEmail),
    database.prepare("DELETE FROM user_profile_images WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM coach_profile_images WHERE coach_user_id = ?").bind(userId),
    database.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

export async function GET(request: Request) {
  try {
    const identity = await requireStaff();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    await ensureUserDataOwnershipSchema(database);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "dashboard";
    if (view === "users") {
      const users = await listUsers(database, identity);
      const coaches = identity.role === "admin" ? await listCoaches(database) : [];
      return Response.json({ users, coaches });
    }
    if (view === "member") {
      return Response.json(await memberDetail(database, identity, url.searchParams.get("memberId") ?? ""));
    }
    if (view === "activity") {
      return Response.json({ activity: await recentActivity(database, identity, url.searchParams.get("memberId") ?? undefined) });
    }
    return Response.json(await dashboard(database, identity));
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireStaff();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    await ensureUserDataOwnershipSchema(database);
    const payload = await request.json() as Record<string, unknown>;
    const action = text(payload.action, 40);

    if (action === "createUser") {
      const result = await createUser(request, database, identity, payload);
      return Response.json({ ok: true, ...result, ...(await dashboard(database, identity)) }, { status: 201 });
    }
    if (action === "updateUser") {
      await updateUser(database, identity, payload);
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }
    if (action === "assignCoach") {
      await assignCoach(database, identity, text(payload.memberId, 80), text(payload.coachId, 80));
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }
    if (action === "removeCoachAssignment") {
      await removeCoachAssignment(database, identity, payload);
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }
    if (action === "setPassword") {
      await adminSetPassword(database, identity, payload);
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }
    if (action === "reconcileCoachAssignments") {
      const result = await reconcileCoachAssignments(database, identity, payload);
      return Response.json({ ok: true, ...result, ...(await dashboard(database, identity)) });
    }
    if (action === "addContent") {
      const result = await addContent(database, identity, payload);
      return Response.json({ ok: true, ...result });
    }
    if (action === "addSession") {
      const result = await addSession(database, identity, payload);
      return Response.json({ ok: true, ...result });
    }
    if (action === "importSession") {
      const result = await importSession(database, identity, payload);
      return Response.json({ ok: true, ...result });
    }
    if (action === "resendInvitation") {
      const user = await getUser(database, text(payload.userId, 80));
      if (!user) throw new Response("User not found.", { status: 404 });
      if (identity.role !== "admin" && !(user.role === "member" && await memberIsVisible(identity, user.id, database))) {
        throw new Response("You do not have access to that user.", { status: 403 });
      }
      const assignedCoach = user.role === "member"
        ? await database
            .prepare("SELECT coach_id FROM coach_members WHERE member_id = ? ORDER BY created_at DESC LIMIT 1")
            .bind(user.id)
            .first<{ coach_id: string }>()
        : null;
      const invite = await createAccountSetupInvitation({
        actor: identity,
        coachId: assignedCoach?.coach_id ?? null,
        request,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          invite_status: user.invite_status,
        },
      });
      await recordActivity({
        action: "invitation_resent",
        actor: identity,
        database,
        entityId: user.id,
        entityType: "invitation",
        memberId: user.role === "member" ? user.id : null,
        summary: `${identity.displayName} resent an invitation to ${displayName(user)}.`,
        targetUserId: user.id,
      });
      return Response.json({ ok: true, invite });
    }
    if (action === "copySetupLink") {
      const user = await getUser(database, text(payload.userId, 80));
      if (!user) throw new Response("User not found.", { status: 404 });
      if (identity.role !== "admin" && !(user.role === "member" && await memberIsVisible(identity, user.id, database))) {
        throw new Response("You do not have access to that user.", { status: 403 });
      }
      const assignedCoach = user.role === "member"
        ? await database
            .prepare("SELECT coach_id FROM coach_members WHERE member_id = ? ORDER BY created_at DESC LIMIT 1")
            .bind(user.id)
            .first<{ coach_id: string }>()
        : null;
      const invite = await createAccountSetupInvitation({
        actor: identity,
        coachId: assignedCoach?.coach_id ?? null,
        delivery: "link",
        request,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          invite_status: user.invite_status,
        },
      });
      await recordActivity({
        action: "setup_link_created",
        actor: identity,
        database,
        entityId: user.id,
        entityType: "invitation",
        memberId: user.role === "member" ? user.id : null,
        summary: `${identity.displayName} created a fresh setup link for ${displayName(user)}.`,
        targetUserId: user.id,
      });
      return Response.json({ ok: true, invite });
    }
    if (action === "cancelInvitation") {
      const user = await getUser(database, text(payload.userId, 80));
      if (!user) throw new Response("User not found.", { status: 404 });
      if (identity.role !== "admin" && !(user.role === "member" && await memberIsVisible(identity, user.id, database))) {
        throw new Response("You do not have access to that user.", { status: 403 });
      }
      await cancelAccountSetupInvitations(user.id);
      await recordActivity({
        action: "invitation_cancelled",
        actor: identity,
        database,
        entityId: user.id,
        entityType: "invitation",
        memberId: user.role === "member" ? user.id : null,
        summary: `${identity.displayName} cancelled the setup invitation for ${displayName(user)}.`,
        targetUserId: user.id,
      });
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }
    if (action === "deleteUser") {
      await deleteUser(database, identity, payload);
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }

    return Response.json({ error: "Unsupported admin action." }, { status: 400 });
  } catch (error) {
    return responseFromError(error);
  }
}
