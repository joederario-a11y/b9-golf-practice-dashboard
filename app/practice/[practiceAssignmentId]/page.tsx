"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MaiCoachLogoFull } from "@/components/brand/mai-coach-logo";

type AccountUser = {
  displayName: string;
  firstName: string;
  id: string;
  role: "member" | "coach" | "admin";
};

type TrainingAidRecommendation = {
  aidId?: string;
  approvalState?: string;
  confidence?: string;
  name?: string;
  noEquipmentAlternative?: string;
  safetyNotes?: string[];
  setupSteps?: string[];
  source?: string;
  studentVisible?: boolean;
  whyItFits?: string;
};

type PracticeAttempt = {
  id: string;
  status: "active" | "completed" | "abandoned" | "needs_review";
  startedAt: string;
  completedAt?: string;
  completedShotCount?: number;
  completedSetCount?: number;
  completedMinutes?: number;
  linkedSessionId?: string;
  memberDifficultyLabel?: string;
  memberConfidenceRating?: number;
  memberCompletedAmount?: "yes" | "partial" | "unknown";
  memberNotes?: string;
  trainingAidUsed?: boolean | null;
  trainingAidHelpfulness?: number;
  evaluation?: {
    classification?: string;
    biggestWin?: string;
    remainingOpportunity?: string | null;
    recommendedNextAction?: "repeat" | "progress" | "modify" | "replace" | "complete";
    recommendedReason?: string;
    measurementSource?: string;
    coachReviewRequired?: boolean;
    evidence?: Array<{
      after?: number | null;
      before?: number | null;
      details?: string;
      label?: string;
      source?: string;
      unit?: string | null;
    }>;
    nextActionVisibility?: {
      label?: string;
      memberVisible?: boolean;
      source?: string;
    };
  };
  progress?: {
    label?: string;
    mode?: string;
    sourceLabel?: string;
  };
  coachReviewStatus?: string;
};

type PracticeActivity = {
  activeAttempt?: PracticeAttempt | null;
  activityType: "drill" | "challenge";
  assignment?: {
    practicePriority?: string;
    source?: "coach" | "coach_approved_ai" | "ai" | "challenge" | "generic_library";
    version?: number;
  };
  attemptCount?: number;
  club?: string;
  createdAt?: string;
  durationMinutes?: number;
  focusArea: string;
  id: string;
  instructions: {
    coachConnection?: {
      coachName?: string | null;
      connected?: boolean;
      summary?: string;
    };
    commonMistake?: string;
    easierVersion?: string;
    feel?: string;
    harderVersion?: string;
    instructions?: string[];
    setup?: string;
    sourceMode?: string;
    sourceSummary?: string;
    trainingAid?: TrainingAidRecommendation | null;
  };
  latestAttempt?: PracticeAttempt | null;
  latestResult?: {
    nextRecommendation?: {
      nextPlan?: {
        activityId?: string | null;
        created?: boolean;
        reason?: string;
        title?: string;
      };
      recommendedNextAction?: string;
      recommendation?: string;
      visibility?: {
        coachReviewRequired?: boolean;
        label?: string;
        memberVisible?: boolean;
        source?: string;
      };
    } | null;
  } | null;
  reasonSelected: string;
  scoring?: {
    enabled?: boolean;
    system?: string;
  };
  status: string;
  coachId?: string;
  coachFeedbackSourceId?: string;
  relatedSessionId?: string;
  target?: {
    successTarget?: string;
  };
  title: string;
  updatedAt?: string;
};

type EligibleSession = {
  club?: string;
  date?: string;
  focus?: string;
  id: string;
  shotCount: number;
  source?: string;
  title?: string;
};

type PracticeDetailPayload = {
  activity?: PracticeActivity | null;
  attempts?: PracticeAttempt[];
  eligibleSessions?: EligibleSession[];
};

type AccountPayload = {
  mode?: "guest" | "user";
  user?: AccountUser | null;
};

async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || fallbackMessage);
  return payload as T;
}

