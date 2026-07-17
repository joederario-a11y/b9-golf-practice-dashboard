import assert from "node:assert/strict";
import test from "node:test";

import {
  accountPayloadConfirmsUser,
  buildAuthSessionCookie,
  buildClearAuthSessionCookie,
  shouldKeepAuthenticatedAfterSecondaryDataFailure,
  shouldUseSecureAuthCookie,
} from "../lib/auth-session-policy.mjs";

test("local HTTP auth cookies do not use Secure even when app base URL is HTTPS", () => {
  const cookie = buildAuthSessionCookie({
    token: "local-token",
    requestUrl: "http://127.0.0.1:3000/api/auth/password",
    appBaseUrl: "https://mai-coach-dev.example.workers.dev",
  });

  assert.equal(shouldUseSecureAuthCookie({
    requestUrl: "http://localhost:3000/api/auth/password",
    appBaseUrl: "https://mai-coach-dev.example.workers.dev",
  }), false);
  assert.equal(cookie.includes("; Secure"), false);
});

test("HTTPS auth cookies use Secure and preserve required flags", () => {
  const cookie = buildAuthSessionCookie({
    token: "secure-token",
    requestUrl: "https://mai-coach-dev.example.workers.dev/api/auth/password",
    maxAgeSeconds: 120,
  });

  assert.match(cookie, /^frg-session=secure-token/);
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("Secure"));
  assert.ok(cookie.includes("SameSite=Lax"));
  assert.ok(cookie.includes("Path=/"));
  assert.ok(cookie.includes("Max-Age=120"));
});

test("clear auth cookie uses the same request-aware secure policy", () => {
  const localCookie = buildClearAuthSessionCookie({
    requestUrl: "http://localhost:3000/api/auth/verify",
    appBaseUrl: "https://mai-coach.example",
  });
  const secureCookie = buildClearAuthSessionCookie({
    requestUrl: "https://mai-coach.example/api/auth/verify",
  });

  assert.ok(localCookie.includes("Max-Age=0"));
  assert.equal(localCookie.includes("Secure"), false);
  assert.ok(secureCookie.includes("Secure"));
});

test("account payload is the auth source of truth when secondary data fails", () => {
  const accountPayload = {
    mode: "user",
    user: {
      id: "user-1",
      email: "player@example.test",
    },
  };

  assert.equal(accountPayloadConfirmsUser(accountPayload), true);
  assert.equal(shouldKeepAuthenticatedAfterSecondaryDataFailure(accountPayload), true);
  assert.equal(shouldKeepAuthenticatedAfterSecondaryDataFailure({ mode: "guest", user: null }), false);
});
