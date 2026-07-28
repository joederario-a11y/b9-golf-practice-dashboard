"use client";

import { useEffect, useMemo, useState } from "react";
import { MaiCoachLogoFull } from "@/components/brand/mai-coach-logo";
import {
  buildStudentPracticePreview,
  COACH_PRACTICE_CLUB_OPTIONS,
  COACH_PRACTICE_DRILL_OPTIONS,
  COACH_PRACTICE_FOCUS_OPTIONS,
  COACH_PRACTICE_PATTERN_OPTIONS,
  COACH_SUCCESS_CRITERIA_OPTIONS,
  COACH_TRAINING_AID_OPTIONS,
  COACH_VOLUME_PRESETS,
  COACHING_CUE_OPTIONS,
  isDuplicateCoachCustomOption,
} from "@/lib/coach-practice-builder-policy.mjs";

type AccountUser = {
  displayName: string;
  firstName: string;
  id: string;
  role: "member" | "coach" | "admin";
};

type CoachMember = {
  accountStatus?: string;
  email: string;
  firstName?: string;
  id: string;
  lastName?: string;
  lastVideoAt?: string;
  name: string;
  videoCount?: number;
};

type PracticeActivity = {
  club?: string;
  durationMinutes?: number;
  focusArea: string;
  id: string;
  instructions?: {
    instructions?: string[];
    sourceSummary?: string;
    trainingAid?: { name?: string };
  };
  target?: { successTarget?: string };
  title: string;
};

const DRAFT_KEY = "mai-coach-practice-builder-draft";

