// deno-lint-ignore-file no-explicit-any
import OpenAI from "npm:openai@6";
import { createClient } from "npm:@supabase/supabase-js@2";

import { jsonResponse } from "../_shared/cors.ts";
import { MAI_CADDY_INSTRUCTIONS } from "../_shared/mai-caddy-instructions.ts";
import { assertNoDisallowedAnalysisContent } from "./analysis-safety.ts";
import {
  calculateSessionMetrics,
  isUsableShot,
  metricValue,
  type SessionMetrics,
  type ShotRecord,
} from "./metrics.ts";

type SupabaseClient = ReturnType<typeof createClient>;
type DbRecord = Record<string, unknown>;

type AnalysisOutput = {
  headline: string;
  dataQuality: {
    confidence: "low" | "medium" | "high";
    usableShotCount: number;
    limitations: string[];
  };
  sessionSummary: string;
  measuredFindings: Array<{
    metric: string;
    value: string;
    meaning: string;
  }>;
  strengths: Array<{
    title: string;
    evidence: string;
  }>;
  primaryPriority: {
    title: string;
    whyItMatters: string;
    evidence: string;
  };
  issues: Array<{
    metric: string;
    finding: string;
    severity: "low" | "medium" | "high";
    evidence: string;
    certainty: "measured" | "strongly_suggested" | "possible";
    possibleCause: string | null;
  }>;
  practicePlan: Array<{
    drill: string;
    problemAddressed: string;
    whyThisFits: string;
    setup: string;
    feel: string;
    metricToMonitor: string;
    measurableTarget: string;
    durationOrSwingCount: string;
    progressionRule: string;
  }>;
  nextSessionGoal: string;
  progressComparison: {
    available: boolean;
    summary: string;
  };
  courseRelevance: string;
  followUpQuestion: string | null;
  confidence: number;
};

type TableConfig = {
  sessionsTable: string;
  sessionIdColumn: string;
  sessionPlayerColumn: string;
  shotsTable: string | null;
  shotSessionColumn: string;
  profilesTable: string | null;
  profileUserColumn: string;
};

const promptVersion = "mai-caddy-v1";
const fallbackModel = "gpt-5.6-terra";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tableNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const metricFieldNames = {
  carry: ["carry", "carryDistance", "carry_distance", "carryYards", "carry_yards"],
  totalDistance: ["total", "totalDistance", "total_distance", "totalYards", "total_yards"],
  clubSpeed: ["clubSpeed", "club_speed", "clubHeadSpeed", "club_head_speed"],
  ballSpeed: ["ballSpeed", "ball_speed"],
  smashFactor: ["smash", "smashFactor", "smash_factor"],
  launchAngle: ["launch", "launchAngle", "launch_angle"],
  spinRate: ["spin", "spinRate", "spin_rate"],
  clubPath: ["clubPath", "club_path"],
  faceAngle: ["faceAngle", "face_angle"],
  faceToPath: ["faceToPath", "face_to_path"],
  offlineDistance: ["offline", "offlineDistance", "offline_distance", "sideCarry", "sideTotal"],
} satisfies Record<string, string[]>;

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "dataQuality",
    "sessionSummary",
    "measuredFindings",
    "strengths",
    "primaryPriority",
    "issues",
    "practicePlan",
    "nextSessionGoal",
    "progressComparison",
    "courseRelevance",
    "followUpQuestion",
    "confidence",
  ],
  properties: {
    headline: { type: "string" },
    dataQuality: {
      type: "object",
      additionalProperties: false,
      required: ["confidence", "usableShotCount", "limitations"],
      properties: {
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        usableShotCount: { type: "number" },
        limitations: { type: "array", items: { type: "string" } },
      },
    },
    sessionSummary: { type: "string" },
    measuredFindings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "value", "meaning"],
        properties: {
          metric: { type: "string" },
          value: { type: "string" },
          meaning: { type: "string" },
        },
      },
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    primaryPriority: {
      type: "object",
      additionalProperties: false,
      required: ["title", "whyItMatters", "evidence"],
      properties: {
        title: { type: "string" },
        whyItMatters: { type: "string" },
        evidence: { type: "string" },
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "finding", "severity", "evidence", "certainty", "possibleCause"],
        properties: {
          metric: { type: "string" },
          finding: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          evidence: { type: "string" },
          certainty: { type: "string", enum: ["measured", "strongly_suggested", "possible"] },
          possibleCause: { type: ["string", "null"] },
        },
      },
    },
    practicePlan: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "drill",
          "problemAddressed",
          "whyThisFits",
          "setup",
          "feel",
          "metricToMonitor",
          "measurableTarget",
          "durationOrSwingCount",
          "progressionRule",
        ],
        properties: {
          drill: { type: "string" },
          problemAddressed: { type: "string" },
          whyThisFits: { type: "string" },
          setup: { type: "string" },
          feel: { type: "string" },
          metricToMonitor: { type: "string" },
          measurableTarget: { type: "string" },
          durationOrSwingCount: { type: "string" },
          progressionRule: { type: "string" },
        },
      },
    },
    nextSessionGoal: { type: "string" },
    progressComparison: {
      type: "object",
      additionalProperties: false,
      required: ["available", "summary"],
      properties: {
        available: { type: "boolean" },
        summary: { type: "string" },
      },
    },
    courseRelevance: { type: "string" },
    followUpQuestion: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

