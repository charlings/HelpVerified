import { AppShell } from "@/components/layout/app-shell/AppShell";
import { WorkspaceProviders } from "@/components/providers/WorkspaceProviders";
import { AccountControls, RoleGuard } from "@/features/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard role="super_admin">
      <WorkspaceProviders>
        <AppShell role="super_admin" account={<AccountControls />}>
          {children}
        </AppShell>
      </WorkspaceProviders>
    </RoleGuard>
  );
}
