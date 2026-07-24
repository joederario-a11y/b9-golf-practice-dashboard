import assert from "node:assert/strict";
import test from "node:test";

import {
  canDirectTranscribeStoredMedia,
  inferCodecProbeFromBytes,
  MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES,
  MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES,
  mediaContainerFromMimeType,
  normalizeVideoProcessingSafeCode,
  transcriptionSizeLimitForMedia,
} from "../lib/video-media-processing-policy.mjs";

test("WebM media probe detects VP8 video and Opus audio track hints", () => {
  const bytes = new TextEncoder().encode("webm\u0000CodecID\u0000V_VP8\u0000CodecID\u0000A_OPUS");
  const probe = inferCodecProbeFromBytes(bytes, "video/webm", 131);

  assert.equal(probe.container, "webm");
  assert.equal(probe.hasVideo, true);
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.videoCodec, "vp8");
  assert.equal(probe.audioCodec, "opus");
  assert.equal(probe.durationSeconds, 131);
});

test("video-only WebM is not treated as directly transcribable", () => {
  const bytes = new TextEncoder().encode("webm\u0000CodecID\u0000V_VP8");
  const probe = inferCodecProbeFromBytes(bytes, "video/webm", 120);

  assert.equal(probe.hasAudio, false);
  assert.equal(canDirectTranscribeStoredMedia({
    hasAudio: probe.hasAudio,
    mimeType: "video/webm",
    size: 20 * 1024 * 1024,
  }), false);
});

test("small supported WebM can use direct transcription fallback after Cloudflare failure", () => {
  assert.equal(canDirectTranscribeStoredMedia({
    hasAudio: true,
    mimeType: "video/webm",
    size: 37_537_097,
  }), true);
  assert.equal(transcriptionSizeLimitForMedia({
    isOriginalMedia: true,
    mimeType: "video/webm",
    size: 37_537_097,
  }), MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES);
});

test("extracted audio keeps the stricter transcription size limit", () => {
  assert.equal(transcriptionSizeLimitForMedia({
    isOriginalMedia: false,
    mimeType: "audio/mp4",
    size: 24 * 1024 * 1024,
  }), MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES);
});

test("large media is not sent directly and must use extraction or chunking", () => {
  assert.equal(canDirectTranscribeStoredMedia({
    hasAudio: true,
    mimeType: "video/quicktime",
    size: 178 * 1024 * 1024,
  }), false);
});

test("safe codes preserve stage-specific Cloudflare and size failures", () => {
  assert.equal(mediaContainerFromMimeType("video/quicktime"), "mov");
  assert.equal(normalizeVideoProcessingSafeCode("mp4_fallback_failed", "Cloudflare Media could not normalize this video."), "cloudflare_normalization_failed");
  assert.equal(normalizeVideoProcessingSafeCode("audio_too_large", "The lesson media is too large."), "transcription_file_too_large");
});