class SafeHttpError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function safeText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeIdentifier(value: string | undefined, fallback: string | null) {
  const normalized = (value ?? fallback ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (!tableNamePattern.test(normalized)) {
    throw new SafeHttpError(500, "invalid_table_configuration", "Session analysis storage is not configured correctly.");
  }

  return normalized;
}

function getTableConfig(): TableConfig {
  const sessionsTable = normalizeIdentifier(
    Deno.env.get("MAI_CADDY_SESSIONS_TABLE") ?? Deno.env.get("MAI_CADDY_SESSION_TABLE"),
    null,
  );

  if (!sessionsTable) {
    throw new SafeHttpError(
      500,
      "session_table_not_configured",
      "Session analysis storage is not configured yet.",
    );
  }

  return {
    sessionsTable,
    sessionIdColumn: normalizeIdentifier(Deno.env.get("MAI_CADDY_SESSION_ID_COLUMN"), "id") ?? "id",
    sessionPlayerColumn: normalizeIdentifier(Deno.env.get("MAI_CADDY_SESSION_PLAYER_COLUMN"), "user_id") ?? "user_id",
    shotsTable:
      normalizeIdentifier(Deno.env.get("MAI_CADDY_SHOTS_TABLE") ?? Deno.env.get("MAI_CADDY_SHOT_TABLE"), null),
    shotSessionColumn: normalizeIdentifier(Deno.env.get("MAI_CADDY_SHOT_SESSION_COLUMN"), "session_id") ?? "session_id",
    profilesTable:
      normalizeIdentifier(Deno.env.get("MAI_CADDY_PROFILES_TABLE") ?? Deno.env.get("MAI_CADDY_PROFILE_TABLE"), null),
    profileUserColumn: normalizeIdentifier(Deno.env.get("MAI_CADDY_PROFILE_USER_COLUMN"), "id") ?? "id",
  };
}

function getSupabaseUrl() {
  const value = Deno.env.get("SUPABASE_URL");
  if (!value) {
    throw new SafeHttpError(500, "supabase_url_missing", "Supabase is not configured for analysis.");
  }
  return value;
}

function getAnonKey() {
  const value = Deno.env.get("SUPABASE_ANON_KEY");
  if (!value) {
    throw new SafeHttpError(500, "supabase_anon_key_missing", "Supabase is not configured for analysis.");
  }
  return value;
}

function getServiceRoleKey() {
  const value = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) {
    throw new SafeHttpError(
      500,
      "supabase_service_role_key_missing",
      "Trusted analysis storage is not configured.",
    );
  }
  return value;
}

function createUserClient(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new SafeHttpError(401, "missing_authorization", "Please sign in before analyzing a session.");
  }

  return createClient(getSupabaseUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function authenticate(userClient: SupabaseClient) {
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw new SafeHttpError(401, "invalid_authorization", "Please sign in before analyzing a session.");
  }

  return data.user;
}

function ownerValue(record: DbRecord, configuredColumn: string) {
  return safeText(
    record[configuredColumn] ??
      record.user_id ??
      record.player_id ??
      record.profile_id ??
      record.member_id ??
      record.owner_id,
    100,
  );
}

