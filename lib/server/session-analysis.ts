import OpenAI from "openai";

import { MAI_CADDY_CORE_INSTRUCTIONS } from "@/lib/mai-caddy-instructions";
import { assertNoDisallowedAnalysisContent } from "@/lib/server/mai-caddy-analysis-safety";
import {
  calculateSessionMetrics,
  isUsableShot,
  metricFields,
  metricValue,
  roundMetric,
  type SessionMetrics,
  type ShotRecord,
} from "@/lib/server/mai-caddy-metrics";
import {
  ensureMaiCaddyAnalysisSchema,
  ensurePlatformSchema,
  ensureUserDataOwnershipSchema,
  getPlatformEnvironment,
  getRequiredDatabase,
  type AuthIdentity,
} from "@/lib/server/platform";

const PROMPT_VERSION = "mai-caddy-v1";
const DEFAULT_MODEL = "gpt-5.6-terra";
const MIN_USABLE_SHOTS = 3;

type AnalysisStatus = "processing" | "completed" | "failed" | "insufficient_data";

type StoredShot = ShotRecord & {
  club?: unknown;
  detectedMetrics?: unknown;
};

type StoredSession = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus: string;
  location?: string;
  importNotes?: string;
  missingMetrics?: string[];
  shots: StoredShot[];
};

type UserRow = {
  skill_level?: string | null;
  notes?: string | null;
};

type ProfileRow = {
  profile_json: string;
  updated_at: string;
};

type AnalysisRow = {
  id: string;
  user_id: string;
  session_id: string;
  status: AnalysisStatus;
  analysis_json: string;
  calculated_metrics_json: string;
  model: string | null;
  prompt_version: string;
  error_code: string | null;
  error_message: string | null;
  is_current: number | boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaiCaddyAnalysisOutput = {
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

const analysisSchema = {
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

const metricLabels: Record<keyof typeof metricFields, string> = {
  ballSpeed: "Ball speed",
  carry: "Carry",
  clubPath: "Club path",
  clubSpeed: "Club speed",
  faceAngle: "Face angle",
  faceToPath: "Face-to-path",
  launchAngle: "Launch angle",
  offlineDistance: "Offline distance",
  smashFactor: "Smash factor",
  spinRate: "Spin rate",
  totalDistance: "Total distance",
};

class AnalysisError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeParseJson(value: string, code: string, message: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AnalysisError(500, code, message);
  }
}

function normalizeStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  const shots = Array.isArray(value.shots)
    ? value.shots.filter((shot): shot is StoredShot => isRecord(shot))
    : [];

  return {
    id,
    title: text(value.title, "Untitled session"),
    date: text(value.date, "Date unavailable"),
    source: text(value.source, "Unknown source"),
    focus: text(value.focus, "Session analysis"),
    location: text(value.location),
    importNotes: text(value.importNotes),
    missingMetrics: Array.isArray(value.missingMetrics)
      ? value.missingMetrics.filter((metric): metric is string => typeof metric === "string")
      : [],
    shots,
  };
}

function parseSessionsJson(value: string) {
  const parsed = safeParseJson(
    value,
    "malformed_sessions_json",
    "Your saved session data could not be read. Please re-save the session or contact support.",
  );
  if (!Array.isArray(parsed)) {
    throw new AnalysisError(500, "malformed_sessions_json", "Your saved session data is not in the expected format.");
  }

  return parsed.flatMap((session) => {
    const normalized = normalizeStoredSession(session);
    return normalized ? [normalized] : [];
  });
}

async function prepareDatabase(database: D1Database) {
  await ensurePlatformSchema(database);
  await ensureUserDataOwnershipSchema(database);
  await ensureMaiCaddyAnalysisSchema(database);
}

async function loadOwnedSession(identity: AuthIdentity, sessionId: string, database: D1Database) {
  const row = await database
    .prepare("SELECT sessions_json, updated_at FROM golf_session_snapshots WHERE user_id = ?")
    .bind(identity.id)
    .first<{ sessions_json: string; updated_at: string }>();

  if (!row) {
    throw new AnalysisError(404, "sessions_not_found", "No saved sessions were found for this account.");
  }

  const sessions = parseSessionsJson(row.sessions_json);
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new AnalysisError(404, "session_not_found", "That saved session was not found for this account.");
  }

  return {
    session,
    sessions,
    updatedAt: row.updated_at,
  };
}

