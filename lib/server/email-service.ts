import {
  createLoginToken,
  getEmailFromAddress,
  getPlatformEnvironment,
  getRequiredDatabase,
  hashToken,
  type AuthIdentity,
  type UserRole,
} from "./platform";

const ACCOUNT_SETUP_TTL_SECONDS = 60 * 60 * 72;
const EMAIL_PROVIDER_URL = "https://api.resend.com/emails";

export type EmailSendResult = {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  safeMessage?: string;
};

type AccountSetupUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole | string;
  invite_status?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function baseUrlForRequest(request: Request) {
  const runtime = getPlatformEnvironment();
  const requestUrl = new URL(request.url);
  const configured = runtime.APP_BASE_URL?.replace(/\/$/, "");
  const isLocalRequest =
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1" ||
    requestUrl.hostname === "::1";
  return configured && !isLocalRequest ? configured : configured || requestUrl.origin;
}

function setupUrlForToken(request: Request, token: string) {
  const url = new URL("/setup-account", baseUrlForRequest(request));
  url.searchParams.set("token", token);
  return url.toString();
}

function setupBaseUrl(request: Request) {
  return new URL("/setup-account", baseUrlForRequest(request)).toString();
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providerErrorCode(status: number, message = "") {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("api key")) return "provider_auth_failed";
  if (status === 403 || lower.includes("domain") || lower.includes("sender")) return "sender_not_verified";
  if (status === 429 || lower.includes("rate")) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

export function getEmailConfigurationDiagnostic() {
  const runtime = getPlatformEnvironment();
  const apiKeyPresent = Boolean(runtime.RESEND_API_KEY);
  const fromAddressConfigured = Boolean(getEmailFromAddress());
  const appBaseUrlConfigured = Boolean(runtime.APP_BASE_URL);
  return {
    configured: apiKeyPresent && fromAddressConfigured && appBaseUrlConfigured,
    apiKeyPresent,
    fromAddressConfigured,
    appBaseUrlConfigured,
    provider: "resend" as const,
  };
}

async function sendResendEmail(values: {
  html: string;
  subject: string;
  text?: string;
  to: string;
}): Promise<EmailSendResult> {
  const runtime = getPlatformEnvironment();
  const from = getEmailFromAddress();
  if (!runtime.RESEND_API_KEY || !from || !runtime.APP_BASE_URL) {
    return {
      success: false,
      errorCode: "email_not_configured",
      safeMessage: "Email delivery is not configured.",
    };
  }

  try {
    const response = await fetch(EMAIL_PROVIDER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [values.to],
        subject: values.subject,
        html: values.html,
        text: values.text ?? plainTextFromHtml(values.html),
      }),
    });
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok || !result.id) {
      const errorCode = providerErrorCode(response.status, result.message ?? "");
      return {
        success: false,
        errorCode,
        safeMessage: "The email provider could not send this message.",
      };
    }
    return { success: true, providerMessageId: result.id };
  } catch {
    return {
      success: false,
      errorCode: "provider_unavailable",
      safeMessage: "The email provider could not be reached.",
    };
  }
}

export async function sendEmailMessage(values: {
  html: string;
  subject: string;
  text?: string;
  toEmail: string;
}) {
  return sendResendEmail({
    html: values.html,
    subject: values.subject,
    text: values.text,
    to: values.toEmail,
  });
}

function welcomeCopyForRole(role: string) {
  if (role === "coach") {
    return "Your Coach account gives you access to your player roster, lesson videos, session data, recaps, and practice plans.";
  }
  if (role === "admin") {
    return "Your Admin account gives you access to user management, coach rosters, lesson videos, sessions, and practice plans.";
  }
  return "Your Member account gives you access to your sessions, lesson videos, coaching feedback, and personalized practice plans.";
}

