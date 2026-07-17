import {
  generatePracticeActivity,
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
    return listPracticeActivities(identity, text(url.searchParams.get("memberId"), 120));
  } catch (error) {
    return responseFromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = await request.json() as Record<string, unknown>;
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
