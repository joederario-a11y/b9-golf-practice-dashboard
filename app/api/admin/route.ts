import { requestLoginEmail } from "@/lib/server/auth-email";
import {
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  recordActivity,
  requireIdentity,
  responseFromError,
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
  created_at: string;
  updated_at: string;
  assigned_coach_ids: string | null;
  assigned_coach_names: string | null;
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

function serializeUser(row: UserRow) {
  const coachIds = row.assigned_coach_ids?.split(",").filter(Boolean) ?? [];
  const coachNames = row.assigned_coach_names?.split(",").filter(Boolean) ?? [];
  const sessions = parseJsonArray(row.sessions_json);
  return {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedCoachIds: coachIds,
    assignedCoachId: coachIds[0] ?? "",
    assignedCoachNames: coachNames,
    assignedCoachName: coachNames[0] ?? "",
    videoCount: Number(row.video_count ?? 0),
    sessionCount: sessions.length,
    lastVideoAt: row.last_video_at,
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
      users.created_at,
      users.updated_at,
      GROUP_CONCAT(DISTINCT assigned_coach.id) AS assigned_coach_ids,
      GROUP_CONCAT(DISTINCT TRIM(assigned_coach.first_name || ' ' || assigned_coach.last_name)) AS assigned_coach_names,
      COUNT(DISTINCT lesson_videos.id) AS video_count,
      MAX(lesson_videos.created_at) AS last_video_at,
      golf_session_snapshots.sessions_json AS sessions_json
    FROM users
    LEFT JOIN coach_members ON coach_members.member_id = users.id
    LEFT JOIN users AS assigned_coach ON assigned_coach.id = coach_members.coach_id
    LEFT JOIN lesson_videos ON lesson_videos.member_id = users.id
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
        id, role, first_name, last_name, email, phone, skill_level, notes,
        COALESCE(account_status, 'active') AS account_status,
        invite_status, invited_at, last_login_at, created_at, updated_at,
        NULL AS assigned_coach_ids,
        NULL AS assigned_coach_names,
        0 AS video_count,
        NULL AS last_video_at,
        NULL AS sessions_json
      FROM users WHERE role = 'coach' ORDER BY last_name, first_name`,
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
        .prepare("SELECT COUNT(*) AS count FROM lesson_videos WHERE publication_status = 'Published' AND review_status IN ('New', 'Coach Feedback')")
        .first<{ count: number }>()
    : await database
        .prepare(
          `SELECT COUNT(*) AS count FROM lesson_videos
           WHERE publication_status = 'Published'
             AND review_status IN ('New', 'Coach Feedback')
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
  if (!(await memberIsVisible(identity, memberId, database))) {
    throw new Response("You do not have access to that member.", { status: 403 });
  }
  const users = await listUsers(database, identity);
  const member = users.find((user) => user.id === memberId);
  if (!member || member.role !== "member") throw new Response("Member not found.", { status: 404 });

  const sessionRow = await database
    .prepare("SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?")
    .bind(member.id)
    .first<{ sessions_json: string; updated_at: string }>();
  const videos = await database
    .prepare(
      `SELECT id, title, publication_status, upload_status, review_status, created_at, lesson_date, member_facing_notes
       FROM lesson_videos WHERE member_id = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(memberId)
    .all<{
      id: string;
      title: string;
      publication_status: string;
      upload_status: string;
      review_status: string;
      created_at: string;
      lesson_date: string | null;
      member_facing_notes: string;
    }>();
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
    sessions: parseJsonArray(sessionRow?.sessions_json ?? null),
    sessionsUpdatedAt: sessionRow?.updated_at ?? null,
    videos: videos.results.map((video) => ({
      id: video.id,
      title: video.title,
      publicationStatus: video.publication_status,
      uploadStatus: video.upload_status,
      reviewStatus: video.review_status,
      createdAt: video.created_at,
      lessonDate: video.lesson_date,
      memberFacingNotes: video.member_facing_notes,
    })),
    content: content.results.map(serializeContent),
    activity: await recentActivity(database, identity, memberId),
  };
}

async function createOrUpdateUser(request: Request, database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const requestedRole = text(payload.role, 20) as UserRole || "member";
  const role: UserRole = requestedRole === "admin" || requestedRole === "coach" || requestedRole === "member"
    ? requestedRole
    : "member";
  if (identity.role !== "admin" && role !== "member") {
    throw new Response("Only admins can create coach or admin accounts.", { status: 403 });
  }

  const firstName = text(payload.firstName, 80);
  const lastName = text(payload.lastName, 80);
  const email = text(payload.email, 254).toLowerCase();
  if (!firstName || !lastName || !isEmail(email)) {
    throw new Response("First name, last name, and a valid email are required.", { status: 400 });
  }
  const phone = nullableText(payload.phone, 40);
  const skillLevel = nullableText(payload.skillLevel, 80);
  const notes = nullableText(payload.notes, 2000);
  const accountStatus = text(payload.accountStatus, 20) === "inactive" ? "inactive" : "active";
  const existing = await database
    .prepare("SELECT id, email, role FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; role: UserRole }>();
  const userId = existing?.id ?? crypto.randomUUID();

  await database
    .prepare(
      `INSERT INTO users (
        id, role, first_name, last_name, email, phone, skill_level, notes,
        account_status, invite_status, invited_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET
        role = excluded.role,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        skill_level = excluded.skill_level,
        notes = excluded.notes,
        account_status = excluded.account_status,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, role, firstName, lastName, email, phone, skillLevel, notes, accountStatus, identity.id)
    .run();

  if (role === "member") {
    const coachId = identity.role === "coach" ? identity.id : text(payload.coachId, 80);
    if (coachId) await assignCoach(database, identity, userId, coachId, false);
  } else {
    await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(userId).run();
  }

  const invite = await requestLoginEmail(request, email, "/?tab=videos", {
    accountType: role === "coach" ? "coach" : "player",
    purpose: "registration",
  });
  await recordActivity({
    action: existing ? "user_updated" : "user_created",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user",
    memberId: role === "member" ? userId : null,
    summary: `${identity.displayName} ${existing ? "updated" : "created"} ${firstName} ${lastName} as ${role}.`,
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
  if (identity.role === "admin") {
    await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(memberId).run();
  }
  const assignmentId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO coach_members (id, coach_id, member_id, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(coach_id, member_id) DO NOTHING`,
    )
    .bind(assignmentId, coachId, memberId)
    .run();
  if (shouldRecord) {
    await recordActivity({
      action: "coach_assigned",
      actor: identity,
      database,
      entityId: assignmentId,
      entityType: "coach_assignment",
      memberId,
      metadata: { coachId },
      summary: `${identity.displayName} assigned ${displayName(member)} to ${displayName(coach)}.`,
      targetUserId: memberId,
    });
  }
}

async function updateUser(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  const userId = text(payload.userId, 80);
  if (!userId) throw new Response("userId is required.", { status: 400 });
  const existing = await getUser(database, userId);
  if (!existing) throw new Response("User not found.", { status: 404 });
  if (identity.role !== "admin" && !(existing.role === "member" && await memberIsVisible(identity, userId, database))) {
    throw new Response("You do not have access to that user.", { status: 403 });
  }

  const role = identity.role === "admin"
    ? (text(payload.role, 20) as UserRole || existing.role)
    : existing.role;
  const safeRole: UserRole = role === "admin" || role === "coach" || role === "member" ? role : existing.role;
  const accountStatus = identity.role === "admin"
    ? text(payload.accountStatus, 20) || existing.account_status
    : existing.account_status;
  const firstName = text(payload.firstName, 80) || existing.first_name;
  const lastName = text(payload.lastName, 80) || existing.last_name;

  await database
    .prepare(
      `UPDATE users SET
        role = ?,
        first_name = ?,
        last_name = ?,
        phone = ?,
        skill_level = ?,
        notes = ?,
        account_status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .bind(
      safeRole,
      firstName,
      lastName,
      nullableText(payload.phone, 40),
      nullableText(payload.skillLevel, 80),
      nullableText(payload.notes, 2000),
      accountStatus === "inactive" ? "inactive" : "active",
      userId,
    )
    .run();

  if (identity.role === "admin" && safeRole === "member") {
    const coachId = text(payload.coachId, 80);
    if (coachId) await assignCoach(database, identity, userId, coachId);
  }
  if (identity.role === "admin" && safeRole !== "member") {
    await database.prepare("DELETE FROM coach_members WHERE member_id = ?").bind(userId).run();
  }
  if (accountStatus === "inactive") {
    await database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId).run();
  }

  await recordActivity({
    action: "user_updated",
    actor: identity,
    database,
    entityId: userId,
    entityType: "user",
    memberId: safeRole === "member" ? userId : null,
    summary: `${identity.displayName} updated ${firstName} ${lastName}.`,
    targetUserId: userId,
  });
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
  const nextSessions = [nextSession, ...sessions].slice(0, 80);
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

async function deleteUser(database: D1Database, identity: AuthIdentity, payload: Record<string, unknown>) {
  if (identity.role !== "admin") throw new Response("Only admins can delete users.", { status: 403 });
  const userId = text(payload.userId, 80);
  const confirmEmail = text(payload.confirmEmail, 254).toLowerCase();
  const user = await getUser(database, userId);
  if (!user) throw new Response("User not found.", { status: 404 });
  if (confirmEmail !== user.email) throw new Response("Type the user's email to confirm deletion.", { status: 400 });
  if (user.role === "admin") {
    const admins = await database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first<{ count: number }>();
    if (Number(admins?.count ?? 0) <= 1) throw new Response("You cannot delete the only admin.", { status: 409 });
  }
  await recordActivity({
    action: "user_deleted",
    actor: identity,
    database,
    entityId: user.id,
    entityType: "user",
    memberId: user.role === "member" ? user.id : null,
    summary: `${identity.displayName} deleted ${displayName(user)}.`,
    targetUserId: user.id,
  });
  await database.batch([
    database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(user.id),
    database.prepare("DELETE FROM user_passwords WHERE user_id = ?").bind(user.id),
    database.prepare("DELETE FROM auth_login_tokens WHERE user_id = ? OR email = ?").bind(user.id, user.email),
    database.prepare("DELETE FROM member_invitations WHERE member_id = ? OR email_to = ?").bind(user.id, user.email),
    database.prepare("DELETE FROM coach_members WHERE coach_id = ? OR member_id = ?").bind(user.id, user.id),
    database.prepare("DELETE FROM member_content_items WHERE member_id = ? OR created_by = ?").bind(user.id, user.id),
    database.prepare("DELETE FROM golf_session_snapshots WHERE user_id = ?").bind(user.id),
    database.prepare("DELETE FROM golf_practice_profiles WHERE user_id = ?").bind(user.id),
    database.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
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
      const result = await createOrUpdateUser(request, database, identity, payload);
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
    if (action === "addContent") {
      const result = await addContent(database, identity, payload);
      return Response.json({ ok: true, ...result });
    }
    if (action === "addSession") {
      const result = await addSession(database, identity, payload);
      return Response.json({ ok: true, ...result });
    }
    if (action === "resendInvitation") {
      const user = await getUser(database, text(payload.userId, 80));
      if (!user) throw new Response("User not found.", { status: 404 });
      if (identity.role !== "admin" && !(user.role === "member" && await memberIsVisible(identity, user.id, database))) {
        throw new Response("You do not have access to that user.", { status: 403 });
      }
      const invite = await requestLoginEmail(request, user.email, "/?tab=videos", {
        accountType: user.role === "coach" ? "coach" : "player",
        purpose: "registration",
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
    if (action === "deleteUser") {
      await deleteUser(database, identity, payload);
      return Response.json({ ok: true, ...(await dashboard(database, identity)) });
    }

    return Response.json({ error: "Unsupported admin action." }, { status: 400 });
  } catch (error) {
    return responseFromError(error);
  }
}
