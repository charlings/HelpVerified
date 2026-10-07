"use client";

import Link from "next/link";
import { useState } from "react";
import { isMocking } from "@/config/env";
import { authCopy } from "@/content/auth";
import { authApi } from "../api";
import { textLink } from "@/components/ui/link-styles";

type DemoInboxLinkProps = { email: string; kind: "verify_email" | "reset_password" };

/** Demo mode only: no email is sent, so this fetches the link the mock "would have emailed". */
export function DemoInboxLink({ email, kind }: DemoInboxLinkProps) {
  const [link, setLink] = useState<string | null | undefined>(undefined);
  if (!isMocking) return null;

  return (
    <div className="rounded-md border border-dashed border-border-strong bg-slate-50 p-4 text-sm">
      {link ? (
        <Link href={link} className={textLink}>
          {authCopy.demoInbox.label}
        </Link>
      ) : (
        <button
          type="button"
          className={textLink}
          onClick={async () => setLink((await authApi.demoInbox(email, kind)).link)}
        >
          {authCopy.demoInbox.label}
        </button>
      )}
      {link === null ? (
        <p role="status" className="mt-1">
          {authCopy.demoInbox.none}
        </p>
      ) : null}
    </div>
  );
}
