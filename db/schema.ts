import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lesson_videos_member_idx").on(table.memberId, table.createdAt),
    index("lesson_videos_coach_idx").on(table.coachId, table.createdAt),
    index("lesson_videos_status_idx").on(table.publicationStatus, table.uploadStatus),
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
