import {
  createLoginToken,
  getPlatformEnvironment,
  getRequiredDatabase,
  roleForEmail,
  upsertUserForEmail,
} from "./platform";

type AuthEmailOptions = {
  accountType?: "coach" | "player";
  purpose?: "login" | "registration";
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
    purpose: "login",
    redirectPath,
    userId: user.id,
  });
  const loginUrl = appUrl(request, `/?login=${encodeURIComponent(token)}${redirectPath.includes("tab=") ? "" : "&tab=videos"}`);
  const runtime = getPlatformEnvironment();
  const emailSubject = isRegistration
    ? "Your Free Range Golf account is ready"
    : "Your Free Range Golf login link";
  if (!runtime.RESEND_API_KEY || !runtime.VIDEO_EMAIL_FROM) {
    const localLoginAvailable = canExposeLocalLoginUrl(request);
    return {
      status: localLoginAvailable ? "Local link ready" as const : "Failed" as const,
      debugLoginUrl: localLoginAvailable ? loginUrl : undefined,
      emailSubject,
      emailTo: normalizedEmail,
      failureReason: "Email delivery is not configured. Add RESEND_API_KEY and VIDEO_EMAIL_FROM.",
      publicMessage: isRegistration
        ? localLoginAvailable
          ? "Account created. Email is not configured locally, so use the secure link below."
          : "Account created, but email delivery is not configured yet."
        : localLoginAvailable
          ? "Email is not configured locally. Use the local test login link below."
          : "Email delivery is not configured yet.",
    };
  }

  const introCopy = isRegistration
    ? `Your Free Range Golf ${accountLabel} account has been created. Use this secure link to open your account and finish getting set up.`
    : "Use this secure link to open your Free Range Golf video library.";
  const buttonText = isRegistration ? "Open your new account" : "Open Free Range Golf";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: runtime.VIDEO_EMAIL_FROM,
      to: [normalizedEmail],
      subject: emailSubject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17231d;line-height:1.6;">
          <p>Hi ${escapeHtml(user.first_name || "there")},</p>
          <p>${escapeHtml(introCopy)}</p>
          <p style="margin:28px 0;">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0b1511;color:#35f27a;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">${escapeHtml(buttonText)}</a>
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
      : "Check your email for a secure login link.",
  };
}
