import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canStartCoachLessonUpload,
  coachLessonUploadStatusLabel,
  filterCoachUploadMembers,
  getCoachDashboardActionState,
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

test("zero-member coach dashboard shows one primary Add Member path and no upload CTA", () => {
  assert.deepEqual(getCoachDashboardActionState({
    authenticated: true,
    devAuthEnabled: false,
    hasMembers: false,
    selectedMemberId: "",
  }), {
    canAddMember: true,
    canOpenUpload: false,
    canUseMemberTools: false,
    showCompactAddMember: false,
    showDevDemoPlayer: false,
    showMemberTools: false,
    showPrimaryAddMember: true,
    showUploadLessonVideo: false,
  });
});

test("coach dashboard with members exposes one compact add action and one upload entry", () => {
  assert.deepEqual(getCoachDashboardActionState({
    authenticated: true,
    devAuthEnabled: true,
    hasMembers: true,
    selectedMemberId: "member-1",
  }), {
    canAddMember: true,
    canOpenUpload: true,
    canUseMemberTools: true,
    showCompactAddMember: true,
    showDevDemoPlayer: false,
    showMemberTools: true,
    showPrimaryAddMember: false,
    showUploadLessonVideo: true,
  });
});

test("member-dependent coach tools stay visible but disabled until a member is selected", () => {
  const state = getCoachDashboardActionState({
    authenticated: true,
    hasMembers: true,
    selectedMemberId: "",
  });
  assert.equal(state.showMemberTools, true);
  assert.equal(state.canUseMemberTools, false);
});

test("coach dashboard source keeps profile photo controls in the rail and out of the middle dashboard", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal(pageSource.includes("<section className=\"coach-profile-photo-card\">"), false);
  assert.equal(pageSource.includes("<span>{viewerRole === \"admin\" ? \"Admin tools\""), false);
  assert.match(pageSource, /className=\{cls\("rail-account-status", accountMode\)\}/);
  assert.match(pageSource, /handleOwnProfilePhoto/);
  assert.match(pageSource, /removeOwnProfilePhoto/);
});

test("coach dashboard source has a single first-member card and upload panel opens from the upload CTA", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /coach-first-member-card/);
  assert.match(pageSource, /setShowUploadPanel\(true\)/);
  assert.match(pageSource, /shouldRenderUploadPanel/);
});

test("coach upload status labels are plain language and never raw technical codes", () => {
  assert.equal(coachLessonUploadStatusLabel("uploading"), "Uploading video");
  assert.equal(coachLessonUploadStatusLabel("extracting_audio"), "Processing audio");
  assert.equal(coachLessonUploadStatusLabel("transcribing_coach_feedback"), "Processing audio");
  assert.equal(coachLessonUploadStatusLabel("generating_recap"), "Creating lesson recap");
  assert.equal(coachLessonUploadStatusLabel("ready_for_review"), "Ready for review");
  assert.equal(coachLessonUploadStatusLabel("failed"), "Needs attention");
});
