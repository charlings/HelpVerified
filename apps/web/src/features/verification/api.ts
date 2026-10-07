import { api } from "@/lib/api-client";
import { uploadToCloudinary, type SignedUploadParams } from "@/lib/cloudinary";
import type { VerificationKind } from "@/types/domain";
import type { VerificationDetails, VerificationDocument, VerificationItem } from "./types";

export const verificationKeys = {
  forWorker: (workerId: string) => ["verification", workerId] as const,
};

const itemPath = (workerId: string, kind: VerificationKind) => `/workers/${workerId}/verification/${kind}`;

export const verificationApi = {
  list: (workerId: string) => api.get<VerificationItem[]>(`/workers/${workerId}/verification`),
  saveDetails: (workerId: string, kind: VerificationKind, details: VerificationDetails) =>
    api.patch<VerificationItem>(itemPath(workerId, kind), { details }),
  verify: (workerId: string, kind: VerificationKind) =>
    api.patch<VerificationItem>(itemPath(workerId, kind), { status: "verified" }),
  reject: (workerId: string, kind: VerificationKind, reason: string) =>
    api.patch<VerificationItem>(itemPath(workerId, kind), { status: "rejected", rejection_reason: reason }),
  removeDocument: (workerId: string, kind: VerificationKind, documentId: string) =>
    api.delete<void>(`${itemPath(workerId, kind)}/documents/${documentId}`),
  documentUrl: (documentId: string) => api.get<{ url: string; expires_at: string }>(`/documents/${documentId}/url`),

  /** Signature from our API → direct upload to Cloudinary → register the public_id with our API. */
  async uploadDocument(
    workerId: string,
    kind: VerificationKind,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<VerificationDocument> {
    const params = await api.post<SignedUploadParams>("/uploads/signature", {
      purpose: "verification_doc",
      worker_id: workerId,
      kind,
    });
    const uploaded = await uploadToCloudinary(params, file, onProgress);
    return api.post<VerificationDocument>(`${itemPath(workerId, kind)}/documents`, { public_id: uploaded.public_id });
  },
};
