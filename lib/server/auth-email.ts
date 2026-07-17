import {
  createLoginToken,
  getEmailFromAddress,
  getPlatformEnvironment,
  getRequiredDatabase,
  roleForEmail,
  upsertUserForEmail,
} from "./platform";

type AuthEmailOptions = {
  accountType?: "coach" | "player";
  purpose?: "login" | "password_reset" | "registration";
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appUrl(request: Request, path: string) {
  const runtime = getPlatformEnvironment();
  const baseUrl = runtime.APP_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function loginUrlForToken(request: Request, token: string, redirectPath: string) {
  const safeRedirectPath = redirectPath.startsWith("/") ? redirectPath : "/?tab=videos";
  const url = new URL(appUrl(request, safeRedirectPath));
  url.searchParams.set("login", token);
  if (!url.searchParams.has("tab")) url.searchParams.set("tab", "videos");
  return url.toString();
}

function canExposeLocalLoginUrl(request: Request) {
  const runtime = getPlatformEnvironment();
  const hostname = new URL(request.url).hostname;
  return runtime.DEV_AUTH_ENABLED === "true" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function requestLoginEmail(
  request: Request,
  email: string,
  redirectPath = "/?tab=videos",
  options: AuthEmailOptions = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  const isRegistration = options.purpose === "registration";
  const isPasswordReset = options.purpose === "password_reset";
  const accountLabel = options.accountType === "coach" ? "coach" : "player";
  const database = getRequiredDatabase();
  const existing = await database
    .prepare("SELECT id, role, first_name, last_name, email FROM users WHERE email = ?")
    .bind(normalizedEmail)
    .first<{
      id: string;
      role: string;
      first_name: string;
      last_name: string;
      email: string;
    }>();
  const role = roleForEmail(normalizedEmail, existing?.role);
  const staffLogin = role === "coach" || role === "admin";
  const user = existing ?? (staffLogin ? await upsertUserForEmail({ email: normalizedEmail, role }) : null);

  if (!user) {
    return {
      status: "Not found" as const,
      needsRegistration: true,
      publicMessage: "No account was found for that email. Create a new account or ask your coach for an invite.",
    };
  }

  const token = await createLoginToken({
    email: normalizedEmail,
    purpose: isPasswordReset ? "password_reset" : "login",
    redirectPath,
    userId: user.id,
  });
  const loginUrl = loginUrlForToken(request, token, redirectPath);
  const runtime = getPlatformEnvironment();
  const emailSubject = isRegistration
    ? "Your MAI Coach account is ready"
    : isPasswordReset
      ? "Reset your MAI Coach password"
      : "Your MAI Coach login link";
  const emailFrom = getEmailFromAddress();
  if (!runtime.RESEND_API_KEY || !emailFrom) {
    const localLoginAvailable = canExposeLocalLoginUrl(request);
    return {
      status: localLoginAvailable ? "Local link ready" as const : "Failed" as const,
      debugLoginUrl: localLoginAvailable ? loginUrl : undefined,
      emailSubject,
      emailTo: normalizedEmail,
      failureReason: "Email delivery is not configured. Add RESEND_API_KEY and VIDEO_EMAIL_FROM or RESEND_FROM.",
      publicMessage: isRegistration
        ? localLoginAvailable
          ? "Account created. Email is not configured locally, so use the secure link below."
          : "Account created, but email delivery is not configured yet."
        : isPasswordReset
          ? localLoginAvailable
            ? "Email is not configured locally. Use the local password reset link below."
            : "Password reset email delivery is not configured yet."
        : localLoginAvailable
          ? "Email is not configured locally. Use the local test login link below."
          : "Email delivery is not configured yet.",
    };
  }

  const introCopy = isRegistration
    ? `Your MAI Coach ${accountLabel} account has been created. Use this secure link to open your account and finish getting set up.`
    : isPasswordReset
      ? "Use this secure link to open your account and set a new password."
    : "Use this secure link to open your MAI Coach video library.";
  const buttonText = isRegistration ? "Open your new account" : isPasswordReset ? "Reset password" : "Open MAI Coach";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [normalizedEmail],
      subject: emailSubject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#10171F;line-height:1.6;">
          <p>Hi ${escapeHtml(user.first_name || "there")},</p>
          <p>${escapeHtml(introCopy)}</p>
          <p style="margin:28px 0;">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#10171F;color:#96cb39;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">${escapeHtml(buttonText)}</a>
          </p>
          <p>This link expires soon and can only be used once.</p>
        </div>
      `,
    }),
  });
  const result = await response.json() as { id?: string; message?: string };
  if (!response.ok || !result.id) {
    return {
      status: "Failed" as const,
      emailSubject,
      emailTo: normalizedEmail,
      failureReason: result.message || "The email provider did not accept the login email.",
      publicMessage: isRegistration
        ? "Account created, but the registration email could not be sent."
        : isPasswordReset
          ? "The password reset email could not be sent."
        : "The login email could not be sent.",
    };
  }

  return {
    status: "Sent" as const,
    emailSubject,
    emailTo: normalizedEmail,
    providerId: result.id,
    publicMessage: isRegistration
      ? `Account created. We sent a secure login link to ${normalizedEmail}.`
      : isPasswordReset
        ? "Check your email for a password reset link."
      : "Check your email for a secure login link.",
  };
}