export async function sendWelcomeEmail(values: {
  actorName: string;
  setupUrl: string;
  toEmail: string;
  toFirstName: string;
  userRole: string;
}): Promise<EmailSendResult> {
  const subject = "Welcome to MAI Coach - Set up your account";
  const html = `
    <div style="margin:0;padding:0;background:#07110d;color:#f7fbf8;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid #263b33;border-radius:18px;background:#111c23;padding:28px;">
          <p style="margin:0 0 8px;color:#9bd032;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">MAI Coach</p>
          <h1 style="margin:0 0 18px;color:#ffffff;font-size:30px;line-height:1.15;">Welcome to MAI Coach</h1>
          <p style="margin:0 0 16px;color:#d6ded8;font-size:16px;line-height:1.6;">Hi ${escapeHtml(values.toFirstName || "there")},</p>
          <p style="margin:0 0 16px;color:#d6ded8;font-size:16px;line-height:1.6;">${escapeHtml(values.actorName || "Your coach")} has created your MAI Coach account.</p>
          <p style="margin:0 0 16px;color:#d6ded8;font-size:16px;line-height:1.6;">MAI Coach helps organize your golf sessions, coaching feedback, lesson videos, practice plans, and progress in one place.</p>
          <p style="margin:0 0 24px;color:#d6ded8;font-size:16px;line-height:1.6;">${escapeHtml(welcomeCopyForRole(values.userRole))}</p>
          <p style="margin:30px 0;">
            <a href="${escapeHtml(values.setupUrl)}" style="display:inline-block;background:#9bd032;color:#06100b;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:800;font-size:16px;">Set Up My Account</a>
          </p>
          <p style="margin:0 0 12px;color:#adb9b2;font-size:14px;line-height:1.5;">This secure link expires in 72 hours and can only be used once.</p>
          <p style="margin:0;color:#adb9b2;font-size:14px;line-height:1.5;">If you were not expecting this invitation, you can ignore this email.</p>
        </div>
      </div>
    </div>
  `;
  return sendResendEmail({ html, subject, to: values.toEmail });
}

export async function sendInvitationEmail(values: Parameters<typeof sendWelcomeEmail>[0]) {
  return sendWelcomeEmail(values);
}

export async function sendPasswordSetupEmail(values: Parameters<typeof sendWelcomeEmail>[0]) {
  return sendWelcomeEmail(values);
}

export async function sendPasswordResetEmail(values: {
  html: string;
  subject: string;
  toEmail: string;
}) {
  return sendEmailMessage({
    html: values.html,
    subject: values.subject,
    toEmail: values.toEmail,
  });
}

