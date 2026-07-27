"use client";

import { useEffect, useMemo, useState } from "react";
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
  reasonSelected: string;
  scoring?: {
    enabled?: boolean;
    system?: string;
  };
  status: string;
  target?: {
    successTarget?: string;
  };
  title: string;
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

function visibleAidForUser(aid: TrainingAidRecommendation | null | undefined, user: AccountUser | null) {
  if (!aid || !aid.aidId || aid.aidId === "none") return null;
  if (user?.role === "coach" || user?.role === "admin") return aid;
  if (aid.studentVisible === false || aid.approvalState === "draft") return null;
  return aid;
}

export default function PracticeAssignmentPage() {
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [activityId, setActivityId] = useState("");
  const [activity, setActivity] = useState<PracticeActivity | null>(null);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [eligibleSessions, setEligibleSessions] = useState<EligibleSession[]>([]);
  const [message, setMessage] = useState("Loading practice...");
  const [loadingAction, setLoadingAction] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [form, setForm] = useState({
    completedAmount: "yes",
    completedMinutes: "",
    completedSetCount: "",
    completedShotCount: "",
    confidence: "3",
    difficulty: "about_same",
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

  useEffect(() => {
    const id = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() ?? "");
    setActivityId(id);
  }, []);

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

        <div className="challenge-detail-hero">
          <div>
            <p className="eyebrow">{sourceLabel(activity)}</p>
            <h1>{activity?.title ?? "Practice assignment"}</h1>
            <p>{activity?.reasonSelected ?? "Load the focused practice assignment."}</p>
          </div>
          <div className="challenge-result-meter">
            <span>Progress</span>
            <strong>{activeAttempt?.progress?.label ?? completedAttempt?.progress?.label ?? "Ready"}</strong>
            <small>{activeAttempt?.progress?.sourceLabel ?? completedAttempt?.progress?.sourceLabel ?? "Member recorded"}</small>
          </div>
        </div>

        {message && <div className="practice-status-message" role="status">{message}</div>}

        {activity ? (
          <>
            <dl className="practice-challenge-criteria challenge-detail-rules">
              <div><dt>Priority</dt><dd>{activity.assignment?.practicePriority ?? activity.focusArea}</dd></div>
              <div><dt>Club</dt><dd>{activity.club || "Any club"}</dd></div>
              <div><dt>Volume</dt><dd>{activity.attemptCount ? `${activity.attemptCount} shots` : activity.durationMinutes ? `${activity.durationMinutes} minutes` : "Member recorded"}</dd></div>
              <div><dt>Source</dt><dd>{sourceLabel(activity)}</dd></div>
            </dl>

            {completedAttempt && outcome ? (
              <section className="challenge-complete-card practice-complete-card">
                <p className="eyebrow">{outcome.measurementSource === "measured_from_session_data" ? "Practice complete" : "Completion recorded"}</p>
                <h2>{activity.title}</h2>
                <div className="session-result-summary-grid">
                  <div><span>Completed</span><strong>{completedAttempt.progress?.label ?? "Practice completed"}</strong></div>
                  <div><span>Biggest Win</span><strong>{outcome.biggestWin ?? "Practice result saved."}</strong></div>
                  <div><span>Next Step</span><strong>{outcome.recommendedReason ?? "Repeat once more before progressing."}</strong></div>
                  <div><span>Review</span><strong>{outcome.nextActionVisibility?.label ?? (outcome.coachReviewRequired ? "Coach review pending" : "AI-generated practice recommendation")}</strong></div>
                </div>
                {outcome.measurementSource === "measured_from_session_data" && outcome.evidence?.length ? (
                  <div className="practice-measured-result">
                    <span>Measured result</span>
                    {outcome.evidence
                      .filter((item) => item.source === "measured")
                      .map((item) => <strong key={`${item.label}-${item.before}-${item.after}`}>{evidenceLabel(item)}</strong>)}
                  </div>
                ) : (
                  <p>Add session data next time to measure the result.</p>
                )}
                {outcome.coachReviewRequired && (
                  <p>Your practice is complete. Your Coach will review the result and assign your next step.</p>
                )}
                {!outcome.coachReviewRequired && (
                  <p>{outcome.nextActionVisibility?.label ?? "AI-generated practice recommendation"}: {outcome.recommendedNextAction ?? "repeat"}</p>
                )}
                <div className="button-row">
                  <button className="primary-action" onClick={() => { window.location.href = "/?tab=practice"; }} type="button">Done</button>
                  <button className="secondary-action" disabled={!completedAttempt.linkedSessionId} onClick={viewLinkedSession} type="button">View Results</button>
                </div>
              </section>
            ) : (
              <section className="challenge-action-grid practice-focus-grid">
                <article className="panel practice-focus-card">
                  <p className="eyebrow">Why</p>
                  <h2>{activity.focusArea}</h2>
                  <p>{activity.instructions.sourceSummary || activity.instructions.coachConnection?.summary || activity.reasonSelected}</p>
                  <button className="primary-action" disabled={loadingAction === "start"} onClick={() => void startPractice()} type="button">
                    {activeAttempt ? "Resume Practice" : "Start Practice"}
                  </button>
                </article>
                <article className="panel practice-focus-card">
                  <p className="eyebrow">Setup</p>
                  <h2>{activity.instructions.setup ?? "Set up the drill"}</h2>
                  {visibleAid ? (
                    <div className="challenge-training-aid-card">
                      <span>Training Aid</span>
                      <strong>{visibleAid.name}</strong>
                      {visibleAid.whyItFits && <p>{visibleAid.whyItFits}</p>}
                      {(visibleAid.setupSteps ?? []).length > 0 && (
                        <ol className="practice-instruction-list">
                          {visibleAid.setupSteps?.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                      )}
                    </div>
                  ) : (
                    <p>No training aid is required for this assignment.</p>
                  )}
                </article>
              </section>
            )}

            {!completedAttempt && (
              <>
                <section className="panel">
                  <div className="challenge-detail-section-heading">
                    <div>
                      <p className="eyebrow">Practice block</p>
                      <h2>{activity.target?.successTarget ?? "Success goal"}</h2>
                    </div>
                    <span>{activity.durationMinutes ? `About ${activity.durationMinutes} minutes` : "No timer required"}</span>
                  </div>
                  <ol className="practice-instruction-list practice-detail-steps">
                    {practiceSteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                </section>

                <section className="panel practice-detail-completion">
                  <div className="challenge-detail-section-heading">
                    <div>
                      <p className="eyebrow">Complete practice</p>
                      <h2>Record only what actually happened</h2>
                    </div>
                    <button className="secondary-action" onClick={() => setShowComplete((current) => !current)} type="button">
                      {showComplete ? "Hide Form" : "Complete Practice"}
                    </button>
                  </div>
                  {showComplete && (
                    <div className="practice-result-form practice-completion-form">
                      <div className="practice-segment-row" role="group" aria-label="How did it feel?">
                        {[
                          ["easier", "Easier"],
                          ["about_same", "About the Same"],
                          ["harder", "Harder"],
                        ].map(([value, label]) => (
                          <button className={form.difficulty === value ? "selected" : ""} key={value} onClick={() => setForm((current) => ({ ...current, difficulty: value }))} type="button">
                            {label}
                          </button>
                        ))}
                      </div>
                      <label><span>How confident are you?</span><select value={form.confidence} onChange={(event) => setForm((current) => ({ ...current, confidence: event.target.value }))}>
                        {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                      </select></label>
                      <label><span>Completed amount</span><select value={form.completedAmount} onChange={(event) => setForm((current) => ({ ...current, completedAmount: event.target.value }))}>
                        <option value="yes">Yes</option>
                        <option value="partial">Partially</option>
                      </select></label>
                      <div className="session-result-summary-grid">
                        <label><span>Shots completed</span><input inputMode="numeric" value={form.completedShotCount} onChange={(event) => setForm((current) => ({ ...current, completedShotCount: event.target.value }))} placeholder={activity.attemptCount ? String(activity.attemptCount) : ""} /></label>
                        <label><span>Sets completed</span><input inputMode="numeric" value={form.completedSetCount} onChange={(event) => setForm((current) => ({ ...current, completedSetCount: event.target.value }))} /></label>
                        <label><span>Minutes completed</span><input inputMode="numeric" value={form.completedMinutes} onChange={(event) => setForm((current) => ({ ...current, completedMinutes: event.target.value }))} placeholder={activity.durationMinutes ? String(activity.durationMinutes) : ""} /></label>
                        <label><span>Attach session results</span><select value={form.relatedSessionId} onChange={(event) => setForm((current) => ({ ...current, relatedSessionId: event.target.value }))}>
                          <option value="">No session attached</option>
                          {eligibleSessions.map((session) => (
                            <option key={session.id} value={session.id}>{session.title || session.id} · {session.shotCount} shots</option>
                          ))}
                        </select></label>
                      </div>
                      {visibleAid && (
                        <div className="session-result-summary-grid">
                          <label><span>Used training aid?</span><select value={form.trainingAidUsed} onChange={(event) => setForm((current) => ({ ...current, trainingAidUsed: event.target.value }))}>
                            <option value="">Choose</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select></label>
                          <label><span>Was it helpful?</span><select value={form.trainingAidHelpfulness} onChange={(event) => setForm((current) => ({ ...current, trainingAidHelpfulness: event.target.value }))}>
                            <option value="">Optional</option>
                            {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
                          </select></label>
                        </div>
                      )}
                      <label><span>Optional note</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What changed, what felt hard, or what should your Coach know?" /></label>
                      <div className="button-row">
                        <button className="primary-action" disabled={loadingAction === "complete"} onClick={() => void completePractice()} type="button">Save Practice Result</button>
                        <button className="secondary-action" onClick={() => openImport("session")} type="button">Attach New Session</button>
                      </div>
                      <div className="practice-result-options">
                        <button onClick={() => openImport("csv")} type="button">Upload CSV</button>
                        <button onClick={() => openImport("photo")} type="button">Upload Session Photos</button>
                        <button onClick={() => openImport("manual")} type="button">Enter Data Manually</button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {attempts.length > 0 && (
              <section className="panel practice-history-panel">
                <div className="challenge-detail-section-heading">
                  <div>
                    <p className="eyebrow">Practice history</p>
                    <h2>Attempts on this assignment</h2>
                  </div>
                  <span>{attempts.length} saved</span>
                </div>
                <div className="practice-history-list">
                  {attempts.map((attempt) => (
                    <div className="practice-history-row" key={attempt.id}>
                      <span>{formatDate(attempt.startedAt)} · {sourceLabel(activity)}</span>
                      <strong>{activity.title}</strong>
                      <small>
                        Aid: {attempt.trainingAidUsed === true ? "Used" : attempt.trainingAidUsed === false ? "Not used" : "NA"} ·
                        Completion: {attempt.progress?.label ?? attempt.status} ·
                        Result: {attempt.evaluation?.classification?.replaceAll("_", " ") ?? "NA"} ·
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
            <h2>Practice could not be loaded</h2>
            <p>Return to Practice and choose an assignment again.</p>
          </section>
        )}
      </section>
    </main>
  );
}
