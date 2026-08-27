import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("coach and coached-member navigation keeps lessons primary and secondary tools available", () => {
  assert.match(pageSource, /item\("coach", "Home"\)/);
  assert.match(pageSource, /item\("videos", "Lessons"\)/);
  assert.match(pageSource, /function secondaryNavItemsForAccount/);
  assert.match(pageSource, /className="rail-more-nav"/);
  assert.match(pageSource, /<summary>More<\/summary>/);
  assert.match(cssSource, /\.rail-more-nav/);
});

test("coached students see coach guidance before independent missions and challenges", () => {
  assert.match(pageSource, /showMemberMission && showCoachSupport && \(\s*<CoachedStudentDashboardPriority/);
  assert.match(pageSource, /showMemberMission && !showCoachSupport && \(\s*<MemberDashboardMission/);
  assert.match(pageSource, /showMemberMission && !showCoachSupport && <DashboardChallengeCard/);
  assert.match(pageSource, /Your first lesson will appear here/);
});

test("coach feedback keeps the primary lesson flow compact without removing advanced controls", () => {
  assert.match(pageSource, /Coach Lesson Summary/);
  assert.match(pageSource, /Main Focus/);
  assert.match(pageSource, /What to Work On/);
  assert.match(pageSource, /Next practice assignment/);
  assert.match(pageSource, /Student Message/);
  assert.match(pageSource, /<summary>Advanced lesson options<\/summary>/);
  assert.match(pageSource, /<summary>Open advanced practice builder<\/summary>/);
  assert.match(pageSource, /Private Coach Context/);
  assert.match(pageSource, /LessonAudioAnalysisPanel/);
  assert.match(pageSource, /Preview and Publish/);
});

test("explicit next-practice guidance is persisted before advanced drill details", () => {
  assert.match(pageSource, /fields\.practiceNext\.trim\(\) \|\| drillTitle/);
  assert.match(pageSource, /practiceAssignment: lessonPracticeText\(coachFeedbackFields\)/);
});
