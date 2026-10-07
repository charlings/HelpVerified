"use client";

import { useRef, useState } from "react";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";

type RejectDialogProps = {
  open: boolean;
  checkLabel: string;
  wasVerified: boolean;
  onOpenChange: (open: boolean) => void;
  onReject: (reason: string) => Promise<unknown>;
};

export function RejectDialog({ open, checkLabel, wasVerified, onOpenChange, onReject }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Focus moves to the field whenever it has an error (M8: forms focus the first problem).
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  function showFieldError(message: string) {
    setFieldError(message);
    requestAnimationFrame(() => fieldRef.current?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (reason.trim().length < 5) {
      showFieldError("Explain why the check was rejected, so the problem can be fixed.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await onReject(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (error) {
      const field = error instanceof ApiError ? error.fields?.rejection_reason?.[0] : undefined;
      if (field) showFieldError(field);
      else setFormError(messageForError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reject the ${checkLabel.toLowerCase()} check`}
      description={
        wasVerified
          ? "This check is verified now. Rejecting it removes the worker from listings until it's fixed. Any current placement continues."
          : "The agency team will see this reason on the check."
      }
    >
      <form noValidate onSubmit={submit} className="grid gap-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <FormField id={`reject-${checkLabel}`} label="Reason" required error={fieldError ?? undefined}>
          {(control) => (
            <Textarea {...control} ref={fieldRef} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" shape="app" loading={busy}>
            Reject check
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
