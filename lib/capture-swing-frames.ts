import { visualSwingFrameTimes } from "./visual-swing-analysis-policy.mjs";

export async function captureSwingFrames(source: string, start: number, length: number, signal: AbortSignal) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  function waitFor(event: string, action: () => void) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener("error", fail);
        signal.removeEventListener("abort", fail);
      };
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("Could not read the swing video. Try a playable MP4 clip.")); };
      const timer = setTimeout(fail, 15000);
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", fail, { once: true });
      signal.addEventListener("abort", fail, { once: true });
      if (signal.aborted) { fail(); return; }
      try { action(); } catch { fail(); }
    });
  }
  try {
    await waitFor("loadeddata", () => { video.src = source; });
    const times = visualSwingFrameTimes(video.duration, start, length);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare swing frames.");
    const frames = [];
    for (const timestampSeconds of times) {
      if (signal.aborted) throw new Error("Swing review cancelled.");
      if (Math.abs(video.currentTime - timestampSeconds) > 0.001) {
        await waitFor("seeked", () => { video.currentTime = timestampSeconds; });
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ timestampSeconds, base64: canvas.toDataURL("image/jpeg", 0.7).split(",")[1] });
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
