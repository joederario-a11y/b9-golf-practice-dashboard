import assert from "node:assert/strict";
import test from "node:test";

import {
  VIDEO_OWNERSHIP_LOCK_MESSAGE,
  videoOwnershipChangeError,
} from "../lib/video-upload-safety.mjs";

test("video ownership cannot be moved to another member after creation", () => {
  assert.equal(videoOwnershipChangeError("member-a", "member-a"), "");
  assert.equal(videoOwnershipChangeError("member-a", ""), "");
  assert.equal(videoOwnershipChangeError("member-a", undefined), "");
  assert.equal(videoOwnershipChangeError("member-a", "member-b"), VIDEO_OWNERSHIP_LOCK_MESSAGE);
});
