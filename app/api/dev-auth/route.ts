import {
  ensurePlatformSchema,
  getIdentity,
  getPlatformEnvironment,
  getRequiredDatabase,
  responseFromError,
} from "@/lib/server/platform";
import { cookies } from "next/headers";

function disabled() {
  return Response.json({ error: "Development authentication is disabled." }, { status: 404 });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(request: Request) {
  try {
    if (getPlatformEnvironment().DEV_AUTH_ENABLED !== "true") return disabled();
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    const result = await database
      .prepare("SELECT id, role, first_name, last_name, email FROM users ORDER BY role, last_name, first_name")
      .all<{
        id: string;
        role: string;
        first_name: string;
        last_name: string;
        email: string;
      }>();
    const users = result.results.map((user) => ({
        id: user.id,
        role: user.role,
        name: [user.first_name, user.last_name].filter(Boolean).join(" "),
        email: user.email,
      }));
    const currentEmail = (await cookies()).get("frg-dev-user")?.value ?? "";
    const currentIdentity = await getIdentity();
    if (new URL(request.url).searchParams.get("format") === "json") {
      return Response.json({ users });
    }
    const options = users
      .map(
        (user) =>
          `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`,
      )
      .join("");
    return new Response(
      `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Free Range Golf Development Login</title>
          <style>
            body{margin:0;background:#07110d;color:#f4f7f5;font:16px system-ui;display:grid;min-height:100vh;place-items:center}
            form{width:min(520px,calc(100vw - 32px));display:grid;gap:14px;border:1px solid rgba(255,255,255,.12);background:#111d19;padding:24px;border-radius:8px}
            h1,p{margin:0} p{color:#a8b3ad;line-height:1.5} label{display:grid;gap:6px;font-weight:700}
            input,select,button{font:inherit;border-radius:6px;padding:11px;border:1px solid rgba(255,255,255,.12)}
            input,select{background:#0b1511;color:#f4f7f5} button{background:#35f27a;color:#050b09;font-weight:800;cursor:pointer}
          </style>
        </head>
        <body>
          <form method="post">
            <h1>Development Login</h1>
            <p>Local testing only. Existing production authentication is unchanged.</p>
            ${currentEmail ? `<p>Current account: ${escapeHtml(currentEmail)}</p>` : ""}
            ${currentIdentity ? `<p>Resolved role: ${escapeHtml(currentIdentity.role)}</p>` : ""}
            ${users.length ? `<label>Existing account<select name="existingEmail"><option value="">Create another account</option>${options}</select></label>` : ""}
            <label>Email<input name="email" type="email" placeholder="zac@example.test" /></label>
            <label>First name<input name="firstName" placeholder="Zac" /></label>
            <label>Last name<input name="lastName" placeholder="Coach" /></label>
            <label>Role<select name="role"><option value="coach">Coach</option><option value="member">Member</option><option value="admin">Admin</option></select></label>
            <button type="submit">Continue to Free Range Golf</button>
          </form>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (getPlatformEnvironment().DEV_AUTH_ENABLED !== "true") return disabled();
    const isForm = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    const rawPayload = isForm
      ? Object.fromEntries(await request.formData())
      : await request.json();
    const payload = rawPayload as {
      email?: unknown;
      existingEmail?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      role?: unknown;
    };
    const existingEmail = typeof payload.existingEmail === "string"
      ? payload.existingEmail.trim().toLowerCase()
      : "";
    const email = existingEmail || (typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "");
    const firstName = typeof payload.firstName === "string" ? payload.firstName.trim().slice(0, 80) : "";
    const lastName = typeof payload.lastName === "string" ? payload.lastName.trim().slice(0, 80) : "";
    const role = payload.role === "admin" || payload.role === "coach" ? payload.role : "member";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid development user email." }, { status: 400 });
    }
    const database = getRequiredDatabase();
    await ensurePlatformSchema(database);
    let user = await database
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (!user) {
      const id = crypto.randomUUID();
      await database
        .prepare(
          `INSERT INTO users (
            id, role, first_name, last_name, email, invite_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(id, role, firstName || "Development", lastName || "User", email)
        .run();
      user = { id };
    }
    const cookie = `frg-dev-user=${encodeURIComponent(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`;
    if (isForm) {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Signing in</title>
        <script>
          document.cookie = ${JSON.stringify(`frg-dev-user=${encodeURIComponent(email)}; SameSite=Lax; Path=/; Max-Age=86400`)};
          window.location.replace("/");
        </script>`,
        {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": cookie,
        },
      });
    }
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return responseFromError(error);
  }
}

export async function DELETE() {
  if (getPlatformEnvironment().DEV_AUTH_ENABLED !== "true") return disabled();
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    "frg-dev-user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
  return response;
}
