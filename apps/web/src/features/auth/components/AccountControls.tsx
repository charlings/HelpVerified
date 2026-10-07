"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { signOut, useSession } from "../client";

/** Signed-in user's name and a sign-out button, for the app shell's top bar. */
export function AccountControls() {
  const { user } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="hidden text-sm font-semibold text-navy-900 sm:inline">{user.full_name}</span>
      <Button
        variant="ghost"
        shape="app"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await signOut().catch(() => undefined);
          router.replace(routes.auth.login);
        }}
      >
        {busy ? null : <LogOut aria-hidden="true" className="size-4" />}
        {busy ? authCopy.account.signingOut : authCopy.account.signOut}
      </Button>
    </div>
  );
}
