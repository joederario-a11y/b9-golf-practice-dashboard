export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
export const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);
export const THUMBNAIL_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateVideoFile(mimeType, fileSize) {
  if (!VIDEO_MIME_TYPES.has(mimeType)) {
    return "Use an MP4, MOV, WebM, or M4V video.";
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_VIDEO_BYTES) {
    return "Choose a video smaller than 500 MB.";
  }
  return null;
}

export function validateThumbnailFile(mimeType, fileSize) {
  if (!THUMBNAIL_MIME_TYPES.has(mimeType)) {
    return "Use a JPG, PNG, or WebP thumbnail.";
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_THUMBNAIL_BYTES) {
    return "Choose a thumbnail smaller than 10 MB.";
  }
  return null;
}

export function canUploadToMember(identity, memberId, assignedMemberIds = []) {
  if (!identity) return false;
  if (identity.role === "admin") return true;
  if (identity.role === "member") return identity.id === memberId;
  return identity.role === "coach" && assignedMemberIds.includes(memberId);
}

export function canAccessVideo(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  if (identity.role === "admin") return true;
  if (identity.role === "member") {
    return identity.id === video.memberId && video.publicationStatus === "Published";
  }
  return identity.role === "coach" && (
    video.coachId === identity.id || assignedMemberIds.includes(video.memberId)
  );
}

export function canManageVideo(identity, video, assignedMemberIds = []) {
  if (!identity || !video) return false;
  if (identity.role === "admin") return true;
  if (identity.role === "member") {
    return identity.id === video.memberId && video.uploadedByRole === "member";
  }
  return identity.role === "coach" && (
    video.coachId === identity.id || assignedMemberIds.includes(video.memberId)
  );
}
