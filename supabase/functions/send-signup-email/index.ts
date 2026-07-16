type SignupRecord = {
  id?: string;
  email?: string;
  created_at?: string;
  raw_user_meta_data?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: SignupRecord;
  user?: SignupRecord;
};

type ResendMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

const jsonHeaders = { "Content-Type": "application/json" };
const defaultFrom = "notifications@n3xconsulting.com";
const resendEndpoint = "https://api.resend.com/emails";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function safeEqual(received: string, expected: string) {
  if (!received || !expected) {
    return false;
  }

  let mismatch = received.length === expected.length ? 0 : 1;
  const maxLength = Math.max(received.length, expected.length);

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (received.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function verifyWebhookSecret(req: Request) {
  const expectedSecret = Deno.env.get("SIGNUP_WEBHOOK_SECRET") ?? "";

  if (!expectedSecret) {
    console.error("SIGNUP_WEBHOOK_SECRET is not configured; signup email was skipped.");
    return { ok: false, status: 200, reason: "missing webhook secret" };
  }

  const receivedSecret =
    req.headers.get("x-signup-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    "";

  if (!safeEqual(receivedSecret, expectedSecret)) {
    console.error("Rejected signup email webhook with an invalid shared secret.");
    return { ok: false, status: 401, reason: "invalid webhook secret" };
  }

  return { ok: true, status: 200, reason: null };
}

function getSignupRecord(payload: WebhookPayload | SignupRecord): SignupRecord {
  if ("record" in payload && payload.record) {
    return payload.record;
  }

  if ("user" in payload && payload.user) {
    return payload.user;
  }

  return payload as SignupRecord;
}

function getMetadata(record: SignupRecord) {
  return record.raw_user_meta_data ?? record.user_metadata ?? record.metadata ?? {};
}

function getDisplayName(record: SignupRecord) {
  const metadata = getMetadata(record);
  const firstName = String(metadata.first_name ?? metadata.firstName ?? "").trim();
  const lastName = String(metadata.last_name ?? metadata.lastName ?? "").trim();
  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();

  return [firstName, lastName].filter(Boolean).join(" ") || fullName || "there";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

async function sendResendEmail(message: ResendMessage) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") || defaultFrom;

  if (!apiKey) {
    console.warn(`RESEND_API_KEY is not configured; skipped "${message.subject}".`);
    return { ok: false, skipped: true, reason: "missing RESEND_API_KEY" };
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error(`Resend returned ${response.status} for "${message.subject}": ${responseText}`);
    return { ok: false, skipped: false, reason: `resend ${response.status}` };
  }

  let responseJson: unknown = null;

  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = responseText;
  }

  return { ok: true, skipped: false, response: responseJson };
}

function buildWelcomeEmail(record: SignupRecord): ResendMessage | null {
  if (!record.email) {
    return null;
  }

  const displayName = getDisplayName(record);
  const safeName = escapeHtml(displayName);

  return {
    to: record.email,
    subject: "Welcome to Free Range Golf",
    text: [
      `Hi ${displayName},`,
      "",
      "Welcome to Free Range Golf. Your account has been created.",
      "You can now sign in to view your dashboard, videos, and practice sessions.",
      "",
      "Free Range Golf",
    ].join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#f6f8f7;font-family:Arial,Helvetica,sans-serif;color:#102019;">
        <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
          <div style="background:#ffffff;border:1px solid #dce7e1;border-radius:16px;padding:28px;">
            <p style="margin:0 0 12px;font-size:13px;line-height:18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#147a42;">Free Range Golf</p>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:34px;color:#102019;">Welcome, ${safeName}.</h1>
            <p style="margin:0 0 18px;font-size:16px;line-height:24px;color:#40524a;">Your account has been created. You can now sign in to view your dashboard, lesson videos, and practice sessions.</p>
            <p style="margin:0;font-size:14px;line-height:22px;color:#65746d;">This email was sent automatically after your Free Range Golf signup.</p>
          </div>
        </div>
      </div>
    `,
  };
}

function buildInternalNotification(record: SignupRecord): ResendMessage | null {
  const notifyTo = (Deno.env.get("SIGNUP_NOTIFY_TO") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (notifyTo.length === 0) {
    return null;
  }

  const metadata = getMetadata(record);
  const displayName = getDisplayName(record);

  return {
    to: notifyTo,
    subject: "New Free Range Golf signup",
    text: [
      "A new user signed up.",
      "",
      `Name: ${displayName}`,
      `Email: ${record.email ?? "Unknown"}`,
      `User ID: ${record.id ?? "Unknown"}`,
      `Created: ${record.created_at ?? "Unknown"}`,
      "",
      "Metadata:",
      compactJson(metadata),
    ].join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#102019;">
        <h2 style="margin:0 0 16px;">New Free Range Golf signup</h2>
        <table style="border-collapse:collapse;font-size:14px;line-height:22px;">
          <tr><td style="padding:4px 16px 4px 0;font-weight:700;">Name</td><td>${escapeHtml(displayName)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:700;">Email</td><td>${escapeHtml(record.email ?? "Unknown")}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:700;">User ID</td><td>${escapeHtml(record.id ?? "Unknown")}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:700;">Created</td><td>${escapeHtml(record.created_at ?? "Unknown")}</td></tr>
        </table>
        <pre style="margin-top:16px;padding:12px;background:#f6f8f7;border-radius:10px;white-space:pre-wrap;">${escapeHtml(compactJson(metadata))}</pre>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const secretCheck = verifyWebhookSecret(req);
  if (!secretCheck.ok) {
    return jsonResponse({ ok: false, skipped: true, reason: secretCheck.reason }, secretCheck.status);
  }

  let payload: WebhookPayload | SignupRecord;

  try {
    payload = await req.json();
  } catch (error) {
    console.error("Could not parse signup webhook payload.", error);
    return jsonResponse({ ok: true, skipped: true, reason: "invalid json" });
  }

  const record = getSignupRecord(payload);

  if (!record.email) {
    console.warn("Signup webhook payload did not include an email; no welcome email was sent.");
    return jsonResponse({ ok: true, skipped: true, reason: "missing email" });
  }

  const messages = [buildWelcomeEmail(record), buildInternalNotification(record)].filter(
    (message): message is ResendMessage => message !== null,
  );

  const results = [];

  for (const message of messages) {
    try {
      results.push({
        subject: message.subject,
        to: message.to,
        ...(await sendResendEmail(message)),
      });
    } catch (error) {
      console.error(`Failed to send "${message.subject}".`, error);
      results.push({ subject: message.subject, to: message.to, ok: false, reason: "unexpected send error" });
    }
  }

  return jsonResponse({
    ok: true,
    userId: record.id ?? null,
    email: record.email,
    attempted: messages.length,
    results,
  });
});
