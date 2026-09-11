"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { captureSwingFrames } from "../lib/capture-swing-frames";
import { comparisonRange } from "../lib/swing-comparison-policy.mjs";
import { connectComparisonPlayback } from "../lib/comparison-playback.mjs";
import { videoFrameSeeker } from "../lib/video-frame-seek.mjs";
import { FrameStepButton } from "./frame-step-button";
import { LessonFeedback } from "./lesson-feedback";
import "./swing-comparison.css";

export type ComparisonVideo = { id: string; ownerId: string; title: string; uploadedAt: string; duration: number; objectUrl: string; uploadStatus?: string; publicationStatus?: string };
type Comparison = { previousVideoId: string; offset: number; notes: string; approvedObservations: string[]; currentMarkups: boolean; previousMarkups: boolean; includeWithLesson: boolean };
const empty = (id = ""): Comparison => ({ previousVideoId: id, offset: 0, notes: "", approvedObservations: [], currentMarkups: false, previousMarkups: false, includeWithLesson: false });

export async function comparisonRequest(videoId: string, action: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) {
  const response = await fetch("/api/swing-comparisons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId, action, ...extra }), signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || payload.error || "The comparison could not be saved.");
  return payload;
}

export function SwingComparison<T extends ComparisonVideo>({ video, student = false, loadVideos, renderPlayer, renderEditor, onApproveNotes, initiallyOpen = false, initialPreviousVideoId = "" }: {
  video: T; student?: boolean; initiallyOpen?: boolean; initialPreviousVideoId?: string;
  loadVideos: (memberId: string) => Promise<T[]>;
  renderPlayer: (video: T, ready: (element: HTMLVideoElement | null) => void, showMarkups: boolean) => ReactNode;
  renderEditor: (video: T, done: () => void, initialTime: number) => ReactNode;
  onApproveNotes?: (text: string) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [lessons, setLessons] = useState<T[]>([]);
  const [draft, setDraft] = useState<Comparison>(empty());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [exists, setExists] = useState(false);
  const [published, setPublished] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [editor, setEditor] = useState<T | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [layout, setLayout] = useState("both");
  const [linked, setLinked] = useState(true);
  const [fps, setFps] = useState(30);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const players = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);
  const positions = useRef<[number | null, number | null]>([null, null]);
  const operation = useRef<AbortController | null>(null);
  const operationBusy = useRef(false);
  const previous = lessons.find(item => item.id === draft.previousVideoId);
  const offsetRef = useRef(draft.offset); offsetRef.current = draft.offset;
  const registerPlayer = useCallback((index: 0 | 1, element: HTMLVideoElement | null) => {
    players.current[index] = element; setReadyCount(n => n + 1);
    if (!element) return;
    element.muted = true;
    const position = () => {
      const initial = positions.current[index] ?? Math.max(0, index ? offsetRef.current : -offsetRef.current);
      element.currentTime = Math.max(0, Math.min(element.duration || 0, initial));
    };
    if (element.readyState >= 1) position(); else element.addEventListener("loadedmetadata", position, { once: true });
  }, []);
  const registerCurrent = useCallback((element: HTMLVideoElement | null) => registerPlayer(0, element), [registerPlayer]);
  const registerPrevious = useCallback((element: HTMLVideoElement | null) => registerPlayer(1, element), [registerPlayer]);
  const linkedRef = useRef(linked); linkedRef.current = linked;
  const range = comparisonRange(video.duration, previous?.duration || 0, draft.offset);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setLoadError("");
    void (async () => {
      const response = await fetch(`/api/swing-comparisons?videoId=${encodeURIComponent(video.id)}`, { signal: controller.signal, cache: "no-store" });
      const state = await response.json();
      if (!response.ok) throw new Error(state.error?.message || state.error || "Comparison unavailable.");
      // Students do not load a roster of lessons when no comparison is published.
      const all = student && !state.comparison ? [] : await loadVideos(video.ownerId);
      if (controller.signal.aborted) return;
      setLessons(all.filter(item => item.id !== video.id && item.ownerId === video.ownerId && item.uploadStatus === "ready" && item.publicationStatus !== "Archived" && Date.parse(item.uploadedAt) <= Date.parse(video.uploadedAt)).sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)));
      setDraft(state.comparison || empty(initialPreviousVideoId)); setExists(Boolean(state.comparison)); setPublished(Boolean(state.published)); setLoaded(true);
    })().catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [video.id, video.ownerId, video.uploadedAt, student, loadVideos, reload, initialPreviousVideoId]);

  function pause() { players.current.forEach(element => element?.pause()); setPlaying(false); }
  function rememberPositions() { positions.current = players.current.map(element => element?.currentTime ?? null) as [number | null, number | null]; }
  useEffect(() => () => { operation.current?.abort(); players.current.forEach(element => element?.pause()); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const [a, b] = players.current;
    if (!a || !b) return;
    return connectComparisonPlayback([a, b], {
      isLinked: () => linkedRef.current, getOffset: () => offsetRef.current,
      onTime: setTime, onPlaying: setPlaying, onError: setMessage,
    });
  }, [readyCount]);
  useEffect(() => {
    players.current.forEach(element => { if (element && element.playbackRate !== speed) element.playbackRate = speed; });
    const current = players.current[0];
    const update = () => { if (current) setSpeed(current.playbackRate); };
    current?.addEventListener("ratechange", update);
    return () => current?.removeEventListener("ratechange", update);
  }, [speed, readyCount]);

  function change(patch: Partial<Comparison>) { setDraft(current => ({ ...current, ...patch })); setDirty(true); }
  function adjustOffset(offset: number) {
    const bounds = comparisonRange(video.duration, previous?.duration || 0, offset);
    if (bounds.end - bounds.start < 0.1) { setMessage("These positions do not overlap. Move closer to the swing or reset alignment."); return false; }
    pause(); offsetRef.current = offset; linkedRef.current = true; setLinked(true);
    change({ offset }); seek(players.current[0]?.currentTime ?? time, offset);
    return true;
  }
  function seek(value: number, offset = draft.offset) {
    pause();
    const [a, b] = players.current;
    const bounds = comparisonRange(video.duration, previous?.duration || 0, offset);
    const next = Math.max(bounds.start, Math.min(bounds.end, value));
    if (a) a.currentTime = next;
    if (b && linkedRef.current) b.currentTime = Math.max(0, next + offset);
    setTime(next);
  }
  async function play() {
    if (playing) { pause(); return; }
    const [a, b] = players.current;
    if (!a || !b) return;
    if (a.currentTime < range.start || a.currentTime >= range.end - 0.05) a.currentTime = range.start;
    if (linked) b.currentTime = a.currentTime + draft.offset;
    a.muted = true; b.muted = true;
    try { await Promise.all([a.play(), b.play()]); setPlaying(true); }
    catch { pause(); setMessage("Playback could not start. Check that both videos have loaded."); }
  }
  async function stepFrames(direction: number) {
    const [a, b] = players.current;
    if (!a || !b || busy) return false;
    pause();
    const next = Math.max(range.start, Math.min(range.end, a.currentTime + direction / fps));
    if (Math.abs(next - a.currentTime) < 0.0001) return false;
    try {
      const results = await Promise.all([videoFrameSeeker(a).seek(next), linked ? videoFrameSeeker(b).seek(next + draft.offset) : Promise.resolve(true)]);
      return results.every(Boolean);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The next frame could not be loaded."); return false; }
  }
  async function save(action: string) {
    if (operationBusy.current) return;
    operationBusy.current = true; setBusy(true); setMessage("");
    try {
      const result = await comparisonRequest(video.id, action, { comparison: draft });
      setExists(true); setPublished(action === "unpublish" ? false : result.published); if (action !== "unpublish") setDirty(false);
      setMessage(action === "publish" ? "Comparison published to the Student." : action === "unpublish" ? "Comparison is now private." : "Comparison draft saved. Publish when ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save comparison."); }
    finally { operationBusy.current = false; setBusy(false); }
  }
  async function analyze(align: boolean) {
    if (!previous || operationBusy.current) return;
    pause(); operationBusy.current = true; setBusy(true); setMessage("Reviewing the two swing sequences…");
    const controller = new AbortController(); operation.current = controller;
    try {
      const starts = players.current.map(element => Math.max(0, (element?.currentTime || 0) - 2));
      const [currentFrames, previousFrames] = await Promise.all([
        captureSwingFrames(video.objectUrl, Math.min(starts[0], Math.max(0, video.duration - 1)), 6, controller.signal),
        captureSwingFrames(previous.objectUrl, Math.min(starts[1], Math.max(0, previous.duration - 1)), 6, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const result = await comparisonRequest(video.id, "analyze", { previousVideoId: previous.id, currentFrames, previousFrames }, controller.signal);
      if (controller.signal.aborted) return;
      setSuggestions(result.observations || []);
      if (align && result.alignment) { if (adjustOffset(result.alignment.offset)) { seek(result.alignment.currentTime, result.alignment.offset); setMessage("Aligned near the top of the backswing. Check both positions and fine-tune if needed."); } }
      else setMessage(align ? "Auto Sync wasn't confident. Pause each video at the same swing position, then choose Align These Positions." : result.observations?.length ? "Private suggestions are ready. Edit, accept, or ignore each one." : "There wasn't enough visible evidence to suggest a change.");
    } catch (error) { setMessage(controller.signal.aborted ? "Comparison review cancelled." : error instanceof Error ? error.message : "Swing review failed. Manual alignment is available."); }
    finally { operationBusy.current = false; setBusy(false); }
  }

  if (student && !exists && !loadError) return null;
  if (loadError) return <section className="panel"><p role="status">{loadError}</p><button type="button" onClick={() => setReload(n => n + 1)}>Retry comparison</button></section>;
  if (!student && !open) return <button className="secondary-action" type="button" onClick={() => setOpen(true)}>{exists ? "Review Swing Comparison" : "Compare Swing"}</button>;
  if (!loaded) return <p role="status">Loading comparison…</p>;
  if (student && !previous) return null;
  const notes = [draft.notes ? "What Changed\n" + draft.notes : "", draft.approvedObservations.length ? "Approved MAI observations\n" + draft.approvedObservations.map(item => "• " + item).join("\n") : ""].filter(Boolean).join("\n\n");
  return <section className="panel swing-comparison" aria-label="Swing comparison">
    <div className="button-row"><h2>Swing Comparison</h2>{!student && <button disabled={busy} className="text-button" type="button" onClick={() => { pause(); rememberPositions(); setOpen(false); }}>Close comparison</button>}</div>
    {!student && <label>Compare with a previous lesson<select disabled={busy || Boolean(editor)} value={draft.previousVideoId} onChange={event => {
      if (dirty && !window.confirm("Discard unsaved comparison edits and choose another lesson?")) return;
      pause(); positions.current = [null, null]; offsetRef.current = 0; setTime(0); setLinked(true); linkedRef.current = true; if (players.current[0]) players.current[0].currentTime = 0; setDraft(empty(event.target.value)); setDirty(true); setSuggestions([]); setMessage("");
    }}><option value="">Choose a lesson</option>{lessons.map(item => <option value={item.id} key={item.id}>{new Date(item.uploadedAt).toLocaleDateString()} · {item.title}</option>)}</select></label>}
    {!student && !lessons.length && <p>No earlier playable lessons are available for this Student yet.</p>}
    {previous && <>
      <div className="button-row" role="group" aria-label="Comparison layout">{[["both", "Side by side"], ["current", "Current only"], ["previous", "Previous only"]].map(([value, label]) => <button className="secondary-action compact-action" type="button" aria-pressed={layout === value} key={value} onClick={() => setLayout(value)}>{label}</button>)}</div>
      {editor ? renderEditor(editor, () => { setEditor(null); setEditorVersion(n => n + 1); }, positions.current[editor.id === video.id ? 0 : 1] ?? 0) : <>
        <div className={`swing-pair layout-${layout}`} key={editorVersion}>
          {[video, previous].map((item, index) => <article key={item.id} hidden={layout !== "both" && layout !== (index ? "previous" : "current")}>
            <h3>{index ? "Previous Swing" : "Current Swing"}</h3><p>{new Date(item.uploadedAt).toLocaleDateString()} · {item.title}</p>
            {renderPlayer(item, index ? registerPrevious : registerCurrent, index ? draft.previousMarkups : draft.currentMarkups)}
            {!student && <div className="button-row"><button disabled={busy} className="secondary-action compact-action" type="button" onClick={() => { pause(); rememberPositions(); setEditor(item); }}>Annotate {index ? "previous" : "current"}</button><label><input disabled={busy} type="checkbox" checked={index ? draft.previousMarkups : draft.currentMarkups} onChange={event => change(index ? { previousMarkups: event.target.checked } : { currentMarkups: event.target.checked })} />Show published markups to Student</label></div>}
          </article>)}
        </div>
        <div className="comparison-transport" tabIndex={0} aria-label="Linked swing playback" onKeyDown={event => {
          if (busy) return;
          if ((event.target as HTMLElement).matches("input,select,textarea,button")) return;
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); void stepFrames(event.key === "ArrowLeft" ? -1 : 1); }
          if (event.code === "Space") { event.preventDefault(); void play(); }
        }}>
          <input aria-label="Linked swing timeline" type="range" min={range.start} max={range.end || 0.01} step={1 / fps} value={Math.max(range.start, Math.min(time, range.end))} disabled={busy} onChange={event => seek(Number(event.target.value))} />
          <div className="button-row"><button type="button" className="primary-action" disabled={busy || range.end <= range.start} onClick={() => void play()}>{playing ? "Pause both" : "Play both"}</button><FrameStepButton disabled={busy} onStep={() => stepFrames(-1)}>← Previous frame</FrameStepButton><FrameStepButton disabled={busy} onStep={() => stepFrames(1)}>Next frame →</FrameStepButton><output>{time.toFixed(3)}s · Frame ≈ {Math.round(time * fps) + 1}</output><label>Step rate<select value={fps} onChange={event => setFps(Number(event.target.value))}>{[24, 25, 30, 50, 60, 120, 240].map(rate => <option key={rate} value={rate}>{rate} fps</option>)}</select></label></div>
          <small>Hold a frame button to move slowly; release to stop. Frame count is approximate. Focus this control to use ← / → and Space. Comparison playback is muted.</small>
          <label>Playback speed<select aria-label="Both swings playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.25, 0.5, 0.75, 1].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
        </div>
        {!student && <>
          <div className="button-row"><button className="primary-action" type="button" disabled={busy} onClick={() => void analyze(true)}>Auto Sync Swings</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void analyze(false)}>Suggest What Changed</button>{busy && <button type="button" onClick={() => operation.current?.abort()}>Cancel AI review</button>}</div>
          <p className="comparison-hint">For longer lessons, pause each video near the swing first. MAI checks a short sequence around those positions.</p>
          <details><summary>Adjust alignment</summary>
            <label><input disabled={busy} type="checkbox" checked={linked} onChange={event => { pause(); linkedRef.current = event.target.checked; setLinked(event.target.checked); if (event.target.checked) seek(time); }} />Link timelines</label>
            <p>Unlink to pause each swing at the same position, such as the top of the backswing. Then align and fine-tune.</p>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => { const [a, b] = players.current; if (a && b) adjustOffset(b.currentTime - a.currentTime); }}>Align These Positions</button>
              <button type="button" disabled={busy} onClick={() => adjustOffset(draft.offset - 1 / fps)}>← Previous one frame earlier</button>
              <button type="button" disabled={busy} onClick={() => adjustOffset(draft.offset + 1 / fps)}>Previous one frame later →</button>
              <button type="button" disabled={busy} onClick={() => { adjustOffset(0); seek(0, 0); }}>Reset alignment</button>
              <output>Offset {draft.offset.toFixed(3)}s</output>
            </div>
          </details>
        </>}
      </>}
      {!student && <fieldset disabled={busy} className="comparison-notes">
        <legend>Coach Notes</legend><label>What Changed<textarea maxLength={3000} value={draft.notes} onChange={event => change({ notes: event.target.value })} placeholder={"• More balanced finish\n• Keep the same posture through the turn"} /></label>
        {suggestions.length > 0 && <section><h3>Private MAI suggestions</h3>{suggestions.map((suggestion, index) => <div className="comparison-suggestion" key={index}><textarea aria-label={`Edit suggestion ${index + 1}`} maxLength={400} value={suggestion} onChange={event => setSuggestions(items => items.map((item, i) => i === index ? event.target.value : item))} /><div className="button-row"><button type="button" onClick={() => { if (suggestion.trim() && !draft.approvedObservations.includes(suggestion.trim())) change({ approvedObservations: [...draft.approvedObservations, suggestion.trim()].slice(0, 5) }); setSuggestions(items => items.filter((_, i) => i !== index)); }}>Accept</button><button type="button" onClick={() => setSuggestions(items => items.filter((_, i) => i !== index))}>Ignore</button></div></div>)}</section>}
        {draft.approvedObservations.length > 0 && <section><h3>Approved observations</h3>{draft.approvedObservations.map((item, index) => <div key={index}><textarea aria-label={`Approved observation ${index + 1}`} value={item} maxLength={400} onChange={event => change({ approvedObservations: draft.approvedObservations.map((value, i) => i === index ? event.target.value : value) })} /><button type="button" onClick={() => change({ approvedObservations: draft.approvedObservations.filter((_, i) => i !== index) })}>Remove</button></div>)}</section>}
        {onApproveNotes && <button type="button" disabled={!notes.trim()} onClick={() => { onApproveNotes(notes); setMessage("Added to the Coach Lesson Summary for your review. Save or publish the lesson to keep it."); }}>Add Notes to Lesson Summary</button>}
        <label><input type="checkbox" checked={draft.includeWithLesson} onChange={event => change({ includeWithLesson: event.target.checked })} />Include this saved comparison when I publish the lesson</label>
        <p>Draft edits stay private. Students see only published lessons, published markups you selected, and approved notes.</p>
        <div className="button-row"><button type="button" className="secondary-action" onClick={() => void save("save")}>Save Comparison Draft</button><button type="button" className="primary-action" disabled={video.publicationStatus !== "Published" || previous.publicationStatus !== "Published"} onClick={() => void save("publish")}>{published ? "Update Published Comparison" : "Publish Comparison"}</button>{published && <button type="button" onClick={() => void save("unpublish")}>Make comparison private</button>}</div>
        {video.publicationStatus !== "Published" && <small>Save the comparison with the checkbox above, then publish the lesson.</small>}
        {previous.publicationStatus !== "Published" && <small>Publish the previous lesson before sharing this comparison with the Student.</small>}
        <small>{dirty ? "Unsaved comparison edits" : exists ? "Comparison saved" : "No comparison saved yet"}</small>
      </fieldset>}
      {student && notes && <LessonFeedback text={notes} />}
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
