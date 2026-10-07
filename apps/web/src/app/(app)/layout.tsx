import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Each workspace layout (family, agency, admin) renders its own AppShell.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
