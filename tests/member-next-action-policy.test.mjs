import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getMemberExperienceMode,
  getMemberNextBestAction,
} from "../lib/member-next-action-policy.mjs";

const coach = { id: "coach-zac", name: "Zac Malone" };
const playableLesson = {
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
    coaches: [coach],
    currentActivity: {
      id: "practice-1",
      activityType: "drill",
      durationMinutes: 15,
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

  assert.equal(getMemberExperienceMode({ coaches: [coach] }), "coach_led");
  assert.equal(action.type, "coach_practice");
  assert.equal(action.source, "coach");
  assert.equal(action.primaryActionUrl, "/practice");
});

test("independent member gets MAI practice before session opportunity and upload prompts", () => {
  const action = getMemberNextBestAction({
    coaches: [],
    currentActivity: {
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

  assert.equal(getMemberExperienceMode({ coaches: [], sessions: [session], insights: [insight] }), "independent");
  assert.equal(action.type, "mai_practice");
  assert.equal(action.source, "mai");
  assert.equal(action.supportingRecordId, "practice-2");
});

test("hybrid member keeps coach lesson ahead of independent MAI session opportunity", () => {
  const action = getMemberNextBestAction({
    coaches: [coach],
    insights: [insight],
    practiceProfile: { path: "Competitive" },
    sessions: [session],
    videos: [playableLesson],
  });

  assert.equal(getMemberExperienceMode({ coaches: [coach], sessions: [session], insights: [insight] }), "hybrid");
  assert.equal(action.type, "coach_lesson_review");
  assert.equal(action.source, "coach");
  assert.equal(action.supportingRecordId, "video-1");
});

test("members without data are directed to upload before generic practice", () => {
  const action = getMemberNextBestAction({
    coaches: [],
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
  assert.match(pageSource, /memberNextBestAction/);
  assert.match(pageSource, /Coach-first when a Coach exists/);
});
