import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canManageVideoAnnotations,
  canViewVideoAnnotations,
  normalizeVideoAnnotationInput,
  normalizeVideoAnnotationList,
  visibleVideoAnnotationsAt,
  visualAngleDegrees,
} from "../lib/video-annotation-policy.mjs";

const admin = { id: "admin-1", role: "admin" };
const coach = { id: "coach-1", role: "coach" };
const otherCoach = { id: "coach-2", role: "coach" };
const member = { id: "member-1", role: "member" };
const video = {
  coachId: coach.id,
  memberId: member.id,
  publicationStatus: "Published",
  uploadStatus: "ready",
};

test("only assigned coaches and admins can manage video annotations", () => {
  assert.equal(canManageVideoAnnotations(coach, video, [member.id]), true);
  assert.equal(canManageVideoAnnotations(admin, video, []), true);
  assert.equal(canManageVideoAnnotations(otherCoach, video, []), false);
  assert.equal(canManageVideoAnnotations(member, video, [member.id]), false);
  assert.equal(canManageVideoAnnotations(coach, { ...video, uploadStatus: "processing" }, [member.id]), false);
});

test("members can view only their own published annotation sets", () => {
  assert.equal(canViewVideoAnnotations(member, video, [], "published"), true);
  assert.equal(canViewVideoAnnotations(member, video, [], "draft"), false);
  assert.equal(canViewVideoAnnotations({ id: "member-2", role: "member" }, video, [], "published"), false);
  assert.equal(canViewVideoAnnotations(coach, video, [member.id], "draft"), true);
});

test("annotation normalization stores editable normalized geometry", () => {
  const annotation = normalizeVideoAnnotationInput({
    color: "#ffffff",
    endTimeMs: 7000,
    geometry: { points: [{ x: 2, y: -1 }, { x: 0.25, y: 0.75 }] },
    startTimeMs: 4000,
    strokeWidth: 99,
    type: "arrow",
  });
  assert.equal(annotation.type, "arrow");
  assert.equal(annotation.normalizedCoordinates, true);
  assert.deepEqual(annotation.geometry.points[0], { x: 1, y: 0 });
  assert.equal(annotation.strokeWidth, 12);
  assert.equal(annotation.startTimeMs, 4000);
  assert.equal(annotation.endTimeMs, 7000);
});

test("timestamped annotations appear and disappear during playback", () => {
  const annotations = normalizeVideoAnnotationList([
    { endTimeMs: 3000, geometry: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, startTimeMs: 0, type: "line" },
    { endTimeMs: 7000, geometry: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, startTimeMs: 5000, type: "circle" },
  ]);
  assert.equal(visibleVideoAnnotationsAt(annotations, 1500).length, 1);
  assert.equal(visibleVideoAnnotationsAt(annotations, 4500).length, 0);
  assert.equal(visibleVideoAnnotationsAt(annotations, 6000).length, 1);
});

test("angle annotations report a visual angle without claiming precision", () => {
  assert.equal(visualAngleDegrees([{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }]), 90);
});

test("annotation UI and schema include required non-destructive controls", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const platform = readFileSync(new URL("../lib/server/platform.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/video-annotations/route.ts", import.meta.url), "utf8");

  assert.match(page, /Annotate Video/);
  assert.match(page, /Show Coach Markups/);
  assert.match(page, /Hide Coach Markups/);
  assert.match(page, /Export Annotated Copy/);
  assert.match(page, /Preview as Student/);
  assert.match(platform, /video_annotation_sets/);
  assert.match(platform, /video_annotations/);
  assert.match(route, /removeAllPublished/);
  assert.match(route, /storagePath = `lesson-videos/);
});
