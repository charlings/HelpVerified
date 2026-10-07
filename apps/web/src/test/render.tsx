import { render } from "@testing-library/react";
import { WorkspaceProviders } from "@/components/providers/WorkspaceProviders";
import { signIn } from "@/features/auth/client";
import { DEMO_PASSWORD } from "@/mocks/db";

/** Renders inside the same providers a workspace page gets (query cache + toasts). */
export function renderInWorkspace(ui: React.ReactElement) {
  return render(<WorkspaceProviders>{ui}</WorkspaceProviders>);
}

/** Signs a seeded demo user in through the mock API, so requests carry their token. */
export function signInAsDemo(email: string) {
  return signIn(email, DEMO_PASSWORD);
}
