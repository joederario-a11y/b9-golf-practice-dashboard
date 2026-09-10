import { visualAngleDegrees } from "./video-annotation-policy.mjs";
import { readPrivateLesson } from "./lesson-summary-policy.mjs";

export const WALKTHROUGH_TAG = "Coach narrated walkthrough";
export const WALKTHROUGH_MAX_SECONDS = 600;

export function canFillWalkthroughSummary(video, touched, summary) {
  return video.tags?.includes(WALKTHROUGH_TAG) && video.publicationStatus === "Draft" && !touched && !summary
    && readPrivateLesson(video.coachPrivateNotes).summarySource !== "coach_edited";
}

export function walkthroughFormats(supported) {
  return {
    video: ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"].find(supported),
    audio: ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(supported),
  };
}

// Render the existing normalized annotations into the captured video frames.
export function drawWalkthroughAnnotations(ctx, annotations, width, height, displayWidth = width) {
  const scale = width / Math.max(1, displayWidth);
  for (const annotation of annotations) {
    const g = annotation.geometry;
    const points = (g.points || []).map(p => ({ x: p.x * width, y: p.y * height }));
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = annotation.color;
    ctx.lineWidth = (annotation.strokeWidth || 4) * scale;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    if (["line", "arrow", "freehand", "angle"].includes(annotation.type) && points.length) {
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (annotation.type === "arrow" && points.length > 1) {
        const a = points[0], b = points[1], angle = Math.atan2(b.y - a.y, b.x - a.x);
        const size = ctx.lineWidth * 4;
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 6), b.y - size * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 6), b.y - size * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      }
      if (annotation.type === "angle" && points.length === 3) {
        ctx.font = `bold ${16 * scale}px sans-serif`;
        ctx.fillText(`${Math.round(visualAngleDegrees(g.points))}°`, points[1].x + 10 * scale, points[1].y - 10 * scale);
      }
    } else if (annotation.type === "rectangle") {
      ctx.strokeRect(g.x * width, g.y * height, g.width * width, g.height * height);
    } else if (annotation.type === "circle") {
      ctx.ellipse((g.x + g.width / 2) * width, (g.y + g.height / 2) * height, g.width * width / 2, g.height * height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (annotation.type === "text") {
      ctx.font = `bold ${20 * scale}px sans-serif`;
      ctx.fillText(annotation.text, g.x * width, g.y * height);
    }
    ctx.restore();
  }
}

export function walkthroughDraftMetadata(video, privateNotes, duration) {
  return {
    memberId: video.ownerId, coachId: video.coachId || undefined,
    title: `${video.title} — narrated`.slice(0, 120),
    coachPrivateNotes: privateNotes, description: "", lessonSummary: "",
    videoType: "Coach Feedback", tags: [WALKTHROUGH_TAG],
    sessionId: video.sessionId || undefined, club: video.club || undefined,
    duration, publicationStatus: "Draft", generateAiRecap: true,
    generateVisualAnalysis: false, notifyMember: false,
  };
}

