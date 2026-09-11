// Keep at most one decoder seek in flight. Rapid input updates its destination
// instead of continually interrupting decoding of the frame being loaded.
export function createVideoFrameSeeker(video, timers = {}) {
  const schedule = timers.setTimeout ?? setTimeout;
  const clear = timers.clearTimeout ?? clearTimeout;
  let target = null;
  let issued = null;
  let waiters = [];
  let timer;
  const cleanup = () => {
    clear(timer);
    video.removeEventListener("seeked", settled);
    video.removeEventListener("error", failed);
    video.removeEventListener("emptied", cancelled);
  };
  const finish = (error, moved = true) => {
    cleanup();
    const pending = waiters;
    waiters = []; target = null; issued = null;
    pending.forEach(({ resolve, reject }) => error ? reject(error) : resolve(moved));
  };
  const failed = () => finish(new Error("This video could not load a frame. Reload the video and try again."));
  const cancelled = () => finish(null, false);
  const armTimeout = () => {
    clear(timer);
    timer = schedule(() => finish(new Error("The video is taking too long to load this frame. Reload the video to try again.")), 6000);
  };
  const advance = () => {
    if (video.seeking) return;
    if (target === null) return;
    if (Math.abs(video.currentTime - target) < 0.0001) { finish(null); return; }
    issued = target;
    armTimeout();
    try { video.currentTime = issued; } catch { failed(); }
  };
  function settled() {
    // Decoders can round timestamps. Do not seek the same target indefinitely.
    if (issued !== null && issued === target) finish(null);
    else advance();
  }
  return {
    seek(value) {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || (video.readyState < 2 && !video.seeking) || video.error || !Number.isFinite(value)) return Promise.resolve(false);
      video.pause();
      const next = Math.max(0, Math.min(Math.max(0, video.duration - 0.001), value));
      if (!waiters.length && Math.abs(video.currentTime - next) < 0.0001) return Promise.resolve(false);
      target = next;
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
        if (waiters.length > 1) return;
        video.addEventListener("seeked", settled);
        video.addEventListener("error", failed);
        video.addEventListener("emptied", cancelled);
        armTimeout(); advance();
      });
    },
    step(direction, fps) {
      if (!Number.isFinite(fps) || fps <= 0) return Promise.resolve(false);
      return this.seek((target ?? video.currentTime) + direction / fps);
    },
    cancel: cancelled,
  };
}

const seekers = new WeakMap();
export function videoFrameSeeker(video) {
  if (!seekers.has(video)) seekers.set(video, createVideoFrameSeeker(video));
  return seekers.get(video);
}