function clubName(shot: ShotRecord) {
  return text(shot.club, "Unknown club");
}

function dominantClub(shots: ShotRecord[]) {
  const counts = shots.reduce<Record<string, number>>((accumulator, shot) => {
    const club = clubName(shot);
    accumulator[club] = (accumulator[club] ?? 0) + 1;
    return accumulator;
  }, {});
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Unknown club";
}

function previousComparableShots(session: StoredSession, sessions: StoredSession[]) {
  const validShots = session.shots.filter(isUsableShot);
  const primaryClub = dominantClub(validShots.length ? validShots : session.shots);
  const currentDate = Date.parse(session.date);

  const candidates = sessions
    .filter((candidate) => candidate.id !== session.id)
    .filter((candidate) => !Number.isFinite(currentDate) || Date.parse(candidate.date) <= currentDate)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));

  const previous = candidates.find((candidate) => candidate.shots.some((shot) => clubName(shot) === primaryClub));
  return previous?.shots.filter((shot) => clubName(shot) === primaryClub) ?? [];
}

function compactShot(shot: ShotRecord, index: number) {
  const metrics = Object.entries(metricFields).reduce<Record<string, number>>((accumulator, [key, fields]) => {
    const value = metricValue(shot, fields, key as keyof typeof metricFields);
    if (value !== null) {
      accumulator[key] = roundMetric(value, key === "smashFactor" ? 2 : 1);
    }
    return accumulator;
  }, {});

  return {
    shotNumber: text(shot.sourceShotNumber, String(index + 1)),
    club: clubName(shot),
    shape: text(shot.shape, "Not recorded"),
    metrics,
  };
}

function availableMetrics(metrics: SessionMetrics) {
  return Object.entries(metrics.metricSummaries)
    .filter(([, summary]) => summary.count > 0)
    .map(([key, summary]) => ({
      key,
      label: metricLabels[key as keyof typeof metricFields] ?? key,
      ...summary,
    }));
}

function missingMetrics(metrics: SessionMetrics) {
  return Object.entries(metrics.metricSummaries)
    .filter(([, summary]) => summary.count === 0)
    .map(([key]) => metricLabels[key as keyof typeof metricFields] ?? key);
}

