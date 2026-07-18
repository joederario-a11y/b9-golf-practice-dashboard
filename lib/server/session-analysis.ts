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
  sanitizeOpenAIError,
  type AuthIdentity,
} from "@/lib/server/platform";

const PROMPT_VERSION = "mai-caddy-v1";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MIN_USABLE_SHOTS = 3;

type AnalysisStatus = "processing" | "completed" | "failed" | "insufficient_data";

type StoredShot = ShotRecord & {
  club?: unknown;
  detectedMetrics?: unknown;
  metricSources?: unknown;
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
  analysis_source: "openai" | "measured_fallback" | null;
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

const metricSourceKeys: Record<keyof typeof metricFields, string> = {
  carry: "carry",
  totalDistance: "total",
  clubSpeed: "clubSpeed",
  ballSpeed: "ballSpeed",
  smashFactor: "smash",
  launchAngle: "launch",
  spinRate: "spin",
  clubPath: "clubPath",
  faceAngle: "faceAngle",
  faceToPath: "faceToPath",
  offlineDistance: "offline",
};

function metricSourceFor(shot: ShotRecord, metricKey: keyof typeof metricFields) {
  const sources = shot.metricSources;
  if (!isRecord(sources)) return null;
  const source = sources[metricSourceKeys[metricKey]];
  if (!isRecord(source)) return null;
  const kind = text(source.kind, "");
  if (!["measured", "manual", "derived", "estimated"].includes(kind)) return null;
  return {
    kind,
    confidence: numberFromValue(source.confidence),
    method: text(source.method, ""),
  };
}

function evidenceQuality(shots: ShotRecord[]) {
  const counts = {
    measured: 0,
    manual: 0,
    derived: 0,
    estimated: 0,
  };
  const estimatedMetrics = new Set<string>();
  for (const shot of shots) {
    if (!isRecord(shot.metricSources)) continue;
    Object.entries(shot.metricSources).forEach(([metric, source]) => {
      if (!isRecord(source)) return;
      const kind = text(source.kind, "");
      if (kind === "measured" || kind === "manual" || kind === "derived" || kind === "estimated") {
        counts[kind] += 1;
        if (kind === "estimated") estimatedMetrics.add(metric);
      }
    });
  }
  return {
    counts,
    estimatedMetrics: Array.from(estimatedMetrics),
    hasEstimatedValues: counts.estimated > 0,
  };
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
  const metricSources = Object.keys(metrics).reduce<Record<string, ReturnType<typeof metricSourceFor>>>((accumulator, key) => {
    const source = metricSourceFor(shot, key as keyof typeof metricFields);
    if (source) accumulator[key] = source;
    return accumulator;
  }, {});

  return {
    shotNumber: text(shot.sourceShotNumber, String(index + 1)),
    club: clubName(shot),
    shape: text(shot.shape, "Not recorded"),
    metrics,
    metricSources,
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

function defaultProfileContext(identity: AuthIdentity): Awaited<ReturnType<typeof loadProfileContext>> {
  return {
    profile: {
      profile: null,
      malformed: false,
      updatedAt: null,
    },
    player: {
      role: identity.role,
      skillLevel: "Not supplied",
      handicap: "Not supplied",
      dominantHand: "Not supplied",
      simulatorGoals: [],
      improvementGoals: [],
      frustrations: [],
      practiceStyle: [],
      availablePracticeTime: "Not supplied",
      frequency: "Not supplied",
      coachNotes: "",
      profileUpdatedAt: null,
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
  const evidence = evidenceQuality(values.session.shots);
  if (evidence.hasEstimatedValues) {
    limitations.add(`Some uploaded values are estimated (${evidence.estimatedMetrics.join(", ")}), so MAI Coach should prefer measured evidence for stronger conclusions.`);
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
  const evidence = evidenceQuality(validShots.length ? validShots : values.session.shots);
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
      evidence,
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
    headline: "MAI Coach needs a few more usable shots before giving a full session read.",
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
        whyThisFits: "A larger same-club sample lets MAI Coach identify carry, face/path, launch, and dispersion trends responsibly.",
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

function metricText(value: number | null | undefined, unit = "", digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NA";
  const rounded = roundMetric(value, digits);
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

function metricSummaryText(summary: SessionMetrics["metricSummaries"][string], unit = "", digits = 1) {
  if (!summary || summary.average === null) return "NA";
  const average = metricText(summary.average, unit, digits);
  const spread = summary.standardDeviation === null
    ? ""
    : `, ${metricText(summary.standardDeviation, unit, digits)} standard deviation`;
  return `${average} across ${summary.count} measured shot${summary.count === 1 ? "" : "s"}${spread}`;
}

function unitForMetricKey(key: string) {
  if (key === "smashFactor") return "";
  if (key === "spinRate") return "rpm";
  if (key.includes("Angle") || key.includes("Path")) return "deg";
  if (key === "clubSpeed" || key === "ballSpeed") return "mph";
  return "yd";
}

function digitsForMetricKey(key: string) {
  if (key === "smashFactor") return 2;
  if (key === "spinRate") return 0;
  return 1;
}

function deterministicIssueList(context: ReturnType<typeof buildAnalysisContext>): MaiCaddyAnalysisOutput["issues"] {
  const metrics = context.calculatedMetrics;
  const issues: MaiCaddyAnalysisOutput["issues"] = [];
  const smash = metrics.averageSmashFactor;
  const faceToPath = metrics.averageFaceToPath;
  const offlineSummary = metrics.metricSummaries.offlineDistance;
  const carrySummary = metrics.metricSummaries.carry;

  if (smash !== null && smash < 1.33) {
    issues.push({
      metric: "Smash factor",
      finding: "Contact efficiency is costing ball speed relative to club speed.",
      severity: smash < 1.28 ? "high" : "medium",
      evidence: `Average smash factor was ${metricText(smash, "", 2)}.`,
      certainty: "measured",
      possibleCause: "Strike location or delivered loft may be reducing energy transfer.",
    });
  }

  if (faceToPath !== null && Math.abs(faceToPath) >= 2.5) {
    issues.push({
      metric: "Face-to-path",
      finding: "Face and path are separated enough to influence curve control.",
      severity: Math.abs(faceToPath) >= 4.5 ? "high" : "medium",
      evidence: `Average face-to-path was ${metricText(faceToPath, "deg")}.`,
      certainty: "measured",
      possibleCause: "Face control and path delivery may not be matching the intended shot shape.",
    });
  }

  if (offlineSummary?.standardDeviation !== null && offlineSummary?.standardDeviation !== undefined && offlineSummary.standardDeviation >= 7.5) {
    issues.push({
      metric: "Offline distance",
      finding: "Dispersion is wide enough to make target selection harder.",
      severity: offlineSummary.standardDeviation >= 12 ? "high" : "medium",
      evidence: `Offline distance spread was ${metricSummaryText(offlineSummary, "yd")}.`,
      certainty: "measured",
      possibleCause: "Start line, curve control, or strike quality may be moving together.",
    });
  }

  if (carrySummary?.standardDeviation !== null && carrySummary?.standardDeviation !== undefined && carrySummary.standardDeviation >= 10) {
    issues.push({
      metric: "Carry distance",
      finding: "Carry distance varied enough to affect front-to-back distance control.",
      severity: carrySummary.standardDeviation >= 15 ? "high" : "medium",
      evidence: `Carry distance was ${metricSummaryText(carrySummary, "yd")}.`,
      certainty: "measured",
      possibleCause: "Contact consistency, launch, or spin variation may be changing peak height and landing distance.",
    });
  }

  return issues.slice(0, 4);
}

function deterministicPrimaryPriority(context: ReturnType<typeof buildAnalysisContext>): MaiCaddyAnalysisOutput["primaryPriority"] {
  const firstIssue = deterministicIssueList(context)[0];
  if (firstIssue) {
    return {
      title: firstIssue.metric === "Smash factor" ? "Tighten contact before chasing speed" : `Stabilize ${firstIssue.metric.toLowerCase()}`,
      whyItMatters: firstIssue.finding,
      evidence: firstIssue.evidence,
    };
  }

  return {
    title: "Turn this baseline into a repeatable target window",
    whyItMatters: "The session has enough measured data to begin tracking trends, but the next useful step is repeating the same club and target.",
    evidence: `${context.dataQuality.usableShotCount} usable shots were available for ${context.session.primaryClub}.`,
  };
}

function deterministicSessionAnalysis(
  context: ReturnType<typeof buildAnalysisContext>,
): MaiCaddyAnalysisOutput {
  const metrics = context.calculatedMetrics;
  const available = availableMetrics(metrics);
  const limitations = Array.from(new Set([
    ...context.dataQuality.limitations,
    "Live model generation did not complete, so this report uses stored shot data and MAI Coach measured-metric rules.",
  ]));
  const issues = deterministicIssueList(context);
  const primaryPriority = deterministicPrimaryPriority(context);
  const carry = metricText(metrics.averageCarry, "yd");
  const total = metricText(metrics.averageTotalDistance, "yd");
  const smash = metricText(metrics.averageSmashFactor, "", 2);
  const launch = metricText(metrics.averageLaunchAngle, "deg");
  const tendency = metrics.leftRightTendency.available
    ? `${metrics.leftRightTendency.dominant} tendency with average offline ${metricText(metrics.leftRightTendency.averageOffline, "yd")}`
    : "offline tendency unavailable";
  const confidence = Math.min(
    0.82,
    Math.max(0.55, 0.52 + Math.min(context.dataQuality.usableShotCount, 12) * 0.025 + available.length * 0.01),
  );

  const analysis: MaiCaddyAnalysisOutput = {
    headline: `MAI Coach reviewed this ${context.session.primaryClub} session from measured launch-monitor data.`,
    dataQuality: {
      confidence: confidence >= 0.72 ? "medium" : "low",
      usableShotCount: context.dataQuality.usableShotCount,
      limitations,
    },
    sessionSummary: `${context.session.title} includes ${context.dataQuality.usableShotCount} usable ${context.session.primaryClub} shots. Average carry was ${carry}, total was ${total}, smash factor was ${smash}, and launch was ${launch}. Directionally, the saved shot data shows ${tendency}.`,
    measuredFindings: available.slice(0, 6).map((metric) => ({
      metric: metric.label,
      value: metricSummaryText(metric, unitForMetricKey(metric.key), digitsForMetricKey(metric.key)),
      meaning: "This is calculated only from saved, detected shot measurements for this session.",
    })),
    strengths: [
      {
        title: "Enough same-session data for a baseline",
        evidence: `${context.dataQuality.usableShotCount} usable shots were saved in this session.`,
      },
      {
        title: "Distance and delivery metrics were preserved",
        evidence: `${available.length} metric groups were available for review without converting missing values to zero.`,
      },
    ],
    primaryPriority,
    issues,
    practicePlan: [
      {
        drill: "Centered contact ladder",
        problemAddressed: primaryPriority.title,
        whyThisFits: "The saved metrics point first to contact quality and repeatability before adding more swing speed.",
        setup: `Hit three sets of five ${context.session.primaryClub} shots, resetting after each swing and recording strike location when possible.`,
        feel: "Balanced finish, centered strike, and a committed target line.",
        metricToMonitor: metrics.averageSmashFactor !== null ? "Smash factor" : "Carry distance",
        measurableTarget: metrics.averageSmashFactor !== null
          ? "Move smash factor closer to 1.34 or better for this club."
          : "Keep carry dispersion inside a 10-yard window.",
        durationOrSwingCount: "15 swings",
        progressionRule: "Only add speed when at least 10 of 15 swings finish inside the intended target window.",
      },
      {
        drill: "Start-line gate",
        problemAddressed: "Shot direction and curve control",
        whyThisFits: "Face, path, and side-distance numbers are most useful when paired with a clear starting window.",
        setup: "Pick a start line and create a narrow visual gate 10 to 15 feet in front of the ball.",
        feel: "Start the ball through the gate, then let the curve happen naturally.",
        metricToMonitor: "Face-to-path and side total",
        measurableTarget: "Keep face-to-path inside about 3 degrees and side total inside 10 yards.",
        durationOrSwingCount: "10 swings",
        progressionRule: "Tighten the gate only after seven of ten balls start through it.",
      },
    ],
    nextSessionGoal: `Repeat a ${context.session.primaryClub} block with the same target and compare carry, smash factor, face-to-path, and side total.`,
    progressComparison: {
      available: metrics.previousSessionComparison.available,
      summary: metrics.previousSessionComparison.summary,
    },
    courseRelevance: "Use the average carry and dispersion window from this session as the starting point for safer target selection until a larger trend is built.",
    followUpQuestion: "Were all of these shots aimed at the same target line?",
    confidence: roundMetric(confidence, 2),
  };

  assertNoDisallowedAnalysisContent(analysis);
  return analysis;
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned an invalid ${key}.`);
  }
  return value.trim();
}

function getEnum<T extends string>(record: Record<string, unknown>, key: string, values: readonly T[]) {
  const value = getString(record, key);
  if (!values.includes(value as T)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned an invalid ${key}.`);
  }
  return value as T;
}

function getNumber(record: Record<string, unknown>, key: string, options: { min?: number; max?: number } = {}) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned an invalid ${key}.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned ${key} below the allowed range.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned ${key} above the allowed range.`);
  }
  return value;
}

function getObject(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!isRecord(value)) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned an invalid ${key}.`);
  }
  return value;
}

function getStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new AnalysisError(502, "schema_validation_failed", `MAI Coach returned an invalid ${key}.`);
  }
  return value;
}

function validateAnalysisOutput(value: unknown): MaiCaddyAnalysisOutput {
  if (!isRecord(value)) {
    throw new AnalysisError(502, "schema_validation_failed", "MAI Coach did not return structured analysis.");
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
    throw new AnalysisError(502, "schema_validation_failed", "MAI Coach did not return valid structured analysis.");
  }
}

async function callOpenAI(context: ReturnType<typeof buildAnalysisContext>, model: string) {
  const runtime = getPlatformEnvironment();
  if (!runtime.OPENAI_API_KEY) {
    throw new AnalysisError(503, "openai_api_key_missing", "MAI Coach is not connected yet. Add OPENAI_API_KEY to the Worker environment and retry.");
  }

  const client = new OpenAI({
    apiKey: runtime.OPENAI_API_KEY,
    timeout: 45000,
  });
  const prompt = [
    "Analyze this stored golf simulator session using only the supplied application data.",
    "Do not calculate arithmetic already provided in calculatedMetrics.",
    "Do not name individual professional golfers. Tour Twin and professional-player matching are disabled.",
    "Separate measured facts from likely explanations. Prefer measured or manually confirmed evidence over derived values, and use estimated values only with caution.",
    "If the dataQuality evidence says estimated values are material, mention that limitation discreetly.",
    "If profile data is missing, state that limitation.",
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
    throw new AnalysisError(502, "empty_openai_response", "MAI Coach did not return a readable analysis.");
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
    throw new AnalysisError(409, "analysis_already_processing", "MAI Coach is already analyzing this session. Try again in a moment.");
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
          id, user_id, session_id, status, analysis_json, calculated_metrics_json, analysis_source, model,
          prompt_version, is_current, started_at, created_at, updated_at
        )
        VALUES (?, ?, ?, 'processing', '{}', '{}', 'openai', ?, ?, 1, ?, ?, ?)`,
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
  analysisSource: "openai" | "measured_fallback";
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
           analysis_source = ?,
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
      values.analysisSource,
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
  const diagnostic = sanitizeOpenAIError(error, {
    endpoint: "responses.create",
    model: getPlatformEnvironment().OPENAI_ANALYSIS_MODEL || getPlatformEnvironment().OPENAI_MODEL || DEFAULT_MODEL,
    operation: "session_analysis",
  });
  const message = error instanceof Error ? error.message : "MAI Coach could not analyze this session.";
  if (/rate.?limit/i.test(message)) {
    return new AnalysisError(429, diagnostic.category || "openai_rate_limited", "MAI Coach is busy right now. Please retry in a minute.");
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return new AnalysisError(504, diagnostic.category || "openai_timeout", "MAI Coach took too long to respond. Please retry.");
  }
  return new AnalysisError(502, diagnostic.category || "openai_request_failed", "MAI Coach could not complete this analysis. Please retry.");
}

function serializeAnalysis(row: AnalysisRow, session: StoredSession | null = null) {
  const analysis = safeParseJson(row.analysis_json, "malformed_analysis_json", "Saved MAI Coach analysis could not be read.");
  const calculatedMetrics = safeParseJson(row.calculated_metrics_json, "malformed_metrics_json", "Saved MAI Coach metrics could not be read.");
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
    analysisSource: row.analysis_source ?? (row.model?.startsWith("fallback:") ? "measured_fallback" : "openai"),
    promptVersion: row.prompt_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    generatedAt: row.completed_at ?? row.updated_at ?? row.created_at,
    error: row.error_code
      ? {
          code: row.error_code,
          message: row.error_message ?? "MAI Coach could not complete this analysis.",
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
  const model = getPlatformEnvironment().OPENAI_ANALYSIS_MODEL || getPlatformEnvironment().OPENAI_MODEL || DEFAULT_MODEL;
  let fallbackContext: ReturnType<typeof buildAnalysisContext> | null = null;
  let fallbackMetrics: SessionMetrics | null = null;
  let fallbackSession: StoredSession | null = null;
  let fallbackSessions: StoredSession[] | null = null;

  try {
    const { session, sessions } = await loadOwnedSession(identity, sessionId, database);
    fallbackSession = session;
    fallbackSessions = sessions;
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
    fallbackContext = context;
    fallbackMetrics = metrics;

    let analysis: MaiCaddyAnalysisOutput;
    let status: AnalysisStatus;
    let analysisSource: "openai" | "measured_fallback" = "openai";
    let savedModel = model;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (metrics.validShotCount < MIN_USABLE_SHOTS) {
      analysis = insufficientDataAnalysis(context);
      status = "insufficient_data";
      analysisSource = "measured_fallback";
    } else {
      try {
        analysis = await callOpenAI(context, model);
        status = "completed";
      } catch (error) {
        const safe = analysisError(error);
        const canUseMeasuredFallback = [
          "invalid_api_key",
          "insufficient_quota",
          "model_not_found",
          "model_access_denied",
          "openai_request_failed",
          "openai_rate_limited",
          "rate_limit",
          "openai_timeout",
          "timeout",
          "empty_openai_response",
          "empty_response",
          "payload_too_large",
        ].includes(safe.code);

        if (!canUseMeasuredFallback) {
          throw error;
        }

        analysis = deterministicSessionAnalysis(context);
        status = "completed";
        analysisSource = "measured_fallback";
        savedModel = `fallback:${model}`;
        errorCode = safe.code;
        errorMessage = safe.message;
      }
    }

    await updateAnalysisRecord({
      database,
      analysisId,
      identity,
      status,
      analysisSource,
      analysis,
      metrics,
      model: savedModel,
      errorCode,
      errorMessage,
    });

    const row = await database
      .prepare("SELECT * FROM mai_caddy_session_analyses WHERE id = ? AND user_id = ?")
      .bind(analysisId, identity.id)
      .first<AnalysisRow>();

    if (!row) {
      throw new AnalysisError(500, "analysis_save_failed", "MAI Coach analysis was created but could not be loaded.");
    }

    return Response.json(serializeAnalysis(row, session));
  } catch (error) {
    const safe = analysisError(error);
    if (analysisId) {
      if (safe.status >= 500) {
        try {
          const loaded =
            fallbackSession && fallbackSessions
              ? { session: fallbackSession, sessions: fallbackSessions }
              : await loadOwnedSession(identity, sessionId, database);
          const sessionForFallback = loaded.session;
          const sessionsForFallback = loaded.sessions;
          const metricsForFallback =
            fallbackMetrics ??
            calculateSessionMetrics(
              sessionForFallback.shots,
              previousComparableShots(sessionForFallback, sessionsForFallback),
            );
          const playerContext = await loadProfileContext(identity, database).catch(() => defaultProfileContext(identity));
          const context =
            fallbackContext ??
            buildAnalysisContext({
              identity,
              session: sessionForFallback,
              sessions: sessionsForFallback,
              metrics: metricsForFallback,
              playerContext,
            });
          const analysis = deterministicSessionAnalysis(context);
          await updateAnalysisRecord({
            database,
            analysisId,
            identity,
            status: "completed",
            analysisSource: "measured_fallback",
            analysis,
            metrics: metricsForFallback,
            model: `fallback:${model}`,
            errorCode: safe.code,
            errorMessage: safe.message,
          });
          return Response.json({
            analysisId,
            sessionId: sessionForFallback.id,
            status: "completed",
            analysis,
            calculatedMetrics: metricsForFallback,
            model: `fallback:${model}`,
            analysisSource: "measured_fallback",
            promptVersion: PROMPT_VERSION,
            startedAt: null,
            completedAt: new Date().toISOString(),
            generatedAt: new Date().toISOString(),
            error: {
              code: safe.code,
              message: safe.message,
            },
            contextSummary: contextSummary(sessionForFallback, metricsForFallback),
          });
        } catch {
          // Fall through to the controlled failure path if even the measured fallback cannot be saved.
        }
      }
      try {
        await updateAnalysisRecord({
          database,
          analysisId,
          identity,
          status: "failed",
          analysisSource: "openai",
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
