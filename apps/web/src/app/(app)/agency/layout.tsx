import { AppShell } from "@/components/layout/app-shell/AppShell";
import { WorkspaceProviders } from "@/components/providers/WorkspaceProviders";
import { AccountControls, RoleGuard } from "@/features/auth";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="agency_admin">
      <WorkspaceProviders>
        <AppShell role="agency_admin" account={<AccountControls />}>
          {children}
        </AppShell>
      </WorkspaceProviders>
    </RoleGuard>
  );
}
