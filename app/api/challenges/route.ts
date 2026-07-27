import {
  ensureChallengeSchema,
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  getAssignedMemberIds,
  getRequiredDatabase,
  recordActivity,
  requireIdentity,
  responseFromError,
  type AuthIdentity,
} from "@/lib/server/platform";
import { sanitizeSessionList } from "@/lib/session-data-policy.mjs";
import {
  evaluateChallengeAttempt,
  SEVEN_IRON_PRECISION_TEMPLATE,
} from "@/lib/challenge-policy.mjs";

type PlatformDatabase = ReturnType<typeof getRequiredDatabase>;

type SessionRow = {
  sessions_json: string;
};

type ChallengeRow = {
  id: string;
  member_id: string;
  template_id: string;
  source: string;
  status: string;
  current_success_count: number;
  required_success_count: number;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type ChallengeAttemptRow = {
  id: string;
  member_challenge_id: string;
  session_id: string | null;
  shot_ids_json: string;
  result_json: string;
  started_at: string;
  completed_at: string | null;
};

function text(value: unknown, maxLength = 180) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : "";
}

function parseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

async function resolveTargetMember(identity: AuthIdentity, database: PlatformDatabase, requestedMemberId: string) {
  if (identity.role === "member") {
    if (requestedMemberId && requestedMemberId !== identity.id) {
      throw new Response("You can only view your own challenges.", { status: 403 });
    }
    return identity.id;
  }
  if (identity.role === "admin") return requestedMemberId || identity.id;
  if (!requestedMemberId) {
    throw new Response("Choose an assigned member before viewing challenges.", { status: 400 });
  }
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  if (!assignedMemberIds.includes(requestedMemberId)) {
    throw new Response("You can only view challenges for assigned members.", { status: 403 });
  }
  return requestedMemberId;
}

async function prepareChallengeDatabase(database: PlatformDatabase) {
  await ensurePlatformSchema(database);
  await ensureUserDataOwnershipSchema(database);
  await ensureChallengeSchema(database);
}

async function loadSessions(database: PlatformDatabase, memberId: string) {
  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(memberId)
    .first<SessionRow>();
  return sanitizeSessionList(parseJson(row?.sessions_json, []));
}

function latestSevenIronSession(sessions: Array<Record<string, unknown>>) {
  return sessions
    .filter((session) => Array.isArray(session.shots) && session.shots.some((shot) => {
      const club = text((shot as Record<string, unknown>).club).toLowerCase().replace(/[\s_-]+/g, "");
      return club === "7iron";
    }))
    .sort((left, right) => new Date(text(right.date)).getTime() - new Date(text(left.date)).getTime())[0] ?? null;
}

function serializeChallenge(row: ChallengeRow | null) {
  if (!row) return null;
  return {
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    currentSuccessCount: row.current_success_count,
    id: row.id,
    memberId: row.member_id,
    requiredSuccessCount: row.required_success_count,
    source: row.source,
    startedAt: row.started_at,
    status: row.status,
    templateId: row.template_id,
    updatedAt: row.updated_at,
  };
}

function serializeAttempt(row: ChallengeAttemptRow | null) {
  if (!row) return null;
  return {
    completedAt: row.completed_at,
    id: row.id,
    memberChallengeId: row.member_challenge_id,
    result: parseJson(row.result_json, {}),
    sessionId: row.session_id,
    shotIds: parseJson(row.shot_ids_json, []),
    startedAt: row.started_at,
  };
}

async function getCurrentChallenge(database: PlatformDatabase, memberId: string) {
  return database
    .prepare(
      `SELECT *
       FROM member_challenges
       WHERE member_id = ? AND template_id = ?
       ORDER BY
         CASE status
           WHEN 'active' THEN 0
           WHEN 'assigned' THEN 1
           WHEN 'completed' THEN 2
           ELSE 3
         END,
         assigned_at DESC
       LIMIT 1`,
    )
    .bind(memberId, SEVEN_IRON_PRECISION_TEMPLATE.id)
    .first<ChallengeRow>();
}

