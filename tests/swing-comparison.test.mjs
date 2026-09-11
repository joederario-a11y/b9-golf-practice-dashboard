import assert from "node:assert/strict";
import test from "node:test";
import { comparisonPairAllowed, comparisonRange, confidentSwingAlignment, normalizeComparison } from "../lib/swing-comparison-policy.mjs";
import { visualSwingFrameTimes, validateVisualSwingFrames } from "../lib/visual-swing-analysis-policy.mjs";

test("comparison frame samples stay ordered, bounded and limited in size", () => {
  const times = visualSwingFrameTimes(8, 2, 6);
  assert.equal(times.length, 12);
  assert.equal(times[0], 2);
  assert.ok(times.at(-1) < 8);
  const frames = times.map(timestampSeconds => ({ timestampSeconds, base64: "/9j/AA==" }));
  assert.equal(validateVisualSwingFrames(frames, 8).length, 12);
  assert.throws(() => validateVisualSwingFrames([...frames].reverse(), 8));
  assert.throws(() => validateVisualSwingFrames(frames, 1));
  assert.throws(() => validateVisualSwingFrames(frames.map(frame => ({ ...frame, base64: "/9j/" + "A".repeat(400001) })), 8));
  assert.throws(() => visualSwingFrameTimes(8, 7.9, 1));
});

test("linked playback only uses the common time range for positive and negative offsets", () => {
  assert.deepEqual(comparisonRange(8, 5, 2), { start: 0, end: 3 });
  assert.deepEqual(comparisonRange(8, 5, -2), { start: 2, end: 7 });
  assert.throws(() => normalizeComparison({ previousVideoId: "old", offset: 90 }, 8, 5));
});
test("comparison requires an earlier ready lesson for the same student", () => {
  const current = { id: "new", memberId: "student", uploadStatus: "ready", uploadedAt: "2026-09-11" };
  const previous = { ...current, id: "old", uploadedAt: "2026-09-01", publicationStatus: "Published" };
  assert.equal(comparisonPairAllowed(current, previous), true);
  for (const change of [{ id: "new" }, { memberId: "other" }, { uploadStatus: "pending" }, { publicationStatus: "Archived" }, { uploadedAt: "2026-10-01" }]) assert.equal(comparisonPairAllowed(current, { ...previous, ...change }), false);
});
test("AI alignment needs matching visible phases, known frame IDs and sufficient confidence", () => {
  const a = [{ id: "frame-1", timestampSeconds: 2 }], b = [{ id: "frame-2", timestampSeconds: 3 }];
  const result = { phase: "top_of_backswing", confidence: 0.9, compatibleViews: true, currentFrameId: "frame-1", previousFrameId: "frame-2" };
  assert.deepEqual(confidentSwingAlignment(result, a, b), { offset: 1, currentTime: 2 });
  for (const patch of [{ confidence: 0.7 }, { confidence: null }, { currentFrameId: "invented" }, { compatibleViews: false }, { phase: "impact" }]) assert.equal(confidentSwingAlignment({ ...result, ...patch }, a, b), null);
});
test("only explicit approved fields survive a saved comparison", () => {
  const result = normalizeComparison({ previousVideoId: "old", offset: 0, notes: "Coach edit", approvedObservations: ["Approved"], rawAi: "Private", confidence: 0.9, currentMarkups: "true", includeWithLesson: true }, 8, 8);
  assert.equal(result.notes, "Coach edit"); assert.deepEqual(result.approvedObservations, ["Approved"]);
  assert.equal(result.currentMarkups, false); assert.equal(result.includeWithLesson, true);
  assert.equal("rawAi" in result, false); assert.equal("confidence" in result, false);
});
