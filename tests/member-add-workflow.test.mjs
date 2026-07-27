import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const membersRouteSource = fs.readFileSync(new URL("../app/api/members/route.ts", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("add member route normalizes email lookups and reports duplicate normalized records", () => {
  assert.match(membersRouteSource, /LOWER\(TRIM\(email\)\) = \?/);
  assert.match(membersRouteSource, /duplicate_normalized_email/);
  assert.match(membersRouteSource, /Multiple accounts use that email after normalization/);
});

test("add member route handles existing members without creating duplicate invitations", () => {
  assert.match(membersRouteSource, /member_already_linked/);
  assert.match(membersRouteSource, /existing_member_available/);
  assert.match(membersRouteSource, /linked_existing_member/);
  assert.match(membersRouteSource, /existing\s*\?\s*noEmailInvite/);
  assert.match(membersRouteSource, /createSetupInvitationWithoutBlockingMember/);
});

test("add member UI preserves form values for existing-member confirmation", () => {
  assert.match(pageSource, /pendingExistingMember/);
  assert.match(pageSource, /Add Existing Member/);
  assert.match(pageSource, /existing_member_available/);
  assert.match(pageSource, /confirmExisting: Boolean\(pendingExistingMember\)/);
});

test("admin delete removes confirmed users from local state before refresh", () => {
  assert.match(pageSource, /setDashboard\(result\)/);
  assert.match(pageSource, /users: current\.users\.filter\(\(item\) => item\.id !== user\.id\)/);
  assert.match(pageSource, /await refreshWorkspace\(nextMemberId\)/);
});
