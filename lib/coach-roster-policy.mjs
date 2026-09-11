import { filterCoachUploadMembers } from "./coach-video-upload-policy.mjs";

function timestamp(value) {
  const result = Date.parse(value || "");
  return Number.isFinite(result) ? result : 0;
}

// The API supplies the authorized roster. Never infer relationships from videos.
export function coachRosterCards(members, videos, search = "", sort = "recent") {
  return filterCoachUploadMembers(members, search).map(member => {
    const lessons = (videos || []).filter(video => video.ownerId === member.id &&
      video.type !== "System Test" && video.publicationStatus !== "Archived" &&
      (video.uploadedByRole === "coach" || video.uploadedByRole === "admin" ||
        video.uploadedBy === "Coach" || video.uploadedBy === "Admin" || video.type === "Lesson Recap"))
      .sort((a, b) => timestamp(b.lessonDate || b.uploadedAt) - timestamp(a.lessonDate || a.uploadedAt));
    const latest = lessons[0];
    const hasDraft = lessons.some(video => (video.publicationStatus ?? "Published") !== "Published");
    return {
      member,
      lastLessonAt: latest?.lessonDate || latest?.uploadedAt || null,
      status: hasDraft ? "Draft" : latest ? "Published" : "Needs Lesson",
      activityAt: Math.max(timestamp(member.lastVideoAt), ...lessons.map(video => timestamp(video.updatedAt || video.uploadedAt)), 0),
    };
  }).sort((a, b) => {
    if (sort === "recent") {
      const activity = b.activityAt - a.activityAt;
      if (activity) return activity;
    }
    if (sort === "added") {
      const added = timestamp(b.member.createdAt) - timestamp(a.member.createdAt);
      if (added) return added;
    }
    return a.member.name.localeCompare(b.member.name, undefined, { sensitivity: "base" });
  });
}

export function rosterLessonDate(value) {
  if (!timestamp(value)) return "No lessons yet";
  // Date-only lesson dates must not shift to the previous day in US time zones.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
