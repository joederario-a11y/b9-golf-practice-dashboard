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
  parseChallengeCriteria,
  sessionHasEligibleChallengeShots,
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
  status?: string;
  shot_ids_json: string;
  result_json: string;
  started_at: string;
  completed_at: string | null;
  evaluated_at?: string | null;
  updated_at?: string;
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

function isoNow() {
  return new Date().toISOString();
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
  return sanitizeSessionList(parseJson(row?.sessions_json, [])) as Array<Record<string, unknown>>;
}

function serializeEligibleSession(session: Record<string, unknown>) {
  const attempt = evaluateChallengeAttempt({
    session,
    template: SEVEN_IRON_PRECISION_TEMPLATE,
  });
  const result = attempt.result;
  return {
    date: text(session.date),
    id: text(session.id),
    measuredShotCount: result.measuredShotCount,
    qualifiedShotCount: result.currentSuccessCount,
    sessionSource: text(session.source),
    title: text(session.title, 120) || "Untitled session",
    totalAttemptedShotCount: result.totalAttemptedShotCount,
  };
}

function listEligibleSessions(sessions: Array<Record<string, unknown>>) {
  return sessions
    .filter((session) => sessionHasEligibleChallengeShots(session, SEVEN_IRON_PRECISION_TEMPLATE))
    .map(serializeEligibleSession)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function initialAttemptResult(sessionId: string | null, startedAt: string) {
  const criteria = parseChallengeCriteria(SEVEN_IRON_PRECISION_TEMPLATE.criteriaJson);
  return {
    averageQualifyingCarry: null,
    averageQualifyingOffline: null,
    biggestWin: "No measured shot has qualified yet.",
    challengeType: SEVEN_IRON_PRECISION_TEMPLATE.challengeType,
    club: SEVEN_IRON_PRECISION_TEMPLATE.club,
    completedAt: null,
    criteria,
    currentSuccessCount: 0,
    evaluatedAt: null,
    evaluatedShotIds: [],
    measuredShotCount: 0,
    nextStep: "Repeat this challenge once more before narrowing the target window.",
    qualifiedShotIds: [],
    requiredShotCount: SEVEN_IRON_PRECISION_TEMPLATE.requiredShotCount,
    requiredSuccessCount: SEVEN_IRON_PRECISION_TEMPLATE.successShotCount,
    sessionId,
    shotResults: [],
    startedAt,
    status: "active",
    totalAttemptedShotCount: 0,
    totalClubShots: 0,
    unavailableShotCount: 0,
    unqualifiedMeasuredShotCount: 0,
  };
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
    evaluatedAt: row.evaluated_at ?? null,
    id: row.id,
    memberChallengeId: row.member_challenge_id,
    result: parseJson(row.result_json, {}),
    sessionId: row.session_id,
    shotIds: parseJson(row.shot_ids_json, []),
    startedAt: row.started_at,
    status: row.status ?? (row.completed_at ? "completed" : "active"),
    updatedAt: row.updated_at,
  };
}

