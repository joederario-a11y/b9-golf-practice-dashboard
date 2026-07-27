import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getMemberExperienceMode,
  getMemberNextBestAction,
} from "../lib/member-next-action-policy.mjs";

const coach = { id: "coach-zac", name: "Zac Malone" };
const playableLesson = {
  coachId: "coach-zac",
  duration: 118,
  id: "video-1",
  isViewedByMember: false,
  lessonSummary: "Better setup width and finish balance.",
  memberFacingNotes: "Start with setup.",
  objectUrl: "/api/videos/media?videoId=video-1",
  publicationStatus: "Published",
  publishedAt: "2026-07-25T10:00:00Z",
  type: "Lesson Recap",
  uploadedBy: "Coach",
  uploadedByRole: "coach",
  uploadStatus: "ready",
};
const session = {
  id: "session-1",
  date: "2026-07-24",
  shots: [{ id: "shot-1", club: "7-Iron", carry: 155 }],
};
const insight = {
  id: "smash",
  action: "Use center-contact work before speed.",
  club: "7-Iron",
  evidence: "Smash is below target.",
  metric: "Smash factor",
  severity: "medium",
  target: "1.38",
  title: "Center contact is the next gain",
  value: "1.31",
};

test("coach-led member follows coach-assigned practice before lesson and AI items", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [coach],
    activeMemberActivity: {
      id: "practice-1",
      activityType: "drill",
      durationMinutes: 15,
      coachId: "coach-zac",
      instructions: {
        coachConnection: { connected: true, coachName: "Zac Malone", summary: "Work setup width first." },
        sourceMode: "coach_feedback",
      },
      status: "generated",
      title: "Setup Width Gate",
    },
    insights: [insight],
    sessions: [session],
    videos: [playableLesson],
  });

  assert.equal(getMemberExperienceMode({ activeCoachRelationships: [coach] }), "coach_led");
  assert.equal(action.type, "coach_practice");
  assert.equal(action.source, "coach");
  assert.equal(action.primaryActionUrl, "/practice/practice-1");
});

test("independent member gets MAI practice before session opportunity and upload prompts", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [],
    activeMemberActivity: {
      id: "practice-2",
      activityType: "drill",
      durationMinutes: 20,
      instructions: {
        sourceMode: "session_data",
        sourceSummary: "Based on 12 user-owned shot records.",
      },
      status: "in_progress",
      title: "Center Contact Ladder",
    },
    insights: [insight],
    practiceProfile: { path: "Casual" },
    sessions: [session],
  });

  assert.equal(getMemberExperienceMode({ activeCoachRelationships: [], sessions: [session], insights: [insight] }), "independent");
  assert.equal(action.type, "mai_practice");
  assert.equal(action.source, "mai");
  assert.equal(action.supportingRecordId, "practice-2");
});

test("independent member ignores stale coach attribution on a stored practice activity", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [],
    activeMemberActivity: {
      id: "practice-dave",
      activityType: "drill",
      durationMinutes: 6,
      instructions: {
        coachConnection: { connected: true, coachName: "Zac Malone", summary: "Coach Zac emphasizes structured practice." },
        sourceMode: "coach_feedback",
        sourceSummary: "Coach Zac says driver accuracy comes first.",
      },
      status: "generated",
      title: "Energy Transfer Contact Map",
    },
    insights: [insight],
    practiceProfile: { path: "Independent" },
    sessions: [session],
  });

  assert.equal(getMemberExperienceMode({ activeCoachRelationships: [], sessions: [session], insights: [insight] }), "independent");
  assert.equal(action.type, "mai_practice");
  assert.equal(action.source, "mai");
  assert.equal(action.title, "Energy Transfer Contact Map");
});

test("hybrid member keeps coach lesson ahead of independent MAI session opportunity", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [coach],
    insights: [insight],
    practiceProfile: { path: "Competitive" },
    sessions: [session],
    videos: [playableLesson],
  });

  assert.equal(getMemberExperienceMode({ activeCoachRelationships: [coach], sessions: [session], insights: [insight] }), "hybrid");
  assert.equal(action.type, "coach_lesson_review");
  assert.equal(action.source, "coach");
  assert.equal(action.supportingRecordId, "video-1");
});

test("experience mode ignores inactive display relationships and uses canonical active counts", () => {
  assert.equal(getMemberExperienceMode({
    activeCoachRelationships: [{ ...coach, accountStatus: "inactive" }],
    sessions: [session],
  }), "independent");

  assert.equal(getMemberExperienceMode({
    activeCoachCount: 1,
    sessions: [session],
  }), "hybrid");
});

test("next-best-action policy returns exactly one primary recommendation", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [coach],
    activeMemberActivity: {
      id: "practice-3",
      activityType: "drill",
      coachId: "coach-zac",
      instructions: {
        coachConnection: { connected: true },
        sourceMode: "coach_feedback",
      },
      status: "generated",
      title: "Coach drill",
    },
    insights: [insight],
    sessions: [session],
    videos: [playableLesson],
  });

  assert.equal(Array.isArray(action), false);
  assert.equal(action.type, "coach_practice");
});

test("members without data are directed to upload before generic practice", () => {
  const action = getMemberNextBestAction({
    activeCoachRelationships: [],
    practiceProfile: { path: "Beginner" },
    sessions: [],
  });

  assert.equal(action.type, "upload_session");
  assert.equal(action.source, "system");
  assert.equal(action.primaryActionUrl, "/import");
});

test("dashboard and practice surfaces use the shared next-best-action policy", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /getMemberNextBestAction/);
  assert.match(pageSource, /NextBestActionCard/);
  assert.match(pageSource, /MemberDashboardMission/);
  assert.match(pageSource, /memberNextBestAction/);
  assert.match(pageSource, /activeCoachRelationships/);
  assert.doesNotMatch(pageSource, /Coach-first when a Coach exists/);
  assert.doesNotMatch(pageSource, /coachedPriority/);
});

test("member dashboard presents mission and session-result hierarchy before detailed stats", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(pageSource, /Today's Mission/);
  assert.match(pageSource, /Today's Priority/);
  assert.match(pageSource, /Session Result/);
  assert.match(pageSource, /Biggest Win/);
  assert.match(pageSource, /Biggest Opportunity/);
  assert.match(pageSource, /Next Assignment/);
  assert.match(pageSource, /Why this result\\?/);
  assert.ok(pageSource.indexOf("Session Result") < pageSource.indexOf("Detailed statistics"));
});
