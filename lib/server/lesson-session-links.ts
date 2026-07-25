import {
  canMemberManageLessonSessionLink,
  canStaffManageLessonSessionLink,
  normalizeLessonSessionAttachedByRole,
  normalizeLessonSessionSourceType,
  shouldPromptLessonRecapUpdate,
} from "@/lib/lesson-session-link-policy.mjs";
import { sanitizeSession } from "@/lib/session-data-policy.mjs";
import { recordActivity, type AuthIdentity } from "@/lib/server/platform";

type VideoLike = {
  id: string;
  member_id: string;
  coach_id: string | null;
  publication_status?: string | null;
  lesson_summary?: string | null;
  worked_on?: string | null;
  key_issue?: string | null;
  improvement?: string | null;
  practice_assignment?: string | null;
  recommended_drill?: string | null;
  member_facing_notes?: string | null;
  next_session_goal?: string | null;
};

type MemberLike = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
};

type StoredSession = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus?: string;
  location?: string;
  importMetadata?: Record<string, unknown>;
  importNotes?: string;
  shots: Array<{ club?: string; reviewStatus?: string } & Record<string, unknown>>;
};

export type LessonSessionLinkRow = {
  id: string;
  video_id: string;
  session_id: string;
  member_id: string;
  coach_id: string | null;
  attached_by_user_id: string;
  attached_by_role: string;
  source_type: string;
  review_status: string;
  is_primary: number;
  recap_update_status: string;
  created_at: string;
  updated_at: string;
  attached_first_name?: string | null;
  attached_last_name?: string | null;
  attached_email?: string | null;
};

function displayName(row: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Member";
}

function safeJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function text(value: unknown, fallback = "", maxLength = 240) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function sessionClubLabel(session?: StoredSession | null) {
  const clubs = Array.from(new Set((session?.shots ?? []).map((shot) => text(shot.club, "", 80)).filter(Boolean)));
  if (clubs.length === 1) return clubs[0];
  if (clubs.length > 1) return `${clubs.length} clubs`;
  return "Unknown Club";
}

function sessionReviewStatus(session?: StoredSession | null) {
  const metadata = session?.importMetadata && typeof session.importMetadata === "object" ? session.importMetadata : {};
  const issues = Array.isArray(metadata.blockingIssues) ? metadata.blockingIssues : [];
  if (issues.length) return "Needs review";
  if ((session?.shots ?? []).some((shot) => String(shot.reviewStatus ?? "").toLowerCase().includes("review"))) {
    return "Needs review";
  }
  return "Ready";
}

function hasCoachFeedback(video: VideoLike) {
  return [
    video.lesson_summary,
    video.worked_on,
    video.key_issue,
    video.improvement,
    video.practice_assignment,
    video.recommended_drill,
    video.member_facing_notes,
    video.next_session_goal,
  ].some((value) => Boolean(value && value.trim()));
}

export async function ensureLessonSessionLinksSchema(database: D1Database) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS lesson_session_links (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        coach_id TEXT,
        attached_by_user_id TEXT NOT NULL,
        attached_by_role TEXT NOT NULL DEFAULT 'member',
        source_type TEXT NOT NULL DEFAULT 'existing_session',
        review_status TEXT NOT NULL DEFAULT 'Ready',
        is_primary INTEGER NOT NULL DEFAULT 0,
        recap_update_status TEXT NOT NULL DEFAULT 'not_needed',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES lesson_videos(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (attached_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CHECK (attached_by_role IN ('admin', 'coach', 'member')),
        CHECK (is_primary IN (0, 1))
      )`,
    ),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS lesson_session_links_video_session_unique ON lesson_session_links(video_id, session_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_session_links_video_idx ON lesson_session_links(video_id, is_primary, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_session_links_member_idx ON lesson_session_links(member_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lesson_session_links_session_idx ON lesson_session_links(session_id)"),
    database.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS lesson_session_links_one_primary_unique
       ON lesson_session_links(video_id)
       WHERE is_primary = 1`,
    ),
    database.prepare(
      `INSERT OR IGNORE INTO lesson_session_links (
         id, video_id, session_id, member_id, coach_id, attached_by_user_id,
         attached_by_role, source_type, review_status, is_primary, recap_update_status,
         created_at, updated_at
       )
       SELECT
         'legacy-' || id || '-' || session_data_id,
         id,
         session_data_id,
         member_id,
         coach_id,
         COALESCE(coach_id, member_id),
         CASE
           WHEN coach_id IS NOT NULL THEN 'coach'
           WHEN uploaded_by_role IN ('admin', 'coach', 'member') THEN uploaded_by_role
           ELSE 'member'
         END,
         'legacy_session_link',
         'Ready',
         1,
         'not_needed',
         created_at,
         updated_at
       FROM lesson_videos
       WHERE session_data_id IS NOT NULL AND TRIM(session_data_id) <> ''`,
    ),
  ]);
}