async function getChallengeById(database: PlatformDatabase, challengeId: string) {
  if (!challengeId) return null;
  return database
    .prepare("SELECT * FROM member_challenges WHERE id = ? LIMIT 1")
    .bind(challengeId)
    .first<ChallengeRow>();
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
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         COALESCE(completed_at, started_at) DESC
       LIMIT 1`,
    )
    .bind(challengeId)
    .first<ChallengeAttemptRow>();
}

async function getOpenAttempt(database: PlatformDatabase, challengeId: string) {
  return database
    .prepare(
      `SELECT *
       FROM challenge_attempts
       WHERE member_challenge_id = ? AND status = 'active' AND completed_at IS NULL
       ORDER BY started_at DESC
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

async function startChallenge(database: PlatformDatabase, challenge: ChallengeRow) {
  if (challenge.status === "completed") return getLatestAttempt(database, challenge.id);
  const startedAt = challenge.started_at ?? isoNow();
  await database
    .prepare(
      `UPDATE member_challenges
       SET status = 'active',
           started_at = COALESCE(started_at, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('assigned', 'active')`,
    )
    .bind(startedAt, challenge.id)
    .run();

  const openAttempt = await getOpenAttempt(database, challenge.id);
  if (openAttempt) return openAttempt;

  const attemptId = crypto.randomUUID();
  const resultJson = JSON.stringify(initialAttemptResult(null, startedAt));
  await database
    .prepare(
      `INSERT OR IGNORE INTO challenge_attempts (
        id, member_challenge_id, session_id, status, shot_ids_json, result_json,
        started_at, completed_at, evaluated_at, updated_at
      ) VALUES (?, ?, NULL, 'active', '[]', ?, ?, NULL, NULL, CURRENT_TIMESTAMP)`,
    )
    .bind(attemptId, challenge.id, resultJson, startedAt)
    .run();
  return getOpenAttempt(database, challenge.id) ?? getLatestAttempt(database, challenge.id);
}

async function recordChallengeCompletedOnce({
  challenge,
  database,
  identity,
  result,
}: {
  challenge: ChallengeRow;
  database: PlatformDatabase;
  identity: AuthIdentity;
  result: Record<string, unknown>;
}) {
  const existing = await database
    .prepare(
      `SELECT id
       FROM member_activity_log
       WHERE action = 'challenge_completed'
         AND entity_type = 'member_challenge'
         AND entity_id = ?
       LIMIT 1`,
    )
    .bind(challenge.id)
    .first<{ id: string }>();
  if (existing) return;
  await recordActivity({
    action: "challenge_completed",
    actor: identity,
    database,
    entityId: challenge.id,
    entityType: "member_challenge",
    memberId: challenge.member_id,
    metadata: {
      currentSuccessCount: result.currentSuccessCount,
      requiredSuccessCount: result.requiredSuccessCount,
      sessionId: result.sessionId,
      templateId: SEVEN_IRON_PRECISION_TEMPLATE.id,
      totalAttemptedShotCount: result.totalAttemptedShotCount,
    },
    summary: `${SEVEN_IRON_PRECISION_TEMPLATE.title} completed from measured session data.`,
    targetUserId: challenge.member_id,
  });
}

async function buildState(database: PlatformDatabase, challenge: ChallengeRow | null, memberId: string) {
  const sessions = await loadSessions(database, memberId);
  const attempt = challenge ? await getLatestAttempt(database, challenge.id) : null;
  return {
    attempt: serializeAttempt(attempt),
    challenge: serializeChallenge(challenge),
    eligibleSessions: listEligibleSessions(sessions),
    template: SEVEN_IRON_PRECISION_TEMPLATE,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const database = getRequiredDatabase();
    await prepareChallengeDatabase(database);
    const url = new URL(request.url);
    const requestedChallengeId = text(url.searchParams.get("challengeId"), 120);
    const existingChallenge = requestedChallengeId ? await getChallengeById(database, requestedChallengeId) : null;
    if (requestedChallengeId && !existingChallenge) {
      return Response.json({ error: "Challenge was not found." }, { status: 404 });
    }
    const memberId = await resolveTargetMember(
      identity,
      database,
      existingChallenge?.member_id ?? text(url.searchParams.get("memberId"), 120),
    );
    const challenge = existingChallenge ?? await getCurrentChallenge(database, memberId);
    return Response.json(await buildState(database, challenge, memberId));
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
    const action = text(payload.action, 40) || (payload.sessionId ? "link_session" : "start");
    const requestedChallenge = await getChallengeById(database, text(payload.challengeId, 120));
    const memberId = await resolveTargetMember(
      identity,
      database,
      requestedChallenge?.member_id ?? text(payload.memberId, 120),
    );
    const challenge = requestedChallenge ?? await createChallengeIfNeeded(database, memberId);
    if (!challenge) {
      return Response.json({ error: "Challenge could not be created." }, { status: 500 });
    }

    if (action === "start" || action === "continue") {
      await startChallenge(database, challenge);
      const updatedChallenge = await getChallengeById(database, challenge.id);
      return Response.json(await buildState(database, updatedChallenge, memberId));
    }

    if (action !== "link_session" && action !== "evaluate") {
      return Response.json({ error: "Unsupported challenge action." }, { status: 400 });
    }

    const sessions = await loadSessions(database, memberId);
    const requestedSessionId = text(payload.sessionId, 180);
    const session = sessions.find((item) => text(item.id) === requestedSessionId);
    if (!session) {
      return Response.json({ error: "Choose one of your saved sessions before scoring this challenge." }, { status: 404 });
    }
    if (!sessionHasEligibleChallengeShots(session, SEVEN_IRON_PRECISION_TEMPLATE)) {
      return Response.json({
        error: "That session does not include measured 7-Iron carry and offline data for this challenge.",
      }, { status: 422 });
    }

    const openOrLatestAttempt = await startChallenge(database, challenge);
    if (!openOrLatestAttempt) {
      return Response.json({ error: "Challenge attempt could not be started." }, { status: 500 });
    }
    const startedAt = openOrLatestAttempt.started_at ?? isoNow();
    const evaluatedAt = isoNow();
    const scored = evaluateChallengeAttempt({
      completedAt: evaluatedAt,
      session,
      startedAt,
      template: SEVEN_IRON_PRECISION_TEMPLATE,
    });
    const completedAt = scored.status === "completed" ? evaluatedAt : null;
    await database.batch([
      database
        .prepare(
          `UPDATE challenge_attempts
           SET session_id = ?,
               status = ?,
               shot_ids_json = ?,
               result_json = ?,
               evaluated_at = ?,
               completed_at = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          text(session.id),
          scored.status === "completed" ? "completed" : "active",
          scored.shotIdsJson,
          scored.resultJson,
          evaluatedAt,
          completedAt,
          openOrLatestAttempt.id,
        ),
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
          scored.status,
          scored.currentSuccessCount,
          scored.requiredSuccessCount,
          startedAt,
          scored.status,
          completedAt,
          challenge.id,
        ),
    ]);

    const updatedChallenge = await getChallengeById(database, challenge.id);
    if (updatedChallenge && scored.status === "completed") {
      await recordChallengeCompletedOnce({
        challenge: updatedChallenge,
        database,
        identity,
        result: scored.result as Record<string, unknown>,
      });
    }

    return Response.json(await buildState(database, updatedChallenge, memberId));
  } catch (error) {
    return responseFromError(error);
  }
}
