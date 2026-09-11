import test from "node:test";
import assert from "node:assert/strict";
import { createVideoFrameSeeker } from "../lib/video-frame-seek.mjs";

class Video extends EventTarget {
  duration = 5; readyState = 4; seeking = false; error = null; time = 1; writes = [];
  pause() {}
  get currentTime() { return this.time; }
  set currentTime(time) { this.time = time; this.writes.push(time); this.seeking = true; this.readyState = 1; }
  finish(rounded = this.time) { this.time = rounded; this.seeking = false; this.readyState = 4; this.dispatchEvent(new Event("seeked")); }
}
function fixture() {
  const video = new Video(); let timeout;
  const seeker = createVideoFrameSeeker(video, { setTimeout: callback => { timeout = callback; return 1; }, clearTimeout: () => { timeout = null; } });
  return { video, seeker, expire: () => timeout?.() };
}
test("rapid frame clicks wait for decoding and accumulate their intended position", async () => {
  const { video, seeker } = fixture();
  const requests = [seeker.step(1, 30), seeker.step(1, 30), seeker.step(1, 30)];
  assert.equal(video.writes.length, 1, "do not interrupt the current decoder seek");
  video.finish(); assert.equal(video.writes.length, 2);
  assert.ok(Math.abs(video.currentTime - 1.1) < 1e-9);
  video.finish(); assert.deepEqual(await Promise.all(requests), [true, true, true]);
});
test("scrubbing coalesces pending destinations instead of repeatedly seeking", async () => {
  const { video, seeker } = fixture();
  const requests = [seeker.seek(2), seeker.seek(3), seeker.seek(4)];
  assert.deepEqual(video.writes, [2]);
  video.finish(); assert.deepEqual(video.writes, [2, 4]);
  video.finish(); await Promise.all(requests);
});
test("rounded decoder timestamps do not trigger a seek loop", async () => {
  const { video, seeker } = fixture();
  const pending = seeker.step(1, 30); video.finish(1.03);
  assert.equal(await pending, true); assert.equal(video.writes.length, 1);
});
test("a stalled seek times out and subsequent recovery can step again", async () => {
  const f = fixture(); const pending = f.seeker.step(1, 30);
  const rejected = assert.rejects(pending, /taking too long/); f.expire(); await rejected;
  f.video.finish(); const retry = f.seeker.step(1, 30); f.video.finish(); assert.equal(await retry, true);
});
test("release of a player cancels its queue and removes pending work", async () => {
  const { video, seeker } = fixture(); const pending = seeker.step(-1, 30);
  seeker.cancel(); assert.equal(await pending, false);
  video.finish(); assert.equal(video.writes.length, 1);
});
test("frame stepping stops at either edge and does not seek an unloaded video", async () => {
  const { video, seeker } = fixture(); video.time = 0;
  assert.equal(await seeker.step(-1, 30), false);
  video.time = 4.999; assert.equal(await seeker.step(1, 30), false);
  video.readyState = 0; assert.equal(await seeker.seek(2), false);
  assert.equal(video.writes.length, 0);
});