function parseProfile(row: ProfileRow | null) {
  if (!row) {
    return {
      profile: null,
      malformed: false,
      updatedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(row.profile_json) as unknown;
    return {
      profile: isRecord(parsed) ? parsed : null,
      malformed: !isRecord(parsed),
      updatedAt: row.updated_at,
    };
  } catch {
    return {
      profile: null,
      malformed: true,
      updatedAt: row.updated_at,
    };
  }
}

async function loadProfileContext(identity: AuthIdentity, database: D1Database) {
  const [profileRow, userRow] = await Promise.all([
    database
      .prepare("SELECT profile_json, updated_at FROM golf_practice_profiles WHERE user_id = ?")
      .bind(identity.id)
      .first<ProfileRow>(),
    database
      .prepare("SELECT skill_level, notes FROM users WHERE id = ?")
      .bind(identity.id)
      .first<UserRow>(),
  ]);
  const profile = parseProfile(profileRow ?? null);
  const profileRecord = profile.profile ?? {};

  return {
    profile,
    player: {
      role: text(profileRecord.role, identity.role),
      skillLevel: text(profileRecord.skillLevel, text(userRow?.skill_level, "Not supplied")),
      handicap: text(profileRecord.handicap, "Not supplied"),
      dominantHand: text(profileRecord.handedness, "Not supplied"),
      simulatorGoals: Array.isArray(profileRecord.simulatorGoals) ? profileRecord.simulatorGoals : [],
      improvementGoals: Array.isArray(profileRecord.goals) ? profileRecord.goals : [],
      frustrations: Array.isArray(profileRecord.frustrations) ? profileRecord.frustrations : [],
      practiceStyle: Array.isArray(profileRecord.practiceStyle) ? profileRecord.practiceStyle : [],
      availablePracticeTime: text(profileRecord.timeAvailable, "Not supplied"),
      frequency: text(profileRecord.frequency, "Not supplied"),
      coachNotes: text(profileRecord.coachNotes, text(userRow?.notes, "")),
      profileUpdatedAt: profile.updatedAt,
    },
  };
}

function contextSummary(session: StoredSession, metrics: SessionMetrics) {
  return {
    shotCount: session.shots.length,
    validShotCount: metrics.validShotCount,
    clubs: Array.from(new Set(session.shots.map(clubName))),
    missingMetrics: missingMetrics(metrics),
  };
}

function dataQualityLimitations(values: {
  session: StoredSession;
  metrics: SessionMetrics;
  profileMalformed: boolean;
  profileMissing: boolean;
}) {
  const limitations = new Set<string>();
  if (values.profileMissing) {
    limitations.add("Practice profile is missing, so recommendations use session data only.");
  }
  if (values.profileMalformed) {
    limitations.add("Practice profile could not be read, so recommendations use session data only.");
  }
  if (values.metrics.validShotCount < values.session.shots.length) {
    limitations.add("Some shots were excluded because they were marked invalid, deleted, warm-up, or outlier.");
  }
  values.session.missingMetrics?.forEach((metric) => limitations.add(`${metric} was unavailable in the upload.`));
  missingMetrics(values.metrics)
    .filter((metric) => ["Club path", "Face angle", "Face-to-path", "Spin rate", "Offline distance"].includes(metric))
    .forEach((metric) => limitations.add(`${metric} was not available for this session.`));
  if (!values.metrics.previousSessionComparison.available) {
    limitations.add(values.metrics.previousSessionComparison.summary);
  }
  return Array.from(limitations);
}

function buildAnalysisContext(values: {
  identity: AuthIdentity;
  session: StoredSession;
  sessions: StoredSession[];
  metrics: SessionMetrics;
  playerContext: Awaited<ReturnType<typeof loadProfileContext>>;
}) {
  const validShots = values.session.shots.filter(isUsableShot);
  const profileMissing = !values.playerContext.profile.profile;
  const limitations = dataQualityLimitations({
    session: values.session,
    metrics: values.metrics,
    profileMalformed: values.playerContext.profile.malformed,
    profileMissing,
  });

  return {
    promptVersion: PROMPT_VERSION,
    player: values.playerContext.player,
    session: {
      id: values.session.id,
      title: values.session.title,
      date: values.session.date,
      source: values.session.source,
      focus: values.session.focus,
      location: values.session.location || null,
      notes: values.session.importNotes || null,
      shotCount: values.session.shots.length,
      validShotCount: values.metrics.validShotCount,
      primaryClub: dominantClub(validShots.length ? validShots : values.session.shots),
      clubs: Array.from(new Set(values.session.shots.map(clubName))),
    },
    calculatedMetrics: {
      ...values.metrics,
      availableMetrics: availableMetrics(values.metrics),
      missingMetrics: missingMetrics(values.metrics),
    },
    representativeShots: validShots.slice(0, 30).map(compactShot),
    previousComparableSession: values.metrics.previousSessionComparison,
    dataQuality: {
      limitations,
      usableShotCount: values.metrics.validShotCount,
    },
    appSuppliedBenchmarkGroups: [
      "high-handicap",
      "mid-handicap",
      "low-handicap",
      "scratch",
      "competitive amateur",
      "LPGA average",
      "PGA TOUR average",
    ],
    disabledFeatures: {
      tourTwin: true,
      professionalPlayerMatching: true,
      screenshotExtraction: true,
      csvExtraction: true,
    },
  };
}

function insufficientDataAnalysis(context: ReturnType<typeof buildAnalysisContext>): MaiCaddyAnalysisOutput {
  const limitations = context.dataQuality.limitations.length
    ? context.dataQuality.limitations
    : ["At least three usable shots are needed for a reliable coaching pattern."];

  return {
    headline: "MAI Caddy needs a few more usable shots before giving a full session read.",
    dataQuality: {
      confidence: "low",
      usableShotCount: context.dataQuality.usableShotCount,
      limitations,
    },
    sessionSummary: `${context.session.title} has ${context.dataQuality.usableShotCount} usable shot${context.dataQuality.usableShotCount === 1 ? "" : "s"} for ${context.session.primaryClub}. That is not enough to separate a real pattern from one-off swings.`,
    measuredFindings: availableMetrics(context.calculatedMetrics)
      .slice(0, 4)
      .map((metric) => ({
        metric: metric.label,
        value: metric.average === null ? "NA" : `${metric.average}`,
        meaning: "Available, but the sample is too small for a reliable trend.",
      })),
    strengths: [],
    primaryPriority: {
      title: "Build a reliable sample first",
      whyItMatters: "A short sample can make a normal miss look like a swing pattern.",
      evidence: `Only ${context.dataQuality.usableShotCount} usable shots were available.`,
    },
    issues: [],
    practicePlan: [
      {
        drill: "Baseline block",
        problemAddressed: "Not enough comparable shots",
        whyThisFits: "A larger same-club sample lets MAI Caddy identify carry, face/path, launch, and dispersion trends responsibly.",
        setup: `Hit 8 to 12 more ${context.session.primaryClub} shots with the same target line and normal routine.`,
        feel: "Make normal swings instead of chasing a correction.",
        metricToMonitor: "Carry distance and offline distance",
        measurableTarget: "Record at least 8 usable shots with the same club.",
        durationOrSwingCount: "8-12 swings",
        progressionRule: "Rerun analysis after the sample reaches at least three usable shots, preferably eight or more.",
      },
    ],
    nextSessionGoal: "Upload a same-club block with at least 8 usable swings.",
    progressComparison: {
      available: false,
      summary: context.calculatedMetrics.previousSessionComparison.summary,
    },
    courseRelevance: "A larger sample will make the next recommendation more useful for choosing targets and managing misses on the course.",
    followUpQuestion: "Were these shots all aimed at the same target?",
    confidence: 0.25,
  };
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned an invalid ${key}.`);
  }
  return value.trim();
}

function getEnum<T extends string>(record: Record<string, unknown>, key: string, values: readonly T[]) {
  const value = getString(record, key);
  if (!values.includes(value as T)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned an invalid ${key}.`);
  }
  return value as T;
}

