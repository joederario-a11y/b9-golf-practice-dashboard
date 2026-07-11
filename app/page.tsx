"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "dashboard" | "sessions" | "clubs" | "videos" | "coach" | "practice" | "import";
type AccountMode = "pending" | "user" | "guest";
type LoginModalMode = "login" | "register";
type RegisterAccountType = "player" | "coach";

type Shot = {
  id: string;
  club: string;
  carry: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  smash: number;
  launch: number;
  spin: number;
  offline: number;
  shape: string;
  proximity?: number;
  apex?: number;
  spinAxis?: number;
  descent?: number;
  horizontalAngle?: number;
  faceAngle?: number;
  clubPath?: number;
  faceToPath?: number;
  sideCarry?: number;
  sideTotal?: number;
  curve?: number;
  detectedMetrics?: NumericShotMetric[];
};

type Session = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus: string;
  location?: string;
  shots: Shot[];
};

type Insight = {
  id: string;
  title: string;
  club: string;
  severity: "high" | "medium" | "low";
  metric: string;
  value: string;
  target: string;
  evidence: string;
  action: string;
};

type ClubSummary = {
  club: string;
  shots: number;
  carry: number;
  dispersion: number;
  smash: number;
  launch: number;
  spin: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  proximity: number;
  apex: number;
  descent: number;
  spinAxis: number;
  faceToPath: number;
  sideCarry: number;
  horizontalAngle: number;
  curve: number;
  quality: number;
};

type ClubMetricKey = "carry" | "total" | "spin" | "smash" | "ballSpeed" | "clubSpeed" | "launch" | "apex" | "descent";

type ClubMetricConfig = {
  key: ClubMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals?: number;
};

type ProTourStats = {
  carry: number;
  total: number;
  ballSpeed: number;
  clubSpeed: number;
  smash: number;
  launch: number;
  spin: number;
  apex: number;
  descent: number;
};

type LastImport = {
  date: string;
  location: string;
  simulator: string;
  submissionType: "API feed" | "CSV / Excel" | "Photo";
  shots: Shot[];
};

type PhotoImportMetadata = {
  location?: string;
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
};

type NumericShotMetric =
  | "carry"
  | "total"
  | "ballSpeed"
  | "clubSpeed"
  | "smash"
  | "launch"
  | "spin"
  | "offline"
  | "proximity"
  | "apex"
  | "spinAxis"
  | "descent"
  | "horizontalAngle"
  | "faceAngle"
  | "clubPath"
  | "faceToPath"
  | "sideCarry"
  | "sideTotal"
  | "curve";

type PhotoScanResult =
  | {
      id: string;
      fileName: string;
      status: "ready";
      simulator: string;
      shot: Shot;
      confidence: number;
      metadata: PhotoImportMetadata;
    }
  | {
      id: string;
      fileName: string;
      status: "error";
      message: string;
    };

type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type VideoUploader = "User" | "Coach" | "Admin";
type VideoType =
  | "Lesson Recap"
  | "Swing Review"
  | "Practice Session"
  | "Drill"
  | "Drill Explanation"
  | "Practice Assignment"
  | "Coach Feedback"
  | "Before / After"
  | "User Upload"
  | "Other";
type VideoSwingType = "Driver" | "Iron" | "Wedge" | "Putting" | "Chipping" | "Bunker" | "Other";
type VideoFocusArea =
  | "Driver"
  | "Irons"
  | "Wedges"
  | "Putting"
  | "Chipping"
  | "Bunker"
  | "Setup"
  | "Grip"
  | "Tempo"
  | "Club Path"
  | "Face Control"
  | "Distance Control"
  | "Shot Shape"
  | "Other";
type VideoVisibility = "User only" | "Coach + User" | "Admin only";
type VideoStatus = "New" | "Reviewed" | "Coach Feedback";
type VideoViewerRole = "user" | "coach" | "admin";
type VideoPublicationStatus = "Draft" | "Published" | "Archived";
type VideoEmailStatus = "Not sent" | "Sent" | "Failed";

type CoachMember = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  skillLevel?: string;
  notes?: string;
  inviteStatus?: string;
  createdAt?: string;
  videoCount?: number;
  lastVideoAt?: string;
  membershipType?: string;
  membershipStatus?: "Active" | "Paused";
  recentLessonDate?: string;
  coachIds?: string[];
};

type AccountUser = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "coach" | "member";
  firstName: string;
  lastName: string;
};

type VideoEmailNotificationLog = {
  id: string;
  emailTo: string;
  emailSubject: string;
  status: "sent" | "failed";
  sentAt: string;
  failureReason?: string;
};

type VideoLibraryRecord = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  uploadedAt: string;
  uploadedBy: VideoUploader;
  type: VideoType;
  tags: string[];
  sessionId?: string;
  club?: string;
  swingType?: VideoSwingType;
  visibility: VideoVisibility;
  duration: number;
  status: VideoStatus;
  coachNotes: string;
  coachNotesPrivate: boolean;
  userNotes: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  objectUrl?: string;
  thumbnailObjectUrl?: string;
  uploadStatus?: string;
  uploadedByRole?: string;
  memberName?: string;
  memberEmail?: string;
  coachId?: string;
  coachName?: string;
  lessonDate?: string;
  focusArea?: VideoFocusArea;
  publicationStatus?: VideoPublicationStatus;
  isViewedByMember?: boolean;
  viewedAt?: string;
  emailStatus?: VideoEmailStatus;
  emailSentAt?: string;
  emailFailureReason?: string;
  lessonSummary?: string;
  workedOn?: string;
  keyIssue?: string;
  improvement?: string;
  practiceAssignment?: string;
  recommendedDrill?: string;
  memberFacingNotes?: string;
  coachPrivateNotes?: string;
  notificationLog?: VideoEmailNotificationLog[];
  updatedAt?: string;
};

type VideoLibraryItem = VideoLibraryRecord & {
  objectUrl: string;
  thumbnailObjectUrl?: string;
};

type OnboardingQuestionId =
  | "ageRange"
  | "handedness"
  | "skillLevel"
  | "handicap"
  | "simExperience"
  | "simulatorGoals"
  | "goals"
  | "frustrations"
  | "practiceStyle"
  | "timeAvailable"
  | "frequency"
  | "experienceStyle"
  | "coachNotes";

type OnboardingOption = {
  value: string;
  label: string;
  detail?: string;
};

type OnboardingQuestion = {
  id: OnboardingQuestionId;
  type: "single" | "multi" | "text";
  display: "bubbles" | "cards" | "chips" | "slider" | "input";
  title: string;
  helper: string;
  options: OnboardingOption[];
  maxSelections?: number;
  placeholder?: string;
};

type OnboardingAnswers = Partial<Record<OnboardingQuestionId, string | string[]>>;

type UserPracticeProfile = {
  ageRange?: string;
  handedness?: string;
  skillLevel: string;
  handicap: string;
  simExperience: string;
  simulatorGoals: string[];
  goals: string[];
  frustrations: string[];
  practiceStyle: string[];
  timeAvailable: string;
  frequency: string;
  experienceStyle: string[];
  coachNotes?: string;
  path: "Beginner" | "Casual" | "Competitive" | "Junior";
  completedAt: string;
};

type PracticeRecommendations = {
  pathTitle: string;
  summary: string;
  focusAreas: string[];
  drills: string[];
  simulatorModes: string[];
  lessonRecommendation: string;
  trainingPlan: string;
  priorities: string[];
  suggestions: string[];
};

const DEFAULT_FACILITY_NAME = "Back Nine Woodstock";
const DEFAULT_IMPORT_DATE = "2026-06-24";
const DEFAULT_SIMULATOR = "Full Swing";
const LOCATION_UNAVAILABLE = "NA";
const PRACTICE_PROFILE_STORAGE_KEY = "free-range-golf.practice-profile.v1";
const ONBOARDING_DRAFT_STORAGE_KEY = "free-range-golf.onboarding-draft.v1";
const SESSIONS_STORAGE_KEY = "free-range-golf.sessions.v1";
const LAST_IMPORT_STORAGE_KEY = "free-range-golf.last-import.v1";

const CLUB_METRIC_OPTIONS: ClubMetricConfig[] = [
  { key: "carry", label: "Carry", shortLabel: "Carry", unit: "yd", decimals: 1 },
  { key: "total", label: "Total Distance", shortLabel: "Total", unit: "yd", decimals: 1 },
  { key: "spin", label: "Spin", shortLabel: "Spin", unit: "rpm" },
  { key: "smash", label: "Smash Factor", shortLabel: "Smash", unit: "", decimals: 2 },
  { key: "ballSpeed", label: "Ball Speed", shortLabel: "Ball", unit: "mph", decimals: 1 },
  { key: "clubSpeed", label: "Club Speed", shortLabel: "Club", unit: "mph", decimals: 1 },
  { key: "launch", label: "Launch Angle", shortLabel: "Launch", unit: "deg", decimals: 1 },
  { key: "apex", label: "Apex", shortLabel: "Apex", unit: "ft" },
  { key: "descent", label: "Descent Angle", shortLabel: "Descent", unit: "deg", decimals: 1 },
];

const CLUB_TARGETS: Record<
  string,
  {
    carry: number;
    total: number;
    ballSpeed: number;
    clubSpeed: number;
    smash: number;
    launch: number;
    spin: number;
    apex: number;
    descent: number;
    proximity: number;
    spinAxis: number;
    faceToPath: number;
    sideCarry: number;
  }
> = {
  Driver: { carry: 238, total: 264, ballSpeed: 151, clubSpeed: 102, smash: 1.48, launch: 13, spin: 2550, apex: 92, descent: 37, proximity: 70, spinAxis: 4, faceToPath: 2.5, sideCarry: 14 },
  "3-Wood": { carry: 213, total: 232, ballSpeed: 139, clubSpeed: 94, smash: 1.48, launch: 13.5, spin: 3300, apex: 86, descent: 39, proximity: 58, spinAxis: 4, faceToPath: 2.4, sideCarry: 12 },
  "5-Wood": { carry: 196, total: 214, ballSpeed: 130, clubSpeed: 89, smash: 1.46, launch: 15, spin: 4000, apex: 84, descent: 41, proximity: 52, spinAxis: 4, faceToPath: 2.2, sideCarry: 11 },
  "5-Iron": { carry: 171, total: 184, ballSpeed: 118, clubSpeed: 82, smash: 1.44, launch: 17, spin: 5200, apex: 76, descent: 42, proximity: 45, spinAxis: 4, faceToPath: 2, sideCarry: 9 },
  "6-Iron": { carry: 176, total: 192, ballSpeed: 122, clubSpeed: 86.5, smash: 1.42, launch: 15, spin: 5740, apex: 82, descent: 39, proximity: 60, spinAxis: 3, faceToPath: 3.7, sideCarry: 6 },
  "7-Iron": { carry: 148, total: 158, ballSpeed: 106, clubSpeed: 74, smash: 1.43, launch: 19, spin: 6300, apex: 64, descent: 44, proximity: 38, spinAxis: 4, faceToPath: 2, sideCarry: 8 },
  "8-Iron": { carry: 136, total: 145, ballSpeed: 99, clubSpeed: 71, smash: 1.39, launch: 21, spin: 7000, apex: 58, descent: 46, proximity: 34, spinAxis: 4, faceToPath: 2, sideCarry: 7 },
  "9-Iron": { carry: 123, total: 131, ballSpeed: 93, clubSpeed: 68, smash: 1.36, launch: 23, spin: 7800, apex: 50, descent: 48, proximity: 30, spinAxis: 4, faceToPath: 2, sideCarry: 6 },
  PW: { carry: 110, total: 116, ballSpeed: 87, clubSpeed: 65, smash: 1.34, launch: 25, spin: 8500, apex: 44, descent: 50, proximity: 26, spinAxis: 4, faceToPath: 2, sideCarry: 6 },
  GW: { carry: 96, total: 101, ballSpeed: 80, clubSpeed: 60, smash: 1.33, launch: 27, spin: 9100, apex: 39, descent: 52, proximity: 22, spinAxis: 4, faceToPath: 2, sideCarry: 5 },
  SW: { carry: 82, total: 86, ballSpeed: 72, clubSpeed: 56, smash: 1.29, launch: 31, spin: 9800, apex: 33, descent: 54, proximity: 18, spinAxis: 4, faceToPath: 2, sideCarry: 5 },
  LW: { carry: 61, total: 64, ballSpeed: 62, clubSpeed: 50, smash: 1.24, launch: 35, spin: 10300, apex: 27, descent: 56, proximity: 14, spinAxis: 4, faceToPath: 2, sideCarry: 4 },
};

const PRO_REFERENCE_STATS: Record<string, { pga: ProTourStats; lpga: ProTourStats }> = {
  Driver: {
    pga: { carry: 285, total: 303, ballSpeed: 175, clubSpeed: 117, smash: 1.5, launch: 11, spin: 2700, apex: 100, descent: 37 },
    lpga: { carry: 221, total: 246, ballSpeed: 140, clubSpeed: 94, smash: 1.49, launch: 13, spin: 2600, apex: 78, descent: 34 },
  },
  "3-Wood": {
    pga: { carry: 243, total: 262, ballSpeed: 158, clubSpeed: 107, smash: 1.48, launch: 9, spin: 3650, apex: 88, descent: 39 },
    lpga: { carry: 195, total: 218, ballSpeed: 132, clubSpeed: 90, smash: 1.47, launch: 11, spin: 3650, apex: 72, descent: 38 },
  },
  "5-Wood": {
    pga: { carry: 230, total: 247, ballSpeed: 152, clubSpeed: 103, smash: 1.48, launch: 10, spin: 4350, apex: 86, descent: 42 },
    lpga: { carry: 185, total: 204, ballSpeed: 128, clubSpeed: 88, smash: 1.45, launch: 12, spin: 4300, apex: 70, descent: 40 },
  },
  "5-Iron": {
    pga: { carry: 194, total: 208, ballSpeed: 132, clubSpeed: 94, smash: 1.4, launch: 12, spin: 5360, apex: 82, descent: 45 },
    lpga: { carry: 161, total: 173, ballSpeed: 104, clubSpeed: 79, smash: 1.32, launch: 15, spin: 4600, apex: 67, descent: 43 },
  },
  "6-Iron": {
    pga: { carry: 186, total: 198, ballSpeed: 127, clubSpeed: 92, smash: 1.38, launch: 14, spin: 6230, apex: 83, descent: 47 },
    lpga: { carry: 152, total: 163, ballSpeed: 104, clubSpeed: 78, smash: 1.33, launch: 17, spin: 5600, apex: 68, descent: 45 },
  },
  "7-Iron": {
    pga: { carry: 176, total: 186, ballSpeed: 120, clubSpeed: 90, smash: 1.33, launch: 16, spin: 7100, apex: 85, descent: 50 },
    lpga: { carry: 145, total: 153, ballSpeed: 96, clubSpeed: 76, smash: 1.26, launch: 19, spin: 6700, apex: 70, descent: 47 },
  },
  "8-Iron": {
    pga: { carry: 160, total: 169, ballSpeed: 115, clubSpeed: 87, smash: 1.32, launch: 18, spin: 8000, apex: 83, descent: 51 },
    lpga: { carry: 130, total: 137, ballSpeed: 92, clubSpeed: 74, smash: 1.24, launch: 21, spin: 7500, apex: 66, descent: 49 },
  },
  "9-Iron": {
    pga: { carry: 148, total: 156, ballSpeed: 109, clubSpeed: 85, smash: 1.28, launch: 20, spin: 8650, apex: 80, descent: 52 },
    lpga: { carry: 119, total: 125, ballSpeed: 86, clubSpeed: 72, smash: 1.19, launch: 23, spin: 8100, apex: 60, descent: 50 },
  },
  PW: {
    pga: { carry: 136, total: 142, ballSpeed: 102, clubSpeed: 83, smash: 1.23, launch: 24, spin: 9300, apex: 74, descent: 54 },
    lpga: { carry: 107, total: 112, ballSpeed: 80, clubSpeed: 70, smash: 1.14, launch: 26, spin: 8600, apex: 56, descent: 52 },
  },
  GW: {
    pga: { carry: 123, total: 128, ballSpeed: 96, clubSpeed: 79, smash: 1.22, launch: 27, spin: 9800, apex: 69, descent: 55 },
    lpga: { carry: 95, total: 99, ballSpeed: 74, clubSpeed: 66, smash: 1.12, launch: 28, spin: 9000, apex: 51, descent: 53 },
  },
  SW: {
    pga: { carry: 115, total: 119, ballSpeed: 90, clubSpeed: 76, smash: 1.18, launch: 29, spin: 10300, apex: 63, descent: 56 },
    lpga: { carry: 82, total: 86, ballSpeed: 68, clubSpeed: 62, smash: 1.1, launch: 31, spin: 9400, apex: 45, descent: 54 },
  },
  LW: {
    pga: { carry: 95, total: 98, ballSpeed: 78, clubSpeed: 67, smash: 1.16, launch: 32, spin: 10500, apex: 52, descent: 58 },
    lpga: { carry: 65, total: 68, ballSpeed: 58, clubSpeed: 55, smash: 1.05, launch: 34, spin: 9800, apex: 38, descent: 56 },
  },
};

const CLUB_ORDER = [
  "Driver",
  "3-Wood",
  "5-Wood",
  "5-Iron",
  "6-Iron",
  "7-Iron",
  "8-Iron",
  "9-Iron",
  "PW",
  "GW",
  "SW",
  "LW",
];

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌁" },
  { id: "sessions", label: "Sessions", icon: "◫" },
  { id: "clubs", label: "Clubs", icon: "▥" },
  { id: "videos", label: "Videos", icon: "▶" },
  { id: "coach", label: "Coach", icon: "✦" },
  { id: "practice", label: "Practice", icon: "◎" },
  { id: "import", label: "Import", icon: "⇧" },
];

const PAGE_DESCRIPTIONS: Record<Tab, string> = {
  dashboard: "Performance signals, shot patterns, and the next priority in one view.",
  sessions: "Review simulator work, dispersion, and club delivery session by session.",
  clubs: "Understand carry windows, gapping, and quality across the bag.",
  videos: "Keep lesson recaps, swing reviews, and practice feedback together.",
  coach: "Turn performance data into focused guidance and deliver lesson follow-up.",
  practice: "Build the next practice block around the misses that matter most.",
  import: "Bring in simulator files or photos and convert them into usable session data.",
};

const VIDEO_TYPES: VideoType[] = [
  "Lesson Recap",
  "Swing Review",
  "Practice Session",
  "Drill",
  "Drill Explanation",
  "Practice Assignment",
  "Coach Feedback",
  "Before / After",
  "User Upload",
  "Other",
];
const VIDEO_SWING_TYPES: VideoSwingType[] = ["Driver", "Iron", "Wedge", "Putting", "Chipping", "Bunker", "Other"];
const VIDEO_FOCUS_AREAS: VideoFocusArea[] = [
  "Driver",
  "Irons",
  "Wedges",
  "Putting",
  "Chipping",
  "Bunker",
  "Setup",
  "Grip",
  "Tempo",
  "Club Path",
  "Face Control",
  "Distance Control",
  "Shot Shape",
  "Other",
];

const GAME_PROFILE_MAP: Record<string, { skillLevel: string; handicap: string }> = {
  new: { skillLevel: "Brand new", handicap: "I don't know" },
  beginner: { skillLevel: "Beginner", handicap: "25+" },
  casual: { skillLevel: "Casual golfer", handicap: "16-24" },
  weekend: { skillLevel: "Weekend golfer", handicap: "10-15" },
  competitive: { skillLevel: "Competitive amateur", handicap: "5-9" },
  junior: { skillLevel: "Junior player", handicap: "I don't know" },
  college: { skillLevel: "High school/college player", handicap: "0-4" },
  low: { skillLevel: "Low handicap", handicap: "0-4" },
  scratch: { skillLevel: "Scratch or better", handicap: "Plus handicap" },
};

const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "ageRange",
    type: "single",
    display: "chips",
    title: "What age range should we tune this for?",
    helper: "This helps shape lesson pacing, challenge style, and junior-safe recommendations.",
    options: ["Under 13", "13-17", "18-29", "30-44", "45-59", "60+"].map((label) => ({ value: label, label })),
  },
  {
    id: "handedness",
    type: "single",
    display: "bubbles",
    title: "Which side do you play from?",
    helper: "Coach notes and ball-flight language will match your setup.",
    options: [
      { value: "Right-handed", label: "Right-handed" },
      { value: "Left-handed", label: "Left-handed" },
    ],
  },
  {
    id: "skillLevel",
    type: "single",
    display: "cards",
    title: "How would you describe your game today?",
    helper: "Pick the closest fit. Your plan can evolve once simulator sessions start coming in.",
    options: [
      { value: "Brand new", label: "Brand new", detail: "Still learning the basics" },
      { value: "Beginner", label: "Beginner", detail: "Building a reliable setup and swing" },
      { value: "Casual golfer", label: "Casual golfer", detail: "Play for fun and want clearer practice" },
      { value: "Weekend golfer", label: "Weekend golfer", detail: "Play regularly and want fewer big misses" },
      { value: "Competitive amateur", label: "Competitive amateur", detail: "Practice with scoring goals" },
      { value: "Junior player", label: "Junior player", detail: "Building skill and confidence" },
      { value: "High school/college player", label: "High school/college player", detail: "Training for team or tournament play" },
      { value: "Low handicap", label: "Low handicap", detail: "Fine-tuning scoring windows" },
      { value: "Scratch or better", label: "Scratch or better", detail: "Plus or tournament-level goals" },
    ],
  },
  {
    id: "handicap",
    type: "single",
    display: "slider",
    title: "What is your approximate handicap?",
    helper: "A rough range is plenty. If you do not track it, we will start with fundamentals.",
    options: [
      "I don't know",
      "25+",
      "16-24",
      "10-15",
      "5-9",
      "0-4",
      "Plus handicap",
    ].map((label) => ({ value: label, label })),
  },
  {
    id: "simExperience",
    type: "single",
    display: "slider",
    title: "How familiar are you with golf simulators?",
    helper: "This controls how much data language the coach uses at first.",
    options: [
      "Never used one",
      "Tried it once or twice",
      "Comfortable",
      "Use them often",
      "Advanced user",
    ].map((label) => ({ value: label, label })),
  },
  {
    id: "simulatorGoals",
    type: "multi",
    display: "cards",
    title: "What do you want to use the simulator for?",
    helper: "Choose a few reasons you step onto the mat.",
    maxSelections: 4,
    options: [
      { value: "Practice", label: "Practice", detail: "Build better reps" },
      { value: "Lessons", label: "Lessons", detail: "Coach-guided improvement" },
      { value: "Play virtual courses", label: "Play virtual courses", detail: "Work on strategy while playing" },
      { value: "Track distances", label: "Track distances", detail: "Know your real yardages" },
      { value: "Work on swing data", label: "Work on swing data", detail: "Club path, face, launch, spin" },
      { value: "Compete with friends", label: "Compete with friends", detail: "Games and pressure reps" },
      { value: "League play", label: "League play", detail: "Social or competitive events" },
      { value: "Junior development", label: "Junior development", detail: "Fun progress and milestones" },
    ],
  },
  {
    id: "goals",
    type: "multi",
    display: "chips",
    title: "What do you want to improve first?",
    helper: "Select up to five. Your coach plan will start with the highest-leverage areas.",
    maxSelections: 5,
    options: [
      "Driver distance",
      "Driver accuracy",
      "Iron consistency",
      "Wedge control",
      "Putting",
      "Short game",
      "Ball striking",
      "Shot shape",
      "Tempo",
      "Club path",
      "Face angle",
      "Contact quality",
      "Course management",
      "Confidence",
    ].map((label) => ({ value: label, label })),
  },
  {
    id: "frustrations",
    type: "multi",
    display: "chips",
    title: "Which frustrations should your plan account for?",
    helper: "Pick up to three. The first practice path will stay focused on these.",
    maxSelections: 3,
    options: [
      "Slicing",
      "Hooking",
      "Fat shots",
      "Thin shots",
      "Inconsistent contact",
      "Lack of distance",
      "Poor wedge distance control",
      "Three-putting",
      "Not knowing what to practice",
      "I just want to get better",
    ].map((label) => ({ value: label, label })),
  },
  {
    id: "practiceStyle",
    type: "multi",
    display: "chips",
    title: "How do you prefer to practice?",
    helper: "Choose the style that feels easiest to repeat.",
    maxSelections: 3,
    options: [
      "Quick drills",
      "Structured plans",
      "Data-focused practice",
      "Games/challenges",
      "Coach-guided sessions",
      "Solo practice",
      "Competitive practice",
    ].map((label) => ({ value: label, label })),
  },
  {
    id: "timeAvailable",
    type: "single",
    display: "slider",
    title: "How much time do you usually have?",
    helper: "This keeps the practice plan realistic instead of heroic.",
    options: ["15 minutes", "30 minutes", "45 minutes", "60 minutes", "90+ minutes"].map((label) => ({ value: label, label })),
  },
  {
    id: "frequency",
    type: "single",
    display: "bubbles",
    title: "How often do you want to practice?",
    helper: "Your plan will use this cadence for drills, check-ins, and progress goals.",
    options: ["Once a week", "2-3 times per week", "4+ times per week", "Just when I can"].map((label) => ({ value: label, label })),
  },
  {
    id: "experienceStyle",
    type: "multi",
    display: "cards",
    title: "What type of experience do you want?",
    helper: "This tunes the vibe of coaching, challenges, and recommendations.",
    maxSelections: 3,
    options: [
      { value: "Serious improvement", label: "Serious improvement", detail: "Clear work blocks and measurable gains" },
      { value: "Fun and casual", label: "Fun and casual", detail: "Games, variety, and low pressure" },
      { value: "Junior development", label: "Junior development", detail: "Short challenges and visible progress" },
      { value: "Data-driven training", label: "Data-driven training", detail: "Numbers that guide each session" },
      { value: "Competitive challenges", label: "Competitive challenges", detail: "Pressure tests and leaderboards" },
      { value: "Social golf", label: "Social golf", detail: "Friends, leagues, and events" },
      { value: "Lesson-based improvement", label: "Lesson-based improvement", detail: "Coach checkpoints and homework" },
      { value: "Full game rebuild", label: "Full game rebuild", detail: "A structured reset from setup to scoring" },
    ],
  },
  {
    id: "coachNotes",
    type: "text",
    display: "input",
    title: "Anything else your coach should know?",
    helper: "Optional. Add an injury note, upcoming event, favorite club, or a specific goal in your own words.",
    options: [],
    placeholder: "Example: I have a member-guest in August and want my driver to stay in play.",
  },
];

const DEMO_CSV = `club,proximity,carry,total,ballSpeed,clubSpeed,smash,apex,spin,spinAxis,launch,descent,horizontalAngle,faceAngle,clubPath,faceToPath,sideCarry,sideTotal,offline
6-Iron,59.8,175.9,191.8,122.4,86.5,1.42,81.8,5742,-3,14.9,39.4,2.3,1.5,5.2,-3.7,6.3,6.2,6.2
6-Iron,51.3,178.7,198.0,122.8,87.5,1.40,77.3,5940,-4,15.4,38.8,2.9,2.1,8.4,-4.3,7.6,7.8,7.8
6-Iron,50.4,170.6,198.7,122.1,85.8,1.42,53.2,4346,-8,11.5,30.1,2.1,1.0,6.8,-5.7,1.8,0.8,0.8
6-Iron,53.3,181.1,197.3,124.5,87.4,1.42,78.6,5566,-5,14.3,39.0,2.8,1.9,6.4,-4.5,6.1,6.1,6.1
6-Iron,54.0,175.9,195.6,122.6,87.2,1.41,67.3,5085,-10,13.3,35.3,0.8,-0.6,6.4,-7.0,-4.7,-6.6,-6.6
6-Iron,75.3,183.5,194.8,125.9,86.3,1.46,100.2,6493,1,18.4,44.5,5.3,5.0,6.4,-1.4,20.0,21.4,21.4
6-Iron,37.1,175.5,192.2,121.2,91.2,1.33,75.2,5511,-2,15.6,38.1,1.2,0.6,5.5,-3.2,4.0,4.1,4.1
6-Iron,50.2,176.2,198.4,122.8,87.4,1.40,66.3,4992,-4,13.1,34.9,2.3,1.5,5.6,-4.2,5.3,5.2,5.2`;

const SIMULATOR_SOURCES = [
  { label: "Full Swing", logo: "/logos/full-swing.png", tone: "dark" },
  { label: "TrackMan", logo: "/logos/trackman.svg", tone: "dark" },
  { label: "Foresight GCQuad", logo: "/logos/foresight-sports.png", tone: "dark" },
  { label: "SkyTrak", logo: "/logos/skytrak.png", tone: "light" },
  { label: "FlightScope Mevo+", logo: "/logos/flightscope.png", tone: "dark" },
];

