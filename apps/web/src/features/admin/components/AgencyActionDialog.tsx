"use client";

import { useState } from "react";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { messageForError } from "@/lib/error-messages";
import { useAgencyAction } from "../hooks";
import { agencyAction } from "../status";
import type { AgencyAction } from "../types";

type Props = {
  agency: { id: string; name: string };
  action: AgencyAction | null;
  onClose: () => void;
};

/** Every agency action asks for confirmation; reject and suspend also need a reason. */
export function AgencyActionDialog({ agency, action, onClose }: Props) {
  const mutation = useAgencyAction(agency.id);
  const [error, setError] = useState<string | null>(null);
  const copy = action ? agencyAction[action] : null;

  function close() {
    setError(null);
    mutation.reset();
    onClose();
  }

  if (copy?.needsReason) {
    return (
      <ReasonDialog
        open
        onOpenChange={(open) => !open && close()}
        title={copy.title(agency.name)}
        description={copy.description}
        hint="The agency sees this reason."
        missingReason="Give a reason. The agency will see it."
        submitLabel={copy.label}
        cancelLabel="Cancel"
        onSubmit={(reason) => mutation.mutateAsync({ action: action!, reason })}
      />
    );
  }

  return (
    <Dialog
      open={copy !== null}
      onOpenChange={(open) => !open && close()}
      title={copy?.title(agency.name) ?? ""}
      description={copy?.description}
    >
      <div className="grid gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={close}>
            Cancel
          </Button>
          <Button
            shape="app"
            loading={mutation.isPending}
            onClick={() =>
              action && mutation.mutate({ action }, { onSuccess: close, onError: (e) => setError(messageForError(e)) })
            }
          >
            {copy?.label}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
