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

test("lesson review has one summary and preserves legacy systems outside this flow", () => {
  const detail = pageSource.slice(pageSource.indexOf("function VideoDetailView"), pageSource.indexOf("function VideoComparisonView"));
  assert.match(detail, /Coach Lesson Summary/);
  assert.match(detail, /Coach Notes/);
  assert.match(detail, /Preview Student View/);
  assert.match(detail, /<summary>More<\/summary>/);
  for (const removed of ["What to Work On", "Advanced lesson options", "Practice Intelligence", "Student Message"]) assert.ok(!detail.includes(removed), removed);
  assert.match(pageSource, /function lessonPracticeText/);
  assert.match(pageSource, /function VideoAnnotationWorkspace/);
});
