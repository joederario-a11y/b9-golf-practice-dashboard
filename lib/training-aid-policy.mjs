export const TRAINING_AID_NONE_ID = "none";

export const TRAINING_AID_EVIDENCE_SOURCES = [
  "coach_manual",
  "coach_audio",
  "coach_approved_ai",
  "session_measured",
  "visual_observation",
  "player_reported",
  "generic",
];

export const TRAINING_AID_CONFIDENCE_LEVELS = ["high", "moderate", "low"];

export const TRAINING_AID_APPROVAL_STATES = [
  "draft",
  "approved",
  "modified",
  "removed",
  "rejected",
  "published",
  "not_needed",
];

export const SWING_TENDENCIES = [
  "poor_alignment",
  "inconsistent_ball_position",
  "heel_contact",
  "toe_contact",
  "fat_contact",
  "thin_contact",
  "low_point_behind_ball",
  "disconnected_arms",
  "flying_trail_elbow",
  "face_control",
  "wrist_condition",
  "early_extension",
  "loss_of_balance",
  "unstable_finish",
  "out_to_in_path",
  "excessive_in_to_out_path",
  "start_line_variability",
  "unknown",
];

export const TRAINING_AID_DEFINITIONS = Object.freeze([
  {
    active: true,
    description: "A light connection cue for keeping the trail arm and torso working together during controlled swings.",
    id: "trail-armpit-towel",
    name: "Towel or glove under trail armpit",
    notSuitableFor: ["Full-speed driver work", "Pain or injury management", "Every elbow or backswing issue"],
    requiredEquipment: ["Small towel or glove"],
    safetyNotes: [
      "Use slow to three-quarter swings first.",
      "Stop if the cue changes your balance or causes discomfort.",
      "This drill is for golf practice and movement feedback, not medical treatment.",
    ],
    setupInstructions: [
      "Place a small towel or glove under the trail armpit.",
      "Make short swings while keeping light connection through the turn.",
      "Let the item fall after impact if the finish naturally releases it.",
    ],
    shortName: "Trail armpit towel",
    suitableFor: ["disconnected_arms", "flying_trail_elbow"],
  },
  {
    active: true,
    description: "A short-swing connection cue for keeping both arms and the torso synced in controlled pitch or half-swing work.",
    id: "both-armpits-towel",
    name: "Towel under both armpits",
    notSuitableFor: ["Full-speed driver swings", "Players who need a full release pattern"],
    requiredEquipment: ["Small towel"],
    safetyNotes: [
      "Use short swings only.",
      "Do not force the towel to stay in place through a full-speed finish.",
    ],
    setupInstructions: [
      "Place a towel across the chest with one end under each armpit.",
      "Hit small pitch or half swings while turning the body together.",
      "Keep the target small and the speed controlled.",
    ],
    shortName: "Both armpits towel",
    suitableFor: ["disconnected_arms"],
  },
  {
    active: true,
    description: "A visual reference for target line, setup alignment, ball position, and start-line discipline.",
    id: "alignment-sticks",
    name: "Alignment sticks",
    notSuitableFor: ["Being struck by the club", "Angled stick setups pointed toward the body"],
    requiredEquipment: ["Two alignment sticks or safe ground-level visual lines"],
    safetyNotes: [
      "Keep sticks flat on the ground or safely outside the swing path.",
      "Never place a stick where the club can strike it or where it points toward your body.",
    ],
    setupInstructions: [
      "Place one stick on the target line and one parallel to your foot line.",
      "Set the ball position using lead/trail references instead of guessing left or right.",
      "Remove or offset any stick that could be hit by the club.",
    ],
    shortName: "Alignment sticks",
    suitableFor: ["poor_alignment", "inconsistent_ball_position", "start_line_variability"],
  },
  {
    active: true,
    description: "A feedback tool for seeing actual impact location on the clubface.",
    id: "contact-spray",
    name: "Contact spray or foot powder",
    notSuitableFor: ["Diagnosing impact location without a visible mark", "Use on surfaces where residue is not allowed"],
    requiredEquipment: ["Impact spray, foot powder, or face tape"],
    safetyNotes: [
      "Use only products safe for your clubface and hitting area.",
      "Wipe the face clean after practice.",
    ],
    setupInstructions: [
      "Apply a light spray or tape mark to the clubface.",
      "Hit one ball, then check the visible impact mark before the next swing.",
      "Record heel, center, toe, high, or low contact honestly.",
    ],
    shortName: "Contact spray",
    suitableFor: ["heel_contact", "toe_contact", "fat_contact", "thin_contact"],
  },
  {
    active: true,
    description: "A clubface and wrist-condition awareness cue for slow rehearsals and controlled shots.",
    id: "hanger-drill",
    name: "Hanger drill",
    notSuitableFor: ["Medical wrist correction", "Full-speed swings before the feel is understood"],
    requiredEquipment: ["Golf hanger trainer or safe equivalent"],
    safetyNotes: [
      "Start with rehearsals and slow swings.",
      "This drill is for golf practice and movement feedback, not medical treatment.",
    ],
    setupInstructions: [
      "Attach the hanger-style trainer according to its instructions.",
      "Rehearse half swings while noticing lead-wrist condition and clubface awareness.",
      "Move to short shots only after the feel is repeatable.",
    ],
    shortName: "Hanger drill",
    suitableFor: ["face_control", "wrist_condition"],
  },
  {
    active: true,
    description: "A low-point feedback cue that helps a player practice ball-first contact without guessing.",
    id: "towel-behind-ball",
    name: "Towel behind the ball",
    notSuitableFor: ["Full-speed swings with a towel too close", "Hard surfaces where the towel can slide into the club"],
    requiredEquipment: ["Small towel"],
    safetyNotes: [
      "Set the towel a safe distance behind the ball for the club and swing length.",
      "Start with short swings before moving toward normal speed.",
    ],
    setupInstructions: [
      "Place a small towel behind the ball on the target line.",
      "Use short swings and miss the towel before striking the ball.",
      "Adjust the towel distance for the club and swing length instead of using one universal measurement.",
    ],
    shortName: "Towel behind ball",
    suitableFor: ["fat_contact", "low_point_behind_ball"],
  },
  {
    active: true,
    description: "A safe outside-ball obstacle cue for path awareness when an out-to-in pattern is supported.",
    id: "outside-headcover",
    name: "Headcover outside the ball",
    notSuitableFor: ["Unsupported path diagnosis", "Placement close enough to be struck hard"],
    requiredEquipment: ["Soft headcover"],
    safetyNotes: [
      "Use a soft object only.",
      "Place it far enough outside the ball that a miss brushes or avoids it rather than striking it forcefully.",
    ],
    setupInstructions: [
      "Place a soft headcover outside the ball and slightly behind the impact zone.",
      "Make slow rehearsals that avoid the headcover.",
      "Hit short shots first, then add speed only if contact and balance stay safe.",
    ],
    shortName: "Outside headcover",
    suitableFor: ["out_to_in_path", "heel_contact"],
  },
  {
    active: true,
    description: "A safe inside-ball obstacle cue for path awareness when an excessive in-to-out pattern is supported.",
    id: "inside-headcover",
    name: "Headcover inside the ball",
    notSuitableFor: ["Unsupported path diagnosis", "Placement close enough to be struck hard"],
    requiredEquipment: ["Soft headcover"],
    safetyNotes: [
      "Use a soft object only.",
      "Place it safely inside the ball so the club has room to swing without a hard collision.",
    ],
    setupInstructions: [
      "Place a soft headcover inside the ball and slightly behind the impact zone.",
      "Make slow rehearsals that keep the club from getting trapped too far from the target line.",
      "Hit short shots first and stop if contact becomes unsafe.",
    ],
    shortName: "Inside headcover",
    suitableFor: ["excessive_in_to_out_path", "toe_contact"],
  },
  {
    active: true,
    description: "A low-speed reference for hip depth and posture awareness.",
    id: "chair-wall-drill",
    name: "Chair or wall drill",
    notSuitableFor: ["Forceful swings into an object", "Medical back or hip treatment"],
    requiredEquipment: ["Chair, wall, or safe stationary reference"],
    safetyNotes: [
      "Use slow rehearsals only near the object.",
      "Do not swing forcefully into a chair or wall.",
      "This drill is for golf practice and movement feedback, not medical treatment.",
    ],
    setupInstructions: [
      "Stand with a safe reference lightly behind the hips.",
      "Make slow turn rehearsals while keeping hip depth awareness.",
      "Step away from the object before adding speed.",
    ],
    shortName: "Chair/wall drill",
    suitableFor: ["early_extension"],
  },
  {
    active: true,
    description: "A balance and pressure-control drill that uses lead/trail foot references without guessing handedness.",
    id: "staggered-stance-balance",
    name: "Staggered-stance balance drill",
    notSuitableFor: ["Players who cannot hold balance safely", "Full-speed swings before stable finishes"],
    requiredEquipment: ["No equipment"],
    safetyNotes: [
      "Use half-speed swings until you can hold the finish.",
      "Stop if balance feels unsafe.",
    ],
    setupInstructions: [
      "Move the trail foot slightly back to narrow the base without naming left or right.",
      "Hit controlled shots and hold the finish until the ball lands.",
      "Repeat with normal stance only after the finish stays stable.",
    ],
    shortName: "Staggered stance",
    suitableFor: ["loss_of_balance", "unstable_finish"],
  },
]);