export async function getStoredSessionsForMember(database: D1Database, memberId: string) {
  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(memberId)
    .first<{ sessions_json: string }>();
  return safeJsonArray(row?.sessions_json).filter((session): session is StoredSession => (
    Boolean(session) && typeof session === "object" && !Array.isArray(session) && typeof (session as { id?: unknown }).id === "string"
  ));
}

export async function getStoredSession(database: D1Database, memberId: string, sessionId: string) {
  const sessions = await getStoredSessionsForMember(database, memberId);
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export async function saveStoredSessionForMember(database: D1Database, member: MemberLike, session: unknown) {
  const sanitized = sanitizeSession(session);
  if (!sanitized) {
    throw new Response("The session data did not include usable launch-monitor metrics.", { status: 400 });
  }
  const sessionToSave = sanitized as StoredSession;
  const sessions = await getStoredSessionsForMember(database, member.id);
  const nextSessions = [
    sessionToSave,
    ...sessions.filter((existing) => existing.id !== sessionToSave.id),
  ].slice(0, 80);
  const existing = await database
    .prepare("SELECT user_id FROM golf_session_snapshots WHERE user_id = ?")
    .bind(member.id)
    .first<{ user_id: string }>();
  if (existing) {
    await database
      .prepare(
        `UPDATE golf_session_snapshots
         SET user_email = ?, display_name = ?, sessions_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
      )
      .bind(member.email, displayName(member), JSON.stringify(nextSessions), member.id)
      .run();
  } else {
    await database
      .prepare(
        `INSERT INTO golf_session_snapshots (
          user_email, user_id, display_name, sessions_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_email) DO UPDATE SET
          user_id = excluded.user_id,
          display_name = excluded.display_name,
          sessions_json = excluded.sessions_json,
          updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(member.email, member.id, displayName(member), JSON.stringify(nextSessions))
      .run();
  }
  return sessionToSave;
}

export async function loadLessonSessionLinksForVideos(database: D1Database, videoIds: string[]) {
  await ensureLessonSessionLinksSchema(database);
  const uniqueVideoIds = Array.from(new Set(videoIds.filter(Boolean)));
  const empty = new Map<string, ReturnType<typeof serializeLessonSessionLink>[]>();
  if (!uniqueVideoIds.length) return empty;
  const placeholders = uniqueVideoIds.map(() => "?").join(",");
  const rows = await database
    .prepare(
      `SELECT
        links.*,
        attached.first_name AS attached_first_name,
        attached.last_name AS attached_last_name,
        attached.email AS attached_email
       FROM lesson_session_links AS links
       LEFT JOIN users AS attached ON attached.id = links.attached_by_user_id
       WHERE links.video_id IN (${placeholders})
       ORDER BY links.is_primary DESC, links.created_at DESC`,
    )
    .bind(...uniqueVideoIds)
    .all<LessonSessionLinkRow>();
  const memberIds = Array.from(new Set(rows.results.map((row) => row.member_id)));
  const sessionsByMember = new Map<string, StoredSession[]>();
  await Promise.all(memberIds.map(async (memberId) => {
    sessionsByMember.set(memberId, await getStoredSessionsForMember(database, memberId));
  }));
  const linksByVideo = new Map<string, ReturnType<typeof serializeLessonSessionLink>[]>();
  for (const row of rows.results) {
    const session = sessionsByMember.get(row.member_id)?.find((item) => item.id === row.session_id) ?? null;
    const serialized = serializeLessonSessionLink(row, session);
    linksByVideo.set(row.video_id, [...(linksByVideo.get(row.video_id) ?? []), serialized]);
  }
  return linksByVideo;
}

export function serializeLessonSessionLink(row: LessonSessionLinkRow, session?: StoredSession | null) {
  return {
    id: row.id,
    videoId: row.video_id,
    sessionId: row.session_id,
    memberId: row.member_id,
    coachId: row.coach_id ?? undefined,
    attachedByUserId: row.attached_by_user_id,
    attachedByRole: normalizeLessonSessionAttachedByRole(row.attached_by_role),
    attachedByName: displayName({
      first_name: row.attached_first_name,
      last_name: row.attached_last_name,
      email: row.attached_email,
    }),
    sourceType: normalizeLessonSessionSourceType(row.source_type),
    reviewStatus: row.review_status || sessionReviewStatus(session),
    isPrimary: Boolean(row.is_primary),
    recapUpdateStatus: row.recap_update_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    session: session ? {
      id: session.id,
      title: session.title,
      date: session.date,
      source: session.source,
      clubLabel: sessionClubLabel(session),
      shotCount: Array.isArray(session.shots) ? session.shots.length : 0,
      reviewStatus: sessionReviewStatus(session),
    } : {
      id: row.session_id,
      title: "Linked session",
      date: "",
      source: "Session data",
      clubLabel: "Unknown Club",
      shotCount: 0,
      reviewStatus: row.review_status || "Ready",
    },
  };
}

export async function assertLessonSessionAuthorization(values: {
  action: "link" | "remove" | "primary";
  assignedMemberIds: string[];
  database: D1Database;
  identity: AuthIdentity;
  link?: LessonSessionLinkRow | null;
  video: VideoLike;
}) {
  const { action, assignedMemberIds, identity, link, video } = values;
  if (identity.role === "admin") return;
  if (identity.role === "coach") {
    if (!canStaffManageLessonSessionLink(identity, video.member_id, assignedMemberIds)) {
      throw new Response("You can only attach session data for assigned students.", { status: 403 });
    }
    return;
  }
  if (identity.role === "member" && identity.id === video.member_id) {
    if (action === "remove" && link && !canMemberManageLessonSessionLink(identity, {
      attachedByUserId: link.attached_by_user_id,
      memberId: link.member_id,
    })) {
      throw new Response("You can only remove session data that you attached.", { status: 403 });
    }
    if (action === "primary" && link && !canMemberManageLessonSessionLink(identity, {
      attachedByUserId: link.attached_by_user_id,
      memberId: link.member_id,
    })) {
      throw new Response("You can only mark your own attached session as primary.", { status: 403 });
    }
    return;
  }
  throw new Response("You do not have access to this lesson session data.", { status: 403 });
}

export async function upsertLessonSessionLink(values: {
  assignedMemberIds: string[];
  database: D1Database;
  identity: AuthIdentity;
  isPrimary?: boolean;
  sessionId: string;
  sourceType?: string;
  video: VideoLike;
}) {
  const { database, identity, video } = values;
  const sessionId = text(values.sessionId, "", 180);
  if (!sessionId) throw new Response("sessionId is required.", { status: 400 });
  await ensureLessonSessionLinksSchema(database);
  await assertLessonSessionAuthorization({ ...values, action: "link" });
  const session = await getStoredSession(database, video.member_id, sessionId);
  if (!session) throw new Response("Session not found for this student.", { status: 404 });

  const existing = await database
    .prepare("SELECT * FROM lesson_session_links WHERE video_id = ? AND session_id = ?")
    .bind(video.id, sessionId)
    .first<LessonSessionLinkRow>();
  const linkCountRow = await database
    .prepare("SELECT COUNT(*) AS count FROM lesson_session_links WHERE video_id = ?")
    .bind(video.id)
    .first<{ count: number }>();
  const makePrimary = values.isPrimary === true || Number(linkCountRow?.count ?? 0) === 0;
  if (makePrimary) {
    await database.prepare("UPDATE lesson_session_links SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE video_id = ?").bind(video.id).run();
  }
  const recapUpdateStatus = shouldPromptLessonRecapUpdate({
    hasApprovedFeedback: hasCoachFeedback(video),
    hasCurrentRecap: hasCoachFeedback(video),
    newLinkCreated: !existing,
    publicationStatus: video.publication_status,
  }) ? "pending" : "not_needed";
  const linkId = existing?.id ?? crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO lesson_session_links (
        id, video_id, session_id, member_id, coach_id, attached_by_user_id,
        attached_by_role, source_type, review_status, is_primary, recap_update_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id, session_id) DO UPDATE SET
        review_status = excluded.review_status,
        is_primary = CASE WHEN excluded.is_primary = 1 THEN 1 ELSE lesson_session_links.is_primary END,
        recap_update_status = CASE
          WHEN lesson_session_links.recap_update_status = 'not_needed' THEN excluded.recap_update_status
          ELSE lesson_session_links.recap_update_status
        END,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      linkId,
      video.id,
      sessionId,
      video.member_id,
      video.coach_id,
      identity.id,
      normalizeLessonSessionAttachedByRole(identity.role),
      normalizeLessonSessionSourceType(values.sourceType),
      sessionReviewStatus(session),
      makePrimary ? 1 : 0,
      recapUpdateStatus,
    )
    .run();
  if (makePrimary || !existing) {
    await database.prepare("UPDATE lesson_videos SET session_data_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sessionId, video.id).run();
  }
  if (!existing) {
    await recordActivity({
      action: identity.role === "member" ? "student_attached_lesson_session" : "lesson_session_linked",
      actor: identity,
      database,
      entityId: linkId,
      entityType: "lesson_session_link",
      memberId: video.member_id,
      metadata: {
        coachId: video.coach_id,
        sessionId,
        sourceType: normalizeLessonSessionSourceType(values.sourceType),
        videoId: video.id,
      },
      summary: identity.role === "member"
        ? `${identity.displayName} added session data to a lesson.`
        : `${identity.displayName} linked session data to a lesson.`,
      targetUserId: identity.role === "member" ? video.coach_id ?? video.member_id : video.member_id,
    });
  }
  const links = await loadLessonSessionLinksForVideos(database, [video.id]);
  return {
    created: !existing,
    links: links.get(video.id) ?? [],
    recapUpdateRecommended: recapUpdateStatus === "pending",
  };
}

export async function removeLessonSessionLink(values: {
  assignedMemberIds: string[];
  database: D1Database;
  identity: AuthIdentity;
  linkId: string;
  video: VideoLike;
}) {
  const { database, linkId, video } = values;
  await ensureLessonSessionLinksSchema(database);
  const link = await database
    .prepare("SELECT * FROM lesson_session_links WHERE id = ? AND video_id = ?")
    .bind(linkId, video.id)
    .first<LessonSessionLinkRow>();
  if (!link) throw new Response("Session link not found.", { status: 404 });
  await assertLessonSessionAuthorization({ ...values, action: "remove", link });
  await database.prepare("DELETE FROM lesson_session_links WHERE id = ?").bind(linkId).run();
  if (link.is_primary) {
    const next = await database
      .prepare("SELECT * FROM lesson_session_links WHERE video_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(video.id)
      .first<LessonSessionLinkRow>();
    if (next) {
      await database.prepare("UPDATE lesson_session_links SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.id).run();
      await database.prepare("UPDATE lesson_videos SET session_data_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.session_id, video.id).run();
    } else {
      await database.prepare("UPDATE lesson_videos SET session_data_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(video.id).run();
    }
  }
  await recordActivity({
    action: "lesson_session_unlinked",
    actor: values.identity,
    database,
    entityId: linkId,
    entityType: "lesson_session_link",
    memberId: video.member_id,
    metadata: { sessionId: link.session_id, videoId: video.id },
    summary: `${values.identity.displayName} removed session data from a lesson.`,
    targetUserId: video.member_id,
  });
  const links = await loadLessonSessionLinksForVideos(database, [video.id]);
  return { links: links.get(video.id) ?? [] };
}

export async function setPrimaryLessonSessionLink(values: {
  assignedMemberIds: string[];
  database: D1Database;
  identity: AuthIdentity;
  linkId: string;
  video: VideoLike;
}) {
  const { database, linkId, video } = values;
  await ensureLessonSessionLinksSchema(database);
  const link = await database
    .prepare("SELECT * FROM lesson_session_links WHERE id = ? AND video_id = ?")
    .bind(linkId, video.id)
    .first<LessonSessionLinkRow>();
  if (!link) throw new Response("Session link not found.", { status: 404 });
  await assertLessonSessionAuthorization({ ...values, action: "primary", link });
  await database.batch([
    database.prepare("UPDATE lesson_session_links SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE video_id = ?").bind(video.id),
    database.prepare("UPDATE lesson_session_links SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(linkId),
    database.prepare("UPDATE lesson_videos SET session_data_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(link.session_id, video.id),
  ]);
  const links = await loadLessonSessionLinksForVideos(database, [video.id]);
  return { links: links.get(video.id) ?? [] };
}