function sourceLabel(activity: PracticeActivity | null) {
  const source = activity?.assignment?.source;
  if (source === "coach") return "Coach Assignment";
  if (source === "coach_approved_ai") return "Coach-approved MAI Practice";
  if (source === "challenge") return "Challenge-linked Practice";
  return "Independent MAI Practice";
}

function isCoachPrimary(activity: PracticeActivity | null) {
  const source = activity?.assignment?.source;
  return source === "coach" || source === "coach_approved_ai";
}

function isIndependentPlan(activity: PracticeActivity | null) {
  return !isCoachPrimary(activity) && activity?.assignment?.source !== "challenge";
}

function coachFirstName(activity: PracticeActivity | null) {
  const coachName = activity?.instructions.coachConnection?.coachName?.trim();
  if (!coachName) return "your Coach";
  return coachName.split(/\s+/)[0] || coachName;
}

function planEyebrow(activity: PracticeActivity | null) {
  const source = activity?.assignment?.source;
  if (source === "coach") return `${coachFirstName(activity)}'s Priority`;
  if (source === "coach_approved_ai") return "Coach-approved Practice Plan";
  if (source === "challenge") return "Challenge Practice Plan";
  return "MAI Practice Plan";
}

function stateLabel(state: string) {
  if (state === "overview") return "Ready to start";
  if (state === "active") return "In progress";
  if (state === "completion") return "Awaiting reflection";
  if (state === "submitting") return "Submitting result";
  if (state === "coach_review_pending") return "Coach review pending";
  if (state === "outcome") return "Completed";
  return "Ready";
}

