export const LESSON_SESSION_LINK_ROLES = new Set(["admin", "coach", "member"]);
export const LESSON_SESSION_SOURCE_TYPES = new Set([
  "existing_session",
  "photo_upload",
  "csv_upload",
  "manual_entry",
  "coach_lesson_upload",
  "legacy_session_link",
]);

export function normalizeLessonSessionSourceType(value) {
  return LESSON_SESSION_SOURCE_TYPES.has(value) ? value : "existing_session";
}

export function normalizeLessonSessionAttachedByRole(value) {
  return LESSON_SESSION_LINK_ROLES.has(value) ? value : "member";
}

export function lessonSessionLinkCountLabel(count) {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (safeCount === 0) return "No session data";
  if (safeCount === 1) return "1 session linked";
  return `${safeCount} sessions linked`;
}

export function lessonSessionCardStatus(linkCount, reviewStatuses = []) {
  const count = Number.isFinite(linkCount) ? Math.max(0, Math.round(linkCount)) : 0;
  if (!count) return "No session data";
  if (reviewStatuses.some((status) => String(status).toLowerCase().includes("review"))) {
    return "Session data needs review";
  }
  return count === 1 ? "Session data attached" : `${count} sessions attached`;
}

export function shouldPromptLessonRecapUpdate(values) {
  if (!values?.newLinkCreated) return false;
  if (values?.recapUpdateStatus === "kept") return false;
  return Boolean(values?.hasApprovedFeedback || values?.hasCurrentRecap || values?.publicationStatus === "Published");
}

export function choosePrimaryLessonSessionLink(links = []) {
  return links.find((link) => link?.isPrimary) ?? links[0] ?? null;
}

export function canMemberManageLessonSessionLink(identity, link) {
  return Boolean(identity?.role === "member" && link?.memberId === identity.id && link?.attachedByUserId === identity.id);
}

export function canStaffManageLessonSessionLink(identity, memberId, assignedMemberIds = []) {
  if (!identity) return false;
  if (identity.role === "admin") return true;
  return identity.role === "coach" && assignedMemberIds.includes(memberId);
}
