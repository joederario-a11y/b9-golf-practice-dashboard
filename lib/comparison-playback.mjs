import { comparisonRange } from "./swing-comparison-policy.mjs";

// Coordinate the existing players, including their native and precise controls.
export function connectComparisonPlayback([current, previous], options) {
  const { isLinked, getOffset, onTime, onPlaying, onError } = options;
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let animation = 0;
  let disposed = false;
  const videos = [current, previous];
  const correcting = new WeakMap();
  const listeners = [];
  const bounds = () => comparisonRange(current.duration, previous.duration, getOffset());
  const stop = () => {
    cancelFrame(animation);
    videos.forEach(video => { if (!video.paused) video.pause(); });
    onPlaying(false);
  };
  const align = (source) => {
    const range = bounds();
    if (range.end <= range.start) return false;
    const target = Math.max(range.start, Math.min(range.end, source.currentTime - (source === previous ? getOffset() : 0)));
    const times = [target, target + getOffset()];
    videos.forEach((video, index) => {
      if (Math.abs(video.currentTime - times[index]) > 0.001) {
        correcting.set(video, times[index]);
        video.currentTime = times[index];
      }
    });
    onTime(target);
    return true;
  };
  const tick = () => {
    if (disposed) return;
    onTime(current.currentTime);
    onPlaying(videos.some(video => !video.paused));
    if (isLinked() && videos.some(video => !video.paused)) {
      const range = bounds();
      if (range.end <= range.start || current.currentTime >= range.end - 0.01) { stop(); return; }
      if (Math.abs(previous.currentTime - current.currentTime - getOffset()) > 0.08) align(current);
    }
    if (videos.some(video => !video.paused)) animation = requestFrame(tick);
  };
  const listen = (video, event, handler) => {
    video.addEventListener(event, handler);
    listeners.push(() => video.removeEventListener(event, handler));
  };
  for (const video of videos) {
    listen(video, "play", () => {
      if (isLinked()) {
        if (!align(video)) { stop(); return; }
        const other = video === current ? previous : current;
        other.playbackRate = video.playbackRate;
        videos.forEach(item => { item.muted = true; });
        if (other.paused) void other.play().catch(() => {
          if (!disposed) { stop(); onError("Playback could not start. Check that both videos have loaded."); }
        });
      }
      cancelFrame(animation);
      onPlaying(true);
      animation = requestFrame(tick);
    });
    listen(video, "pause", () => {
      if (isLinked()) stop();
      else onPlaying(videos.some(item => !item.paused));
    });
    listen(video, "ended", () => { if (isLinked()) stop(); });
    listen(video, "seeked", () => {
      // A decoder may round a requested timestamp. Do not feed a corrective
      // seek back into the opposite player and create an endless seek loop.
      const expected = correcting.get(video);
      correcting.delete(video);
      const correction = expected !== undefined && Math.abs(video.currentTime - expected) <= 0.1;
      if (isLinked() && !correction) align(video);
      else onTime(current.currentTime);
    });
    listen(video, "ratechange", () => {
      if (!isLinked()) return;
      const other = video === current ? previous : current;
      if (other.playbackRate !== video.playbackRate) other.playbackRate = video.playbackRate;
    });
  }
  onTime(current.currentTime);
  return () => { disposed = true; cancelFrame(animation); listeners.forEach(remove => remove()); };
}
