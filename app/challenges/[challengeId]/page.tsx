"use client";

import { useEffect, useMemo, useState } from "react";
import { MaiCoachLogoFull } from "@/components/brand/mai-coach-logo";
import {
  parseChallengeCriteria,
  SEVEN_IRON_PRECISION_TEMPLATE,
} from "@/lib/challenge-policy.mjs";

type ChallengeState = {
  attempt?: {
    completedAt?: string | null;
    id: string;
    result?: {
      averageQualifyingCarry?: number | null;
      averageQualifyingOffline?: number | null;
      biggestWin?: string;
      currentSuccessCount?: number;
      measuredShotCount?: number;
      nextStep?: string;
      nextStepTrainingAid?: {
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
      requiredSuccessCount?: number;
      sessionId?: string | null;
      shotResults?: {
        carry?: number | null;
        club?: string | null;
        id: string;
        offline?: number | null;
        qualified: boolean;
        reason?: string;
        shotNumber?: string;
        statusLabel?: string;
      }[];
      status?: string;
      totalAttemptedShotCount?: number;
      unavailableShotCount?: number;
    };
    sessionId?: string | null;
    status?: string;
  } | null;
  challenge?: {
    currentSuccessCount: number;
    id: string;
    requiredSuccessCount: number;
    source?: string;
    status: string;
  } | null;
  eligibleSessions?: {
    date: string;
    id: string;
    measuredShotCount: number;
    qualifiedShotCount: number;
    sessionSource: string;
    title: string;
    totalAttemptedShotCount: number;
  }[];
};

async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || fallbackMessage);
  return payload as T;
}

