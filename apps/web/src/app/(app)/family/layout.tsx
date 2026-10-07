import { AppShell } from "@/components/layout/app-shell/AppShell";
import { WorkspaceProviders } from "@/components/providers/WorkspaceProviders";
import { AccountControls, RoleGuard } from "@/features/auth";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="family">
      <WorkspaceProviders>
        <AppShell role="family" account={<AccountControls />}>
          {children}
        </AppShell>
      </WorkspaceProviders>
    </RoleGuard>
  );
}
