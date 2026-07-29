import assert from "node:assert/strict";
import test from "node:test";

import {
  canDirectTranscribeStoredMedia,
  inferCodecProbeFromBytes,
  MAX_AUDIO_EXTRACTION_TRANSCRIPTION_BYTES,
  MAX_DIRECT_MEDIA_TRANSCRIPTION_BYTES,
  mediaContainerFromMimeType,
  mediaProbeHasAudio,
  mediaProbeResultFromBytes,
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

test("MOV source probe detects H.264 video and AAC audio hints", () => {
  const bytes = new TextEncoder().encode("ftypqt  moov trak mdia hdlr vide avc1 trak mdia hdlr soun mp4a");
  const probe = mediaProbeResultFromBytes(bytes, {
    durationSeconds: 130.9,
    mimeType: "video/quicktime",
    objectKey: "lesson-videos/member/video/source.mov",
    objectSize: 178 * 1024 * 1024,
  });

  assert.equal(probe.container, "mov");
  assert.equal(probe.videoTrackCount, 1);
  assert.equal(probe.audioTrackCount, 1);
  assert.equal(probe.videoCodec, "h264");
  assert.equal(probe.audioCodec, "aac");
  assert.equal(mediaProbeHasAudio(probe), true);
});

test("MOV source without audio markers is not treated as audio-bearing", () => {
  const bytes = new TextEncoder().encode("ftypqt  moov trak mdia hdlr vide avc1");
  const probe = mediaProbeResultFromBytes(bytes, {
    durationSeconds: 130.9,
    mimeType: "video/quicktime",
    objectKey: "lesson-videos/member/video/source.mov",
    objectSize: 178 * 1024 * 1024,
  });

  assert.equal(probe.container, "mov");
  assert.equal(probe.videoTrackCount, 1);
  assert.equal(probe.audioTrackCount, 0);
  assert.equal(mediaProbeHasAudio(probe), false);
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

test("small MOV media can use direct fallback after normalization fails", () => {
  assert.equal(mediaContainerFromMimeType("video/quicktime"), "mov");
  assert.equal(canDirectTranscribeStoredMedia({
    hasAudio: true,
    mimeType: "video/quicktime",
    size: 25 * 1024 * 1024,
  }), true);
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
