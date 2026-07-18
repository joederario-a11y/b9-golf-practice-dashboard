import { processPhotoImportBatch } from "@/lib/server/photo-import";
import { requireIdentity, responseFromError } from "@/lib/server/platform";

function text(value: FormDataEntryValue | null, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const formData = await request.formData();
    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File);
    const notes = text(formData.get("notes"), 1000);
    const sessionDate = text(formData.get("sessionDate"), 40);
    const originalHashes = formData
      .getAll("originalHashes")
      .map((value) => text(value, 80))
      .filter(Boolean);

    const result = await processPhotoImportBatch({
      identity,
      files,
      notes,
      originalHashes,
      sessionDate: sessionDate || undefined,
    });

    return Response.json(result, {
      status: result.status === "failed" ? 422 : 200,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
