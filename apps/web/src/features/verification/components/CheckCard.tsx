"use client";

import { FileText, ImageIcon, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { FileDrop } from "@/components/forms/FileDrop";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isMocking } from "@/config/env";
import { formatDate } from "@/lib/format";
import { useCheckMutations } from "../hooks";
import { verificationKindInfo, verificationStatus } from "../status";
import type { VerificationDetails, VerificationDocument, VerificationItem } from "../types";
import { DocumentViewer } from "./DocumentViewer";
import { RejectDialog } from "./RejectDialog";

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CheckCard({ workerId, item }: { workerId: string; item: VerificationItem }) {
  const info = verificationKindInfo[item.kind];
  const status = verificationStatus[item.status];
  const headingId = useId();
  const verifyHintId = useId();
  const m = useCheckMutations(workerId, item.kind);

  const [details, setDetails] = useState<VerificationDetails>(item.details);
  const [progress, setProgress] = useState<number | null>(null);
  const [viewing, setViewing] = useState<{ doc: VerificationDocument; index: number } | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const locked = item.status === "verified";
  const hasEvidence = item.documents.length > 0;
  const canVerify = item.status === "submitted" && hasEvidence;
  const verifyHint =
    item.status === "verified"
      ? null
      : !hasEvidence
        ? "Upload at least one document before verifying."
        : item.status !== "submitted"
          ? "Save details or upload evidence to put this check in review."
          : null;

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-xl">
            {info.label}
          </h3>
          <p className="mt-1 text-sm">{info.summary}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <p className="mt-3 text-sm">
        {status.description}
        {item.verified_at && item.status === "verified"
          ? ` Verified ${formatDate(item.verified_at.slice(0, 10))}.`
          : ""}
        {item.expires_at && item.status === "verified"
          ? ` Re-check due ${formatDate(item.expires_at.slice(0, 10))}.`
          : ""}
      </p>
      {item.flag_reason && item.status !== "verified" ? (
        <Alert tone="warning" title="Flagged by HelpVerified" className="mt-3">
          {item.flag_reason} Re-check the evidence and verify again before relisting this worker.
        </Alert>
      ) : null}
      {item.status === "rejected" && item.rejection_reason ? (
        <Alert tone="danger" title="Why it was rejected" className="mt-3">
          {item.rejection_reason}
        </Alert>
      ) : null}

      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.saveDetails.mutate(details);
        }}
      >
        {info.fields.map((field) => (
          <FormField
            key={field.name}
            id={`${workerId}-${item.kind}-${field.name}`}
            label={field.label}
            hint={field.hint}
          >
            {(control) => (
              <Input
                {...control}
                shape="app"
                type={field.type ?? "text"}
                value={details[field.name] ?? ""}
                disabled={locked}
                onChange={(e) => setDetails((d) => ({ ...d, [field.name]: e.target.value }))}
              />
            )}
          </FormField>
        ))}
        {!locked ? (
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" shape="app" loading={m.saveDetails.isPending}>
              Save details
            </Button>
          </div>
        ) : null}
      </form>

      <div className="mt-6">
        <h4 className="text-base font-semibold text-navy-900">Evidence</h4>
        <p className="mt-1 text-sm">{info.evidence}</p>
        {hasEvidence ? (
          <ul className="mt-3 grid gap-2">
            {item.documents.map((doc, index) => {
              const Icon = doc.format === "pdf" ? FileText : ImageIcon;
              const name = `${info.label} document ${index + 1}`;
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <Icon aria-hidden="true" className="size-5 text-slate-600" />
                  <span className="flex-1 text-navy-900">
                    {name} · {doc.format.toUpperCase()} · {formatBytes(doc.bytes)}
                  </span>
                  <Button
                    variant="ghost"
                    shape="app"
                    onClick={() => setViewing({ doc, index })}
                    aria-label={`View ${name}`}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    shape="app"
                    aria-label={`Remove ${name}`}
                    loading={m.removeDocument.isPending && m.removeDocument.variables === doc.id}
                    onClick={() => {
                      const warning = locked
                        ? "Removing evidence sends this verified check back to review and removes the worker from listings. Continue?"
                        : "Remove this document?";
                      if (window.confirm(warning)) m.removeDocument.mutate(doc.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No documents yet.</p>
        )}
        <div className="mt-3">
          <FileDrop
            label={`Upload ${info.label.toLowerCase()} evidence`}
            hint={
              isMocking ? "Demo mode: don't upload real identity documents. JPG, PNG or PDF, up to 10 MB." : undefined
            }
            progress={progress}
            onFile={(file) => {
              setProgress(0);
              m.upload.mutate({ file, onProgress: setProgress }, { onSettled: () => setProgress(null) });
            }}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {!locked ? (
          <Button
            shape="app"
            disabled={!canVerify}
            aria-describedby={verifyHint ? verifyHintId : undefined}
            loading={m.verify.isPending}
            onClick={() => m.verify.mutate()}
          >
            Verify {info.label.toLowerCase()}
          </Button>
        ) : null}
        {item.status === "submitted" || item.status === "verified" ? (
          <Button variant="secondary" shape="app" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        ) : null}
        {verifyHint ? (
          <p id={verifyHintId} className="text-sm text-slate-600">
            {verifyHint}
          </p>
        ) : null}
      </div>

      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        checkLabel={info.label}
        wasVerified={locked}
        onReject={(reason) => m.reject.mutateAsync(reason)}
      />
      <DocumentViewer
        document={viewing?.doc ?? null}
        title={viewing ? `${info.label} document ${viewing.index + 1}` : ""}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}
