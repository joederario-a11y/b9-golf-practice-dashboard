import {
  assignCoachPracticePlan,
  generatePracticeActivity,
  getPracticeActivityDetail,
  listPracticeActivities,
  updatePracticeActivity,
} from "@/lib/server/practice-activities";
import { requireIdentity, responseFromError } from "@/lib/server/platform";

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const url = new URL(request.url);
    const activityId = text(url.searchParams.get("activityId"), 120);
    if (activityId) {
      return getPracticeActivityDetail(identity, activityId);
    }
    return listPracticeActivities(identity, text(url.searchParams.get("memberId"), 120));
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
    if (text(payload.action, 80) === "assign_coach_practice_plan") {
      return assignCoachPracticePlan(identity, payload);
    }
    return generatePracticeActivity(identity, payload);
  } catch (error) {
    return responseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
    return updatePracticeActivity(identity, payload);
  } catch (error) {
    return responseFromError(error);
  }
}
