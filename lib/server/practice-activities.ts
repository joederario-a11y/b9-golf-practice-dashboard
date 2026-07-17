import OpenAI from "openai";

import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import {
  buildDefaultPracticeActivity,
  canAccessPracticeActivity,
  evaluatePracticeResult,
  getPracticeSourceMode,
  normalizePracticeActivityOutput,
  practiceActivityJsonSchema,
  PRACTICE_PROMPT_VERSION,
} from "@/lib/practice-activity-policy.mjs";
import {
  sanitizeSessionList,
  summarizeShotDataQuality,
} from "@/lib/session-data-policy.mjs";
import {
  ensureMaiCaddyAnalysisSchema,
  ensurePlatformSchema,
  ensureCoachFeedbackSchema,
  ensurePracticeActivitySchema,
  ensureUserDataOwnershipSchema,
  getAssignedMemberIds,
  getPlatformEnvironment,
  getRequiredDatabase,
  recordActivity,
  type AuthIdentity,
} from "@/lib/server/platform";

type ActivityType = "drill" | "challenge";
type PracticeStatus = "generated" | "in_progress" | "completed" | "results_submitted" | "cancelled" | "superseded";
type SubmissionType = "session_upload" | "csv" | "photo" | "manual" | "score" | "reflection";
type PlatformDatabase = ReturnType<typeof getRequiredDatabase>;

type PracticeActivityRow = {
  id: string;
  user_id: string;
  generated_by: string;
  activity_type: ActivityType;
  focus_area: string;
  title: string;
  reason_selected: string;
  instructions_json: string;
  club: string | null;
  duration_minutes: number | null;
  attempt_count: number | null;
  target_json: string;
  scoring_json: string;
  source_context_json: string;
  coach_id: string | null;
  coach_assignment_id: string | null;
  coach_feedback_source_id: string | null;
  related_session_id: string | null;
  status: PracticeStatus;
  model: string | null;
  prompt_version: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  result_id?: string | null;
  result_progress_status?: string | null;
  result_score?: number | null;
  result_attempts?: number | null;
  result_successful_attempts?: number | null;
  result_notes?: string | null;
  result_reflection?: string | null;
  result_evidence_json?: string | null;
  result_next_json?: string | null;
  result_created_at?: string | null;
};

type StoredSession = {
  id: string;
  title?: string;
  date?: string;
  focus?: string;
  source?: string;
  shots?: Array<Record<string, unknown>>;
};

type CoachFeedbackRow = {
  coach_id: string | null;
  coach_first_name: string | null;
  coach_last_name: string | null;
  video_id: string;
  title: string;
  lesson_summary: string;
  worked_on: string;
  key_issue: string;
  improvement: string;
  practice_assignment: string;
  recommended_drill: string;
  member_facing_notes: string;
  next_session_goal: string;
  created_at: string;
};

type StructuredCoachFeedbackRow = {
  id: string;
  golfer_id: string;
  coach_id: string;
  lesson_id: string | null;
  session_id: string | null;
  status: string;
  priority: string;
  observations_json: string;
  prescribed_drills_json: string;
  swing_feels_json: string;
  success_targets_json: string;
  raw_notes: string | null;
  created_at: string;
  coach_first_name: string | null;
  coach_last_name: string | null;
};

