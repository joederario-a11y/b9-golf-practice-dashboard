export const VIDEO_OWNERSHIP_LOCK_MESSAGE = "Video ownership cannot be changed after creation. Upload a new video for the correct member.";

export function videoOwnershipChangeError(existingMemberId, requestedMemberId) {
  const existing = typeof existingMemberId === "string" ? existingMemberId.trim() : "";
  const requested = typeof requestedMemberId === "string" ? requestedMemberId.trim() : "";
  if (!requested || requested === existing) return "";
  return VIDEO_OWNERSHIP_LOCK_MESSAGE;
}
