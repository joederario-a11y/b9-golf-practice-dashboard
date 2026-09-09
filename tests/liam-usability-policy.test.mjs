import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cssSource.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

test("videos navigation opens the library while direct lesson links stay supported", () => {
  assert.match(pageSource, /videoLibraryResetKey/);
  assert.match(pageSource, /setRequestedVideoId\(null\)/);
  assert.match(pageSource, /url\.searchParams\.delete\("video"\)/);
  assert.match(pageSource, /routeResetKey/);
  assert.match(pageSource, /setSelectedVideoId\(null\)/);
  assert.match(pageSource, /requestedVideoId/);
});

test("videos sort by published date before lesson or upload dates", () => {
  assert.match(pageSource, /videoLibrarySortTime/);
  assert.match(pageSource, /video\.publishedAt,\s*video\.emailSentAt,\s*video\.lessonDate,\s*video\.uploadedAt/);
});

test("lesson upload keeps optional details collapsed and avoids club-like swing types", () => {
  assert.match(pageSource, /member-upload-details/);
  assert.match(pageSource, /Add Lesson Details/);
  assert.match(pageSource, /Title optional/);
  assert.match(pageSource, /"Full Swing", "Pitch", "Chip", "Putt", "Drill", "Setup\/Rehearsal", "Other"/);

  const swingTypesLine = pageSource.match(/const VIDEO_SWING_TYPES:[^\n]+/)?.[0] ?? "";
  assert.doesNotMatch(swingTypesLine, /Driver|Iron|Wedge|Putting|Chipping|Bunker/);
});

