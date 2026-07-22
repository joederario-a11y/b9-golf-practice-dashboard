import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartCoachLessonUpload,
  coachLessonUploadStatusLabel,
  filterCoachUploadMembers,
} from "../lib/coach-video-upload-policy.mjs";

const members = [
  { id: "3", name: "Zane Reed", firstName: "Zane", lastName: "Reed", email: "zane@example.com" },
  { id: "1", name: "Aubryn Hill", firstName: "Aubryn", lastName: "Hill", email: "aubryn@example.com" },
  { id: "2", name: "Jack Johnson", firstName: "Jack", lastName: "Johnson", email: "jack.johnson@example.com" },
  { id: "4", name: "Inactive Player", firstName: "Inactive", lastName: "Player", email: "inactive@example.com", accountStatus: "inactive" },
];

test("coach upload member search matches name and email and sorts alphabetically", () => {
  assert.deepEqual(filterCoachUploadMembers(members, "").map((member) => member.name), [
    "Aubryn Hill",
    "Jack Johnson",
    "Zane Reed",
  ]);
  assert.deepEqual(filterCoachUploadMembers(members, "jack").map((member) => member.email), [
    "jack.johnson@example.com",
  ]);
  assert.deepEqual(filterCoachUploadMembers(members, "aubryn@example.com").map((member) => member.name), [
    "Aubryn Hill",
  ]);
});

test("coach upload requires an authenticated coach member selection and a selected video", () => {
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: true, saveState: "idle" }), true);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "", hasVideo: true, saveState: "idle" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: false, saveState: "idle" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: true, memberId: "member-1", hasVideo: true, saveState: "saving" }), false);
  assert.equal(canStartCoachLessonUpload({ authenticated: false, memberId: "member-1", hasVideo: true, saveState: "idle" }), false);
});

test("coach upload status labels are plain language and never raw technical codes", () => {
  assert.equal(coachLessonUploadStatusLabel("uploading"), "Uploading video");
  assert.equal(coachLessonUploadStatusLabel("extracting_audio"), "Processing audio");
  assert.equal(coachLessonUploadStatusLabel("transcribing_coach_feedback"), "Processing audio");
  assert.equal(coachLessonUploadStatusLabel("generating_recap"), "Creating lesson recap");
  assert.equal(coachLessonUploadStatusLabel("ready_for_review"), "Ready for review");
  assert.equal(coachLessonUploadStatusLabel("failed"), "Needs attention");
});