function getNumber(record: Record<string, unknown>, key: string, options: { min?: number; max?: number } = {}) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned an invalid ${key}.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned ${key} below the allowed range.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned ${key} above the allowed range.`);
  }
  return value;
}

function getObject(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!isRecord(value)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned an invalid ${key}.`);
  }
  return value;
}

function getStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Caddy returned an invalid ${key}.`);
  }
  return value;
}

function validateAnalysisOutput(value: unknown): MaiCaddyAnalysisOutput {
  if (!isRecord(value)) {
    throw new AnalysisError(502, "schema_validation_failed", "MAI Caddy did not return structured analysis.");
  }

  const dataQuality = getObject(value, "dataQuality");
  const primaryPriority = getObject(value, "primaryPriority");
  const progressComparison = getObject(value, "progressComparison");
  const analysis: MaiCaddyAnalysisOutput = {
    headline: getString(value, "headline"),
    dataQuality: {
      confidence: getEnum(dataQuality, "confidence", ["low", "medium", "high"] as const),
      usableShotCount: getNumber(dataQuality, "usableShotCount", { min: 0 }),
      limitations: getStringArray(dataQuality, "limitations"),
    },
    sessionSummary: getString(value, "sessionSummary"),
    measuredFindings: (Array.isArray(value.measuredFindings) ? value.measuredFindings : []).map((item) => {
      if (!isRecord(item)) throw new AnalysisError(502, "schema_validation_failed", "Invalid measured finding.");
      return {
        metric: getString(item, "metric"),
        value: getString(item, "value"),
        meaning: getString(item, "meaning"),
      };
    }),
    strengths: (Array.isArray(value.strengths) ? value.strengths : []).map((item) => {
      if (!isRecord(item)) throw new AnalysisError(502, "schema_validation_failed", "Invalid strength.");
      return {
        title: getString(item, "title"),
        evidence: getString(item, "evidence"),
      };
    }),
    primaryPriority: {
      title: getString(primaryPriority, "title"),
      whyItMatters: getString(primaryPriority, "whyItMatters"),
      evidence: getString(primaryPriority, "evidence"),
    },
    issues: (Array.isArray(value.issues) ? value.issues : []).map((item) => {
      if (!isRecord(item)) throw new AnalysisError(502, "schema_validation_failed", "Invalid issue.");
      const possibleCause = item.possibleCause;
      return {
        metric: getString(item, "metric"),
        finding: getString(item, "finding"),
        severity: getEnum(item, "severity", ["low", "medium", "high"] as const),
        evidence: getString(item, "evidence"),
        certainty: getEnum(item, "certainty", ["measured", "strongly_suggested", "possible"] as const),
        possibleCause: typeof possibleCause === "string" ? possibleCause : null,
      };
    }),
    practicePlan: (Array.isArray(value.practicePlan) ? value.practicePlan : []).map((item) => {
      if (!isRecord(item)) throw new AnalysisError(502, "schema_validation_failed", "Invalid practice plan.");
      return {
        drill: getString(item, "drill"),
        problemAddressed: getString(item, "problemAddressed"),
        whyThisFits: getString(item, "whyThisFits"),
        setup: getString(item, "setup"),
        feel: getString(item, "feel"),
        metricToMonitor: getString(item, "metricToMonitor"),
        measurableTarget: getString(item, "measurableTarget"),
        durationOrSwingCount: getString(item, "durationOrSwingCount"),
        progressionRule: getString(item, "progressionRule"),
      };
    }),
    nextSessionGoal: getString(value, "nextSessionGoal"),
    progressComparison: {
      available: typeof progressComparison.available === "boolean" ? progressComparison.available : false,
      summary: getString(progressComparison, "summary"),
    },
    courseRelevance: getString(value, "courseRelevance"),
    followUpQuestion: typeof value.followUpQuestion === "string" ? value.followUpQuestion : null,
    confidence: getNumber(value, "confidence", { min: 0, max: 1 }),
  };

  assertNoDisallowedAnalysisContent(analysis);
  return analysis;
}

function parseOpenAIOutput(outputText: string) {
  try {
    return validateAnalysisOutput(JSON.parse(outputText) as unknown);
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    throw new AnalysisError(502, "schema_validation_failed", "MAI Caddy did not return valid structured analysis.");
  }
}

async function callOpenAI(context: ReturnType<typeof buildAnalysisContext>, model: string) {
  const runtime = getPlatformEnvironment();
  if (!runtime.OPENAI_API_KEY) {
    throw new AnalysisError(503, "openai_api_key_missing", "MAI Caddy is not connected yet. Add OPENAI_API_KEY to the Worker environment and retry.");
  }

  const client = new OpenAI({
    apiKey: runtime.OPENAI_API_KEY,
    timeout: 45000,
  });
  const prompt = [
    "Analyze this stored golf simulator session using only the supplied application data.",
    "Do not calculate arithmetic already provided in calculatedMetrics.",
    "Do not name individual professional golfers. Tour Twin and professional-player matching are disabled.",
    "Separate measured facts from likely explanations. If profile data is missing, state that limitation.",
    "",
    JSON.stringify(context),
  ].join("\n");

  const response = await client.responses.create({
    model,
    instructions: MAI_CADDY_CORE_INSTRUCTIONS,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "mai_caddy_session_analysis",
        strict: true,
        schema: analysisSchema,
      },
      verbosity: "medium",
    },
    max_output_tokens: 3200,
    safety_identifier: context.session.id,
    store: false,
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new AnalysisError(502, "empty_openai_response", "MAI Caddy did not return a readable analysis.");
  }
  return parseOpenAIOutput(outputText);
}

async function startProcessingAnalysis(database: D1Database, identity: AuthIdentity, sessionId: string, model: string) {
  const processing = await database
    .prepare(
      `SELECT id, started_at
       FROM mai_caddy_session_analyses
       WHERE user_id = ? AND session_id = ? AND is_current = 1 AND status = 'processing'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(identity.id, sessionId)
    .first<{ id: string; started_at: string | null }>();

  if (processing?.started_at && Date.now() - new Date(processing.started_at).getTime() < 1000 * 60 * 3) {
    throw new AnalysisError(409, "analysis_already_processing", "MAI Caddy is already analyzing this session. Try again in a moment.");
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database.batch([
    database
      .prepare(
        `UPDATE mai_caddy_session_analyses
         SET is_current = 0, updated_at = ?
         WHERE user_id = ? AND session_id = ? AND is_current = 1`,
      )
      .bind(now, identity.id, sessionId),
    database
      .prepare(
        `INSERT INTO mai_caddy_session_analyses (
          id, user_id, session_id, status, analysis_json, calculated_metrics_json, model,
          prompt_version, is_current, started_at, created_at, updated_at
        )
        VALUES (?, ?, ?, 'processing', '{}', '{}', ?, ?, 1, ?, ?, ?)`,
      )
      .bind(id, identity.id, sessionId, model, PROMPT_VERSION, now, now, now),
  ]);

  return id;
}

