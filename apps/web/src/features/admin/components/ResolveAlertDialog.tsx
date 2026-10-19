"use client";

import { useRef, useState } from "react";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { useResolveAlert } from "../hooks";
import { alertKind } from "../status";
import type { AdminAlert } from "../types";

const REFUND_KINDS = new Set<AdminAlert["kind"]>(["refund_attention", "refund_stuck", "refund_admin_review"]);

type Errors = { note?: string; refund?: string; form?: string };

/**
 * Resolve an alert with a note (audited). For refund alerts the admin can name a refund made in the Paystack
 * dashboard; the API confirms it with Paystack and tracks it to processed. Nothing is refunded from here.
 */
export function ResolveAlertDialog({ alert, onClose }: { alert: AdminAlert | null; onClose: () => void }) {
  const mutation = useResolveAlert();
  const [note, setNote] = useState("");
  const [refundId, setRefundId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const refundRef = useRef<HTMLInputElement>(null);

  function close() {
    setNote("");
    setRefundId("");
    setErrors({});
    mutation.reset();
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!alert) return;
    const refund = refundId.trim();
    if (note.trim().length < 5) {
      setErrors({ note: "Say what you checked or did, so the next admin knows." });
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    if (refund && !/^[1-9]\d*$/.test(refund)) {
      setErrors({ refund: "Enter the numeric refund ID from the Paystack dashboard, or leave it empty." });
      requestAnimationFrame(() => refundRef.current?.focus());
      return;
    }
    setErrors({});
    try {
      await mutation.mutateAsync({
        id: alert.id,
        note: note.trim(),
        ...(refund ? { paystack_refund_id: Number(refund) } : {}),
      });
      close();
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : undefined;
      if (fields?.note?.[0]) setErrors({ note: fields.note[0] });
      else if (fields?.paystack_refund_id?.[0]) setErrors({ refund: fields.paystack_refund_id[0] });
      else setErrors({ form: messageForError(error) });
    }
  }

  return (
    <Dialog
      open={alert !== null}
      onOpenChange={(open) => !open && close()}
      title={alert ? `Resolve: ${alertKind[alert.kind].title}` : ""}
      description={alert ? alertKind[alert.kind].guidance : undefined}
    >
      <form noValidate onSubmit={submit} className="grid gap-5">
        {errors.form ? <Alert tone="danger">{errors.form}</Alert> : null}
        <FormField
          id="resolve-alert-note"
          label="Resolution note"
          required
          error={errors.note}
          hint="Recorded in the audit log."
        >
          {(control) => (
            <Textarea {...control} ref={noteRef} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          )}
        </FormField>
        {alert && REFUND_KINDS.has(alert.kind) ? (
          <FormField
            id="resolve-alert-refund"
            label="Paystack refund ID (optional)"
            error={errors.refund}
            hint="If you refunded in the Paystack dashboard, enter its ID so the refund is tracked until it's processed."
          >
            {(control) => (
              <Input
                {...control}
                ref={refundRef}
                shape="app"
                inputMode="numeric"
                value={refundId}
                onChange={(e) => setRefundId(e.target.value)}
              />
            )}
          </FormField>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" shape="app" loading={mutation.isPending}>
            Resolve
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
