import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthLegal, PromoPanel } from "@/features/auth";

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayout panel={<PromoPanel />} legal={<AuthLegal />}>
      {children}
    </AuthLayout>
  );
}
