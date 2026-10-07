"use client";

import { useRef, useState } from "react";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";

type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  hint: string;
  missingReason: string;
  submitLabel: string;
  cancelLabel: string;
  onSubmit: (reason: string) => Promise<unknown>;
};

/** A confirmation that needs a written reason (end, cancel, replacement). Both parties see the reason. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  hint,
  missingReason,
  submitLabel,
  cancelLabel,
  onSubmit,
}: ReasonDialogProps) {
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
      showFieldError(missingReason);
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await onSubmit(reason.trim());
      setReason("");
      onOpenChange(false);
    } catch (error) {
      const field = error instanceof ApiError ? error.fields?.reason?.[0] : undefined;
      if (field) showFieldError(field);
      else setFormError(messageForError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFieldError(null);
          setFormError(null);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
    >
      <form noValidate onSubmit={submit} className="grid gap-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <FormField id="reason-dialog-reason" label="Reason" required error={fieldError ?? undefined} hint={hint}>
          {(control) => (
            <Textarea {...control} ref={fieldRef} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="submit" shape="app" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
