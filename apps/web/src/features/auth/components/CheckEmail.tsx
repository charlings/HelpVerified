"use client";

import { MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { authCopy } from "@/content/auth";
import { authApi } from "../api";
import { DemoInboxLink } from "./DemoInboxLink";

/** Shown after signup: where the verification link went, a resend button and (demo mode) the link itself. */
export function CheckEmail({ email }: { email: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="grid gap-6">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <MailCheck aria-hidden="true" className="size-7" />
      </span>
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-4xl outline-none">
          {authCopy.checkEmail.title}
        </h1>
        <p className="mt-3">{authCopy.checkEmail.body(email)}</p>
      </div>
      <DemoInboxLink email={email} kind="verify_email" />
      <div>
        <Button
          variant="secondary"
          loading={sending}
          onClick={async () => {
            setSending(true);
            await authApi.resendVerification(email).catch(() => undefined);
            setSending(false);
            setResent(true);
          }}
        >
          {authCopy.checkEmail.resend}
        </Button>
        <p role="status" className="mt-3 text-sm">
          {resent ? authCopy.checkEmail.resent : null}
        </p>
      </div>
    </div>
  );
}
