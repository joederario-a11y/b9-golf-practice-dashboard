export const VIDEO_PROCESSING_STEP_STATES = new Set(["done", "active", "pending", "attention"]);

function lower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function timestamp(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? null;
}

function transcriptText(transcript) {
  return typeof transcript?.text === "string" ? transcript.text.trim() : "";
}

export function transcriptProof(transcript) {
  const text = transcriptText(transcript);
  if (!text) return "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const duration = Number(transcript?.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    const minutes = Math.floor(duration / 60);
    const seconds = String(Math.round(duration % 60)).padStart(2, "0");
    if (words > 0) {
      return `Transcript created · ${words} ${words === 1 ? "word" : "words"} captured from ${minutes}:${seconds} of lesson audio`;
    }
    return `Transcript created · ${minutes}:${seconds} of coaching audio processed`;
  }
  if (words > 0) return `Transcript created · ${words} ${words === 1 ? "word" : "words"} captured from the lesson audio`;
  return "Transcript created";
}

export function lessonProcessingStatus(input = {}) {
  const video = input.video ?? {};
  const job = input.job ?? null;
  const draft = input.draft ?? null;
  const transcript = input.transcript ?? null;
  const uploadStatus = lower(video.uploadStatus);
  const jobStatus = lower(job?.status);
  const jobStep = lower(job?.currentStep);
  const draftStatus = lower(draft?.status);
  const hasTranscript = Boolean(transcriptText(transcript));
  const hasReviewableDraft = Boolean(draft);
  const lastUpdatedAt = timestamp(draft?.updatedAt, transcript?.createdAt, job?.updatedAt, video.updatedAt, video.uploadedAt);

  if (uploadStatus && uploadStatus !== "ready") {
    const isFailedUpload = uploadStatus.includes("fail") || uploadStatus.includes("attention");
    return {
      code: isFailedUpload ? "needs_attention" : "uploading",
      title: isFailedUpload ? "Video upload needs attention" : "Video upload is still completing",
      explanation: isFailedUpload
        ? "The lesson record exists, but the video file was not confirmed in storage. Retry the upload before MAI Coach can process it."
        : "The lesson record exists, but MAI Coach has not confirmed the video file in storage yet.",
      lastUpdatedAt,
      safeFailureCode: isFailedUpload ? "video_upload_incomplete" : null,
    };
  }

  if (draftStatus === "published" || jobStatus === "published") {
    return {
      code: "published",
      title: "Coach-approved recap published",
      explanation: "The lesson video and approved recap are visible to the member.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "failed") {
    const safeFailureCode = job?.errorCode ?? "lesson_processing_failed";
    const audioSpecificFailure = [
      "audio_track_missing",
      "audio_extraction_failed",
      "audio_extraction_timeout",
      "cloudflare_normalization_failed",
      "unsupported_audio_codec",
      "unsupported_media_container",
    ].includes(safeFailureCode);
    return {
      code: "needs_attention",
      title: audioSpecificFailure ? "Audio processing needs attention" : "Lesson processing needs attention",
      explanation: audioSpecificFailure
        ? "We could not prepare the audio from this video. Your video is saved. Retry processing without uploading it again."
        : "Your video is saved. Retry processing without uploading it again.",
      lastUpdatedAt,
      safeFailureCode,
    };
  }

  if (jobStatus === "cancelled") {
    return {
      code: "cancelled",
      title: "Lesson processing cancelled",
      explanation: "The video is saved, but MAI Coach processing is not currently running.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "no_usable_audio") {
    return {
      code: "needs_attention",
      title: "Lesson processing needs attention",
      explanation: "Your video is saved, but MAI Coach did not detect enough clear coaching audio for a recap.",
      lastUpdatedAt,
      safeFailureCode: job?.errorCode ?? "no_usable_audio",
    };
  }

  if (draftStatus === "ready_for_review" || draftStatus === "needs_coach_input" || jobStatus === "ready_for_review") {
    return {
      code: "ready_for_review",
      title: "Lesson recap ready",
      explanation: "Review the transcript and coaching summary before publishing it to the member.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "generating_recap" || jobStep.includes("recap")) {
    return {
      code: "generating_recap",
      title: "Building lesson recap",
      explanation: "MAI Coach is organizing the transcript into feedback and practice priorities.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "transcribing" || jobStep.includes("transcrib") || hasTranscript) {
    return {
      code: hasReviewableDraft ? "ready_for_review" : "transcribing",
      title: hasTranscript ? "Transcript created" : "Listening to coaching feedback",
      explanation: hasTranscript
        ? "The transcript is saved. MAI Coach is preparing the lesson recap."
        : "MAI Coach is creating a transcript from the lesson audio.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "extracting_audio" || jobStep.includes("audio") || jobStep.includes("media")) {
    return {
      code: "extracting_audio",
      title: "Preparing lesson audio",
      explanation: "MAI Coach is separating the coaching audio from the video.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  if (jobStatus === "queued") {
    return {
      code: "queued",
      title: "Video uploaded",
      explanation: "Your lesson is waiting to be processed.",
      lastUpdatedAt,
      safeFailureCode: null,
    };
  }

  return {
    code: "stored",
    title: "Video uploaded",
    explanation: "Your lesson video is saved. MAI Coach processing has not started yet.",
    lastUpdatedAt,
    safeFailureCode: null,
  };
}

function failedProcessingStep(job) {
  const text = `${lower(job?.status)} ${lower(job?.currentStep)} ${lower(job?.errorCode)}`;
  if (text.includes("transcrib")) return "transcript";
  if (text.includes("recap") || text.includes("draft")) return "recap";
  if (text.includes("audio") || text.includes("media") || text.includes("mp4")) return "audio";
  return "audio";
}

export function lessonProcessingSteps(input = {}) {
  const video = input.video ?? {};
  const job = input.job ?? null;
  const draft = input.draft ?? null;
  const transcript = input.transcript ?? null;
  const status = lessonProcessingStatus(input);
  const uploadReady = lower(video.uploadStatus) === "ready" || !lower(video.uploadStatus);
  const hasTranscript = Boolean(transcriptText(transcript));
  const hasDraft = Boolean(draft);
  const failedStep = status.code === "needs_attention" ? failedProcessingStep(job) : "";

  const audioDone = hasTranscript || hasDraft || ["transcribing", "generating_recap", "ready_for_review", "published"].includes(status.code);
  const transcriptDone = hasTranscript || hasDraft || ["generating_recap", "ready_for_review", "published"].includes(status.code);
  const recapDone = hasDraft && ["ready_for_review", "published"].includes(status.code);

  return [
    {
      key: "video",
      label: "Video uploaded",
      state: uploadReady ? "done" : status.code === "needs_attention" ? "attention" : "active",
    },
    {
      key: "audio",
      label: audioDone ? "Audio extracted" : "Extracting audio",
      state: audioDone
        ? "done"
        : failedStep === "audio"
          ? "attention"
          : ["queued", "extracting_audio"].includes(status.code)
            ? "active"
            : uploadReady
              ? "pending"
              : "pending",
    },
    {
      key: "transcript",
      label: "Creating transcript",
      state: transcriptDone
        ? "done"
        : failedStep === "transcript"
          ? "attention"
          : status.code === "transcribing"
            ? "active"
            : "pending",
    },
    {
      key: "recap",
      label: recapDone ? "Lesson recap ready" : "Building lesson recap",
      state: recapDone
        ? "done"
        : failedStep === "recap"
          ? "attention"
          : status.code === "generating_recap"
            ? "active"
            : "pending",
    },
  ];
}

export function canShowVideoInLibrary(video, ownerId, viewerRole) {
  if (!video || video.ownerId !== ownerId) return false;
  if (viewerRole === "admin") return true;
  if (viewerRole === "coach") return true;
  const publicationStatus = String(video.publicationStatus ?? "Published");
  const uploadStatus = String(video.uploadStatus ?? "ready");
  return publicationStatus === "Published" && uploadStatus === "ready" && String(video.visibility ?? "") !== "Admin only";
}

export function videoLibraryVisibleCount(videos, ownerId, viewerRole) {
  return (Array.isArray(videos) ? videos : []).filter((video) => canShowVideoInLibrary(video, ownerId, viewerRole)).length;
}
