import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  adminCreateUserGuard,
  buildCoachReconciliationCandidates,
  canManageCoachPhoto,
  canManageUserPhoto,
  canViewCoachPhoto,
  canViewUserPhoto,
  deriveSetupStatus,
  finalActiveAdminChangeGuard,
  normalizeEmail,
  safeInviteStatus,
  singleCoachAssignmentGuard,
  sniffImageMimeType,
  splitDisplayNameForRegistration,
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

test("invitation setup states support email delivery lifecycle", () => {
  assert.equal(safeInviteStatus("delivered"), "delivered");
  assert.equal(safeInviteStatus("opened"), "opened");
  assert.equal(safeInviteStatus("completed"), "completed");
  assert.equal(safeInviteStatus("failed"), "failed");
  assert.equal(safeInviteStatus("expired"), "expired");
  assert.equal(safeInviteStatus("cancelled"), "cancelled");
  assert.equal(safeInviteStatus("unknown", "pending"), "pending");
  assert.deepEqual(deriveSetupStatus({
    accountStatus: "active",
    inviteStatus: "completed",
    passwordConfigured: true,
    passwordResetRequired: false,
    lastLoginAt: "2026-07-21",
  }), ["Password configured", "Last login 2026-07-21"]);
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

test("admin create user is admin-only and never updates an existing account by email", () => {
  assert.deepEqual(adminCreateUserGuard("coach", null), {
    message: "Only admins can create users from the admin workspace.",
    status: 403,
  });
  assert.deepEqual(adminCreateUserGuard("admin", { id: "admin-1", role: "admin" }), {
    message: "That email already exists. Open the existing user and edit by ID instead.",
    status: 409,
  });
  assert.equal(adminCreateUserGuard("admin", null), null);
});

test("coach-created student relationship enforces single-coach ownership", () => {
  const unassigned = singleCoachAssignmentGuard({
    coachId: "zac",
    existingCoachIds: [],
    identityId: "zac",
    identityRole: "coach",
  });
  assert.equal(unassigned.allowed, true);
  assert.equal(unassigned.alreadyAssigned, false);

  const duplicate = singleCoachAssignmentGuard({
    coachId: "zac",
    existingCoachIds: ["zac"],
    identityId: "zac",
    identityRole: "coach",
  });
  assert.equal(duplicate.allowed, true);
  assert.equal(duplicate.alreadyAssigned, true);

  const claimed = singleCoachAssignmentGuard({
    coachId: "other",
    existingCoachIds: ["zac"],
    identityId: "other",
    identityRole: "coach",
  });
  assert.equal(claimed.allowed, false);
  assert.equal(claimed.status, 409);
  assert.match(claimed.message, /admin to reassign/);

  const conflicting = singleCoachAssignmentGuard({
    coachId: "zac",
    existingCoachIds: ["zac", "other"],
    identityId: "zac",
    identityRole: "coach",
  });
  assert.equal(conflicting.allowed, false);
  assert.equal(conflicting.status, 409);
  assert.match(conflicting.message, /conflicting coach assignments/);
});

test("admin reassignment is allowed as the only path to change a coach", () => {
  const adminReassign = singleCoachAssignmentGuard({
    coachId: "coach-b",
    existingCoachIds: ["coach-a"],
    identityId: "admin-1",
    identityRole: "admin",
  });
  assert.equal(adminReassign.allowed, true);
});

test("final active admin cannot be demoted or deactivated", () => {
  assert.deepEqual(finalActiveAdminChangeGuard({
    activeAdminCount: 1,
    existingAccountStatus: "active",
    existingRole: "admin",
    nextAccountStatus: "active",
    nextRole: "coach",
  }), {
    message: "You cannot remove or deactivate the final active admin account.",
    status: 409,
  });
  assert.deepEqual(finalActiveAdminChangeGuard({
    activeAdminCount: 1,
    existingAccountStatus: "active",
    existingRole: "admin",
    nextAccountStatus: "inactive",
    nextRole: "admin",
  }), {
    message: "You cannot remove or deactivate the final active admin account.",
    status: 409,
  });
  assert.equal(finalActiveAdminChangeGuard({
    activeAdminCount: 2,
    existingAccountStatus: "active",
    existingRole: "admin",
    nextAccountStatus: "inactive",
    nextRole: "admin",
  }), null);
});

test("reconciliation only auto-repairs members with zero existing coaches", () => {
  const videoRows = [
    {
      coach_email: "zac@example.com",
      coach_first_name: "Zac",
      coach_id: "zac",
      coach_last_name: "Malone",
      member_email: "joe@example.com",
      member_first_name: "Joe",
      member_id: "joe",
      member_last_name: "DeRario",
      publication_status: "published",
      upload_status: "ready",
      video_count: 1,
      video_title: "Wedge lesson",
    },
    {
      coach_email: "zac@example.com",
      coach_first_name: "Zac",
      coach_id: "zac",
      coach_last_name: "Malone",
      member_email: "sam@example.com",
      member_first_name: "Sam",
      member_id: "sam",
      member_last_name: "Player",
      publication_status: "published",
      upload_status: "ready",
      video_count: 1,
      video_title: "Driver lesson",
    },
  ];
  const existingRows = [
    {
      coach_email: "other@example.com",
      coach_first_name: "Other",
      coach_id: "other",
      coach_last_name: "Coach",
      member_id: "sam",
    },
  ];
  const candidates = buildCoachReconciliationCandidates(videoRows, existingRows);
  const joe = candidates.find((candidate) => candidate.memberId === "joe");
  const sam = candidates.find((candidate) => candidate.memberId === "sam");
  assert.equal(joe.repairable, true);
  assert.equal(joe.ambiguous, false);
  assert.equal(joe.suggestedCoachName, "Zac Malone");
  assert.equal(sam.repairable, false);
  assert.equal(sam.ambiguous, true);
  assert.deepEqual(sam.existingCoachNames, ["Other Coach"]);
});

test("coach photo authorization matches admin coach member roles", () => {
  assert.equal(canManageCoachPhoto({ id: "admin", role: "admin" }, "coach-a"), true);
  assert.equal(canManageCoachPhoto({ id: "coach-a", role: "coach" }, "coach-a"), true);
  assert.equal(canManageCoachPhoto({ id: "coach-b", role: "coach" }, "coach-a"), false);
  assert.equal(canManageCoachPhoto({ id: "member", role: "member" }, "coach-a"), false);
  assert.equal(canViewCoachPhoto({ id: "member", role: "member" }, "coach-a", true), true);
  assert.equal(canViewCoachPhoto({ id: "member", role: "member" }, "coach-a", false), false);
});

test("user photo authorization supports admins coaches and members without broad access", () => {
  const admin = { id: "admin-1", role: "admin" };
  const coach = { id: "coach-1", role: "coach" };
  const otherCoach = { id: "coach-2", role: "coach" };
  const member = { id: "member-1", role: "member" };
  const memberUser = { id: "member-1", role: "member" };
  const coachUser = { id: "coach-1", role: "coach" };
  const adminUser = { id: "admin-2", role: "admin" };

  assert.equal(canManageUserPhoto(admin, adminUser), true);
  assert.equal(canManageUserPhoto(member, memberUser), true);
  assert.equal(canManageUserPhoto(coach, memberUser, { isAssignedCoach: true }), true);
  assert.equal(canManageUserPhoto(coach, memberUser, { isAssignedCoach: false }), false);
  assert.equal(canManageUserPhoto(coach, otherCoach), false);
  assert.equal(canViewUserPhoto(member, coachUser, { isAssignedMember: true }), true);
  assert.equal(canViewUserPhoto(member, coachUser, { isAssignedMember: false }), false);
});

test("registration state safely splits onboarding display name", () => {
  assert.deepEqual(splitDisplayNameForRegistration("  Zac   Malone  ", "zac@example.com"), {
    firstName: "Zac",
    lastName: "Malone",
  });
  assert.deepEqual(splitDisplayNameForRegistration("Zac", "zac@example.com"), {
    firstName: "Zac",
    lastName: "",
  });
  assert.deepEqual(splitDisplayNameForRegistration("", "zac@example.com"), {
    firstName: "",
    lastName: "",
  });
});

test("admin delete performs content cleanup instead of blocking content-owning users", () => {
  const routeSource = fs.readFileSync(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(routeSource, /Deactivate the account instead/);
  assert.match(routeSource, /DELETE FROM lesson_videos WHERE member_id = \?/);
  assert.match(routeSource, /UPDATE lesson_videos SET coach_id = NULL/);
  assert.match(routeSource, /DELETE FROM video_lesson_recap_drafts/);
  assert.match(routeSource, /DELETE FROM video_annotation_exports/);
  assert.match(routeSource, /DELETE FROM video_visual_observation_reviews/);
  assert.match(routeSource, /DELETE FROM practice_activities/);
  assert.match(routeSource, /DELETE FROM mai_caddy_session_analyses/);
  assert.match(routeSource, /DELETE FROM photo_import_jobs WHERE user_id = \?/);
});
