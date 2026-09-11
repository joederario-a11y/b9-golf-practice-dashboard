import assert from "node:assert/strict";
import test from "node:test";
import { connectComparisonPlayback } from "../lib/comparison-playback.mjs";

class Video extends EventTarget {
  currentTime = 0;
  duration = 8;
  paused = true;
  playbackRate = 1;
  muted = false;
  emit(name) { this.dispatchEvent(new Event(name)); }
  async play() { if (this.paused) { this.paused = false; this.emit("play"); } }
  pause() { if (!this.paused) { this.paused = true; this.emit("pause"); } }
  seek(time) { this.currentTime = time; this.emit("seeked"); }
}
function fixture() {
  const a = new Video(), b = new Video();
  let linked = true, offset = 1, frame, playing, time;
  const dispose = connectComparisonPlayback([a, b], {
    isLinked: () => linked, getOffset: () => offset,
    onTime: value => { time = value; }, onPlaying: value => { playing = value; },
    onError: error => assert.fail(error),
    requestFrame: callback => { frame = callback; return 1; }, cancelFrame: () => { frame = null; },
  });
  return { a, b, dispose, link(value) { linked = value; }, offset(value) { offset = value; }, tick() { frame?.(); }, playing: () => playing, time: () => time };
}

test("seeking either existing player preserves the linked offset and overlap", () => {
  const f = fixture();
  f.a.seek(2); assert.equal(f.b.currentTime, 3);
  f.b.seek(5); assert.equal(f.a.currentTime, 4);
  f.a.seek(8); assert.equal(f.a.currentTime, 7); assert.equal(f.b.currentTime, 8);
  f.offset(-2); f.b.seek(1); assert.equal(f.a.currentTime, 3);
  f.dispose();
});

test("native play and pause on the previous swing control both linked players", async () => {
  const f = fixture();
  f.b.currentTime = 3;
  await f.b.play();
  assert.equal(f.a.paused, false); assert.equal(f.a.currentTime, 2); assert.equal(f.playing(), true);
  assert.equal(f.a.muted && f.b.muted, true);
  f.b.pause(); assert.equal(f.a.paused, true); assert.equal(f.playing(), false);
  f.dispose();
});

test("unlinked players can be positioned, played and paused independently", async () => {
  const f = fixture(); f.link(false);
  f.b.seek(5); assert.equal(f.a.currentTime, 0);
  await f.b.play(); assert.equal(f.a.paused, true);
  await f.a.play(); f.b.pause(); assert.equal(f.a.paused, false); assert.equal(f.playing(), true);
  f.dispose();
});

test("linked playback corrects drift, shares slow motion and stops at the overlap boundary", async () => {
  const f = fixture(); await f.a.play();
  f.b.playbackRate = 0.25; f.b.emit("ratechange"); assert.equal(f.a.playbackRate, 0.25);
  f.a.currentTime = 4; f.b.currentTime = 4.5; f.tick(); assert.equal(f.b.currentTime, 5);
  f.a.currentTime = 7; f.tick(); assert.equal(f.a.paused && f.b.paused, true);
  f.dispose();
});

test("closing comparison removes event handlers and animation callbacks", () => {
  const f = fixture(); f.dispose();
  f.a.seek(4); assert.equal(f.b.currentTime, 0);
});

test("rounded corrective seeks do not bounce forever between linked players", () => {
  const f = fixture(); f.offset(1 / 30);
  f.a.seek(1);
  // The previous decoder rounds 1.033333 seconds to 1.03.
  f.b.currentTime = 1.03; f.b.emit("seeked");
  assert.equal(f.a.currentTime, 1, "a sync correction must not become another initiating seek");
  // A subsequent intentional seek still controls the current swing.
  f.b.seek(2); assert.ok(Math.abs(f.a.currentTime - (2 - 1 / 30)) < 0.0001);
  f.dispose();
});
