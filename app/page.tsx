"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaiCoachLogoFull, MaiCoachLogoMark } from "@/components/brand/mai-coach-logo";
import { APP_BUILD_INFO } from "@/lib/build-info";
import { accountPayloadConfirmsUser } from "@/lib/auth-session-policy.mjs";
import { splitDisplayNameForRegistration } from "@/lib/admin-user-policy.mjs";
import {
  buildMetricEducationCards,
  getMetricEducationContent,
  METRIC_EDUCATION_VIDEO_PRELOAD,
  metricEducationHasVideo,
} from "@/lib/metric-education-policy.mjs";
import {
  generateNormalizedPhotoImportCsv,
  normalizedCsvDataRowCount,
  PHOTO_IMPORT_CSV_SCHEMA_VERSION,
} from "@/lib/photo-import-policy.mjs";
import {
  COLUMN_MAPPING_TARGETS,
  LAUNCH_MONITOR_MAPPING_PROFILE_VERSION,
  chooseClubForImportedSession,
  generateCanonicalLaunchMonitorCsv,
  getLaunchMonitorClubDisplayName,
  normalizeLaunchMonitorClubName,
  parseLaunchMonitorCsv,
} from "@/lib/launch-monitor-import-policy.mjs";
import { sanitizeSessionList } from "@/lib/session-data-policy.mjs";
import {
  ALL_SESSION_CLUBS,
  getSessionClubOptions,
  getSessionViewShots,
  makeSessionAnalysisKey,
  resolveSessionViewSelection,
} from "@/lib/session-view-selection-policy.mjs";
import {
  normalizeFirstMemberOnboardingStatus,
  shouldCompleteFirstMemberOnboardingAfterInvite,
  shouldOpenFirstMemberOnboarding,
} from "@/lib/coach-first-member-onboarding-policy.mjs";

type Tab = "dashboard" | "sessions" | "clubs" | "videos" | "coach" | "admin" | "practice" | "import";
type AccountMode = "pending" | "user" | "guest";
type LoginModalMode = "login" | "register";
type RegisterAccountType = "player" | "coach";
type OnboardingRole = "golfer" | "coach";
type PerformanceTimeframePreset = "all" | "week" | "month" | "last30" | "last90" | "custom";

type PerformanceTimeframe = {
  preset: PerformanceTimeframePreset;
  startDate: string;
  endDate: string;
};

type PasswordModalMode = "reset" | "setup" | "temporary";
type FirstMemberOnboardingStatus = "pending" | "dismissed" | "completed";

type SessionViewSelection = {
  club: string | "all";
  shotId?: string | null;
  metric?: string | null;
};

type RegistrationDraft = {
  accountType: RegisterAccountType;
  confirmPassword?: string;
  email: string;
  firstName: string;
  headshotFile?: File | null;
  lastName: string;
  password?: string;
};

type MetricSource = {
  kind: "measured" | "derived" | "estimated" | "manual";
  confidence: number;
  method?: string;
  inputMetrics?: string[];
  originalColumn?: string;
};

type Shot = {
  id: string;
  sessionId?: string | null;
  shotNumber?: number | null;
  timestamp?: string | null;
  club: string;
  carry?: number | null;
  total?: number | null;
  ballSpeed?: number | null;
  clubSpeed?: number | null;
  smash?: number | null;
  launch?: number | null;
  spin?: number | null;
  offline?: number | null;
  shape: string;
  proximity?: number | null;
  apex?: number | null;
  spinAxis?: number | null;
  descent?: number | null;
  horizontalAngle?: number | null;
  attackAngle?: number | null;
  faceAngle?: number | null;
  clubPath?: number | null;
  faceToPath?: number | null;
  sideCarry?: number | null;
  sideTotal?: number | null;
  curve?: number | null;
  swingPlane?: number | null;
  detectedMetrics?: NumericShotMetric[];
  extractionConfidence?: number;
  mappingProfileVersion?: string;
  metricSources?: Record<string, MetricSource>;
  rawSourceData?: Record<string, unknown>;
  reviewStatus?: string;
  sourceFileName?: string;
  sourceImages?: string[];
  sourceShotNumber?: string;
  unmappedFields?: Record<string, unknown>;
};

type Session = {
  id: string;
  title: string;
  date: string;
  source: string;
  focus: string;
  location?: string;
  importMetadata?: PhotoImportMetadata;
  importNotes?: string;
  missingMetrics?: NumericShotMetric[];
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

type GaugeTone = "green" | "amber" | "red" | "neutral";

type SwingGaugeBand = {
  from: number;
  to: number;
  tone: GaugeTone;
  label: string;
  redline?: boolean;
};

type SwingGaugeMetric = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  decimals: number;
  targetRange: [number, number];
  warningRange: [number, number];
  bands: SwingGaugeBand[];
  source: "Live" | "Sample" | "Derived";
  detail: string;
  priority?: "hero";
  centerMarker?: number;
};

type DashboardMetricTone = "good" | "watch" | "needs-work" | "neutral";

type DashboardSummary = {
  benchmarkLabel: string;
  benchmarkNotice: string;
  carry: number;
  contact: number;
  contactLabel: string;
  contactTone: DashboardMetricTone;
  dispersion: number;
  dispersionWidth: number;
  sessionScore: number;
  summaryText: string;
};

type DashboardOpportunity = {
  action: string;
  body: string;
  metricId: string;
  title: string;
  tone: DashboardMetricTone;
};

type DashboardMetricDetail = {
  aimFor: string;
  compare: string;
  decimals: number;
  description: string;
  howToImprove: string;
  id: string;
  label: string;
  meaning: string;
  rawValue: number;
  status: string;
  tone: DashboardMetricTone;
  tourBenchmark?: string;
  unit: string;
  value: string;
  visual: "speed" | "energy" | "range" | "pattern" | "arc" | "spin" | "path" | "plane";
  what: string;
};

type MetricEducationVideo = {
  captionsSrc?: string;
  description?: string;
  durationLabel?: string;
  poster?: string;
  src: string;
  title: string;
};

type MetricEducationContent = {
  definition: string;
  improvementAdvice: string;
  metricKey: string;
  numberMeaning: string;
  targetExplanation: string;
  title: string;
  video?: MetricEducationVideo;
};

type MetricEducationCardContent = {
  body: string;
  id: string;
  title: string;
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
  missingMetrics?: NumericShotMetric[];
  notes?: string;
  simulator: string;
  submissionType: "API feed" | "CSV / Excel" | "Photo" | "Manual entry";
  shots: Shot[];
};

type MaiCaddyAnalysis = {
  headline: string;
  dataQuality: {
    confidence: "low" | "medium" | "high";
    usableShotCount: number;
    limitations: string[];
  };
  sessionSummary: string;
  measuredFindings: Array<{
    metric: string;
    value: string;
    meaning: string;
  }>;
  strengths: Array<{
    title: string;
    evidence: string;
  }>;
  primaryPriority: {
    title: string;
    whyItMatters: string;
    evidence: string;
  };
  issues: Array<{
    metric: string;
    finding: string;
    severity: "low" | "medium" | "high";
    evidence: string;
    certainty: "measured" | "strongly_suggested" | "possible";
    possibleCause: string | null;
  }>;
  practicePlan: Array<{
    drill: string;
    problemAddressed: string;
    whyThisFits: string;
    setup: string;
    feel: string;
    metricToMonitor: string;
    measurableTarget: string;
    durationOrSwingCount: string;
    progressionRule: string;
  }>;
  nextSessionGoal: string;
  progressComparison: {
    available: boolean;
    summary: string;
  };
  courseRelevance: string;
  followUpQuestion: string | null;
  confidence: number;
};

type SessionAnalysisResponse = {
  analysisId?: string;
  sessionId: string;
  status: "processing" | "completed" | "failed" | "insufficient_data" | "not_analyzed";
  analysis?: MaiCaddyAnalysis | null;
  calculatedMetrics?: Record<string, unknown> | null;
  model?: string | null;
  analysisSource?: "openai" | "measured_fallback" | null;
  promptVersion?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  generatedAt?: string;
  error?: {
    code: string;
    message: string;
  } | null;
  contextSummary?: {
    shotCount: number;
    validShotCount: number;
    clubs: string[];
    missingMetrics: string[];
  } | null;
};

type SessionAnalysisState = {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
  result?: SessionAnalysisResponse;
};

type PhotoImportMetadata = {
  location?: string;
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  fileNames?: string[];
  averageValidation?: Record<string, number>;
  blockingIssues?: string[];
  clubCount?: number;
  clubs?: string[];
  columnOverrides?: Record<string, string>;
  csvSchemaVersion?: string;
  delimiter?: string;
  derivedMetrics?: NumericShotMetric[];
  duplicateShotNumbers?: number[];
  estimatedMetrics?: NumericShotMetric[];
  importedAt?: string;
  mappedColumns?: Array<{
    sourceColumn: string;
    mapsTo: string;
    targetLabel?: string;
    kind?: string;
    sourceUnit?: string;
    targetUnit?: string;
  }>;
  mappingProfileVersion?: string;
  measuredMetrics?: NumericShotMetric[];
  missingMetrics?: NumericShotMetric[];
  normalizedCsv?: string;
  pageCounts?: {
    distance: number;
    delivery: number;
  };
  photoImportJobId?: string;
  photoImportSummary?: {
    simulator: string;
    club: string;
    canonicalClub: string | null;
    imageCount: number;
    distancePageCount: number;
    deliveryPageCount: number;
    uniqueShotCount: number;
    shotNumbers: number[];
    overlappingShotsDeduplicated: number[];
    avgRowsExcluded: boolean;
  };
  rowsDetected?: number;
  sessionId?: string | null;
  sessionIds?: string[];
  simulator?: string;
  sourcePaths?: string[];
  sourceFileName?: string;
  sourceHeaders?: string[];
  sourceRowCount?: number;
  sourceCounts?: Record<"measured" | "derived" | "estimated" | "manual", number>;
  unitConversions?: Array<{
    sourceColumn: string;
    metric: string;
    sourceUnit?: string;
    targetUnit?: string;
  }>;
  unmappedColumns?: string[];
  warnings?: string[];
};

type ImportReview = {
  blockingIssues?: string[];
  csvText?: string;
  id: string;
  date: string;
  detectedMetrics: NumericShotMetric[];
  inferredClub?: string;
  location: string;
  metadata: PhotoImportMetadata;
  missingMetrics: NumericShotMetric[];
  notes: string;
  shots: Shot[];
  simulator: string;
  submissionType: LastImport["submissionType"];
  summary?: PhotoImportMetadata["photoImportSummary"];
  warnings: string[];
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
  | "attackAngle"
  | "faceAngle"
  | "clubPath"
  | "faceToPath"
  | "sideCarry"
  | "sideTotal"
  | "curve"
  | "swingPlane";

type PhotoScanResult =
  | {
      id: string;
      fileName: string;
      previewUrl?: string;
      status: "ready";
      simulator: string;
      shot: Shot;
      shots: Shot[];
      csvText: string;
      confidence: number;
      metadata: PhotoImportMetadata;
      pageType?: string;
      warnings?: string[];
    }
  | {
      id: string;
      fileName: string;
      previewUrl?: string;
      status: "error";
      message: string;
    };

type PhotoBatchImportResult = {
  jobId: string;
  status: "needs_review" | "partial" | "failed" | "complete";
  simulator: string;
  club: string | null;
  clubDisplay?: string;
  shots: Shot[];
  csvText: string;
  pages: Array<{
    imageId: string;
    fileName: string;
    pageType: string;
    visibleShotNumbers: number[];
    confidence: number;
    warnings: string[];
  }>;
  summary?: PhotoImportMetadata["photoImportSummary"];
  pageCounts?: {
    distance: number;
    delivery: number;
  };
  duplicateShotNumbers?: number[];
  blockingIssues?: string[];
  warnings?: string[];
  averages?: Record<string, number>;
  sourcePaths?: string[];
  csvSchemaVersion?: string;
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
  | "Educational"
  | "System Test"
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
  accountStatus?: string;
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
  profileImageUrl?: string;
};

type MembersResponsePayload = {
  activeMemberCount?: number;
  error?: string;
  firstMemberOnboardingStatus?: FirstMemberOnboardingStatus | string;
  members?: CoachMember[];
};

function memberCountsAsActive(member: CoachMember) {
  return (member.accountStatus ?? "active") !== "inactive";
}

type StaffUserRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "admin" | "coach" | "member";
  phone: string;
  skillLevel: string;
  notes: string;
  accountStatus: "active" | "inactive";
  inviteStatus: string;
  invitedAt?: string | null;
  lastLoginAt?: string | null;
  passwordConfigured: boolean;
  passwordResetRequired: boolean;
  setupStatus: string[];
  createdAt: string;
  updatedAt: string;
  assignedCoachId?: string;
  assignedCoachName?: string;
  assignedCoachIds: string[];
  assignedCoachNames: string[];
  profileImageUrl?: string;
  videoCount: number;
  sessionCount: number;
  lastVideoAt?: string | null;
};

type CoachSummary = {
  id: string;
  name: string;
  email: string;
  title: string;
  profileImageUrl?: string;
};

type StaffActivityRecord = {
  id: string;
  actorId?: string | null;
  actorRole: string;
  memberId?: string | null;
  targetUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type CoachReconciliationCandidate = {
  ambiguous: boolean;
  choices: Array<{
    coachId: string;
    coachName: string;
    videoCount: number;
    videoEvidence?: Array<{
      publicationStatus?: string | null;
      title: string;
      uploadStatus?: string | null;
    }>;
  }>;
  existingCoachNames: string[];
  memberEmail: string;
  memberId: string;
  memberName: string;
  repairable: boolean;
  suggestedCoachName: string;
};

type StaffContentRecord = {
  id: string;
  memberId: string;
  creatorName: string;
  contentType: string;
  title: string;
  body: string;
  visibility: string;
  status: string;
  sessionId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type StaffDashboardPayload = {
  summary: {
    activeMembers: number;
    coachFeedbackAwaitingReview: number;
    membersAddedThisMonth: number;
    sessionsAdded: number;
    totalCoaches: number;
    totalMembers: number;
    videosUploaded: number;
  };
  quickActions: string[];
  users: StaffUserRecord[];
  coaches: StaffUserRecord[];
  recentActivity: StaffActivityRecord[];
};

type StaffMemberDetail = {
  member: StaffUserRecord;
  assignedCoaches: CoachSummary[];
  sessions: Session[];
  sessionsUpdatedAt?: string | null;
  videos: Array<{
    id: string;
    title: string;
    publicationStatus: string;
    uploadStatus: string;
    reviewStatus: string;
    createdAt: string;
    updatedAt?: string;
    lessonDate?: string | null;
    memberFacingNotes: string;
    coachId?: string | null;
    coachName?: string | null;
    uploadedByRole?: string;
  }>;
  content: StaffContentRecord[];
  activity: StaffActivityRecord[];
};

type AccountUser = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "coach" | "member";
  firstName: string;
  lastName: string;
  passwordResetRequired?: boolean;
  profileImageUrl?: string;
};

type AccountPayload = {
  devAuthEnabled?: boolean;
  mode?: "guest" | "user";
  user?: AccountUser | null;
  error?: string;
};

type SessionsPayload = {
  mode?: "guest" | "user";
  sessions?: unknown;
  error?: string;
};

type PracticeActivityType = "drill" | "challenge";
type PracticeActivityStatus = "generated" | "in_progress" | "completed" | "results_submitted" | "cancelled" | "superseded";
type PracticeProgressStatus = "improved" | "maintained" | "needs_more_work" | "insufficient_data";

type PracticeActivity = {
  id: string;
  userId: string;
  activityType: PracticeActivityType;
  focusArea: string;
  title: string;
  reasonSelected: string;
  instructions: {
    setup?: string;
    instructions?: string[];
    equipment?: string[];
    feel?: string;
    commonMistake?: string;
    easierVersion?: string;
    harderVersion?: string;
    resultRequest?: {
      shouldRequest?: boolean;
      reason?: string;
      preferredMethod?: string;
    };
    resultFields?: string[];
    nextStepLogic?: string;
    coachConnection?: {
      connected?: boolean;
      coachName?: string | null;
      summary?: string;
    };
    sourceMode?: "coach_and_session" | "coach_feedback" | "lesson_notes" | "session_data" | "profile_fallback";
    sourceSummary?: string;
    confidence?: number;
  };
  club?: string;
  durationMinutes?: number;
  attemptCount?: number;
  target?: {
    successTarget?: string;
  };
  scoring?: {
    enabled?: boolean;
    system?: string;
    targetScore?: number | null;
    stretchTarget?: number | null;
  };
  coachId?: string;
  relatedSessionId?: string;
  status: PracticeActivityStatus;
  model?: string;
  promptVersion: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  latestResult?: {
    id: string;
    progressStatus: PracticeProgressStatus;
    score?: number;
    attempts?: number;
    successfulAttempts?: number;
    notes?: string;
    reflection?: string;
    evidence?: string[];
    nextRecommendation?: {
      recommendation?: string;
    };
    createdAt: string;
  } | null;
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
  nextSessionGoal?: string;
  coachPrivateNotes?: string;
  notificationLog?: VideoEmailNotificationLog[];
  updatedAt?: string;
};

type VideoLibraryItem = VideoLibraryRecord & {
  objectUrl: string;
  thumbnailObjectUrl?: string;
};

type VideoRecapDraft = {
  confidence: number;
  createdAt: string;
  id: string;
  improvement: string;
  keyIssue: string;
  lessonSummary: string;
  memberFacingNotes: string;
  metricsMentioned: Array<{ metric: string; source: string; value: string }>;
  nextSessionGoal: string;
  practiceAssignment: string;
  progressObserved: string[];
  recommendedDrill: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  status: string;
  transcriptEvidence: Array<{ excerpt: string; field: string; timestamp?: string | null }>;
  updatedAt: string;
  workedOn: string;
};

type VideoRecapTranscript = {
  createdAt: string;
  durationSeconds?: number | null;
  id: string;
  language: string;
  model: string;
  quality: Record<string, unknown>;
  segments: unknown[];
  text: string;
};

type VideoRecapJob = {
  completedAt?: string | null;
  currentStep: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  id: string;
  processingVersion: number;
  status: string;
  updatedAt: string;
  workflowInstanceId?: string | null;
};

type VideoRecapState = {
  canReview: boolean;
  draft: VideoRecapDraft | null;
  job: VideoRecapJob | null;
  transcript: VideoRecapTranscript | null;
  video: {
    coachId?: string | null;
    coachName: string;
    id: string;
    memberId: string;
    memberName: string;
    objectUrl: string;
    sessionId?: string | null;
    title: string;
  };
};

type OnboardingQuestionId =
  | "accountRole"
  | "displayName"
  | "email"
  | "facilityName"
  | "coachBio"
  | "specialties"
  | "location"
  | "profilePhotoName"
  | "firstGolferName"
  | "firstGolferEmail"
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
  role: OnboardingRole;
  displayName?: string;
  email?: string;
  facilityName?: string;
  coachBio?: string;
  specialties?: string[];
  location?: string;
  profilePhotoName?: string;
  firstGolferName?: string;
  firstGolferEmail?: string;
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
const PRACTICE_PROFILE_STORAGE_KEY = "mai-coach.practice-profile.v1";
const ONBOARDING_DRAFT_STORAGE_KEY = "mai-coach.onboarding-draft.v1";
const ONBOARDING_SKIP_STORAGE_KEY = "mai-coach.onboarding-skipped.v1";
const SESSIONS_STORAGE_KEY = "mai-coach.sessions.v1";
const LAST_IMPORT_STORAGE_KEY = "mai-coach.last-import.v1";

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
  "56° Wedge": { carry: 82, total: 86, ballSpeed: 72, clubSpeed: 56, smash: 1.29, launch: 31, spin: 9800, apex: 33, descent: 54, proximity: 18, spinAxis: 4, faceToPath: 2, sideCarry: 5 },
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
  "56° Wedge": {
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
  "56° Wedge",
  "LW",
];

type NavItem = { id: Tab; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌁" },
  { id: "sessions", label: "Sessions", icon: "◫" },
  { id: "clubs", label: "Clubs", icon: "▥" },
  { id: "videos", label: "Videos", icon: "▶" },
  { id: "coach", label: "Coach", icon: "✦" },
  { id: "admin", label: "Admin", icon: "⚙" },
  { id: "practice", label: "Practice", icon: "◎" },
  { id: "import", label: "Import", icon: "⇧" },
];

const PAGE_DESCRIPTIONS: Record<Tab, string> = {
  dashboard: "Performance signals, shot patterns, and the next priority in one view.",
  sessions: "Review simulator work, dispersion, and club delivery session by session.",
  clubs: "Understand carry windows, gapping, and quality across the bag.",
  videos: "Keep lesson recaps, swing reviews, and practice feedback together.",
  coach: "Turn performance data into focused guidance and deliver lesson follow-up.",
  admin: "Manage people, assignments, member content, and operational activity.",
  practice: "Build the next practice block around the misses that matter most.",
  import: "Bring in simulator files or photos and convert them into usable session data.",
};

const ROUTE_TABS = new Set<Tab>(NAV_ITEMS.map((item) => item.id));

function tabFromValue(value: string | null | undefined): Tab | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && ROUTE_TABS.has(normalized as Tab) ? normalized as Tab : null;
}

function tabFromPathname(pathname: string): Tab | null {
  const [segment] = pathname.split("/").filter(Boolean);
  return tabFromValue(segment);
}

function pathForTab(tab: Tab) {
  return tab === "dashboard" ? "/" : `/${tab}`;
}

function navItemsForAccount(accountMode: AccountMode, accountUser: AccountUser | null): NavItem[] {
  const item = (id: Tab, label?: string) => {
    const base = NAV_ITEMS.find((navItem) => navItem.id === id)!;
    return label ? { ...base, label } : base;
  };

  if (accountMode === "user" && accountUser?.role === "member") {
    return NAV_ITEMS.filter((item) => item.id !== "coach" && item.id !== "admin");
  }
  if (accountMode === "user" && accountUser?.role === "coach") {
    return [
      item("coach", "Coach Dashboard"),
      item("videos", "Videos"),
      item("import", "Session Imports"),
      item("practice", "Practice Plans"),
      item("sessions", "Player Sessions"),
      item("dashboard", "Player Data"),
    ];
  }
  if (accountMode === "user" && accountUser?.role === "admin") {
    return NAV_ITEMS;
  }
  return NAV_ITEMS.filter((item) => item.id !== "admin");
}

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

const DASHBOARD_BENCHMARK_LABEL = "Golfers like you";
const DASHBOARD_BENCHMARK_NOTICE =
  "Comparison ranges use sample app targets until validated profile benchmarks are connected.";

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

const EMPTY_SESSION: Session = {
  id: "empty-session",
  title: "No sessions yet",
  date: getTodayDateString(),
  source: "No data",
  focus: "Upload your first session",
  location: LOCATION_UNAVAILABLE,
  shots: [],
};

const EMPTY_LAST_IMPORT: LastImport = {
  date: getTodayDateString(),
  location: LOCATION_UNAVAILABLE,
  simulator: "NA",
  submissionType: "Manual entry",
  shots: [],
};

const DEFAULT_PERFORMANCE_TIMEFRAME: PerformanceTimeframe = {
  preset: "all",
  startDate: "",
  endDate: "",
};

const PERFORMANCE_TIMEFRAME_OPTIONS: Array<{ label: string; value: PerformanceTimeframePreset }> = [
  { label: "All Time", value: "all" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last 30 Days", value: "last30" },
  { label: "Last 90 Days", value: "last90" },
  { label: "Custom Date Range", value: "custom" },
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function orderedRange(from: number, to: number): [number, number] {
  return from <= to ? [from, to] : [to, from];
}

function clampRange(range: [number, number], min: number, max: number): [number, number] {
  return [clamp(range[0], min, max), clamp(range[1], min, max)];
}

function makeGaugeBands(min: number, max: number, targetRange: [number, number], warningRange: [number, number], redline: "high" | "both" | "none" = "high") {
  const [targetLow, targetHigh] = clampRange(orderedRange(targetRange[0], targetRange[1]), min, max);
  const [warningLow, warningHigh] = clampRange(orderedRange(warningRange[0], warningRange[1]), min, max);
  const bandInputs: SwingGaugeBand[] = [
    { from: min, to: warningLow, tone: "red", label: "Outside", redline: redline === "both" },
    { from: warningLow, to: targetLow, tone: "amber", label: "Caution" },
    { from: targetLow, to: targetHigh, tone: "green", label: "Ideal" },
    { from: targetHigh, to: warningHigh, tone: "amber", label: "Caution" },
    { from: warningHigh, to: max, tone: "red", label: "Redline", redline: redline === "high" || redline === "both" },
  ];

  return bandInputs
    .map((band) => ({ ...band, from: clamp(band.from, min, max), to: clamp(band.to, min, max) }))
    .filter((band) => band.to - band.from > 0.01);
}

function resolveGaugeValue(value: number | undefined, fallback: number, fallbackSource: SwingGaugeMetric["source"] = "Sample") {
  return Number.isFinite(value) ? { value: value as number, source: "Live" as const } : { value: fallback, source: fallbackSource };
}

function getClubFamily(club: string) {
  if (club === "Driver") return "driver";
  if (club.includes("Wood")) return "wood";
  if (["PW", "GW", "SW", "LW"].includes(club)) return "wedge";
  return "iron";
}

function getAttackWindow(club: string): { target: [number, number]; warning: [number, number]; sample: number } {
  const family = getClubFamily(club);
  if (family === "driver") return { target: [1.5, 4.5], warning: [-1.5, 6], sample: 2.7 };
  if (family === "wood") return { target: [-1.5, 2], warning: [-4, 4], sample: -0.6 };
  if (family === "wedge") return { target: [-6, -2.5], warning: [-8, -1], sample: -4.2 };
  return { target: [-5, -1.5], warning: [-7, 1], sample: -3.4 };
}

function getSwingPlaneWindow(club: string): { target: [number, number]; warning: [number, number]; sample: number } {
  const family = getClubFamily(club);
  if (family === "driver") return { target: [45, 53], warning: [41, 57], sample: 49 };
  if (family === "wood") return { target: [48, 56], warning: [44, 60], sample: 52 };
  if (family === "wedge") return { target: [60, 67], warning: [56, 70], sample: 63 };
  return { target: [55, 63], warning: [51, 66], sample: 59 };
}

function makeSwingGaugeMetric({
  id,
  label,
  value,
  min,
  max,
  unit,
  decimals,
  targetRange,
  warningRange,
  detail,
  priority,
  fallbackSource,
  redline = "high",
  centerMarker,
}: {
  id: string;
  label: string;
  value: { value: number; source: SwingGaugeMetric["source"] };
  min: number;
  max: number;
  unit: string;
  decimals: number;
  targetRange: [number, number];
  warningRange: [number, number];
  detail: string;
  priority?: "hero";
  fallbackSource?: SwingGaugeMetric["source"];
  redline?: "high" | "both" | "none";
  centerMarker?: number;
}): SwingGaugeMetric {
  const [safeMin, safeMax] = orderedRange(min, max);
  const safeValue = clamp(value.value, safeMin, safeMax);

  return {
    id,
    label,
    value: safeValue,
    min: safeMin,
    max: safeMax,
    unit,
    decimals,
    targetRange: clampRange(targetRange, safeMin, safeMax),
    warningRange: clampRange(warningRange, safeMin, safeMax),
    bands: makeGaugeBands(safeMin, safeMax, targetRange, warningRange, redline),
    source: value.source ?? fallbackSource ?? "Sample",
    detail,
    priority,
    centerMarker,
  };
}

function buildSwingGaugeMetrics(
  club: string,
  selectedClubSummary: ClubSummary | undefined,
  selectedClubShots: Shot[],
  avgCarry: number,
  avgSmash: number,
) {
  const target = CLUB_TARGETS[club] ?? CLUB_TARGETS["7-Iron"];
  const carryValue = resolveGaugeValue(
    Number.isFinite(selectedClubSummary?.carry) ? selectedClubSummary?.carry : avgCarry,
    target.carry,
  );
  const smashValue = resolveGaugeValue(
    Number.isFinite(selectedClubSummary?.smash) ? selectedClubSummary?.smash : avgSmash,
    target.smash,
  );
  const clubPathValue = resolveGaugeValue(averageMetric(selectedClubShots, "clubPath"), 0.8, "Sample");
  const faceAngleValue = resolveGaugeValue(averageMetric(selectedClubShots, "faceAngle"), -0.4, "Sample");
  const attackWindow = getAttackWindow(club);
  const swingPlaneWindow = getSwingPlaneWindow(club);
  const maxCarry = Math.max(130, target.carry * 1.45, carryValue.value * 1.25);
  const maxSpin = Math.max(8000, target.spin * 1.35);
  const minSpin = Math.max(600, target.spin * 0.38);

  return [
    makeSwingGaugeMetric({
      id: "clubSpeed",
      label: "Club Speed",
      value: resolveGaugeValue(selectedClubSummary?.clubSpeed, target.clubSpeed),
      min: Math.max(30, target.clubSpeed - 42),
      max: Math.max(105, target.clubSpeed + 36),
      unit: "mph",
      decimals: 1,
      targetRange: [target.clubSpeed - 4, target.clubSpeed + 5],
      warningRange: [target.clubSpeed - 10, target.clubSpeed + 11],
      detail: "How fast the club is moving through impact. The green band is the current club window.",
      priority: "hero",
    }),
    makeSwingGaugeMetric({
      id: "ballSpeed",
      label: "Ball Speed",
      value: resolveGaugeValue(selectedClubSummary?.ballSpeed, target.ballSpeed),
      min: Math.max(45, target.ballSpeed - 52),
      max: Math.max(125, target.ballSpeed + 45),
      unit: "mph",
      decimals: 1,
      targetRange: [target.ballSpeed - 5, target.ballSpeed + 6],
      warningRange: [target.ballSpeed - 13, target.ballSpeed + 14],
      detail: "Ball speed shows energy transfer. It should rise with centered contact and efficient launch.",
      priority: "hero",
    }),
    makeSwingGaugeMetric({
      id: "carry",
      label: "Carry Distance",
      value: carryValue,
      min: Math.max(20, target.carry * 0.42),
      max: maxCarry,
      unit: "yd",
      decimals: 1,
      targetRange: [target.carry - 7, target.carry + 9],
      warningRange: [target.carry - 20, target.carry + 24],
      detail: "Carry is the main distance window for this club. High is fine, but consistency is the goal.",
      priority: "hero",
      redline: "none",
    }),
    makeSwingGaugeMetric({
      id: "launch",
      label: "Launch Angle",
      value: resolveGaugeValue(selectedClubSummary?.launch, target.launch),
      min: Math.max(0, target.launch - 16),
      max: Math.min(42, target.launch + 18),
      unit: "deg",
      decimals: 1,
      targetRange: [target.launch - 2, target.launch + 2.5],
      warningRange: [target.launch - 5, target.launch + 5.5],
      detail: "Launch angle controls start height and carry. Too low or high starts to cost distance.",
      centerMarker: target.launch,
      redline: "both",
    }),
    makeSwingGaugeMetric({
      id: "spin",
      label: "Spin Rate",
      value: resolveGaugeValue(selectedClubSummary?.spin, target.spin),
      min: minSpin,
      max: maxSpin,
      unit: "rpm",
      decimals: 0,
      targetRange: [target.spin - Math.max(350, target.spin * 0.08), target.spin + Math.max(450, target.spin * 0.09)],
      warningRange: [target.spin - Math.max(800, target.spin * 0.16), target.spin + Math.max(1000, target.spin * 0.18)],
      detail: "Spin has a redline because excessive spin can balloon shots and flatten distance.",
      centerMarker: target.spin,
      redline: "both",
    }),
    makeSwingGaugeMetric({
      id: "smash",
      label: "Smash Factor",
      value: smashValue,
      min: Math.max(0.95, target.smash - 0.28),
      max: 1.55,
      unit: "",
      decimals: 2,
      targetRange: [target.smash - 0.03, Math.min(1.52, target.smash + 0.04)],
      warningRange: [target.smash - 0.08, Math.min(1.54, target.smash + 0.06)],
      detail: "Smash factor is impact efficiency: ball speed divided by club speed.",
      redline: "none",
    }),
    makeSwingGaugeMetric({
      id: "clubPath",
      label: "Club Path",
      value: clubPathValue,
      min: -10,
      max: 10,
      unit: "deg",
      decimals: 1,
      targetRange: [-2, 2],
      warningRange: [-5, 5],
      detail: "Path direction through impact. Negative is left, positive is right for a right-handed reference.",
      centerMarker: 0,
      redline: "both",
    }),
    makeSwingGaugeMetric({
      id: "faceAngle",
      label: "Face Angle",
      value: faceAngleValue,
      min: -10,
      max: 10,
      unit: "deg",
      decimals: 1,
      targetRange: [-1.5, 1.5],
      warningRange: [-4, 4],
      detail: "Face angle drives start line. The ideal zone keeps the face close to square.",
      centerMarker: 0,
      redline: "both",
    }),
    makeSwingGaugeMetric({
      id: "attackAngle",
      label: "Attack Angle",
      value: resolveGaugeValue(Number.NaN, attackWindow.sample, "Derived"),
      min: -9,
      max: 8,
      unit: "deg",
      decimals: 1,
      targetRange: attackWindow.target,
      warningRange: attackWindow.warning,
      detail: "Preview gauge for attack angle. It is ready for live launch-monitor values when available.",
      centerMarker: 0,
      redline: "both",
    }),
    makeSwingGaugeMetric({
      id: "swingPlane",
      label: "Swing Plane",
      value: resolveGaugeValue(Number.NaN, swingPlaneWindow.sample, "Derived"),
      min: 38,
      max: 72,
      unit: "deg",
      decimals: 1,
      targetRange: swingPlaneWindow.target,
      warningRange: swingPlaneWindow.warning,
      detail: "Preview gauge for swing plane. The target changes by club type.",
      centerMarker: (swingPlaneWindow.target[0] + swingPlaneWindow.target[1]) / 2,
      redline: "both",
    }),
  ];
}

function parseDisplayDate(value: string) {
  if (!value) return null;
  const normalized = value.includes("T")
    ? value
    : value.length > 10
      ? value.replace(" ", "T")
      : `${value}T12:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseDisplayDate(value);
  return date ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date) : "NA";
}

function formatFullDate(value: string) {
  const date = parseDisplayDate(value);
  return date ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date) : "NA";
}

function inviteStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "delivered" || normalized === "sent") return "Email Sent";
  if (normalized === "opened") return "Invite Opened";
  if (normalized === "completed" || normalized === "accepted" || normalized === "active") return "Account Active";
  if (normalized === "failed") return "Email Failed";
  if (normalized === "expired") return "Invite Expired";
  if (normalized === "cancelled") return "Invite Cancelled";
  return "Invite Pending";
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateInput(value: string, endOfDay = false) {
  if (!value) return null;
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : endOfDay ? endOfLocalDay(date) : startOfLocalDay(date);
}

function getPerformanceTimeframeRange(timeframe: PerformanceTimeframe, referenceDate = new Date()) {
  const todayStart = startOfLocalDay(referenceDate);
  const todayEnd = endOfLocalDay(referenceDate);

  if (timeframe.preset === "all") return null;

  if (timeframe.preset === "week") {
    const weekStart = startOfLocalDay(referenceDate);
    const mondayOffset = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - mondayOffset);
    return { end: todayEnd, start: weekStart };
  }

  if (timeframe.preset === "month") {
    return {
      end: todayEnd,
      start: new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
    };
  }

  if (timeframe.preset === "last30") {
    return { end: todayEnd, start: addLocalDays(todayStart, -29) };
  }

  if (timeframe.preset === "last90") {
    return { end: todayEnd, start: addLocalDays(todayStart, -89) };
  }

  const customStart = parseDateInput(timeframe.startDate);
  const customEnd = parseDateInput(timeframe.endDate, true);
  return {
    end: customEnd,
    start: customStart,
  };
}

function filterSessionsByPerformanceTimeframe(sessions: Session[], timeframe: PerformanceTimeframe) {
  const range = getPerformanceTimeframeRange(timeframe);
  if (!range || (!range.start && !range.end)) return sessions;

  return sessions.filter((session) => {
    const date = parseDisplayDate(session.date);
    if (!date) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  });
}

function getPerformanceTimeframeLabel(timeframe: PerformanceTimeframe) {
  const option = PERFORMANCE_TIMEFRAME_OPTIONS.find((item) => item.value === timeframe.preset);
  if (timeframe.preset !== "custom") return option?.label ?? "All Time";
  if (timeframe.startDate && timeframe.endDate) return `${formatFullDate(timeframe.startDate)} - ${formatFullDate(timeframe.endDate)}`;
  if (timeframe.startDate) return `Since ${formatFullDate(timeframe.startDate)}`;
  if (timeframe.endDate) return `Through ${formatFullDate(timeframe.endDate)}`;
  return option?.label ?? "Custom Date Range";
}

function getPerformanceTimeframeSummary(timeframe: PerformanceTimeframe, shownSessions: number, totalSessions: number) {
  const label = getPerformanceTimeframeLabel(timeframe);
  if (timeframe.preset === "all") {
    return `${label} · ${shownSessions} ${shownSessions === 1 ? "session" : "sessions"}`;
  }
  return `${label} · ${shownSessions} of ${totalSessions} ${totalSessions === 1 ? "session" : "sessions"}`;
}

function getSessionSubmissionType(session: Session): LastImport["submissionType"] {
  const source = session.source.toLowerCase();
  if (source.includes("api")) return "API feed";
  if (source.includes("photo") || source.includes("scan")) return "Photo";
  if (source.includes("manual")) return "Manual entry";
  return "CSV / Excel";
}

function makeLastImportFromSession(session?: Session): LastImport {
  if (!session || !session.shots.length) return EMPTY_LAST_IMPORT;
  return {
    date: session.date,
    location: session.location ?? LOCATION_UNAVAILABLE,
    missingMetrics: session.missingMetrics,
    notes: session.importNotes,
    simulator: session.importMetadata?.simulator ?? session.source,
    submissionType: getSessionSubmissionType(session),
    shots: session.shots,
  };
}

function getLastImportSession(sessions: Session[]) {
  return sessions.find((session) => session.importMetadata || session.id.startsWith("import-")) ?? sessions[0];
}

function downloadCsvFile(csv: string, fileName: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  notes = "",
  missingMetrics: NumericShotMetric[] = [],
): LastImport {
  return {
    date,
    location,
    missingMetrics,
    notes: notes.trim() || undefined,
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

function dashboardMetricValue(value: number, unit = "", digits = 1) {
  return Number.isFinite(value) ? formatAvailableMetric(value, unit, digits) : "NA";
}

function targetStatus(
  value: number,
  target: number,
  goodWindow: number,
  watchWindow: number,
  labels: { good: string; watch: string; needsWork: string },
) {
  if (!Number.isFinite(value)) return { label: "NA", tone: "neutral" as const };
  const gap = Math.abs(value - target);
  if (gap <= goodWindow) return { label: labels.good, tone: "good" as const };
  if (gap <= watchWindow) return { label: labels.watch, tone: "watch" as const };
  return { label: labels.needsWork, tone: "needs-work" as const };
}

function minimumStatus(
  value: number,
  target: number,
  watchFloor: number,
  labels: { good: string; watch: string; needsWork: string },
) {
  if (!Number.isFinite(value)) return { label: "NA", tone: "neutral" as const };
  if (value >= target) return { label: labels.good, tone: "good" as const };
  if (value >= watchFloor) return { label: labels.watch, tone: "watch" as const };
  return { label: labels.needsWork, tone: "needs-work" as const };
}

function maximumStatus(
  value: number,
  target: number,
  watchMax: number,
  labels: { good: string; watch: string; needsWork: string },
) {
  if (!Number.isFinite(value)) return { label: "NA", tone: "neutral" as const };
  if (value <= target) return { label: labels.good, tone: "good" as const };
  if (value <= watchMax) return { label: labels.watch, tone: "watch" as const };
  return { label: labels.needsWork, tone: "needs-work" as const };
}

function buildDashboardSummary(
  selectedClub: string,
  selectedClubSummary: ClubSummary | undefined,
  selectedClubShots: Shot[],
  fallbackCarry: number,
  fallbackDispersion: number,
  fallbackSmash: number,
  performanceIndex: number,
): DashboardSummary {
  const target = CLUB_TARGETS[selectedClub] ?? CLUB_TARGETS["7-Iron"];
  const carry = Number.isFinite(selectedClubSummary?.carry) ? selectedClubSummary!.carry : fallbackCarry;
  const dispersion = Number.isFinite(selectedClubSummary?.dispersion) ? selectedClubSummary!.dispersion : fallbackDispersion;
  const smash = Number.isFinite(selectedClubSummary?.smash) ? selectedClubSummary!.smash : fallbackSmash;
  const clubSpeed = Number.isFinite(selectedClubSummary?.clubSpeed)
    ? selectedClubSummary!.clubSpeed
    : averageMetric(selectedClubShots, "clubSpeed");
  const score = Number.isFinite(selectedClubSummary?.quality)
    ? selectedClubSummary!.quality
    : Number.isFinite(performanceIndex) ? performanceIndex : Number.NaN;
  const contactStatus = minimumStatus(
    smash,
    target.smash - 0.02,
    target.smash - 0.06,
    {
      good: "Good",
      watch: "Playable",
      needsWork: "Needs center contact",
    },
  );

  let summaryText = "Upload more shots with this club to build a clearer performance read.";
  if (Number.isFinite(clubSpeed) && clubSpeed >= target.clubSpeed - 3 && Number.isFinite(smash) && smash < target.smash - 0.03) {
    summaryText = "Strong speed. More centered contact could improve distance consistency.";
  } else if (Number.isFinite(dispersion) && dispersion > Math.max(10, target.sideCarry * 1.8)) {
    summaryText = "Distance is usable, but the shot pattern is wider than the current target window.";
  } else if (Number.isFinite(carry) && carry >= target.carry - 8 && Number.isFinite(smash) && smash >= target.smash - 0.03) {
    summaryText = "Solid carry and contact. The next step is making the pattern repeat more often.";
  } else if (Number.isFinite(carry)) {
    summaryText = "Good baseline. A cleaner launch and strike pattern can make the carry number more reliable.";
  }

  return {
    benchmarkLabel: DASHBOARD_BENCHMARK_LABEL,
    benchmarkNotice: DASHBOARD_BENCHMARK_NOTICE,
    carry,
    contact: smash,
    contactLabel: contactStatus.label,
    contactTone: contactStatus.tone,
    dispersion,
    dispersionWidth: Number.isFinite(dispersion) ? round(dispersion * 2) : Number.NaN,
    sessionScore: score,
    summaryText,
  };
}

function buildDashboardOpportunity(
  selectedClub: string,
  selectedClubSummary: ClubSummary | undefined,
  selectedClubShots: Shot[],
  topInsight?: Insight,
): DashboardOpportunity {
  const target = CLUB_TARGETS[selectedClub] ?? CLUB_TARGETS["7-Iron"];
  if (!selectedClubSummary) {
    return {
      action: "Upload Your First Session",
      body: "Add more shots for this club so the app can identify a real priority instead of guessing.",
      metricId: "data",
      title: "Build your first baseline",
      tone: "neutral",
    };
  }

  const clubPath = averageMetric(selectedClubShots, "clubPath");
  const faceAngle = averageMetric(selectedClubShots, "faceAngle");
  const candidates: Array<DashboardOpportunity & { score: number }> = [];

  if (Number.isFinite(selectedClubSummary.smash) && selectedClubSummary.smash < target.smash - 0.02) {
    candidates.push({
      action: "View Recommended Drill",
      body: "Your swing speed is already useful. More centered contact may help you produce more reliable ball speed and carry distance.",
      metricId: "smash",
      score: (target.smash - selectedClubSummary.smash) * 1000,
      title: "Improve center-face contact",
      tone: selectedClubSummary.smash < target.smash - 0.06 ? "needs-work" : "watch",
    });
  }

  if (Number.isFinite(selectedClubSummary.dispersion) && selectedClubSummary.dispersion > Math.max(9, target.sideCarry * 1.4)) {
    candidates.push({
      action: "Start Practice",
      body: `Most shots are grouping wider than the sample window for this club. Tightening start line can make your ${getClubDisplayName(selectedClub)} easier to trust.`,
      metricId: "dispersion",
      score: (selectedClubSummary.dispersion - Math.max(9, target.sideCarry * 1.4)) * 18,
      title: "Tighten the shot pattern",
      tone: selectedClubSummary.dispersion > Math.max(13, target.sideCarry * 2) ? "needs-work" : "watch",
    });
  }

  if (Number.isFinite(selectedClubSummary.launch) && Math.abs(selectedClubSummary.launch - target.launch) > 2.5) {
    candidates.push({
      action: "See How to Improve",
      body: "A launch window closer to this club's current target can make carry and landing angle easier to predict.",
      metricId: "launch",
      score: Math.abs(selectedClubSummary.launch - target.launch) * 12,
      title: "Match launch to the club",
      tone: "watch",
    });
  }

  if (Number.isFinite(selectedClubSummary.faceToPath) && Math.abs(selectedClubSummary.faceToPath) > target.faceToPath) {
    candidates.push({
      action: "View Recommended Drill",
      body: "Face-to-path is the curve-control number. Bringing the face and path closer together can reduce left-right movement.",
      metricId: "faceToPath",
      score: Math.abs(selectedClubSummary.faceToPath) * 10,
      title: "Reduce curve at impact",
      tone: Math.abs(selectedClubSummary.faceToPath) > target.faceToPath * 1.6 ? "needs-work" : "watch",
    });
  } else if (Number.isFinite(clubPath) && Number.isFinite(faceAngle) && Math.abs(clubPath - faceAngle) > 4) {
    candidates.push({
      action: "See How to Improve",
      body: "The path and face are separated enough to create curve. A smaller gap should make the start line and curve more predictable.",
      metricId: "clubPath",
      score: Math.abs(clubPath - faceAngle) * 9,
      title: "Match face and path",
      tone: "watch",
    });
  }

  if (!candidates.length && topInsight) {
    return {
      action: "Start Practice",
      body: topInsight.action,
      metricId: topInsight.id,
      title: topInsight.title,
      tone: topInsight.severity === "high" ? "needs-work" : topInsight.severity === "medium" ? "watch" : "good",
    };
  }

  return candidates.sort((a, b) => b.score - a.score)[0] ?? {
    action: "Start Practice",
    body: "The core numbers are inside a playable range. Keep working on repeatable contact and target commitment.",
    metricId: "repeatability",
    title: "Make the good pattern repeat",
    tone: "good",
  };
}

function getPlayerContextCopy(profile?: UserPracticeProfile | null) {
  if (!profile) {
    return {
      compareLabel: DASHBOARD_BENCHMARK_LABEL,
      practiceCue: "Use the number as a starting point, not a judgment.",
      rangePrefix: "Start with",
    };
  }

  if (profile.role === "coach") {
    return {
      compareLabel: "Coaching window",
      practiceCue: "Use the player context and ball flight before prescribing a drill.",
      rangePrefix: "Coach toward",
    };
  }

  if (profile.path === "Beginner" || profile.handicap === "25+" || profile.skillLevel === "Brand new") {
    return {
      compareLabel: "Starter window",
      practiceCue: "Keep the explanation simple and prioritize contact before speed.",
      rangePrefix: "Build toward",
    };
  }

  if (profile.path === "Competitive") {
    return {
      compareLabel: "Performance window",
      practiceCue: "Treat this as a scoring window and confirm it under randomized targets.",
      rangePrefix: "Fine-tune toward",
    };
  }

  return {
    compareLabel: "Player window",
    practiceCue: "Connect the number to the shot pattern before changing technique.",
    rangePrefix: "Work toward",
  };
}

function buildDashboardMetricDetails(
  selectedClub: string,
  selectedClubSummary: ClubSummary | undefined,
  selectedClubShots: Shot[],
  practiceProfile?: UserPracticeProfile | null,
): DashboardMetricDetail[] {
  const target = CLUB_TARGETS[selectedClub] ?? CLUB_TARGETS["7-Iron"];
  const tour = PRO_REFERENCE_STATS[selectedClub];
  const playerContext = getPlayerContextCopy(practiceProfile);
  const clubPath = averageMetric(selectedClubShots, "clubPath");
  const faceAngle = averageMetric(selectedClubShots, "faceAngle");
  const attackWindow = getAttackWindow(selectedClub);
  const swingPlaneWindow = getSwingPlaneWindow(selectedClub);
  const carryStatus = targetStatus(
    selectedClubSummary?.carry ?? Number.NaN,
    target.carry,
    8,
    22,
    { good: "On target", watch: "Near range", needsWork: "Needs review" },
  );
  const dispersionStatus = maximumStatus(
    selectedClubSummary?.dispersion ?? Number.NaN,
    Math.max(7, target.sideCarry * 1.25),
    Math.max(12, target.sideCarry * 2),
    { good: "Tight", watch: "Playable", needsWork: "Wide" },
  );
  const smashStatus = minimumStatus(
    selectedClubSummary?.smash ?? Number.NaN,
    target.smash - 0.02,
    target.smash - 0.06,
    { good: "Good", watch: "Playable", needsWork: "Leaking speed" },
  );
  const launchStatus = targetStatus(
    selectedClubSummary?.launch ?? Number.NaN,
    target.launch,
    2,
    5,
    { good: "In window", watch: "Near window", needsWork: "Out of window" },
  );
  const spinStatus = targetStatus(
    selectedClubSummary?.spin ?? Number.NaN,
    target.spin,
    Math.max(450, target.spin * 0.09),
    Math.max(950, target.spin * 0.18),
    { good: "In window", watch: "Watch spin", needsWork: "Off target" },
  );
  const faceToPathStatus = maximumStatus(
    Math.abs(selectedClubSummary?.faceToPath ?? Number.NaN),
    target.faceToPath,
    target.faceToPath * 1.8,
    { good: "Controlled", watch: "Watch curve", needsWork: "Big curve risk" },
  );
  const clubPathStatus = targetStatus(clubPath, 0, 2, 5, { good: "Neutral", watch: "Manageable", needsWork: "Directional bias" });
  const faceStatus = targetStatus(faceAngle, 0, 1.5, 4, { good: "Square", watch: "Manageable", needsWork: "Start-line risk" });

  return [
    {
      aimFor: `${playerContext.rangePrefix} around ${target.clubSpeed} mph for this ${getClubDisplayName(selectedClub)} window.`,
      compare: `${playerContext.compareLabel}: target ${target.clubSpeed} mph.`,
      decimals: 1,
      description: "How fast the clubhead was moving at impact.",
      howToImprove: `${playerContext.practiceCue} Build speed only after contact stays centered. Use three smooth swings, then one full-speed swing.`,
      id: "clubSpeed",
      label: "Club Speed",
      meaning: Number.isFinite(selectedClubSummary?.clubSpeed)
        ? `Your club speed is ${dashboardMetricValue(selectedClubSummary!.clubSpeed, "mph")}. Speed is useful when contact efficiency stays stable.`
        : "Club speed was not captured for this club in the selected data.",
      rawValue: selectedClubSummary?.clubSpeed ?? Number.NaN,
      status: targetStatus(selectedClubSummary?.clubSpeed ?? Number.NaN, target.clubSpeed, 5, 12, { good: "Solid speed", watch: "Near range", needsWork: "Build speed gradually" }).label,
      tone: targetStatus(selectedClubSummary?.clubSpeed ?? Number.NaN, target.clubSpeed, 5, 12, { good: "Solid speed", watch: "Near range", needsWork: "Build speed gradually" }).tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.clubSpeed} mph / LPGA ${tour.lpga.clubSpeed} mph.` : undefined,
      unit: "mph",
      value: dashboardMetricValue(selectedClubSummary?.clubSpeed ?? Number.NaN, "mph"),
      visual: "speed",
      what: "Club speed is the speed of the clubhead at impact.",
    },
    {
      aimFor: `${playerContext.rangePrefix} around ${target.ballSpeed} mph for the current target.`,
      compare: `${playerContext.compareLabel}: target ${target.ballSpeed} mph.`,
      decimals: 1,
      description: "How fast the ball left the clubface.",
      howToImprove: "Centered contact usually raises ball speed before a swing change does.",
      id: "ballSpeed",
      label: "Ball Speed",
      meaning: Number.isFinite(selectedClubSummary?.ballSpeed)
        ? `The ball is leaving at ${dashboardMetricValue(selectedClubSummary!.ballSpeed, "mph")}. Compare it with club speed to understand strike quality.`
        : "Ball speed was not captured for this club.",
      rawValue: selectedClubSummary?.ballSpeed ?? Number.NaN,
      status: targetStatus(selectedClubSummary?.ballSpeed ?? Number.NaN, target.ballSpeed, 6, 15, { good: "Strong", watch: "Near range", needsWork: "Needs review" }).label,
      tone: targetStatus(selectedClubSummary?.ballSpeed ?? Number.NaN, target.ballSpeed, 6, 15, { good: "Strong", watch: "Near range", needsWork: "Needs review" }).tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.ballSpeed} mph / LPGA ${tour.lpga.ballSpeed} mph.` : undefined,
      unit: "mph",
      value: dashboardMetricValue(selectedClubSummary?.ballSpeed ?? Number.NaN, "mph"),
      visual: "speed",
      what: "Ball speed is measured immediately after impact.",
    },
    {
      aimFor: `Approximately ${target.smash.toFixed(2)} for this club window.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample target ${target.smash.toFixed(2)}.`,
      decimals: 2,
      description: "How efficiently your club speed becomes ball speed.",
      howToImprove: "Use foot spray or impact tape and score center strikes before chasing more speed.",
      id: "smash",
      label: "Smash Factor",
      meaning: Number.isFinite(selectedClubSummary?.smash)
        ? `Your contact efficiency is ${selectedClubSummary!.smash.toFixed(2)}. Moving it toward about ${target.smash.toFixed(2)} may help carry become more reliable; any distance gain is only an estimate.`
        : "Smash factor was not captured for this club.",
      rawValue: selectedClubSummary?.smash ?? Number.NaN,
      status: smashStatus.label,
      tone: smashStatus.tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.smash.toFixed(2)} / LPGA ${tour.lpga.smash.toFixed(2)}.` : undefined,
      unit: "",
      value: dashboardMetricValue(selectedClubSummary?.smash ?? Number.NaN, "", 2),
      visual: "energy",
      what: "Smash factor is ball speed divided by club speed.",
    },
    {
      aimFor: `${playerContext.rangePrefix} a carry window near ${target.carry} yd, then smaller variation around that number.`,
      compare: `${playerContext.compareLabel}: target ${target.carry} yd.`,
      decimals: 1,
      description: "How far the ball flew before landing.",
      howToImprove: "Use the carry number for target planning. If it jumps around, start with strike location and launch.",
      id: "carry",
      label: "Carry Distance",
      meaning: Number.isFinite(selectedClubSummary?.carry)
        ? `Your average carry is ${dashboardMetricValue(selectedClubSummary!.carry, "yd")}. This is the number to trust for hazards and landing zones.`
        : "Carry distance was not captured for this club.",
      rawValue: selectedClubSummary?.carry ?? Number.NaN,
      status: carryStatus.label,
      tone: carryStatus.tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.carry} yd / LPGA ${tour.lpga.carry} yd.` : undefined,
      unit: "yd",
      value: dashboardMetricValue(selectedClubSummary?.carry ?? Number.NaN, "yd"),
      visual: "range",
      what: "Carry is the distance the ball travels in the air before first landing.",
    },
    {
      aimFor: `Keep the typical spread under about ${Math.max(7, target.sideCarry * 1.25).toFixed(0)} yd when possible.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample spread target under ${Math.max(7, target.sideCarry * 1.25).toFixed(0)} yd.`,
      decimals: 1,
      description: "How tightly your shots grouped around the target.",
      howToImprove: "Use a start-line gate and count how many shots begin on the intended side of the target.",
      id: "dispersion",
      label: "Dispersion",
      meaning: Number.isFinite(selectedClubSummary?.dispersion)
        ? `Most of your shots finished within an approximately ${round(selectedClubSummary!.dispersion * 2)}-yard-wide area.`
        : "Dispersion needs at least a small shot group to be meaningful.",
      rawValue: selectedClubSummary?.dispersion ?? Number.NaN,
      status: dispersionStatus.label,
      tone: dispersionStatus.tone,
      unit: "yd",
      value: Number.isFinite(selectedClubSummary?.dispersion) ? `${round(selectedClubSummary!.dispersion)} yd spread` : "NA",
      visual: "pattern",
      what: "Dispersion is the typical left-right spread of the shot group.",
    },
    {
      aimFor: `Around ${target.launch} deg for this club sample window.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample target ${target.launch} deg.`,
      decimals: 1,
      description: "The initial upward angle of the ball flight.",
      howToImprove: "Check ball position and strike height first; both can change launch without a full swing rebuild.",
      id: "launch",
      label: "Launch Angle",
      meaning: Number.isFinite(selectedClubSummary?.launch)
        ? `Your launch is ${dashboardMetricValue(selectedClubSummary!.launch, "deg")}. The right window helps carry and stopping power.`
        : "Launch angle was not captured for this club.",
      rawValue: selectedClubSummary?.launch ?? Number.NaN,
      status: launchStatus.label,
      tone: launchStatus.tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.launch} deg / LPGA ${tour.lpga.launch} deg.` : undefined,
      unit: "deg",
      value: dashboardMetricValue(selectedClubSummary?.launch ?? Number.NaN, "deg"),
      visual: "arc",
      what: "Launch angle is the vertical angle the ball starts on.",
    },
    {
      aimFor: `Near ${target.spin} rpm, with room for club and shot type.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample target ${target.spin} rpm.`,
      decimals: 0,
      description: "Backspin immediately after impact.",
      howToImprove: "If spin is high, check strike location and dynamic loft. If low, check contact quality and launch.",
      id: "spin",
      label: "Spin Rate",
      meaning: Number.isFinite(selectedClubSummary?.spin)
        ? `Your spin is ${dashboardMetricValue(selectedClubSummary!.spin, "rpm", 0)}. Spin helps the ball stay in the air, but too much or too little can cost control.`
        : "Spin rate was not captured for this club.",
      rawValue: selectedClubSummary?.spin ?? Number.NaN,
      status: spinStatus.label,
      tone: spinStatus.tone,
      tourBenchmark: tour ? `Tour reference: PGA ${tour.pga.spin} rpm / LPGA ${tour.lpga.spin} rpm.` : undefined,
      unit: "rpm",
      value: dashboardMetricValue(selectedClubSummary?.spin ?? Number.NaN, "rpm", 0),
      visual: "spin",
      what: "Spin rate is the ball's backspin right after impact.",
    },
    {
      aimFor: `Within about ${target.faceToPath} deg either direction for this sample window.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample goal within ${target.faceToPath} deg.`,
      decimals: 1,
      description: "How much the face and path disagree at impact.",
      howToImprove: "Work with a start-line gate and curve target. Make the ball start closer to the intended line first.",
      id: "faceToPath",
      label: "Face to Path",
      meaning: Number.isFinite(selectedClubSummary?.faceToPath)
        ? `Face-to-path is ${dashboardMetricValue(selectedClubSummary!.faceToPath, "deg")}. Larger gaps usually create more curve.`
        : "Face-to-path was not captured for this club.",
      rawValue: selectedClubSummary?.faceToPath ?? Number.NaN,
      status: faceToPathStatus.label,
      tone: faceToPathStatus.tone,
      unit: "deg",
      value: dashboardMetricValue(selectedClubSummary?.faceToPath ?? Number.NaN, "deg"),
      visual: "path",
      what: "Face-to-path compares the clubface direction to the swing path.",
    },
    {
      aimFor: "A path close to neutral unless you are intentionally shaping shots.",
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample neutral window within 2 deg.`,
      decimals: 1,
      description: "The direction the clubhead traveled through impact.",
      howToImprove: "Use alignment sticks to separate body aim from actual club path.",
      id: "clubPath",
      label: "Club Path",
      meaning: Number.isFinite(clubPath)
        ? `Your club path averages ${dashboardMetricValue(clubPath, "deg")}. Negative is left and positive is right in a right-handed reference.`
        : "Club path was not captured for this club.",
      rawValue: clubPath,
      status: clubPathStatus.label,
      tone: clubPathStatus.tone,
      unit: "deg",
      value: dashboardMetricValue(clubPath, "deg"),
      visual: "path",
      what: "Club path is the direction the club is moving through impact.",
    },
    {
      aimFor: "A face close to the intended start line.",
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample square window within 1.5 deg.`,
      decimals: 1,
      description: "The direction the clubface pointed at impact.",
      howToImprove: "Start with grip, setup, and slow-motion face control before changing path.",
      id: "faceAngle",
      label: "Face Angle",
      meaning: Number.isFinite(faceAngle)
        ? `Your face angle averages ${dashboardMetricValue(faceAngle, "deg")}. This heavily influences where the ball starts.`
        : "Face angle was not captured for this club.",
      rawValue: faceAngle,
      status: faceStatus.label,
      tone: faceStatus.tone,
      unit: "deg",
      value: dashboardMetricValue(faceAngle, "deg"),
      visual: "path",
      what: "Face angle is where the clubface points at impact.",
    },
    {
      aimFor: `${attackWindow.target[0]} to ${attackWindow.target[1]} deg for this club type when measured.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample attack window only, not validated.`,
      decimals: 1,
      description: "Whether the club was moving up or down at impact.",
      howToImprove: "Connect a launch monitor that reports attack angle before acting on this number.",
      id: "attackAngle",
      label: "Attack Angle",
      meaning: "Attack angle is not available in this session, so the app is not scoring it.",
      rawValue: Number.NaN,
      status: "NA",
      tone: "neutral",
      unit: "deg",
      value: "NA",
      visual: "path",
      what: "Attack angle shows if the club is traveling upward or downward at impact.",
    },
    {
      aimFor: `${swingPlaneWindow.target[0]} to ${swingPlaneWindow.target[1]} deg for this club type when measured.`,
      compare: `${DASHBOARD_BENCHMARK_LABEL}: sample swing-plane window only, not validated.`,
      decimals: 1,
      description: "The general angle of the swing arc.",
      howToImprove: "Use video or a launch monitor that captures swing plane before making changes from this row.",
      id: "swingPlane",
      label: "Swing Plane",
      meaning: "Swing plane is not available in this session, so the app is not scoring it.",
      rawValue: Number.NaN,
      status: "NA",
      tone: "neutral",
      unit: "deg",
      value: "NA",
      visual: "plane",
      what: "Swing plane describes the angle of the club's arc around the body.",
    },
  ];
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
  return normalizeLaunchMonitorClubName(value);
}

function getClubDisplayName(club: string) {
  return getLaunchMonitorClubDisplayName(club);
}

const REVIEW_IMPORT_METRICS: NumericShotMetric[] = [
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "launch",
  "spin",
  "offline",
  "apex",
  "descent",
  "attackAngle",
  "spinAxis",
  "faceAngle",
  "clubPath",
  "faceToPath",
  "sideCarry",
  "sideTotal",
  "curve",
  "swingPlane",
];

function inferClubFromImportNotes(notes: string) {
  const text = notes.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\bdriver\b|\b1\s*w(?:ood)?\b/, "Driver"],
    [/\b3\s*w(?:ood)?\b|\bthree\s*wood\b/, "3-Wood"],
    [/\b5\s*w(?:ood)?\b|\bfive\s*wood\b/, "5-Wood"],
    [/\b7\s*w(?:ood)?\b|\bseven\s*wood\b/, "7-Wood"],
    [/\b5\s*i(?:ron)?\b|\bfive\s*iron\b/, "5-Iron"],
    [/\b6\s*i(?:ron)?\b|\bsix\s*iron\b/, "6-Iron"],
    [/\b7\s*i(?:ron)?\b|\bseven\s*iron\b/, "7-Iron"],
    [/\b8\s*i(?:ron)?\b|\beight\s*iron\b/, "8-Iron"],
    [/\b9\s*i(?:ron)?\b|\bnine\s*iron\b/, "9-Iron"],
    [/\bp(?:itching)?\s*wedge\b|\bpw\b/, "PW"],
    [/\bg(?:ap)?\s*wedge\b|\bapproach\s*wedge\b|\bgw\b|\baw\b/, "GW"],
    [/\bs(?:and)?\s*wedge\b|\bsw\b/, "SW"],
    [/\bl(?:ob)?\s*wedge\b|\blw\b/, "LW"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1];
}

function shotNeedsClubInference(shot: Shot) {
  const normalized = normalizeDataLabel(shot.club);
  return !normalized || normalized === "unknownclub" || normalized === "club";
}

function applyImportNotesToShots(shots: Shot[], notes: string) {
  const inferredClub = inferClubFromImportNotes(notes);
  if (!inferredClub) return { shots, inferredClub: undefined };

  return {
    inferredClub,
    shots: shots.map((shot) => (
      shotNeedsClubInference(shot)
        ? { ...shot, club: inferredClub }
        : shot
    )),
  };
}

function getDetectedImportMetrics(shots: Shot[]) {
  const detected = new Set<NumericShotMetric>();
  shots.forEach((shot) => {
    REVIEW_IMPORT_METRICS.forEach((metric) => {
      if (hasShotMetric(shot, metric)) detected.add(metric);
    });
  });
  return REVIEW_IMPORT_METRICS.filter((metric) => detected.has(metric));
}

function getMissingImportMetrics(shots: Shot[]) {
  const detected = new Set(getDetectedImportMetrics(shots));
  return REVIEW_IMPORT_METRICS.filter((metric) => !detected.has(metric));
}

function buildImportReview(
  shots: Shot[],
  submissionType: LastImport["submissionType"],
  simulator = DEFAULT_SIMULATOR,
  metadata: PhotoImportMetadata = {},
  notes = "",
): ImportReview {
  const normalized = applyImportNotesToShots(shots, notes);
  const detectedMetrics = getDetectedImportMetrics(normalized.shots);
  const missingMetrics = getMissingImportMetrics(normalized.shots);
  const clubNames = Array.from(new Set(normalized.shots.map((shot) => getClubDisplayName(shot.club))));
  const reviewId = `review-${Date.now()}`;
  const date = metadata.capturedAt ?? getTodayDateString();
  const normalizedCsv = metadata.normalizedCsv ?? generateCanonicalLaunchMonitorCsv({
    sessionId: metadata.sessionId ?? reviewId,
    sessionDate: date,
    simulator: metadata.simulator ?? simulator,
    shots: normalized.shots,
    notes,
  });
  const warnings = [
    ...(metadata.warnings ?? []),
    ...(missingMetrics.length ? [`${missingMetrics.length} metrics were not found and will show as NA.`] : []),
    ...(clubNames.some((club) => normalizeDataLabel(club) === "unknownclub") && !normalized.inferredClub
      ? ["Club was not detected. Add it in the notes or choose it before saving."]
      : []),
    ...(metadata.duplicateShotNumbers?.length ? [`Merged overlapping shots ${metadata.duplicateShotNumbers.join(", ")}.`] : []),
  ];
  const blockingIssues = metadata.blockingIssues ?? [];

  return {
    blockingIssues,
    csvText: normalizedCsv,
    id: reviewId,
    date,
    detectedMetrics,
    inferredClub: normalized.inferredClub,
    location: metadata.location ?? LOCATION_UNAVAILABLE,
    metadata: {
      ...metadata,
      sourceCounts: metadata.sourceCounts ?? metricSourceCounts(normalized.shots),
      measuredMetrics: metadata.measuredMetrics ?? metricSourcesForKind(normalized.shots, "measured"),
      derivedMetrics: metadata.derivedMetrics ?? metricSourcesForKind(normalized.shots, "derived"),
      estimatedMetrics: metadata.estimatedMetrics ?? metricSourcesForKind(normalized.shots, "estimated"),
      normalizedCsv,
    },
    missingMetrics,
    notes: notes.trim(),
    shots: normalized.shots,
    simulator,
    submissionType,
    summary: metadata.photoImportSummary,
    warnings,
  };
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

function parseCsvForImport(text: string, sourceFileName?: string, columnOverrides?: Record<string, string>) {
  return parseLaunchMonitorCsv(text, { sourceFileName, columnOverrides }) as {
    shots: Shot[];
    metadata: PhotoImportMetadata;
  };
}

function parseCsv(text: string): Shot[] {
  return parseCsvForImport(text).shots;
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
  { key: "attackAngle", label: "Attack angle", aliases: ["attack angle", "angle of attack", "aoa"], min: -20, max: 20 },
  { key: "sideCarry", label: "Side carry", aliases: ["side carry"], min: -200, max: 200 },
  { key: "sideTotal", label: "Side total", aliases: ["side total"], min: -200, max: 200 },
  { key: "offline", label: "Offline", aliases: ["offline", "from pin"], min: -200, max: 200 },
  { key: "proximity", label: "Proximity", aliases: ["proximity", "distance to pin"], min: 0, max: 1000 },
  { key: "curve", label: "Curve", aliases: ["curve"], min: -300, max: 300 },
  { key: "swingPlane", label: "Swing plane", aliases: ["swing plane", "plane angle"], min: 20, max: 80 },
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

type OcrWord = {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
};

type ShotHistoryPageKind = "distance" | "delivery";

const SHOT_HISTORY_DISTANCE_COLUMNS: NumericShotMetric[] = [
  "proximity",
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "apex",
  "spin",
  "spinAxis",
];

const SHOT_HISTORY_DELIVERY_COLUMNS: NumericShotMetric[] = [
  "launch",
  "descent",
  "horizontalAngle",
  "faceAngle",
  "clubPath",
  "faceToPath",
  "sideCarry",
  "sideTotal",
];

const SHOT_HISTORY_COLUMN_RATIOS: Record<ShotHistoryPageKind, Record<NumericShotMetric, number>> = {
  distance: {
    proximity: 0.18,
    carry: 0.27,
    total: 0.37,
    ballSpeed: 0.49,
    clubSpeed: 0.60,
    smash: 0.70,
    apex: 0.79,
    spin: 0.88,
    spinAxis: 0.98,
    launch: 0,
    descent: 0,
    horizontalAngle: 0,
    faceAngle: 0,
    clubPath: 0,
    faceToPath: 0,
    sideCarry: 0,
    sideTotal: 0,
    offline: 0,
    curve: 0,
  },
  delivery: {
    launch: 0.13,
    descent: 0.24,
    horizontalAngle: 0.35,
    faceAngle: 0.46,
    clubPath: 0.57,
    faceToPath: 0.68,
    sideCarry: 0.79,
    sideTotal: 0.90,
    carry: 0,
    total: 0,
    ballSpeed: 0,
    clubSpeed: 0,
    smash: 0,
    spin: 0,
    offline: 0,
    proximity: 0,
    apex: 0,
    spinAxis: 0,
    curve: 0,
  },
};

const SHOT_HISTORY_CSV_COLUMNS: Array<"shot" | NumericShotMetric> = [
  "shot",
  "proximity",
  "carry",
  "total",
  "ballSpeed",
  "clubSpeed",
  "smash",
  "apex",
  "spin",
  "spinAxis",
  "launch",
  "descent",
  "horizontalAngle",
  "faceAngle",
  "clubPath",
  "faceToPath",
  "sideCarry",
  "sideTotal",
  "offline",
];

function parseOcrWords(tsv?: string): OcrWord[] {
  if (!tsv) return [];
  return tsv.split(/\r?\n/).slice(1).flatMap((line) => {
    const columns = line.split("\t");
    const text = columns[11]?.trim();
    if (columns[0] !== "5" || !text) return [];
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    if (![left, top, width, height].every(Number.isFinite)) return [];
    return [{ left, top, width, height, text, confidence: Number.isFinite(confidence) ? confidence : 0 }];
  });
}

function detectShotHistoryPageKind(words: OcrWord[], text: string): ShotHistoryPageKind | undefined {
  const normalized = normalizeOcrText(`${text} ${words.map((word) => word.text).join(" ")}`);
  const hasDistancePage =
    /proximity|carry|garry|ball|bal|club speed|smash|apex|spin rate|spin axis/.test(normalized);
  const hasDeliveryPage =
    /horiz|horizontal|descent|face angle|club path|face to path|side carry|side total/.test(normalized);
  if (hasDeliveryPage && !hasDistancePage) return "delivery";
  if (hasDistancePage && !hasDeliveryPage) return "distance";
  if (hasDeliveryPage && /side carry|side total|horiz/.test(normalized)) return "delivery";
  if (hasDistancePage) return "distance";
  return undefined;
}

function groupOcrWordsIntoRows(words: OcrWord[]) {
  const rows: Array<{ y: number; words: OcrWord[] }> = [];

  words
    .filter((word) => word.confidence > 10 && word.text.length <= 24)
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .forEach((word) => {
      const centerY = word.top + word.height / 2;
      const match = rows.find((row) => Math.abs(row.y - centerY) <= Math.max(26, word.height * 1.45));
      if (match) {
        match.words.push(word);
        match.y = (match.y * (match.words.length - 1) + centerY) / match.words.length;
      } else {
        rows.push({ y: centerY, words: [word] });
      }
    });

  return rows
    .map((row) => ({ ...row, words: row.words.sort((a, b) => a.left - b.left) }))
    .sort((a, b) => a.y - b.y);
}

function cleanShotHistoryNumberText(value: string) {
  return value
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[–—−]/g, "-")
    .replace(/,/g, ".")
    .trim();
}

function parseShotNumberFromWords(words: OcrWord[], maxLeft?: number) {
  const shotColumnWords = maxLeft === undefined
    ? words
    : words.filter((word) => word.left + word.width / 2 <= maxLeft);
  if (!shotColumnWords.length) return undefined;

  const candidate = words
    .filter((word) => shotColumnWords.includes(word))
    .map((word) => cleanShotHistoryNumberText(word.text))
    .join(" ")
    .match(/\b(?:[A-Za-z]?)(\d{1,3})\b/);
  if (!candidate) return undefined;
  const shotNumber = Number(candidate[1]);
  if (!Number.isFinite(shotNumber) || shotNumber <= 0 || shotNumber > 999) return undefined;
  return String(shotNumber);
}

function parseShotHistoryMetricValue(value: string, metric: NumericShotMetric) {
  const cleaned = cleanShotHistoryNumberText(value);
  const direction = /(^|[^A-Z])L\b/i.test(value) ? -1 : /(^|[^A-Z])R\b/i.test(value) ? 1 : 0;
  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;

  const hasDecimal = match[0].includes(".");
  let parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return undefined;

  const abs = Math.abs(parsed);
  if (metric === "spin") {
    if (abs < 100 && /^\d{2}$/.test(match[0])) return undefined;
    parsed = Math.round(parsed);
  } else if (metric === "smash") {
    if (abs > 20) parsed /= 100;
    else if (abs > 2) parsed /= 10;
  } else if (["carry", "total", "ballSpeed", "clubSpeed", "apex", "proximity"].includes(metric)) {
    if (!hasDecimal && abs >= 1000) parsed /= 10;
  } else if (["launch", "descent", "horizontalAngle", "faceAngle", "clubPath", "faceToPath", "sideCarry", "sideTotal", "spinAxis", "offline"].includes(metric)) {
    while (Math.abs(parsed) > 45 && metric !== "sideCarry" && metric !== "sideTotal" && metric !== "offline") parsed /= 10;
    while (Math.abs(parsed) > 200) parsed /= 10;
  }

  if (direction) parsed = direction * Math.abs(parsed);
  return round(parsed, metric === "smash" ? 2 : metric === "spin" ? 0 : 1);
}

function metricRangeForShotHistory(metric: NumericShotMetric) {
  return PHOTO_METRIC_SPECS.find((spec) => spec.key === metric) ?? { min: -1000, max: 1000 };
}

function isMetricValuePlausible(metric: NumericShotMetric, value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const range = metricRangeForShotHistory(metric);
  return value >= range.min && value <= range.max;
}

function parseShotHistoryRows(text: string, fileName: string, fileIndex: number, tsv?: string) {
  const words = parseOcrWords(tsv);
  const pageKind = detectShotHistoryPageKind(words, text);
  if (!pageKind || words.length < 12) return [];

  const bodyWords = words.filter((word) => {
    const normalized = normalizeOcrText(word.text);
    return (
      !["shot", "yards", "feet", "mph", "rpm", "angle", "factor", "path", "carry", "total", "speed"].includes(normalized) &&
      !normalized.includes("shot history") &&
      !normalized.includes("shot dispersion")
    );
  });
  const minX = Math.min(...bodyWords.map((word) => word.left));
  const maxX = Math.max(...bodyWords.map((word) => word.left + word.width));
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return [];

  const tableWidth = maxX - minX;
  const columns = pageKind === "distance" ? SHOT_HISTORY_DISTANCE_COLUMNS : SHOT_HISTORY_DELIVERY_COLUMNS;
  const centers = Object.fromEntries(
    columns.map((metric) => [metric, minX + tableWidth * SHOT_HISTORY_COLUMN_RATIOS[pageKind][metric]]),
  ) as Partial<Record<NumericShotMetric, number>>;
  const rows = groupOcrWordsIntoRows(words);
  const valueRows = rows.filter((row) => {
    const rowText = row.words.map((word) => word.text).join(" ");
    const normalized = normalizeOcrText(rowText);
    const numericCount = row.words.filter((word) => /[-+]?\d/.test(cleanShotHistoryNumberText(word.text))).length;
    return numericCount >= 3 && !/avg|proximity|carry|yards|mph|rpm|angle|factor|path|speed|shot history/.test(normalized);
  });

  return valueRows.flatMap((row, rowIndex) => {
    const shotNumber = parseShotNumberFromWords(row.words, minX + tableWidth * 0.09);
    const values: Partial<Record<NumericShotMetric, number>> = {};

    columns.forEach((metric) => {
      const center = centers[metric];
      if (!center) return;
      const candidates = row.words
        .map((word) => {
          const value = parseShotHistoryMetricValue(word.text, metric);
          return {
            distance: Math.abs(word.left + word.width / 2 - center),
            value,
            word,
          };
        })
        .filter((candidate): candidate is { distance: number; value: number; word: OcrWord } =>
          isMetricValuePlausible(metric, candidate.value),
        )
        .sort((a, b) => a.distance - b.distance);
      const threshold = Math.max(70, tableWidth * 0.045);
      if (candidates[0] && candidates[0].distance <= threshold) values[metric] = candidates[0].value;
    });

    if (values.sideTotal !== undefined && values.offline === undefined) values.offline = values.sideTotal;
    if (values.sideCarry !== undefined && values.offline === undefined) values.offline = values.sideCarry;

    const detectedMetrics = Object.entries(values)
      .filter((entry): entry is [NumericShotMetric, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([metric]) => metric);
    const coreMetrics = detectedMetrics.filter((metric) =>
      ["carry", "total", "ballSpeed", "clubSpeed", "smash", "launch", "spin", "clubPath", "faceAngle", "faceToPath"].includes(metric),
    );
    if (coreMetrics.length < 2) return [];

    const shot: Shot = {
      id: `photo-table-${Date.now()}-${fileIndex}-${shotNumber ?? rowIndex}`,
      club: detectPhotoClub(text),
      carry: Number.NaN,
      total: Number.NaN,
      ballSpeed: Number.NaN,
      clubSpeed: Number.NaN,
      smash: Number.NaN,
      launch: Number.NaN,
      spin: Number.NaN,
      offline: Number.NaN,
      shape: "Not recorded",
      detectedMetrics,
      sourceShotNumber: shotNumber,
    };

    detectedMetrics.forEach((metric) => {
      const value = values[metric];
      if (typeof value === "number" && Number.isFinite(value)) {
        (shot[metric] as number) = metric === "spin" ? Math.round(value) : value;
      }
    });

    if (hasShotMetric(shot, "sideTotal")) shot.offline = shot.sideTotal as number;
    else if (hasShotMetric(shot, "sideCarry")) shot.offline = shot.sideCarry as number;
    else if (!hasShotMetric(shot, "offline")) delete (shot as Partial<Shot>).offline;

    const offline = getShotMetric(shot, "offline");
    if (typeof offline === "number" && Number.isFinite(offline)) {
      shot.shape = offline < -12 ? "Draw" : offline > 12 ? "Fade" : "Straight";
    }

    return [shot];
  });
}

function mergePhotoShotsByShotNumber(shots: Shot[]) {
  const grouped = new Map<string, Shot>();
  const standalone: Shot[] = [];

  shots.forEach((shot, index) => {
    const key = shot.sourceShotNumber;
    if (!key) {
      standalone.push(shot);
      return;
    }

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...shot, id: `photo-shot-${key}-${index}` });
      return;
    }

    const detectedMetrics = Array.from(new Set([...(current.detectedMetrics ?? []), ...(shot.detectedMetrics ?? [])]));
    const merged: Shot = {
      ...current,
      club: shotNeedsClubInference(current) && !shotNeedsClubInference(shot) ? shot.club : current.club,
      detectedMetrics,
    };

    detectedMetrics.forEach((metric) => {
      if (hasShotMetric(shot, metric)) {
        (merged[metric] as number) = shot[metric] as number;
      }
    });
    if (hasShotMetric(merged, "sideTotal")) merged.offline = merged.sideTotal ?? merged.offline;
    else if (hasShotMetric(merged, "sideCarry")) merged.offline = merged.sideCarry ?? merged.offline;
    grouped.set(key, merged);
  });

  return [...grouped.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, shot]) => shot)
    .concat(standalone);
}

function csvEscape(value: string | number | undefined) {
  const stringValue = value === undefined ? "" : String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function shotsToCsv(shots: Shot[]) {
  return generateNormalizedPhotoImportCsv({
    sessionId: `photo-import-preview-${Date.now()}`,
    sessionDate: getTodayDateString(),
    simulator: "Simulator photo",
    club: shots[0]?.club ?? "Unknown Club",
    shots: shots.map((shot, index) => ({
      ...shot,
      sourceShotNumber: shot.sourceShotNumber ?? String(index + 1),
    })),
    notes: "",
  });
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

function formatPhotoMetric(metric: NumericShotMetric, value: number | null | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "Not found";
  if (metric === "ballSpeed" || metric === "clubSpeed") return `${value} mph`;
  if (["carry", "total", "offline", "sideCarry", "sideTotal"].includes(metric)) return `${value} yd`;
  if (metric === "proximity") return `${value} ft`;
  if (metric === "curve") return `${value} ft`;
  if (metric === "spin") return `${Math.round(value)} rpm`;
  if (["launch", "spinAxis", "descent", "horizontalAngle", "attackAngle", "faceAngle", "clubPath", "faceToPath", "swingPlane"].includes(metric)) {
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

async function preparePhotoForOcr(file: File): Promise<Blob | File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const image = await createImageBitmap(file);
    const portraitPhonePhoto = image.height > image.width * 1.15;
    const crop = portraitPhonePhoto
      ? {
          x: image.width * 0.05,
          y: image.height * 0.24,
          width: image.width * 0.9,
          height: image.height * 0.56,
        }
      : {
          x: image.width * 0.02,
          y: image.height * 0.10,
          width: image.width * 0.96,
          height: image.height * 0.84,
        };
    const targetWidth = Math.min(2800, Math.max(1800, crop.width));
    const scale = targetWidth / crop.width;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width * scale);
    canvas.height = Math.round(crop.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = "grayscale(1) contrast(1.75) brightness(1.08)";
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return await new Promise<Blob | File>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.92);
    });
  } catch {
    return file;
  }
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
  const tableShots = parseShotHistoryRows(text, fileName, fileIndex, tsv);
  if (tableShots.length) {
    const mergedTableShots = mergePhotoShotsByShotNumber(tableShots);
    return {
      shot: mergedTableShots[0],
      shots: mergedTableShots,
      csvText: shotsToCsv(mergedTableShots),
      simulator: detectPhotoSimulator(text, fileName),
    };
  }

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
  const derivedSmash = parsedMetrics.smash ?? (
    parsedMetrics.ballSpeed && parsedMetrics.clubSpeed ? parsedMetrics.ballSpeed / parsedMetrics.clubSpeed : undefined
  );
  if (derivedSmash !== undefined && !detectedMetrics.includes("smash")) detectedMetrics.push("smash");

  const shot: Shot = {
    id: `photo-${Date.now()}-${fileIndex}`,
    club,
    carry: Number.NaN,
    total: Number.NaN,
    ballSpeed: Number.NaN,
    clubSpeed: Number.NaN,
    smash: Number.NaN,
    launch: Number.NaN,
    spin: Number.NaN,
    offline: Number.NaN,
    shape: "Not recorded",
    detectedMetrics,
  };

  if (derivedSmash !== undefined) parsedMetrics.smash = derivedSmash;
  detectedMetrics.forEach((metric) => {
    const value = parsedMetrics[metric];
    if (typeof value === "number" && Number.isFinite(value)) {
      (shot[metric] as number) = metric === "spin" ? Math.round(value) : round(value, metric === "smash" ? 2 : 1);
    }
  });

  if (hasShotMetric(shot, "sideTotal")) shot.offline = shot.sideTotal as number;
  else if (hasShotMetric(shot, "sideCarry")) shot.offline = shot.sideCarry as number;
  else if (!hasShotMetric(shot, "offline")) delete (shot as Partial<Shot>).offline;

  const offline = getShotMetric(shot, "offline");
  if (typeof offline === "number" && Number.isFinite(offline)) {
    shot.shape = offline < -12 ? "Draw" : offline > 12 ? "Fade" : "Straight";
  }

  return {
    shot,
    shots: [shot],
    csvText: shotsToCsv([shot]),
    simulator: detectPhotoSimulator(text, fileName),
  };
}

function buildImportedSession(
  shots: Shot[],
  submissionType: LastImport["submissionType"],
  simulator = DEFAULT_SIMULATOR,
  metadata: PhotoImportMetadata = {},
  notes = "",
  missingMetrics: NumericShotMetric[] = [],
): Session {
  const clubNames = Array.from(new Set(shots.map((shot) => shot.club)));
  const subject = clubNames.length === 1 ? getClubDisplayName(clubNames[0]) : `${clubNames.length}-club`;
  const source =
    submissionType === "API feed"
      ? `${simulator} API`
      : submissionType === "Photo"
        ? `${simulator} Photo Scan`
        : submissionType === "Manual entry"
          ? "Manual entry"
        : "CSV Upload";
  const { normalizedCsv, ...persistedMetadata } = metadata;
  void normalizedCsv;

  return {
    id: `import-${Date.now()}`,
    title: `${subject} ${submissionType === "Photo" ? "photo" : submissionType === "API feed" ? "API" : submissionType === "Manual entry" ? "manual" : "CSV"} import`,
    date: metadata.capturedAt ?? getTodayDateString(),
    source,
    focus: "New data",
    location: metadata.location ?? LOCATION_UNAVAILABLE,
    importMetadata: {
      ...persistedMetadata,
      importedAt: metadata.importedAt ?? new Date().toISOString(),
      mappingProfileVersion: metadata.mappingProfileVersion ?? LAUNCH_MONITOR_MAPPING_PROFILE_VERSION,
      simulator: metadata.simulator ?? simulator,
      sourceCounts: metadata.sourceCounts ?? metricSourceCounts(shots),
      measuredMetrics: metadata.measuredMetrics ?? metricSourcesForKind(shots, "measured"),
      derivedMetrics: metadata.derivedMetrics ?? metricSourcesForKind(shots, "derived"),
      estimatedMetrics: metadata.estimatedMetrics ?? metricSourcesForKind(shots, "estimated"),
      missingMetrics: metadata.missingMetrics ?? missingMetrics,
    },
    importNotes: notes.trim() || undefined,
    missingMetrics,
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
    const sessions = (stored as Session[]).map((session) => ({
      ...session,
      location:
        session.location ??
        (session.id.startsWith("import-") || session.source.includes("Upload") || session.source.includes("Photo Scan")
          ? LOCATION_UNAVAILABLE
          : undefined),
    }));
    const sanitized = sanitizeSessionList(sessions);
    return sanitized.length ? sanitized as Session[] : null;
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
      stored.submissionType === "API feed" ||
      stored.submissionType === "CSV / Excel" ||
      stored.submissionType === "Photo" ||
      stored.submissionType === "Manual entry"
        ? stored.submissionType
        : "CSV / Excel";

    return {
      date: typeof stored.date === "string" ? stored.date : getTodayDateString(),
      location:
        typeof stored.location === "string" && stored.location.trim()
          ? stored.location
          : LOCATION_UNAVAILABLE,
      missingMetrics: Array.isArray(stored.missingMetrics) ? stored.missingMetrics as NumericShotMetric[] : [],
      notes: typeof stored.notes === "string" && stored.notes.trim() ? stored.notes : undefined,
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
    const sanitizedSessions = sanitizeSessionList(sessions);
    if (!sanitizedSessions.length) {
      clearStoredImportState();
      return;
    }
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sanitizedSessions));
    window.localStorage.setItem(LAST_IMPORT_STORAGE_KEY, JSON.stringify(lastImport));
  } catch {
    // Imports still work in the active tab when browser storage is unavailable.
  }
}

function clearStoredImportState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SESSIONS_STORAGE_KEY);
    window.localStorage.removeItem(LAST_IMPORT_STORAGE_KEY);
  } catch {
    // Browser storage is optional.
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

function readStoredOnboardingSkipped() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(ONBOARDING_SKIP_STORAGE_KEY) === "true";
  } catch {
    return false;
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

function storeOnboardingSkipped() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ONBOARDING_SKIP_STORAGE_KEY, "true");
  } catch {
    // Skipping still works in the active tab when browser storage is unavailable.
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

function clearOnboardingSkipped() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ONBOARDING_SKIP_STORAGE_KEY);
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
  const payload = await readApiJson<{ videos?: VideoLibraryRecord[] }>(response, "Saved videos could not be loaded.");
  return (payload.videos ?? []) as VideoLibraryRecord[];
}

function combineRecapText(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .join("\n\n");
}

function getLessonMainFocus(video: Pick<VideoLibraryRecord, "keyIssue" | "workedOn">) {
  return combineRecapText(video.workedOn, video.keyIssue);
}

function getLessonPracticeNext(video: Pick<VideoLibraryRecord, "practiceAssignment" | "recommendedDrill">) {
  return combineRecapText(video.practiceAssignment, video.recommendedDrill);
}

function simplifiedFieldsFromVideoRecapDraft(draft: VideoRecapDraft) {
  return {
    lessonSummary: draft.lessonSummary,
    mainFocus: combineRecapText(draft.workedOn, draft.keyIssue),
    nextSessionGoal: draft.nextSessionGoal,
    practiceNext: combineRecapText(draft.practiceAssignment, draft.recommendedDrill),
    progressObserved: draft.improvement,
  };
}

function videoRecapProcessingStatusText(status: string) {
  if (status === "queued") return "Video uploaded";
  if (status === "extracting_audio") return "Checking for coach audio";
  if (status === "transcribing") return "Transcribing coach feedback";
  if (status === "transcribing_coach_feedback") return "Transcribing coach feedback";
  if (status === "generating_recap") return "Creating lesson recap";
  if (status === "ready_for_review") return "Ready for coach review";
  if (status === "no_usable_audio") return "No clear coach voiceover was detected.";
  if (status === "published") return "Coach-approved recap published";
  if (status === "failed") return "Audio processing needs attention";
  return status || "Not queued";
}

function videoRecapProcessingStepText(step?: string | null) {
  if (!step) return "No workflow step yet";
  if (step === "transcribing_coach_feedback") return "Transcribing coach feedback";
  if (step === "retry_requeued_stale_job") return "Previous job retired for retry";
  return step.replaceAll("_", " ");
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
    nextSessionGoal: video.nextSessionGoal,
  };
}

async function saveVideoRecord(video: VideoLibraryRecord) {
  const response = await fetch("/api/videos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(videoPatchPayload(video)),
  });
  const payload = await readApiJson<{ video?: VideoLibraryRecord }>(response, "The video could not be saved.");
  if (!payload.video) throw new Error("The video could not be saved.");
  return payload.video;
}

async function deleteVideoRecord(videoId: string) {
  const response = await fetch(`/api/videos?videoId=${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  await readApiJson<{ ok?: boolean }>(response, "The video could not be removed.");
}

async function readStaffDashboard() {
  const response = await fetch("/api/admin?view=dashboard", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Admin workspace could not be loaded.");
  return payload as StaffDashboardPayload;
}

async function readStaffMember(memberId: string) {
  const response = await fetch(`/api/admin?view=member&memberId=${encodeURIComponent(memberId)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Member detail could not be loaded.");
  return payload as StaffMemberDetail;
}

async function readMyCoaches() {
  const response = await fetch("/api/my-coaches", { cache: "no-store" });
  const payload = await readApiJson<{ coaches?: CoachSummary[] }>(response, "Assigned coach could not be loaded.");
  return (payload.coaches ?? []) as CoachSummary[];
}

async function postStaffAction<T extends Record<string, unknown> = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readApiJson<T>(response, "The admin action could not be completed.");
}

async function uploadCoachPhoto(userId: string, file: File) {
  const form = new FormData();
  form.append("userId", userId);
  form.append("image", file);
  const response = await fetch("/api/coach-photo", {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; photo?: { url?: string } };
  if (!response.ok) throw new Error(payload.error ?? "Coach photo could not be uploaded.");
  return payload.photo;
}

async function deleteCoachPhoto(userId: string) {
  const response = await fetch("/api/coach-photo", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Coach photo could not be removed.");
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "FR";
}

function CoachAvatar({ coach, size = "normal" }: { coach: Pick<CoachSummary, "name" | "profileImageUrl">; size?: "normal" | "large" }) {
  return coach.profileImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`${coach.name} headshot`} className={cls("coach-avatar", size === "large" && "large")} src={coach.profileImageUrl} />
  ) : (
    <span className={cls("member-initials", "coach-avatar-fallback", size === "large" && "large")}>{initialsForName(coach.name)}</span>
  );
}

function AccountAvatar({ user, size = "normal" }: { user: Pick<AccountUser, "displayName" | "profileImageUrl">; size?: "normal" | "large" }) {
  return user.profileImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`${user.displayName} headshot`} className={cls("coach-avatar", size === "large" && "large")} src={user.profileImageUrl} />
  ) : (
    <span className={cls("member-initials", "coach-avatar-fallback", size === "large" && "large")}>{initialsForName(user.displayName)}</span>
  );
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
      mediaCapturedAt: videoFile.lastModified ? new Date(videoFile.lastModified).toISOString() : undefined,
      mimeType: videoFile.type,
    }),
  });
  const payload = await readApiJson<{ video?: VideoLibraryRecord }>(response, "The video upload could not be started.");
  if (!payload.video) throw new Error("The video upload could not be started.");
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
  const payload = await readApiJson<{ video?: VideoLibraryRecord }>(response, "The video could not be published.");
  if (!payload.video) {
    throw new Error("The video could not be published.");
  }
  return payload.video;
}

function apiErrorMessage(payload: unknown, fallback: string, status?: number) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const nestedError = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
  if (typeof record.publicMessage === "string" && record.publicMessage.trim()) return record.publicMessage.trim();
  if (typeof nestedError?.message === "string" && nestedError.message.trim()) return nestedError.message.trim();
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  return fallback;
}

async function readApiJson<T>(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();
  let payload: unknown = {};
  if (rawText && contentType.includes("application/json")) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      throw new Error(fallback);
    }
  } else if (rawText && response.ok) {
    throw new Error(fallback);
  }
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, fallback, response.status));
  }
  return payload as T;
}

async function readVideoRecap(videoId: string) {
  const response = await fetch(`/api/video-recaps?videoId=${encodeURIComponent(videoId)}`, { cache: "no-store" });
  return readApiJson<VideoRecapState>(response, "The MAI Coach recap could not be loaded.");
}

async function updateVideoRecap(payload: Record<string, unknown>) {
  const response = await fetch("/api/video-recaps", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readApiJson<VideoRecapState>(response, "The MAI Coach recap could not be updated.");
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
  if (profile.role === "coach") return "Competitive";

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
  const role = (typeof rawAnswers.accountRole === "string" ? rawAnswers.accountRole : "golfer") as OnboardingRole;
  const gameProfile = typeof rawAnswers.gameProfile === "string" ? rawAnswers.gameProfile : undefined;
  const game = gameProfile ? GAME_PROFILE_MAP[gameProfile] : undefined;
  const simulatorGoals = asArray(rawAnswers.simulatorGoals ?? rawAnswers.simulatorUse);
  const practiceRhythm = asArray(rawAnswers.practiceRhythm);
  const practiceStyle = asArray(rawAnswers.practiceStyle);
  const experienceStyle = asArray(rawAnswers.experienceStyle);
  const coachNotes = typeof rawAnswers.coachNotes === "string" ? rawAnswers.coachNotes.trim() : "";
  const splitList = (value: unknown) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
  };
  const profileBase = {
    role,
    displayName: typeof answers.displayName === "string" ? answers.displayName.trim() : undefined,
    email: typeof answers.email === "string" ? answers.email.trim().toLowerCase() : undefined,
    facilityName: typeof answers.facilityName === "string" ? answers.facilityName.trim() : undefined,
    coachBio: typeof answers.coachBio === "string" ? answers.coachBio.trim() : undefined,
    specialties: splitList(answers.specialties),
    location: typeof answers.location === "string" ? answers.location.trim() : undefined,
    profilePhotoName: typeof answers.profilePhotoName === "string" ? answers.profilePhotoName.trim() : undefined,
    firstGolferName: typeof answers.firstGolferName === "string" ? answers.firstGolferName.trim() : undefined,
    firstGolferEmail: typeof answers.firstGolferEmail === "string" ? answers.firstGolferEmail.trim().toLowerCase() : undefined,
    ageRange: typeof answers.ageRange === "string" ? answers.ageRange : undefined,
    handedness: typeof answers.handedness === "string" ? answers.handedness : undefined,
    skillLevel: role === "coach" ? "Coach" : asStringAnswer(rawAnswers.skillLevel, game?.skillLevel ?? "Casual golfer"),
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedClub, setSelectedClub] = useState("6-Iron");
  const [sessionViewSelection, setSessionViewSelection] = useState<SessionViewSelection>({
    club: ALL_SESSION_CLUBS,
    shotId: null,
    metric: null,
  });
  const [csvText, setCsvText] = useState("");
  const [importMessage, setImportMessage] = useState("Upload a CSV, photo, or manual entry to start.");
  const [importConfirmation, setImportConfirmation] = useState<string | null>(null);
  const [pendingImportReview, setPendingImportReview] = useState<ImportReview | null>(null);
  const [accountMode, setAccountMode] = useState<AccountMode>("pending");
  const [workspaceRole, setWorkspaceRole] = useState<VideoViewerRole>("user");
  const [videoLibraryMemberId, setVideoLibraryMemberId] = useState("current-user");
  const [videoLibraryMemberName, setVideoLibraryMemberName] = useState("");
  const [requestedVideoId, setRequestedVideoId] = useState<string | null>(null);
  const [practiceProfile, setPracticeProfile] = useState<UserPracticeProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [lastImport, setLastImport] = useState<LastImport>(EMPTY_LAST_IMPORT);
  const [userName, setUserName] = useState<string | null>(null);
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);
  const [showDevBuildInfo, setShowDevBuildInfo] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [forcePasswordReset, setForcePasswordReset] = useState(false);
  const [passwordModalMode, setPasswordModalMode] = useState<PasswordModalMode>("reset");
  const [showAccountGate, setShowAccountGate] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<LoginModalMode>("login");
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
  const [syncStatus, setSyncStatus] = useState("Choose how you want to use MAI Coach.");
  const [performanceTimeframe, setPerformanceTimeframe] = useState<PerformanceTimeframe>(DEFAULT_PERFORMANCE_TIMEFRAME);
  const accountConnectRequestRef = useRef(0);
  const sessionUrlHydratedRef = useRef(false);

  const clubs = useMemo(() => summarizeClubs(sessions), [sessions]);
  const insights = useMemo(() => computeInsights(clubs, sessions), [clubs, sessions]);
  const allShots = useMemo(() => sessions.flatMap((session) => session.shots), [sessions]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? EMPTY_SESSION;
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
  const ballCountLabel = `${allShots.length.toLocaleString()} ${allShots.length === 1 ? "ball" : "balls"}`;
  const performanceSessions = useMemo(
    () => filterSessionsByPerformanceTimeframe(sessions, performanceTimeframe),
    [sessions, performanceTimeframe],
  );
  const performanceClubs = useMemo(() => summarizeClubs(performanceSessions), [performanceSessions]);
  const performanceInsights = useMemo(
    () => computeInsights(performanceClubs, performanceSessions),
    [performanceClubs, performanceSessions],
  );
  const performanceShots = useMemo(() => performanceSessions.flatMap((session) => session.shots), [performanceSessions]);
  const performanceSelectedSession =
    performanceSessions.find((session) => session.id === selectedSessionId) ??
    performanceSessions[0] ??
    EMPTY_SESSION;
  const performanceSelectedSessionClubs = useMemo(
    () => summarizeClubs([performanceSelectedSession]),
    [performanceSelectedSession],
  );
  const performanceSelectedSessionInsights = useMemo(
    () => computeInsights(performanceSelectedSessionClubs, [performanceSelectedSession]),
    [performanceSelectedSessionClubs, performanceSelectedSession],
  );
  const performanceSelectedClubSummary =
    performanceSelectedSessionClubs.find((club) => club.club === selectedClub) ??
    performanceClubs.find((club) => club.club === selectedClub) ??
    performanceClubs[0];
  const performanceActiveClub = performanceSelectedClubSummary?.club ?? selectedClub;
  const performanceSelectedSessionHasClub = performanceSelectedSession.shots.some((shot) => shot.club === performanceActiveClub);
  const performanceSelectedClubShots = (performanceSelectedSessionHasClub ? performanceSelectedSession.shots : performanceShots)
    .filter((shot) => shot.club === performanceActiveClub);
  const performanceAvgCarry = performanceSelectedClubSummary?.carry ?? round(averageMetric(performanceShots, "carry"));
  const performanceAvgSmash = performanceSelectedClubSummary?.smash ?? round(averageMetric(performanceShots, "smash"), 2);
  const performanceAvgDispersion = performanceSelectedClubSummary?.dispersion ?? round(standardDeviation(metricValues(performanceShots, "offline")));
  const performanceQualityValues = performanceClubs.map((club) => club.quality).filter(Number.isFinite);
  const filteredPerformanceIndex = performanceQualityValues.length ? Math.round(average(performanceQualityValues)) : Number.NaN;
  const performanceTopInsight = performanceSelectedSessionInsights[0] ?? performanceInsights[0];
  const performanceTimeframeSummary = getPerformanceTimeframeSummary(
    performanceTimeframe,
    performanceSessions.length,
    sessions.length,
  );
  const visibleNavItems = navItemsForAccount(accountMode, accountUser);
  const activeNavItem = visibleNavItems.find((item) => item.id === activeTab) ?? NAV_ITEMS.find((item) => item.id === activeTab);

  useEffect(() => {
    setShowDevBuildInfo(window.location.hostname.includes("mai-coach-dev"));
  }, []);

  function writeSessionUrl(
    sessionId: string,
    selection: SessionViewSelection,
    mode: "push" | "replace" = "replace",
  ) {
    if (typeof window === "undefined" || !sessionId) return;
    const url = new URL(window.location.href);
    url.pathname = pathForTab("sessions");
    url.searchParams.delete("tab");
    url.searchParams.delete("video");
    url.searchParams.set("session", sessionId);
    if (selection.club && selection.club !== ALL_SESSION_CLUBS) {
      url.searchParams.set("club", selection.club);
    } else {
      url.searchParams.delete("club");
    }
    if (selection.shotId) {
      url.searchParams.set("shot", selection.shotId);
    } else {
      url.searchParams.delete("shot");
    }
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function resolveSelectionForSession(session: Session, requested: Partial<SessionViewSelection>) {
    return resolveSessionViewSelection(session, requested, {
      clubOrder: CLUB_ORDER,
      currentClub: selectedClub,
    }) as SessionViewSelection;
  }

  function applySessionViewSelection(requested: Partial<SessionViewSelection>, session = selectedSession) {
    const resolved = resolveSelectionForSession(session, requested);
    setSessionViewSelection(resolved);
    if (resolved.club !== ALL_SESSION_CLUBS) setSelectedClub(resolved.club);
    if (activeTab === "sessions" && session.id !== EMPTY_SESSION.id) {
      writeSessionUrl(session.id, resolved, "push");
    }
  }

  function openSessionView(sessionId: string, requested: Partial<SessionViewSelection> = {}) {
    const session = sessions.find((item) => item.id === sessionId) ?? selectedSession;
    const resolved = resolveSelectionForSession(session, requested);
    setSelectedSessionId(session.id);
    setSessionViewSelection(resolved);
    if (resolved.club !== ALL_SESSION_CLUBS) setSelectedClub(resolved.club);
    setActiveTab("sessions");
    writeSessionUrl(session.id, resolved, "push");
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedTab = tabFromValue(query.get("tab")) ?? tabFromPathname(window.location.pathname);
    if (requestedTab) {
      queueMicrotask(() => {
        setActiveTab(requestedTab);
        if (requestedTab === "videos") setRequestedVideoId(query.get("video"));
      });
    }
  }, []);

  useEffect(() => {
    if (sessionUrlHydratedRef.current || !sessions.length || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const sessionParam = url.searchParams.get("session");
    const clubParam = url.searchParams.get("club");
    const shotParam = url.searchParams.get("shot");

    if (!sessionParam && !clubParam && !shotParam) {
      sessionUrlHydratedRef.current = true;
      return;
    }

    const session = sessions.find((item) => item.id === sessionParam) ?? sessions[0];
    const resolved = resolveSessionViewSelection(session, {
      club: clubParam ?? undefined,
      shotId: shotParam ?? undefined,
    }, { clubOrder: CLUB_ORDER }) as SessionViewSelection;

    sessionUrlHydratedRef.current = true;
    setSelectedSessionId(session.id);
    setSessionViewSelection(resolved);
    if (resolved.club !== ALL_SESSION_CLUBS) setSelectedClub(resolved.club);
    if (tabFromPathname(window.location.pathname) === "sessions") {
      writeSessionUrl(session.id, resolved);
    }
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncFromBrowserHistory() {
      const url = new URL(window.location.href);
      const requestedTab = tabFromValue(url.searchParams.get("tab")) ?? tabFromPathname(url.pathname) ?? "dashboard";
      setActiveTab(requestedTab);
      setRequestedVideoId(requestedTab === "videos" ? url.searchParams.get("video") : null);

      if (requestedTab !== "sessions" || !sessions.length) return;

      const sessionParam = url.searchParams.get("session");
      const session = sessions.find((item) => item.id === sessionParam) ?? sessions[0];
      const resolved = resolveSessionViewSelection(session, {
        club: url.searchParams.get("club") ?? undefined,
        shotId: url.searchParams.get("shot") ?? undefined,
      }, { clubOrder: CLUB_ORDER }) as SessionViewSelection;
      setSelectedSessionId(session.id);
      setSessionViewSelection(resolved);
      if (resolved.club !== ALL_SESSION_CLUBS) setSelectedClub(resolved.club);
    }

    window.addEventListener("popstate", syncFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncFromBrowserHistory);
  }, [sessions]);

  useEffect(() => {
    if (selectedSession.id === EMPTY_SESSION.id) {
      if (sessionViewSelection.club !== ALL_SESSION_CLUBS || sessionViewSelection.shotId || sessionViewSelection.metric) {
        setSessionViewSelection({ club: ALL_SESSION_CLUBS, shotId: null, metric: null });
      }
      return;
    }

    const resolved = resolveSelectionForSession(selectedSession, sessionViewSelection);
    if (
      resolved.club !== sessionViewSelection.club ||
      (resolved.shotId ?? null) !== (sessionViewSelection.shotId ?? null) ||
      (resolved.metric ?? null) !== (sessionViewSelection.metric ?? null)
    ) {
      setSessionViewSelection(resolved);
      if (activeTab === "sessions") writeSessionUrl(selectedSession.id, resolved);
    }
  }, [selectedSession, sessionViewSelection.club, sessionViewSelection.shotId, sessionViewSelection.metric, activeTab]);

  useEffect(() => {
    void connectAccount();
    // Authentication is checked once when the app loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (accountMode !== "user") return;
    if (accountUser?.role === "member" && (activeTab === "coach" || activeTab === "admin")) {
      setActiveTab(sessions.length ? "videos" : "dashboard");
    }
    if (accountUser?.role === "coach" && activeTab === "admin") {
      setActiveTab("coach");
    }
  }, [accountMode, accountUser?.role, activeTab, sessions.length]);

  useEffect(() => {
    const storedProfile = readStoredPracticeProfile();
    const skippedOnboarding = readStoredOnboardingSkipped();
    if (storedProfile) {
      queueMicrotask(() => {
        setPracticeProfile(storedProfile);
        setShowOnboarding(false);
      });
      return;
    }

    if (skippedOnboarding) {
      queueMicrotask(() => {
        setShowOnboarding(false);
        setAccountMode((current) => current === "pending" ? "guest" : current);
        setSyncStatus("Using guest mode. Create an account anytime to save your work.");
      });
    }
  }, []);

  useEffect(() => {
    const applyStoredSessions = (storedSessions: Session[]) => {
      const firstSession = storedSessions[0] ?? EMPTY_SESSION;
      setSessions(storedSessions);
      setSelectedSessionId(firstSession.id === EMPTY_SESSION.id ? "" : firstSession.id);
      setSelectedClub(storedSessions[0]?.shots[0]?.club ?? "6-Iron");
      setSessionViewSelection(resolveSessionViewSelection(firstSession, {}, { clubOrder: CLUB_ORDER }) as SessionViewSelection);
    };
    if (accountMode !== "guest") return;
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
  }, [accountMode]);

  async function saveUserSessions(nextSessions: Session[]) {
    if (accountMode !== "user") return;
    const sanitizedSessions = sanitizeSessionList(nextSessions) as Session[];

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: sanitizedSessions }),
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

  function commitSessionDataChange(nextSessions: Session[], successMessage: string) {
    const sanitizedSessions = sanitizeSessionList(nextSessions) as Session[];
    const nextSelectedSession =
      sanitizedSessions.find((session) => session.id === selectedSessionId) ??
      sanitizedSessions[0] ??
      null;
    const nextLastImport = makeLastImportFromSession(getLastImportSession(sanitizedSessions));
    const nextClub =
      nextSelectedSession?.shots.some((shot) => shot.club === selectedClub)
        ? selectedClub
        : nextSelectedSession?.shots[0]?.club ?? "6-Iron";

    setSessions(sanitizedSessions);
    setSelectedSessionId(nextSelectedSession?.id ?? "");
    setSelectedClub(nextClub);
    setSessionViewSelection(
      nextSelectedSession
        ? (resolveSessionViewSelection(nextSelectedSession, sessionViewSelection, {
            clubOrder: CLUB_ORDER,
            currentClub: nextClub,
          }) as SessionViewSelection)
        : { club: ALL_SESSION_CLUBS, shotId: null, metric: null },
    );
    setLastImport(nextLastImport);
    setImportMessage(successMessage);
    setImportConfirmation(successMessage);
    setSyncStatus(accountMode === "user" ? "Saving updated session data..." : "Updated this guest session data.");

    if (accountMode === "user") {
      void saveUserSessions(sanitizedSessions);
      return;
    }

    if (sanitizedSessions.length) {
      storeImportState(sanitizedSessions, nextLastImport);
    } else {
      clearStoredImportState();
    }
  }

  function deleteSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const shotCount = session.shots.length;
    const confirmed = window.confirm(
      `Permanently delete "${session.title}"?\n\nThis removes all ${shotCount} ${shotCount === 1 ? "shot" : "shots"} from dashboard stats, charts, averages, insights, and performance reviews. This cannot be undone.`,
    );
    if (!confirmed) return;

    const nextSessions = sessions.filter((item) => item.id !== session.id);
    commitSessionDataChange(
      nextSessions,
      `${session.title} was deleted. Dashboard stats, charts, and insights were recalculated.`,
    );
  }

  function deleteShot(sessionId: string, shotId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    const shot = session?.shots.find((item) => item.id === shotId);
    if (!session || !shot) return;

    const shotLabel = shot.sourceShotNumber
      ? `shot #${shot.sourceShotNumber}`
      : `${getClubDisplayName(shot.club)} shot`;
    const removingFinalShot = session.shots.length <= 1;
    const confirmed = window.confirm(
      removingFinalShot
        ? `Permanently delete ${shotLabel} from "${session.title}"?\n\nThis is the only shot in the session, so the entire session will also be removed from stats, charts, averages, insights, and performance reviews. This cannot be undone.`
        : `Permanently delete ${shotLabel} from "${session.title}"?\n\nThis shot will be removed from stats, charts, averages, insights, and performance reviews. This cannot be undone.`,
    );
    if (!confirmed) return;

    const nextSessions = removingFinalShot
      ? sessions.filter((item) => item.id !== session.id)
      : sessions.map((item) =>
          item.id === session.id
            ? { ...item, shots: item.shots.filter((candidate) => candidate.id !== shot.id) }
            : item,
        );
    commitSessionDataChange(
      nextSessions,
      `${shotLabel} was deleted. Dashboard stats, charts, and insights were recalculated.`,
    );
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

  function practiceProfileTimestamp(profile: UserPracticeProfile | null | undefined, fallback?: string | null) {
    const completedAt = profile?.completedAt ? Date.parse(profile.completedAt) : Number.NaN;
    if (Number.isFinite(completedAt)) return completedAt;
    const fallbackAt = fallback ? Date.parse(fallback) : Number.NaN;
    return Number.isFinite(fallbackAt) ? fallbackAt : 0;
  }

  function shouldSaveLocalPracticeProfile(localProfile: UserPracticeProfile | null, serverProfile: UserPracticeProfile | null, serverUpdatedAt?: string | null) {
    if (!localProfile) return false;
    if (!serverProfile) return true;
    return practiceProfileTimestamp(localProfile) > practiceProfileTimestamp(serverProfile, serverUpdatedAt);
  }

  async function loadUserPracticeProfile() {
    try {
      const response = await fetch("/api/profile");
      if (!response.ok) return { profile: null, updatedAt: null };
      const payload = await response.json() as { profile?: UserPracticeProfile | null; updatedAt?: string | null };
      if (payload.profile) {
        setPracticeProfile(payload.profile);
        storePracticeProfile(payload.profile);
        return { profile: payload.profile, updatedAt: payload.updatedAt ?? null };
      } else {
        setPracticeProfile(null);
        return { profile: null, updatedAt: payload.updatedAt ?? null };
      }
    } catch {
      // The dashboard can still run without a saved profile.
    }
    return { profile: null, updatedAt: null };
  }

  async function syncUserPracticeProfileAfterSignIn() {
    const localProfile = readStoredPracticeProfile();
    const serverProfile = await loadUserPracticeProfile();

    if (!localProfile || !shouldSaveLocalPracticeProfile(localProfile, serverProfile.profile, serverProfile.updatedAt)) {
      return;
    }

    const saved = await saveUserPracticeProfile(localProfile);
    if (saved) {
      setPracticeProfile(localProfile);
      storePracticeProfile(localProfile);
    } else if (localProfile && !serverProfile.profile) {
      setPracticeProfile(localProfile);
      storePracticeProfile(localProfile);
    }
  }

  async function consumeLoginFromUrl() {
    const url = new URL(window.location.href);
    const isSetupRoute = url.pathname === "/setup-account";
    const token = isSetupRoute ? url.searchParams.get("token") : url.searchParams.get("login");
    if (!token) return false;

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; purpose?: string; redirectPath?: string };
      const shouldResetPassword = isSetupRoute || url.searchParams.get("resetPassword") === "1" || payload.purpose === "password_reset" || payload.purpose === "account_setup";
      url.searchParams.delete("login");
      url.searchParams.delete("token");
      url.searchParams.delete("resetPassword");
      window.history.replaceState(null, "", `${isSetupRoute ? "/" : url.pathname}${url.search}${url.hash}`);
      if (!response.ok) {
        setSyncStatus(payload.error ?? "This login link could not be used.");
        return false;
      }
      if (shouldResetPassword) {
        setPasswordModalMode(isSetupRoute || payload.purpose === "account_setup" ? "setup" : "reset");
        setForcePasswordReset(false);
        setShowPasswordResetModal(true);
        setSyncStatus(isSetupRoute || payload.purpose === "account_setup" ? "Welcome to MAI Coach. Create your password to finish setting up your account." : "Signed in. Choose a new password to finish reset.");
        return isSetupRoute || payload.purpose === "account_setup" ? "setup" : "reset";
      }
      setSyncStatus("Signed in from your secure email link.");
      return "login";
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
        cache: "no-store",
        credentials: "same-origin",
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
    const requestId = accountConnectRequestRef.current + 1;
    accountConnectRequestRef.current = requestId;
    const isCurrentRequest = () => accountConnectRequestRef.current === requestId;
    setSyncStatus("Checking your account...");
    try {
      const consumedLoginMode = await consumeLoginFromUrl();
      await acceptInvitationFromUrl();
      const accountResponse = await fetch("/api/account", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const accountPayload = await accountResponse.json().catch(() => ({})) as AccountPayload;
      if (!isCurrentRequest()) return false;
      setDevAuthEnabled(accountPayload.devAuthEnabled === true);

      if (!accountResponse.ok) {
        setSyncStatus(accountPayload.error ?? "Your account could not be checked right now. Retry.");
        if (options.promptForEmail) {
          setLoginModalMode("login");
          setShowLoginModal(true);
        }
        return false;
      }

      if (!accountPayloadConfirmsUser(accountPayload)) {
        setAccountMode("guest");
        setAccountUser(null);
        setUserName(null);
        setWorkspaceRole("user");
        setVideoLibraryMemberId("current-user");
        setVideoLibraryMemberName("");
        setSessions([]);
        setSelectedSessionId("");
        setSelectedClub("6-Iron");
        setSessionViewSelection({ club: ALL_SESSION_CLUBS, shotId: null, metric: null });
        setPracticeProfile(null);
        setForcePasswordReset(false);
        setSyncStatus("Sign in or create an account to open your private workspace.");
        if (options.promptForEmail) {
          setLoginModalMode("login");
          setShowLoginModal(true);
        }
        return false;
      }

      const signedInRole: VideoViewerRole =
        accountPayload.user?.role === "coach" || accountPayload.user?.role === "admin"
          ? accountPayload.user.role
          : "user";
      const signedInUser = accountPayload.user as AccountUser;
      const requiresPasswordReset = signedInUser.passwordResetRequired === true;
      clearStoredImportState();
      setAccountMode("user");
      setShowAccountGate(false);
      setWorkspaceRole(signedInRole);
      setAccountUser(signedInUser);
      setUserName(accountPayload.user?.displayName ?? accountPayload.user?.email ?? "Signed-in golfer");
      setVideoLibraryMemberId(signedInUser.id);
      setVideoLibraryMemberName(signedInUser.displayName);
      setSessions([]);
      setSelectedSessionId("");
      setSelectedClub("6-Iron");
      setSessionViewSelection({ club: ALL_SESSION_CLUBS, shotId: null, metric: null });
      setLastImport(EMPTY_LAST_IMPORT);
      setImportConfirmation(null);
      setPendingImportReview(null);
      setForcePasswordReset(requiresPasswordReset);
      setPasswordModalMode(consumedLoginMode === "setup" ? "setup" : requiresPasswordReset ? "temporary" : "reset");
      if (requiresPasswordReset) setShowPasswordResetModal(true);
      const requestedTab =
        tabFromValue(new URLSearchParams(window.location.search).get("tab")) ??
        tabFromPathname(window.location.pathname);
      const hasRequestedVideo = requestedTab === "videos" && new URLSearchParams(window.location.search).has("video");
      const nextTab = requestedTab ?? (signedInRole === "user" ? "dashboard" : "coach");
      setActiveTab(nextTab);
      setShowOnboarding(false);
      setSyncStatus(
        requiresPasswordReset
          ? "Signed in with a temporary password. Choose a new password to continue."
          : signedInRole === "user"
          ? "Signed in. Loading your sessions..."
          : `${signedInRole === "admin" ? "Admin" : "Coach"} workspace ready. Loading data...`,
      );

      try {
        const sessionsResponse = await fetch("/api/sessions", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await sessionsResponse.json().catch(() => ({})) as SessionsPayload;
        if (!isCurrentRequest()) return false;
        if (!sessionsResponse.ok || payload.mode !== "user") {
          throw new Error(payload.error ?? "Session history could not be loaded.");
        }
        const savedSessions = sanitizeSessionList(Array.isArray(payload.sessions) ? payload.sessions : []) as Session[];
        const defaultMemberTab = savedSessions.length ? "videos" : "dashboard";
        const sessionsTab =
          signedInRole === "user" && !savedSessions.length && !hasRequestedVideo
            ? "dashboard"
            : requestedTab ?? (signedInRole === "user" ? defaultMemberTab : "coach");
        setSessions(savedSessions);
        setSelectedSessionId(savedSessions[0]?.id ?? "");
        setSelectedClub(savedSessions[0]?.shots?.[0]?.club ?? "6-Iron");
        setSessionViewSelection(
          savedSessions[0]
            ? (resolveSessionViewSelection(savedSessions[0], {}, { clubOrder: CLUB_ORDER }) as SessionViewSelection)
            : { club: ALL_SESSION_CLUBS, shotId: null, metric: null },
        );
        setLastImport(makeLastImportFromSession(getLastImportSession(savedSessions)));
        setActiveTab(sessionsTab);
        setSyncStatus(
          requiresPasswordReset
            ? "Signed in with a temporary password. Choose a new password to continue."
            : signedInRole === "user"
            ? savedSessions.length ? "Loaded your saved sessions." : "Signed in. Upload your first session to start analysis."
            : `${signedInRole === "admin" ? "Admin" : "Coach"} workspace ready.`,
        );
      } catch {
        if (!isCurrentRequest()) return false;
        setSyncStatus("You are signed in, but your session history could not be loaded. Retry.");
      }
      await syncUserPracticeProfileAfterSignIn();
      return true;
    } catch {
      if (!isCurrentRequest()) return false;
      setSyncStatus("Your account could not be checked right now. Retry.");
      if (options.promptForEmail) {
        setLoginModalMode("login");
        setShowLoginModal(true);
      }
      return false;
    }
  }

  function openSignup() {
    setRegistrationDraft(null);
    setShowOnboarding(false);
    setShowAccountGate(false);
    setShowPasswordResetModal(false);
    setForcePasswordReset(false);
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus("Create your account to continue.");
  }

  function continueAsGuest() {
    setShowAccountGate(false);
    setShowOnboarding(false);
    setShowLoginModal(false);
    setShowPasswordResetModal(false);
    setForcePasswordReset(false);
    setAccountMode("guest");
    setSessions([]);
    setSelectedSessionId("");
    setSelectedClub("6-Iron");
    setSessionViewSelection({ club: ALL_SESSION_CLUBS, shotId: null, metric: null });
    setLastImport(EMPTY_LAST_IMPORT);
    setPendingImportReview(null);
    setSyncStatus("Using guest mode. Create an account anytime to save your work.");
  }

  async function logOut() {
    setSyncStatus("Signing out...");
    await Promise.allSettled([
      fetch("/api/auth/verify", { method: "DELETE", cache: "no-store", credentials: "same-origin" }),
      devAuthEnabled ? fetch("/api/dev-auth", { method: "DELETE", cache: "no-store", credentials: "same-origin" }) : Promise.resolve(),
    ]);
    setAccountMode("guest");
    setAccountUser(null);
    setUserName(null);
    setWorkspaceRole("user");
    setVideoLibraryMemberId("current-user");
    setVideoLibraryMemberName("");
    setRequestedVideoId(null);
    setSessions([]);
    setSelectedSessionId("");
    setSelectedClub("6-Iron");
    setSessionViewSelection({ club: ALL_SESSION_CLUBS, shotId: null, metric: null });
    setPracticeProfile(null);
    setLastImport(EMPTY_LAST_IMPORT);
    setImportConfirmation(null);
    setPendingImportReview(null);
    clearStoredImportState();
    setActiveTab("videos");
    setShowOnboarding(false);
    setShowAccountGate(false);
    setShowPasswordResetModal(false);
    setForcePasswordReset(false);
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus("Signed out. Create a new account or sign in.");
  }

  async function handleOwnProfilePhoto(file: File | null) {
    if (!file || !accountUser) return;
    try {
      const photo = await uploadCoachPhoto(accountUser.id, file);
      setAccountUser((current) => current ? { ...current, profileImageUrl: photo?.url ?? current.profileImageUrl } : current);
      setSyncStatus("Profile photo updated.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Profile photo could not be saved.");
    }
  }

  async function removeOwnProfilePhoto() {
    if (!accountUser) return;
    try {
      await deleteCoachPhoto(accountUser.id);
      setAccountUser((current) => current ? { ...current, profileImageUrl: "" } : current);
      setSyncStatus("Profile photo removed.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Profile photo could not be removed.");
    }
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

  function finishOnboarding(profile: UserPracticeProfile, draft?: RegistrationDraft) {
    setPracticeProfile(profile);
    storePracticeProfile(profile);
    if (accountMode === "user") void saveUserPracticeProfile(profile);
    clearOnboardingDraft();
    clearOnboardingSkipped();
    setShowOnboarding(false);
    setShowAccountGate(false);
    setAccountMode((current) => current === "pending" ? "guest" : current);
    setRegistrationDraft(draft ?? null);
    setActiveTab(profile.role === "coach" ? "coach" : "import");
    setLoginModalMode("register");
    setShowLoginModal(true);
    setSyncStatus(profile.role === "coach" ? "Create your coach account to manage players." : "Create your account to save your practice profile.");
  }

  function skipOnboarding() {
    storeOnboardingSkipped();
    clearOnboardingDraft();
    setShowOnboarding(false);
    setShowAccountGate(true);
    setAccountMode("guest");
    setShowLoginModal(false);
    setShowPasswordResetModal(false);
    setForcePasswordReset(false);
    setPasswordModalMode("reset");
    setSyncStatus("Create an account, sign in, or continue as guest.");
  }

  function importShots(
    shots: Shot[],
    submissionType: LastImport["submissionType"],
    simulator = DEFAULT_SIMULATOR,
    metadata: PhotoImportMetadata = {},
    notes = "",
  ) {
    if (!shots.length) {
      setImportMessage("No shot data detected");
      return;
    }
    const review = buildImportReview(shots, submissionType, simulator, metadata, notes);
    setPendingImportReview(review);
    setActiveTab("import");
    setImportMessage(
      `${review.shots.length} ${review.shots.length === 1 ? "shot is" : "shots are"} ready for review. ` +
      `${review.missingMetrics.length ? "Unavailable values will show as NA." : "All core values were detected."}`,
    );
    setImportConfirmation(null);
  }

  function updatePendingImportReview(updater: (review: ImportReview) => ImportReview) {
    setPendingImportReview((current) => {
      if (!current) return current;
      const updated = updater(current);
      const normalizedCsv = updated.submissionType === "Photo"
        ? generateNormalizedPhotoImportCsv({
          sessionId: updated.metadata.photoImportJobId ?? updated.id,
          sessionDate: updated.date,
          simulator: updated.simulator,
          club: updated.shots[0]?.club ?? updated.inferredClub ?? "Unknown Club",
          shots: updated.shots,
          notes: updated.notes,
        })
        : generateCanonicalLaunchMonitorCsv({
          sessionId: updated.metadata.sessionId ?? updated.id,
          sessionDate: updated.date,
          simulator: updated.simulator,
          shots: updated.shots,
          notes: updated.notes,
        });
      return {
        ...updated,
        csvText: normalizedCsv,
        detectedMetrics: getDetectedImportMetrics(updated.shots),
        metadata: {
          ...updated.metadata,
          sourceCounts: metricSourceCounts(updated.shots),
          measuredMetrics: metricSourcesForKind(updated.shots, "measured"),
          derivedMetrics: metricSourcesForKind(updated.shots, "derived"),
          estimatedMetrics: metricSourcesForKind(updated.shots, "estimated"),
          missingMetrics: getMissingImportMetrics(updated.shots),
          normalizedCsv,
        },
        missingMetrics: getMissingImportMetrics(updated.shots),
      };
    });
  }

  function confirmPendingImport() {
    if (!pendingImportReview) {
      setImportMessage("No import is waiting for review.");
      return;
    }
    const review = pendingImportReview;
    if (review.blockingIssues?.length) {
      setImportMessage(`Resolve before saving: ${review.blockingIssues.join(" ")}`);
      return;
    }
    const nextSession = buildImportedSession(
      review.shots,
      review.submissionType,
      review.simulator,
      review.metadata,
      review.notes,
      review.missingMetrics,
    );
    const nextSessions = sanitizeSessionList([nextSession, ...sessions]) as Session[];
    if (!nextSessions.some((session) => session.id === nextSession.id)) {
      setImportMessage("That import did not include usable shot data. Add club plus at least one real launch-monitor metric.");
      return;
    }
    const nextLastImport = makeLastImport(
      review.submissionType,
      review.shots,
      nextSession.date,
      review.simulator,
      review.location,
      review.notes,
      review.missingMetrics,
    );
    const nextSelectedClub = chooseClubForImportedSession(nextSession.shots, selectedClub, CLUB_ORDER);
    setSessions(nextSessions);
    setSelectedSessionId(nextSession.id);
    setSelectedClub(nextSelectedClub);
    setSessionViewSelection(resolveSessionViewSelection(nextSession, {}, { clubOrder: CLUB_ORDER }) as SessionViewSelection);
    setActiveTab("dashboard");
    setLastImport(nextLastImport);
    setPendingImportReview(null);
    if (accountMode !== "user") {
      storeImportState(nextSessions, nextLastImport);
    }
    const importedClubNames = Array.from(new Set(review.shots.map((shot) => getClubDisplayName(shot.club))));
    const clubLabel = importedClubNames.length === 1 ? importedClubNames[0] : `${importedClubNames.length} clubs`;
    const successMessage =
      `${review.shots.length} ${clubLabel} ${review.shots.length === 1 ? "shot" : "shots"} successfully uploaded and analyzed. ` +
      `Location: ${nextSession.location ?? LOCATION_UNAVAILABLE}. ` +
      `${review.missingMetrics.length ? "Unavailable metrics display as NA." : "Core metrics are ready across the app."}`;
    setImportMessage(successMessage);
    setImportConfirmation(successMessage);
    void saveUserSessions(nextSessions);
  }

  function importCsv(submissionType: LastImport["submissionType"] = "CSV / Excel", notes = "", sourceFileName = "Uploaded CSV") {
    if (accountMode === "user" && csvText.trim() === DEMO_CSV.trim()) {
      setImportMessage("Sample CSV rows are demo data. Upload or paste your own simulator rows before saving to your account.");
      setImportConfirmation(null);
      return;
    }
    const parsed = parseCsvForImport(csvText, sourceFileName);
    importShots(parsed.shots, submissionType, parsed.metadata.simulator ?? "CSV", parsed.metadata, notes);
  }

  function navigateToTab(tab: Tab) {
    setActiveTab(tab);
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.pathname = pathForTab(tab);
    url.searchParams.delete("tab");
    if (tab !== "videos") url.searchParams.delete("video");
    if (tab !== "sessions") {
      url.searchParams.delete("session");
      url.searchParams.delete("club");
      url.searchParams.delete("shot");
    } else if (selectedSession.id !== EMPTY_SESSION.id) {
      url.searchParams.set("session", selectedSession.id);
      if (sessionViewSelection.club && sessionViewSelection.club !== ALL_SESSION_CLUBS) {
        url.searchParams.set("club", sessionViewSelection.club);
      } else {
        url.searchParams.delete("club");
      }
      if (sessionViewSelection.shotId) {
        url.searchParams.set("shot", sessionViewSelection.shotId);
      } else {
        url.searchParams.delete("shot");
      }
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
        onSkip={skipOnboarding}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="MAI Coach navigation">
        <div className="brand-lockup">
          <div className="brand-logo">
            <MaiCoachLogoMark />
          </div>
          <div>
            <strong>MAI Coach</strong>
            <span>Your swing, explained.</span>
          </div>
        </div>
        <div className={cls("rail-account-status", accountMode)}>
          {accountMode === "user" && accountUser && <AccountAvatar user={accountUser} />}
          <span>{accountStatusLabel}</span>
          <strong>{accountStatusName}</strong>
          {accountMode === "user" ? (
            <>
              <div className="rail-photo-actions">
                <label>
                  Photo
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      void handleOwnProfilePhoto(file);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                <button disabled={!accountUser?.profileImageUrl} onClick={() => void removeOwnProfilePhoto()} type="button">Remove</button>
              </div>
              <button onClick={() => void logOut()} type="button">
                Log out
              </button>
            </>
          ) : (
            <button onClick={openSignup} type="button">
              Sign up
            </button>
          )}
        </div>
        <nav className="rail-nav">
          {visibleNavItems.map((item) => (
            <button
              className={cls("rail-button", activeTab === item.id && "active")}
              key={item.id}
              onClick={() => navigateToTab(item.id)}
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
          {showDevBuildInfo && (
            <small className="dev-build-marker">Dev build: {APP_BUILD_INFO.shortCommit}</small>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTab === "dashboard" ? "Swing analytics" : "MAI Coach"}</p>
            <h1>{activeTab === "dashboard" ? "Performance Review" : activeNavItem?.label}</h1>
            <p className="page-description">{PAGE_DESCRIPTIONS[activeTab]}</p>
          </div>
          <div className="topbar-actions" aria-label="Session controls">
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
            avgCarry={performanceAvgCarry}
            avgDispersion={performanceAvgDispersion}
            avgSmash={performanceAvgSmash}
            clubs={performanceClubs}
            hasAnySessions={sessions.length > 0}
            insights={performanceInsights}
            onTimeframeChange={setPerformanceTimeframe}
            onOpenSessionForClub={(sessionId, club) => openSessionView(sessionId, { club, shotId: null })}
            performanceIndex={filteredPerformanceIndex}
            practiceProfile={practiceProfile}
            selectedClub={performanceActiveClub}
            selectedClubShots={performanceSelectedClubShots}
            selectedClubSummary={performanceSelectedClubSummary}
            selectedSession={performanceSelectedSession}
            sessions={performanceSessions}
            shots={performanceShots}
            timeframe={performanceTimeframe}
            timeframeSummary={performanceTimeframeSummary}
            topInsight={performanceTopInsight}
            setActiveTab={setActiveTab}
            setSelectedClub={setSelectedClub}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsView
            canAnalyzeSession={accountMode === "user"}
            onDeleteSession={deleteSession}
            onDeleteShot={deleteShot}
            onOpenSession={(sessionId, selection) => openSessionView(sessionId, selection)}
            onSelectionChange={applySessionViewSelection}
            sessionSelection={sessionViewSelection}
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
            setActiveTab={setActiveTab}
            setSelectedClub={setSelectedClub}
            setSelectedSessionId={setSelectedSessionId}
          />
        )}

        {activeTab === "clubs" && <ClubsView clubs={clubs} selectedClub={activeClub} setActiveTab={setActiveTab} />}

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
            accountUser={accountUser}
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

        {activeTab === "admin" && (
          <AdminView
            accountUser={accountUser}
            authenticated={accountMode === "user"}
            onOpenMemberVideos={(memberId, memberName) => {
              setVideoLibraryMemberId(memberId);
              setVideoLibraryMemberName(memberName);
              setWorkspaceRole("admin");
              setActiveTab("videos");
            }}
            onOpenCoachTools={(memberId, memberName) => {
              setVideoLibraryMemberId(memberId);
              setVideoLibraryMemberName(memberName);
              setWorkspaceRole("admin");
              setActiveTab("coach");
            }}
          />
        )}

        {activeTab === "practice" && (
          <PracticeView
            accountUser={accountUser}
            insights={insights}
            practiceProfile={practiceProfile}
            sessions={sessions}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "import" && (
          <ImportView
            csvText={csvText}
            importCsv={importCsv}
            cancelImportReview={() => {
              setPendingImportReview(null);
              setImportMessage("Import review cleared.");
            }}
            confirmImportReview={confirmPendingImport}
            importManualShot={(shot, metadata, notes) => importShots([shot], "Manual entry", "Manual entry", metadata, notes)}
            importPhotoShots={(shots, simulator, metadata, notes) => importShots(shots, "Photo", simulator, metadata, notes)}
            importMessage={importMessage}
            lastImport={lastImport}
            pendingImportReview={pendingImportReview}
            setCsvText={setCsvText}
            updateImportReview={updatePendingImportReview}
          />
        )}
      </section>

      {(showAccountGate || accountMode === "pending") && (
        <AccountGate
          connectAccount={() => {
            setShowPasswordResetModal(false);
            setLoginModalMode("login");
            return connectAccount({ promptForEmail: true });
          }}
          createAccount={() => {
            setShowAccountGate(false);
            setShowPasswordResetModal(false);
            setLoginModalMode("register");
            setShowLoginModal(true);
          }}
          continueAsGuest={continueAsGuest}
          syncStatus={syncStatus}
        />
      )}

      {showLoginModal && (
        <LoginRequestModal
          initialMode={loginModalMode}
          onAuthenticated={async () => {
            const authenticated = await connectAccount();
            if (authenticated) {
              setShowLoginModal(false);
              setShowAccountGate(false);
            }
            return authenticated;
          }}
          onClose={() => setShowLoginModal(false)}
          onStatus={setSyncStatus}
          registrationDraft={registrationDraft}
        />
      )}

      {showPasswordResetModal && (
        <PasswordResetModal
          force={forcePasswordReset}
          mode={passwordModalMode}
          onClose={() => {
            if (!forcePasswordReset) setShowPasswordResetModal(false);
          }}
          onPasswordUpdated={() => {
            setForcePasswordReset(false);
            setPasswordModalMode("reset");
            setShowPasswordResetModal(false);
            setAccountUser((current) => current ? { ...current, passwordResetRequired: false } : current);
          }}
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
  hasAnySessions,
  insights,
  onTimeframeChange,
  onOpenSessionForClub,
  performanceIndex,
  practiceProfile,
  selectedClub,
  selectedClubShots,
  selectedClubSummary,
  selectedSession,
  sessions,
  setActiveTab,
  setSelectedClub,
  shots,
  timeframe,
  timeframeSummary,
  topInsight,
}: {
  avgCarry: number;
  avgDispersion: number;
  avgSmash: number;
  clubs: ClubSummary[];
  hasAnySessions: boolean;
  insights: Insight[];
  onTimeframeChange: (timeframe: PerformanceTimeframe) => void;
  onOpenSessionForClub: (sessionId: string, club: string) => void;
  performanceIndex: number;
  practiceProfile?: UserPracticeProfile | null;
  selectedClub: string;
  selectedClubShots: Shot[];
  selectedClubSummary?: ClubSummary;
  selectedSession: Session;
  sessions: Session[];
  shots: Shot[];
  timeframe: PerformanceTimeframe;
  timeframeSummary: string;
  topInsight?: Insight;
  setActiveTab: (tab: Tab) => void;
  setSelectedClub: (club: string) => void;
}) {
  const selectedClubLabel = getClubDisplayName(selectedClub);
  const dashboardSummary = useMemo(
    () => buildDashboardSummary(
      selectedClub,
      selectedClubSummary,
      selectedClubShots,
      avgCarry,
      avgDispersion,
      avgSmash,
      performanceIndex,
    ),
    [avgCarry, avgDispersion, avgSmash, performanceIndex, selectedClub, selectedClubShots, selectedClubSummary],
  );
  const dashboardOpportunity = useMemo(
    () => buildDashboardOpportunity(selectedClub, selectedClubSummary, selectedClubShots, topInsight),
    [selectedClub, selectedClubShots, selectedClubSummary, topInsight],
  );
  const dashboardMetrics = useMemo(
    () => buildDashboardMetricDetails(selectedClub, selectedClubSummary, selectedClubShots, practiceProfile),
    [practiceProfile, selectedClub, selectedClubShots, selectedClubSummary],
  );
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);
  const activeMetricId = expandedMetricId ?? dashboardMetrics[0]?.id ?? null;

  if (!sessions.length) {
    return (
      <div className="view-stack">
        <PerformanceReviewControls
          clubs={clubs}
          onTimeframeChange={onTimeframeChange}
          selectedClub={selectedClub}
          selectedClubLabel={selectedClubLabel}
          selectedClubShots={selectedClubShots.length}
          setSelectedClub={setSelectedClub}
          timeframe={timeframe}
          timeframeSummary={timeframeSummary}
        />
        {hasAnySessions ? (
          <TimeframeEmptyState
            onReset={() => onTimeframeChange(DEFAULT_PERFORMANCE_TIMEFRAME)}
            timeframeLabel={getPerformanceTimeframeLabel(timeframe)}
          />
        ) : (
          <FirstSessionEmptyState setActiveTab={setActiveTab} />
        )}
      </div>
    );
  }

  return (
    <div className="view-stack">
      <PerformanceReviewControls
        clubs={clubs}
        onTimeframeChange={onTimeframeChange}
        selectedClub={selectedClub}
        selectedClubLabel={selectedClubLabel}
        selectedClubShots={selectedClubShots.length}
        setSelectedClub={setSelectedClub}
        timeframe={timeframe}
        timeframeSummary={timeframeSummary}
      />

      <HomepageDashboardHero
        opportunity={dashboardOpportunity}
        selectedClubLabel={selectedClubLabel}
        selectedClubShots={selectedClubShots}
        selectedSession={selectedSession}
        setActiveTab={setActiveTab}
        summary={dashboardSummary}
      />

      <DashboardMetricAccordion
        activeMetricId={activeMetricId}
        benchmarkNotice={dashboardSummary.benchmarkNotice}
        metrics={dashboardMetrics}
        onToggle={(metricId) => setExpandedMetricId((current) => current === metricId ? null : metricId)}
      />

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <PanelHeader
            kicker="Shot pattern"
            title={selectedSession.title}
            meta={`${formatDate(selectedSession.date)} · ${selectedSession.source}${selectedSession.location ? ` · ${selectedSession.location}` : ""}`}
            action={<button className="text-button" onClick={() => onOpenSessionForClub(selectedSession.id, selectedClub)}>Open {selectedClubLabel}</button>}
          />
          <ShotMap shots={selectedClubShots.length ? selectedClubShots : selectedSession.shots} />
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
          <GapLadder clubs={clubs} onSelectClub={(club) => onOpenSessionForClub(selectedSession.id, club)} />
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

function PerformanceReviewControls({
  clubs,
  onTimeframeChange,
  selectedClub,
  selectedClubLabel,
  selectedClubShots,
  setSelectedClub,
  timeframe,
  timeframeSummary,
}: {
  clubs: ClubSummary[];
  onTimeframeChange: (timeframe: PerformanceTimeframe) => void;
  selectedClub: string;
  selectedClubLabel: string;
  selectedClubShots: number;
  setSelectedClub: (club: string) => void;
  timeframe: PerformanceTimeframe;
  timeframeSummary: string;
}) {
  function updateTimeframe(next: Partial<PerformanceTimeframe>) {
    onTimeframeChange({ ...timeframe, ...next });
  }

  return (
    <section className="control-strip performance-review-controls">
      <div>
        <p className="eyebrow">Performance Review</p>
        <h2>{selectedClubLabel} view</h2>
        <span>{timeframeSummary} · {selectedClubShots} {selectedClubShots === 1 ? "shot" : "shots"} matched</span>
      </div>
      <div className="performance-filter-group">
        <label className="select-control">
          <span>Timeframe</span>
          <select
            value={timeframe.preset}
            onChange={(event) => updateTimeframe({ preset: event.target.value as PerformanceTimeframePreset })}
          >
            {PERFORMANCE_TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {timeframe.preset === "custom" && (
          <div className="custom-date-range">
            <label>
              <span>Start</span>
              <input
                onChange={(event) => updateTimeframe({ startDate: event.target.value })}
                type="date"
                value={timeframe.startDate}
              />
            </label>
            <label>
              <span>End</span>
              <input
                onChange={(event) => updateTimeframe({ endDate: event.target.value })}
                type="date"
                value={timeframe.endDate}
              />
            </label>
          </div>
        )}
        {clubs.length > 0 && (
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
        )}
      </div>
    </section>
  );
}

function TimeframeEmptyState({
  onReset,
  timeframeLabel,
}: {
  onReset: () => void;
  timeframeLabel: string;
}) {
  return (
    <section className="panel performance-empty-state">
      <p className="eyebrow">No matching sessions</p>
      <h2>No data in {timeframeLabel}</h2>
      <p>Choose a wider timeframe to bring existing sessions back into the Performance Review.</p>
      <button className="primary-action" onClick={onReset} type="button">
        Show All Time
      </button>
    </section>
  );
}

function HomepageDashboardHero({
  opportunity,
  selectedClubLabel,
  selectedClubShots,
  selectedSession,
  setActiveTab,
  summary,
}: {
  opportunity: DashboardOpportunity;
  selectedClubLabel: string;
  selectedClubShots: Shot[];
  selectedSession: Session;
  setActiveTab: (tab: Tab) => void;
  summary: DashboardSummary;
}) {
  const carryValue = dashboardMetricValue(summary.carry, "yd");
  const dispersionValue = Number.isFinite(summary.dispersionWidth) ? `${summary.dispersionWidth} yd` : "NA";
  const scoreValue = Number.isFinite(summary.sessionScore) ? Math.round(summary.sessionScore).toString() : "NA";

  return (
    <section className="home-dashboard-shell">
      <div className="home-dashboard-header">
        <div>
          <p className="eyebrow">Your Performance</p>
          <h2>Your {selectedClubLabel}</h2>
          <span>
            {selectedClubShots.length} {selectedClubShots.length === 1 ? "shot" : "shots"} analyzed
            {selectedSession.title ? ` from ${selectedSession.title}` : ""}
          </span>
          <p>{summary.summaryText}</p>
        </div>
        <div className="session-score-ring" aria-label={`Session score ${scoreValue} out of 100`}>
          <strong>{scoreValue}</strong>
          <span>Session Score</span>
        </div>
      </div>

      <div className="home-dashboard-main">
        <article className="home-visual-card">
          <div className="home-visual-copy">
            <span>Shot Summary</span>
            <strong>{selectedClubLabel} pattern</strong>
            <p>Distance grid and left-right finish pattern for the selected club.</p>
          </div>
          <DashboardHeroVisual shots={selectedClubShots.length ? selectedClubShots : selectedSession.shots} />
        </article>

        <div className="home-results-stack">
          <div className="home-result-grid">
            <DashboardResultCard
              label="Average Carry"
              note="How far the ball flew before landing."
              tone="good"
              value={carryValue}
            />
            <DashboardResultCard
              label="Contact"
              note={Number.isFinite(summary.contact) ? `Smash ${summary.contact.toFixed(2)} contact efficiency.` : "Smash factor is NA."}
              tone={summary.contactTone}
              value={summary.contactLabel}
            />
            <DashboardResultCard
              label="Typical Shot Spread"
              note="Approximate width of the shot group."
              tone={Number.isFinite(summary.dispersion) && summary.dispersion > 15 ? "watch" : "good"}
              value={dispersionValue}
            />
          </div>

          <DashboardOpportunityPanel opportunity={opportunity} setActiveTab={setActiveTab} />
        </div>
      </div>
    </section>
  );
}

function DashboardResultCard({
  label,
  note,
  tone,
  value,
}: {
  label: string;
  note: string;
  tone: DashboardMetricTone;
  value: string;
}) {
  return (
    <article className={cls("home-result-card", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
      <i aria-hidden="true" />
    </article>
  );
}

function DashboardOpportunityPanel({
  opportunity,
  setActiveTab,
}: {
  opportunity: DashboardOpportunity;
  setActiveTab: (tab: Tab) => void;
}) {
  return (
    <article className={cls("home-opportunity-card", opportunity.tone)}>
      <div>
        <p className="eyebrow">Your Biggest Opportunity</p>
        <h3>{opportunity.title}</h3>
        <p>{opportunity.body}</p>
      </div>
      <button className="primary-action" onClick={() => setActiveTab("practice")} type="button">
        {opportunity.action}
      </button>
    </article>
  );
}

function DashboardHeroVisual({ shots }: { shots: Shot[] }) {
  const availableShots = shots.filter((shot) => Number.isFinite(getShotMetric(shot, "carry")) || Number.isFinite(getShotMetric(shot, "offline")));
  const carryValues = availableShots.map((shot) => getShotMetric(shot, "carry")).filter((value): value is number => typeof value === "number");
  const offlineValues = availableShots.map((shot) => getShotMetric(shot, "offline")).filter((value): value is number => typeof value === "number");
  const minCarry = carryValues.length ? Math.min(...carryValues) : 0;
  const maxCarry = carryValues.length ? Math.max(...carryValues) : 180;
  const maxOffline = Math.max(12, ...offlineValues.map((value) => Math.abs(value)));
  const carryRange = Math.max(1, maxCarry - minCarry);
  const gridCarries = [minCarry, minCarry + carryRange / 2, maxCarry].map((value) => Math.round(value));

  function pointForShot(shot: Shot) {
    const carry = getShotMetric(shot, "carry");
    const offline = getShotMetric(shot, "offline");
    const offlineForPosition = typeof offline === "number" ? offline : 0;
    const carryForPosition = typeof carry === "number" ? carry : minCarry;
    const x = 230 + clamp(offlineForPosition / maxOffline, -1, 1) * 165;
    const y = 220 - clamp((carryForPosition - minCarry) / carryRange, 0, 1) * 150;
    return { x, y };
  }

  return (
    <svg className="home-shot-visual" role="img" viewBox="0 0 460 260" aria-label="Shot distance and dispersion grid">
      <defs>
        <linearGradient id="homeShotGlow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#96cb39" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      <rect className="home-shot-field" fill="url(#homeShotGlow)" x="28" y="22" width="404" height="210" rx="8" />
      {[0, 1, 2].map((index) => (
        <g key={`carry-grid-${index}`}>
          <line className="home-shot-grid" x1="52" x2="408" y1={70 + index * 62} y2={70 + index * 62} />
          <text className="home-shot-label" x="56" y={64 + index * 62}>{gridCarries[2 - index]} yd</text>
        </g>
      ))}
      {[-1, 0, 1].map((position) => (
        <line
          className={cls("home-shot-grid", position === 0 && "target")}
          key={`offline-grid-${position}`}
          x1={230 + position * 130}
          x2={230 + position * 130}
          y1="46"
          y2="218"
        />
      ))}
      <path className="home-shot-arc" d="M230 220 C246 174 249 123 230 48" />
      <ellipse className="home-shot-group" cx="230" cy="138" rx="84" ry="132" />
      {availableShots.slice(0, 24).map((shot) => {
        const point = pointForShot(shot);
        return <circle className="home-shot-dot" cx={point.x} cy={point.y} key={shot.id} r="5" />;
      })}
      <text className="home-shot-target" x="238" y="214">Target line</text>
      <text className="home-shot-footer" x="52" y="246">Left miss</text>
      <text className="home-shot-footer" x="350" y="246">Right miss</text>
    </svg>
  );
}

function DashboardMetricAccordion({
  activeMetricId,
  benchmarkNotice,
  metrics,
  onToggle,
}: {
  activeMetricId: string | null;
  benchmarkNotice: string;
  metrics: DashboardMetricDetail[];
  onToggle: (metricId: string) => void;
}) {
  return (
    <section className="panel dashboard-metric-panel">
      <div className="dashboard-metric-heading">
        <div>
          <p className="eyebrow">Your Stats</p>
          <h2>What the numbers mean</h2>
          <span>{benchmarkNotice}</span>
        </div>
      </div>
      <div className="dashboard-metric-list">
        {metrics.map((metric) => (
          <DashboardMetricRow
            expanded={activeMetricId === metric.id}
            key={metric.id}
            metric={metric}
            onToggle={() => onToggle(metric.id)}
          />
        ))}
      </div>
    </section>
  );
}

function DashboardMetricRow({
  expanded,
  metric,
  onToggle,
}: {
  expanded: boolean;
  metric: DashboardMetricDetail;
  onToggle: () => void;
}) {
  return (
    <article className={cls("dashboard-metric-row", metric.tone, expanded && "expanded")}>
      <button aria-expanded={expanded} onClick={onToggle} type="button">
        <DashboardMetricVisual metric={metric} />
        <span className="dashboard-metric-main">
          <strong>{metric.label}</strong>
          <small>{metric.description}</small>
        </span>
        <span className="dashboard-metric-value">
          <strong>{metric.value}</strong>
          <small>{metric.status}</small>
        </span>
        <span className="dashboard-metric-chevron" aria-hidden="true">&gt;</span>
      </button>
      {expanded && <MetricEducationPanel metric={metric} />}
    </article>
  );
}

function MetricEducationPanel({ metric }: { metric: DashboardMetricDetail }) {
  const educationContent = getMetricEducationContent(metric) as MetricEducationContent;
  const cards = buildMetricEducationCards(educationContent) as MetricEducationCardContent[];
  const hasVideo = metricEducationHasVideo(educationContent);

  return (
    <div className={cls("dashboard-metric-detail", hasVideo && "has-video")}>
      <div className="metric-education-card-grid">
        {cards.map((card) => (
          <MetricEducationCard card={card} key={card.id} />
        ))}
      </div>
      {educationContent.video && (
        <MetricVideoThumbnail
          metricLabel={metric.label}
          video={educationContent.video}
        />
      )}
    </div>
  );
}

function MetricEducationCard({ card }: { card: MetricEducationCardContent }) {
  return (
    <section className="metric-education-card">
      <span>{card.title}</span>
      <p>{card.body}</p>
    </section>
  );
}

function MetricVideoThumbnail({
  metricLabel,
  video,
}: {
  metricLabel: string;
  video: MetricEducationVideo;
}) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalTitleId = `metric-video-title-${metricLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const closeModal = useCallback(() => {
    const player = videoRef.current;
    if (player) {
      player.pause();
      player.currentTime = 0;
    }
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button, video[controls], [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, open]);

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`Play ${video.title} video`}
        className="metric-video-thumbnail"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        {video.poster && <img alt="" loading="lazy" src={video.poster} />}
        <span className="metric-video-play" aria-hidden="true">▶</span>
        <span className="metric-video-copy">
          <span className="metric-video-eyebrow">Watch the explanation</span>
          <strong>{video.title}</strong>
          {video.description && <small>{video.description}</small>}
        </span>
        {video.durationLabel && <span className="metric-video-duration">{video.durationLabel}</span>}
      </button>
      {open && (
        <div
          className="metric-video-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            aria-labelledby={modalTitleId}
            aria-modal="true"
            className="metric-video-modal"
            ref={modalRef}
            role="dialog"
          >
            <div className="metric-video-modal-header">
              <div>
                <span>Metric video</span>
                <h3 id={modalTitleId}>{video.title}</h3>
              </div>
              <button
                aria-label="Close video"
                className="metric-video-close"
                onClick={closeModal}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            <video
              autoPlay
              className="metric-video-player"
              controls
              playsInline
              poster={video.poster}
              preload={METRIC_EDUCATION_VIDEO_PRELOAD}
              ref={videoRef}
            >
              <source src={video.src} type="video/mp4" />
              {video.captionsSrc && (
                <track
                  default
                  kind="captions"
                  label="English captions"
                  src={video.captionsSrc}
                  srcLang="en"
                />
              )}
            </video>
          </div>
        </div>
      )}
    </>
  );
}

function DashboardMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  switch (metric.visual) {
    case "energy":
      return <EnergyTransferVisual metric={metric} />;
    case "range":
      return <RangeMetricVisual metric={metric} />;
    case "pattern":
      return <PatternMetricVisual metric={metric} />;
    case "arc":
      return <LaunchMetricVisual metric={metric} />;
    case "spin":
      return <SpinMetricVisual metric={metric} />;
    case "path":
      return <PathMetricVisual metric={metric} />;
    case "plane":
      return <PlaneMetricVisual metric={metric} />;
    case "speed":
    default:
      return <SpeedMetricVisual metric={metric} />;
  }
}

function SpeedMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  const needle = Number.isFinite(metric.rawValue) ? clamp(metric.rawValue / 150, 0.12, 0.88) : 0.5;
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 80 54">
      <path className="mini-track" d="M14 42 A26 26 0 0 1 66 42" />
      <path className={cls("mini-progress", metric.tone)} d="M14 42 A26 26 0 0 1 66 42" pathLength={100} strokeDasharray={`${needle * 100} ${100 - needle * 100}`} />
      <line className="mini-needle" x1="40" y1="42" x2={18 + needle * 44} y2="21" />
      <circle className="mini-hub" cx="40" cy="42" r="4" />
    </svg>
  );
}

function EnergyTransferVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <circle className="mini-energy-node" cx="15" cy="28" r="7" />
      <path className="mini-energy-line" d="M24 28h15" />
      <circle className={cls("mini-energy-node", metric.tone)} cx="45" cy="28" r="10" />
      <path className="mini-energy-line" d="M56 28h15" />
      <circle className="mini-energy-node" cx="78" cy="28" r="7" />
      <text x="45" y="32">{Number.isFinite(metric.rawValue) ? metric.rawValue.toFixed(2) : "NA"}</text>
    </svg>
  );
}

function RangeMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  const position = Number.isFinite(metric.rawValue) ? clamp((metric.rawValue % 220) / 220, 0.12, 0.9) : 0.5;
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <line className="mini-range-line" x1="10" x2="78" y1="30" y2="30" />
      {[10, 32, 56, 78].map((x) => <line className="mini-range-tick" key={x} x1={x} x2={x} y1="24" y2="36" />)}
      <circle className={cls("mini-marker", metric.tone)} cx={10 + position * 68} cy="30" r="6" />
    </svg>
  );
}

function PatternMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <circle className="mini-target" cx="44" cy="27" r="21" />
      <circle className="mini-target" cx="44" cy="27" r="9" />
      <line className="mini-target-line" x1="44" x2="44" y1="5" y2="49" />
      {[28, 38, 45, 54, 60].map((x, index) => <circle className={cls("mini-shot", metric.tone)} cx={x} cy={18 + (index % 3) * 7} key={x} r="3.5" />)}
    </svg>
  );
}

function LaunchMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <line className="mini-ground" x1="12" x2="78" y1="42" y2="42" />
      <path className={cls("mini-arc", metric.tone)} d="M16 41 C32 17 53 13 76 25" />
      <circle className="mini-ball" cx="16" cy="41" r="4" />
      <path className="mini-angle" d="M20 39l24-16" />
    </svg>
  );
}

function SpinMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <circle className="mini-spin-ball" cx="44" cy="27" r="14" />
      <path className={cls("mini-spin", metric.tone)} d="M33 18a15 15 0 0 1 24 5" />
      <path className={cls("mini-spin", metric.tone)} d="M55 36a15 15 0 0 1-24-5" />
      <path className="mini-spin-arrow" d="M56 17l4 8-9-1" />
      <path className="mini-spin-arrow" d="M32 37l-4-8 9 1" />
    </svg>
  );
}

function PathMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <line className="mini-target-line" x1="44" x2="44" y1="7" y2="48" />
      <path className={cls("mini-path-line", metric.tone)} d="M18 43 C35 24 55 19 74 12" />
      <rect className="mini-clubface" x="34" y="31" width="24" height="7" rx="2" transform="rotate(-18 46 34)" />
      <circle className="mini-ball" cx="44" cy="28" r="4" />
    </svg>
  );
}

function PlaneMetricVisual({ metric }: { metric: DashboardMetricDetail }) {
  return (
    <svg className="metric-mini-visual" aria-hidden="true" viewBox="0 0 88 54">
      <ellipse className="mini-plane" cx="44" cy="29" rx="30" ry="11" transform="rotate(-22 44 29)" />
      <line className={cls("mini-plane-line", metric.tone)} x1="22" x2="66" y1="43" y2="13" />
      <circle className="mini-ball" cx="44" cy="36" r="4" />
    </svg>
  );
}

function SessionsView({
  canAnalyzeSession,
  onDeleteSession,
  onDeleteShot,
  onOpenSession,
  onSelectionChange,
  sessionSelection,
  selectedSession,
  selectedSessionId,
  sessions,
  setActiveTab,
  setSelectedClub,
  setSelectedSessionId,
}: {
  canAnalyzeSession: boolean;
  onDeleteSession: (sessionId: string) => void;
  onDeleteShot: (sessionId: string, shotId: string) => void;
  onOpenSession: (sessionId: string, selection?: Partial<SessionViewSelection>) => void;
  onSelectionChange: (selection: Partial<SessionViewSelection>) => void;
  sessionSelection: SessionViewSelection;
  selectedSession: Session;
  selectedSessionId: string;
  sessions: Session[];
  setActiveTab: (tab: Tab) => void;
  setSelectedClub: (club: string) => void;
  setSelectedSessionId: (id: string) => void;
}) {
  const clubOptions = getSessionClubOptions(selectedSession, CLUB_ORDER) as string[];
  const resolvedSelection = resolveSessionViewSelection(selectedSession, sessionSelection, {
    clubOrder: CLUB_ORDER,
  }) as SessionViewSelection;
  const activeSessionShots = getSessionViewShots(selectedSession, resolvedSelection) as Shot[];
  const activeSession = { ...selectedSession, shots: activeSessionShots };
  const activeClubs = summarizeClubs([activeSession]);
  const allClubMode = resolvedSelection.club === ALL_SESSION_CLUBS;
  const selectedShot = resolvedSelection.shotId
    ? activeSessionShots.find((shot) => shot.id === resolvedSelection.shotId) ?? null
    : null;
  const selectedShotNumber = selectedShot
    ? selectedShot.sourceShotNumber ?? String(activeSessionShots.findIndex((shot) => shot.id === selectedShot.id) + 1)
    : "";
  const sessionHeaderTitle = selectedShot
    ? `${getClubDisplayName(selectedShot.club)} · Shot ${selectedShotNumber}`
    : allClubMode
      ? selectedSession.title
      : getClubDisplayName(resolvedSelection.club);
  const sessionHeaderMeta = selectedShot
    ? `${formatAvailableMetric(getShotMetric(selectedShot, "carry") ?? Number.NaN, "yd")} carry · ${formatAvailableMetric(getShotMetric(selectedShot, "total") ?? Number.NaN, "yd")} total`
    : allClubMode
      ? `${selectedSession.shots.length} shots · ${clubOptions.length} ${clubOptions.length === 1 ? "club" : "clubs"} · ${selectedSession.source}${selectedSession.location ? ` · ${selectedSession.location}` : ""}`
      : `${activeSessionShots.length} ${activeSessionShots.length === 1 ? "shot" : "shots"} · ${selectedSession.title}`;
  const analysisKey = makeSessionAnalysisKey(selectedSession.id, resolvedSelection);
  const [analysisBySessionId, setAnalysisBySessionId] = useState<Record<string, SessionAnalysisState>>({});
  const selectedAnalysis = analysisBySessionId[analysisKey] ?? { status: "idle", message: "" };
  const structuredAnalysis = selectedAnalysis.result?.analysis ?? null;
  const canRequestAnalysis =
    canAnalyzeSession &&
    selectedSession.id !== EMPTY_SESSION.id &&
    activeSessionShots.length > 0 &&
    selectedAnalysis.status !== "loading";
  const canExportSession = selectedSession.id !== EMPTY_SESSION.id && selectedSession.shots.length > 0;

  useEffect(() => {
    if (!canAnalyzeSession || selectedSession.id === EMPTY_SESSION.id || !activeSessionShots.length) return;

    let cancelled = false;
    const sessionId = selectedSession.id;
    const contextKey = analysisKey;
    setAnalysisBySessionId((current) => {
      if (current[contextKey]) return current;
      return {
        ...current,
        [contextKey]: {
          status: "loading",
          message: "Checking for a saved MAI Coach analysis...",
        },
      };
    });

    async function loadSavedAnalysis() {
      try {
        const params = new URLSearchParams({ sessionId });
        if (resolvedSelection.club !== ALL_SESSION_CLUBS) params.set("club", resolvedSelection.club);
        const response = await fetch(`/api/session-analysis?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({})) as Partial<SessionAnalysisResponse> & { message?: string; error?: { message?: string } };
        if (cancelled) return;

        if (response.status === 404 && payload.status === "not_analyzed") {
          setAnalysisBySessionId((current) => ({
            ...current,
            [contextKey]: { status: "idle", message: payload.message ?? "" },
          }));
          return;
        }

        if (!response.ok || !payload.sessionId || !payload.status) {
          throw new Error(payload.error?.message ?? "Saved MAI Coach analysis could not be loaded.");
        }

        setAnalysisBySessionId((current) => ({
          ...current,
          [contextKey]: {
            status: payload.status === "failed" ? "error" : payload.status === "processing" ? "loading" : "ready",
            message:
              payload.status === "failed"
                ? payload.error?.message ?? "MAI Coach could not complete this analysis."
                : payload.status === "processing"
                  ? "MAI Coach is still analyzing this session."
                  : payload.status === "insufficient_data"
                    ? "More usable shot data needed"
                    : "Saved analysis loaded",
            result: payload as SessionAnalysisResponse,
          },
        }));
      } catch (error) {
        if (cancelled) return;
        setAnalysisBySessionId((current) => ({
          ...current,
          [contextKey]: {
            status: "error",
            message: error instanceof Error ? error.message : "Saved MAI Coach analysis could not be loaded.",
          },
        }));
      }
    }

    void loadSavedAnalysis();
    return () => {
      cancelled = true;
    };
  }, [analysisKey, canAnalyzeSession, selectedSession.id, activeSessionShots.length, resolvedSelection.club]);

  async function analyzeSelectedSession() {
    if (!canAnalyzeSession) {
      setAnalysisBySessionId((current) => ({
        ...current,
        [analysisKey]: {
          status: "error",
          message: "Sign in before running MAI Coach. This first version only analyzes saved account sessions.",
        },
      }));
      return;
    }
    if (selectedSession.id === EMPTY_SESSION.id || !activeSessionShots.length) {
      setAnalysisBySessionId((current) => ({
        ...current,
        [analysisKey]: {
          status: "error",
          message: "Choose a saved session view with shot data before running MAI Coach.",
        },
      }));
      return;
    }

    setAnalysisBySessionId((current) => ({
      ...current,
      [analysisKey]: {
        status: "loading",
        message: allClubMode
          ? "MAI Coach is reading your stored session data..."
          : `MAI Coach is reading only your ${getClubDisplayName(resolvedSelection.club)} shots...`,
      },
    }));

    try {
      const requestBody: { sessionId: string; club?: string } = { sessionId: selectedSession.id };
      if (resolvedSelection.club !== ALL_SESSION_CLUBS) requestBody.club = resolvedSelection.club;
      const response = await fetch("/api/session-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({})) as Partial<SessionAnalysisResponse> & { error?: string | { message?: string } };
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message ?? "MAI Coach could not analyze this saved session.";
      if (!response.ok || !payload.sessionId || !payload.status) {
        throw new Error(errorMessage);
      }

      setAnalysisBySessionId((current) => ({
        ...current,
        [analysisKey]: {
          status: payload.status === "failed" ? "error" : payload.status === "processing" ? "loading" : "ready",
          message:
            payload.status === "insufficient_data"
              ? "More usable shot data needed"
              : payload.status === "failed"
                ? errorMessage
                : "Analysis complete",
          result: payload as SessionAnalysisResponse,
        },
      }));
    } catch (error) {
      setAnalysisBySessionId((current) => ({
        ...current,
        [analysisKey]: {
          status: "error",
          message: error instanceof Error ? error.message : "MAI Coach could not analyze this session.",
        },
      }));
    }
  }

  if (!sessions.length) {
    return (
      <div className="view-stack">
        <FirstSessionEmptyState setActiveTab={setActiveTab} />
      </div>
    );
  }

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
                  onOpenSession(session.id, { club: ALL_SESSION_CLUBS, shotId: null, metric: null });
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
          title={sessionHeaderTitle}
          meta={sessionHeaderMeta}
          action={
            <div className="button-row panel-header-actions">
              <button
                className="primary-action mai-coach-action"
                disabled={!canRequestAnalysis}
                onClick={() => void analyzeSelectedSession()}
                title={canAnalyzeSession ? "Analyze this saved session with MAI Coach" : "Sign in to analyze a saved session"}
                type="button"
              >
                Analyze Session
              </button>
              {canExportSession && (
                <a
                  className="text-button"
                  href={`/api/sessions?format=csv&sessionId=${encodeURIComponent(selectedSession.id)}`}
                >
                  Download CSV
                </a>
              )}
              <button className="text-button" onClick={() => setActiveTab("coach")} type="button">Coach notes</button>
              {selectedSession.id !== EMPTY_SESSION.id && (
                <button className="text-button danger-text-button" onClick={() => onDeleteSession(selectedSession.id)} type="button">
                  Delete session
                </button>
              )}
            </div>
          }
        />
        <div className="session-selection-strip">
          {clubOptions.length > 1 ? (
            <label className="select-control">
              <span>Session view</span>
              <select
                value={resolvedSelection.club}
                onChange={(event) => onSelectionChange({ club: event.target.value, shotId: null, metric: null })}
              >
                <option value={ALL_SESSION_CLUBS}>All Clubs</option>
                {clubOptions.map((club) => (
                  <option key={club} value={club}>
                    {getClubDisplayName(club)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <p className="eyebrow">Session view</p>
              <strong>{clubOptions[0] ? getClubDisplayName(clubOptions[0]) : "Club NA"}</strong>
            </div>
          )}
          <span>
            {allClubMode
              ? `${selectedSession.shots.length} shots across ${clubOptions.length} ${clubOptions.length === 1 ? "club" : "clubs"}`
              : `${activeSessionShots.length} ${activeSessionShots.length === 1 ? "shot" : "shots"} shown`}
          </span>
          {selectedShot && (
            <button className="text-button" onClick={() => onSelectionChange({ club: selectedShot.club, shotId: null })} type="button">
              Clear shot
            </button>
          )}
        </div>
        <ShotMap
          allClubMode={allClubMode}
          onSelectClub={(club) => onSelectionChange({ club, shotId: null, metric: null })}
          onSelectShot={(shot) => onSelectionChange({ club: shot.club, shotId: shot.id, metric: null })}
          selectedShotId={resolvedSelection.shotId ?? null}
          shots={activeSessionShots}
        />
        {selectedShot && (
          <div className="shot-detail-panel">
            <div>
              <p className="eyebrow">Selected shot</p>
              <h3>{getClubDisplayName(selectedShot.club)} · Shot {selectedShotNumber}</h3>
              <span>
                This is a single-shot readout. MAI Coach uses the full {getClubDisplayName(selectedShot.club)} sample before making coaching recommendations.
              </span>
            </div>
            <div className="shot-detail-grid">
              {[
                ["Carry", "carry", "yd"],
                ["Total", "total", "yd"],
                ["Ball speed", "ballSpeed", "mph"],
                ["Club speed", "clubSpeed", "mph"],
                ["Launch", "launch", "deg"],
                ["Spin", "spin", "rpm"],
                ["Club path", "clubPath", "deg"],
                ["Face angle", "faceAngle", "deg"],
                ["Face to path", "faceToPath", "deg"],
                ["Side total", "sideTotal", "yd"],
              ].map(([label, metric, unit]) => {
                const value = getShotMetric(selectedShot, metric as NumericShotMetric);
                const source = selectedShot.metricSources?.[metric];
                const clubAverage = averageMetric(activeSessionShots, metric as NumericShotMetric);
                const digits = metric === "spin" ? 0 : 1;
                const valueLabel = metric === "spin"
                  ? formatAvailableMetric(value ?? Number.NaN, unit, 0)
                  : metric === "faceToPath" || metric === "clubPath" || metric === "faceAngle" || metric === "sideTotal"
                    ? formatSignedMetric(value, unit)
                    : formatAvailableMetric(value ?? Number.NaN, unit);
                const averageLabel = metric === "spin"
                  ? formatAvailableMetric(clubAverage, unit, 0)
                  : metric === "faceToPath" || metric === "clubPath" || metric === "faceAngle" || metric === "sideTotal"
                    ? formatSignedMetric(clubAverage, unit)
                    : formatAvailableMetric(clubAverage, unit);
                const delta = typeof value === "number" && Number.isFinite(value) && Number.isFinite(clubAverage)
                  ? value - clubAverage
                  : Number.NaN;
                return (
                  <div key={metric}>
                    <span>{label}</span>
                    <strong>{valueLabel}</strong>
                    <small>{source?.kind ? `${source.kind}${source.method ? ` · ${source.method}` : ""}` : "Source NA"}</small>
                    <small>
                      {Number.isFinite(delta)
                        ? `${formatSignedMetric(delta, unit, digits)} vs ${getClubDisplayName(selectedShot.club)} avg ${averageLabel}`
                        : `${getClubDisplayName(selectedShot.club)} avg ${averageLabel}`}
                    </small>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {selectedAnalysis.status !== "idle" && (
          <div className={cls("mai-analysis-panel", selectedAnalysis.status)}>
            <div className="mai-analysis-heading">
              <div>
                <p className="eyebrow">MAI Coach</p>
                <h3>{allClubMode ? "Session analysis" : `${getClubDisplayName(resolvedSelection.club)} analysis`}</h3>
              </div>
              <span>
                {selectedAnalysis.status === "loading"
                    ? "Reading data"
                    : selectedAnalysis.status === "error"
                      ? "Needs attention"
                      : selectedAnalysis.result?.status === "insufficient_data"
                        ? "More data needed"
                        : "Ready"}
              </span>
            </div>
            {selectedAnalysis.status === "loading" ? (
              <p className="mai-analysis-status">{selectedAnalysis.message}</p>
            ) : selectedAnalysis.status === "error" ? (
              <p className="mai-analysis-status error">{selectedAnalysis.message}</p>
            ) : (
              <>
                {selectedAnalysis.result?.contextSummary && (
                  <div className="mai-analysis-meta">
                    <span>{selectedAnalysis.result.contextSummary.shotCount} stored shots</span>
                    <span>{selectedAnalysis.result.contextSummary.validShotCount} usable shots</span>
                    <span>{selectedAnalysis.result.contextSummary.clubs.join(", ") || "Club NA"}</span>
                    <span>
                      {selectedAnalysis.result.contextSummary.missingMetrics.length
                        ? `${selectedAnalysis.result.contextSummary.missingMetrics.length} unavailable metrics`
                        : "Core metrics available"}
                    </span>
                  </div>
                )}
                {selectedAnalysis.result?.analysisSource === "measured_fallback" && (
                  <div className="mai-analysis-source-note" role="status">
                    <div>
                      <strong>Data-based fallback</strong>
                      <span>MAI generated a data-based fallback because enhanced analysis is temporarily unavailable.</span>
                    </div>
                    <button
                      className="text-button"
                      disabled={!canRequestAnalysis}
                      onClick={() => void analyzeSelectedSession()}
                      type="button"
                    >
                      Retry enhanced analysis
                    </button>
                  </div>
                )}
                {structuredAnalysis ? (
                  <div className="mai-analysis-body structured">
                    <div className="mai-analysis-hero">
                      <h4>{structuredAnalysis.headline}</h4>
                      <span>{structuredAnalysis.dataQuality.confidence} confidence · {Math.round(structuredAnalysis.confidence * 100)}%</span>
                    </div>
                    <p>{structuredAnalysis.sessionSummary}</p>
                    {structuredAnalysis.dataQuality.limitations.length > 0 && (
                      <div className="mai-analysis-callout">
                        <strong>Data quality</strong>
                        <ul>
                          {structuredAnalysis.dataQuality.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mai-analysis-grid">
                      <section>
                        <h5>Measured findings</h5>
                        <ul>
                          {structuredAnalysis.measuredFindings.map((finding) => (
                            <li key={`${finding.metric}-${finding.value}`}>
                              <strong>{finding.metric}: {finding.value}</strong>
                              <span>{finding.meaning}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section>
                        <h5>What worked</h5>
                        {structuredAnalysis.strengths.length ? (
                          <ul>
                            {structuredAnalysis.strengths.map((strength) => (
                              <li key={strength.title}>
                                <strong>{strength.title}</strong>
                                <span>{strength.evidence}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>MAI Coach needs more usable shots before calling out a reliable strength.</p>
                        )}
                      </section>
                      <section>
                        <h5>Primary priority</h5>
                        <p><strong>{structuredAnalysis.primaryPriority.title}</strong></p>
                        <p>{structuredAnalysis.primaryPriority.whyItMatters}</p>
                        <p>{structuredAnalysis.primaryPriority.evidence}</p>
                      </section>
                      <section>
                        <h5>Issues and certainty</h5>
                        {structuredAnalysis.issues.length ? (
                          <ul>
                            {structuredAnalysis.issues.map((issue) => (
                              <li key={`${issue.metric}-${issue.finding}`}>
                                <strong>{issue.metric} · {issue.severity} · {issue.certainty.replace("_", " ")}</strong>
                                <span>{issue.finding}</span>
                                <span>{issue.evidence}</span>
                                {issue.possibleCause && <span>Possible cause: {issue.possibleCause}</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No measured issue is reliable enough to call from this sample.</p>
                        )}
                      </section>
                    </div>
                    <section className="mai-practice-plan">
                      <h5>Practice plan</h5>
                      {structuredAnalysis.practicePlan.map((drill) => (
                        <article key={drill.drill}>
                          <strong>{drill.drill}</strong>
                          <p>{drill.whyThisFits}</p>
                          <dl>
                            <div><dt>Setup</dt><dd>{drill.setup}</dd></div>
                            <div><dt>Feel</dt><dd>{drill.feel}</dd></div>
                            <div><dt>Monitor</dt><dd>{drill.metricToMonitor}</dd></div>
                            <div><dt>Target</dt><dd>{drill.measurableTarget}</dd></div>
                            <div><dt>Workload</dt><dd>{drill.durationOrSwingCount}</dd></div>
                          </dl>
                          <p>{drill.progressionRule}</p>
                        </article>
                      ))}
                    </section>
                    <div className="mai-analysis-footer">
                      <p><strong>Next goal:</strong> {structuredAnalysis.nextSessionGoal}</p>
                      <p><strong>Progress:</strong> {structuredAnalysis.progressComparison.summary}</p>
                      <p><strong>Course relevance:</strong> {structuredAnalysis.courseRelevance}</p>
                      {structuredAnalysis.followUpQuestion && <p><strong>Follow-up:</strong> {structuredAnalysis.followUpQuestion}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="mai-analysis-status">{selectedAnalysis.message || "No saved MAI Coach analysis yet."}</p>
                )}
              </>
            )}
          </div>
        )}
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
          {activeClubs.map((club) => (
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
        {activeSessionShots.length > 0 && (
          <div className="shot-delete-table">
            <div className="shot-delete-table-heading">
              <div>
                <p className="eyebrow">Shot data</p>
                <h3>Review and remove individual shots</h3>
              </div>
              <span>Deleting a shot recalculates every dashboard number immediately.</span>
            </div>
            <div className="compact-table">
              <div className="table-row shot-row table-head">
                <span>Shot</span>
                <span>Club</span>
                <span>Carry</span>
                <span>Total</span>
                <span>Ball speed</span>
                <span>Club path</span>
                <span>Face to path</span>
                <span>Shape</span>
                <span>Action</span>
              </div>
              {activeSessionShots.map((shot, index) => (
                <div
                  className={cls("table-row shot-row", resolvedSelection.shotId === shot.id && "selected-row")}
                  key={shot.id}
                  onClick={() => onSelectionChange({ club: shot.club, shotId: shot.id, metric: null })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectionChange({ club: shot.club, shotId: shot.id, metric: null });
                    }
                  }}
                >
                  <span>{shot.sourceShotNumber ? `#${shot.sourceShotNumber}` : `#${index + 1}`}</span>
                  <span>{getClubDisplayName(shot.club)}</span>
                  <span>{formatAvailableMetric(getShotMetric(shot, "carry") ?? Number.NaN, "yd")}</span>
                  <span>{formatAvailableMetric(getShotMetric(shot, "total") ?? Number.NaN, "yd")}</span>
                  <span>{formatAvailableMetric(getShotMetric(shot, "ballSpeed") ?? Number.NaN, "mph")}</span>
                  <span>{formatSignedMetric(getShotMetric(shot, "clubPath"), "deg")}</span>
                  <span>{formatSignedMetric(getShotMetric(shot, "faceToPath"), "deg")}</span>
                  <span>{shot.shape || "NA"}</span>
                  <span>
                    <button
                      aria-label={`Delete ${shot.sourceShotNumber ? `shot ${shot.sourceShotNumber}` : `${getClubDisplayName(shot.club)} shot ${index + 1}`}`}
                      className="icon-button danger-text-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteShot(selectedSession.id, shot.id);
                      }}
                      title="Delete shot"
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ClubsView({
  clubs,
  selectedClub,
  setActiveTab,
}: {
  clubs: ClubSummary[];
  selectedClub: string;
  setActiveTab: (tab: Tab) => void;
}) {
  const [clubMetricKey, setClubMetricKey] = useState<ClubMetricKey>("total");
  const metric = getClubMetricConfig(clubMetricKey);

  if (!clubs.length) {
    return (
      <div className="view-stack">
        <section className="control-strip">
          <div>
            <p className="eyebrow">Club comparison</p>
            <h2>Bag benchmarks</h2>
            <span>Club stats appear after you upload or save your first session.</span>
          </div>
        </section>
        <FirstSessionEmptyState setActiveTab={setActiveTab} />
      </div>
    );
  }

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

function FirstSessionEmptyState({ setActiveTab }: { setActiveTab: (tab: Tab) => void }) {
  const uploadOptions = [
    {
      title: "Upload a session CSV",
      body: "Use exported shot rows from TrackMan, Full Swing, Foresight, SkyTrak, Mevo+, or a similar simulator.",
    },
    {
      title: "Upload a screenshot or photo",
      body: "Add clear photos of simulator result screens. We will read the available carry, speed, launch, spin, and direction data.",
    },
    {
      title: "Manually enter session data",
      body: "Start with one club and a few known numbers. Any missing metrics will display as NA until you add them.",
    },
    {
      title: "Connect a supported simulator",
      body: "Use the import area to connect or stage simulator feeds when the source supports it.",
    },
  ];

  return (
    <section className="first-session-empty panel">
      <div className="first-session-hero">
        <p className="eyebrow">New player setup</p>
        <h2>Let&apos;s get your swing dialed in.</h2>
        <p>
          Upload your first golf session so we can begin analyzing your swing,
          identifying trends, and building a personalized improvement plan.
        </p>
        <button className="primary-action" onClick={() => setActiveTab("import")}>
          <span>⇧</span>
          Upload Your First Session
        </button>
      </div>
      <div className="first-session-options">
        {uploadOptions.map((option) => (
          <article key={option.title}>
            <strong>{option.title}</strong>
            <span>{option.body}</span>
          </article>
        ))}
      </div>
      <div className="first-session-guide">
        <strong>What happens after upload</strong>
        <p>
          Your session is saved only to your account, the dashboard refreshes automatically,
          and recommendations are generated only from your own uploaded data.
        </p>
      </div>
    </section>
  );
}

function AdminView({
  accountUser,
  authenticated,
  onOpenCoachTools,
  onOpenMemberVideos,
}: {
  accountUser: AccountUser | null;
  authenticated: boolean;
  onOpenCoachTools: (memberId: string, memberName: string) => void;
  onOpenMemberVideos: (memberId: string, memberName: string) => void;
}) {
  const [dashboard, setDashboard] = useState<StaffDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading admin workspace...");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [reconciliationCandidates, setReconciliationCandidates] = useState<CoachReconciliationCandidate[]>([]);
  const [passwordUser, setPasswordUser] = useState<StaffUserRecord | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
    forcePasswordChange: false,
  });
  const [quickMode, setQuickMode] = useState<"content" | "session" | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [userForm, setUserForm] = useState({
    role: "member" as StaffUserRecord["role"],
    firstName: "",
    lastName: "",
    email: "",
    temporaryPassword: "",
    phone: "",
    skillLevel: "",
    notes: "",
    accountStatus: "active" as StaffUserRecord["accountStatus"],
    inviteStatus: "pending",
    coachId: "",
  });
  const [contentForm, setContentForm] = useState({
    contentType: "coach_note",
    title: "",
    body: "",
    visibility: "member",
  });
  const [sessionForm, setSessionForm] = useState({
    title: "",
    date: getTodayDateString(),
    club: "SW",
    carry: "",
    total: "",
    ballSpeed: "",
    clubSpeed: "",
    smash: "",
    launch: "",
    spin: "",
    dispersion: "",
    note: "",
    recommendedDrill: "",
  });
  const isAdmin = authenticated && accountUser?.role === "admin";
  const members = dashboard?.users.filter((user) => user.role === "member") ?? [];
  const coaches = dashboard?.coaches ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = (dashboard?.users ?? []).filter((user) => {
    const searchable = [user.name, user.email, user.role, user.assignedCoachName, user.skillLevel].join(" ").toLowerCase();
    if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
    if (roleFilter !== "all" && user.role !== roleFilter) return false;
    if (statusFilter !== "all" && user.accountStatus !== statusFilter) return false;
    return true;
  });
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0];

  async function refreshWorkspace(nextMemberId?: string) {
    setLoading(true);
    try {
      const payload = await readStaffDashboard();
      setDashboard(payload);
      if (nextMemberId !== undefined) setSelectedMemberId(nextMemberId);
      setMessage("Admin workspace ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setMessage("Log in with an admin account to use this workspace.");
      return;
    }
    void refreshWorkspace();
    // Load once for the signed-in admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function resetUserForm(role: StaffUserRecord["role"] = "member") {
    setEditingUserId(null);
    setUserForm({
      role,
      firstName: "",
      lastName: "",
      email: "",
      temporaryPassword: "",
      phone: "",
      skillLevel: "",
      notes: "",
      accountStatus: "active",
      inviteStatus: "pending",
      coachId: coaches[0]?.id ?? "",
    });
  }

  function openEditUser(user: StaffUserRecord) {
    setEditingUserId(user.id);
    setUserForm({
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      temporaryPassword: "",
      phone: user.phone,
      skillLevel: user.skillLevel,
      notes: user.notes,
      accountStatus: user.accountStatus,
      inviteStatus: user.inviteStatus || "pending",
      coachId: user.assignedCoachId ?? "",
    });
    setShowUserModal(true);
  }

  function confirmSensitiveUserChange(user: StaffUserRecord | null, nextRole: StaffUserRecord["role"], nextStatus: StaffUserRecord["accountStatus"]) {
    if (nextRole === "admin" && user?.role !== "admin") {
      const confirmed = window.confirm("Promote this user to admin? They will be able to manage users, roles, passwords, and coach assignments. Existing videos, sessions, and IDs will remain unchanged.");
      if (!confirmed) return false;
    }
    if (nextStatus === "inactive" && user?.accountStatus !== "inactive") {
      const confirmed = window.confirm("Deactivate this user? They will no longer be able to log in. Their videos, sessions, analyses, and coach relationships will remain preserved.");
      if (!confirmed) return false;
    }
    return true;
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const currentUser = editingUserId ? dashboard?.users.find((user) => user.id === editingUserId) ?? null : null;
      if (!confirmSensitiveUserChange(currentUser, userForm.role, userForm.accountStatus)) return;
      const payload = editingUserId
        ? { action: "updateUser", userId: editingUserId, ...userForm }
        : { action: "createUser", ...userForm };
      const result = await postStaffAction(payload);
      setShowUserModal(false);
      const invite = result.invite as { publicMessage?: string } | undefined;
      setMessage(editingUserId ? "User updated." : invite?.publicMessage ?? "Account created and welcome email sent.");
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The user could not be saved.");
    }
  }

  async function updateUser(user: StaffUserRecord, patch: Partial<typeof userForm>) {
    try {
      const nextRole = patch.role ?? user.role;
      const nextStatus = patch.accountStatus ?? user.accountStatus;
      if (!confirmSensitiveUserChange(user, nextRole, nextStatus)) return;
      await postStaffAction({
        action: "updateUser",
        userId: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        skillLevel: user.skillLevel,
        notes: user.notes,
        accountStatus: user.accountStatus,
        inviteStatus: user.inviteStatus,
        coachId: user.assignedCoachId ?? "",
        ...patch,
      });
      setMessage(`${user.name} updated.`);
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The user could not be updated.");
    }
  }

  async function assignCoach(member: StaffUserRecord, coachId: string) {
    try {
      if (!coachId) {
        if (!member.assignedCoachIds.length) return;
        const confirmed = window.confirm(`Remove coach assignment for ${member.name}? This preserves the user, videos, sessions, analyses, and login credentials.`);
        if (!confirmed) return;
        for (const assignedCoachId of member.assignedCoachIds) {
          await postStaffAction({ action: "removeCoachAssignment", memberId: member.id, coachId: assignedCoachId });
        }
        setMessage(`${member.name} is now unassigned.`);
      } else {
        await postStaffAction({ action: "assignCoach", memberId: member.id, coachId });
        setMessage(`${member.name} was assigned to a coach.`);
      }
      await refreshWorkspace(member.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The coach assignment could not be saved.");
    }
  }

  function openPasswordReset(user: StaffUserRecord) {
    setPasswordUser(user);
    setPasswordForm({ password: "", confirmPassword: "", forcePasswordChange: false });
  }

  async function submitPasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordUser) return;
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setMessage("Password and confirmation must match.");
      return;
    }
    const confirmed = window.confirm(`Set a new password for ${passwordUser.name}? Existing login sessions for that user will be invalidated. Their user ID, videos, sessions, analyses, and coach assignments will remain preserved.`);
    if (!confirmed) return;
    try {
      await postStaffAction({
        action: "setPassword",
        userId: passwordUser.id,
        password: passwordForm.password,
        confirmPassword: passwordForm.confirmPassword,
        forcePasswordChange: passwordForm.forcePasswordChange,
      });
      setPasswordUser(null);
      setPasswordForm({ password: "", confirmPassword: "", forcePasswordChange: false });
      setMessage(`Password set for ${passwordUser.name}.`);
      await refreshWorkspace(selectedMemberId || passwordUser.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The password could not be set.");
    }
  }

  async function reconcileAssignments(apply: boolean) {
    try {
      const payload = await postStaffAction({ action: "reconcileCoachAssignments", apply });
      const nextCandidates = Array.isArray(payload.candidates) ? payload.candidates as CoachReconciliationCandidate[] : [];
      setReconciliationCandidates(nextCandidates);
      const candidates = nextCandidates.length;
      const repaired = Number(payload.repaired ?? 0);
      setMessage(apply ? `Relationship repair complete: ${repaired} unambiguous assignments stored.` : `${candidates} relationship candidates found.`);
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Relationship reconciliation could not run.");
    }
  }

  function selectMember(memberId: string) {
    setSelectedMemberId(memberId);
  }

  async function deleteUserAccount(user: StaffUserRecord) {
    if (user.id === accountUser?.id) {
      setMessage("You cannot delete your own signed-in admin account.");
      return;
    }
    const confirmed = window.confirm(
      `Permanently delete ${user.name}?\n\nThis removes the user account, login sessions, password setup, invitations, and coach assignments. Users with videos or sessions are protected and must be deactivated instead.`,
    );
    if (!confirmed) return;
    try {
      await postStaffAction({ action: "deleteUser", userId: user.id });
      setMessage(`${user.name} was deleted.`);
      await refreshWorkspace(selectedMemberId === user.id ? "" : selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The user could not be deleted.");
    }
  }

  async function submitContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    try {
      await postStaffAction({
        action: "addContent",
        memberId: selectedMember.id,
        ...contentForm,
      });
      setContentForm({ contentType: "coach_note", title: "", body: "", visibility: "member" });
      setQuickMode(null);
      setMessage(`Content added for ${selectedMember.name}.`);
      await refreshWorkspace(selectedMember.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Content could not be added.");
    }
  }

  async function submitSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) return;
    try {
      await postStaffAction({
        action: "addSession",
        memberId: selectedMember.id,
        ...sessionForm,
      });
      setSessionForm({
        title: "",
        date: getTodayDateString(),
        club: "SW",
        carry: "",
        total: "",
        ballSpeed: "",
        clubSpeed: "",
        smash: "",
        launch: "",
        spin: "",
        dispersion: "",
        note: "",
        recommendedDrill: "",
      });
      setQuickMode(null);
      setMessage(`Session added for ${selectedMember.name}.`);
      await refreshWorkspace(selectedMember.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Session could not be added.");
    }
  }

  async function resendInvitation(user: StaffUserRecord) {
    try {
      const payload = await postStaffAction({ action: "resendInvitation", userId: user.id });
      setMessage(payload.invite?.publicMessage ?? `Invitation resent to ${user.email}.`);
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be resent.");
    }
  }

  async function copySetupLink(user: StaffUserRecord) {
    try {
      const payload = await postStaffAction<{ invite?: { setupUrl?: string; publicMessage?: string } }>({ action: "copySetupLink", userId: user.id });
      const setupUrl = payload.invite?.setupUrl ?? "";
      if (!setupUrl) throw new Error("A setup link could not be created.");
      await navigator.clipboard.writeText(setupUrl);
      setMessage(payload.invite?.publicMessage ?? `Fresh setup link copied for ${user.email}.`);
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup link could not be copied.");
    }
  }

  async function cancelInvitation(user: StaffUserRecord) {
    const confirmed = window.confirm(`Cancel the current setup invitation for ${user.name}? Any unused setup link for this account will stop working.`);
    if (!confirmed) return;
    try {
      await postStaffAction({ action: "cancelInvitation", userId: user.id });
      setMessage(`Invitation cancelled for ${user.name}.`);
      await refreshWorkspace(selectedMemberId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be cancelled.");
    }
  }

  if (!isAdmin) {
    return (
      <section className="panel admin-access-panel">
        <p className="eyebrow">Admin workspace</p>
        <h2>Admin login required</h2>
        <p>Members and coaches cannot access user management, role changes, or account controls.</p>
      </section>
    );
  }

  const summaryCards = dashboard
    ? [
        ["Total members", dashboard.summary.totalMembers],
        ["Total coaches", dashboard.summary.totalCoaches],
        ["Active members", dashboard.summary.activeMembers],
        ["Added this month", dashboard.summary.membersAddedThisMonth],
        ["Videos uploaded", dashboard.summary.videosUploaded],
        ["Sessions added", dashboard.summary.sessionsAdded],
        ["Feedback review", dashboard.summary.coachFeedbackAwaitingReview],
      ]
    : [];

  return (
    <section className="admin-workspace view-stack">
      <header className="admin-hero panel">
        <div>
          <p className="eyebrow">Role-based operations</p>
          <h2>Admin dashboard</h2>
          <span>{loading ? "Loading..." : message}</span>
        </div>
        <div className="admin-quick-actions">
          <button className="primary-action" onClick={() => { resetUserForm("member"); setShowUserModal(true); }}>Add member</button>
          <button className="secondary-action" onClick={() => { resetUserForm("coach"); setShowUserModal(true); }}>Add coach</button>
          <button className="secondary-action" onClick={() => { resetUserForm("admin"); setShowUserModal(true); }}>Add admin</button>
          <button className="secondary-action" disabled={!selectedMember} onClick={() => setQuickMode("content")}>Assign content</button>
          <button className="secondary-action" disabled={!selectedMember} onClick={() => setQuickMode("session")}>Add session</button>
          <button className="secondary-action" onClick={() => void reconcileAssignments(false)}>Find assignment gaps</button>
          <button className="secondary-action" onClick={() => void reconcileAssignments(true)}>Repair clear gaps</button>
        </div>
      </header>

      {reconciliationCandidates.length > 0 && (
        <section className="panel admin-reconciliation-panel">
          <PanelHeader
            kicker="Coach assignment review"
            title="Video-backed relationship candidates"
            meta={`${reconciliationCandidates.filter((candidate) => candidate.repairable).length} repairable · ${reconciliationCandidates.filter((candidate) => candidate.ambiguous).length} manual review`}
          />
          <div className="admin-reconciliation-list">
            {reconciliationCandidates.map((candidate) => (
              <article className={cls("admin-reconciliation-item", candidate.ambiguous && "warning")} key={candidate.memberId}>
                <div>
                  <strong>{candidate.memberName}</strong>
                  <span>{candidate.memberEmail}</span>
                </div>
                <div>
                  <span>Suggested coach</span>
                  <strong>{candidate.suggestedCoachName || "Manual review"}</strong>
                </div>
                <div>
                  <span>Existing coach</span>
                  <strong>{candidate.existingCoachNames.length ? candidate.existingCoachNames.join(", ") : "None"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{candidate.repairable ? "Safe to repair" : "Manual review"}</strong>
                </div>
                <ul>
                  {candidate.choices.flatMap((choice) =>
                    (choice.videoEvidence ?? [{ title: `${choice.videoCount} lesson videos`, uploadStatus: null, publicationStatus: null }]).map((video, index) => (
                      <li key={`${choice.coachId}-${index}`}>
                        {choice.coachName}: {video.title}
                        {video.uploadStatus || video.publicationStatus ? ` (${[video.publicationStatus, video.uploadStatus].filter(Boolean).join(", ")})` : ""}
                      </li>
                    )),
                  )}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="admin-summary-grid">
        {summaryCards.map(([label, value]) => (
          <article className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-ops-grid">
        <article className="panel admin-user-panel">
          <PanelHeader kicker="User management" title="People and roles" meta={`${filteredUsers.length} shown`} />
          <div className="admin-filter-row">
            <label>
              <span>Search</span>
              <input onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, coach..." type="search" value={search} />
            </label>
            <label>
              <span>Role</span>
              <select onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
                <option value="all">All roles</option>
                <option value="admin">Admins</option>
                <option value="coach">Coaches</option>
                <option value="member">Members</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                <option value="all">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="admin-table">
            <div className="admin-table-row admin-table-head">
              <span>User</span><span>Role</span><span>Coach</span><span>Status</span><span>Activity</span><span>Actions</span>
            </div>
            {filteredUsers.map((user) => (
              <div className="admin-table-row" key={user.id}>
                <div className="admin-user-cell">
                  <CoachAvatar coach={user} />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                    <small>{user.videoCount} videos · {user.sessionCount} sessions</small>
                  </span>
                </div>
                <div>
                  <select
                    aria-label={`Role for ${user.name}`}
                    onChange={(event) => void updateUser(user, { role: event.target.value as StaffUserRecord["role"] })}
                    value={user.role}
                  >
                    <option value="member">Member</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  {user.role === "member" ? (
                    <select
                      aria-label={`Coach for ${user.name}`}
                      onChange={(event) => void assignCoach(user, event.target.value)}
                      value={user.assignedCoachId ?? ""}
                    >
                      <option value="">Unassigned</option>
                      {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
                    </select>
                  ) : (
                    <span>{user.role === "coach" ? "Coach account" : "Admin account"}</span>
                  )}
                </div>
                <div>
                  <select
                    aria-label={`Status for ${user.name}`}
                    onChange={(event) => void updateUser(user, { accountStatus: event.target.value as StaffUserRecord["accountStatus"] })}
                    value={user.accountStatus}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <small>{inviteStatusLabel(user.inviteStatus)} · {user.passwordConfigured ? "Password set" : "No password"}</small>
                  {user.passwordResetRequired && <small>Password change required</small>}
                </div>
                <div>
                  <strong>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "No login"}</strong>
                  <small>{user.setupStatus.slice(0, 2).join(" · ")}</small>
                  <small>Created {formatDate(user.createdAt)}</small>
                </div>
                <div className="admin-row-actions">
                  {user.role === "member" && <button className="icon-button" onClick={() => selectMember(user.id)} title="Select member">◫</button>}
                  {user.role === "member" && <button className="icon-button" onClick={() => onOpenMemberVideos(user.id, user.name)} title="Open videos">▶</button>}
                  {user.role === "member" && <button className="icon-button" onClick={() => onOpenCoachTools(user.id, user.name)} title="Open coach tools">✦</button>}
                  <button className="icon-button" onClick={() => openEditUser(user)} title="Edit user">✎</button>
                  <button className="icon-button" onClick={() => openPasswordReset(user)} title="Set or reset password">⚿</button>
                  <button className="icon-button" onClick={() => void resendInvitation(user)} title="Resend welcome email">↻</button>
                  <button className="icon-button" onClick={() => void copySetupLink(user)} title="Copy fresh setup link">⛓</button>
                  <button className="icon-button" onClick={() => void cancelInvitation(user)} title="Cancel setup invitation">⊘</button>
                  <button className="icon-button danger-text-button" disabled={user.id === accountUser?.id} onClick={() => void deleteUserAccount(user)} title={user.id === accountUser?.id ? "You cannot delete your own account" : "Delete user"}>×</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {dashboard?.recentActivity.length ? (
        <section className="panel admin-activity-strip">
          <PanelHeader kicker="Recent activity" title="Operational timeline" meta={`${dashboard.recentActivity.length} latest`} />
          <div>
            {dashboard.recentActivity.slice(0, 8).map((item) => (
              <article key={item.id}>
                <strong>{item.summary}</strong>
                <span>{formatDate(item.createdAt)} · {item.action.replaceAll("_", " ")}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showUserModal && (
        <div className="video-modal-overlay">
          <form className="video-upload-modal admin-user-modal" onSubmit={saveUser}>
            <div className="video-modal-header">
              <div>
                <p className="eyebrow">User management</p>
                <h2>{editingUserId ? "Edit user" : "Add user"}</h2>
              </div>
              <button aria-label="Close user form" className="icon-button" onClick={() => setShowUserModal(false)} type="button">×</button>
            </div>
            <div className="video-form-grid">
              <label><span>Role</span><select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as StaffUserRecord["role"] }))}><option value="member">Member</option><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
              <label><span>Status</span><select value={userForm.accountStatus} onChange={(event) => setUserForm((current) => ({ ...current, accountStatus: event.target.value as StaffUserRecord["accountStatus"] }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <label><span>Invite / setup</span><select value={userForm.inviteStatus} onChange={(event) => setUserForm((current) => ({ ...current, inviteStatus: event.target.value }))}><option value="pending">Invite Pending</option><option value="delivered">Email Sent</option><option value="opened">Invite Opened</option><option value="failed">Email Failed</option><option value="expired">Invite Expired</option><option value="completed">Account Active</option><option value="accepted">Accepted</option><option value="active">Active</option></select></label>
              <label><span>First name</span><input required value={userForm.firstName} onChange={(event) => setUserForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
              <label><span>Last name</span><input required value={userForm.lastName} onChange={(event) => setUserForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
              <label className="video-form-wide"><span>Email</span><input required type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label><span>Phone</span><input value={userForm.phone} onChange={(event) => setUserForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><span>Skill / title</span><input value={userForm.skillLevel} onChange={(event) => setUserForm((current) => ({ ...current, skillLevel: event.target.value }))} /></label>
              {userForm.role === "member" && (
                <label className="video-form-wide"><span>Assigned coach</span><select value={userForm.coachId} onChange={(event) => setUserForm((current) => ({ ...current, coachId: event.target.value }))}><option value="">Unassigned</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label>
              )}
              <label className="video-form-wide"><span>Notes</span><textarea value={userForm.notes} onChange={(event) => setUserForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className="video-modal-actions">
              <span>{editingUserId ? "Profile, role, coach assignment, and account status will update immediately." : "A secure setup link will be emailed so the user can create their own password."}</span>
              <div className="button-row">
                <button className="secondary-action" onClick={() => setShowUserModal(false)} type="button">Cancel</button>
                <button className="primary-action" type="submit">{editingUserId ? "Save user" : "Create user"}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {passwordUser && (
        <div className="video-modal-overlay">
          <form className="video-upload-modal admin-user-modal" onSubmit={submitPasswordReset}>
            <div className="video-modal-header">
              <div>
                <p className="eyebrow">Admin password control</p>
                <h2>Set password for {passwordUser.name}</h2>
              </div>
              <button aria-label="Close password form" className="icon-button" onClick={() => setPasswordUser(null)} type="button">×</button>
            </div>
            <div className="video-form-grid">
              <label className="video-form-wide">
                <span>New password</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                  required
                  type="password"
                  value={passwordForm.password}
                />
              </label>
              <label className="video-form-wide">
                <span>Confirm password</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Re-enter password"
                  required
                  type="password"
                  value={passwordForm.confirmPassword}
                />
              </label>
              <label className="coach-email-toggle video-form-wide">
                <input
                  checked={passwordForm.forcePasswordChange}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, forcePasswordChange: event.target.checked }))}
                  type="checkbox"
                />
                <span><strong>Force password change at next login</strong><small>Leave off for Monday testing so the user can log in immediately.</small></span>
              </label>
            </div>
            <div className="video-modal-actions">
              <span>User ID, videos, sessions, analyses, and coach assignments will remain preserved.</span>
              <div className="button-row">
                <button className="secondary-action" onClick={() => setPasswordUser(null)} type="button">Cancel</button>
                <button className="primary-action" type="submit">Set password</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {quickMode && selectedMember && (
        <div className="video-modal-overlay">
          {quickMode === "content" ? (
            <form className="video-upload-modal admin-user-modal" onSubmit={submitContent}>
              <div className="video-modal-header">
                <div><p className="eyebrow">Fast assignment</p><h2>Add content for {selectedMember.name}</h2></div>
                <button aria-label="Close content form" className="icon-button" onClick={() => setQuickMode(null)} type="button">×</button>
              </div>
              <div className="video-form-grid">
                <label><span>Type</span><select value={contentForm.contentType} onChange={(event) => setContentForm((current) => ({ ...current, contentType: event.target.value }))}><option value="coach_note">Coach note</option><option value="feedback">Feedback</option><option value="practice_recommendation">Practice recommendation</option><option value="drill">Drill</option><option value="document">Document/reference</option></select></label>
                <label><span>Visibility</span><select value={contentForm.visibility} onChange={(event) => setContentForm((current) => ({ ...current, visibility: event.target.value }))}><option value="member">Member visible</option><option value="coach">Coach/admin only</option></select></label>
                <label className="video-form-wide"><span>Title</span><input required value={contentForm.title} onChange={(event) => setContentForm((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="video-form-wide"><span>Note / assignment</span><textarea required value={contentForm.body} onChange={(event) => setContentForm((current) => ({ ...current, body: event.target.value }))} /></label>
              </div>
              <div className="video-modal-actions"><span>Saved to D1 and included in the member activity timeline.</span><div className="button-row"><button className="secondary-action" onClick={() => setQuickMode(null)} type="button">Cancel</button><button className="primary-action" type="submit">Save content</button></div></div>
            </form>
          ) : (
            <form className="video-upload-modal admin-user-modal" onSubmit={submitSession}>
              <div className="video-modal-header">
                <div><p className="eyebrow">Session data</p><h2>Add session for {selectedMember.name}</h2></div>
                <button aria-label="Close session form" className="icon-button" onClick={() => setQuickMode(null)} type="button">×</button>
              </div>
              <div className="video-form-grid">
                <label className="video-form-wide"><span>Session name</span><input value={sessionForm.title} onChange={(event) => setSessionForm((current) => ({ ...current, title: event.target.value }))} placeholder="Wedge distance control" /></label>
                <label><span>Date</span><input type="date" value={sessionForm.date} onChange={(event) => setSessionForm((current) => ({ ...current, date: event.target.value }))} /></label>
                <label><span>Club</span><select value={sessionForm.club} onChange={(event) => setSessionForm((current) => ({ ...current, club: event.target.value }))}>{CLUB_ORDER.map((club) => <option key={club} value={club}>{getClubDisplayName(club)}</option>)}</select></label>
                {(["carry", "total", "ballSpeed", "clubSpeed", "smash", "launch", "spin", "dispersion"] as const).map((field) => (
                  <label key={field}><span>{field.replace(/([A-Z])/g, " $1")}</span><input inputMode="decimal" value={sessionForm[field]} onChange={(event) => setSessionForm((current) => ({ ...current, [field]: event.target.value }))} /></label>
                ))}
                <label className="video-form-wide"><span>Coach notes</span><textarea value={sessionForm.note} onChange={(event) => setSessionForm((current) => ({ ...current, note: event.target.value }))} /></label>
                <label className="video-form-wide"><span>Recommended drill</span><textarea value={sessionForm.recommendedDrill} onChange={(event) => setSessionForm((current) => ({ ...current, recommendedDrill: event.target.value }))} /></label>
              </div>
              <div className="video-modal-actions"><span>All metrics are optional. Missing data appears as NA across the app.</span><div className="button-row"><button className="secondary-action" onClick={() => setQuickMode(null)} type="button">Cancel</button><button className="primary-action" type="submit">Save session</button></div></div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function CoachView({
  accountUser,
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
  accountUser: AccountUser | null;
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
      "I’m your MAI Coach. Pick a club or ask what to fix first, and I’ll turn the numbers into one clear swing priority, one drill, and one next-swing feel.",
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
        brand: "MAI Coach",
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
        throw new Error(payload.error ?? "MAI Coach could not answer right now.");
      }

      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", payload.answer ?? "MAI Coach did not return a readable answer."),
      ]);
      setCoachStatus(payload.mode === "setup" ? "API key needed" : "Answered");
    } catch (error) {
      setCoachMessages((current) => [
        ...current,
        makeCoachMessage("assistant", error instanceof Error ? error.message : "MAI Coach could not answer right now."),
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
            accountUser={accountUser}
            devAuthEnabled={devAuthEnabled}
            onOpenMemberVideos={onOpenMemberVideos}
            sessions={sessions}
            viewerRole={viewerRole}
          />
        )
      ) : (
        <section className="coach-layout">
          <article className="panel coach-chat-panel">
        <PanelHeader kicker="MAI Coach assistant" title={`${selectedClubLabel} conversation`} meta={coachStatus} />

        <div className="chat-transcript" aria-live="polite">
          {coachMessages.map((message) => (
            <div className={cls("chat-message", message.role)} key={message.id}>
              <span>{message.role === "assistant" ? "MAI Coach" : "You"}</span>
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
            aria-label="Ask MAI Coach"
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
            <EmptyState title="No club data" body="Choose a club with shots before asking MAI Coach." />
          )}
        </article>

        <article className="panel">
          <PanelHeader kicker="Active findings" title="What MAI Coach sees" meta={`${insights.length} flags`} />
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
  accountUser,
  authenticated,
  coachName,
  devAuthEnabled,
  onOpenMemberVideos,
  sessions,
  viewerRole,
}: {
  accountUser: AccountUser | null;
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
  const [addMemberMode, setAddMemberMode] = useState<"manual" | "first-member">("manual");
  const [memberSaveState, setMemberSaveState] = useState<"idle" | "saving">("idle");
  const [firstMemberOnboardingStatus, setFirstMemberOnboardingStatus] = useState<FirstMemberOnboardingStatus>("pending");
  const [activeMemberCount, setActiveMemberCount] = useState(0);
  const [memberInviteRecovery, setMemberInviteRecovery] = useState<CoachMember | null>(null);
  const firstMemberOnboardingOpenedRef = useRef(false);
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
  const [nextSessionGoal, setNextSessionGoal] = useState("");
  const [coachPrivateNotes, setCoachPrivateNotes] = useState("");
  const [emailMember, setEmailMember] = useState(true);
  const [generateAiRecap, setGenerateAiRecap] = useState(true);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [recapReviewVideo, setRecapReviewVideo] = useState<VideoLibraryItem | null>(null);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<StaffMemberDetail | null>(null);
  const [coachQuickMode, setCoachQuickMode] = useState<"content" | "session" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workspaceMessage, setWorkspaceMessage] = useState("Select a member to begin.");
  const [coachPhotoVersion, setCoachPhotoVersion] = useState(() => Date.now());
  const [coachPhotoMissing, setCoachPhotoMissing] = useState(false);
  const [coachContentForm, setCoachContentForm] = useState({
    contentType: "coach_note",
    title: "",
    body: "",
    visibility: "member",
  });
  const [coachSessionForm, setCoachSessionForm] = useState({
    title: "",
    date: getTodayDateString(),
    club: "SW",
    carry: "",
    total: "",
    ballSpeed: "",
    clubSpeed: "",
    smash: "",
    launch: "",
    spin: "",
    dispersion: "",
    note: "",
    recommendedDrill: "",
  });
  const allowedMembers = members;
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const memberResults = allowedMembers.filter((member) =>
    !normalizedMemberSearch ||
    [member.name, member.email, member.phone].some((value) => value.toLowerCase().includes(normalizedMemberSearch)),
  );
  const selectedMember = allowedMembers.find((member) => member.id === selectedMemberId);
  const selectedMemberSessions = selectedMemberDetail?.member.id === selectedMemberId
    ? selectedMemberDetail.sessions
    : [];
  const selectedSession = selectedMemberSessions.find((session) => session.id === selectedSessionId);
  const managedVideos = [...videos]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const editingVideo = videos.find((video) => video.id === editingVideoId);
  const coachProfileImageUrl = accountUser?.role === "coach"
    ? `/api/coach-photo?coachId=${encodeURIComponent(accountUser.id)}&v=${coachPhotoVersion}`
    : "";

  function applyCoachMembersPayload(payload: MembersResponsePayload) {
    const loadedMembers = payload.members ?? [];
    setMembers(loadedMembers);
    setActiveMemberCount(
      typeof payload.activeMemberCount === "number"
        ? payload.activeMemberCount
        : loadedMembers.filter(memberCountsAsActive).length,
    );
    setFirstMemberOnboardingStatus(
      normalizeFirstMemberOnboardingStatus(payload.firstMemberOnboardingStatus) as FirstMemberOnboardingStatus,
    );
    return loadedMembers;
  }

  function openAddMemberDialog(mode: "manual" | "first-member" = "manual") {
    setAddMemberMode(mode);
    setMemberInviteRecovery(null);
    setShowAddMember(true);
  }

  async function saveFirstMemberOnboardingStatus(status: FirstMemberOnboardingStatus) {
    const response = await fetch("/api/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstMemberOnboardingStatus: status }),
    });
    const payload = await readApiJson<{ firstMemberOnboardingStatus?: FirstMemberOnboardingStatus | string }>(
      response,
      "First-member onboarding could not be updated.",
    );
    const normalizedStatus = normalizeFirstMemberOnboardingStatus(payload.firstMemberOnboardingStatus) as FirstMemberOnboardingStatus;
    setFirstMemberOnboardingStatus(normalizedStatus);
    return normalizedStatus;
  }

  async function dismissFirstMemberOnboarding() {
    setMemberSaveState("saving");
    try {
      await saveFirstMemberOnboardingStatus("dismissed");
      setShowAddMember(false);
      setMemberInviteRecovery(null);
      setWorkspaceMessage("You can add your first member anytime from the Coach Dashboard.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "First-member onboarding could not be dismissed.");
    } finally {
      setMemberSaveState("idle");
    }
  }

  function closeAddMemberDialog() {
    if (addMemberMode === "first-member") {
      void dismissFirstMemberOnboarding();
      return;
    }
    setShowAddMember(false);
    setMemberInviteRecovery(null);
  }

  useEffect(() => {
    let cancelled = false;
    if (!authenticated) {
      queueMicrotask(() => {
        setWorkspaceMessage("Log in with a coach or admin account to manage lesson videos.");
        setLoadingMembers(false);
        setLoadingVideos(false);
        setActiveMemberCount(0);
        setFirstMemberOnboardingStatus("pending");
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      readVideoLibrary(),
      fetch("/api/members", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as MembersResponsePayload;
        if (!response.ok) throw new Error(payload.error ?? "Members could not be loaded.");
        return payload;
      }),
    ])
      .then(([records, membersPayload]) => {
        if (cancelled) return;
        const items = records.map((record) => createVideoLibraryItem(record));
        const loadedMembers = applyCoachMembersPayload(membersPayload);
        setVideos(items);
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

  useEffect(() => {
    if (firstMemberOnboardingOpenedRef.current) return;
    if (!shouldOpenFirstMemberOnboarding({
      accountRole: accountUser?.role,
      activeMemberCount,
      authenticated,
      loadingMembers,
      status: firstMemberOnboardingStatus,
      viewerRole,
    })) {
      return;
    }
    firstMemberOnboardingOpenedRef.current = true;
    setAddMemberMode("first-member");
    setMemberInviteRecovery(null);
    setShowAddMember(true);
    setWorkspaceMessage("Start building your roster by inviting your first golfer to MAI Coach.");
  }, [accountUser?.role, activeMemberCount, authenticated, firstMemberOnboardingStatus, loadingMembers, viewerRole]);

  function resetWorkflow() {
    setStep(1);
    setMemberSearch("");
    setSelectedMemberId("");
    setSelectedMemberDetail(null);
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
    setNextSessionGoal("");
    setCoachPrivateNotes("");
    setEmailMember(true);
    setGenerateAiRecap(true);
    setEditingVideoId(null);
    setUploadProgress(0);
  }

  function chooseMember(member: CoachMember) {
    setSelectedMemberId(member.id);
    setSelectedSessionId("");
    setWorkspaceMessage(`${member.name} selected. Add the lesson video when ready.`);
    void loadCoachMemberDetail(member.id);
  }

  async function loadCoachMemberDetail(memberId: string) {
    try {
      const payload = await readStaffMember(memberId);
      setSelectedMemberDetail(payload);
      setWorkspaceMessage(`${payload.member.name} loaded with ${payload.sessions.length} sessions and ${payload.videos.length} videos.`);
    } catch (error) {
      setSelectedMemberDetail(null);
      setWorkspaceMessage(error instanceof Error ? error.message : "Member detail could not be loaded.");
    }
  }

  async function refreshCoachMembers(nextSelectedMemberId = selectedMemberId) {
    const response = await fetch("/api/members", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as MembersResponsePayload;
    if (!response.ok) throw new Error(payload.error ?? "Members could not be loaded.");
    const loadedMembers = applyCoachMembersPayload(payload);
    if (nextSelectedMemberId && loadedMembers.some((member) => member.id === nextSelectedMemberId)) {
      setSelectedMemberId(nextSelectedMemberId);
    }
  }

  async function resendMemberInvite(member: CoachMember) {
    try {
      const payload = await postStaffAction<{ invite?: { publicMessage?: string; status?: string } }>({ action: "resendInvitation", userId: member.id });
      setWorkspaceMessage(payload.invite?.publicMessage ?? `Welcome email resent to ${member.email}.`);
      await refreshCoachMembers(member.id);
      return payload.invite ?? null;
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Welcome email could not be resent.");
      return null;
    }
  }

  async function retryFirstMemberInvite(member: CoachMember) {
    const invite = await resendMemberInvite(member);
    if (!invite || !shouldCompleteFirstMemberOnboardingAfterInvite(invite.status ?? "")) return;
    await saveFirstMemberOnboardingStatus("completed");
    setShowAddMember(false);
    setMemberInviteRecovery(null);
    setNewMember({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      skillLevel: "",
      notes: "",
    });
  }

  async function copyMemberSetupLink(member: CoachMember) {
    try {
      const payload = await postStaffAction<{ invite?: { setupUrl?: string; publicMessage?: string } }>({ action: "copySetupLink", userId: member.id });
      const setupUrl = payload.invite?.setupUrl ?? "";
      if (!setupUrl) throw new Error("A setup link could not be created.");
      await navigator.clipboard.writeText(setupUrl);
      setWorkspaceMessage(payload.invite?.publicMessage ?? `Fresh setup link copied for ${member.email}.`);
      await refreshCoachMembers(member.id);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Setup link could not be copied.");
    }
  }

  async function cancelMemberInvite(member: CoachMember) {
    const confirmed = window.confirm(`Cancel the current setup invitation for ${member.name}? Any unused setup link for this account will stop working.`);
    if (!confirmed) return;
    try {
      await postStaffAction({ action: "cancelInvitation", userId: member.id });
      setWorkspaceMessage(`Invitation cancelled for ${member.name}.`);
      await refreshCoachMembers(member.id);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Invitation could not be cancelled.");
    }
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
      const payload = await readApiJson<{
        firstMemberOnboardingStatus?: FirstMemberOnboardingStatus | string;
        invite?: { status?: string };
        member?: CoachMember;
        passwordConfigured?: boolean;
      }>(response, "The member could not be added.");
      if (!payload.member) throw new Error("The member could not be added.");
      const member = payload.member as CoachMember;
      const inviteStatus = payload.invite?.status ?? "";
      const inviteCompleted = shouldCompleteFirstMemberOnboardingAfterInvite(inviteStatus);
      if (payload.firstMemberOnboardingStatus) {
        setFirstMemberOnboardingStatus(
          normalizeFirstMemberOnboardingStatus(payload.firstMemberOnboardingStatus) as FirstMemberOnboardingStatus,
        );
      }
      setMembers((current) => [
        member,
        ...current.filter((item) => item.id !== member.id),
      ]);
      setActiveMemberCount((current) => {
        const wasAlreadyInRoster = members.some((item) => item.id === member.id);
        return memberCountsAsActive(member) && !wasAlreadyInRoster ? current + 1 : current;
      });
      setSelectedMemberId(member.id);
      void loadCoachMemberDetail(member.id);

      if (addMemberMode === "first-member" && !inviteCompleted) {
        setMemberInviteRecovery(member);
        setWorkspaceMessage(
          `${member.name} was added to your roster, but the welcome email needs attention. Try resending it or copying a setup link before closing this step.`,
        );
        return;
      }

      if (addMemberMode === "first-member" && normalizeFirstMemberOnboardingStatus(payload.firstMemberOnboardingStatus) !== "completed") {
        await saveFirstMemberOnboardingStatus("completed");
      }
      setShowAddMember(false);
      setMemberInviteRecovery(null);
      setNewMember({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        skillLevel: "",
        notes: "",
      });
      setWorkspaceMessage(
        inviteStatus === "delivered"
          ? `${member.name} was added and the welcome email was sent.`
          : inviteStatus === "not_sent"
          ? `${member.name} is already connected.`
          : `${member.name} was added, but the welcome email could not be sent. You can resend it from Admin.`,
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
      setActiveMemberCount((current) => {
        const wasAlreadyInRoster = members.some((item) => item.id === member.id);
        return memberCountsAsActive(member) && !wasAlreadyInRoster ? current + 1 : current;
      });
      setSelectedMemberId(member.id);
      setStep(1);
      setWorkspaceMessage(payload.publicMessage ?? `${member.name} is ready for a demo upload.`);
      void loadCoachMemberDetail(member.id);
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
    if (!videoTitle.trim()) setVideoTitle(videoDateTitleFromFile(file));
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

  async function handleOwnCoachPhoto(file: File | null) {
    if (!file || !accountUser || accountUser.role !== "coach") return;
    if (!coachPhotoMissing) {
      const confirmed = window.confirm("Replace your coach headshot? Your roster, videos, sessions, and login stay unchanged.");
      if (!confirmed) return;
    }
    try {
      await uploadCoachPhoto(accountUser.id, file);
      setCoachPhotoMissing(false);
      setCoachPhotoVersion(Date.now());
      setWorkspaceMessage("Coach headshot updated.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Coach headshot could not be saved.");
    }
  }

  async function removeOwnCoachPhoto() {
    if (!accountUser || accountUser.role !== "coach") return;
    const confirmed = window.confirm("Remove your coach headshot? Your account, roster, videos, and coach/member assignments will remain unchanged.");
    if (!confirmed) return;
    try {
      await deleteCoachPhoto(accountUser.id);
      setCoachPhotoMissing(true);
      setCoachPhotoVersion(Date.now());
      setWorkspaceMessage("Coach headshot removed.");
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Coach headshot could not be removed.");
    }
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
    if (!videoFile && !editingVideo) {
      setWorkspaceMessage("Choose a video before continuing.");
      setStep(2);
      return;
    }

    setSaveState("saving");
    setUploadProgress(4);
    let pendingVideoId = editingVideo?.id ?? "";
    try {
      const duration = videoFile ? await readVideoDuration(videoFile) : editingVideo?.duration ?? 0;
      const lessonSummaryText = lessonSummary.trim();
      const mainFocusText = workedOn.trim();
      const progressObservedText = improvement.trim();
      const practiceNextText = practiceAssignment.trim();
      const nextSessionGoalText = nextSessionGoal.trim();
      const preserveLegacyKeyIssue = Boolean(editingVideo && mainFocusText === getLessonMainFocus(editingVideo));
      const preserveLegacyRecommendedDrill = Boolean(editingVideo && practiceNextText === getLessonPracticeNext(editingVideo));
      const resolvedTitle = videoTitle.trim() || (videoFile ? videoDateTitleFromFile(videoFile) : editingVideo?.title ?? videoDateTitleFromSource(lessonDate));
      const metadata = {
        memberId: selectedMember.id,
        title: resolvedTitle,
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
        lessonSummary: lessonSummaryText,
        workedOn: mainFocusText,
        keyIssue: preserveLegacyKeyIssue ? editingVideo?.keyIssue ?? "" : "",
        improvement: progressObservedText,
        practiceAssignment: practiceNextText,
        recommendedDrill: preserveLegacyRecommendedDrill ? editingVideo?.recommendedDrill ?? "" : "",
        memberFacingNotes: editingVideo?.memberFacingNotes ?? "",
        nextSessionGoal: nextSessionGoalText,
	        coachPrivateNotes: coachPrivateNotes.trim(),
	        coachNotes: lessonSummaryText || mainFocusText || practiceNextText,
	        coachId: accountUser?.role === "coach" ? accountUser.id : undefined,
	        generateAiRecap: Boolean(generateAiRecap && !editingVideo && videoFile && accountUser?.role === "coach"),
	        processingLanguage: "en",
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

      const aiStatusNote = generateAiRecap && !editingVideo
        ? " MAI Coach recap processing is queued for coach review."
        : "";

      if (publicationStatus === "Draft") {
        setWorkspaceMessage(`Draft saved for ${selectedMember.name}. It is not visible to the member.${aiStatusNote}`);
      } else if (notifyMember && emailMember) {
        setWorkspaceMessage(
          record.emailStatus === "Sent"
            ? `Video published to ${selectedMember.name} and the email notification was sent.${aiStatusNote}`
            : `Video published, but the email notification could not be sent.${aiStatusNote}`,
        );
      } else {
        setWorkspaceMessage(`Video published to ${selectedMember.name}. No email was sent.${aiStatusNote}`);
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
    setWorkedOn(getLessonMainFocus(video));
    setKeyIssue(video.keyIssue ?? "");
    setImprovement(video.improvement ?? "");
    setPracticeAssignment(getLessonPracticeNext(video));
    setRecommendedDrill(video.recommendedDrill ?? "");
    setMemberFacingNotes(video.memberFacingNotes ?? "");
    setNextSessionGoal(video.nextSessionGoal ?? "");
    setCoachPrivateNotes(video.coachPrivateNotes ?? "");
    setEmailMember(video.emailStatus !== "Sent");
    setGenerateAiRecap(false);
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
    if (!window.confirm(`Delete "${video.title}"? This permanently removes the video, transcript, recap, and stored media.`)) return;
    try {
      await deleteVideoRecord(video.id);
      setVideos((items) => items.filter((item) => item.id !== video.id));
      setWorkspaceMessage(`${video.title} was deleted.`);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "The video could not be deleted.");
    }
  }

  async function submitCoachContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) {
      setWorkspaceMessage("Select a member before assigning content.");
      return;
    }
    try {
      await postStaffAction({
        action: "addContent",
        memberId: selectedMember.id,
        ...coachContentForm,
      });
      setCoachContentForm({ contentType: "coach_note", title: "", body: "", visibility: "member" });
      setCoachQuickMode(null);
      setWorkspaceMessage(`Content assigned to ${selectedMember.name}.`);
      void loadCoachMemberDetail(selectedMember.id);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Content could not be assigned.");
    }
  }

  async function submitCoachSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMember) {
      setWorkspaceMessage("Select a member before adding session data.");
      return;
    }
    try {
      await postStaffAction({
        action: "addSession",
        memberId: selectedMember.id,
        ...coachSessionForm,
      });
      setCoachSessionForm({
        title: "",
        date: getTodayDateString(),
        club: "SW",
        carry: "",
        total: "",
        ballSpeed: "",
        clubSpeed: "",
        smash: "",
        launch: "",
        spin: "",
        dispersion: "",
        note: "",
        recommendedDrill: "",
      });
      setCoachQuickMode(null);
      setWorkspaceMessage(`Session data added for ${selectedMember.name}.`);
      void loadCoachMemberDetail(selectedMember.id);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : "Session data could not be saved.");
    }
  }

  function moveToNextStep() {
    if (step === 1 && !selectedMember) {
      setWorkspaceMessage("Select a member before uploading a lesson video.");
      return;
    }
    if (step === 2 && (!videoFile && !editingVideo)) {
      setWorkspaceMessage("Choose a video before continuing.");
      return;
    }
    setStep((current) => Math.min(5, current + 1));
  }

  function requestAudioRecapGeneration() {
    if (editingVideo) {
      setRecapReviewVideo(editingVideo);
      return;
    }
    if (!videoFile) {
      setWorkspaceMessage("Choose a video first. MAI Coach can generate notes after the upload is saved.");
      setStep(2);
      return;
    }
    setGenerateAiRecap(true);
    setWorkspaceMessage("MAI Coach will generate lesson notes from the video audio after the upload finishes. The draft stays hidden until a coach approves it.");
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
          <button className="secondary-action" disabled={!authenticated} onClick={() => openAddMemberDialog("manual")}>＋ Add Member</button>
          <button className="secondary-action" disabled={!selectedMember} onClick={() => setCoachQuickMode("session")}>Add Session</button>
          <button className="secondary-action" disabled={!selectedMember} onClick={() => setCoachQuickMode("content")}>Assign Drill/Note</button>
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

      {accountUser?.role === "coach" && (
        <section className="coach-profile-photo-card">
          <div>
            {coachProfileImageUrl && !coachPhotoMissing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${coachName} headshot`}
                className="coach-avatar large"
                onError={() => setCoachPhotoMissing(true)}
                src={coachProfileImageUrl}
              />
            ) : (
              <span className="member-initials coach-avatar-fallback large">{initialsForName(coachName)}</span>
            )}
            <span><strong>{coachName}</strong><small>Coach profile photo</small></span>
          </div>
          <div className="button-row">
            <label className="secondary-action coach-photo-picker">
              Upload / replace
              <input
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  void handleOwnCoachPhoto(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            <button className="secondary-action danger-text-button" disabled={coachPhotoMissing} onClick={() => void removeOwnCoachPhoto()} type="button">Remove photo</button>
          </div>
        </section>
      )}

      <section className="coach-tool-status" role="status">
        <div>
          <span>{viewerRole === "admin" ? "Admin tools" : `${coachName}'s coach tools`}</span>
          <strong>{workspaceMessage}</strong>
        </div>
        {editingVideoId && <button className="text-button" onClick={resetWorkflow}>Cancel editing</button>}
      </section>

      <section className="coach-upload-shell">
        <nav className="coach-upload-steps" aria-label="Coach video upload steps">
          {["Member", "Video", "Session", "Recap", "Review"].map((label, index) => {
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
	                    <CoachAvatar coach={member} />
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email} · {member.phone}</small>
                    </span>
                    <span>
                      <strong>{inviteStatusLabel(member.inviteStatus ?? "pending")}</strong>
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
	                    <CoachAvatar coach={selectedMember} />
                    <div><span>Selected member</span><strong>{selectedMember.name}</strong><small>{selectedMember.email}</small></div>
                    <div><span>Contact</span><strong>{selectedMember.phone || "No phone"}</strong><small>{inviteStatusLabel(selectedMember.inviteStatus ?? "pending")}</small></div>
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
                      <button className="secondary-action" onClick={() => void resendMemberInvite(selectedMember)}>Resend Welcome Email</button>
                      <button className="secondary-action" onClick={() => void copyMemberSetupLink(selectedMember)}>Copy Setup Link</button>
                      <button className="secondary-action danger-text-button" onClick={() => void cancelMemberInvite(selectedMember)}>Cancel Invitation</button>
                      <button className="secondary-action" onClick={() => onOpenMemberVideos(selectedMember.id, selectedMember.name)}>View Lesson Videos</button>
                      <button className="secondary-action" onClick={() => setCoachQuickMode("session")}>Add Session</button>
                      <button className="secondary-action" onClick={() => setCoachQuickMode("content")}>Assign Drill</button>
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
                <label className="wide"><span>Video title</span><input maxLength={120} onChange={(event) => setVideoTitle(event.target.value)} placeholder={videoFile ? videoDateTitleFromFile(videoFile) : videoDateTitleFromSource(lessonDate)} value={videoTitle} /></label>
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
                <h3>Create lesson recap</h3>
                <p>Use your spoken feedback from the video to create a lesson recap, or enter a few notes manually.</p>
              </div>
              <label className="coach-email-toggle">
                <input
                  checked={generateAiRecap}
                  disabled={Boolean(editingVideo) || accountUser?.role === "admin"}
                  onChange={(event) => setGenerateAiRecap(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Use video audio to generate lesson notes</strong>
                  <small>{editingVideo ? "Use Generate Notes From Video Audio to review or regenerate an existing video recap." : accountUser?.role === "admin" ? "Admin uploads can still use the manual recap fields." : "Enabled for coach uploads. Nothing is published until you approve it."}</small>
                </span>
              </label>
              <section className="ai-recap-status-card">
                <div>
                  <span>{generateAiRecap ? "Video uploaded → checking audio" : "Manual recap mode"}</span>
                  <strong>{generateAiRecap ? "MAI Coach is listening after upload" : "Skip AI and enter notes manually"}</strong>
                  <p>
                    {generateAiRecap
                      ? "After the video finishes uploading, MAI Coach checks for coach audio, transcribes the feedback, creates a draft recap, and keeps it ready for coach review."
                      : "Audio processing is skipped. All recap fields below are optional, and the video can still be published without notes."}
                  </p>
                </div>
                <button className="primary-action" disabled={saveState === "saving" || (!editingVideo && !videoFile)} onClick={requestAudioRecapGeneration} type="button">
                  Generate Notes From Video Audio
                </button>
              </section>
              <button className="text-button" onClick={() => setGenerateAiRecap(false)} type="button">Skip AI and enter notes manually</button>
              <div className="coach-notes-grid">
                <label><span>Lesson summary</span><textarea onChange={(event) => setLessonSummary(event.target.value)} placeholder="Today we worked on takeaway and face control with the 7 iron." value={lessonSummary} /></label>
                <label><span>Main focus</span><textarea onChange={(event) => setWorkedOn(event.target.value)} placeholder="Keeping the club from rolling inside while maintaining a square clubface." value={workedOn} /></label>
                <label><span>Progress observed</span><textarea onChange={(event) => setImprovement(event.target.value)} placeholder="Start line tightened and contact moved closer to the center of the face." value={improvement} /></label>
                <label><span>Practice next</span><textarea onChange={(event) => setPracticeAssignment(event.target.value)} placeholder="Three sets of the headcover takeaway drill, then 20 half-speed 7-iron swings." value={practiceAssignment} /></label>
                <label><span>Next session goal</span><textarea onChange={(event) => setNextSessionGoal(event.target.value)} placeholder="Arrive next session with a neutral takeaway checkpoint and tighter start line." value={nextSessionGoal} /></label>
                <label><span>Coach private notes</span><textarea onChange={(event) => setCoachPrivateNotes(event.target.value)} placeholder="Only coaches and admins can see this. Never shown to the member." value={coachPrivateNotes} /></label>
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
                  <div><dt>Member</dt><dd><CoachAvatar coach={selectedMember} /><span>{selectedMember.name}<small>{selectedMember.email}</small></span></dd></div>
                  <div><dt>Coach</dt><dd><CoachAvatar coach={{ name: coachName, profileImageUrl: coachProfileImageUrl }} /><span>{coachName}<small>{viewerRole === "admin" ? "Admin upload" : "Coach upload"}</small></span></dd></div>
                  <div><dt>Video</dt><dd>{videoTitle || (videoFile ? videoDateTitleFromFile(videoFile) : editingVideo?.title ?? videoDateTitleFromSource(lessonDate))}<small>{videoType}</small></dd></div>
                  <div><dt>Lesson</dt><dd>{formatFullDate(lessonDate)}<small>{focusArea}</small></dd></div>
                  <div><dt>Session</dt><dd>{selectedSession?.title ?? "No session attached"}<small>{selectedSession?.source ?? "Standalone video"}</small></dd></div>
                  <div><dt>Lesson Summary</dt><dd>{lessonSummary || "Blank"}<small>Editable before approval.</small></dd></div>
                  <div><dt>Main Focus</dt><dd>{workedOn || "Blank"}<small>Combines the old worked-on and key-issue fields.</small></dd></div>
                  <div><dt>Progress Observed</dt><dd>{improvement || "Blank"}<small>Only what the coach confirms.</small></dd></div>
                  <div><dt>Practice Next</dt><dd>{practiceAssignment || "Blank"}<small>Assignment and drill in one field.</small></dd></div>
                  <div><dt>Next Session Goal</dt><dd>{nextSessionGoal || "Blank"}<small>Shared after coach approval.</small></dd></div>
                  <div><dt>Private Coach Notes</dt><dd>{coachPrivateNotes || "None"}<small>Private to coaches and admins.</small></dd></div>
                  <div><dt>Audio status</dt><dd>{generateAiRecap ? "Video uploaded, checking for coach audio after save" : "Manual notes mode"}<small>{generateAiRecap ? "Transcribing coach feedback, then creating lesson recap." : "No audio processing will run."}</small></dd></div>
                </dl>
              </div>
              <label className="coach-email-toggle">
                <input
	                  checked={generateAiRecap}
	                  disabled={Boolean(editingVideo) || accountUser?.role === "admin"}
	                  onChange={(event) => setGenerateAiRecap(event.target.checked)}
	                  type="checkbox"
	                />
	                <span>
	                  <strong>Use video audio to generate lesson notes</strong>
	                  <small>{editingVideo ? "Available for new coach uploads. Use Review AI Recap to retry an existing video." : accountUser?.role === "admin" ? "Admin uploads need a selected assigned coach before AI processing can run." : "Starts after upload and stays hidden until a coach approves it."}</small>
	                </span>
	              </label>
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
                <button className="secondary-action" disabled={saveState === "saving"} onClick={() => void saveCoachVideo("Published", false)}>Publish Video Without Recap</button>
                <button className="primary-action" disabled={saveState === "saving"} onClick={() => void saveCoachVideo("Published", true)}>
                  {saveState === "saving" ? "Publishing..." : "Approve & Publish to Member"}
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
                    aria-label={`Review AI recap for ${video.title}`}
                    className="icon-button"
                    onClick={() => setRecapReviewVideo(video)}
                    title="Review AI recap"
                  >
                    AI
                  </button>
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
                  <button aria-label={`Delete ${video.title}`} className="icon-button danger-text-button" onClick={() => void removeManagedVideo(video)} title="Delete video">×</button>
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

      {recapReviewVideo && (
        <AiLessonRecapReviewModal
          onClose={() => setRecapReviewVideo(null)}
          onPublished={(record) => {
            replaceItem(record);
            setRecapReviewVideo(createVideoLibraryItem(record));
          }}
          video={recapReviewVideo}
        />
      )}

      {showAddMember && (
        <div className="video-modal-overlay">
          <form className="video-upload-modal coach-member-modal" onSubmit={addMember}>
            <div className="video-modal-header">
              <div>
                <p className="eyebrow">{addMemberMode === "first-member" ? "Coach onboarding" : "Member account"}</p>
                <h2>{addMemberMode === "first-member" ? "Add your first member" : "Add Member"}</h2>
              </div>
              <button aria-label="Close add member dialog" className="icon-button" onClick={closeAddMemberDialog} type="button">×</button>
            </div>
            <p className="muted-copy">
              {addMemberMode === "first-member"
                ? "Start building your roster by inviting your first golfer to MAI Coach."
                : "The member record is saved in D1 and tied to their login email. MAI Coach will email a secure setup link so they can create their own password."}
            </p>
            {memberInviteRecovery && (
              <div className="coach-inline-warning first-member-email-warning">
                <strong>Member added. Welcome email needs attention.</strong>
                <p>Keep this step open while you resend the welcome email or copy a setup link for {memberInviteRecovery.email}.</p>
                <div className="button-row">
                  <button className="secondary-action" onClick={() => void retryFirstMemberInvite(memberInviteRecovery)} type="button">Resend Welcome Email</button>
                  <button className="secondary-action" onClick={() => void copyMemberSetupLink(memberInviteRecovery)} type="button">Copy Setup Link</button>
                </div>
              </div>
            )}
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
                <button className="secondary-action" disabled={memberSaveState === "saving"} onClick={closeAddMemberDialog} type="button">
                  {addMemberMode === "first-member" ? "I'll do this later" : "Cancel"}
                </button>
                <button className="primary-action" disabled={memberSaveState === "saving"} type="submit">
                  {memberSaveState === "saving" ? "Adding..." : "Add Member"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {coachQuickMode && selectedMember && (
        <div className="video-modal-overlay">
          {coachQuickMode === "content" ? (
            <form className="video-upload-modal coach-member-modal" onSubmit={submitCoachContent}>
              <div className="video-modal-header">
                <div>
                  <p className="eyebrow">Coach assignment</p>
                  <h2>Add content for {selectedMember.name}</h2>
                </div>
                <button aria-label="Close content dialog" className="icon-button" onClick={() => setCoachQuickMode(null)} type="button">×</button>
              </div>
              <div className="video-form-grid">
                <label>
                  <span>Type</span>
                  <select value={coachContentForm.contentType} onChange={(event) => setCoachContentForm((current) => ({ ...current, contentType: event.target.value }))}>
                    <option value="coach_note">Coach note</option>
                    <option value="feedback">Member feedback</option>
                    <option value="practice_recommendation">Practice recommendation</option>
                    <option value="drill">Drill</option>
                    <option value="document">Document/reference</option>
                  </select>
                </label>
                <label>
                  <span>Visibility</span>
                  <select value={coachContentForm.visibility} onChange={(event) => setCoachContentForm((current) => ({ ...current, visibility: event.target.value }))}>
                    <option value="member">Member visible</option>
                    <option value="coach">Coach/admin only</option>
                  </select>
                </label>
                <label className="video-form-wide">
                  <span>Title</span>
                  <input required value={coachContentForm.title} onChange={(event) => setCoachContentForm((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <label className="video-form-wide">
                  <span>Note / assignment</span>
                  <textarea required value={coachContentForm.body} onChange={(event) => setCoachContentForm((current) => ({ ...current, body: event.target.value }))} />
                </label>
              </div>
              <div className="video-modal-actions">
                <span>Private items stay hidden from the member. Member-visible items are scoped to this account.</span>
                <div className="button-row">
                  <button className="secondary-action" onClick={() => setCoachQuickMode(null)} type="button">Cancel</button>
                  <button className="primary-action" type="submit">Save content</button>
                </div>
              </div>
            </form>
          ) : (
            <form className="video-upload-modal coach-member-modal" onSubmit={submitCoachSession}>
              <div className="video-modal-header">
                <div>
                  <p className="eyebrow">Session data</p>
                  <h2>Add session for {selectedMember.name}</h2>
                </div>
                <button aria-label="Close session dialog" className="icon-button" onClick={() => setCoachQuickMode(null)} type="button">×</button>
              </div>
              <div className="video-form-grid">
                <label className="video-form-wide"><span>Session name</span><input value={coachSessionForm.title} onChange={(event) => setCoachSessionForm((current) => ({ ...current, title: event.target.value }))} placeholder="Wedge distance control" /></label>
                <label><span>Date</span><input type="date" value={coachSessionForm.date} onChange={(event) => setCoachSessionForm((current) => ({ ...current, date: event.target.value }))} /></label>
                <label><span>Club</span><select value={coachSessionForm.club} onChange={(event) => setCoachSessionForm((current) => ({ ...current, club: event.target.value }))}>{CLUB_ORDER.map((club) => <option key={club} value={club}>{getClubDisplayName(club)}</option>)}</select></label>
                {(["carry", "total", "ballSpeed", "clubSpeed", "smash", "launch", "spin", "dispersion"] as const).map((field) => (
                  <label key={field}><span>{field.replace(/([A-Z])/g, " $1")}</span><input inputMode="decimal" value={coachSessionForm[field]} onChange={(event) => setCoachSessionForm((current) => ({ ...current, [field]: event.target.value }))} /></label>
                ))}
                <label className="video-form-wide"><span>Coach notes</span><textarea value={coachSessionForm.note} onChange={(event) => setCoachSessionForm((current) => ({ ...current, note: event.target.value }))} /></label>
                <label className="video-form-wide"><span>Recommended drill</span><textarea value={coachSessionForm.recommendedDrill} onChange={(event) => setCoachSessionForm((current) => ({ ...current, recommendedDrill: event.target.value }))} /></label>
              </div>
              <div className="video-modal-actions">
                <span>Every metric is optional. Missing numbers display as NA.</span>
                <div className="button-row">
                  <button className="secondary-action" onClick={() => setCoachQuickMode(null)} type="button">Cancel</button>
                  <button className="primary-action" type="submit">Save session</button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PracticeView({
  accountUser,
  insights,
  practiceProfile,
  sessions,
  setActiveTab,
}: {
  accountUser: AccountUser | null;
  insights: Insight[];
  practiceProfile?: UserPracticeProfile | null;
  sessions: Session[];
  setActiveTab: (tab: Tab) => void;
}) {
  const priority = insights[0];
  const defaultFocus = priority?.metric?.toLowerCase().includes("face")
    ? "Face control"
    : priority?.club === "Driver"
      ? "Driver accuracy"
      : practiceProfile?.goals?.[0] ?? "Better contact";
  const focusOptions = [
    "Driver accuracy",
    "More distance",
    "Better contact",
    "Iron consistency",
    "Wedge distance control",
    "Launch conditions",
    "Shot shape",
    "Club path",
    "Face control",
    "Short game",
    "Putting",
    "Coach-assigned focus",
    "Surprise me",
  ];
  const [selectedFocus, setSelectedFocus] = useState(defaultFocus);
  const [activities, setActivities] = useState<PracticeActivity[]>([]);
  const [currentActivity, setCurrentActivity] = useState<PracticeActivity | null>(null);
  const [loadingAction, setLoadingAction] = useState<"" | PracticeActivityType | "load" | "update">("");
  const [practiceMessage, setPracticeMessage] = useState("");
  const [showFocusChoices, setShowFocusChoices] = useState(false);
  const [showResultEntry, setShowResultEntry] = useState(false);
  const [replaceReason, setReplaceReason] = useState("Just want another option");
  const [resultForm, setResultForm] = useState({
    attempts: "",
    score: "",
    successfulAttempts: "",
    notes: "",
    reflection: "",
  });
  const coachConnection = currentActivity?.instructions.coachConnection;
  const hasSessionData = sessions.some((session) => session.shots.length > 0);
  const latestSession = sessions.find((session) => session.shots.length > 0);
  const recentActivity = activities[0];
  const lastResult = activities.find((activity) => activity.latestResult)?.latestResult ?? null;
  const improvementTrend = lastResult
    ? lastResult.progressStatus === "improved"
      ? "Improved"
      : lastResult.progressStatus === "maintained"
        ? "Maintained"
        : lastResult.progressStatus === "needs_more_work"
          ? "Needs More Work"
          : "Insufficient Data"
    : "No result yet";
  const nextStep = lastResult?.nextRecommendation?.recommendation
    ?? currentActivity?.instructions.nextStepLogic
    ?? "Generate a drill or challenge to start the loop.";
  const priorityCopy = currentActivity?.instructions.sourceSummary ??
    (priority
    ? `Based on your recent sessions, coach feedback, and goals, your biggest opportunity is currently ${priority.metric.toLowerCase()} with your ${getClubDisplayName(priority.club)}.`
    : hasSessionData
      ? "MAI Coach will use your saved session data conservatively until a stronger trend emerges."
      : practiceProfile
        ? "Starter plan based on your golfer profile. Upload a session or ask your coach to add feedback for a more specific plan."
        : "Create a golfer profile or upload your first session before MAI Coach can personalize the practice plan.");

  useEffect(() => {
    if (!accountUser) {
      setActivities([]);
      setCurrentActivity(null);
      setPracticeMessage("");
      return;
    }
    let active = true;
    setLoadingAction("load");
    fetch("/api/practice")
      .then((response) => readApiJson<{ activities?: PracticeActivity[]; currentActivity?: PracticeActivity | null }>(response, "Practice data is unavailable."))
      .then((payload: { activities?: PracticeActivity[]; currentActivity?: PracticeActivity | null }) => {
        if (!active) return;
        setActivities(payload.activities ?? []);
        setCurrentActivity(payload.currentActivity ?? payload.activities?.[0] ?? null);
      })
      .catch((error) => {
        if (active) setPracticeMessage(error instanceof Error ? error.message : "Practice data is unavailable.");
      })
      .finally(() => {
        if (active) setLoadingAction("");
      });
    return () => {
      active = false;
    };
  }, [accountUser]);

  async function requestActivity(activityType: PracticeActivityType, options: { replace?: boolean } = {}) {
    if (!accountUser) {
      setPracticeMessage("Sign in to generate a personal MAI Coach practice activity.");
      return;
    }
    setLoadingAction(activityType);
    setPracticeMessage(activityType === "drill" ? "MAI Coach is building your drill." : "MAI Coach is building your challenge.");
    try {
      const response = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType,
          focusArea: selectedFocus,
          replaceReason: options.replace ? replaceReason : undefined,
        }),
      });
      const payload = await readApiJson<{
        activity?: PracticeActivity | null;
        activities?: PracticeActivity[];
        error?: string;
        message?: string;
        reused?: boolean;
      }>(response, "MAI Coach could not generate that activity.");
      if (!payload.activity) {
        throw new Error(payload.message || "MAI Coach could not generate that activity.");
      }
      if (payload.activity) {
        setCurrentActivity(payload.activity);
        setActivities((current) => {
          const withoutDuplicate = current.filter((activity) => activity.id !== payload.activity?.id);
          return [payload.activity as PracticeActivity, ...withoutDuplicate].slice(0, 8);
        });
      }
      setShowResultEntry(false);
      setPracticeMessage(payload.reused ? payload.message || "MAI Coach reused your active activity." : "Practice activity saved.");
    } catch (error) {
      setPracticeMessage(error instanceof Error ? error.message : "MAI Coach could not generate that activity.");
    } finally {
      setLoadingAction("");
    }
  }

  async function updateActivity(action: "start" | "complete" | "submit_result" | "share_with_coach") {
    if (!currentActivity) return;
    setLoadingAction("update");
    try {
      const response = await fetch("/api/practice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          activityId: currentActivity.id,
          score: resultForm.score,
          attempts: resultForm.attempts,
          successfulAttempts: resultForm.successfulAttempts,
          notes: resultForm.notes,
          reflection: resultForm.reflection,
          submissionType: resultForm.score ? "score" : resultForm.reflection ? "reflection" : "manual",
        }),
      });
      const payload = await readApiJson<{
        activities?: PracticeActivity[];
        currentActivity?: PracticeActivity | null;
        error?: string;
      }>(response, "Practice activity could not be updated.");
      setActivities(payload.activities ?? activities);
      setCurrentActivity(payload.currentActivity ?? payload.activities?.find((activity) => activity.id === currentActivity.id) ?? currentActivity);
      if (action === "start") setPracticeMessage("Activity started.");
      if (action === "complete") {
        setShowResultEntry(true);
        setPracticeMessage("How did you do?");
      }
      if (action === "submit_result") {
        setShowResultEntry(false);
        setResultForm({ attempts: "", score: "", successfulAttempts: "", notes: "", reflection: "" });
        setPracticeMessage("Result submitted. MAI Coach updated the next step.");
      }
      if (action === "share_with_coach") setPracticeMessage("Result marked to share with your assigned coach.");
    } catch (error) {
      setPracticeMessage(error instanceof Error ? error.message : "Practice activity could not be updated.");
    } finally {
      setLoadingAction("");
    }
  }

  return (
    <section className="practice-workspace">
      <div className="practice-hero panel">
        <div className="practice-hero-copy">
          <div className="practice-avatar-row">
            {accountUser && <AccountAvatar user={accountUser} />}
            <span>MAI Coach Practice</span>
          </div>
          <h2>What should we work on today?</h2>
          <p>{priorityCopy}</p>
          {coachConnection?.connected && (
            <div className="practice-coach-note">
              <span>Recommended from {coachConnection.coachName || "your coach"}</span>
              <strong>{coachConnection.summary}</strong>
              <small>MAI Coach organized this practice around approved lesson feedback.</small>
            </div>
          )}
        </div>
        <div className="practice-action-panel">
          <button className="primary-action practice-primary-action" disabled={Boolean(loadingAction)} onClick={() => void requestActivity("drill")} type="button">
            {loadingAction === "drill" ? "Building Drill..." : "Generate a Drill"}
          </button>
          <button className="primary-action practice-primary-action challenge" disabled={Boolean(loadingAction)} onClick={() => void requestActivity("challenge")} type="button">
            {loadingAction === "challenge" ? "Building Challenge..." : "Generate a Challenge"}
          </button>
          <button className="secondary-action" onClick={() => setShowFocusChoices((current) => !current)} type="button">
            Choose a different focus
          </button>
          {showFocusChoices && (
            <div className="practice-focus-picker">
              {focusOptions.map((focus) => (
                <button className={cls(selectedFocus === focus && "selected")} key={focus} onClick={() => setSelectedFocus(focus)} type="button">
                  {focus}
                </button>
              ))}
            </div>
          )}
          {selectedFocus !== defaultFocus && (
            <p className="practice-focus-warning">
              MAI Coach recommends {defaultFocus} first. You can choose {selectedFocus}, but coach-approved priorities still get extra weight.
            </p>
          )}
        </div>
      </div>

      <div className="practice-progress-strip">
        <div><span>Current focus</span><strong>{selectedFocus}</strong></div>
        <div><span>Recent practice activity</span><strong>{recentActivity?.title ?? "None yet"}</strong></div>
        <div><span>Last reported result</span><strong>{lastResult ? `${lastResult.progressStatus.replaceAll("_", " ")}` : "NA"}</strong></div>
        <div><span>Improvement trend</span><strong>{improvementTrend}</strong></div>
        <div><span>Next recommended step</span><strong>{nextStep}</strong></div>
      </div>

      {practiceMessage && <div className="practice-status-message" role="status">{practiceMessage}</div>}

      {!accountUser ? (
        <div className="panel practice-empty-panel">
          <PanelHeader kicker="Sign in required" title="Your practice generator is private" meta="Activities and results attach to your account only" />
          <p>Sign in or create an account before MAI Coach saves drills, challenges, results, or coach-share settings.</p>
        </div>
      ) : currentActivity ? (
        <div className="practice-current-grid">
          <article className="panel practice-activity-card">
            <div className="practice-card-head">
              <span>{currentActivity.activityType === "challenge" ? "Challenge" : "Drill"}</span>
              <strong>{currentActivity.status.replaceAll("_", " ")}</strong>
            </div>
            <h3>{currentActivity.title}</h3>
            <p>{currentActivity.reasonSelected}</p>
            {currentActivity.instructions.sourceSummary && (
              <div className="practice-source-summary">
                <span>{currentActivity.instructions.sourceMode?.replaceAll("_", " ") ?? "source"}</span>
                <strong>{currentActivity.instructions.sourceSummary}</strong>
              </div>
            )}
            <dl className="practice-activity-meta">
              <div><dt>Focus</dt><dd>{currentActivity.focusArea}</dd></div>
              <div><dt>Club</dt><dd>{currentActivity.club || "Any club"}</dd></div>
              <div><dt>Time</dt><dd>{currentActivity.durationMinutes ?? "NA"} min</dd></div>
              <div><dt>Attempts</dt><dd>{currentActivity.attemptCount ?? "NA"}</dd></div>
            </dl>
            <section>
              <h4>Setup</h4>
              <p>{currentActivity.instructions.setup}</p>
            </section>
            <section>
              <h4>Practice</h4>
              <ol className="practice-instruction-list">
                {(currentActivity.instructions.instructions ?? []).map((step) => <li key={step}>{step}</li>)}
              </ol>
            </section>
            <section className="practice-target-box">
              <span>Success target</span>
              <strong>{currentActivity.target?.successTarget ?? "Record the result MAI Coach requested."}</strong>
              {currentActivity.scoring?.enabled && <small>{currentActivity.scoring.system}</small>}
            </section>
            <dl className="practice-drill-detail">
              <div><dt>Feel</dt><dd>{currentActivity.instructions.feel ?? "NA"}</dd></div>
              <div><dt>Common mistake</dt><dd>{currentActivity.instructions.commonMistake ?? "NA"}</dd></div>
              <div><dt>Make it easier</dt><dd>{currentActivity.instructions.easierVersion ?? "NA"}</dd></div>
              <div><dt>Make it harder</dt><dd>{currentActivity.instructions.harderVersion ?? "NA"}</dd></div>
            </dl>
            <div className="practice-activity-actions">
              <button className="primary-action" disabled={loadingAction === "update"} onClick={() => void updateActivity("start")} type="button">Start Activity</button>
              <button className="secondary-action" disabled={loadingAction === "update"} onClick={() => void updateActivity("complete")} type="button">Mark Complete</button>
              <button className="secondary-action" onClick={() => setShowResultEntry((current) => !current)} type="button">How Did You Do?</button>
            </div>
          </article>

          <aside className="panel practice-result-panel">
            <PanelHeader kicker="Results" title="How did you do?" meta="Upload is optional" />
            <div className="practice-result-options">
              <button onClick={() => setActiveTab("import")} type="button">Upload Session Results</button>
              <button onClick={() => setActiveTab("import")} type="button">Upload Screenshot or Photo</button>
              <button onClick={() => setActiveTab("import")} type="button">Upload CSV</button>
              <button onClick={() => setShowResultEntry(true)} type="button">Enter Results Manually</button>
              <button onClick={() => setShowResultEntry(true)} type="button">Enter Challenge Score</button>
              <button onClick={() => setShowResultEntry(true)} type="button">Tell MAI Coach What Happened</button>
              <button onClick={() => setPracticeMessage("No problem. MAI Coach will keep this activity open until you are ready.")} type="button">Skip for Now</button>
            </div>
            {showResultEntry && (
              <div className="practice-result-form">
                <label><span>Attempts</span><input inputMode="numeric" value={resultForm.attempts} onChange={(event) => setResultForm((current) => ({ ...current, attempts: event.target.value }))} /></label>
                <label><span>Successful attempts</span><input inputMode="numeric" value={resultForm.successfulAttempts} onChange={(event) => setResultForm((current) => ({ ...current, successfulAttempts: event.target.value }))} /></label>
                <label><span>Challenge score</span><input inputMode="decimal" value={resultForm.score} onChange={(event) => setResultForm((current) => ({ ...current, score: event.target.value }))} /></label>
                <label><span>Result notes</span><textarea value={resultForm.notes} onChange={(event) => setResultForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What improved or missed the target?" /></label>
                <label><span>Reflection</span><textarea value={resultForm.reflection} onChange={(event) => setResultForm((current) => ({ ...current, reflection: event.target.value }))} placeholder="What did it feel like?" /></label>
                <button className="primary-action" disabled={loadingAction === "update"} onClick={() => void updateActivity("submit_result")} type="button">Submit Result</button>
              </div>
            )}
            {currentActivity.latestResult && (
              <div className="practice-progress-result">
                <span>Result</span>
                <strong>{currentActivity.latestResult.progressStatus.replaceAll("_", " ")}</strong>
                {(currentActivity.latestResult.evidence ?? []).map((item) => <p key={item}>{item}</p>)}
                <small>{currentActivity.latestResult.nextRecommendation?.recommendation ?? "MAI Coach will use this for the next recommendation."}</small>
                <button className="secondary-action" onClick={() => void updateActivity("share_with_coach")} type="button">Share Results With Coach</button>
              </div>
            )}
            <div className="practice-generate-another">
              <label><span>Generate another because...</span><select value={replaceReason} onChange={(event) => setReplaceReason(event.target.value)}>
                <option>Too easy</option>
                <option>Too hard</option>
                <option>Not enough time</option>
                <option>Wrong equipment</option>
                <option>Different focus</option>
                <option>Just want another option</option>
              </select></label>
              <button className="secondary-action" disabled={Boolean(loadingAction)} onClick={() => void requestActivity(currentActivity.activityType, { replace: true })} type="button">Generate Another</button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="panel practice-empty-panel">
          <PanelHeader kicker="Ready when you are" title="Generate one focused activity" meta={latestSession ? `Latest session: ${latestSession.title}` : "No session required"} />
          <p>Choose a drill for technical work or a challenge for a measurable test. MAI Coach will save the activity before showing it.</p>
        </div>
      )}

      <section className="panel practice-history-panel">
        <PanelHeader kicker="Practice history" title="Recent activity" meta="Last saved drills and challenges" />
        <div className="practice-history-list">
          {activities.slice(0, 5).map((activity) => (
            <button className={cls(currentActivity?.id === activity.id && "selected")} key={activity.id} onClick={() => setCurrentActivity(activity)} type="button">
              <span>{formatDate(activity.createdAt)} · {activity.activityType}</span>
              <strong>{activity.title}</strong>
              <small>{activity.focusArea} · {activity.latestResult?.progressStatus?.replaceAll("_", " ") ?? activity.status.replaceAll("_", " ")}</small>
            </button>
          ))}
          {activities.length === 0 && <p>No generated practice activities yet.</p>}
        </div>
      </section>
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
  const date = parseDisplayDate(value);
  if (!date) return "NA";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function videoDateTitleFromSource(value?: string | number | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(safeDate);
}

function videoDateTitleFromFile(file: File) {
  return videoDateTitleFromSource(file.lastModified || Date.now());
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
  const hasPublishedLessonRecap = Boolean(
    video.lessonSummary ||
    getLessonMainFocus(video) ||
    video.improvement ||
    getLessonPracticeNext(video) ||
    video.nextSessionGoal ||
    video.memberFacingNotes ||
    (video.coachNotes && !video.coachNotesPrivate),
  );
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
            {hasPublishedLessonRecap && <span>Lesson recap</span>}
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

function AiLessonRecapReviewModal({
  onClose,
  onPublished,
  video,
}: {
  onClose: () => void;
  onPublished: (record: VideoLibraryRecord) => void;
  video: VideoLibraryItem;
}) {
  const [state, setState] = useState<VideoRecapState | null>(null);
  const [message, setMessage] = useState("Loading MAI Coach recap state...");
  const [saving, setSaving] = useState<"idle" | "saving">("idle");
  const [transcriptText, setTranscriptText] = useState("");
  const [fields, setFields] = useState({
    lessonSummary: video.lessonSummary ?? "",
    mainFocus: getLessonMainFocus(video),
    nextSessionGoal: video.nextSessionGoal ?? "",
    practiceNext: getLessonPracticeNext(video),
    progressObserved: video.improvement ?? "",
  });
  const activeJobStatuses = new Set(["queued", "extracting_audio", "transcribing", "generating_recap"]);

  function legacyPayloadFromFields() {
    return {
      improvement: fields.progressObserved,
      keyIssue: "",
      lessonSummary: fields.lessonSummary,
      memberFacingNotes: "",
      nextSessionGoal: fields.nextSessionGoal,
      practiceAssignment: fields.practiceNext,
      recommendedDrill: "",
      workedOn: fields.mainFocus,
    };
  }

  useEffect(() => {
    let cancelled = false;
    function applyPayload(payload: VideoRecapState) {
      setState(payload);
      if (payload.transcript?.text) setTranscriptText(payload.transcript.text);
      if (payload.draft) {
        setFields(simplifiedFieldsFromVideoRecapDraft(payload.draft));
        setMessage(payload.draft.status === "published" ? "Published and locked. Regenerate from video audio to create a new draft revision." : "Generated from your video voiceover. Review before publishing.");
      } else if (payload.job) {
        setMessage(payload.job.errorMessage || videoRecapProcessingStatusText(payload.job.status));
      } else {
        setMessage("No AI recap has been generated yet. Generate Notes From Video Audio will queue this video for processing.");
      }
    }

    readVideoRecap(video.id)
      .then((payload) => {
        if (cancelled) return;
        applyPayload(payload);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "The MAI Coach recap could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [video.id]);

  const isProcessingActive = Boolean(state?.job && activeJobStatuses.has(state.job.status));

  useEffect(() => {
    if (!isProcessingActive) return;
    let cancelled = false;
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      readVideoRecap(video.id)
        .then((payload) => {
          if (cancelled) return;
          setState(payload);
          if (payload.transcript?.text) setTranscriptText(payload.transcript.text);
          if (payload.draft) {
            setFields(simplifiedFieldsFromVideoRecapDraft(payload.draft));
            setMessage(payload.draft.status === "published" ? "Published and locked. Regenerate from video audio to create a new draft revision." : "Generated from your video voiceover. Review before publishing.");
          } else if (payload.job) {
            setMessage(payload.job.errorMessage || videoRecapProcessingStatusText(payload.job.status));
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(error instanceof Error ? error.message : "The MAI Coach recap could not be refreshed.");
        })
        .finally(() => {
          inFlight = false;
        });
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isProcessingActive, video.id]);

  function updateField(key: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function refreshNow() {
    setSaving("saving");
    try {
      const payload = await readVideoRecap(video.id);
      setState(payload);
      if (payload.transcript?.text) setTranscriptText(payload.transcript.text);
      if (payload.draft) {
        setFields(simplifiedFieldsFromVideoRecapDraft(payload.draft));
      }
      setMessage(payload.job?.errorMessage || "MAI Coach recap state refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The MAI Coach recap could not be refreshed.");
    } finally {
      setSaving("idle");
    }
  }

  async function submit(action: "approveAndPublish" | "cancelProcessing" | "editTranscript" | "markIncorrect" | "regenerateRecapFromTranscript" | "retry" | "retranscribeVideo" | "saveDraft") {
    if (action === "approveAndPublish" && !window.confirm("Publish this coach-approved recap and transcript to the member?")) return;
    if (action === "markIncorrect" && !window.confirm("Mark this AI recap as incorrect? It will stay hidden from the member.")) return;
    if (action === "cancelProcessing" && !window.confirm("Cancel the active MAI Coach processing job? Published recaps will remain available.")) return;
    if (action === "retry" && !window.confirm("Retry MAI Coach processing for this video? The existing video will be preserved.")) return;
    if (action === "retranscribeVideo" && !window.confirm("Retranscribe the original video and create a new draft revision?")) return;
    setSaving("saving");
    try {
      const nextState = await updateVideoRecap({
        ...legacyPayloadFromFields(),
        action,
        transcriptText,
        videoId: video.id,
      });
      setState(nextState);
      if (nextState.transcript?.text) setTranscriptText(nextState.transcript.text);
      if (action === "approveAndPublish") {
        onPublished({
          ...stripVideoObjectUrl(video),
          improvement: fields.progressObserved,
          keyIssue: "",
          lessonSummary: fields.lessonSummary,
          memberFacingNotes: "",
          nextSessionGoal: fields.nextSessionGoal,
          practiceAssignment: fields.practiceNext,
          publicationStatus: "Published",
          recommendedDrill: "",
          status: "Coach Feedback",
          updatedAt: new Date().toISOString(),
          workedOn: fields.mainFocus,
        });
        setMessage("Recap approved and published to the member.");
      } else if (action === "retry") {
        setMessage("Retry Processing was queued.");
      } else if (action === "retranscribeVideo") {
        setMessage("Generate Notes From Video Audio was queued.");
      } else if (action === "regenerateRecapFromTranscript") {
        setMessage("A new recap draft was generated from the saved transcript.");
      } else if (action === "cancelProcessing") {
        setMessage("Processing cancellation was requested.");
      } else if (action === "markIncorrect") {
        setMessage("The generated recap was marked incorrect and remains hidden.");
      } else if (action === "editTranscript") {
        setMessage("Transcript saved.");
      } else {
        setMessage("Draft saved.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The MAI Coach action could not be completed.");
    } finally {
      setSaving("idle");
    }
  }

  async function publishVideoWithoutRecap() {
    if (!window.confirm("Publish this video without approving an AI recap? Any unapproved draft will remain hidden from the member.")) return;
    setSaving("saving");
    try {
      const updated = await finalizeVideoRecord(video.id, {
        ...videoPatchPayload(stripVideoObjectUrl(video)),
        publicationStatus: "Published",
        notifyMember: false,
      });
      onPublished(updated);
      setMessage("Video published without a recap. Unapproved AI drafts remain hidden.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The video could not be published without a recap.");
    } finally {
      setSaving("idle");
    }
  }

  const jobStatus = state?.job?.status ?? "Not queued";
  const hasDraft = Boolean(state?.draft);
  const draftStatus = state?.draft?.status ?? "";
  const draftLocked = draftStatus === "published";
  const canPublish = hasDraft && (draftStatus === "ready_for_review" || draftStatus === "needs_coach_input");
  const evidence = state?.draft?.transcriptEvidence ?? [];
  const noUsableAudio = jobStatus === "no_usable_audio";
  const jobUpdatedAt = state?.job?.updatedAt ? new Date(state.job.updatedAt).getTime() : Number.NaN;
  const isStaleProcessing = isProcessingActive && Number.isFinite(jobUpdatedAt) && Date.now() - jobUpdatedAt > 15 * 60 * 1000;
  const canRetryProcessing = (!isProcessingActive || isStaleProcessing) && (jobStatus === "failed" || noUsableAudio || !state?.job || isStaleProcessing);
  const statusLabel = videoRecapProcessingStatusText(draftStatus === "published" ? "published" : jobStatus);

  return (
    <div className="video-modal-overlay">
      <section className="video-upload-modal ai-recap-modal">
        <div className="video-modal-header">
          <div>
            <p className="eyebrow">MAI Coach voiceover</p>
            <h2>Review lesson recap</h2>
          </div>
          <button aria-label="Close AI recap review" className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="ai-recap-review-layout">
          <div className="ai-recap-video-column">
            <video className="video-player" controls playsInline preload="metadata" src={video.objectUrl} />
            <dl className="coach-review-list">
              <div><dt>Video</dt><dd>{video.title}<small>{video.fileName}</small></dd></div>
              <div><dt>Member</dt><dd>{video.memberName ?? "Member"}<small>{video.memberEmail ?? "No email"}</small></dd></div>
              <div><dt>Coach</dt><dd>{video.coachName ?? video.uploadedBy}<small>{video.lessonDate ? formatFullDate(video.lessonDate) : formatVideoUploadDate(video.uploadedAt)}</small></dd></div>
              <div><dt>Audio status</dt><dd>{statusLabel}<small>{videoRecapProcessingStepText(state?.job?.currentStep)}</small></dd></div>
            </dl>
            {state?.job?.errorMessage && <p className="coach-inline-warning">{state.job.errorMessage}</p>}
            {noUsableAudio && (
              <div className="coach-inline-warning">
                No clear coach voiceover was detected. You can add a short lesson recap manually, or publish the video without a recap.
              </div>
            )}
          </div>

          <div className="ai-recap-editor-column">
            <section className="ai-recap-status-card">
              <div>
                <span>{hasDraft ? "AI Draft" : "Audio processing"}</span>
                <strong>{statusLabel}</strong>
                <p>{hasDraft ? "Generated from your video voiceover. Review before publishing." : "MAI Coach is listening to your coaching feedback and organizing the lesson recap."}</p>
              </div>
            </section>
            <details className="approved-transcript ai-transcript-disclosure">
              <summary>View Video Transcript</summary>
              <textarea disabled={draftLocked} onChange={(event) => setTranscriptText(event.target.value)} placeholder="Transcript will appear here after processing." value={transcriptText} />
            </details>
            <div className="coach-notes-grid">
              <label><span>Lesson summary</span><textarea disabled={draftLocked} onChange={(event) => updateField("lessonSummary", event.target.value)} value={fields.lessonSummary} /></label>
              <label><span>Main focus</span><textarea disabled={draftLocked} onChange={(event) => updateField("mainFocus", event.target.value)} value={fields.mainFocus} /></label>
              <label><span>Progress observed</span><textarea disabled={draftLocked} onChange={(event) => updateField("progressObserved", event.target.value)} value={fields.progressObserved} /></label>
              <label><span>Practice next</span><textarea disabled={draftLocked} onChange={(event) => updateField("practiceNext", event.target.value)} value={fields.practiceNext} /></label>
              <label><span>Next session goal</span><textarea disabled={draftLocked} onChange={(event) => updateField("nextSessionGoal", event.target.value)} value={fields.nextSessionGoal} /></label>
            </div>
            <div className="ai-recap-supporting-data">
              <span>{state?.draft?.metricsMentioned?.length ?? 0} metrics mentioned</span>
              <span>{state?.draft?.transcriptEvidence?.length ?? 0} transcript references</span>
            </div>
            {evidence.length > 0 && (
              <ul className="ai-evidence-list">
                {evidence.slice(0, 4).map((item, index) => (
                  <li key={`${item.field}-${index}`}>
                    <strong>{item.field}</strong>
                    <span>{item.excerpt}</span>
                    {item.timestamp ? <small>{item.timestamp}</small> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="video-modal-actions">
          <span>{message}</span>
          <div className="button-row">
            <button className="secondary-action" disabled={saving === "saving" || draftLocked} onClick={() => setMessage("The recap fields are editable. Save the draft before leaving.")} type="button">Edit Recap</button>
            <button className="secondary-action" disabled={saving === "saving" || !hasDraft || draftLocked} onClick={() => void submit("saveDraft")} type="button">Save Draft</button>
            <button className="secondary-action" disabled={saving === "saving"} onClick={() => void refreshNow()} type="button">Refresh</button>
            <button className="secondary-action" disabled={saving === "saving" || !hasDraft || draftLocked} onClick={() => void submit("editTranscript")} type="button">Save Transcript</button>
            {canRetryProcessing && <button className="secondary-action" disabled={saving === "saving"} onClick={() => void submit("retry")} type="button">Retry Processing</button>}
            <button className="secondary-action" disabled={saving === "saving" || isProcessingActive} onClick={() => void submit("retranscribeVideo")} type="button">Regenerate From Video Audio</button>
            <button className="secondary-action" disabled={saving === "saving"} onClick={() => void publishVideoWithoutRecap()} type="button">Publish Video Without Recap</button>
            {isProcessingActive && <button className="text-button danger-text-button" disabled={saving === "saving"} onClick={() => void submit("cancelProcessing")} type="button">Cancel Processing</button>}
            <button className="text-button danger-text-button" disabled={saving === "saving" || !hasDraft || draftLocked} onClick={() => void submit("markIncorrect")} type="button">Mark Incorrect</button>
            <button className="secondary-action" onClick={onClose} type="button">Back</button>
            <button className="primary-action" disabled={saving === "saving" || !canPublish} onClick={() => void submit("approveAndPublish")} type="button">
              {saving === "saving" ? "Saving..." : "Approve & Publish to Member"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ApprovedTranscriptDisclosure({ videoId }: { videoId: string }) {
  const [state, setState] = useState<VideoRecapState | null>(null);

  useEffect(() => {
    let cancelled = false;
    readVideoRecap(videoId)
      .then((payload) => {
        if (!cancelled) setState(payload);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (!state?.draft || state.draft.status !== "published" || !state.transcript?.text) return null;

  return (
    <details className="approved-transcript">
      <summary>Approved lesson transcript</summary>
      <p>{state.transcript.text}</p>
    </details>
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
  const approvedLessonSummary = video.lessonSummary || video.memberFacingNotes || (video.coachNotesPrivate ? "" : video.coachNotes);
  const approvedMainFocus = getLessonMainFocus(video);
  const approvedPracticeNext = getLessonPracticeNext(video);
  const hasApprovedRecap = Boolean(
    approvedLessonSummary ||
    approvedMainFocus ||
    video.improvement ||
    approvedPracticeNext ||
    video.nextSessionGoal,
  );

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
            <PanelHeader kicker={canEditCoachNotes ? "Coach notes" : "Coach-approved lesson recap"} title={canEditCoachNotes ? "Feedback" : "Lesson recap"} meta={canEditCoachNotes ? "Coach workspace" : "Shared with you"} />
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
            ) : hasApprovedRecap ? (
              <div className="structured-video-notes">
                {approvedLessonSummary && <div><span>Lesson summary</span><p>{approvedLessonSummary}</p></div>}
                {approvedMainFocus && <div><span>Main focus</span><p>{approvedMainFocus}</p></div>}
                {video.improvement && <div><span>Progress observed</span><p>{video.improvement}</p></div>}
                {approvedPracticeNext && <div><span>Practice next</span><p>{approvedPracticeNext}</p></div>}
                {video.nextSessionGoal && <div><span>Next session goal</span><p>{video.nextSessionGoal}</p></div>}
              </div>
            ) : (
              <p className="video-note-empty">No coach feedback has been shared yet.</p>
            )}
          </section>

          {approvedPracticeNext && (
            <section className="practice-focus-callout">
              <span>Practice Focus Before Your Next Session</span>
              <strong>{approvedPracticeNext}</strong>
              {video.nextSessionGoal && <small>{video.nextSessionGoal}</small>}
            </section>
          )}

          {viewerRole === "user" && <ApprovedTranscriptDisclosure videoId={video.id} />}

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
  const [assignedCoaches, setAssignedCoaches] = useState<CoachSummary[]>([]);
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
  const [showFilters, setShowFilters] = useState(false);
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
    Promise.all([
      readVideoLibrary(viewerRole === "user" ? undefined : ownerId),
      viewerRole === "user" ? readMyCoaches() : Promise.resolve([] as CoachSummary[]),
    ])
      .then(([records, coaches]) => {
        if (cancelled) return;
        const items = records.map((record) => createVideoLibraryItem(record));
        setVideos(items);
        setAssignedCoaches(coaches);
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
          video.nextSessionGoal,
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
  const activeFilterCount = [
    uploaderFilter !== "all",
    typeFilter !== "all",
    clubFilter !== "all",
    sessionFilter !== "all",
    reviewFilter !== "all",
    dateFilter !== "all",
    sortOrder !== "newest",
  ].filter(Boolean).length;
  const comparisonVideos = comparisonIds
    .map((videoId) => videos.find((video) => video.id === videoId))
    .filter((video): video is VideoLibraryItem => Boolean(video));
  const timelineGroups = filteredVideos.reduce<Record<string, VideoLibraryItem[]>>((groups, video) => {
    const uploadDate = parseDisplayDate(video.uploadedAt);
    const key = uploadDate
      ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(uploadDate)
      : "Date unavailable";
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
    if (!window.confirm(`Delete "${video.title}"? This permanently removes the video, transcript, recap, and stored media.`)) return;
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

  function clearVideoFilters() {
    setUploaderFilter("all");
    setTypeFilter("all");
    setClubFilter("all");
    setSessionFilter("all");
    setReviewFilter("all");
    setDateFilter("all");
    setSortOrder("newest");
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
    if (!videoFile) {
      setLibraryMessage("Choose a video.");
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
      const resolvedTitle = uploadTitle.trim() || videoDateTitleFromFile(videoFile);
      const created = await createVideoRecord({
        memberId: ownerId,
        title: resolvedTitle,
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
        title: resolvedTitle,
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

      {viewerRole === "user" && assignedCoaches.length > 0 && (
        <section className="assigned-coach-strip member-facing">
          {assignedCoaches.map((coach) => (
            <article key={coach.id}>
              <CoachAvatar coach={coach} />
              <span>
                <strong>{coach.name}</strong>
                <small>{coach.title || "Coach"}</small>
              </span>
            </article>
          ))}
        </section>
      )}

      <section className="video-filter-band">
        <label className="video-search-control">
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, notes, tags, or coach comments" type="search" />
        </label>
        <div className="video-filter-actions">
          <button className="secondary-action" onClick={() => setShowFilters((current) => !current)} type="button">
            {showFilters ? `Hide filters${activeFilterCount ? ` (${activeFilterCount})` : ""}` : `Filters${activeFilterCount ? ` (${activeFilterCount})` : ""}`}
          </button>
          {activeFilterCount > 0 && <button className="text-button" onClick={clearVideoFilters} type="button">Clear Filters</button>}
        </div>
        {showFilters && (
          <div className="video-filter-panel">
            <label><span>Uploaded by</span><select value={uploaderFilter} onChange={(event) => setUploaderFilter(event.target.value)}><option value="all">Anyone</option><option>User</option><option>Coach</option><option>Admin</option></select></label>
            <label><span>Video type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All types</option>{VIDEO_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>Club</span><select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)}><option value="all">All clubs</option>{clubOptions.map((club) => <option key={club} value={club}>{getClubDisplayName(club)}</option>)}</select></label>
            <label><span>Session</span><select value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)}><option value="all">Any linkage</option><option value="attached">Session attached</option><option value="none">No session</option></select></label>
            <label><span>Review</span><select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}><option value="all">Any status</option><option value="reviewed">Reviewed</option><option value="unreviewed">Not reviewed</option></select></label>
            <label><span>Date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}><option value="all">Any date</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select></label>
            <label><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
          </div>
        )}
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
                  if (file && !uploadTitle) setUploadTitle(videoDateTitleFromFile(file));
                }}
                required
                type="file"
              />
              <span aria-hidden="true">▶</span>
              <strong>{videoFile ? videoFile.name : "Choose a video file"}</strong>
              <small>MP4, MOV, WebM, or M4V · up to 500 MB</small>
            </label>

            <div className="video-form-grid">
              <label className="video-form-wide"><span>Title</span><input maxLength={120} onChange={(event) => setUploadTitle(event.target.value)} placeholder={videoFile ? videoDateTitleFromFile(videoFile) : "Jul 19, 2026"} value={uploadTitle} /></label>
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

const MANUAL_SHOT_FIELDS: Array<{ key: NumericShotMetric; label: string; unit: string; placeholder: string }> = [
  { key: "carry", label: "Carry", unit: "yd", placeholder: "93" },
  { key: "total", label: "Total", unit: "yd", placeholder: "100" },
  { key: "ballSpeed", label: "Ball speed", unit: "mph", placeholder: "77" },
  { key: "clubSpeed", label: "Club speed", unit: "mph", placeholder: "68" },
  { key: "smash", label: "Smash factor", unit: "", placeholder: "1.13" },
  { key: "launch", label: "Launch angle", unit: "deg", placeholder: "31.7" },
  { key: "spin", label: "Spin rate", unit: "rpm", placeholder: "6626" },
  { key: "offline", label: "Offline", unit: "yd", placeholder: "5.5" },
  { key: "apex", label: "Apex", unit: "ft", placeholder: "68" },
  { key: "descent", label: "Descent angle", unit: "deg", placeholder: "39.8" },
  { key: "faceAngle", label: "Face angle", unit: "deg", placeholder: "1.2" },
  { key: "clubPath", label: "Club path", unit: "deg", placeholder: "-1.0" },
  { key: "faceToPath", label: "Face to path", unit: "deg", placeholder: "2.2" },
];

const PHOTO_REVIEW_DISTANCE_FIELDS: Array<{ key: NumericShotMetric; label: string }> = [
  { key: "proximity", label: "Proximity" },
  { key: "carry", label: "Carry" },
  { key: "total", label: "Total" },
  { key: "ballSpeed", label: "Ball speed" },
  { key: "clubSpeed", label: "Club speed" },
  { key: "smash", label: "Smash" },
  { key: "apex", label: "Apex" },
  { key: "spin", label: "Spin" },
  { key: "spinAxis", label: "Spin axis" },
];

const PHOTO_REVIEW_DELIVERY_FIELDS: Array<{ key: NumericShotMetric; label: string }> = [
  { key: "launch", label: "Launch" },
  { key: "descent", label: "Descent" },
  { key: "horizontalAngle", label: "Horiz." },
  { key: "attackAngle", label: "Attack" },
  { key: "faceAngle", label: "Face" },
  { key: "clubPath", label: "Path" },
  { key: "faceToPath", label: "Face-path" },
  { key: "sideCarry", label: "Side carry" },
  { key: "sideTotal", label: "Side total" },
  { key: "swingPlane", label: "Plane" },
];

const PHOTO_UPLOAD_REQUEST_BUDGET_BYTES = 900 * 1024;
const PHOTO_UPLOAD_MAX_DIMENSION = 1800;
const PHOTO_UPLOAD_MIN_DIMENSION = 900;
const PHOTO_UPLOAD_JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66];

async function imageBitmapFromFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Photo could not be prepared for upload."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function preparePhotoForPrivateImport(file: File, targetBytes: number) {
  if (file.size <= targetBytes) {
    return { file, originalSize: file.size, uploadSize: file.size, wasResized: false };
  }
  const source = await imageBitmapFromFile(file);
  const width = source.width;
  const height = source.height;
  const originalMaxDimension = Math.max(width, height);
  const candidateDimensions = Array.from(new Set([
    Math.min(PHOTO_UPLOAD_MAX_DIMENSION, originalMaxDimension),
    1600,
    1400,
    1200,
    1050,
    PHOTO_UPLOAD_MIN_DIMENSION,
  ]))
    .filter((dimension) => dimension > 0 && dimension <= originalMaxDimension)
    .sort((left, right) => right - left);
  let bestBlob: Blob | null = null;

  for (const maxDimension of candidateDimensions) {
    const scale = Math.min(1, maxDimension / originalMaxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) continue;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    for (const quality of PHOTO_UPLOAD_JPEG_QUALITY_STEPS) {
      const blob = await canvasBlob(canvas, "image/jpeg", quality);
      if (!blob || blob.size >= file.size) continue;
      bestBlob = !bestBlob || blob.size < bestBlob.size ? blob : bestBlob;
      if (blob.size <= targetBytes) {
        if ("close" in source && typeof source.close === "function") source.close();
        const uploadName = file.name.replace(/\.[^.]+$/, "") || "session-photo";
        const uploadFile = new File([blob], `${uploadName}.jpg`, {
          lastModified: file.lastModified,
          type: "image/jpeg",
        });
        return { file: uploadFile, originalSize: file.size, uploadSize: uploadFile.size, wasResized: true };
      }
    }
  }
  if ("close" in source && typeof source.close === "function") source.close();

  const blob = bestBlob;
  if (!blob || blob.size >= file.size) return { file, originalSize: file.size, uploadSize: file.size, wasResized: false };
  const uploadName = file.name.replace(/\.[^.]+$/, "") || "session-photo";
  const uploadFile = new File([blob], `${uploadName}.jpg`, {
    lastModified: file.lastModified,
    type: "image/jpeg",
  });
  return { file: uploadFile, originalSize: file.size, uploadSize: uploadFile.size, wasResized: true };
}

function fileStemForPreview(fileName: string) {
  return fileName.toLowerCase().replace(/\.[^.]+$/, "");
}

function previewUrlForFileName(previewUrls: Map<string, string>, fileName: string) {
  const directMatch = previewUrls.get(fileName);
  if (directMatch) return directMatch;
  const targetStem = fileStemForPreview(fileName);
  return Array.from(previewUrls.entries()).find(([originalName]) => fileStemForPreview(originalName) === targetStem)?.[1];
}

function metricSourceBadge(shot: Shot, metric: NumericShotMetric) {
  const source = shot.metricSources?.[metric];
  if (!source || source.kind === "measured") return null;
  const labels = {
    derived: "Calc",
    estimated: "Est.",
    manual: "Edited",
  } as const;
  const label = labels[source.kind as keyof typeof labels];
  if (!label) return null;
  const confidence = Number.isFinite(source.confidence) ? ` Confidence: ${Math.round(source.confidence * 100)}%.` : "";
  return {
    className: `metric-source-badge ${source.kind}`,
    label,
    title: `${source.method ?? "Metric source recorded."}${confidence}`,
  };
}

function metricLabelList(metrics: NumericShotMetric[] | undefined) {
  return metrics?.length ? metrics.map((metric) => PHOTO_METRIC_LABELS[metric] ?? metric).join(", ") : "None";
}

function metricSourcesForKind(shots: Shot[], kind: MetricSource["kind"]) {
  const metrics = new Set<NumericShotMetric>();
  shots.forEach((shot) => {
    Object.entries(shot.metricSources ?? {}).forEach(([metric, source]) => {
      if (source.kind === kind) metrics.add(metric as NumericShotMetric);
    });
  });
  return REVIEW_IMPORT_METRICS.filter((metric) => metrics.has(metric));
}

function metricSourceCounts(shots: Shot[]) {
  return shots.reduce<Record<MetricSource["kind"], number>>(
    (counts, shot) => {
      Object.values(shot.metricSources ?? {}).forEach((source) => {
        counts[source.kind] += 1;
      });
      return counts;
    },
    { measured: 0, derived: 0, estimated: 0, manual: 0 },
  );
}

function sourceCountLabel(counts: PhotoImportMetadata["sourceCounts"], kind: keyof NonNullable<PhotoImportMetadata["sourceCounts"]>) {
  const count = counts?.[kind] ?? 0;
  return count.toLocaleString();
}

function ImportView({
  cancelImportReview,
  confirmImportReview,
  csvText,
  importCsv,
  importManualShot,
  importPhotoShots,
  importMessage,
  lastImport,
  pendingImportReview,
  setCsvText,
  updateImportReview,
}: {
  cancelImportReview: () => void;
  confirmImportReview: () => void;
  csvText: string;
  importCsv: (submissionType?: LastImport["submissionType"], notes?: string, sourceFileName?: string) => void;
  importManualShot: (shot: Shot, metadata: PhotoImportMetadata, notes: string) => void;
  importPhotoShots: (shots: Shot[], simulator: string, metadata: PhotoImportMetadata, notes: string) => void;
  importMessage: string;
  lastImport: LastImport;
  pendingImportReview: ImportReview | null;
  setCsvText: (value: string) => void;
  updateImportReview: (updater: (review: ImportReview) => ImportReview) => void;
}) {
  const [importMode, setImportMode] = useState<"api" | "file" | "photo" | "manual">("api");
  const [importNotes, setImportNotes] = useState("");
  const [photoBatchImport, setPhotoBatchImport] = useState<PhotoBatchImportResult | null>(null);
  const [photoScans, setPhotoScans] = useState<PhotoScanResult[]>([]);
  const [photoScanState, setPhotoScanState] = useState<"idle" | "scanning" | "ready" | "error">("idle");
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoStatus, setPhotoStatus] = useState("Choose up to five launch monitor screenshots or result photos.");
  const [csvFileName, setCsvFileName] = useState("Sample rows");
  const [csvFileStatus, setCsvFileStatus] = useState("Choose a CSV file or paste exported rows.");
  const [manualStatus, setManualStatus] = useState("Enter at least one metric. Missing fields will display as NA.");
  const [manualForm, setManualForm] = useState<Record<string, string>>({
    date: getTodayDateString(),
    location: "",
    club: "SW",
    carry: "",
    total: "",
    ballSpeed: "",
    clubSpeed: "",
    smash: "",
    launch: "",
    spin: "",
    offline: "",
    apex: "",
    descent: "",
    faceAngle: "",
    clubPath: "",
    faceToPath: "",
  });

  useEffect(() => () => {
    photoScans.forEach((result) => {
      if (result.previewUrl) URL.revokeObjectURL(result.previewUrl);
    });
  }, [photoScans]);

  function updateManualField(key: string, value: string) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  function manualNumber(key: string) {
    const value = manualForm[key]?.trim();
    if (!value) return Number.NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function submitManualSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const shot: Shot = {
      id: `manual-shot-${Date.now()}`,
      club: manualForm.club || "SW",
      carry: manualNumber("carry"),
      total: manualNumber("total"),
      ballSpeed: manualNumber("ballSpeed"),
      clubSpeed: manualNumber("clubSpeed"),
      smash: manualNumber("smash"),
      launch: manualNumber("launch"),
      spin: manualNumber("spin"),
      offline: manualNumber("offline"),
      shape: "Not recorded",
      apex: manualNumber("apex"),
      descent: manualNumber("descent"),
      faceAngle: manualNumber("faceAngle"),
      clubPath: manualNumber("clubPath"),
      faceToPath: manualNumber("faceToPath"),
    };
    const detectedMetrics = MANUAL_SHOT_FIELDS
      .map((field) => field.key)
      .filter((metric) => typeof shot[metric] === "number" && Number.isFinite(shot[metric] as number));

    if (!detectedMetrics.length) {
      setManualStatus("Add at least one swing number before analyzing the manual session.");
      return;
    }

    if (Number.isFinite(shot.offline)) {
      shot.shape = shot.offline < -8 ? "Draw" : shot.offline > 8 ? "Fade" : "Straight";
    }
    shot.detectedMetrics = detectedMetrics;
    setManualStatus(`${getClubDisplayName(shot.club)} entry is ready for review.`);
    importManualShot(shot, {
      capturedAt: manualForm.date || getTodayDateString(),
      location: manualForm.location.trim() || LOCATION_UNAVAILABLE,
    }, importNotes);
  }

  function reviewInputValue(shot: Shot, metric: NumericShotMetric) {
    const value = getShotMetric(shot, metric);
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }

  function updateReviewShotMetric(shotId: string, metric: NumericShotMetric, value: string) {
    updateImportReview((review) => ({
      ...review,
      shots: review.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        const next = { ...shot };
        const metricSources = { ...(next.metricSources ?? {}) };
        const detected = new Set(next.detectedMetrics ?? []);
        const trimmed = value.trim();
        if (!trimmed) {
          delete (next as Partial<Shot>)[metric];
          delete metricSources[metric];
          detected.delete(metric);
        } else {
          const parsed = parseDirectionalNumber(trimmed);
          if (parsed !== undefined) {
            (next[metric] as number) = metric === "spin" ? Math.round(parsed) : parsed;
            metricSources[metric] = {
              kind: "manual",
              confidence: 1,
              method: "Edited during import review.",
            };
            detected.add(metric);
          }
        }
        if (metric === "sideTotal" || metric === "sideCarry") {
          if (hasShotMetric(next, "sideTotal")) {
            next.offline = next.sideTotal as number;
            metricSources.offline = {
              kind: "derived",
              confidence: 0.96,
              method: "Copied from Side Total for dashboard dispersion.",
              inputMetrics: ["sideTotal"],
            };
            detected.add("offline");
          } else if (hasShotMetric(next, "sideCarry")) {
            next.offline = next.sideCarry as number;
            metricSources.offline = {
              kind: "derived",
              confidence: 0.92,
              method: "Copied from Side Carry for dashboard dispersion.",
              inputMetrics: ["sideCarry"],
            };
            detected.add("offline");
          } else {
            delete (next as Partial<Shot>).offline;
            delete metricSources.offline;
            detected.delete("offline");
          }
        }
        next.detectedMetrics = Array.from(detected) as NumericShotMetric[];
        next.metricSources = metricSources;
        return next;
      }),
    }));
  }

  function copyReviewCsv(csv: string) {
    void navigator.clipboard?.writeText(csv);
    setCsvFileStatus("Normalized CSV copied.");
  }

  function downloadReviewCsv(csv: string) {
    downloadCsvFile(csv, "mai-coach-normalized-session.csv");
    setCsvFileStatus("Normalized CSV downloaded.");
  }

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
    const selectedFiles = files.slice(0, 8);
    if (!selectedFiles.length) return;

    const previewUrls = new Map(selectedFiles.map((file) => [file.name, URL.createObjectURL(file)]));
    const supportedFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/") && file.size <= 18 * 1024 * 1024,
    );
    const rejectedFiles: PhotoScanResult[] = selectedFiles
      .filter((file) => !supportedFiles.includes(file))
      .map((file, index) => ({
        id: `rejected-${Date.now()}-${index}`,
        fileName: file.name,
        previewUrl: previewUrlForFileName(previewUrls, file.name),
        status: "error",
        message: "Use PNG, JPG, JPEG, WebP, PDF, or CSV files under the listed size limit.",
      }));
    const fallbackResults = (message: string): PhotoScanResult[] => supportedFiles.map((file, index) => ({
      id: `photo-fallback-${Date.now()}-${index}`,
      fileName: file.name,
      previewUrl: previewUrlForFileName(previewUrls, file.name),
      status: "error",
      message,
    }));

    if (!supportedFiles.length) {
      setPhotoScans(rejectedFiles);
	    setPhotoScanState("error");
	    setPhotoStatus("No supported images were selected.");
	    return;
	  }

    setPhotoBatchImport(null);
    setPhotoScans([]);
    setPhotoScanState("scanning");
    setPhotoProgress(0);
    setPhotoStatus(`Preparing ${supportedFiles.length} ${supportedFiles.length === 1 ? "image" : "images"} for the private session reader...`);

    try {
      const metadataList = await Promise.all(supportedFiles.map(readPhotoMetadata));
      const combinedMetadata = metadataList.reduce<PhotoImportMetadata>(
        (combined, metadata, index) => ({
          fileNames: [...(combined.fileNames ?? []), supportedFiles[index].name],
          location: combined.location ?? metadata.location,
          capturedAt: combined.capturedAt ?? metadata.capturedAt,
          latitude: combined.latitude ?? metadata.latitude,
          longitude: combined.longitude ?? metadata.longitude,
        }),
        {},
      );
      setPhotoProgress(12);
      const perPhotoTargetBytes = Math.max(
        120 * 1024,
        Math.floor((PHOTO_UPLOAD_REQUEST_BUDGET_BYTES - 16 * 1024) / supportedFiles.length),
      );
      const preparedFiles = await Promise.all(
        supportedFiles.map((file) => preparePhotoForPrivateImport(file, perPhotoTargetBytes)),
      );
      const resizedCount = preparedFiles.filter((photo) => photo.wasResized).length;
      const uploadBytes = preparedFiles.reduce((sum, photo) => sum + photo.uploadSize, 0);
      if (uploadBytes > PHOTO_UPLOAD_REQUEST_BUDGET_BYTES) {
        setPhotoScanState("error");
        const message = "These photos are still too large after optimization. Try fewer pages, crop closer to the table, or use the CSV/manual fallback.";
        setPhotoStatus(message);
        setPhotoScans([...rejectedFiles, ...fallbackResults(message)]);
        setCsvFileName("Photo fallback CSV");
        setCsvFileStatus("Photo upload did not reach extraction. Paste corrected CSV rows or switch to manual entry.");
        return;
      }
      const formData = new FormData();
      preparedFiles.forEach((photo) => {
        formData.append("images", photo.file, photo.file.name);
      });
      formData.append("notes", importNotes);
      formData.append("sessionDate", combinedMetadata.capturedAt ?? getTodayDateString());
      setPhotoProgress(30);
      setPhotoStatus(
        resizedCount
          ? `Uploading optimized photos (${resizedCount} resized, ${Math.round(uploadBytes / 1024)} KB) and classifying Full Swing pages...`
          : "Uploading photos and classifying Full Swing pages...",
      );
      const response = await fetch("/api/import/photos", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const responseText = await response.text();
      let payload: PhotoBatchImportResult & { error?: string };
      try {
        payload = JSON.parse(responseText) as PhotoBatchImportResult & { error?: string };
      } catch {
        throw new Error(responseText || "The private photo reader could not read the upload response.");
      }
      const readableShotCount = Array.isArray(payload.shots) ? payload.shots.length : 0;
      const normalizedCsv = payload.csvText || generateNormalizedPhotoImportCsv({
        sessionId: payload.jobId || `photo-import-${Date.now()}`,
        sessionDate: combinedMetadata.capturedAt ?? getTodayDateString(),
        simulator: payload.simulator || "Simulator photos",
        club: payload.clubDisplay ?? payload.club ?? "Unknown Club",
        shots: [],
        notes: importNotes,
      });
      const fallbackMessage =
        payload.error ||
        payload.warnings?.[0] ||
        (response.ok ? "No readable shot data was found." : "The private photo reader could not complete this batch.");

      const importedMetadata: PhotoImportMetadata = {
        ...combinedMetadata,
        averageValidation: payload.averages,
        blockingIssues: payload.blockingIssues,
        csvSchemaVersion: payload.csvSchemaVersion ?? PHOTO_IMPORT_CSV_SCHEMA_VERSION,
        duplicateShotNumbers: payload.duplicateShotNumbers,
        normalizedCsv,
        pageCounts: payload.pageCounts,
        photoImportJobId: payload.jobId,
        photoImportSummary: payload.summary,
        sourcePaths: payload.sourcePaths,
      };
      const pageResults: PhotoScanResult[] = readableShotCount && payload.pages.length
        ? payload.pages.map((page, index) => {
          const pageShotNumbers = new Set(page.visibleShotNumbers.map(String));
          const pageShots = payload.shots.filter((shot) => shot.sourceShotNumber && pageShotNumbers.has(shot.sourceShotNumber));
          return {
            id: `scan-${payload.jobId}-${index}`,
            fileName: page.fileName,
            previewUrl: previewUrlForFileName(previewUrls, page.fileName),
            status: "ready",
            simulator: payload.simulator,
            shot: pageShots[0] ?? payload.shots[0],
            shots: pageShots.length ? pageShots : payload.shots,
            csvText: normalizedCsv,
            confidence: Math.round((page.confidence ?? 0.8) * 100),
            metadata: importedMetadata,
            pageType: page.pageType,
            warnings: page.warnings,
          };
        })
        : [];

      const results: PhotoScanResult[] = [
        ...rejectedFiles,
        ...pageResults,
        ...(readableShotCount ? [] : fallbackResults(fallbackMessage)),
      ];
      setPhotoBatchImport({
        ...payload,
        csvText: normalizedCsv,
        csvSchemaVersion: payload.csvSchemaVersion ?? PHOTO_IMPORT_CSV_SCHEMA_VERSION,
      });
      setCsvText(normalizedCsv);
      setCsvFileName("Normalized photo CSV");
      setCsvFileStatus(
        readableShotCount
          ? `${normalizedCsvDataRowCount(normalizedCsv)} photo rows are ready in normalized CSV format.`
          : "Photo reader produced no rows. Paste corrected CSV rows here or use manual entry; missing values stay blank.",
      );
      setPhotoScans(results);
      setPhotoProgress(100);
      setPhotoScanState(readableShotCount ? "ready" : "error");
      setPhotoStatus(
        readableShotCount
          ? `${payload.summary?.simulator ?? payload.simulator} ${payload.summary?.club ?? payload.clubDisplay ?? "session"}: ${payload.shots.length} unique shots ready for review. CSV ready.`
          : "We could not confidently read this screen. You can paste or upload a CSV instead, or enter the session manually.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The private photo reader could not complete this batch.";
      setPhotoScanState("error");
      setPhotoStatus(`${message} You can continue with CSV or manual entry.`);
      setPhotoScans([...rejectedFiles, ...fallbackResults(message)]);
      setCsvFileName("Photo fallback CSV");
      setCsvFileStatus("Photo reader could not produce rows. Paste corrected CSV rows or use manual entry.");
      return;
    }
  }

  const readyPhotoScans = photoScans.filter(
    (result): result is Extract<PhotoScanResult, { status: "ready" }> => result.status === "ready",
  );
  const mergedPhotoShots = photoBatchImport?.shots ?? mergePhotoShotsByShotNumber(readyPhotoScans.flatMap((result) => result.shots));
  const detectedSimulators = [...new Set(readyPhotoScans.map((result) => result.simulator))];
  const photoSimulator = photoBatchImport?.simulator ?? (detectedSimulators.length === 1 ? detectedSimulators[0] : "Simulator photos");
  const photoMetadata = photoBatchImport
    ? readyPhotoScans[0]?.metadata ?? {}
    : readyPhotoScans.reduce<PhotoImportMetadata>(
    (combined, result) => ({
      fileNames: [...(combined.fileNames ?? []), result.fileName],
      location: combined.location ?? result.metadata.location,
      capturedAt: combined.capturedAt ?? result.metadata.capturedAt,
      latitude: combined.latitude ?? result.metadata.latitude,
      longitude: combined.longitude ?? result.metadata.longitude,
    }),
    {},
  );
  const reviewClubNames = pendingImportReview
    ? Array.from(new Set(pendingImportReview.shots.map((shot) => getClubDisplayName(shot.club))))
    : [];
  const reviewClubValue = reviewClubNames.length === 1 ? reviewClubNames[0] : reviewClubNames.join(", ");
  const reviewCsvText = pendingImportReview?.csvText ?? pendingImportReview?.metadata.normalizedCsv ?? "";
  const reviewMetadata = pendingImportReview?.metadata;

  return (
    <section className="import-grid">
      <div className="panel panel-large">
        <PanelHeader kicker="Import" title="Add simulator data" meta={importMessage} />
        <label className="import-notes-field">
          <span>Anything we should know about this session?</span>
          <textarea
            maxLength={220}
            onChange={(event) => setImportNotes(event.target.value)}
            placeholder="Example: I used a 7 wood, these were half swings, or I was working on a fade."
            value={importNotes}
          />
          <small>Notes help identify session context like club, intent, or shot type. Missing numbers still stay NA.</small>
        </label>

        {pendingImportReview && (
          <div className="import-review-card" role="status">
            <div className="import-review-heading">
              <div>
                <p className="eyebrow">Review before save</p>
                <h3>{pendingImportReview.shots.length} detected {pendingImportReview.shots.length === 1 ? "shot" : "shots"}</h3>
                <span>{pendingImportReview.simulator} · {pendingImportReview.submissionType} · {pendingImportReview.location}</span>
              </div>
              <span className="scan-status ready">Ready</span>
            </div>

            {pendingImportReview.summary && (
              <div className="photo-import-summary-grid">
                <div><span>Simulator</span><strong>{pendingImportReview.summary.simulator}</strong></div>
                <div><span>Club</span><strong>{pendingImportReview.summary.club}</strong></div>
                <div><span>Images</span><strong>{pendingImportReview.summary.imageCount}</strong></div>
                <div><span>Distance pages</span><strong>{pendingImportReview.summary.distancePageCount}</strong></div>
                <div><span>Delivery pages</span><strong>{pendingImportReview.summary.deliveryPageCount}</strong></div>
                <div><span>Unique shots</span><strong>{pendingImportReview.summary.uniqueShotCount}</strong></div>
                <div><span>Overlap merged</span><strong>{pendingImportReview.summary.overlappingShotsDeduplicated.join(", ") || "None"}</strong></div>
                <div><span>CSV</span><strong>{normalizedCsvDataRowCount(reviewCsvText)} rows ready</strong></div>
              </div>
            )}

            {reviewMetadata && (
              <div className="photo-import-summary-grid import-evidence-summary">
                <div><span>Detected session</span><strong>{reviewMetadata.sessionId ?? pendingImportReview.id}</strong></div>
                <div><span>Rows</span><strong>{reviewMetadata.rowsDetected ?? pendingImportReview.shots.length}</strong></div>
                <div><span>Clubs</span><strong>{reviewMetadata.clubCount ?? reviewClubNames.length}</strong></div>
                <div><span>Source file</span><strong>{reviewMetadata.sourceFileName ?? "NA"}</strong></div>
                <div><span>Measured</span><strong>{sourceCountLabel(reviewMetadata.sourceCounts, "measured")}</strong></div>
                <div><span>Calculated</span><strong>{sourceCountLabel(reviewMetadata.sourceCounts, "derived")}</strong></div>
                <div><span>Estimated</span><strong>{sourceCountLabel(reviewMetadata.sourceCounts, "estimated")}</strong></div>
                <div><span>Manual</span><strong>{sourceCountLabel(reviewMetadata.sourceCounts, "manual")}</strong></div>
              </div>
            )}

            {reviewMetadata && (
              <details className="mapping-review-panel" open>
                <summary>Column mapping review</summary>
                <div className="mapping-review-summary">
                  <div>
                    <strong>Clubs detected</strong>
                    <span>{(reviewMetadata.clubs ?? reviewClubNames).map(getClubDisplayName).join(", ") || "NA"}</span>
                  </div>
                  <div>
                    <strong>Measured fields</strong>
                    <span>{metricLabelList(reviewMetadata.measuredMetrics)}</span>
                  </div>
                  <div>
                    <strong>Calculated fields</strong>
                    <span>{metricLabelList(reviewMetadata.derivedMetrics)}</span>
                  </div>
                  <div>
                    <strong>Estimated fields</strong>
                    <span>{metricLabelList(reviewMetadata.estimatedMetrics)}</span>
                  </div>
                  <div>
                    <strong>Missing fields</strong>
                    <span>{metricLabelList(reviewMetadata.missingMetrics ?? pendingImportReview.missingMetrics)}</span>
                  </div>
                  <div>
                    <strong>Unit conversions</strong>
                    <span>
                      {reviewMetadata.unitConversions?.length
                        ? reviewMetadata.unitConversions.map((conversion) => `${conversion.sourceColumn}: ${conversion.sourceUnit} → ${conversion.targetUnit}`).join(", ")
                        : "None"}
                    </span>
                  </div>
                </div>
                <div className="mapping-review-table" role="table" aria-label="Column mapping review">
                  <div className="mapping-review-row header" role="row">
                    <span>Source column</span>
                    <span>Maps to</span>
                    <span>Unit</span>
                  </div>
                  {(reviewMetadata.mappedColumns ?? []).map((mapping) => (
                    <div className="mapping-review-row" key={`${mapping.sourceColumn}-${mapping.mapsTo}`} role="row">
                      <code>{mapping.sourceColumn}</code>
                      <select
                        aria-label={`Mapping for ${mapping.sourceColumn}`}
                        value={mapping.mapsTo}
                        onChange={(event) => {
                          const nextOverrides = {
                            ...(reviewMetadata.columnOverrides ?? {}),
                            [mapping.sourceColumn]: event.target.value,
                          };
                          const parsed = parseCsvForImport(csvText, reviewMetadata.sourceFileName ?? csvFileName, nextOverrides);
                          updateImportReview((review) => ({
                            ...review,
                            metadata: parsed.metadata,
                            shots: parsed.shots,
                            simulator: parsed.metadata.simulator ?? review.simulator,
                          }));
                        }}
                      >
                        {COLUMN_MAPPING_TARGETS.map((target) => (
                          <option key={target.value} value={target.value}>{target.label}</option>
                        ))}
                      </select>
                      <span>{mapping.sourceUnit && mapping.targetUnit ? `${mapping.sourceUnit} → ${mapping.targetUnit}` : "NA"}</span>
                    </div>
                  ))}
                  {(reviewMetadata.unmappedColumns ?? []).map((sourceColumn) => (
                    <div className="mapping-review-row unmapped" key={sourceColumn} role="row">
                      <code>{sourceColumn}</code>
                      <select
                        aria-label={`Mapping for ${sourceColumn}`}
                        value={reviewMetadata.columnOverrides?.[sourceColumn] ?? "ignore"}
                        onChange={(event) => {
                          const nextOverrides = {
                            ...(reviewMetadata.columnOverrides ?? {}),
                            [sourceColumn]: event.target.value,
                          };
                          const parsed = parseCsvForImport(csvText, reviewMetadata.sourceFileName ?? csvFileName, nextOverrides);
                          updateImportReview((review) => ({
                            ...review,
                            metadata: parsed.metadata,
                            shots: parsed.shots,
                            simulator: parsed.metadata.simulator ?? review.simulator,
                          }));
                        }}
                      >
                        {COLUMN_MAPPING_TARGETS.map((target) => (
                          <option key={target.value} value={target.value}>{target.label}</option>
                        ))}
                      </select>
                      <span>Unmapped</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="import-review-grid">
              <label>
                <span>Detected club</span>
                <input
                  onChange={(event) => {
                    const nextClub = normalizeClubName(event.target.value);
                    updateImportReview((review) => ({
                      ...review,
                      inferredClub: nextClub,
                      shots: review.shots.map((shot) => ({ ...shot, club: nextClub })),
                    }));
                  }}
                  placeholder="Sand Wedge"
                  value={reviewClubValue}
                />
              </label>
              <label>
                <span>Session notes</span>
                <textarea
                  onChange={(event) => {
                    const value = event.target.value;
                    setImportNotes(value);
                    updateImportReview((review) => ({ ...review, notes: value }));
                  }}
                  value={pendingImportReview.notes}
                />
              </label>
            </div>

            <div className="import-review-metrics">
              <div>
                <strong>Detected metrics</strong>
                <span>{pendingImportReview.detectedMetrics.map((metric) => PHOTO_METRIC_LABELS[metric] ?? metric).join(", ") || "NA"}</span>
              </div>
              <div>
                <strong>Unavailable metrics</strong>
                <span>{pendingImportReview.missingMetrics.map((metric) => PHOTO_METRIC_LABELS[metric] ?? metric).join(", ") || "None"}</span>
              </div>
            </div>

            {(pendingImportReview.blockingIssues?.length ?? 0) > 0 && (
              <ul className="import-review-warnings blocking">
                {pendingImportReview.blockingIssues?.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            {pendingImportReview.warnings.length > 0 && (
              <ul className="import-review-warnings">
                {pendingImportReview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <div className="import-review-table-wide" role="table" aria-label="Merged photo shot review">
              <div className="import-review-table-header" role="row">
                <span>Shot</span>
                <span>Club</span>
                <span className="review-column-group">Distance</span>
                <span className="review-column-group">Delivery</span>
              </div>
              {pendingImportReview.shots.map((shot, index) => (
                <div className="import-review-shot-row" key={shot.id} role="row">
                  <strong>{shot.sourceShotNumber ? `#${shot.sourceShotNumber}` : `#${index + 1}`}</strong>
                  <span>{getClubDisplayName(shot.club)}</span>
                  <div className="photo-review-metric-group">
                    {PHOTO_REVIEW_DISTANCE_FIELDS.map((field) => (
                      <label key={field.key}>
                        <span>
                          {field.label}
                          {(() => {
                            const badge = metricSourceBadge(shot, field.key);
                            return badge ? <em className={badge.className} title={badge.title}>{badge.label}</em> : null;
                          })()}
                        </span>
                        <input
                          inputMode="decimal"
                          onChange={(event) => updateReviewShotMetric(shot.id, field.key, event.target.value)}
                          placeholder="NA"
                          value={reviewInputValue(shot, field.key)}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="photo-review-metric-group">
                    {PHOTO_REVIEW_DELIVERY_FIELDS.map((field) => (
                      <label key={field.key}>
                        <span>
                          {field.label}
                          {(() => {
                            const badge = metricSourceBadge(shot, field.key);
                            return badge ? <em className={badge.className} title={badge.title}>{badge.label}</em> : null;
                          })()}
                        </span>
                        <input
                          inputMode="decimal"
                          onChange={(event) => updateReviewShotMetric(shot.id, field.key, event.target.value)}
                          placeholder="NA"
                          value={reviewInputValue(shot, field.key)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {reviewCsvText && (
              <details className="normalized-csv-preview">
                <summary>Preview CSV</summary>
                <textarea readOnly value={reviewCsvText} />
                <div className="button-row">
                  <button className="secondary-action" onClick={() => copyReviewCsv(reviewCsvText)} type="button">Copy CSV</button>
                  <button className="secondary-action" onClick={() => downloadReviewCsv(reviewCsvText)} type="button">Download CSV</button>
                </div>
              </details>
            )}

            <div className="button-row">
              <button className="secondary-action" onClick={cancelImportReview} type="button">Cancel review</button>
              <button
                className="primary-action"
                disabled={(pendingImportReview.blockingIssues?.length ?? 0) > 0}
                onClick={confirmImportReview}
                type="button"
              >
                <span>✓</span>
                Save session
              </button>
            </div>
          </div>
        )}

        <div className="import-mode-grid import-primary-paths">
          <button
            className={cls("import-mode", importMode === "api" && "active")}
            onClick={() => setImportMode("api")}
            type="button"
          >
            <strong>Connect your launch monitor</strong>
            <span>Automatically sync sessions from a supported launch monitor or data provider.</span>
            <em>Connect API</em>
          </button>
          <button
            className={cls("import-mode", importMode !== "api" && "active")}
            onClick={() => setImportMode("file")}
            type="button"
          >
            <strong>Let’s see your shots</strong>
            <span>Upload a CSV or photos of your launch-monitor data. MAI Coach will map the numbers, organize the session, and let you review everything before saving.</span>
            <em>Upload CSV or Photos</em>
          </button>
        </div>

        {importMode === "api" && (
          <div className="import-panel">
            <div className="connection-grid coming-soon-grid">
              {SIMULATOR_SOURCES.map((source) => (
                <button className={cls("source-tile", source.tone === "dark" && "dark-logo")} disabled key={source.label} type="button">
                  <span className="source-logo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`${source.label} logo`} src={source.logo} />
                  </span>
                  <strong>{source.label}</strong>
                  <small>Coming soon</small>
                </button>
              ))}
            </div>
            <p className="muted-copy">API connections are not active yet. Use Upload CSV or Photos for today’s imports.</p>
          </div>
        )}

        {(importMode === "file" || importMode === "photo") && (
          <div className="import-panel">
            <div className="manual-entry-guide">
              <strong>Upload CSV</strong>
              <span>CSV files can come from Full Swing, TrackMan, Foresight, FlightScope, SkyTrak, Uneekor, Garmin, Rapsodo, or similar launch monitors.</span>
            </div>
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
              <button className="primary-action" onClick={() => importCsv("CSV / Excel", importNotes, csvFileName)}>
                <span>⇧</span>
                Analyze rows
              </button>
            </div>
            <p className="muted-copy">
              Accepted format: CSV under 5 MB. Include at least club plus one shot metric such as carry, total,
              ball speed, launch, spin, offline, club path, or face angle. PNG/JPG/PDF result exports can be added in Session photos.
            </p>
            <div className="manual-entry-guide import-subsection-guide">
              <strong>Upload photos</strong>
              <span>Use clear launch-monitor screenshots or result photos. Multiple pages are merged into one review when shot numbers overlap.</span>
            </div>
		            <input
		              className="file-input"
	              type="file"
	              accept="image/*"
	              capture="environment"
	              multiple
	              disabled={photoScanState === "scanning"}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void scanPhotoFiles(files);
              }}
            />
            <div className="photo-drop">
              <strong>{photoScanState === "scanning" ? "Reading your data" : "Session photo reader"}</strong>
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
                        <span>{result.status === "ready" ? `${result.simulator} · ${result.shots.length} CSV ${result.shots.length === 1 ? "row" : "rows"} · OCR confidence ${result.confidence}%` : "Needs another photo"}</span>
                      </div>
                      <span className={cls("scan-status", result.status)}>{result.status === "ready" ? "Converted" : "Unreadable"}</span>
                    </div>

                    {result.previewUrl && (
                      <img
                        alt={`Preview of ${result.fileName}`}
                        className="photo-scan-preview"
                        src={result.previewUrl}
                      />
                    )}

                    {result.status === "ready" ? (
                      <>
                        <div className="photo-metric-list">
                          <div><span>Club</span><strong>{result.shot.club}</strong></div>
                          <div><span>Rows</span><strong>{result.shots.length}</strong></div>
                          {Array.from(new Set(result.shots.flatMap((shot) => shot.detectedMetrics ?? []))).slice(0, 8).map((metric) => (
                            <div key={metric}>
                              <span>{PHOTO_METRIC_LABELS[metric]}</span>
                              <strong>{formatPhotoMetric(metric, result.shot[metric])}</strong>
                            </div>
                          ))}
                        </div>
                        <p className="scan-note">
                          Converted to CSV-style rows. Missing dashboard fields will display as NA.
                        </p>
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

            {photoScanState === "error" && readyPhotoScans.length === 0 && (
              <div className="photo-fallback-panel" role="status">
                <div>
                  <strong>Keep going with CSV or manual entry</strong>
                  <span>
                    The uploaded images were saved or checked, but MAI Coach could not recover enough shot rows.
                    Paste simulator CSV rows, upload a corrected CSV, or enter the session manually.
                  </span>
                </div>
                <div className="button-row">
                  <button
                    className="secondary-action"
                    onClick={() => {
                      setImportMode("file");
                      setCsvFileName("Photo fallback CSV");
                      setCsvFileStatus("Paste or upload corrected simulator rows, then analyze them before saving.");
                    }}
                    type="button"
                  >
                    Use CSV fallback
                  </button>
                  <button
                    className="secondary-action"
                    onClick={() => {
                      setImportMode("manual");
                      setManualStatus("Enter the visible metrics from your photos. Blank values will stay NA.");
                    }}
                    type="button"
                  >
                    Enter manually
                  </button>
                </div>
              </div>
            )}

            {readyPhotoScans.length > 0 && (
              <div className="button-row">
                <button
                  className="secondary-action"
	                  onClick={() => {
	                    setPhotoBatchImport(null);
	                    setPhotoScans([]);
	                    setPhotoScanState("idle");
	                    setPhotoProgress(0);
                    setPhotoStatus("Choose up to five launch monitor screenshots or result photos.");
                  }}
                >
                  Clear
                </button>
                <button
	                  className="primary-action"
	                  disabled={!mergedPhotoShots.length}
	                  onClick={() => importPhotoShots(mergedPhotoShots, photoSimulator, photoMetadata, importNotes)}
	                >
	                  <span>⇧</span>
	                  Review normalized CSV
	                </button>
              </div>
            )}
          </div>
        )}
        {importMode === "manual" && (
          <form className="import-panel manual-entry-panel" onSubmit={submitManualSession}>
            <div className="manual-entry-guide">
              <strong>Manual first-session entry</strong>
              <span>
                Enter the numbers you have from any launch monitor, simulator export, or coach notes.
                Blank metrics stay private to this session and display as NA.
              </span>
            </div>
            <div className="manual-form-grid">
              <label>
                <span>Date</span>
                <input
                  onChange={(event) => updateManualField("date", event.target.value)}
                  type="date"
                  value={manualForm.date}
                />
              </label>
              <label>
                <span>Club</span>
                <select value={manualForm.club} onChange={(event) => updateManualField("club", event.target.value)}>
                  {CLUB_ORDER.map((club) => (
                    <option key={club} value={club}>
                      {getClubDisplayName(club)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="manual-form-wide">
                <span>Location</span>
                <input
                  onChange={(event) => updateManualField("location", event.target.value)}
                  placeholder="Back Nine Woodstock"
                  value={manualForm.location}
                />
              </label>
              {MANUAL_SHOT_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => updateManualField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    value={manualForm[field.key]}
                  />
                  {field.unit && <small>{field.unit}</small>}
                </label>
              ))}
            </div>
            <div className="csv-file-status manual-status" role="status">
              <strong>Manual entry</strong>
              <span>{manualStatus}</span>
            </div>
            <div className="button-row">
              <button className="primary-action" type="submit">
                <span>⇧</span>
                Analyze manual session
              </button>
            </div>
          </form>
        )}
      </div>

      <LastImportPanel lastImport={lastImport} />
    </section>
  );
}

function LastImportPanel({ lastImport }: { lastImport: LastImport }) {
  const importedClubs = Array.from(new Set(lastImport.shots.map((shot) => getClubDisplayName(shot.club))));
  const headerTitle =
    lastImport.location && lastImport.location !== LOCATION_UNAVAILABLE
      ? lastImport.location
      : lastImport.shots.length
        ? `${lastImport.simulator} import`
        : LOCATION_UNAVAILABLE;
  const detailRows = [
    ["Date", formatFullDate(lastImport.date)],
    ["Location", lastImport.location],
    ["Sim", lastImport.simulator],
    ["Submission type", lastImport.submissionType],
    ["Club", importedClubs.join(", ") || "NA"],
    ["Notes", lastImport.notes || "NA"],
    [
      "Unavailable",
      lastImport.missingMetrics?.length
        ? lastImport.missingMetrics.map((metric) => PHOTO_METRIC_LABELS[metric] ?? metric).join(", ")
        : "None",
    ],
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
      <PanelHeader kicker="Last import" title={headerTitle} meta={`${lastImport.simulator} · ${lastImport.shots.length} shots`} />
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

const GAUGE_CENTER = { x: 120, y: 116 };
const GAUGE_RADIUS = 88;
const GAUGE_START_ANGLE = 160;
const GAUGE_END_ANGLE = 380;
const GAUGE_ARC_PATH = describeGaugeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, GAUGE_START_ANGLE, GAUGE_END_ANGLE);

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeGaugeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function gaugePercent(value: number, min: number, max: number) {
  if (max === min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function gaugeAngle(value: number, min: number, max: number) {
  const progress = gaugePercent(value, min, max) / 100;
  return GAUGE_START_ANGLE + (GAUGE_END_ANGLE - GAUGE_START_ANGLE) * progress;
}

function formatGaugeValue(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "NA";
  return decimals === 0 ? Math.round(value).toString() : value.toFixed(decimals);
}

function formatGaugeRange(range: [number, number], decimals: number, unit: string) {
  const low = formatGaugeValue(range[0], decimals);
  const high = formatGaugeValue(range[1], decimals);
  return `${low}-${high}${unit ? ` ${unit}` : ""}`;
}

function getGaugeStatus(metric: SwingGaugeMetric) {
  const value = metric.value;
  const [targetLow, targetHigh] = metric.targetRange;
  const [warningLow, warningHigh] = metric.warningRange;
  if (value >= targetLow && value <= targetHigh) return { label: "Ideal", tone: "green" as const };
  if (value >= warningLow && value <= warningHigh) return { label: "Caution", tone: "amber" as const };
  return { label: "Redline", tone: "red" as const };
}

function SwingGaugeCluster({
  avgDispersion,
  metrics,
  performanceIndex,
  selectedClubLabel,
  shotCount,
}: {
  avgDispersion: number;
  metrics: SwingGaugeMetric[];
  performanceIndex: number;
  selectedClubLabel: string;
  shotCount: number;
}) {
  return (
    <section className="swing-gauge-cluster" aria-labelledby="swing-gauge-title">
      <header className="swing-gauge-header">
        <div>
          <p className="eyebrow">Performance cluster</p>
          <h2 id="swing-gauge-title">{selectedClubLabel} telemetry</h2>
          <span>
            {shotCount} shots · index {Number.isFinite(performanceIndex) ? Math.round(performanceIndex) : "NA"}/100 · dispersion{" "}
            {Number.isFinite(avgDispersion) ? `±${avgDispersion} yd` : "NA"}
          </span>
        </div>
        <div className="swing-gauge-legend" aria-label="Gauge color legend">
          <span><i className="legend-green" />Ideal</span>
          <span><i className="legend-amber" />Caution</span>
          <span><i className="legend-red" />Redline</span>
        </div>
      </header>

      <div className="swing-gauge-grid">
        {metrics.map((metric) => (
          <SwingStatGauge key={metric.id} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function SwingStatGauge({ metric }: { metric: SwingGaugeMetric }) {
  const status = getGaugeStatus(metric);
  const needleAngle = gaugeAngle(metric.value, metric.min, metric.max);
  const ticks = Array.from({ length: 15 }, (_, index) => {
    const angle = GAUGE_START_ANGLE + ((GAUGE_END_ANGLE - GAUGE_START_ANGLE) / 14) * index;
    const outer = polarPoint(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 1, angle);
    const inner = polarPoint(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS - (index % 2 === 0 ? 11 : 7), angle);
    return { inner, outer, major: index % 2 === 0 };
  });
  const centerAngle = typeof metric.centerMarker === "number" ? gaugeAngle(metric.centerMarker, metric.min, metric.max) : undefined;
  const centerOuter = typeof centerAngle === "number" ? polarPoint(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS + 8, centerAngle) : undefined;
  const centerInner = typeof centerAngle === "number" ? polarPoint(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS - 17, centerAngle) : undefined;

  return (
    <article className={cls("swing-gauge-card", metric.priority === "hero" && "hero", status.tone)} tabIndex={0}>
      <div className="swing-gauge-topline">
        <span>{metric.label}</span>
        <em className={cls("gauge-source", metric.source.toLowerCase())}>{metric.source}</em>
      </div>

      <svg
        aria-label={`${metric.label}: ${formatGaugeValue(metric.value, metric.decimals)} ${metric.unit}`}
        className="swing-gauge-svg"
        role="img"
        viewBox="0 0 240 162"
      >
        <defs>
          <filter id={`gauge-glow-${metric.id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path className="gauge-track" d={GAUGE_ARC_PATH} pathLength={100} />
        {metric.bands.map((band) => {
          const start = gaugePercent(band.from, metric.min, metric.max);
          const end = gaugePercent(band.to, metric.min, metric.max);
          const length = Math.max(0, end - start);
          return (
            <path
              key={`${metric.id}-${band.label}-${band.from}`}
              className={cls("gauge-band", band.tone, band.redline && "redline")}
              d={GAUGE_ARC_PATH}
              pathLength={100}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-start}
            />
          );
        })}
        {ticks.map((tick, index) => (
          <line
            key={`${metric.id}-tick-${index}`}
            className={cls("gauge-tick", tick.major && "major")}
            x1={tick.inner.x}
            x2={tick.outer.x}
            y1={tick.inner.y}
            y2={tick.outer.y}
          />
        ))}
        {centerInner && centerOuter && (
          <line className="gauge-center-marker" x1={centerInner.x} x2={centerOuter.x} y1={centerInner.y} y2={centerOuter.y} />
        )}
        <g
          className="gauge-needle"
          style={{
            transform: `rotate(${needleAngle - 270}deg)`,
            transformOrigin: `${GAUGE_CENTER.x}px ${GAUGE_CENTER.y}px`,
          }}
        >
          <line x1={GAUGE_CENTER.x} x2={GAUGE_CENTER.x} y1={GAUGE_CENTER.y + 9} y2={GAUGE_CENTER.y - 66} />
        </g>
        <circle className="gauge-hub-outer" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="11" />
        <circle className="gauge-hub-inner" cx={GAUGE_CENTER.x} cy={GAUGE_CENTER.y} r="4" />
      </svg>

      <div className="gauge-readout">
        <strong>
          {formatGaugeValue(metric.value, metric.decimals)}
          {metric.unit && <small>{metric.unit}</small>}
        </strong>
        <span className={cls("gauge-status", status.tone)}>{status.label}</span>
      </div>

      <div className="gauge-scale">
        <span>{formatGaugeValue(metric.min, metric.decimals)}</span>
        <span>{formatGaugeValue(metric.max, metric.decimals)}</span>
      </div>

      <div className="swing-gauge-tooltip" role="tooltip">
        <strong>{metric.label}</strong>
        <span>Ideal: {formatGaugeRange(metric.targetRange, metric.decimals, metric.unit)}</span>
        <span>Watch: {formatGaugeRange(metric.warningRange, metric.decimals, metric.unit)}</span>
        <p>{metric.detail}</p>
      </div>
    </article>
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
    accountRole: profile.role,
    displayName: profile.displayName,
    email: profile.email,
    facilityName: profile.facilityName,
    coachBio: profile.coachBio,
    specialties: profile.specialties,
    location: profile.location,
    profilePhotoName: profile.profilePhotoName,
    firstGolferName: profile.firstGolferName,
    firstGolferEmail: profile.firstGolferEmail,
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
  onSkip,
}: {
  initialProfile: UserPracticeProfile | null;
  onRegister: (profile: UserPracticeProfile, draft?: RegistrationDraft) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() =>
    initialProfile ? answersFromPracticeProfile(initialProfile) : {},
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [coachHeadshotFile, setCoachHeadshotFile] = useState<File | null>(null);
  const [coachHeadshotPreview, setCoachHeadshotPreview] = useState("");
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

  useEffect(() => {
    if (!coachHeadshotFile) {
      setCoachHeadshotPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(coachHeadshotFile);
    setCoachHeadshotPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coachHeadshotFile]);

  const role = (typeof answers.accountRole === "string" ? answers.accountRole : "golfer") as OnboardingRole;
  const displayName = typeof answers.displayName === "string" ? answers.displayName : "";
  const email = typeof answers.email === "string" ? answers.email : "";
  const selectedGoals = asArray(answers.goals);
  const canSubmit = displayName.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8 && password === confirmPassword;
  const progress = step === 0 ? 50 : 100;
  const golferGoals = ["Lower scores", "Driver accuracy", "Wedge control", "More distance", "Better contact", "Practice structure"];

  function updateValue(key: OnboardingQuestionId, value: string | string[]) {
    const nextAnswers = { ...answers };
    if (Array.isArray(value) ? value.length : value.trim()) {
      nextAnswers[key] = value;
    } else {
      delete nextAnswers[key];
    }
    setAnswers(nextAnswers);
    storeOnboardingAnswers(nextAnswers);
  }

  function toggleGoal(goal: string) {
    const selected = selectedGoals.includes(goal);
    const nextGoals = selected
      ? selectedGoals.filter((item) => item !== goal)
      : selectedGoals.length < 3 ? [...selectedGoals, goal] : selectedGoals;
    updateValue("goals", nextGoals);
  }

  function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const profileAnswers: OnboardingAnswers = {
      ...answers,
      accountRole: role,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      goals: role === "golfer" ? selectedGoals : asArray(answers.specialties),
      handicap: typeof answers.handicap === "string" ? answers.handicap : "I don't know",
      handedness: typeof answers.handedness === "string" ? answers.handedness : "Right-handed",
      simExperience: "Ready to upload",
      simulatorGoals: role === "coach" ? ["Lesson follow-up", "Player accountability"] : ["Swing data", "Practice plan"],
      timeAvailable: "45 minutes",
      frequency: "Weekly",
      experienceStyle: role === "coach" ? ["Coach-guided sessions"] : ["Data-driven training"],
    };
    const profile = buildUserPracticeProfile(profileAnswers);
    const registrationName = splitDisplayNameForRegistration(displayName);
    onRegister(profile, {
      accountType: role === "coach" ? "coach" : "player",
      confirmPassword,
      email: email.trim().toLowerCase(),
      firstName: registrationName.firstName,
      headshotFile: role === "coach" ? coachHeadshotFile : null,
      lastName: registrationName.lastName,
      password,
    });
  }

  return (
    <main className="onboarding-shell">
      <section className={cls("onboarding-card", step === 1 && "compact")}>
        <header className="onboarding-brand">
          <MaiCoachLogoFull className="onboarding-logo-full" />
          <div>
            <span>Your swing, explained.</span>
            <strong>Personalized practice setup</strong>
          </div>
        </header>

        <div className="onboarding-progress" aria-label="Onboarding progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        {step === 0 ? (
          <>
            <div className="onboarding-question">
              <span>Step 1 of 2</span>
              <h1>How will you use MAI Coach?</h1>
              <p>Choose the workspace that fits you. You can still connect with a coach or player later.</p>
            </div>

            <div className="onboarding-options cards role-cards">
              {[
                { value: "golfer", label: "I’m a golfer", detail: "Upload sessions, watch lessons, and get personalized practice." },
                { value: "coach", label: "I’m a coach", detail: "Manage players, upload lesson videos, and assign practice." },
              ].map((option) => (
                <button
                  className={cls("onboarding-option", role === option.value && "selected")}
                  key={option.value}
                  onClick={() => updateValue("accountRole", option.value)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form className="onboarding-setup-form" onSubmit={submitSetup}>
            <div className="onboarding-question">
              <span>Step 2 of 2</span>
              <h1>{role === "coach" ? "Set up your coach workspace." : "Set up your golfer profile."}</h1>
              <p>{role === "coach" ? "Add the basics Zac or any coach needs before inviting players." : "Add the essentials so analysis, practice plans, and coach notes match you."}</p>
            </div>

            <div className="onboarding-form-grid">
              <label className="onboarding-form-wide">
                <span>{role === "coach" ? "Coach name" : "Name"}</span>
                <input value={displayName} onChange={(event) => updateValue("displayName", event.target.value)} placeholder={role === "coach" ? "Zac Coach" : "Joe Derario"} required />
              </label>
              <label>
                <span>Email</span>
                <input value={email} onChange={(event) => updateValue("email", event.target.value)} placeholder="you@example.com" required type="email" />
              </label>
              <label>
                <span>Password</span>
                <input autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" />
              </label>
              <label>
                <span>Confirm password</span>
                <input autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Re-enter password" required type="password" />
              </label>
              {role === "coach" && (
                <label>
                  <span>Profile photo</span>
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      setCoachHeadshotFile(file);
                      updateValue("profilePhotoName", file?.name ?? "");
                    }}
                    type="file"
                  />
                  {coachHeadshotPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Coach headshot preview" className="coach-headshot-preview" src={coachHeadshotPreview} />
                  )}
                </label>
              )}

              {role === "golfer" ? (
                <>
                  <label>
                    <span>Handedness</span>
                    <select value={typeof answers.handedness === "string" ? answers.handedness : "Right-handed"} onChange={(event) => updateValue("handedness", event.target.value)}>
                      <option>Right-handed</option>
                      <option>Left-handed</option>
                    </select>
                  </label>
                  <label>
                    <span>Handicap / skill</span>
                    <select value={typeof answers.handicap === "string" ? answers.handicap : "I don't know"} onChange={(event) => updateValue("handicap", event.target.value)}>
                      {["I don't know", "25+", "16-24", "10-15", "5-9", "0-4", "Plus handicap"].map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <div className="onboarding-form-wide onboarding-goal-picker">
                    <span>Goals, pick up to 3</span>
                    <div>
                      {golferGoals.map((goal) => (
                        <button className={cls(selectedGoals.includes(goal) && "selected")} key={goal} onClick={() => toggleGoal(goal)} type="button">
                          {goal}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    <span>Facility / business</span>
                    <input value={typeof answers.facilityName === "string" ? answers.facilityName : ""} onChange={(event) => updateValue("facilityName", event.target.value)} placeholder="Back Nine Woodstock" />
                  </label>
                  <label>
                    <span>Location</span>
                    <input value={typeof answers.location === "string" ? answers.location : ""} onChange={(event) => updateValue("location", event.target.value)} placeholder="Woodstock, GA" />
                  </label>
                  <label className="onboarding-form-wide">
                    <span>Specialties</span>
                    <input value={typeof answers.specialties === "string" ? answers.specialties : ""} onChange={(event) => updateValue("specialties", event.target.value)} placeholder="Wedges, juniors, driver accuracy" />
                  </label>
                  <label className="onboarding-form-wide">
                    <span>Coach bio</span>
                    <textarea value={typeof answers.coachBio === "string" ? answers.coachBio : ""} onChange={(event) => updateValue("coachBio", event.target.value)} placeholder="Short intro players will see." />
                  </label>
                </>
              )}
            </div>

            {!canSubmit && (
              <p className="onboarding-selection-note">Add your name, a valid email, and matching passwords with at least 8 characters.</p>
            )}

            <div className="onboarding-actions">
              <button className="text-button" onClick={onSkip} type="button">
                Skip to account options
              </button>
              <button className="secondary-action" onClick={() => setStep(0)} type="button">
                Back
              </button>
              <button className="primary-action" disabled={!canSubmit} type="submit">
                {role === "coach" ? "Create Coach Account" : "Create Account"}
              </button>
            </div>
          </form>
        )}

        {step === 0 && (
          <div className="onboarding-actions">
            <button className="text-button" onClick={onSkip} type="button">
              Skip to account options
            </button>
            <button className="primary-action" onClick={() => setStep(1)} type="button">
              Continue
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function LoginRequestModal({
  initialMode,
  onAuthenticated,
  onClose,
  onStatus,
  registrationDraft,
}: {
  initialMode: LoginModalMode;
  onAuthenticated: () => boolean | Promise<boolean>;
  onClose: () => void;
  onStatus: (message: string) => void;
  registrationDraft?: RegistrationDraft | null;
}) {
  const [mode, setMode] = useState<LoginModalMode>(initialMode);
  const [email, setEmail] = useState(registrationDraft?.email ?? "");
  const [firstName, setFirstName] = useState(registrationDraft?.firstName ?? "");
  const [lastName, setLastName] = useState(registrationDraft?.lastName ?? "");
  const [password, setPassword] = useState(registrationDraft?.password ?? "");
  const [confirmPassword, setConfirmPassword] = useState(registrationDraft?.confirmPassword ?? "");
  const [accountType, setAccountType] = useState<RegisterAccountType>(registrationDraft?.accountType ?? "player");
  const [coachHeadshotFile, setCoachHeadshotFile] = useState<File | null>(registrationDraft?.headshotFile ?? null);
  const [coachHeadshotPreview, setCoachHeadshotPreview] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "link" | "reset">("idle");
  const [message, setMessage] = useState(
    initialMode === "register"
      ? "Create your account with an email and password."
      : "Enter your email and password to open your account.",
  );
  const [debugLoginUrl, setDebugLoginUrl] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!coachHeadshotFile) {
      setCoachHeadshotPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(coachHeadshotFile);
    setCoachHeadshotPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coachHeadshotFile]);

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

  function reportMessage(nextMessage: string, options: { focus?: boolean } = {}) {
    setMessage(nextMessage);
    onStatus(nextMessage);
    if (options.focus) {
      requestAnimationFrame(() => messageRef.current?.focus());
    }
  }

  async function submitPasswordAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle") return;
    setState("sending");
    setDebugLoginUrl("");
    if (mode === "register" && password !== confirmPassword) {
      reportMessage("Passwords must match.", { focus: true });
      setState("idle");
      return;
    }
    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/password", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
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
      if (!response.ok) {
        const nextMessage = payload.publicMessage ?? payload.error ?? "That request could not be completed.";
        reportMessage(nextMessage, { focus: true });
        if (payload.debugLoginUrl) setDebugLoginUrl(payload.debugLoginUrl);
        if (payload.needsRegistration) setMode("register");
        return;
      }
      const nextMessage = mode === "register"
        ? "Account created. Confirming your session..."
        : "Password accepted. Confirming your session...";
      reportMessage(nextMessage);
      if (payload.debugLoginUrl) setDebugLoginUrl(payload.debugLoginUrl);
      if (payload.needsRegistration) setMode("register");
      if (payload.user) {
        if (mode === "register" && accountType === "coach" && coachHeadshotFile) {
          try {
            await uploadCoachPhoto(payload.user.id, coachHeadshotFile);
          } catch (error) {
            const photoMessage = error instanceof Error ? error.message : "Coach photo upload can be retried later.";
            onStatus(`Account created. ${photoMessage}`);
          }
        }
        const authenticated = await onAuthenticated();
        if (!authenticated) {
          reportMessage("Your password was accepted, but this browser session could not be confirmed. Please try again.", { focus: true });
          return;
        }
        reportMessage(mode === "register" ? "Account created and signed in." : "Signed in.");
      }
    } catch {
      const nextMessage = mode === "register" ? "The account could not be created right now." : "The account could not be opened right now.";
      reportMessage(nextMessage, { focus: true });
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
        cache: "no-store",
        credentials: "same-origin",
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
        cache: "no-store",
        credentials: "same-origin",
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
            <MaiCoachLogoFull className="auth-modal-logo" />
            <p className="eyebrow">Your swing, explained.</p>
            <h2>{mode === "register" ? "Create your account" : "Sign in to your account"}</h2>
            <small>My AI Golf Coach</small>
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
                <strong>Golfer</strong>
                <span>Watch lesson videos and track your practice.</span>
              </button>
              <button
                className={accountType === "coach" ? "active" : ""}
                onClick={() => setAccountType("coach")}
                type="button"
              >
                <strong>Coach</strong>
                <span>Upload videos and manage assigned golfers.</span>
              </button>
            </div>
            <div className="video-form-grid">
              <label>
                <span>First name</span>
                <input
                  autoComplete="given-name"
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First name"
                  required
                  type="text"
                  value={firstName}
                />
              </label>
              <label>
                <span>Last name</span>
                <input
                  autoComplete="family-name"
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last name"
                  required
                  type="text"
                  value={lastName}
                />
              </label>
              {accountType === "coach" && (
                <label className="video-form-wide coach-headshot-register">
                  <span>Coach headshot</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setCoachHeadshotFile(event.currentTarget.files?.[0] ?? null)}
                    type="file"
                  />
                  {coachHeadshotPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Coach headshot preview" src={coachHeadshotPreview} />
                  )}
                  <small>Optional. JPG, PNG, or WebP under 5 MB.</small>
                </label>
              )}
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
        <p className="muted-copy" ref={messageRef} role="status" tabIndex={-1}>{message}</p>
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
  force = false,
  mode = force ? "temporary" : "reset",
  onClose,
  onPasswordUpdated,
  onStatus,
}: {
  force?: boolean;
  mode?: PasswordModalMode;
  onClose: () => void;
  onPasswordUpdated?: () => void;
  onStatus: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState(
    mode === "setup"
      ? "Create your password to finish setting up your account."
      : force
      ? "You are signed in with a temporary password. Choose a new password before continuing."
      : "Choose a new password for your MAI Coach account.",
  );
  const eyebrow = mode === "setup" ? "Welcome to MAI Coach" : force ? "Temporary password" : "Password reset";
  const title = mode === "setup" ? "Create your password" : "Set a new password";

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
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; publicMessage?: string };
      const nextMessage = payload.publicMessage ?? payload.error ?? "Your password has been updated.";
      setMessage(nextMessage);
      onStatus(nextMessage);
      if (response.ok) {
        onPasswordUpdated?.();
        onClose();
      }
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
            <MaiCoachLogoMark className="auth-modal-mark" />
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          {!force && (
            <button aria-label="Close password reset dialog" className="icon-button" onClick={onClose} type="button">×</button>
          )}
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
            {!force && <button className="secondary-action" onClick={onClose} type="button">Cancel</button>}
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
  continueAsGuest,
  createAccount,
  syncStatus,
}: {
  connectAccount: () => void | Promise<boolean>;
  continueAsGuest: () => void;
  createAccount: () => void;
  syncStatus: string;
}) {
  return (
    <div className="account-overlay">
      <section className="account-modal">
        <div className="account-brand-header">
          <MaiCoachLogoFull className="account-logo-full" />
          <p className="eyebrow">Your swing, explained.</p>
          <h2>Create your account or continue as guest.</h2>
          <small>My AI Golf Coach</small>
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
          <button className="account-choice" onClick={continueAsGuest}>
            <strong>Continue as guest</strong>
            <span>Explore the demo workspace now. You can sign up later to save private data.</span>
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

const SHOT_MAP_COLORS = ["#96cb39", "#38bdf8", "#facc15", "#ef4444", "#a78bfa", "#2dd4bf", "#fb7185", "#f97316", "#c084fc"];
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
  const measuredCarry = getShotMetric(shot, "carry");
  const carry = typeof measuredCarry === "number" ? measuredCarry : 0;
  const measuredTotal = getShotMetric(shot, "total");
  const total = typeof measuredTotal === "number" ? measuredTotal : carry;
  const measuredLaunchDirection = getShotMetric(shot, "horizontalAngle") ?? getShotMetric(shot, "faceAngle");
  const launchDirection = typeof measuredLaunchDirection === "number" ? measuredLaunchDirection : 0;
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

function averageProfile(profiles: ReturnType<typeof getShotFlightProfile>[]) {
  return {
    carry: average(profiles.map((profile) => profile.carry)),
    total: average(profiles.map((profile) => profile.total)),
    startLineYards: average(profiles.map((profile) => profile.startLineYards)),
    curveYards: average(profiles.map((profile) => profile.curveYards)),
    carrySide: average(profiles.map((profile) => profile.carrySide)),
    totalSide: average(profiles.map((profile) => profile.totalSide)),
    shape: "Average",
  };
}

function ShotMap({
  allClubMode,
  onSelectClub,
  onSelectShot,
  selectedShotId = null,
  shots,
}: {
  allClubMode?: boolean;
  onSelectClub?: (club: string) => void;
  onSelectShot?: (shot: Shot) => void;
  selectedShotId?: string | null;
  shots: Shot[];
}) {
  const carryShots = shots.filter((shot) => hasShotMetric(shot, "carry"));
  if (!carryShots.length) {
    return <EmptyState title="Carry data is NA" body="This session did not include enough distance data to draw a shot pattern." />;
  }

  const clubNames = Array.from(new Set(carryShots.map((shot) => shot.club)));
  const profiles = carryShots.map((shot) => getShotFlightProfile(shot));
  const isAllClubMode = allClubMode ?? clubNames.length > 1;
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
  const clubGroups = clubNames.map((club, clubIndex) => {
    const clubShots = carryShots.filter((shot) => shot.club === club);
    const clubProfiles = clubShots.map((shot) => getShotFlightProfile(shot));
    const averageShot = averageProfile(clubProfiles);
    const sideSpread = standardDeviation(clubProfiles.map((profile) => profile.carrySide));
    const carrySpread = standardDeviation(clubProfiles.map((profile) => profile.carry));
    return {
      averageShot,
      carrySpread,
      club,
      clubIndex,
      clubProfiles,
      clubShots,
      color: SHOT_MAP_COLORS[clubIndex] ?? SHOT_MAP_COLORS[0],
      sideSpread,
    };
  });
  const pathForProfile = (profile: ReturnType<typeof getShotFlightProfile>) => {
    const carryX = xScale(profile.carrySide);
    const carryY = yScale(profile.carry);
    const controlOneX = xScale(profile.startLineYards * 0.34);
    const controlOneY = yScale(profile.carry * 0.34);
    const controlTwoX = xScale(profile.startLineYards * 0.82 + profile.curveYards * 0.3);
    const controlTwoY = yScale(profile.carry * 0.78);
    return `M ${xScale(0)} ${yScale(0)} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${carryX} ${carryY}`;
  };

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
                  stroke={distance === 0 ? "#96cb39" : "rgba(255,255,255,0.09)"}
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

          {isAllClubMode ? (
            <>
              {clubGroups.map((group) => {
                const profile = group.averageShot;
                const carryX = xScale(profile.carrySide);
                const carryY = yScale(profile.carry);
                const ellipseRx = Math.max(16, Math.min(82, (Number.isFinite(group.sideSpread) ? group.sideSpread : 0) / lateralExtent * (plot.right - plot.left)));
                const ellipseRy = Math.max(12, Math.min(68, (Number.isFinite(group.carrySpread) ? group.carrySpread : 0) / maxDistance * (plot.bottom - plot.top)));
                return (
                  <g key={`average-${group.club}`} className="shot-club-cluster" onClick={() => onSelectClub?.(group.club)}>
                    <title>{`${getClubDisplayName(group.club)} average: ${group.clubShots.length} shots, ${profile.carry.toFixed(1)} yd carry`}</title>
                    <ellipse cx={carryX} cy={carryY} fill={group.color} opacity="0.12" rx={ellipseRx} ry={ellipseRy} stroke={group.color} strokeWidth="2" />
                    <path d={pathForProfile(profile)} fill="none" stroke={group.color} strokeLinecap="round" strokeWidth="4.5" opacity="0.9" />
                    <circle cx={carryX} cy={carryY} fill="#07130e" r="8" stroke={group.color} strokeWidth="3" />
                    <text className="shot-club-label" x={carryX + 12} y={carryY - 10}>{getClubDisplayName(group.club)}</text>
                  </g>
                );
              })}
              {clubGroups.flatMap((group) => group.clubShots.map((shot, index) => {
                const profile = group.clubProfiles[index];
                const selected = selectedShotId === shot.id;
                return (
                  <circle
                    aria-label={`${getClubDisplayName(shot.club)} shot ${shot.sourceShotNumber ?? index + 1}`}
                    className={cls("shot-point", selected && "selected")}
                    cx={xScale(profile.carrySide)}
                    cy={yScale(profile.carry)}
                    fill={selected ? "#ffffff" : group.color}
                    key={shot.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectShot?.(shot);
                    }}
                    opacity={selected ? 1 : 0.34}
                    r={selected ? 7 : 4}
                    stroke={group.color}
                    strokeWidth={selected ? 3 : 1}
                  />
                );
              }))}
            </>
          ) : (
            carryShots.map((shot, index) => {
              const profile = profiles[index];
              const clubIndex = clubNames.indexOf(shot.club);
              const color = SHOT_MAP_COLORS[clubIndex] ?? SHOT_MAP_COLORS[0];
              const carryY = yScale(profile.carry);
              const carryX = xScale(profile.carrySide);
              const totalX = xScale(profile.totalSide);
              const totalY = yScale(profile.total);
              const path = pathForProfile(profile);
              const recordedFinish = getRecordedShotFinish(shot);
              const displayedFinish = recordedFinish ?? (hasShotShapeInput(shot) ? profile.totalSide : undefined);
              const selected = selectedShotId === shot.id;

              return (
                <g className={cls("shot-flight", selected && "selected")} key={shot.id} onClick={() => onSelectShot?.(shot)}>
                  <title>
                    {`Shot ${shot.sourceShotNumber ?? index + 1}: ${getClubDisplayName(shot.club)}, ${hasShotShapeInput(shot) ? profile.shape : "shape NA"}, ${profile.carry.toFixed(1)} yd carry, ${formatLateralDistance(displayedFinish)}${recordedFinish === undefined && displayedFinish !== undefined ? " estimated finish" : ""}`}
                  </title>
                  <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth={selected ? "4.5" : "3"} opacity={selected ? "1" : "0.72"} />
                  {profile.total > profile.carry + 0.5 && (
                    <line
                      x1={carryX}
                      x2={totalX}
                      y1={carryY}
                      y2={totalY}
                      stroke={color}
                      strokeDasharray="5 5"
                      strokeLinecap="round"
                      strokeWidth={selected ? "3" : "2"}
                      opacity={selected ? "0.9" : "0.65"}
                    />
                  )}
                  <circle cx={carryX} cy={carryY} fill="#151f29" r={selected ? "9" : "7"} stroke={color} strokeWidth={selected ? "3.5" : "2.5"} />
                  <text className="shot-number" x={carryX} y={carryY + 3} textAnchor="middle">{shot.sourceShotNumber ?? index + 1}</text>
                </g>
              );
            })
          )}

          <circle cx={xScale(0)} cy={yScale(0)} fill="#96cb39" r="5" />
          <text className="tee-label" x={xScale(0) + 10} y={yScale(0) - 10}>Tee</text>
        </svg>
      </div>

      <div className="map-legend">
        {clubNames.map((club, index) => (
          <button className="map-legend-item" key={club} onClick={() => onSelectClub?.(club)} type="button">
            <i style={{ background: SHOT_MAP_COLORS[index] }} />
            {getClubDisplayName(club)}
          </button>
        ))}
        <span><b className="flight-key" />Carry flight</span>
        {!isAllClubMode && <span><b className="roll-key" />Rollout</span>}
        {isAllClubMode && <span>Average lines · low-opacity shot points</span>}
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
                <tr className={selectedShotId === shot.id ? "selected-shot-row" : undefined} key={shot.id} onClick={() => onSelectShot?.(shot)}>
                  <td><span className="shot-index" style={{ background: SHOT_MAP_COLORS[clubIndex] ?? SHOT_MAP_COLORS[0] }}>{shot.sourceShotNumber ?? index + 1}</span></td>
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

function GapLadder({
  clubs,
  extended = false,
  onSelectClub,
}: {
  clubs: ClubSummary[];
  extended?: boolean;
  onSelectClub?: (club: string) => void;
}) {
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
          <div
            className={cls("gap-row", onSelectClub && "clickable")}
            key={club.club}
            onClick={() => onSelectClub?.(club.club)}
            role={onSelectClub ? "button" : undefined}
            tabIndex={onSelectClub ? 0 : undefined}
            onKeyDown={(event) => {
              if (!onSelectClub) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectClub(club.club);
              }
            }}
          >
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
        <path d={path} fill="none" stroke="#96cb39" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {plotted.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="6" fill="#151f29" stroke={Number.isFinite(point.quality) ? "#96cb39" : "#6f7d76"} strokeWidth="3" />
            <text x={point.x} y={height - 10} textAnchor="middle" fill="#a8b3ad" fontSize="12">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="700">
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