function formatDate(value?: string) {
  if (!value) return "NA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function evidenceLabel(item: NonNullable<PracticeAttempt["evaluation"]>["evidence"] extends Array<infer T> ? T : never) {
  const before = typeof item.before === "number" ? item.before : null;
  const after = typeof item.after === "number" ? item.after : null;
  const unit = item.unit ? ` ${item.unit}` : "";
  if (before !== null && after !== null) return `${item.label}: ${before}${unit} to ${after}${unit}`;
  if (after !== null) return `${item.label}: ${after}${unit}`;
  return item.details || item.label || "Evidence recorded";
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function elapsedSecondsSince(value?: string) {
  if (!value) return 0;
  const started = new Date(value).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

function planSourceLabel(activity: PracticeActivity | null) {
  const source = activity?.assignment?.source;
  const coachName = activity?.instructions.coachConnection?.coachName;
  if (source === "coach") return coachName ? `Assigned by ${coachName}` : "Assigned by your Coach";
  if (source === "coach_approved_ai") return coachName ? `Coach-approved by ${coachName}` : "Coach-approved MAI practice";
  if (source === "challenge") return "Challenge-linked Practice Plan";
  return "Created by MAI Coach";
}

function planSourceSummary(activity: PracticeActivity | null) {
  if (!activity) return "";
  if (isCoachPrimary(activity)) {
    const coach = activity.instructions.coachConnection?.coachName || "your Coach";
    return activity.instructions.sourceSummary
      || activity.instructions.coachConnection?.summary
      || `${coach} selected this work as the next step in your practice plan.`;
  }
  return activity.instructions.sourceSummary
    || activity.reasonSelected
    || "MAI Coach selected this from your saved sessions and practice history.";
}

function planTrackLabel(activity: PracticeActivity | null) {
  const source = activity?.assignment?.source;
  if (source === "coach") return "Coach Practice Plan";
  if (source === "coach_approved_ai") return "Coach-approved MAI Practice";
  if (source === "challenge") return "Challenge Practice";
  return "Independent MAI Practice";
}

function workTarget(activity: PracticeActivity | null) {
  if (!activity) return "Member recorded";
  if (activity.attemptCount) return `${activity.attemptCount} shots`;
  if (activity.durationMinutes) return `${activity.durationMinutes} minutes`;
  return activity.activityType === "challenge" ? "Challenge progress" : "Member recorded";
}

function successCue(activity: PracticeActivity | null) {
  if (!activity) return "Record what happens honestly so the next step can improve.";
  if (activity.target?.successTarget) return activity.target.successTarget;
  if (activity.activityType === "challenge") return "Only measured shots count toward challenge progress.";
  return "Complete the assignment, then add measured evidence when you have it.";
}

function reflectionPrompt(activity: PracticeActivity | null) {
  if (isCoachPrimary(activity)) return "What should your Coach know before reviewing this practice?";
  if (activity?.assignment?.source === "challenge") return "What should be remembered about this challenge attempt?";
  return "What should MAI Coach know before recommending the next step?";
}

function evidenceHelper(activity: PracticeActivity | null) {
  if (isCoachPrimary(activity)) return "Add something that helps your Coach review how the practice went.";
  return "Add measured practice results when available so MAI Coach can keep the next recommendation factual.";
}

function currentProgressLabel(activity: PracticeActivity | null, attempt: PracticeAttempt | null) {
  if (attempt?.progress?.label) return attempt.progress.label;
  if (attempt?.completedShotCount !== undefined) return `${attempt.completedShotCount} shots recorded`;
  if (attempt?.completedSetCount !== undefined) return `${attempt.completedSetCount} sets recorded`;
  if (attempt?.completedMinutes !== undefined) return `${attempt.completedMinutes} minutes recorded`;
  return workTarget(activity);
}

function reflectionLabel(value?: string) {
  if (value === "great" || value === "easier") return "Great";
  if (value === "struggled" || value === "harder") return "I struggled";
  if (value === "expected" || value === "about_same") return "About what I expected";
  return "NA";
}

function evidenceSummary(attempt: PracticeAttempt | null) {
  if (!attempt) return "Practice completed without added evidence.";
  const items = [];
  if (attempt.linkedSessionId) items.push("1 practice-results session");
  const measuredCount = attempt.evaluation?.evidence?.filter((item) => item.source === "measured").length ?? 0;
  if (measuredCount > 0) items.push(`${measuredCount} measured result${measuredCount === 1 ? "" : "s"}`);
  return items.length ? items.join(" · ") : "Practice completed without added evidence.";
}

function visibleAidForUser(aid: TrainingAidRecommendation | null | undefined, user: AccountUser | null) {
  if (!aid || !aid.aidId || aid.aidId === "none") return null;
  if (user?.role === "coach" || user?.role === "admin") return aid;
  if (aid.studentVisible === false || aid.approvalState === "draft") return null;
  return aid;
}

function nextPlanUrl(activity: PracticeActivity | null) {
  const id = activity?.latestResult?.nextRecommendation?.nextPlan?.activityId;
  return id ? `/practice/${encodeURIComponent(id)}` : "";
}

export default function PracticeAssignmentPage() {
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [activityId, setActivityId] = useState("");
  const [activity, setActivity] = useState<PracticeActivity | null>(null);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [eligibleSessions, setEligibleSessions] = useState<EligibleSession[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState("Loading practice...");
  const [loadingAction, setLoadingAction] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const completionRef = useRef<HTMLElement | null>(null);
  const outcomeRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState({
    completedAmount: "yes",
    completedMinutes: "",
    completedSetCount: "",
    completedShotCount: "",
    confidence: "3",
    difficulty: "expected",
    notes: "",
    relatedSessionId: "",
    trainingAidHelpfulness: "",
    trainingAidUsed: "",
  });
  const latestAttempt = activity?.latestAttempt ?? attempts[0] ?? null;
  const activeAttempt = activity?.activeAttempt ?? attempts.find((attempt) => attempt.status === "active") ?? null;
  const completedAttempt = latestAttempt?.status === "completed" || latestAttempt?.status === "needs_review"
    ? latestAttempt
    : null;
  const outcome = completedAttempt?.evaluation;
  const visibleAid = visibleAidForUser(activity?.instructions.trainingAid, accountUser);
  const practiceSteps = useMemo(() => activity?.instructions.instructions ?? [], [activity]);
  const pageState = loadingAction === "complete"
    ? "submitting"
    : completedAttempt
    ? outcome?.coachReviewRequired ? "coach_review_pending" : "outcome"
    : showComplete ? "completion"
    : activeAttempt ? "active"
    : "overview";
  const nextPlanHref = nextPlanUrl(activity);
  const resourceLinks = useMemo(() => {
    const links: Array<{ href: string; label: string; priority: "coach" | "mai" }> = [];
    if (activity?.coachFeedbackSourceId) links.push({ href: "/videos", label: "Review Coach Lesson", priority: "coach" });
    if (activity?.relatedSessionId) links.push({ href: `/sessions?session=${encodeURIComponent(activity.relatedSessionId)}`, label: "Review Session Results", priority: "mai" });
    if (completedAttempt?.linkedSessionId) links.push({ href: `/sessions?session=${encodeURIComponent(completedAttempt.linkedSessionId)}`, label: "View Practice Results", priority: "mai" });
    if (visibleAid) links.push({ href: "#training-aid", label: "Training-Aid Instructions", priority: activity?.coachId ? "coach" : "mai" });
    return links;
  }, [activity?.coachFeedbackSourceId, activity?.coachId, activity?.relatedSessionId, completedAttempt?.linkedSessionId, visibleAid]);

  useEffect(() => {
    const id = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() ?? "");
    setActivityId(id);
  }, []);

  useEffect(() => {
    if (!activeAttempt?.startedAt || completedAttempt) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(elapsedSecondsSince(activeAttempt.startedAt));
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(elapsedSecondsSince(activeAttempt.startedAt));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeAttempt?.startedAt, completedAttempt?.id]);

  useEffect(() => {
    if (pageState === "completion" || pageState === "submitting") completionRef.current?.focus();
    if (pageState === "outcome" || pageState === "coach_review_pending") outcomeRef.current?.focus();
  }, [pageState]);

  useEffect(() => {
    let active = true;
    fetch("/api/account", { cache: "no-store" })
      .then((response) => readApiJson<AccountPayload>(response, "Account could not be loaded."))
      .then((payload) => {
        if (active) setAccountUser(payload.user ?? null);
      })
      .catch(() => {
        if (active) setAccountUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadPractice(nextMessage = "") {
    if (!activityId) return;
    setMessage(nextMessage || "Loading practice...");
    try {
      const response = await fetch(`/api/practice?activityId=${encodeURIComponent(activityId)}`, { cache: "no-store" });
      const payload = await readApiJson<PracticeDetailPayload>(response, "Practice assignment could not be loaded.");
      setActivity(payload.activity ?? null);
      setAttempts(payload.attempts ?? []);
      setEligibleSessions(payload.eligibleSessions ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Practice assignment could not be loaded.");
    }
  }

  useEffect(() => {
    void loadPractice();
  }, [activityId]);

  async function startPractice() {
    if (!activityId) return;
    setLoadingAction("start");
    setMessage(activeAttempt ? "Resuming practice..." : "Starting practice...");
    try {
      const response = await fetch("/api/practice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", activityId }),
      });
      await readApiJson(response, "Practice could not be started.");
      setShowComplete(false);
      await loadPractice("Practice started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Practice could not be started.");
    } finally {
      setLoadingAction("");
    }
  }

  async function completePractice() {
    if (!activityId) return;
    setLoadingAction("complete");
    setMessage("Saving practice result...");
    try {
      const response = await fetch("/api/practice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_result",
          activityId,
          attemptId: activeAttempt?.id ?? latestAttempt?.id,
          evidenceSources: form.relatedSessionId ? ["session"] : [],
          attempts: form.completedShotCount,
          completedAmount: form.completedAmount,
          completedMinutes: form.completedMinutes,
          completedSetCount: form.completedSetCount,
          completedShotCount: form.completedShotCount,
          memberConfidenceRating: form.confidence,
          memberDifficultyLabel: form.difficulty,
          memberNotes: form.notes,
          notes: form.notes,
          reflection: form.notes,
          relatedSessionId: form.relatedSessionId,
          submissionType: form.relatedSessionId ? "session_upload" : "manual",
          trainingAidHelpfulness: form.trainingAidHelpfulness,
          trainingAidUsed: form.trainingAidUsed,
        }),
      });
      await readApiJson(response, "We could not save your practice result. Your session data remains safe.");
      setShowComplete(false);
      await loadPractice("Practice result saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not save your practice result. Your session data remains safe.");
    } finally {
      setLoadingAction("");
    }
  }

  function openImport(kind: "photo" | "csv" | "manual" | "session" = "session") {
    const params = new URLSearchParams({ tab: "import", practiceAssignmentId: activityId, practiceImport: kind });
    window.location.href = `/?${params.toString()}`;
  }

  function openVideoEvidence() {
    setMessage("Video evidence linking is deliberately deferred until lesson uploads can attach to this Practice Plan. Add a photo, CSV, manual result, or existing session for this completion.");
  }

  function viewLinkedSession() {
    const sessionId = completedAttempt?.linkedSessionId || form.relatedSessionId;
    if (!sessionId) return;
    window.location.href = `/sessions?session=${encodeURIComponent(sessionId)}`;
  }

  return (
    <main className="app-shell challenge-detail-shell practice-detail-shell">
      <section className="panel challenge-detail-panel practice-detail-panel">
        <div className="challenge-detail-header">
          <MaiCoachLogoFull className="brand-lockup" />
          <a className="text-button" href="/?tab=practice">Return to Practice</a>
        </div>

        {message && <div className="practice-status-message" role="status" aria-live="polite">{message}</div>}

        {activity ? (
          <>
            <section className={["practice-plan-hero", pageState].join(" ")}>
              <div>
                <p className="eyebrow">{planEyebrow(activity)}</p>
                <h1>{activity.title}</h1>
                <strong>{planSourceLabel(activity)}</strong>
                <p>{planSourceSummary(activity)}</p>
                <div className="practice-plan-actions">
                  {pageState === "overview" && (
                    <button className="primary-action" disabled={loadingAction === "start"} onClick={() => void startPractice()} type="button">
                      Start Practice
                    </button>
                  )}
                  {pageState === "active" && (
                    <button className="primary-action" onClick={() => setShowComplete(true)} type="button">
                      Continue Practice
                    </button>
                  )}
                  {(pageState === "outcome" || pageState === "coach_review_pending") && (
                    <button className="primary-action" onClick={() => { window.location.href = "/?tab=practice"; }} type="button">
                      Return to Today
                    </button>
                  )}
                </div>
              </div>
              <dl className="practice-plan-meta">
                <div><dt>Status</dt><dd><span className="practice-status-pill">{stateLabel(pageState)}</span></dd></div>
                <div><dt>Assigned</dt><dd>{formatDate(activity.createdAt || activity.updatedAt)}</dd></div>
                <div><dt>Focus</dt><dd>{activity.focusArea}</dd></div>
                <div><dt>Estimated time</dt><dd>{activity.durationMinutes ? `${activity.durationMinutes} minutes` : "NA"}</dd></div>
                <div><dt>Complete</dt><dd>{workTarget(activity)}</dd></div>
                <div><dt>Track</dt><dd>{planTrackLabel(activity)}</dd></div>
              </dl>
            </section>

            {pageState === "overview" && (
              <>
                <section className="panel practice-plan-focus">
                  <div>
                    <p className="eyebrow">Today's Focus</p>
                    <h2>{activity.focusArea}</h2>
                  </div>
                  <ul>
                    <li>{isCoachPrimary(activity) ? `${coachFirstName(activity)} wants this to be your next priority.` : `This is the clearest next practice focus from your saved work.`}</li>
                    <li>{activity.reasonSelected || "Keep the work tied to this saved Practice Plan."}</li>
                    <li>{successCue(activity)}</li>
                  </ul>
                  <button className="primary-action" disabled={loadingAction === "start"} onClick={() => void startPractice()} type="button">
                    Start Practice
                  </button>
                </section>

                <section className="panel practice-how-to">
                  <div className="challenge-detail-section-heading">
                    <div>
                      <p className="eyebrow">How to Practice</p>
                      <h2>{activity.title}</h2>
                    </div>
                    <span>{workTarget(activity)}</span>
                  </div>
                  {activity.instructions.setup && (
                    <div className="practice-instruction-block">
                      <span>Setup</span>
                      <p>{activity.instructions.setup}</p>
                    </div>
                  )}
                  {practiceSteps.length > 0 && (
                    <ol className="practice-instruction-list practice-detail-steps">
                      {practiceSteps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  )}
                  {activity.target?.successTarget && (
                    <div className="practice-target-box">
                      <span>Success goal</span>
                      <strong>{activity.target.successTarget}</strong>
                    </div>
                  )}
                  {visibleAid && (
                    <div className="challenge-training-aid-card" id="training-aid">
                      <span>Training Aid</span>
                      <strong>{visibleAid.name}</strong>
                      {visibleAid.whyItFits && <p>{visibleAid.whyItFits}</p>}
                      {(visibleAid.setupSteps ?? []).length > 0 && (
                        <ol className="practice-instruction-list">
                          {visibleAid.setupSteps?.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                      )}
                      {visibleAid.noEquipmentAlternative && <small>No-equipment alternative: {visibleAid.noEquipmentAlternative}</small>}
                      {(visibleAid.safetyNotes ?? []).length > 0 && <small>Safety: {visibleAid.safetyNotes?.join(" ")}</small>}
                    </div>
                  )}
                </section>

                {resourceLinks.length > 0 && (
                  <section className="panel practice-resources">
                    <p className="eyebrow">{isCoachPrimary(activity) ? "Coaching Resources" : "Practice Resources"}</p>
                    <div className="practice-resource-grid">
                      {resourceLinks.map((link) => (
                        <a className={link.priority === "coach" ? "coach-resource" : ""} href={link.href} key={`${link.label}-${link.href}`}>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {pageState === "active" && (
              <section className="panel practice-active-panel" aria-live="polite">
                <p className="eyebrow">Practice In Progress</p>
                <div className="challenge-detail-section-heading">
                  <div>
                    <h2>{activity.title}</h2>
                    <p>{activity.instructions.setup || activity.focusArea}</p>
                  </div>
                  <div className="practice-elapsed" aria-label={`Elapsed practice time ${formatElapsed(elapsedSeconds)}`}>
                    <span>Elapsed</span>
                    <strong>{formatElapsed(elapsedSeconds)}</strong>
                  </div>
                </div>
                <dl className="practice-challenge-criteria challenge-detail-rules">
                  <div><dt>Progress</dt><dd>{currentProgressLabel(activity, activeAttempt)}</dd></div>
                  <div><dt>Source</dt><dd>{activeAttempt?.progress?.sourceLabel ?? "Member recorded"}</dd></div>
                  <div><dt>Target</dt><dd>{workTarget(activity)}</dd></div>
                  <div><dt>Success goal</dt><dd>{activity.target?.successTarget ?? "NA"}</dd></div>
                </dl>
                {visibleAid && (
                  <div className="challenge-training-aid-card" id="training-aid">
                    <span>Training-Aid Reminder</span>
                    <strong>{visibleAid.name}</strong>
                    {visibleAid.whyItFits && <p>{visibleAid.whyItFits}</p>}
                  </div>
                )}
                <div className="practice-evidence-actions">
                  {resourceLinks.some((link) => link.priority === "coach") && (
                    <a className="secondary-action practice-link-button" href={resourceLinks.find((link) => link.priority === "coach")?.href ?? "/videos"}>Review Lesson</a>
                  )}
                  <button className="secondary-action" onClick={() => setShowComplete(true)} type="button">Add Practice Evidence</button>
                  <button className="primary-action" onClick={() => setShowComplete(true)} type="button">Complete Practice</button>
                </div>
              </section>
            )}

            {(pageState === "completion" || pageState === "submitting") && (
              <section className="panel practice-detail-completion" ref={completionRef} tabIndex={-1} aria-busy={pageState === "submitting"}>
                <div className="challenge-detail-section-heading">
                  <div>
                    <p className="eyebrow">{pageState === "submitting" ? "Submitting" : "Complete Practice"}</p>
                    <h2>Record only what actually happened</h2>
                  </div>
                  <button className="secondary-action" onClick={() => setShowComplete(false)} type="button">Back to Practice</button>
                </div>
                <div className="practice-result-form practice-completion-form">
                  <fieldset className="practice-fieldset">
                    <legend>How did today's practice feel?</legend>
                    <div className="practice-segment-row" role="group" aria-label="How did today's practice feel?">
                      {[
                        ["great", "😊 Great"],
                        ["expected", "😐 About what I expected"],
                        ["struggled", "😕 I struggled"],
                      ].map(([value, label]) => (
                        <button aria-pressed={form.difficulty === value} className={form.difficulty === value ? "selected" : ""} key={value} onClick={() => setForm((current) => ({ ...current, difficulty: value }))} type="button">
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label><span>{reflectionPrompt(activity)}</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What changed, what felt hard, or what should be reviewed?" /></label>
                  <label><span>Completed amount</span><select value={form.completedAmount} onChange={(event) => setForm((current) => ({ ...current, completedAmount: event.target.value }))}>
                    <option value="yes">Completed</option>
                    <option value="partial">Partially completed</option>
                  </select></label>
                  <div className="session-result-summary-grid">
                    <label><span>Shots completed</span><input inputMode="numeric" value={form.completedShotCount} onChange={(event) => setForm((current) => ({ ...current, completedShotCount: event.target.value }))} placeholder={activity.attemptCount ? String(activity.attemptCount) : ""} /></label>
                    <label><span>Sets completed</span><input inputMode="numeric" value={form.completedSetCount} onChange={(event) => setForm((current) => ({ ...current, completedSetCount: event.target.value }))} /></label>
                    <label><span>Minutes completed</span><input inputMode="numeric" value={form.completedMinutes} onChange={(event) => setForm((current) => ({ ...current, completedMinutes: event.target.value }))} placeholder={activity.durationMinutes ? String(activity.durationMinutes) : ""} /></label>
                    <label><span>Link Existing Session</span><select value={form.relatedSessionId} onChange={(event) => setForm((current) => ({ ...current, relatedSessionId: event.target.value }))}>
                      <option value="">No Practice Results attached</option>
                      {eligibleSessions.map((session) => (
                        <option key={session.id} value={session.id}>{session.title || session.id} · {session.shotCount} shots</option>
                      ))}
                    </select></label>
                  </div>
                  {visibleAid && (
                    <div className="session-result-summary-grid">
                      <label><span>Did you use the recommended training aid?</span><select value={form.trainingAidUsed} onChange={(event) => setForm((current) => ({ ...current, trainingAidUsed: event.target.value }))}>
                        <option value="">Not applicable</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select></label>
                      <label><span>How helpful was it?</span><select value={form.trainingAidHelpfulness} onChange={(event) => setForm((current) => ({ ...current, trainingAidHelpfulness: event.target.value }))}>
                        <option value="">Optional</option>
                        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                      </select></label>
                    </div>
                  )}
                  <section className="practice-evidence-panel">
                    <p className="eyebrow">Add Practice Evidence</p>
                    <p>{evidenceHelper(activity)}</p>
                    <div className="practice-result-options">
                      <button onClick={() => openImport("photo")} type="button">Add Photo</button>
                      <button onClick={openVideoEvidence} type="button">Add Video</button>
                      <button onClick={() => openImport("session")} type="button">Add Practice Results</button>
                      <button onClick={() => setMessage("No problem. Practice can be completed without added evidence.")} type="button">Skip for Now</button>
                    </div>
                    <div className="practice-result-options secondary-grid">
                      <button onClick={() => openImport("csv")} type="button">Upload CSV</button>
                      <button onClick={() => openImport("manual")} type="button">Enter Results Manually</button>
                    </div>
                  </section>
                  <div className="button-row">
                    <button className="primary-action" disabled={loadingAction === "complete"} onClick={() => void completePractice()} type="button">Save Practice Result</button>
                    <button className="secondary-action" onClick={() => setShowComplete(false)} type="button">Cancel</button>
                  </div>
                </div>
              </section>
            )}

            {(pageState === "outcome" || pageState === "coach_review_pending") && completedAttempt && outcome && (
              <section className={["challenge-complete-card", "practice-complete-card", pageState].join(" ")} ref={outcomeRef} tabIndex={-1}>
                <p className="eyebrow">{pageState === "coach_review_pending" ? "Coach Review Pending" : "Practice Complete"}</p>
                <h2>{activity.title}</h2>
                <div className="session-result-summary-grid">
                  <div><span>Completed</span><strong>{completedAttempt.memberCompletedAmount === "partial" ? "Partially completed" : "Completed"}</strong></div>
                  <div><span>Amount</span><strong>{completedAttempt.progress?.label ?? "Member recorded"}</strong></div>
                  <div><span>How it felt</span><strong>{reflectionLabel(completedAttempt.memberDifficultyLabel)}</strong></div>
                  <div><span>Evidence</span><strong>{evidenceSummary(completedAttempt)}</strong></div>
                </div>
                {outcome.measurementSource === "measured_from_session_data" && outcome.evidence?.length ? (
                  <div className="practice-measured-result">
                    <span>Measured result</span>
                    {outcome.evidence
                      .filter((item) => item.source === "measured")
                      .map((item) => <strong key={`${item.label}-${item.before}-${item.after}`}>{evidenceLabel(item)}</strong>)}
                  </div>
                ) : (
                  <p>Practice completed without added measured evidence.</p>
                )}
                {pageState === "coach_review_pending" ? (
                  <p>{activity.instructions.coachConnection?.coachName || "Your Coach"} will review your practice, reflection, and evidence before assigning the next step.</p>
                ) : (
                  <p>MAI-generated recommendation: {activity.latestResult?.nextRecommendation?.recommendation || outcome.recommendedReason || "Repeat this Practice Plan once more or add measured Practice Results next time."}</p>
                )}
                <div className="button-row">
                  <button className="primary-action" onClick={() => { window.location.href = "/?tab=practice"; }} type="button">Return to Today</button>
                  {isIndependentPlan(activity) && nextPlanHref && (
                    <a className="secondary-action practice-link-button" href={nextPlanHref}>View Next MAI Plan</a>
                  )}
                  <button className="secondary-action" disabled={!completedAttempt.linkedSessionId} onClick={viewLinkedSession} type="button">View Practice Results</button>
                </div>
              </section>
            )}

            {attempts.length > 0 && (
              <section className="panel practice-history-panel">
                <div className="challenge-detail-section-heading">
                  <div>
                    <p className="eyebrow">Practice History</p>
                    <h2>Attempts on this Practice Plan</h2>
                  </div>
                  <span>{attempts.length} saved</span>
                </div>
                <div className="practice-history-list">
                  {attempts.map((attempt) => (
                    <div className="practice-history-row" key={attempt.id}>
                      <span>{formatDate(attempt.startedAt)} · {planTrackLabel(activity)}</span>
                      <strong>{activity.title}</strong>
                      <small>
                        Completed: {attempt.progress?.label ?? attempt.status} ·
                        Reflection: {reflectionLabel(attempt.memberDifficultyLabel)} ·
                        Training aid: {attempt.trainingAidUsed === true ? "Used" : attempt.trainingAidUsed === false ? "Not used" : "NA"} ·
                        Evidence: {evidenceSummary(attempt)} ·
                        Outcome: {attempt.evaluation?.classification?.replaceAll("_", " ") ?? "NA"} ·
                        Review: {attempt.coachReviewStatus ?? "not required"} ·
                        Next: {attempt.evaluation?.recommendedNextAction ?? "NA"}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="panel practice-empty-panel">
            <h2>Practice Plan could not be loaded</h2>
            <p>Return to Practice and choose an assignment again.</p>
          </section>
        )}
      </section>
    </main>
  );
}
