import { selectLatestPlayableCoachLesson } from "./student-dashboard-video-policy.mjs";

export const MEMBER_EXPERIENCE_MODES = ["coach_led", "independent", "hybrid"];

export const NEXT_ACTION_TYPES = [
  "coach_practice",
  "coach_lesson_review",
  "coach_feedback_review",
  "mai_practice",
  "challenge",
  "session_review",
  "upload_session",
  "upload_video",
  "complete_profile",
];

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function lower(value) {
  return text(value).toLowerCase();
}

function hasCoachConnection(activity = {}) {
  const instructions = activity?.instructions && typeof activity.instructions === "object" ? activity.instructions : {};
  const connection = instructions.coachConnection && typeof instructions.coachConnection === "object"
    ? instructions.coachConnection
    : {};
  const sourceMode = lower(instructions.sourceMode);
  return (
    connection.connected === true ||
    sourceMode === "coach_and_session" ||
    sourceMode === "coach_feedback" ||
    Boolean(activity.coachId)
  );
}

function isActivePracticeActivity(activity = null) {
  if (!activity || typeof activity !== "object") return false;
  const status = lower(activity.status || "generated");
  return status === "generated" || status === "in_progress";
}

function hasShots(session = {}) {
  return Array.isArray(session.shots) && session.shots.length > 0;
}

function latestSessionWithShots(sessions = []) {
  return sessions
    .filter(hasShots)
    .slice()
    .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())[0] ?? null;
}

function hasLessonFeedback(video = null) {
  if (!video || typeof video !== "object") return false;
  return Boolean(
    text(video.lessonSummary) ||
    text(video.memberFacingNotes) ||
    text(video.practiceAssignment) ||
    text(video.recommendedDrill) ||
    text(video.nextSessionGoal) ||
    text(video.workedOn) ||
    text(video.keyIssue),
  );
}

function hasSessionLink(video = null) {
  if (!video || typeof video !== "object") return false;
  if (text(video.sessionId)) return true;
  return Array.isArray(video.sessionLinks) && video.sessionLinks.length > 0;
}

function hasIndependentSignal({ currentActivity, insights = [], sessions = [], videos = [] }) {
  const activeMaiActivity = isActivePracticeActivity(currentActivity) && !hasCoachConnection(currentActivity);
  const memberVideos = videos.some((video) => lower(video.uploadedBy) === "user" || lower(video.uploadedByRole) === "member");
  return activeMaiActivity || insights.length > 0 || sessions.some(hasShots) || memberVideos;
}

export function getMemberExperienceMode(context = {}) {
  const coaches = Array.isArray(context.coaches) ? context.coaches : [];
  const hasCoach = coaches.length > 0 || Boolean(context.hasActiveCoach);
  if (hasCoach && hasIndependentSignal(context)) return "hybrid";
  if (hasCoach) return "coach_led";
  return "independent";
}

function coachName(coaches = []) {
  return text(coaches[0]?.name, "your Coach");
}

function action({
  description,
  estimatedMinutes = null,
  primaryActionLabel,
  primaryActionUrl,
  priority,
  source,
  supportingRecordId = null,
  title,
  type,
}) {
  return {
    type,
    title,
    description,
    primaryActionLabel,
    primaryActionUrl,
    source,
    priority,
    estimatedMinutes,
    supportingRecordId,
  };
}

function buildCoachActions(context, mode) {
  const coaches = Array.isArray(context.coaches) ? context.coaches : [];
  if (!coaches.length && !context.hasActiveCoach) return [];
  const name = coachName(coaches);
  const currentActivity = context.currentActivity;
  const latestLesson = context.latestCoachLesson ?? selectLatestPlayableCoachLesson(context.videos ?? []);
  const actions = [];

  if (isActivePracticeActivity(currentActivity) && hasCoachConnection(currentActivity)) {
    actions.push(action({
      type: "coach_practice",
      title: currentActivity.title || "Complete your Coach-assigned practice",
      description: text(currentActivity.instructions?.sourceSummary, `${name}'s active feedback is the first thing to work on.`),
      primaryActionLabel: "Start Practice",
      primaryActionUrl: "/practice",
      source: currentActivity.instructions?.sourceMode === "coach_and_session" ? "coach_approved_ai" : "coach",
      priority: 10,
      estimatedMinutes: Number.isFinite(Number(currentActivity.durationMinutes)) ? Number(currentActivity.durationMinutes) : null,
      supportingRecordId: currentActivity.id ?? null,
    }));
  }

  if (latestLesson && !latestLesson.isViewedByMember) {
    actions.push(action({
      type: "coach_lesson_review",
      title: "Review your latest Coach lesson",
      description: `${name} published a lesson. Watch it before starting independent MAI practice.`,
      primaryActionLabel: "Open Lesson",
      primaryActionUrl: `/videos?video=${encodeURIComponent(latestLesson.id)}`,
      source: "coach",
      priority: 20,
      estimatedMinutes: Number.isFinite(Number(latestLesson.duration)) ? Math.max(1, Math.ceil(Number(latestLesson.duration) / 60)) : null,
      supportingRecordId: latestLesson.id ?? null,
    }));
  }

  if (latestLesson && hasLessonFeedback(latestLesson)) {
    actions.push(action({
      type: "coach_feedback_review",
      title: "Use the Coach feedback first",
      description: text(latestLesson.practiceAssignment || latestLesson.recommendedDrill || latestLesson.memberFacingNotes || latestLesson.lessonSummary, `${name}'s lesson recap is your primary direction.`),
      primaryActionLabel: "View Feedback",
      primaryActionUrl: `/videos?video=${encodeURIComponent(latestLesson.id)}`,
      source: "coach",
      priority: mode === "hybrid" ? 30 : 25,
      estimatedMinutes: 5,
      supportingRecordId: latestLesson.id ?? null,
    }));
  }

  if (latestLesson && !hasSessionLink(latestLesson)) {
    actions.push(action({
      type: "upload_session",
      title: "Add session data to the Coach lesson",
      description: "Connect launch-monitor results so Coach feedback and MAI analysis use the same measured evidence.",
      primaryActionLabel: "Add Session Data",
      primaryActionUrl: `/videos?video=${encodeURIComponent(latestLesson.id)}`,
      source: "system",
      priority: 35,
      estimatedMinutes: 4,
      supportingRecordId: latestLesson.id ?? null,
    }));
  }

  if (!actions.length) {
    actions.push(action({
      type: "coach_feedback_review",
      title: `Stay aligned with ${name}`,
      description: "You have an active Coach relationship, so Coach direction stays ahead of independent AI suggestions.",
      primaryActionLabel: "View Lessons",
      primaryActionUrl: "/videos",
      source: "coach",
      priority: 50,
      estimatedMinutes: null,
      supportingRecordId: coaches[0]?.id ?? null,
    }));
  }

  return actions;
}

