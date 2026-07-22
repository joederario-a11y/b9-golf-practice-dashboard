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

export function coachLessonUploadStatusLabel(status) {
  if (status === "uploading") return "Uploading video";
  if (status === "queued") return "Processing audio";
  if (status === "extracting_audio") return "Processing audio";
  if (status === "transcribing") return "Processing audio";
  if (status === "transcribing_coach_feedback") return "Processing audio";
  if (status === "generating_recap") return "Creating lesson recap";
  if (status === "ready_for_review") return "Ready for review";
  if (status === "published") return "Published to member";
  if (status === "failed") return "Needs attention";
  if (status === "no_usable_audio") return "Needs attention";
  if (status === "ready") return "Ready for review";
  return "Needs attention";
}
