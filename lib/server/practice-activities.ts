import OpenAI from "openai";

import {
  coachMatchesActiveContext,
  getActiveCoachContext,
} from "@/lib/coach-relationship-policy.mjs";
import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import { sanitizePracticeProfileForIdentity } from "@/lib/practice-profile-ownership-policy.mjs";
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
  buildStudentPracticePreview,
  normalizeCoachBuilderList,
  normalizeCoachBuilderValue,
  parseCoachPracticeVolume,
} from "@/lib/coach-practice-builder-policy.mjs";
import {
  applyCoachTrainingAidAction,
  buildTrainingAidRecommendation,
  visibleTrainingAidRecommendation,
} from "@/lib/training-aid-policy.mjs";
import {
  buildPracticeCompletionIntelligence,
  buildPracticeProgress,
  coachReviewStatusForOutcome,
  evaluatePracticeOutcome,
  mapOutcomeToProgressStatus,
  nextActionVisibility,
  normalizePracticeAssignment,
  practiceEventActionForOutcome,
} from "@/lib/practice-completion-policy.mjs";
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
  getOpenAIConfigurationIssue,
  getPlatformEnvironment,
  getRequiredDatabase,
  recordActivity,
  sanitizeOpenAIError,
  type AuthIdentity,
} from "@/lib/server/platform";

type ActivityType = "drill" | "challenge";
type PracticeStatus = "generated" | "in_progress" | "completed" | "results_submitted" | "cancelled" | "superseded";
type SubmissionType = "session_upload" | "csv" | "photo" | "manual" | "score" | "reflection";
type PracticeAttemptStatus = "active" | "completed" | "abandoned" | "needs_review";
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
  result_attempt_id?: string | null;
  result_progress_status?: string | null;
  result_score?: number | null;
  result_attempts?: number | null;
  result_successful_attempts?: number | null;
  result_notes?: string | null;
  result_reflection?: string | null;
  result_evidence_json?: string | null;
  result_next_json?: string | null;
  result_created_at?: string | null;
  active_attempt_id?: string | null;
  active_attempt_status?: PracticeAttemptStatus | null;
  active_attempt_started_at?: string | null;
  active_attempt_completed_at?: string | null;
  active_attempt_completed_shot_count?: number | null;
  active_attempt_completed_set_count?: number | null;
  active_attempt_completed_minutes?: number | null;
  active_attempt_linked_session_id?: string | null;
  active_attempt_member_difficulty_rating?: number | null;
  active_attempt_member_difficulty_label?: string | null;
  active_attempt_member_confidence_rating?: number | null;
  active_attempt_member_completed_amount?: string | null;
  active_attempt_member_notes?: string | null;
  active_attempt_training_aid_used?: number | null;
  active_attempt_training_aid_helpfulness?: number | null;
  active_attempt_measured_outcome_json?: string | null;
  active_attempt_evaluation_json?: string | null;
  active_attempt_source_snapshot_json?: string | null;
  active_attempt_coach_review_status?: string | null;
  latest_attempt_id?: string | null;
  latest_attempt_status?: PracticeAttemptStatus | null;
  latest_attempt_started_at?: string | null;
  latest_attempt_completed_at?: string | null;
  latest_attempt_completed_shot_count?: number | null;
  latest_attempt_completed_set_count?: number | null;
  latest_attempt_completed_minutes?: number | null;
  latest_attempt_linked_session_id?: string | null;
  latest_attempt_member_difficulty_rating?: number | null;
  latest_attempt_member_difficulty_label?: string | null;
  latest_attempt_member_confidence_rating?: number | null;
  latest_attempt_member_completed_amount?: string | null;
  latest_attempt_member_notes?: string | null;
  latest_attempt_training_aid_used?: number | null;
  latest_attempt_training_aid_helpfulness?: number | null;
  latest_attempt_measured_outcome_json?: string | null;
  latest_attempt_evaluation_json?: string | null;
  latest_attempt_source_snapshot_json?: string | null;
  latest_attempt_coach_review_status?: string | null;
};

