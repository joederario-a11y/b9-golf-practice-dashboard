export const NUMERIC_SHOT_METRICS = [
  "proximity",
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "apex",
  "spin",
  "spinAxis",
  "launch",
  "descent",
  "horizontalAngle",
  "attackAngle",
  "faceAngle",
  "clubPath",
  "faceToPath",
  "sideCarry",
  "sideTotal",
  "offline",
  "curve",
  "swingPlane",
];

const POSITIVE_EVIDENCE_METRICS = new Set([
  "proximity",
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "apex",
  "spin",
  "launch",
  "descent",
]);

const SIGNED_EVIDENCE_METRICS = new Set([
  "spinAxis",
  "horizontalAngle",
  "attackAngle",
  "faceAngle",
  "clubPath",
  "faceToPath",
  "sideCarry",
  "sideTotal",
  "offline",
  "curve",
  "swingPlane",
]);

const DEMO_SESSION_IDS = new Set([
  "fullswing-6iron-photo",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
]);

const DEMO_SESSION_TITLES = new Set([
  "Full Swing 6-Iron photo import",
  "Driver start-line block",
  "Approach ladder",
  "Wedge matrix",
  "Pre-round tune",
  "Full bag baseline",
  "Long iron strike",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "", maxLength = 240) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function finiteNumber(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numericMetricEntries(shot) {
  return NUMERIC_SHOT_METRICS.flatMap((metric) => {
    const value = finiteNumber(shot?.[metric]);
    return value === undefined ? [] : [[metric, value]];
  });
}

export function isLikelyDemoSession(session) {
  if (!isRecord(session)) return false;
  if (session.isDemo === true || session.demo === true || session.sourceMode === "demo") return true;
  const id = text(session.id, "", 180);
  if (id.startsWith("demo-") || DEMO_SESSION_IDS.has(id)) return true;
  const title = text(session.title, "", 180);
  return DEMO_SESSION_TITLES.has(title) && !text(session.importNotes, "", 400);
}

export function hasMeaningfulShotMetrics(shot) {
  if (!isRecord(shot) || !text(shot.club, "", 80)) return false;
  const metrics = numericMetricEntries(shot);
  const hasPositiveEvidence = metrics.some(([metric, value]) => (
    POSITIVE_EVIDENCE_METRICS.has(metric) && value > 0
  ));
  const hasMultipleSignedMetrics = metrics.filter(([metric]) => SIGNED_EVIDENCE_METRICS.has(metric)).length >= 2;
  return hasPositiveEvidence || hasMultipleSignedMetrics;
}

export function sanitizeShot(shot, fallbackId = "") {
  if (!isRecord(shot)) return null;
  const club = text(shot.club, "", 80);
  if (!club) return null;

  const sanitized = {
    ...shot,
    id: text(shot.id, fallbackId, 180) || fallbackId || crypto.randomUUID(),
    club,
    shape: text(shot.shape, "NA", 80),
  };

  for (const metric of NUMERIC_SHOT_METRICS) {
    const value = finiteNumber(shot[metric]);
    if (value === undefined) {
      delete sanitized[metric];
    } else {
      sanitized[metric] = value;
    }
  }

  if (Array.isArray(shot.detectedMetrics)) {
    sanitized.detectedMetrics = shot.detectedMetrics
      .filter((metric) => NUMERIC_SHOT_METRICS.includes(metric))
      .slice(0, NUMERIC_SHOT_METRICS.length);
  } else {
    delete sanitized.detectedMetrics;
  }

  if (!hasMeaningfulShotMetrics(sanitized)) return null;
  return sanitized;
}

function sessionSignature(session) {
  const shots = Array.isArray(session.shots) ? session.shots : [];
  const firstShot = shots[0] ?? {};
  return [
    text(session.title, "", 180).toLowerCase(),
    text(session.date, "", 40),
    text(session.source, "", 120).toLowerCase(),
    shots.length,
    text(firstShot.club, "", 80).toLowerCase(),
    finiteNumber(firstShot.carry) ?? "",
    finiteNumber(firstShot.total) ?? "",
  ].join("|");
}

export function sanitizeSession(session, options = {}) {
  if (!isRecord(session)) return null;
  if (!options.allowDemo && isLikelyDemoSession(session)) return null;
  const rawShots = Array.isArray(session.shots) ? session.shots : [];
  const shots = rawShots
    .map((shot, index) => sanitizeShot(shot, `${text(session.id, "session", 80)}-shot-${index + 1}`))
    .filter(Boolean);

  if (!shots.length) return null;

  return {
    ...session,
    id: text(session.id, `session-${crypto.randomUUID()}`, 180),
    title: text(session.title, "Imported golf session", 180),
    date: text(session.date, new Date().toISOString().slice(0, 10), 40),
    source: text(session.source, "Session upload", 120),
    focus: text(session.focus, "Practice session", 180),
    location: text(session.location, "", 180) || undefined,
    importNotes: text(session.importNotes, "", 1000) || undefined,
    shots,
  };
}

export function sanitizeSessionList(value, options = {}) {
  const sessions = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  const seenSignatures = new Set();
  const maxSessions = Number.isFinite(options.maxSessions) ? options.maxSessions : 80;
  const sanitized = [];

  for (const session of sessions) {
    const next = sanitizeSession(session, options);
    if (!next) continue;
    const id = text(next.id, "", 180);
    const signature = sessionSignature(next);
    if (seenIds.has(id) || seenSignatures.has(signature)) continue;
    seenIds.add(id);
    seenSignatures.add(signature);
    sanitized.push(next);
    if (sanitized.length >= maxSessions) break;
  }

  return sanitized;
}

export function summarizeShotDataQuality(sessions) {
  const sanitized = sanitizeSessionList(sessions);
  const shots = sanitized.flatMap((session) => session.shots);
  const clubs = Array.from(new Set(shots.map((shot) => shot.club))).sort();
  const clubCounts = clubs.map((club) => ({
    club,
    shots: shots.filter((shot) => shot.club === club).length,
  }));
  const bestClubCount = Math.max(0, ...clubCounts.map((item) => item.shots));
  const confidence =
    bestClubCount >= 10 ? "usable" :
      bestClubCount >= 5 ? "provisional" :
        shots.length > 0 ? "low" :
          "none";

  return {
    confidence,
    sessionCount: sanitized.length,
    shotCount: shots.length,
    clubs,
    clubCounts,
    warnings: [
      ...(shots.length === 0 ? ["No usable user-owned shot data is available."] : []),
      ...(bestClubCount > 0 && bestClubCount < 5 ? ["Fewer than five usable shots exist for the leading club, so swing diagnosis should stay conservative."] : []),
      ...(bestClubCount >= 5 && bestClubCount < 10 ? ["Five to nine usable shots creates a provisional trend, not a firm diagnosis."] : []),
    ],
  };
}
