"use client";

import { useEffect, useMemo, useState } from "react";
import { MaiCoachLogoFull } from "@/components/brand/mai-coach-logo";
import {
  buildStudentPracticePreview,
  COACH_DRILL_DEFAULTS,
  COACH_FOCUS_WHY_DEFAULTS,
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
const CUSTOM_DRILL_VALUE = "__custom_drill__";
const NO_DRILL_VALUE = "__no_drill__";

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
    customDrillDescription: "",
    customDrillSuccess: "",
    customDrillVolume: "",
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
  const [focusSearch, setFocusSearch] = useState("");
  const [drillSearch, setDrillSearch] = useState("");
  const [aidSearch, setAidSearch] = useState("");
  const [cueSearch, setCueSearch] = useState("");
  const [whyEdited, setWhyEdited] = useState(false);
  const [studentMessageEdited, setStudentMessageEdited] = useState(false);

  const selectedMember = members.find((member) => member.id === form.memberId) ?? null;
  const selectedDrill = COACH_PRACTICE_DRILL_OPTIONS.find((drill) => drill.id === form.drillId);
  const studentFirstName = selectedMember?.firstName || selectedMember?.name?.split(/\s+/)[0] || "Student";
  const preview = buildStudentPracticePreview({
    ...form,
    drillTitle: form.drillId === NO_DRILL_VALUE ? "" : form.customDrill || selectedDrill?.title || "",
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
  const filteredFocusOptions = useMemo(() => {
    const needle = focusSearch.trim().toLowerCase();
    return COACH_PRACTICE_FOCUS_OPTIONS.filter((option) => !needle || option.toLowerCase().includes(needle));
  }, [focusSearch]);
  const filteredDrills = useMemo(() => {
    const focus = (form.customFocus || form.focusArea).toLowerCase();
    const needle = drillSearch.trim().toLowerCase();
    return COACH_PRACTICE_DRILL_OPTIONS.filter((drill) => {
      const searchable = `${drill.focus} ${drill.title} ${drill.description} ${drill.trainingAid}`.toLowerCase();
      const matchesSearch = !needle || searchable.includes(needle);
      const matchesFocus = !focus || focus === "other" || searchable.includes(focus.split(" ")[0]);
      return matchesSearch && matchesFocus;
    });
  }, [drillSearch, form.customFocus, form.focusArea]);
  const filteredTrainingAids = useMemo(() => {
    const needle = aidSearch.trim().toLowerCase();
    return COACH_TRAINING_AID_OPTIONS.filter((option) => !needle || option.toLowerCase().includes(needle));
  }, [aidSearch]);
  const filteredCues = useMemo(() => {
    const needle = cueSearch.trim().toLowerCase();
    return COACHING_CUE_OPTIONS.filter((cue) => cue !== "Other" && (!needle || cue.toLowerCase().includes(needle)));
  }, [cueSearch]);
  const customDuplicate = {
    cue: isDuplicateCoachCustomOption(form.customCue, COACHING_CUE_OPTIONS),
    drill: isDuplicateCoachCustomOption(form.customDrill, COACH_PRACTICE_DRILL_OPTIONS),
    focus: isDuplicateCoachCustomOption(form.customFocus, COACH_PRACTICE_FOCUS_OPTIONS),
    trainingAid: isDuplicateCoachCustomOption(form.customTrainingAid, COACH_TRAINING_AID_OPTIONS),
  };
  const canAssign = Boolean(form.memberId && preview.title && (preview.drill || form.instructions.length) && (preview.volume.label || preview.volume.attemptCount || preview.volume.durationMinutes));
  const hasSourceContext = Boolean(form.sourceLessonId || form.sourceSessionId || form.sourceContext !== "Start Blank");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get("memberId") || "";
    const sourceLessonId = params.get("lessonId") || "";
    const sourceSessionId = params.get("sessionId") || "";
    const lessonFocus = params.get("focus") || "";
    const lessonClub = params.get("club") || "";
    const lessonDrill = params.get("drill") || "";
    const lessonTrainingAid = params.get("trainingAid") || "";
    const lessonVolume = params.get("volume") || "";
    const lessonSuccess = params.get("success") || "";
    const lessonWhy = params.get("why") || "";
    const lessonMessage = params.get("message") || "";
    const lessonCues = (params.get("cues") || "").split("|").map((cue) => cue.trim()).filter(Boolean).slice(0, 3);
    const matchedDrill = COACH_PRACTICE_DRILL_OPTIONS.find((drill) => drill.title.toLowerCase() === lessonDrill.toLowerCase());
    setForm((current) => ({
      ...current,
      club: lessonClub || current.club,
      cues: lessonCues.length ? lessonCues : current.cues,
      customDrill: matchedDrill || !lessonDrill ? current.customDrill : lessonDrill,
      customFocus: COACH_PRACTICE_FOCUS_OPTIONS.includes(lessonFocus) ? current.customFocus : lessonFocus || current.customFocus,
      customSuccess: COACH_SUCCESS_CRITERIA_OPTIONS.includes(lessonSuccess) ? current.customSuccess : lessonSuccess || current.customSuccess,
      drillId: matchedDrill?.id ?? (lessonDrill ? CUSTOM_DRILL_VALUE : current.drillId),
      focusArea: COACH_PRACTICE_FOCUS_OPTIONS.includes(lessonFocus) ? lessonFocus : lessonFocus ? "Other" : current.focusArea,
      instructions: lessonDrill && !matchedDrill ? [lessonDrill] : current.instructions,
      memberId,
      sourceContext: sourceLessonId ? "Latest Lesson" : sourceSessionId ? "Recent Session" : current.sourceContext,
      sourceLessonId,
      sourceSessionId,
      successCriterion: COACH_SUCCESS_CRITERIA_OPTIONS.includes(lessonSuccess) ? lessonSuccess : lessonSuccess ? "Custom success criterion" : current.successCriterion,
      trainingAid: COACH_TRAINING_AID_OPTIONS.includes(lessonTrainingAid) ? lessonTrainingAid : current.trainingAid,
      volumePreset: COACH_VOLUME_PRESETS.includes(lessonVolume) ? lessonVolume : lessonVolume ? "Custom" : current.volumePreset,
      customVolume: COACH_VOLUME_PRESETS.includes(lessonVolume) ? current.customVolume : lessonVolume || current.customVolume,
      whyItMatters: lessonWhy || current.whyItMatters,
      messageToStudent: lessonMessage || current.messageToStudent,
    }));
    if (lessonWhy) setWhyEdited(true);
    if (lessonMessage) setStudentMessageEdited(true);
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

  function setFocus(nextFocus: string) {
    setAssignedActivity(null);
    setForm((current) => {
      const suggestedWhy = COACH_FOCUS_WHY_DEFAULTS[nextFocus as keyof typeof COACH_FOCUS_WHY_DEFAULTS] || current.whyItMatters;
      const shouldReplaceWhy = !whyEdited;
      const nextMessage = !studentMessageEdited
        ? `Today is about ${nextFocus.toLowerCase()}. Quality matters more than speed.`
        : current.messageToStudent;
      return {
        ...current,
        focusArea: nextFocus,
        whyItMatters: shouldReplaceWhy ? suggestedWhy : current.whyItMatters,
        messageToStudent: nextMessage,
      };
    });
  }

  function setDrill(nextDrillId: string) {
    setAssignedActivity(null);
    const drill = COACH_PRACTICE_DRILL_OPTIONS.find((item) => item.id === nextDrillId);
    const defaults = drill ? COACH_DRILL_DEFAULTS[drill.id as keyof typeof COACH_DRILL_DEFAULTS] : null;
    setForm((current) => {
      const shouldReplaceWhy = !whyEdited;
      const nextCue = defaults?.cue && !current.cues.includes(defaults.cue) ? [...current.cues, defaults.cue].slice(0, 3) : current.cues;
      return {
        ...current,
        drillId: nextDrillId,
        customDrill: nextDrillId === CUSTOM_DRILL_VALUE ? current.customDrill : "",
        successCriterion: defaults?.success && COACH_SUCCESS_CRITERIA_OPTIONS.includes(defaults.success) ? defaults.success : current.successCriterion,
        trainingAid: drill?.trainingAid && COACH_TRAINING_AID_OPTIONS.includes(drill.trainingAid) ? drill.trainingAid : current.trainingAid,
        volumePreset: drill?.volume && COACH_VOLUME_PRESETS.includes(drill.volume) ? drill.volume : current.volumePreset,
        whyItMatters: shouldReplaceWhy && defaults?.why ? defaults.why : current.whyItMatters,
        cues: nextCue,
      };
    });
  }

  function toggleCue(cue: string) {
    setForm((current) => {
      const hasCue = current.cues.includes(cue);
      const next = hasCue ? current.cues.filter((item) => item !== cue) : [...current.cues, cue].slice(0, 3);
      return { ...current, cues: next };
    });
  }

  function removeCue(cue: string) {
    setForm((current) => ({ ...current, cues: current.cues.filter((item) => item !== cue) }));
    setAssignedActivity(null);
  }

  function addCustomCue() {
    const cue = form.customCue.trim();
    if (!cue || customDuplicate.cue) return;
    setForm((current) => ({ ...current, cues: [...current.cues, cue].slice(0, 3), customCue: "" }));
    setAssignedActivity(null);
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
    const confirmed = window.confirm(`Assign this Practice Plan to ${selectedMember?.name ?? "this Student"}?\n\nFocus\n${preview.focus}\n\nClub\n${preview.club || "No specific club"}\n\nDrill\n${preview.drill || "No specific drill"}\n\nPractice\n${preview.volume.label || "Assigned volume"}\n\nSuccess\n${preview.success || "Coach review"}`);
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
          drillTitle: form.drillId === NO_DRILL_VALUE ? "" : form.customDrill || selectedDrill?.title || "",
          focusArea: form.focusArea === "Other" ? form.customFocus : form.focusArea,
          instructions: form.instructions,
          pattern: form.pattern === "Other" ? form.customPattern : form.pattern,
          successCriterion: form.successCriterion === "Custom success criterion" ? form.customSuccess || form.customDrillSuccess : form.successCriterion,
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
        <header className="coach-builder-header compact">
          <MaiCoachLogoFull className="brand-lockup" />
          <div>
            <p className="eyebrow">Coach Practice Plan Builder</p>
            <h1>Create Practice Plan</h1>
            <p>{selectedMember ? `For ${selectedMember.name}` : "Choose a Student, then assign one clear next step."}</p>
            {hasSourceContext && <small>{form.sourceContext}{form.sourceLessonId ? " · latest lesson" : form.sourceSessionId ? " · saved session" : ""}</small>}
          </div>
          <div className="coach-builder-header-actions">
            <button className="secondary-action" onClick={saveDraft} type="button">Save Draft</button>
            <a className="secondary-action practice-link-button" href="#student-preview">Preview</a>
            <button className="primary-action" disabled={!canAssign || saving} onClick={() => void assignPlan()} type="button">{saving ? "Assigning..." : selectedMember ? `Assign to ${studentFirstName}` : "Assign"}</button>
          </div>
        </header>

        {message && <div className="practice-status-message" role="status" aria-live="polite">{message}</div>}

        <div className="coach-builder-grid">
          <form className="coach-builder-form one-screen" onSubmit={(event) => { event.preventDefault(); void assignPlan(); }}>
            <section className="panel coach-builder-section coach-builder-card student">
              <p className="eyebrow">Student</p>
              <div className="coach-builder-student-card">
                <span className="coach-builder-avatar">{initials(selectedMember)}</span>
                <div>
                  <strong>{selectedMember?.name ?? "Choose a Student"}</strong>
                  <small>{selectedMember ? `${selectedMember.videoCount ?? 0} videos · ${selectedMember.accountStatus ?? "active"}` : "Only assigned Students are shown."}</small>
                </div>
              </div>
              {!selectedMember && <label>
                <span>Search Students</span>
                <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name or email" />
              </label>}
              <label className={selectedMember ? "compact-field" : ""}>
                <span>{selectedMember ? "Change Student" : "Student"}</span>
                <select value={form.memberId} onChange={(event) => updateField("memberId", event.target.value)}>
                  <option value="">Choose a Student</option>
                  {filteredMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
                </select>
              </label>
            </section>

            <section className="panel coach-builder-section coach-builder-card">
              <p className="eyebrow">Focus</p>
              <label><span>Search Focus</span><input type="search" value={focusSearch} onChange={(event) => setFocusSearch(event.target.value)} placeholder="Face, low point, tempo..." /></label>
              <label><span>Primary Focus</span><select value={form.focusArea} onChange={(event) => setFocus(event.target.value)}>
                {filteredFocusOptions.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.focusArea === "Other" && (
                <label><span>Add Custom Focus</span><input value={form.customFocus} onChange={(event) => updateField("customFocus", event.target.value)} placeholder="Coach wording" /></label>
              )}
              {customDuplicate.focus && <small className="coach-builder-warning">That focus already exists as a standard option.</small>}
            </section>

            <section className="panel coach-builder-section coach-builder-card">
              <p className="eyebrow">Club</p>
              <label><span>Club</span><select value={form.club} onChange={(event) => updateField("club", event.target.value)}>
                {COACH_PRACTICE_CLUB_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.club === "Other" && <label><span>Add Custom Club</span><input value={form.customClub} onChange={(event) => updateField("customClub", event.target.value)} /></label>}
            </section>

            <section className="panel coach-builder-section coach-builder-card wide">
              <p className="eyebrow">Drill</p>
              <label><span>Search Drills</span><input type="search" value={drillSearch} onChange={(event) => setDrillSearch(event.target.value)} placeholder="Start line, gate, towel..." /></label>
              <label><span>Drill</span><select value={form.drillId || CUSTOM_DRILL_VALUE} onChange={(event) => setDrill(event.target.value)}>
                {filteredDrills.map((drill) => <option key={drill.id} value={drill.id}>{drill.title} · {drill.focus}</option>)}
                <option value={NO_DRILL_VALUE}>None</option>
                <option value={CUSTOM_DRILL_VALUE}>+ Add New Drill</option>
              </select></label>
              {selectedDrill && <div className="coach-builder-inline-preview"><strong>{selectedDrill.title}</strong><span>{selectedDrill.description}</span><small>Suggested by MAI · {selectedDrill.volume} · {selectedDrill.trainingAid}</small></div>}
              {form.drillId === CUSTOM_DRILL_VALUE && (
                <div className="coach-builder-custom-panel">
                  <p className="eyebrow">Add New Drill</p>
                  <label><span>Drill Name</span><input value={form.customDrill} onChange={(event) => updateField("customDrill", event.target.value)} placeholder="Zac's Chair Drill" /></label>
                  <label><span>Description</span><textarea value={form.customDrillDescription} onChange={(event) => updateField("customDrillDescription", event.target.value)} placeholder="What the Student should do." /></label>
                  <div className="coach-builder-two">
                    <label><span>Suggested Reps or Volume</span><input value={form.customDrillVolume} onChange={(event) => updateField("customDrillVolume", event.target.value)} placeholder="15 shots" /></label>
                    <label><span>Default Success Goal</span><input value={form.customDrillSuccess} onChange={(event) => updateField("customDrillSuccess", event.target.value)} placeholder="Hit the target 12 of 15 times" /></label>
                  </div>
                  <div className="button-row">
                    <button className="secondary-action compact-action" onClick={() => {
                      setForm((current) => ({
                        ...current,
                        instructions: current.customDrillDescription ? [current.customDrillDescription] : current.instructions,
                        volumePreset: current.customDrillVolume ? "Custom" : current.volumePreset,
                        customVolume: current.customDrillVolume || current.customVolume,
                        successCriterion: current.customDrillSuccess ? "Custom success criterion" : current.successCriterion,
                        customSuccess: current.customDrillSuccess || current.customSuccess,
                      }));
                      setMessage("Custom drill saved for this Practice Plan. Coach library persistence is deferred for now.");
                    }} type="button">Save for This Plan</button>
                    <button className="secondary-action compact-action" disabled title="Coach-scoped drill library persistence is not available in the current schema." type="button">Save to My Library</button>
                    <button className="text-button" onClick={() => setDrill(COACH_PRACTICE_DRILL_OPTIONS[0]?.id ?? NO_DRILL_VALUE)} type="button">Cancel</button>
                  </div>
                </div>
              )}
              {customDuplicate.drill && <small className="coach-builder-warning">That drill already exists in the shared list.</small>}
            </section>

            <section className="panel coach-builder-section coach-builder-card">
              <p className="eyebrow">Training Aid</p>
              <label><span>Search Aids</span><input type="search" value={aidSearch} onChange={(event) => setAidSearch(event.target.value)} placeholder="Towel, spray, gate..." /></label>
              <label><span>Training Aid</span><select value={form.trainingAid} onChange={(event) => updateField("trainingAid", event.target.value)}>
                {filteredTrainingAids.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.trainingAid === "Other" && <div className="coach-builder-custom-panel">
                <p className="eyebrow">Add Coach Aid</p>
                <label><span>Aid name</span><input value={form.customTrainingAid} onChange={(event) => updateField("customTrainingAid", event.target.value)} placeholder="Foam noodle gate" /></label>
                <label><span>No-equipment alternative</span><input value={form.noEquipmentAlternative} onChange={(event) => updateField("noEquipmentAlternative", event.target.value)} /></label>
                <small>Save to Coach library is deferred because no safe Coach-scoped aid library exists yet.</small>
              </div>}
              {customDuplicate.trainingAid && <small className="coach-builder-warning">That training aid already exists as a standard option.</small>}
            </section>

            <section className="panel coach-builder-section coach-builder-card">
              <p className="eyebrow">Practice</p>
              <label><span>Practice Volume</span><select value={form.volumePreset} onChange={(event) => updateField("volumePreset", event.target.value)}>
                {COACH_VOLUME_PRESETS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.volumePreset === "Custom" && <label><span>Custom Volume</span><input value={form.customVolume} onChange={(event) => updateField("customVolume", event.target.value)} placeholder="12 rehearsals, then 8 balls" /></label>}
            </section>

            <section className="panel coach-builder-section coach-builder-card">
              <p className="eyebrow">Success</p>
              <label><span>Success Goal</span><select value={form.successCriterion} onChange={(event) => updateField("successCriterion", event.target.value)}>
                {COACH_SUCCESS_CRITERIA_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select></label>
              {form.successCriterion === "Custom success criterion" && <label><span>Custom Success Goal</span><input value={form.customSuccess} onChange={(event) => updateField("customSuccess", event.target.value)} placeholder="Hit the target 12 of 15 times" /></label>}
            </section>

            <section className="panel coach-builder-section coach-builder-card wide">
              <p className="eyebrow">Coaching Cues</p>
              <div className="coach-builder-selected-cues" aria-label="Selected coaching cues">
                {form.cues.map((cue) => (
                  <button key={cue} onClick={() => removeCue(cue)} type="button">{cue} <span aria-hidden="true">×</span></button>
                ))}
                {form.cues.length < 3 && <span>{3 - form.cues.length} cue{3 - form.cues.length === 1 ? "" : "s"} available</span>}
              </div>
              <fieldset className="practice-fieldset">
                <legend>Add Cue</legend>
                <label><span>Search Cues</span><input type="search" value={cueSearch} onChange={(event) => setCueSearch(event.target.value)} placeholder="Face, finish, posture..." /></label>
                <div className="coach-builder-chip-grid">
                  {filteredCues.map((cue) => (
                    <button aria-pressed={form.cues.includes(cue)} className={form.cues.includes(cue) ? "selected" : ""} disabled={!form.cues.includes(cue) && form.cues.length >= 3} key={cue} onClick={() => toggleCue(cue)} type="button">{cue}</button>
                  ))}
                </div>
                <label><span>Custom Cue</span><input value={form.customCue} onChange={(event) => updateField("customCue", event.target.value)} /></label>
                <button className="secondary-action compact-action" disabled={!form.customCue.trim() || form.cues.length >= 3 || customDuplicate.cue} onClick={addCustomCue} type="button">+ Add Cue</button>
                {customDuplicate.cue && <small className="coach-builder-warning">That cue already exists as a standard option.</small>}
              </fieldset>
            </section>

            <section className="panel coach-builder-section coach-builder-card wide">
              <p className="eyebrow">Why and Message</p>
              <label><span>Why It Matters <small>Suggested by MAI</small></span><textarea value={form.whyItMatters} onChange={(event) => {
                setWhyEdited(true);
                updateField("whyItMatters", event.target.value);
              }} /></label>
              <label><span>Message to Student <small>Optional</small></span><textarea value={form.messageToStudent} onChange={(event) => {
                setStudentMessageEdited(true);
                updateField("messageToStudent", event.target.value);
              }} /></label>
              <details open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
                <summary>Private Coach Context</summary>
                <label><span>Common Miss or Pattern</span><select value={form.pattern} onChange={(event) => updateField("pattern", event.target.value)}>
                  {COACH_PRACTICE_PATTERN_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select></label>
                {form.pattern === "Other" && <label><span>Add Custom Pattern</span><input value={form.customPattern} onChange={(event) => updateField("customPattern", event.target.value)} /></label>}
                <label><span>Physical consideration · Optional and private</span><textarea value={form.physicalConsideration} onChange={(event) => updateField("physicalConsideration", event.target.value)} placeholder="Private Coach context. Not published to Student." /></label>
                <label><span>Private Coach Note</span><textarea value={form.privateCoachNote} onChange={(event) => updateField("privateCoachNote", event.target.value)} placeholder="Not included in Student preview or published assignment." /></label>
                <label><span>Source evidence</span><input value={form.sourceContext} onChange={(event) => updateField("sourceContext", event.target.value)} /></label>
              </details>
            </section>

            <div className="coach-builder-actions">
              <button className="secondary-action" onClick={saveDraft} type="button">Save Draft</button>
              <a className="secondary-action practice-link-button" href="#student-preview">Preview</a>
              <button className="primary-action" disabled={!canAssign || saving} type="submit">{saving ? "Assigning..." : selectedMember ? `Assign to ${studentFirstName}` : "Assign Practice Plan"}</button>
            </div>
          </form>

          <aside className="panel coach-builder-preview" id="student-preview" aria-live="polite">
            <p className="eyebrow">Student Preview</p>
            <h2>{preview.title}</h2>
            <strong>{selectedMember ? `Assigned by ${accountUser?.displayName || "Coach"}` : "Choose a Student"}</strong>
            <dl>
              <div><dt>Student</dt><dd>{selectedMember?.name ?? "Choose a Student"}</dd></div>
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