type PracticeAttemptRow = {
  id: string;
  practice_activity_id: string;
  user_id: string;
  status: PracticeAttemptStatus;
  started_at: string;
  completed_at: string | null;
  completed_shot_count: number | null;
  completed_set_count: number | null;
  completed_minutes: number | null;
  linked_session_id: string | null;
  linked_challenge_attempt_id: string | null;
  member_difficulty_rating: number | null;
  member_difficulty_label: string | null;
  member_confidence_rating: number | null;
  member_completed_amount: string | null;
  member_notes: string | null;
  training_aid_used: number | null;
  training_aid_helpfulness: number | null;
  measured_outcome_json: string;
  evaluation_json: string;
  source_snapshot_json: string;
  coach_review_status: string;
  coach_review_note: string;
  coach_reviewed_by: string | null;
  coach_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type StoredSession = {
  id: string;
  title?: string;
  date?: string;
  focus?: string;
  source?: string;
  shots?: Array<Record<string, unknown>>;
};

type PracticeUserRow = {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
};

type ActiveCoachRelationshipRow = {
  relationship_id: string;
  coach_id: string;
  coach_first_name: string;
  coach_last_name: string;
  coach_email: string;
  coach_account_status: string | null;
  created_at: string;
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

function booleanOrNull(value: unknown) {
  if (value === true || value === "true" || value === "1" || value === 1) return 1;
  if (value === false || value === "false" || value === "0" || value === 0) return 0;
  return null;
}

function clampInteger(value: unknown, min: number, max: number) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
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

function userDisplayName(user: PracticeUserRow | null | undefined) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "MAI Coach golfer";
}

async function loadActiveCoachContext(database: PlatformDatabase, userId: string) {
  const result = await database
    .prepare(
      `SELECT
        coach_members.id AS relationship_id,
        coach_members.coach_id,
        coach.first_name AS coach_first_name,
        coach.last_name AS coach_last_name,
        coach.email AS coach_email,
        coach.account_status AS coach_account_status,
        coach_members.created_at
       FROM coach_members
       JOIN users AS coach ON coach.id = coach_members.coach_id
       WHERE coach_members.member_id = ?
         AND coach.role = 'coach'
         AND COALESCE(coach.account_status, 'active') = 'active'
       ORDER BY coach_members.created_at DESC`,
    )
    .bind(userId)
    .all<ActiveCoachRelationshipRow>();

  return getActiveCoachContext(result.results.map((relationship) => ({
    id: relationship.relationship_id,
    relationshipId: relationship.relationship_id,
    coachId: relationship.coach_id,
    coachName: [relationship.coach_first_name, relationship.coach_last_name].filter(Boolean).join(" ") || relationship.coach_email,
    accountStatus: relationship.coach_account_status ?? "active",
    status: "active",
  })));
}

function sanitizeActivityInstructionsForActiveCoach(
  instructions: Record<string, unknown>,
  activity: { coach_id?: string | null },
  activeCoachContext: ReturnType<typeof getActiveCoachContext>,
) {
  const nextInstructions = { ...instructions };
  const hasMatchingCoach = coachMatchesActiveContext(activity.coach_id, activeCoachContext);
  if (!hasMatchingCoach) {
    nextInstructions.coachConnection = {
      connected: false,
      coachName: null,
      summary: "Generated from your recent session data.",
    };
    const sourceMode = text(nextInstructions.sourceMode, "");
    if (sourceMode === "coach_and_session" || sourceMode === "coach_feedback") {
      nextInstructions.sourceMode = "session_data";
    }
    const sourceSummary = text(nextInstructions.sourceSummary);
    if (!sourceSummary || /coach|zac|joey|malone/i.test(sourceSummary)) {
      nextInstructions.sourceSummary = "Generated from your recent session data.";
    }
  }
  return nextInstructions;
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

async function storedSessionsForUser(database: PlatformDatabase, userId: string) {
  const row = await database
    .prepare("SELECT sessions_json FROM golf_session_snapshots WHERE user_id = ?")
    .bind(userId)
    .first<{ sessions_json: string }>();
  return parseSessions(row?.sessions_json);
}

async function loadRecentPracticeIntelligence(database: PlatformDatabase, userId: string) {
  const result = await database
    .prepare(
      `SELECT
        practice_activities.id AS activity_id,
        practice_activities.title,
        practice_activities.focus_area,
        practice_activities.activity_type,
        practice_activities.coach_id,
        practice_activity_results.practice_attempt_id,
        practice_activity_results.progress_status,
        practice_activity_results.metrics_json,
        practice_activity_results.next_recommendation_json,
        practice_activity_results.media_reference_json,
        practice_activity_results.updated_at
       FROM practice_activity_results
       JOIN practice_activities ON practice_activities.id = practice_activity_results.practice_activity_id
       WHERE practice_activity_results.user_id = ?
       ORDER BY practice_activity_results.updated_at DESC, practice_activity_results.created_at DESC
       LIMIT 5`,
    )
    .bind(userId)
    .all<{
      activity_id: string;
      title: string;
      focus_area: string;
      activity_type: string;
      coach_id: string | null;
      practice_attempt_id: string | null;
      progress_status: string;
      metrics_json: string;
      next_recommendation_json: string;
      media_reference_json: string;
      updated_at: string;
    }>();

  return result.results.map((row) => {
    const metrics = parseJson(row.metrics_json, {}) as { outcome?: Record<string, unknown> };
    const next = parseJson(row.next_recommendation_json, {}) as Record<string, unknown>;
    const media = parseJson(row.media_reference_json, {}) as Record<string, unknown>;
    return {
      activityId: row.activity_id,
      attemptId: row.practice_attempt_id,
      title: row.title,
      focusArea: row.focus_area,
      activityType: row.activity_type,
      source: row.coach_id ? "coach" : "mai",
      progressStatus: row.progress_status,
      outcome: metrics.outcome ?? {},
      nextRecommendation: next,
      evidenceReferences: media,
      updatedAt: row.updated_at,
    };
  });
}

async function loadOwnedSession(database: PlatformDatabase, userId: string, sessionId: string) {
  const requestedSessionId = text(sessionId, 180);
  if (!requestedSessionId) return null;
  const sessions = await storedSessionsForUser(database, userId);
  return sessions.find((session) => session.id === requestedSessionId) ?? null;
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
  const [userRow, activeCoachContext, profileRow, sessionsRow, latestAnalysisRow, structuredFeedback, coachFeedback, recentPracticeEvidence] = await Promise.all([
    database
      .prepare("SELECT id, role, first_name, last_name, email FROM users WHERE id = ?")
      .bind(userId)
      .first<PracticeUserRow>(),
    loadActiveCoachContext(database, userId),
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
           AND EXISTS (
             SELECT 1 FROM coach_members
             WHERE coach_members.member_id = coach_feedback.golfer_id
               AND coach_members.coach_id = coach_feedback.coach_id
           )
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
           AND EXISTS (
             SELECT 1 FROM coach_members
             WHERE coach_members.member_id = lesson_videos.member_id
               AND coach_members.coach_id = lesson_videos.coach_id
           )
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
    loadRecentPracticeIntelligence(database, userId),
  ]);
  const rawProfile = parseJson(profileRow?.profile_json ?? "", null);
  const profile = sanitizePracticeProfileForIdentity(rawProfile, {
    id: userId,
    role: userRow?.role ?? "member",
    firstName: userRow?.first_name ?? "",
    lastName: userRow?.last_name ?? "",
    displayName: userDisplayName(userRow),
    email: userRow?.email ?? "",
  });
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
    currentCoachingContext: profile && typeof profile === "object" && "currentCoachingContext" in profile
      ? (profile as { currentCoachingContext?: unknown }).currentCoachingContext
      : null,
    recentPracticeEvidence,
    latestAnalysis,
    activeCoachContext,
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
  const configurationIssue = getOpenAIConfigurationIssue(runtime);
  if (configurationIssue?.code === "openai_api_key_missing") return null;
  if (configurationIssue) {
    throw Object.assign(new Error(configurationIssue.technicalMessage), {
      status: configurationIssue.statusCode,
      code: configurationIssue.code,
      type: "configuration_error",
    });
  }
  const client = new OpenAI({ apiKey: runtime.OPENAI_API_KEY?.trim(), timeout: 45000 });
  const response = await client.responses.create({
    model,
    instructions: MAI_CADDY_CORE_INSTRUCTIONS,
    input: [
      `Generate exactly one personalized ${activityType} for this golfer.`,
      "Use only the supplied application context.",
      "Prioritize coach-approved feedback when present, but do not expose coach-private notes.",
      "Recommend a training aid only when the supplied evidence clearly supports it. Otherwise return No training aid needed.",
      "Do not invent measured evidence for impact location, wrist condition, early extension, balance, or path.",
      "Use lead/trail body-side language unless handedness is explicitly supplied.",
      "For coach-led members, AI-only training aid suggestions are drafts for Coach review and must not override Coach guidance.",
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
    trainingAid: activity.trainingAid,
  };
}

function sanitizeGeneratedActivityForActiveCoach(
  activity: ReturnType<typeof normalizePracticeActivityOutput>,
  context: { activeCoachContext?: ReturnType<typeof getActiveCoachContext>; coachFeedback?: { coachId?: string | null } | null; sourceMode?: string },
) {
  const hasMatchingCoach = coachMatchesActiveContext(context.coachFeedback?.coachId, context.activeCoachContext ?? {});
  if (hasMatchingCoach) return activity;
  const sourceMode = text(activity.sourceMode || context.sourceMode);
  return {
    ...activity,
    coachConnection: {
      connected: false,
      coachName: null,
      summary: "Generated from your recent session data.",
    },
    sourceMode: sourceMode === "coach_and_session" || sourceMode === "coach_feedback"
      ? "session_data"
      : sourceMode,
    sourceSummary: /coach|zac|joey|malone/i.test(text(activity.sourceSummary))
      ? "Generated from your recent session data."
      : activity.sourceSummary,
  };
}

function serializePracticeActivity(row: PracticeActivityRow, activeCoachContext = getActiveCoachContext([])) {
  const visibleCoachId = coachMatchesActiveContext(row.coach_id, activeCoachContext) ? row.coach_id : null;
  const instructions = sanitizeActivityInstructionsForActiveCoach(
    parseJson(row.instructions_json, {}) as Record<string, unknown>,
    { coach_id: row.coach_id },
    activeCoachContext,
  );
  const resultEvidence = parseJson(row.result_evidence_json ?? "", []);
  const nextRecommendation = parseJson(row.result_next_json ?? "", {});
  const activeAttempt = serializePrefixedAttempt(row, "active_attempt");
  const latestAttempt = serializePrefixedAttempt(row, "latest_attempt");
  const assignment = normalizePracticeAssignment({
    id: row.id,
    userId: row.user_id,
    coachId: visibleCoachId,
    activityType: row.activity_type,
    focusArea: row.focus_area,
    title: row.title,
    reasonSelected: row.reason_selected,
    instructions,
    club: row.club,
    durationMinutes: row.duration_minutes,
    attemptCount: row.attempt_count,
    target: parseJson(row.target_json, {}),
    status: row.status,
    generatedBy: row.generated_by,
    coachFeedbackSourceId: row.coach_feedback_source_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
  return {
    id: row.id,
    userId: row.user_id,
    assignment,
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
    coachId: visibleCoachId ?? undefined,
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
    activeAttempt,
    latestAttempt,
    latestResult: row.result_id
      ? {
          id: row.result_id,
          practiceAttemptId: row.result_attempt_id ?? undefined,
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

function serializeAttempt(row: PracticeAttemptRow | null | undefined, activity?: Pick<PracticeActivityRow, "attempt_count" | "duration_minutes"> | null) {
  if (!row) return null;
  const evaluation = parseJson(row.evaluation_json ?? "", {});
  const measuredOutcome = parseJson(row.measured_outcome_json ?? "", {});
  return {
    id: row.id,
    practiceActivityId: row.practice_activity_id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    completedShotCount: row.completed_shot_count ?? undefined,
    completedSetCount: row.completed_set_count ?? undefined,
    completedMinutes: row.completed_minutes ?? undefined,
    linkedSessionId: row.linked_session_id ?? undefined,
    linkedChallengeAttemptId: row.linked_challenge_attempt_id ?? undefined,
    memberDifficultyRating: row.member_difficulty_rating ?? undefined,
    memberDifficultyLabel: row.member_difficulty_label ?? undefined,
    memberConfidenceRating: row.member_confidence_rating ?? undefined,
    memberCompletedAmount: row.member_completed_amount ?? "unknown",
    memberNotes: row.member_notes ?? "",
    trainingAidUsed: row.training_aid_used === null ? null : row.training_aid_used === 1,
    trainingAidHelpfulness: row.training_aid_helpfulness ?? undefined,
    measuredOutcome,
    evaluation,
    sourceSnapshot: parseJson(row.source_snapshot_json ?? "", {}),
    coachReviewStatus: row.coach_review_status ?? "not_required",
    coachReviewNote: row.coach_review_note ?? "",
    coachReviewedBy: row.coach_reviewed_by ?? undefined,
    coachReviewedAt: row.coach_reviewed_at ?? undefined,
    progress: buildPracticeProgress({
      activity: activity
        ? {
            attemptCount: activity.attempt_count,
            durationMinutes: activity.duration_minutes,
          }
        : {},
      attempt: {
        completedShotCount: row.completed_shot_count,
        completedSetCount: row.completed_set_count,
        completedMinutes: row.completed_minutes,
        status: row.status,
      },
      outcome: evaluation,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePrefixedAttempt(row: PracticeActivityRow, prefix: "active_attempt" | "latest_attempt") {
  const prefixed = row as unknown as Record<string, string | number | null | undefined>;
  const id = prefixed[`${prefix}_id`] as string | null | undefined;
  if (!id) return null;
  return serializeAttempt({
    id,
    practice_activity_id: row.id,
    user_id: row.user_id,
    status: (prefixed[`${prefix}_status`] as PracticeAttemptStatus | null) ?? "active",
    started_at: (prefixed[`${prefix}_started_at`] as string | null | undefined) ?? row.started_at ?? row.created_at,
    completed_at: (prefixed[`${prefix}_completed_at`] as string | null | undefined) ?? null,
    completed_shot_count: (prefixed[`${prefix}_completed_shot_count`] as number | null | undefined) ?? null,
    completed_set_count: (prefixed[`${prefix}_completed_set_count`] as number | null | undefined) ?? null,
    completed_minutes: (prefixed[`${prefix}_completed_minutes`] as number | null | undefined) ?? null,
    linked_session_id: (prefixed[`${prefix}_linked_session_id`] as string | null | undefined) ?? null,
    linked_challenge_attempt_id: null,
    member_difficulty_rating: (prefixed[`${prefix}_member_difficulty_rating`] as number | null | undefined) ?? null,
    member_difficulty_label: (prefixed[`${prefix}_member_difficulty_label`] as string | null | undefined) ?? null,
    member_confidence_rating: (prefixed[`${prefix}_member_confidence_rating`] as number | null | undefined) ?? null,
    member_completed_amount: (prefixed[`${prefix}_member_completed_amount`] as string | null | undefined) ?? null,
    member_notes: (prefixed[`${prefix}_member_notes`] as string | null | undefined) ?? "",
    training_aid_used: (prefixed[`${prefix}_training_aid_used`] as number | null | undefined) ?? null,
    training_aid_helpfulness: (prefixed[`${prefix}_training_aid_helpfulness`] as number | null | undefined) ?? null,
    measured_outcome_json: (prefixed[`${prefix}_measured_outcome_json`] as string | null | undefined) ?? "{}",
    evaluation_json: (prefixed[`${prefix}_evaluation_json`] as string | null | undefined) ?? "{}",
    source_snapshot_json: (prefixed[`${prefix}_source_snapshot_json`] as string | null | undefined) ?? "{}",
    coach_review_status: (prefixed[`${prefix}_coach_review_status`] as string | null | undefined) ?? "not_required",
    coach_review_note: "",
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    created_at: (prefixed[`${prefix}_started_at`] as string | null | undefined) ?? row.created_at,
    updated_at: row.updated_at,
  }, row);
}

async function loadActivities(database: PlatformDatabase, userId: string): Promise<SerializedPracticeActivity[]> {
  const activeCoachContext = await loadActiveCoachContext(database, userId);
  const result = await database
    .prepare(
      `SELECT
        practice_activities.*,
        latest_result.id AS result_id,
        latest_result.practice_attempt_id AS result_attempt_id,
        latest_result.progress_status AS result_progress_status,
        latest_result.score AS result_score,
        latest_result.attempts AS result_attempts,
        latest_result.successful_attempts AS result_successful_attempts,
        latest_result.result_notes AS result_notes,
        latest_result.user_reflection AS result_reflection,
        latest_result.progress_evidence_json AS result_evidence_json,
        latest_result.next_recommendation_json AS result_next_json,
        latest_result.created_at AS result_created_at,
        active_attempt.id AS active_attempt_id,
        active_attempt.status AS active_attempt_status,
        active_attempt.started_at AS active_attempt_started_at,
        active_attempt.completed_at AS active_attempt_completed_at,
        active_attempt.completed_shot_count AS active_attempt_completed_shot_count,
        active_attempt.completed_set_count AS active_attempt_completed_set_count,
        active_attempt.completed_minutes AS active_attempt_completed_minutes,
        active_attempt.linked_session_id AS active_attempt_linked_session_id,
        active_attempt.member_difficulty_rating AS active_attempt_member_difficulty_rating,
        active_attempt.member_difficulty_label AS active_attempt_member_difficulty_label,
        active_attempt.member_confidence_rating AS active_attempt_member_confidence_rating,
        active_attempt.member_completed_amount AS active_attempt_member_completed_amount,
        active_attempt.member_notes AS active_attempt_member_notes,
        active_attempt.training_aid_used AS active_attempt_training_aid_used,
        active_attempt.training_aid_helpfulness AS active_attempt_training_aid_helpfulness,
        active_attempt.measured_outcome_json AS active_attempt_measured_outcome_json,
        active_attempt.evaluation_json AS active_attempt_evaluation_json,
        active_attempt.source_snapshot_json AS active_attempt_source_snapshot_json,
        active_attempt.coach_review_status AS active_attempt_coach_review_status,
        latest_attempt.id AS latest_attempt_id,
        latest_attempt.status AS latest_attempt_status,
        latest_attempt.started_at AS latest_attempt_started_at,
        latest_attempt.completed_at AS latest_attempt_completed_at,
        latest_attempt.completed_shot_count AS latest_attempt_completed_shot_count,
        latest_attempt.completed_set_count AS latest_attempt_completed_set_count,
        latest_attempt.completed_minutes AS latest_attempt_completed_minutes,
        latest_attempt.linked_session_id AS latest_attempt_linked_session_id,
        latest_attempt.member_difficulty_rating AS latest_attempt_member_difficulty_rating,
        latest_attempt.member_difficulty_label AS latest_attempt_member_difficulty_label,
        latest_attempt.member_confidence_rating AS latest_attempt_member_confidence_rating,
        latest_attempt.member_completed_amount AS latest_attempt_member_completed_amount,
        latest_attempt.member_notes AS latest_attempt_member_notes,
        latest_attempt.training_aid_used AS latest_attempt_training_aid_used,
        latest_attempt.training_aid_helpfulness AS latest_attempt_training_aid_helpfulness,
        latest_attempt.measured_outcome_json AS latest_attempt_measured_outcome_json,
        latest_attempt.evaluation_json AS latest_attempt_evaluation_json,
        latest_attempt.source_snapshot_json AS latest_attempt_source_snapshot_json,
        latest_attempt.coach_review_status AS latest_attempt_coach_review_status
       FROM practice_activities
       LEFT JOIN practice_activity_results AS latest_result
         ON latest_result.id = (
           SELECT id FROM practice_activity_results
           WHERE practice_activity_id = practice_activities.id
           ORDER BY created_at DESC
           LIMIT 1
         )
       LEFT JOIN practice_attempts AS active_attempt
         ON active_attempt.id = (
           SELECT id FROM practice_attempts
           WHERE practice_activity_id = practice_activities.id
             AND user_id = practice_activities.user_id
             AND status = 'active'
           ORDER BY started_at DESC, created_at DESC
           LIMIT 1
         )
       LEFT JOIN practice_attempts AS latest_attempt
         ON latest_attempt.id = (
           SELECT id FROM practice_attempts
           WHERE practice_activity_id = practice_activities.id
             AND user_id = practice_activities.user_id
           ORDER BY created_at DESC
           LIMIT 1
         )
       WHERE practice_activities.user_id = ?
       ORDER BY practice_activities.updated_at DESC, practice_activities.created_at DESC
       LIMIT 8`,
    )
    .bind(userId)
    .all<PracticeActivityRow>();
  return result.results.map((row) => serializePracticeActivity(row, activeCoachContext));
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

export async function assignCoachPracticePlan(
  identity: AuthIdentity,
  values: Record<string, unknown>,
) {
  if (identity.role === "member") {
    throw new Response("Coach or admin access is required to assign practice plans.", { status: 403 });
  }
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const memberId = text(values.memberId, 120);
  if (!memberId) throw new Response("Choose a Student before assigning a Practice Plan.", { status: 400 });
  const member = await database
    .prepare("SELECT id, first_name, last_name, email, role FROM users WHERE id = ? AND role = 'member'")
    .bind(memberId)
    .first<PracticeUserRow>();
  if (!member) throw new Response("Student could not be found.", { status: 404 });

  const requestedCoachId = text(values.coachId, 120);
  const effectiveCoachId = identity.role === "coach" ? identity.id : requestedCoachId || null;
  let coachName = identity.displayName || "Coach";
  if (identity.role === "coach") {
    const assigned = await database
      .prepare("SELECT id FROM coach_members WHERE coach_id = ? AND member_id = ?")
      .bind(identity.id, memberId)
      .first<{ id: string }>();
    if (!assigned) throw new Response("You can only assign Practice Plans to your assigned Students.", { status: 403 });
  } else if (effectiveCoachId) {
    const coach = await database
      .prepare("SELECT id, first_name, last_name, email FROM users WHERE id = ? AND role = 'coach'")
      .bind(effectiveCoachId)
      .first<PracticeUserRow>();
    if (!coach) throw new Response("Choose a valid Coach for this Practice Plan.", { status: 400 });
    coachName = userDisplayName(coach);
  }

  const preview = buildStudentPracticePreview(values) as {
    club?: string;
    cueList?: string[];
    drill?: string;
    focus?: string;
    instructions?: string[];
    messageToStudent?: string;
    pattern?: string;
    success?: string;
    title?: string;
    trainingAid?: string;
    volume?: { attemptCount?: number | null; durationMinutes?: number | null; label?: string; sets?: number; repetitionsPerSet?: number };
    whyItMatters?: string;
  };
  const title = text(preview.title, 140);
  const focusArea = text(preview.focus, 80);
  const drillTitle = text(preview.drill, 140);
  const instructionList = normalizeCoachBuilderList(preview.instructions, 6, 220);
  const volume = parseCoachPracticeVolume(preview.volume?.label || values.volumePreset || values.customVolume) as {
    attemptCount?: number | null;
    durationMinutes?: number | null;
    label?: string;
    sets?: number;
    repetitionsPerSet?: number;
  };
  const successCriterion = normalizeCoachBuilderValue(preview.success || values.successCriterion || values.customSuccess, 220);
  if (!title || !focusArea) {
    throw new Response("Add a Practice Plan title or focus before assigning this plan.", { status: 400 });
  }
  if (!drillTitle && instructionList.length === 0) {
    throw new Response("Add a drill or practice instruction before assigning this plan.", { status: 400 });
  }
  if (!volume.label && !volume.attemptCount && !volume.durationMinutes) {
    throw new Response("Add practice volume before assigning this plan.", { status: 400 });
  }

  const sourceSessionId = text(values.sourceSessionId, 160);
  const relatedSession = sourceSessionId ? await loadOwnedSession(database, memberId, sourceSessionId) : null;
  if (sourceSessionId && !relatedSession) {
    throw new Response("Only this Student's saved sessions can be used as source context.", { status: 403 });
  }
  const sourceLessonId = text(values.sourceLessonId, 120);
  if (sourceLessonId) {
    const lesson = await database
      .prepare(
        `SELECT id FROM lesson_videos
         WHERE id = ? AND member_id = ?
           AND (? IS NULL OR coach_id = ?)
         LIMIT 1`,
      )
      .bind(sourceLessonId, memberId, effectiveCoachId, effectiveCoachId)
      .first<{ id: string }>();
    if (!lesson) throw new Response("Lesson source is not available for this Student and Coach.", { status: 403 });
  }

  const idempotencyKey = text(values.idempotencyKey, 120);
  if (idempotencyKey) {
    const prior = await database
      .prepare(
        `SELECT * FROM practice_activities
         WHERE user_id = ?
           AND generated_by = ?
           AND source_context_json LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(memberId, identity.id, `%${idempotencyKey}%`)
      .first<PracticeActivityRow>();
    if (prior) {
      return Response.json({
        activity: serializePracticeActivity(prior, await loadActiveCoachContext(database, memberId)),
        message: "Practice Plan already assigned.",
        reused: true,
      });
    }
  }

  const existingActive = await database
    .prepare(
      `SELECT * FROM practice_activities
       WHERE user_id = ?
         AND activity_type = 'drill'
         AND focus_area = ?
         AND status IN ('generated', 'in_progress')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(memberId, focusArea)
    .first<PracticeActivityRow>();
  if (existingActive) {
    return Response.json({
      activity: serializePracticeActivity(existingActive, await loadActiveCoachContext(database, memberId)),
      message: "This Student already has an active Practice Plan for that focus. Open it or choose a different focus before assigning another.",
      reused: true,
    });
  }

  const trainingAid = normalizeCoachBuilderValue(preview.trainingAid || "No training aid", 120);
  const cues = Array.isArray(preview.cueList) ? preview.cueList.slice(0, 3) : [];
  const instructions = {
    setup: normalizeCoachBuilderValue(values.setup || `Set up ${drillTitle} for ${focusArea}.`, 260),
    instructions: instructionList.length
      ? instructionList
      : [
          `Complete ${volume.label || "the assigned work"} with ${drillTitle}.`,
          successCriterion ? `Score success against: ${successCriterion}.` : "Record what happened honestly when you finish.",
        ],
    equipment: trainingAid && trainingAid !== "No training aid" ? [trainingAid] : [],
    feel: cues.join(" · "),
    commonMistake: normalizeCoachBuilderValue(preview.pattern || values.pattern || values.customPattern, 180),
    easierVersion: normalizeCoachBuilderValue(values.easierVersion, 220),
    harderVersion: normalizeCoachBuilderValue(values.harderVersion, 220),
    resultRequest: "After practice, record what you completed and attach measured evidence when available.",
    resultFields: ["completed amount", "reflection", "optional session evidence"],
    nextStepLogic: effectiveCoachId ? "Your Coach reviews completion before assigning the next step." : "MAI Coach uses this result to recommend the next practice step.",
    coachConnection: effectiveCoachId
      ? { connected: true, coachName, summary: `${coachName} assigned this Practice Plan.` }
      : { connected: false, coachName: null, summary: "Assigned by MAI Coach staff." },
    sourceMode: "coach_builder",
    sourceSummary: normalizeCoachBuilderValue(values.sourceSummary, 260) || `${coachName} built this plan from Coach guidance.`,
    studentMessage: normalizeCoachBuilderValue(preview.messageToStudent, 500),
    whyItMatters: normalizeCoachBuilderValue(preview.whyItMatters, 320),
    cues,
    trainingAid: {
      aidId: trainingAid.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "none",
      approvalState: "approved",
      confidence: "coach_selected",
      name: trainingAid || "No training aid",
      noEquipmentAlternative: normalizeCoachBuilderValue(values.noEquipmentAlternative, 220),
      safetyNotes: [],
      setupSteps: trainingAid && trainingAid !== "No training aid" ? [`Use ${trainingAid} only as your Coach described.`] : [],
      source: "coach",
      studentVisible: trainingAid !== "No training aid",
      whyItFits: trainingAid && trainingAid !== "No training aid" ? "Selected by your Coach for this Practice Plan." : "",
    },
  };
  const sourceContext = {
    promptVersion: "coach-practice-builder-v1",
    source: "coach_practice_builder",
    idempotencyKey: idempotencyKey || null,
    sourceLessonId: sourceLessonId || null,
    sourceSessionId: relatedSession?.id || null,
    selectedPattern: preview.pattern || null,
    selectedDrill: drillTitle,
    selectedCues: cues,
    customValuesUsed: {
      focus: Boolean(text(values.customFocus, 120)),
      drill: Boolean(text(values.customDrill, 160)),
      cue: normalizeCoachBuilderList(values.customCues, 3, 80).length > 0,
      trainingAid: Boolean(text(values.customTrainingAid, 120)),
      successCriterion: Boolean(text(values.customSuccess, 220)),
    },
    privateFieldsPersisted: false,
    disabledFeatures: {
      coachPersonalLibraryPersistence: true,
      medicalAdvice: true,
      automaticPublishFromAi: true,
    },
  };
  const activityId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO practice_activities (
        id, user_id, generated_by, activity_type, focus_area, title, reason_selected,
        instructions_json, club, duration_minutes, attempt_count, target_json,
        scoring_json, source_context_json, coach_id, coach_feedback_source_id,
        related_session_id, status, model, prompt_version, created_at, updated_at
      ) VALUES (?, ?, ?, 'drill', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      activityId,
      memberId,
      identity.id,
      focusArea,
      title,
      normalizeCoachBuilderValue(values.whyItMatters || values.reasonSelected, 500) || `${focusArea} is the next Coach-assigned priority.`,
      safeJson(instructions),
      preview.club && preview.club !== "No specific club" ? preview.club : null,
      volume.durationMinutes ?? null,
      volume.attemptCount ?? null,
      safeJson({ successTarget: successCriterion, volume: volume.label || null, sets: volume.sets ?? null, repetitionsPerSet: volume.repetitionsPerSet ?? null }),
      safeJson({ enabled: false, system: "coach_completion_review" }),
      safeJson(sourceContext),
      effectiveCoachId,
      sourceLessonId || null,
      relatedSession?.id || null,
      "coach:practice-builder",
      "coach-practice-builder-v1",
    )
    .run();

  await recordActivity({
    action: "practice_plan_assigned",
    actor: identity,
    database,
    entityId: activityId,
    entityType: "practice_activity",
    memberId,
    metadata: {
      coachId: effectiveCoachId,
      focusArea,
      source: "coach_practice_builder",
      sourceLessonId: sourceLessonId || null,
      sourceSessionId: relatedSession?.id || null,
    },
    summary: `${coachName} assigned a new Practice Plan: ${title}.`,
    targetUserId: memberId,
  });

  const saved = await getActivityRow(database, activityId);
  return Response.json({
    activity: saved ? serializePracticeActivity(saved, await loadActiveCoachContext(database, memberId)) : null,
    message: `Practice Plan assigned to ${userDisplayName(member)}.`,
    reused: false,
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
  const activeCoachContext = await loadActiveCoachContext(database, targetUserId);
  const replaceReason = text(values.replaceReason, 180);
  const runtime = getPlatformEnvironment();

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
  const shouldRefreshFallbackActivity = Boolean(runtime.OPENAI_API_KEY?.trim())
    && !replaceReason
    && existingActive?.model?.startsWith("fallback:");

  if (existingActive && !replaceReason && !shouldRefreshFallbackActivity) {
    return Response.json({
      activity: serializePracticeActivity(existingActive, activeCoachContext),
      reused: true,
      message: "MAI Coach already has an active activity for that focus.",
    });
  }

  if (existingActive && (replaceReason || shouldRefreshFallbackActivity)) {
    await database
      .prepare("UPDATE practice_activities SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(existingActive.id)
      .run();
    const supersedeReason = replaceReason || "Refreshing a prior fallback activity now that MAI Coach AI is available.";
    await recordActivity({
      action: "practice_activity_superseded",
      actor: identity,
      database,
      entityId: existingActive.id,
      entityType: "practice_activity",
      memberId: targetUserId,
      metadata: { activityType, focusArea, replaceReason: supersedeReason },
      summary: `Superseded ${existingActive.title}.`,
      targetUserId,
    });
  }

  const context = await loadPracticeContext(database, targetUserId, focusArea);
  const existingInstructions = parseJson(existingActive?.instructions_json ?? "", {});
  const existingTrainingAid = existingInstructions && typeof existingInstructions === "object" && "trainingAid" in existingInstructions
    ? (existingInstructions as { trainingAid?: unknown }).trainingAid
    : null;
  const previousScore = await loadLatestResultScore(database, targetUserId, focusArea, activityType);
  const model = runtime.OPENAI_ANALYSIS_MODEL || runtime.OPENAI_MODEL || "gpt-4.1-mini";
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
  let openAIFailureCategory = "";
  const generated = await callOpenAIForPracticeActivity(promptContext, activityType, model).catch((error) => {
    const diagnostic = sanitizeOpenAIError(error, {
      endpoint: "responses.create",
      model,
      operation: "practice_activity_generation",
    });
    openAIFailureCategory = diagnostic.category;
    console.warn("MAI Coach practice generation used fallback.", {
      category: diagnostic.category,
      httpStatus: diagnostic.httpStatus,
      errorType: diagnostic.errorType,
      errorCode: diagnostic.errorCode,
      requestId: diagnostic.requestId,
      model: diagnostic.model,
    });
    return null;
  }) ?? buildDefaultPracticeActivity({ activityType, focusArea, context: promptContext });
  const trainingAid = buildTrainingAidRecommendation({
    activity: generated,
    context: promptContext,
    existingTrainingAid,
    requestedTrainingAid: generated.trainingAid,
  });
  const generatedWithAid = sanitizeGeneratedActivityForActiveCoach({
    ...generated,
    equipment: trainingAid?.aidId && trainingAid.aidId !== "none"
      ? Array.from(new Set([...(generated.equipment ?? []), ...(trainingAid.requiredEquipment ?? [])]))
      : generated.equipment,
    trainingAid,
  }, context);
  const generatedModel = runtime.OPENAI_API_KEY && !openAIFailureCategory
    ? model
    : runtime.OPENAI_API_KEY
      ? `fallback:${model}`
      : "fallback:no-openai";
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
      generatedWithAid.activityType,
      generatedWithAid.focusArea,
      generatedWithAid.title,
      generatedWithAid.reasonSelected,
      safeJson(activityInstructions(generatedWithAid)),
      generatedWithAid.club,
      generatedWithAid.durationMinutes,
      generatedWithAid.attemptCount,
      safeJson({ successTarget: generatedWithAid.successTarget }),
      safeJson(generatedWithAid.scoring),
      safeJson(promptContext),
      coachMatchesActiveContext(context.coachFeedback?.coachId, context.activeCoachContext) ? context.coachFeedback?.coachId ?? null : null,
      context.coachFeedback?.feedbackId ?? context.coachFeedback?.videoId ?? null,
      context.sessionSummary.id || null,
      generatedModel,
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
      model: generatedModel,
      promptVersion: PRACTICE_PROMPT_VERSION,
      coachId: coachMatchesActiveContext(context.coachFeedback?.coachId, context.activeCoachContext) ? context.coachFeedback?.coachId ?? null : null,
      aiFallbackReason: openAIFailureCategory || null,
    },
    summary: `Generated ${generatedWithAid.title}.`,
    targetUserId,
  });
  if (trainingAid?.aidId && trainingAid.aidId !== "none") {
    await recordActivity({
      action: "training_aid_suggested",
      actor: identity,
      database,
      entityId: id,
      entityType: "practice_activity",
      memberId: targetUserId,
      metadata: {
        aidId: trainingAid.aidId,
        approvalState: trainingAid.approvalState,
        confidence: trainingAid.confidence,
        source: trainingAid.source,
        studentVisible: Boolean(visibleTrainingAidRecommendation(trainingAid, { role: "member" })),
      },
      summary: `Suggested ${trainingAid.name}.`,
      targetUserId,
    });
  }
  const saved = await getActivityRow(database, id);
  return Response.json({ activity: saved ? serializePracticeActivity(saved, activeCoachContext) : null, reused: false });
}

async function loadAttemptById(database: PlatformDatabase, attemptId: string) {
  const id = text(attemptId, 120);
  if (!id) return null;
  return database
    .prepare("SELECT * FROM practice_attempts WHERE id = ?")
    .bind(id)
    .first<PracticeAttemptRow>();
}

async function loadActiveAttempt(database: PlatformDatabase, activity: PracticeActivityRow) {
  return database
    .prepare(
      `SELECT * FROM practice_attempts
       WHERE practice_activity_id = ? AND user_id = ? AND status = 'active'
       ORDER BY started_at DESC, created_at DESC
       LIMIT 1`,
    )
    .bind(activity.id, activity.user_id)
    .first<PracticeAttemptRow>();
}

async function createOrReuseActiveAttempt(identity: AuthIdentity, database: PlatformDatabase, activity: PracticeActivityRow) {
  if (activity.status === "cancelled" || activity.status === "superseded") {
    throw new Response("This practice assignment is no longer active.", { status: 409 });
  }
  if (identity.id !== activity.user_id && identity.role !== "admin") {
    throw new Response("Members can only start their own practice assignments.", { status: 403 });
  }
  const existing = await loadActiveAttempt(database, activity);
  if (existing) return { attempt: existing, created: false };

  const attemptId = crypto.randomUUID();
  const assignmentSnapshot = normalizePracticeAssignment({
    id: activity.id,
    userId: activity.user_id,
    coachId: activity.coach_id,
    activityType: activity.activity_type,
    focusArea: activity.focus_area,
    title: activity.title,
    reasonSelected: activity.reason_selected,
    instructions: parseJson(activity.instructions_json, {}),
    club: activity.club,
    durationMinutes: activity.duration_minutes,
    attemptCount: activity.attempt_count,
    target: parseJson(activity.target_json, {}),
    status: activity.status,
    generatedBy: activity.generated_by,
    coachFeedbackSourceId: activity.coach_feedback_source_id,
    createdAt: activity.created_at,
    startedAt: activity.started_at,
    completedAt: activity.completed_at,
  });
  await database
    .prepare(
      `INSERT OR IGNORE INTO practice_attempts (
        id, practice_activity_id, user_id, status, source_snapshot_json,
        coach_review_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      attemptId,
      activity.id,
      activity.user_id,
      safeJson({ assignment: assignmentSnapshot }),
      activity.coach_id ? "not_started" : "not_required",
    )
    .run();
  const attempt = await loadActiveAttempt(database, activity);
  if (!attempt) throw new Response("Practice attempt could not be started.", { status: 500 });
  const created = attempt.id === attemptId;
  return { attempt, created };
}

function difficultyFromValues(values: Record<string, unknown>) {
  const label = text(values.memberDifficultyLabel ?? values.difficulty, 40).toLowerCase();
  const explicit = clampInteger(values.memberDifficultyRating, -1, 1);
  if (explicit !== null) {
    return {
      label: explicit < 0 ? "easier" : explicit > 0 ? "harder" : "about_same",
      rating: explicit,
    };
  }
  if (label === "great") return { label: "great", rating: -1 };
  if (label === "expected") return { label: "expected", rating: 0 };
  if (label === "struggled") return { label: "struggled", rating: 1 };
  if (label.includes("easy")) return { label: "easier", rating: -1 };
  if (label.includes("hard")) return { label: "harder", rating: 1 };
  if (label.includes("same") || label.includes("about")) return { label: "about_same", rating: 0 };
  return { label: "", rating: null };
}

function completedAmount(value: unknown) {
  const amount = text(value, 20).toLowerCase();
  return amount === "partial" || amount === "partially" ? "partial" : amount === "yes" || amount === "complete" || amount === "completed" ? "yes" : "unknown";
}

function outcomeEvidenceLabels(outcome: { evidence?: Array<Record<string, unknown>> }) {
  const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : [];
  return evidence.map((item) => {
    const label = text(item.label, "Practice evidence");
    const source = text(item.source);
    const details = text(item.details);
    const before = numberOrNull(item.before);
    const after = numberOrNull(item.after);
    const unit = text(item.unit);
    if (before !== null && after !== null) return `${label}: ${before}${unit ? ` ${unit}` : ""} to ${after}${unit ? ` ${unit}` : ""} (${source || "measured"}).`;
    if (after !== null) return `${label}: ${after}${unit ? ` ${unit}` : ""} (${source || "member recorded"}).`;
    return details || `${label} (${source || "member recorded"}).`;
  });
}

async function upsertPracticeResultForAttempt(
  database: PlatformDatabase,
  values: {
    activity: PracticeActivityRow;
    attempt: PracticeAttemptRow;
    evaluation: ReturnType<typeof evaluatePracticeOutcome>;
    relatedSessionId: string | null;
    score: number | null;
    attempts: number | null;
    successfulAttempts: number | null;
    submissionType: SubmissionType;
    notes: string;
    reflection: string;
    sharedWithCoach: number;
    mediaReferences?: Record<string, unknown>;
  },
) {
  const existing = await database
    .prepare("SELECT id FROM practice_activity_results WHERE practice_attempt_id = ?")
    .bind(values.attempt.id)
    .first<{ id: string }>();
  const progressStatus = mapOutcomeToProgressStatus(values.evaluation);
  const evidenceLabels = outcomeEvidenceLabels(values.evaluation);
  const nextRecommendation = {
    recommendation: values.evaluation.recommendedReason,
    recommendedNextAction: values.evaluation.recommendedNextAction,
    visibility: nextActionVisibility(values.activity, values.evaluation),
  };
  if (existing) {
    await database
      .prepare(
        `UPDATE practice_activity_results
         SET related_session_id = ?, submission_type = ?, score = ?, attempts = ?,
             successful_attempts = ?, metrics_json = ?, result_notes = ?,
             user_reflection = ?, progress_status = ?, progress_evidence_json = ?,
             next_recommendation_json = ?, media_reference_json = ?, shared_with_coach = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        values.relatedSessionId,
        values.submissionType,
        values.score,
        values.attempts,
        values.successfulAttempts,
        safeJson({ outcome: values.evaluation }),
        values.notes,
        values.reflection,
        progressStatus,
        safeArrayJson(evidenceLabels),
        safeJson(nextRecommendation),
        safeJson(values.mediaReferences ?? {}),
        values.sharedWithCoach,
        existing.id,
      )
      .run();
    return existing.id;
  }
  const resultId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO practice_activity_results (
        id, practice_activity_id, practice_attempt_id, user_id, related_session_id,
        submission_type, score, attempts, successful_attempts, metrics_json,
        result_notes, user_reflection, media_reference_json, progress_status,
        progress_evidence_json, next_recommendation_json, shared_with_coach,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      resultId,
      values.activity.id,
      values.attempt.id,
      values.activity.user_id,
      values.relatedSessionId,
      values.submissionType,
      values.score,
      values.attempts,
      values.successfulAttempts,
      safeJson({ outcome: values.evaluation }),
      values.notes,
      values.reflection,
      safeJson(values.mediaReferences ?? {}),
      progressStatus,
      safeArrayJson(evidenceLabels),
      safeJson(nextRecommendation),
      values.sharedWithCoach,
    )
    .run();
  return resultId;
}

async function recordPracticeAttemptActivityOnce(
  database: PlatformDatabase,
  values: Parameters<typeof recordActivity>[0] & { entityId: string },
) {
  const existing = await database
    .prepare(
      `SELECT id FROM member_activity_log
       WHERE entity_type = 'practice_attempt'
         AND entity_id = ?
         AND action = ?
       LIMIT 1`,
    )
    .bind(values.entityId, values.action)
    .first<{ id: string }>();
  if (existing) return;
  await recordActivity({ ...values, database });
}

async function upsertPlayerCoachingContext(
  database: PlatformDatabase,
  userId: string,
  intelligence: ReturnType<typeof buildPracticeCompletionIntelligence>,
) {
  const user = await database
    .prepare("SELECT id, email, first_name, last_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; first_name: string; last_name: string }>();
  if (!user) return;
  const existing = await database
    .prepare("SELECT profile_json FROM golf_practice_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json: string }>();
  const profile = parseJson(existing?.profile_json ?? "", {}) as Record<string, unknown>;
  const history = Array.isArray(profile.recentPracticeOutcomes) ? profile.recentPracticeOutcomes : [];
  const nextHistory = [
    intelligence,
    ...history.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      return (item as { attemptId?: unknown }).attemptId !== intelligence.attemptId;
    }),
  ].slice(0, 8);
  const nextProfile = {
    ...(profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {}),
    currentCoachingContext: intelligence,
    recentPracticeOutcomes: nextHistory,
  };
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
  if (existing) {
    await database
      .prepare(
        `UPDATE golf_practice_profiles
         SET user_email = ?, display_name = ?, profile_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
      )
      .bind(user.email, displayName, safeJson(nextProfile), userId)
      .run();
    return;
  }
  await database
    .prepare(
      `INSERT INTO golf_practice_profiles (
        user_email, user_id, display_name, profile_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_email) DO UPDATE SET
        user_id = excluded.user_id,
        display_name = excluded.display_name,
        profile_json = excluded.profile_json,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(user.email, userId, displayName, safeJson(nextProfile))
    .run();
}

function nextPlanTitle(activity: PracticeActivityRow, outcome: ReturnType<typeof evaluatePracticeOutcome>) {
  const base = text(activity.title, "Practice Plan");
  if (outcome.recommendedNextAction === "progress") return `Progression: ${base}`;
  if (outcome.recommendedNextAction === "modify") return `Adjusted: ${base}`;
  if (outcome.recommendedNextAction === "replace") return `${activity.focus_area} Checkpoint`;
  return `Repeat: ${base}`;
}

function nextPlanInstructions(
  activity: PracticeActivityRow,
  outcome: ReturnType<typeof evaluatePracticeOutcome>,
  intelligence: ReturnType<typeof buildPracticeCompletionIntelligence>,
) {
  const previous = parseJson(activity.instructions_json, {}) as Record<string, unknown>;
  return {
    ...previous,
    sourceMode: "practice_completion",
    sourceSummary: outcome.recommendedReason,
    priorAssignment: {
      id: activity.id,
      title: activity.title,
      result: outcome.classification,
      confidence: outcome.confidence,
      evidencePrimary: intelligence.evidenceProvenance.primary,
    },
    coachConnection: {
      connected: false,
      coachName: null,
      summary: "MAI Coach generated this from the previous practice completion.",
    },
  };
}

async function createNextIndependentPracticePlanFromCompletion(
  identity: AuthIdentity,
  database: PlatformDatabase,
  values: {
    activity: PracticeActivityRow;
    attempt: PracticeAttemptRow;
    outcome: ReturnType<typeof evaluatePracticeOutcome>;
    intelligence: ReturnType<typeof buildPracticeCompletionIntelligence>;
    resultId: string;
  },
) {
  const activeCoachContext = await loadActiveCoachContext(database, values.activity.user_id);
  if (activeCoachContext.hasActiveCoach) {
    return { created: false, reason: "active_coach_relationship", activityId: null };
  }
  if (values.outcome.recommendedNextAction === "complete") {
    return { created: false, reason: "priority_complete", activityId: null };
  }
  const prior = await database
    .prepare(
      `SELECT id FROM practice_activities
       WHERE user_id = ?
         AND source_context_json LIKE ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(values.activity.user_id, `%${values.attempt.id}%`)
    .first<{ id: string }>();
  if (prior) return { created: false, reason: "existing_attempt_next_plan", activityId: prior.id };

  const existingActive = await database
    .prepare(
      `SELECT id FROM practice_activities
       WHERE user_id = ?
         AND activity_type = ?
         AND focus_area = ?
         AND status IN ('generated', 'in_progress')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(values.activity.user_id, values.activity.activity_type, values.activity.focus_area)
    .first<{ id: string }>();
  if (existingActive) return { created: false, reason: "existing_active_same_focus", activityId: existingActive.id };

  const nextActivityId = crypto.randomUUID();
  const sourceContext = {
    promptVersion: "practice-completion-intelligence-v1",
    source: "practice_completion",
    createdFromActivityId: values.activity.id,
    createdFromAttemptId: values.attempt.id,
    createdFromResultId: values.resultId,
    outcome: values.outcome,
    playerIntelligence: values.intelligence,
    disabledFeatures: {
      tourTwin: true,
      professionalPlayerMatching: true,
    },
  };
  await database
    .prepare(
      `INSERT INTO practice_activities (
        id, user_id, generated_by, activity_type, focus_area, title, reason_selected,
        instructions_json, club, duration_minutes, attempt_count, target_json,
        scoring_json, source_context_json, coach_id, coach_feedback_source_id,
        related_session_id, status, model, prompt_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'generated', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      nextActivityId,
      values.activity.user_id,
      values.activity.user_id,
      values.activity.activity_type,
      values.activity.focus_area,
      nextPlanTitle(values.activity, values.outcome),
      values.outcome.recommendedReason,
      safeJson(nextPlanInstructions(values.activity, values.outcome, values.intelligence)),
      values.activity.club,
      values.activity.duration_minutes,
      values.activity.attempt_count,
      values.activity.target_json,
      values.activity.scoring_json,
      safeJson(sourceContext),
      values.activity.related_session_id,
      "policy:practice-completion-intelligence-v1",
      "practice-completion-intelligence-v1",
    )
    .run();

  await recordPracticeAttemptActivityOnce(database, {
    action: "mai_next_practice_created",
    actor: identity,
    entityId: values.attempt.id,
    entityType: "practice_attempt",
    memberId: values.activity.user_id,
    metadata: {
      activityId: values.activity.id,
      nextActivityId,
      resultId: values.resultId,
      recommendedNextAction: values.outcome.recommendedNextAction,
      confidence: values.outcome.confidence,
    },
    summary: `Created the next MAI practice plan after ${values.activity.title}.`,
    targetUserId: values.activity.user_id,
  });
  return { created: true, reason: "created", activityId: nextActivityId };
}

async function attachIntelligenceToPracticeResult(
  database: PlatformDatabase,
  resultId: string,
  values: {
    intelligence: ReturnType<typeof buildPracticeCompletionIntelligence>;
    nextPlan: { created: boolean; reason: string; activityId: string | null };
  },
) {
  const row = await database
    .prepare("SELECT next_recommendation_json FROM practice_activity_results WHERE id = ?")
    .bind(resultId)
    .first<{ next_recommendation_json: string }>();
  const current = parseJson(row?.next_recommendation_json ?? "", {}) as Record<string, unknown>;
  await database
    .prepare(
      `UPDATE practice_activity_results
       SET next_recommendation_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      safeJson({
        ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
        playerIntelligence: values.intelligence,
        nextPlan: values.nextPlan,
      }),
      resultId,
    )
    .run();
}

export async function getPracticeActivityDetail(identity: AuthIdentity, activityId: string) {
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const activity = await requireActivityAccess(identity, database, text(activityId, 120));
  const activities = await loadActivities(database, activity.user_id);
  const activeCoachContext = await loadActiveCoachContext(database, activity.user_id);
  const serializedActivity = activities.find((item) => item.id === activity.id) ?? serializePracticeActivity(activity, activeCoachContext);
  const attemptsResult = await database
    .prepare(
      `SELECT * FROM practice_attempts
       WHERE practice_activity_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .bind(activity.id, activity.user_id)
    .all<PracticeAttemptRow>();
  const sessions = await storedSessionsForUser(database, activity.user_id);
  return Response.json({
    activity: serializedActivity,
    attempts: attemptsResult.results.map((attempt) => serializeAttempt(attempt, activity)),
    eligibleSessions: sessions.map(summarizeSession),
  });
}

export async function updatePracticeActivity(
  identity: AuthIdentity,
  values: {
    action?: unknown;
    activityId?: unknown;
    score?: unknown;
    attempts?: unknown;
    successfulAttempts?: unknown;
    evidenceSources?: unknown;
    notes?: unknown;
    reflection?: unknown;
    submissionType?: unknown;
    relatedSessionId?: unknown;
    attemptId?: unknown;
    completedShotCount?: unknown;
    completedSetCount?: unknown;
    completedMinutes?: unknown;
    completedAmount?: unknown;
    memberDifficultyLabel?: unknown;
    memberDifficultyRating?: unknown;
    memberConfidenceRating?: unknown;
    memberNotes?: unknown;
    trainingAidUsed?: unknown;
    trainingAidHelpfulness?: unknown;
    coachReviewNote?: unknown;
    shareWithCoach?: unknown;
    aidId?: unknown;
    noEquipmentAlternative?: unknown;
    safetyNotes?: unknown;
    setupSteps?: unknown;
    whyItFits?: unknown;
  },
) {
  const database = getRequiredDatabase();
  await preparePracticeDatabase(database);
  const activityId = text(values.activityId, 120);
  if (!activityId) throw new Response("Choose a practice activity.", { status: 400 });
  const activity = await requireActivityAccess(identity, database, activityId);
  const action = text(values.action, 60);

  if (action === "start") {
    const { attempt, created } = await createOrReuseActiveAttempt(identity, database, activity);
    await database
      .prepare("UPDATE practice_activities SET status = 'in_progress', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(activity.id)
      .run();
    if (created) {
      await recordPracticeAttemptActivityOnce(database, {
        action: "practice_started",
        actor: identity,
        entityId: attempt.id,
        entityType: "practice_attempt",
        memberId: activity.user_id,
        metadata: { activityId: activity.id, activityType: activity.activity_type, focus: activity.focus_area },
        summary: `Started ${activity.title}.`,
        targetUserId: activity.user_id,
      });
    }
  } else if (action === "complete") {
    await createOrReuseActiveAttempt(identity, database, activity);
    await database
      .prepare("UPDATE practice_activities SET status = 'in_progress', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(activity.id)
      .run();
  } else if (action === "submit_result") {
    if (identity.role === "coach") {
      throw new Response("Coaches can view shared results but cannot submit private member results.", { status: 403 });
    }
    if (activity.status === "cancelled" || activity.status === "superseded") {
      throw new Response("This practice assignment is no longer active.", { status: 409 });
    }
    if (identity.id !== activity.user_id && identity.role !== "admin") {
      throw new Response("Members can only complete their own practice assignments.", { status: 403 });
    }
    const requestedAttempt = text(values.attemptId, 120);
    let attempt = requestedAttempt ? await loadAttemptById(database, requestedAttempt) : await loadActiveAttempt(database, activity);
    if (attempt && (attempt.practice_activity_id !== activity.id || attempt.user_id !== activity.user_id)) {
      throw new Response("Practice attempt does not belong to this assignment.", { status: 403 });
    }
    if (!attempt) {
      const created = await createOrReuseActiveAttempt(identity, database, activity);
      attempt = created.attempt;
    }
    if (!attempt) throw new Response("Practice attempt could not be loaded.", { status: 500 });
    const score = numberOrNull(values.score);
    const attempts = numberOrNull(values.attempts);
    const successfulAttempts = numberOrNull(values.successfulAttempts);
    const rawSubmissionType = text(values.submissionType, 40);
    const submissionType: SubmissionType = ["session_upload", "csv", "photo", "manual", "score", "reflection"].includes(rawSubmissionType)
      ? rawSubmissionType as SubmissionType
      : score !== null ? "score" : "manual";
    const relatedSessionId = text(values.relatedSessionId, 160) || null;
    const linkedSession = relatedSessionId ? await loadOwnedSession(database, activity.user_id, relatedSessionId) : null;
    if (relatedSessionId && !linkedSession) {
      throw new Response("Only this member's saved sessions can be attached to practice results.", { status: 403 });
    }
    const difficulty = difficultyFromValues(values as Record<string, unknown>);
    const completed = completedAmount(values.completedAmount);
    const completedShotCount = clampInteger(values.completedShotCount ?? values.attempts, 0, 999);
    const completedSetCount = clampInteger(values.completedSetCount, 0, 999);
    const completedMinutes = clampInteger(values.completedMinutes, 0, 600);
    const memberConfidenceRating = clampInteger(values.memberConfidenceRating, 1, 5);
    const trainingAidUsed = booleanOrNull(values.trainingAidUsed);
    const trainingAidHelpfulness = clampInteger(values.trainingAidHelpfulness, 1, 5);
    const notes = text(values.notes ?? values.memberNotes, 2000);
    const reflection = text(values.reflection, 2000);
    const memberNotes = text(values.memberNotes ?? values.reflection ?? values.notes, 2000);
    const evidenceSources = Array.isArray(values.evidenceSources)
      ? values.evidenceSources
          .map((value) => text(value, 60))
          .filter((value) => ["manual", "photo", "video", "session", "challenge_attempt", "csv"].includes(value))
      : [];
    const evidenceReferences = {
      sources: Array.from(new Set([
        ...evidenceSources,
        relatedSessionId ? "session" : "",
      ].filter(Boolean))),
      linkedSessionId: relatedSessionId,
      linkedChallengeAttemptId: null,
    };
    const existingSnapshot = parseJson(attempt.source_snapshot_json, {});
    const outcome = evaluatePracticeOutcome({
      activity: {
        id: activity.id,
        userId: activity.user_id,
        coachId: activity.coach_id,
        activityType: activity.activity_type,
        focusArea: activity.focus_area,
        title: activity.title,
        instructions: parseJson(activity.instructions_json, {}),
        club: activity.club,
        durationMinutes: activity.duration_minutes,
        attemptCount: activity.attempt_count,
      },
      attempt: {
        completedShotCount,
        completedSetCount,
        completedMinutes,
        completedAmount: completed,
        memberDifficultyRating: difficulty.rating,
        memberConfidenceRating,
        trainingAidUsed,
        trainingAidHelpfulness,
        memberNotes,
      },
      linkedSession,
    }) as ReturnType<typeof evaluatePracticeOutcome>;
    const coachReviewStatus = coachReviewStatusForOutcome(activity, outcome);
    await database
      .prepare(
        `UPDATE practice_attempts
         SET status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
             completed_shot_count = ?, completed_set_count = ?, completed_minutes = ?,
             linked_session_id = ?, member_difficulty_rating = ?,
             member_difficulty_label = ?, member_confidence_rating = ?,
             member_completed_amount = ?, member_notes = ?, training_aid_used = ?,
             training_aid_helpfulness = ?, measured_outcome_json = ?,
             evaluation_json = ?, source_snapshot_json = ?, coach_review_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND practice_activity_id = ? AND user_id = ?`,
      )
      .bind(
        coachReviewStatus === "pending" ? "needs_review" : "completed",
        completedShotCount,
        completedSetCount,
        completedMinutes,
        relatedSessionId,
        difficulty.rating,
        difficulty.label || null,
        memberConfidenceRating,
        completed,
        memberNotes,
        trainingAidUsed,
        trainingAidHelpfulness,
        safeJson({
          linkedSessionId: relatedSessionId,
          measurementSource: outcome.measurementSource,
          evidence: outcome.evidence,
        }),
        safeJson({
          ...outcome,
          nextActionVisibility: nextActionVisibility(activity, outcome),
        }),
        safeJson({
          ...(existingSnapshot && typeof existingSnapshot === "object" ? existingSnapshot : {}),
          completion: {
            completedAmount: completed,
            evidenceReferences,
            reflectionFeeling: difficulty.label || null,
            submittedAt: new Date().toISOString(),
          },
        }),
        coachReviewStatus,
        attempt.id,
        activity.id,
        activity.user_id,
      )
      .run();
    const refreshedAttempt = await loadAttemptById(database, attempt.id) ?? attempt;
    const resultId = await upsertPracticeResultForAttempt(database, {
      activity,
      attempt: refreshedAttempt,
      evaluation: outcome,
      relatedSessionId,
      score,
      attempts,
      successfulAttempts,
      submissionType,
      notes,
      reflection,
      sharedWithCoach: coachReviewStatus === "pending" ? 1 : 0,
      mediaReferences: evidenceReferences,
    });
    const playerIntelligence = buildPracticeCompletionIntelligence({
      activity: {
        id: activity.id,
        userId: activity.user_id,
        coachId: activity.coach_id,
        activityType: activity.activity_type,
        focusArea: activity.focus_area,
        title: activity.title,
        instructions: parseJson(activity.instructions_json, {}),
        club: activity.club,
        durationMinutes: activity.duration_minutes,
        attemptCount: activity.attempt_count,
        status: activity.status,
      },
      attempt: refreshedAttempt,
      outcome,
      evidenceReferences,
      resultId,
    });
    await upsertPlayerCoachingContext(database, activity.user_id, playerIntelligence);
    await recordPracticeAttemptActivityOnce(database, {
      action: "player_intelligence_updated",
      actor: identity,
      entityId: attempt.id,
      entityType: "practice_attempt",
      memberId: activity.user_id,
      metadata: {
        activityId: activity.id,
        resultId,
        currentPracticePriority: playerIntelligence.currentPracticePriority,
        evidencePrimary: playerIntelligence.evidenceProvenance.primary,
        confidence: playerIntelligence.confidence,
      },
      summary: `Updated MAI Coach context from ${activity.title}.`,
      targetUserId: activity.user_id,
    });
    await database
      .prepare("UPDATE practice_activities SET status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(coachReviewStatus === "pending" ? "results_submitted" : "completed", activity.id)
      .run();
    const nextPlan = await createNextIndependentPracticePlanFromCompletion(identity, database, {
      activity,
      attempt: refreshedAttempt,
      outcome,
      intelligence: playerIntelligence,
      resultId,
    });
    await attachIntelligenceToPracticeResult(database, resultId, {
      intelligence: playerIntelligence,
      nextPlan,
    });
    const completionAction = completed === "partial" ? "practice_partially_completed" : "practice_completed";
    await recordPracticeAttemptActivityOnce(database, {
      action: completionAction,
      actor: identity,
      entityId: attempt.id,
      entityType: "practice_attempt",
      memberId: activity.user_id,
      metadata: {
        activityId: activity.id,
        resultId,
        activityType: activity.activity_type,
        focus: activity.focus_area,
        classification: outcome.classification,
        recommendedNextAction: outcome.recommendedNextAction,
        measurementSource: outcome.measurementSource,
        trainingAidUsed: trainingAidUsed === null ? null : trainingAidUsed === 1,
        trainingAidHelpfulness,
      },
      summary: `Completed ${activity.title}.`,
      targetUserId: activity.user_id,
    });
    if (difficulty.label || reflection || memberNotes) {
      await recordPracticeAttemptActivityOnce(database, {
        action: "practice_reflection_submitted",
        actor: identity,
        entityId: attempt.id,
        entityType: "practice_attempt",
        memberId: activity.user_id,
        metadata: {
          activityId: activity.id,
          reflectionFeeling: difficulty.label || null,
          hasNote: Boolean(memberNotes || reflection),
        },
        summary: `Submitted reflection for ${activity.title}.`,
        targetUserId: activity.user_id,
      });
    }
    if (evidenceReferences.sources.length > 0) {
      await recordPracticeAttemptActivityOnce(database, {
        action: "practice_evidence_added",
        actor: identity,
        entityId: attempt.id,
        entityType: "practice_attempt",
        memberId: activity.user_id,
        metadata: {
          activityId: activity.id,
          evidenceSources: evidenceReferences.sources,
          linkedSessionId: relatedSessionId,
        },
        summary: `Added practice evidence for ${activity.title}.`,
        targetUserId: activity.user_id,
      });
    }
    await recordPracticeAttemptActivityOnce(database, {
      action: practiceEventActionForOutcome(outcome),
      actor: identity,
      entityId: attempt.id,
      entityType: "practice_attempt",
      memberId: activity.user_id,
      metadata: {
        activityId: activity.id,
        classification: outcome.classification,
        evidence: outcomeEvidenceLabels(outcome),
      },
      summary: outcome.biggestWin,
      targetUserId: activity.user_id,
    });
    if (coachReviewStatus === "pending") {
      await recordPracticeAttemptActivityOnce(database, {
        action: "coach_review_requested",
        actor: identity,
        entityId: attempt.id,
        entityType: "practice_attempt",
        memberId: activity.user_id,
        metadata: {
          activityId: activity.id,
          coachId: activity.coach_id,
          recommendedNextAction: outcome.recommendedNextAction,
        },
        summary: `${activity.title} is ready for Coach review.`,
        targetUserId: activity.user_id,
      });
    }
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
  } else if (["approve_repeat", "approve_progress", "modify_practice_next", "replace_practice", "complete_priority", "change_training_aid"].includes(action)) {
    if (identity.role !== "coach" && identity.role !== "admin") {
      throw new Response("Only a Coach or Admin can review practice outcomes.", { status: 403 });
    }
    const latestAttempt = await database
      .prepare(
        `SELECT * FROM practice_attempts
         WHERE practice_activity_id = ? AND user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(activity.id, activity.user_id)
      .first<PracticeAttemptRow>();
    if (!latestAttempt) throw new Response("No practice attempt is ready for review.", { status: 404 });
    const reviewStatus = action === "approve_repeat"
      ? "approved_repeat"
      : action === "approve_progress"
        ? "approved_progress"
        : action === "modify_practice_next"
          ? "modified"
          : action === "replace_practice"
            ? "replaced"
            : action === "complete_priority"
              ? "priority_completed"
              : "training_aid_changed";
    const reviewNote = text(values.coachReviewNote, 2000);
    const existingEvaluation = parseJson(latestAttempt.evaluation_json, {});
    await database
      .prepare(
        `UPDATE practice_attempts
         SET coach_review_status = ?, coach_review_note = ?, coach_reviewed_by = ?,
             coach_reviewed_at = CURRENT_TIMESTAMP,
             evaluation_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        reviewStatus,
        reviewNote,
        identity.id,
        safeJson({
          ...(existingEvaluation && typeof existingEvaluation === "object" ? existingEvaluation : {}),
          coachReview: {
            status: reviewStatus,
            note: reviewNote,
            reviewedBy: identity.id,
            reviewedAt: new Date().toISOString(),
          },
        }),
        latestAttempt.id,
      )
      .run();
    if (action === "replace_practice") {
      await database
        .prepare("UPDATE practice_activities SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(activity.id)
        .run();
    }
    if (action === "complete_priority") {
      await database
        .prepare("UPDATE practice_activities SET status = 'completed', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(activity.id)
        .run();
    }
    await recordActivity({
      action: action === "approve_progress"
        ? "practice_progressed"
        : action === "replace_practice"
          ? "practice_replaced"
          : action === "complete_priority"
            ? "practice_priority_completed"
            : "practice_coach_reviewed",
      actor: identity,
      database,
      entityId: latestAttempt.id,
      entityType: "practice_attempt",
      memberId: activity.user_id,
      metadata: {
        activityId: activity.id,
        reviewStatus,
        coachId: identity.role === "coach" ? identity.id : activity.coach_id,
      },
      summary: `Reviewed ${activity.title}.`,
      targetUserId: activity.user_id,
    });
  } else if (["approve_training_aid", "modify_training_aid", "remove_training_aid", "reject_training_aid"].includes(action)) {
    if (identity.role !== "coach" && identity.role !== "admin") {
      throw new Response("Only a Coach or Admin can review training aid recommendations.", { status: 403 });
    }
    const instructions = parseJson(activity.instructions_json, {});
    const reviewAction = action === "approve_training_aid"
      ? "approve"
      : action === "modify_training_aid"
        ? "modify"
        : action === "remove_training_aid"
          ? "remove"
          : "reject";
    const updatedTrainingAid = applyCoachTrainingAidAction(
      instructions && typeof instructions === "object" && "trainingAid" in instructions
        ? (instructions as { trainingAid?: unknown }).trainingAid
        : null,
      reviewAction,
      {
        aidId: values.aidId,
        noEquipmentAlternative: values.noEquipmentAlternative,
        safetyNotes: Array.isArray(values.safetyNotes) ? values.safetyNotes : undefined,
        setupSteps: Array.isArray(values.setupSteps) ? values.setupSteps : undefined,
        whyItFits: values.whyItFits,
      },
    );
    await database
      .prepare("UPDATE practice_activities SET instructions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(safeJson({
        ...(instructions && typeof instructions === "object" ? instructions : {}),
        trainingAid: updatedTrainingAid,
      }), activity.id)
      .run();
    await recordActivity({
      action: reviewAction === "approve"
        ? "training_aid_approved"
        : reviewAction === "modify"
          ? "training_aid_modified"
          : reviewAction === "remove"
            ? "training_aid_removed"
            : "training_aid_rejected",
      actor: identity,
      database,
      entityId: activity.id,
      entityType: "practice_activity",
      memberId: activity.user_id,
      metadata: {
        aidId: updatedTrainingAid.aidId,
        activityType: activity.activity_type,
        focus: activity.focus_area,
      },
      summary: `Reviewed training aid for ${activity.title}.`,
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
