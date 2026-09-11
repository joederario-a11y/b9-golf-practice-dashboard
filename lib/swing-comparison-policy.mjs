export function comparisonRange(currentDuration, previousDuration, offset) {
  if (![currentDuration, previousDuration, offset].every(Number.isFinite)) return { start: 0, end: 0 };
  const start = Math.max(0, -offset);
  return { start, end: Math.max(start, Math.min(currentDuration, previousDuration - offset)) };
}

export function comparisonPairAllowed(current, previous) {
  return Boolean(current && previous && current.id !== previous.id && current.memberId === previous.memberId
    && current.uploadStatus === "ready" && previous.uploadStatus === "ready"
    && previous.publicationStatus !== "Archived"
    && Date.parse(previous.uploadedAt) <= Date.parse(current.uploadedAt));
}

export function normalizeComparison(value, currentDuration, previousDuration) {
  if (!value || typeof value !== "object" || typeof value.previousVideoId !== "string") throw new Error("Choose a previous lesson.");
  const offset = value.offset;
  const range = comparisonRange(currentDuration, previousDuration, offset);
  if (!Number.isFinite(offset) || range.end - range.start < 0.1) throw new Error("These swing positions do not overlap. Reset alignment.");
  return {
    previousVideoId: value.previousVideoId.slice(0, 120), offset,
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 3000) : "",
    approvedObservations: Array.isArray(value.approvedObservations) ? value.approvedObservations.filter(x => typeof x === "string").slice(0, 5).map(x => x.trim().slice(0, 400)).filter(Boolean) : [],
    currentMarkups: value.currentMarkups === true, previousMarkups: value.previousMarkups === true,
    includeWithLesson: value.includeWithLesson === true,
  };
}

export function confidentSwingAlignment(result, currentFrames, previousFrames) {
  const a = currentFrames.find(frame => frame.id === result?.currentFrameId);
  const b = previousFrames.find(frame => frame.id === result?.previousFrameId);
  if (!a || !b || result?.phase !== "top_of_backswing" || result?.confidence < 0.85
    || !Number.isFinite(result?.confidence) || result.confidence > 1 || result?.compatibleViews !== true) return null;
  return { offset: b.timestampSeconds - a.timestampSeconds, currentTime: a.timestampSeconds };
}
