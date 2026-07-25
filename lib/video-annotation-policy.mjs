export const VIDEO_ANNOTATION_TYPES = new Set([
  "line",
  "arrow",
  "angle",
  "circle",
  "rectangle",
  "freehand",
  "text",
]);

export const VIDEO_ANNOTATION_STATUSES = new Set(["draft", "published", "archived"]);

export const VIDEO_ANNOTATION_COLORS = {
  red: "#ef4444",
  yellow: "#facc15",
  green: "#22c55e",
  white: "#ffffff",
  blue: "#38bdf8",
};

export const VIDEO_ANNOTATION_STROKES = {
  thin: 2,
  medium: 4,
  thick: 7,
};

const COLOR_VALUES = new Set(Object.values(VIDEO_ANNOTATION_COLORS));
const STROKE_VALUES = new Set(Object.values(VIDEO_ANNOTATION_STROKES));

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizePoint(point) {
  const record = point && typeof point === "object" ? point : {};
  return {
    x: clamp01(record.x),
    y: clamp01(record.y),
  };
}

function normalizeGeometry(type, geometry) {
  const record = geometry && typeof geometry === "object" ? geometry : {};
  if (type === "line" || type === "arrow") {
    const points = Array.isArray(record.points) ? record.points : [record.start, record.end];
    return {
      points: [normalizePoint(points[0]), normalizePoint(points[1] ?? points[0])],
    };
  }
  if (type === "angle") {
    const points = Array.isArray(record.points) ? record.points : [];
    return {
      points: [normalizePoint(points[0]), normalizePoint(points[1] ?? points[0]), normalizePoint(points[2] ?? points[1] ?? points[0])],
    };
  }
  if (type === "freehand") {
    const points = Array.isArray(record.points) ? record.points.slice(0, 240).map(normalizePoint) : [];
    return { points };
  }
  if (type === "circle" || type === "rectangle") {
    return {
      height: clamp01(record.height),
      width: clamp01(record.width),
      x: clamp01(record.x),
      y: clamp01(record.y),
    };
  }
  if (type === "text") {
    return {
      x: clamp01(record.x),
      y: clamp01(record.y),
    };
  }
  return {};
}

function annotationColor(value) {
  if (typeof value !== "string") return VIDEO_ANNOTATION_COLORS.red;
  const trimmed = value.trim();
  return COLOR_VALUES.has(trimmed) || /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : VIDEO_ANNOTATION_COLORS.red;
}

function annotationStrokeWidth(value) {
  const number = Number(value);
  if (STROKE_VALUES.has(number)) return number;
  if (Number.isFinite(number)) return Math.max(1, Math.min(12, Math.round(number)));
  return VIDEO_ANNOTATION_STROKES.medium;
}

function annotationTiming(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

export function normalizeVideoAnnotationInput(input, fallbackStartTimeMs = 0) {
  const record = input && typeof input === "object" ? input : {};
  const type = typeof record.type === "string" && VIDEO_ANNOTATION_TYPES.has(record.type) ? record.type : "line";
  const startTimeMs = annotationTiming(record.startTimeMs, fallbackStartTimeMs);
  const endTimeMs = Math.max(startTimeMs + 250, annotationTiming(record.endTimeMs, startTimeMs + 3000));
  const text = typeof record.text === "string" ? record.text.trim().slice(0, 120) : "";
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 120) : crypto.randomUUID(),
    color: annotationColor(record.color),
    endTimeMs,
    geometry: normalizeGeometry(type, record.geometry ?? record.geometryJson),
    normalizedCoordinates: true,
    startTimeMs,
    strokeWidth: annotationStrokeWidth(record.strokeWidth),
    text: type === "text" ? (text || "Coach note") : text,
    type,
  };
}

export function normalizeVideoAnnotationList(value, fallbackStartTimeMs = 0) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 150).map((item) => normalizeVideoAnnotationInput(item, fallbackStartTimeMs));
}

export function visualAngleDegrees(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const [a, b, c] = points.map(normalizePoint);
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLength = Math.hypot(ab.x, ab.y);
  const cbLength = Math.hypot(cb.x, cb.y);
  if (!abLength || !cbLength) return null;
  const cosine = Math.max(-1, Math.min(1, dot / (abLength * cbLength)));
  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}

export function visibleVideoAnnotationsAt(annotations, timeMs) {
  const number = Number(timeMs);
  if (!Number.isFinite(number)) return [];
  return (Array.isArray(annotations) ? annotations : []).filter((annotation) => {
    const start = Number(annotation.startTimeMs);
    const end = Number(annotation.endTimeMs);
    return Number.isFinite(start) && Number.isFinite(end) && number >= start && number <= end;
  });
}

export function canManageVideoAnnotations(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  const status = String(video.uploadStatus ?? video.upload_status ?? "").toLowerCase();
  const publication = String(video.publicationStatus ?? video.publication_status ?? "").toLowerCase();
  if (status && status !== "ready") return false;
  if (publication === "archived" || publication === "deleted") return false;
  if (identity.role === "admin") return true;
  if (identity.role !== "coach") return false;
  return video.coachId === identity.id || video.coach_id === identity.id || assignedMemberIds.includes(video.memberId ?? video.member_id);
}

export function canViewVideoAnnotations(identity, video, assignedMemberIds = [], status = "published") {
  if (!identity || !video) return false;
  if (identity.role === "admin") return true;
  if (identity.role === "coach") {
    return video.coachId === identity.id || video.coach_id === identity.id || assignedMemberIds.includes(video.memberId ?? video.member_id);
  }
  if (identity.role !== "member" || status !== "published") return false;
  const memberId = video.memberId ?? video.member_id;
  const publicationStatus = video.publicationStatus ?? video.publication_status;
  return identity.id === memberId && publicationStatus === "Published";
}

export function videoAnnotationSummary(annotation) {
  const start = Number(annotation.startTimeMs ?? annotation.start_time_ms ?? 0);
  const type = String(annotation.type ?? "markup");
  const label = type === "angle" ? "Visual angle" : type.charAt(0).toUpperCase() + type.slice(1);
  const text = typeof annotation.text === "string" && annotation.text.trim() ? annotation.text.trim() : label;
  return `${Math.floor(start / 1000)}s - ${text}`;
}
