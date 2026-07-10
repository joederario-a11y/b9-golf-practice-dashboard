import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessVideo,
  canManageVideo,
  canUploadToMember,
  validateThumbnailFile,
  validateVideoFile,
} from "../lib/video-policy.mjs";

const admin = { id: "admin-1", role: "admin" };
const coach = { id: "coach-1", role: "coach" };
const memberA = { id: "member-a", role: "member" };
const memberB = { id: "member-b", role: "member" };
const publishedForA = {
  memberId: memberA.id,
  coachId: coach.id,
  publicationStatus: "Published",
  uploadedByRole: "coach",
};

test("coach uploads are limited to assigned members", () => {
  assert.equal(canUploadToMember(coach, memberA.id, [memberA.id]), true);
  assert.equal(canUploadToMember(coach, memberB.id, [memberA.id]), false);
  assert.equal(canUploadToMember(admin, memberB.id, []), true);
});

test("members can only retrieve their own published videos", () => {
  assert.equal(canAccessVideo(memberA, publishedForA), true);
  assert.equal(canAccessVideo(memberB, publishedForA), false);
  assert.equal(
    canAccessVideo(memberA, { ...publishedForA, publicationStatus: "Draft" }),
    false,
  );
});

test("assigned coaches and admins can retrieve member videos", () => {
  assert.equal(canAccessVideo(coach, publishedForA, [memberA.id]), true);
  assert.equal(
    canAccessVideo({ id: "coach-2", role: "coach" }, publishedForA, [memberB.id]),
    false,
  );
  assert.equal(canAccessVideo(admin, publishedForA), true);
});

test("members cannot edit coach uploads", () => {
  assert.equal(canManageVideo(memberA, publishedForA), false);
  assert.equal(
    canManageVideo(memberA, { ...publishedForA, uploadedByRole: "member" }),
    true,
  );
});

test("upload validation accepts supported video files and rejects unsafe input", () => {
  assert.equal(validateVideoFile("video/mp4", 20_000_000), null);
  assert.match(validateVideoFile("application/pdf", 1000), /MP4/);
  assert.match(validateVideoFile("video/mp4", 501 * 1024 * 1024), /500 MB/);
});

test("thumbnail validation accepts only bounded image uploads", () => {
  assert.equal(validateThumbnailFile("image/webp", 500_000), null);
  assert.match(validateThumbnailFile("image/svg+xml", 500_000), /JPG/);
  assert.match(validateThumbnailFile("image/png", 11 * 1024 * 1024), /10 MB/);
});
