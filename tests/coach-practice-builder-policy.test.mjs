import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  parseCoachPracticeVolume,
} from "../lib/coach-practice-builder-policy.mjs";

test("coach practice builder exposes structured categories and custom-safe options", () => {
  assert.ok(COACH_PRACTICE_FOCUS_OPTIONS.includes("Center-face contact"));
  assert.ok(COACH_PRACTICE_FOCUS_OPTIONS.includes("Other"));
  assert.ok(COACH_PRACTICE_PATTERN_OPTIONS.includes("Slice"));
  assert.ok(COACH_PRACTICE_PATTERN_OPTIONS.includes("Early extension"));
  assert.ok(COACH_PRACTICE_CLUB_OPTIONS.includes("No specific club"));
  assert.ok(COACH_PRACTICE_DRILL_OPTIONS.some((drill) => drill.title === "Towel Line Drill"));
  assert.ok(COACHING_CUE_OPTIONS.includes("Center contact first"));
  assert.ok(COACH_TRAINING_AID_OPTIONS.includes("No training aid"));
  assert.ok(COACH_VOLUME_PRESETS.includes("3 sets of 7"));
  assert.ok(COACH_SUCCESS_CRITERIA_OPTIONS.includes("Coach review"));
  assert.equal(isDuplicateCoachCustomOption("  towel   line drill ", COACH_PRACTICE_DRILL_OPTIONS), true);
});

test("student preview keeps private coach context out of published content", () => {
  const preview = buildStudentPracticePreview({
    cues: ["Stay balanced", "Hold the finish", "Control the clubface", "Extra thought"],
    drillTitle: "Foot-Spray Contact Mapping",
    focusArea: "Center-face contact",
    messageToStudent: "Quality first.",
    physicalConsideration: "lower-back sensitivity",
    privateCoachNote: "Watch fatigue after set two",
    successCriterion: "Complete assigned volume",
    title: "",
    volumePreset: "3 sets of 7",
    whyItMatters: "Centered strikes stabilize carry.",
  });
  assert.equal(preview.title, "Center-face contact: Foot-Spray Contact Mapping");
  assert.deepEqual(preview.cueList, ["Stay balanced", "Hold the finish", "Control the clubface"]);
  assert.equal(preview.privateCoachNote, "Watch fatigue after set two");
  assert.equal(preview.physicalConsideration, "lower-back sensitivity");
});

test("student preview uses coach custom wording instead of generic Other labels", () => {
  const preview = buildStudentPracticePreview({
    club: "Other",
    customClub: "Half-speed 8-Iron",
    customFocus: "Quiet lower body",
    customPattern: "Rushing transition",
    customSuccess: "Five balanced finishes in a row",
    customTrainingAid: "Foam noodle gate",
    customVolume: "12 rehearsals then 8 balls",
    drillTitle: "Mirror Tempo Check",
    focusArea: "Other",
    pattern: "Other",
    successCriterion: "Custom success criterion",
    trainingAid: "Other",
    volumePreset: "Custom",
  });

  assert.equal(preview.focus, "Quiet lower body");
  assert.equal(preview.pattern, "Rushing transition");
  assert.equal(preview.club, "Half-speed 8-Iron");
  assert.equal(preview.trainingAid, "Foam noodle gate");
  assert.equal(preview.success, "Five balanced finishes in a row");
  assert.equal(preview.volume.label, "12 rehearsals then 8 balls");
});

test("volume parser supports shot, set, time, and custom labels", () => {
  assert.deepEqual(parseCoachPracticeVolume("15 shots"), { attemptCount: 15, durationMinutes: null, label: "15 shots" });
  assert.deepEqual(parseCoachPracticeVolume("3 sets of 7"), { attemptCount: 21, durationMinutes: null, label: "3 sets of 7", sets: 3, repetitionsPerSet: 7 });
  assert.deepEqual(parseCoachPracticeVolume("20 minutes"), { attemptCount: null, durationMinutes: 20, label: "20 minutes" });
  assert.deepEqual(parseCoachPracticeVolume("12 rehearsals then 8 balls"), { attemptCount: null, durationMinutes: null, label: "12 rehearsals then 8 balls" });
});

test("coach builder source uses existing practice API, student route, and privacy guard", () => {
  const page = readFileSync(new URL("../app/coach/practice-builder/page.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/practice/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/server/practice-activities.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Student Preview/);
  assert.match(page, /Assign Practice Plan/);
  assert.match(page, /Private Coach notes and private physical considerations are not shown/);
  assert.match(page, /localStorage/);
  assert.match(page, /assignedActivity\.id/);
  assert.match(page, /View Student Plan/);
  assert.match(api, /assign_coach_practice_plan/);
  assert.match(server, /Coach or admin access is required to assign practice plans/);
  assert.match(server, /You can only assign Practice Plans to your assigned Students/);
  assert.match(server, /practice_plan_assigned/);
  assert.match(server, /idempotencyKey/);
  assert.match(server, /privateFieldsPersisted: false/);
  assert.doesNotMatch(server, /privateCoachNote.*sourceContext/s);
  assert.match(dashboard, /Create Practice Plan/);
  assert.match(dashboard, /openPracticeBuilderFromLesson/);
  assert.match(dashboard, /lessonId/);
});
