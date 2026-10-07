"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/feedback/Toast";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { business } from "@/config/business";
import { routes } from "@/config/routes";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { familyRequestsApi } from "../family-api";
import { useRefreshFamilyRequest } from "../family-hooks";
import type { FamilyProposal, FamilyRequest } from "../types";

type AcceptDialogProps = {
  request: FamilyRequest;
  proposal: FamilyProposal | null;
  onClose: () => void;
};

/**
 * Confirms the choice, then accepts. A fee goes to the (Paystack or demo) checkout; a replacement
 * covered by the free allowance goes straight to the new placement.
 */
export function AcceptDialog({ request, proposal, onClose }: AcceptDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshFamilyRequest(request.id);
  const alertRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: (p: FamilyProposal) => familyRequestsApi.accept(p.id),
    onSuccess: async (result) => {
      await refresh();
      if (result.payment) {
        const url = result.payment.authorization_url;
        // Paystack's checkout is another site; the demo checkout is in-app.
        if (url.startsWith("/")) router.push(url);
        else window.location.assign(url);
        return;
      }
      toast.success("Accepted. No fee is due: your replacement is covered. The trial has started.");
      router.push(routes.family.placement(result.placement.id));
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === "WORKER_UNAVAILABLE") {
        setError("This worker has just been placed with another family. Choose another proposal.");
        await refresh();
        return;
      }
      setError(messageForError(e));
    },
  });

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  const isReplacement = Boolean(request.replaces_placement_id);
  return (
    <Dialog
      open={proposal !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      title={proposal ? `Accept ${proposal.worker.first_name}?` : "Accept"}
      description={
        isReplacement
          ? `This is a replacement. If it's covered by your free replacement, there's no fee and the ${request.trial_days}-day trial starts straight away.`
          : `You'll pay the placement fee to start a ${request.trial_days}-day trial. ${proposal?.worker.first_name ?? "The worker"} is held for you for ${business.paymentHoldMinutes} minutes while you pay. Other proposals for this request will close.`
      }
    >
      <div className="grid gap-5">
        {error ? (
          <Alert ref={alertRef} tone="danger">
            {error}
          </Alert>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" shape="app" onClick={onClose}>
            Not yet
          </Button>
          <Button
            shape="app"
            loading={accept.isPending}
            disabled={!proposal || Boolean(error)}
            onClick={() => proposal && accept.mutate(proposal)}
          >
            {isReplacement ? "Accept" : "Accept and pay"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
