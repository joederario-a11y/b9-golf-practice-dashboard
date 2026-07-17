export const AUTH_SESSION_COOKIE_NAME = "frg-session";
export const DEFAULT_AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function protocolFromUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    return new URL(value).protocol;
  } catch {
    return "";
  }
}

export function shouldUseSecureAuthCookie(options = {}) {
  if (typeof options.secure === "boolean") return options.secure;

  const requestProtocol = protocolFromUrl(options.requestUrl);
  if (requestProtocol) return requestProtocol === "https:";

  const appProtocol = protocolFromUrl(options.appBaseUrl);
  if (appProtocol) return appProtocol === "https:";

  return false;
}

export function buildAuthSessionCookie(options = {}) {
  const token = typeof options.token === "string" ? options.token : "";
  const cookieName = options.name || AUTH_SESSION_COOKIE_NAME;
  const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds)
    ? Math.max(0, Math.floor(options.maxAgeSeconds))
    : DEFAULT_AUTH_SESSION_TTL_SECONDS;
  const secure = shouldUseSecureAuthCookie(options);
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.splice(2, 0, "Secure");
  return parts.join("; ");
}

export function buildClearAuthSessionCookie(options = {}) {
  return buildAuthSessionCookie({
    ...options,
    token: "",
    maxAgeSeconds: 0,
  });
}

export function accountPayloadConfirmsUser(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload.mode === "user" &&
      payload.user &&
      typeof payload.user === "object" &&
      typeof payload.user.id === "string" &&
      payload.user.id,
  );
}

export function shouldKeepAuthenticatedAfterSecondaryDataFailure(accountPayload) {
  return accountPayloadConfirmsUser(accountPayload);
}
