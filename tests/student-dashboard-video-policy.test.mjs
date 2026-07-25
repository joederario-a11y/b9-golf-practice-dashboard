import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNewerProcessingCoachLesson,
  isPlayablePublishedCoachLesson,
  selectLatestPlayableCoachLesson,
} from "../lib/student-dashboard-video-policy.mjs";

const baseLesson = {
  duration: 120,
  mimeType: "video/mp4",
  objectUrl: "/api/videos/media?videoId=lesson",
  publicationStatus: "Published",
  type: "Lesson Recap",
  uploadedBy: "Coach",
  uploadedByRole: "coach",
  uploadStatus: "ready",
};

test("student dashboard selects the most recent playable published coach lesson", () => {
  const olderLesson = {
    ...baseLesson,
    id: "older",
    lessonDate: "2026-07-21T12:00:00Z",
    publishedAt: "2026-07-21T13:00:00Z",
  };
  const latestByPublishedAt = {
    ...baseLesson,
    id: "latest",
    lessonDate: "2026-07-20T12:00:00Z",
    publishedAt: "2026-07-23T13:00:00Z",
  };

  assert.equal(selectLatestPlayableCoachLesson([olderLesson, latestByPublishedAt]).id, "latest");
});

test("student dashboard excludes non-playable, unpublished, and non-coach videos", () => {
  const excluded = [
    { ...baseLesson, id: "draft", publicationStatus: "Draft" },
    { ...baseLesson, id: "archived", publicationStatus: "Archived" },
    { ...baseLesson, id: "pending", uploadStatus: "processing" },
    { ...baseLesson, id: "missing-source", objectUrl: "" },
    { ...baseLesson, id: "no-duration", duration: 0 },
    { ...baseLesson, id: "member-upload", uploadedBy: "User", uploadedByRole: "member" },
    { ...baseLesson, id: "system-test", type: "System Test" },
    { ...baseLesson, id: "education", type: "Educational Video" },
    { ...baseLesson, id: "deleted", deletedAt: "2026-07-22T10:00:00Z" },
  ];

  for (const lesson of excluded) {
    assert.equal(isPlayablePublishedCoachLesson(lesson), false, lesson.id);
  }
  assert.equal(selectLatestPlayableCoachLesson(excluded), null);
});

test("student dashboard shows a previous playable lesson when a newer coach lesson is processing", () => {
  const selectedLesson = {
    ...baseLesson,
    id: "published",
    publishedAt: "2026-07-20T13:00:00Z",
  };
  const newerProcessingLesson = {
    ...baseLesson,
    id: "processing",
    objectUrl: "",
    publishedAt: "2026-07-23T13:00:00Z",
    uploadStatus: "processing",
  };

  assert.equal(selectLatestPlayableCoachLesson([selectedLesson, newerProcessingLesson]).id, "published");
  assert.equal(hasNewerProcessingCoachLesson([selectedLesson, newerProcessingLesson], selectedLesson), true);
});

test("student dashboard does not treat failed newer lessons as active processing work", () => {
  const selectedLesson = {
    ...baseLesson,
    id: "published",
    publishedAt: "2026-07-20T13:00:00Z",
  };
  const failedNewerLesson = {
    ...baseLesson,
    id: "failed",
    objectUrl: "",
    publishedAt: "2026-07-23T13:00:00Z",
    uploadStatus: "failed",
  };

  assert.equal(hasNewerProcessingCoachLesson([selectedLesson, failedNewerLesson], selectedLesson), false);
});
