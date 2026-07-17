import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSetupStatus,
  normalizeEmail,
  sniffImageMimeType,
  validateCoachHeadshotFile,
  validatePasswordConfirmation,
} from "../lib/admin-user-policy.mjs";

test("normalizes email before lookup and storage", () => {
  assert.equal(normalizeEmail("  JDerario@ME.com  "), "jderario@me.com");
});

test("admin password setup enforces existing password rules and confirmation", () => {
  assert.equal(validatePasswordConfirmation("temporary1", "temporary1"), "");
  assert.match(validatePasswordConfirmation("short", "short"), /at least 8/);
  assert.match(validatePasswordConfirmation("temporary1", "temporary2"), /must match/);
});

test("account setup status does not call an unusable account simply active", () => {
  const status = deriveSetupStatus({
    accountStatus: "active",
    inviteStatus: "pending",
    passwordConfigured: false,
    passwordResetRequired: false,
    lastLoginAt: null,
  });

  assert.deepEqual(status, ["Pending setup", "Password not configured", "Never logged in"]);
});

test("coach headshot validation accepts bounded supported images", () => {
  assert.equal(validateCoachHeadshotFile("image/jpeg", 250_000), "");
  assert.match(validateCoachHeadshotFile("image/svg+xml", 250_000), /JPG/);
  assert.match(validateCoachHeadshotFile("image/png", 6 * 1024 * 1024), /5 MB/);
});

test("image MIME sniffing recognizes jpeg png and webp signatures", () => {
  assert.equal(sniffImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])), "image/jpeg");
  assert.equal(sniffImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(
    sniffImageMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    "image/webp",
  );
  assert.equal(sniffImageMimeType(new Uint8Array([1, 2, 3, 4])), "");
});
