"use client";

import Image from "next/image";
import { useState } from "react";
import { icons } from "@/assets/icons";
import { buttonVariants } from "@/components/ui/Button";
import { env, isMocking } from "@/config/env";
import { authCopy } from "@/content/auth";
import { cn } from "@/lib/cn";

/**
 * Real mode: starts the backend OAuth flow. Demo mode: says plainly that Google sign-in isn't live yet,
 * rather than pretending to sign in.
 */
export function GoogleButton() {
  const [notice, setNotice] = useState(false);
  const content = (
    <>
      <Image src={icons.google.src} alt={icons.google.alt} width={20} height={20} />
      {authCopy.google.label}
    </>
  );
  const className = cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full");

  if (!isMocking) {
    return (
      <a href={`${env.NEXT_PUBLIC_API_BASE_URL}/auth/google/start`} className={className}>
        {content}
      </a>
    );
  }

  return (
    <div className="grid gap-2">
      <button type="button" className={className} onClick={() => setNotice(true)} aria-describedby="google-notice">
        {content}
      </button>
      <p id="google-notice" role="status" className="text-sm">
        {notice ? authCopy.google.demoNotice : null}
      </p>
    </div>
  );
}

export function EmailDivider({ label = authCopy.divider }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