async function getLatestAttempt(database: PlatformDatabase, challengeId: string) {
  return database
    .prepare(
      `SELECT *
       FROM challenge_attempts
       WHERE member_challenge_id = ?
       ORDER BY completed_at DESC, started_at DESC
       LIMIT 1`,
    )
    .bind(challengeId)
    .first<ChallengeAttemptRow>();
}

async function createChallengeIfNeeded(database: PlatformDatabase, memberId: string) {
  const existing = await getCurrentChallenge(database, memberId);
  if (existing) return existing;
  const challengeId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO member_challenges (
        id, member_id, template_id, source, status, current_success_count,
        required_success_count, assigned_at, updated_at
      ) VALUES (?, ?, ?, 'mai', 'assigned', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      challengeId,
      memberId,
      SEVEN_IRON_PRECISION_TEMPLATE.id,
      SEVEN_IRON_PRECISION_TEMPLATE.successShotCount,
    )
    .run();
  return getCurrentChallenge(database, memberId);
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await prepareChallengeDatabase(database);
    const url = new URL(request.url);
    const memberId = await resolveTargetMember(identity, database, text(url.searchParams.get("memberId"), 120));
    const challenge = await getCurrentChallenge(database, memberId);
    const attempt = challenge ? await getLatestAttempt(database, challenge.id) : null;
    return Response.json({
      attempt: serializeAttempt(attempt),
      challenge: serializeChallenge(challenge),
      template: SEVEN_IRON_PRECISION_TEMPLATE,
    });
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
    const database = getRequiredDatabase();
    await prepareChallengeDatabase(database);
    const memberId = await resolveTargetMember(identity, database, text(payload.memberId, 120));
    const sessions = await loadSessions(database, memberId);
    const requestedSessionId = text(payload.sessionId, 180);
    const session = requestedSessionId
      ? sessions.find((item) => item.id === requestedSessionId)
      : latestSevenIronSession(sessions as Array<Record<string, unknown>>);
    if (!session) {
      return Response.json({ error: "No measured 7-Iron session was found for this challenge." }, { status: 404 });
    }

    const challenge = await createChallengeIfNeeded(database, memberId);
    if (!challenge) {
      return Response.json({ error: "Challenge could not be created." }, { status: 500 });
    }

    const startedAt = new Date().toISOString();
    const completedAt = startedAt;
    const attempt = evaluateChallengeAttempt({
      completedAt,
      session,
      startedAt,
      template: SEVEN_IRON_PRECISION_TEMPLATE,
    });
    const attemptId = crypto.randomUUID();
    await database.batch([
      database
        .prepare(
          `INSERT INTO challenge_attempts (
            id, member_challenge_id, session_id, shot_ids_json, result_json,
            started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(attemptId, challenge.id, session.id, attempt.shotIdsJson, attempt.resultJson, startedAt, completedAt),
      database
        .prepare(
          `UPDATE member_challenges
           SET status = ?,
               current_success_count = ?,
               required_success_count = ?,
               started_at = COALESCE(started_at, ?),
               completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          attempt.status,
          attempt.currentSuccessCount,
          attempt.requiredSuccessCount,
          startedAt,
          attempt.status,
          completedAt,
          challenge.id,
        ),
    ]);
    await recordActivity({
      action: "challenge_attempt_scored",
      actor: identity,
      database,
      entityId: challenge.id,
      entityType: "member_challenge",
      memberId,
      metadata: {
        currentSuccessCount: attempt.currentSuccessCount,
        requiredSuccessCount: attempt.requiredSuccessCount,
        sessionId: session.id,
        templateId: SEVEN_IRON_PRECISION_TEMPLATE.id,
      },
      summary: `${SEVEN_IRON_PRECISION_TEMPLATE.title} scored from measured session data.`,
      targetUserId: memberId,
    });

    const updatedChallenge = await getCurrentChallenge(database, memberId);
    const latestAttempt = await getLatestAttempt(database, challenge.id);
    return Response.json({
      attempt: serializeAttempt(latestAttempt),
      challenge: serializeChallenge(updatedChallenge),
      template: SEVEN_IRON_PRECISION_TEMPLATE,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