function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  return response.json().catch(() => ({})).then((payload: { error?: string; message?: string }) => {
    if (!response.ok) throw new Error(payload.error || payload.message || fallbackMessage);
    return payload as T;
  });
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `builder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initials(member?: CoachMember | null) {
  if (!member) return "ST";
  return (member.name || member.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function memberLabel(member?: CoachMember | null) {
  if (!member) return "Choose a Student";
  return `${member.name} · ${member.email}`;
}

function defaultForm(memberId = "") {
  return {
    club: "No specific club",
    cues: ["Center contact first"],
    customClub: "",
    customCue: "",
    customDrill: "",
    customFocus: "",
    customPattern: "",
    customSuccess: "",
    customTrainingAid: "",
    customVolume: "",
    drillId: COACH_PRACTICE_DRILL_OPTIONS[0]?.id ?? "",
    focusArea: "Center-face contact",
    idempotencyKey: makeIdempotencyKey(),
    instructions: [
      "Start at controlled speed.",
      "Score the contact or start line after each shot.",
      "Stop when the assigned volume is complete.",
    ],
    memberId,
    messageToStudent: "Quality matters more than distance today.",
    noEquipmentAlternative: "",
    pattern: "Inconsistent contact",
    physicalConsideration: "",
    privateCoachNote: "",
    setup: "",
    sourceContext: "Start Blank",
    sourceLessonId: "",
    sourceSessionId: "",
    successCriterion: "Complete assigned volume",
    title: "",
    trainingAid: "Foot powder spray",
    volumePreset: "3 sets of 7",
    whyItMatters: "More centered contact creates more reliable ball speed and carry.",
  };
}

type BuilderForm = ReturnType<typeof defaultForm>;

export default function CoachPracticeBuilderPage() {
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [members, setMembers] = useState<CoachMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [form, setForm] = useState<BuilderForm>(() => defaultForm());
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [message, setMessage] = useState("Loading Builder...");
  const [saving, setSaving] = useState(false);
  const [assignedActivity, setAssignedActivity] = useState<PracticeActivity | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedMember = members.find((member) => member.id === form.memberId) ?? null;
  const selectedDrill = COACH_PRACTICE_DRILL_OPTIONS.find((drill) => drill.id === form.drillId);
  const preview = buildStudentPracticePreview({
    ...form,
    drillTitle: form.customDrill || selectedDrill?.title || "",
    successCriterion: form.customSuccess || form.successCriterion,
    trainingAid: form.customTrainingAid || form.trainingAid,
    volumePreset: form.volumePreset === "Custom" ? form.customVolume : form.volumePreset,
  }) as {
    club: string;
    cueList: string[];
    drill: string;
    focus: string;
    instructions: string[];
    messageToStudent: string;
    pattern: string;
    success: string;
    title: string;
    trainingAid: string;
    volume: { attemptCount?: number | null; durationMinutes?: number | null; label?: string };
    whyItMatters: string;
  };
  const filteredMembers = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase();
    return members.filter((member) => {
      if (!needle) return true;
      return `${member.name} ${member.email}`.toLowerCase().includes(needle);
    });
  }, [members, memberSearch]);
  const filteredDrills = useMemo(() => {
    const focus = (form.customFocus || form.focusArea).toLowerCase();
    return COACH_PRACTICE_DRILL_OPTIONS.filter((drill) => {
      if (!focus || focus === "other") return true;
      return `${drill.focus} ${drill.title} ${drill.description}`.toLowerCase().includes(focus.split(" ")[0]);
    });
  }, [form.customFocus, form.focusArea]);
  const customDuplicate = {
    cue: isDuplicateCoachCustomOption(form.customCue, COACHING_CUE_OPTIONS),
    drill: isDuplicateCoachCustomOption(form.customDrill, COACH_PRACTICE_DRILL_OPTIONS),
    focus: isDuplicateCoachCustomOption(form.customFocus, COACH_PRACTICE_FOCUS_OPTIONS),
    trainingAid: isDuplicateCoachCustomOption(form.customTrainingAid, COACH_TRAINING_AID_OPTIONS),
  };
  const canAssign = Boolean(form.memberId && preview.title && preview.drill && (preview.volume.label || preview.volume.attemptCount || preview.volume.durationMinutes));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get("memberId") || "";
    const sourceLessonId = params.get("lessonId") || "";
    const sourceSessionId = params.get("sessionId") || "";
    setForm((current) => ({
      ...current,
      memberId,
      sourceContext: sourceLessonId ? "Latest Lesson" : sourceSessionId ? "Recent Session" : current.sourceContext,
      sourceLessonId,
      sourceSessionId,
    }));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/account", { cache: "no-store" }).then((response) => readApiJson<{ user?: AccountUser | null }>(response, "Account could not be loaded.")),
      fetch("/api/members", { cache: "no-store" }).then((response) => readApiJson<{ members?: CoachMember[] }>(response, "Students could not be loaded.")),
    ])
      .then(([account, roster]) => {
        if (!active) return;
        setAccountUser(account.user ?? null);
        setMembers(roster.members ?? []);
        setMessage("");
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "Builder could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loadedDraft) return;
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (stored) {
      try {
        const draft = JSON.parse(stored) as Partial<BuilderForm>;
        setForm((current) => ({ ...current, ...draft, idempotencyKey: draft.idempotencyKey || current.idempotencyKey }));
      } catch {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    }
    setLoadedDraft(true);
  }, [loadedDraft]);

  function updateField<K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setAssignedActivity(null);
  }

  function toggleCue(cue: string) {
    setForm((current) => {
      const hasCue = current.cues.includes(cue);
      const next = hasCue ? current.cues.filter((item) => item !== cue) : [...current.cues, cue].slice(0, 3);
      return { ...current, cues: next };
    });
  }

  function saveDraft() {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    setMessage("Draft saved on this device. It is not visible to the Student.");
  }

  async function assignPlan() {
    if (!canAssign || saving) {
      setMessage("Choose a Student, focus, drill or instructions, and volume before assigning.");
      return;
    }
    const confirmed = window.confirm(`Assign this Practice Plan to ${selectedMember?.name ?? "this Student"}?\n\nFocus: ${preview.focus}\nPractice: ${preview.drill}\nComplete: ${preview.volume.label || "Assigned volume"}\nSuccess: ${preview.success || "Coach review"}`);
    if (!confirmed) return;
    setSaving(true);
    setMessage("Assigning Practice Plan...");
    try {
      const response = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          action: "assign_coach_practice_plan",
          club: form.club === "Other" ? form.customClub : form.club,
          cues: form.customCue ? [...form.cues, form.customCue].slice(0, 3) : form.cues,
          drillTitle: form.customDrill || selectedDrill?.title || "",
          focusArea: form.focusArea === "Other" ? form.customFocus : form.focusArea,
          instructions: form.instructions,
          pattern: form.pattern === "Other" ? form.customPattern : form.pattern,
          successCriterion: form.successCriterion === "Custom success criterion" ? form.customSuccess : form.successCriterion,
          trainingAid: form.trainingAid === "Other" ? form.customTrainingAid : form.trainingAid,
          volumePreset: form.volumePreset === "Custom" ? form.customVolume : form.volumePreset,
        }),
      });
      const payload = await readApiJson<{ activity?: PracticeActivity | null; message?: string; reused?: boolean }>(response, "Practice Plan could not be assigned.");
      if (!payload.activity) throw new Error(payload.message || "Practice Plan could not be assigned.");
      setAssignedActivity(payload.activity);
      window.localStorage.removeItem(DRAFT_KEY);
      setMessage(payload.reused ? payload.message || "Existing Practice Plan opened." : `Practice Plan assigned to ${selectedMember?.name ?? "Student"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Practice Plan could not be assigned.");
    } finally {
      setSaving(false);
    }
  }

  if (accountUser?.role === "member") {
    return (
      <main className="app-shell coach-builder-shell">
        <section className="panel coach-builder-panel">
          <MaiCoachLogoFull className="brand-lockup" />
          <h1>Coach access required</h1>
          <p>Practice Plan Builder is available to Coaches and Admins only.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell coach-builder-shell">
      <section className="panel coach-builder-panel">
        <header className="coach-builder-header">
          <MaiCoachLogoFull className="brand-lockup" />
          <div>
            <p className="eyebrow">Coach Practice Plan Builder</p>
            <h1>Create, preview, and assign one clear plan.</h1>
            <p>Choose a Student, structure the focus, preview the assignment, then publish it into the existing Student Practice Plan experience.</p>
          </div>
          <a className="secondary-action practice-link-button" href="/?tab=videos">Back to Coach Dashboard</a>
        </header>

        {message && <div className="practice-status-message" role="status" aria-live="polite">{message}</div>}

        <div className="coach-builder-grid">
          <form className="coach-builder-form" onSubmit={(event) => { event.preventDefault(); void assignPlan(); }}>
            <section className="panel coach-builder-section">
              <p className="eyebrow">1. Student</p>
              <div className="coach-builder-student-card">
                <span className="coach-builder-avatar">{initials(selectedMember)}</span>
                <div>
                  <strong>{memberLabel(selectedMember)}</strong>
                  <small>{selectedMember ? `${selectedMember.videoCount ?? 0} videos · ${selectedMember.accountStatus ?? "active"}` : "Only assigned Students are shown."}</small>
                </div>
              </div>
              <label>
                <span>Search Students</span>
                <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name or email" />
              </label>
              <label>
                <span>Student</span>
                <select value={form.memberId} onChange={(event) => updateField("memberId", event.target.value)}>
                  <option value="">Choose a Student</option>
                  {filteredMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
                </select>
              </label>
              <div className="coach-builder-source-grid">
                {["Latest Lesson", "Recent Session", "Practice Result", "Start Blank"].map((source) => (
                  <button aria-pressed={form.sourceContext === source} className={form.sourceContext === source ? "selected" : ""} key={source} onClick={() => updateField("sourceContext", source)} type="button">
                    {source}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel coach-builder-section">
              <p className="eyebrow">2. Focus</p>
              <label><span>Primary Focus</span><select value={form.focusArea} onChange={(event) => updateField("focusArea", event.target.value)}>
                {COACH_PRACTICE_FOCUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.focusArea === "Other" && (
                <label><span>Add Custom Focus</span><input value={form.customFocus} onChange={(event) => updateField("customFocus", event.target.value)} placeholder="Coach wording" /></label>
              )}
              {customDuplicate.focus && <small className="coach-builder-warning">That focus already exists as a standard option.</small>}
              <label><span>Common Miss or Pattern</span><select value={form.pattern} onChange={(event) => updateField("pattern", event.target.value)}>
                {COACH_PRACTICE_PATTERN_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.pattern === "Other" && <label><span>Add Custom Pattern</span><input value={form.customPattern} onChange={(event) => updateField("customPattern", event.target.value)} /></label>}
              <label><span>Club</span><select value={form.club} onChange={(event) => updateField("club", event.target.value)}>
                {COACH_PRACTICE_CLUB_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.club === "Other" && <label><span>Add Custom Club</span><input value={form.customClub} onChange={(event) => updateField("customClub", event.target.value)} /></label>}
            </section>

            <section className="panel coach-builder-section">
              <p className="eyebrow">3. Practice</p>
              <label><span>Search or Select Drill</span><select value={form.drillId} onChange={(event) => {
                const drill = COACH_PRACTICE_DRILL_OPTIONS.find((item) => item.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  drillId: event.target.value,
                  trainingAid: drill?.trainingAid && COACH_TRAINING_AID_OPTIONS.includes(drill.trainingAid) ? drill.trainingAid : current.trainingAid,
                  volumePreset: drill?.volume && COACH_VOLUME_PRESETS.includes(drill.volume) ? drill.volume : current.volumePreset,
                }));
              }}>
                {filteredDrills.map((drill) => <option key={drill.id} value={drill.id}>{drill.title} · {drill.focus}</option>)}
                <option value="">Other / Add Custom</option>
              </select></label>
              {selectedDrill && <p className="coach-builder-helper">{selectedDrill.description}</p>}
              {!form.drillId && <label><span>Add Custom Drill</span><input value={form.customDrill} onChange={(event) => updateField("customDrill", event.target.value)} placeholder="Zac's Chair Drill" /></label>}
              {customDuplicate.drill && <small className="coach-builder-warning">That drill already exists in the shared list.</small>}
              <fieldset className="practice-fieldset">
                <legend>Coaching Cues</legend>
                <div className="coach-builder-chip-grid">
                  {COACHING_CUE_OPTIONS.filter((cue) => cue !== "Other").map((cue) => (
                    <button aria-pressed={form.cues.includes(cue)} className={form.cues.includes(cue) ? "selected" : ""} key={cue} onClick={() => toggleCue(cue)} type="button">{cue}</button>
                  ))}
                </div>
                <label><span>Add Custom Cue</span><input value={form.customCue} onChange={(event) => updateField("customCue", event.target.value)} /></label>
                {customDuplicate.cue && <small className="coach-builder-warning">That cue already exists as a standard option.</small>}
              </fieldset>
              <label><span>Training Aid</span><select value={form.trainingAid} onChange={(event) => updateField("trainingAid", event.target.value)}>
                {COACH_TRAINING_AID_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.trainingAid === "Other" && <label><span>Add Custom Training Aid</span><input value={form.customTrainingAid} onChange={(event) => updateField("customTrainingAid", event.target.value)} /></label>}
              {customDuplicate.trainingAid && <small className="coach-builder-warning">That training aid already exists as a standard option.</small>}
            </section>

            <section className="panel coach-builder-section">
              <p className="eyebrow">4. Volume and Success</p>
              <label><span>Practice Volume</span><select value={form.volumePreset} onChange={(event) => updateField("volumePreset", event.target.value)}>
                {COACH_VOLUME_PRESETS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.volumePreset === "Custom" && <label><span>Custom Volume</span><input value={form.customVolume} onChange={(event) => updateField("customVolume", event.target.value)} placeholder="12 rehearsals, then 8 balls" /></label>}
              <label><span>Success Criterion</span><select value={form.successCriterion} onChange={(event) => updateField("successCriterion", event.target.value)}>
                {COACH_SUCCESS_CRITERIA_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.successCriterion === "Custom success criterion" && <label><span>Custom Success Criterion</span><input value={form.customSuccess} onChange={(event) => updateField("customSuccess", event.target.value)} /></label>}
              <label><span>Why It Matters</span><textarea value={form.whyItMatters} onChange={(event) => updateField("whyItMatters", event.target.value)} /></label>
              <label><span>Message to Student</span><textarea value={form.messageToStudent} onChange={(event) => updateField("messageToStudent", event.target.value)} /></label>
              <details open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
                <summary>Private and advanced context</summary>
                <label><span>Physical consideration · Optional and private</span><textarea value={form.physicalConsideration} onChange={(event) => updateField("physicalConsideration", event.target.value)} placeholder="Private Coach context. Not published to Student." /></label>
                <label><span>Private Coach Note</span><textarea value={form.privateCoachNote} onChange={(event) => updateField("privateCoachNote", event.target.value)} placeholder="Not included in Student preview or published assignment." /></label>
                <label><span>No-equipment alternative</span><input value={form.noEquipmentAlternative} onChange={(event) => updateField("noEquipmentAlternative", event.target.value)} /></label>
              </details>
            </section>

            <div className="coach-builder-actions">
              <button className="secondary-action" onClick={saveDraft} type="button">Save Draft</button>
              <button className="primary-action" disabled={!canAssign || saving} type="submit">{saving ? "Assigning..." : selectedMember ? `Publish to ${selectedMember.name.split(/\s+/)[0]}` : "Assign Practice Plan"}</button>
            </div>
          </form>

          <aside className="panel coach-builder-preview" aria-live="polite">
            <p className="eyebrow">Student Preview</p>
            <h2>{preview.title}</h2>
            <strong>{selectedMember ? `Assigned by ${accountUser?.displayName || "Coach"}` : "Choose a Student"}</strong>
            <dl>
              <div><dt>Today’s Focus</dt><dd>{preview.focus}</dd></div>
              <div><dt>Practice</dt><dd>{preview.drill}</dd></div>
              <div><dt>Club</dt><dd>{preview.club || "Any club"}</dd></div>
              <div><dt>Complete</dt><dd>{preview.volume.label || "Assigned volume"}</dd></div>
              <div><dt>Training Aid</dt><dd>{preview.trainingAid || "No training aid"}</dd></div>
              <div><dt>Success</dt><dd>{preview.success || "Coach review"}</dd></div>
            </dl>
            {preview.whyItMatters && <section><h3>Why it matters</h3><p>{preview.whyItMatters}</p></section>}
            {preview.instructions.length > 0 && <section><h3>Instructions</h3><ol>{preview.instructions.map((step) => <li key={step}>{step}</li>)}</ol></section>}
            {preview.cueList.length > 0 && <section><h3>Cues</h3><p>{preview.cueList.join(" · ")}</p></section>}
            {preview.messageToStudent && <section><h3>Message to Student</h3><p>{preview.messageToStudent}</p></section>}
            <small>Private Coach notes and private physical considerations are not shown here and are not published in this first builder release.</small>
            {assignedActivity && (
              <div className="coach-builder-success">
                <strong>Practice Plan assigned.</strong>
                <p>{selectedMember?.name ?? "The Student"} can now review the plan and begin Practice.</p>
                <a className="primary-action practice-link-button" href={`/practice/${encodeURIComponent(assignedActivity.id)}`}>View Student Plan</a>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
