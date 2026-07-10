import {
  createLoginToken,
  getPlatformEnvironment,
  getRequiredDatabase,
  roleForEmail,
  upsertUserForEmail,
} from "./platform";

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

export async function requestLoginEmail(request: Request, email: string, redirectPath = "/?tab=videos") {
  const normalizedEmail = email.trim().toLowerCase();
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
      publicMessage: "If that email has access, a login link will arrive shortly.",
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
  if (!runtime.RESEND_API_KEY || !runtime.VIDEO_EMAIL_FROM) {
    return {
      status: "Failed" as const,
      debugLoginUrl: runtime.DEV_AUTH_ENABLED === "true" ? loginUrl : undefined,
      failureReason: "Email delivery is not configured. Add RESEND_API_KEY and VIDEO_EMAIL_FROM.",
      publicMessage: "Email delivery is not configured yet.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: runtime.VIDEO_EMAIL_FROM,
      to: [normalizedEmail],
      subject: "Your Free Range Golf login link",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17231d;line-height:1.6;">
          <p>Hi ${escapeHtml(user.first_name || "there")},</p>
          <p>Use this secure link to open your Free Range Golf video library.</p>
          <p style="margin:28px 0;">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0b1511;color:#35f27a;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">Open Free Range Golf</a>
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
      failureReason: result.message || "The email provider did not accept the login email.",
      publicMessage: "The login email could not be sent.",
    };
  }

  return {
    status: "Sent" as const,
    providerId: result.id,
    publicMessage: "Check your email for a secure login link.",
  };
}