async function loadSession(userClient: SupabaseClient, config: TableConfig, sessionId: string, userId: string) {
  const { data, error } = await userClient
    .from(config.sessionsTable)
    .select("*")
    .eq(config.sessionIdColumn, sessionId)
    .maybeSingle();

  if (error) {
    console.error("MAI Caddy session lookup failed.", { code: error.code });
    throw new SafeHttpError(500, "session_lookup_failed", "The session could not be loaded.");
  }

  if (!data) {
    throw new SafeHttpError(404, "session_not_found", "That session was not found.");
  }

  const owner = ownerValue(data, config.sessionPlayerColumn);
  if (owner && owner !== userId) {
    throw new SafeHttpError(403, "session_forbidden", "You do not have access to this session.");
  }

  return data as DbRecord;
}

async function loadProfile(userClient: SupabaseClient, config: TableConfig, userId: string) {
  if (!config.profilesTable) {
    return null;
  }

  const { data, error } = await userClient
    .from(config.profilesTable)
    .select("*")
    .eq(config.profileUserColumn, userId)
    .maybeSingle();

  if (error) {
    console.error("MAI Caddy profile lookup failed.", { code: error.code });
    return null;
  }

  return (data as DbRecord | null) ?? null;
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is ShotRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parseJsonArray(parsed);
    } catch {
      return [];
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as DbRecord;
    return parseJsonArray(record.shots ?? record.rows ?? record.data);
  }

  return [];
}

function embeddedShots(session: DbRecord) {
  return parseJsonArray(session.shots ?? session.shots_json ?? session.shot_data ?? session.data);
}

async function loadShots(userClient: SupabaseClient, config: TableConfig, session: DbRecord, sessionId: string) {
  if (!config.shotsTable) {
    const shots = embeddedShots(session);
    if (shots.length > 0) {
      return shots;
    }

    throw new SafeHttpError(
      500,
      "shot_table_not_configured",
      "Shot data is not configured for session analysis yet.",
    );
  }

  const { data, error } = await userClient
    .from(config.shotsTable)
    .select("*")
    .eq(config.shotSessionColumn, sessionId)
    .limit(1000);

  if (error) {
    console.error("MAI Caddy shot lookup failed.", { code: error.code });
    throw new SafeHttpError(500, "shot_lookup_failed", "The shot data could not be loaded.");
  }

  return ((data ?? []) as ShotRecord[]).filter((shot) => Boolean(shot) && typeof shot === "object");
}

function stringFromRecord(record: DbRecord | null, keys: string[]) {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value = safeText(record[key], 200);
    if (value) {
      return value;
    }
  }

  return "";
}

function shotClub(shot: ShotRecord) {
  return safeText(shot.club ?? shot.club_name ?? shot.clubName ?? shot.selectedClub, 100);
}