export async function startCoachWalkthrough({ video, getAnnotations, getDisplayWidth, onStopped, onFailure, onTick }) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Recording is unavailable in this browser. Try a current desktop Chrome or Edge browser.");
  }
  if (!video?.videoWidth || video.readyState < 2) throw new Error("Wait for the lesson video to load before recording.");
  const formats = walkthroughFormats(type => MediaRecorder.isTypeSupported(type));
  if (!formats.video || !formats.audio) throw new Error("This browser cannot record video and narration. Try desktop Chrome or Edge.");
  const canvas = document.createElement("canvas");
  if (!canvas.captureStream) throw new Error("This browser cannot record the walkthrough. Try desktop Chrome or Edge.");
  const ratio = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
  canvas.width = Math.max(2, Math.round(video.videoWidth * ratio / 2) * 2);
  canvas.height = Math.max(2, Math.round(video.videoHeight * ratio / 2) * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The video recorder could not start.");
  let mic;
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
  catch { throw new Error("Microphone access is required. Allow your microphone and try again."); }
  const previousMuted = video.muted;
  const previousVolume = video.volume;
  let canvasStream, recordingStream, videoRecorder, audioRecorder, frame, timer;
  let ended = false, canceled = false;
  const chunks = [], audioChunks = [];
  let bytes = 0, audioBytes = 0;
  const started = performance.now();
  const silenceOriginal = () => { if (!video.muted) video.muted = true; if (video.volume !== 0) video.volume = 0; };
  function cleanup() {
    cancelAnimationFrame(frame); clearInterval(timer);
    video.removeEventListener("volumechange", silenceOriginal);
    document.removeEventListener("visibilitychange", onVisibility);
    mic.getTracks().forEach(track => track.stop());
    canvasStream?.getTracks().forEach(track => track.stop());
    video.muted = previousMuted; video.volume = previousVolume;
  }
  function stop(discard = false) {
    if (ended) return;
    ended = true; canceled = discard;
    video.pause();
    if (videoRecorder?.state !== "inactive") videoRecorder?.stop();
    if (audioRecorder?.state !== "inactive") audioRecorder?.stop();
    cleanup();
  }
  function fail() { stop(true); onFailure("Recording stopped unexpectedly. Your original lesson is unchanged. Please record again."); }
  function onVisibility() { if (document.hidden) stop(); }
  try {
    silenceOriginal();
    video.addEventListener("volumechange", silenceOriginal);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvasStream = canvas.captureStream(30);
    // Only microphone audio is included; original lesson audio is never connected.
    recordingStream = new MediaStream([...canvasStream.getVideoTracks(), ...mic.getAudioTracks()]);
    videoRecorder = new MediaRecorder(recordingStream, { mimeType: formats.video, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000 });
    audioRecorder = new MediaRecorder(mic, { mimeType: formats.audio, audioBitsPerSecond: 96000 });
    const completion = recorder => new Promise(resolve => { recorder.onstop = resolve; });
    const completed = Promise.all([completion(videoRecorder), completion(audioRecorder)]);
    videoRecorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > 450 * 1024 * 1024) stop(); } };
    audioRecorder.ondataavailable = event => { if (event.data.size) { audioChunks.push(event.data); audioBytes += event.data.size; if (audioBytes > 20 * 1024 * 1024) stop(); } };
    videoRecorder.onerror = audioRecorder.onerror = fail;
    mic.getAudioTracks().forEach(track => { track.onended = () => { if (!ended) stop(); }; });
    void completed.then(() => {
      if (canceled) return;
      const duration = Math.min(WALKTHROUGH_MAX_SECONDS, Math.max(1, (performance.now() - started) / 1000));
      if (!bytes || !audioBytes) { onFailure("No usable recording was captured. Please try again."); return; }
      const videoType = formats.video.split(";")[0], audioType = formats.audio.split(";")[0];
      onStopped({
        video: new File(chunks, `coach-walkthrough.${videoType.includes("mp4") ? "mp4" : "webm"}`, { type: videoType }),
        audio: new File(audioChunks, `coach-narration.${audioType.includes("mp4") ? "m4a" : "webm"}`, { type: audioType }), duration,
      });
    });
    const paint = () => {
      if (ended) return;
      try {
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawWalkthroughAnnotations(ctx, getAnnotations(), canvas.width, canvas.height, getDisplayWidth());
        }
        frame = requestAnimationFrame(paint);
      } catch { fail(); }
    };
    videoRecorder.start(1000); audioRecorder.start(1000); paint();
    timer = setInterval(() => { const elapsed = Math.floor((performance.now() - started) / 1000); onTick(elapsed); if (elapsed >= WALKTHROUGH_MAX_SECONDS) stop(); }, 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return { stop: () => stop(), cancel: () => stop(true) };
  } catch (error) { stop(true); throw new Error("The recorder could not start. Check microphone access and try again."); }
}
