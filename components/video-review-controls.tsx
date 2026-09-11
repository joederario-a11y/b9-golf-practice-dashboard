"use client";

import { useEffect, useState } from "react";

export function VideoReviewControls({ video }: { video: HTMLVideoElement | null }) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(30);
  useEffect(() => {
    if (!video) return;
    const update = () => { setTime(video.currentTime); setDuration(Number.isFinite(video.duration) ? video.duration : 0); };
    update();
    const events = ["timeupdate", "seeked", "loadedmetadata", "durationchange"];
    events.forEach(event => video.addEventListener(event, update));
    return () => events.forEach(event => video.removeEventListener(event, update));
  }, [video]);
  function seek(value: number) { if (video) { video.pause(); video.currentTime = Math.max(0, Math.min(duration, value)); setTime(video.currentTime); } }
  return <div className="review-controls" aria-label="Precise video review" onKeyDown={event => {
    if ((event.target as HTMLElement).matches("input,select,textarea,button")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(time + (event.key === "ArrowLeft" ? -1 : 1) / fps); }
    if (event.code === "Space" && video) { event.preventDefault(); if (video.paused) void video.play().catch(() => {}); else video.pause(); }
  }} tabIndex={0}>
    <input aria-label="Video timeline" type="range" min="0" max={duration || 0.01} step={1 / fps} value={Math.min(time, duration)} onChange={event => seek(Number(event.target.value))} />
    <div className="button-row">
      <button type="button" className="secondary-action compact-action" disabled={!duration} onClick={() => seek(time - 1 / fps)}>← Previous frame</button>
      <button type="button" className="secondary-action compact-action" disabled={!duration} onClick={() => seek(time + 1 / fps)}>Next frame →</button>
      <output>{time.toFixed(3)}s · Frame ≈ {Math.round(time * fps) + 1}</output>
      <label>Step rate <select aria-label="Frame step rate" value={fps} onChange={event => setFps(Number(event.target.value))}>{[24, 25, 30, 50, 60, 120, 240].map(rate => <option key={rate} value={rate}>{rate} fps</option>)}</select></label>
    </div>
    <small>Frame count is estimated at the selected rate. Focus here to use ← / → and Space.</small>
  </div>;
}
