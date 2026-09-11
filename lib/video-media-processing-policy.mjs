export const MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;
export const MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES = 50 * 1024 * 1024;

const SAFE_ERROR_CODE_FALLBACK = "processing_failed";

export const VIDEO_PROCESSING_SAFE_ERROR_CODES = new Set([
  "media_object_missing",
  "media_object_incomplete",
  "source_object_missing",
  "source_object_incomplete",
  "audio_track_missing",
  "playback_derivative_audio_missing",
  "unsupported_media_container",
  "unsupported_audio_codec",
  "media_probe_failed",
  "cloudflare_normalization_failed",
  "audio_extraction_failed",
  "audio_extraction_timeout",
  "direct_transcription_failed",
  "direct_transcription_rejected",
  "transcription_file_too_large",
  "transcription_failed",
  "transcript_empty",
  "recap_generation_failed",
  "workflow_binding_missing",
  "workflow_start_failed",
  "coach_relationship_changed",
  "processing_cancelled",
  "invalid_processing_job",
  "video_not_ready",
]);

export function normalizeVideoProcessingSafeCode(code, message = "") {
  const normalized = String(code ?? "").trim();
  if (VIDEO_PROCESSING_SAFE_ERROR_CODES.has(normalized)) return normalized;
  const text = `${normalized} ${message ?? ""}`.toLowerCase();
  // Workflow error serialization can discard custom error codes and prototypes.
  if (text.includes("could not detect enough coach voiceover")) return "transcript_empty";
  if (text.includes("missing") && (text.includes("r2") || text.includes("object") || text.includes("source video"))) {
    return text.includes("source") ? "source_object_missing" : "media_object_missing";
  }
  if (text.includes("incomplete") && text.includes("source")) return "source_object_incomplete";
  if (text.includes("missing") && text.includes("audio")) return "audio_track_missing";
  if (text.includes("too large")) return "transcription_file_too_large";
  if (text.includes("timeout") && (text.includes("audio") || text.includes("media"))) return "audio_extraction_timeout";
  if (text.includes("cloudflare media") || text.includes("normalize") || text.includes("normalization") || text.includes("mp4_fallback")) {
    return "cloudflare_normalization_failed";
  }
  if (text.includes("transcription") && (text.includes("rejected") || text.includes("invalid") || text.includes("unsupported"))) {
    return "direct_transcription_rejected";
  }
  if (text.includes("transcription")) return "transcription_failed";
  if (text.includes("recap")) return "recap_generation_failed";
  return SAFE_ERROR_CODE_FALLBACK;
}

export function videoProcessingFailure(error = {}) {
  const message = typeof error?.message === "string" ? error.message : "Video AI processing failed.";
  const code = normalizeVideoProcessingSafeCode(error?.code, message);
  const status = code === "transcript_empty" || code === "audio_track_missing"
    ? "no_usable_audio"
    : code === "processing_cancelled" ? "cancelled"
      : code === "coach_relationship_changed" ? "coach_relationship_changed" : "failed";
  return { code, message, status };
}

export function mediaContainerFromMimeType(mimeType = "") {
  const normalized = String(mimeType).trim().toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mp4") || normalized.includes("m4v")) return "mp4";
  if (normalized.includes("mpeg")) return "mpeg";
  return "";
}

export function isDirectTranscriptionMediaType(mimeType = "") {
  const container = mediaContainerFromMimeType(mimeType);
  return container === "webm" || container === "mp4" || container === "mov" || container === "mpeg";
}

export function canDirectTranscribeStoredMedia(values = {}) {
  const size = Number(values.size ?? 0);
  const hasAudio = values.hasAudio !== false;
  return Boolean(
    hasAudio &&
      isDirectTranscriptionMediaType(values.mimeType) &&
      Number.isFinite(size) &&
      size > 0 &&
      size <= MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES,
  );
}

export function transcriptionSizeLimitForMedia(values = {}) {
  return values.isOriginalMedia && canDirectTranscribeStoredMedia(values)
    ? MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES
    : MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES;
}

function decodeProbeSample(bytes) {
  if (!bytes) return "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder("latin1", { fatal: false }).decode(view.slice(0, Math.min(view.length, 8 * 1024 * 1024)));
}

export function inferCodecProbeFromBytes(bytes, mimeType = "", durationSeconds = null) {
  const container = mediaContainerFromMimeType(mimeType);
  const sample = decodeProbeSample(bytes);
  const videoCodec = sample.includes("V_VP9")
    ? "vp9"
    : sample.includes("V_VP8")
      ? "vp8"
      : sample.includes("V_AV1")
        ? "av1"
        : sample.includes("hvc1") || sample.includes("hev1")
          ? "hevc"
          : sample.includes("avc1")
            ? "h264"
            : container === "mp4" || container === "mov"
          ? "h264_or_hevc"
          : undefined;
  const audioCodec = sample.includes("A_OPUS")
    || sample.includes("OpusHead")
    ? "opus"
    : sample.includes("A_VORBIS")
      ? "vorbis"
      : sample.includes("A_AAC")
        || sample.includes("mp4a")
        || sample.includes("soun")
        ? "aac"
        : undefined;
  return {
    audioCodec,
    container,
    durationSeconds: Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0 ? Number(durationSeconds) : null,
    hasAudio: Boolean(audioCodec),
    hasVideo: Boolean(videoCodec) || container === "mp4" || container === "mov",
    videoCodec,
  };
}

export function mediaProbeResultFromBytes(bytes, values = {}) {
  const mimeType = String(values.mimeType ?? "");
  const probe = inferCodecProbeFromBytes(bytes, mimeType, values.durationSeconds);
  const objectSize = Number(values.objectSize ?? 0);
  return {
    audioCodec: probe.audioCodec,
    audioTrackCount: probe.hasAudio ? 1 : 0,
    container: probe.container || null,
    durationSeconds: probe.durationSeconds,
    mimeType,
    objectKey: String(values.objectKey ?? ""),
    objectSize: Number.isFinite(objectSize) && objectSize > 0 ? objectSize : 0,
    videoCodec: probe.videoCodec,
    videoTrackCount: probe.hasVideo ? 1 : 0,
  };
}

export function mediaProbeHasAudio(probe = {}) {
  return Number(probe.audioTrackCount ?? 0) > 0 || Boolean(probe.hasAudio);
}