function formatNumber(value: number | null | undefined, unit = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit ? ` ${unit}` : ""}` : "NA";
}

function sourceLabel(source?: string) {
  if (source === "coach") return "Coach";
  if (source === "coach_approved_ai") return "Coach-approved MAI";
  return "MAI Coach";
}

export default function ChallengeDetailPage() {
  const [challengeId, setChallengeId] = useState("");
  const [state, setState] = useState<ChallengeState | null>(null);
  const [message, setMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const criteria = useMemo(() => parseChallengeCriteria(SEVEN_IRON_PRECISION_TEMPLATE.criteriaJson) as {
    carryMax?: number;
    carryMin?: number;
    offlineMaxAbs?: number;
  }, []);
  const challenge = state?.challenge ?? null;
  const attempt = state?.attempt ?? null;
  const result = attempt?.result ?? null;
  const isCompleted = challenge?.status === "completed" || result?.status === "completed";
  const currentSuccessCount = challenge?.currentSuccessCount ?? result?.currentSuccessCount ?? 0;
  const requiredSuccessCount = challenge?.requiredSuccessCount ?? result?.requiredSuccessCount ?? SEVEN_IRON_PRECISION_TEMPLATE.successShotCount;

  useEffect(() => {
    const id = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() ?? "");
    setChallengeId(id);
  }, []);

  useEffect(() => {
    if (!challengeId) return;
    let active = true;
    setMessage("Loading challenge...");
    fetch(`/api/challenges?challengeId=${encodeURIComponent(challengeId)}`, { cache: "no-store" })
      .then((response) => readApiJson<ChallengeState>(response, "Challenge could not be loaded."))
      .then((payload) => {
        if (!active) return;
        setState(payload);
        setMessage("");
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Challenge could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [challengeId]);

  async function runAction(action: "start" | "continue", sessionId?: string) {
    if (!challengeId) return;
    setLoadingAction(sessionId || action);
    setMessage(action === "start" || action === "continue" ? "Opening challenge attempt..." : "Scoring measured shots...");
    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: sessionId ? "link_session" : action,
          challengeId,
          sessionId,
        }),
      });
      const payload = await readApiJson<ChallengeState>(response, "Challenge could not be updated.");
      setState(payload);
      const nextResult = payload.attempt?.result;
      setMessage(payload.challenge?.status === "completed" || nextResult?.status === "completed"
        ? "Challenge complete. Results were saved."
        : sessionId
          ? "Session linked. Keep going until 5 measured shots qualify."
          : "Challenge ready. Link a measured session when you have one.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Challenge could not be updated.");
    } finally {
      setLoadingAction("");
    }
  }

  function startNewSession() {
    const params = new URLSearchParams({
      challengeId,
      club: SEVEN_IRON_PRECISION_TEMPLATE.club,
      tab: "import",
    });
    if (attempt?.id) params.set("challengeAttemptId", attempt.id);
    window.location.href = `/?${params.toString()}`;
  }

  function viewSession() {
    const sessionId = result?.sessionId || attempt?.sessionId;
    if (!sessionId) return;
    window.location.href = `/sessions?session=${encodeURIComponent(sessionId)}&club=${encodeURIComponent(SEVEN_IRON_PRECISION_TEMPLATE.club)}`;
  }

  return (
    <main className="app-shell challenge-detail-shell">
      <section className="panel challenge-detail-panel">
        <div className="challenge-detail-header">
          <MaiCoachLogoFull className="brand-lockup" />
          <a className="text-button" href="/">Return to Dashboard</a>
        </div>
        <div className="challenge-detail-hero">
          <div>
            <p className="eyebrow">{isCompleted ? "Challenge Results" : "Measured Challenge"}</p>
            <h1>{SEVEN_IRON_PRECISION_TEMPLATE.title}</h1>
            <p>{SEVEN_IRON_PRECISION_TEMPLATE.description}</p>
          </div>
          <div className="challenge-result-meter">
            <span>Progress</span>
            <strong>{currentSuccessCount} of {requiredSuccessCount}</strong>
            <small>{sourceLabel(challenge?.source)}</small>
          </div>
        </div>
        <dl className="practice-challenge-criteria challenge-detail-rules">
          <div><dt>Club</dt><dd>{SEVEN_IRON_PRECISION_TEMPLATE.club}</dd></div>
          <div><dt>Carry window</dt><dd>{criteria.carryMin ?? "NA"}-{criteria.carryMax ?? "NA"} yd</dd></div>
          <div><dt>Offline window</dt><dd>Inside {criteria.offlineMaxAbs ?? "NA"} yd</dd></div>
          <div><dt>Required</dt><dd>{requiredSuccessCount} qualifying shots</dd></div>
        </dl>
        {message && <div className="practice-status-message" role="status">{message}</div>}

        {isCompleted ? (
          <section className="challenge-complete-card">
            <p className="eyebrow">Challenge complete</p>
            <h2>{currentSuccessCount} of {result?.totalAttemptedShotCount ?? currentSuccessCount} shots qualified</h2>
            <div className="session-result-summary-grid">
              <div><span>Biggest Win</span><strong>{result?.biggestWin ?? "Measured shots qualified inside both target windows."}</strong></div>
              <div><span>Average qualified carry</span><strong>{formatNumber(result?.averageQualifyingCarry, "yd")}</strong></div>
              <div><span>Average qualified offline</span><strong>{formatNumber(result?.averageQualifyingOffline, "yd")}</strong></div>
              <div><span>Next Step</span><strong>{result?.nextStep ?? "Repeat this challenge once more before narrowing the target window."}</strong></div>
            </div>
            {result?.nextStepTrainingAid?.aidId && result.nextStepTrainingAid.aidId !== "none" && (
              <div className="challenge-training-aid-card">
                <span>Supported training aid</span>
                <strong>{result.nextStepTrainingAid.name}</strong>
                {result.nextStepTrainingAid.whyItFits && <p>{result.nextStepTrainingAid.whyItFits}</p>}
                {(result.nextStepTrainingAid.setupSteps ?? []).length > 0 && (
                  <ol className="practice-instruction-list">
                    {result.nextStepTrainingAid.setupSteps?.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
                {result.nextStepTrainingAid.noEquipmentAlternative && <small>No-equipment alternative: {result.nextStepTrainingAid.noEquipmentAlternative}</small>}
              </div>
            )}
            <div className="button-row">
              <button className="primary-action" onClick={() => { window.location.href = "/"; }} type="button">Done</button>
              <button className="secondary-action" disabled={!result?.sessionId && !attempt?.sessionId} onClick={viewSession} type="button">View Session</button>
            </div>
          </section>
        ) : (
          <section className="challenge-action-grid">
            <article className="panel">
              <p className="eyebrow">Start or continue</p>
              <h2>{challenge?.status === "active" ? "Challenge attempt active" : "Start the challenge"}</h2>
              <p>MAI Coach will score only measured 7-Iron shots. Missing carry or offline values are not estimated.</p>
              <button className="primary-action" disabled={Boolean(loadingAction)} onClick={() => void runAction(challenge?.status === "active" ? "continue" : "start")} type="button">
                {challenge?.status === "active" ? "Continue Challenge" : "Start Challenge"}
              </button>
            </article>
            <article className="panel">
              <p className="eyebrow">Start a new session</p>
              <h2>Record fresh 7-Iron shots</h2>
              <p>Use the existing session import flow. This challenge ID will stay attached while you save the session.</p>
              <button className="secondary-action" disabled={!challenge?.id} onClick={startNewSession} type="button">Start New Session</button>
            </article>
          </section>
        )}

        {!isCompleted && (
          <section className="panel">
            <div className="challenge-detail-section-heading">
              <div>
                <p className="eyebrow">Link an existing session</p>
                <h2>Eligible measured 7-Iron sessions</h2>
              </div>
              <span>{state?.eligibleSessions?.length ?? 0} available</span>
            </div>
            {state?.eligibleSessions?.length ? (
              <div className="session-list">
                {state.eligibleSessions.map((session) => (
                  <button
                    className="session-row"
                    disabled={Boolean(loadingAction)}
                    key={session.id}
                    onClick={() => void runAction("continue", session.id)}
                    type="button"
                  >
                    <span>
                      <strong>{session.title}</strong>
                      <small>{session.date} · {session.sessionSource || "Session"} · {session.measuredShotCount} measured shots</small>
                    </span>
                    <span className="row-metric">{session.qualifiedShotCount}/{requiredSuccessCount}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="practice-empty-panel">
                <h3>No eligible measured session yet</h3>
                <p>Upload or manually save a session with measured 7-Iron carry and offline data.</p>
              </div>
            )}
          </section>
        )}

        {result?.shotResults?.length ? (
          <section className="panel">
            <div className="challenge-detail-section-heading">
              <div>
                <p className="eyebrow">Shot results</p>
                <h2>Measured evaluation</h2>
              </div>
              <span>{result.totalAttemptedShotCount ?? result.shotResults.length} attempted</span>
            </div>
            <div className="compact-table">
              <div className="table-row shot-row table-head">
                <span>Shot</span>
                <span>Club</span>
                <span>Carry</span>
                <span>Offline</span>
                <span>Result</span>
              </div>
              {result.shotResults.map((shot) => (
                <div className="table-row shot-row" key={shot.id}>
                  <span>{shot.shotNumber ?? shot.id}</span>
                  <span>{shot.club ?? "NA"}</span>
                  <span>{formatNumber(shot.carry, "yd")}</span>
                  <span>{formatNumber(shot.offline, "yd")}</span>
                  <span>{shot.statusLabel ?? (shot.qualified ? "Qualified" : "Not qualified")}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
