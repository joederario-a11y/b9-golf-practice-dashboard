function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return text(value).toLowerCase();
}

function dateValue(value) {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestTimestamp(video, fields) {
  for (const field of fields) {
    const value = dateValue(video?.[field]);
    if (value) return value;
  }
  return 0;
}

export function isCoachLessonCandidate(video = {}) {
  if (!video || typeof video !== "object") return false;
  const uploadedBy = lower(video.uploadedBy);
  const uploadedByRole = lower(video.uploadedByRole);
  const type = lower(video.type);
  const publicationStatus = lower(video.publicationStatus || "published");
  if (uploadedBy === "user" || uploadedByRole === "member" || uploadedByRole === "user") return false;
  if (type.includes("system") || type.includes("education")) return false;
  if (publicationStatus === "archived" || publicationStatus === "deleted") return false;
  if (video.deletedAt || video.archivedAt || video.isDeleted || video.isArchived) return false;
  return true;
}

export function isPlayablePublishedCoachLesson(video = {}) {
  if (!isCoachLessonCandidate(video)) return false;
  if (lower(video.publicationStatus || "published") !== "published") return false;
  if (lower(video.uploadStatus || "ready") !== "ready") return false;
  if (!text(video.objectUrl)) return false;
  if (Number(video.duration) <= 0) return false;
  const mimeType = lower(video.mimeType);
  return !mimeType || mimeType.startsWith("video/");
}

export function compareCoachLessonRecency(left = {}, right = {}) {
  const fields = ["publishedAt", "emailSentAt", "lessonDate", "uploadedAt"];
  for (const field of fields) {
    const leftDate = dateValue(left[field]);
    const rightDate = dateValue(right[field]);
    if (leftDate !== rightDate) return rightDate - leftDate;
  }
  return 0;
}

export function selectLatestPlayableCoachLesson(videos = []) {
  return videos
    .filter(isPlayablePublishedCoachLesson)
    .sort(compareCoachLessonRecency)[0] ?? null;
}

export function hasNewerProcessingCoachLesson(videos = [], selectedLesson = null) {
  if (!selectedLesson) return false;
  const selectedTime = latestTimestamp(selectedLesson, ["publishedAt", "emailSentAt", "lessonDate", "uploadedAt"]);
  return videos.some((video) => {
    if (!isCoachLessonCandidate(video)) return false;
    if (isPlayablePublishedCoachLesson(video)) return false;
    if (lower(video.publicationStatus || "draft") === "archived") return false;
    const uploadStatus = lower(video.uploadStatus || "pending");
    if (uploadStatus === "failed") return false;
    const videoTime = latestTimestamp(video, ["publishedAt", "emailSentAt", "lessonDate", "uploadedAt"]);
    return Boolean(videoTime && selectedTime && videoTime > selectedTime);
  });
}
