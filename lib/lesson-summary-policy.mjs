export const PRIVATE_LESSON_PREFIX = "MAI_COACH_LESSON_GUIDANCE_JSON:";

export function readPrivateLesson(value) {
  if (typeof value !== "string") return {};
  if (!value.startsWith(PRIVATE_LESSON_PREFIX)) return { privateCoachNote: value };
  try {
    const parsed = JSON.parse(value.slice(PRIVATE_LESSON_PREFIX.length));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function privateLessonSummary(value, publishedSummary = "") {
  const draft = readPrivateLesson(value);
  return typeof draft.lessonSummary === "string" ? draft.lessonSummary : publishedSummary;
}

// Explicit field selection prevents new internal fields from leaking to Students.
export function studentLessonVideo(video) {
  const keys = ["id", "ownerId", "memberName", "coachId", "coachName", "title", "uploadedAt", "updatedAt", "uploadedBy", "uploadedByRole", "type", "tags", "sessionId", "sessionLinks", "club", "visibility", "duration", "status", "userNotes", "lessonDate", "publicationStatus", "uploadStatus", "isViewedByMember", "viewedAt", "objectUrl", "thumbnailObjectUrl"];
  const result = Object.fromEntries(keys.filter(key => key in video).map(key => [key, video[key]]));
  result.lessonSummary = video.publicationStatus === "Published" ? video.lessonSummary || "" : "";
  return result;
}

export function lessonSessionMetrics(session, club) {
  if (!session || session.importMetadata?.blockingIssues?.length) return [];
  const shots = (session.shots || []).filter(shot => !String(shot.reviewStatus || "").toLowerCase().includes("review") && (!club || shot.club === club));
  const clubs = [...new Set(shots.map(shot => shot.club).filter(Boolean))];
  if (clubs.length !== 1) return [];
  const metrics = [["Club", clubs[0]]];
  for (const [key, label, unit] of [["carry", "Carry", "yd"], ["ballSpeed", "Ball speed", "mph"]]) {
    const values = shots.map(shot => shot[key]).filter(value => typeof value === "number" && Number.isFinite(value) && value > 0);
    if (values.length) metrics.push([label, `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)} ${unit}`]);
  }
  return metrics.length > 1 ? metrics : [];
}

export function studentRecap(video) {
  return { canReview: false, draft: video.publication_status === "Published" && video.lesson_summary ? { lessonSummary: video.lesson_summary, status: "published" } : null, job: null, transcript: null };
}
