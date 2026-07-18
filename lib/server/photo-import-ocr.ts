type UploadedPhotoForOcr = {
  fileName: string;
};

type PhotoImportOcrResult =
  | {
      ok: true;
      extraction: unknown;
      model: string;
      engine: string;
      version: string;
      confidence: number;
    }
  | {
      ok: false;
      reason: "ocr_runtime_unavailable";
      message: string;
    };

export async function extractPhotoImportWithOcr(_photos: UploadedPhotoForOcr[]): Promise<PhotoImportOcrResult> {
  return {
    ok: false as const,
    reason: "ocr_runtime_unavailable",
    message: "Deterministic OCR is not available in the Cloudflare Worker runtime yet; MAI Coach used the vision reader only.",
  };
}
