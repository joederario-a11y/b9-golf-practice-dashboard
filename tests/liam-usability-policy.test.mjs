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

test("lesson transcripts are collapsed and styled for the dark interface", () => {
  assert.match(pageSource, /View Lesson Transcript/);
  assert.match(pageSource, /Lesson Transcript/);
  assert.match(pageSource, /Only a small amount of speech was detected/);
  assert.match(cssSource, /\.approved-transcript\s*\{[\s\S]*background: linear-gradient/);
  assert.match(cssSource, /\.approved-transcript-body p\s*\{[\s\S]*color: rgba\(255, 255, 255, 0\.88\)/);
  assert.match(cssSource, /\.transcript-quality-warning/);
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