function mostCommonClub(shots: ShotRecord[]) {
  const counts = new Map<string, number>();
  for (const shot of shots) {
    const club = shotClub(shot);
    if (club) {
      counts.set(club, (counts.get(club) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function compactSessionContext(session: DbRecord, profile: DbRecord | null, shots: ShotRecord[]) {
  const club =
    stringFromRecord(session, ["club", "club_used", "clubUsed", "primary_club", "primaryClub"]) ||
    mostCommonClub(shots) ||
    "Unknown club";

  return {
    session: {
      id: safeText(session.id, 100),
      title: stringFromRecord(session, ["title", "name", "session_name", "sessionName"]) || "Untitled session",
      date: stringFromRecord(session, ["date", "session_date", "sessionDate", "created_at", "createdAt"]) || null,
      club,
      notes:
        stringFromRecord(session, ["notes", "player_notes", "playerNotes", "import_notes", "importNotes"]) ||
        null,
      source: stringFromRecord(session, ["source", "import_source", "importSource", "simulator"]) || null,
    },
    player: {
      handicap: stringFromRecord(profile, ["handicap", "handicap_index", "handicapIndex"]) || null,
      skillLevel: stringFromRecord(profile, ["skill_level", "skillLevel", "level"]) || null,
      dominantHand: stringFromRecord(profile, ["dominant_hand", "dominantHand", "handedness"]) || null,
      improvementGoals:
        stringFromRecord(profile, ["improvement_goals", "improvementGoals", "goals", "practice_goals"]) ||
        null,
    },
  };
}

async function loadPreviousComparableShots(
  userClient: SupabaseClient,
  config: TableConfig,
  sessionId: string,
  userId: string,
  club: string,
) {
  if (!club) {
    return [];
  }

  const { data, error } = await userClient
    .from(config.sessionsTable)
    .select("*")
    .eq(config.sessionPlayerColumn, userId)
    .neq(config.sessionIdColumn, sessionId)
    .limit(25);

  if (error || !data?.length) {
    if (error) {
      console.error("MAI Caddy comparable session lookup skipped.", { code: error.code });
    }
    return [];
  }

  for (const candidate of data as DbRecord[]) {
    const embedded = embeddedShots(candidate);
    const candidateClub =
      stringFromRecord(candidate, ["club", "club_used", "clubUsed", "primary_club", "primaryClub"]) ||
      mostCommonClub(embedded);
    if (candidateClub !== club) {
      continue;
    }

    const candidateId = safeText(candidate[config.sessionIdColumn] ?? candidate.id, 100);
    if (!candidateId) {
      continue;
    }

    if (!config.shotsTable) {
      return embedded;
    }

    const { data: previousShots, error: shotError } = await userClient
      .from(config.shotsTable)
      .select("*")
      .eq(config.shotSessionColumn, candidateId)
      .limit(1000);

    if (shotError) {
      console.error("MAI Caddy comparable shot lookup skipped.", { code: shotError.code });
      continue;
    }

    return ((previousShots ?? []) as ShotRecord[]).filter((shot) => Boolean(shot) && typeof shot === "object");
  }

  return [];
}

function compactShotForPrompt(shot: ShotRecord, index: number) {
  const metrics = Object.entries(metricFieldNames).reduce<Record<string, number>>((values, [metric, fields]) => {
    const value = metricValue(shot, fields);
    if (value !== null) {
      values[metric] = value;
    }
    return values;
  }, {});

  return {
    shotNumber: safeText(shot.shot_number ?? shot.shotNumber ?? shot.number, 40) || String(index + 1),
    club: shotClub(shot) || null,
    metrics,
  };
}

async function startAnalysis(serviceClient: SupabaseClient, sessionId: string, userId: string, model: string) {
  const { data, error } = await serviceClient.rpc("mai_caddy_start_session_analysis", {
    p_session_id: sessionId,
    p_player_id: userId,
    p_prompt_version: promptVersion,
    p_model: model,
  });

  if (error || !data) {
    console.error("MAI Caddy analysis start failed.", { code: error?.code });
    throw new SafeHttpError(500, "analysis_start_failed", "The analysis could not be started.");
  }

  return String(data);
}

async function completeAnalysis(
  serviceClient: SupabaseClient,
  analysisId: string,
  userId: string,
  analysis: AnalysisOutput,
  metrics: SessionMetrics,
  model: string,
) {
  const { data, error } = await serviceClient.rpc("mai_caddy_complete_session_analysis", {
    p_analysis_id: analysisId,
    p_player_id: userId,
    p_analysis: analysis,
    p_calculated_metrics: metrics,
    p_model: model,
    p_prompt_version: promptVersion,
  });

  if (error || !data) {
    console.error("MAI Caddy analysis completion failed.", { code: error?.code });
    throw new SafeHttpError(500, "analysis_save_failed", "The analysis could not be saved.");
  }

  return data as DbRecord;
}

async function failAnalysis(
  serviceClient: SupabaseClient | null,
  analysisId: string | null,
  userId: string | null,
  code: string,
  message: string,
) {
  if (!serviceClient || !analysisId || !userId) {
    return;
  }

  const { error } = await serviceClient.rpc("mai_caddy_fail_session_analysis", {
    p_analysis_id: analysisId,
    p_player_id: userId,
    p_error_code: code,
    p_error_message: message,
  });

  if (error) {
    console.error("MAI Caddy failed-state save failed.", { code: error.code });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== "string" || !record[key]) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }
}

function validateNamedStringArray(value: unknown, keys: string[], maxItems = 8) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  for (const item of value) {
    if (!isObject(item)) {
      throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
    }
    for (const key of keys) {
      requireString(item, key);
    }
  }
}

function validateAnalysis(value: unknown): AnalysisOutput {
  if (!isObject(value)) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  for (const key of ["headline", "sessionSummary", "nextSessionGoal", "courseRelevance"]) {
    requireString(value, key);
  }

  if (!isObject(value.dataQuality)) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  if (!["low", "medium", "high"].includes(String(value.dataQuality.confidence))) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  if (typeof value.dataQuality.usableShotCount !== "number" || value.dataQuality.usableShotCount < 0) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  if (!Array.isArray(value.dataQuality.limitations)) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  validateNamedStringArray(value.measuredFindings, ["metric", "value", "meaning"], 12);
  validateNamedStringArray(value.strengths, ["title", "evidence"], 3);

  if (!isObject(value.primaryPriority)) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }
  for (const key of ["title", "whyItMatters", "evidence"]) {
    requireString(value.primaryPriority, key);
  }

  if (!Array.isArray(value.issues) || value.issues.length > 6) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }
  for (const issue of value.issues) {
    if (!isObject(issue)) {
      throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
    }
    for (const key of ["metric", "finding", "evidence"]) {
      requireString(issue, key);
    }
    if (!["low", "medium", "high"].includes(String(issue.severity))) {
      throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
    }
    if (!["measured", "strongly_suggested", "possible"].includes(String(issue.certainty))) {
      throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
    }
    if (issue.possibleCause !== null && typeof issue.possibleCause !== "string") {
      throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
    }
  }

  validateNamedStringArray(
    value.practicePlan,
    [
      "drill",
      "problemAddressed",
      "whyThisFits",
      "setup",
      "feel",
      "metricToMonitor",
      "measurableTarget",
      "durationOrSwingCount",
      "progressionRule",
    ],
    3,
  );

  if (!isObject(value.progressComparison) || typeof value.progressComparison.available !== "boolean") {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }
  requireString(value.progressComparison, "summary");

  if (value.followUpQuestion !== null && typeof value.followUpQuestion !== "string") {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
    throw new SafeHttpError(502, "invalid_model_output", "The analysis response was not valid.");
  }

  try {
    assertNoDisallowedAnalysisContent(value);
  } catch {
    throw new SafeHttpError(
      502,
      "disallowed_model_output",
      "The analysis response included a disallowed professional comparison.",
    );
  }

  return value as AnalysisOutput;
}

function buildInsufficientDataAnalysis(metrics: SessionMetrics): AnalysisOutput {
  return {
    headline: "More usable shot data is needed before MAI Caddy can coach this session responsibly.",
    dataQuality: {
      confidence: "low",
      usableShotCount: metrics.validShotCount,
      limitations: [
        "Fewer than three usable shots were available.",
        "MAI Caddy did not infer missing measurements or create coaching conclusions from incomplete data.",
      ],
    },
    sessionSummary: "This session was saved, but it does not contain enough usable launch-monitor data for a reliable swing analysis.",
    measuredFindings: [
      {
        metric: "Usable shots",
        value: String(metrics.validShotCount),
        meaning: "A responsible analysis needs at least three valid, non-warm-up shots with measurable data.",
      },
    ],
    strengths: [],
    primaryPriority: {
      title: "Upload or record more complete shots",
      whyItMatters: "MAI Caddy needs repeated measurements before it can separate a trend from a one-off result.",
      evidence: `${metrics.validShotCount} usable shots were available.`,
    },
    issues: [
      {
        metric: "Data volume",
        finding: "The session has too few usable shots for coaching recommendations.",
        severity: "medium",
        evidence: `${metrics.validShotCount} usable shots were available.`,
        certainty: "measured",
        possibleCause: null,
      },
    ],
    practicePlan: [
      {
        drill: "Capture a baseline set",
        problemAddressed: "Not enough data for analysis",
        whyThisFits: "A small baseline creates a reliable trend without guessing.",
        setup: "Hit 8 to 10 normal shots with the same club and keep all launch-monitor columns visible.",
        feel: "Make normal swings instead of trying to fix anything during the capture.",
        metricToMonitor: "Carry, offline, launch, spin, club path, face angle, and face-to-path",
        measurableTarget: "At least 8 valid shots with carry and direction data",
        durationOrSwingCount: "8 to 10 swings",
        progressionRule: "Run MAI Caddy again after the baseline set is uploaded.",
      },
    ],
    nextSessionGoal: "Upload a same-club baseline with at least 8 valid shots.",
    progressComparison: {
      available: false,
      summary: "No reliable progress comparison is available yet.",
    },
    courseRelevance: "Reliable course guidance depends on a larger sample of shot patterns.",
    followUpQuestion: null,
    confidence: 0.2,
  };
}

function buildPromptPayload(
  session: DbRecord,
  profile: DbRecord | null,
  shots: ShotRecord[],
  previousShots: ShotRecord[],
  metrics: SessionMetrics,
) {
  const validShots = shots.filter(isUsableShot);
  const context = compactSessionContext(session, profile, validShots);

  return {
    promptVersion,
    instructions: {
      tourTwinEnabled: false,
      professionalPlayerMatchingEnabled: false,
      useOnlyAppSuppliedMeasurements: true,
      doNotPerformArithmetic: true,
      maxPracticePlanItems: 3,
    },
    context,
    deterministicMetrics: metrics,
    validShots: validShots.slice(0, 120).map(compactShotForPrompt),
    previousComparableShots: previousShots.filter(isUsableShot).slice(0, 80).map(compactShotForPrompt),
    broadBenchmarkGroupsAllowed: [
      "high-handicap",
      "mid-handicap",
      "low-handicap",
      "scratch",
      "competitive amateur",
      "LPGA average",
      "PGA TOUR average",
    ],
    outputContract: "Return only the strict JSON object matching the provided schema.",
  };
}

async function callOpenAI(payload: Record<string, unknown>, model: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new SafeHttpError(503, "openai_api_key_missing", "AI analysis is not configured yet.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model,
    instructions: MAI_CADDY_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mai_caddy_session_analysis",
        strict: true,
        schema: analysisJsonSchema,
      },
    },
    max_output_tokens: 3200,
  });

  const outputText = (response as any).output_text;
  if (typeof outputText !== "string" || !outputText.trim()) {
    throw new SafeHttpError(502, "empty_model_output", "The analysis response was empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new SafeHttpError(502, "invalid_model_json", "The analysis response was not valid JSON.");
  }

  return validateAnalysis(parsed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse(req, { ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);
  }

  let analysisId: string | null = null;
  let userId: string | null = null;
  let serviceClient: SupabaseClient | null = null;

  try {
    const payload = await req.json().catch(() => null);
    const sessionId = safeText(isObject(payload) ? payload.sessionId : "", 100);

    if (!uuidPattern.test(sessionId)) {
      throw new SafeHttpError(400, "invalid_session_id", "Choose a valid saved session to analyze.");
    }

    const userClient = createUserClient(req);
    const user = await authenticate(userClient);
    userId = user.id;
    const config = getTableConfig();

    const session = await loadSession(userClient, config, sessionId, user.id);

    serviceClient = createServiceClient();
    const model = Deno.env.get("OPENAI_MODEL")?.trim() || fallbackModel;
    analysisId = await startAnalysis(serviceClient, sessionId, user.id, model);

    const profile = await loadProfile(userClient, config, user.id);
    const shots = await loadShots(userClient, config, session, sessionId);
    const validShots = shots.filter(isUsableShot);
    const club = compactSessionContext(session, profile, validShots).session.club;
    const previousComparableShots = await loadPreviousComparableShots(userClient, config, sessionId, user.id, club);
    const metrics = calculateSessionMetrics(shots, previousComparableShots);

    if (metrics.validShotCount < 3) {
      const analysis = buildInsufficientDataAnalysis(metrics);
      const record = await completeAnalysis(serviceClient, analysisId, user.id, analysis, metrics, model);
      return jsonResponse(req, { ok: true, analysisId, record, analysis, calculatedMetrics: metrics });
    }

    const promptPayload = buildPromptPayload(session, profile, shots, previousComparableShots, metrics);
    const analysis = await callOpenAI(promptPayload, model);
    const record = await completeAnalysis(serviceClient, analysisId, user.id, analysis, metrics, model);

    return jsonResponse(req, { ok: true, analysisId, record, analysis, calculatedMetrics: metrics });
  } catch (error) {
    const safeError =
      error instanceof SafeHttpError
        ? error
        : new SafeHttpError(500, "analysis_failed", "The analysis could not be completed.");

    console.error("MAI Caddy analysis request failed.", { code: safeError.code, status: safeError.status });
    await failAnalysis(serviceClient, analysisId, userId, safeError.code, safeError.message);

    return jsonResponse(
      req,
      {
        ok: false,
        code: safeError.code,
        error: safeError.message,
      },
      safeError.status,
    );
  }
});