const METRIC_DEFINITIONS: Record<string, { title: string; description: string; benchmark: (club: string) => string }> = {
  quality: {
    title: "Performance index",
    description: "Composite of strike efficiency, dispersion, launch window, and curve control for the selected club.",
    benchmark: () => "80+ is strong, 70-79 is playable, below 70 needs focused work.",
  },
  carry: {
    title: "Average carry",
    description: "How far the ball flies before landing. This is the number to use for hazards and approach planning.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.carry ?? "club"} yd carry.`,
  },
  dispersion: {
    title: "Shot dispersion",
    description: "Typical left-right spread from the target line. Lower means more fairways, greens, and predictable misses.",
    benchmark: (club) => `${club} working window: inside ${Math.max(6, CLUB_TARGETS[club]?.sideCarry ?? 12)} yd side carry.`,
  },
  smash: {
    title: "Smash factor",
    description: "Ball speed divided by club speed. It shows how efficiently your strike transfers energy.",
    benchmark: (club) => `${club} benchmark: ${CLUB_TARGETS[club]?.smash.toFixed(2) ?? "1.40"} or better.`,
  },
  ballSpeed: {
    title: "Ball speed",
    description: "Speed of the ball immediately after impact. It is the clearest distance engine.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.ballSpeed ?? "tracked"} mph.`,
  },
  clubSpeed: {
    title: "Club speed",
    description: "Club-head speed at impact. Speed matters most when smash factor stays stable.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.clubSpeed ?? "tracked"} mph.`,
  },
  total: {
    title: "Total distance",
    description: "Carry plus rollout. Useful for tee shots and run-up approaches, less useful for forced carries.",
    benchmark: (club) => `${club} reference: ${CLUB_TARGETS[club]?.total ?? "tracked"} yd total.`,
  },
  apex: {
    title: "Apex height",
    description: "Peak height of the ball flight. Helps explain stopping power and whether shots are ballooning.",
    benchmark: (club) => `${club} target: around ${CLUB_TARGETS[club]?.apex ?? "tracked"} ft.`,
  },
  spin: {
    title: "Spin rate",
    description: "Backspin immediately after impact. Too high can balloon; too low can reduce carry and hold.",
    benchmark: (club) => `${club} target: about ${CLUB_TARGETS[club]?.spin ?? "tracked"} rpm.`,
  },
  launch: {
    title: "Launch angle",
    description: "Initial vertical launch. It should match the club and speed window.",
    benchmark: (club) => `${club} target: ${CLUB_TARGETS[club]?.launch ?? "tracked"} degrees.`,
  },
  descent: {
    title: "Descent angle",
    description: "The landing angle into the turf or green. Steeper descent generally helps approach shots stop.",
    benchmark: (club) => `${club} target: roughly ${CLUB_TARGETS[club]?.descent ?? "tracked"} degrees.`,
  },
  spinAxis: {
    title: "Spin axis",
    description: "Tilt of the spin axis. More tilt means more curve left or right.",
    benchmark: (club) => `${club} goal: within ${CLUB_TARGETS[club]?.spinAxis ?? 4} degrees either way.`,
  },
  faceToPath: {
    title: "Face to path",
    description: "Relationship between face angle and club path. It is the main curve-control number.",
    benchmark: (club) => `${club} goal: within ${CLUB_TARGETS[club]?.faceToPath ?? 2} degrees.`,
  },
  proximity: {
    title: "Proximity",
    description: "Distance from the intended target. It blends distance control and directional control.",
    benchmark: (club) => `${club} target: under ${CLUB_TARGETS[club]?.proximity ?? "tracked"} ft.`,
  },
};

const SHOT_PATTERNS: Record<string, { carryBias: number; offline: number[]; smashBias: number; launchBias: number; spinBias: number }> = {
  Driver: { carryBias: -5, offline: [18, -24, 10, 6, -16, 26, 4, -7, 13, -20, 9, 18], smashBias: -0.02, launchBias: -1.1, spinBias: 420 },
  "3-Wood": { carryBias: -2, offline: [8, -12, 5, 14, -7, 9, -9, 11], smashBias: -0.01, launchBias: -0.4, spinBias: 180 },
  "5-Wood": { carryBias: 0, offline: [5, 9, -8, 7, -5, 12, 2, -10], smashBias: 0, launchBias: 0.2, spinBias: 120 },
  "5-Iron": { carryBias: -4, offline: [-10, -7, -13, 4, 8, -16, 6, -8, -14], smashBias: -0.025, launchBias: -1.3, spinBias: 360 },
  "6-Iron": { carryBias: -1, offline: [-6, 8, -8, 5, 3, -10, 6, -4, 9], smashBias: -0.01, launchBias: -0.5, spinBias: 170 },
  "7-Iron": { carryBias: -3, offline: [-14, 6, -10, -18, 8, -5, -15, 10, -9, 4], smashBias: -0.02, launchBias: -1.4, spinBias: 480 },
  "8-Iron": { carryBias: 1, offline: [4, -6, 8, -5, 6, -8, 2, -4], smashBias: 0.005, launchBias: 0.3, spinBias: 80 },
  "9-Iron": { carryBias: 0, offline: [3, -5, 4, -6, 7, -4, 5, -3], smashBias: 0, launchBias: 0.4, spinBias: 90 },
  PW: { carryBias: -2, offline: [4, -9, 7, -6, 10, -11, 6, -5], smashBias: -0.01, launchBias: -0.2, spinBias: 260 },
  GW: { carryBias: 2, offline: [3, -5, 4, 6, -4, 5, -6], smashBias: 0.005, launchBias: 0.5, spinBias: 150 },
  SW: { carryBias: -1, offline: [6, -8, 5, -7, 9, -5, 4], smashBias: -0.005, launchBias: 0.7, spinBias: 210 },
  LW: { carryBias: 0, offline: [4, -6, 5, -5, 7, -4], smashBias: 0, launchBias: 0.8, spinBias: 120 },
};

function makeShot(sessionId: string, club: string, index: number, shift: number): Shot {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const pattern = SHOT_PATTERNS[club] ?? SHOT_PATTERNS["7-Iron"];
  const direction = pattern.offline[index % pattern.offline.length] + shift * (index % 2 === 0 ? 0.8 : -0.4);
  const rhythm = ((index % 5) - 2) * 0.012;
  const carry = target.carry + pattern.carryBias + shift * 0.9 + ((index % 7) - 3) * 2.1;
  const clubSpeed = target.clubSpeed + ((index % 6) - 2) * 0.8 + shift * 0.18;
  const ballSpeed = target.ballSpeed + pattern.carryBias * 0.35 + ((index % 4) - 1.5) * 1.6 + shift * 0.35;
  const smash = Math.max(1.18, Math.min(1.51, target.smash + pattern.smashBias + rhythm));
  const launch = target.launch + pattern.launchBias + ((index % 5) - 2) * 0.55;
  const spin = target.spin + pattern.spinBias + ((index % 6) - 2.5) * 115;
  const faceToPath = round(((direction / 7) % 6) - 2, 1);

  return {
    id: `${sessionId}-${club}-${index}`,
    club,
    carry: round(carry),
    total: round(carry * (club === "Driver" ? 1.11 : 1.08)),
    ballSpeed: round(ballSpeed),
    clubSpeed: round(clubSpeed),
    smash: round(smash, 2),
    launch: round(launch),
    spin: Math.round(spin),
    offline: round(direction),
    shape: direction < -15 ? "Pull" : direction < -6 ? "Draw" : direction > 15 ? "Slice" : direction > 6 ? "Fade" : "Straight",
    proximity: round(Math.abs(direction) * 2.2 + Math.abs(carry - target.carry) * 0.8 + 12),
    apex: round(target.apex + ((index % 6) - 2.5) * 3.8 + shift * 0.5),
    spinAxis: round(direction / 3.2),
    descent: round(target.descent + ((index % 5) - 2) * 1.4),
    horizontalAngle: round(direction / 3.4),
    faceAngle: round(direction / 6.8),
    clubPath: round(direction / 4.1 + 3),
    faceToPath,
    sideCarry: round(direction * 0.74),
    sideTotal: round(direction * 0.78),
  };
}

function makeSession(id: string, title: string, date: string, source: string, focus: string, clubs: string[], shift: number): Session {
  const shots = clubs.flatMap((club) => {
    const count = club === "Driver" ? 14 : club.includes("Wood") ? 10 : club.length <= 2 ? 9 : 12;
    return Array.from({ length: count }, (_, index) => makeShot(id, club, index, shift));
  });

  return { id, title, date, source, focus, shots };
}

function makeFullSwingSession(): Session {
  const rows = [
    [51.3, 178.7, 198.0, 122.8, 87.5, 1.4, 77.3, 5940, -4, 15.4, 38.8, 2.9, 2.1, 8.4, -4.3, 7.6, 7.8],
    [50.4, 170.6, 198.7, 122.1, 85.8, 1.42, 53.2, 4346, -8, 11.5, 30.1, 2.1, 1.0, 6.8, -5.7, 1.8, 0.8],
    [53.3, 181.1, 197.3, 124.5, 87.4, 1.42, 78.6, 5566, -5, 14.3, 39.0, 2.8, 1.9, 6.4, -4.5, 6.1, 6.1],
    [54.0, 175.9, 195.6, 122.6, 87.2, 1.41, 67.3, 5085, -10, 13.3, 35.3, 0.8, -0.6, 6.4, -7.0, -4.7, -6.6],
    [75.3, 183.5, 194.8, 125.9, 86.3, 1.46, 100.2, 6493, 1, 18.4, 44.5, 5.3, 5.0, 6.4, -1.4, 20.0, 21.4],
    [37.1, 175.5, 192.2, 121.2, 91.2, 1.33, 75.2, 5511, -2, 15.6, 38.1, 1.2, 0.6, 5.5, -3.2, 4.0, 4.1],
    [50.2, 176.2, 198.4, 122.8, 87.4, 1.4, 66.3, 4992, -4, 13.1, 34.9, 2.3, 1.5, 5.6, -4.2, 5.3, 5.2],
  ];

  return {
    id: "fullswing-6iron-photo",
    title: "Full Swing 6-Iron photo import",
    date: "2026-06-23",
    source: "Full Swing Photo",
    focus: "6-Iron shot history",
    shots: rows.map((row, index) => {
      const [
        proximity,
        carry,
        total,
        ballSpeed,
        clubSpeed,
        smash,
        apex,
        spin,
        spinAxis,
        launch,
        descent,
        horizontalAngle,
        faceAngle,
        clubPath,
        faceToPath,
        sideCarry,
        sideTotal,
      ] = row;

      return {
        id: `fullswing-6i-${index + 1}`,
        club: "6-Iron",
        proximity,
        carry,
        total,
        ballSpeed,
        clubSpeed,
        smash,
        apex,
        spin,
        spinAxis,
        launch,
        descent,
        horizontalAngle,
        faceAngle,
        clubPath,
        faceToPath,
        sideCarry,
        sideTotal,
        offline: sideTotal,
        shape: sideTotal < -6 ? "Draw" : sideTotal > 6 ? "Fade" : "Straight",
      };
    }),
  };
}

