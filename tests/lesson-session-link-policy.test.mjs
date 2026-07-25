import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canMemberManageLessonSessionLink,
  canStaffManageLessonSessionLink,
  choosePrimaryLessonSessionLink,
  lessonSessionCardStatus,
  lessonSessionLinkCountLabel,
  normalizeLessonSessionAttachedByRole,
  normalizeLessonSessionSourceType,
  shouldPromptLessonRecapUpdate,
} from "../lib/lesson-session-link-policy.mjs";

test("lesson session link labels describe empty, single, and multiple states", () => {
  assert.equal(lessonSessionLinkCountLabel(0), "No session data");
  assert.equal(lessonSessionLinkCountLabel(1), "1 session linked");
  assert.equal(lessonSessionLinkCountLabel(3), "3 sessions linked");
  assert.equal(lessonSessionCardStatus(0), "No session data");
  assert.equal(lessonSessionCardStatus(1, ["Ready"]), "Session data attached");
  assert.equal(lessonSessionCardStatus(2, ["Ready"]), "2 sessions attached");
  assert.equal(lessonSessionCardStatus(1, ["Needs review"]), "Session data needs review");
});

test("lesson session link normalizers keep unknown input inside safe defaults", () => {
  assert.equal(normalizeLessonSessionAttachedByRole("coach"), "coach");
  assert.equal(normalizeLessonSessionAttachedByRole("owner"), "member");
  assert.equal(normalizeLessonSessionSourceType("photo_upload"), "photo_upload");
  assert.equal(normalizeLessonSessionSourceType("screen scrape"), "existing_session");
});

test("primary lesson session prefers the explicit primary link then newest available", () => {
  const links = [
    { id: "one", isPrimary: false },
    { id: "two", isPrimary: true },
  ];
  assert.equal(choosePrimaryLessonSessionLink(links).id, "two");
  assert.equal(choosePrimaryLessonSessionLink([{ id: "first", isPrimary: false }]).id, "first");
  assert.equal(choosePrimaryLessonSessionLink([]), null);
});

test("recap prompt appears only when new session data arrives after feedback exists", () => {
  assert.equal(shouldPromptLessonRecapUpdate({
    hasApprovedFeedback: true,
    newLinkCreated: true,
    publicationStatus: "Published",
  }), true);
  assert.equal(shouldPromptLessonRecapUpdate({
    hasApprovedFeedback: false,
    newLinkCreated: true,
    publicationStatus: "Draft",
  }), false);
  assert.equal(shouldPromptLessonRecapUpdate({
    hasApprovedFeedback: true,
    newLinkCreated: false,
    publicationStatus: "Published",
  }), false);
});

test("member and staff authorization helpers keep ownership scoped", () => {
  assert.equal(canMemberManageLessonSessionLink(
    { id: "member-1", role: "member" },
    { memberId: "member-1", attachedByUserId: "member-1" },
  ), true);
  assert.equal(canMemberManageLessonSessionLink(
    { id: "member-1", role: "member" },
    { memberId: "member-1", attachedByUserId: "coach-1" },
  ), false);
  assert.equal(canStaffManageLessonSessionLink({ id: "admin-1", role: "admin" }, "member-1", []), true);
  assert.equal(canStaffManageLessonSessionLink({ id: "coach-1", role: "coach" }, "member-1", ["member-1"]), true);
  assert.equal(canStaffManageLessonSessionLink({ id: "coach-1", role: "coach" }, "member-2", ["member-1"]), false);
});

test("lesson and dashboard source expose post-upload session linking and coached-student priority", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /Add session data to this lesson/);
  assert.match(pageSource, /Add your session data/);
  assert.match(pageSource, /LessonSessionDataModal/);
  assert.match(pageSource, /CoachedStudentDashboardPriority/);
  assert.match(pageSource, /Coach Feedback/);
  assert.match(pageSource, /Practice Next/);
  assert.match(pageSource, /More ways to improve with MAI Coach/);
});
