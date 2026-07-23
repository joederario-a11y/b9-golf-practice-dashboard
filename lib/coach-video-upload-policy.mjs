export function normalizeCoachUploadSearch(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function filterCoachUploadMembers(members, search) {
  const normalizedSearch = normalizeCoachUploadSearch(search);
  return [...(Array.isArray(members) ? members : [])]
    .filter((member) => {
      if ((member.accountStatus ?? "active") === "inactive") return false;
      if (!normalizedSearch) return true;
      return [member.name, member.email].some((value) =>
        String(value ?? "").toLowerCase().includes(normalizedSearch),
      );
    })
    .sort((a, b) => {
      const lastNameCompare = String(a.lastName ?? "").localeCompare(String(b.lastName ?? ""));
      if (lastNameCompare) return lastNameCompare;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export function canStartCoachLessonUpload(values) {
  return Boolean(
    values?.authenticated &&
      values?.memberId &&
      values?.hasVideo &&
      values?.saveState !== "saving",
  );
}

export function getCoachDashboardActionState(values = {}) {
  const hasMembers = Boolean(values.hasMembers);
  const authenticated = Boolean(values.authenticated);
  return {
    canAddMember: authenticated,
    canUseMemberTools: Boolean(authenticated && hasMembers && values.selectedMemberId),
    canOpenUpload: Boolean(authenticated && hasMembers),
    showCompactAddMember: hasMembers,
    showMemberTools: hasMembers,
    showPrimaryAddMember: !hasMembers,
    showUploadLessonVideo: hasMembers,
    showDevDemoPlayer: Boolean(values.devAuthEnabled && !hasMembers),
  };
}

export function coachLessonUploadStatusLabel(status) {
  if (status === "preparing_video") return "Preparing video";
  if (status === "uploading") return "Uploading video";
  if (status === "upload_complete") return "Upload complete";
  if (status === "queued") return "Processing audio";
  if (status === "processing_audio") return "Processing audio";
  if (status === "extracting_audio") return "Processing audio";
  if (status === "creating_transcript") return "Creating transcript";
  if (status === "transcribing") return "Processing audio";
  if (status === "transcribing_coach_feedback") return "Processing audio";
  if (status === "generating_recap") return "Creating lesson recap";
  if (status === "importing_session_data") return "Importing session data";
  if (status === "ready_for_review") return "Ready for review";
  if (status === "published") return "Published to member";
  if (status === "failed") return "Needs attention";
  if (status === "no_usable_audio") return "Needs attention";
  if (status === "ready") return "Ready for review";
  return "Needs attention";
}

export const COACH_LESSON_UPLOAD_FACTS = [
  "Smash factor is ball speed divided by club speed, so centered contact often beats extra effort.",
  "Launch angle and spin work together; one number rarely tells the whole carry-distance story.",
  "A tight side-carry pattern can matter more than one perfect distance number.",
  "Club path helps explain start line and curvature when paired with face angle.",
  "A lesson recap is most useful when the video and measured session data point at the same priority.",
  "Consistent practice notes make the next session easier to compare against the last one.",
];

export function formatLessonUploadFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "NA";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const display = Number.isInteger(size) || size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1);
  return `${display} ${units[index]}`;
}

export function coachVideoDeliveryStatusLabel(video = {}) {
  const uploadStatus = String(video.uploadStatus ?? "").toLowerCase();
  const publicationStatus = String(video.publicationStatus ?? "").toLowerCase();
  const reviewStatus = String(video.status ?? "").toLowerCase();
  if (uploadStatus && uploadStatus !== "ready") return "Uploading";
  if (reviewStatus.includes("attention") || reviewStatus.includes("failed")) return "Needs attention";
  if (publicationStatus === "published") return "Published to member";
  return "Ready for review";
}

export function shouldShowLessonUploadStallWarning(values = {}) {
  const isUploading = values.saveState === "saving" && values.stage === "uploading";
  const lastProgressAt = Number(values.lastProgressAt);
  const now = Number(values.now ?? Date.now());
  const thresholdMs = Number(values.thresholdMs ?? 25000);
  return Boolean(isUploading && Number.isFinite(lastProgressAt) && now - lastProgressAt >= thresholdMs);
}

export function canAttachCoachSessionData(values = {}) {
  if (values.mode === "none") return true;
  if (values.mode === "existing") return Boolean(values.selectedSessionId);
  if (values.mode === "upload") return Number(values.fileCount ?? 0) > 0;
  return false;
}