const AID_BY_ID = Object.freeze(Object.fromEntries(TRAINING_AID_DEFINITIONS.map((aid) => [aid.id, aid])));

const TENDENCY_AID_CANDIDATES = Object.freeze({
  disconnected_arms: ["trail-armpit-towel", "both-armpits-towel"],
  excessive_in_to_out_path: ["inside-headcover", "alignment-sticks"],
  early_extension: ["chair-wall-drill"],
  face_control: ["hanger-drill"],
  fat_contact: ["towel-behind-ball", "contact-spray"],
  flying_trail_elbow: ["trail-armpit-towel"],
  heel_contact: ["contact-spray", "outside-headcover"],
  inconsistent_ball_position: ["alignment-sticks"],
  loss_of_balance: ["staggered-stance-balance"],
  low_point_behind_ball: ["towel-behind-ball"],
  out_to_in_path: ["outside-headcover", "alignment-sticks"],
  poor_alignment: ["alignment-sticks"],
  start_line_variability: ["alignment-sticks"],
  thin_contact: ["contact-spray"],
  toe_contact: ["contact-spray", "inside-headcover"],
  unstable_finish: ["staggered-stance-balance"],
  wrist_condition: ["hanger-drill"],
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fallback = "", maxLength = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function stringArray(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function lower(value) {
  return text(value, "", 6000).toLowerCase();
}

function hasAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

function compactEvidence(evidence = []) {
  const seen = new Set();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.tendency}:${item.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function evidenceTextFromCoachFeedback(coachFeedback = {}) {
  if (!isRecord(coachFeedback)) return "";
  return [
    coachFeedback.priority,
    coachFeedback.summary,
    coachFeedback.practiceAssignment,
    coachFeedback.recommendedDrill,
    coachFeedback.nextSessionGoal,
    coachFeedback.rawNotes,
    ...(Array.isArray(coachFeedback.observations) ? coachFeedback.observations : []),
    ...(Array.isArray(coachFeedback.prescribedDrills) ? coachFeedback.prescribedDrills : []),
    ...(Array.isArray(coachFeedback.swingFeels) ? coachFeedback.swingFeels : []),
    ...(Array.isArray(coachFeedback.successTargets) ? coachFeedback.successTargets : []),
  ].map((item) => text(item, "", 1200)).filter(Boolean).join(" ");
}

function addPatternEvidence(evidence, sourceText, source, summaryPrefix = "") {
  const haystack = lower(sourceText);
  if (!haystack) return;
  const add = (tendency, summary) => evidence.push({ source, tendency, summary: `${summaryPrefix}${summary}`.trim() });

  if (hasAny(haystack, [/\balignment\b/, /\baim\b/, /\baimed\b/, /\bbody line\b/, /\bfoot line\b/, /\bshoulder line\b/])) {
    add("poor_alignment", "Alignment or setup direction was identified.");
  }
  if (hasAny(haystack, [/\bball position\b/, /\btoo far (forward|back)\b/, /\bforward in stance\b/, /\bback in stance\b/])) {
    add("inconsistent_ball_position", "Ball-position consistency was identified.");
  }
  if (hasAny(haystack, [/\bstart line\b/, /\bstarts? (left|right|offline)\b/, /\bstart direction\b/, /\bhoriz(?:ontal)? angle\b/])) {
    add("start_line_variability", "Start-line variability was identified.");
  }
  if (hasAny(haystack, [/\bheel\b/, /\bhosel\b/])) add("heel_contact", "Heel-side contact was identified.");
  if (hasAny(haystack, [/\btoe\b/])) add("toe_contact", "Toe-side contact was identified.");
  if (hasAny(haystack, [/\bfat\b/, /\bheavy\b/, /\bground first\b/, /\bhitting behind\b/])) add("fat_contact", "Ground-first or heavy contact was identified.");
  if (hasAny(haystack, [/\blow[- ]point\b/, /\blow point behind\b/, /\bbottom.*behind\b/])) add("low_point_behind_ball", "Low point behind the ball was identified.");
  if (hasAny(haystack, [/\bthin\b/, /\blow on the face\b/, /\btopped\b/])) add("thin_contact", "Thin or low-face contact was identified.");
  if (hasAny(haystack, [/\bdisconnect(?:ed|ion)?\b/, /\barms? separ/, /\barm.*body connection\b/, /\bconnected takeaway\b/])) {
    add("disconnected_arms", "Arm and body connection was identified.");
  }
  if (hasAny(haystack, [/\btrail elbow.*(fly|separat|high|away)\b/, /\bflying trail elbow\b/])) {
    add("flying_trail_elbow", "Trail elbow connection was specifically identified.");
  }
  if (hasAny(haystack, [/\bface control\b/, /\bface angle\b/, /\bclubface\b/, /\bopen face\b/, /\bclosed face\b/, /\bface to path\b/])) {
    add("face_control", "Clubface control was identified.");
  }
  if (hasAny(haystack, [/\bwrist\b/, /\bcupp(?:ed|ing)\b/, /\bbowed\b/, /\blead wrist\b/])) add("wrist_condition", "Wrist-condition awareness was identified.");
  if (hasAny(haystack, [/\bearly extension\b/, /\bhip depth\b/, /\bstanding up\b/, /\bgoat hump\b/])) add("early_extension", "Hip-depth or early-extension awareness was identified.");
  if (hasAny(haystack, [/\bbalance\b/, /\blosing balance\b/, /\bfall(?:ing)? off\b/])) add("loss_of_balance", "Balance control was identified.");
  if (hasAny(haystack, [/\bfinish\b/, /\bhold.*finish\b/, /\bstable finish\b/])) add("unstable_finish", "Finish stability was identified.");
  if (hasAny(haystack, [/\bout[- ]to[- ]in\b/, /\bover the top\b/, /\bpath left\b/, /\bcut across\b/])) add("out_to_in_path", "Out-to-in path was identified.");
  if (hasAny(haystack, [/\bin[- ]to[- ]out\b/, /\btoo far from inside\b/, /\bpath right\b/, /\bunder plane\b/])) add("excessive_in_to_out_path", "Excessive in-to-out path was identified.");
}

function latestAnalysisEvidenceText(context = {}) {
  const latestAnalysis = isRecord(context.latestAnalysis) ? context.latestAnalysis : {};
  return [
    latestAnalysis.analysis ? JSON.stringify(latestAnalysis.analysis) : "",
    latestAnalysis.calculatedMetrics ? JSON.stringify(latestAnalysis.calculatedMetrics) : "",
  ].filter(Boolean).join(" ");
}

export function getTrainingAidDefinition(aidId) {
  return AID_BY_ID[text(aidId)] ?? null;
}

export function detectSwingTendencies(context = {}, activity = {}) {
  const evidence = [];
  const coachText = evidenceTextFromCoachFeedback(context.coachFeedback);
  if (coachText) addPatternEvidence(evidence, coachText, "coach_manual", "Coach feedback: ");

  const sourceMode = text(activity.sourceMode || context.sourceMode);
  const sessionEvidenceIsAllowed = sourceMode === "session_data" || sourceMode === "coach_and_session";
  if (sessionEvidenceIsAllowed) {
    addPatternEvidence(evidence, latestAnalysisEvidenceText(context), "session_measured", "Saved session analysis: ");
  }

  const activitySource = [
    activity.focusArea,
    activity.title,
    activity.reasonSelected,
    activity.setup,
    ...(Array.isArray(activity.instructions) ? activity.instructions : []),
  ].join(" ");
  if (sessionEvidenceIsAllowed && activitySource) {
    addPatternEvidence(evidence, activitySource, sourceMode === "coach_and_session" ? "coach_approved_ai" : "session_measured", "Generated activity: ");
  } else if (!coachText && sourceMode === "profile_fallback") {
    addPatternEvidence(evidence, activitySource, "generic", "Profile-only activity: ");
  }

  return compactEvidence(evidence);
}

function primaryAidForTendency(tendency, requestedAidId = "") {
  const candidates = TENDENCY_AID_CANDIDATES[tendency] ?? [];
  if (requestedAidId && candidates.includes(requestedAidId)) return requestedAidId;
  return candidates[0] ?? "";
}

function confidenceFromEvidence(evidence = []) {
  const sources = new Set(evidence.map((item) => item.source));
  if (sources.has("coach_manual") && (sources.has("session_measured") || sources.has("visual_observation") || sources.has("coach_approved_ai"))) return "high";
  if (sources.has("coach_manual") || sources.has("session_measured") || sources.has("visual_observation")) return "moderate";
  return "low";
}

function sourceFromEvidence(evidence = [], sourceMode = "") {
  const sources = new Set(evidence.map((item) => item.source));
  if (sources.has("coach_manual") || sourceMode === "coach_feedback") return "coach";
  if (sourceMode === "coach_and_session") return "coach_approved_ai";
  if (sources.has("coach_approved_ai")) return "coach_approved_ai";
  if (sources.has("session_measured") || sources.has("visual_observation")) return "ai";
  return "none";
}

function noAidRecommendation(reason = "No training aid needed") {
  return {
    aidId: TRAINING_AID_NONE_ID,
    approvalState: "not_needed",
    coachSelectedAid: null,
    confidence: "low",
    evidence: [],
    evidenceJson: "[]",
    name: "No training aid needed",
    noEquipmentAlternative: "Run the drill with only a target, a ball, and honest result tracking.",
    originalAiSuggestion: null,
    safetyNotes: [],
    setupSteps: [],
    shortName: "No aid",
    source: "none",
    studentVisible: false,
    version: 1,
    versionHistory: [],
    whyItFits: reason,
  };
}

export function normalizeTrainingAidDraft(value) {
  if (!isRecord(value)) return null;
  const aidId = text(value.aidId || value.id);
  const definition = aidId === TRAINING_AID_NONE_ID ? null : getTrainingAidDefinition(aidId);
  return {
    aidId: definition?.id ?? (aidId === TRAINING_AID_NONE_ID ? TRAINING_AID_NONE_ID : ""),
    approvalState: TRAINING_AID_APPROVAL_STATES.includes(text(value.approvalState)) ? text(value.approvalState) : "draft",
    coachSelectedAid: isRecord(value.coachSelectedAid) ? value.coachSelectedAid : null,
    confidence: TRAINING_AID_CONFIDENCE_LEVELS.includes(text(value.confidence)) ? text(value.confidence) : "low",
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
    name: text(value.name, definition?.name ?? (aidId === TRAINING_AID_NONE_ID ? "No training aid needed" : "")),
    noEquipmentAlternative: text(value.noEquipmentAlternative),
    safetyNotes: stringArray(value.safetyNotes),
    setupSteps: stringArray(value.setupSteps || value.setupInstructions),
    shortName: text(value.shortName, definition?.shortName ?? ""),
    source: ["coach", "coach_approved_ai", "ai", "none"].includes(text(value.source)) ? text(value.source) : "ai",
    studentVisible: value.studentVisible === true,
    version: Number.isFinite(Number(value.version)) ? Number(value.version) : 1,
    versionHistory: Array.isArray(value.versionHistory) ? value.versionHistory : [],
    whyItFits: text(value.whyItFits || value.description),
  };
}

function existingCoachEdit(existingTrainingAid) {
  const existing = normalizeTrainingAidDraft(existingTrainingAid);
  if (!existing) return null;
  if (["approved", "modified", "removed", "rejected"].includes(existing.approvalState) && ["coach", "coach_approved_ai"].includes(existing.source)) {
    return {
      ...existing,
      evidenceJson: JSON.stringify(Array.isArray(existing.evidence) ? existing.evidence : []),
    };
  }
  return null;
}

export function buildTrainingAidRecommendation({
  activity = {},
  context = {},
  existingTrainingAid = null,
  requestedTrainingAid = null,
} = {}) {
  const preserved = existingCoachEdit(existingTrainingAid);
  if (preserved) return preserved;

  const aiDraft = normalizeTrainingAidDraft(requestedTrainingAid);
  const sourceMode = text(activity.sourceMode || context.sourceMode);
  const evidence = detectSwingTendencies(context, activity);
  if (!evidence.length) {
    const draftDefinition = getTrainingAidDefinition(aiDraft?.aidId);
    if (draftDefinition && (sourceMode === "coach_feedback" || sourceMode === "coach_and_session")) {
      const draftEvidence = [{
        source: "generic",
        tendency: "unknown",
        summary: "AI suggested this aid without enough evidence for member-facing guidance, so it requires Coach review.",
      }];
      return {
        aidId: draftDefinition.id,
        approvalState: "draft",
        coachSelectedAid: null,
        confidence: "low",
        evidence: draftEvidence,
        evidenceJson: JSON.stringify(draftEvidence),
        name: draftDefinition.name,
        noEquipmentAlternative: aiDraft?.noEquipmentAlternative || "Use a safe visual target and half-speed rehearsal until the Coach reviews this aid.",
        originalAiSuggestion: aiDraft,
        safetyNotes: draftDefinition.safetyNotes,
        setupSteps: draftDefinition.setupInstructions,
        shortName: draftDefinition.shortName,
        source: "ai",
        studentVisible: false,
        version: 1,
        versionHistory: [],
        whyItFits: "This is a low-confidence AI suggestion held for Coach review, not a member-facing diagnosis.",
      };
    }
    return noAidRecommendation("No specialized training aid is supported by the current evidence.");
  }

  const ordered = evidence
    .slice()
    .sort((left, right) => {
      const sourceRank = { coach_manual: 0, coach_audio: 1, coach_approved_ai: 2, session_measured: 3, visual_observation: 4, player_reported: 5, generic: 6 };
      return (sourceRank[left.source] ?? 99) - (sourceRank[right.source] ?? 99);
    });
  const primary = ordered.find((item) => item.tendency && item.tendency !== "unknown") ?? ordered[0];
  const aidId = primaryAidForTendency(primary.tendency, aiDraft?.aidId);
  const definition = getTrainingAidDefinition(aidId);
  if (!definition || !definition.active) return noAidRecommendation("No active training aid matches the supported practice priority.");

  const confidence = confidenceFromEvidence(ordered);
  const source = sourceFromEvidence(ordered, sourceMode);
  if (confidence === "low" && (sourceMode === "coach_feedback" || sourceMode === "coach_and_session")) {
    return {
      ...noAidRecommendation("Low-confidence MAI aid suggestions stay private for Coach review."),
      approvalState: "draft",
      originalAiSuggestion: aiDraft,
      source: "ai",
    };
  }
  if (confidence === "low" && source === "none") {
    return noAidRecommendation("The current evidence is too general for a specialized training aid.");
  }

  const coached = sourceMode === "coach_feedback" || sourceMode === "coach_and_session";
  const approvalState = source === "coach"
    ? "approved"
    : source === "coach_approved_ai"
      ? "approved"
      : coached
        ? "draft"
        : "published";
  const studentVisible = approvalState === "approved" || approvalState === "published" || approvalState === "modified";
  const selectedEvidence = ordered.filter((item) => item.tendency === primary.tendency).slice(0, 4);
  const noEquipmentAlternative = definition.requiredEquipment.includes("No equipment")
    ? "Use the same drill at half speed and score only stable, balanced finishes."
    : "Use a safe visual target, a ground line, or a slower no-equipment rehearsal if the aid is not available.";

  return {
    aidId: definition.id,
    approvalState,
    coachSelectedAid: null,
    confidence,
    evidence: selectedEvidence,
    evidenceJson: JSON.stringify(selectedEvidence),
    name: definition.name,
    noEquipmentAlternative,
    originalAiSuggestion: aiDraft,
    safetyNotes: definition.safetyNotes,
    setupSteps: definition.setupInstructions,
    shortName: definition.shortName,
    source,
    studentVisible,
    suitableFor: definition.suitableFor,
    notSuitableFor: definition.notSuitableFor,
    requiredEquipment: definition.requiredEquipment,
    version: 1,
    versionHistory: [],
    whyItFits: `${definition.shortName} fits because ${selectedEvidence[0]?.summary ?? "the practice priority is supported by stored evidence."}`,
  };
}

export function visibleTrainingAidRecommendation(recommendation, { role = "member" } = {}) {
  const item = normalizeTrainingAidDraft(recommendation);
  if (!item || item.aidId === TRAINING_AID_NONE_ID) return null;
  if (role === "coach" || role === "admin") return item;
  return item.studentVisible ? item : null;
}

export function applyCoachTrainingAidAction(existingRecommendation, action, patch = {}) {
  const existing = normalizeTrainingAidDraft(existingRecommendation) ?? noAidRecommendation();
  const timestamp = new Date().toISOString();
  const versionHistory = [
    ...(Array.isArray(existing.versionHistory) ? existing.versionHistory : []),
    {
      action,
      aidId: existing.aidId,
      approvalState: existing.approvalState,
      at: timestamp,
      source: existing.source,
    },
  ].slice(-12);

  if (action === "reject") {
    return {
      ...existing,
      approvalState: "rejected",
      studentVisible: false,
      version: existing.version + 1,
      versionHistory,
    };
  }
  if (action === "remove") {
    return {
      ...noAidRecommendation("Coach removed the training aid for this assignment."),
      approvalState: "removed",
      originalAiSuggestion: existing.originalAiSuggestion ?? existing,
      source: "coach",
      version: existing.version + 1,
      versionHistory,
    };
  }
  const replacement = getTrainingAidDefinition(text(patch.aidId || existing.aidId));
  if (!replacement) return existing;
  return {
    ...existing,
    aidId: replacement.id,
    approvalState: action === "approve" ? "approved" : "modified",
    coachSelectedAid: action === "approve" ? existing.coachSelectedAid : { aidId: replacement.id, name: replacement.name },
    confidence: existing.confidence === "low" ? "moderate" : existing.confidence,
    name: replacement.name,
    noEquipmentAlternative: text(patch.noEquipmentAlternative, existing.noEquipmentAlternative || "Use a safe visual target and half-speed rehearsals when the aid is unavailable."),
    originalAiSuggestion: existing.originalAiSuggestion ?? existing,
    safetyNotes: stringArray(patch.safetyNotes, replacement.safetyNotes),
    setupSteps: stringArray(patch.setupSteps, replacement.setupInstructions),
    shortName: replacement.shortName,
    source: action === "approve" && existing.source === "coach_approved_ai" ? "coach_approved_ai" : "coach",
    studentVisible: true,
    version: existing.version + 1,
    versionHistory,
    whyItFits: text(patch.whyItFits, existing.whyItFits || `${replacement.shortName} was approved by the Coach for this practice assignment.`),
  };
}

export function buildChallengeTrainingAidRecommendation(challengeResult = {}) {
  const shotResults = Array.isArray(challengeResult.shotResults) ? challengeResult.shotResults : [];
  const outsideTargetCount = shotResults.filter((shot) => text(shot.status) === "outside_target_window").length;
  if (outsideTargetCount <= 0) return noAidRecommendation("The challenge result does not support a specialized training aid.");
  return buildTrainingAidRecommendation({
    activity: {
      focusArea: "Start-line variability",
      reasonSelected: "Measured challenge shots missed the offline target window.",
      sourceMode: "session_data",
      title: "7-Iron Precision next step",
    },
    context: {
      latestAnalysis: {
        analysis: {
          summary: "Measured 7-Iron shots missed the offline target window. Use start-line and alignment feedback before narrowing the window.",
        },
      },
      sourceMode: "session_data",
    },
  });
}
