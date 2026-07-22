import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFirstMemberOnboardingStatus,
  shouldCompleteFirstMemberOnboardingAfterInvite,
  shouldOpenFirstMemberOnboarding,
} from "../lib/coach-first-member-onboarding-policy.mjs";

test("first-member onboarding opens only for an authenticated coach with no active members and pending status", () => {
  assert.equal(shouldOpenFirstMemberOnboarding({
    accountRole: "coach",
    activeMemberCount: 0,
    authenticated: true,
    loadingMembers: false,
    status: "pending",
    viewerRole: "coach",
  }), true);

  assert.equal(shouldOpenFirstMemberOnboarding({
    accountRole: "member",
    activeMemberCount: 0,
    authenticated: true,
    loadingMembers: false,
    status: "pending",
    viewerRole: "user",
  }), false);

  assert.equal(shouldOpenFirstMemberOnboarding({
    accountRole: "admin",
    activeMemberCount: 0,
    authenticated: true,
    loadingMembers: false,
    status: "pending",
    viewerRole: "admin",
  }), false);

  assert.equal(shouldOpenFirstMemberOnboarding({
    accountRole: "coach",
    activeMemberCount: 1,
    authenticated: true,
    loadingMembers: false,
    status: "pending",
    viewerRole: "coach",
  }), false);
});

test("dismissed or completed onboarding does not reopen", () => {
  for (const status of ["dismissed", "completed"]) {
    assert.equal(shouldOpenFirstMemberOnboarding({
      accountRole: "coach",
      activeMemberCount: 0,
      authenticated: true,
      loadingMembers: false,
      status,
      viewerRole: "coach",
    }), false);
  }
});

test("onboarding completion follows invitation delivery state", () => {
  assert.equal(shouldCompleteFirstMemberOnboardingAfterInvite("delivered"), true);
  assert.equal(shouldCompleteFirstMemberOnboardingAfterInvite("not_sent"), true);
  assert.equal(shouldCompleteFirstMemberOnboardingAfterInvite("failed"), false);
  assert.equal(shouldCompleteFirstMemberOnboardingAfterInvite("pending"), false);
});

test("unknown onboarding status falls back to pending", () => {
  assert.equal(normalizeFirstMemberOnboardingStatus("dismissed"), "dismissed");
  assert.equal(normalizeFirstMemberOnboardingStatus("surprise"), "pending");
  assert.equal(normalizeFirstMemberOnboardingStatus(undefined), "pending");
});
