import { handlePhotoImportRequest } from "@/lib/server/photo-import-request";
import { requireIdentity, responseFromError } from "@/lib/server/platform";

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    return handlePhotoImportRequest(request, identity);
  } catch (error) {
    return responseFromError(error);
  }
}
