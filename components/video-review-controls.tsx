"use client";

import { useEffect, useState } from "react";
import { FrameStepButton } from "./frame-step-button";
import { videoFrameSeeker } from "../lib/video-frame-seek.mjs";

export function VideoReviewControls({ video }: { video: HTMLVideoElement | null }) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(30);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (!video) return;
    let animation = 0;
    let stallTimer: ReturnType<typeof setTimeout>;
    const update = () => { setTime(video.currentTime); setDuration(Number.isFinite(video.duration) ? video.duration : 0); setPlaying(!video.paused); setSpeed(video.playbackRate); setReady(current => !video.error && (video.readyState >= 2 || (current && video.readyState >= 1))); };
    const loading = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => setProblem("The video is taking too long to load. Reload it to try again; your markups will stay here."), 6000); };
    const loaded = () => { clearTimeout(stallTimer); if (!video.error) setProblem(""); update(); };
    const failed = () => { clearTimeout(stallTimer); setProblem("This video could not be loaded. Check your connection and reload the video."); update(); };
    const tick = () => { update(); if (!video.paused) animation = requestAnimationFrame(tick); };
    const start = () => { cancelAnimationFrame(animation); tick(); };
    update();
    const events = ["timeupdate", "seeked", "loadedmetadata", "durationchange", "pause", "ended", "ratechange"];
    events.forEach(event => video.addEventListener(event, update));
    video.addEventListener("play", start);
    const loadingEvents = ["loadstart", "seeking", "waiting", "stalled"];
    const loadedEvents = ["loadeddata", "canplay", "seeked"];
    loadingEvents.forEach(event => video.addEventListener(event, loading));
    loadedEvents.forEach(event => video.addEventListener(event, loaded));
    video.addEventListener("error", failed);
    if (video.error) failed(); else if (video.readyState < 2) loading();
    if (!video.paused) start();
    return () => {
      cancelAnimationFrame(animation); clearTimeout(stallTimer); videoFrameSeeker(video).cancel();
      video.removeEventListener("play", start); video.removeEventListener("error", failed);
      events.forEach(event => video.removeEventListener(event, update));
      loadingEvents.forEach(event => video.removeEventListener(event, loading));
      loadedEvents.forEach(event => video.removeEventListener(event, loaded));
    };
  }, [video]);
  async function move(value: number, relative = false) {
    if (!video) return false;
    try {
      const seeker = videoFrameSeeker(video);
      return await (relative ? seeker.step(value, fps) : seeker.seek(value));
    } catch (error) { setProblem(error instanceof Error ? error.message : "This frame could not be loaded."); return false; }
  }
  return <div className="review-controls" aria-label="Precise video review" onKeyDown={event => {
    if ((event.target as HTMLElement).matches("input,select,textarea,button")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); void move(event.key === "ArrowLeft" ? -1 : 1, true); }
    if (event.code === "Space" && video) { event.preventDefault(); if (video.paused) void video.play().catch(() => {}); else video.pause(); }
  }} tabIndex={0}>
    <input aria-label="Video timeline" type="range" min="0" max={duration || 0.01} step={1 / fps} value={Math.min(time, duration)} disabled={!ready} onChange={event => void move(Number(event.target.value))} />
    <div className="button-row">
      <button type="button" className="secondary-action compact-action" disabled={!ready || !duration} onClick={() => { if (video?.paused) void video.play().catch(() => setProblem("Playback could not start. Reload the video and try again.")); else video?.pause(); }}>{playing ? "Pause" : "Play"}</button>
      <FrameStepButton disabled={!ready || !duration} onStep={() => move(-1, true)}>← Previous frame</FrameStepButton>
      <FrameStepButton disabled={!ready || !duration} onStep={() => move(1, true)}>Next frame →</FrameStepButton>
      <output>{time.toFixed(3)}s · Frame ≈ {Math.round(time * fps) + 1}</output>
      <label>Step rate <select aria-label="Frame step rate" value={fps} onChange={event => setFps(Number(event.target.value))}>{[24, 25, 30, 50, 60, 120, 240].map(rate => <option key={rate} value={rate}>{rate} fps</option>)}</select></label>
      <label>Speed <select aria-label="Video playback speed" value={speed} onChange={event => { if (video) video.playbackRate = Number(event.target.value); }}>{[0.25, 0.5, 0.75, 1].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
    </div>
    <small>Hold either frame button to move slowly; release to stop. Frame count is estimated at the selected rate. Focus here to use ← / → and Space.</small>
    {problem ? <div role="status"><p>{problem}</p><button type="button" className="secondary-action" onClick={() => { if (video) { videoFrameSeeker(video).cancel(); video.pause(); setProblem(""); setReady(false); video.load(); } }}>Reload video</button></div> : !ready && <small role="status">Loading video…</small>}
  </div>;
}
