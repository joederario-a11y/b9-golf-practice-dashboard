export const FIRST_MEMBER_ONBOARDING_STATUSES = ["pending", "dismissed", "completed"];

export function normalizeFirstMemberOnboardingStatus(value) {
  return FIRST_MEMBER_ONBOARDING_STATUSES.includes(value) ? value : "pending";
}

export function shouldOpenFirstMemberOnboarding(values) {
  return Boolean(
    values.authenticated &&
      values.accountRole === "coach" &&
      values.viewerRole === "coach" &&
      values.loadingMembers === false &&
      Number(values.activeMemberCount) === 0 &&
      normalizeFirstMemberOnboardingStatus(values.status) === "pending",
  );
}

export function shouldCompleteFirstMemberOnboardingAfterInvite(inviteStatus) {
  return inviteStatus === "delivered" || inviteStatus === "not_sent";
}