async function updateAnalysisRecord(values: {
  database: D1Database;
  analysisId: string;
  identity: AuthIdentity;
  status: AnalysisStatus;
  analysis: MaiCaddyAnalysisOutput | null;
  metrics: SessionMetrics | null;
  model: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const now = new Date().toISOString();
  await values.database
    .prepare(
      `UPDATE mai_caddy_session_analyses
       SET status = ?,
           analysis_json = ?,
           calculated_metrics_json = ?,
           model = ?,
           prompt_version = ?,
           error_code = ?,
           error_message = ?,
           completed_at = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      values.status,
      JSON.stringify(values.analysis ?? {}),
      JSON.stringify(values.metrics ?? {}),
      values.model,
      PROMPT_VERSION,
      values.errorCode ?? null,
      values.errorMessage ?? null,
      now,
      now,
      values.analysisId,
      values.identity.id,
    )
    .run();
}

function analysisError(error: unknown) {
  if (error instanceof AnalysisError) return error;
  const message = error instanceof Error ? error.message : "MAI Caddy could not analyze this session.";
  if (/rate.?limit/i.test(message)) {
    return new AnalysisError(429, "openai_rate_limited", "MAI Caddy is busy right now. Please retry in a minute.");
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return new AnalysisError(504, "openai_timeout", "MAI Caddy took too long to respond. Please retry.");
  }
  return new AnalysisError(502, "openai_request_failed", "MAI Caddy could not complete this analysis. Please retry.");
}

function serializeAnalysis(row: AnalysisRow, session: StoredSession | null = null) {
  const analysis = safeParseJson(row.analysis_json, "malformed_analysis_json", "Saved MAI Caddy analysis could not be read.");
  const calculatedMetrics = safeParseJson(row.calculated_metrics_json, "malformed_metrics_json", "Saved MAI Caddy metrics could not be read.");
  const metricsRecord = isRecord(calculatedMetrics) && isRecord(calculatedMetrics.metricSummaries)
    ? calculatedMetrics as unknown as SessionMetrics
    : null;
  const validatedAnalysis = row.status === "completed" || row.status === "insufficient_data"
    ? validateAnalysisOutput(analysis)
    : null;

  return {
    analysisId: row.id,
    sessionId: row.session_id,
    status: row.status,
    analysis: validatedAnalysis,
    calculatedMetrics,
    model: row.model,
    promptVersion: row.prompt_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    generatedAt: row.completed_at ?? row.updated_at ?? row.created_at,
    error: row.error_code
      ? {
          code: row.error_code,
          message: row.error_message ?? "MAI Caddy could not complete this analysis.",
        }
      : null,
    contextSummary: session && metricsRecord
      ? contextSummary(session, metricsRecord)
      : null,
  };
}

export async function getStoredSessionAnalysis(identity: AuthIdentity, sessionId: string) {
  try {
    const database = getRequiredDatabase();
    await prepareDatabase(database);
    const { session } = await loadOwnedSession(identity, sessionId, database);
    const row = await database
      .prepare(
        `SELECT *
         FROM mai_caddy_session_analyses
         WHERE user_id = ? AND session_id = ? AND is_current = 1
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(identity.id, sessionId)
      .first<AnalysisRow>();

    if (!row) {
      return Response.json({
        status: "not_analyzed",
        sessionId,
        message: "This saved session has not been analyzed yet.",
      }, { status: 404 });
    }

    return Response.json(serializeAnalysis(row, session));
  } catch (error) {
    const safe = analysisError(error);
    return Response.json({
      status: "failed",
      sessionId,
      error: {
        code: safe.code,
        message: safe.message,
      },
    }, { status: safe.status });
  }
}

export async function analyzeStoredSession(identity: AuthIdentity, sessionId: string) {
  const database = getRequiredDatabase();
  await prepareDatabase(database);

  let analysisId: string | null = null;
  const model = getPlatformEnvironment().OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const { session, sessions } = await loadOwnedSession(identity, sessionId, database);
    if (!session.shots.length) {
      throw new AnalysisError(400, "empty_session", "This session does not contain shot data to analyze.");
    }

    analysisId = await startProcessingAnalysis(database, identity, session.id, model);
    const playerContext = await loadProfileContext(identity, database);
    const previousShots = previousComparableShots(session, sessions);
    const metrics = calculateSessionMetrics(session.shots, previousShots);
    const context = buildAnalysisContext({
      identity,
      session,
      sessions,
      metrics,
      playerContext,
    });

    const analysis = metrics.validShotCount < MIN_USABLE_SHOTS
      ? insufficientDataAnalysis(context)
      : await callOpenAI(context, model);
    const status: AnalysisStatus = metrics.validShotCount < MIN_USABLE_SHOTS ? "insufficient_data" : "completed";
    await updateAnalysisRecord({
      database,
      analysisId,
      identity,
      status,
      analysis,
      metrics,
      model,
    });

    const row = await database
      .prepare("SELECT * FROM mai_caddy_session_analyses WHERE id = ? AND user_id = ?")
      .bind(analysisId, identity.id)
      .first<AnalysisRow>();

    if (!row) {
      throw new AnalysisError(500, "analysis_save_failed", "MAI Caddy analysis was created but could not be loaded.");
    }

    return Response.json(serializeAnalysis(row, session));
  } catch (error) {
    const safe = analysisError(error);
    if (analysisId) {
      try {
        await updateAnalysisRecord({
          database,
          analysisId,
          identity,
          status: "failed",
          analysis: null,
          metrics: null,
          model,
          errorCode: safe.code,
          errorMessage: safe.message,
        });
      } catch {
        // Avoid leaking D1 internals in the HTTP response if failure recording also fails.
      }
    }
    return Response.json({
      status: "failed",
      sessionId,
      error: {
        code: safe.code,
        message: safe.message,
      },
    }, { status: safe.status });
  }
}
