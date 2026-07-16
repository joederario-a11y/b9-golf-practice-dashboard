import {
  type AuthIdentity,
  createLoginToken,
  getEmailFromAddress,
  getPlatformEnvironment,
  getRequiredDatabase,
} from "./platform";

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
  const emailFrom = getEmailFromAddress();
  const failureReason = "Email delivery is not configured. Add RESEND_API_KEY and VIDEO_EMAIL_FROM or RESEND_FROM.";

  if (!runtime.RESEND_API_KEY || !emailFrom) {
    await logNotification({ identity, member, status: "failed", video, failureReason });
    return { status: "Failed" as const, failureReason };
  }

  const noteBlock = notePreview
    ? `<p style="margin:16px 0;padding:14px;border-left:3px solid #35f27a;background:#edfdf2;">${escapeHtml(notePreview)}</p>`
    : "";
  const coachName = escapeHtml(identity.displayName);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17231d;line-height:1.6;">
      <p>Hi ${escapeHtml(member.firstName)},</p>
      <p>${coachName} uploaded a new lesson video for you: <strong>${escapeHtml(video.title)}</strong>.</p>
      <p>Log in to watch it and review your coach notes.</p>
      ${noteBlock}
      <p style="margin:28px 0;">
        <a href="${escapeHtml(videoLink)}" style="display:inline-block;background:#0b1511;color:#35f27a;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">View your lesson video</a>
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [member.email],
        subject: "Your new lesson video is ready",
        html,
      }),
    });
    const result = await response.json() as { id?: string; message?: string };
    if (!response.ok || !result.id) {
      throw new Error(result.message || "The email provider did not accept the notification.");
    }
    await logNotification({ identity, member, status: "sent", video, providerId: result.id });
    return { status: "Sent" as const, providerId: result.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email delivery failed.";
    await logNotification({ identity, member, status: "failed", video, failureReason: reason });
    return { status: "Failed" as const, failureReason: reason };
  }
}