test("lesson transcripts stay private to coach review and are styled for the dark interface", () => {
  assert.doesNotMatch(pageSource, /View Lesson Transcript/);
  assert.doesNotMatch(pageSource, /function ApprovedTranscriptDisclosure/);
  assert.match(pageSource, /View Transcript/);
  assert.match(cssSource, /\.approved-transcript\s*\{[\s\S]*background: linear-gradient/);
  assert.match(cssSource, /\.approved-transcript-body p\s*\{[\s\S]*color: rgba\(255, 255, 255, 0\.88\)/);
  assert.match(cssSource, /\.transcript-quality-warning/);
});

test("unrequested coach audio analysis does not show an extraction progress bar", () => {
  assert.match(pageSource, /const showAudioProgress = audioStatus\.code !== "not_requested"/);
  assert.match(pageSource, /\{showAudioProgress && \(/);
});

test("route and auth source of truth stay aligned for protected screens", () => {
  assert.match(pageSource, /function routeTabFromLocation/);
  assert.match(pageSource, /function isProtectedRouteTab/);
  assert.match(pageSource, /const requestedTab = routeTabFromLocation\(window\.location\)/);
  assert.match(pageSource, /isProtectedRouteTab\(requestedTab\)/);
  assert.match(pageSource, /Sign in with an admin account to continue/);
  assert.match(pageSource, /Sign in to open that private MAI Coach page/);
  assert.match(pageSource, /function replaceActiveRoute/);
  assert.match(pageSource, /window\.history\.replaceState/);
});

test("logout returns to sign-in instead of restoring a stale tab", () => {
  assert.match(pageSource, /replaceActiveRoute\("dashboard"\)/);
  assert.match(pageSource, /setLoginModalMode\("login"\)/);
  assert.match(pageSource, /Signed out\. Sign in or create an account to continue\./);
  assert.doesNotMatch(pageSource, /setActiveTab\("videos"\);\n\s*setShowOnboarding\(false\)/);
});

test("session notes control does not route players into coach workspace", () => {
  assert.match(pageSource, /const \[showSessionNotes, setShowSessionNotes\]/);
  assert.match(pageSource, /aria-label="Session notes"/);
  assert.match(pageSource, /Edit session notes/);
  assert.doesNotMatch(pageSource, /Coach notes<\/button>/);
  assert.doesNotMatch(pageSource, /onClick=\{\(\) => setActiveTab\("coach"\)\} type="button">Coach notes/);
});

test("disabled coach actions explain why they are unavailable", () => {
  assert.match(pageSource, /Select a member before using coach tools/);
  assert.match(pageSource, /Select a member before adding a session/);
  assert.match(pageSource, /Select a member before assigning drills or notes/);
  assert.match(pageSource, /Select a member before uploading a lesson video/);
  assert.match(pageSource, /Sign in as a coach or admin to add members/);
});

test("coach lesson review uses sticky publish and full-width feedback workflow", () => {
  const feedbackSectionRule = cssSource.match(/\.coach-feedback-section\s*\{[^}]+\}/)?.[0] ?? "";

  assert.match(pageSource, /coach-lesson-sticky-header/);
  assert.match(pageSource, /Lesson Video/);
  assert.match(pageSource, /Coach Feedback/);
  assert.match(pageSource, /Preview and Publish/);
  assert.match(pageSource, /`Publish to \$\{memberFirstName\}`/);
  assert.match(pageSource, /Publish lesson to \$\{memberFirstName\}\?/);
  assert.match(pageSource, /coach-feedback-section/);
  assert.match(pageSource, /Coach Lesson Summary/);
  assert.match(pageSource, /StudentLessonContent/);
  assert.match(pageSource, /<summary>More<\/summary>/);
  assert.match(pageSource, /LessonAudioAnalysisPanel/);
  assert.match(pageSource, /Retry Audio Analysis/);
  assert.match(pageSource, /Analyze Coach Audio/);
  assert.match(pageSource, /View Transcript/);
  assert.doesNotMatch(pageSource, /Write the key issue, improvement, next focus, or drill/);
  assert.match(pageSource, /COACH_LESSON_OBSERVATION_GROUPS/);
  assert.match(pageSource, /COACH_LESSON_PROGRESS_OPTIONS/);
  assert.match(pageSource, /COACH_LESSON_STRUCTURED_PREFIX/);
  assert.match(pageSource, /setLessonFocus/);
  assert.match(pageSource, /setLessonDrill/);
  assert.match(pageSource, /Preview Student View/);
  assert.match(pageSource, /Return to Editing/);
  assert.match(pageSource, /aria-controls="coach-student-preview"/);
  assert.match(pageSource, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(pageSource, /onIncludeFinding=\{includeVisualFindingInFeedback\}/);
  assert.doesNotMatch(pageSource.slice(pageSource.indexOf("function VideoDetailView"), pageSource.indexOf("function VideoComparisonView")), /Open Full Practice Plan Builder/);
  assert.match(cssSource, /\.coach-lesson-sticky-header\s*\{[\s\S]*position: sticky/);
  assert.match(cssSource, /\.coach-structured-flow\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.lesson-audio-status-panel/);
  assert.doesNotMatch(feedbackSectionRule, /grid-template-columns/);
});

test("MAI visual suggestions expose include, dismiss, undo, and reduced-motion dismissal", () => {
  assert.match(pageSource, /These suggestions are private until you include them in the lesson feedback/);
  assert.match(pageSource, /Include in Feedback/);
  assert.match(pageSource, /Suggestion dismissed/);
  assert.match(pageSource, /restoreDismissedFinding/);
  assert.match(pageSource, /reviewFindingWithRollback\(finding, "dismissed"\)/);
  assert.match(pageSource, /reviewFindingWithRollback\(finding, "coach_only"\)/);
  assert.doesNotMatch(pageSource, />Keep Coach-Only</);
  assert.doesNotMatch(pageSource, />Publish Approved Visual Notes</);
  assert.match(cssSource, /\.visual-finding-card\.dismissing/);
  assert.match(cssSource, /@keyframes visualSuggestionSmoke/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("coach uploads row links open the exact video while library action stays separate", () => {
  assert.match(pageSource, /className="coach-management-link primary"/);
  assert.match(pageSource, /onOpenMemberVideos\(video\.ownerId, video\.memberName \?\? "Member", video\.id\)/);
  assert.match(pageSource, /title="Open member library"/);
  assert.match(cssSource, /\.coach-management-link:focus-visible/);
});

test("shot summary explains real shot coordinates and sample size", () => {
  assert.match(pageSource, /shot-map-explanation/);
  assert.match(pageSource, /Each dot is one shot/);
  assert.match(pageSource, /Distance lines are carry yards/);
  assert.match(pageSource, /Based on/);
  assert.match(pageSource, /Flight lines show the shot shape/);
  assert.match(pageSource, /Dispersion area derived from/);
  assert.match(pageSource, /dispersionShots\.length < 5/);
  assert.match(pageSource, /cx=\{dispersionArea\.cx\}/);
  assert.match(pageSource, /Show all shots/);
});

test("canonical club selector is reused across import, session edit, lesson, and quick session flows", () => {
  assert.match(pageSource, /function ClubSelector/);
  assert.match(pageSource, /label="Session-level club"/);
  assert.match(pageSource, /label=\{`Club for shot/);
  assert.match(pageSource, /label="Club correction"/);
  assert.match(pageSource, /label="Club used"/);
  assert.match(pageSource, /placeholder="Search, type, or save as Unknown Club"/);
  assert.doesNotMatch(pageSource, /<select value=\{sessionForm\.club\}/);
  assert.doesNotMatch(pageSource, /<select value=\{coachSessionForm\.club\}/);
});

test("dashboard reduces repeated flags and explains session score", () => {
  assert.match(pageSource, /function consolidateInsightsByIssue/);
  assert.match(pageSource, /are showing the same pattern/);
  assert.match(pageSource, /Why this result\?/);
  assert.match(pageSource, /Missing metrics stay out of the score instead of being counted as zero/);
  assert.match(cssSource, /\.session-score-popover/);
  assert.match(pageSource, /return "Baseline"/);
  assert.doesNotMatch(pageSource, /return "D"/);
});

test("session summary cards use flexible overflow-safe layout", () => {
  const cardBlock = cssBlock(".session-summary-card");

  assert.match(pageSource, /session-result-score/);
  assert.match(pageSource, /This score reflects carry consistency, contact quality, and dispersion/);
  assert.match(pageSource, /previewSentence/);
  assert.match(pageSource, /biggestWinHeadline/);
  assert.doesNotMatch(pageSource, /transparent score for the selected club/);
  assert.match(cssSource, /\.session-summary-hierarchy\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.session-summary-card\.next-assignment\s*\{[\s\S]*grid-column: 1 \/ -1/);
  assert.match(cssSource, /\.session-summary-card\.next-assignment \.primary-action\s*\{[\s\S]*margin-top: auto/);
  assert.match(cardBlock, /min-width: 0/);
  assert.match(cardBlock, /overflow-wrap: anywhere/);
  assert.doesNotMatch(cardBlock, /\n\s*height:/);
  assert.doesNotMatch(cardBlock, /overflow: hidden/);
});

test("session summary and dispersion respond across desktop tablet and mobile", () => {
  assert.match(cssSource, /\.home-dashboard-main\s*\{[\s\S]*grid-template-columns: minmax\(0, 3fr\) minmax\(320px, 2fr\)/);
  assert.match(cssSource, /\.home-shot-visual\s*\{[\s\S]*aspect-ratio: 460 \/ 260/);
  assert.match(cssSource, /@media \(max-width: 1180px\)\s*\{[\s\S]*\.home-dashboard-main\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(cssSource, /@media \(max-width: 760px\)\s*\{[\s\S]*\.session-score-details\s*\{[\s\S]*display: none/);
  assert.match(cssSource, /@media \(max-width: 760px\)\s*\{[\s\S]*\.home-result-grid,\s*[\s\S]*\.session-summary-hierarchy,[\s\S]*grid-template-columns: 1fr/);
  assert.match(cssSource, /\.home-dashboard-header h2\s*\{[\s\S]*font-size: 56px/);
  assert.match(cssSource, /@media \(max-width: 760px\)\s*\{[\s\S]*\.home-dashboard-header h2\s*\{[\s\S]*font-size: 36px/);
});
