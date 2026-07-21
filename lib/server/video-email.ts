import {
  type AuthIdentity,
  createLoginToken,
  getPlatformEnvironment,
  getRequiredDatabase,
} from "./platform";
import { sendEmailMessage } from "./email-service";

type EmailVideo = {
  id: string;
  memberId: string;
  title: string;
  memberFacingNotes?: string;
  practiceAssignment?: string;
  lessonSummary?: string;
};

type EmailMember = {
  email: string;
  firstName: string;
  lastName: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function logNotification(values: {
  identity: AuthIdentity;
  member: EmailMember;
  status: "sent" | "failed";
  video: EmailVideo;
  providerId?: string;
  failureReason?: string;
}) {
  const database = getRequiredDatabase();
  await database
    .prepare(
      `INSERT INTO video_email_notifications (
        id, video_id, member_id, requested_by, email_to, email_subject,
        status, provider_id, failure_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      crypto.randomUUID(),
      values.video.id,
      values.video.memberId,
      values.identity.email,
      values.member.email,
      "Your new lesson video is ready",
      values.status,
      values.providerId ?? null,
      values.failureReason ?? null,
    )
    .run();
}

export async function sendVideoNotification(
  request: Request,
  identity: AuthIdentity,
  member: EmailMember,
  video: EmailVideo,
) {
  const runtime = getPlatformEnvironment();
  const notePreview = video.memberFacingNotes || video.practiceAssignment || video.lessonSummary || "";
  const appBaseUrl = runtime.APP_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const loginToken = await createLoginToken({
    email: member.email,
    purpose: "video",
    redirectPath: `/?tab=videos&video=${encodeURIComponent(video.id)}`,
    userId: video.memberId,
  });
  const videoLink = `${appBaseUrl}/?tab=videos&video=${encodeURIComponent(video.id)}&login=${encodeURIComponent(loginToken)}`;
  const noteBlock = notePreview
    ? `<p style="margin:16px 0;padding:14px;border-left:3px solid #96cb39;background:#edfdf2;">${escapeHtml(notePreview)}</p>`
    : "";
  const coachName = escapeHtml(identity.displayName);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#10171F;line-height:1.6;">
      <p>Hi ${escapeHtml(member.firstName)},</p>
      <p>${coachName} uploaded a new lesson video for you: <strong>${escapeHtml(video.title)}</strong>.</p>
      <p>Log in to watch it and review your coach notes.</p>
      ${noteBlock}
      <p style="margin:28px 0;">
        <a href="${escapeHtml(videoLink)}" style="display:inline-block;background:#10171F;color:#96cb39;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">View your lesson video</a>
      </p>
    </div>
  `;

  const result = await sendEmailMessage({
    html,
    subject: "Your new lesson video is ready",
    toEmail: member.email,
  });
  if (result.success) {
    await logNotification({ identity, member, status: "sent", video, providerId: result.providerMessageId });
    return { status: "Sent" as const, providerId: result.providerMessageId };
  }
  const failureReason = result.errorCode ?? "email_failed";
  await logNotification({ identity, member, status: "failed", video, failureReason });
  return { status: "Failed" as const, failureReason };
}
