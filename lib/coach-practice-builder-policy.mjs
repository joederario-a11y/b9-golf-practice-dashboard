import { DEFAULT_IMPORT_CLUB_ORDER } from "./launch-monitor-import-policy.mjs";

export const COACH_PRACTICE_FOCUS_OPTIONS = [
  "Setup",
  "Alignment",
  "Ball position",
  "Contact",
  "Center-face contact",
  "Low point",
  "Face control",
  "Club path",
  "Face-to-path",
  "Tempo",
  "Balance",
  "Pressure shift",
  "Rotation",
  "Distance control",
  "Start line",
  "Dispersion",
  "Driver accuracy",
  "Iron consistency",
  "Wedge control",
  "Putting",
  "Short game",
  "Bunker play",
  "Course strategy",
  "Other",
];

export const COACH_PRACTICE_PATTERN_OPTIONS = [
  "Slice",
  "Hook",
  "Push",
  "Pull",
  "Push-slice",
  "Pull-hook",
  "Fat",
  "Thin",
  "Heel",
  "Toe",
  "High contact",
  "Low contact",
  "Inconsistent contact",
  "Excessive spin",
  "Low spin",
  "Inconsistent carry",
  "Wide dispersion",
  "Start-line variability",
  "Loss of balance",
  "Unstable finish",
  "Early extension",
  "Disconnected arms",
  "Flying trail elbow",
  "Inconsistent posture",
  "Other",
];

export const COACH_PRACTICE_CLUB_OPTIONS = Array.from(new Set([
  "No specific club",
  ...DEFAULT_IMPORT_CLUB_ORDER,
  "Multiple clubs",
  "Other",
]));

export const COACH_PRACTICE_DRILL_OPTIONS = [
  {
    id: "towel-line-low-point",
    title: "Towel Line Drill",
    focus: "Low point",
    trainingAid: "Towel",
    volume: "15 shots",
    description: "Place a towel behind the ball and strike the ball first without contacting the towel.",
  },
  {
    id: "foot-spray-contact-map",
    title: "Foot-Spray Contact Mapping",
    focus: "Center-face contact",
    trainingAid: "Foot powder spray",
    volume: "3 sets of 7",
    description: "Mark strike location and score centered contact before chasing speed.",
  },
  {
    id: "start-line-gate",
    title: "Start-Line Gate",
    focus: "Start line",
    trainingAid: "Alignment sticks",
    volume: "20 shots",
    description: "Start the ball through a narrow gate while keeping speed controlled.",
  },
  {
    id: "chair-wall-depth",
    title: "Chair or Wall Depth Drill",
    focus: "Posture",
    trainingAid: "Chair or wall",
    volume: "10 minutes",
    description: "Rehearse rotation while maintaining posture and hip depth.",
  },
  {
    id: "three-club-distance-ladder",
    title: "Three-Club Distance Ladder",
    focus: "Distance control",
    trainingAid: "No training aid",
    volume: "3 sets of 5",
    description: "Alternate clubs and land balls in a defined carry window.",
  },
];

export const COACHING_CUE_OPTIONS = [
  "Stay balanced",
  "Finish over the lead side",
  "Maintain posture",
  "Start the ball on line",
  "Control the clubface",
  "Keep the chest moving",
  "Pressure forward",
  "Swing at controlled speed",
  "Center contact first",
  "Hold the finish",
  "Other",
];

export const COACH_VOLUME_PRESETS = [
  "10 shots",
  "15 shots",
  "20 shots",
  "3 sets of 5",
  "3 sets of 7",
  "10 minutes",
  "15 minutes",
  "20 minutes",
  "Custom",
];

export const COACH_SUCCESS_CRITERIA_OPTIONS = [
  "Complete assigned volume",
  "Qualifying shots",
  "Carry window",
  "Offline window",
  "Combined precision",
  "Contact pattern",
  "Challenge completion",
  "Coach review",
  "Student reflection",
  "Custom success criterion",
];

export const COACH_TRAINING_AID_OPTIONS = [
  "No training aid",
  "Towel",
  "Glove under trail armpit",
  "Alignment sticks",
  "Contact spray",
  "Foot powder spray",
  "Hanger",
  "Towel behind ball",
  "Headcover",
  "Chair or wall",
  "Staggered-stance drill",
  "Other",
];

export function normalizeCoachBuilderValue(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

export function normalizeCoachBuilderList(value, maxItems = 3, maxLength = 120) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(raw.map((item) => normalizeCoachBuilderValue(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

export function isDuplicateCoachCustomOption(value, options) {
  const normalized = normalizeCoachBuilderValue(value).toLowerCase();
  if (!normalized) return false;
  return options.some((option) => {
    const optionText = typeof option === "string" ? option : option?.title || option?.name || "";
    return normalizeCoachBuilderValue(optionText).toLowerCase() === normalized;
  });
}

export function parseCoachPracticeVolume(value) {
  const label = normalizeCoachBuilderValue(value, 80);
  const shotMatch = label.match(/^(\d+)\s*shots?$/i);
  if (shotMatch) return { attemptCount: Number(shotMatch[1]), durationMinutes: null, label };
  const minuteMatch = label.match(/^(\d+)\s*minutes?$/i);
  if (minuteMatch) return { attemptCount: null, durationMinutes: Number(minuteMatch[1]), label };
  const setMatch = label.match(/^(\d+)\s*sets?\s*of\s*(\d+)$/i);
  if (setMatch) {
    return {
      attemptCount: Number(setMatch[1]) * Number(setMatch[2]),
      durationMinutes: null,
      label,
      sets: Number(setMatch[1]),
      repetitionsPerSet: Number(setMatch[2]),
    };
  }
  return { attemptCount: null, durationMinutes: null, label };
}

function customOrSelected(selected, custom, customLabels = ["Other", "Custom", "Custom success criterion"], maxLength = 160) {
  const selectedText = normalizeCoachBuilderValue(selected, maxLength);
  const customText = normalizeCoachBuilderValue(custom, maxLength);
  return customLabels.includes(selectedText) ? customText : selectedText || customText;
}

export function buildStudentPracticePreview(values) {
  const focus = customOrSelected(values.focusArea, values.customFocus) || "Practice focus";
  const drill = normalizeCoachBuilderValue(values.drillTitle || values.customDrill) || "Coach practice assignment";
  const volume = parseCoachPracticeVolume(customOrSelected(values.volumePreset, values.customVolume));
  const success = customOrSelected(values.successCriterion, values.customSuccess, undefined, 220);
  const instructions = normalizeCoachBuilderList(values.instructions, 6, 220);
  return {
    title: normalizeCoachBuilderValue(values.title, 140) || `${focus}: ${drill}`,
    focus,
    pattern: customOrSelected(values.pattern, values.customPattern),
    club: customOrSelected(values.club, values.customClub),
    drill,
    cueList: normalizeCoachBuilderList(values.cues, 3, 80),
    trainingAid: customOrSelected(values.trainingAid, values.customTrainingAid),
    volume,
    success,
    whyItMatters: normalizeCoachBuilderValue(values.whyItMatters, 320),
    messageToStudent: normalizeCoachBuilderValue(values.messageToStudent, 500),
    instructions,
    privateCoachNote: normalizeCoachBuilderValue(values.privateCoachNote, 1000),
    physicalConsideration: normalizeCoachBuilderValue(values.physicalConsideration, 500),
  };
}
