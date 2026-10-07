/**
 * Direct browser → Cloudinary upload using parameters signed by our API (POST /uploads/signature).
 * Uses XMLHttpRequest because fetch can't report upload progress. This is the only place that
 * talks to Cloudinary; in demo mode MSW intercepts it so files never leave the browser.
 */
export type SignedUploadParams = {
  upload_url: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  type: "upload" | "authenticated";
};

export type CloudinaryResult = { public_id: string; bytes: number; format: string; resource_type: string };

export class UploadError extends Error {
  override name = "UploadError";
}

export function uploadToCloudinary(
  params: SignedUploadParams,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", params.api_key);
    form.append("timestamp", String(params.timestamp));
    form.append("signature", params.signature);
    form.append("folder", params.folder);
    form.append("type", params.type);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", params.upload_url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText) as CloudinaryResult);
      } else {
        reject(new UploadError(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new UploadError("Upload failed (network)"));
    xhr.send(form);
  });
}