function text(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function safeArrayJson(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function preparePracticeDatabase(database: PlatformDatabase) {
  await ensurePlatformSchema(database);
  await ensureUserDataOwnershipSchema(database);
  await ensureMaiCaddyAnalysisSchema(database);
  await ensurePracticeActivitySchema(database);
  await ensureCoachFeedbackSchema(database);
}

function parseSessions(value: string | null | undefined): StoredSession[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return sanitizeSessionList(parsed) as StoredSession[];
  } catch {
    return [];
  }
}

function summarizeSession(session: StoredSession | undefined) {
  const shots = Array.isArray(session?.shots) ? session.shots : [];
  const clubCounts = shots.reduce<Record<string, number>>((accumulator, shot) => {
    const club = text(shot.club, 80) || "Unknown";
    accumulator[club] = (accumulator[club] ?? 0) + 1;
    return accumulator;
  }, {});
  const club = Object.entries(clubCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
  return {
    id: text(session?.id, 160),
    title: text(session?.title, 160),
    date: text(session?.date, 40),
    focus: text(session?.focus, 160),
    source: text(session?.source, 80),
    shotCount: shots.length,
    usableShotCount: shots.length,
    club,
  };
}

async function resolveTargetUser(identity: AuthIdentity, database: PlatformDatabase, requestedMemberId?: string | null) {
  const memberId = text(requestedMemberId, 120);
  if (identity.role === "member") {
    if (memberId && memberId !== identity.id) {
      throw new Response("You can only manage your own practice activities.", { status: 403 });
    }
    return identity.id;
  }
  if (identity.role === "admin") {
    return memberId || identity.id;
  }
  if (!memberId) {
    throw new Response("Choose an assigned member before opening practice activity.", { status: 400 });
  }
  const assigned = await database
    .prepare("SELECT id FROM coach_members WHERE coach_id = ? AND member_id = ?")
    .bind(identity.id, memberId)
    .first<{ id: string }>();
  if (!assigned) {
    throw new Response("You can only view practice activity for assigned members.", { status: 403 });
  }
  return memberId;
}

async function loadPracticeContext(database: PlatformDatabase, userId: string, focusArea: string) {
  const [profileRow, sessionsRow, latestAnalysisRow, structuredFeedback, coachFeedback] = await Promise.all([
    database
      .prepare("SELECT profile_json, updated_at FROM golf_practice_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ profile_json: string; updated_at: string }>(),
    database
      .prepare("SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?")
      .bind(userId)
      .first<{ sessions_json: string; updated_at: string }>(),
    database
      .prepare(
        `SELECT session_id, analysis_json, calculated_metrics_json, completed_at, model
         FROM mai_caddy_session_analyses
         WHERE user_id = ? AND is_current = 1 AND status = 'completed'
         ORDER BY completed_at DESC, created_at DESC
         LIMIT 1`,
      )
      .bind(userId)
      .first<{ session_id: string; analysis_json: string; calculated_metrics_json: string; completed_at: string; model: string | null }>(),
    database
      .prepare(
        `SELECT
          coach_feedback.*,
          coach.first_name AS coach_first_name,
          coach.last_name AS coach_last_name
         FROM coach_feedback
         LEFT JOIN users AS coach ON coach.id = coach_feedback.coach_id
         WHERE coach_feedback.golfer_id = ?
           AND coach_feedback.status = 'active'
         ORDER BY coach_feedback.created_at DESC
         LIMIT 1`,
      )
      .bind(userId)
      .first<StructuredCoachFeedbackRow>(),
    database
      .prepare(
        `SELECT
          lesson_videos.id AS video_id,
          lesson_videos.coach_id,
          coach.first_name AS coach_first_name,
          coach.last_name AS coach_last_name,
          lesson_videos.title,
          lesson_videos.lesson_summary,
          lesson_videos.worked_on,
          lesson_videos.key_issue,
          lesson_videos.improvement,
          lesson_videos.practice_assignment,
          lesson_videos.recommended_drill,
          lesson_videos.member_facing_notes,
          lesson_videos.next_session_goal,
          lesson_videos.created_at
         FROM lesson_videos
         LEFT JOIN users AS coach ON coach.id = lesson_videos.coach_id
         WHERE lesson_videos.member_id = ?
           AND lesson_videos.publication_status = 'Published'
           AND lesson_videos.upload_status = 'ready'
           AND (
             lesson_videos.practice_assignment <> ''
             OR lesson_videos.recommended_drill <> ''
             OR lesson_videos.member_facing_notes <> ''
             OR lesson_videos.lesson_summary <> ''
           )
         ORDER BY lesson_videos.created_at DESC
         LIMIT 1`,
      )
      .bind(userId)
      .first<CoachFeedbackRow>(),
  ]);
  const profile = parseJson(profileRow?.profile_json ?? "", null);
  const sessions = parseSessions(sessionsRow?.sessions_json);
  const dataQuality = summarizeShotDataQuality(sessions);
  const latestSession = sessions
    .slice()
    .sort((left, right) => Date.parse(text(right.date)) - Date.parse(text(left.date)))[0];
  const latestAnalysis = latestAnalysisRow
    ? {
        sessionId: latestAnalysisRow.session_id,
        analysis: parseJson(latestAnalysisRow.analysis_json, {}),
        calculatedMetrics: parseJson(latestAnalysisRow.calculated_metrics_json, {}),
        completedAt: latestAnalysisRow.completed_at,
        model: latestAnalysisRow.model,
      }
    : null;
  const coachName = [coachFeedback?.coach_first_name, coachFeedback?.coach_last_name].filter(Boolean).join(" ");
  const structuredCoachName = [structuredFeedback?.coach_first_name, structuredFeedback?.coach_last_name].filter(Boolean).join(" ");
  const structuredObservations = parseJson(structuredFeedback?.observations_json ?? "", []);
  const structuredDrills = parseJson(structuredFeedback?.prescribed_drills_json ?? "", []);
  const structuredSwingFeels = parseJson(structuredFeedback?.swing_feels_json ?? "", []);
  const structuredTargets = parseJson(structuredFeedback?.success_targets_json ?? "", []);
  const structuredSummary = [
    structuredFeedback?.priority,
    ...(Array.isArray(structuredObservations) ? structuredObservations : []),
    ...(Array.isArray(structuredDrills) ? structuredDrills : []),
    ...(Array.isArray(structuredTargets) ? structuredTargets : []),
  ].map((item) => text(item, 800)).find(Boolean) ?? "";
  const coachSummary = [
    coachFeedback?.practice_assignment,
    coachFeedback?.recommended_drill,
    coachFeedback?.member_facing_notes,
    coachFeedback?.lesson_summary,
  ].map((item) => text(item, 800)).find(Boolean) ?? "";

  return {
    requestedFocus: focusArea,
    profile,
    player: profile,
    sessionSummary: summarizeSession(latestSession),
    sessionCount: sessions.length,
    shotDataQuality: dataQuality,
    latestAnalysis,
    coachFeedback: structuredFeedback
      ? {
          coachId: structuredFeedback.coach_id,
          coachName: structuredCoachName,
          feedbackId: structuredFeedback.id,
          lessonId: structuredFeedback.lesson_id,
          sessionId: structuredFeedback.session_id,
          status: structuredFeedback.status,
          priority: structuredFeedback.priority,
          observations: Array.isArray(structuredObservations) ? structuredObservations : [],
          prescribedDrills: Array.isArray(structuredDrills) ? structuredDrills : [],
          swingFeels: Array.isArray(structuredSwingFeels) ? structuredSwingFeels : [],
          successTargets: Array.isArray(structuredTargets) ? structuredTargets : [],
          rawNotes: structuredFeedback.raw_notes,
          summary: structuredSummary,
          createdAt: structuredFeedback.created_at,
        }
      : coachFeedback
      ? {
          coachId: coachFeedback.coach_id,
          coachName,
          videoId: coachFeedback.video_id,
          title: coachFeedback.title,
          summary: coachSummary,
          practiceAssignment: coachFeedback.practice_assignment,
          recommendedDrill: coachFeedback.recommended_drill,
          nextSessionGoal: coachFeedback.next_session_goal,
          createdAt: coachFeedback.created_at,
          status: "active",
        }
      : null,
    sourceMode: getPracticeSourceMode({
      coachFeedback: structuredFeedback
        ? {
            coachName: structuredCoachName,
            status: structuredFeedback.status,
            summary: structuredSummary,
          }
        : coachFeedback
        ? {
            coachName,
            summary: coachSummary,
          }
        : null,
      latestAnalysis,
      player: profile,
      sessionSummary: summarizeSession(latestSession),
      shotDataQuality: dataQuality,
    }),
  };
}

async function loadLatestResultScore(database: PlatformDatabase, userId: string, focusArea: string, activityType: ActivityType) {
  const result = await database
    .prepare(
      `SELECT practice_activity_results.score
       FROM practice_activity_results
       JOIN practice_activities ON practice_activities.id = practice_activity_results.practice_activity_id
       WHERE practice_activity_results.user_id = ?
         AND practice_activities.focus_area = ?
         AND practice_activities.activity_type = ?
         AND practice_activity_results.score IS NOT NULL
       ORDER BY practice_activity_results.created_at DESC
       LIMIT 1`,
    )
    .bind(userId, focusArea, activityType)
    .first<{ score: number }>();
  return result?.score ?? null;
}

async function callOpenAIForPracticeActivity(context: Record<string, unknown>, activityType: ActivityType, model: string) {
  const runtime = getPlatformEnvironment();
  if (!runtime.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: runtime.OPENAI_API_KEY, timeout: 45000 });
  const response = await client.responses.create({
    model,
    instructions: MAI_CADDY_CORE_INSTRUCTIONS,
    input: [
      `Generate exactly one personalized ${activityType} for this golfer.`,
      "Use only the supplied application context.",
      "Prioritize coach-approved feedback when present, but do not expose coach-private notes.",
      "Do not invent session measurements, improvement, or individual professional golfer comparisons.",
      "Return strict JSON only.",
      "",
      JSON.stringify(context),
    ].join("\n"),
    text: {
      format: {
        type: "json_schema",
        name: "mai_caddy_practice_activity",
        strict: true,
        schema: practiceActivityJsonSchema,
      },
      verbosity: "medium",
    },
    max_output_tokens: 2600,
    safety_identifier: String(context.userId ?? context.requestedFocus ?? "practice"),
    store: false,
  });
  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error("MAI Coach did not return a practice activity.");
  }
  return normalizePracticeActivityOutput(JSON.parse(outputText) as unknown, activityType);
}

function activityInstructions(activity: ReturnType<typeof normalizePracticeActivityOutput>) {
  return {
    setup: activity.setup,
    instructions: activity.instructions,
    equipment: activity.equipment,
    feel: activity.feel,
    commonMistake: activity.commonMistake,
    easierVersion: activity.easierVersion,
    harderVersion: activity.harderVersion,
    resultRequest: activity.resultRequest,
    resultFields: activity.resultFields,
    nextStepLogic: activity.nextStepLogic,
    coachConnection: activity.coachConnection,
    sourceMode: activity.sourceMode,
    sourceSummary: activity.sourceSummary,
    confidence: activity.confidence,
  };
}

function serializePracticeActivity(row: PracticeActivityRow) {
  const instructions = parseJson(row.instructions_json, {});
  const resultEvidence = parseJson(row.result_evidence_json ?? "", []);
  const nextRecommendation = parseJson(row.result_next_json ?? "", {});
  return {
    id: row.id,
    userId: row.user_id,
    generatedBy: row.generated_by,
    activityType: row.activity_type,
    focusArea: row.focus_area,
    title: row.title,
    reasonSelected: row.reason_selected,
    instructions,
    club: row.club ?? "",
    durationMinutes: row.duration_minutes ?? undefined,
    attemptCount: row.attempt_count ?? undefined,
    target: parseJson(row.target_json, {}),
    scoring: parseJson(row.scoring_json, {}),
    sourceContext: parseJson(row.source_context_json, {}),
    coachId: row.coach_id ?? undefined,
    coachAssignmentId: row.coach_assignment_id ?? undefined,
    coachFeedbackSourceId: row.coach_feedback_source_id ?? undefined,
    relatedSessionId: row.related_session_id ?? undefined,
    status: row.status,
    model: row.model ?? "",
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at,
    latestResult: row.result_id
      ? {
          id: row.result_id,
          progressStatus: row.result_progress_status ?? "insufficient_data",
          score: row.result_score ?? undefined,
          attempts: row.result_attempts ?? undefined,
          successfulAttempts: row.result_successful_attempts ?? undefined,
          notes: row.result_notes ?? "",
          reflection: row.result_reflection ?? "",
          evidence: Array.isArray(resultEvidence) ? resultEvidence : [],
          nextRecommendation,
          createdAt: row.result_created_at ?? "",
        }
      : null,
  };
}

type SerializedPracticeActivity = ReturnType<typeof serializePracticeActivity>;

async function loadActivities(database: PlatformDatabase, userId: string): Promise<SerializedPracticeActivity[]> {
  const result = await database
    .prepare(
      `SELECT
        practice_activities.*,
        latest_result.id AS result_id,
        latest_result.progress_status AS result_progress_status,
        latest_result.score AS result_score,
        latest_result.attempts AS result_attempts,
        latest_result.successful_attempts AS result_successful_attempts,
        latest_result.result_notes AS result_notes,
        latest_result.user_reflection AS result_reflection,
        latest_result.progress_evidence_json AS result_evidence_json,
        latest_result.next_recommendation_json AS result_next_json,
        latest_result.created_at AS result_created_at
       FROM practice_activities
       LEFT JOIN practice_activity_results AS latest_result
         ON latest_result.id = (
           SELECT id FROM practice_activity_results
           WHERE practice_activity_id = practice_activities.id
           ORDER BY created_at DESC
           LIMIT 1
         )
       WHERE practice_activities.user_id = ?
       ORDER BY practice_activities.updated_at DESC, practice_activities.created_at DESC
       LIMIT 8`,
    )
    .bind(userId)
    .all<PracticeActivityRow>();
  return result.results.map(serializePracticeActivity);
}

async function getActivityRow(database: PlatformDatabase, activityId: string) {
  return database
    .prepare("SELECT * FROM practice_activities WHERE id = ?")
    .bind(activityId)
    .first<PracticeActivityRow>();
}

async function requireActivityAccess(identity: AuthIdentity, database: PlatformDatabase, activityId: string) {
  const activity = await getActivityRow(database, activityId);
  if (!activity) throw new Response("Practice activity not found.", { status: 404 });
  const assignedMemberIds = await getAssignedMemberIds(identity, database);
  if (!canAccessPracticeActivity(identity, activity, assignedMemberIds)) {
    throw new Response("You do not have access to this practice activity.", { status: 403 });
  }
  return activity;
}

export async function listPracticeActivities(identity: AuthIdentity, memberId?: string | null) {
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const targetUserId = await resolveTargetUser(identity, database, memberId);
  const activities = await loadActivities(database, targetUserId);
  return Response.json({
    activities,
    currentActivity: activities.find((activity) => activity.status === "generated" || activity.status === "in_progress") ?? null,
  });
}

export async function generatePracticeActivity(
  identity: AuthIdentity,
  values: {
    activityType?: unknown;
    focusArea?: unknown;
    memberId?: unknown;
    replaceReason?: unknown;
  },
) {
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const activityType: ActivityType = values.activityType === "challenge" ? "challenge" : "drill";
  const focusArea = text(values.focusArea, 80) || "Better contact";
  const targetUserId = await resolveTargetUser(identity, database, text(values.memberId, 120));
  const replaceReason = text(values.replaceReason, 180);

  const existingActive = await database
    .prepare(
      `SELECT * FROM practice_activities
       WHERE user_id = ? AND activity_type = ? AND focus_area = ?
         AND status IN ('generated', 'in_progress')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(targetUserId, activityType, focusArea)
    .first<PracticeActivityRow>();

  if (existingActive && !replaceReason) {
    return Response.json({
      activity: serializePracticeActivity(existingActive),
      reused: true,
      message: "MAI Coach already has an active activity for that focus.",
    });
  }

  if (existingActive && replaceReason) {
    await database
      .prepare("UPDATE practice_activities SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(existingActive.id)
      .run();
    await recordActivity({
      action: "practice_activity_superseded",
      actor: identity,
      database,
      entityId: existingActive.id,
      entityType: "practice_activity",
      memberId: targetUserId,
      metadata: { activityType, focusArea, replaceReason },
      summary: `Superseded ${existingActive.title}.`,
      targetUserId,
    });
  }

  const context = await loadPracticeContext(database, targetUserId, focusArea);
  const previousScore = await loadLatestResultScore(database, targetUserId, focusArea, activityType);
  const runtime = getPlatformEnvironment();
  const model = runtime.OPENAI_MODEL || "gpt-5.6-terra";
  const profileSeed =
    context.profile && typeof context.profile === "object" && "completedAt" in context.profile
      ? text((context.profile as { completedAt?: unknown }).completedAt, 80)
      : "";
  const promptContext = {
    promptVersion: PRACTICE_PROMPT_VERSION,
    userId: targetUserId,
    requestedBy: identity.id,
    requestedActivityType: activityType,
    previousScore,
    seed: [
      targetUserId,
      text(focusArea, 80),
      profileSeed,
      new Date().toISOString().slice(0, 10),
    ].join(":"),
    ...context,
    disabledFeatures: {
      tourTwin: true,
      professionalPlayerMatching: true,
      screenshotExtraction: true,
      csvExtraction: true,
    },
  };
  const generated = await callOpenAIForPracticeActivity(promptContext, activityType, model)
    ?? buildDefaultPracticeActivity({ activityType, focusArea, context: promptContext });
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO practice_activities (
        id, user_id, generated_by, activity_type, focus_area, title, reason_selected,
        instructions_json, club, duration_minutes, attempt_count, target_json,
        scoring_json, source_context_json, coach_id, coach_feedback_source_id,
        related_session_id, status, model, prompt_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      id,
      targetUserId,
      identity.id,
      generated.activityType,
      generated.focusArea,
      generated.title,
      generated.reasonSelected,
      safeJson(activityInstructions(generated)),
      generated.club,
      generated.durationMinutes,
      generated.attemptCount,
      safeJson({ successTarget: generated.successTarget }),
      safeJson(generated.scoring),
      safeJson(promptContext),
      context.coachFeedback?.coachId ?? null,
      context.coachFeedback?.feedbackId ?? context.coachFeedback?.videoId ?? null,
      context.sessionSummary.id || null,
      runtime.OPENAI_API_KEY ? model : "fallback:no-openai",
      PRACTICE_PROMPT_VERSION,
    )
    .run();
  await recordActivity({
    action: activityType === "challenge" ? "practice_challenge_generated" : "practice_drill_generated",
    actor: identity,
    database,
    entityId: id,
    entityType: "practice_activity",
    memberId: targetUserId,
    metadata: {
      activityType,
      focusArea,
      model: runtime.OPENAI_API_KEY ? model : "fallback:no-openai",
      promptVersion: PRACTICE_PROMPT_VERSION,
      coachId: context.coachFeedback?.coachId ?? null,
    },
    summary: `Generated ${generated.title}.`,
    targetUserId,
  });
  const saved = await getActivityRow(database, id);
  return Response.json({ activity: saved ? serializePracticeActivity(saved) : null, reused: false });
}

export async function updatePracticeActivity(
  identity: AuthIdentity,
  values: {
    action?: unknown;
    activityId?: unknown;
    score?: unknown;
    attempts?: unknown;
    successfulAttempts?: unknown;
    notes?: unknown;
    reflection?: unknown;
    submissionType?: unknown;
    relatedSessionId?: unknown;
    shareWithCoach?: unknown;
  },
) {
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const activityId = text(values.activityId, 120);
  if (!activityId) throw new Response("Choose a practice activity.", { status: 400 });
  const activity = await requireActivityAccess(identity, database, activityId);
  const action = text(values.action, 60);

  if (action === "start") {
    await database
      .prepare("UPDATE practice_activities SET status = 'in_progress', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(activity.id)
      .run();
    await recordActivity({
      action: "practice_activity_started",
      actor: identity,
      database,
      entityId: activity.id,
      entityType: "practice_activity",
      memberId: activity.user_id,
      metadata: { activityType: activity.activity_type, focus: activity.focus_area },
      summary: `Started ${activity.title}.`,
      targetUserId: activity.user_id,
    });
  } else if (action === "complete") {
    await database
      .prepare("UPDATE practice_activities SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(activity.id)
      .run();
    await recordActivity({
      action: "practice_activity_completed",
      actor: identity,
      database,
      entityId: activity.id,
      entityType: "practice_activity",
      memberId: activity.user_id,
      metadata: { activityType: activity.activity_type, focus: activity.focus_area },
      summary: `Completed ${activity.title}.`,
      targetUserId: activity.user_id,
    });
  } else if (action === "submit_result") {
    if (identity.role === "coach") {
      throw new Response("Coaches can view shared results but cannot submit private member results.", { status: 403 });
    }
    const previous = await database
      .prepare(
        `SELECT score FROM practice_activity_results
         WHERE practice_activity_id = ? AND score IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(activity.id)
      .first<{ score: number }>();
    const score = numberOrNull(values.score);
    const attempts = numberOrNull(values.attempts);
    const successfulAttempts = numberOrNull(values.successfulAttempts);
    const evaluation = evaluatePracticeResult({
      score,
      attempts,
      successfulAttempts,
      previousScore: previous?.score ?? null,
      notes: text(values.notes) || text(values.reflection),
    });
    const resultId = crypto.randomUUID();
    const rawSubmissionType = text(values.submissionType, 40);
    const submissionType: SubmissionType = ["session_upload", "csv", "photo", "manual", "score", "reflection"].includes(rawSubmissionType)
      ? rawSubmissionType as SubmissionType
      : score !== null ? "score" : "manual";
    await database.batch([
      database
        .prepare(
          `INSERT INTO practice_activity_results (
            id, practice_activity_id, user_id, related_session_id, submission_type,
            score, attempts, successful_attempts, metrics_json, result_notes,
            user_reflection, media_reference_json, progress_status,
            progress_evidence_json, next_recommendation_json, shared_with_coach,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
          resultId,
          activity.id,
          activity.user_id,
          text(values.relatedSessionId, 160) || null,
          submissionType,
          score,
          attempts,
          successfulAttempts,
          safeJson({}),
          text(values.notes, 2000),
          text(values.reflection, 2000),
          safeJson({}),
          evaluation.progressStatus,
          safeArrayJson(evaluation.evidence),
          safeJson({ recommendation: evaluation.nextRecommendation }),
        ),
      database
        .prepare("UPDATE practice_activities SET status = 'results_submitted', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(activity.id),
    ]);
    await recordActivity({
      action: "practice_result_submitted",
      actor: identity,
      database,
      entityId: resultId,
      entityType: "practice_activity_result",
      memberId: activity.user_id,
      metadata: {
        activityId: activity.id,
        activityType: activity.activity_type,
        focus: activity.focus_area,
        progressStatus: evaluation.progressStatus,
      },
      summary: `Submitted result for ${activity.title}.`,
      targetUserId: activity.user_id,
    });
  } else if (action === "share_with_coach") {
    if (identity.id !== activity.user_id && identity.role !== "admin") {
      throw new Response("Only the member or an admin can share results with a coach.", { status: 403 });
    }
    await database
      .prepare(
        `UPDATE practice_activity_results
         SET shared_with_coach = 1, updated_at = CURRENT_TIMESTAMP
         WHERE practice_activity_id = ? AND user_id = ?`,
      )
      .bind(activity.id, activity.user_id)
      .run();
    await recordActivity({
      action: "practice_result_shared_with_coach",
      actor: identity,
      database,
      entityId: activity.id,
      entityType: "practice_activity",
      memberId: activity.user_id,
      metadata: { activityType: activity.activity_type, focus: activity.focus_area, coachId: activity.coach_id },
      summary: `Shared results for ${activity.title} with coach.`,
      targetUserId: activity.user_id,
    });
  } else {
    throw new Response("Unsupported practice activity action.", { status: 400 });
  }

  const activities = await loadActivities(database, activity.user_id);
  return Response.json({
    activities,
    currentActivity: activities.find((item) => item.id === activity.id) ?? null,
  });
}
