import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

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