const BASE_SESSIONS: Session[] = [
  makeFullSwingSession(),
  makeSession("s1", "Driver start-line block", "2026-06-22", "TrackMan", "Tee accuracy", ["Driver", "3-Wood"], 4),
  makeSession("s2", "Approach ladder", "2026-06-18", "Foresight GCQuad", "Carry windows", ["5-Iron", "6-Iron", "7-Iron", "8-Iron"], 2),
  makeSession("s3", "Wedge matrix", "2026-06-14", "SkyTrak", "Distance control", ["PW", "GW", "SW", "LW"], -1),
  makeSession("s4", "Pre-round tune", "2026-06-09", "Mevo+", "Bag blend", ["Driver", "7-Iron", "PW"], -2),
  makeSession("s5", "Full bag baseline", "2026-06-02", "TrackMan", "Benchmark", ["Driver", "5-Wood", "6-Iron", "8-Iron", "PW", "SW"], -4),
  makeSession("s6", "Long iron strike", "2026-05-26", "GCQuad", "Contact", ["5-Iron", "6-Iron", "7-Iron"], -5),
];

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (!values.length) return Number.NaN;
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function hasShotMetric(shot: Shot, key: NumericShotMetric) {
  const value = shot[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return !shot.detectedMetrics || shot.detectedMetrics.includes(key);
}

function getShotMetric(shot: Shot, key: NumericShotMetric) {
  return hasShotMetric(shot, key) ? shot[key] : undefined;
}

function metricValues(shots: Shot[], key: NumericShotMetric) {
  return shots
    .map((shot) => getShotMetric(shot, key))
    .filter((value): value is number => typeof value === "number");
}

function averageMetric(shots: Shot[], key: NumericShotMetric) {
  const values = metricValues(shots, key);
  return values.length ? average(values) : Number.NaN;
}

function formatAvailableMetric(value: number, unit = "", digits = 1) {
  if (!Number.isFinite(value)) return "NA";
  const formatted = digits === 0 ? Math.round(value).toString() : round(value, digits).toFixed(digits);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function getClubMetricConfig(metricKey: ClubMetricKey) {
  return CLUB_METRIC_OPTIONS.find((metric) => metric.key === metricKey) ?? CLUB_METRIC_OPTIONS[1];
}

function formatClubMetricValue(value: number, metric: ClubMetricConfig) {
  if (!Number.isFinite(value)) return "NA";
  const rounded = metric.decimals !== undefined ? round(value, metric.decimals).toFixed(metric.decimals) : Math.round(value).toString();
  return metric.unit ? `${rounded} ${metric.unit}` : rounded;
}

function getClubMetricValue(club: ClubSummary, metricKey: ClubMetricKey) {
  return club[metricKey];
}

function getReferenceMetricValue(stats: ProTourStats, metricKey: ClubMetricKey) {
  return stats[metricKey];
}

function getAmateurMetricValue(club: string, metricKey: ClubMetricKey, tier: "low" | "mid" | "high") {
  const target = CLUB_TARGETS[club];
  if (!target) return Number.NaN;
  const base = target[metricKey];
  const powerMultipliers = {
    low: 1.03,
    mid: 0.9,
    high: 0.76,
  };

  if (metricKey === "smash") {
    const adjustments = { low: 0.02, mid: -0.01, high: -0.05 };
    return Math.max(1, Math.min(1.5, target.smash + adjustments[tier]));
  }

  if (metricKey === "spin") {
    const spinMultipliers = { low: 1, mid: 0.96, high: 0.9 };
    return base * spinMultipliers[tier];
  }

  if (metricKey === "launch") {
    const launchAdjustments = { low: 0, mid: 1, high: 2 };
    return base + launchAdjustments[tier];
  }

  if (metricKey === "descent") {
    const descentAdjustments = { low: 1, mid: 0, high: -3 };
    return base + descentAdjustments[tier];
  }

  return base * powerMultipliers[tier];
}

function getTodayDateString() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function makeLastImport(
  submissionType: LastImport["submissionType"],
  shots: Shot[],
  date = getTodayDateString(),
  simulator = DEFAULT_SIMULATOR,
  location = LOCATION_UNAVAILABLE,
): LastImport {
  return {
    date,
    location,
    simulator,
    submissionType,
    shots,
  };
}

function getSeverityScore(severity: Insight["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function summarizeClubs(sessions: Session[]): ClubSummary[] {
  const shotsByClub = new Map<string, Shot[]>();
  sessions.flatMap((session) => session.shots).forEach((shot) => {
    shotsByClub.set(shot.club, [...(shotsByClub.get(shot.club) ?? []), shot]);
  });

  const orderedClubs = [
    ...CLUB_ORDER.filter((club) => shotsByClub.has(club)),
    ...Array.from(shotsByClub.keys()).filter((club) => !CLUB_ORDER.includes(club)),
  ];

  return orderedClubs.map((club) => {
    const shots = shotsByClub.get(club) ?? [];
    const target = CLUB_TARGETS[club];
    const carry = averageMetric(shots, "carry");
    const dispersion = standardDeviation(metricValues(shots, "offline"));
    const smash = averageMetric(shots, "smash");
    const launch = averageMetric(shots, "launch");
    const spin = averageMetric(shots, "spin");
    const total = averageMetric(shots, "total");
    const ballSpeed = averageMetric(shots, "ballSpeed");
    const clubSpeed = averageMetric(shots, "clubSpeed");
    const proximity = averageMetric(shots, "proximity");
    const apex = averageMetric(shots, "apex");
    const descent = averageMetric(shots, "descent");
    const spinAxis = averageMetric(shots, "spinAxis");
    const faceToPath = averageMetric(shots, "faceToPath");
    const sideCarry = averageMetric(shots, "sideCarry");
    const horizontalAngle = averageMetric(shots, "horizontalAngle");
    const curve = averageMetric(shots, "curve");
    const qualityScores = [
      Number.isFinite(smash) && target ? Math.max(0, 100 - Math.abs(target.smash - smash) * 450) : Number.NaN,
      Number.isFinite(dispersion) ? Math.max(0, 100 - dispersion * 3.4) : Number.NaN,
      Number.isFinite(launch) && target ? Math.max(0, 100 - Math.abs(target.launch - launch) * 7) : Number.NaN,
      Number.isFinite(faceToPath) ? Math.max(0, 100 - Math.abs(faceToPath) * 7) : Number.NaN,
    ].filter(Number.isFinite);
    const quality = qualityScores.length >= 2 ? Math.round(average(qualityScores)) : Number.NaN;

    return {
      club,
      shots: shots.length,
      carry: round(carry),
      dispersion: round(dispersion),
      smash: round(smash, 2),
      launch: round(launch),
      spin: Math.round(spin),
      total: round(total),
      ballSpeed: round(ballSpeed),
      clubSpeed: round(clubSpeed),
      proximity: round(proximity),
      apex: round(apex),
      descent: round(descent),
      spinAxis: round(spinAxis),
      faceToPath: round(faceToPath),
      sideCarry: round(sideCarry),
      horizontalAngle: round(horizontalAngle),
      curve: round(curve),
      quality,
    };
  });
}

function computeInsights(clubs: ClubSummary[], sessions: Session[]): Insight[] {
  const insights: Insight[] = [];

  clubs.forEach((club) => {
    const target = CLUB_TARGETS[club.club];
    if (!target) return;

    if (Number.isFinite(club.dispersion) && club.dispersion > 15) {
      insights.push({
        id: `${club.club}-dispersion`,
        title: "Start-line spread is costing playable misses",
        club: club.club,
        severity: club.dispersion > 19 ? "high" : "medium",
        metric: "Offline spread",
        value: `±${club.dispersion} yd`,
        target: "±12 yd",
        evidence: `${club.club} shots are finishing wide enough to turn solid distance into missed targets.`,
        action: "Run a 20-ball gate test and record face angle after every five shots.",
      });
    }

    if (Number.isFinite(club.smash) && club.smash < target.smash - 0.035) {
      insights.push({
        id: `${club.club}-strike`,
        title: "Energy transfer is leaking through strike quality",
        club: club.club,
        severity: club.smash < target.smash - 0.06 ? "high" : "medium",
        metric: "Smash factor",
        value: club.smash.toFixed(2),
        target: target.smash.toFixed(2),
        evidence: `Average smash trails the club benchmark, so speed is not becoming ball speed consistently.`,
        action: "Use foot-spray contact mapping for three sets of seven swings.",
      });
    }

    if (Number.isFinite(club.launch) && club.launch < target.launch - 1.4) {
      insights.push({
        id: `${club.club}-launch`,
        title: "Launch window is too low for reliable carry",
        club: club.club,
        severity: "medium",
        metric: "Launch angle",
        value: `${club.launch}°`,
        target: `${target.launch}°`,
        evidence: `The ball is launching below the expected window, which narrows descent angle and stopping power.`,
        action: "Move ball position half a ball forward and compare 10-shot launch average.",
      });
    }

    if (Number.isFinite(club.spin) && club.spin > target.spin * 1.14) {
      insights.push({
        id: `${club.club}-spin`,
        title: "Spin is creating extra curvature and ballooning",
        club: club.club,
        severity: "low",
        metric: "Spin rate",
        value: `${club.spin} rpm`,
        target: `${target.spin} rpm`,
        evidence: `Spin is above the working range, especially when contact drifts low on the face.`,
        action: "Track strike height and dynamic loft together during the next block.",
      });
    }
  });

  const recent = sessions.slice(0, 2).flatMap((session) => session.shots);
  const older = sessions.slice(2).flatMap((session) => session.shots);
  const recentSmash = averageMetric(recent, "smash");
  const olderSmash = averageMetric(older, "smash");
  if (Number.isFinite(recentSmash) && Number.isFinite(olderSmash) && recentSmash < olderSmash - 0.015) {
    insights.push({
      id: "trend-smash",
      title: "Recent strike trend is drifting down",
      club: "All clubs",
      severity: "high",
      metric: "Recent smash",
      value: recentSmash.toFixed(2),
      target: olderSmash.toFixed(2),
      evidence: "The last two sessions are less efficient than the prior baseline.",
      action: "Start next session with 12 half-speed swings before full-speed work.",
    });
  }

  return insights.sort((a, b) => getSeverityScore(b.severity) - getSeverityScore(a.severity)).slice(0, 7);
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeDataLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeClubName(value: string) {
  const normalized = normalizeDataLabel(value);
  const aliases: Record<string, string> = {
    driver: "Driver",
    "1wood": "Driver",
    "1w": "Driver",
    "3wood": "3-Wood",
    "3w": "3-Wood",
    "5wood": "5-Wood",
    "5w": "5-Wood",
    "5iron": "5-Iron",
    "5i": "5-Iron",
    "6iron": "6-Iron",
    "6i": "6-Iron",
    "7iron": "7-Iron",
    "7i": "7-Iron",
    "8iron": "8-Iron",
    "8i": "8-Iron",
    "9iron": "9-Iron",
    "9i": "9-Iron",
    pitchingwedge: "PW",
    pw: "PW",
    gapwedge: "GW",
    approachwedge: "GW",
    gw: "GW",
    aw: "GW",
    sandwedge: "SW",
    sw: "SW",
    lobwedge: "LW",
    lw: "LW",
  };
  return aliases[normalized] ?? (value.trim() || "Unknown Club");
}

function getClubDisplayName(club: string) {
  return {
    PW: "Pitching Wedge",
    GW: "Gap Wedge",
    SW: "Sand Wedge",
    LW: "Lob Wedge",
  }[club] ?? club;
}

function parseDirectionalNumber(value: string) {
  const match = value.replace(/,/g, "").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return undefined;
  if (/\bL\b/i.test(value.trim()) || /L$/i.test(value.trim())) return -Math.abs(parsed);
  if (/\bR\b/i.test(value.trim()) || /R$/i.test(value.trim())) return Math.abs(parsed);
  return parsed;
}

function parseCurveFeet(value: string) {
  const feetMatch = value.match(/(\d+(?:\.\d+)?)\s*'/);
  if (!feetMatch) return parseDirectionalNumber(value);
  const inchesMatch = value.match(/'\s*(\d+(?:\.\d+)?)\s*"?/);
  const feet = Number(feetMatch[1]);
  const inches = inchesMatch ? Number(inchesMatch[1]) : 0;
  const distance = feet + inches / 12;
  return /L/i.test(value) ? -distance : /R/i.test(value) ? distance : distance;
}

function parseCsv(text: string): Shot[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeDataLabel);
  const findIndex = (names: string[]) =>
    names.map(normalizeDataLabel).map((name) => headers.indexOf(name)).find((match) => match >= 0) ?? -1;
  const readCell = (cells: string[], names: string[]) => {
    const index = findIndex(names);
    return index >= 0 ? cells[index]?.trim() ?? "" : "";
  };
  const readNumber = (cells: string[], names: string[]) => parseDirectionalNumber(readCell(cells, names));

  return rows.slice(1).flatMap((cells, index) => {
    const clubValue = readCell(cells, ["club", "club name"]);
    const club = normalizeClubName(clubValue || "Unknown Club");
    const values: Partial<Record<NumericShotMetric, number>> = {
      carry: readNumber(cells, ["carry", "carry yards", "carry yds", "carry distance"]),
      total: readNumber(cells, ["total", "total yards", "total yds", "total distance"]),
      ballSpeed: readNumber(cells, ["ball speed", "ball speed mph", "ball velocity"]),
      clubSpeed: readNumber(cells, ["club speed", "club speed mph", "clubhead speed", "club head speed"]),
      smash: readNumber(cells, ["smash", "smash factor"]),
      launch: readNumber(cells, ["launch", "launch angle", "launch angle deg"]),
      spin: readNumber(cells, ["spin", "spin rate", "spin rate rpm"]),
      offline: readNumber(cells, ["offline", "offline yards", "distance offline"]),
      proximity: readNumber(cells, ["proximity", "proximity feet", "distance to pin"]),
      apex: readNumber(cells, ["apex", "apex feet", "height", "height ft", "max height"]),
      spinAxis: readNumber(cells, ["spin axis", "spin axis deg"]),
      descent: readNumber(cells, ["descent", "descent angle", "descent angle deg", "landing angle"]),
      horizontalAngle: readNumber(cells, ["horizontal angle", "horizontal angle deg", "launch direction"]),
      faceAngle: readNumber(cells, ["face angle", "face angle deg"]),
      clubPath: readNumber(cells, ["club path", "club path deg"]),
      faceToPath: readNumber(cells, ["face to path", "face-to-path", "face to path deg"]),
      sideCarry: readNumber(cells, ["side carry", "side carry yards", "side carry yds"]),
      sideTotal: readNumber(cells, ["side total", "side total yards", "side total yds"]),
    };
    const curveCell = readCell(cells, ["curve", "curve feet", "curve ft"]);
    const curve = curveCell ? parseCurveFeet(curveCell) : undefined;
    if (curve !== undefined) values.curve = curve;

    const detectedMetrics = Object.entries(values)
      .filter((entry): entry is [NumericShotMetric, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key]) => key);
    if (!detectedMetrics.length) return [];

    const metric = (key: NumericShotMetric) => values[key] ?? 0;
    const offline = metric("offline");
    return [{
      id: `csv-${Date.now()}-${index}`,
      club,
      carry: metric("carry"),
      total: metric("total"),
      ballSpeed: metric("ballSpeed"),
      clubSpeed: metric("clubSpeed"),
      smash: metric("smash"),
      launch: metric("launch"),
      spin: Math.round(metric("spin")),
      offline,
      proximity: metric("proximity"),
      apex: metric("apex"),
      spinAxis: metric("spinAxis"),
      descent: metric("descent"),
      horizontalAngle: metric("horizontalAngle"),
      faceAngle: metric("faceAngle"),
      clubPath: metric("clubPath"),
      faceToPath: metric("faceToPath"),
      sideCarry: metric("sideCarry"),
      sideTotal: metric("sideTotal"),
      curve: metric("curve"),
      shape: "Not recorded",
      detectedMetrics,
    }];
  });
}

const PHOTO_METRIC_SPECS: Array<{
  key: NumericShotMetric;
  label: string;
  aliases: string[];
  min: number;
  max: number;
  exclude?: string[];
}> = [
  { key: "ballSpeed", label: "Ball speed", aliases: ["ball speed"], min: 20, max: 250 },
  { key: "clubSpeed", label: "Club speed", aliases: ["club speed", "clubhead speed", "club head speed"], min: 15, max: 180 },
  { key: "smash", label: "Smash", aliases: ["smash factor", "smash"], min: 0.5, max: 2 },
  { key: "carry", label: "Carry", aliases: ["carry distance", "carry"], min: 10, max: 400, exclude: ["side carry"] },
  { key: "total", label: "Total", aliases: ["total distance", "total"], min: 10, max: 450, exclude: ["side total"] },
  { key: "launch", label: "Launch", aliases: ["launch angle", "launch"], min: -10, max: 70 },
  { key: "spin", label: "Spin", aliases: ["spin rate", "back spin", "backspin"], min: 100, max: 16000, exclude: ["spin axis"] },
  { key: "apex", label: "Apex", aliases: ["apex height", "max height", "height", "apex"], min: 0, max: 300 },
  { key: "descent", label: "Descent", aliases: ["descent angle", "landing angle", "descent"], min: 0, max: 90 },
  { key: "spinAxis", label: "Spin axis", aliases: ["spin axis"], min: -90, max: 90 },
  { key: "faceAngle", label: "Face angle", aliases: ["face angle"], min: -45, max: 45 },
  { key: "clubPath", label: "Club path", aliases: ["club path"], min: -45, max: 45 },
  { key: "faceToPath", label: "Face to path", aliases: ["face to path", "face-to-path"], min: -45, max: 45 },
  { key: "horizontalAngle", label: "Launch direction", aliases: ["launch direction", "horizontal angle", "horiz angle"], min: -45, max: 45 },
  { key: "sideCarry", label: "Side carry", aliases: ["side carry"], min: -200, max: 200 },
  { key: "sideTotal", label: "Side total", aliases: ["side total"], min: -200, max: 200 },
  { key: "offline", label: "Offline", aliases: ["offline", "from pin"], min: -200, max: 200 },
  { key: "proximity", label: "Proximity", aliases: ["proximity", "distance to pin"], min: 0, max: 1000 },
  { key: "curve", label: "Curve", aliases: ["curve"], min: -300, max: 300 },
];

const PHOTO_METRIC_LABELS = Object.fromEntries(
  PHOTO_METRIC_SPECS.map((metric) => [metric.key, metric.label]),
) as Record<NumericShotMetric, string>;

function normalizeOcrText(value: string) {
  return value.toLowerCase().replace(/[|]/g, "i").replace(/[^a-z0-9+-]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesOcrLabel(value: string, aliases: string[]) {
  const normalized = normalizeOcrText(value);
  return aliases.some((alias) => normalized.includes(normalizeOcrText(alias)));
}

function hasAnyOcrMetricLabel(value: string) {
  return PHOTO_METRIC_SPECS.some((metric) => includesOcrLabel(value, metric.aliases));
}

function readOcrNumber(value: string, min: number, max: number) {
  const cleaned = value.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const matches = cleaned.match(/[-+]?\d+(?:[.,]\d+)?/g) ?? [];

  for (const match of matches) {
    const parsed = Number(match.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) continue;
    const compact = cleaned.replace(/\s+/g, "");
    const directionMatch = compact.match(new RegExp(`${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[°º]?(L|R)`, "i"));
    if (directionMatch?.[1]?.toUpperCase() === "L") return -Math.abs(parsed);
    if (directionMatch?.[1]?.toUpperCase() === "R") return Math.abs(parsed);
    return parsed;
  }

  return undefined;
}

function findPhotoMetric(lines: string[], metric: (typeof PHOTO_METRIC_SPECS)[number]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!includesOcrLabel(line, metric.aliases)) continue;
    if (metric.exclude?.some((label) => includesOcrLabel(line, [label]))) continue;

    const sameLineValue = readOcrNumber(line, metric.min, metric.max);
    if (sameLineValue !== undefined) return sameLineValue;

    for (let offset = 1; offset <= 2; offset += 1) {
      const nearbyLine = lines[index + offset];
      if (!nearbyLine || hasAnyOcrMetricLabel(nearbyLine)) break;
      const nearbyValue = readOcrNumber(nearbyLine, metric.min, metric.max);
      if (nearbyValue !== undefined) return nearbyValue;
    }
  }

  return undefined;
}

function parsePhotoAverageRow(tsv?: string) {
  if (!tsv) return {};
  const words = tsv.split(/\r?\n/).slice(1).flatMap((line) => {
    const columns = line.split("\t");
    if (columns[0] !== "5" || !columns[11]?.trim()) return [];
    return [{
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      text: columns[11].trim(),
    }];
  });
  const averageLabel = words.find((word) => normalizeDataLabel(word.text) === "avg");
  if (!averageLabel) return {};

  const averageY = averageLabel.top + averageLabel.height / 2;
  const rowWords = words.filter((word) =>
    Math.abs(word.top + word.height / 2 - averageY) <= Math.max(22, averageLabel.height * 2),
  );
  const headerWords = words.filter((word) => word.top < averageLabel.top && word.top > averageLabel.top - 130);
  const carryHeader = headerWords.find((word) => normalizeDataLabel(word.text).includes("carry"));
  const totalHeader = headerWords.find((word) => normalizeDataLabel(word.text).includes("total"));
  if (!carryHeader || !totalHeader) return {};

  const findColumnValue = (targetX: number, min: number, max: number) => {
    const candidates = rowWords
      .map((word) => ({
        distance: Math.abs(word.left + word.width / 2 - targetX),
        value: readOcrNumber(word.text, min, max),
      }))
      .filter((candidate): candidate is { distance: number; value: number } => candidate.value !== undefined)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 72 ? candidates[0].value : undefined;
  };
  const carryX = carryHeader.left + carryHeader.width / 2;
  const totalX = totalHeader.left + totalHeader.width / 2;
  const columnStep = Math.max(100, totalX - carryX);
  const parsed: Partial<Record<NumericShotMetric, number>> = {
    carry: findColumnValue(carryX, 10, 400),
    total: findColumnValue(totalX, 10, 450),
    ballSpeed: findColumnValue(totalX + columnStep * 1.15, 20, 250),
    launch: findColumnValue(totalX + columnStep * 2.05, -10, 70),
    apex: findColumnValue(totalX + columnStep * 3.85, 0, 300),
    horizontalAngle: findColumnValue(totalX + columnStep * 4.8, -45, 45),
  };
  const directionalWords = rowWords.filter((word) => /[LR]\b/i.test(word.text));
  const curveWord = directionalWords.find((word) => word.left > totalX + columnStep * 2.3 && word.left < totalX + columnStep * 3.7);
  if (curveWord) parsed.curve = parseCurveFeet(curveWord.text);

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [NumericShotMetric, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  ) as Partial<Record<NumericShotMetric, number>>;
}

function detectPhotoClub(text: string) {
  const normalized = normalizeOcrText(text);
  const clubPatterns: Array<[string, RegExp]> = [
    ["Driver", /\b(driver|1 wood|1w)\b/],
    ["3-Wood", /\b(3 wood|3w)\b/],
    ["5-Wood", /\b(5 wood|5w)\b/],
    ["5-Iron", /\b(5 iron|5i)\b/],
    ["6-Iron", /\b(6 iron|6i)\b/],
    ["7-Iron", /\b(7 iron|7i)\b/],
    ["8-Iron", /\b(8 iron|8i)\b/],
    ["9-Iron", /\b(9 iron|9i)\b/],
    ["PW", /\b(pitching wedge|pw)\b/],
    ["GW", /\b(gap wedge|approach wedge|gw|aw)\b/],
    ["SW", /\b(sand wedge|sw)\b/],
    ["LW", /\b(lob wedge|lw)\b/],
  ];

  return clubPatterns.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "Unknown Club";
}

function detectPhotoSimulator(text: string, fileName: string) {
  const normalized = normalizeOcrText(`${text} ${fileName}`);
  if (normalized.includes("trackman")) return "TrackMan";
  if (normalized.includes("full swing")) return "Full Swing";
  if (normalized.includes("foresight") || normalized.includes("gcquad") || normalized.includes("gc quad")) return "GCQuad";
  if (normalized.includes("skytrak") || normalized.includes("sky trak")) return "SkyTrak";
  if (normalized.includes("mevo")) return "Mevo+";
  return "Simulator photo";
}

function formatPhotoMetric(metric: NumericShotMetric, value: number | undefined) {
  if (value === undefined) return "Not found";
  if (metric === "ballSpeed" || metric === "clubSpeed") return `${value} mph`;
  if (["carry", "total", "offline", "sideCarry", "sideTotal"].includes(metric)) return `${value} yd`;
  if (metric === "proximity") return `${value} ft`;
  if (metric === "curve") return `${value} ft`;
  if (metric === "spin") return `${Math.round(value)} rpm`;
  if (["launch", "spinAxis", "descent", "horizontalAngle", "faceAngle", "clubPath", "faceToPath"].includes(metric)) {
    return `${value} deg`;
  }
  return `${value}`;
}

function formatPhotoCapturedAt(value: unknown) {
  if (typeof value === "string") {
    const dateParts = value.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})/);
    if (dateParts) return `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
  }

  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPhotoMetadataText(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

async function readPhotoMetadata(file: File): Promise<PhotoImportMetadata> {
  try {
    const exifr = (await import("exifr")).default;
    const [coordinates, rawMetadata] = await Promise.all([
      exifr.gps(file).catch(() => undefined),
      exifr.parse(file, {
        ifd0: { pick: ["ModifyDate"] },
        exif: { pick: ["DateTimeOriginal", "CreateDate"] },
        gps: false,
        xmp: true,
        iptc: true,
        mergeOutput: true,
      }).catch(() => undefined),
    ]);
    const metadata =
      rawMetadata && typeof rawMetadata === "object" ? (rawMetadata as Record<string, unknown>) : {};
    const placeParts = [
      getPhotoMetadataText(metadata, ["SubLocation", "Sublocation", "Location"]),
      getPhotoMetadataText(metadata, ["City"]),
      getPhotoMetadataText(metadata, ["ProvinceState", "State"]),
      getPhotoMetadataText(metadata, ["CountryPrimaryLocationName", "Country"]),
    ].filter((value): value is string => Boolean(value));
    const distinctPlaceParts = placeParts.filter(
      (value, index) => placeParts.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index,
    );
    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;
    const hasCoordinates =
      typeof latitude === "number" &&
      Number.isFinite(latitude) &&
      typeof longitude === "number" &&
      Number.isFinite(longitude);
    const coordinateLocation = hasCoordinates ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : undefined;

    return {
      location: distinctPlaceParts.length ? distinctPlaceParts.join(", ") : coordinateLocation,
      capturedAt: formatPhotoCapturedAt(
        metadata.DateTimeOriginal ?? metadata.CreateDate ?? metadata.DateCreated ?? metadata.ModifyDate,
      ),
      latitude: hasCoordinates ? latitude : undefined,
      longitude: hasCoordinates ? longitude : undefined,
    };
  } catch {
    return {};
  }
}

function parsePhotoOcr(text: string, fileName: string, fileIndex: number, tsv?: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsedMetrics: Partial<Record<NumericShotMetric, number>> = parsePhotoAverageRow(tsv);

  PHOTO_METRIC_SPECS.forEach((metric) => {
    const value = findPhotoMetric(lines, metric);
    if (value !== undefined) parsedMetrics[metric.key] = value;
  });

  const detectedMetrics = Object.keys(parsedMetrics) as NumericShotMetric[];
  const coreMetrics = detectedMetrics.filter((metric) =>
    ["carry", "total", "ballSpeed", "clubSpeed", "smash", "launch", "spin"].includes(metric),
  );
  if (coreMetrics.length < 2) {
    throw new Error("Only one or no shot metrics were readable. Try a sharper image cropped around the data.");
  }

  const club = detectPhotoClub(text);
  const ballSpeed = parsedMetrics.ballSpeed ?? 0;
  const clubSpeed = parsedMetrics.clubSpeed ?? 0;
  const derivedSmash = parsedMetrics.smash ?? (
    parsedMetrics.ballSpeed && parsedMetrics.clubSpeed ? parsedMetrics.ballSpeed / parsedMetrics.clubSpeed : undefined
  );
  if (derivedSmash !== undefined && !detectedMetrics.includes("smash")) detectedMetrics.push("smash");
  const offline = parsedMetrics.offline ?? parsedMetrics.sideTotal ?? parsedMetrics.sideCarry ?? 0;

  const shot: Shot = {
    id: `photo-${Date.now()}-${fileIndex}`,
    club,
    carry: round(parsedMetrics.carry ?? 0, 1),
    total: round(parsedMetrics.total ?? 0, 1),
    ballSpeed: round(ballSpeed, 1),
    clubSpeed: round(clubSpeed, 1),
    smash: round(derivedSmash ?? 0, 2),
    launch: parsedMetrics.launch ?? 0,
    spin: Math.round(parsedMetrics.spin ?? 0),
    offline,
    proximity: parsedMetrics.proximity ?? 0,
    apex: parsedMetrics.apex ?? 0,
    spinAxis: parsedMetrics.spinAxis ?? 0,
    descent: parsedMetrics.descent ?? 0,
    horizontalAngle: parsedMetrics.horizontalAngle ?? 0,
    faceAngle: parsedMetrics.faceAngle ?? 0,
    clubPath: parsedMetrics.clubPath ?? 0,
    faceToPath: parsedMetrics.faceToPath ?? 0,
    sideCarry: parsedMetrics.sideCarry ?? offline,
    sideTotal: parsedMetrics.sideTotal ?? offline,
    curve: parsedMetrics.curve ?? 0,
    shape: detectedMetrics.some((metric) => ["offline", "sideTotal", "sideCarry"].includes(metric))
      ? offline < -12 ? "Draw" : offline > 12 ? "Fade" : "Straight"
      : "Not recorded",
    detectedMetrics,
  };

  return {
    shot,
    simulator: detectPhotoSimulator(text, fileName),
  };
}

function buildImportedSession(
  shots: Shot[],
  submissionType: LastImport["submissionType"],
  simulator = DEFAULT_SIMULATOR,
  metadata: PhotoImportMetadata = {},
): Session {
  const clubNames = Array.from(new Set(shots.map((shot) => shot.club)));
  const subject = clubNames.length === 1 ? getClubDisplayName(clubNames[0]) : `${clubNames.length}-club`;
  const source =
    submissionType === "API feed"
      ? `${simulator} API`
      : submissionType === "Photo"
        ? `${simulator} Photo Scan`
        : "CSV Upload";

  return {
    id: `import-${Date.now()}`,
    title: `${subject} ${submissionType === "Photo" ? "photo" : submissionType === "API feed" ? "API" : "CSV"} import`,
    date: metadata.capturedAt ?? getTodayDateString(),
    source,
    focus: "New data",
    location: metadata.location ?? LOCATION_UNAVAILABLE,
    shots,
  };
}

function cls(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function makeCoachMessage(role: CoachMessage["role"], content: string): CoachMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function compactShot(shot: Shot) {
  return {
    club: shot.club,
    carry: getShotMetric(shot, "carry"),
    total: getShotMetric(shot, "total"),
    ballSpeed: getShotMetric(shot, "ballSpeed"),
    clubSpeed: getShotMetric(shot, "clubSpeed"),
    smash: getShotMetric(shot, "smash"),
    launch: getShotMetric(shot, "launch"),
    spin: getShotMetric(shot, "spin"),
    spinAxis: getShotMetric(shot, "spinAxis"),
    faceAngle: getShotMetric(shot, "faceAngle"),
    clubPath: getShotMetric(shot, "clubPath"),
    faceToPath: getShotMetric(shot, "faceToPath"),
    sideCarry: getShotMetric(shot, "sideCarry"),
    sideTotal: getShotMetric(shot, "sideTotal"),
    offline: getShotMetric(shot, "offline"),
    curve: getShotMetric(shot, "curve"),
    shape: shot.shape,
  };
}

function summarizeSessionForCoach(session: Session) {
  const clubs = summarizeClubs([session]);
  const available = (value: number) => Number.isFinite(value) ? value : null;
  return {
    title: session.title,
    date: session.date,
    source: session.source,
    location: session.location ?? LOCATION_UNAVAILABLE,
    focus: session.focus,
    shotCount: session.shots.length,
    clubs: clubs.map((club) => ({
      club: club.club,
      shots: club.shots,
      carry: available(club.carry),
      dispersion: available(club.dispersion),
      smash: available(club.smash),
      launch: available(club.launch),
      spin: available(club.spin),
      faceToPath: available(club.faceToPath),
      quality: available(club.quality),
    })),
  };
}

function readStoredPracticeProfile() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(PRACTICE_PROFILE_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as UserPracticeProfile) : null;
  } catch {
    return null;
  }
}

function parseStoredSessions(value: string | null) {
  if (!value) return null;

  try {
    const stored = JSON.parse(value);
    if (!Array.isArray(stored) || !stored.length) return null;
    return (stored as Session[]).map((session) => ({
      ...session,
      location:
        session.location ??
        (session.id.startsWith("import-") || session.source.includes("Upload") || session.source.includes("Photo Scan")
          ? LOCATION_UNAVAILABLE
          : undefined),
    }));
  } catch {
    return null;
  }
}

function parseStoredLastImport(value: string | null): LastImport | null {
  if (!value) return null;

  try {
    const stored = JSON.parse(value) as Partial<LastImport>;
    if (!Array.isArray(stored.shots) || !stored.shots.length) return null;

    const submissionType =
      stored.submissionType === "API feed" || stored.submissionType === "CSV / Excel" || stored.submissionType === "Photo"
        ? stored.submissionType
        : "CSV / Excel";

    return {
      date: typeof stored.date === "string" ? stored.date : getTodayDateString(),
      location:
        typeof stored.location === "string" && stored.location.trim()
          ? stored.location
          : LOCATION_UNAVAILABLE,
      simulator: typeof stored.simulator === "string" && stored.simulator.trim() ? stored.simulator : DEFAULT_SIMULATOR,
      submissionType,
      shots: stored.shots as Shot[],
    };
  } catch {
    return null;
  }
}

function readStoredSessions() {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredSessions(window.localStorage.getItem(SESSIONS_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readStoredLastImport() {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredLastImport(window.localStorage.getItem(LAST_IMPORT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeImportState(sessions: Session[], lastImport: LastImport) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    window.localStorage.setItem(LAST_IMPORT_STORAGE_KEY, JSON.stringify(lastImport));
  } catch {
    // Imports still work in the active tab when browser storage is unavailable.
  }
}

function readStoredOnboardingAnswers() {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as OnboardingAnswers) : {};
  } catch {
    return {};
  }
}

function storeOnboardingAnswers(answers: OnboardingAnswers) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // The flow remains usable even if local draft storage is blocked.
  }
}

function clearOnboardingDraft() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    // No action needed.
  }
}

function storePracticeProfile(profile: UserPracticeProfile) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(PRACTICE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Local storage can fail in private or locked-down browser contexts.
  }
}

async function readVideoLibrary(memberId?: string) {
  const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
  const response = await fetch(`/api/videos${query}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Saved videos could not be loaded.");
  }
  return (payload.videos ?? []) as VideoLibraryRecord[];
}

function videoPatchPayload(video: VideoLibraryRecord) {
  return {
    videoId: video.id,
    memberId: video.ownerId,
    title: video.title,
    description: video.description,
    coachNotes: video.coachNotes,
    coachPrivateNotes: video.coachPrivateNotes,
    userNotes: video.userNotes,
    videoType: video.type,
    focusArea: video.focusArea ?? null,
    swingType: video.swingType ?? null,
    club: video.club ?? null,
    tags: video.tags,
    sessionId: video.sessionId ?? null,
    duration: video.duration,
    lessonDate: video.lessonDate ?? null,
    publicationStatus: video.publicationStatus,
    reviewStatus: video.status,
    lessonSummary: video.lessonSummary,
    workedOn: video.workedOn,
    keyIssue: video.keyIssue,
    improvement: video.improvement,
    practiceAssignment: video.practiceAssignment,
    recommendedDrill: video.recommendedDrill,
    memberFacingNotes: video.memberFacingNotes,
  };
}

async function saveVideoRecord(video: VideoLibraryRecord) {
  const response = await fetch("/api/videos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(videoPatchPayload(video)),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "The video could not be saved.");
  }
  return payload.video as VideoLibraryRecord;
}

async function deleteVideoRecord(videoId: string) {
  const response = await fetch(`/api/videos?videoId=${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "The video could not be removed.");
  }
}

async function createVideoRecord(
  metadata: Record<string, unknown>,
  videoFile: File,
) {
  const response = await fetch("/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...metadata,
      fileName: videoFile.name,
      fileSize: videoFile.size,
      mimeType: videoFile.type,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.video) {
    throw new Error(payload.error ?? "The video upload could not be started.");
  }
  return payload.video as VideoLibraryRecord;
}

function uploadVideoAsset(
  videoId: string,
  file: File,
  asset: "video" | "thumbnail",
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "PUT",
      `/api/videos?videoId=${encodeURIComponent(videoId)}&asset=${asset}`,
    );
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-File-Size", String(file.size));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("The upload connection was interrupted."));
    request.onload = () => {
      let payload: { error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as { error?: string };
      } catch {
        // A non-JSON response is handled by the status check below.
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(payload.error ?? "The video file could not be stored."));
      }
    };
    request.send(file);
  });
}

async function finalizeVideoRecord(
  videoId: string,
  patch: Record<string, unknown>,
) {
  const response = await fetch("/api/videos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, ...patch }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.video) {
    throw new Error(payload.error ?? "The video could not be published.");
  }
  return payload.video as VideoLibraryRecord;
}

function stripVideoObjectUrl(video: VideoLibraryItem): VideoLibraryRecord {
  return { ...video };
}

function createVideoLibraryItem(record: VideoLibraryRecord): VideoLibraryItem {
  return {
    ...record,
    objectUrl: record.objectUrl ?? "",
    thumbnailObjectUrl: record.thumbnailObjectUrl,
  };
}

function getVideoPublicationStatus(video: VideoLibraryRecord): VideoPublicationStatus {
  return video.publicationStatus ?? "Published";
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement("video");
    const finish = (duration: number) => {
      URL.revokeObjectURL(objectUrl);
      media.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(0);
    media.src = objectUrl;
  });
}

function asArray(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asStringAnswer(value: string | string[] | undefined, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function inferSimExperience(simulatorGoals: string[]) {
  if (simulatorGoals.includes("New to simulators")) return "Never used one";
  if (simulatorGoals.includes("Swing data") || simulatorGoals.includes("Work on swing data")) return "Comfortable";
  if (simulatorGoals.includes("Compete with friends")) return "Use them often";
  return simulatorGoals.length ? "Tried it once or twice" : "Not specified";
}

function inferTimeAvailable(practiceRhythm: string[]) {
  if (practiceRhythm.includes("60-minute work blocks")) return "60 minutes";
  if (practiceRhythm.includes("30-minute structured sessions")) return "30 minutes";
  if (practiceRhythm.includes("15-minute tuneups")) return "15 minutes";
  return "45 minutes";
}

function inferFrequency(practiceRhythm: string[]) {
  if (practiceRhythm.includes("2-3 times per week")) return "2-3 times per week";
  if (practiceRhythm.includes("60-minute work blocks")) return "Once a week";
  return "Just when I can";
}

function inferPracticeStyle(practiceRhythm: string[]) {
  const styles = new Set<string>();
  if (practiceRhythm.includes("15-minute tuneups")) styles.add("Quick drills");
  if (practiceRhythm.includes("30-minute structured sessions") || practiceRhythm.includes("60-minute work blocks")) styles.add("Structured plans");
  if (practiceRhythm.includes("Games and challenges")) styles.add("Games/challenges");
  if (practiceRhythm.includes("Coach-guided lessons")) styles.add("Coach-guided sessions");
  if (practiceRhythm.includes("Data-driven training")) styles.add("Data-focused practice");
  if (practiceRhythm.includes("Competitive/social play")) styles.add("Competitive practice");

  return Array.from(styles).length ? Array.from(styles) : ["Structured plans"];
}

function inferExperienceStyle(practiceRhythm: string[], simulatorGoals: string[]) {
  const styles = new Set<string>();
  if (practiceRhythm.includes("Data-driven training") || simulatorGoals.includes("Swing data")) styles.add("Data-driven training");
  if (practiceRhythm.includes("Games and challenges")) styles.add("Fun and casual");
  if (practiceRhythm.includes("Competitive/social play") || simulatorGoals.includes("Compete with friends")) styles.add("Competitive challenges");
  if (simulatorGoals.includes("Junior development")) styles.add("Junior development");
  if (practiceRhythm.includes("Coach-guided lessons") || simulatorGoals.includes("Lessons")) styles.add("Lesson-based improvement");
  if (!styles.size) styles.add("Serious improvement");

  return Array.from(styles);
}

function getPracticePath(profile: Omit<UserPracticeProfile, "path">): UserPracticeProfile["path"] {
  if (profile.ageRange === "Under 13" || profile.ageRange === "13-17" || profile.skillLevel === "Junior player") {
    return "Junior";
  }

  if (
    profile.skillLevel === "Brand new" ||
    profile.skillLevel === "Beginner" ||
    profile.handicap === "I don't know" ||
    profile.handicap === "25+" ||
    profile.simExperience === "Never used one"
  ) {
    return "Beginner";
  }

  if (
    profile.skillLevel === "Competitive amateur" ||
    profile.skillLevel === "High school/college player" ||
    profile.skillLevel === "Low handicap" ||
    profile.skillLevel === "Scratch or better" ||
    profile.handicap === "5-9" ||
    profile.handicap === "0-4" ||
    profile.handicap === "Plus handicap"
  ) {
    return "Competitive";
  }

  return "Casual";
}

function buildUserPracticeProfile(answers: OnboardingAnswers): UserPracticeProfile {
  const rawAnswers = answers as OnboardingAnswers & {
    gameProfile?: string | string[];
    simulatorUse?: string | string[];
    practiceRhythm?: string | string[];
  };
  const gameProfile = typeof rawAnswers.gameProfile === "string" ? rawAnswers.gameProfile : undefined;
  const game = gameProfile ? GAME_PROFILE_MAP[gameProfile] : undefined;
  const simulatorGoals = asArray(rawAnswers.simulatorGoals ?? rawAnswers.simulatorUse);
  const practiceRhythm = asArray(rawAnswers.practiceRhythm);
  const practiceStyle = asArray(rawAnswers.practiceStyle);
  const experienceStyle = asArray(rawAnswers.experienceStyle);
  const coachNotes = typeof rawAnswers.coachNotes === "string" ? rawAnswers.coachNotes.trim() : "";
  const profileBase = {
    ageRange: typeof answers.ageRange === "string" ? answers.ageRange : undefined,
    handedness: typeof answers.handedness === "string" ? answers.handedness : undefined,
    skillLevel: asStringAnswer(rawAnswers.skillLevel, game?.skillLevel ?? "Casual golfer"),
    handicap: asStringAnswer(rawAnswers.handicap, game?.handicap ?? "I don't know"),
    simExperience: asStringAnswer(rawAnswers.simExperience, inferSimExperience(simulatorGoals)),
    simulatorGoals,
    goals: asArray(answers.goals),
    frustrations: asArray(answers.frustrations),
    practiceStyle: practiceStyle.length ? practiceStyle : inferPracticeStyle(practiceRhythm),
    timeAvailable: asStringAnswer(rawAnswers.timeAvailable, inferTimeAvailable(practiceRhythm)),
    frequency: asStringAnswer(rawAnswers.frequency, inferFrequency(practiceRhythm)),
    experienceStyle: experienceStyle.length ? experienceStyle : inferExperienceStyle(practiceRhythm, simulatorGoals),
    ...(coachNotes ? { coachNotes } : {}),
    completedAt: new Date().toISOString(),
  };

  return {
    ...profileBase,
    path: getPracticePath(profileBase),
  };
}

function buildPracticeRecommendations(profile: UserPracticeProfile): PracticeRecommendations {
  const wantsDriverAccuracy = profile.goals.includes("Driver accuracy") || profile.frustrations.includes("Slicing");
  const wantsWedges = profile.goals.includes("Wedge control") || profile.frustrations.includes("Poor wedge distance control");
  const wantsData =
    profile.experienceStyle.includes("Data-driven training") ||
    profile.practiceStyle.includes("Data-focused practice") ||
    profile.simulatorGoals.includes("Swing data") ||
    profile.simulatorGoals.includes("Work on swing data");
  const wantsLessons =
    profile.experienceStyle.includes("Lesson-based improvement") ||
    profile.practiceStyle.includes("Coach-guided sessions") ||
    profile.simulatorGoals.includes("Lessons");
  const wantsSocial =
    profile.experienceStyle.includes("Social golf") ||
    profile.experienceStyle.includes("Competitive challenges") ||
    profile.simulatorGoals.includes("Compete with friends") ||
    profile.simulatorGoals.includes("League play");

  if (profile.path === "Junior") {
    return {
      pathTitle: "Junior growth path",
      summary: "Short, energetic sessions with clear wins, skill games, and progress parents can understand.",
      focusAreas: ["Contact quality", "Start line", "Confidence", "Distance mapping"],
      drills: ["Five-ball contact challenge", "Fairway gate game", "Wedge landing-zone ladder"],
      simulatorModes: ["Closest-to-pin", "Target challenge", "Junior skills combine"],
      lessonRecommendation: "Start with a short junior evaluation and a parent-friendly progress check.",
      trainingPlan: "Two 30-minute sessions per week: warmup game, one skill block, one fun scoring challenge.",
      priorities: ["Keep swings athletic", "Reward solid contact", "Track simple milestones"],
      suggestions: ["Junior league invite", "Parent progress recap", "Gamified milestones"],
    };
  }

  if (profile.path === "Beginner") {
    return {
      pathTitle: "Beginner confidence path",
      summary: "Make the simulator less noisy, build better contact, and learn your first reliable yardages.",
      focusAreas: ["Contact quality", "Basic start line", "Simple carry numbers", "Setup consistency"],
      drills: ["Half-swing contact map", "Seven-ball start-line gate", "Three-club distance baseline"],
      simulatorModes: ["Basic range session", "Short approach challenge", "Intro distance mapping"],
      lessonRecommendation: wantsLessons
        ? "Start with a coach-guided intro lesson and leave with one simple homework drill."
        : "Book an intro lesson to set grip, posture, alignment, and a simple practice routine.",
      trainingPlan: `${profile.timeAvailable} per session focused on one contact drill, one distance drill, and one confidence finish.`,
      priorities: ["Find center contact first", "Keep face/path language simple", "Build a no-guessing practice habit"],
      suggestions: ["Simulator orientation", "Beginner practice card", "Coach check-in after three sessions"],
    };
  }

  if (profile.path === "Competitive") {
    return {
      pathTitle: "Performance path",
      summary: "Use dispersion, wedge windows, and scoring tests to find tournament-level gains.",
      focusAreas: wantsData ? ["Dispersion", "Face-to-path", "Wedge matrix", "Shot shaping"] : ["Shot shaping", "Wedge matrix", "Start line", "Scoring pressure"],
      drills: ["Nine-window shot-shape block", "Wedge matrix calibration", "Driver dispersion combine"],
      simulatorModes: ["Combine test", "Strokes-gained practice", "Randomized target ladder"],
      lessonRecommendation: "Schedule a metrics review to turn path, face, launch, and spin into one scoring priority.",
      trainingPlan: `${profile.frequency}: one technical block, one random practice block, and one scored combine.`,
      priorities: ["Tighten misses", "Pressure-test yardages", "Separate technique from scoring practice"],
      suggestions: wantsSocial
        ? ["Advanced league flight", "Monthly combine leaderboard", "Tournament prep session"]
        : ["Monthly combine leaderboard", "Tournament prep session", "Advanced metrics review"],
    };
  }

  return {
    pathTitle: "Weekend improvement path",
    summary: "A practical plan for better misses, clearer yardages, and less guessing between sessions.",
    focusAreas: [
      wantsDriverAccuracy ? "Driver accuracy" : "Ball striking",
      wantsWedges ? "Wedge control" : "Iron consistency",
      "Carry ladder",
      "Practice structure",
    ],
    drills: [
      wantsDriverAccuracy ? "Driver start-line gate" : "Impact spray contact block",
      wantsWedges ? "Three-distance wedge ladder" : "Iron carry ladder",
      "Ten-ball fairway or green challenge",
    ],
    simulatorModes: ["Distance mapping", "Target challenge", "Virtual course decision practice"],
    lessonRecommendation: wantsLessons
      ? "Pair each practice block with a quick coach checkpoint so the plan stays focused."
      : "Use one coaching session to confirm the root cause of the main miss before adding drills.",
    trainingPlan: `${profile.timeAvailable} per session with a warmup, one skill block, one game, and a short recap.`,
    priorities: ["Know your stock carry", "Reduce the big miss", "Make practice repeatable"],
    suggestions: wantsSocial
      ? ["Casual league night", "Member event recommendation", "Monthly distance refresh"]
      : ["Monthly distance refresh", "Optional coach tune-up", wantsData ? "Data review after three sessions" : "Target challenge recap"],
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sessions, setSessions] = useState<Session[]>(BASE_SESSIONS);
  const [selectedSessionId, setSelectedSessionId] = useState(BASE_SESSIONS[0].id);
  const [selectedClub, setSelectedClub] = useState("6-Iron");
  const [csvText, setCsvText] = useState(DEMO_CSV);
  const [importMessage, setImportMessage] = useState("Demo CSV loaded");
  const [importConfirmation, setImportConfirmation] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<AccountMode>("pending");
  const [workspaceRole, setWorkspaceRole] = useState<VideoViewerRole>("user");
  const [videoLibraryMemberId, setVideoLibraryMemberId] = useState("current-user");
  const [videoLibraryMemberName, setVideoLibraryMemberName] = useState("");
  const [requestedVideoId, setRequestedVideoId] = useState<string | null>(null);
  const [practiceProfile, setPracticeProfile] = useState<UserPracticeProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [lastImport, setLastImport] = useState<LastImport>(() =>
    makeLastImport("Photo", parseCsv(DEMO_CSV), DEFAULT_IMPORT_DATE, DEFAULT_SIMULATOR, DEFAULT_FACILITY_NAME),
  );
  const [userName, setUserName] = useState<string | null>(null);
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<LoginModalMode>("login");
  const [syncStatus, setSyncStatus] = useState("Choose how you want to use Free Range Golf.");

  const clubs = useMemo(() => summarizeClubs(sessions), [sessions]);
  const insights = useMemo(() => computeInsights(clubs, sessions), [clubs, sessions]);
  const allShots = useMemo(() => sessions.flatMap((session) => session.shots), [sessions]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const selectedSessionClubs = useMemo(() => summarizeClubs([selectedSession]), [selectedSession]);
  const selectedSessionInsights = useMemo(
    () => computeInsights(selectedSessionClubs, [selectedSession]),
    [selectedSessionClubs, selectedSession],
  );
  const selectedClubSummary =
    selectedSessionClubs.find((club) => club.club === selectedClub) ??
    clubs.find((club) => club.club === selectedClub) ??
    clubs[0];
  const activeClub = selectedClubSummary?.club ?? selectedClub;
  const selectedSessionHasClub = selectedSession.shots.some((shot) => shot.club === activeClub);
  const selectedClubShots = (selectedSessionHasClub ? selectedSession.shots : allShots)
    .filter((shot) => shot.club === activeClub);
  const avgCarry = selectedClubSummary?.carry ?? round(averageMetric(allShots, "carry"));
  const avgSmash = selectedClubSummary?.smash ?? round(averageMetric(allShots, "smash"), 2);
  const avgDispersion = selectedClubSummary?.dispersion ?? round(standardDeviation(metricValues(allShots, "offline")));
  const qualityValues = clubs.map((club) => club.quality).filter(Number.isFinite);
  const performanceIndex = qualityValues.length ? Math.round(average(qualityValues)) : Number.NaN;
  const ballCountLabel = `${allShots.length.toLocaleString()} ${allShots.length === 1 ? "ball" : "balls"}`;
  const topInsight = selectedSessionInsights[0];

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("tab") === "videos") {
      queueMicrotask(() => {
        setActiveTab("videos");
        setRequestedVideoId(query.get("video"));
      });
    }
  }, []);

  useEffect(() => {
    void connectAccount();
    // Authentication is checked once when the app loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedProfile = readStoredPracticeProfile();
    if (storedProfile) {
      queueMicrotask(() => {
        setPracticeProfile(storedProfile);
        setShowOnboarding(false);
      });
    }
  }, []);

  useEffect(() => {
    const applyStoredSessions = (storedSessions: Session[]) => {
      setSessions(storedSessions);
      setSelectedSessionId(storedSessions[0].id);
      setSelectedClub(storedSessions[0].shots[0]?.club ?? "6-Iron");
    };
    const storedSessions = readStoredSessions();
    const storedLastImport = readStoredLastImport();

    if (storedSessions || storedLastImport) {
      queueMicrotask(() => {
        if (storedSessions) applyStoredSessions(storedSessions);
        if (storedLastImport) setLastImport(storedLastImport);
      });
    }

    const syncImportState = (event: StorageEvent) => {
      if (event.key === SESSIONS_STORAGE_KEY) {
        const nextSessions = parseStoredSessions(event.newValue);
        if (nextSessions) applyStoredSessions(nextSessions);
      }
      if (event.key === LAST_IMPORT_STORAGE_KEY) {
        const nextLastImport = parseStoredLastImport(event.newValue);
        if (nextLastImport) setLastImport(nextLastImport);
      }
    };

    window.addEventListener("storage", syncImportState);
    return () => window.removeEventListener("storage", syncImportState);
  }, []);

  async function saveUserSessions(nextSessions: Session[]) {
    if (accountMode !== "user") return;

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: nextSessions }),
      });

      if (!response.ok) {
        setSyncStatus("Could not save this update.");
        return;
      }

      setSyncStatus("Saved to your account.");
    } catch {
      setSyncStatus("Could not save this update.");
    }
  }

  async function saveUserPracticeProfile(profile: UserPracticeProfile) {
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });

      if (!response.ok) {
        setSyncStatus("Practice profile saved locally. Sign in later to attach it.");
        return false;
      }

      setSyncStatus("Practice profile saved to your account.");
      return true;
    } catch {
      setSyncStatus("Practice profile saved locally. Account sync is unavailable right now.");
      return false;
    }
  }

  async function loadUserPracticeProfile() {
    try {
      const response = await fetch("/api/profile");
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.profile) {
        setPracticeProfile(payload.profile);
        storePracticeProfile(payload.profile);
      }
    } catch {
      // The dashboard can still run without a saved profile.
    }
  }

  async function consumeLoginFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("login");
    if (!token) return false;

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; purpose?: string; redirectPath?: string };
      const shouldResetPassword = url.searchParams.get("resetPassword") === "1" || payload.purpose === "password_reset";
      url.searchParams.delete("login");
      url.searchParams.delete("resetPassword");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      if (!response.ok) {
        setSyncStatus(payload.error ?? "This login link could not be used.");
        return false;
      }
      if (shouldResetPassword) {
        setShowPasswordResetModal(true);
        setSyncStatus("Signed in. Choose a new password to finish reset.");
        return true;
      }
      setSyncStatus("Signed in from your secure email link.");
      return true;
    } catch {
      setSyncStatus("This login link could not be used right now.");
      return false;
    }
  }

  async function acceptInvitationFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("invite");
    if (!token) return false;

    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      url.searchParams.delete("invite");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setSyncStatus(
        response.ok
          ? "Invitation accepted. Your video library is ready."
          : payload.error ?? "Invitation could not be accepted.",
      );
      return response.ok;
    } catch {
      setSyncStatus("Invitation could not be accepted right now.");
      return false;
    }
  }

  async function connectAccount(options: { promptForEmail?: boolean } = {}) {
    setSyncStatus("Checking your account...");
    try {
      await consumeLoginFromUrl();
      await acceptInvitationFromUrl();
      const [sessionsResponse, accountResponse] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/account"),
      ]);
      const payload = await sessionsResponse.json();
      const accountPayload = await accountResponse.json();
      setDevAuthEnabled(accountPayload.devAuthEnabled === true);

      if (payload.mode !== "user" || accountPayload.mode !== "user") {
        setAccountMode("guest");
        setSyncStatus("Use an email login link to open your private account.");
        if (options.promptForEmail) {
          setLoginModalMode("login");
          setShowLoginModal(true);
        }
        return false;
      }

      const savedSessions = Array.isArray(payload.sessions) && payload.sessions.length ? payload.sessions : sessions;
      const signedInRole: VideoViewerRole =
        accountPayload.user?.role === "coach" || accountPayload.user?.role === "admin"
          ? accountPayload.user.role
          : "user";
      const signedInUser = accountPayload.user as AccountUser;
      setAccountMode("user");
      setWorkspaceRole(signedInRole);
      setAccountUser(signedInUser);
      setUserName(accountPayload.user?.displayName ?? accountPayload.user?.email ?? "Signed-in golfer");
      setVideoLibraryMemberId(signedInUser.id);
      setVideoLibraryMemberName(signedInUser.displayName);
      setSessions(savedSessions);
      setSelectedSessionId(savedSessions[0]?.id ?? BASE_SESSIONS[0].id);
      setSelectedClub(savedSessions[0]?.shots?.[0]?.club ?? "6-Iron");
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(
        requestedTab === "videos"
          ? "videos"
          : signedInRole === "user"
            ? "videos"
            : "coach",
      );
      setShowOnboarding(false);
      setSyncStatus(
        signedInRole === "user"
          ? payload.sessions?.length ? "Loaded your saved sessions." : "Signed in. Your lesson video library is ready."
          : `${signedInRole === "admin" ? "Admin" : "Coach"} workspace ready.`,
      );

      await loadUserPracticeProfile();
      return true;
    } catch {
      setAccountMode("guest");
      setSyncStatus("Using guest mode. Saved history is unavailable right now.");
      if (options.promptForEmail) {
        setLoginModalMode("login");
        setShowLoginModal(true);
      }
      return false;
    }
  }

  function openSignup() {
    setShowOnboarding(false);
    setShowPasswordResetModal(false);
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus("Create your account to continue.");
  }

  async function logOut() {
    setSyncStatus("Signing out...");
    await Promise.allSettled([
      fetch("/api/auth/verify", { method: "DELETE" }),
      devAuthEnabled ? fetch("/api/dev-auth", { method: "DELETE" }) : Promise.resolve(),
    ]);
    setAccountMode("guest");
    setAccountUser(null);
    setUserName(null);
    setWorkspaceRole("user");
    setVideoLibraryMemberId("current-user");
    setVideoLibraryMemberName("");
    setRequestedVideoId(null);
    setActiveTab("videos");
    setShowOnboarding(false);
    setShowPasswordResetModal(false);
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus("Signed out. Create a new account or sign in.");
  }

  function changeWorkspaceRole(role: VideoViewerRole) {
    setWorkspaceRole(role);
    if (role === "user") setVideoLibraryMemberId("current-user");
    setSyncStatus(
      role === "user"
        ? "Member workspace"
        : role === "coach"
          ? "Coach workspace preview"
          : "Admin workspace preview",
    );
  }

  function finishOnboarding(profile: UserPracticeProfile) {
    setPracticeProfile(profile);
    storePracticeProfile(profile);
    clearOnboardingDraft();
    setShowOnboarding(false);
    setAccountMode((current) => current === "pending" ? "guest" : current);
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus("Create your account to save your practice profile.");
  }

  function importShots(
    shots: Shot[],
    submissionType: LastImport["submissionType"],
    simulator = DEFAULT_SIMULATOR,
    metadata: PhotoImportMetadata = {},
  ) {
    if (!shots.length) {
      setImportMessage("No shot data detected");
      return;
    }
    const nextSession = buildImportedSession(shots, submissionType, simulator, metadata);
    const nextSessions = [nextSession, ...sessions];
    const nextLastImport = makeLastImport(
      submissionType,
      shots,
      nextSession.date,
      simulator,
      metadata.location ?? LOCATION_UNAVAILABLE,
    );
    setSessions(nextSessions);
    setSelectedSessionId(nextSession.id);
    setSelectedClub(shots[0]?.club ?? selectedClub);
    setActiveTab("dashboard");
    setLastImport(nextLastImport);
    storeImportState(nextSessions, nextLastImport);
    const importedClubNames = Array.from(new Set(shots.map((shot) => getClubDisplayName(shot.club))));
    const clubLabel = importedClubNames.length === 1 ? importedClubNames[0] : `${importedClubNames.length} clubs`;
    const successMessage =
      `${shots.length} ${clubLabel} ${shots.length === 1 ? "shot" : "shots"} successfully uploaded and analyzed. ` +
      `Location: ${nextSession.location ?? LOCATION_UNAVAILABLE}. Missing metrics display as NA.`;
    setImportMessage(successMessage);
    setImportConfirmation(successMessage);
    void saveUserSessions(nextSessions);
  }

  function importCsv(submissionType: LastImport["submissionType"] = "CSV / Excel") {
    importShots(parseCsv(csvText), submissionType, "CSV");
  }

  const accountRoleLabel =
    accountUser?.role === "coach"
      ? "Coach"
      : accountUser?.role === "admin"
        ? "Admin"
        : "Player";
  const accountStatusLabel = accountMode === "user" ? `Logged In ${accountRoleLabel}:` : "Guest";
  const accountStatusName = accountMode === "user" ? userName ?? accountUser?.displayName ?? "Signed-in user" : "Not signed in";

  if (showOnboarding) {
    return (
      <OnboardingFlow
        initialProfile={practiceProfile}
        onRegister={finishOnboarding}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Free Range Golf navigation">
        <div className="brand-lockup">
          <div className="brand-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Free Range Golf logo" src="/logos/free-range-golf.png" />
          </div>
          <div>
            <strong>Free Range Golf</strong>
            <span>Sim performance</span>
          </div>
        </div>
        <div className={cls("rail-account-status", accountMode)}>
          <span>{accountStatusLabel}</span>
          <strong>{accountStatusName}</strong>
          {accountMode === "user" ? (
            <button onClick={() => void logOut()} type="button">
              Log out
            </button>
          ) : (
            <button onClick={openSignup} type="button">
              Sign up
            </button>
          )}
        </div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => (
            <button
              className={cls("rail-button", activeTab === item.id && "active")}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span>Total Balls Struck</span>
          <strong>{ballCountLabel}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">June performance review</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeTab)?.label}</h1>
            <p className="page-description">{PAGE_DESCRIPTIONS[activeTab]}</p>
          </div>
          <div className="topbar-actions" aria-label="Session controls">
            {accountMode !== "user" && (
              <div className="workspace-role-switcher" aria-label="Workspace preview role">
                <span>Workspace preview</span>
                <div>
                  <button className={workspaceRole === "user" ? "active" : ""} onClick={() => changeWorkspaceRole("user")}>Member</button>
                  <button className={workspaceRole === "coach" ? "active" : ""} onClick={() => changeWorkspaceRole("coach")}>Coach</button>
                  <button className={workspaceRole === "admin" ? "active" : ""} onClick={() => changeWorkspaceRole("admin")}>Admin</button>
                </div>
              </div>
            )}
            <div className={cls("account-pill", accountMode)}>
              <span>{accountMode === "user" ? "Saved" : accountMode === "guest" ? "Guest" : "Not set"}</span>
              <strong>{accountMode === "user" ? userName : syncStatus}</strong>
            </div>
            {accountMode !== "user" && (
              <button
                className="secondary-action"
                onClick={() => {
                  setShowPasswordResetModal(false);
                  setLoginModalMode("login");
                  void connectAccount({ promptForEmail: true });
                }}
              >
                Log in
              </button>
            )}
            <button className="icon-button" title="Refresh analysis" onClick={() => setSessions([...sessions])}>
              ↻
            </button>
            <button className="primary-action" onClick={() => setActiveTab("import")}>
              <span>⇧</span>
              Import
            </button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <DashboardView
            avgCarry={avgCarry}
            avgDispersion={avgDispersion}
            avgSmash={avgSmash}
            clubs={clubs}
            insights={selectedSessionInsights}
            performanceIndex={performanceIndex}
            selectedClub={activeClub}
            selectedClubShots={selectedClubShots}
            selectedClubSummary={selectedClubSummary}
            selectedSession={selectedSession}
            sessions={sessions}
            shots={allShots}
            topInsight={topInsight}
            setActiveTab={setActiveTab}
            setSelectedClub={setSelectedClub}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsView
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
            setActiveTab={setActiveTab}
            setSelectedClub={setSelectedClub}
            setSelectedSessionId={setSelectedSessionId}
          />
        )}

        {activeTab === "clubs" && <ClubsView clubs={clubs} selectedClub={activeClub} />}

        {activeTab === "videos" && (
          <VideosView
            key={`${workspaceRole}-${workspaceRole === "user" ? accountUser?.id ?? "current-user" : videoLibraryMemberId}`}
            authenticated={accountMode === "user"}
            ownerId={workspaceRole === "user" ? accountUser?.id ?? "current-user" : videoLibraryMemberId}
            ownerName={workspaceRole === "user" ? accountUser?.displayName : videoLibraryMemberName}
            requestedVideoId={requestedVideoId}
            sessions={sessions}
            viewerRole={workspaceRole}
          />
        )}

        {activeTab === "coach" && (
          <CoachView
            clubs={clubs}
            insights={selectedSessionInsights}
            selectedClub={activeClub}
            selectedClubShots={selectedClubShots}
            selectedClubSummary={selectedClubSummary}
            selectedSession={selectedSession}
            sessions={sessions}
            viewerRole={workspaceRole}
            coachName={accountUser?.displayName ?? userName ?? "Coach"}
            authenticated={accountMode === "user"}
            devAuthEnabled={devAuthEnabled}
            onOpenMemberVideos={(memberId, memberName) => {
              setVideoLibraryMemberId(memberId);
              setVideoLibraryMemberName(memberName);
              setActiveTab("videos");
            }}
            onRequestCoachAccess={() => changeWorkspaceRole("coach")}
          />
        )}

        {activeTab === "practice" && <PracticeView insights={insights} />}

        {activeTab === "import" && (
          <ImportView
            csvText={csvText}
            importCsv={importCsv}
            importPhotoShots={(shots, simulator, metadata) => importShots(shots, "Photo", simulator, metadata)}
            importMessage={importMessage}
            lastImport={lastImport}
            setCsvText={setCsvText}
          />
        )}
      </section>

      {accountMode === "pending" && (
        <AccountGate
          connectAccount={() => {
            setShowPasswordResetModal(false);
            setLoginModalMode("login");
            return connectAccount({ promptForEmail: true });
          }}
          createAccount={() => {
            setShowPasswordResetModal(false);
            setLoginModalMode("register");
            setShowLoginModal(true);
          }}
          syncStatus={syncStatus}
        />
      )}

      {showLoginModal && (
        <LoginRequestModal
          initialMode={loginModalMode}
          onAuthenticated={() => connectAccount()}
          onClose={() => setShowLoginModal(false)}
          onStatus={setSyncStatus}
        />
      )}

      {showPasswordResetModal && (
        <PasswordResetModal
          onClose={() => setShowPasswordResetModal(false)}
          onStatus={setSyncStatus}
        />
      )}

      {importConfirmation && (
        <div className="import-confirmation" role="status">
          <div>
            <strong>Upload complete</strong>
            <span>{importConfirmation}</span>
          </div>
          <button aria-label="Dismiss upload confirmation" onClick={() => setImportConfirmation(null)}>×</button>
        </div>
      )}
    </main>
  );
}

function DashboardView({
  avgCarry,
  avgDispersion,
  avgSmash,
  clubs,
  insights,
  performanceIndex,
  selectedClub,
  selectedClubShots,
  selectedClubSummary,
  selectedSession,
  sessions,
  setActiveTab,
  setSelectedClub,
  shots,
  topInsight,
}: {
  avgCarry: number;
  avgDispersion: number;
  avgSmash: number;
  clubs: ClubSummary[];
  insights: Insight[];
  performanceIndex: number;
  selectedClub: string;
  selectedClubShots: Shot[];
  selectedClubSummary?: ClubSummary;
  selectedSession: Session;
  sessions: Session[];
  shots: Shot[];
  topInsight?: Insight;
  setActiveTab: (tab: Tab) => void;
  setSelectedClub: (club: string) => void;
}) {
  const selectedClubLabel = getClubDisplayName(selectedClub);

  return (
    <div className="view-stack">
      <section className="control-strip">
        <div>
          <p className="eyebrow">Club selection</p>
          <h2>{selectedClubLabel} view</h2>
          <span>{selectedClubShots.length} shots matched to this club</span>
        </div>
        <label className="select-control">
          <span>Club</span>
          <select value={selectedClub} onChange={(event) => setSelectedClub(event.target.value)}>
            {clubs.map((club) => (
              <option key={club.club} value={club.club}>
                {getClubDisplayName(club.club)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="metric-grid">
        <Kpi club={selectedClub} label="Performance index" metricKey="quality" value={selectedClubSummary?.quality ?? performanceIndex} unit="/100" tone="green" />
        <Kpi club={selectedClub} label="Average carry" metricKey="carry" value={avgCarry} unit="yd" tone="blue" />
        <Kpi club={selectedClub} label="Shot dispersion" metricKey="dispersion" value={Number.isFinite(avgDispersion) ? `±${avgDispersion}` : "NA"} unit="yd" tone="amber" />
        <Kpi club={selectedClub} label="Smash factor" metricKey="smash" value={Number.isFinite(avgSmash) ? avgSmash.toFixed(2) : "NA"} unit="avg" tone="coral" />
      </section>

      {selectedClubSummary && (
        <section className="metric-grid detail-grid">
          <Kpi club={selectedClub} label="Ball speed" metricKey="ballSpeed" value={selectedClubSummary.ballSpeed} unit="mph" tone="blue" />
          <Kpi club={selectedClub} label="Club speed" metricKey="clubSpeed" value={selectedClubSummary.clubSpeed} unit="mph" tone="green" />
          <Kpi club={selectedClub} label="Total distance" metricKey="total" value={selectedClubSummary.total} unit="yd" tone="amber" />
          <Kpi club={selectedClub} label="Apex height" metricKey="apex" value={selectedClubSummary.apex} unit="ft" tone="blue" />
          <Kpi club={selectedClub} label="Spin rate" metricKey="spin" value={selectedClubSummary.spin} unit="rpm" tone="coral" />
          <Kpi club={selectedClub} label="Launch angle" metricKey="launch" value={selectedClubSummary.launch} unit="deg" tone="green" />
          <Kpi club={selectedClub} label="Descent angle" metricKey="descent" value={selectedClubSummary.descent} unit="deg" tone="amber" />
          <Kpi club={selectedClub} label="Face to path" metricKey="faceToPath" value={selectedClubSummary.faceToPath} unit="deg" tone="coral" />
        </section>
      )}

      <section className="dashboard-grid comparison-grid">
        <article className="panel">
          <PanelHeader kicker="Selected club detail" title={`${selectedClubLabel} delivery`} meta="Available session data" />
          <MetricMatrix summary={selectedClubSummary} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Benchmark guide" title={`${selectedClubLabel} windows`} meta="Hover cards use these targets" />
          <BenchmarkList club={selectedClub} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Pro comparison" title={`${selectedClubLabel} tour stats`} meta="PGA + LPGA reference" />
          <ProStatsList club={selectedClub} />
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <PanelHeader
            kicker="Shot pattern"
            title={selectedSession.title}
            meta={`${formatDate(selectedSession.date)} · ${selectedSession.source}${selectedSession.location ? ` · ${selectedSession.location}` : ""}`}
            action={<button className="text-button" onClick={() => setActiveTab("sessions")}>Sessions</button>}
          />
          <ShotMap shots={selectedSession.shots} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Coach priority" title={topInsight ? getClubDisplayName(topInsight.club) : "All clubs"} meta={topInsight?.metric ?? "No urgent flags"} />
          {topInsight ? (
            <div className="priority-card">
              <span className={cls("severity-dot", topInsight.severity)} />
              <h3>{topInsight.title}</h3>
              <dl>
                <div>
                  <dt>Current</dt>
                  <dd>{topInsight.value}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{topInsight.target}</dd>
                </div>
              </dl>
              <p>{topInsight.action}</p>
            </div>
          ) : (
            <EmptyState title="No major coaching flags" body="The current data set is inside the working windows." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Club ladder" title="Carry gaps" meta={`${clubs.length} clubs tracked`} />
          <GapLadder clubs={clubs} />
        </article>

        <article className="panel panel-large">
          <PanelHeader kicker="Trend line" title="Session quality" meta={`${sessions.length} sessions`} />
          <TrendChart sessions={sessions} />
        </article>

        <article className="panel">
          <PanelHeader kicker="Insights" title="Active flags" meta={`${insights.length} coaching notes`} />
          <InsightList insights={insights.slice(0, 4)} compact />
        </article>

        <article className="panel">
          <PanelHeader kicker="Bag profile" title="Club quality" meta={`${shots.length} shots`} />
          <QualityBars clubs={clubs.slice(0, 6)} />
        </article>
      </section>
    </div>
  );
}

function SessionsView({
  selectedSession,
  selectedSessionId,
  sessions,
  setActiveTab,
  setSelectedClub,
  setSelectedSessionId,
}: {
  selectedSession: Session;
  selectedSessionId: string;
  sessions: Session[];
  setActiveTab: (tab: Tab) => void;
  setSelectedClub: (club: string) => void;
  setSelectedSessionId: (id: string) => void;
}) {
  const selectedClubs = summarizeClubs([selectedSession]);

  return (
    <section className="split-view">
      <div className="panel">
        <PanelHeader kicker="Session log" title="Recent sim work" meta={`${sessions.length} sessions`} />
        <div className="session-list">
          {sessions.map((session) => {
            const sessionShots = session.shots;
            const carry = averageMetric(sessionShots, "carry");
            const dispersion = standardDeviation(metricValues(sessionShots, "offline"));
            return (
              <button
                className={cls("session-row", session.id === selectedSessionId && "active")}
                key={session.id}
                onClick={() => {
                  setSelectedSessionId(session.id);
                  if (session.shots[0]?.club) setSelectedClub(session.shots[0].club);
                }}
              >
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {formatDate(session.date)} · {session.source}
                    {session.location ? ` · ${session.location}` : ""}
                  </small>
                </span>
                <span className="row-metric">{formatAvailableMetric(carry, "yd")}</span>
                <span className="row-metric">{Number.isFinite(dispersion) ? `±${round(dispersion)}` : "NA"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel panel-large">
        <PanelHeader
          kicker={selectedSession.focus}
          title={selectedSession.title}
          meta={`${selectedSession.shots.length} shots · ${selectedSession.source}${selectedSession.location ? ` · ${selectedSession.location}` : ""}`}
          action={<button className="text-button" onClick={() => setActiveTab("coach")}>Coach notes</button>}
        />
        <ShotMap shots={selectedSession.shots} />
        <div className="club-table compact-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Total</span>
            <span>Ball speed</span>
            <span>Launch</span>
            <span>Apex</span>
            <span>Curve</span>
            <span>Dispersion</span>
            <span>Smash</span>
          </div>
          {selectedClubs.map((club) => (
            <div className="table-row" key={club.club}>
              <span>{getClubDisplayName(club.club)}</span>
              <span>{club.shots}</span>
              <span>{formatAvailableMetric(club.carry, "yd")}</span>
              <span>{formatAvailableMetric(club.total, "yd")}</span>
              <span>{formatAvailableMetric(club.ballSpeed, "mph")}</span>
              <span>{formatAvailableMetric(club.launch, "deg")}</span>
              <span>{formatAvailableMetric(club.apex, "ft")}</span>
              <span>{formatAvailableMetric(club.curve, "ft")}</span>
              <span>{Number.isFinite(club.dispersion) ? `±${club.dispersion}` : "NA"}</span>
              <span>{formatAvailableMetric(club.smash, "", 2)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsView({ clubs, selectedClub }: { clubs: ClubSummary[]; selectedClub: string }) {
  const [clubMetricKey, setClubMetricKey] = useState<ClubMetricKey>("total");
  const metric = getClubMetricConfig(clubMetricKey);

  return (
    <div className="view-stack">
      <section className="control-strip">
        <div>
          <p className="eyebrow">Club comparison</p>
          <h2>Bag benchmarks</h2>
          <span>Choose a data point below to compare your clubs against amateur and professional benchmarks.</span>
        </div>
      </section>

      <section className="panel">
        <PanelHeader kicker="Bag map" title="Club-by-club performance" meta={`${clubs.length} active clubs`} />
        <div className="club-table">
          <div className="table-row table-head">
            <span>Club</span>
            <span>Shots</span>
            <span>Carry</span>
            <span>Total</span>
            <span>Gap</span>
            <span>Ball speed</span>
            <span>Club speed</span>
            <span>Dispersion</span>
            <span>Launch</span>
            <span>Apex</span>
            <span>Curve</span>
            <span>Launch dir.</span>
            <span>Spin</span>
            <span>Quality</span>
          </div>
          {clubs.map((club, index) => {
            const nextClub = clubs[index + 1];
            const gap = nextClub && Number.isFinite(club.carry) && Number.isFinite(nextClub.carry)
              ? round(club.carry - nextClub.carry)
              : Number.NaN;
            return (
              <div className={cls("table-row", club.club === selectedClub && "selected-row")} key={club.club}>
                <span>{getClubDisplayName(club.club)}</span>
                <span>{club.shots}</span>
                <span>{formatAvailableMetric(club.carry, "yd")}</span>
                <span>{formatAvailableMetric(club.total, "yd")}</span>
                <span className={cls(Number.isFinite(gap) && (gap < 8 || gap > 18) && "warning-text")}>
                  {formatAvailableMetric(gap, "yd")}
                </span>
                <span>{formatAvailableMetric(club.ballSpeed, "mph")}</span>
                <span>{formatAvailableMetric(club.clubSpeed, "mph")}</span>
                <span>{Number.isFinite(club.dispersion) ? `±${club.dispersion}` : "NA"}</span>
                <span>{formatAvailableMetric(club.launch, "deg")}</span>
                <span>{formatAvailableMetric(club.apex, "ft")}</span>
                <span>{formatAvailableMetric(club.curve, "ft")}</span>
                <span>{formatAvailableMetric(club.horizontalAngle, "deg")}</span>
                <span>{formatAvailableMetric(club.spin, "rpm", 0)}</span>
                <span>
                  <QualityPill score={club.quality} />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="club-comparison-grid">
        <article className="panel">
          <PanelHeader
            action={
              <label className="select-control metric-panel-select">
                <span>Data point</span>
                <select value={clubMetricKey} onChange={(event) => setClubMetricKey(event.target.value as ClubMetricKey)}>
                  {CLUB_METRIC_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            }
            kicker="Your data"
            title={`${metric.label} by club`}
            meta="Driver through wedges"
          />
          <ClubMetricUserTable clubs={clubs} metric={metric} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Typical amateur stats" title="Handicap benchmarks" meta="Low, mid, and high handicap" />
          <AmateurMetricTable clubs={clubs} metric={metric} />
        </article>
        <article className="panel">
          <PanelHeader kicker="Professional stats" title="Tour benchmarks" meta="PGA + LPGA reference" />
          <ProfessionalMetricTable clubs={clubs} metric={metric} />
        </article>
      </section>
    </div>
  );
}

function ClubMetricUserTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  const availableValues = clubs.map((club) => getClubMetricValue(club, metric.key)).filter(Number.isFinite);
  const maxValue = Math.max(...availableValues, 1);

  return (
    <div className="metric-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        <span>Your {metric.shortLabel}</span>
        <span>Vs mid HCP</span>
      </div>
      {clubs.map((club) => {
        const value = getClubMetricValue(club, metric.key);
        const midBenchmark = getAmateurMetricValue(club.club, metric.key, "mid");
        const delta = value - midBenchmark;
        const deltaLabel = Number.isFinite(delta)
          ? `${delta >= 0 ? "+" : ""}${formatClubMetricValue(delta, metric)}`
          : "NA";

        return (
          <div className="metric-table-row metric-user-row" key={club.club}>
            <span>{getClubDisplayName(club.club)}</span>
            <span>
              <strong>{formatClubMetricValue(value, metric)}</strong>
              {Number.isFinite(value) && <i style={{ width: `${Math.max(8, (value / maxValue) * 100)}%` }} />}
            </span>
            <span className={cls("metric-delta", Number.isFinite(delta) && (delta >= 0 ? "positive" : "negative"))}>{deltaLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function AmateurMetricTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  const tiers: Array<{ key: "low" | "mid" | "high"; label: string }> = [
    { key: "low", label: "0-5" },
    { key: "mid", label: "6-15" },
    { key: "high", label: "16+" },
  ];

  return (
    <div className="metric-table comparison-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        {tiers.map((tier) => (
          <span key={tier.key}>{tier.label}</span>
        ))}
      </div>
      {clubs.map((club) => (
        <div className="metric-table-row" key={club.club}>
          <span>{getClubDisplayName(club.club)}</span>
          {tiers.map((tier) => (
            <span key={tier.key}>{formatClubMetricValue(getAmateurMetricValue(club.club, metric.key, tier.key), metric)}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProfessionalMetricTable({ clubs, metric }: { clubs: ClubSummary[]; metric: ClubMetricConfig }) {
  return (
    <div className="metric-table comparison-table pro-comparison-table">
      <div className="metric-table-row metric-table-head">
        <span>Club</span>
        <span>PGA</span>
        <span>LPGA</span>
      </div>
      {clubs.map((club) => {
        const reference = PRO_REFERENCE_STATS[club.club];
        return (
          <div className="metric-table-row" key={club.club}>
            <span>{getClubDisplayName(club.club)}</span>
            <span>{reference ? formatClubMetricValue(getReferenceMetricValue(reference.pga, metric.key), metric) : "NA"}</span>
            <span>{reference ? formatClubMetricValue(getReferenceMetricValue(reference.lpga, metric.key), metric) : "NA"}</span>
          </div>
        );
      })}
    </div>
  );
}

function CoachView({
  authenticated,
  clubs,
  coachName,
  devAuthEnabled,
  insights,
  onOpenMemberVideos,
  onRequestCoachAccess,
  selectedClub,
  selectedClubShots,
  selectedClubSummary,
  selectedSession,
  sessions,
  viewerRole,
}: {
  authenticated: boolean;
  clubs: ClubSummary[];
  coachName: string;
  devAuthEnabled: boolean;
  insights: Insight[];
  onOpenMemberVideos: (memberId: string, memberName: string) => void;
  onRequestCoachAccess: () => void;
  selectedClub: string;
  selectedClubShots: Shot[];
  selectedClubSummary?: ClubSummary;
  selectedSession: Session;
  sessions: Session[];
  viewerRole: VideoViewerRole;
}) {
  const selectedClubLabel = getClubDisplayName(selectedClub);
  const [coachSection, setCoachSection] = useState<"assistant" | "video-tools">(
    viewerRole === "user" ? "assistant" : "video-tools",
  );
  const [coachInput, setCoachInput] = useState("");
  const [coachStatus, setCoachStatus] = useState("Ready");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    makeCoachMessage(
      "assistant",
      "I’m MatRat AI. Pick a club or ask what to fix first, and I’ll turn the numbers into one clear swing priority, one drill, and one next-swing feel.",
    ),
  ]);

  const quickPrompts = [
    `What should I fix first with my ${selectedClubLabel}?`,
    "Explain my face-to-path in plain English.",
    "Give me one drill for my next practice block.",
    "Am I losing more distance or control?",
  ];

  const selectedSessionShots = selectedSession.shots
    .filter((shot) => shot.club === selectedClub)
    .slice(-18);
  const contextShots = selectedSessionShots.length ? selectedSessionShots : selectedClubShots.slice(-18);

  async function askCoach(questionOverride?: string) {
    const question = (questionOverride ?? coachInput).trim();
    if (!question) return;

    const nextMessages = [...coachMessages, makeCoachMessage("user", question)];
    setCoachMessages(nextMessages);
    setCoachInput("");
    setCoachStatus("Reading your session...");

    const coachContext = {
      selectedClub,
      selectedClubSummary,
      selectedSession: summarizeSessionForCoach(selectedSession),
      recentSessions: sessions.slice(0, 5).map(summarizeSessionForCoach),
      bagSummary: clubs,
      activeFindings: insights.slice(0, 6),
      recentShots: contextShots.map(compactShot),
      coachPreferences: {
        brand: "MatRat AI",
        feedbackStyle: "plain English, focused, feel-based, no swing overhaul",
        outputGoal: "one priority, one drill, one measurable target, one follow-up question when useful",
      },
    };

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          messages: nextMessages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
          context: coachContext,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "MatRat AI could not answer right now.");
      }

      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", payload.answer ?? "MatRat AI did not return a readable answer."),
      ]);
      setCoachStatus(payload.mode === "setup" ? "API key needed" : "Answered");
    } catch (error) {
      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", error instanceof Error ? error.message : "MatRat AI could not answer right now."),
      ]);
      setCoachStatus("Needs attention");
    }
  }

  return (
    <section className="view-stack">
      <header className="coach-workspace-header">
        <div>
          <p className="eyebrow">{viewerRole === "admin" ? "Admin workspace" : "Coach workspace"}</p>
          <h2>
            {coachSection === "assistant"
              ? "Player analysis"
              : viewerRole === "admin"
                ? "Lesson delivery operations"
                : "Lesson video delivery"}
          </h2>
          <p className="coach-workspace-description">
            {coachSection === "assistant"
              ? "Translate launch data into one clear priority, drill, and measurable target."
              : "Deliver lesson videos, connect sessions, and send players clear next steps."}
          </p>
        </div>
        <div className="segmented-control coach-section-control" aria-label="Coach workspace section">
          <button className={coachSection === "assistant" ? "active" : ""} onClick={() => setCoachSection("assistant")}>AI Coach</button>
          <button className={coachSection === "video-tools" ? "active" : ""} onClick={() => setCoachSection("video-tools")}>Coach Tools</button>
        </div>
      </header>

      {coachSection === "video-tools" ? (
        viewerRole === "user" ? (
          <section className="panel coach-access-panel">
            <span className="coach-access-icon" aria-hidden="true">▶</span>
            <p className="eyebrow">Coach access required</p>
            <h3>Upload lesson videos for members</h3>
            <p>Open the coach workspace to select a member, attach session data, add feedback, and publish a lesson recap.</p>
            <button className="primary-action" onClick={onRequestCoachAccess}>Open Coach Workspace</button>
          </section>
        ) : (
          <CoachVideoWorkspace
            authenticated={authenticated}
            coachName={coachName}
            devAuthEnabled={devAuthEnabled}
            onOpenMemberVideos={onOpenMemberVideos}
            sessions={sessions}
            viewerRole={viewerRole}
          />
        )
      ) : (
        <section className="coach-layout">
          <article className="panel coach-chat-panel">
        <PanelHeader kicker="MatRat AI coach" title={`${selectedClubLabel} conversation`} meta={coachStatus} />

        <div className="chat-transcript" aria-live="polite">
          {coachMessages.map((message) => (
            <div className={cls("chat-message", message.role)} key={message.id}>
              <span>{message.role === "assistant" ? "MatRat AI" : "You"}</span>
              <p>{message.content}</p>
            </div>
          ))}
        </div>

        <div className="quick-prompt-row" aria-label="Coach question shortcuts">
          {quickPrompts.map((prompt) => (
            <button className="quick-prompt" key={prompt} onClick={() => void askCoach(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="coach-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void askCoach();
          }}
        >
          <textarea
            aria-label="Ask MatRat AI"
            onChange={(event) => setCoachInput(event.target.value)}
            placeholder={`Ask about your ${selectedClubLabel} misses, distance gaps, or next drill`}
            value={coachInput}
          />
          <button className="primary-action" type="submit">
            Ask coach
          </button>
        </form>
          </article>

          <aside className="coach-side-panel">
        <article className="panel">
          <PanelHeader kicker="Context sent" title={selectedClubLabel} meta={`${contextShots.length} recent shots`} />
          {selectedClubSummary ? (
            <div className="coach-context-grid">
              <div>
                <span>Carry</span>
                <strong>{formatAvailableMetric(selectedClubSummary.carry, "yd")}</strong>
              </div>
              <div>
                <span>Smash</span>
                <strong>{formatAvailableMetric(selectedClubSummary.smash, "", 2)}</strong>
              </div>
              <div>
                <span>Face to path</span>
                <strong>{formatAvailableMetric(selectedClubSummary.faceToPath, "deg")}</strong>
              </div>
              <div>
                <span>Dispersion</span>
                <strong>{Number.isFinite(selectedClubSummary.dispersion) ? `±${selectedClubSummary.dispersion} yd` : "NA"}</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="No club data" body="Choose a club with shots before asking MatRat AI." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Active findings" title="What MatRat sees" meta={`${insights.length} flags`} />
          <InsightList insights={insights.slice(0, 3)} compact />
        </article>
          </aside>
        </section>
      )}
    </section>
  );
}

function getSessionPrimaryClub(session: Session) {
  const clubCounts = session.shots.reduce<Record<string, number>>((counts, shot) => {
    counts[shot.club] = (counts[shot.club] ?? 0) + 1;
    return counts;
  }, {});
  return Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function CoachVideoWorkspace({
  authenticated,
  coachName,
  devAuthEnabled,
  onOpenMemberVideos,
  sessions,
  viewerRole,
}: {
  authenticated: boolean;
  coachName: string;
  devAuthEnabled: boolean;
  onOpenMemberVideos: (memberId: string, memberName: string) => void;
  sessions: Session[];
  viewerRole: Exclude<VideoViewerRole, "user">;
}) {
  const [members, setMembers] = useState<CoachMember[]>([]);
  const [videos, setVideos] = useState<VideoLibraryItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSaveState, setMemberSaveState] = useState<"idle" | "saving">("idle");
  const [demoSeedState, setDemoSeedState] = useState<"idle" | "saving">("idle");
  const [newMember, setNewMember] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    skillLevel: "",
    notes: "",
  });
  const [step, setStep] = useState(1);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoType, setVideoType] = useState<VideoType>("Lesson Recap");
  const [lessonDate, setLessonDate] = useState(getTodayDateString());
  const [focusArea, setFocusArea] = useState<VideoFocusArea>("Irons");
  const [videoDescription, setVideoDescription] = useState("");
  const [tags, setTags] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [lessonSummary, setLessonSummary] = useState("");
  const [workedOn, setWorkedOn] = useState("");
  const [keyIssue, setKeyIssue] = useState("");
  const [improvement, setImprovement] = useState("");
  const [practiceAssignment, setPracticeAssignment] = useState("");
  const [recommendedDrill, setRecommendedDrill] = useState("");
  const [memberFacingNotes, setMemberFacingNotes] = useState("");
  const [coachPrivateNotes, setCoachPrivateNotes] = useState("");
  const [emailMember, setEmailMember] = useState(true);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workspaceMessage, setWorkspaceMessage] = useState("Select a member to begin.");
  const allowedMembers = members;
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const memberResults = allowedMembers.filter((member) =>
    !normalizedMemberSearch ||
    [member.name, member.email, member.phone].some((value) => value.toLowerCase().includes(normalizedMemberSearch)),
  );
  const selectedMember = allowedMembers.find((member) => member.id === selectedMemberId);
  // Cross-account session sharing is not available yet, so coach uploads stay
  // standalone until a real member-session relationship exists in D1.
  const selectedMemberSessions: Session[] = [];
  const selectedSession = selectedMemberSessions.find((session) => session.id === selectedSessionId);
  const managedVideos = [...videos]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const editingVideo = videos.find((video) => video.id === editingVideoId);

  useEffect(() => {
    let cancelled = false;
    if (!authenticated) {
      queueMicrotask(() => {
        setWorkspaceMessage("Log in with a coach or admin account to manage lesson videos.");
        setLoadingMembers(false);
        setLoadingVideos(false);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      readVideoLibrary(),
      fetch("/api/members", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Members could not be loaded.");
        return (payload.members ?? []) as CoachMember[];
      }),
    ])
      .then(([records, loadedMembers]) => {
        if (cancelled) return;
        const items = records.map((record) => createVideoLibraryItem(record));
        setVideos(items);
        setMembers(loadedMembers);
        setWorkspaceMessage(
          loadedMembers.length
            ? `${loadedMembers.length} ${loadedMembers.length === 1 ? "member" : "members"} ready.`
            : "Add your first member to begin.",
        );
      })
      .catch((error) => {
        if (!cancelled) setWorkspaceMessage(error instanceof Error ? error.message : "Video storage is unavailable.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMembers(false);
          setLoadingVideos(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  function resetWorkflow() {
    setStep(1);
    setMemberSearch("");
    setSelectedMemberId("");
    setVideoFile(null);
    setThumbnailFile(null);
    setVideoTitle("");
    setVideoType("Lesson Recap");
    setLessonDate(getTodayDateString());
    setFocusArea("Irons");
    setVideoDescription("");
    setTags("");
    setSelectedSessionId("");
    setLessonSummary("");
    setWorkedOn("");
    setKeyIssue("");
    setImprovement("");
    setPracticeAssignment("");
    setRecommendedDrill("");
    setMemberFacingNotes("");
    setCoachPrivateNotes("");
    setEmailMember(true);
    setEditingVideoId(null);
    setUploadProgress(0);
  }

  function chooseMember(member: CoachMember) {
    setSelectedMemberId(member.id);
    setSelectedSessionId("");
    setWorkspaceMessage(`${member.name} selected. Add the lesson video when ready.`);
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberSaveState("saving");
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMember),
      });
      const payload = await response.json();
      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "The member could not be added.");
      }
      const member = payload.member as CoachMember;
      setMembers((current) => [
        member,
        ...current.filter((item) => item.id !== member.id),
      ]);
      setSelectedMemberId(member.id);
      setShowAddMember(false);
      setNewMember({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        skillLevel: "",
        notes: "",
      });
      setWorkspaceMessage(
        payload.invite?.status === "sent"
          ? `${member.name} was added and invited by email.`
          : `${member.name} was added. The login invitation is pending email configuration.`,
      );
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The member could not be added.");
    } finally {
      setMemberSaveState("idle");
    }
  }

  async function addDemoPlayer() {
    if (!authenticated) {
      setWorkspaceMessage("Log in as a coach or admin before adding a demo player.");
      return;
    }
    setDemoSeedState("saving");
    try {
      const response = await fetch("/api/demo/player", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        member?: CoachMember;
        publicMessage?: string;
      };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "The demo player could not be added.");
      }
      const member = payload.member;
      setMembers((current) => [
        member,
        ...current.filter((item) => item.id !== member.id),
      ]);
      setSelectedMemberId(member.id);
      setStep(1);
      setWorkspaceMessage(payload.publicMessage ?? `${member.name} is ready for a demo upload.`);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The demo player could not be added.");
    } finally {
      setDemoSeedState("idle");
    }
  }

  function selectVideoFile(file: File | null) {
    if (!file) {
      setVideoFile(null);
      return;
    }
    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
    if (!allowedTypes.includes(file.type) || file.size > 500 * 1024 * 1024) {
      setVideoFile(null);
      setWorkspaceMessage("Choose an MP4, MOV, WebM, or M4V video smaller than 500 MB.");
      return;
    }
    setVideoFile(file);
    if (!videoTitle.trim()) setVideoTitle(file.name.replace(/\.[^.]+$/, ""));
    setWorkspaceMessage(`${file.name} is ready to upload.`);
  }

  async function loadDevelopmentTestVideo() {
    try {
      const response = await fetch("/dev-test-video.mov");
      if (!response.ok) throw new Error("Local test clip not found.");
      const blob = await response.blob();
      selectVideoFile(new File([blob], "lesson-flow-test.mov", { type: "video/quicktime" }));
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The local test clip could not be loaded.");
    }
  }

  function selectThumbnailFile(file: File | null) {
    if (!file) {
      setThumbnailFile(null);
      return;
    }
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setThumbnailFile(null);
      setWorkspaceMessage("Choose a JPG, PNG, or WebP thumbnail smaller than 10 MB.");
      return;
    }
    setThumbnailFile(file);
  }

  function replaceItem(record: VideoLibraryRecord) {
    const item = createVideoLibraryItem(record);
    setVideos((items) => [item, ...items.filter((video) => video.id !== record.id)]);
  }

  async function persistRecord(record: VideoLibraryRecord) {
    const saved = await saveVideoRecord(record);
    replaceItem(saved);
  }

  async function sendMemberNotification(record: VideoLibraryRecord) {
    try {
      const updated = await finalizeVideoRecord(record.id, {
        ...videoPatchPayload(record),
        publicationStatus: "Published",
        notifyMember: true,
      });
      replaceItem(updated);
      return { ok: updated.emailStatus === "Sent", record: updated };
    } catch (error) {
      return {
        ok: false,
        record,
        error: error instanceof Error ? error.message : "Email delivery failed.",
      };
    }
  }

  async function saveCoachVideo(publicationStatus: VideoPublicationStatus, notifyMember: boolean) {
    if (!selectedMember) {
      setWorkspaceMessage("Select a member before uploading a lesson video.");
      setStep(1);
      return;
    }
    if (!videoTitle.trim() || (!videoFile && !editingVideo)) {
      setWorkspaceMessage("Choose a video and add a title before continuing.");
      setStep(2);
      return;
    }

    setSaveState("saving");
    setUploadProgress(4);
    let pendingVideoId = editingVideo?.id ?? "";
    try {
      const duration = videoFile ? await readVideoDuration(videoFile) : editingVideo?.duration ?? 0;
      const metadata = {
        memberId: selectedMember.id,
        title: videoTitle.trim(),
        description: videoDescription.trim(),
        videoType,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sessionId: selectedSessionId || undefined,
        club: selectedSession ? getSessionPrimaryClub(selectedSession) : editingVideo?.club,
        swingType: editingVideo?.swingType,
        focusArea,
        duration,
        publicationStatus,
        lessonDate,
        lessonSummary: lessonSummary.trim(),
        workedOn: workedOn.trim(),
        keyIssue: keyIssue.trim(),
        improvement: improvement.trim(),
        practiceAssignment: practiceAssignment.trim(),
        recommendedDrill: recommendedDrill.trim(),
        memberFacingNotes: memberFacingNotes.trim(),
        coachPrivateNotes: coachPrivateNotes.trim(),
        coachNotes: memberFacingNotes.trim(),
      };

      if (!pendingVideoId) {
        const created = await createVideoRecord(metadata, videoFile!);
        pendingVideoId = created.id;
      }
      if (videoFile) {
        await uploadVideoAsset(pendingVideoId, videoFile, "video", (progress) => {
          setUploadProgress(8 + Math.round(progress * 0.72));
        });
      }
      if (thumbnailFile) {
        await uploadVideoAsset(pendingVideoId, thumbnailFile, "thumbnail", (progress) => {
          setUploadProgress(80 + Math.round(progress * 0.12));
        });
      }
      setUploadProgress(94);
      const record = await finalizeVideoRecord(pendingVideoId, {
        ...metadata,
        reviewStatus: publicationStatus === "Published" ? "New" : editingVideo?.status ?? "Coach Feedback",
        notifyMember: publicationStatus === "Published" && notifyMember && emailMember,
      });
      replaceItem(record);
      setUploadProgress(100);

      if (publicationStatus === "Draft") {
        setWorkspaceMessage(`Draft saved for ${selectedMember.name}. It is not visible to the member.`);
      } else if (notifyMember && emailMember) {
        setWorkspaceMessage(
          record.emailStatus === "Sent"
            ? `Video published to ${selectedMember.name} and the email notification was sent.`
            : "Video published, but the email notification could not be sent.",
        );
      } else {
        setWorkspaceMessage(`Video published to ${selectedMember.name}. No email was sent.`);
      }
      const completedMember = selectedMember;
      resetWorkflow();
      if (publicationStatus === "Published") {
        onOpenMemberVideos(completedMember.id, completedMember.name);
      }
    } catch (error) {
      setUploadProgress(0);
      setWorkspaceMessage(error instanceof Error ? error.message : "The video could not be saved.");
    } finally {
      setSaveState("idle");
    }
  }

  function editVideo(video: VideoLibraryItem) {
    setEditingVideoId(video.id);
    setSelectedMemberId(video.ownerId);
    setVideoFile(null);
    setThumbnailFile(null);
    setVideoTitle(video.title);
    setVideoType(video.type);
    setLessonDate(video.lessonDate ?? video.uploadedAt.slice(0, 10));
    setFocusArea(video.focusArea ?? "Other");
    setVideoDescription(video.description);
    setTags(video.tags.join(", "));
    setSelectedSessionId(video.sessionId ?? "");
    setLessonSummary(video.lessonSummary ?? "");
    setWorkedOn(video.workedOn ?? "");
    setKeyIssue(video.keyIssue ?? "");
    setImprovement(video.improvement ?? "");
    setPracticeAssignment(video.practiceAssignment ?? "");
    setRecommendedDrill(video.recommendedDrill ?? "");
    setMemberFacingNotes(video.memberFacingNotes ?? "");
    setCoachPrivateNotes(video.coachPrivateNotes ?? "");
    setEmailMember(video.emailStatus !== "Sent");
    setStep(2);
    setWorkspaceMessage(`Editing ${video.title}. Choose a replacement file only if the video changed.`);
  }

  async function updateManagedVideo(video: VideoLibraryItem, patch: Partial<VideoLibraryRecord>, message: string) {
    try {
      await persistRecord({ ...stripVideoObjectUrl(video), ...patch, updatedAt: new Date().toISOString() });
      setWorkspaceMessage(message);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The video could not be updated.");
    }
  }

  async function removeManagedVideo(video: VideoLibraryItem) {
    if (viewerRole !== "admin") return;
    try {
      await deleteVideoRecord(video.id);
      setVideos((items) => items.filter((item) => item.id !== video.id));
      setWorkspaceMessage(`${video.title} was deleted.`);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The video could not be deleted.");
    }
  }

  function moveToNextStep() {
    if (step === 1 && !selectedMember) {
      setWorkspaceMessage("Select a member before uploading a lesson video.");
      return;
    }
    if (step === 2 && (!videoTitle.trim() || (!videoFile && !editingVideo))) {
      setWorkspaceMessage("Choose a video and add a title before continuing.");
      return;
    }
    setStep((current) => Math.min(5, current + 1));
  }

  function canOpenWorkflowStep(stepNumber: number) {
    if (stepNumber <= step) return true;
    if (stepNumber !== step + 1) return false;
    if (step === 1) return Boolean(selectedMember);
    if (step === 2) return Boolean(videoTitle.trim() && (videoFile || editingVideo));
    return true;
  }

  return (
    <div className="coach-video-workspace">
      <section className="coach-dashboard-overview">
        <div>
          <p className="eyebrow">Coach dashboard</p>
          <h3>Lesson video delivery</h3>
          <span>Choose a member, upload the lesson, and send their next practice focus.</span>
        </div>
        <div className="coach-dashboard-stats">
          <article><span>Members</span><strong>{loadingMembers ? "..." : members.length}</strong></article>
          <article><span>Recent uploads</span><strong>{loadingVideos ? "..." : managedVideos.length}</strong></article>
          <article><span>Waiting to watch</span><strong>{managedVideos.filter((video) => getVideoPublicationStatus(video) === "Published" && !video.isViewedByMember).length}</strong></article>
        </div>
        <div className="button-row">
          <button className="secondary-action" disabled={!authenticated || demoSeedState === "saving"} onClick={() => void addDemoPlayer()}>
            {demoSeedState === "saving" ? "Adding Demo..." : "Add Demo Player"}
          </button>
          <button className="secondary-action" disabled={!authenticated} onClick={() => setShowAddMember(true)}>＋ Add Member</button>
          <button
            className="primary-action"
            disabled={!authenticated}
            onClick={() => {
              resetWorkflow();
              setWorkspaceMessage(members.length ? "Select a member to upload a lesson video." : "Add a member before uploading a lesson video.");
            }}
          >
            ⇧ Upload Lesson Video
          </button>
        </div>
      </section>

      <section className="coach-tool-status" role="status">
        <div>
          <span>{viewerRole === "admin" ? "Admin tools" : `${coachName}'s coach tools`}</span>
          <strong>{workspaceMessage}</strong>
        </div>
        {editingVideoId && <button className="text-button" onClick={resetWorkflow}>Cancel editing</button>}
      </section>

      <section className="coach-upload-shell">
        <nav className="coach-upload-steps" aria-label="Coach video upload steps">
          {["Member", "Video", "Session", "Notes", "Review"].map((label, index) => {
            const stepNumber = index + 1;
            const stepComplete =
              stepNumber === 1
                ? Boolean(selectedMember && step > 1)
                : stepNumber === 2
                  ? Boolean(videoTitle.trim() && (videoFile || editingVideo) && step > 2)
                  : step > stepNumber;
            return (
              <button
                className={cls(step === stepNumber && "active", stepComplete && "complete")}
                key={label}
                onClick={() => {
                  if (canOpenWorkflowStep(stepNumber)) setStep(stepNumber);
                }}
              >
                <span>{stepComplete ? "✓" : stepNumber}</span>
                <strong>{label}</strong>
              </button>
            );
          })}
        </nav>

        <section className="coach-upload-stage">
          {step === 1 && (
            <div className="coach-step-stack">
              <div className="coach-step-heading">
                <p className="eyebrow">Step 1</p>
                <h3>Select member</h3>
                <p>Search by member name, email, or phone.</p>
              </div>
              <label className="coach-member-search">
                <span>Member search</span>
                <input
                  autoFocus
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search members"
                  type="search"
                  value={memberSearch}
                />
              </label>
              <div className="coach-member-results">
                {memberResults.map((member) => (
                  <button
                    className={cls("coach-member-row", member.id === selectedMemberId && "selected")}
                    key={member.id}
                    onClick={() => chooseMember(member)}
                  >
                    <span className="member-initials">{member.name.split(" ").map((part) => part[0]).join("")}</span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email} · {member.phone}</small>
                    </span>
                    <span>
                      <strong>{member.inviteStatus === "accepted" ? "Active" : "Invited"}</strong>
                      <small>{member.skillLevel || "Skill level not set"}</small>
                    </span>
                    <span>
                      <strong>{member.recentLessonDate ? formatDate(member.recentLessonDate) : "No lesson"}</strong>
                      <small>Recent lesson</small>
                    </span>
                  </button>
                ))}
              </div>
              {!selectedMember && <p className="coach-inline-warning">Select a member before uploading a lesson video.</p>}
              {selectedMember && (
                <>
                  <div className="selected-member-confirmation">
                    <span className="member-initials">{selectedMember.name.split(" ").map((part) => part[0]).join("")}</span>
                    <div><span>Selected member</span><strong>{selectedMember.name}</strong><small>{selectedMember.email}</small></div>
                    <div><span>Contact</span><strong>{selectedMember.phone || "No phone"}</strong><small>{selectedMember.inviteStatus === "accepted" ? "Login active" : "Invitation pending"}</small></div>
                    <div><span>Lesson archive</span><strong>{selectedMember.videoCount ?? 0} videos</strong><small>{selectedMember.lastVideoAt ? formatVideoUploadDate(selectedMember.lastVideoAt) : "No lesson videos yet"}</small></div>
                  </div>
                  <div className="coach-member-profile">
                    <div>
                      <span>Skill level</span>
                      <strong>{selectedMember.skillLevel || "Not provided"}</strong>
                    </div>
                    <div>
                      <span>Coach notes</span>
                      <p>{selectedMember.notes || "No member notes yet."}</p>
                    </div>
                    <div className="button-row">
                      <button className="secondary-action" onClick={() => onOpenMemberVideos(selectedMember.id, selectedMember.name)}>View Lesson Videos</button>
                      <button className="primary-action" onClick={() => setStep(2)}>Upload New Video</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="coach-step-stack">
              <div className="coach-step-heading">
                <p className="eyebrow">Step 2</p>
                <h3>{editingVideo ? "Update lesson video" : "Upload lesson video"}</h3>
                <p>Common mobile video formats are supported up to 500 MB.</p>
              </div>
              <div className="coach-video-file-grid">
                <label className="video-file-picker coach-file-picker">
                  <input
                    accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                    onChange={(event) => selectVideoFile(event.currentTarget.files?.[0] ?? null)}
                    type="file"
                  />
                  <span aria-hidden="true">▶</span>
                  <strong>{videoFile?.name ?? (editingVideo ? "Keep current video" : "Choose video")}</strong>
                  <small>MP4, MOV, WebM, or M4V · 500 MB max</small>
                </label>
                <label className="video-file-picker coach-file-picker">
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => selectThumbnailFile(event.currentTarget.files?.[0] ?? null)}
                    type="file"
                  />
                  <span aria-hidden="true">▣</span>
                  <strong>{thumbnailFile?.name ?? (editingVideo?.thumbnailObjectUrl ? "Keep current thumbnail" : "Optional thumbnail")}</strong>
                  <small>JPG, PNG, or WebP · 10 MB max</small>
                </label>
              </div>
              {devAuthEnabled && (
                <button className="text-button coach-dev-test-button" onClick={() => void loadDevelopmentTestVideo()} type="button">
                  Use local test clip
                </button>
              )}
              <div className="coach-video-form-grid">
                <label className="wide"><span>Video title</span><input maxLength={120} onChange={(event) => setVideoTitle(event.target.value)} placeholder="7-Iron takeaway lesson recap" value={videoTitle} /></label>
                <label><span>Video type</span><select onChange={(event) => setVideoType(event.target.value as VideoType)} value={videoType}>{VIDEO_TYPES.filter((type) => type !== "User Upload" && type !== "Practice Session" && type !== "Drill").map((type) => <option key={type}>{type}</option>)}</select></label>
                <label><span>Lesson date</span><input onChange={(event) => setLessonDate(event.target.value)} type="date" value={lessonDate} /></label>
                <label><span>Focus area</span><select onChange={(event) => setFocusArea(event.target.value as VideoFocusArea)} value={focusArea}>{VIDEO_FOCUS_AREAS.map((area) => <option key={area}>{area}</option>)}</select></label>
                <label><span>Tags</span><input onChange={(event) => setTags(event.target.value)} placeholder="takeaway, face control" value={tags} /></label>
                <label className="wide"><span>Description</span><textarea onChange={(event) => setVideoDescription(event.target.value)} placeholder="Optional context for this lesson video" value={videoDescription} /></label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="coach-step-stack">
              <div className="coach-step-heading">
                <p className="eyebrow">Step 3</p>
                <h3>Attach lesson or session data</h3>
                <p>Session data is optional. The video can be published without it.</p>
              </div>
              <label className={cls("coach-session-option", "standalone", !selectedSessionId && "selected")}>
                <input checked={!selectedSessionId} name="session" onChange={() => setSelectedSessionId("")} type="radio" />
                <span><strong>Upload without session data</strong><small>Keep this as a standalone lesson video.</small></span>
              </label>
              {selectedMemberSessions.length ? (
                <div className="coach-session-list">
                  {selectedMemberSessions.map((session, index) => {
                    const sessionClub = getSessionPrimaryClub(session);
                    const sessionShots = sessionClub ? session.shots.filter((shot) => shot.club === sessionClub) : session.shots;
                    return (
                      <label className={cls("coach-session-option", selectedSessionId === session.id && "selected")} key={session.id}>
                        <input checked={selectedSessionId === session.id} name="session" onChange={() => setSelectedSessionId(session.id)} type="radio" />
                        <span>
                          <strong>{formatFullDate(session.date)} · {session.title}</strong>
                          <small>{index % 2 ? "5:30 PM" : "3:00 PM"} · {session.source} · Bay {index + 2} · Coach {coachName}</small>
                        </span>
                        <span>
                          <strong>{sessionClub ? getClubDisplayName(sessionClub) : "Mixed bag"}</strong>
                          <small>{formatAvailableMetric(averageMetric(sessionShots, "carry"), "yd")} carry · {session.shots.length} shots</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="coach-inline-warning">No session data found for this member. You can still upload this video to their library.</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="coach-step-stack">
              <div className="coach-step-heading">
                <p className="eyebrow">Step 4</p>
                <h3>Add coach notes</h3>
                <p>Keep the member-facing guidance concise enough to revisit during practice.</p>
              </div>
              <div className="coach-notes-grid">
                <label><span>Lesson summary</span><textarea onChange={(event) => setLessonSummary(event.target.value)} placeholder="Today we worked on takeaway and face control with the 7 iron." value={lessonSummary} /></label>
                <label><span>What we worked on</span><textarea onChange={(event) => setWorkedOn(event.target.value)} placeholder="Takeaway structure, face control, and start line." value={workedOn} /></label>
                <label><span>Key swing issue</span><textarea onChange={(event) => setKeyIssue(event.target.value)} placeholder="The club was rolling inside with the face opening early." value={keyIssue} /></label>
                <label><span>What improved</span><textarea onChange={(event) => setImprovement(event.target.value)} placeholder="Start line tightened and contact moved toward center." value={improvement} /></label>
                <label><span>What to practice next</span><textarea onChange={(event) => setPracticeAssignment(event.target.value)} placeholder="3 sets of slow takeaway drills and 20 half-speed 7-iron swings." value={practiceAssignment} /></label>
                <label><span>Recommended drill</span><textarea onChange={(event) => setRecommendedDrill(event.target.value)} placeholder="Headcover outside the hands takeaway drill." value={recommendedDrill} /></label>
                <label><span>Member-facing notes</span><textarea onChange={(event) => setMemberFacingNotes(event.target.value)} placeholder="A short message the member will see." value={memberFacingNotes} /></label>
                <label><span>Coach private notes</span><textarea onChange={(event) => setCoachPrivateNotes(event.target.value)} placeholder="Only coaches and admins can see this." value={coachPrivateNotes} /></label>
              </div>
            </div>
          )}

          {step === 5 && selectedMember && (
            <div className="coach-step-stack">
              <div className="coach-step-heading">
                <p className="eyebrow">Step 5</p>
                <h3>Review and publish</h3>
                <p>Confirm the member and delivery settings before publishing.</p>
              </div>
              <div className="coach-review-layout">
                <div className="coach-review-thumbnail">
                  <span aria-hidden="true">▶</span>
                  <strong>{thumbnailFile?.name ?? videoFile?.name ?? editingVideo?.fileName ?? "Lesson video"}</strong>
                </div>
                <dl className="coach-review-list">
                  <div><dt>Member</dt><dd>{selectedMember.name}<small>{selectedMember.email}</small></dd></div>
                  <div><dt>Video</dt><dd>{videoTitle || "Untitled"}<small>{videoType}</small></dd></div>
                  <div><dt>Lesson</dt><dd>{formatFullDate(lessonDate)}<small>{focusArea}</small></dd></div>
                  <div><dt>Session</dt><dd>{selectedSession?.title ?? "No session attached"}<small>{selectedSession?.source ?? "Standalone video"}</small></dd></div>
                  <div><dt>Practice focus</dt><dd>{practiceAssignment || "No assignment added"}<small>{recommendedDrill || "No drill added"}</small></dd></div>
                  <div><dt>Coach note</dt><dd>{memberFacingNotes || lessonSummary || "No member-facing note"}<small>Private notes are not shared.</small></dd></div>
                </dl>
              </div>
              <label className="coach-email-toggle">
                <input checked={emailMember} onChange={(event) => setEmailMember(event.target.checked)} type="checkbox" />
                <span><strong>Email {selectedMember.name} when published</strong><small>Notification is sent only after the video is saved successfully.</small></span>
              </label>
              {saveState === "saving" && (
                <div className="coach-upload-progress" aria-label={`Upload ${uploadProgress}% complete`}>
                  <span style={{ width: `${uploadProgress}%` }} />
                  <strong>{uploadProgress}%</strong>
                </div>
              )}
            </div>
          )}

          <footer className="coach-step-actions">
            <button className="secondary-action" disabled={step === 1 || saveState === "saving"} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</button>
            {step < 5 ? (
              <button className="primary-action" onClick={moveToNextStep}>Continue</button>
            ) : (
              <div className="button-row">
                <button className="secondary-action" disabled={saveState === "saving"} onClick={() => void saveCoachVideo("Draft", false)}>Save as Draft</button>
                <button className="secondary-action" disabled={saveState === "saving"} onClick={() => void saveCoachVideo("Published", false)}>Publish to Member</button>
                <button className="primary-action" disabled={saveState === "saving"} onClick={() => void saveCoachVideo("Published", true)}>
                  {saveState === "saving" ? "Publishing..." : "Publish and Email Member"}
                </button>
              </div>
            )}
          </footer>
        </section>
      </section>

      <section className="coach-video-management">
        <div className="coach-management-heading">
          <div><p className="eyebrow">Video management</p><h3>Coach uploads</h3></div>
          <span>{loadingVideos ? "Loading..." : `${managedVideos.length} ${managedVideos.length === 1 ? "video" : "videos"}`}</span>
        </div>
        {managedVideos.length ? (
          <div className="coach-management-table">
            <div className="coach-management-row coach-management-head">
              <span>Member / Video</span><span>Delivery</span><span>Member activity</span><span>Session</span><span>Actions</span>
            </div>
            {managedVideos.map((video) => (
              <div className="coach-management-row" key={video.id}>
                <div>
                  <strong>{video.memberName ?? members.find((member) => member.id === video.ownerId)?.name ?? "Member"}</strong>
                  <span>{video.title}</span>
                  <small>{formatVideoUploadDate(video.uploadedAt)} · {video.coachName ?? video.uploadedBy}</small>
                </div>
                <div>
                  <span className={cls("video-status", getVideoPublicationStatus(video).toLowerCase())}>{getVideoPublicationStatus(video)}</span>
                  <small>Email: {video.emailStatus ?? "Not sent"}</small>
                </div>
                <div>
                  <strong>{video.isViewedByMember ? "Viewed" : "Not viewed"}</strong>
                  <small>{video.viewedAt ? formatVideoUploadDate(video.viewedAt) : "No view recorded"}</small>
                </div>
                <div>
                  <strong>{video.sessionId ? "Attached" : "None"}</strong>
                  <small>{video.sessionId ? sessions.find((session) => session.id === video.sessionId)?.title ?? "Session" : "Standalone"}</small>
                </div>
                <div className="coach-management-actions">
                  <button aria-label={`Edit ${video.title}`} className="icon-button" onClick={() => editVideo(video)} title="Edit video">✎</button>
                  <button
                    aria-label={`Open ${video.memberName ?? "member"} video library`}
                    className="icon-button"
                    onClick={() => onOpenMemberVideos(video.ownerId, video.memberName ?? "Member")}
                    title="Open member library"
                  >
                    ▶
                  </button>
                  <button
                    aria-label={`Resend ${video.title} email`}
                    className="icon-button"
                    disabled={getVideoPublicationStatus(video) !== "Published"}
                    onClick={async () => {
                      const result = await sendMemberNotification(stripVideoObjectUrl(video));
                      setWorkspaceMessage(result.ok ? "Email notification resent." : "The email notification could not be sent.");
                    }}
                    title="Resend email"
                  >
                    ↻
                  </button>
                  <button
                    aria-label={`Archive ${video.title}`}
                    className="icon-button"
                    disabled={getVideoPublicationStatus(video) === "Archived"}
                    onClick={() => void updateManagedVideo(video, { publicationStatus: "Archived" }, `${video.title} was archived.`)}
                    title="Archive video"
                  >
                    ⌄
                  </button>
                  {viewerRole === "admin" && (
                    <button aria-label={`Delete ${video.title}`} className="icon-button danger-text-button" onClick={() => void removeManagedVideo(video)} title="Delete video">×</button>
                  )}
                </div>
                {viewerRole === "admin" && (
                  <label className="coach-owner-control">
                    <span>Owner</span>
                    <select
                      onChange={(event) => {
                        const nextMember = members.find((member) => member.id === event.target.value);
                        if (nextMember) {
                          void updateManagedVideo(
                            video,
                            { ownerId: nextMember.id, memberName: nextMember.name, memberEmail: nextMember.email } as Partial<VideoLibraryRecord>,
                            `${video.title} reassigned to ${nextMember.name}.`,
                          );
                        }
                      }}
                      value={video.ownerId}
                    >
                      {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="coach-management-empty">
            <strong>No coach uploads yet</strong>
            <p>Published videos and drafts will appear here with delivery and viewed status.</p>
          </div>
        )}
      </section>

      {showAddMember && (
        <div className="video-modal-overlay">
          <form className="video-upload-modal coach-member-modal" onSubmit={addMember}>
            <div className="video-modal-header">
              <div>
                <p className="eyebrow">Member account</p>
                <h2>Add Member</h2>
              </div>
              <button aria-label="Close add member dialog" className="icon-button" onClick={() => setShowAddMember(false)} type="button">×</button>
            </div>
            <p className="muted-copy">The member record is saved in D1 and tied to their login email. An invitation is sent when email delivery is configured.</p>
            <div className="video-form-grid">
              <label><span>First name</span><input required value={newMember.firstName} onChange={(event) => setNewMember((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label><span>Last name</span><input required value={newMember.lastName} onChange={(event) => setNewMember((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label className="video-form-wide"><span>Email</span><input required type="email" value={newMember.email} onChange={(event) => setNewMember((current) => ({ ...current, email: event.target.value }))} /></label>
              <label><span>Phone optional</span><input type="tel" value={newMember.phone} onChange={(event) => setNewMember((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><span>Skill level optional</span><input placeholder="Beginner, 12 handicap, competitive..." value={newMember.skillLevel} onChange={(event) => setNewMember((current) => ({ ...current, skillLevel: event.target.value }))} /></label>
              <label className="video-form-wide"><span>Coach notes optional</span><textarea placeholder="Goals, tendencies, or lesson context..." value={newMember.notes} onChange={(event) => setNewMember((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className="video-modal-actions">
              <span>{workspaceMessage}</span>
              <div className="button-row">
                <button className="secondary-action" onClick={() => setShowAddMember(false)} type="button">Cancel</button>
                <button className="primary-action" disabled={memberSaveState === "saving"} type="submit">
                  {memberSaveState === "saving" ? "Adding..." : "Add Member"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PracticeView({ insights }: { insights: Insight[] }) {
  const priority = insights[0];
  const practiceBlocks = [
    {
      time: "10 min",
      title: "Calibration",
      body: "Half-speed swings with face tape, then record launch and smash only.",
      metric: "Contact cluster",
    },
    {
      time: "20 min",
      title: priority?.club === "Driver" ? "Start-line gate" : "Carry window ladder",
      body: priority?.action ?? "Alternate target yardages and keep dispersion inside the working window.",
      metric: priority?.metric ?? "Dispersion",
    },
    {
      time: "15 min",
      title: "Transfer set",
      body: "Randomize clubs and commit to one target before stepping into each ball.",
      metric: "Decision quality",
    },
  ];

  return (
    <section className="practice-board">
      <div className="panel panel-large">
        <PanelHeader
          kicker="Next session"
          title={priority ? priority.title : "Maintenance block"}
          meta={priority ? `${getClubDisplayName(priority.club)} · ${priority.metric}` : "Balanced practice"}
        />
        <div className="practice-track">
          {practiceBlocks.map((block, index) => (
            <article className="practice-step" key={block.title}>
              <span className="step-index">{index + 1}</span>
              <div>
                <small>{block.time}</small>
                <h3>{block.title}</h3>
                <p>{block.body}</p>
                <strong>{block.metric}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <PanelHeader kicker="Targets" title="Session scorecard" meta="Track after each block" />
        <div className="scorecard-list">
          {["Start line inside 12 yd", "Smash within 0.03 band", "Carry window inside 8 yd", "One note after each club"].map((item) => (
            <label key={item} className="check-row">
              <input type="checkbox" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatVideoDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return "NA";
  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatVideoUploadDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function canViewLibraryVideo(video: VideoLibraryRecord, ownerId: string, viewerRole: VideoViewerRole) {
  if (video.ownerId !== ownerId) return false;
  if (viewerRole === "admin") return true;
  if (viewerRole === "coach") return video.visibility === "Coach + User";
  return getVideoPublicationStatus(video) === "Published" && video.visibility !== "Admin only";
}

function VideoThumbnail({ video }: { video: VideoLibraryItem }) {
  return (
    <div className="video-thumbnail">
      {video.thumbnailObjectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" aria-hidden="true" src={video.thumbnailObjectUrl} />
      ) : (
        <video
          aria-hidden="true"
          muted
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = Math.min(0.4, Math.max(0, event.currentTarget.duration / 10));
          }}
          playsInline
          preload="metadata"
          src={video.objectUrl}
        />
      )}
      <span className="video-play-mark" aria-hidden="true">▶</span>
      <span className="video-duration">{formatVideoDuration(video.duration)}</span>
    </div>
  );
}

function VideoLibraryCard({
  comparisonSelected,
  onCompare,
  onOpen,
  session,
  video,
}: {
  comparisonSelected: boolean;
  onCompare: () => void;
  onOpen: () => void;
  session?: Session;
  video: VideoLibraryItem;
}) {
  return (
    <article className="video-library-card">
      <button className="video-card-open" onClick={onOpen}>
        <VideoThumbnail video={video} />
        <div className="video-card-copy">
          <div className="video-card-heading">
            <span className="video-type-tag">{video.type}</span>
            {getVideoPublicationStatus(video) !== "Published" ? (
              <span className={cls("video-status", getVideoPublicationStatus(video).toLowerCase())}>
                {getVideoPublicationStatus(video)}
              </span>
            ) : video.uploadedBy !== "User" && !video.isViewedByMember ? (
              <span className="video-status new">New Coach Video</span>
            ) : (
              <span className={cls("video-status", video.status.toLowerCase().replace(" ", "-"))}>{video.status}</span>
            )}
          </div>
          <h3>{video.title}</h3>
          <p>
            {video.lessonDate ? formatVideoUploadDate(video.lessonDate) : formatVideoUploadDate(video.uploadedAt)}
            {" · "}
            Uploaded by {video.coachName ?? video.uploadedBy}
          </p>
          <div className="video-card-meta">
            <span>{session ? session.title : "No session attached"}</span>
            {video.focusArea && <span>{video.focusArea}</span>}
            {video.club && <span>{getClubDisplayName(video.club)}</span>}
            {(video.memberFacingNotes || (video.coachNotes && !video.coachNotesPrivate)) && <span>Coach notes</span>}
          </div>
        </div>
      </button>
      <button
        aria-label={`${comparisonSelected ? "Remove" : "Add"} ${video.title} ${comparisonSelected ? "from" : "to"} comparison`}
        aria-pressed={comparisonSelected}
        className={cls("video-compare-toggle", comparisonSelected && "selected")}
        onClick={onCompare}
        title="Select for comparison"
      >
        {comparisonSelected ? "✓" : "⇄"}
      </button>
    </article>
  );
}

function VideoSessionMetrics({ session, video }: { session?: Session; video: VideoLibraryItem }) {
  if (!session) {
    return <EmptyState title="No session data" body="No session data attached to this video." />;
  }

  const relevantShots = video.club
    ? session.shots.filter((shot) => shot.club === video.club)
    : session.shots;
  const metricShots = relevantShots.length ? relevantShots : session.shots;
  const metricRows = [
    ["Ball speed", formatAvailableMetric(averageMetric(metricShots, "ballSpeed"), "mph")],
    ["Club speed", formatAvailableMetric(averageMetric(metricShots, "clubSpeed"), "mph")],
    ["Carry", formatAvailableMetric(averageMetric(metricShots, "carry"), "yd")],
    ["Total", formatAvailableMetric(averageMetric(metricShots, "total"), "yd")],
    ["Launch", formatAvailableMetric(averageMetric(metricShots, "launch"), "deg")],
    ["Spin", formatAvailableMetric(averageMetric(metricShots, "spin"), "rpm", 0)],
    ["Dispersion", formatAvailableMetric(standardDeviation(metricValues(metricShots, "offline")), "yd")],
    ["Face-to-path", formatAvailableMetric(averageMetric(metricShots, "faceToPath"), "deg")],
  ];

  return (
    <div className="video-session-block">
      <div className="video-session-heading">
        <div>
          <span>{formatFullDate(session.date)}</span>
          <strong>{session.title}</strong>
        </div>
        <span>{video.club ? getClubDisplayName(video.club) : `${metricShots.length} shots`}</span>
      </div>
      <div className="video-metric-grid">
        {metricRows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoDetailView({
  onBack,
  onDelete,
  onOpenRelated,
  onUpdate,
  relatedVideos,
  session,
  video,
  viewerRole,
}: {
  onBack: () => void;
  onDelete: () => void;
  onOpenRelated: (video: VideoLibraryItem) => void;
  onUpdate: (patch: Partial<VideoLibraryRecord>) => void | Promise<void>;
  relatedVideos: VideoLibraryItem[];
  session?: Session;
  video: VideoLibraryItem;
  viewerRole: VideoViewerRole;
}) {
  const [userNotes, setUserNotes] = useState(video.userNotes);
  const [coachNotes, setCoachNotes] = useState(video.coachNotes);
  const [coachNotesPrivate, setCoachNotesPrivate] = useState(video.coachNotesPrivate);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEditCoachNotes = viewerRole === "coach" || viewerRole === "admin";
  const canEditUserNotes = viewerRole === "user";
  const canDelete =
    viewerRole === "admin" ||
    (viewerRole === "user" && video.uploadedBy === "User") ||
    (viewerRole === "coach" && video.uploadedBy === "Coach");
  const relatedInsights = session
    ? computeInsights(summarizeClubs([session]), [session]).slice(0, 2)
    : [];
  const sharedCoachNote = video.memberFacingNotes || (video.coachNotesPrivate ? "" : video.coachNotes);

  return (
    <section className="view-stack">
      <div className="video-detail-toolbar">
        <button className="secondary-action" onClick={onBack}>← Back to videos</button>
        <div className="button-row">
          {video.status !== "Reviewed" && (
            <button className="secondary-action" onClick={() => void onUpdate({ status: "Reviewed" })}>
              ✓ Mark reviewed
            </button>
          )}
          {canDelete && !confirmDelete && (
            <button className="text-button danger-text-button" onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
          {confirmDelete && (
            <>
              <button className="secondary-action" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="primary-action danger-action" onClick={onDelete}>Delete video</button>
            </>
          )}
        </div>
      </div>

      <div className="video-detail-layout">
        <section className="panel video-player-panel">
          <video className="video-player" controls playsInline preload="metadata" src={video.objectUrl} />
          <div className="video-detail-title">
            <div>
              <p className="eyebrow">{video.type}</p>
              <h2>{video.title}</h2>
              <span>
                {video.lessonDate ? `Lesson ${formatVideoUploadDate(video.lessonDate)} · ` : ""}
                Uploaded by {video.coachName ?? video.uploadedBy} · {formatVideoDuration(video.duration)}
              </span>
            </div>
            <span className={cls("video-status", video.status.toLowerCase().replace(" ", "-"))}>{video.status}</span>
          </div>
          {video.description && <p className="video-description">{video.description}</p>}
          <div className="video-tag-row">
            {video.swingType && <span>{video.swingType}</span>}
            {video.club && <span>{getClubDisplayName(video.club)}</span>}
            {video.tags.map((tag) => <span key={tag}>{tag}</span>)}
            <span>{video.visibility}</span>
          </div>
        </section>

        <aside className="video-notes-column">
          <section className="panel video-note-panel">
            <PanelHeader kicker="Coach notes" title="Feedback" meta={canEditCoachNotes ? "Coach workspace" : "Shared with you"} />
            {canEditCoachNotes ? (
              <>
                <textarea value={coachNotes} onChange={(event) => setCoachNotes(event.target.value)} placeholder="Key issue, improvement, next focus, and recommended drill..." />
                <label className="video-private-toggle">
                  <input checked={coachNotesPrivate} onChange={(event) => setCoachNotesPrivate(event.target.checked)} type="checkbox" />
                  <span>Private admin-only note</span>
                </label>
                {video.coachPrivateNotes && (
                  <div className="coach-private-note">
                    <span>Private coach note</span>
                    <p>{video.coachPrivateNotes}</p>
                  </div>
                )}
                <button
                  className="primary-action"
                  onClick={() => void onUpdate({ coachNotes, coachNotesPrivate, status: "Coach Feedback" })}
                >
                  Save coach notes
                </button>
              </>
            ) : sharedCoachNote || video.lessonSummary || video.workedOn || video.keyIssue || video.improvement || video.recommendedDrill ? (
              <div className="structured-video-notes">
                {video.lessonSummary && <div><span>Lesson summary</span><p>{video.lessonSummary}</p></div>}
                {video.workedOn && <div><span>What we worked on</span><p>{video.workedOn}</p></div>}
                {video.keyIssue && <div><span>Key swing issue</span><p>{video.keyIssue}</p></div>}
                {video.improvement && <div><span>What improved</span><p>{video.improvement}</p></div>}
                {video.recommendedDrill && <div><span>Recommended drill</span><p>{video.recommendedDrill}</p></div>}
                {sharedCoachNote && <div><span>Coach message</span><p>{sharedCoachNote}</p></div>}
              </div>
            ) : (
              <p className="video-note-empty">No coach feedback has been shared yet.</p>
            )}
          </section>

          {video.practiceAssignment && (
            <section className="practice-focus-callout">
              <span>Practice Focus Before Your Next Session</span>
              <strong>{video.practiceAssignment}</strong>
            </section>
          )}

          {canEditUserNotes && (
            <section className="panel video-note-panel">
              <PanelHeader kicker="Private notes" title="My notes" meta="Only visible to you" />
              <textarea value={userNotes} onChange={(event) => setUserNotes(event.target.value)} placeholder="What felt different? What do you want to revisit?" />
              <button className="primary-action" onClick={() => void onUpdate({ userNotes })}>Save my notes</button>
            </section>
          )}
        </aside>
      </div>

      <section className="panel">
        <PanelHeader kicker="Linked data" title="Session performance" meta={session ? session.source : "Optional"} />
        <VideoSessionMetrics session={session} video={video} />
      </section>

      <section className="panel">
        <PanelHeader kicker="Next work" title="Related drills and recommendations" meta={relatedInsights.length ? "Based on linked session" : "No linked recommendations"} />
        {relatedInsights.length ? (
          <div className="video-recommendation-grid">
            {relatedInsights.map((insight) => (
              <article key={insight.id}>
                <span>{getClubDisplayName(insight.club)}</span>
                <strong>{insight.title}</strong>
                <p>{insight.action}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No recommendations yet" body="Attach a practice session to connect this video with drills and performance priorities." />
        )}
      </section>

      {relatedVideos.length > 0 && (
        <section className="panel">
          <PanelHeader kicker="Lesson timeline" title="Previous coach videos" meta={`${relatedVideos.length} related`} />
          <div className="related-video-list">
            {relatedVideos.map((relatedVideo) => (
              <button key={relatedVideo.id} onClick={() => onOpenRelated(relatedVideo)}>
                <span aria-hidden="true">▶</span>
                <span><strong>{relatedVideo.title}</strong><small>{relatedVideo.lessonDate ? formatFullDate(relatedVideo.lessonDate) : formatVideoUploadDate(relatedVideo.uploadedAt)} · {relatedVideo.coachName ?? relatedVideo.uploadedBy}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function VideoComparisonView({
  onBack,
  sessions,
  videos,
}: {
  onBack: () => void;
  sessions: Session[];
  videos: VideoLibraryItem[];
}) {
  return (
    <section className="view-stack">
      <div className="video-detail-toolbar">
        <button className="secondary-action" onClick={onBack}>← Back to library</button>
        <span className="comparison-label">Side-by-side progress review</span>
      </div>
      <div className="video-comparison-grid">
        {videos.map((video) => {
          const session = sessions.find((item) => item.id === video.sessionId);
          return (
            <article className="panel comparison-video" key={video.id}>
              <video controls playsInline preload="metadata" src={video.objectUrl} />
              <div>
                <span>{formatVideoUploadDate(video.uploadedAt)} · {video.type}</span>
                <h2>{video.title}</h2>
              </div>
              <VideoSessionMetrics session={session} video={video} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VideosView({
  authenticated,
  ownerId,
  ownerName,
  requestedVideoId,
  sessions,
  viewerRole,
}: {
  authenticated: boolean;
  ownerId: string;
  ownerName?: string;
  requestedVideoId?: string | null;
  sessions: Session[];
  viewerRole: VideoViewerRole;
}) {
  const [videos, setVideos] = useState<VideoLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryMessage, setLibraryMessage] = useState("Loading your video library...");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [layout, setLayout] = useState<"library" | "timeline">("library");
  const [search, setSearch] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [filterReferenceTime] = useState(() => Date.now());
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadType, setUploadType] = useState<VideoType>("User Upload");
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [uploadClub, setUploadClub] = useState("");
  const [uploadSwingType, setUploadSwingType] = useState<VideoSwingType | "">("");
  const [uploadVisibility, setUploadVisibility] = useState<VideoVisibility>(
    viewerRole === "user" ? "User only" : "Coach + User",
  );
  const [uploadState, setUploadState] = useState<"idle" | "saving">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!authenticated) {
      queueMicrotask(() => {
        setLibraryMessage("Log in to open your private lesson video library.");
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    readVideoLibrary(viewerRole === "user" ? undefined : ownerId)
      .then((records) => {
        if (cancelled) return;
        const items = records.map((record) => createVideoLibraryItem(record));
        setVideos(items);
        if (requestedVideoId && items.some((item) => item.id === requestedVideoId && canViewLibraryVideo(item, ownerId, viewerRole))) {
          setSelectedVideoId(requestedVideoId);
        }
        setLibraryMessage(items.length ? `${items.length} saved ${items.length === 1 ? "video" : "videos"}` : "Your library is ready.");
      })
      .catch((error) => {
        if (!cancelled) setLibraryMessage(error instanceof Error ? error.message : "Video storage is unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, ownerId, requestedVideoId, viewerRole]);

  const visibleVideos = useMemo(
    () => videos.filter((video) => canViewLibraryVideo(video, ownerId, viewerRole)),
    [ownerId, viewerRole, videos],
  );
  const clubOptions = useMemo(
    () => Array.from(new Set([...CLUB_ORDER, ...sessions.flatMap((session) => session.shots.map((shot) => shot.club))])),
    [sessions],
  );
  const filteredVideos = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const dateCutoff =
      dateFilter === "30" ? filterReferenceTime - 30 * 86_400_000 :
        dateFilter === "90" ? filterReferenceTime - 90 * 86_400_000 :
          dateFilter === "365" ? filterReferenceTime - 365 * 86_400_000 :
            0;

    return visibleVideos
      .filter((video) => {
        const searchable = [
          video.title,
          video.description,
          video.coachNotes,
          video.lessonSummary,
          video.workedOn,
          video.keyIssue,
          video.improvement,
          video.practiceAssignment,
          video.recommendedDrill,
          video.memberFacingNotes,
          video.userNotes,
          video.type,
          video.focusArea,
          video.club,
          video.swingType,
          ...video.tags,
        ].join(" ").toLowerCase();
        if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
        if (uploaderFilter !== "all" && video.uploadedBy !== uploaderFilter) return false;
        if (typeFilter !== "all" && video.type !== typeFilter) return false;
        if (clubFilter !== "all" && video.club !== clubFilter) return false;
        if (sessionFilter === "attached" && !video.sessionId) return false;
        if (sessionFilter === "none" && video.sessionId) return false;
        if (reviewFilter === "reviewed" && video.status !== "Reviewed") return false;
        if (reviewFilter === "unreviewed" && video.status === "Reviewed") return false;
        if (dateCutoff && new Date(video.uploadedAt).getTime() < dateCutoff) return false;
        return true;
      })
      .sort((a, b) =>
        sortOrder === "newest"
          ? new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          : new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
      );
  }, [
    clubFilter,
    dateFilter,
    filterReferenceTime,
    reviewFilter,
    search,
    sessionFilter,
    sortOrder,
    typeFilter,
    uploaderFilter,
    visibleVideos,
  ]);
  const selectedVideo = videos.find((video) => video.id === selectedVideoId);
  const comparisonVideos = comparisonIds
    .map((videoId) => videos.find((video) => video.id === videoId))
    .filter((video): video is VideoLibraryItem => Boolean(video));
  const timelineGroups = filteredVideos.reduce<Record<string, VideoLibraryItem[]>>((groups, video) => {
    const key = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(video.uploadedAt));
    groups[key] = [...(groups[key] ?? []), video];
    return groups;
  }, {});

  async function updateVideo(videoId: string, patch: Partial<VideoLibraryRecord>) {
    const current = videos.find((video) => video.id === videoId);
    if (!current) return;
    const updated = { ...current, ...patch };
    setVideos((items) => items.map((item) => item.id === videoId ? updated : item));
    try {
      await saveVideoRecord(stripVideoObjectUrl(updated));
      setLibraryMessage("Video details saved.");
    } catch (error) {
      setVideos((items) => items.map((item) => item.id === videoId ? current : item));
      setLibraryMessage(error instanceof Error ? error.message : "The video update could not be saved.");
    }
  }

  async function removeVideo(video: VideoLibraryItem) {
    try {
      await deleteVideoRecord(video.id);
      setVideos((items) => items.filter((item) => item.id !== video.id));
      setSelectedVideoId(null);
      setComparisonIds((items) => items.filter((videoId) => videoId !== video.id));
      setLibraryMessage("Video removed.");
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "The video could not be removed.");
    }
  }

  function toggleComparison(videoId: string) {
    setComparisonIds((current) => {
      if (current.includes(videoId)) return current.filter((item) => item !== videoId);
      if (current.length >= 2) return [current[1], videoId];
      return [...current, videoId];
    });
  }

  function openVideo(video: VideoLibraryItem) {
    setSelectedVideoId(video.id);
    if (
      viewerRole === "user" &&
      video.uploadedBy !== "User" &&
      getVideoPublicationStatus(video) === "Published" &&
      !video.isViewedByMember
    ) {
      void fetch("/api/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, action: "viewed" }),
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.video) throw new Error(payload.error ?? "The view could not be recorded.");
          const updated = createVideoLibraryItem(payload.video as VideoLibraryRecord);
          setVideos((items) => items.map((item) => item.id === updated.id ? updated : item));
        })
        .catch(() => {
          setLibraryMessage("The video opened, but its viewed status could not be saved.");
        });
    }
  }

  function resetUploadForm() {
    setVideoFile(null);
    setUploadTitle("");
    setUploadDescription("");
    setUploadTags("");
    setUploadType(viewerRole === "user" ? "User Upload" : "Coach Feedback");
    setUploadSessionId("");
    setUploadClub("");
    setUploadSwingType("");
    setUploadVisibility(viewerRole === "user" ? "User only" : "Coach + User");
    setUploadProgress(0);
  }

  async function uploadVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!videoFile || !uploadTitle.trim()) {
      setLibraryMessage("Choose a video and add a title.");
      return;
    }
    if (videoFile.size > 500 * 1024 * 1024) {
      setLibraryMessage("Choose a video smaller than 500 MB.");
      return;
    }
    if (!["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"].includes(videoFile.type)) {
      setLibraryMessage("Use an MP4, MOV, WebM, or M4V video.");
      return;
    }

    setUploadState("saving");
    setUploadProgress(2);
    try {
      const duration = await readVideoDuration(videoFile);
      const created = await createVideoRecord({
        memberId: ownerId,
        title: uploadTitle.trim(),
        description: uploadDescription.trim(),
        videoType: uploadType,
        tags: uploadTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sessionId: uploadSessionId || undefined,
        club: uploadClub || undefined,
        swingType: uploadSwingType || undefined,
        duration,
        publicationStatus: "Published",
      }, videoFile);
      await uploadVideoAsset(created.id, videoFile, "video", setUploadProgress);
      const record = await finalizeVideoRecord(created.id, {
        title: uploadTitle.trim(),
        description: uploadDescription.trim(),
        videoType: uploadType,
        tags: uploadTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sessionId: uploadSessionId || null,
        club: uploadClub || null,
        swingType: uploadSwingType || null,
        duration,
        publicationStatus: "Published",
      });
      const item = createVideoLibraryItem(record);
      setVideos((items) => [item, ...items]);
      setLibraryMessage(`${record.title} was uploaded successfully.`);
      setShowUpload(false);
      resetUploadForm();
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "The video could not be uploaded.");
    } finally {
      setUploadState("idle");
    }
  }

  if (selectedVideo) {
    return (
      <VideoDetailView
        key={selectedVideo.id}
        onBack={() => setSelectedVideoId(null)}
        onDelete={() => void removeVideo(selectedVideo)}
        onOpenRelated={openVideo}
        onUpdate={(patch) => updateVideo(selectedVideo.id, patch)}
        relatedVideos={visibleVideos
          .filter((video) => video.id !== selectedVideo.id && getVideoPublicationStatus(video) === "Published")
          .slice(0, 3)}
        session={sessions.find((session) => session.id === selectedVideo.sessionId)}
        video={selectedVideo}
        viewerRole={viewerRole}
      />
    );
  }

  if (showComparison && comparisonVideos.length === 2) {
    return <VideoComparisonView onBack={() => setShowComparison(false)} sessions={sessions} videos={comparisonVideos} />;
  }

  return (
    <section className="view-stack videos-view">
      <section className="video-library-header">
        <div>
          <p className="eyebrow">{viewerRole === "user" ? "Personal improvement library" : "Member video library"}</p>
          <h2>{viewerRole === "user" ? "Your golf journey, on video" : `${ownerName ?? "Member"} videos`}</h2>
          <span>{libraryMessage}</span>
        </div>
        <div className="button-row">
          <button
            className="secondary-action"
            disabled={comparisonIds.length !== 2}
            onClick={() => setShowComparison(true)}
          >
            ⇄ Compare {comparisonIds.length}/2
          </button>
          {viewerRole === "user" && <button className="primary-action" onClick={() => setShowUpload(true)}>＋ Upload video</button>}
        </div>
      </section>

      <section className="video-filter-band">
        <label className="video-search-control">
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, notes, tags, or coach comments" type="search" />
        </label>
        <label><span>Uploaded by</span><select value={uploaderFilter} onChange={(event) => setUploaderFilter(event.target.value)}><option value="all">Anyone</option><option>User</option><option>Coach</option><option>Admin</option></select></label>
        <label><span>Video type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option>{VIDEO_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label><span>Club</span><select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)}><option value="all">All clubs</option>{clubOptions.map((club) => <option key={club} value={club}>{getClubDisplayName(club)}</option>)}</select></label>
        <label><span>Session</span><select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)}><option value="all">Any linkage</option><option value="attached">Session attached</option><option value="none">No session</option></select></label>
        <label><span>Review</span><select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}><option value="all">Any status</option><option value="reviewed">Reviewed</option><option value="unreviewed">Not reviewed</option></select></label>
        <label><span>Date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="all">Any date</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></label>
        <label><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </section>

      <div className="video-view-controls">
        <div className="segmented-control" aria-label="Video library view">
          <button className={layout === "library" ? "active" : ""} onClick={() => setLayout("library")}>Library</button>
          <button className={layout === "timeline" ? "active" : ""} onClick={() => setLayout("timeline")}>Timeline</button>
        </div>
        <span>{filteredVideos.length} {filteredVideos.length === 1 ? "video" : "videos"}</span>
      </div>

      {loading ? (
        <section className="panel video-empty-state"><strong>Loading videos...</strong></section>
      ) : filteredVideos.length ? (
        layout === "library" ? (
          <div className="video-library-grid">
            {filteredVideos.map((video) => (
              <VideoLibraryCard
                comparisonSelected={comparisonIds.includes(video.id)}
                key={video.id}
                onCompare={() => toggleComparison(video.id)}
                onOpen={() => openVideo(video)}
                session={sessions.find((session) => session.id === video.sessionId)}
                video={video}
              />
            ))}
          </div>
        ) : (
          <div className="video-timeline">
            {Object.entries(timelineGroups).map(([period, periodVideos]) => (
              <section key={period}>
                <div className="video-timeline-label"><span>{period}</span><i /></div>
                <div className="video-library-grid">
                  {periodVideos.map((video) => (
                    <VideoLibraryCard
                      comparisonSelected={comparisonIds.includes(video.id)}
                      key={video.id}
                      onCompare={() => toggleComparison(video.id)}
                      onOpen={() => openVideo(video)}
                      session={sessions.find((session) => session.id === video.sessionId)}
                      video={video}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <section className="panel video-empty-state">
          <span className="video-empty-icon" aria-hidden="true">▶</span>
          <strong>{visibleVideos.length ? "No videos match these filters." : "No lesson videos yet."}</strong>
          <p>
            {visibleVideos.length
              ? "Adjust the search or filters to see more of your library."
              : "After your next session, your coach can upload your swing video here."}
          </p>
          {viewerRole === "user" && <button className="primary-action" onClick={() => setShowUpload(true)}>＋ Upload Video</button>}
        </section>
      )}

      {showUpload && (
        <div className="video-modal-overlay">
          <form className="video-upload-modal" onSubmit={uploadVideo}>
            <div className="video-modal-header">
              <div>
                <p className="eyebrow">Add to library</p>
                <h2>Upload video</h2>
              </div>
              <button aria-label="Close upload dialog" className="icon-button" onClick={() => setShowUpload(false)} type="button">×</button>
            </div>

            <label className="video-file-picker">
              <input
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setVideoFile(file);
                  if (file && !uploadTitle) setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
                }}
                required
                type="file"
              />
              <span aria-hidden="true">▶</span>
              <strong>{videoFile ? videoFile.name : "Choose a video file"}</strong>
              <small>MP4, MOV, WebM, or M4V · up to 500 MB</small>
            </label>

            <div className="video-form-grid">
              <label className="video-form-wide"><span>Title</span><input maxLength={120} onChange={(event) => setUploadTitle(event.target.value)} required value={uploadTitle} /></label>
              <label><span>Video type</span><select value={uploadType} onChange={(event) => setUploadType(event.target.value as VideoType)}>{VIDEO_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label><span>Visibility</span><select value={uploadVisibility} onChange={(event) => setUploadVisibility(event.target.value as VideoVisibility)}>{viewerRole === "user" ? <><option>User only</option><option>Coach + User</option></> : viewerRole === "coach" ? <><option>Coach + User</option><option>Admin only</option></> : <><option>User only</option><option>Coach + User</option><option>Admin only</option></>}</select></label>
              <label><span>Related session</span><select value={uploadSessionId} onChange={(event) => setUploadSessionId(event.target.value)}><option value="">No session attached</option>{sessions.map((session) => <option key={session.id} value={session.id}>{formatDate(session.date)} · {session.title}</option>)}</select></label>
              <label><span>Club used</span><select value={uploadClub} onChange={(event) => setUploadClub(event.target.value)}><option value="">Not specified</option>{clubOptions.map((club) => <option key={club} value={club}>{getClubDisplayName(club)}</option>)}</select></label>
              <label><span>Swing type</span><select value={uploadSwingType} onChange={(event) => setUploadSwingType(event.target.value as VideoSwingType | "")}><option value="">Not specified</option>{VIDEO_SWING_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label><span>Tags</span><input onChange={(event) => setUploadTags(event.target.value)} placeholder="tempo, takeaway, lesson" value={uploadTags} /></label>
              <label className="video-form-wide"><span>Description or notes</span><textarea onChange={(event) => setUploadDescription(event.target.value)} placeholder="Context, lesson recap, or what to review..." value={uploadDescription} /></label>
            </div>

            {uploadState === "saving" && (
              <div className="coach-upload-progress" aria-label={`Upload ${uploadProgress}% complete`}>
                <span style={{ width: `${uploadProgress}%` }} />
                <strong>{uploadProgress}%</strong>
              </div>
            )}

            <div className="video-modal-actions">
              <span>{libraryMessage}</span>
              <div className="button-row">
                <button className="secondary-action" onClick={() => setShowUpload(false)} type="button">Cancel</button>
                <button className="primary-action" disabled={uploadState === "saving"} type="submit">
                  {uploadState === "saving" ? "Saving..." : "Upload Video"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function ImportView({
  csvText,
  importCsv,
  importPhotoShots,
  importMessage,
  lastImport,
  setCsvText,
}: {
  csvText: string;
  importCsv: (submissionType?: LastImport["submissionType"]) => void;
  importPhotoShots: (shots: Shot[], simulator: string, metadata: PhotoImportMetadata) => void;
  importMessage: string;
  lastImport: LastImport;
  setCsvText: (value: string) => void;
}) {
  const [importMode, setImportMode] = useState<"api" | "file" | "photo">("api");
  const [photoScans, setPhotoScans] = useState<PhotoScanResult[]>([]);
  const [photoScanState, setPhotoScanState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoStatus, setPhotoStatus] = useState("Choose up to five TrackMan or simulator screenshots.");
  const [csvFileName, setCsvFileName] = useState("Demo rows");
  const [csvFileStatus, setCsvFileStatus] = useState("Choose a CSV file or paste exported rows.");

  async function readCsvFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) {
      setCsvFileStatus("Use a CSV file smaller than 5 MB.");
      return;
    }

    try {
      const contents = await file.text();
      const shots = parseCsv(contents);
      if (!shots.length) {
        setCsvFileStatus("No recognizable shot rows were found in this CSV.");
        return;
      }
      setCsvText(contents);
      setCsvFileName(file.name);
      setCsvFileStatus(`${shots.length} ${shots.length === 1 ? "shot row is" : "shot rows are"} ready to analyze.`);
    } catch {
      setCsvFileStatus("This CSV could not be read. Try exporting it again.");
    }
  }

  async function scanPhotoFiles(files: File[]) {
    const selectedFiles = files.slice(0, 5);
    if (!selectedFiles.length) return;

    const supportedFiles = selectedFiles.filter((file) =>
      ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 15 * 1024 * 1024,
    );
    const rejectedFiles: PhotoScanResult[] = selectedFiles
      .filter((file) => !supportedFiles.includes(file))
      .map((file, index) => ({
        id: `rejected-${Date.now()}-${index}`,
        fileName: file.name,
        status: "error",
        message: "Use a PNG, JPG, or WebP image smaller than 15 MB.",
      }));

    setPhotoScans(rejectedFiles);
    if (!supportedFiles.length) {
      setPhotoScanState("error");
      setPhotoStatus("No supported images were selected.");
      return;
    }

    setPhotoScanState("scanning");
    setPhotoProgress(0);
    setPhotoStatus("Starting the private photo reader...");

    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
    const results: PhotoScanResult[] = [...rejectedFiles];

    try {
      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, {
        logger: (message) => {
          const currentProgress = Math.round(message.progress * 100);
          setPhotoProgress(currentProgress);
          setPhotoStatus(
            message.status === "recognizing text"
              ? `Reading shot data... ${currentProgress}%`
              : "Preparing the photo reader...",
          );
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });

      for (let index = 0; index < supportedFiles.length; index += 1) {
        const file = supportedFiles[index];
        setPhotoStatus(`Reading ${file.name} (${index + 1} of ${supportedFiles.length})...`);

        try {
          const [recognition, metadata] = await Promise.all([
            worker.recognize(
              file,
              { rotateAuto: true },
              { text: true, tsv: true },
            ),
            readPhotoMetadata(file),
          ]);
          const parsed = parsePhotoOcr(recognition.data.text, file.name, index, recognition.data.tsv ?? undefined);
          results.push({
            id: `scan-${Date.now()}-${index}`,
            fileName: file.name,
            status: "ready",
            simulator: parsed.simulator,
            shot: parsed.shot,
            confidence: Math.round(recognition.data.confidence),
            metadata,
          });
        } catch (error) {
          results.push({
            id: `scan-error-${Date.now()}-${index}`,
            fileName: file.name,
            status: "error",
            message: error instanceof Error ? error.message : "This image could not be read.",
          });
        }
      }
    } catch {
      setPhotoScanState("error");
      setPhotoStatus("The photo reader could not start. Check your connection and try again.");
      return;
    } finally {
      await worker?.terminate();
    }

    const readyCount = results.filter((result) => result.status === "ready").length;
    setPhotoScans(results);
    setPhotoProgress(100);
    setPhotoScanState(readyCount ? "ready" : "error");
    setPhotoStatus(
      readyCount
        ? `${readyCount} ${readyCount === 1 ? "photo is" : "photos are"} ready to review.`
        : "No readable shot data was found. Try a sharper, tighter crop.",
    );
  }

  const readyPhotoScans = photoScans.filter(
    (result): result is Extract<PhotoScanResult, { status: "ready" }> => result.status === "ready",
  );
  const detectedSimulators = [...new Set(readyPhotoScans.map((result) => result.simulator))];
  const photoSimulator = detectedSimulators.length === 1 ? detectedSimulators[0] : "Simulator photos";
  const photoMetadata = readyPhotoScans.reduce<PhotoImportMetadata>(
    (combined, result) => ({
      location: combined.location ?? result.metadata.location,
      capturedAt: combined.capturedAt ?? result.metadata.capturedAt,
      latitude: combined.latitude ?? result.metadata.latitude,
      longitude: combined.longitude ?? result.metadata.longitude,
    }),
    {},
  );

  return (
    <section className="import-grid">
      <div className="panel panel-large">
        <PanelHeader kicker="Import" title="Add simulator data" meta={importMessage} />
        <div className="import-mode-grid">
          {[
            { id: "api", label: "API feed", body: "Connect TrackMan, Full Swing, GCQuad, SkyTrak, or Mevo+." },
            { id: "file", label: "CSV file", body: "Paste exported rows or upload a CSV from your simulator." },
            { id: "photo", label: "Session photos", body: "Upload TrackMan or other simulator screenshots." },
          ].map((mode) => (
            <button
              className={cls("import-mode", importMode === mode.id && "active")}
              key={mode.id}
              onClick={() => setImportMode(mode.id as "api" | "file" | "photo")}
            >
              <strong>{mode.label}</strong>
              <span>{mode.body}</span>
            </button>
          ))}
        </div>

        {importMode === "api" && (
          <div className="import-panel">
            <div className="connection-grid">
              {SIMULATOR_SOURCES.map((source) => (
                <button className={cls("source-tile", source.tone === "dark" && "dark-logo")} key={source.label}>
                  <span className="source-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`${source.label} logo`} src={source.logo} />
                  </span>
                  <strong>{source.label}</strong>
                </button>
              ))}
            </div>
            <p className="muted-copy">API feed is staged as a connection path; imported sessions will save automatically after sign-in.</p>
          </div>
        )}

        {importMode === "file" && (
          <div className="import-panel">
            <input
              className="file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void readCsvFile(file);
              }}
            />
            <div className="csv-file-status" role="status">
              <strong>{csvFileName}</strong>
              <span>{csvFileStatus}</span>
            </div>
            <textarea
              className="csv-input"
              value={csvText}
              onChange={(event) => {
                setCsvText(event.target.value);
                setCsvFileName("Pasted rows");
                setCsvFileStatus(`${parseCsv(event.target.value).length} shot rows are ready to analyze.`);
              }}
              spellCheck={false}
            />
            <div className="button-row">
              <button
                className="secondary-action"
                onClick={() => {
                  setCsvText(DEMO_CSV);
                  setCsvFileName("Demo rows");
                  setCsvFileStatus(`${parseCsv(DEMO_CSV).length} demo shot rows are ready to analyze.`);
                }}
              >
                Load Full Swing demo rows
              </button>
              <button className="primary-action" onClick={() => importCsv("CSV / Excel")}>
                <span>⇧</span>
                Analyze rows
              </button>
            </div>
          </div>
        )}

        {importMode === "photo" && (
          <div className="import-panel">
            <input
              className="file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={photoScanState === "scanning"}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void scanPhotoFiles(files);
              }}
            />
            <div className="photo-drop">
              <strong>{photoScanState === "scanning" ? "Reading your data" : "TrackMan photo reader"}</strong>
              <span>{photoStatus}</span>
              {photoScanState === "scanning" && (
                <progress aria-label="Photo scan progress" max="100" value={photoProgress} />
              )}
            </div>

            {photoScans.length > 0 && (
              <div className="photo-scan-results" aria-live="polite">
                {photoScans.map((result) => (
                  <article className={cls("photo-scan-card", result.status === "error" && "error")} key={result.id}>
                    <div className="photo-scan-heading">
                      <div>
                        <strong>{result.fileName}</strong>
                        <span>{result.status === "ready" ? `${result.simulator} · OCR confidence ${result.confidence}%` : "Needs another photo"}</span>
                      </div>
                      <span className={cls("scan-status", result.status)}>{result.status === "ready" ? "Ready" : "Unreadable"}</span>
                    </div>

                    {result.status === "ready" ? (
                      <>
                        <div className="photo-metric-list">
                          <div><span>Club</span><strong>{result.shot.club}</strong></div>
                          {result.shot.detectedMetrics?.map((metric) => (
                            <div key={metric}>
                              <span>{PHOTO_METRIC_LABELS[metric]}</span>
                              <strong>{formatPhotoMetric(metric, result.shot[metric])}</strong>
                            </div>
                          ))}
                        </div>
                        {result.shot.detectedMetrics && result.shot.detectedMetrics.length < 7 && (
                          <p className="scan-note">Only detected values are shown. Missing dashboard fields will display as NA.</p>
                        )}
                        <p className="scan-note">
                          Photo location: {result.metadata.location ?? LOCATION_UNAVAILABLE}
                        </p>
                      </>
                    ) : (
                      <p className="scan-note">{result.message}</p>
                    )}
                  </article>
                ))}
              </div>
            )}

            {readyPhotoScans.length > 0 && (
              <div className="button-row">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setPhotoScans([]);
                    setPhotoScanState("idle");
                    setPhotoProgress(0);
                    setPhotoStatus("Choose up to five TrackMan or simulator screenshots.");
                  }}
                >
                  Clear
                </button>
                <button
                  className="primary-action"
                  onClick={() => importPhotoShots(readyPhotoScans.map((result) => result.shot), photoSimulator, photoMetadata)}
                >
                  <span>⇧</span>
                  Import detected data
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <LastImportPanel lastImport={lastImport} />
    </section>
  );
}

function LastImportPanel({ lastImport }: { lastImport: LastImport }) {
  const importedClubs = Array.from(new Set(lastImport.shots.map((shot) => getClubDisplayName(shot.club))));
  const detailRows = [
    ["Date", formatFullDate(lastImport.date)],
    ["Location", lastImport.location],
    ["Sim", lastImport.simulator],
    ["Submission type", lastImport.submissionType],
    ["Club", importedClubs.join(", ") || "NA"],
  ];
  const averageRows = [
    ["Shots", `${lastImport.shots.length}`],
    ["Carry", formatAvailableMetric(averageMetric(lastImport.shots, "carry"), "yd")],
    ["Total", formatAvailableMetric(averageMetric(lastImport.shots, "total"), "yd")],
    ["Ball speed", formatAvailableMetric(averageMetric(lastImport.shots, "ballSpeed"), "mph")],
    ["Club speed", formatAvailableMetric(averageMetric(lastImport.shots, "clubSpeed"), "mph")],
    ["Smash", formatAvailableMetric(averageMetric(lastImport.shots, "smash"), "", 2)],
    ["Launch", formatAvailableMetric(averageMetric(lastImport.shots, "launch"), "deg")],
    ["Apex", formatAvailableMetric(averageMetric(lastImport.shots, "apex"), "ft")],
    ["Curve", formatAvailableMetric(averageMetric(lastImport.shots, "curve"), "ft")],
    ["Launch direction", formatAvailableMetric(averageMetric(lastImport.shots, "horizontalAngle"), "deg")],
    ["Spin", formatAvailableMetric(averageMetric(lastImport.shots, "spin"), "rpm", 0)],
    ["Descent", formatAvailableMetric(averageMetric(lastImport.shots, "descent"), "deg")],
  ];

  return (
    <div className="panel import-summary-panel">
      <PanelHeader kicker="Last import" title={lastImport.location} meta={`${lastImport.simulator} · ${lastImport.shots.length} shots`} />
      <dl className="import-detail-list">
        {detailRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="import-average-heading">
        <span>Average stats</span>
      </div>
      <div className="benchmark-list import-average-list">
        {averageRows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  club,
  label,
  metricKey,
  value,
  unit,
  tone,
}: {
  club: string;
  label: string;
  metricKey: string;
  value: number | string;
  unit: string;
  tone: "green" | "blue" | "amber" | "coral";
}) {
  const definition = METRIC_DEFINITIONS[metricKey];
  const isAvailable = typeof value === "number" ? Number.isFinite(value) : value !== "NA" && value !== "NaN";

  return (
    <article className={cls("kpi", tone)} tabIndex={0}>
      <span className="kpi-title">
        <KpiGraphic metricKey={metricKey} />
        <span>{label}</span>
      </span>
      <strong>
        {isAvailable ? value : "NA"}
        {isAvailable && <small>{unit}</small>}
      </strong>
      {definition && (
        <div className="metric-tooltip" role="tooltip">
          <b>{definition.title}</b>
          <p>{definition.description}</p>
          <em>{definition.benchmark(club)}</em>
        </div>
      )}
    </article>
  );
}

function KpiGraphic({ metricKey }: { metricKey: string }) {
  switch (metricKey) {
    case "quality":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M16 4l9 3v7c0 6.2-3.6 10.6-9 14-5.4-3.4-9-7.8-9-14V7l9-3z" />
          <path d="M11 16l3.2 3.2L21.5 12" />
        </svg>
      );
    case "carry":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M5 24c4.7-10.8 12-16 22-16" />
          <path d="M22 7h5v5" />
          <circle cx="6" cy="24" r="2" />
        </svg>
      );
    case "dispersion":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="9" />
          <circle cx="16" cy="16" r="3" />
          <path d="M5 16h6M21 16h6M16 5v6M16 21v6" />
          <circle cx="9" cy="21" r="1.5" />
          <circle cx="23" cy="12" r="1.5" />
        </svg>
      );
    case "smash":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="4" />
          <path d="M16 4v6M16 22v6M4 16h6M22 16h6M7.5 7.5l4.2 4.2M20.3 20.3l4.2 4.2M24.5 7.5l-4.2 4.2M11.7 20.3l-4.2 4.2" />
        </svg>
      );
    case "ballSpeed":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M4 11h10M3 16h12M6 21h8" />
          <circle cx="22" cy="16" r="6" />
          <path d="M20 12c2 1.4 3.3 3.7 3.6 7" />
        </svg>
      );
    case "clubSpeed":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M20 4c-1.2 7.3-4.8 13.4-11 18" />
          <path d="M7 23l5 5 3-3-5-5-3 3z" />
          <path d="M20 4c4.8 3.8 6.4 9 4.8 15" />
        </svg>
      );
    case "total":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M5 23h22" />
          <path d="M8 23V10l9-3v8l-9-3" />
          <path d="M14 18h9l-3-3M23 18l-3 3" />
        </svg>
      );
    case "apex":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M5 24c4.8-12 9.5-18 14-18s6.8 6 8 18" />
          <path d="M16 9v12" />
          <path d="M12 13l4-4 4 4" />
        </svg>
      );
    case "spin":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M23.5 9.5A9 9 0 0 0 7.8 14" />
          <path d="M22 5v6h6" />
          <path d="M8.5 22.5A9 9 0 0 0 24.2 18" />
          <path d="M10 27v-6H4" />
        </svg>
      );
    case "launch":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M6 25h20" />
          <path d="M8 23l14-14" />
          <path d="M16 9h6v6" />
          <path d="M9 18c4 0 7 2 9 6" />
        </svg>
      );
    case "descent":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M6 25h20" />
          <path d="M8 8c8 2 13.7 7.4 17 16" />
          <path d="M22 18l3 6-6-2" />
        </svg>
      );
    case "faceToPath":
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M6 23c5.5-7.8 11.8-12.4 20-14" />
          <path d="M8 9l16 14" />
          <path d="M20 8l6 1-4 4" />
          <path d="M20 23h4v4" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M6 22l7-7 5 4 8-10" />
          <path d="M21 9h5v5" />
        </svg>
      );
  }
}

function MetricMatrix({ summary }: { summary?: ClubSummary }) {
  if (!summary) return <EmptyState title="No club selected" body="Choose a club to inspect its delivery numbers." />;

  const rows = [
    ["Proximity", formatAvailableMetric(summary.proximity, "ft")],
    ["Spin axis", formatAvailableMetric(summary.spinAxis, "deg")],
    ["Side carry", formatAvailableMetric(summary.sideCarry, "yd")],
    ["Face to path", formatAvailableMetric(summary.faceToPath, "deg")],
    ["Apex", formatAvailableMetric(summary.apex, "ft")],
    ["Descent", formatAvailableMetric(summary.descent, "deg")],
    ["Curve", formatAvailableMetric(summary.curve, "ft")],
    ["Launch direction", formatAvailableMetric(summary.horizontalAngle, "deg")],
  ];

  return (
    <div className="metric-matrix">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function BenchmarkList({ club }: { club: string }) {
  const target = CLUB_TARGETS[club];
  if (!target) return <EmptyState title="Benchmarks are NA" body="No reference window is available for this club." />;
  const rows = [
    ["Carry", `${target.carry} yd`],
    ["Ball speed", `${target.ballSpeed} mph`],
    ["Club speed", `${target.clubSpeed} mph`],
    ["Launch", `${target.launch} deg`],
    ["Spin", `${target.spin} rpm`],
    ["Descent", `${target.descent} deg`],
  ];

  return (
    <div className="benchmark-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ProStatsList({ club }: { club: string }) {
  const reference = PRO_REFERENCE_STATS[club];
  if (!reference) return <EmptyState title="Tour stats are NA" body="No professional reference is available for this club." />;
  const tours = [
    { label: "PGA Tour avg", stats: reference.pga },
    { label: "LPGA Tour avg", stats: reference.lpga },
  ];

  return (
    <div className="pro-stat-list">
      {tours.map(({ label, stats }) => {
        const rows = [
          ["Ball speed", `${stats.ballSpeed} mph`],
          ["Club speed", `${stats.clubSpeed} mph`],
          ["Launch", `${stats.launch} deg`],
          ["Spin", `${stats.spin} rpm`],
          ["Descent", `${stats.descent} deg`],
          ["Total", `${stats.total} yd`],
        ];

        return (
          <article className="pro-stat-card" key={label}>
            <header>
              <span>{label}</span>
              <strong>{stats.carry} yd</strong>
              <small>carry</small>
            </header>
            <div className="pro-stat-grid">
              {rows.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        );
      })}
      <p className="pro-stat-note">Use these as reference points, not requirements. Speed profile, age, contact, and shot intent all change the right target.</p>
    </div>
  );
}

function answersFromPracticeProfile(profile: UserPracticeProfile): OnboardingAnswers {
  return {
    ageRange: profile.ageRange,
    handedness: profile.handedness,
    skillLevel: profile.skillLevel,
    handicap: profile.handicap,
    simExperience: profile.simExperience,
    simulatorGoals: profile.simulatorGoals,
    goals: profile.goals,
    frustrations: profile.frustrations,
    practiceStyle: profile.practiceStyle,
    timeAvailable: profile.timeAvailable,
    frequency: profile.frequency,
    experienceStyle: profile.experienceStyle,
    coachNotes: profile.coachNotes,
  };
}

function OnboardingFlow({
  initialProfile,
  onRegister,
}: {
  initialProfile: UserPracticeProfile | null;
  onRegister: (profile: UserPracticeProfile) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() =>
    initialProfile ? answersFromPracticeProfile(initialProfile) : {},
  );
  useEffect(() => {
    const draft = readStoredOnboardingAnswers();
    if (Object.keys(draft).length) {
      queueMicrotask(() => setAnswers(draft));
      return;
    }

    if (initialProfile) {
      const nextAnswers = answersFromPracticeProfile(initialProfile);
      queueMicrotask(() => setAnswers(nextAnswers));
    }
  }, [initialProfile]);

  const isFinalStep = step >= ONBOARDING_QUESTIONS.length;
  const currentQuestion = ONBOARDING_QUESTIONS[step];
  const progress = Math.min(100, Math.round((step / ONBOARDING_QUESTIONS.length) * 100));
  const userPracticeProfile = buildUserPracticeProfile(answers);
  const recommendations = buildPracticeRecommendations(userPracticeProfile);
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const selectedValues = asArray(currentAnswer);
  const canContinue = !currentQuestion || currentQuestion.type === "text" || selectedValues.length > 0;

  function updateAnswer(question: OnboardingQuestion, value: string) {
    let nextValue: string | string[];

    if (question.type === "single") {
      nextValue = value;
    } else {
      const currentValues = asArray(answers[question.id]);
      const isSelected = currentValues.includes(value);
      if (!isSelected && question.maxSelections && currentValues.length >= question.maxSelections) {
        nextValue = currentValues;
      } else {
        nextValue = isSelected ? currentValues.filter((item) => item !== value) : [...currentValues, value];
      }
    }

    const nextAnswers = { ...answers, [question.id]: nextValue };
    setAnswers(nextAnswers);
    storeOnboardingAnswers(nextAnswers);
  }

  function updateTextAnswer(question: OnboardingQuestion, value: string) {
    const nextAnswers = { ...answers };
    if (value.trim()) {
      nextAnswers[question.id] = value;
    } else {
      delete nextAnswers[question.id];
    }
    setAnswers(nextAnswers);
    storeOnboardingAnswers(nextAnswers);
  }

  function goNext() {
    if (!currentQuestion || !canContinue) return;
    setStep((value) => Math.min(value + 1, ONBOARDING_QUESTIONS.length));
  }

  if (isFinalStep) {
    const profileRows = [
      ["Level", userPracticeProfile.skillLevel],
      ["Handicap", userPracticeProfile.handicap],
      ["Time", userPracticeProfile.timeAvailable],
      ["Rhythm", userPracticeProfile.frequency],
    ];

    return (
      <main className="onboarding-shell">
        <section className="onboarding-card final">
          <header className="onboarding-brand">
            <div className="onboarding-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Free Range Golf logo" src="/logos/free-range-golf.png" />
            </div>
            <div>
              <span>Free Range Golf</span>
              <strong>Practice profile ready</strong>
            </div>
          </header>

          <div className="onboarding-final-hero">
            <p className="eyebrow">Personalized path</p>
            <h1>{recommendations.pathTitle}</h1>
            <p>{recommendations.summary}</p>
          </div>

          <div className="onboarding-summary-grid">
            <article>
              <span>Focus areas</span>
              <div className="summary-chip-row">
                {recommendations.focusAreas.map((item) => (
                  <strong key={item}>{item}</strong>
                ))}
              </div>
            </article>
            <article>
              <span>Starter drills</span>
              <ul>
                {recommendations.drills.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <span>Simulator modes</span>
              <ul>
                {recommendations.simulatorModes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <span>Training plan</span>
              <p>{recommendations.trainingPlan}</p>
            </article>
            <article>
              <span>Lesson recommendation</span>
              <p>{recommendations.lessonRecommendation}</p>
            </article>
            <article>
              <span>Next priorities</span>
              <ul>
                {recommendations.priorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <span>Optional suggestions</span>
              <ul>
                {recommendations.suggestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>

          <div className="onboarding-profile-strip">
            {profileRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="onboarding-actions final-actions">
            <button className="secondary-action" onClick={() => setStep(ONBOARDING_QUESTIONS.length - 1)}>
              Back
            </button>
            <button className="primary-action" onClick={() => onRegister(userPracticeProfile)}>
              Create account
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <header className="onboarding-brand">
          <div className="onboarding-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Free Range Golf logo" src="/logos/free-range-golf.png" />
          </div>
          <div>
            <span>Free Range Golf</span>
            <strong>Personalized practice setup</strong>
          </div>
        </header>

        <div className="onboarding-progress" aria-label="Onboarding progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="onboarding-question">
          <span>
            Question {step + 1} of {ONBOARDING_QUESTIONS.length}
          </span>
          <h1>{currentQuestion.title}</h1>
          <p>{currentQuestion.helper}</p>
        </div>

        {currentQuestion.type === "text" ? (
          <div className="onboarding-text-panel">
            <textarea
              maxLength={180}
              onChange={(event) => updateTextAnswer(currentQuestion, event.target.value)}
              placeholder={currentQuestion.placeholder}
              value={typeof currentAnswer === "string" ? currentAnswer : ""}
            />
            <span>{typeof currentAnswer === "string" ? `${currentAnswer.length}/180` : "Optional"}</span>
          </div>
        ) : (
          <div className={cls("onboarding-options", currentQuestion.display)}>
            {currentQuestion.options.map((option) => {
              const selected = selectedValues.includes(option.value);
              return (
                <button
                  className={cls("onboarding-option", selected && "selected")}
                  key={option.value}
                  onClick={() => updateAnswer(currentQuestion, option.value)}
                >
                  <strong>{option.label}</strong>
                  {option.detail && <span>{option.detail}</span>}
                </button>
              );
            })}
          </div>
        )}

        {currentQuestion.maxSelections && currentQuestion.type === "multi" && (
          <p className="onboarding-selection-note">
            {selectedValues.length}/{currentQuestion.maxSelections} selected
          </p>
        )}

        <div className="onboarding-actions">
          <button className="secondary-action" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            Back
          </button>
          <button className="primary-action" disabled={!canContinue} onClick={goNext}>
            Continue
          </button>
        </div>
      </section>
    </main>
  );
}

function LoginRequestModal({
  initialMode,
  onAuthenticated,
  onClose,
  onStatus,
}: {
  initialMode: LoginModalMode;
  onAuthenticated: () => void | Promise<boolean>;
  onClose: () => void;
  onStatus: (message: string) => void;
}) {
  const [mode, setMode] = useState<LoginModalMode>(initialMode);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState<RegisterAccountType>("player");
  const [state, setState] = useState<"idle" | "sending" | "link" | "reset">("idle");
  const [message, setMessage] = useState(
    initialMode === "register"
      ? "Create your account with an email and password."
      : "Enter your email and password to open your account.",
  );
  const [debugLoginUrl, setDebugLoginUrl] = useState("");

  function changeMode(nextMode: LoginModalMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setDebugLoginUrl("");
    setMessage(
      nextMode === "register"
        ? "Create your account with an email and password."
        : "Enter your email and password to open your account.",
    );
  }

  async function submitPasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setDebugLoginUrl("");
    if (mode === "register" && password !== confirmPassword) {
      const nextMessage = "Passwords must match.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      setState("idle");
      return;
    }
    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType, email, firstName, lastName, password, redirectPath: "/?tab=videos" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        debugLoginUrl?: string;
        error?: string;
        user?: AccountUser;
        needsRegistration?: boolean;
        publicMessage?: string;
      };
      const nextMessage = payload.publicMessage ?? payload.error ?? (mode === "register" ? "Account created." : "Signed in.");
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (payload.debugLoginUrl) setDebugLoginUrl(payload.debugLoginUrl);
      if (payload.needsRegistration) setMode("register");
      if (response.ok && payload.user) {
        await onAuthenticated();
        onClose();
      }
    } catch {
      const nextMessage = mode === "register" ? "The account could not be created right now." : "The account could not be opened right now.";
      setMessage(nextMessage);
      onStatus(nextMessage);
    } finally {
      setState("idle");
    }
  }

  async function sendLoginLink() {
    if (!email.trim()) {
      const nextMessage = "Enter your email first.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      return;
    }
    setState("link");
    setDebugLoginUrl("");
    try {
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectPath: "/?tab=videos" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        debugLoginUrl?: string;
        error?: string;
        needsRegistration?: boolean;
        publicMessage?: string;
      };
      const nextMessage = payload.publicMessage ?? payload.error ?? "Check your email for a secure login link.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (payload.debugLoginUrl) setDebugLoginUrl(payload.debugLoginUrl);
      if (payload.needsRegistration) setMode("register");
    } catch {
      const nextMessage = "The login email could not be sent right now.";
      setMessage(nextMessage);
      onStatus(nextMessage);
    } finally {
      setState("idle");
    }
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      const nextMessage = "Enter your email first.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      return;
    }
    setState("reset");
    setDebugLoginUrl("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({})) as {
        debugLoginUrl?: string;
        error?: string;
        publicMessage?: string;
      };
      const nextMessage = payload.publicMessage ?? payload.error ?? "If that email has an account, a password reset link will arrive shortly.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (payload.debugLoginUrl) setDebugLoginUrl(payload.debugLoginUrl);
    } catch {
      const nextMessage = "The password reset email could not be sent right now.";
      setMessage(nextMessage);
      onStatus(nextMessage);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="video-modal-overlay">
      <form className="video-upload-modal auth-modal" onSubmit={submitPasswordAuth}>
        <div className="video-modal-header">
          <div>
            <p className="eyebrow">Secure login</p>
            <h2>{mode === "register" ? "Create your account" : "Sign in to your account"}</h2>
          </div>
          <button aria-label="Close login dialog" className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <div className="login-mode-switch" aria-label="Account access options">
          <button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")} type="button">
            Sign in
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")} type="button">
            New user
          </button>
        </div>
        {mode === "register" && (
          <>
            <div className="account-type-switch" aria-label="Choose account type">
              <button
                className={accountType === "player" ? "active" : ""}
                onClick={() => setAccountType("player")}
                type="button"
              >
                <strong>Player</strong>
                <span>Watch lesson videos and track your practice.</span>
              </button>
              <button
                className={accountType === "coach" ? "active" : ""}
                onClick={() => setAccountType("coach")}
                type="button"
              >
                <strong>Coach</strong>
                <span>Upload videos and manage assigned players.</span>
              </button>
            </div>
            <div className="video-form-grid">
              <label>
                <span>First name</span>
                <input
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Joe"
                  required
                  type="text"
                  value={firstName}
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Derario"
                  required
                  type="text"
                  value={lastName}
                />
              </label>
            </div>
          </>
        )}
        <label className="video-form-wide">
          <span>Email</span>
          <input
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            placeholder="zac@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label className="video-form-wide">
          <span>Password</span>
          <input
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "register" ? "Create a password" : "Enter your password"}
            required
            type="password"
            value={password}
          />
        </label>
        {mode === "register" && (
          <label className="video-form-wide auth-confirm-password">
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        )}
        <p className="muted-copy">{message}</p>
        {mode === "login" && (
          <div className="auth-action-row">
            <button className="text-button login-inline-action" disabled={state !== "idle"} onClick={sendLoginLink} type="button">
              {state === "link" ? "Sending link..." : "Email me a login link"}
            </button>
            <button className="text-button login-inline-action" disabled={state !== "idle"} onClick={sendPasswordReset} type="button">
              {state === "reset" ? "Sending reset..." : "Forgot password? Send reset link"}
            </button>
          </div>
        )}
        {debugLoginUrl && (
          <div className="login-debug-card">
            <div>
              <strong>Local test link ready</strong>
              <span>This appears because email delivery is not configured on this local copy.</span>
            </div>
            <a className="secondary-action" href={debugLoginUrl}>
              Open secure link
            </a>
          </div>
        )}
        <button className="text-button login-inline-action" onClick={() => changeMode(mode === "login" ? "register" : "login")} type="button">
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
        <div className="video-modal-actions">
          <span />
          <div className="button-row">
            <button className="secondary-action" onClick={onClose} type="button">Cancel</button>
            <button className="primary-action" disabled={state !== "idle"} type="submit">
              {state === "sending" ? "Working..." : mode === "register" ? "Create Account" : "Log In"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PasswordResetModal({
  onClose,
  onStatus,
}: {
  onClose: () => void;
  onStatus: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState("Choose a new password for your Free Range Golf account.");

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      const nextMessage = "Passwords must match.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      return;
    }
    setState("saving");
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; publicMessage?: string };
      const nextMessage = payload.publicMessage ?? payload.error ?? "Your password has been updated.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (response.ok) onClose();
    } catch {
      const nextMessage = "The password could not be updated right now.";
      setMessage(nextMessage);
      onStatus(nextMessage);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="video-modal-overlay">
      <form className="video-upload-modal auth-modal" onSubmit={savePassword}>
        <div className="video-modal-header">
          <div>
            <p className="eyebrow">Password reset</p>
            <h2>Set a new password</h2>
          </div>
          <button aria-label="Close password reset dialog" className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <label className="video-form-wide">
          <span>New password</span>
          <input
            autoComplete="new-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter a new password"
            required
            type="password"
            value={password}
          />
        </label>
        <label className="video-form-wide auth-confirm-password">
          <span>Confirm password</span>
          <input
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter your new password"
            required
            type="password"
            value={confirmPassword}
          />
        </label>
        <p className="muted-copy">{message}</p>
        <div className="video-modal-actions">
          <span />
          <div className="button-row">
            <button className="secondary-action" onClick={onClose} type="button">Cancel</button>
            <button className="primary-action" disabled={state === "saving"} type="submit">
              {state === "saving" ? "Saving..." : "Save Password"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AccountGate({
  connectAccount,
  createAccount,
  syncStatus,
}: {
  connectAccount: () => void | Promise<boolean>;
  createAccount: () => void;
  syncStatus: string;
}) {
  return (
    <div className="account-overlay">
      <section className="account-modal">
        <div>
          <p className="eyebrow">Welcome to Free Range Golf</p>
          <h2>Create your account or sign in.</h2>
          <span>{syncStatus}</span>
        </div>
        <div className="account-choice-grid">
          <button className="account-choice primary-choice" onClick={connectAccount}>
            <strong>Sign in</strong>
            <span>Open your saved video library and simulator history.</span>
          </button>
          <button className="account-choice" onClick={createAccount}>
            <strong>Create a new account</strong>
            <span>Register with your email, then open your private video library from a secure link.</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function PanelHeader({
  action,
  kicker,
  meta,
  title,
}: {
  action?: React.ReactNode;
  kicker: string;
  meta?: string;
  title: string;
}) {
  return (
    <div className="panel-header">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {action}
    </div>
  );
}

const SHOT_MAP_COLORS = ["#35f27a", "#38bdf8", "#facc15", "#ef4444", "#a78bfa", "#2dd4bf"];
const SHOT_SHAPE_METRICS: NumericShotMetric[] = [
  "offline",
  "sideTotal",
  "sideCarry",
  "curve",
  "horizontalAngle",
  "faceAngle",
  "faceToPath",
  "spinAxis",
];

function limitChartValue(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hasShotShapeInput(shot: Shot) {
  return SHOT_SHAPE_METRICS.some((metric) => hasShotMetric(shot, metric));
}

function getRecordedShotFinish(shot: Shot) {
  return (
    getShotMetric(shot, "sideTotal") ??
    getShotMetric(shot, "offline") ??
    getShotMetric(shot, "sideCarry")
  );
}

function getShotFlightProfile(shot: Shot) {
  const carry = getShotMetric(shot, "carry") ?? 0;
  const total = getShotMetric(shot, "total") ?? carry;
  const launchDirection = getShotMetric(shot, "horizontalAngle") ?? getShotMetric(shot, "faceAngle") ?? 0;
  const startLineYards = Math.tan((launchDirection * Math.PI) / 180) * carry;
  const recordedCurve = getShotMetric(shot, "curve");
  const faceToPath = getShotMetric(shot, "faceToPath");
  const spinAxis = getShotMetric(shot, "spinAxis");
  const curveYards =
    recordedCurve !== undefined
      ? recordedCurve / 3
      : faceToPath !== undefined
        ? Math.tan(((faceToPath * 0.32) * Math.PI) / 180) * carry
        : spinAxis !== undefined
          ? Math.tan(((spinAxis * 0.22) * Math.PI) / 180) * carry
          : 0;
  const recordedCarrySide =
    getShotMetric(shot, "sideCarry") ??
    getShotMetric(shot, "offline") ??
    getShotMetric(shot, "sideTotal");
  const recordedTotalSide =
    getShotMetric(shot, "sideTotal") ??
    getShotMetric(shot, "offline") ??
    getShotMetric(shot, "sideCarry");
  const carrySide = recordedCarrySide ?? startLineYards + curveYards;
  const totalSide = recordedTotalSide ?? carrySide;
  const curveMagnitude = Math.abs(curveYards);
  const curveName =
    curveYards > 0
      ? curveMagnitude > 8 ? "Slice" : curveMagnitude > 2 ? "Fade" : "Straight"
      : curveYards < 0
        ? curveMagnitude > 8 ? "Hook" : curveMagnitude > 2 ? "Draw" : "Straight"
        : "Straight";
  const startName = startLineYards > 3 ? "Push" : startLineYards < -3 ? "Pull" : "";
  const shape = curveName === "Straight" ? startName || "Straight" : `${startName ? `${startName} ` : ""}${curveName}`;

  return {
    carry,
    total,
    startLineYards,
    curveYards,
    carrySide,
    totalSide,
    shape,
  };
}

function formatSignedMetric(value: number | undefined, unit: string, digits = 1) {
  if (value === undefined || !Number.isFinite(value)) return "NA";
  const absoluteValue = Math.abs(value);
  const formatted = digits === 0 ? Math.round(absoluteValue).toString() : absoluteValue.toFixed(digits);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatted}${unit ? ` ${unit}` : ""}`;
}

function formatLateralDistance(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "NA";
  if (Math.abs(value) < 0.05) return "Center";
  return `${Math.abs(value).toFixed(1)} yd ${value < 0 ? "L" : "R"}`;
}

function ShotMap({ shots }: { shots: Shot[] }) {
  const carryShots = shots.filter((shot) => hasShotMetric(shot, "carry"));
  if (!carryShots.length) {
    return <EmptyState title="Carry data is NA" body="This session did not include enough distance data to draw a shot pattern." />;
  }

  const clubNames = Array.from(new Set(carryShots.map((shot) => shot.club))).slice(0, 6);
  const profiles = carryShots.map((shot) => getShotFlightProfile(shot));
  const rawMaxDistance = Math.max(...profiles.map((profile) => Math.max(profile.carry, profile.total)), 1);
  const distanceStep = rawMaxDistance <= 150 ? 25 : 50;
  const maxDistance = Math.max(distanceStep, Math.ceil(rawMaxDistance / distanceStep) * distanceStep);
  const rawLateralExtent = Math.max(
    ...profiles.flatMap((profile) => [
      Math.abs(profile.startLineYards),
      Math.abs(profile.carrySide),
      Math.abs(profile.totalSide),
    ]),
    12,
  );
  const lateralStep = rawLateralExtent <= 20 ? 5 : rawLateralExtent <= 40 ? 10 : 20;
  const lateralExtent = Math.ceil(rawLateralExtent / lateralStep) * lateralStep;
  const distanceTicks = Array.from(
    { length: Math.floor(maxDistance / distanceStep) + 1 },
    (_, index) => index * distanceStep,
  );
  const lateralTicks = Array.from(
    { length: Math.floor((lateralExtent * 2) / lateralStep) + 1 },
    (_, index) => -lateralExtent + index * lateralStep,
  );
  const plot = { left: 82, right: 868, top: 34, bottom: 430 };
  const xScale = (yards: number) =>
    plot.left + ((limitChartValue(yards, -lateralExtent, lateralExtent) + lateralExtent) / (lateralExtent * 2)) * (plot.right - plot.left);
  const yScale = (yards: number) =>
    plot.bottom - (limitChartValue(yards, 0, maxDistance) / maxDistance) * (plot.bottom - plot.top);
  const hasShapeData = carryShots.some(hasShotShapeInput);
  const deliverySummary = [
    ["Club path", formatSignedMetric(averageMetric(carryShots, "clubPath"), "deg")],
    ["Face angle", formatSignedMetric(averageMetric(carryShots, "faceAngle"), "deg")],
    ["Face-to-path", formatSignedMetric(averageMetric(carryShots, "faceToPath"), "deg")],
    ["Launch direction", formatSignedMetric(averageMetric(carryShots, "horizontalAngle"), "deg")],
  ];

  return (
    <div className="shot-map">
      <div className="shot-map-summary">
        {deliverySummary.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="shot-flight-chart">
        <svg viewBox="0 0 950 480" role="img" aria-label="Top-down shot flight chart with distance and lateral yardage">
          <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} rx="6" fill="var(--surface-soft)" />

          {distanceTicks.map((distance) => {
            const y = yScale(distance);
            return (
              <g key={`distance-${distance}`}>
                <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
                <text x={plot.left - 12} y={y + 4} textAnchor="end">{distance} yd</text>
              </g>
            );
          })}

          {lateralTicks.map((distance) => {
            const x = xScale(distance);
            return (
              <g key={`lateral-${distance}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={plot.top}
                  y2={plot.bottom}
                  stroke={distance === 0 ? "#35f27a" : "rgba(255,255,255,0.09)"}
                  strokeDasharray={distance === 0 ? "7 6" : undefined}
                  strokeWidth={distance === 0 ? "1.8" : "1"}
                />
                <text x={x} y={plot.bottom + 25} textAnchor="middle">
                  {distance === 0 ? "Target" : `${Math.abs(distance)}${distance < 0 ? "L" : "R"}`}
                </text>
              </g>
            );
          })}

          <text className="chart-axis-title" x={(plot.left + plot.right) / 2} y="474" textAnchor="middle">Offline distance (yards)</text>
          <text className="chart-axis-title" x="19" y={(plot.top + plot.bottom) / 2} textAnchor="middle" transform={`rotate(-90 19 ${(plot.top + plot.bottom) / 2})`}>
            Distance from tee
          </text>

          {carryShots.map((shot, index) => {
            const profile = profiles[index];
            const clubIndex = clubNames.indexOf(shot.club);
            const color = SHOT_MAP_COLORS[clubIndex] ?? SHOT_MAP_COLORS[0];
            const carryY = yScale(profile.carry);
            const carryX = xScale(profile.carrySide);
            const controlOneX = xScale(profile.startLineYards * 0.34);
            const controlOneY = yScale(profile.carry * 0.34);
            const controlTwoX = xScale(profile.startLineYards * 0.82 + profile.curveYards * 0.3);
            const controlTwoY = yScale(profile.carry * 0.78);
            const totalX = xScale(profile.totalSide);
            const totalY = yScale(profile.total);
            const path = `M ${xScale(0)} ${yScale(0)} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${carryX} ${carryY}`;
            const recordedFinish = getRecordedShotFinish(shot);
            const displayedFinish = recordedFinish ?? (hasShotShapeInput(shot) ? profile.totalSide : undefined);

            return (
              <g key={shot.id}>
                <title>
                  {`Shot ${index + 1}: ${getClubDisplayName(shot.club)}, ${hasShotShapeInput(shot) ? profile.shape : "shape NA"}, ${profile.carry.toFixed(1)} yd carry, ${formatLateralDistance(displayedFinish)}${recordedFinish === undefined && displayedFinish !== undefined ? " estimated finish" : ""}`}
                </title>
                <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="3" opacity="0.72" />
                {profile.total > profile.carry + 0.5 && (
                  <line
                    x1={carryX}
                    x2={totalX}
                    y1={carryY}
                    y2={totalY}
                    stroke={color}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    strokeWidth="2"
                    opacity="0.65"
                  />
                )}
                <circle cx={carryX} cy={carryY} fill="#111d19" r="7" stroke={color} strokeWidth="2.5" />
                <text className="shot-number" x={carryX} y={carryY + 3} textAnchor="middle">{index + 1}</text>
              </g>
            );
          })}

          <circle cx={xScale(0)} cy={yScale(0)} fill="#35f27a" r="5" />
          <text className="tee-label" x={xScale(0) + 10} y={yScale(0) - 10}>Tee</text>
        </svg>
      </div>

      <div className="map-legend">
        {clubNames.map((club, index) => (
          <span key={club}>
            <i style={{ background: SHOT_MAP_COLORS[index] }} />
            {getClubDisplayName(club)}
          </span>
        ))}
        <span><b className="flight-key" />Carry flight</span>
        <span><b className="roll-key" />Rollout</span>
      </div>

      <div className="shot-shape-table-shell">
        <table className="shot-shape-table">
          <thead>
            <tr>
              <th>Shot</th>
              <th>Club</th>
              <th>Shape</th>
              <th>Carry</th>
              <th>Finish</th>
              <th>Curve</th>
              <th>Launch dir.</th>
              <th>Club path</th>
              <th>Face angle</th>
              <th>Face-to-path</th>
            </tr>
          </thead>
          <tbody>
            {carryShots.map((shot, index) => {
              const clubIndex = clubNames.indexOf(shot.club);
              const recordedFinish = getRecordedShotFinish(shot);
              const displayedFinish = recordedFinish ?? (hasShotShapeInput(shot) ? profiles[index].totalSide : undefined);
              return (
                <tr key={shot.id}>
                  <td><span className="shot-index" style={{ background: SHOT_MAP_COLORS[clubIndex] ?? SHOT_MAP_COLORS[0] }}>{index + 1}</span></td>
                  <td>{getClubDisplayName(shot.club)}</td>
                  <td><strong>{hasShotShapeInput(shot) ? profiles[index].shape : "NA"}</strong></td>
                  <td>{formatAvailableMetric(getShotMetric(shot, "carry") ?? Number.NaN, "yd")}</td>
                  <td>
                    {formatLateralDistance(displayedFinish)}
                    {recordedFinish === undefined && displayedFinish !== undefined ? " est." : ""}
                  </td>
                  <td>{formatSignedMetric(getShotMetric(shot, "curve"), "ft")}</td>
                  <td>{formatSignedMetric(getShotMetric(shot, "horizontalAngle"), "deg")}</td>
                  <td>{formatSignedMetric(getShotMetric(shot, "clubPath"), "deg")}</td>
                  <td>{formatSignedMetric(getShotMetric(shot, "faceAngle"), "deg")}</td>
                  <td>{formatSignedMetric(getShotMetric(shot, "faceToPath"), "deg")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="shot-map-note">
        Positive delivery and finish values are right of target; negative values are left.
        {" "}Estimated finishes use recorded launch direction and curve when lateral finish data is NA.
        {!hasShapeData && " Shape inputs are NA, so flights are centered."}
      </p>
    </div>
  );
}

function GapLadder({ clubs, extended = false }: { clubs: ClubSummary[]; extended?: boolean }) {
  const availableCarry = clubs.map((club) => club.carry).filter(Number.isFinite);
  const maxCarry = Math.max(...availableCarry, 1);

  return (
    <div className="gap-list">
      {clubs.slice(0, extended ? clubs.length : 7).map((club, index) => {
        const nextClub = clubs[index + 1];
        const gap = nextClub && Number.isFinite(club.carry) && Number.isFinite(nextClub.carry)
          ? round(club.carry - nextClub.carry)
          : Number.NaN;
        return (
          <div className="gap-row" key={club.club}>
            <div>
              <strong>{getClubDisplayName(club.club)}</strong>
              <span>{formatAvailableMetric(club.carry, "yd")}</span>
            </div>
            <div className="gap-track">
              {Number.isFinite(club.carry) && <i style={{ width: `${Math.max(12, (club.carry / maxCarry) * 100)}%` }} />}
            </div>
            <em className={cls(Number.isFinite(gap) && (gap < 8 || gap > 18) && "flagged")}>
              {nextClub ? formatAvailableMetric(gap, "yd") : "top"}
            </em>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ sessions }: { sessions: Session[] }) {
  const points = [...sessions].reverse().map((session) => {
    const clubs = summarizeClubs([session]);
    return {
      label: formatDate(session.date),
      quality: (() => {
        const values = clubs.map((club) => club.quality).filter(Number.isFinite);
        return values.length ? Math.round(average(values)) : Number.NaN;
      })(),
    };
  });
  const width = 720;
  const height = 220;
  const plotted = points.map((point, index) => {
    const x = 42 + (index / Math.max(1, points.length - 1)) * (width - 84);
    const y = Number.isFinite(point.quality)
      ? height - 34 - (point.quality / 100) * (height - 68)
      : height - 48;
    return { ...point, x, y };
  });
  const availablePoints = plotted.filter((point) => Number.isFinite(point.quality));
  const path = availablePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Session quality trend">
        {[25, 50, 75].map((line) => {
          const y = height - 34 - (line / 100) * (height - 68);
          return <line key={line} x1="34" x2={width - 28} y1={y} y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke="#35f27a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {plotted.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="6" fill="#111d19" stroke={Number.isFinite(point.quality) ? "#35f27a" : "#6f7d76"} strokeWidth="3" />
            <text x={point.x} y={height - 10} textAnchor="middle" fill="#a8b3ad" fontSize="12">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#f4f7f5" fontSize="12" fontWeight="700">
              {Number.isFinite(point.quality) ? point.quality : "NA"}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function InsightList({ compact = false, insights }: { compact?: boolean; insights: Insight[] }) {
  if (!insights.length) return <EmptyState title="Clean report" body="No active alerts from this data set." />;

  return (
    <div className={cls("insight-list", compact && "compact")}>
      {insights.map((insight) => (
        <article className="insight-card" key={insight.id}>
          <div className="insight-topline">
            <span className={cls("severity-pill", insight.severity)}>{insight.severity}</span>
            <strong>{getClubDisplayName(insight.club)}</strong>
          </div>
          <h3>{insight.title}</h3>
          {!compact && <p>{insight.evidence}</p>}
          <dl>
            <div>
              <dt>{insight.metric}</dt>
              <dd>{insight.value}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{insight.target}</dd>
            </div>
          </dl>
          <small>{insight.action}</small>
        </article>
      ))}
    </div>
  );
}

function QualityBars({ clubs }: { clubs: ClubSummary[] }) {
  return (
    <div className="quality-list">
      {clubs.map((club) => (
        <div className="quality-row" key={club.club}>
          <span>{getClubDisplayName(club.club)}</span>
          <div>
            {Number.isFinite(club.quality) && <i style={{ width: `${club.quality}%` }} />}
          </div>
          <strong>{Number.isFinite(club.quality) ? club.quality : "NA"}</strong>
        </div>
      ))}
    </div>
  );
}

function QualityPill({ score }: { score: number }) {
  if (!Number.isFinite(score)) return <span className="quality-pill">NA</span>;
  return <span className={cls("quality-pill", score >= 80 ? "good" : score >= 68 ? "ok" : "work")}>{score}</span>;
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
