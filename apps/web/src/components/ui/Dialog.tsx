"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg";
};

/**
 * Where focus goes when a dialog closes: back to whatever opened it, or, if that control is gone or
 * disabled (an action that removes its own button), to the page's h1, so it never falls to <body>.
 */
function restoreFocus(opener: HTMLElement | null) {
  if (opener?.isConnected && !opener.hasAttribute("disabled")) {
    opener.focus();
    return;
  }
  const heading = document.querySelector<HTMLElement>("main h1");
  if (heading) {
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus();
  }
}

/**
 * Modal dialog: focus trapped, Esc closes. Our dialogs open from ordinary buttons (controlled `open`),
 * not Radix triggers, so we record the opener ourselves and return focus to it on close.
 */
export function Dialog({ open, onOpenChange, title, description, children, size = "md" }: DialogProps) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-navy-900/40" />
        <RadixDialog.Content
          onOpenAutoFocus={() => {
            // Still the opener at this point; Radix moves focus into the dialog next.
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus(opener.current);
          }}
          // Without a description, tell Radix there is none (otherwise it warns about a missing one).
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-x-3 top-1/2 z-50 mx-auto max-h-[90dvh] -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 shadow-lg sm:p-8",
            size === "md" ? "max-w-lg" : "max-w-2xl",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="font-display text-2xl font-bold text-navy-900">{title}</RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Close"
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-navy-900 hover:bg-blue-50"
            >
              <X aria-hidden="true" className="size-5" />
            </RadixDialog.Close>
          </div>
          {description ? <RadixDialog.Description className="mt-2">{description}</RadixDialog.Description> : null}
          <div className="mt-6">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