export async function sendTestEmail(values: {
  toEmail: string;
}): Promise<EmailSendResult> {
  return sendEmailMessage({
    toEmail: values.toEmail,
    subject: "MAI Coach email test",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#10171f;line-height:1.6;">
        <h1 style="margin-bottom:8px;">MAI Coach email test</h1>
        <p>This confirms the Dev Worker can send email through Resend.</p>
      </div>
    `,
  });
}

export async function createAccountSetupInvitation(values: {
  actor: AuthIdentity;
  coachId?: string | null;
  delivery?: "email" | "link";
  request: Request;
  user: AccountSetupUser;
}) {
  const database = getRequiredDatabase();
  const normalizedEmail = values.user.email.trim().toLowerCase();
  const passwordRow = await database
    .prepare("SELECT user_id FROM user_passwords WHERE user_id = ?")
    .bind(values.user.id)
    .first<{ user_id: string }>();
  const userIsActive = (values.user.invite_status === "accepted" || values.user.invite_status === "active") && Boolean(passwordRow);
  if (userIsActive) {
    return {
      status: "not_sent" as const,
      publicMessage: "This account is already active. Use password reset if they need a new password.",
    };
  }

  await database.batch([
    database
      .prepare(
        `UPDATE auth_login_tokens
         SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
         WHERE user_id = ? AND purpose = 'account_setup' AND used_at IS NULL`,
      )
      .bind(values.user.id),
    database
      .prepare(
        `UPDATE member_invitations
         SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP)
         WHERE member_id = ? AND status IN ('pending', 'sent', 'delivered', 'opened', 'failed')`,
      )
      .bind(values.user.id),
  ]);

  const token = await createLoginToken({
    email: normalizedEmail,
    purpose: "account_setup",
    redirectPath: "/?tab=videos",
    ttlSeconds: ACCOUNT_SETUP_TTL_SECONDS,
    userId: values.user.id,
  });
  const tokenHash = await hashToken(token);
  const setupUrl = setupUrlForToken(values.request, token);
  const expiresAt = new Date(Date.now() + ACCOUNT_SETUP_TTL_SECONDS * 1000).toISOString();
  const invitationId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO member_invitations (
        id, member_id, user_id, coach_id, email_to, invite_token, token_hash, invite_url,
        status, email_status, email_type, expires_at, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'welcome', ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      invitationId,
      values.user.id,
      values.user.id,
      values.coachId ?? null,
      normalizedEmail,
      tokenHash,
      tokenHash,
      setupBaseUrl(values.request),
      expiresAt,
      values.actor.id,
    )
    .run();

  if (values.delivery === "link") {
    await database
      .prepare("UPDATE users SET invite_status = 'pending', invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(values.user.id)
      .run();
    return {
      status: "pending" as const,
      publicMessage: "Fresh setup link created.",
      setupUrl,
    };
  }

  const result = await sendWelcomeEmail({
    actorName: values.actor.displayName,
    setupUrl,
    toEmail: normalizedEmail,
    toFirstName: values.user.first_name,
    userRole: values.user.role,
  });
  const nextStatus = result.success ? "delivered" : "failed";
  await database.batch([
    database
      .prepare(
        `UPDATE member_invitations SET
          status = ?,
          email_status = ?,
          provider_id = ?,
          provider_message_id = ?,
          failure_reason = ?,
          last_sent_at = CURRENT_TIMESTAMP,
          send_attempts = send_attempts + 1
         WHERE id = ?`,
      )
      .bind(
        nextStatus,
        nextStatus,
        result.providerMessageId ?? null,
        result.providerMessageId ?? null,
        result.errorCode ?? null,
        invitationId,
      ),
    database
      .prepare("UPDATE users SET invite_status = ?, invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(nextStatus, values.user.id),
  ]);

  return {
    status: nextStatus,
    providerId: result.providerMessageId,
    publicMessage: result.success
      ? "Account created and welcome email sent."
      : "Account created, but the welcome email could not be sent. You can resend it below.",
    safeErrorCode: result.errorCode,
  };
}

export async function markAccountSetupInvitationOpened(token: string, userId: string) {
  const tokenHash = await hashToken(token);
  const database = getRequiredDatabase();
  await database
    .prepare(
      `UPDATE member_invitations
       SET status = 'opened',
           opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP)
       WHERE token_hash = ? AND member_id = ? AND status IN ('pending', 'sent', 'delivered')`,
    )
    .bind(tokenHash, userId)
    .run();
  await database
    .prepare("UPDATE users SET invite_status = 'opened', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND invite_status <> 'accepted'")
    .bind(userId)
    .run();
}

export async function markAccountSetupInvitationExpired(token: string) {
  const tokenHash = await hashToken(token);
  const database = getRequiredDatabase();
  await database
    .prepare(
      `UPDATE member_invitations
       SET status = 'expired'
       WHERE token_hash = ? AND status IN ('pending', 'sent', 'delivered', 'opened')`,
    )
    .bind(tokenHash)
    .run();
}

export async function cancelAccountSetupInvitations(userId: string) {
  const database = getRequiredDatabase();
  await database.batch([
    database
      .prepare(
        `UPDATE auth_login_tokens
         SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
         WHERE user_id = ? AND purpose = 'account_setup' AND used_at IS NULL`,
      )
      .bind(userId),
    database
      .prepare(
        `UPDATE member_invitations
         SET status = 'cancelled',
             cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP)
         WHERE member_id = ? AND status IN ('pending', 'sent', 'delivered', 'opened', 'failed')`,
      )
      .bind(userId),
    database
      .prepare("UPDATE users SET invite_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND invite_status <> 'accepted'")
      .bind(userId),
  ]);
}

export async function completeAccountSetupForUser(userId: string) {
  const database = getRequiredDatabase();
  await database.batch([
    database
      .prepare(
        `UPDATE member_invitations
         SET status = 'completed',
             used_at = COALESCE(used_at, CURRENT_TIMESTAMP),
             accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
         WHERE member_id = ? AND status IN ('pending', 'sent', 'delivered', 'opened')`,
      )
      .bind(userId),
    database
      .prepare(
        `UPDATE users
         SET account_status = 'active',
             invite_status = 'accepted',
             password_reset_required = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(userId),
  ]);
}
