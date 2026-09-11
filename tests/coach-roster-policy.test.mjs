import assert from "node:assert/strict";
import test from "node:test";
import { coachRosterCards, rosterLessonDate } from "../lib/coach-roster-policy.mjs";

const members = [
  { id: "a", name: "Alex Smith", email: "alex@example.test", createdAt: "2026-01-01" },
  { id: "b", name: "Beth Jones", email: "beth@example.test", createdAt: "2026-09-01" },
  { id: "c", name: "Chris Green", email: "chris@example.test", accountStatus: "inactive" },
];
const videos = [
  { ownerId: "a", type: "Lesson Recap", publicationStatus: "Published", lessonDate: "2026-09-08", uploadedAt: "2026-09-09" },
  { ownerId: "a", type: "Lesson Recap", publicationStatus: "Draft", lessonDate: "2026-09-10", uploadedAt: "2026-09-10" },
  { ownerId: "b", type: "User Upload", uploadedByRole: "user", uploadedAt: "2026-09-11" },
];

test("roster includes every active assigned Student, including those without lessons", () => {
  const cards = coachRosterCards(members, videos);
  assert.deepEqual(cards.map(card => [card.member.id, card.status]), [["a", "Draft"], ["b", "Needs Lesson"]]);
  assert.equal(cards[0].lastLessonAt, "2026-09-10");
  const largeRoster = Array.from({ length: 150 }, (_, i) => ({ id: String(i), name: `Student ${i}` }));
  assert.equal(coachRosterCards(largeRoster, []).length, 150);
});

test("search and sort do not mutate the authorized roster or add video owners", () => {
  assert.equal(coachRosterCards(members, videos, " BETH@ ")[0].member.id, "b");
  assert.deepEqual(coachRosterCards(members, videos, "", "added").map(card => card.member.id), ["b", "a"]);
  assert.deepEqual(coachRosterCards(members, videos, "", "alphabetical").map(card => card.member.id), ["a", "b"]);
  assert.equal(coachRosterCards(members, [{ ownerId: "outsider", type: "Lesson Recap" }]).length, 2);
  assert.equal(members[0].id, "a");
});

test("archived and test videos do not imply a lesson; legacy published lessons stay published", () => {
  const cards = coachRosterCards(members, [
    { ownerId: "a", type: "Lesson Recap", uploadedAt: "2026-08-01" },
    { ownerId: "a", type: "Lesson Recap", publicationStatus: "Archived", uploadedAt: "2026-09-01" },
    { ownerId: "b", type: "System Test", uploadedByRole: "coach", uploadedAt: "2026-09-10" },
  ]);
  assert.equal(cards[0].status, "Published");
  assert.equal(cards[0].lastLessonAt, "2026-08-01");
  assert.equal(cards[1].status, "Needs Lesson");
  assert.equal(rosterLessonDate("2026-09-08"), "Sep 8, 2026");
  assert.equal(rosterLessonDate(null), "No lessons yet");
});