function buildIndependentActions(context, mode) {
  const actions = [];
  const currentActivity = context.currentActivity;
  const latestSession = latestSessionWithShots(context.sessions ?? []);
  const topInsight = Array.isArray(context.insights) ? context.insights[0] : null;
  const hasProfile = Boolean(context.practiceProfile);

  if (isActivePracticeActivity(currentActivity) && !hasCoachConnection(currentActivity) && currentActivity.activityType !== "challenge") {
    actions.push(action({
      type: "mai_practice",
      title: currentActivity.title || "Continue your MAI practice",
      description: text(currentActivity.instructions?.sourceSummary, "MAI Coach has an active practice recommendation ready."),
      primaryActionLabel: "Start Practice",
      primaryActionUrl: "/practice",
      source: "mai",
      priority: mode === "hybrid" ? 70 : 10,
      estimatedMinutes: Number.isFinite(Number(currentActivity.durationMinutes)) ? Number(currentActivity.durationMinutes) : null,
      supportingRecordId: currentActivity.id ?? null,
    }));
  }

  if (topInsight && latestSession) {
    actions.push(action({
      type: "session_review",
      title: topInsight.title || "Review your latest session opportunity",
      description: text(topInsight.action || topInsight.evidence, "Review the latest session pattern and choose one focused fix."),
      primaryActionLabel: "Review Session",
      primaryActionUrl: `/sessions?session=${encodeURIComponent(latestSession.id)}`,
      source: "mai",
      priority: mode === "hybrid" ? 80 : 20,
      estimatedMinutes: 6,
      supportingRecordId: latestSession.id ?? null,
    }));
  }

  if (isActivePracticeActivity(currentActivity) && !hasCoachConnection(currentActivity) && currentActivity.activityType === "challenge") {
    actions.push(action({
      type: "challenge",
      title: currentActivity.title || "Complete your active MAI challenge",
      description: text(currentActivity.target?.successTarget || currentActivity.reasonSelected, "Finish the active challenge so MAI Coach can update your next step."),
      primaryActionLabel: "Open Challenge",
      primaryActionUrl: "/practice",
      source: "mai",
      priority: mode === "hybrid" ? 90 : 30,
      estimatedMinutes: Number.isFinite(Number(currentActivity.durationMinutes)) ? Number(currentActivity.durationMinutes) : null,
      supportingRecordId: currentActivity.id ?? null,
    }));
  }

  if (!latestSession) {
    actions.push(action({
      type: "upload_session",
      title: "Upload your first session",
      description: "Add launch-monitor photos, CSV, or manual data so MAI Coach can move from general guidance to your measured pattern.",
      primaryActionLabel: "Upload Session",
      primaryActionUrl: "/import",
      source: "system",
      priority: mode === "hybrid" ? 100 : 50,
      estimatedMinutes: 5,
      supportingRecordId: null,
    }));
  }

  if (!hasProfile) {
    actions.push(action({
      type: "complete_profile",
      title: "Complete your golfer profile",
      description: "Your goals, skill level, and practice rhythm help MAI Coach choose safer, more useful next steps.",
      primaryActionLabel: "Complete Profile",
      primaryActionUrl: "/",
      source: "system",
      priority: mode === "hybrid" ? 110 : 60,
      estimatedMinutes: 3,
      supportingRecordId: null,
    }));
  }

  if (!actions.length) {
    actions.push(action({
      type: "mai_practice",
      title: "Generate one focused MAI practice block",
      description: "Your data is ready. Generate a single drill or challenge instead of staring at more numbers.",
      primaryActionLabel: "Go to Practice",
      primaryActionUrl: "/practice",
      source: "mai",
      priority: mode === "hybrid" ? 95 : 70,
      estimatedMinutes: 15,
      supportingRecordId: null,
    }));
  }

  return actions;
}

export function getMemberNextBestAction(context = {}) {
  const mode = context.experienceMode || getMemberExperienceMode(context);
  const coachActions = buildCoachActions(context, mode);
  const independentActions = buildIndependentActions(context, mode);
  const candidates = mode === "independent"
    ? independentActions
    : [...coachActions, ...independentActions];

  return candidates
    .filter((candidate) => NEXT_ACTION_TYPES.includes(candidate.type))
    .sort((left, right) => left.priority - right.priority)[0] ?? null;
}
