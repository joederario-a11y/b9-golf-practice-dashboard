import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const golfSessionSnapshots = sqliteTable("golf_session_snapshots", {
  userEmail: text("user_email").primaryKey(),
  userId: text("user_id"),
  displayName: text("display_name"),
  sessionsJson: text("sessions_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("golf_session_snapshots_user_id_unique").on(table.userId),
]);

export const golfPracticeProfiles = sqliteTable("golf_practice_profiles", {
  userEmail: text("user_email").primaryKey(),
  userId: text("user_id"),
  displayName: text("display_name"),
  profileJson: text("profile_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("golf_practice_profiles_user_id_unique").on(table.userId),
]);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull().default("member"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    skillLevel: text("skill_level"),
    notes: text("notes"),
    accountStatus: text("account_status").notNull().default("active"),
    passwordResetRequired: integer("password_reset_required", { mode: "boolean" }).notNull().default(false),
    inviteStatus: text("invite_status").notNull().default("pending"),
    invitedAt: text("invited_at"),
    lastLoginAt: text("last_login_at"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_idx").on(table.role),
  ],
);

export const maiCaddySessionAnalyses = sqliteTable(
  "mai_caddy_session_analyses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull().default("processing"),
    analysisJson: text("analysis_json").notNull().default("{}"),
    calculatedMetricsJson: text("calculated_metrics_json").notNull().default("{}"),
    model: text("model"),
    promptVersion: text("prompt_version").notNull().default("mai-caddy-v1"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("mai_caddy_session_analyses_user_idx").on(table.userId),
    index("mai_caddy_session_analyses_session_idx").on(table.sessionId),
    index("mai_caddy_session_analyses_user_session_idx").on(table.userId, table.sessionId, table.createdAt),
    index("mai_caddy_session_analyses_current_idx").on(table.userId, table.sessionId, table.isCurrent),
    uniqueIndex("mai_caddy_session_analyses_one_current_unique")
      .on(table.userId, table.sessionId)
      .where(sql`${table.isCurrent} = 1`),
  ],
);

export const practiceActivities = sqliteTable(
  "practice_activities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    generatedBy: text("generated_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    focusArea: text("focus_area").notNull(),
    title: text("title").notNull(),
    reasonSelected: text("reason_selected").notNull().default(""),
    instructionsJson: text("instructions_json").notNull().default("{}"),
    club: text("club"),
    durationMinutes: integer("duration_minutes"),
    attemptCount: integer("attempt_count"),
    targetJson: text("target_json").notNull().default("{}"),
    scoringJson: text("scoring_json").notNull().default("{}"),
    sourceContextJson: text("source_context_json").notNull().default("{}"),
    coachId: text("coach_id").references(() => users.id, { onDelete: "set null" }),
    coachAssignmentId: text("coach_assignment_id"),
    coachFeedbackSourceId: text("coach_feedback_source_id"),
    relatedSessionId: text("related_session_id"),
    status: text("status").notNull().default("generated"),
    model: text("model"),
    promptVersion: text("prompt_version").notNull().default("mai-practice-generator-v1"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("practice_activities_user_idx").on(table.userId, table.createdAt),
    index("practice_activities_generated_by_idx").on(table.generatedBy, table.createdAt),
    index("practice_activities_coach_idx").on(table.coachId, table.createdAt),
    index("practice_activities_session_idx").on(table.relatedSessionId),
    uniqueIndex("practice_activities_one_active_focus_unique")
      .on(table.userId, table.activityType, table.focusArea)
      .where(sql`${table.status} IN ('generated', 'in_progress')`),
  ],
);

export const practiceActivityResults = sqliteTable(
  "practice_activity_results",
  {
    id: text("id").primaryKey(),
    practiceActivityId: text("practice_activity_id").notNull().references(() => practiceActivities.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    relatedSessionId: text("related_session_id"),
    submissionType: text("submission_type").notNull(),
    score: real("score"),
    attempts: integer("attempts"),
    successfulAttempts: integer("successful_attempts"),
    metricsJson: text("metrics_json").notNull().default("{}"),
    resultNotes: text("result_notes").notNull().default(""),
    userReflection: text("user_reflection").notNull().default(""),
    mediaReferenceJson: text("media_reference_json").notNull().default("{}"),
    progressStatus: text("progress_status").notNull().default("insufficient_data"),
    progressEvidenceJson: text("progress_evidence_json").notNull().default("[]"),
    nextRecommendationJson: text("next_recommendation_json").notNull().default("{}"),
    sharedWithCoach: integer("shared_with_coach", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("practice_activity_results_activity_idx").on(table.practiceActivityId, table.createdAt),
    index("practice_activity_results_user_idx").on(table.userId, table.createdAt),
  ],
);

export const coachFeedback = sqliteTable(
  "coach_feedback",
  {
    id: text("id").primaryKey(),
    golferId: text("golfer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coachId: text("coach_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessonVideos.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    status: text("status").notNull().default("active"),
    priority: text("priority").notNull().default(""),
    observationsJson: text("observations_json").notNull().default("[]"),
    prescribedDrillsJson: text("prescribed_drills_json").notNull().default("[]"),
    swingFeelsJson: text("swing_feels_json").notNull().default("[]"),
    successTargetsJson: text("success_targets_json").notNull().default("[]"),
    rawNotes: text("raw_notes"),
    sourceType: text("source_type").notNull().default("lesson_video"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("coach_feedback_golfer_status_idx").on(table.golferId, table.status, table.createdAt),
    index("coach_feedback_coach_idx").on(table.coachId, table.createdAt),
    uniqueIndex("coach_feedback_lesson_unique")
      .on(table.lessonId)
      .where(sql`${table.lessonId} IS NOT NULL`),
  ],
);

export const coachMembers = sqliteTable(
  "coach_members",
  {
    id: text("id").primaryKey(),
    coachId: text("coach_id").notNull(),
    memberId: text("member_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("coach_members_assignment_unique").on(table.coachId, table.memberId),
    index("coach_members_member_idx").on(table.memberId),
  ],
);

export const coachProfileImages = sqliteTable(
  "coach_profile_images",
  {
    id: text("id").primaryKey(),
    coachUserId: text("coach_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("coach_profile_images_coach_idx").on(table.coachUserId, table.createdAt),
    uniqueIndex("coach_profile_images_current_unique")
      .on(table.coachUserId)
      .where(sql`${table.isCurrent} = 1`),
    uniqueIndex("coach_profile_images_storage_unique").on(table.storagePath),
  ],
);

export const userProfileImages = sqliteTable(
  "user_profile_images",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_profile_images_user_idx").on(table.userId, table.createdAt),
    uniqueIndex("user_profile_images_current_unique")
      .on(table.userId)
      .where(sql`${table.isCurrent} = 1`),
    uniqueIndex("user_profile_images_storage_unique").on(table.storagePath),
  ],
);

export const memberInvitations = sqliteTable(
  "member_invitations",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    coachId: text("coach_id"),
    emailTo: text("email_to").notNull(),
    inviteToken: text("invite_token").notNull(),
    inviteUrl: text("invite_url").notNull(),
    status: text("status").notNull().default("pending"),
    providerId: text("provider_id"),
    failureReason: text("failure_reason"),
    expiresAt: text("expires_at"),
    acceptedAt: text("accepted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("member_invitations_token_unique").on(table.inviteToken),
    index("member_invitations_member_idx").on(table.memberId, table.createdAt),
  ],
);

export const lessonVideos = sqliteTable(
  "lesson_videos",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    coachId: text("coach_id"),
    uploadedByRole: text("uploaded_by_role").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    coachNotes: text("coach_notes").notNull().default(""),
    coachPrivateNotes: text("coach_private_notes").notNull().default(""),
    userNotes: text("user_notes").notNull().default(""),
    videoType: text("video_type").notNull().default("Lesson Recap"),
    focusArea: text("focus_area"),
    swingType: text("swing_type"),
    club: text("club"),
    tagsJson: text("tags_json").notNull().default("[]"),
    sessionDataId: text("session_data_id"),
    storagePath: text("storage_path").notNull(),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceStoragePath: text("source_storage_path"),
    sourceFileName: text("source_file_name"),
    sourceFileSize: integer("source_file_size"),
    sourceMimeType: text("source_mime_type"),
    sourceMediaProbeJson: text("source_media_probe_json").notNull().default("{}"),
    playbackMediaProbeJson: text("playback_media_probe_json").notNull().default("{}"),
    duration: integer("duration").notNull().default(0),
    lessonDate: text("lesson_date"),
    publicationStatus: text("publication_status").notNull().default("Draft"),
    uploadStatus: text("upload_status").notNull().default("pending"),
    reviewStatus: text("review_status").notNull().default("New"),
    emailStatus: text("email_status").notNull().default("Not sent"),
    emailSentAt: text("email_sent_at"),
    emailFailureReason: text("email_failure_reason"),
    isViewedByMember: integer("is_viewed_by_member", { mode: "boolean" }).notNull().default(false),
    viewedAt: text("viewed_at"),
    lessonSummary: text("lesson_summary").notNull().default(""),
    workedOn: text("worked_on").notNull().default(""),
    keyIssue: text("key_issue").notNull().default(""),
    improvement: text("improvement").notNull().default(""),
    practiceAssignment: text("practice_assignment").notNull().default(""),
    recommendedDrill: text("recommended_drill").notNull().default(""),
    memberFacingNotes: text("member_facing_notes").notNull().default(""),
    nextSessionGoal: text("next_session_goal").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lesson_videos_member_idx").on(table.memberId, table.createdAt),
    index("lesson_videos_coach_idx").on(table.coachId, table.createdAt),
    index("lesson_videos_status_idx").on(table.publicationStatus, table.uploadStatus),
    index("lesson_videos_source_storage_idx").on(table.sourceStoragePath),
  ],
);

export const lessonSessionLinks = sqliteTable(
  "lesson_session_links",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull().references(() => lessonVideos.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    memberId: text("member_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coachId: text("coach_id").references(() => users.id, { onDelete: "set null" }),
    attachedByUserId: text("attached_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    attachedByRole: text("attached_by_role").notNull().default("member"),
    sourceType: text("source_type").notNull().default("existing_session"),
    reviewStatus: text("review_status").notNull().default("Ready"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    recapUpdateStatus: text("recap_update_status").notNull().default("not_needed"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lesson_session_links_video_session_unique").on(table.videoId, table.sessionId),
    index("lesson_session_links_video_idx").on(table.videoId, table.isPrimary, table.createdAt),
    index("lesson_session_links_member_idx").on(table.memberId, table.createdAt),
    index("lesson_session_links_session_idx").on(table.sessionId),
    uniqueIndex("lesson_session_links_one_primary_unique")
      .on(table.videoId)
      .where(sql`${table.isPrimary} = 1`),
  ],
);

export const videoAiProcessingJobs = sqliteTable(
  "video_ai_processing_jobs",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull().references(() => lessonVideos.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coachId: text("coach_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    processingType: text("processing_type").notNull().default("lesson_recap_voiceover"),
    processingVersion: integer("processing_version").notNull().default(1),
    requestedLanguage: text("requested_language").notNull().default("en"),
    status: text("status").notNull().default("queued"),
    currentStep: text("current_step").notNull().default("queued_for_transcription"),
    attemptCount: integer("attempt_count").notNull().default(0),
    workflowInstanceId: text("workflow_instance_id"),
    audioStoragePath: text("audio_storage_path"),
    audioDeletedAt: text("audio_deleted_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("video_ai_processing_jobs_version_unique").on(table.videoId, table.processingType, table.processingVersion),
    index("video_ai_processing_jobs_video_idx").on(table.videoId, table.createdAt),
    index("video_ai_processing_jobs_member_idx").on(table.memberId, table.createdAt),
    index("video_ai_processing_jobs_status_idx").on(table.status, table.updatedAt),
  ],
);

export const videoTranscripts = sqliteTable(
  "video_transcripts",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull().references(() => lessonVideos.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coachId: text("coach_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    transcriptText: text("transcript_text").notNull().default(""),
    segmentsJson: text("segments_json").notNull().default("[]"),
    language: text("language").notNull().default("en"),
    model: text("model").notNull(),
    durationSeconds: real("duration_seconds"),
    processingJobId: text("processing_job_id").notNull().references(() => videoAiProcessingJobs.id, { onDelete: "cascade" }),
    processingVersion: integer("processing_version").notNull().default(1),
    qualityJson: text("quality_json").notNull().default("{}"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("video_transcripts_video_idx").on(table.videoId, table.createdAt),
    index("video_transcripts_job_idx").on(table.processingJobId),
    uniqueIndex("video_transcripts_current_unique")
      .on(table.videoId, table.processingVersion)
      .where(sql`${table.isCurrent} = 1`),
  ],
);

export const videoLessonRecapDrafts = sqliteTable(
  "video_lesson_recap_drafts",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull().references(() => lessonVideos.id, { onDelete: "cascade" }),
    transcriptId: text("transcript_id").notNull().references(() => videoTranscripts.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    coachId: text("coach_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    processingJobId: text("processing_job_id").notNull().references(() => videoAiProcessingJobs.id, { onDelete: "cascade" }),
    processingVersion: integer("processing_version").notNull().default(1),
    lessonSummary: text("lesson_summary").notNull().default(""),
    workedOn: text("worked_on").notNull().default(""),
    keyIssue: text("key_issue").notNull().default(""),
    improvement: text("improvement").notNull().default(""),
    practiceAssignment: text("practice_assignment").notNull().default(""),
    recommendedDrill: text("recommended_drill").notNull().default(""),
    memberFacingNotes: text("member_facing_notes").notNull().default(""),
    nextSessionGoal: text("next_session_goal").notNull().default(""),
    progressObservedJson: text("progress_observed_json").notNull().default("[]"),
    metricsMentionedJson: text("metrics_mentioned_json").notNull().default("[]"),
    transcriptEvidenceJson: text("transcript_evidence_json").notNull().default("[]"),
    confidence: real("confidence").notNull().default(0),
    model: text("model"),
    promptVersion: text("prompt_version").notNull().default("mai-video-recap-v1"),
    status: text("status").notNull().default("generating"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("video_lesson_recap_drafts_video_idx").on(table.videoId, table.createdAt),
    index("video_lesson_recap_drafts_status_idx").on(table.status, table.updatedAt),
    index("video_lesson_recap_drafts_job_idx").on(table.processingJobId),
    uniqueIndex("video_lesson_recap_drafts_current_unique")
      .on(table.videoId, table.processingVersion)
      .where(sql`${table.isCurrent} = 1`),
  ],
);

export const memberContentItems = sqliteTable(
  "member_content_items",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    createdBy: text("created_by").notNull(),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    visibility: text("visibility").notNull().default("member"),
    status: text("status").notNull().default("active"),
    sessionDataId: text("session_data_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("member_content_member_idx").on(table.memberId, table.createdAt),
    index("member_content_created_by_idx").on(table.createdBy, table.createdAt),
  ],
);

export const memberActivityLog = sqliteTable(
  "member_activity_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    actorRole: text("actor_role").notNull(),
    memberId: text("member_id"),
    targetUserId: text("target_user_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("member_activity_member_idx").on(table.memberId, table.createdAt),
    index("member_activity_actor_idx").on(table.actorId, table.createdAt),
    index("member_activity_target_idx").on(table.targetUserId, table.createdAt),
  ],
);

export const videoViews = sqliteTable(
  "video_views",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    memberId: text("member_id").notNull(),
    viewedAt: text("viewed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("video_views_video_idx").on(table.videoId),
    index("video_views_member_idx").on(table.memberId),
  ],
);

export const videoEmailNotifications = sqliteTable(
  "video_email_notifications",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(),
    memberId: text("member_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    emailTo: text("email_to").notNull(),
    emailSubject: text("email_subject").notNull(),
    status: text("status").notNull(),
    providerId: text("provider_id"),
    failureReason: text("failure_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("video_email_notifications_video_idx").on(table.videoId),
    index("video_email_notifications_member_idx").on(table.memberId),
  ],
);

export const authLoginTokens = sqliteTable(
  "auth_login_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    userId: text("user_id"),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    redirectPath: text("redirect_path"),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("auth_login_tokens_hash_unique").on(table.tokenHash),
    index("auth_login_tokens_email_idx").on(table.email, table.createdAt),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [
    uniqueIndex("auth_sessions_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId, table.expiresAt),
  ],
);

export const userPasswords = sqliteTable("user_passwords", {
  userId: text("user_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
